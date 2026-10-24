// SQUAD 4 CORE (24 Oct 2026; squad4-lab.mjs uses it). BIG WINNERS: THEMES AND COMPOUNDERS. Pure functions, no network, no files.
// The owner's question: his tipster made him money with NVIDIA from about 90 USD and Intel (+100%): buy the leaders of a big story and
// hold. People make fortunes holding multi-year winners (NVDA, AVGO, LLY, PLTR, AXON, CELH, SMCI...). Can the next ones be found EARLY,
// and does holding them through the swings pay once the dead stocks and the look-alikes that never ran are counted?
// PART A (the B-100X1 10x study, a STUDY, not a buy rule): every stock that rose 5x / 10x (sustained: the close held the multiple for 20
// sessions) within the 5-year window, what was visible before, and how many stocks with the same visible profile did NOT run or died.
// PART B: the SQ4-* long-horizon rules below, pre-registered in data/strategy-library.json BEFORE any run, each tested ONCE (first
// complete verdict frozen in data/squad4-lab.json firstRun) at the system's tier-2 standard plus return per year of capital vs the S&P 500.
import { ttmAt, shiftYear, growthRun, instantAt } from './value-core.mjs';
import { vanished, isDead, markAt } from './hold-core.mjs';
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', HOLD = 252, BLOCK = 63, YEAR = 252;
export const H2Y = 504, SUSTAIN = 20, SUSTAIN_MIN = 15, STALE_DAYS = 200, CAP = 3;
export const NEAR_HIGH = 0.95, DIP_FROM_HIGH = 0.80, TAX = 0.21;
const EPS = 1e-9, le = (a, b) => a <= b * (1 + EPS), ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const median = (a) => { const s = a.filter(ok).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const quant = (a, q) => { const s = a.filter(ok).sort((x, y) => x - y); if (!s.length) return null; const p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoOf = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoOf(ms(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
const ym = (d) => d.slice(0, 7);
export const monthStarts = (D) => { const o = []; for (let t = 1; t < D.length; t++) if (ym(D[t]) !== ym(D[t - 1])) o.push(t); return o; };

// ================= share counts (as tipster-core: a whole-ratio jump between two rows = an unadjusted split) =================
export function splitFix(rows) {
  const out = rows.map(([d, n]) => [d, n]);
  for (let k = out.length - 2; k >= 0; k--) { const a = out[k][1], b = out[k + 1][1]; if (!(a > 0 && b > 0)) continue; const r = b / a, R = r >= 1 ? r : 1 / r, w = Math.round(R);
    if (w >= 2 && w <= 50 && Math.abs(R / w - 1) <= 0.03) for (let j = 0; j <= k; j++) out[j][1] *= r; }
  return out;
}
// the share count usable on day d (rows dated `lag`+ days earlier); null if none
export function sharesAt(rows, d, lag = 30) { if (!rows || !rows.length) return null; const lim = addDays(d, -lag); let v = null; for (const [e, n] of rows) if (e <= lim) v = n; return v > 0 ? v : null; }
// the as-reported share count nearest before d (within maxAge days): raw rows [[date, shares]] ascending
export function rawSharesNear(rows, d, maxAge = 200) { let v = null; for (const [e, n] of rows || []) { if (e > d) break; if (daysBetween(e, d) <= maxAge && n > 0) v = n; } return v; }

// ================= company facts (point in time: a fact counts only if filed BEFORE the day; value-core rules) =================
// tagged = { tag: [{ s, e, v, f }] } in priority order. TTM ending at `end` (+-7 days) of the first tag that answers.
const firstOf = (tagged, f) => { for (const facts of Object.values(tagged || {})) { const r = f(facts); if (r !== null && r !== undefined) return r; } return null; };
const near = (a, b, tol) => Math.abs(ms(a) - ms(b)) / DAY <= tol;
export function ttmEnd(tagged, asOf, end) { return firstOf(tagged, (f) => { const r = ttmAt(f, asOf, addDays(end, 7)); return r && near(r.end, end, 7) ? r.val : null; }); }
export function balanceAt(tagged, asOf, end, tol = 7) { return firstOf(tagged, (f) => { const r = instantAt(f.filter(x => x.e <= addDays(end, tol)), asOf); return r && near(r.end, end, tol) ? r.val : null; }); }
// REVENUE: the first tag with a fresh TTM (latest period ended <= 200 days before asOf) that also has the TTM a year earlier (+-15 days).
// Returns { end, rev, prev, g (TTM growth), prev2 (TTM two years earlier, or null), tag }.
export function revInfo(tagged, asOf) {
  for (const [tag, f] of Object.entries(tagged || {})) { const a = ttmAt(f, asOf); if (!a || (ms(asOf) - ms(a.end)) / DAY > STALE_DAYS || !(a.val > 0)) continue;
    const yr = (n) => { const e = shiftYear(a.end, -n), b = ttmAt(f, asOf, addDays(e, 10)); return b && near(b.end, e, 15) && b.val > 0 ? b.val : null; };
    const prev = yr(1); if (prev === null) continue; return { end: a.end, rev: a.val, prev, g: a.val / prev - 1, prev2: yr(2), tag }; }
  return null;
}
// ALL FUNDAMENTALS one day (co = { rev, gp, cogs, rd, op, cfo, capex, eq, debt, cash } tagged facts). Every margin uses the SAME period end as
// the revenue TTM; the year-earlier margins use the period end a year earlier. Unknown -> null (never 0, except debt: a company that never
// reported any debt item before the day has none).
export function fundamentals(co, asOf) {
  const out = { rev: null, revG: null, accel: null, gm: null, gmPrev: null, gmUp: null, rdInt: null, opM: null, opMPrev: null, opUp: null, fcfM: null, roic: null, de: null, rev2y: null, g0: null, g1: null };
  if (!co) return out; const R = revInfo(co.rev, asOf); if (!R) return out;
  out.rev = R.rev; out.revG = R.g; out.rev2y = R.prev2; out.revEnd = R.end;
  const run = co.rev[R.tag] ? growthRun(co.rev[R.tag], asOf) : null; if (run && run.g.length >= 2 && ok(run.g[0]) && ok(run.g[1])) { out.g0 = run.g[0]; out.g1 = run.g[1]; out.accel = run.g[0] > run.g[1]; }
  const pe = shiftYear(R.end, -1), mg = (end, rev) => { const gp = ttmEnd(co.gp, asOf, end); if (ok(gp)) return gp / rev; const cg = ttmEnd(co.cogs, asOf, end); return ok(cg) ? 1 - cg / rev : null; };
  out.gm = mg(R.end, R.rev); out.gmPrev = mg(pe, R.prev); out.gmUp = ok(out.gm) && ok(out.gmPrev) ? out.gm > out.gmPrev : null;
  const rd = ttmEnd(co.rd, asOf, R.end); out.rdInt = ok(rd) ? rd / R.rev : null;
  const op = ttmEnd(co.op, asOf, R.end), opP = ttmEnd(co.op, asOf, pe); out.opM = ok(op) ? op / R.rev : null; out.opMPrev = ok(opP) ? opP / R.prev : null; out.opUp = ok(out.opM) && ok(out.opMPrev) ? out.opM > out.opMPrev : null;
  const cfo = ttmEnd(co.cfo, asOf, R.end); if (ok(cfo)) { const cx = ttmEnd(co.capex, asOf, R.end), everCapex = Object.values(co.capex || {}).some(f => f.some(x => x.f < asOf)); out.fcfM = ok(cx) ? (cfo - cx) / R.rev : everCapex ? null : cfo / R.rev; }
  // balance sheet at the latest equity date known (within 200 days of asOf)
  const eqAll = firstOf(co.eq, (f) => instantAt(f, asOf));
  if (eqAll && (ms(asOf) - ms(eqAll.end)) / DAY <= STALE_DAYS) { const E = eqAll.val, at = (tag) => { const f = (co.debt || {})[tag]; if (!f) return null; const r = instantAt(f.filter(x => x.e <= addDays(eqAll.end, 5)), asOf); return r && near(r.end, eqAll.end, 5) ? r.val : null; };
    const total = at('LongTermDebt'), parts = ['LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent'].map(at), ever = Object.values(co.debt || {}).some(f => (f || []).some(x => x.f < asOf));
    const debt = total !== null ? total : parts.some(v => v !== null) ? (parts[0] || 0) + (parts[1] !== null ? parts[1] : parts[2] || 0) : ever ? null : 0;
    const cash = balanceAt(co.cash, asOf, eqAll.end, 5);
    if (E > 0 && debt !== null) out.de = debt / E;
    if (ok(op) && debt !== null) { const ic = E + debt - (ok(cash) ? cash : 0); if (ic > 0) out.roic = op * (1 - TAX) / ic; } }
  return out;
}

// ================= insiders (SEC Form 3/4/5 data sets) =================
// a non-derivative security title that is the common stock (not preferred, warrants, units, notes, options)
export const commonTitle = (t) => { const s = String(t || '').toLowerCase(); return /(common|ordinary|class [a-c]\b|shares|stock)/.test(s) && !/(prefer|warrant|unit|note|option|right|debenture|depositary|restricted stock unit|\brsu|phantom|performance)/.test(s); };
// one filing's total common shares owned after it: rows [{ title, di ('D'|'I'), nature, sh, date, seq }]; per ownership line (direct, or
// indirect with its nature) the LAST row (latest date, then the latest row of the file) counts; lines are added.
export function holdingsOf(rows) {
  const by = new Map(); for (const r of rows || []) { if (!commonTitle(r.title) || !(r.sh >= 0)) continue; const k = (r.di || 'D') + '|' + String(r.nature || '').toLowerCase().trim();
    const o = by.get(k); if (!o || (r.date || '') > (o.date || '') || ((r.date || '') === (o.date || '') && (r.seq || 0) >= (o.seq || 0))) by.set(k, r); }
  if (!by.size) return null; let s = 0; for (const r of by.values()) s += r.sh; return s;
}
// officer / director ownership on day d: owners = Map ownerCik -> [[filingDate, fraction of shares outstanding, isOfficerOrDirector]] ascending.
// Each officer / director counts with his latest filing before d if it is at most maxAge days old; fractions capped at 1, the sum at 1.
export function insiderOwnAt(owners, d, maxAge = 730) {
  if (!owners) return null; let s = 0, any = false;
  for (const recs of owners.values()) { let last = null; for (const r of recs) { if (r[0] < d) last = r; else break; } if (!last || !last[2] || daysBetween(last[0], d) > maxAge) continue; any = true; s += Math.min(1, Math.max(0, last[1])); }
  return any ? Math.min(1, s) : 0;
}
// historical ticker -> SEC company: spans [[cik, firstFiled, lastFiled, filings]]; the company whose filings with that ticker are nearest d
// (a span covering d +- 400 days, most filings first); null if none covers it
export function cikFromSpans(spans, d) { let best = null; for (const s of spans || []) { if (d < addDays(s[1], -400) || d > addDays(s[2], 400)) continue; if (!best || s[3] > best[3]) best = s; } return best ? String(best[0]) : null; }

// ================= prices =================
export function highOf(c, t, n) { let hi = 0, have = 0; for (let k = Math.max(0, t - n + 1); k <= t; k++) if (c[k] > 0) { have++; if (c[k] > hi) hi = c[k]; } return t - n + 1 >= 0 && have >= n * 0.9 ? hi : null; }
export function smaOf(c, t, n) { if (t - n + 1 < 0) return null; let s = 0, have = 0; for (let k = t - n + 1; k <= t; k++) if (c[k] > 0) { s += c[k]; have++; } return have >= n * 0.9 ? s / have : null; }
export function retOf(c, t, n) { const a = c[t - n], b = c[t]; return t - n >= 0 && a > 0 && b > 0 ? b / a - 1 : null; }
// split artifacts: sessions k where the close jumps by a near-whole ratio of 3..50 (or its inverse) from the previous close: an unadjusted
// split in the data. Real one-day moves of exactly 3x, 4x... are very rare; a path containing one is left out on BOTH sides (trades and
// yardstick), so it can neither make nor break a rule.
export function artifactJumps(c, from = 1, to = c.length - 1) { const out = []; let prev = NaN;
  for (let k = Math.max(0, from - 1); k <= to; k++) { const z = c[k]; if (!(z > 0)) continue; if (prev > 0 && k >= from) { const r = z / prev, R = r >= 1 ? r : 1 / r, w = Math.round(R); if (w >= 3 && w <= 50 && Math.abs(R / w - 1) <= 0.03) out.push(k); } prev = z; }
  return out; }
export const hasArtifact = (jumps, a, b) => jumps.some(k => k > a && k <= b);
// SUSTAINED LEVEL from session k: the lowest close over sessions k..k+n-1 (at least nMin of them present), else NaN. A multiple counts only
// if the stock HELD it for 20 sessions (not a one-day spike).
export function sustainedFwd(c, n = SUSTAIN, nMin = SUSTAIN_MIN) { const T = c.length, out = new Float64Array(T).fill(NaN);
  for (let k = 0; k + n - 1 < T; k++) { let lo = Infinity, have = 0; for (let j = k; j < k + n; j++) if (c[j] > 0) { have++; if (c[j] < lo) lo = c[j]; } if (have >= nMin && c[k] > 0) out[k] = lo; }
  return out; }
// the best sustained multiple of close[f] reached in sessions f+1 .. f+H (H = Infinity: to the end of the data); { m, k (first session at
// which the best level starts) } or null
export function bestMultiple(c, m20, f, H = Infinity) { const e = c[f]; if (!(e > 0)) return null; let m = NaN, kk = -1; const last = Math.min(c.length - 1, f + H);
  for (let k = f + 1; k <= last; k++) { const v = m20[k]; if (v > 0 && !(v / e <= m)) { m = v / e; kk = k; } } return isFinite(m) ? { m, k: kk } : null; }
// the first session after f at which the stock holds `mult` x close[f] for SUSTAIN sessions; -1 if never (within H)
export function firstSustained(c, m20, f, mult, H = Infinity) { const e = c[f]; if (!(e > 0)) return -1; const last = Math.min(c.length - 1, f + H); for (let k = f + 1; k <= last; k++) if (m20[k] >= e * mult * (1 - EPS)) return k; return -1; }

// ================= the position plans =================
// s = { o(k), c(k), last, T } (hold-core series). Buy 1 unit at the open of te. adds: [{ drop, size }] = add `size` at the next open after the
// first close <= the first buy x (1 - drop) (once each). stop: sell all at the next open after a close at which the position is worth <=
// (1 - stop) x the money in (35% disaster stop on the total). trail { gain, ma }: once a close has put the position at +gain or more (on the
// money in), sell all at the next open after a close under the `ma`-session average of closes. Else sell at the close of te + maxH - 1.
// A dead stock (vanished under 3 USD) loses the rest; one that vanished above 3 USD is paid its last close (a buyout).
// A window that runs past the data -> null; partial (paper lane): simulated to the newest close and returned as kind 'open'.
// Returns { kind: max|stop|trail|dead|gone|open, x, at, units, w, profit, g (profit per money in), unitYears, worst, best, days }.
export function runPlan(s, te, { maxH = HOLD, stop = 0.35, adds = [], trail = null, partial = false } = {}) {
  const e = s.o(te); if (!(e > 0)) return null; const last = te + maxH - 1; if (last > s.T - 1 && !partial) return null;
  if (last > s.T - 1) { if (te > s.T - 1) return null; const r = runPlan(s, te, { maxH: s.T - te, stop, adds, trail });
    if (r && r.kind === 'max') return { ...r, kind: 'open' }; if (r && (r.kind === 'stop' || r.kind === 'trail') && r.at === 'c' && r.x === s.T - 1) return { ...r, kind: 'open', exitPending: r.kind }; return r; }
  const units = [{ k: te, px: e, w: 1 }], armed = adds.map(() => true); let worst = 0, best = 0, trailOn = false;
  const money = () => units.reduce((a, u) => a + u.w, 0), value = (p) => units.reduce((a, u) => a + u.w * p / u.px, 0);
  const ma = (k, n) => { let sm = 0, have = 0; for (let j = k - n + 1; j <= k; j++) { const z = j >= 0 ? s.c(j) : NaN; if (z > 0) { sm += z; have++; } } return have >= n * 0.9 ? sm / have : null; };
  const fin = (kind, x, at, p) => { const w = money(), profit = value(p) - w; return { kind, x, at, units: units.map(u => ({ k: u.k, px: u.px, w: u.w })), w, profit, g: profit / w,
    unitYears: units.reduce((a, u) => a + u.w * (x - u.k + 1), 0) / YEAR, worst: Math.min(worst, profit / w), best: Math.max(best, profit / w), days: x - te + 1 }; };
  const exitAt = (kind, k, c) => { if (k === last) return fin(kind, k, 'c', c); const o = s.o(k + 1); return o > 0 ? fin(kind, k + 1, 'o', o) : fin(kind, k, 'c', c); };
  for (let k = te; k <= last; k++) {
    if (vanished(s) && k > s.last) return isDead(s) ? fin('dead', s.last + 1, 'c', 0) : fin('gone', s.last, 'c', s.c(s.last));
    const c = s.c(k); if (!(c > 0)) continue; const w = money(), v = value(c); worst = Math.min(worst, v / w - 1); best = Math.max(best, v / w - 1);
    if (stop !== null && le(v, w * (1 - stop))) return exitAt('stop', k, c);
    if (trail) { if (v >= w * (1 + trail.gain) * (1 - EPS)) trailOn = true; if (trailOn) { const m = ma(k, trail.ma); if (m !== null && c < m) return exitAt('trail', k, c); } }
    if (k === last) break;
    const go = []; adds.forEach((a, j) => { if (armed[j] && le(c, e * (1 - a.drop))) go.push(j); });
    if (go.length) { const o = s.o(k + 1); if (o > 0) for (const j of go) { armed[j] = false; units.push({ k: k + 1, px: o, w: adds[j].size }); } } }
  return fin('max', last, 'c', markAt(s, last));
}
export const PLAN_G = { maxH: HOLD, stop: 0.35, adds: [], trail: { gain: 1.0, ma: 50 } };   // growth: 35% disaster stop, 50-day trail after +100%
export const PLAN_T = { maxH: HOLD, stop: 0.35, adds: [{ drop: 0.15, size: 0.5 }], trail: null };   // theme / dip: add 0.5 at -15%, 35% stop on the total
// information plans on the same entries (never judged)
export const INFO_PLANS = { FORGET: { maxH: HOLD, stop: null, adds: [], trail: null }, STOP_ONLY: { maxH: HOLD, stop: 0.35, adds: [], trail: null }, TWO_YEARS: { maxH: 504, stop: null, adds: [], trail: null } };
export function weighted(units, x, at, idx) { let s = 0, w = 0; for (const u of units) { const r = idx(u.k, x, at); if (r === null || r === undefined || !isFinite(r)) return null; s += u.w * r; w += u.w; } return w > 0 ? s / w : null; }
export function perYearOf(rows, key = 'g', cost = COST) { const v = rows.filter(z => ok(z[key]) && z.unitYears > 0); const y = v.reduce((a, z) => a + z.unitYears, 0); return v.length && y > 0 ? v.reduce((a, z) => a + (z[key] - cost) * z.w, 0) / y : null; }
// the payoff shape of a list of trades (net after cost): percentiles, big winners, disasters, and the share of all profit made by the top 5%
export function payoff(rows, cost = COST) {
  const net = rows.map(z => z.g - cost).filter(ok).sort((a, b) => b - a), n = net.length; if (!n) return { n: 0 };
  const sum = net.reduce((a, b) => a + b, 0), k5 = Math.max(1, Math.ceil(n * 0.05)), top5 = net.slice(0, k5).reduce((a, b) => a + b, 0), sh = (f) => r4(net.filter(f).length / n);
  return { n, avg: r4(sum / n), p05: r4(quant(net, 0.05)), p25: r4(quant(net, 0.25)), median: r4(quant(net, 0.5)), p75: r4(quant(net, 0.75)), p95: r4(quant(net, 0.95)), best: r4(net[0]), worst: r4(net[n - 1]),
    win: sh(x => x > 0), x2: sh(x => x >= 1), x4: sh(x => x >= 3), lost35: sh(x => x <= -0.35), lost60: sh(x => x <= -0.6), dead: r4(rows.filter(z => z.kind === 'dead').length / n),
    top5n: k5, top5Profit: r4(top5), allProfit: r4(sum), top5Share: sum > 0 ? r4(top5 / sum) : null, withoutTop5: r4(n > k5 ? net.slice(k5).reduce((a, b) => a + b, 0) / (n - k5) : null) };
}
export function failures(rows, cost = COST) { const n = rows.length; if (!n) return { n: 0 }; const sh = (f) => r4(rows.filter(f).length / n);
  return { n, lost: sh(z => z.g - cost <= 0), lost30: sh(z => z.g - cost <= -0.3), stopped: sh(z => z.kind === 'stop'), trailed: sh(z => z.kind === 'trail'), dead: sh(z => z.kind === 'dead'), gone: sh(z => z.kind === 'gone'), worstOnTheWayMedian: r4(median(rows.map(z => z.worst))) }; }

// ================= the rules (checks on one stock, one day) =================
export const isTech = (sic) => { const n = +sic; return (n >= 3570 && n <= 3579) || (n >= 3660 && n <= 3679) || (n >= 7370 && n <= 7379); };
// f = fundamentals(); off52 = close / highest close of the last 252 sessions
export const growLeadOk = (f, off52) => !!f && f.revG >= 0.30 && f.accel === true && f.gmUp === true && ok(off52) && off52 >= NEAR_HIGH * (1 - EPS);
export const rule40Ok = (f, sic) => !!f && isTech(sic) && ok(f.revG) && f.revG > 0 && ok(f.fcfM) && f.revG + f.fcfM >= 0.40 - EPS;
export const insiderOk = (f, own, above200) => !!f && ok(own) && own >= 0.10 - EPS && f.revG >= 0.20 && above200 === true;
export const rdCompOk = (f) => !!f && f.rdInt >= 0.10 - EPS && f.revG >= 0.15 && f.gmUp === true && f.opUp === true;
// quality compounder bought on a 20% pullback in an uptrend: the FIRST close at or under 80% of the 52-week high (the close before was above
// 80% of its own 52-week high), the 200-day average higher than 63 sessions earlier, ROIC proxy >= 20%, revenue growing, debt/equity < 0.5
export const qualDipOk = (f, { close, prevClose, hi, prevHi, maNow, maThen }) => !!f && f.roic >= 0.20 && f.revG > 0 && ok(f.de) && f.de < 0.5 && ok(maNow) && ok(maThen) && maNow > maThen
  && close > 0 && hi > 0 && le(close, hi * DIP_FROM_HIGH) && prevClose > 0 && prevHi > 0 && prevClose > prevHi * DIP_FROM_HIGH * (1 + EPS);
// IPO to leader: first SEC XBRL filing 2 to 5 years before the day (a listing proxy: IPO, SPAC merger or spin-off), TTM revenue at least
// double the TTM two years earlier, at / near a 52-week high
export const ipoLeadOk = (f, firstFiled, d, off52) => { if (!f || !firstFiled || !(f.rev2y > 0) || !(f.rev >= 2 * f.rev2y * (1 - EPS)) || !ok(off52) || off52 < NEAR_HIGH * (1 - EPS)) return false; const y = daysBetween(firstFiled, d) / 365.25; return y >= 2 && y <= 5; };
// the big-winner profile written BEFORE the run from outside evidence (not fitted on this data): small/mid cap 0.3-10B USD, revenue +25%+,
// gross margin 40%+, 12-month return in the top 20% of the universe, within 15% of its 52-week high
export const profileOk = (f, cap, rsPct, off52) => !!f && cap >= 3e8 && cap <= 1e10 && f.revG >= 0.25 && f.gm >= 0.40 && ok(rsPct) && rsPct <= 0.20 + EPS && ok(off52) && off52 >= 0.85 * (1 - EPS);
// theme: industries [{ ind, n, ret12, members: [{ key, revG }] }]; the industry (5+ members, 5+ with a 12-month return) with the best
// median 12-month return; its top 3 members by TTM revenue growth (growth > 0). Returns { ind, ret12, picks: [key] } or null.
export function themeGrowPick(inds, min = 5, n = 3) {
  const a = inds.filter(x => x.n >= min && x.nRet >= min && ok(x.ret12)); if (!a.length) return null; const best = a.reduce((b, x) => x.ret12 > b.ret12 ? x : b);
  const picks = best.members.filter(m => ok(m.revG) && m.revG > 0).sort((x, y) => y.revG - x.revG).slice(0, n).map(m => m.key); return { ind: best.ind, ret12: best.ret12, picks };
}
export function dedupeByCompany(rows) { const m = new Map(); for (const r of rows) { const c = r.cik || ('i' + r.key); const o = m.get(c); if (!o || r.dv > o.dv) m.set(c, r); } return [...m.values()]; }

// ================= PART A helpers =================
// the visible-profile bucket used for look-alikes: revenue growth, 12-month return tercile, market-cap bucket, gross-margin trend
export function profileKey(x) {
  const g = x.revG, rb = !ok(g) ? 'g?' : g < 0 ? 'g<0' : g < 0.3 ? 'g0-30' : g < 1 ? 'g30-100' : 'g100+';
  const rs = !ok(x.rsPct) ? 'rs?' : x.rsPct <= 1 / 3 ? 'rsTop' : x.rsPct <= 2 / 3 ? 'rsMid' : 'rsLow';
  const cb = !ok(x.cap) ? 'cap?' : x.cap < 3e8 ? 'micro' : x.cap < 2e9 ? 'small' : x.cap < 1e10 ? 'mid' : 'large';
  const gm = x.gmUp === true ? 'gmUp' : x.gmUp === false ? 'gmDown' : 'gm?';
  return [rb, rs, cb, gm].join('|');
}
// precision of a profile: rows [{ m (best sustained multiple within the horizon), dead, ret (to the horizon, dead = -1), sym }]
export function precision(rows, base) {
  const n = rows.length; if (!n) return { n: 0 }; const c = (f) => rows.filter(f).length, syms = (f) => new Set(rows.filter(f).map(z => z.sym)).size;
  const x5 = c(z => z.m >= 5), x10 = c(z => z.m >= 10), x2 = c(z => z.m >= 2), dead = c(z => z.dead), crash = c(z => z.ret <= -0.8 || z.dead);
  const rets = rows.map(z => z.ret).filter(ok), sumR = rets.reduce((a, b) => a + b, 0), srt = [...rets].sort((a, b) => b - a), k5 = Math.max(1, Math.ceil(srt.length * 0.05));
  return { n, stocks: syms(() => true), x2: r4(x2 / n), x5n: x5, x5stocks: syms(z => z.m >= 5), x5: r4(x5 / n), x10n: x10, x10stocks: syms(z => z.m >= 10), x10: r4(x10 / n),
    lift5: base && base.x5 > 0 ? r4(x5 / n / base.x5) : null, deadN: dead, dead: r4(dead / n), crash80: r4(crash / n), avgRet: r4(mean(rets)), medianRet: r4(median(rets)),
    top5Share: sumR > 0 ? r4(srt.slice(0, k5).reduce((a, b) => a + b, 0) / sumR) : null, failedPerWinner: x5 ? r4((n - x5) / x5) : null };
}

// PRE-LISTED PROFILES for the 10x study's precision table (written before the run; never re-fitted on the winners). x = the visible features of
// one stock on one month start: { revG, accel, gmUp, gm, rdInt, opUp, fcfM, roic, de, rev, rev2y, cap, rsPct, off52, own, ipoYears, sharesYoY, sic }
export const PROFILES = [
  { id: 'REV30', name: 'revenue +30%+', test: (x) => x.revG >= 0.3 },
  { id: 'REV30-ACC', name: 'revenue +30%+ and accelerating', test: (x) => x.revG >= 0.3 && x.accel === true },
  { id: 'REV30-ACC-GM', name: 'revenue +30%+, accelerating, gross margin rising', test: (x) => x.revG >= 0.3 && x.accel === true && x.gmUp === true },
  { id: 'GROWLEAD', name: 'the SQ4-GROWLEAD profile (+ within 5% of the 52-week high)', test: (x) => growLeadOk(x, x.off52) },
  { id: 'REV100', name: 'revenue +100%+', test: (x) => x.revG >= 1 },
  { id: 'RS20', name: '12-month return in the top 20%', test: (x) => ok(x.rsPct) && x.rsPct <= 0.2 },
  { id: 'NEAR-HIGH', name: 'within 5% of the 52-week high', test: (x) => x.off52 >= NEAR_HIGH },
  { id: 'SMALL-GROW-GM', name: 'market cap under 2B, revenue +25%+, gross margin 40%+', test: (x) => x.cap > 0 && x.cap < 2e9 && x.revG >= 0.25 && x.gm >= 0.4 },
  { id: 'PROFILE', name: 'the SQ4-PROFILE big-winner profile', test: (x) => profileOk(x, x.cap, x.rsPct, x.off52) },
  { id: 'RD-GROW', name: 'R&D 10%+ of revenue and revenue +15%+', test: (x) => x.rdInt >= 0.1 && x.revG >= 0.15 },
  { id: 'RULE40', name: 'rule of 40 tech (SQ4-RULE40)', test: (x) => rule40Ok(x, x.sic) },
  { id: 'INSIDER-GROW', name: 'officers/directors own 10%+ and revenue +20%+', test: (x) => x.own >= 0.1 && x.revG >= 0.2 },
  { id: 'IPO-DOUBLE', name: 'listed 2-5 years and revenue doubled in 2 years', test: (x) => x.ipoYears >= 2 && x.ipoYears <= 5 && x.rev2y > 0 && x.rev >= 2 * x.rev2y },
  { id: 'QUALITY', name: 'ROIC proxy 20%+, growing, debt/equity under 0.5', test: (x) => x.roic >= 0.2 && x.revG > 0 && ok(x.de) && x.de < 0.5 },
  { id: 'MICRO', name: 'market cap under 300M', test: (x) => x.cap > 0 && x.cap < 3e8 },
  { id: 'DEEP-DOWN', name: '40%+ under the 52-week high', test: (x) => ok(x.off52) && x.off52 <= 0.6 },
  { id: 'DEEP-DOWN-GROW', name: '40%+ under the 52-week high and revenue +30%+', test: (x) => ok(x.off52) && x.off52 <= 0.6 && x.revG >= 0.3 },
  { id: 'DILUTING', name: 'share count +10%+ in a year', test: (x) => x.sharesYoY >= 0.1 },
  { id: 'NO-REVENUE-DATA', name: 'no SEC revenue growth known', test: (x) => !ok(x.revG) },
];

// ================= the rules as registered (library text) =================
const COMMON = 'Universe at the close of t: US-listed common stocks with an SEC company number (historical ticker map from the SEC Form 3/4/5 data sets, else the SEC ticker list), one ticker per company (the most traded), close >= 5 USD and 20-session average traded value >= 5M USD; dead and delisted stocks included. Fundamentals: SEC XBRL company facts point in time (filed BEFORE t; latest period ended <= 200 days before t). TTM revenue growth = TTM vs the TTM a year earlier (same tag); accelerating = the latest quarter YoY growth above the prior quarter YoY growth; gross margin = gross profit (else revenue - cost of revenue) / revenue, TTM, vs the TTM a year earlier; near the 52-week high = close >= 95% of the highest close of the last 252 sessions. Formation = the first session of each month (monthly overlapping cohorts); buy at the next open; one open position per stock per rule. Cost 0.8% per unit (1.2% stress). Judged once (first complete run frozen) at the tier-2 standard: both halves (signal before / from 2024-01-01; the first signal is possible about 12 months into the data, Oct 2022, so the older half is Oct 2022 - Dec 2023): > 0 after 0.8% and 1.2%, better than the average liquid stock over the same unit-weighted days, better than the same stocks with the same plan on their other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= 2.5 on 63-session blocks; plus return per year of capital tied up above SPY over the same days in both halves. Returns uncapped on both sides (a path with a near-whole 3x-50x one-day jump = an unadjusted split is left out on both sides); the +300% cap on both sides is reported as a sensitivity. Reported: return per year vs SPUS / HLAL, payoff distribution, share of profit from the top 5% of picks, information plans FORGET (no stop), STOP_ONLY, TWO_YEARS (504 sessions, no stop).';
const PG = 'PLAN G: 1 unit at the next open; sell at the next open after a close at which the position is worth <= 65% of the money in (35% disaster stop); once a close has put it at +100% or more, sell at the next open after a close under its 50-session average; else sell at the close of session 252.';
const PT = 'PLAN T: 1 unit at the next open, +0.5 unit at the next open after the first close <= first buy -15%, sell all at the next open after the position is worth <= 65% of the money in (35% stop on the total), else at the close of session 252.';
export const RULES = {
  'SQ4-GROWLEAD': { name: 'Growth leader at a new high', plan: 'G', short: 'revenue +30%+ and accelerating, gross margin rising, within 5% of the 52-week high; hold 12 months, 35% disaster stop, 50-day trail after +100%',
    rule: 'Monthly: TTM revenue growth >= 30%; latest quarter YoY growth above the prior quarter YoY growth; TTM gross margin above the TTM a year earlier; close >= 95% of the 52-week high. Buy every match. ' + PG },
  'SQ4-THEMEGROW': { name: 'Fastest growers of the hottest industry', plan: 'T', short: 'each month the industry with the best 12-month return; buy its 3 fastest revenue growers; hold 12 months, add on -15%',
    rule: 'Monthly: industries = SIC 4-digit with 5+ universe members (5+ with a 252-session return); the industry with the highest median 252-session member return; buy its 3 members with the highest TTM revenue growth (growth > 0). Differs from TIP-THEME (tipster lab: top 3 by market cap, quarterly, accelerating industries only). ' + PT },
  'SQ4-RULE40': { name: 'Rule of 40 tech', plan: 'G', short: 'tech/software company with revenue growth + free-cash-flow margin >= 40% (growth > 0); hold 12 months, 35% stop, trail after +100%',
    rule: 'Monthly: SIC 3570-3579, 3660-3679 or 7370-7379; TTM revenue growth > 0; TTM revenue growth + TTM free-cash-flow margin ((operating cash flow - capex) / revenue, same period; a company that never reported capex counts capex 0) >= 40%. Buy every match. ' + PG },
  'SQ4-INSIDER': { name: 'Insider-owned grower (founder-style)', plan: 'G', short: 'officers and directors own 10%+ of the shares, revenue +20%+, above the 200-day average; hold 12 months, 35% stop, trail after +100%',
    rule: 'Monthly: officer + director ownership >= 10% of shares outstanding (each officer / director: common shares owned after his latest Form 3/4/5 filed before t, at most 2 years old, over the as-reported shares outstanding near that filing; SEC data sets from 2021; founders are not identified as such: this is the measurable proxy); TTM revenue growth >= 20%; close above its 200-session average. Buy every match. ' + PG },
  'SQ4-RDCOMP': { name: 'R&D-heavy compounder with rising margins', plan: 'G', short: 'R&D 10%+ of revenue, revenue +15%+, gross AND operating margin up on a year earlier; hold 12 months, 35% stop, trail after +100%',
    rule: 'Monthly: TTM R&D / TTM revenue >= 10%; TTM revenue growth >= 15%; TTM gross margin above a year earlier; TTM operating margin (OperatingIncomeLoss / revenue) above a year earlier. Buy every match. ' + PG },
  'SQ4-QUALDIP': { name: 'Quality compounder on a 20% pullback in an uptrend', plan: 'T', short: 'ROIC proxy 20%+, growing, debt/equity < 0.5, rising 200-day average, first close 20% under the 52-week high; hold 12 months, add on -15%',
    rule: 'Daily (not monthly): the first close <= 80% of the 52-week high (the previous close was above 80% of its own 52-week high); the 200-session average above its value 63 sessions earlier; ROIC proxy = TTM operating income x (1 - 21%) / (equity + debt - cash) at the latest balance sheet >= 20%; TTM revenue growth > 0; debt / equity < 0.5 (equity > 0). ' + PT },
  'SQ4-IPOLEAD': { name: 'Young company becoming a leader (IPO to leader)', plan: 'G', short: 'listed 2-5 years (first SEC XBRL filing), revenue doubled in 2 years, near a 52-week high; hold 12 months, 35% stop, trail after +100%',
    rule: 'Monthly: the company\'s first XBRL financial filing (a listing proxy: IPO, SPAC merger or spin-off) 2 to 5 years before t; TTM revenue >= 2x the TTM two years earlier; close >= 95% of the 52-week high. Buy every match. ' + PG },
  'SQ4-PROFILE': { name: 'Big-winner profile basket (many small bets)', plan: 'G', short: 'market cap 0.3-10B USD, revenue +25%+, gross margin 40%+, 12-month return top 20%, within 15% of the 52-week high; buy all, hold 12 months',
    rule: 'Monthly: market cap (close x SEC shares known 30 days late) 0.3-10B USD; TTM revenue growth >= 25%; TTM gross margin >= 40%; 252-session return in the top 20% of the universe that day; close >= 85% of the 52-week high. Profile written BEFORE the run from outside evidence (CAN SLIM / big-winner studies), not fitted to this data or to the 10x study. Buy every match with an equal small position: the payoff distribution and the share of profit from the top 5% are the point. ' + PG },
};
export const IDS = Object.keys(RULES);
export const planOf = (id) => RULES[id].plan === 'T' ? PLAN_T : PLAN_G;
export const TENX_SPEC = 'B-100X1 as run by Squad 4 (squad4-lab.mjs, specified 24 Oct 2026 before the run): WINNER = a stock whose close HELD 5x (or 10x) a starting close for 20 sessions (lowest close of 20 sessions, 15+ present), starting from any session at which it closed >= 2 USD with 20-session average volume >= 200k shares, within the 5-year data (adjusted prices; delisted stocks included; a path with a near-whole 3x-50x one-day jump = unadjusted split is ignored). SNAPSHOTS at the month starts 12, 6 and 3 months before the start of the move (the low it rose from) and at the start: revenue growth and acceleration, gross margin and trend, R&D intensity, market cap, 12-month return percentile, distance from the 52-week high, industry (SIC), officer/director ownership, share count change. LOOK-ALIKES: every eligible stock at the same month start with the same visible profile bucket (revenue growth band, 12-month return tercile, market-cap band, gross-margin trend), followed to the end of the data: how many reached 5x, how many died. PRECISION: monthly panel Oct 2022 - Sep 2024, each eligible stock followed 2 years (504 sessions): for each pre-listed profile the share that reached sustained 5x / 10x, the share that died or fell 80%+, lift over all stocks. A study, not a buy rule; no profile is re-fitted on these winners.';
// library pre-registration (idempotent): adds every missing SQ4-* entry; marks B-100X1 as taken up by Squad 4 with the exact spec
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Big winners: themes and compounders (Squad 4)', name: r.name, explain: r.short + '. RULE: ' + r.rule + ' ' + COMMON, status: 'pre-registered ' + today + ' (squad 4); 5-year one-shot pending', agent: 'squad4', registered: today,
      libraryCheck: 'Overlaps: TIP-THEME / TIP-DIPLEAD (tipster lab: industry leaders by market cap, dips), ANOM-52WH / ANOM-RESMOM / DEC-FROG (momentum near highs), ANOM-RD (R&D for its size: rejected), ANOM-QMJ / ANOM-GP (quality: rejected), B-FCF1 / V15 (quality value), HOLD-AVGDOWN (adding on dips), WIN-001..003 (short-term winners autopsy). New here: 12-month holds of GROWTH profiles (revenue acceleration, margin trend, rule of 40, insider ownership, IPO age) with a disaster stop and a trailing exit after +100%.',
      note: 'Pre-registered ' + today + ' BEFORE any run (squad4-core.mjs = the exact rule; hold 252 sessions). 5-year one-shot by squad4-lab.mjs, first complete verdict frozen in data/squad4-lab.json; forward paper lane (data/squad4-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  const b = LB.strategies.find(e => e.id === 'B-100X1'); if (b && !b.squad4Spec) { b.squad4Spec = TENX_SPEC; b.status = 'running (Squad 4, squad4-lab.mjs, ' + today + ')'; ch++; }
  if (ch) LB.updated = today; return ch; }
// board helpers (anomaly-core's, copied so this lab does not move when that file does)
export function boardStats(rows) { const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => r.g - r.c))) : null, avgWin: win.length ? r4(sum(win) / win.length) : null, avgLoss: loss.length ? r4(sum(loss) / loss.length) : null,
    pf: loss.length && sum(loss) < 0 ? r4(sum(win) / -sum(loss)) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
