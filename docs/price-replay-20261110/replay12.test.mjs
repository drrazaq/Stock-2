// 12-case OFFLINE full-watcher latency/session replay (handoff 6764137897). Derived from test/feed-integrity-watcher.test.mjs:
// the actual ignition-watch.mjs runs as a child process against local synthetic Massive + Alpaca services, in REAL time
// (no clock scaling). MASSIVE_BASE is NOT set (a local MASSIVE_BASE turns every watcher sleep into 0 ms); the preload instead routes
// https://api.massive.com/ to the local server, so the real 60 s cadence wait runs. External fetch is refused by the preload. No credentials, provider, message, order or dispatch.
// REPLAY_ROOT = tree under test. Output: one JSON receipt line per case on stdout (prefix RECEIPT ).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
const root = path.resolve(process.env.REPLAY_ROOT);
const day = '2026-10-30', L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = ms => new Date(ms).toISOString();

async function run(t, c) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay12-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of fs.readdirSync(root).filter(p => p.endsWith('.mjs'))) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  fs.mkdirSync(path.join(dir, 'data'));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' }); execFileSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: dir, stdio: 'ignore' });
  const SYMS = c.syms || ['ZZQ'];
  const log = []; let offset = null; const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost'), simAt = +req.headers['x-sim-now']; offset = simAt - Date.now();
    const simNow = () => Date.now() + offset; res.setHeader('Content-Type', 'application/json');
    const ent = { path: u.pathname, feed: u.searchParams.get('feed'), arrive: simAt }; log.push(ent);
    if (u.pathname.includes('/v2/snapshot/locale')) { if (c.massiveDelay) await sleep(c.massiveDelay);
      const late = simNow() - 20 * 60000; ent.sent = simNow();
      return res.end(JSON.stringify({ tickers: SYMS.map(s => ({ ticker: s, lastTrade: { p: 10, t: late * 1e6 }, lastQuote: { p: 9.98, P: 10.02, t: late * 1e6 }, prevDay: { c: 9.5, v: 2e6 }, min: { c: 10, t: late, av: 1e5 }, day: { c: 10, o: 9.6, v: 1e5 } })) })); }
    if (u.pathname.includes('/screener/')) { ent.sent = simNow(); return res.end(JSON.stringify({ gainers: [{ symbol: SYMS[0] }] })); }
    if (u.pathname === '/v2/stocks/snapshots') {
      const syms = (u.searchParams.get('symbols') || '').split(','), first = syms[0] === SYMS[0];
      const delay = typeof c.alpacaDelay === 'function' ? c.alpacaDelay(first) : (c.alpacaDelay || 0);
      if (delay) await sleep(delay);
      if (res.destroyed || req.socket.destroyed) { ent.aborted = true; return; }
      const sent = simNow(); ent.sent = sent;
      const body = Object.fromEntries(syms.map(s => [s, c.row({ arrive: simAt, sent, first })]));
      ent.tradeT = Object.values(body)[0].latestTrade.t; return res.end(JSON.stringify(body)); }
    res.statusCode = 404; res.end('{}'); });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { for (const s of sockets) s.destroy(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port, preload = path.join(dir, 'local-only.mjs');
  const at = Date.parse(day + 'T00:00:00Z') + (c.fakeMin + 240) * 60000;   // 30 Oct is EDT: New York minute fakeMin
  fs.writeFileSync(preload, `const D=Date,start=D.now(),at=${at};globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[at+D.now()-start]));}static now(){return at+D.now()-start;}};const f=fetch;globalThis.fetch=(u,o={})=>{u=String(u);if(u.startsWith('https://api.massive.com/'))u=${JSON.stringify(base)}+u.slice(23);if(!u.startsWith(${JSON.stringify(base + '/')}))throw Error('NO_EXTERNAL_ACCESS');return f(u,{...o,headers:{...(o.headers||{}),'x-sim-now':String(Date.now())}});};`);
  const env = { PATH: process.env.PATH, IG_DAY: day, IG_FAKE_MIN: String(c.fakeMin), IG_RUN_MIN: String(c.runMin), IG_NO_RADAR: '1', MASSIVE_KEY: 'synthetic', ALPACA_DATA: base, ALPACA_KEY: 'synthetic', ALPACA_SECRET: 'synthetic', SEC_BASE: base, SEC_UA: 'synthetic fixture', GITHUB_RUN_ID: 'replay-' + c.id, GITHUB_RUN_ATTEMPT: '1' };
  const child = spawn(process.execPath, ['--import', preload, 'ignition-watch.mjs'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] }); t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x);
  const timer = setTimeout(() => child.kill("SIGKILL"), +(process.env.REPLAY_KILL_MS||240000)); const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); clearTimeout(timer);
  assert.equal(code, 0, output);
  const live = JSON.parse(fs.readFileSync(path.join(dir, 'data/ignition-live.json')));
  assert.equal(log.some(e => /sendMessage|orders/.test(e.path)), false);
  const massive = log.filter(e => e.path.includes('/v2/snapshot/locale')).map(e => e.arrive), t0 = massive[0];
  const r = { id: c.id, root: process.env.REPLAY_LABEL || root, heartbeat: (live.heartbeat || []).map(b => ({ m: b.m, mode: b.mode, received: b.received, evaluated: b.evaluated, live: b.live, ageP50: b.ageP50 })),
    src: live.src, loopStartsSec: massive.map(x => +((x - t0) / 1000).toFixed(1)),
    alpaca: log.filter(e => e.path === '/v2/stocks/snapshots').map(e => ({ feed: e.feed, atSec: +((e.arrive - t0) / 1000).toFixed(1), sentSec: e.sent ? +((e.sent - t0) / 1000).toFixed(1) : null, aborted: !!e.aborted, tradeMinusSentSec: e.tradeT ? +((Date.parse(e.tradeT) - e.sent) / 1000).toFixed(1) : null })) };
  console.log('RECEIPT ' + JSON.stringify(r)); return r;
}
const dailyBar = { t: day + 'T04:00:00Z', o: 9.6, c: 11, v: 3e6 }, prev = { c: 9.5, v: 2e6 };
const active = ({ arrive, sent }) => ({ latestTrade: { p: 11, t: iso((arrive + sent) / 2) }, latestQuote: { bp: 10.99, ap: 11.01, t: iso((arrive + sent) / 2) }, dailyBar, prevDailyBar: prev });
const inactive = ({ arrive, sent }) => ({ latestTrade: { p: 9, t: iso(arrive - 3600000) }, latestQuote: { bp: 10.99, ap: 11.01, t: iso((arrive + sent) / 2) }, dailyBar, prevDailyBar: prev });
const CASES = [];
for (const lat of [0, 2, 10, 65]) {
  CASES.push({ id: 'ACT-' + lat + 's', fakeMin: 600, runMin: 2, alpacaDelay: lat * 1000, row: active });
  CASES.push({ id: 'INACT-' + lat + 's', fakeMin: 600, runMin: 2, alpacaDelay: lat * 1000, row: inactive });
}
// B1: two batches; batch 1 answers at once with a trade 3 s AFTER its own receipt, batch 2 answers 5 s later with a past trade.
const SYM250 = Array.from({ length: 250 }, (_, i) => 'Z' + L[Math.floor(i / 26) % 26] + L[i % 26]);
CASES.push({ id: 'B1-future-at-receipt', fakeMin: 600, runMin: 1, syms: SYM250, alpacaDelay: first => first ? 0 : 5000,
  row: ({ arrive, sent, first }) => ({ latestTrade: { p: 11, t: iso(first ? sent + 3000 : arrive - 1000) }, dailyBar, prevDailyBar: prev }) });
// B2/B3: a 61 s market-data fetch that starts in 14:59 / 15:00 and returns in 15:00 / 15:01.
CASES.push({ id: 'B2-1459-to-1500', fakeMin: 899, runMin: 1.5, massiveDelay: 61000, row: active });
CASES.push({ id: 'B3-1500-to-1501', fakeMin: 900, runMin: 1.5, massiveDelay: 61000, row: active });
// B4: every fetch takes 65 s mid-session: the skipped minute must stay visible.
CASES.push({ id: 'B4-65s-overrun', fakeMin: 600, runMin: 2.1, massiveDelay: 65000, row: active });
// X1 (extra, outside the 12): 250 Massive rows, every Alpaca snapshot times out -> does the top-50 fallback keep the universe?
CASES.push({ id: 'X1-timeout-universe', fakeMin: 600, runMin: 0.5, syms: SYM250, alpacaDelay: 10500, row: active, extra: true });
const only = process.env.REPLAY_ONLY ? new Set(process.env.REPLAY_ONLY.split(',')) : null;
test('12-case replay', { concurrency: 12, timeout: 400000 }, async t => { await Promise.all(CASES.filter(c => only ? only.has(c.id) : !c.extra).map(c => t.test(c.id, async tt => { await run(tt, c); }))); });
