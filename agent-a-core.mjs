// AGENT A pure rules (23 Oct 2026; shared helper imported by agent-a-lab.mjs and its tests, not run by a workflow). Nothing here
// reads the network or the disk. Pre-registered in data/strategy-library.json BEFORE the first run: A-ROT1, A-ROT2, A-SWR1, A-E1W1.

// ---- 1. monthly hold-and-switch engine ----------------------------------------------------------------------------------------
// D = sorted session dates; open/close = { sym: array aligned to D } (total-return prices; NaN where missing).
// A month end = the last session of a calendar month that has a later session. Month k is held from the OPEN after month end k to
// the OPEN after month end k+1 (the decision uses closes up to month end k only). pick(k, E) -> { sym: weight } (the rest is cash,
// which earns 0: no interest). Cost = `side` per unit of weight bought or sold, against the weights as they drifted last month.
export function monthEnds(D) { const E = []; for (let i = 0; i + 1 < D.length; i++) if (D[i].slice(0, 7) !== D[i + 1].slice(0, 7)) E.push(i); return E; }
export function runRotation({ D, open, close, pick, side }) {
  const E = monthEnds(D), months = []; let prev = {};
  for (let k = 0; k + 1 < E.length; k++) { const s = E[k] + 1, e = E[k + 1] + 1; if (e >= D.length) break;
    const w = pick(k, E) || null; if (w === null) { prev = {}; continue; }
    let gross = 0, cost = 0; const ret = {};
    for (const [sym, x] of Object.entries(w)) { const a = open[sym] && open[sym][s], b = open[sym] && open[sym][e]; ret[sym] = a > 0 && b > 0 ? b / a - 1 : 0; gross += x * ret[sym]; }
    for (const sym of new Set([...Object.keys(w), ...Object.keys(prev)])) cost += side * Math.abs((w[sym] || 0) - (prev[sym] || 0));
    const growth = 1 + gross, drift = {}; for (const [sym, x] of Object.entries(w)) drift[sym] = growth > 0 ? x * (1 + ret[sym]) / growth : 0;
    prev = drift; months.push({ k, from: D[s], to: D[e], w, gross, cost, net: gross - cost }); }
  return { months };
}

// ---- 2. the pre-registered pickers ----------------------------------------------------------------------------------------------
// A-ROT1: each month hold the 3 funds with the best 6-month return ('6m': month end k vs month end k-6) or the 12-1 month return
// ('12-1': month end k-1 vs month end k-12), equal weights. A rotation needs a choice: fewer than 4 eligible funds -> null (not run).
export const ROT1_TOP = 3, ROT1_MIN = 4;
export function rot1Pick({ k, E, close, open, look }) {
  const [a, b] = look === '12-1' ? [k - 12, k - 1] : [k - 6, k]; if (a < 0) return null;
  const sc = []; for (const sym of Object.keys(close)) { const c = close[sym], x = c[E[a]], y = c[E[b]], o = open[sym] && open[sym][E[k] + 1];
    if (x > 0 && y > 0 && c[E[k]] > 0 && o > 0) sc.push([sym, y / x - 1]); }
  if (sc.length < ROT1_MIN) return null;
  sc.sort((p, q) => q[1] - p[1]); return Object.fromEntries(sc.slice(0, ROT1_TOP).map(([s]) => [s, 1 / ROT1_TOP]));
}
// A-ROT2 (Faber-style): hold the fund when its month-end close is above the average of its last 10 month-end closes (this one
// included); otherwise the gold fund when gold is above its own 10-month average; otherwise cash. Under 10 month ends of the fund -> null.
const above10 = (c, E, k) => { if (k < 9 || !c) return null; let s = 0; for (let j = k - 9; j <= k; j++) { const z = c[E[j]]; if (!(z > 0)) return null; s += z; } return c[E[k]] > s / 10; };
export function rot2Pick({ k, E, close, fund, gold }) {
  const f = above10(close[fund], E, k); if (f === null) return null; if (f) return { [fund]: 1 };
  return above10(close[gold], E, k) ? { [gold]: 1 } : {};
}

// ---- 3. monthly statistics and the tier verdict ---------------------------------------------------------------------------------
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const tStat = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
export function monthlyStats(r) { if (!r.length) return { n: 0 }; let eq = 1, peak = 1, dd = 0;
  for (const x of r) { eq *= 1 + x; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  return { n: r.length, cagr: eq > 0 ? eq ** (12 / r.length) - 1 : -1, maxDD: dd, win: r.filter(x => x > 0).length / r.length, avg: mean(r), total: eq - 1 }; }
// rows: one per month in time order { net (0.8% cost), netStress (1.2% cost), yard: { name: that month's return of the yardstick }, own:
// the same funds held equally that month (null when the yardstick IS the same fund) }. Halves by month count. Each month is one block.
// TRADABLE SMALL = 20+ months a half, and in BOTH halves: positive at 0.8% and 1.2% cost, ahead of EVERY yardstick with t >= 2.5,
// ahead of the same funds held equally, still ahead of the first yardstick without its 2 best months. PROVEN = the same with every t >= bar.
export const TIER2_T = 2.5, MIN_MONTHS = 20;
function half(rs) { const ex = (f) => rs.map(f).filter(x => x !== null && isFinite(x)), names = Object.keys((rs[0] && rs[0].yard) || {}), vs = {};
  for (const y of names) { const v = ex(r => typeof r.yard[y] === 'number' ? r.net - r.yard[y] : null); vs[y] = { n: v.length, mean: r4(mean(v)), t: tStat(v) }; }
  const p = names[0] ? ex(r => typeof r.yard[names[0]] === 'number' ? r.net - r.yard[names[0]] : null).sort((a, b) => b - a) : [], ov = ex(r => typeof r.own === 'number' ? r.net - r.own : null);
  return { n: rs.length, from: rs[0] && rs[0].from, to: rs.length ? rs[rs.length - 1].to : null, avg: r4(mean(rs.map(r => r.net))), avgStress: r4(mean(rs.map(r => r.netStress))), vs, vsOwn: ov.length ? r4(mean(ov)) : null, tOwn: tStat(ov), noTop2: p.length > 2 ? r4(mean(p.slice(2))) : null,
    ...Object.fromEntries(Object.entries(monthlyStats(rs.map(r => r.net))).map(([k, v]) => [k, r4(v)])) }; }
export function judgeMonthly(rows, bar) {
  const m = Math.floor(rows.length / 2), R = { older: half(rows.slice(0, m)), newer: half(rows.slice(m)) }, H = [['older', R.older], ['newer', R.newer]], why = [];
  if (!H.every(([, r]) => r.n >= MIN_MONTHS)) return { verdict: 'TOO FEW MONTHS', why: 'fewer than ' + MIN_MONTHS + ' months in a half (' + H.map(([, r]) => r.n).join(' / ') + ')', results: R };
  for (const [hf, r] of H) {
    if (!(r.avg > 0)) why.push('lost money after 0.8% costs in the ' + hf + ' half');
    if (!(r.avgStress > 0)) why.push('lost money after 1.2% costs in the ' + hf + ' half');
    for (const [y, v] of Object.entries(r.vs)) { if (!(v.mean > 0)) why.push('behind ' + y + ' in the ' + hf + ' half (' + (v.mean * 100).toFixed(2) + '% a month)'); else if (!(v.t >= TIER2_T)) why.push('ahead of ' + y + ' in the ' + hf + ' half but t ' + v.t + ' under ' + TIER2_T); }
    if (r.vsOwn !== null && !(r.vsOwn > 0)) why.push('not better than the same funds held equally in the ' + hf + ' half');
    if (!(r.noTop2 > 0)) why.push('not ahead without its 2 best months in the ' + hf + ' half'); }
  if (!why.length) { const ts = H.flatMap(([, r]) => Object.values(r.vs).map(v => v.t)); return ts.every(t => t >= bar) ? { verdict: 'PROVEN', why: 'every gate passed in both halves and t clears the proof bar ' + bar, results: R } : { verdict: 'TRADABLE SMALL', why: 'every gate passed in both halves with t >= ' + TIER2_T + ' (lowest ' + Math.min(...ts) + '), below the proof bar ' + bar, results: R }; }
  const first = Object.keys(R.older.vs)[0], behind = first && !(R.older.vs[first].mean > 0) && !(R.newer.vs[first].mean > 0);
  return { verdict: behind ? 'REJECTED' : 'NOT PROVEN', why: why.join('; '), results: R };
}

// ---- 4. A-SWR1: one sell-high / buy-back switch against simply holding ---------------------------------------------------------
// Same mechanics as rebuy.mjs (STRETCH or SPIKE at the close of t; sell at the open of t+1; a limit buy 10% under the sale price from
// t+2 to t+H, filled at the open if it opens below, else at the limit if the low reaches it; not filled -> bought back at the close
// of t+H, which is the live rule's "buy it back at the market that day"). o, c, lo: one stock's arrays aligned to the sessions.
// ratioAdv = rebuy.mjs's measure (switcher's value / holder's value - 1 on day H). usdAdv = the difference in USD per USD sold,
// what the owner's account shows: (switcher - holder) / sale value. never: the owner never buys back (cash, one side of cost).
export function switchCase({ o, c, lo, t, H = 60, side, never = false }) {
  const sp = o[t + 1], end = c[t + H]; if (!(sp > 0) || !(end > 0)) return null;
  let px = null, when = null; const lim = sp * 0.9;
  for (let k = t + 2; k <= t + H && px === null; k++) { if (!(c[k] > 0)) continue; if (o[k] > 0 && o[k] <= lim) { px = o[k]; when = k; } else if (lo[k] <= lim) { px = lim; when = k; } }
  const back = px !== null, keep = (1 - side) ** 2;
  if (!back && never) return { back, days: null, ratioAdv: (1 - side) * sp / end - 1, usdAdv: (1 - side) - end / sp, hold: end / sp - 1 };
  if (!back) { px = end; when = t + H; }
  return { back, days: when - t, ratioAdv: keep * sp / px - 1, usdAdv: (keep * sp / px - 1) * end / sp, hold: end / sp - 1 };
}
// cases [{ t, s, usd (0.8%), usdS (1.2%), own (the same stock switched the same way on its non-trigger days, mean usd; null if
// unknown), back }]; mid = first session of the newer half. Blocks of 20 sessions (about a month), as rebuy.mjs. 40+ cases a half.
export const SW_BLOCK = 20, SW_MIN = 40;
const blockT = (a, f) => { const by = new Map(); for (const x of a) { const k = Math.floor(x.t / SW_BLOCK); (by.get(k) || by.set(k, []).get(k)).push(x[f]); } return { blocks: by.size, t: tStat([...by.values()].map(mean)) }; };
function swHalf(a) { if (!a.length) return { n: 0 }; const u = a.map(x => x.usd), srt = [...u].sort((x, y) => y - x), B = blockT(a, 'usd'), BS = blockT(a, 'usdS'), ov = a.filter(x => typeof x.own === 'number').map(x => x.usd - x.own), nb = a.filter(x => !x.back);
  return { n: a.length, stocks: new Set(a.map(x => x.s)).size, avg: r4(mean(u)), avgStress: r4(mean(a.map(x => x.usdS))), better: r4(u.filter(x => x > 0).length / u.length), blocks: B.blocks, tBlock: B.t, tBlockStress: BS.t,
    vsOwn: ov.length ? r4(mean(ov)) : null, ownCovered: ov.length, noTop2: srt.length > 2 ? r4(mean(srt.slice(2))) : null, cameBack: r4((a.length - nb.length) / a.length),
    avgBack: r4(mean(a.filter(x => x.back).map(x => x.usd))), avgNotBack: r4(mean(nb.map(x => x.usd))), worst: r4(Math.min(...u)) }; }
export function switchVerdict(cases, mid, bar) {
  const R = { older: swHalf(cases.filter(x => x.t < mid)), newer: swHalf(cases.filter(x => x.t >= mid)) }, H = [['older', R.older], ['newer', R.newer]], why = [];
  if (!H.every(([, r]) => r.n >= SW_MIN)) return { verdict: 'TOO FEW CASES', why: 'fewer than ' + SW_MIN + ' switches in a half', results: R };
  for (const [hf, r] of H) { const pc = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
    if (!(r.avg > 0)) why.push('holding did better in the ' + hf + ' half (' + pc(r.avg) + ' per switch in USD)');
    if (!(r.avgStress > 0)) why.push('holding did better at 1.2% cost in the ' + hf + ' half (' + pc(r.avgStress) + ')');
    if (r.avg > 0 && !(r.tBlock >= TIER2_T)) why.push('ahead in the ' + hf + ' half but month by month t ' + r.tBlock + ' under ' + TIER2_T);
    if (r.avgStress > 0 && !(r.tBlockStress >= TIER2_T)) why.push('ahead at 1.2% cost in the ' + hf + ' half but month by month t ' + r.tBlockStress + ' under ' + TIER2_T);
    if (!(r.vsOwn > 0)) why.push('not better than switching the same stocks on their other days in the ' + hf + ' half (' + (r.vsOwn === null ? 'n/a' : pc(r.vsOwn)) + ')');
    if (!(r.noTop2 > 0)) why.push('not ahead without its 2 best switches in the ' + hf + ' half'); }
  if (!why.length) { const ts = H.flatMap(([, r]) => [r.tBlock, r.tBlockStress]); return ts.every(t => t >= bar) ? { verdict: 'PROVEN', why: 'every gate passed in both halves and the month-by-month t clears the proof bar ' + bar, results: R } : { verdict: 'TRADABLE SMALL', why: 'every gate passed in both halves, month-by-month t >= ' + TIER2_T + ' (lowest ' + Math.min(...ts) + '), below the proof bar ' + bar, results: R }; }
  return { verdict: !(R.older.avg > 0) && !(R.newer.avg > 0) ? 'HOLDING WINS' : 'NOT PROVEN', why: why.join('; '), results: R };
}

// ---- 5. A-E1W1: Nasdaq earnings calendar row -> the E1 study's report format { d, t: 'bmo'|'amc'|null, a: actual EPS, e: estimate }
const usd = (s) => { const x = String(s || '').trim(); if (!x || x === 'N/A') return NaN; const neg = /^\(.*\)$/.test(x) || /^-/.test(x); const v = +x.replace(/[()$,\s-]/g, ''); return x.replace(/[()$,\s-]/g, '') === '' ? NaN : neg ? -v : v; };
export function nasdaqReport(row, date) {
  const sym = String(row && row.symbol || '').trim(); if (!/^[A-Z]{1,5}$/.test(sym)) return null;
  const a = usd(row.eps), e = usd(row.epsForecast); if (!isFinite(a) || !isFinite(e)) return null;
  return { sym, d: date, t: row.time === 'time-pre-market' ? 'bmo' : row.time === 'time-after-hours' ? 'amc' : null, a, e };
}
