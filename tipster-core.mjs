// TIPSTER LAB CORE (24 Oct 2026; tipster-lab.mjs uses it). Pure functions, no network, no files.
// The owner's question: his personal tipster told him to buy NVIDIA at about 90 USD ("buy and forget, it will come up", and add more
// every now and then) more than a year ago, and Intel (now up 100%+). "How did he figure it out?" The style, decoded: buy the dominant
// company of an industry (or of the hot theme) when it is down hard, often while the whole market is afraid; a fallen former leader once
// its decline stops and someone puts big money in; hold about a year; add more on the way. These functions are the exact rules
// pre-registered in data/strategy-library.json (TIP-*) BEFORE any run (24 Oct 2026). Run once as written; first verdicts frozen.
//
// COMMON DEFINITIONS (all TIP rules)
//   Universe on day t: US companies that file a quarterly share count with the SEC (2+ share-count rows dated in the 400 days before t,
//     each row usable 30 days after its date; a jump between two rows within 3% of a whole split ratio 2..50 (or its inverse) is a split
//     the data did not adjust, and the older rows are scaled by it); one ticker per SEC company (CIK): the most traded over 20 sessions;
//     liquid (close >= 5 USD and 20-session average traded value >= 5M USD). Foreign filers (annual 20-F share counts only) are out.
//   Market cap = close x the share count known that day. Industry = SIC 4-digit code (the current code: no point-in-time history).
//   INDUSTRY LEADER = among the top 3 by market cap of its industry that day, in an industry with 5+ universe members.
//   POSITION PLAN (the registered one, all rules): buy 1 unit (equal money) at the next open; add 0.5 unit at the next open after the
//     first close <= the first buy x 0.85 (once); sell everything at the next open after a close at which the position is worth <= 65%
//     of the money put in (35% disaster stop on the total); else sell at the close of session 252 (the entry session is session 1).
//     A stock that vanishes: last close under 3 USD = dead (the rest is lost), else paid out at its last close (hold-core rule).
//     One open position per stock per rule (no new entry while one is open). Cost 0.8% per unit of money (1.2% stress).
//   PLANS FOR INFORMATION (same entries, not judged): ONCE = 1 unit, 35% stop; FORGET = 1 unit, no stop ("buy and forget");
//     MONTHLY = 1 unit + 0.1 unit at the open every 21 sessions after the entry (11 adds), 35% stop on the total ("add every now and then").
import { vanished, isDead, markAt } from './hold-core.mjs';
import { ttmAt, shiftYear, growthRun } from './value-core.mjs';
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', HOLD = 252, BLOCK = 63, YEAR = 252;
export const LEADER_N = 3, MIN_MEMBERS = 5, TOP_BIG = 100;
export const DIP = { stockOff: 0.30, spyOff: 0.15 }, TURN = { lowWindow: 756, nearLow: 0.10, lookbackDays: 90, insiderUsd: 1e6, formerWindow: 756 };
export const PLAN = { maxH: HOLD, stop: 0.35, adds: [{ drop: 0.15, size: 0.5 }] };
export const PLANS = { ONCE: { maxH: HOLD, stop: 0.35, adds: [] }, FORGET: { maxH: HOLD, stop: null, adds: [] }, MONTHLY: { maxH: HOLD, stop: 0.35, adds: [], every: 21, everySize: 0.1 } };
const EPS = 1e-9, ge = (a, b) => a >= b * (1 - EPS), le = (a, b) => a <= b * (1 + EPS), ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const median = (a) => { const s = a.filter(ok).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoOf = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoOf(ms(d) + n * DAY);

// ---- share counts ----
// rows [[date, shares], ...] ascending. A jump within 3% of a whole split ratio (2..50 or 1/2..1/50) between two rows = an unadjusted
// split: every older row is scaled to the newer basis. Other jumps (issuance, buybacks, mergers) are kept as they are.
export function splitFix(rows) {
  const out = rows.map(([d, n]) => [d, n]);
  for (let k = out.length - 2; k >= 0; k--) { const a = out[k][1], b = out[k + 1][1]; if (!(a > 0 && b > 0)) continue; const r = b / a, R = r >= 1 ? r : 1 / r, w = Math.round(R);
    if (w >= 2 && w <= 50 && Math.abs(R / w - 1) <= 0.03) for (let j = 0; j <= k; j++) out[j][1] *= r; }
  return out;
}
// the share count usable on day d (rows dated 30+ days earlier) and whether the company files quarterly (2+ rows in the 400 days before d)
export function sharesAt(rows, d, lag = 30) {
  if (!rows || !rows.length) return null; const lim = addDays(d, -lag), from = addDays(d, -400); let v = null, recent = 0;
  for (const [e, n] of rows) { if (e <= lim) v = n; if (e > from && e <= d) recent++; }
  return v > 0 && recent >= 2 ? v : null;
}

// ---- leaders ----
// rows [{ key, ind, cap }] (one per company). Returns { leaders: Set of keys in the top `n` by cap of an industry with `min`+ members,
// rankInInd: Map key -> rank (1 = largest) for industries with `min`+ members, members: Map ind -> count }.
export function industryLeaders(rows, n = LEADER_N, min = MIN_MEMBERS) {
  const by = new Map(); for (const r of rows) { if (!r.ind || !(r.cap > 0)) continue; (by.get(r.ind) || by.set(r.ind, []).get(r.ind)).push(r); }
  const leaders = new Set(), rankInInd = new Map(), members = new Map();
  for (const [ind, a] of by) { members.set(ind, a.length); if (a.length < min) continue; a.sort((x, y) => y.cap - x.cap); a.forEach((r, k) => { rankInInd.set(r.key, k + 1); if (k < n) leaders.add(r.key); }); }
  return { leaders, rankInInd, members, byInd: by };
}
// the `n` largest by cap (Set of keys) and each key's overall rank
export function largest(rows, n = TOP_BIG) { const a = rows.filter(r => r.cap > 0).sort((x, y) => y.cap - x.cap); return { set: new Set(a.slice(0, n).map(r => r.key)), rank: new Map(a.map((r, k) => [r.key, k + 1])) }; }
// one row per company: the ticker with the largest traded value
export function dedupeByCompany(rows) { const m = new Map(); for (const r of rows) { const c = r.cik || r.key; const o = m.get(c); if (!o || r.dv > o.dv) m.set(c, r); } return [...m.values()]; }

// ---- company facts (value-core point-in-time rules: a fact counts only if filed BEFORE the day) ----
// tagged: { tag: facts[] } in priority order; the first tag that gives an answer is used (the same tag for both years)
const firstOf = (tagged, f) => { for (const facts of Object.values(tagged || {})) { const r = f(facts); if (r !== null && r !== undefined) return r; } return null; };
export const STALE_DAYS = 200;
// TTM revenue growth known before asOf: the TTM at the latest period end vs the TTM ending a year earlier (+-15 days); stale (latest
// period ended 200+ days before asOf) -> null
export function revGrowthTTM(tagged, asOf) {
  return firstOf(tagged, (f) => { const a = ttmAt(f, asOf); if (!a || (ms(asOf) - ms(a.end)) / DAY > STALE_DAYS) return null;
    const lim = addDays(shiftYear(a.end), 10), b = ttmAt(f, asOf, lim); return b && Math.abs((ms(b.end) - ms(shiftYear(a.end))) / DAY) <= 15 && b.val > 0 ? a.val / b.val - 1 : null; });
}
// the latest quarterly YoY growth run (value-core growthRun: g[0] newest), first tag that answers; stale -> null
export function growthOf(tagged, asOf) { return firstOf(tagged, (f) => { const r = growthRun(f, asOf); return r && (ms(asOf) - ms(r.end)) / DAY <= STALE_DAYS && r.g.length && ok(r.g[0]) ? r : null; }); }
export function ttmOf(tagged, asOf) { return firstOf(tagged, (f) => ttmAt(f, asOf)); }

// ---- rule checks ----
// (a) DIP-LEADER at the close of t
export function dipLeaderOk({ leader, close, hi252, spyClose, spyHi252, revG }) {
  return !!leader && close > 0 && hi252 > 0 && spyClose > 0 && spyHi252 > 0 && le(spyClose, spyHi252 * (1 - DIP.spyOff)) && le(close, hi252 * (1 - DIP.stockOff)) && ok(revG) && revG > 0;
}
// (b) THEME: inds [{ ind, n, ret12, g0, g1, ng }] (ret12 = median 252-session return of members; g0 / g1 = median latest / prior quarter
// YoY revenue growth of the members that have both; ng = how many). The accelerating industry (g0 > g1, g0 > 0, ng >= 3, n >= 5)
// with the highest ret12; null if none.
export function themePick(inds, min = MIN_MEMBERS) {
  const a = inds.filter(x => x.n >= min && ok(x.ret12) && ok(x.g0) && ok(x.g1) && x.ng >= 3 && x.g0 > x.g1 && x.g0 > 0);
  return a.length ? a.reduce((b, x) => x.ret12 > b.ret12 ? x : b) : null;
}
// industry revenue acceleration from members' growth runs (arrays [g0, g1]): medians of the members with both known
export function industryGrowth(runs) { const both = runs.filter(g => g && ok(g[0]) && ok(g[1])); return { g0: median(both.map(g => g[0])), g1: median(both.map(g => g[1])), ng: both.length }; }
// (c) TURNAROUND-LEADER at the close of t
export function turnaroundOk({ formerLeader, close, low, lowCover, growth, insiderUsd, item302 }) {
  if (!formerLeader || !(close > 0) || !(low > 0) || !(lowCover >= 0.9)) return false;
  if (!le(close, low * (1 + TURN.nearLow))) return false;
  if (!growth || !growth.rising) return false;
  return (ok(insiderUsd) && insiderUsd >= TURN.insiderUsd) || !!item302;
}
// lowest close over sessions [t - n, t - 1] of a close array with a NaN-safe cover share
export function lowBefore(c, t, n) { let lo = Infinity, have = 0; for (let k = Math.max(0, t - n); k < t; k++) if (c[k] > 0) { have++; if (c[k] < lo) lo = c[k]; } return { low: have ? lo : null, cover: have / n }; }
export function highOf(c, t, n) { let hi = 0, have = 0; for (let k = Math.max(0, t - n + 1); k <= t; k++) if (c[k] > 0) { have++; if (c[k] > hi) hi = c[k]; } return have >= n * 0.9 ? hi : null; }
// insider purchases (rows [sym, filed, who, usd, traded]) for one symbol filed in (asOf - days, asOf): total USD
export function insiderUsdBefore(rows, asOf, days = TURN.lookbackDays) { const from = addDays(asOf, -days); let s = 0; for (const r of rows || []) if (r[1] >= from && r[1] < asOf) s += r[3] || 0; return s; }
// 8-K filings [{ d, items }] with Item 3.02 filed in [asOf - days, asOf)
export function item302Before(filings, asOf, days = TURN.lookbackDays) { const from = addDays(asOf, -days); return (filings || []).filter(f => f.d >= from && f.d < asOf && /(^|[^0-9.])3\.02/.test(f.items || '')); }

// ---- the position plan ----
// s = { o(k), c(k), last, T } (hold-core series). Buy `size0` (1) unit at the open of te. adds: [{ drop, size }] = add `size` at the next
// open after the first close <= the first buy x (1 - drop) (once each; a missing open keeps it armed). every / everySize: add everySize at
// the open of te + every, te + 2 x every, ... (before session te + maxH - 1). stop: sell all at the next open after a close at which
// value <= (1 - stop) x money in (checked before adds on each close). Else sell at the close of te + maxH - 1. A window that runs past
// the data -> null (not judged). Returns { kind: max|stop|dead|gone, x, at, units: [{ k, px, w }], w (money in), profit, g (profit per
// money in), unitYears, worst (worst close: value / money in - 1), days }.
// partial (paper lane): a window that runs past the data is simulated to the newest close and returned as kind 'open' (marked at that
// close; a stop hit on the newest close is 'open' with stopPending, sold at the next open on a later run).
export function runPlan(s, te, { maxH = HOLD, stop = 0.35, adds = [], every = 0, everySize = 0, partial = false } = {}) {
  const e = s.o(te); if (!(e > 0)) return null; const last = te + maxH - 1; if (last > s.T - 1 && !partial) return null;
  if (last > s.T - 1) { if (te > s.T - 1) return null; const r = runPlan(s, te, { maxH: s.T - te, stop, adds, every, everySize });
    if (r && r.kind === 'max') return { ...r, kind: 'open' }; if (r && r.kind === 'stop' && r.at === 'c' && r.x === s.T - 1) return { ...r, kind: 'open', stopPending: true }; return r; }
  const units = [{ k: te, px: e, w: 1 }], armed = adds.map(() => true); let worst = 0;
  const money = () => units.reduce((a, u) => a + u.w, 0), value = (p) => units.reduce((a, u) => a + u.w * p / u.px, 0);
  const fin = (kind, x, at, p) => { const w = money(), profit = value(p) - w; return { kind, x, at, units: units.map(u => ({ k: u.k, px: u.px, w: u.w })), w, profit, g: profit / w,
    unitYears: units.reduce((a, u) => a + u.w * (x - u.k + 1), 0) / YEAR, worst: Math.min(worst, profit / w), days: x - te + 1 }; };
  for (let k = te; k <= last; k++) {
    if (vanished(s) && k > s.last) return isDead(s) ? fin('dead', s.last + 1, 'c', 0) : fin('gone', s.last, 'c', s.c(s.last));
    if (every > 0 && k > te && (k - te) % every === 0 && k < last) { const o = s.o(k); if (o > 0) units.push({ k, px: o, w: everySize }); }
    const c = s.c(k); if (!(c > 0)) continue; const w = money(), v = value(c); worst = Math.min(worst, v / w - 1);
    if (stop !== null && le(v, w * (1 - stop))) { if (k === last) return fin('stop', k, 'c', c); const o = s.o(k + 1); return o > 0 ? fin('stop', k + 1, 'o', o) : fin('stop', k, 'c', c); }
    if (k === last) break;
    const go = []; adds.forEach((a, j) => { if (armed[j] && le(c, e * (1 - a.drop))) go.push(j); });
    if (go.length) { const o = s.o(k + 1); if (o > 0) for (const j of go) { armed[j] = false; units.push({ k: k + 1, px: o, w: adds[j].size }); } } }
  return fin('max', last, 'c', markAt(s, last));
}
// a money-weighted index return for a plan's units: idx(kIn, kOut, at) -> gross return or null; weights = unit money
export function weighted(units, x, at, idx) { let s = 0, w = 0; for (const u of units) { const r = idx(u.k, x, at); if (r === null || r === undefined || !isFinite(r)) return null; s += u.w * r; w += u.w; } return w > 0 ? s / w : null; }
// return per year of capital tied up: sum of (g - cost) x money over the sum of money-years (simple)
export function perYearOf(rows, key = 'g', cost = COST) { const v = rows.filter(z => ok(z[key])); const y = v.reduce((a, z) => a + z.unitYears, 0); return v.length && y > 0 ? v.reduce((a, z) => a + (z[key] - cost) * z.w, 0) / y : null; }
// how many picks failed (survivorship check)
export function failures(rows, cost = COST) { const n = rows.length; if (!n) return { n: 0 }; const net = rows.map(z => z.g - cost), sh = (f) => r4(rows.filter(f).length / n);
  return { n, lost: sh((z, i) => z.g - cost <= 0), lost30: sh(z => z.g - cost <= -0.3), stopped: sh(z => z.kind === 'stop'), dead: sh(z => z.kind === 'dead'), gone: sh(z => z.kind === 'gone'),
    keptFalling: sh(z => z.endVsFirst !== undefined && z.endVsFirst <= -0.2), avgNet: r4(mean(net)), medianNet: r4(median(net)), worstOnTheWay: r4(median(rows.map(z => z.worst))) }; }

// ---- the rules as registered (library text) ----
const COMMON = 'Universe: US companies filing quarterly SEC share counts, one ticker per company, liquid (close >= 5 USD, 20-session traded value >= 5M USD); market cap = close x shares known (30 days late, unadjusted split jumps repaired); industry = SIC 4-digit (current code); LEADER = top 3 by market cap of an industry with 5+ members that day. PLAN: 1 unit at the next open, +0.5 unit at the next open after the first close <= first buy -15%, sell all at the next open after the position is worth <= 65% of the money in (35% disaster stop on the total), else at the close of session 252; one open position per stock. Cost 0.8% per unit (1.2% stress). Judged at the tier-2 standard (both halves before / from 2024-01-01, vs the average stock over the same days, vs the same stocks with the same plan on other days, without the 2 best, block t >= 2.5 on 63-session blocks) plus return per year of capital tied up above the S&P 500 over the same days in both halves. Information: plans ONCE (no add), FORGET (no add, no stop), MONTHLY (+0.1 unit every 21 sessions); SPUS / HLAL per year on the same days; how many picks failed.';
export const RULES = {
  'TIP-DIPLEAD': { name: 'Dip in a leader while the market is afraid', short: 'industry top-3 by market cap, 30%+ under its 52-week high, S&P 500 15%+ under its high, revenue still growing; hold 12 months, add on -15%',
    rule: 'Signal at the close of t: SPY close <= 85% of its highest close of the last 252 sessions; the stock is an industry LEADER; its close <= 70% of its highest close of the last 252 sessions (90%+ of them present); TTM revenue (SEC, filed before t, period ended <= 200 days before) above the TTM a year earlier.' },
  'TIP-THEME': { name: 'Leaders of the hottest industry with accelerating revenue', short: 'each quarter the industry with the best 12-month return whose revenue growth is accelerating; buy its top 3 by market cap; hold 12 months, add on -15%',
    rule: 'At the close of the first session of January, April, July and October: for industries with 5+ members, 12-month return = median 252-session return of the members; revenue accelerating = the median latest-quarter YoY revenue growth (filed before t) above the median prior-quarter YoY growth and above 0 (3+ members with both). THEME = the accelerating industry with the highest 12-month return. Buy its 3 LEADERS.' },
  'TIP-TURN': { name: 'Fallen former leader: decline stopped and someone big buys', short: 'a former industry top-3 near its 3-year low, two quarters of improving revenue growth, and 1M USD+ insider buying or a strategic share sale (8-K item 3.02) in 90 days; hold 12 months',
    rule: 'Signal at the close of t: the stock was an industry LEADER at any month-start formation in the 756 sessions before t (from the data start, Oct 2021); close <= 110% of its lowest close of the previous 756 sessions (about 3 years; Massive daily history before the cache window; 90%+ present); the latest three quarterly YoY revenue growth figures filed before t rising (two quarters of improvement, value-core growthRun); and, filed in the 90 days before t, open-market insider purchases (Form 4 code P) of 1M USD+ in total OR an 8-K with Item 3.02 (unregistered sale of equity: a strategic / private investment).' },
};
for (const id of Object.keys(RULES)) RULES[id + '-100'] = { name: RULES[id].name + ' (100 largest only)', short: RULES[id].short + '; only the 100 largest US companies that day', rule: RULES[id].rule + ' AND the stock is among the 100 largest universe members by market cap that day.' };
export const IDS = Object.keys(RULES);
// library pre-registration (idempotent): adds every missing TIP-* entry; returns how many were added
export function preRegister(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Tipster style (decoded)', name: r.name, explain: r.short + '. RULE: ' + r.rule + ' ' + COMMON,
      status: 'pre-registered 24 Oct 2026 (tipster lab); 5-year one-shot pending', agent: 'tipster',
      libraryCheck: 'Overlaps: HOLD-AVGDOWN (averaging down on any / quality stocks: not proven), ANOM-52WH / DEC-FROG / ANOM-RESMOM (momentum: the opposite side, buying strength), M13 (strong stock dips in a weak market: autolab near miss), T22 / B-SIF1 / CHAIN-MOM1 / ANOM-INDMOM (industry strength), E3 / ANOM-INSIDER / C-INS3 (insider buying). New here: market-cap DOMINANCE of an industry as the filter, market-wide fear as the timing, 12-month holds with one add, and the strategic-investment trigger.',
      note: 'Pre-registered 24 Oct 2026 BEFORE any run (tipster-core.mjs = the exact rule; hold 252 sessions). 5-year one-shot by tipster-lab.mjs, first complete verdict frozen in data/tipster-lab.json; forward paper lane (data/tipster-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = '2026-10-24'; return ch; }
