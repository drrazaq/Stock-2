// DISCOVERY ENGINE v2, pure rules (shared helper; imported by discovery2.mjs and its tests, not run by a workflow).
// Owner, 23 Oct 2026: "I want the system to come up with new paths by itself". The engine learns WHAT PRECEDED the big moves from the
// older half of the 5-year cache only, freezes the best feature combinations as rules, then tests each rule ONCE on the newer half.
// Nothing here reads the network or the disk.

// ---- the ~65 features, each known at the close of the signal session (point in time). Order = index in a feature vector. ----------
// kind: num (thresholds from the older-half quantiles), count (>= 1, >= 2, = 0), flag (1 / 0). unit: pct shows as a percent.
export const FEATURES = [
  // price and volume shape
  { k: 'r1', text: '1-day return', kind: 'num', unit: 'pct' }, { k: 'r5', text: '5-day return', kind: 'num', unit: 'pct' },
  { k: 'r20', text: '20-day return', kind: 'num', unit: 'pct' }, { k: 'r60', text: '60-day return', kind: 'num', unit: 'pct' },
  { k: 'r120', text: '120-day return', kind: 'num', unit: 'pct' }, { k: 'sma20', text: 'close vs its 20-day average', kind: 'num', unit: 'pct' },
  { k: 'sma50', text: 'close vs its 50-day average', kind: 'num', unit: 'pct' }, { k: 'sma200', text: 'close vs its 200-day average', kind: 'num', unit: 'pct' },
  { k: 's50v200', text: '50-day average vs 200-day average', kind: 'num', unit: 'pct' }, { k: 'hi52', text: 'distance from the 52-week high close', kind: 'num', unit: 'pct' },
  { k: 'lo52', text: 'distance above the 52-week low close', kind: 'num', unit: 'pct' }, { k: 'hi20', text: 'distance from the 20-day high close', kind: 'num', unit: 'pct' },
  { k: 'rng20', text: '20-day close range (high minus low, over the close)', kind: 'num', unit: 'pct' }, { k: 'volC', text: 'volatility contraction (10-day vs 60-day daily-move size)', kind: 'num', unit: 'x' },
  { k: 'vol20', text: '20-day volatility (daily-move size)', kind: 'num', unit: 'pct' }, { k: 'atrC', text: 'range contraction (10-day vs 60-day average high-low range)', kind: 'num', unit: 'x' },
  { k: 'vDry', text: 'volume dry-up (last 10 sessions vs 50-day average volume)', kind: 'num', unit: 'x' }, { k: 'vNow', text: 'signal-day volume vs its 50-day average', kind: 'num', unit: 'x' },
  { k: 'v3', text: 'last 3 sessions\' volume vs its 50-day average', kind: 'num', unit: 'x' }, { k: 'vTrend', text: '20-day vs 60-day average volume', kind: 'num', unit: 'x' },
  { k: 'upVol', text: 'share of 20-day volume traded on up days', kind: 'num', unit: 'x' }, { k: 'dv20', text: 'daily dollar volume (log10 USD, 20-day average)', kind: 'num', unit: 'x' },
  { k: 'px', text: 'price (log10 USD)', kind: 'num', unit: 'x' }, { k: 'rsM20', text: '20-day return minus the S&P 500\'s', kind: 'num', unit: 'pct' },
  { k: 'rsM60', text: '60-day return minus the S&P 500\'s', kind: 'num', unit: 'pct' }, { k: 'rsPct', text: '60-day return percentile among all tradable stocks (0-1)', kind: 'num', unit: 'x' },
  { k: 'rsInd', text: '20-day return minus its industry\'s median (same 2-digit SEC industry)', kind: 'num', unit: 'pct' },
  { k: 'gapUp60', text: 'opening gaps up of 5%+ in the last 60 sessions', kind: 'count', unit: 'n' }, { k: 'gapDn60', text: 'opening gaps down of 5%+ in the last 60 sessions', kind: 'count', unit: 'n' },
  { k: 'gap', text: 'signal-day opening gap', kind: 'num', unit: 'pct' }, { k: 'upD20', text: 'share of up closes in the last 20 sessions', kind: 'num', unit: 'x' },
  { k: 'clv', text: 'close position in the signal day\'s range (0 = low, 1 = high)', kind: 'num', unit: 'x' }, { k: 'streak', text: 'consecutive up closes', kind: 'count', unit: 'n' },
  { k: 'bigUp', text: 'largest 1-day gain in the last 20 sessions', kind: 'num', unit: 'pct' }, { k: 'bigDn', text: 'largest 1-day loss in the last 20 sessions', kind: 'num', unit: 'pct' },
  { k: 'age', text: 'sessions in the price cache (capped at 252)', kind: 'num', unit: 'x' }, { k: 'spy200', text: 'S&P 500 above its 200-day average', kind: 'flag', unit: 'n' },
  { k: 'spyR20', text: 'S&P 500 20-day return', kind: 'num', unit: 'pct' },
  // company events in the prior 60 sessions (SEC EDGAR via the ev-cache; New York session by sec-time.mjs)
  { k: 'eAll', text: 'company filings (8-K items, 13D, 424B) in the last 60 sessions', kind: 'count', unit: 'n' }, { k: 'eCon', text: '8-K 1.01 material agreements in 60 sessions', kind: 'count', unit: 'n' },
  { k: 'eAcq', text: '8-K 2.01 completed acquisitions in 60 sessions', kind: 'count', unit: 'n' }, { k: 'eEarn', text: '8-K 2.02 results releases in 60 sessions', kind: 'count', unit: 'n' },
  { k: 'eMgmt', text: '8-K 5.02 management changes in 60 sessions', kind: 'count', unit: 'n' }, { k: 'eNews', text: '8-K 7.01/8.01 company news in 60 sessions', kind: 'count', unit: 'n' },
  { k: 'eDil', text: '8-K 3.02 private share sales in 60 sessions', kind: 'count', unit: 'n' }, { k: 'eDel', text: '8-K 3.01 listing-rule notices in 60 sessions', kind: 'count', unit: 'n' },
  { k: 'eRes', text: '8-K 2.05/2.06 restructuring or write-downs in 60 sessions', kind: 'count', unit: 'n' }, { k: 'eAct', text: 'Schedule 13D activist stakes in 60 sessions', kind: 'count', unit: 'n' },
  { k: 'eFda', text: 'FDA approvals in 60 sessions', kind: 'count', unit: 'n' }, { k: 'eNeg', text: 'warning filings (8-K 1.02, 4.01, 4.02) in 60 sessions', kind: 'count', unit: 'n' },
  // earnings surprise sequence (data/earnings-cache.json.gz)
  { k: 'surp', text: 'last earnings surprise ((actual - estimate) / |estimate|)', kind: 'num', unit: 'pct' }, { k: 'beats4', text: 'earnings beats in the last 4 reports', kind: 'count', unit: 'n' },
  { k: 'sinceE', text: 'sessions since the last earnings report', kind: 'num', unit: 'x' },
  // insiders, chains, share supply, quality, traders
  { k: 'ins60', text: 'insider open-market purchase filings in 60 sessions', kind: 'count', unit: 'n' }, { k: 'insW', text: 'distinct insiders buying in 60 sessions', kind: 'count', unit: 'n' },
  { k: 'chain', text: 'member of a value-chain layer (point in time)', kind: 'flag', unit: 'n' }, { k: 'chainHot', text: 'in one of the 3 hottest chain layers that day', kind: 'flag', unit: 'n' },
  { k: 'chainEx', text: 'its best chain layer\'s 3-month return minus the S&P 500\'s', kind: 'num', unit: 'pct' },
  { k: 'off60', text: 'offering prospectuses (424B4/424B5) in 60 sessions', kind: 'count', unit: 'n' }, { k: 'shelf60', text: 'registrations (S-1, S-3) in 60 sessions', kind: 'count', unit: 'n' },
  { k: 's8', text: 'employee-plan registrations (S-8) in 60 sessions', kind: 'count', unit: 'n' }, { k: 'shChg', text: 'share count change over 90 days (known with the 30-day lag)', kind: 'num', unit: 'pct' },
  { k: 'fscore', text: 'Piotroski F-score (0-9, latest public 10-K year)', kind: 'num', unit: 'x' },
  { k: 'fol10', text: 'bullish mentions by tracked traders (FOLLOW/WATCH) in 10 sessions', kind: 'count', unit: 'n' }, { k: 'fol60', text: 'bullish mentions by tracked traders (FOLLOW/WATCH) in 60 sessions', kind: 'count', unit: 'n' },
];
export const FIDX = Object.fromEntries(FEATURES.map((f, j) => [f.k, j]));
export const COST = 0.008, STRESS = 0.012, STOP = 0.15, MIN_N = 20, TIER2_T = 2.5, SPLIT = '2024-01-01';
export const RUNNERS = { R10: { h: 10, rise: 0.25, text: 'rose 25%+ over the next 10 sessions' }, R60: { h: 60, rise: 0.5, text: 'rose 50%+ over the next 60 sessions' } };

const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
export const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };

// ---- luck bar: inverse normal (Acklam), one-sided; m = rules tested in all so far ------------------------------------------------
export function zInv(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00], lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
export const luckBar = (m) => +Math.max(TIER2_T, zInv(1 - 0.05 / Math.max(1, m))).toFixed(2);

// ---- one trade: buy the open of t+1, hold h sessions (sell the close of t+h), stop under the buy (a gap through it fills at that open)
// O, L, C: flat arrays; b = the stock's offset; T = sessions per stock (defaults to the array length, for one-stock arrays)
export function holdReturn(O, L, C, b, t, h, stop, T = O.length - b) {
  if (t + h >= T) return null; const e = O[b + t + 1]; if (!(e > 0)) return null; const sp = e * (1 - stop); let last = null;
  for (let k = t + 1; k <= t + h; k++) { const o = O[b + k], l = L[b + k], c = C[b + k];
    if (k > t + 1 && o > 0 && o <= sp) return o / e - 1;
    if (l > 0 && l <= sp) return sp / e - 1;
    if (c > 0) last = c; }
  return last === null ? null : last / e - 1;
}

// ---- the tier-2 standard on the newer half only. trades: { t, s, g (gross), c (average stock, same day, same exit), ob (same stock other days), h }
export function newerStat(a) {
  if (!a.length) return { n: 0 };
  const byDay = (f) => { const o = new Map(); for (const z of a) { const x = f(z); if (x === null || x === undefined || !isFinite(x)) continue; (o.get(z.t) || o.set(z.t, []).get(z.t)).push(x); } return [...o.values()].map(mean); };
  const byBlock = (f) => { const o = new Map(); for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; const k = Math.floor(z.t / (z.h || 10)); (o.get(k) || o.set(k, []).get(k)).push(x); } return [...o.values()].map(mean); };
  const net = a.map(z => z.g - COST), sorted = [...net].sort((x, y) => y - x), ev = byDay(z => z.g - COST - z.c), blk = byBlock(z => z.g - COST - z.c), ov = byDay(z => typeof z.ob === 'number' ? z.g - z.ob : null);
  return { n: a.length, days: ev.length, stocks: new Set(a.map(z => z.s)).size, win: r4(net.filter(x => x > 0).length / net.length), avg: r4(mean(net)), avgStress: r4(mean(a.map(z => z.g - STRESS))),
    at04: r4(mean(a.map(z => z.g - 0.004))), at02: r4(mean(a.map(z => z.g - 0.002))), median: r4(median(net)), best: r4(sorted[0]), worst: r4(sorted[sorted.length - 1]),
    ctrl: r4(mean(a.map(z => z.c))), edge: r4(mean(ev)), t: tOf(ev), blocks: blk.length, tBlock: blk.length >= 3 ? tOf(blk) : null,
    vsOwn: ov.length ? r4(mean(ov)) : null, tOwn: tOf(ov), noTop2: r4(mean(sorted.slice(2))), stops: r4(a.filter(z => z.stopped).length / a.length) };
}
export function judgeNewer(trades, bar) {
  const s = newerStat(trades || []);
  if (!(s.n >= MIN_N)) return { verdict: 'TOO FEW CASES', why: 'fewer than ' + MIN_N + ' trades in the newer half (' + (s.n || 0) + ')', stat: s };
  const why = [];
  if (!(s.avg > 0)) why.push('lost money after 0.8% costs');
  if (!(s.avgStress > 0)) why.push('lost money after 1.2% costs');
  if (!(s.edge > 0)) why.push('not better than the average stock bought the same day');
  if (!(s.vsOwn > 0)) why.push('not better than the same stock on its other days');
  if (!(s.noTop2 > 0)) why.push('loses without its 2 best trades');
  if (!(s.t >= bar)) why.push('day t ' + s.t + ' under the luck bar ' + bar);
  if (!(s.tBlock >= bar)) why.push('block t ' + s.tBlock + ' under the luck bar ' + bar);
  if (!why.length) return { verdict: 'TRADABLE SMALL', why: 'every tier-2 gate passed on the newer half with day and block t >= ' + bar + ' (luck bar for the rules tested so far)', stat: s };
  return { verdict: s.edge > 0 ? 'NOT PROVEN' : 'REJECTED', why: why.join('; '), stat: s };
}

// ---- discovery (older half only): conditions, lift, non-redundant combinations ------------------------------------------------------
const sig4 = (x) => +(+x).toPrecision(4);
const quant = (s, q) => s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
export function makeConds(all) {
  const out = [];
  FEATURES.forEach((F, j) => { const v = []; for (const x of all) if (isFinite(x[j])) v.push(x[j]); if (v.length < 50) return; v.sort((a, b) => a - b);
    const add = (op, x) => { x = sig4(x); if (!out.some(c => c.f === F.k && c.op === op && c.x === x)) out.push({ f: F.k, op, x }); };
    if (F.kind === 'flag') { add('>=', 1); add('<=', 0); return; }
    if (F.kind === 'count') { add('>=', 1); add('>=', 2); add('<=', 0); return; }
    add('<=', quant(v, 0.1)); add('<=', quant(v, 0.2)); add('>=', quant(v, 0.8)); add('>=', quant(v, 0.9)); });
  return out;
}
// a small tolerance: feature vectors are stored as 32-bit floats, thresholds are 4-digit decimals (0.9 stored is 0.89999998)
const condTrue = (c, v) => { const x = v[FIDX[c.f]], e = 1e-6 * Math.max(1, Math.abs(c.x)); return isFinite(x) && (c.op === '>=' ? x >= c.x - e : x <= c.x + e); };
export const ruleFires = (r, v) => r.conds.every(c => condTrue(c, v));
function score(aR, nR, aC, nC) { if (!(nR > 0 && nC > 0)) return null; const pR = (aR + 0.5) / (nR + 1), pC = (aC + 0.5) / (nC + 1), l = Math.log(pR / pC), se = Math.sqrt(1 / (aR + 0.5) - 1 / (nR + 1) + 1 / (aC + 0.5) - 1 / (nC + 1));
  return { lift: r4(pR / pC), liftLow: r4(Math.exp(l - 1.96 * se)), runnersWith: aR, runnersKnown: nR, shareRunners: r4(aR / nR), controlsWith: aC, controlsKnown: nC, shareControls: r4(aC / nC) }; }
// defs: { R10: { runners: [vec], controls: [vec], h } }; -> { conds, coverage, singles, rules (top), pool (ranked, non-redundant) }
export function discover(defs, { top = 10, pool = 100, minRunners = 40, minCoverage = 0.2, k2 = 40, k3 = 20 } = {}) {
  const all = []; for (const d of Object.values(defs)) all.push(...d.runners, ...d.controls);
  const conds = makeConds(all), cand = [], coverage = {}, singlesOut = {};
  for (const [def, d] of Object.entries(defs)) { const R = d.runners, C = d.controls, nR = R.length, nC = C.length;
    const avR = FEATURES.map((_, j) => { const u = new Uint8Array(nR); for (let q = 0; q < nR; q++) u[q] = isFinite(R[q][j]) ? 1 : 0; return u; });
    const avC = FEATURES.map((_, j) => { const u = new Uint8Array(nC); for (let q = 0; q < nC; q++) u[q] = isFinite(C[q][j]) ? 1 : 0; return u; });
    coverage[def] = Object.fromEntries(FEATURES.map((F, j) => [F.k, r4(avR[j].reduce((a, b) => a + b, 0) / Math.max(1, nR))]));
    const usable = conds.filter(c => coverage[def][c.f] >= minCoverage);
    const bits = usable.map(c => { const j = FIDX[c.f], tr = new Uint8Array(nR), tc = new Uint8Array(nC); for (let q = 0; q < nR; q++) tr[q] = condTrue(c, R[q]) ? 1 : 0; for (let q = 0; q < nC; q++) tc[q] = condTrue(c, C[q]) ? 1 : 0; return { c, j, tr, tc }; });
    const evalSet = (S) => { let aR = 0, kR = 0, aC = 0, kC = 0;
      for (let q = 0; q < nR; q++) { let av = 1, on = 1; for (const B of S) { if (!avR[B.j][q]) { av = 0; break; } if (!B.tr[q]) on = 0; } if (av) { kR++; aR += on; } }
      for (let q = 0; q < nC; q++) { let av = 1, on = 1; for (const B of S) { if (!avC[B.j][q]) { av = 0; break; } if (!B.tc[q]) on = 0; } if (av) { kC++; aC += on; } }
      return score(aR, kR, aC, kC); };
    const singles = []; for (const B of bits) { const s = evalSet([B]); if (s && s.runnersWith >= minRunners && s.liftLow > 1) singles.push({ B, s }); }
    singles.sort((x, y) => y.s.liftLow - x.s.liftLow);
    singlesOut[def] = singles.slice(0, 30).map(x => ({ cond: x.B.c, ...x.s }));
    const push = (S, s) => { if (s && s.runnersWith >= minRunners && s.liftLow > 1) cand.push({ def, hold: d.h, conds: S.map(B => B.c), ...s }); };
    for (const x of singles) push([x.B], x.s);
    const S2 = singles.slice(0, k2), S3 = singles.slice(0, k3);
    for (let a = 0; a < S2.length; a++) for (let b = a + 1; b < S2.length; b++) { if (S2[a].B.j === S2[b].B.j) continue; push([S2[a].B, S2[b].B], evalSet([S2[a].B, S2[b].B])); }
    for (let a = 0; a < S3.length; a++) for (let b = a + 1; b < S3.length; b++) for (let c = b + 1; c < S3.length; c++) { const S = [S3[a].B, S3[b].B, S3[c].B]; if (new Set(S.map(x => x.j)).size < 3) continue; push(S, evalSet(S)); } }
  cand.sort((x, y) => y.liftLow - x.liftLow || y.runnersWith - x.runnersWith);
  // non-redundant within a runner definition: the same feature in the same direction counts as the same idea whatever its threshold, so
  // a combination that contains (or is contained in) an already picked idea is skipped and the 10 slots hold 10 different ideas
  const key = (c) => c.f + c.op, picked = [];
  // and one idea may appear in at most 3 rules of every 10 (so one strong feature cannot fill a whole batch with its pairs)
  const uses = new Map();
  for (const c of cand) { if (picked.length >= pool) break; const K = new Set(c.conds.map(key));
    if (picked.some(p => p.def === c.def && (p.conds.every(x => K.has(key(x))) || c.conds.every(x => p.conds.some(y => key(y) === key(x)))))) continue;
    const cap = 3 * (Math.floor(picked.length / 10) + 1); if ([...K].some(k => (uses.get(k) || 0) >= cap)) continue;
    for (const k of K) uses.set(k, (uses.get(k) || 0) + 1);
    picked.push({ ...c, stop: STOP, entry: 'next open after the signal close', hold: c.hold }); }
  return { conds, coverage, singles: singlesOut, candidates: cand.length, rules: picked.slice(0, top), pool: picked };
}
const fmt = (c) => { const F = FEATURES[FIDX[c.f]]; if (F.kind === 'flag') return (c.op === '>=' ? '' : 'NOT ') + F.text; if (F.kind === 'count') return F.text + (c.op === '>=' ? ': ' + c.x + ' or more' : ': none');
  return F.text + (c.op === '>=' ? ' at or above ' : ' at or below ') + (F.unit === 'pct' ? (c.x * 100).toFixed(1) + '%' : String(c.x)); };
export const condText = fmt;
export const ruleText = (r) => 'Signal at the close when ' + r.conds.map(fmt).join(' AND ') + '. Buy the next open, hold ' + r.hold + ' sessions, stop 15% under the buy. Learned from runners that ' + (RUNNERS[r.def] || {}).text + ' (2021-2023 only): ' + Math.round((r.shareRunners || 0) * 100) + '% of runners vs ' + Math.round((r.shareControls || 0) * 100) + '% of look-alikes (lift ' + r.lift + ', lower 95% bound ' + r.liftLow + ').';

// ---- weekly batches: only untested pool entries; the luck bar uses every rule tested so far -------------------------------------------
export function nextBatch(pool, testedIds, size = 10) {
  const done = new Set(testedIds || []), ids = (pool || []).filter(x => !done.has(x.id)).slice(0, size).map(x => x.id); if (!ids.length) return null;
  const testedTotal = done.size + ids.length; return { ids, testedTotal, bar: luckBar(testedTotal) };
}

// ---- cost reality: the same trades at 0.8% (1,000 USD, 3 USD fees each way + spread), 0.4% (5,000 USD), 0.2% (zero commission, spread only)
// row: { source, rule, gross: [per-trade gross] } or { source, rule, avgGross, n } (a stored average: exact for the mean); optional edgeGross
export const COST_LEVELS = { at08: 0.008, at04: 0.004, at02: 0.002 };
export function costReality(rows) {
  return (rows || []).map(r => { const per = Array.isArray(r.gross), g = per ? mean(r.gross) : r.avgGross, n = per ? r.gross.length : r.n; if (g === null || g === undefined || !isFinite(g)) return null;
    const o = { source: r.source, rule: r.rule, name: r.name || null, verdict: r.verdict || null, n, method: per ? 'per trade' : 'stored average' };
    for (const [k, c] of Object.entries(COST_LEVELS)) o[k] = r4(g - c);
    if (per) for (const [k, c] of Object.entries(COST_LEVELS)) o['win' + k.slice(2)] = r4(r.gross.filter(x => x - c > 0).length / r.gross.length);
    const lab = (a, b, c) => !(a > 0) && b > 0 ? 'loses at 0.8%, wins at 0.4%' : !(a > 0) && !(b > 0) && c > 0 ? 'loses at 0.8% and 0.4%, wins at 0.2%' : null;
    o.flip = lab(o.at08, o.at04, o.at02);
    if (typeof r.edgeGross === 'number' && isFinite(r.edgeGross)) { o.edge08 = r4(r.edgeGross - 0.008); o.edge04 = r4(r.edgeGross - 0.004); o.edge02 = r4(r.edgeGross - 0.002); o.edgeFlip = lab(o.edge08, o.edge04, o.edge02); }
    return o; }).filter(Boolean);
}
