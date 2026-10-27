// VALUE LAB CORE (Agent B, 23 Oct 2026; value-lab.mjs uses it). Pure functions, no network, no files.
// SEC facts are compact rows from the companyfacts API / bulk file: { s: start (duration facts only), e: end, v: value, f: filed date }.
// POINT IN TIME: a fact counts only if its filing date is BEFORE the day asked about (filed that day = not yet usable, the filing may
// come after the close). A later filing of the same period (a restatement, or the prior-year column of a newer report) replaces the
// earlier figure from the day it was filed.
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), days = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
const near = (a, b, tol) => Math.abs(days(a, b)) <= tol;

// the latest-filed value of every period known before asOf: Map 'start|end' -> { s, e, v, d (length in days) }
function known(facts, asOf, maxEnd) {
  const m = new Map(), when = new Map();
  for (const x of facts || []) { if (!x || !(x.f < asOf) || !isFinite(x.v) || (maxEnd && x.e > maxEnd)) continue; const k = (x.s || '') + '|' + x.e;
    if (!when.has(k) || x.f >= when.get(k)) { when.set(k, x.f); m.set(k, { s: x.s, e: x.e, v: x.v, d: x.s ? days(x.s, x.e) + 1 : 0 }); } }
  return [...m.values()];
}
const isYear = (p) => p.d >= 350 && p.d <= 380, isQuarter = (p) => p.d >= 80 && p.d <= 100;

// TRAILING TWELVE MONTHS of a duration item (cash flow, revenue, cost of sales) at the latest period end known before asOf
// (or before maxEnd, for the year-earlier figure). A 10-K: the full year. A 10-Q (year-to-date figures, as cash flows are reported):
// this YTD + the last full year - the same YTD a year earlier. Else four discrete quarters ending that day. Else null.
export function ttmAt(facts, asOf, maxEnd) {
  const P = known(facts, asOf, maxEnd); if (!P.length) return null;
  const E = P.reduce((a, p) => p.e > a ? p.e : a, '');
  const atE = P.filter(p => p.e === E && p.d > 0);
  const yr = atE.find(isYear); if (yr) return { end: E, val: yr.v };
  for (const p of atE.filter(q => q.d >= 80 && q.d < 350).sort((a, b) => b.d - a.d)) {
    const fy = P.find(q => isYear(q) && near(q.e, new Date(ms(p.s) - DAY).toISOString().slice(0, 10), 5));
    const prior = P.find(q => q.d > 0 && near(q.e, shiftYear(E), 7) && Math.abs(q.d - p.d) <= 10);
    if (fy && prior) return { end: E, val: p.v + fy.v - prior.v }; }
  const qs = []; let e = E;
  for (let k = 0; k < 4; k++) { const q = P.find(z => isQuarter(z) && near(z.e, e, 5)); if (!q) break; qs.push(q); e = new Date(ms(q.s) - DAY).toISOString().slice(0, 10); }
  return qs.length === 4 ? { end: E, val: qs.reduce((a, q) => a + q.v, 0) } : null;
}
export const shiftYear = (d, n = -1) => (+d.slice(0, 4) + n) + d.slice(4);

// BALANCE SHEET item (equity, debt, inventory): the value at the latest period end known before asOf. null if none.
export function instantAt(facts, asOf) {
  const P = known(facts, asOf); if (!P.length) return null; const p = P.reduce((a, q) => q.e > a.e ? q : a);
  return { end: p.e, val: p.v };
}
// ONE QUARTER's value (3 months ending `end`, within 5 days): the 3-month figure; for a 4th quarter (10-Ks give the year only) the
// full year minus the 9-month YTD of the same year. null if not known before asOf.
export function quarterAt(facts, asOf, end) {
  const P = known(facts, asOf), q = P.find(z => isQuarter(z) && near(z.e, end, 5)); if (q) return q.v;
  const y = P.find(z => isYear(z) && near(z.e, end, 5)); if (!y) return null;
  const ytd = P.find(z => z.s === y.s && z.d >= 260 && z.d <= 285); return ytd ? y.v - ytd.v : null;
}

// REVENUE GROWTH RUN (B-EM1): year-on-year growth of the latest three quarters known before asOf (newest first), each quarter vs the
// same quarter a year earlier (within 7 days, for 52/53-week years). rising = all three known and each above the one before
// (growth rising for 2 quarters running).
export function growthRun(facts, asOf) {
  const P = known(facts, asOf), ends = [...new Set(P.filter(z => isQuarter(z) || isYear(z)).map(z => z.e))].sort().reverse(); if (!ends.length) return null;
  const val = (e) => quarterAt(facts, asOf, e), seq = [ends[0]];
  while (seq.length < 3) { const last = seq[seq.length - 1], prev = ends.find(e => days(e, last) >= 80 && days(e, last) <= 100); if (!prev) break; seq.push(prev); }
  const g = seq.map(e => { const pe = ends.find(z => near(z, shiftYear(e), 7)), a = val(e), b = pe ? val(pe) : null; return a !== null && b > 0 ? a / b - 1 : null; });
  const ok = g.length === 3 && g.every(x => x !== null);
  return { end: ends[0], g, rising: ok && g[0] > g[1] && g[1] > g[2] };
}
// BEAT STREAK: how many reports in a row, ending at report i, had actual EPS above the estimate (equal is not a beat). Reports sorted
// by date; a gap of more than 120 days between two reports (a missing quarter) ends the run.
export function beatStreak(R, i) {
  let n = 0; for (let k = i; k >= 0; k--) { const r = R[k]; if (!(r && isFinite(r.a) && isFinite(r.e) && r.a > r.e)) break; if (k < i && days(r.d, R[k + 1].d) > 120) break; n++; }
  return n;
}

// ---- the registered tier-2 standard (owner, 23 Oct 2026) ----
// trades: { t: formation / entry session, s: symbol, g: gross return, c: the average stock's gross return over the same window,
// own: the same stock's average gross return on its other days (null if unknown), h: hold length in sessions }.
export const COST = 0.008, STRESS = 0.012, TIER2_T = 2.5, MIN_PER_HALF = 20;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
// one half: n, distinct formation days, average / median after 0.8%, average after 1.2%, edge over the average stock (one average
// per day), day t, BLOCK t (non-overlapping blocks of `hold` sessions: block = floor(t / hold), its value = the average of its days'
// edges; 3+ blocks needed), versus the same stock on its other days, without the 2 best trades, best and worst.
export function halfStat(a, hold) {
  if (!a || !a.length) return { n: 0 };
  const byDay = (f) => { const o = new Map(); for (const z of a) { const x = f(z); if (x === null || x === undefined || !isFinite(x)) continue; (o.get(z.t) || o.set(z.t, []).get(z.t)).push(x); } return o; };
  const net = a.map(z => z.g - COST), sorted = [...net].sort((x, y) => y - x), ed = byDay(z => z.g - COST - z.c), ov = [...byDay(z => typeof z.own === 'number' ? z.g - z.own : null).values()].map(mean);
  const blk = new Map(); for (const [t, v] of ed) { const k = Math.floor(t / hold); (blk.get(k) || blk.set(k, []).get(k)).push(mean(v)); }
  const bv = [...blk.values()].map(mean), dv = [...ed.values()].map(mean);
  return { n: a.length, days: ed.size, stocks: new Set(a.map(z => z.s)).size, avg: r4(mean(net)), median: r4(median(net)), avgStress: r4(mean(a.map(z => z.g - STRESS))),
    ctrl: r4(mean(a.map(z => z.c - COST))), edge: r4(mean(dv)), tDay: tOf(dv), blocks: bv.length, tBlock: bv.length >= 3 ? tOf(bv) : null,
    vsOwn: ov.length ? r4(mean(ov)) : null, ownCovered: ov.length, noTop2: sorted.length > 2 ? r4(mean(sorted.slice(2))) : null, best: r4(sorted[0]), worst: r4(sorted[sorted.length - 1]),
    win: r4(net.filter(x => x > 0).length / net.length) };
}
// R = { older, newer } from halfStat. bar = the PROVEN bar (max of 2.5, the league bar, 4.0). extra = the rule's own registered gates
// that failed (beats V15 / T1 / the single-beat version, not one sector...), as plain reasons.
export function judge(R, { bar, minN = MIN_PER_HALF, extra = [] } = {}) {
  const H = ['older', 'newer'].map(k => R[k] || {}), why = [];
  if (!H.every(r => r.n >= minN && r.blocks >= 3)) return { verdict: 'TOO FEW CASES', why: 'fewer than ' + minN + ' cases or 3 blocks in a half (' + H.map(r => (r.n || 0) + ' cases, ' + (r.blocks || 0) + ' blocks').join(' / ') + ')' };
  H.forEach((r, j) => { const hf = j ? 'newer' : 'older';
    if (!(r.avg > 0)) why.push('lost money after 0.8% costs in the ' + hf + ' half');
    if (!(r.avgStress > 0)) why.push('lost money after 1.2% costs in the ' + hf + ' half');
    if (!(r.edge > 0)) why.push('not better than the average stock in the ' + hf + ' half');
    if (!(r.vsOwn > 0)) why.push('not better than the same stocks on their other days in the ' + hf + ' half');
    if (!(r.noTop2 > 0)) why.push('loses without its 2 best in the ' + hf + ' half');
    if (!(r.tBlock >= TIER2_T)) why.push('block t ' + r.tBlock + ' under ' + TIER2_T + ' in the ' + hf + ' half'); });
  why.push(...extra);
  if (!why.length) return H.every(r => r.tBlock >= bar) ? { verdict: 'PROVEN', why: 'every gate passed in both halves and block t clears the proof bar ' + bar } : { verdict: 'TRADABLE SMALL', why: 'every gate passed in both halves with block t >= ' + TIER2_T + ', below the proof bar ' + bar };
  return { verdict: H.every(r => r.edge > 0) ? 'NOT PROVEN' : 'REJECTED', why: why.join('; ') };
}

// ---- B-FCF1: the company check on one day (pre-registered 23 Oct 2026) ----
// co: { cfo, capex, rev, cogs, inv, eq, debt }, each { tag: facts } in priority order (the first tag that gives an answer is used, the
// SAME tag for both years of a growth figure). px = the close that day, shares = the share count known that day (same split basis).
// FCF yield = (TTM operating cash flow - TTM capex, same period end) / (shares x px), > 5%; a yield of 40%+ is treated as a data error
// (units, share count), as in quality.mjs. Revenue growth = TTM revenue vs the TTM a year earlier, >= 10%. Debt / equity < 0.5 at the
// latest balance sheet (equity > 0): debt = LongTermDebt (incl. current part) if reported for that date, else the sum of the parts
// reported for that date (non-current, current, short-term borrowings); a company that never reported any debt item before the day
// has none; one that did but not for that date is unknown (left out). Days of inventory = inventory / TTM cost of sales x 365 < 60, for
// companies with inventory > 0 (cost of sales unknown -> left out). Stale: a TTM period that ended 200+ days before the day -> left out.
const firstOf = (m, f) => { for (const facts of Object.values(m || {})) { const r = f(facts); if (r !== null && r !== undefined) return r; } return null; };
export const STALE_DAYS = 200;
export function fcfCheck(co, asOf, px, shares) {
  const out = { ok: false, fcfy: null, growth: null, de: null, dio: null, why: null }, no = (w) => ({ ...out, why: w });
  const cfo = firstOf(co.cfo, f => ttmAt(f, asOf)); if (!cfo) return no('no operating cash flow');
  if (days(cfo.end, asOf) > STALE_DAYS) return no('stale filings');
  const cap = firstOf(co.capex, f => { const r = ttmAt(f, asOf); return r && r.end === cfo.end ? r : null; }); if (!cap) return no('no capex');
  const mv = shares * px; if (!(mv > 0)) return no('no market value');
  out.fcfy = (cfo.val - cap.val) / mv;
  out.growth = firstOf(co.rev, f => { const a = ttmAt(f, asOf); if (!a || days(a.end, asOf) > STALE_DAYS) return null; const lim = new Date(ms(shiftYear(a.end)) + 10 * DAY).toISOString().slice(0, 10), b = ttmAt(f, asOf, lim);
    return b && near(b.end, shiftYear(a.end), 15) && b.val > 0 ? a.val / b.val - 1 : null; });
  const eq = firstOf(co.eq, f => instantAt(f, asOf));
  if (eq && eq.val > 0) { const at = (f) => { const r = instantAt(f, asOf); return r && near(r.end, eq.end, 5) ? r.val : null; }, D = co.debt || {};
    const total = D.LongTermDebt ? at(D.LongTermDebt) : null;
    const parts = ['LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings'].map(k => D[k] ? at(D[k]) : null);
    const ever = Object.values(D).some(f => (f || []).some(x => x.f < asOf));
    const debt = total !== null ? total + (parts[3] || 0) : parts.some(v => v !== null) ? (parts[0] || 0) + (parts[1] !== null ? parts[1] : parts[2] || 0) + (parts[3] || 0) : ever ? null : 0;
    out.de = debt === null ? null : debt / eq.val; }
  const inv = firstOf(co.inv, f => instantAt(f, asOf));
  if (inv && inv.val > 0) { const cg = firstOf(co.cogs, f => ttmAt(f, asOf)); out.dio = cg && cg.val > 0 ? inv.val / cg.val * 365 : null; }
  const why = [];
  if (!(out.fcfy > 0.05)) why.push('FCF yield'); if (out.fcfy >= 0.4) why.push('FCF yield 40%+ (data error)');
  if (!(out.growth >= 0.10)) why.push('revenue growth'); if (!(out.de !== null && out.de < 0.5)) why.push('debt/equity');
  if (inv && inv.val > 0 && !(out.dio !== null && out.dio < 60)) why.push('inventory days');
  out.ok = !why.length; out.why = why.join(', ') || null; return out;
}

// ---- B-CR1 / B-CR1-AVOID: CASH RUNWAY on one day (pre-registered 27 Oct 2026, value-lab.mjs header, before any run) ----
// co: { cfo, cash, sti } each { tag: facts } in priority order. Operating cash flow = TTM (ttmAt, the B-FCF1 code), its period ending
// under 200 days before the day (else stale -> null). Cash = the first cash tag's latest balance known before the day (instantAt), its
// date within 5 days of the cash-flow period end (else unknown -> null); plus short-term investments (first sti tag) only when reported
// for that same date (within 5 days). A company with TTM operating cash flow >= 0 is not burning cash: runway null, burner false.
// Burner: quarterly burn = -TTM operating cash flow / 4; runway = cash / quarterly burn (in quarters).
export function runwayAt(co, asOf) {
  const cfo = firstOf(co.cfo, f => ttmAt(f, asOf)); if (!cfo || days(cfo.end, asOf) > STALE_DAYS) return null;
  const cash = firstOf(co.cash, f => { const r = instantAt(f, asOf); return r && near(r.end, cfo.end, 5) ? r : null; }); if (!cash) return null;
  const sti = firstOf(co.sti, f => { const r = instantAt(f, asOf); return r && near(r.end, cash.end, 5) ? r : null; });
  const total = cash.val + (sti && sti.val > 0 ? sti.val : 0);
  if (!(cfo.val < 0)) return { burner: false, cfo: cfo.val, cash: total, runway: null, end: cfo.end };
  return { burner: true, cfo: cfo.val, cash: total, runway: total / (-cfo.val / 4), end: cfo.end };
}
// AVOID judge (B-CR1-AVOID; the squad 29 AVOID standard): per half, the excess = the stock's gross return minus the average stock's gross
// return over the same window (no cost on either side: an AVOID block saves the whole move), one average per formation day; block t over
// non-overlapping blocks of the hold length. CONFIRMED (an AVOID block) only if in BOTH halves: 20+ cases and 3+ blocks, excess <= -3%,
// block t <= -2.5, and worse than the same stocks on their other days (vsOwn < 0). Else NO AVOID (or TOO FEW CASES).
export function avoidStat(a, hold) {
  if (!a || !a.length) return { n: 0 };
  const ed = new Map(), ov = new Map(); for (const z of a) { const x = z.g - z.c; if (isFinite(x)) (ed.get(z.t) || ed.set(z.t, []).get(z.t)).push(x); if (typeof z.own === 'number') (ov.get(z.t) || ov.set(z.t, []).get(z.t)).push(z.g - z.own); }
  const dv = [...ed.values()].map(mean), blk = new Map(); for (const [t, v] of ed) { const k = Math.floor(t / hold); (blk.get(k) || blk.set(k, []).get(k)).push(mean(v)); }
  const bv = [...blk.values()].map(mean), ovv = [...ov.values()].map(mean);
  return { n: a.length, days: ed.size, stocks: new Set(a.map(z => z.s)).size, mean: r4(mean(a.map(z => z.g))), median: r4(median(a.map(z => z.g))), avgStock: r4(mean(a.map(z => z.c))),
    excess: r4(mean(dv)), medianExcess: r4(median(a.map(z => z.g - z.c))), blocks: bv.length, tBlock: bv.length >= 3 ? tOf(bv) : null, vsOwn: ovv.length ? r4(mean(ovv)) : null,
    worst: r4(Math.min(...a.map(z => z.g))), pctUnder: r4(a.filter(z => z.g < z.c).length / a.length) };
}
export const AVOID_BAR = { excess: -0.03, t: -2.5, n: MIN_PER_HALF };
export function avoidJudge(R) {
  const H = ['older', 'newer'].map(k => R[k] || {}), why = [];
  if (!H.every(r => r.n >= AVOID_BAR.n && r.blocks >= 3)) return { verdict: 'TOO FEW CASES', why: 'fewer than ' + AVOID_BAR.n + ' cases or 3 blocks in a half (' + H.map(r => (r.n || 0) + ' cases, ' + (r.blocks || 0) + ' blocks').join(' / ') + ')' };
  H.forEach((r, j) => { const hf = j ? 'newer' : 'older';
    if (!(r.excess <= AVOID_BAR.excess)) why.push('excess ' + r.excess + ' not <= ' + AVOID_BAR.excess + ' in the ' + hf + ' half');
    if (!(r.tBlock <= AVOID_BAR.t)) why.push('block t ' + r.tBlock + ' not <= ' + AVOID_BAR.t + ' in the ' + hf + ' half');
    if (!(r.vsOwn < 0)) why.push('not worse than the same stocks on their other days in the ' + hf + ' half'); });
  return why.length ? { verdict: 'NO AVOID', why: why.join('; ') } : { verdict: 'AVOID CONFIRMED', why: 'both halves: excess <= -3%, block t <= -2.5, worse than the same stocks on other days' };
}
// V15-SN: SECTOR-NEUTRAL cap on one formation day's V15 picks (pre-registered 27 Oct 2026). picks: [{ i, f (F-score), dv (20-day traded
// value), g (SIC 2-digit group, null = its own group '?') }] = exactly V15's picks that day. share = { group: its share of that day's
// liquid stocks }. K = picks.length; each group keeps at most max(1, round(K x share)) names, best F-score first, then the larger dv.
export function sectorCap(picks, share) {
  const K = picks.length, by = new Map(); for (const p of picks) { const g = p.g || '?'; (by.get(g) || by.set(g, []).get(g)).push(p); }
  const out = []; for (const [g, a] of by) { const cap = Math.max(1, Math.round(K * (share[g] || 0))); a.sort((x, y) => y.f - x.f || y.dv - x.dv); out.push(...a.slice(0, cap)); }
  return out;
}
