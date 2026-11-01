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

async function run(t, scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-integrity-watcher-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of fs.readdirSync(root).filter(p => p.endsWith('.mjs'))) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  fs.mkdirSync(path.join(dir, 'data'));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' }); execFileSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: dir, stdio: 'ignore' });
  const SYMS = scenario === 'race' ? Array.from({ length: 250 }, (_, i) => 'Z' + L[Math.floor(i / 26) % 26] + L[i % 26]) : ['ZZQ'];
  const mrow = (s) => ({ ticker: s, lastTrade: { p: 10, t: late * 1e6 }, lastQuote: { p: 9.98, P: 10.02, t: late * 1e6 }, prevDay: { c: 9.5, v: 2e6 }, min: { c: 10, t: late, av: 1e5 }, day: { c: 10, o: 9.6, v: 1e5 } });
  const calls = [], sockets = new Set();
  const server = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://localhost'), feed = u.searchParams.get('feed'); calls.push(u.pathname + (feed ? '?feed=' + feed : '')); res.setHeader('Content-Type', 'application/json');
    if (u.pathname.includes('/v2/snapshot/locale')) return res.end(JSON.stringify({ tickers: SYMS.map(mrow) }));
    if (u.pathname.includes('/screener/')) return res.end(JSON.stringify({ gainers: [{ symbol: 'ZZQ' }] }));
    if (u.pathname === '/v2/stocks/snapshots') { const syms = (u.searchParams.get('symbols') || '').split(',');
      if (scenario === 'race') { if (feed === 'sip' && syms[0] === SYMS[0]) { await sleep(50); res.statusCode = 403; return res.end('{}'); } await sleep(feed === 'iex' ? 300 : 150); }
      if (feed === 'sip' && scenario === 'sip-403') { res.statusCode = 403; return res.end('{"message":"subscription does not permit"}'); }
      if (feed === 'sip' && scenario === 'sip-422') { res.statusCode = 422; return res.end('{"message":"invalid"}'); }
      if (scenario === 'sip-429') { res.statusCode = 429; res.setHeader('retry-after', '86400'); return res.end('{}'); }
      const tt = new Date(epoch - 30000).toISOString();
      return res.end(JSON.stringify(Object.fromEntries(syms.map(s => [s, { latestTrade: { p: 11, t: tt }, latestQuote: { bp: 10.99, ap: 11.01, t: tt }, minuteBar: { t: new Date(epoch - 60000).toISOString(), c: 11, v: 1000 }, dailyBar: { t: day + 'T04:00:00Z', o: 9.6, c: 11, v: feed === 'sip' ? 3e6 : 5e4 }, prevDailyBar: { c: 9.5, v: 2e6 } }])))); }
    res.statusCode = 404; res.end('{}'); });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); }); await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { for (const s of sockets) s.destroy(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port, preload = path.join(dir, 'local-only.mjs');
  fs.writeFileSync(preload, `const D=Date,start=D.now(),at=${epoch};globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[at+D.now()-start]));}static now(){return at+D.now()-start;}};const f=fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith(${JSON.stringify(base + '/')}))throw Error('NO_EXTERNAL_ACCESS');return f(u,o);};`);
  const env = { PATH: process.env.PATH, IG_DAY: day, IG_FAKE_MIN: '580', IG_FAKE_STEP: '400', IG_RUN_MIN: '1', IG_NO_RADAR: '1', MASSIVE_BASE: base, ALPACA_DATA: base, ALPACA_KEY: 'synthetic', ALPACA_SECRET: 'synthetic', SEC_BASE: base, SEC_UA: 'synthetic fixture', GITHUB_RUN_ID: 'synthetic-' + scenario, GITHUB_RUN_ATTEMPT: '1' };
  if (scenario !== 'top50') env.MASSIVE_KEY = 'synthetic';
  const child = spawn(process.execPath, ['--import', preload, 'ignition-watch.mjs'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] }); t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x);
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000); const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
  assert.equal(code, 0, output);
  const live = JSON.parse(fs.readFileSync(path.join(dir, 'data/ignition-live.json'))), rd = path.join(dir, 'data/ignition-runs', day);
  const shadow = fs.readdirSync(rd).filter(n => n.endsWith('.shadow.jsonl.gz')).flatMap(n => zlib.gunzipSync(fs.readFileSync(path.join(rd, n))).toString().trim().split('\n').filter(Boolean).map(JSON.parse));
  assert.equal(calls.some(p => /sendMessage|orders/.test(p)), false, 'no message or order endpoint');
  return { calls, live, shadow, SYMS, snaps: calls.filter(c => c.startsWith('/v2/stocks/snapshots')) };
}

test('SIP answer: live SIP price, volume and quote with their own clocks; archive says SIP', async t => {
  const r = await run(t, 'sip-ok'), x = r.shadow.find(s => s.sym === 'ZZQ'), ig = x.ig[0];
  assert.deepEqual(r.snaps, ['/v2/stocks/snapshots?feed=sip']);
  assert.match(r.live.src, /SIP feed/); assert.match(r.live.src, /live SIP volume for 1/);
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
