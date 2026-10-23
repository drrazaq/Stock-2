// One-off scorecard: "Today's winners vs the system" for Fri 23 Oct 2026. Runs on GitHub Actions (needs market data).
// Reads the committed watcher records (data/ignition-live.json, data/ignition-paper.jsonl, data/radar-day.json),
// Massive grouped daily bars (22 and 23 Oct) + ticker types, and Alpaca SIP minute bars (Massive minute bars as fallback).
// Writes data/scorecard-1023.json only.
import fs from 'node:fs';
const env = process.env, D0 = '2026-10-22', D1 = '2026-10-23', OUT = 'data/scorecard-1023.json';
const MV = 'https://api.massive.com', AD = 'https://data.alpaca.markets';
const AH = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r4 = x => x == null || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4;
const hm = m => m == null ? null : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const COST = 0.008, slip = p => p < 5 ? 0.01 : 0.005;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function get(url, opts, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { ...(opts || {}), signal: AbortSignal.timeout(60000) });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      if (!r.ok) { log('HTTP', r.status, url.replace(/apiKey=[^&]+/, 'apiKey=***').slice(0, 160)); return null; }
      return await r.json(); } catch (e) { await sleep(2000 * (i + 1)); }
  }
  return null;
}
const mv = p => get(MV + p + (p.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''));

// New York minute-of-day from a UTC ms timestamp (handles DST via Intl).
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit' });
function nyMin(ms) { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { d: p.year + '-' + p.month + '-' + p.day, m: (+p.hour % 24) * 60 + +p.minute }; }

// ---------- 1. grouped daily + types ----------
async function grouped(d) { const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); return new Map((j && j.results || []).map(x => [x.T, x])); }
async function types() {
  const t = new Map();
  for (const type of ['CS', 'ADRC', 'WARRANT', 'UNIT', 'RIGHT']) {
    let p = '/v3/reference/tickers?market=stocks&type=' + type + '&active=true&limit=1000', pages = 0;
    while (p && pages++ < 40) { const j = await mv(p); if (!j) break; for (const x of j.results || []) t.set(x.ticker, type);
      p = j.next_url ? j.next_url.replace(MV, '') : null; }
  }
  return t;
}

// ---------- minute bars ----------
const BARS = new Map();   // sym -> [[min, o, h, l, c, v]] (NY minutes, 23 Oct only, 04:00-20:00)
async function alpacaBars(syms) {
  for (let i = 0; i < syms.length; i += 100) {
    const b = syms.slice(i, i + 100); let tok = null, pages = 0;
    do { const u = AD + '/v2/stocks/bars?symbols=' + b.map(encodeURIComponent).join(',') + '&timeframe=1Min&start=2026-10-23T08:00:00Z&end=2026-10-24T00:00:00Z&feed=sip&adjustment=raw&limit=10000' + (tok ? '&page_token=' + tok : '');
      const j = await get(u, AH); if (!j) break; tok = j.next_page_token; pages++;
      for (const [s, arr] of Object.entries(j.bars || {})) { const a = BARS.get(s) || []; for (const x of arr) { const n = nyMin(Date.parse(x.t)); if (n.d === D1) a.push([n.m, x.o, x.h, x.l, x.c, x.v]); } BARS.set(s, a); }
    } while (tok && pages < 200);
    if ((i / 100) % 10 === 0) log('alpaca bars', i + b.length, '/', syms.length);
  }
  for (const a of BARS.values()) a.sort((x, y) => x[0] - y[0]);
}
async function massiveBars(sym) {
  const j = await mv(`/v2/aggs/ticker/${encodeURIComponent(sym)}/range/1/minute/${D1}/${D1}?adjusted=false&sort=asc&limit=50000`);
  if (!j || !j.results) return; const a = []; for (const x of j.results) { const n = nyMin(x.t); if (n.d === D1) a.push([n.m, x.o, x.h, x.l, x.c, x.v]); }
  if (a.length) BARS.set(sym, a);
}
// price at time m (minute of day) = close of the last regular-hours bar that started before m
function px(sym, m) { const a = BARS.get(sym); if (!a) return null; let v = null; for (const x of a) { if (x[0] < 570) continue; if (x[0] >= m || x[0] > 959) break; v = x[4]; } return v; }
function lastBarAge(sym, m) { const a = BARS.get(sym); if (!a) return 999; let t = null; for (const x of a) { if (x[0] >= m) break; t = x[0]; } return t == null ? 999 : m - t; }
function regular(sym) { return (BARS.get(sym) || []).filter(x => x[0] >= 570 && x[0] <= 959); }

// ---------- watcher records ----------
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const live = read('data/ignition-live.json', {});
let paper = []; try { paper = fs.readFileSync('data/ignition-paper.jsonl', 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(x => x && x.d === D1); } catch (e) {}
const radar = read('data/radar-day.json', null);
const liveTrig = (live.day === D1 ? live.triggers || [] : []);
const missed = new Map((live.day === D1 ? live.missed || [] : []).map(x => [x.sym, x]));
const radarSyms = new Set(radar && radar.d === D1 ? [...Object.keys(radar.syms || {}), ...[].concat(radar.watchAlerts || []).map(x => x && (x.sym || x.s)), ...[].concat(radar.paperToday || []).map(x => x && (x.sym || x.s))].filter(Boolean) : []);
const allTrig = [...liveTrig.map(t => ({ ...t, src: t.logged ? 'live-only (' + t.logged + ')' : 'live' })), ...paper.map(t => ({ ...t, src: 'paper' }))];
const triggeredSyms = new Set(allTrig.map(t => t.sym));

// ---------- main ----------
const PICKS = [['STAK', 1.69], ['BHVN', 16.13], ['NCPL', null], ['BKYI', null], ['BBT', null], ['PFSA', null], ['STRZ', null]];
const AV = { STAK: { o: 1.84, h: 2.07, l: 1.62, c: 1.74, pc: 1.67 }, BHVN: { o: 15.215, h: 15.30, l: 13.83, c: 13.88, pc: 14.69 } };

const g0 = await grouped(D0), g1 = await grouped(D1); log('grouped', g0.size, g1.size);
if (!g0.size || !g1.size) { fs.writeFileSync(OUT, JSON.stringify({ error: 'grouped daily missing', g0: g0.size, g1: g1.size }, null, 1)); process.exit(1); }
const T = await types(); log('types', T.size);
const sufWUR = s => /^[A-Z]{4}(W|WS|U|R)$/.test(s) || /\.(WS|U|R|W)$/.test(s);

// winners
const winners = [];
let excludedOther = 0;
for (const [s, b] of g1) { const a = g0.get(s); if (!a || !(a.c > 0)) continue; const chg = b.c / a.c - 1; if (chg < 0.15) continue;
  const ty = T.get(s) || null; if (!ty && !sufWUR(s)) { excludedOther++; continue; }
  const wur = ty === 'WARRANT' || ty === 'UNIT' || ty === 'RIGHT' || (!ty && sufWUR(s)) || (ty !== 'CS' && ty !== 'ADRC' && sufWUR(s));
  winners.push({ sym: s, type: ty || 'suffix', prevC: a.c, open: b.o, high: b.h, low: b.l, close: b.c, vol: b.v, vw: b.vw, chg: r4(chg), hiUp: r4(b.h / a.c - 1), openGap: r4(b.o / a.c - 1),
    bucket: chg >= 1 ? '100%+' : chg >= 0.5 ? '50-100' : chg >= 0.3 ? '30-50' : '15-30', under1: b.c < 1 || a.c < 1, wur }); }
winners.sort((x, y) => y.chg - x.chg); log('winners', winners.length);

// control pool: common stocks, prev close >= 1, some liquidity, day range spans some trigger level +/-2 points
const benchTrig = paper.filter(t => /^IG[1234689]$/.test(t.rule)).concat(liveTrig.filter(t => t.rule === 'IG4' && t.logged).map(t => ({ ...t, liveOnly: true })));
const lv = benchTrig.map(t => t.price / t.prevC - 1);
const pool = [];
for (const [s, b] of g1) { const a = g0.get(s); const ty = T.get(s); if (!a || !(a.c >= 1) || (ty !== 'CS' && ty !== 'ADRC') || sufWUR(s) || triggeredSyms.has(s)) continue;
  if (!((b.vw || b.c) * b.v >= 200000)) continue; const lo = b.l / a.c - 1, hi = b.h / a.c - 1;
  if (benchTrig.some((t, i) => lo <= lv[i] + 0.02 && hi >= lv[i] - 0.02 && b.l <= t.price * 1.5 && b.h >= t.price / 1.5)) pool.push(s); }
const need = [...new Set([...pool, ...winners.map(w => w.sym), ...allTrig.map(t => t.sym), ...PICKS.map(p => p[0])])];
log('minute-bar symbols', need.length, 'pool', pool.length);
await alpacaBars(need);
const miss = [...new Set([...winners.map(w => w.sym), ...allTrig.map(t => t.sym), ...PICKS.map(p => p[0])])].filter(s => !BARS.get(s) || !BARS.get(s).length);
log('massive fallback for', miss.length); for (const s of miss) await massiveBars(s);

const closeOf = s => { const b = g1.get(s); if (b && b.c > 0) return b.c; const r = regular(s); return r.length ? r[r.length - 1][4] : null; };
function outcome(sym, m, price) {
  const e = price * (1 + slip(price)), c = closeOf(sym);
  const p15 = m + 15 <= 960 ? px(sym, m + 15) : c, p60 = m + 60 <= 960 ? px(sym, m + 60) : c;
  const f = x => x > 0 ? r4(x / e - 1 - COST) : null;
  return { entry: r4(e), r15: f(p15), r60: f(p60), rClose: f(c) };
}
const stats = (arr, k) => { const v = arr.map(x => x[k]).filter(x => x != null); if (!v.length) return { n: 0 };
  return { n: v.length, avg: r4(v.reduce((a, b) => a + b, 0) / v.length), median: r4(v.slice().sort((a, b) => a - b)[v.length >> 1]), win: r4(v.filter(x => x > 0).length / v.length) }; };

// ---------- 2. winners vs the watcher ----------
const firstMin = (s, lvl) => { const pc = g0.get(s)?.c; if (!pc) return null; for (const x of regular(s)) if (x[2] >= pc * (1 + lvl)) return x[0]; return null; };
for (const w of winners) {
  const ts = allTrig.filter(t => t.sym === w.sym).sort((a, b) => a.m - b.m), mr = missed.get(w.sym);
  const f = ts[0];
  w.cross10 = hm(firstMin(w.sym, 0.10)); w.cross15 = hm(firstMin(w.sym, 0.15)); w.cross20 = hm(firstMin(w.sym, 0.20));
  w.seenLive = !!(f || (mr && mr.firstLive));
  w.firstLive = mr ? mr.firstLive : (f ? hm(f.m) : null);
  w.inRadar = radarSyms.has(w.sym);
  if (f) { const up = f.price / w.prevC - 1; w.alarm = { rule: f.rule, at: hm(f.m), price: f.price, upAtAlarm: r4(up), src: f.src, rules: [...new Set(ts.map(t => t.rule))] };
    w.caughtBefore10 = up < 0.10; w.caughtBefore20 = up < 0.20; w.alarmResult = outcome(w.sym, f.m, f.price); }
  else { w.alarm = null; w.caughtBefore10 = w.caughtBefore20 = false; }
  if (mr) { w.watcherCode = mr.code; w.why = mr.why; w.watcherResult = mr.result; }
  else { const c15 = firstMin(w.sym, 0.15);
    w.watcherCode = w.under1 ? 'UNDER_1_USD' : w.wur ? 'WARRANT_UNIT_RIGHT' : c15 == null ? 'NO_MINUTE_BARS' : c15 >= 900 ? 'CROSSED_15_AFTER_15_00' : c15 < 570 ? 'NOT_IN_LEDGER_PREMARKET' : 'NOT_IN_WATCHER_LEDGER';
    w.why = { UNDER_1_USD: 'under 1 USD', WARRANT_UNIT_RIGHT: 'warrant/unit/right (not watched)', NO_MINUTE_BARS: 'no SIP minute bars found', CROSSED_15_AFTER_15_00: 'first reached +15% after 15:00 (watcher stops at 15:00)', NOT_IN_LEDGER_PREMARKET: 'not in the watcher ledger', NOT_IN_WATCHER_LEDGER: 'reached +15% in the watched hours but is not in the watcher ledger (not in its universe or filtered)' }[w.watcherCode]; }
}
const com = winners.filter(w => !w.under1 && !w.wur);
const bucketCount = arr => ['15-30', '30-50', '50-100', '100%+'].reduce((o, b) => (o[b] = arr.filter(w => w.bucket === b).length, o), {});
const totals = (arr) => ({ n: arr.length, buckets: bucketCount(arr), seenLive: arr.filter(w => w.seenLive).length, anyAlarm: arr.filter(w => w.alarm).length,
  alarmTakenToPaper: arr.filter(w => w.alarm && allTrig.some(t => t.sym === w.sym && t.src === 'paper')).length,
  caughtBefore10: arr.filter(w => w.caughtBefore10).length, caughtBefore20: arr.filter(w => w.caughtBefore20).length,
  missedCodes: arr.filter(w => !w.alarm).reduce((o, w) => (o[w.watcherCode] = (o[w.watcherCode] || 0) + 1, o), {}),
  allCodes: arr.reduce((o, w) => (o[w.watcherCode || 'NONE'] = (o[w.watcherCode || 'NONE'] || 0) + 1, o), {}) });

// ---------- 3. every paper trigger ----------
const trades = paper.map(t => ({ sym: t.sym, rule: t.rule, at: hm(t.m), m: t.m, price: t.price, upAtTrigger: r4(t.price / t.prevC - 1), ...outcome(t.sym, t.m, t.price), winnerToday: winners.some(w => w.sym === t.sym) }));
const liveOnly = liveTrig.filter(t => t.logged).map(t => ({ sym: t.sym, rule: t.rule, at: hm(t.m), m: t.m, price: t.price, upAtTrigger: r4(t.price / t.prevC - 1), why: t.logged, ...outcome(t.sym, t.m, t.price) }));
const perRule = arr => { const o = {}; for (const r of [...new Set(arr.map(t => t.rule))].sort()) { const a = arr.filter(t => t.rule === r); o[r] = { r15: stats(a, 'r15'), r60: stats(a, 'r60'), rClose: stats(a, 'rClose') }; }
  o.ALL = { r15: stats(arr, 'r15'), r60: stats(arr, 'r60'), rClose: stats(arr, 'rClose') }; const x = arr.filter(t => t.rule !== 'IG8'); o.ALL_EXCEPT_IG8 = { r15: stats(x, 'r15'), r60: stats(x, 'r60'), rClose: stats(x, 'rClose') }; return o; };

// ---------- 4. matched controls ----------
const ctrlRows = [];
for (const t of benchTrig) {
  const up = t.price / t.prevC - 1, cands = [];
  for (const s of pool) { const pc = g0.get(s).c, p = px(s, t.m); if (!(p > 0) || lastBarAge(s, t.m) > 5) continue; const u = p / pc - 1;
    if (Math.abs(u - up) > 0.02) continue; const pr = p / t.price; if (pr < 1 / 1.5 || pr > 1.5) continue;
    cands.push({ s, p, u, d: Math.abs(u - up) / 0.02 + Math.abs(Math.log(pr)) / Math.log(1.5) }); }
  cands.sort((a, b) => a.d - b.d); const pick = cands.slice(0, 10);
  const outs = pick.map(c => outcome(c.s, t.m, c.p)); const mean = k => { const v = outs.map(o => o[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const own = outcome(t.sym, t.m, t.price);
  ctrlRows.push({ sym: t.sym, rule: t.rule, at: hm(t.m), liveOnly: !!t.liveOnly, up: r4(up), price: t.price, nControls: pick.length, controls: pick.map(c => c.s),
    pick: { r15: own.r15, r60: own.r60, rClose: own.rClose }, ctrl: { r15: r4(mean('r15')), r60: r4(mean('r60')), rClose: r4(mean('rClose')) } });
}
const cmp = rows => { const ok = rows.filter(r => r.nControls > 0); const o = { n: ok.length };
  for (const k of ['r15', 'r60', 'rClose']) { const a = ok.filter(r => r.pick[k] != null && r.ctrl[k] != null); o[k] = { n: a.length, pick: r4(a.reduce((s, r) => s + r.pick[k], 0) / (a.length || 1)), control: r4(a.reduce((s, r) => s + r.ctrl[k], 0) / (a.length || 1)),
    pickBeatControl: a.filter(r => r.pick[k] > r.ctrl[k]).length }; } return o; };
const ctrlByRule = {}; for (const r of [...new Set(ctrlRows.map(x => x.rule))].sort()) ctrlByRule[r] = cmp(ctrlRows.filter(x => x.rule === r));
ctrlByRule.ALL = cmp(ctrlRows); ctrlByRule.ALL_EXCEPT_IG8 = cmp(ctrlRows.filter(x => x.rule !== 'IG8'));

// ---------- 5. the 7 pre-market picks ----------
const picks = [];
for (const [s, frozen] of PICKS) {
  const a = g0.get(s), b = g1.get(s), reg = regular(s), pre = (BARS.get(s) || []).filter(x => x[0] < 570);
  const o = b ? b.o : (reg[0] ? reg[0][1] : null), c = b ? b.c : null, h = b ? b.h : null, l = b ? b.l : null, pc = a ? a.c : null;
  const at410 = pre.filter(x => x[0] <= 250).pop();
  picks.push({ sym: s, frozen0810UTC: frozen, prevClose: pc, open: o, high: h, low: l, close: c, firstMinuteOpen: reg[0] ? reg[0][1] : null,
    prevCloseToOpen: pc && o ? r4(o / pc - 1) : null, frozenToOpen: frozen && o ? r4(o / frozen - 1) : null,
    preHigh: pre.length ? Math.max(...pre.map(x => x[2])) : null, preLow: pre.length ? Math.min(...pre.map(x => x[3])) : null, preVol: pre.reduce((t, x) => t + x[5], 0), lastPreBarAt0410: at410 ? at410[4] : null,
    openToClose: o && c ? r4(c / o - 1) : null, result: o && c ? r4(c / o - 1 - COST) : null, highVsOpen: o && h ? r4(h / o - 1) : null, lowVsOpen: o && l ? r4(l / o - 1) : null,
    alphaVantage: AV[s] || null, alarmedToday: [...new Set(allTrig.filter(t => t.sym === s).map(t => t.rule + '@' + hm(t.m)))] });
}
const pv = picks.filter(p => p.result != null);

const outJ = {
  made: new Date().toISOString(), day: D1, note: 'Costs: buy at trigger price + 0.5% slippage (1% under 5 USD), minus 0.8% round-trip cost. 15/60 min prices from SIP minute bars (Alpaca; Massive fallback), close = Massive grouped daily close. Controls: up to 10 common stocks not triggered by any rule today, same minute, up within +/-2 points of the pick, price within 1.5x, traded in the last 5 minutes, liquidity >= 200k USD that day.',
  inputs: { liveMode: live.mode, liveCoverage: live.coverage, paperTriggersToday: paper.length, liveTriggersToday: liveTrig.length, radarDay: radar ? radar.d : null, groupedSymbols: [g0.size, g1.size], typedTickers: T.size, controlPool: pool.length, barsSymbols: BARS.size, excludedOtherTypes: excludedOther },
  totals: { all: totals(winners), commonAtLeast1USD: totals(com) },
  trades: { perRule: perRule(trades), liveOnlyPerRule: perRule(liveOnly) },
  controls: { byRule: ctrlByRule },
  picks: { rows: picks, avgResult: pv.length ? r4(pv.reduce((s, p) => s + p.result, 0) / pv.length) : null, winners: pv.filter(p => p.result > 0).length },
  winners, tradeRows: trades, liveOnlyRows: liveOnly, controlRows: ctrlRows,
};
fs.writeFileSync(OUT, JSON.stringify(outJ));
log('done', 'winners', winners.length, 'trades', trades.length, 'controls', ctrlRows.length);
