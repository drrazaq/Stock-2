// Actual premarket-check.mjs against a synthetic local Alpaca service. The price basis of every line is explicit: CURRENT (today's
// New York-date pre-market trade, at most 30 min old), STALE, PREV_CLOSE or MISSING. WATCH/HOLD only on a CURRENT price; stop, ACTIONS
// and last-night-scan SELLs are preserved on any basis and say which basis they rest on. A late after-hours trade (next UTC date,
// previous New York date) is never today's pre-market price. No Telegram variables are set, so nothing is sent; non-local fetch throws.
// PREMARKET_ROOT can point at another tree (used to show the defects on unpatched production).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
const root = path.resolve(process.env.PREMARKET_ROOT || path.join(import.meta.dirname, '..'));
const nyDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
// Start of today's New York date, found by stepping back from now (works in both EDT and EST).
const nyMidnight = () => { const today = nyDate(new Date()); let t = Date.now() - (Date.now() % 60000); while (nyDate(new Date(t - 60000)) === today) t -= 60000; return t; };
const iso = (ms) => new Date(ms).toISOString();

async function run(t, { feedStatus = 200, rows, positions, signals, actionsSells }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'premarket-feed-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of ['premarket-check.mjs', 'alpaca-feed.mjs', 'market-symbol.mjs']) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  fs.mkdirSync(path.join(dir, 'data')); fs.writeFileSync(path.join(dir, 'data/my-positions.json'), JSON.stringify(positions));
  if (signals) fs.writeFileSync(path.join(dir, 'data/signals.json'), JSON.stringify(signals));
  if (actionsSells) fs.writeFileSync(path.join(dir, 'data/actions-sells.json'), JSON.stringify(actionsSells));
  const calls = [];
  const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://l'), feed = u.searchParams.get('feed'); calls.push(feed);
    if ((feed === 'sip' && feedStatus !== 200) || feedStatus === 500) { res.statusCode = feedStatus; return res.end('{}'); }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(rows)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port, preload = path.join(dir, 'local-only.mjs');
  fs.writeFileSync(preload, `const f=fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith(${JSON.stringify(base + '/')}))throw Error('NO_EXTERNAL_ACCESS');return f(u,o);};`);
  const child = spawn(process.execPath, ['--import', preload, 'premarket-check.mjs'], { cwd: dir, env: { PATH: process.env.PATH, ALPACA_DATA_BASE: base, ALPACA_KEY: 'synthetic', ALPACA_SECRET: 'synthetic' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', x => out += x); child.stderr.on('data', x => out += x);
  const code = await new Promise(r => child.on('close', r)); assert.equal(code, 0, out);
  const lines = out.split('\n'), sectionOf = (sym) => { let sec = null; for (const l of lines) { if (/^[A-Z][A-Z ]+(\(|$)/.test(l) && !l.startsWith('- ')) sec = l.split(' (')[0]; if (l.startsWith('- ' + sym + ' ')) return { sec, line: l }; } return { sec: null, line: null }; };
  return { out, calls, sectionOf };
}
const pos = (stop) => ({ entry: 10, stop });

test('price basis: CURRENT gives HOLD; late after-hours, stale and missing prices are NOT HOLD and say why; feed is named', async t => {
  const now = Date.now(), mid = nyMidnight(), staleAt = now - 45 * 60000, staleToday = nyDate(new Date(staleAt)) === nyDate(new Date(now));
  const r = await run(t, { positions: { AAA: pos(8), BBB: pos(8), CCC: pos(8), FFF: pos(8) }, rows: {
    AAA: { latestTrade: { p: 9, t: iso(mid - 30 * 60000) }, prevDailyBar: { c: 9.5 } },          // after-hours trade, today's UTC date, yesterday in New York
    BBB: { latestTrade: { p: 9.9, t: iso(now - 60000) }, prevDailyBar: { c: 9.5 } },             // current pre-market trade
    CCC: { latestTrade: { p: 9.8, t: iso(staleToday ? staleAt : mid + 60000) }, prevDailyBar: { c: 9.5 } },
  } });
  assert.match(r.out, /\[prices: SIP feed\]/); assert.deepEqual(r.calls, ['sip']);
  const a = r.sectionOf('AAA'), b = r.sectionOf('BBB'), f = r.sectionOf('FFF');
  assert.equal(a.sec, 'NO CURRENT PRICE'); assert.match(a.line, /no pre-market trade today; last close 9\.50/); assert.match(a.line, /no HOLD\/WATCH call/);
  assert.equal(b.sec, 'HOLD'); assert.match(b.line, /pre-market 9\.90 at \d\d:\d\d NY \(\+4\.2% vs close\)/);
  assert.equal(f.sec, 'NO CURRENT PRICE'); assert.match(f.line, /FFF NO PRICE/);
  if (staleToday) { const c = r.sectionOf('CCC'); assert.equal(c.sec, 'NO CURRENT PRICE'); assert.match(c.line, /STALE pre-market trade 9\.80 at \d\d:\d\d NY \(4[5-7] min old/); }
});

test('exit instructions are preserved on every basis and name it: stale and previous-close stop hits, ACTIONS and scan SELLs', async t => {
  const now = Date.now(), staleAt = now - 45 * 60000, staleToday = nyDate(new Date(staleAt)) === nyDate(new Date(now));
  const r = await run(t, {
    positions: { DDD: pos(9), EEE: pos(9), GGG: pos(8), HHH: pos(8), III: pos(8) },
    rows: { DDD: { latestTrade: { p: 8.9, t: iso(staleAt) }, prevDailyBar: { c: 9.5 } }, EEE: { prevDailyBar: { c: 8.8 } }, GGG: { prevDailyBar: { c: 9.5 } } },
    signals: { posVerdict: { HHH: 'SELL: halal fail (ZAD).' }, stocks: [{ sym: 'HHH', last: 9.4 }, { sym: 'III', last: 7.5 }] },
    actionsSells: { at: new Date(now).toISOString(), sells: [{ sym: 'GGG', why: 'GGG: TIME EXIT after 126 sessions' }] } });
  const e = r.sectionOf('EEE'), g = r.sectionOf('GGG'), h = r.sectionOf('HHH'), i = r.sectionOf('III');
  assert.equal(e.sec, 'SELL'); assert.match(e.line, /last close 8\.80.*The last close is at or under your stop \(no current price\)/);
  assert.equal(g.sec, 'SELL'); assert.match(g.line, /no pre-market trade today; last close 9\.50.*SELL today, as the last ACTIONS message said: TIME EXIT/);
  assert.equal(h.sec, 'SELL'); assert.match(h.line, /last close \(last night’s scan\) 9\.40.*SELL today, as last night’s scan said: SELL: halal fail/);
  assert.equal(i.sec, 'SELL'); assert.match(i.line, /last close \(last night’s scan\) 7\.50.*at or under your stop \(no current price\)/);
  if (staleToday) { const d = r.sectionOf('DDD'); assert.equal(d.sec, 'SELL'); assert.match(d.line, /STALE pre-market trade 8\.90.*The last pre-market trade \(stale\) is at or under your stop; check the price at the open/); }
});

test('a refused feed is named; prices fall back only to labelled previous closes, never a HOLD', async t => {
  const r = await run(t, { feedStatus: 500, positions: { JJJ: pos(8) }, rows: {}, signals: { stocks: [{ sym: 'JJJ', last: 9.6 }] } });
  assert.match(r.out, /\[price feed refused\]/);
  const j = r.sectionOf('JJJ'); assert.equal(j.sec, 'NO CURRENT PRICE'); assert.match(j.line, /last close \(last night’s scan\) 9\.60/);
});

test('after a SIP 403 the header says IEX', async t => {
  const r = await run(t, { feedStatus: 403, positions: { BBB: pos(8) }, rows: { BBB: { latestTrade: { p: 9.9, t: iso(Date.now() - 60000) }, prevDailyBar: { c: 9.5 } } } });
  assert.match(r.out, /\[prices: IEX feed\]/); assert.deepEqual(r.calls, ['sip', 'iex']); assert.equal(r.sectionOf('BBB').sec, 'HOLD');
});
