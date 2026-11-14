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
import { spawn, execFileSync } from 'node:child_process';
const root = path.resolve(process.env.FEED_INTEGRITY_ROOT || path.join(import.meta.dirname, '..'));
const day = '2026-10-30', epoch = Date.parse(day + 'T13:40:00Z'), late = epoch - 20 * 60000, L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run(t, scenario, {baseline=false,enabled=false,badPath=false}={}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-integrity-watcher-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of fs.readdirSync(root).filter(p => p.endsWith('.mjs'))) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  if(baseline){const saved=JSON.parse(fs.readFileSync(new URL('../docs/validation/observer-baseline-source.json',import.meta.url)));for(const [file,source]of Object.entries(saved.files))fs.writeFileSync(path.join(dir,file),source);}
  fs.mkdirSync(path.join(dir, 'data'));
  if(badPath){const p=path.join(dir,'data/ignition-runs',day);fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'synthetic-'+scenario+'-1.contracts'),'synthetic unavailable directory');}
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' }); execFileSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: dir, stdio: 'ignore',env:{PATH:process.env.PATH,GIT_AUTHOR_DATE:'2026-10-30T13:40:00Z',GIT_COMMITTER_DATE:'2026-10-30T13:40:00Z'} });
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
      return res.end(JSON.stringify(Object.fromEntries(syms.map(s => [s, { latestTrade: { p: 11, t: tt }, latestQuote: { bp: 10.99, ap: 11.01, bs:200,as:300,t: tt }, minuteBar: { t: new Date(minuteT).toISOString(), c: 11, v: 1000 }, dailyBar: { t: day + 'T04:00:00Z', o: 9.6, c: 11, v: feed === 'sip' ? 3e6 : 5e4 }, prevDailyBar: { c: 9.5, v: 2e6 } }])))); }
    res.statusCode = 404; res.end('{}'); });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); }); await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { for (const s of sockets) s.destroy(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port, preload = path.join(dir, 'local-only.mjs');
  fs.writeFileSync(preload, `const D=Date,start=D.now(),at=${epoch};globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[at]));}static now(){return at;}};const f=fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith(${JSON.stringify(base + '/')}))throw Error('NO_EXTERNAL_ACCESS');return f(u,o);};`);
  const env = { PATH: process.env.PATH, IG_DAY: day, IG_FAKE_MIN: '580', IG_FAKE_STEP: '400', IG_RUN_MIN: '1', IG_NO_RADAR: '1', MASSIVE_BASE: base, ALPACA_DATA: base, ALPACA_KEY: 'synthetic', ALPACA_SECRET: 'synthetic', SEC_BASE: base, SEC_UA: 'synthetic fixture', GITHUB_RUN_ID: 'synthetic-' + scenario, GITHUB_RUN_ATTEMPT: '1' };
  if(enabled)env.CONTRACT_OBSERVER='research';
  if (scenario !== 'top50') env.MASSIVE_KEY = 'synthetic';
  const child = spawn(process.execPath, ['--import', preload, 'ignition-watch.mjs'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] }); t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x);
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000); const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
  assert.equal(code, 0, output);
  const live = JSON.parse(fs.readFileSync(path.join(dir, 'data/ignition-live.json'))), rd = path.join(dir, 'data/ignition-runs', day);
  const shadow = fs.readdirSync(rd).filter(n => n.endsWith('.shadow.jsonl.gz')).flatMap(n => zlib.gunzipSync(fs.readFileSync(path.join(rd, n))).toString().trim().split('\n').filter(Boolean).map(JSON.parse));
  assert.equal(calls.some(p => /sendMessage|orders/.test(p)), false, 'no message or order endpoint');
  const legacy={};const walk=(base,rel='')=>{for(const name of fs.readdirSync(base)){if(name.endsWith('.contracts'))continue;const p=path.join(base,name),r=path.join(rel,name);if(fs.statSync(p).isDirectory())walk(p,r);else legacy[r]=fs.readFileSync(p).toString('base64');}};walk(path.join(dir,'data'));
  return { dir,output,legacy,calls, live, shadow, SYMS, snaps: calls.filter(c => c.startsWith('/v2/stocks/snapshots')) };
}


for(const scenario of ['sip-ok','sip-403','top50'])test('actual production watcher before/off/on parity: '+scenario,async t=>{
 const before=await run(t,scenario,{baseline:true}),off=await run(t,scenario),on=await run(t,scenario,{enabled:true});
 assert.deepEqual(off.calls,before.calls);assert.deepEqual(on.calls,before.calls);assert.deepEqual(off.legacy,before.legacy);assert.deepEqual(on.legacy,before.legacy,'all original archive and ledger bytes unchanged');
 assert.match(on.output,/"state":"ACTIVE"/);assert.equal(on.calls.some(p=>/sendMessage|orders/.test(p)),false);
 const dir=path.join(on.dir,'data/ignition-runs',day,'synthetic-'+scenario+'-1.contracts');assert.equal(fs.readdirSync(dir).length,1);
 const r=JSON.parse(fs.readFileSync(path.join(dir,'beat-0580.json'))).record;assert.equal(r.counts.sizeUnknown,scenario==='top50'?1:0);assert.equal(r.fillGuarantee,false);assert.equal(r.entryPolicy,'NOT_ADOPTED_NOT_EVALUATED');
});
test('actual watcher survives observer persistence refusal with unchanged decisions and requests',async t=>{
 const before=await run(t,'sip-ok',{baseline:true}),bad=await run(t,'sip-ok',{enabled:true,badPath:true});
 assert.deepEqual(bad.calls,before.calls);assert.deepEqual(bad.legacy,before.legacy);assert.match(bad.output,/"state":"QUARANTINED"/);
});
