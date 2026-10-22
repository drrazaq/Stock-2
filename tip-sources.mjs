// PUBLIC DATED-CALL SOURCES for the tip scoreboard (Agent C, Crowd). Research only; no orders; no Telegram; never a buy list.
// Added 22 Oct 2026 (WEB SCOUT). Logs the dated, public calls of sources that anyone can read WITHOUT a login, through their official
// open API, into data/tips-public.jsonl ({sym, src, d, ts}); tip-score.mjs scores them forward exactly like the owner's logged tips
// (bought the next open after the call day, 5 and 20 sessions, vs the average stock and the S&P 500). Kept apart from data/tips.jsonl
// so the owner's own tip list in the nightly message is not flooded. Nothing is copied into ACTIONS from here.
// Sources:
//  - "ARK daily buys": ARK Invest's published daily trades (ark-funds.com trade notifications), read through the free public API
//    https://arkfunds.io/api/v2/etf/trades?symbol=<fund>&date_from=<date> (no key, no login). Each Buy row of an active ARK ETF is one
//    call on its trade date (ARK publishes the day's trades that evening, so the next-open entry is after the public could know).
//    Only US-listed tickers that look like plain symbols are kept.
import fs from 'node:fs';
const env = process.env, OUT = env.OUT || 'data/tips-public.jsonl', ARK = env.ARK_BASE || 'https://arkfunds.io/api';
const FUNDS = ['ARKK', 'ARKW', 'ARKG', 'ARKQ', 'ARKF', 'ARKX'];
const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '', have = new Set(old.split('\n').filter(Boolean).map(l => { try { const x = JSON.parse(l); return x.src + '|' + x.sym + '|' + x.d; } catch (e) { return ''; } }));
const from = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10), add = [];
for (const f of FUNDS) { let j = null;
  try { const r = await fetch(ARK + '/v2/etf/trades?symbol=' + f + '&date_from=' + from, { headers: { 'Accept': 'application/json' } }); if (r.ok) j = await r.json(); else console.log('tip-sources: ARK ' + f + ' HTTP ' + r.status); } catch (e) { console.log('tip-sources: ARK ' + f + ': ' + (e.message || e)); }
  for (const x of (j && j.trades) || []) { const sym = String(x.ticker || '').toUpperCase().trim(), d = String(x.date || '').slice(0, 10);
    if (x.direction !== 'Buy' || !/^[A-Z]{1,5}$/.test(sym) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue; const k = 'ARK daily buys|' + sym + '|' + d; if (have.has(k)) continue; have.add(k);
    add.push(JSON.stringify({ sym, src: 'ARK daily buys', d, fund: f, ts: Date.now() })); }
  await new Promise(r => setTimeout(r, 500)); }
if (add.length) fs.appendFileSync(OUT, add.join('\n') + '\n');
console.log('tip-sources: ' + add.length + ' new public calls logged (ARK daily buys since ' + from + ')');
