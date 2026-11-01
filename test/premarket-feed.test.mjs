// Actual premarket-check.mjs against a synthetic local Alpaca service. Decisions are production's (px = today's pre-market trade, else the
// prior close; stop / ACTIONS / scan SELL; WATCH within 3%; else HOLD). Every line shows its price basis, source, New York timestamp and
// exact age. No freshness cut-off exists: no line calls a price current or fit for an entry. A prior-close stop SELL is labelled as a
// PRIOR-CLOSE INSTRUCTION. A late after-hours trade (next UTC date, previous New York date) is never today's pre-market trade.
// No Telegram variables are set, so nothing is sent; non-local fetch throws. PREMARKET_ROOT can point at another tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
const root = path.resolve(process.env.PREMARKET_ROOT || path.join(import.meta.dirname, '..'));
const nyDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
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

test('every line shows basis, source, New York timestamp and exact age; no price is called current or fit for an entry', async t => {
  const now = Date.now(), mid = nyMidnight();
  const r = await run(t, { positions: { AAA: pos(8), BBB: pos(8), CCC: pos(8), FFF: pos(8) }, signals: { session: '2026-10-30' }, rows: {
    AAA: { latestTrade: { p: 9, t: iso(mid - 30 * 60000) }, prevDailyBar: { c: 9.5, t: '2026-10-30T04:00:00Z' } },   // yesterday evening in New York, today in UTC
    BBB: { latestTrade: { p: 9.9, t: iso(now - 61000) }, prevDailyBar: { c: 9.5, t: '2026-10-30T04:00:00Z' } },
    CCC: { latestTrade: { p: 9.8, t: iso(Math.max(mid + 60000, now - 3 * 3600000)) }, prevDailyBar: { c: 9.5, t: '2026-10-30T04:00:00Z' } },   // hours old, still today
  } });
  assert.doesNotMatch(r.out, /CURRENT|STALE|fresh|executable/i, 'no freshness or entry-suitability wording without an approved contract');
  const a = r.sectionOf('AAA'), b = r.sectionOf('BBB'), c = r.sectionOf('CCC'), f = r.sectionOf('FFF');
  assert.equal(a.sec, 'HOLD'); assert.match(a.line, /no pre-market trade today; prior close 9\.50 \(SIP snapshot previous-day bar, session 2026-10-30\).*HOLD\. Based on the prior close, not on a price from today\./);
  assert.equal(b.sec, 'HOLD'); assert.match(b.line, /pre-market trade 9\.90 \(SIP, \d\d:\d\d:\d\d NY, age 1 min [01] s; \+4\.2% vs close\).*HOLD\. Based on the pre-market trade above\./);
  assert.equal(c.sec, 'HOLD', 'an old pre-market trade keeps the production decision; its age is shown, not judged');
  assert.match(c.line, /pre-market trade 9\.80 \(SIP, \d\d:\d\d:\d\d NY, age (\d+ h )?\d+ min \d+ s;/);
  assert.equal(f.sec, 'HOLD'); assert.match(f.line, /FFF no price available.*No price: this is the default, not an assessment\./);
  assert.match(r.out, /\[prices: SIP feed\]/); assert.deepEqual(r.calls, ['sip']);
});

test('SELLs keep their production triggers; a prior-close stop SELL is a labelled PRIOR-CLOSE INSTRUCTION', async t => {
  const now = Date.now();
  const r = await run(t, {
    positions: { DDD: pos(9), EEE: pos(9), GGG: pos(8), HHH: pos(8), III: pos(8), WWW: pos(9.5) },
    rows: { DDD: { latestTrade: { p: 8.9, t: iso(now - 120000) }, prevDailyBar: { c: 9.5 } }, EEE: { prevDailyBar: { c: 8.8, t: '2026-10-30T04:00:00Z' } }, GGG: { prevDailyBar: { c: 9.5 } }, WWW: { prevDailyBar: { c: 9.7, t: '2026-10-30T04:00:00Z' } } },
    signals: { session: '2026-10-30', posVerdict: { HHH: 'SELL: halal fail (ZAD).' }, stocks: [{ sym: 'HHH', last: 9.4 }, { sym: 'III', last: 7.5 }] },
    actionsSells: { at: new Date(now).toISOString(), sells: [{ sym: 'GGG', why: 'GGG: TIME EXIT after 126 sessions' }] } });
  const d = r.sectionOf('DDD'), e = r.sectionOf('EEE'), g = r.sectionOf('GGG'), h = r.sectionOf('HHH'), i = r.sectionOf('III'), w = r.sectionOf('WWW');
  assert.equal(d.sec, 'SELL'); assert.match(d.line, /SELL at the open .*The pre-market trade is at or under your stop\./);
  assert.equal(e.sec, 'SELL'); assert.match(e.line, /prior close 8\.80 \(SIP snapshot previous-day bar, session 2026-10-30\).*PRIOR-CLOSE INSTRUCTION: the prior close is at or under your stop \(no price from today\)\./);
  assert.equal(g.sec, 'SELL'); assert.match(g.line, /SELL today, as the last ACTIONS message said: TIME EXIT/);
  assert.equal(h.sec, 'SELL'); assert.match(h.line, /prior close 9\.40 \(last night’s scan, session 2026-10-30\).*SELL today, as last night’s scan said: SELL: halal fail/);
  assert.equal(i.sec, 'SELL'); assert.match(i.line, /PRIOR-CLOSE INSTRUCTION/);
  assert.equal(w.sec, 'WATCH'); assert.match(w.line, /WATCH\. Within 3% of your stop.*Based on the prior close, not on a price from today\./);
});

test('a refused feed is named; the scan close keeps the production HOLD, labelled as prior-close based', async t => {
  const r = await run(t, { feedStatus: 500, positions: { JJJ: pos(8) }, rows: {}, signals: { session: '2026-10-30', stocks: [{ sym: 'JJJ', last: 9.6 }] } });
  assert.match(r.out, /\[price feed refused\]/);
  const j = r.sectionOf('JJJ'); assert.equal(j.sec, 'HOLD'); assert.match(j.line, /prior close 9\.60 \(last night’s scan, session 2026-10-30\).*Based on the prior close/);
});

test('after a SIP 403 the header and the trade source say IEX', async t => {
  const r = await run(t, { feedStatus: 403, positions: { BBB: pos(8) }, rows: { BBB: { latestTrade: { p: 9.9, t: iso(Date.now() - 60000) }, prevDailyBar: { c: 9.5 } } } });
  assert.match(r.out, /\[prices: IEX feed\]/); assert.deepEqual(r.calls, ['sip', 'iex']);
  const b = r.sectionOf('BBB'); assert.equal(b.sec, 'HOLD'); assert.match(b.line, /pre-market trade 9\.90 \(IEX, /);
});
