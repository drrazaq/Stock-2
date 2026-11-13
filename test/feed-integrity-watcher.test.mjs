// Full production watcher (ignition-watch.mjs) against synthetic local Massive + Alpaca services: SIP/IEX attribution,
// 403/422/429 handling, quote clocks and archive output. No credentials, provider, message or order; external fetch is refused.
// FEED_INTEGRITY_ROOT can point at another tree's modules (used to show the defects on unpatched production).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import {createHash}from'node:crypto';
import {readPrivateAssessmentQuote}from'../private-quote-retention.mjs';
import { spawn, execFileSync } from 'node:child_process';
const root = path.resolve(process.env.FEED_INTEGRITY_ROOT || path.join(import.meta.dirname, '..'));
const day = '2026-10-30', epoch = Date.parse(day + 'T13:40:00Z'), late = epoch - 20 * 60000, L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run(t, scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-integrity-watcher-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of fs.readdirSync(root).filter(p => p.endsWith('.mjs'))) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  fs.mkdirSync(path.join(dir, 'data'));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' }); execFileSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: dir, stdio: 'ignore' });
  const SYMS = scenario === 'race' ? Array.from({ length: 250 }, (_, i) => 'Z' + L[Math.floor(i / 26) % 26] + L[i % 26]) : ['ZZQ'];
  const minT = scenario.startsWith('top50-future') ? epoch + 10 * 60000 : late;   // a future-dated Massive volume clock
  const mrow = (s) => ({ ticker: s, lastTrade: { p: 10, t: late * 1e6 }, lastQuote: { p: 9.98, P: 10.02, t: late * 1e6 }, prevDay: { c: 9.5, v: 2e6 }, min: { c: 10, t: minT, av: 1e5 }, day: { c: 10, o: 9.6, v: 1e5 } });
  let snapshotRequests = 0;
  const calls = [], sockets = new Set();
  const server = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://localhost'), feed = u.searchParams.get('feed'); calls.push(u.pathname + (feed ? '?feed=' + feed : '')); res.setHeader('Content-Type', 'application/json');
    if (u.pathname.includes('/v2/snapshot/locale')) return res.end(JSON.stringify({ tickers: SYMS.map(mrow) }));
    if (u.pathname.includes('/screener/')) return res.end(JSON.stringify({ gainers: [{ symbol: 'ZZQ' }] }));
    if (u.pathname === '/v2/stocks/snapshots') { const syms = (u.searchParams.get('symbols') || '').split(','); snapshotRequests++;
      // top50-future*: the targeted refresh fails (non-403), so the watcher takes the top-50 fallback, whose snapshot succeeds
      if (scenario.startsWith('top50-future') && snapshotRequests === 1) { res.statusCode = 500; return res.end('{}'); }
      const minuteT = scenario === 'top50-future-sip-minute' ? epoch + 5 * 60000 : epoch - 60000;
      if (scenario === 'race') { if (feed === 'sip' && syms[0] === SYMS[0]) { await sleep(50); res.statusCode = 403; return res.end('{}'); } await sleep(feed === 'iex' ? 300 : 150); }
      if (feed === 'sip' && scenario === 'sip-403') { res.statusCode = 403; return res.end('{"message":"subscription does not permit"}'); }
      if (feed === 'sip' && scenario === 'sip-422') { res.statusCode = 422; return res.end('{"message":"invalid"}'); }
      if (scenario === 'sip-429') { res.statusCode = 429; res.setHeader('retry-after', '86400'); return res.end('{}'); }
      const tt = new Date(epoch - 30000).toISOString();
      return res.end(JSON.stringify(Object.fromEntries(syms.map(s => [s, { latestTrade: { p: 11, t: tt }, latestQuote: { bp: 10.99, ap: 11.01, t: tt, ...(scenario.startsWith('retention')?{bs:25,as:40,c:['R']}: {}) }, minuteBar: { t: new Date(minuteT).toISOString(), c: 11, v: 1000 }, dailyBar: { t: day + 'T04:00:00Z', o: 9.6, c: 11, v: feed === 'sip' ? 3e6 : 5e4 }, prevDailyBar: { c: 9.5, v: 2e6 } }])))); }
    res.statusCode = 404; res.end('{}'); });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); }); await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { for (const s of sockets) s.destroy(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port, preload = path.join(dir, 'local-only.mjs');
  fs.writeFileSync(preload, `const D=Date,start=D.now(),at=${epoch};globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[at+D.now()-start]));}static now(){return at+D.now()-start;}};const f=fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith(${JSON.stringify(base + '/')}))throw Error('NO_EXTERNAL_ACCESS');return f(u,o);};`);
  const env = { PATH: process.env.PATH, IG_DAY: day, IG_FAKE_MIN: '580', IG_FAKE_STEP: '400', IG_RUN_MIN: '1', IG_NO_RADAR: '1', MASSIVE_BASE: base, ALPACA_DATA: base, ALPACA_KEY: 'synthetic', ALPACA_SECRET: 'synthetic', SEC_BASE: base, SEC_UA: 'synthetic fixture', GITHUB_RUN_ID: 'synthetic-' + scenario, GITHUB_RUN_ATTEMPT: '1' };
  if (scenario !== 'top50') env.MASSIVE_KEY = 'synthetic';
  let privateRoot=null,policySha256=null;
  if(scenario.startsWith('retention')){
    privateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'watcher-private-fixture-'));fs.chmodSync(privateRoot,0o700);t.after(()=>fs.rmSync(privateRoot,{recursive:true,force:true}));
    const review={status:'INDEPENDENT_PROVENANCE_REVIEWED',at:new Date(epoch-600000).toISOString(),comment:'https://github.com/drrazaq/Stock-2/pull/1#issuecomment-1'},ids=Buffer.from(JSON.stringify({records:[{symbol:'ZZQ',securityId:'SYNTHETIC-ZZQ',issuerCik:'123',securityType:'CS',status:'INDEPENDENT_ISSUER_REVIEWED',knownAt:review.at,validFrom:review.at,validTo:null,review,source:'https://www.sec.gov/Archives/fixture'}]}));
    const sha=b=>createHash('sha256').update(b).digest('hex'),policy=Buffer.from(JSON.stringify({kind:'PRIVATE_QUOTE_RETENTION_POLICY_V1',review,reviewedProducerShas:[execFileSync('git',['rev-parse','HEAD'],{cwd:dir,encoding:'utf8'}).trim()],identity:{path:'identities.json',sha256:sha(ids)}}));
    fs.writeFileSync(path.join(privateRoot,'policy.json'),policy,{mode:0o600});fs.writeFileSync(path.join(privateRoot,'identities.json'),ids,{mode:0o600});policySha256=sha(policy);
    env.PRIVATE_QUOTE_RETENTION_ROOT=privateRoot;env.PRIVATE_QUOTE_POLICY_SHA256=scenario==='retention-bad'?'0'.repeat(64):policySha256;
  }
  const child = spawn(process.execPath, ['--import', preload, 'ignition-watch.mjs'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] }); t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x);
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000); const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
  assert.equal(code, 0, output);
  const live = JSON.parse(fs.readFileSync(path.join(dir, 'data/ignition-live.json'))), rd = path.join(dir, 'data/ignition-runs', day);
  const shadow = fs.readdirSync(rd).filter(n => n.endsWith('.shadow.jsonl.gz')).flatMap(n => zlib.gunzipSync(fs.readFileSync(path.join(rd, n))).toString().trim().split('\n').filter(Boolean).map(JSON.parse));
  assert.equal(calls.some(p => /sendMessage|orders/.test(p)), false, 'no message or order endpoint');
  const retainedQuote=privateRoot&&scenario==='retention'?readPrivateAssessmentQuote('ZZQ',{root:path.join(privateRoot,'synthetic-'+scenario+'-1'),policySha256,now:epoch+10000}):null;
  return { calls, live, shadow, SYMS, retainedQuote, output, snaps: calls.filter(c => c.startsWith('/v2/stocks/snapshots')) };
}

test('SIP answer: SIP price and quote with their own clocks; SIP daily volume used but labelled as having no stated as-of time', async t => {
  const r = await run(t, 'sip-ok'), x = r.shadow.find(s => s.sym === 'ZZQ'), ig = x.ig[0];
  assert.deepEqual(r.snaps, ['/v2/stocks/snapshots?feed=sip']);
  assert.match(r.live.src, /SIP feed/); assert.match(r.live.src, /SIP daily volume \(provider states no as-of time\) for 1/); assert.doesNotMatch(r.live.src, /live SIP volume/);
  assert.equal(x.px0, 11); assert.equal(x.rv0, 1.5, 'full-market SIP volume 3e6 / previous 2e6');
  assert.equal(ig.bid, 10.99); assert.equal(ig.qAgeSec, 30, 'quote age from the quote clock');
});

test('SIP 403: IEX price is used, IEX volume is never used as market volume', async t => {
  const r = await run(t, 'sip-403'), x = r.shadow.find(s => s.sym === 'ZZQ');
  assert.deepEqual(r.snaps, ['/v2/stocks/snapshots?feed=sip', '/v2/stocks/snapshots?feed=iex']);
  assert.match(r.live.src, /IEX feed/); assert.match(r.live.src, /massive volume \(late\)/);
  assert.equal(x.px0, 11); assert.equal(x.rv0, 0.05, 'late Massive volume 1e5 kept; IEX 5e4 not used');
});

test('SIP 422: a failed request, not a downgrade; no IEX request is made', async t => {
  const r = await run(t, 'sip-422');
  assert.ok(!r.snaps.includes('/v2/stocks/snapshots?feed=iex'), 'IEX must not be requested after 422: ' + r.snaps.join(' '));
  assert.match(r.live.note, /Alpaca snapshots failed/);
});

test('429: one request, no retry inside the cool-down', async t => {
  const r = await run(t, 'sip-429'); assert.equal(r.snaps.length, 1, r.snaps.join(' '));
});

test('concurrent parts: an IEX response is never read as SIP when another part\'s SIP answer lands in between', async t => {
  const r = await run(t, 'race'), rv = new Map(r.shadow.map(s => [s.sym, s.rv0]));
  const iexPart = r.SYMS.slice(0, 200).map(s => rv.get(s)).filter(v => v !== undefined), sipPart = r.SYMS.slice(200).map(s => rv.get(s)).filter(v => v !== undefined);
  assert.ok(iexPart.length > 100 && sipPart.length > 20);
  assert.deepEqual([...new Set(iexPart)], [0.05], 'IEX-answered symbols keep late Massive volume, never IEX 5e4 as market volume');
  assert.deepEqual([...new Set(sipPart)], [1.5]);
  assert.match(r.live.src, /MIXED feed/);
});

test('top-50 fallback keeps its original field set (no quote fields added)', async t => {
  const r = await run(t, 'top50'), x = r.shadow.find(s => s.sym === 'ZZQ');
  assert.equal(r.live.mode, 'PARTIAL_TOP50_FALLBACK'); assert.equal(x.px0, 11); assert.equal(x.ig[0].bid, null); assert.equal(x.ig[0].qAgeSec, null);
});

test('top-50 fallback: a future-dated Massive volume clock is rejected; this response\'s consistent SIP daily volume is used instead', async t => {
  const r = await run(t, 'top50-future'), x = r.shadow.find(s => s.sym === 'ZZQ');
  assert.equal(r.live.mode, 'PARTIAL_TOP50_FALLBACK'); assert.equal(x.px0, 11);
  assert.equal(x.dv0, 3e6 * 11, 'dollar volume from SIP 3e6; the future-clocked Massive 1e5 is not used (top-50 rows carry no previous-day volume, so rv is not computed)');
});

test('top-50 fallback: future-dated volume on both sources leaves volume unknown (never a future-clocked figure)', async t => {
  const r = await run(t, 'top50-future-sip-minute'), x = r.shadow.find(s => s.sym === 'ZZQ');
  assert.equal(r.live.mode, 'PARTIAL_TOP50_FALLBACK'); assert.equal(x.px0, 11);
  assert.ok(!(x.dv0 > 0), 'no volume survives clock validation: dv0=' + x.dv0);
});

 test('actual watcher opt-in journals at ingestion and publishes once per cycle; private quote reaches original reader',async t=>{const r=await run(t,'retention');assert.equal(r.retainedQuote.status,'FRESH_REVIEWED_BBO_CONTEXT');assert.equal(r.retainedQuote.bid,10.99);assert.equal(r.retainedQuote.bidSizeShares,25);assert.equal(r.live.privateQuoteRetention.generations,1);assert.match(r.output,/private quote retention/);assert.equal(r.snaps.length,1);});
 test('actual watcher bad retention pin keeps existing price path alive and makes failure visible',async t=>{const r=await run(t,'retention-bad');assert.equal(r.live.privateQuoteRetention.status,'DISABLED_INITIALIZATION_FAILED');assert.equal(r.shadow.find(x=>x.sym==='ZZQ').px0,11);assert.match(r.output,/DISABLED_INITIALIZATION_FAILED/);assert.equal(r.snaps.length,1);});
