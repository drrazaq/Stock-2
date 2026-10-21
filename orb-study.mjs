// OPENING-RANGE BREAKOUT ON STOCKS IN PLAY, LONG ONLY (library A-ORB1, Agent A - Timing). Research only; never places an order;
// no Telegram. PRE-REGISTERED 21 Oct 2026: ONE version, resolved from the ORIGINAL paper BEFORE any run, nothing tuned on results.
// SOURCE: Zarattini, Barbon & Aziz (2024), "A Profitable Day Trading Strategy For The U.S. Equity Market", SSRN 4729284
// (PDF: concretumgroup.com/wp-content/uploads/2026/02/A-Profitable-Day-Trading-Strategy-For-The-U.S.-Equity-Market.pdf), read 21 Oct 2026.
// RESOLVED SPECIFICATION (element -> the paper's words -> what this study does):
//   Opening range   | Section 2.1 "Entry Conditions": "the first 5 minutes of trading (from 9:30 am until 9:35 am ET)"; also 15/30/60 min
//                   |   compared in Section 5, the 5-minute one is the paper's main result (Sharpe 2.81). -> minute bars 9:30-9:34 (5 bars).
//   Direction       | "if a stock had a bullish move within the first 5 minutes ... stop order at the highest value of the 5-minute opening
//                   |   range"; "In the case of a doji (open = close) ... no order was placed." -> LONG ONLY here: 5-minute close > open; the
//                   |   paper's short side (bearish range) is not traded (the user's rule: long only).
//   Entry fill      | "we placed a stop order ... at a level equal to the high ... of the 5-minute range" -> the first minute bar from 9:35 whose
//                   |   high exceeds the range high; filled at max(range high, that bar's open) (a stop order fills at the market, a gap through
//                   |   the level fills at the open). No entry after 15:30.
//   Stop loss       | "Stop Loss and Profit Target": "a stop loss order at a 10% ATR distance from the executed entry price"; ATR = 14-day average
//                   |   true range (footnote 1, Wilder). -> stop = entry - 0.10 x ATR14 (daily bars, the 14 sessions before the day), checked on every
//                   |   minute's low, a gap through it fills at that minute's open.
//   Target / trail  | "If the stop loss was not reached intraday, we closed the position at the end of the trading session (i.e., 4:00 pm ET)."
//                   |   The paper has NO profit target and NO trailing stop (its Figure 2: "A profit target is set at the EOD"). -> none; exit at the
//                   |   close of the last regular minute (15:59 bar close).
//   Universe filters| Section 2.1 / Section 4: "1. The opening price had to be above $5. 2. The average trading volume over the previous 14 days had
//                   |   to be at least 1,000,000 shares per day. 3. The ATR over the previous 14 days had to be more than $0.50." -> the same, from the
//                   |   daily cache; the study's base universe is first the 100 most traded US stocks by dollar volume on the PREVIOUS day (point in
//                   |   time; the user's spec, to fit the minute-bar budget), then the paper's filters.
//   Stocks in play  | Section 3: "RelativeVolume_{t,j} = ORVolume_{t,j} / (1/14 sum_{i=1..14} ORVolume_{t-i,j})", "ORVolume represents the volume
//                   |   traded in stock j during the first 5-minutes of trading in day t". Section 4: "4. The Relative Volume had to be at least 100%.
//                   |   5. Trade the stocks with the top 20 Relative Volume." -> RV = 9:30-9:34 volume / mean of the same over the previous 14 sessions
//                   |   (at least 10 of the 14 known, else the stock is skipped that day); RV >= 1; the top 20 by RV among the eligible stocks of
//                   |   both directions, of which the bullish ones are bought.
//   Position cap    | "Position Sizing": risk 1% of capital per trade at the stop, leverage at most 4x. -> not reproduced: results are per trade
//                   |   (equal 1,000 USD a trade, the user's size); the busiest-day exposure is reported instead.
//   Costs           | paper: "$0.0035 per share" commission (Interactive Brokers Pro) and no slippage. -> OUR costs: 0.8% a round trip (stress 1.2%),
//                   |   plus a 0.1% extra-slippage case (0.9%), the same as every Stock-2 study.
//   Period          | paper 2016-2023, 7,000+ stocks. -> as many sessions as the minute-bar budget allows, target 2 years; incremental across runs.
// GATES (pattern-lab.mjs rules): both halves; date-clustered t >= max(own bar 2.4 + 0.1 x versions / 2, league bar); positive after costs;
// beats the average universe stock open-to-close the same day (edge), the S&P 500 open-to-close the same day, and the same stock open-to-close on
// its other days; positive at stress cost; survives without its 2 best trades. Verdict PASSED / NOT PROVEN / REJECTED / TOO FEW CASES; the first
// COMPLETE run is frozen (firstRun); a PASS goes to paper first. Minute bars: Massive (paid plan), per stock in date ranges with paging, results
// cached in fm-cache/orb-min.json.gz (per stock-day: opening range, trade at each fill delay, open-to-close), budget ORB_CALLS / ORB_MINUTES.
// If minute bars are refused (plan limit), status "needs data" with the exact error. Output: data/orb-study.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { toBars, nyOffset } from './ignition-core.mjs';
const env = process.env, OUT = env.OUT || 'data/orb-study.json', CDIR = env.FM_CACHE_DIR || 'fm-cache', MC = CDIR + '/orb-min.json.gz', VER = 1;
const COST = 0.008, STRESS = 0.012, SLIP = 0.009, DEL = [0, 1, 5, 15, 30], TOPN = 100, TOPRV = 20, SESS = +(env.ORB_SESSIONS || 504);
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TEST = local(env.MASSIVE_BASE), PX = TEST || 'https://api.massive.com';
const sleep = (ms) => new Promise(r => setTimeout(r, TEST ? 0 : ms)), J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(CDIR, { recursive: true });
const PREV = J(OUT, {});
// ---- daily prices (point in time)
let store = null; for (const f of [CDIR + '/fm.json.gz', env.CACHE || 'study-cache/grouped.json.gz']) { try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); console.log('orb: daily prices from ' + f); break; } catch (e) {} }
if (!store || !store.days) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no daily price cache', agent: 'A' })); console.log('orb: no daily price cache'); process.exit(0); }
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t])), W0 = Math.max(30, T - SESS);
const bars = new Map(); for (let t = Math.max(0, W0 - 30); t < T; t++) { const x = store.days[D[t]]; for (let j = 0; j < x.T.length; j++) { let a = bars.get(x.T[j]); if (!a) bars.set(x.T[j], a = new Map()); a.set(t, { o: x.o[j], h: x.h ? x.h[j] : x.c[j], l: x.l ? x.l[j] : x.c[j], c: x.c[j], v: x.v[j] }); } }
store = null;
if (T - W0 < 60) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + (T - W0) + ' sessions in the cache', agent: 'A' })); process.exit(0); }
// per day: the 100 most traded by dollar volume on the previous day; the paper's filters need avgVol14 and ATR14 from the 14 sessions before
const uni = {}, filt = {}, dayAvgOC = {};
for (let t = W0; t < T; t++) { const rows = []; for (const [s, m] of bars) { const p = m.get(t - 1); if (p && s !== 'SPY') rows.push([s, p.c * p.v]); } rows.sort((a, b) => b[1] - a[1]); uni[t] = rows.slice(0, TOPN).map(r => r[0]);
  const oc = []; for (const s of uni[t]) { const b = bars.get(s).get(t); if (b && b.o > 0) oc.push(b.c / b.o - 1); } dayAvgOC[t] = oc.length >= 30 ? mean(oc) : null;
  filt[t] = {}; for (const s of uni[t]) { const m = bars.get(s), b = m.get(t); if (!b) continue; let sv = 0, n = 0, tr = 0; for (let k = t - 14; k < t; k++) { const x = m.get(k), q = m.get(k - 1); if (!x) continue; n++; sv += x.v; tr += Math.max(x.h - x.l, q ? Math.abs(x.h - q.c) : 0, q ? Math.abs(x.l - q.c) : 0); }
    if (n < 14) continue; filt[t][s] = { ok: b.o > 5 && sv / 14 >= 1e6 && tr / 14 > 0.5, atr: tr / 14, open: b.o, oc: b.o > 0 ? b.c / b.o - 1 : null }; } }
const spy = bars.get('SPY'), spyOC = (t) => { const b = spy && spy.get(t); return b && b.o > 0 ? b.c / b.o - 1 : null; };
// ---- minute-bar cache: per stock-day the opening range, the first-5-minute volume, and the long trade at each fill delay
let mc = { _v: VER, d: {}, done: {} }; try { const x = JSON.parse(zlib.gunzipSync(fs.readFileSync(MC)).toString()); if (x._v === VER) mc = x; } catch (e) {}
let calls = 0, refused = null; const t0 = Date.now(), BUDGET = +(env.ORB_CALLS || 3000), MAXMS = +(env.ORB_MINUTES || 70) * 60000;
async function api(path) { if (!env.MASSIVE_KEY) return null; for (let a = 0; a < 3; a++) { if (calls) await sleep(150); calls++;
  let r; try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY)); } catch (e) { await sleep(3000); continue; }
  if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401 || r.status === 403) { refused = 'HTTP ' + r.status + ' from the minute-bar endpoint (plan limit?)'; return null; } if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
function tradeOf(reg, orH, atr) {   // reg = regular-session bars from 9:35; the stop order at the range high; the trade at each fill delay
  const k = reg.findIndex(b => b[2] > orH && b[0] <= 930); if (k < 0) return null; const last = reg[reg.length - 1], out = { m: reg[k][0] };
  for (const dl of DEL) { const i = k + dl; const b = reg[i]; if (!b || b[0] > 959) { out['d' + dl] = null; continue; } const e = dl === 0 ? Math.max(orH, b[1]) : b[1], stop = e - 0.10 * atr; let x = null;
    for (let j = i; j < reg.length; j++) { const z = reg[j]; if (j > i && z[1] <= stop) { x = z[1]; break; } if (z[3] <= stop) { x = stop; break; } } if (x === null) x = last[4];
    out['d' + dl] = [+e.toPrecision(6), +(x / e - 1).toFixed(4)]; }
  return out; }
// which stock-days are needed: universe days per stock plus the 14 sessions before each (for the relative-volume baseline)
const need = new Map(); for (let t = W0; t < T; t++) for (const s of uni[t]) { let a = need.get(s); if (!a) need.set(s, a = new Set()); for (let k = t - 14; k <= t; k++) if (k >= 0) a.add(k); }
const todo = [...need.entries()].map(([s, set]) => [s, [...set].filter(t => !(s + '|' + D[t] in mc.d) && !mc.done[s + '|' + D[t]]).sort((a, b) => a - b)]).filter(([, L]) => L.length).sort((a, b) => b[1].length - a[1].length);
const totalNeed = [...need.values()].reduce((a, s) => a + s.size, 0), haveBefore = totalNeed - todo.reduce((a, [, L]) => a + L.length, 0);
console.log('orb: ' + (T - W0) + ' sessions ' + D[W0] + ' to ' + D[T - 1] + ', ' + need.size + ' stocks, ' + totalNeed + ' stock-days needed, ' + haveBefore + ' cached');
let fetchedDays = 0;
for (const [s, L] of todo) { if (refused || calls >= BUDGET || Date.now() - t0 > MAXMS) break;
  // contiguous runs of needed sessions -> one paged request per run (up to ~60 sessions a request)
  const runs = []; for (const t of L) { const r = runs[runs.length - 1]; if (r && t - r[1] <= 3 && t - r[0] < 60) r[1] = t; else runs.push([t, t]); }
  for (const [a, b] of runs) { if (refused || calls >= BUDGET || Date.now() - t0 > MAXMS) break; let path = `/v2/aggs/ticker/${s}/range/1/minute/${D[a]}/${D[b]}?adjusted=true&sort=asc&limit=50000`, all = [], ok = true;
    while (path) { const j = await api(path); if (!j) { ok = false; break; } all = all.concat(j.results || []); path = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '').replace(/[?&]apiKey=[^&]*/, '') : null; }
    if (!ok) continue;
    const off = nyOffset(D[a]), byDay = {}; for (const r of all) { const d = new Date(r.t + off * 60000).toISOString().slice(0, 10); (byDay[d] = byDay[d] || []).push(r); }   // New York date of each bar
    for (let t = a; t <= b; t++) { const d = D[t], key = s + '|' + d, bb = toBars(byDay[d] || [], d), reg = bb.filter(x => x[0] >= 570 && x[0] <= 959), or = reg.filter(x => x[0] <= 574);
      mc.done[key] = 1; if (or.length < 3 || reg.length < 100) continue;
      const f = filt[t] && filt[t][s], rec = { v5: or.reduce((u, x) => u + x[5], 0), o5: or[0][1], c5: or[or.length - 1][4], h5: Math.max(...or.map(x => x[2])), l5: Math.min(...or.map(x => x[3])), oc: +(reg[reg.length - 1][4] / reg[0][1] - 1).toFixed(4) };
      if (f && rec.c5 > rec.o5) { const tr = tradeOf(reg.filter(x => x[0] >= 575), rec.h5, f.atr); if (tr) rec.tr = tr; }
      mc.d[key] = rec; fetchedDays++; } } }
fs.writeFileSync(MC, zlib.gzipSync(JSON.stringify(mc)));
const haveNow = [...need.entries()].reduce((a, [s, set]) => a + [...set].filter(t => (s + '|' + D[t] in mc.d) || mc.done[s + '|' + D[t]]).length, 0), complete = haveNow >= totalNeed || !!refused;
console.log('orb: fetched ' + fetchedDays + ' stock-days with ' + calls + ' calls; ' + haveNow + ' of ' + totalNeed + ' stock-days known' + (refused ? '; REFUSED: ' + refused : ''));
// ---- the signals (day by day, point in time), then the gates
const trades = [], perDay = {}; let eligible = 0, inPlay = 0, bullish = 0, noFill = 0, skippedRV = 0;
for (let t = W0; t < T; t++) { const d = D[t], rows = [];
  for (const s of uni[t]) { const f = filt[t] && filt[t][s]; if (!f || !f.ok) continue; const r = mc.d[s + '|' + d]; if (!r) continue; eligible++;
    const base = []; for (let k = t - 14; k < t; k++) { const q = mc.d[s + '|' + D[k]]; if (q) base.push(q.v5); } if (base.length < 10) { skippedRV++; continue; } const rv = r.v5 / mean(base); if (!(rv >= 1)) continue; inPlay++; rows.push({ s, rv, r, f }); }
  rows.sort((a, b) => b.rv - a.rv); const top = rows.slice(0, TOPRV);
  for (const x of top) { if (!(x.r.c5 > x.r.o5)) continue; bullish++; if (!x.r.tr || !x.r.tr.d0) { noFill++; continue; } const g = x.r.tr.d0[1]; if (!isFinite(g) || Math.abs(g) > 3) continue;
    trades.push({ t, d, s: x.s, rv: +x.rv.toFixed(2), e: x.r.tr.d0[0], g, m: x.r.tr.m, c: dayAvgOC[t], sp: spyOC(t), tr: x.r.tr }); (perDay[t] = perDay[t] || []).push(trades[trades.length - 1]); } }
// same stock open-to-close on its other days in the same half (daily cache, its days in the window)
const midT = Math.floor((W0 + T) / 2), ownC = {};
const own = (s, t) => { const half = t < midT ? 0 : 1, key = s + '_' + half; if (key in ownC) return ownC[key]; const m = bars.get(s), v = []; for (let k = half ? midT : W0; k < (half ? T : midT); k++) { const b = m.get(k); if (b && b.o > 0 && k !== t) v.push(b.c / b.o - 1); } return (ownC[key] = v.length >= 30 ? mean(v) : null); };
for (const z of trades) z.ob = own(z.s, z.t);
const LG = J('data/agent-league.json', {}), NV = 1, OWN_BAR = 2.4 + 0.1 * NV / 2, LEAGUE_BAR = typeof LG.bar === 'number' ? LG.bar : null, BAR = Math.max(OWN_BAR, LEAGUE_BAR || 0);
const tOfV = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || x === undefined || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
const stat = (a, cost) => { if (a.length < 20) return { n: a.length };
  const v = byDay(a, z => typeof z.c === 'number' ? z.g - cost - z.c : null), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - cost - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - cost - z.sp : null), p = a.map(z => z.g - cost).sort((x, y) => y - x), dsum = byDay(a, z => z.g - cost);
  return { n: a.length, days: dsum.length, stocks: new Set(a.map(z => z.s)).size, avg: r4(mean(p)), median: r4(p[Math.floor(p.length / 2)]), worstTrade: r4(p[p.length - 1]), worstDay: r4(Math.min(...dsum)), ctrl: r4(mean(a.map(z => z.c).filter(x => typeof x === 'number'))), edge: r4(mean(v)), t: tOfV(v), vsSpy: sv.length ? r4(mean(sv)) : null, tSpy: tOfV(sv), vsOwn: ov.length ? r4(mean(ov)) : null, tOwn: tOfV(ov), win: r4(p.filter(x => x > 0).length / p.length), noTop2: r4(mean(p.slice(2))) }; };
const older = trades.filter(z => z.t < midT), newer = trades.filter(z => z.t >= midT), R = { older: stat(older, COST), newer: stat(newer, COST), stress: stat(newer, STRESS), slip: stat(newer, SLIP), all: stat(trades, COST) }, why = [];
for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); continue; }
  if (!(r.edge > 0)) why.push('not better than the average universe stock open-to-close in the ' + hf + ' half (' + pc(r.edge) + ')');
  if (!(r.t >= BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', ' + BAR.toFixed(2) + ' needed)');
  if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half (' + pc(r.avg) + ')');
  if (!(r.vsSpy > 0)) why.push('did not beat the S&P 500 open-to-close in the ' + hf + ' half (' + pc(r.vsSpy) + ')');
  if (!(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock open-to-close on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')');
  if (!(r.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + hf + ' half'); }
if (R.stress.n >= 20 && !(R.stress.avg > 0)) why.push('loses at 1.2% costs'); if (R.slip.n >= 20 && !(R.slip.avg > 0)) why.push('loses with 0.1% extra slippage');
const verdict = !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PASSED' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED';
// latency table (fills delayed), busiest day, worst day
const lat = {}; for (const dl of DEL) { const v = trades.map(z => z.tr['d' + dl]).filter(Boolean).map(z => z[1] - COST); lat[dl + 'min'] = { n: v.length, mean: r4(mean(v)), median: v.length ? r4([...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]) : null, win: v.length ? r4(v.filter(x => x > 0).length / v.length) : null }; }
const busiest = Object.entries(perDay).sort((a, b) => b[1].length - a[1].length)[0];
const thisRun = { at: new Date().toISOString(), from: D[W0], to: D[T - 1], sessions: T - W0, complete, stockDaysKnown: haveNow, stockDaysNeeded: totalNeed, bar: +BAR.toFixed(2), verdict, why: why.join('; ') || 'beat the average universe stock, the S&P 500 and the same stock on its other days in both halves, beyond the luck bar, at stress cost and extra slippage, without its 2 best trades',
  trades: trades.length, days: Object.keys(perDay).length, stocks: new Set(trades.map(z => z.s)).size, counts: { eligibleStockDays: eligible, skippedNoRvBaseline: skippedRV, inPlay, bullishTop20: bullish, noFill }, results: R, latency: lat,
  busiestDay: busiest ? { day: D[+busiest[0]], trades: busiest[1].length, exposureUsd: busiest[1].length * 1000 } : null, worstDay: R.all.worstDay, worstTrade: R.all.worstTrade,
  topStocks: Object.entries(trades.reduce((o, z) => { o[z.s] = (o[z.s] || 0) + z.g - COST; return o; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, g]) => [s, r4(g)]) };
const status = refused && !trades.length ? 'needs data' : complete ? 'OK' : 'INCREMENTAL';
const firstRun = PREV.firstRun && PREV.firstRun.complete ? PREV.firstRun : (complete && !refused ? thisRun : null);
const out = { generatedAt: new Date().toISOString(), agent: 'A', library: 'A-ORB1', status, needsData: refused || null, preRegistered: '2026-10-21', versions: NV, ownBar: +OWN_BAR.toFixed(2), leagueBar: LEAGUE_BAR, bar: +BAR.toFixed(2), costs: { normal: COST, stress: STRESS, extraSlippage: SLIP }, universe: 'top ' + TOPN + ' by previous-day dollar volume, then open > 5 USD, 14-day average volume 1M+ shares, ATR14 > 0.50 USD, relative volume (first 5 minutes vs the previous 14 sessions) >= 1, top ' + TOPRV + ' by relative volume, bullish 5-minute range, long only',
  spec: 'see the header of orb-study.mjs: every element resolved from Zarattini, Barbon & Aziz (2024) before the first run', firstRun, latest: thisRun, calls, budget: BUDGET, caveat: 'A PASS goes to live paper first (execution decides intraday rules). Results per trade at 1,000 USD, not the paper’s 1%-risk sizing.' };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('ORB STUDY (' + status + '): ' + D[W0] + ' to ' + D[T - 1] + ', ' + trades.length + ' trades on ' + Object.keys(perDay).length + ' days, ' + thisRun.stocks + ' stocks | ' + verdict + (why.length ? ' (' + why[0] + ')' : '') + ' | older ' + (R.older.n || 0) + ' edge ' + pc(R.older.edge) + ' t ' + R.older.t + ' | newer ' + (R.newer.n || 0) + ' edge ' + pc(R.newer.edge) + ' t ' + R.newer.t + ', avg ' + pc(R.newer.avg) + ', vs S&P ' + pc(R.newer.vsSpy) + ', vs own ' + pc(R.newer.vsOwn) + ' | latency ' + DEL.map(d => d + 'min ' + pc(lat[d + 'min'].mean)).join(', '));
// library: the frozen first complete run; "tested: passed" only when the code says PASSED
try { const LB = J('data/strategy-library.json', null); if (LB) { const e = LB.strategies.find(x => x.id === 'A-ORB1'); if (e && !/^tested/.test(e.status || '')) { let ch = false;
  if (firstRun) { e.status = 'tested: ' + (firstRun.verdict === 'PASSED' ? 'passed' : firstRun.verdict.toLowerCase()); e.tested = firstRun.to; e.study = 'orb-study.mjs -> data/orb-study.json (run once, first complete run frozen)'; e.agent = 'A';
    e.result = { t: firstRun.results.newer.t, tOlder: firstRun.results.older.t, edge: firstRun.results.newer.edge, edgeOlder: firstRun.results.older.edge, avg: firstRun.results.newer.avg, vsSpy: firstRun.results.newer.vsSpy, vsOwn: firstRun.results.newer.vsOwn, n: [firstRun.results.older.n || 0, firstRun.results.newer.n || 0], days: firstRun.days, stocks: firstRun.stocks, bar: firstRun.bar, latency: Object.fromEntries(Object.entries(firstRun.latency).map(([k, v]) => [k, v.mean])), why: firstRun.why }; ch = true; }
  else if (refused) { e.status = 'needs data (Agent A): ' + refused; ch = true; } else { e.status = 'running (Agent A): ' + haveNow + ' of ' + totalNeed + ' stock-days of minute bars fetched; provisional ' + verdict; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } } catch (e) {}
