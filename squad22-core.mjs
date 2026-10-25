// SQUAD 22 CORE (25 Oct 2026; Stock-2): new-mechanism rules under the owner's ANTI-FIXATION rules (adopted 25 Oct 2026: only genuinely new
// mechanisms on data not yet used this way; no variants of failed or live rules; one primary hypothesis per family; the 9 live rules frozen
// for 4 weeks). Pure functions, no network, no files. Used by squad22-lab.mjs and test/squad22-core.test.mjs. Long only; no leverage; no
// shorting; never places an order; never gives a halal ruling.
//
// LIBRARY CHECK (data/strategy-library.json read 25 Oct 2026 BEFORE writing this; ~700 entries):
//   - ANOM-13D (original SC 13D, buy next open, hold 63) was tested 23 Oct and REJECTED in both halves (edge -3.9% / -3.4% a trade, block t
//     -3.18 / -1.15). The requested SQ22-13D (first-ever SC 13D by that filer, $2+ / $2M+, no 424B5/S-1/S-3 in 20 sessions, stop 15%) is the
//     same event with extra filters and a stop = a VARIANT OF A FAILED RULE. Under the anti-fixation rules it is NOT run (no 13G information
//     version either): registered in the library as 'not run: duplicate of ANOM-13D'.
//   - ANOM-SPIN (Form 10-12B new company, buy its 2nd session, hold 126) was TOO FEW CASES (21 / 17). SQ22-SPINOFF changes the mechanism
//     (buy AFTER the index-fund forced-selling window, the 21st session) and adds 10-12G. It is run COUNT FIRST: the cases per half are counted
//     before any return is computed; under 20 in a half -> TOO FEW CASES and no return is computed at all.
//   - ANOM-ACC (low accrual LEVEL decile) and ANOM-CFOA (cash profitability LEVEL decile) were REJECTED. SQ22-CASHCONV is an EVENT (the filing
//     that completes a two-quarter RISE of cash conversion to >= 1, with gross margin up and no dilution), not a level sort; it must also beat
//     V15 (F-score uptrend, which already holds 'cash flow > net income') bought and sold on the same sessions.
//   - SQ22-NEGLECTED is the owner's outside reviewer's rule, registered AS WRITTEN. Related failures (not the same rule): M8 (1-year low + heavy
//     volume + no dilution, failed discovery), DEC-CRASH (crashed 50%+ then stabilising, rejected), DEC-EP (10% gap on 3x volume, rejected).
//     New here: the stock must be in the market's least-traded third, the volume burst must be 2x-3x (not more), the up day +4%..+15% closing
//     in the top quarter of its range, at a 52-week low base with no lower low for 10 sessions, clean supply. Its own yardstick (an extra gate):
//     the same day's crashed, neglected stocks WITHOUT the volume burst.
//   - NOT TESTABLE: REV-QUALITY (needs point-in-time analyst estimate history), SUPPLIER-ASIA (needs a capital-spending headline history and
//     Asian listings). BUYBACK-INSIDER-CASH overlaps C-INSQ1 (Agent C): left to Agent C; its 'NOT SIC 35/36/38' clause comes from V15's own
//     past losses (fitted to the result) and must not be used.
//
// THE STANDARD (all tested rules; never lowered): whole market 5 years incl. dead stocks (the Sunday price cache, under-3-USD rows kept);
//   entry next open; 0.8% round trip (1.2% stress); halves = signal before / from 2024-01-01; value-core judge via hold-core judgeHold: in
//   BOTH halves > 0 after 0.8% and 1.2%, better than the average liquid stock (close 5+, 5M USD+ a day; every second one) over the same
//   sessions, better than the same stock on its other days (windows of the same length), > 0 without its 2 best trades, 20+ trades and 3+
//   blocks, block t >= 2.5 -> TRADABLE SMALL (>= the proof bar -> PROVEN); return per year of capital tied up above SPY on the same days.
//   Every gross return, the rule's and every yardstick's, capped at +300% (AUD-1). Companies are tied to stocks by CIK and the point-in-time
//   ticker (SEC Form 3/4/5 issuer-ticker spans), then today's SEC list - never today's list alone. One open trade per stock. A trade whose
//   path holds a whole-ratio 3x-50x one-day jump (an unadjusted split) is left out (squad 4 / 6 convention). Each rule run ONCE; the first
//   complete verdict is frozen (first-run.mjs freezeEach).
//
// ================= RULE 1: SQ22-CASHCONV (Value; PRE-REGISTERED 25 Oct 2026 BEFORE ANY RESULT; one version) =================================
// DATA: SEC XBRL company facts (bulk companyfacts.zip), each fact with its FILED date; a fact counts only from the day AFTER it was filed
//   (value-core.mjs point in time; a later filing of the same period replaces the figure from its own filing day).
// EVENT: a filing date F of a company (CIK) on which the latest trailing-12-month (TTM) operating cash flow period end E0 becomes known for
//   the first time (it was not known before F), E0 no more than 200 days before F. At F (facts filed on or before F):
//   a. cash conversion r = TTM operating cash flow / TTM net income at the quarter ends E2 < E1 < E0 (each 80-100 days apart; the same tag
//      for all three; TTM by value-core ttmAt: a 10-K year, or YTD + last year - prior YTD, or 4 discrete quarters); TTM net income > 0 at all
//      three; r(E2) < r(E1) < r(E0) and r(E0) >= 1.0 (so TTM operating cash flow > 0);
//   b. TTM gross margin at E0 > TTM gross margin at the period end one year earlier (within 15 days): gross profit / revenue (GrossProfit),
//      else (revenue - cost of revenue) / revenue; the same tags in both years; revenue > 0; unknown = not passed;
//   c. weighted diluted shares (WeightedAverageNumberOfDilutedSharesOutstanding) of the period ending E0 (the 3-month figure, else the
//      12-month one) up no more than 2% on the same-length period ending one year earlier (within 10 days); unknown = not passed.
// TRADE: the stock (point-in-time ticker of the CIK on F) must on the last session BEFORE the entry close >= 5 USD with a 20-session average
//   traded value >= 5M USD. BUY the open of the first session after F (valid that session only). STOP 35% under the entry: a session that
//   OPENS at or under 0.65 x entry sells at that open, otherwise a low at or under it sells at the stop. Else SELL at the close of the 126th
//   session (counting the entry session). A stock that stops trading: its last close.
// EXTRA GATE (must add something beyond the F-score): in BOTH halves the average trade after 0.8% must be above V15 picks bought and sold on
//   the SAME sessions (V15 = quality.mjs F-SCORE UPTREND as it runs live: liquid, non-financial, F-score 8-9 from the yearly SEC frames known
//   on the day, close above its 200-day average; if fewer than 10 score 8+, the 10 best scores).
// Blocks of 126 sessions (the hold).
//
// ================= RULE 2: SQ22-SPINOFF (Value; PRE-REGISTERED 25 Oct 2026 BEFORE ANY RESULT; one version; COUNT FIRST) ======================
// CASES: a CIK filing an original Form 10-12B or 10-12G (EDGAR quarterly master index, 2020 on; amendments ignored, the first filing date
//   kept) whose point-in-time ticker FIRST trades in the price data on or after that filing date and within 400 days of it (when-issued
//   lines are not in the data, so the first session = the first regular-way session s1; delisted stocks stay in). BUY the open of session
//   s1 + 20 (the 21st session: after the index funds' forced selling) if on session s1 + 19 the close >= 5 USD and the 20-session average
//   traded value >= 5M USD (sessions s1..s1+19 all traded). STOP 35% under the entry, else sell at the close of the 126th session.
//   Halves by entry date. COUNT FIRST: if either half holds fewer than 20 cases, the verdict is TOO FEW CASES and NO return is computed.
//   Blocks of 126 sessions.
//
// ================= RULE 3: SQ22-NEGLECTED (Timing; the owner's outside reviewer; PRE-REGISTERED AS WRITTEN 25 Oct 2026) ====================
// SIGNAL at the close of session t, ALL of:
//   a. 63-session return c[t] / c[t-63] - 1 <= -30%;
//   b. 20-session average traded value (close x volume) below the 33rd percentile of all stocks that day (every stock with 20 traded sessions);
//   c. volume[t] >= 2x and < 3x the average volume of the 50 sessions before t;
//   d. close in the top 25% of the day's range: (c - l) / (h - l) >= 0.75 (h > l);
//   e. close +4% to +15% (inclusive) on the prior close;
//   f. SEC share count known on t (30 days late) up < 5% on the count known 90 days earlier (both known), and no Form 424B5 or S-1 by the
//      CIK filed in sessions t-19..t;
//   g. close within 5% of the 52-week low close: c[t] <= 1.05 x the lowest close of sessions t-251..t (240+ closes present);
//   h. no lower low in the last 10 sessions: the lowest low of t-9..t is not below the lowest low of t-251..t-10;
//   i. close >= 1 USD and 20-session average traded value >= 0.5M USD.
// TRADE: BUY the open of t+1 (that session only). STOP = the low of t (open at or under it: sell at that open; a low at or under it: sell at
//   the stop). EXIT at the next open after a close below the 10-session average close; else at the close of the 21st session. Blocks of 21.
// EXTRA GATE (the reviewer's yardstick): better, in both halves, than the SAME DAY's crashed neglected stocks WITHOUT the volume burst:
//   stocks meeting a, b, g and i on t with volume[t] < 2x their 50-session average (not signals), bought at the same open and sold at the
//   trade's last close (10+ such stocks needed, else that trade has no value for this gate).
//
// Halves, per-year and signals-per-month are reported for every tested rule.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', CAP = 3, YEAR = 252, REG_DATE = '2026-10-25';
export const TH = {
  cash: { minClose: 5, minDv: 5e6, hold: 126, stop: 0.35, rMin: 1.0, dilMax: 0.02, stale: 200, block: 126 },
  spin: { minClose: 5, minDv: 5e6, hold: 126, stop: 0.35, wait: 20, within: 400, block: 126, minPerHalf: 20 },
  negl: { r63: -0.30, pct: 0.33, volLo: 2, volHi: 3, top: 0.75, upLo: 0.04, upHi: 0.15, shareUp: 0.05, dilSess: 20, near: 0.05, noLow: 10, minClose: 1, minDv: 0.5e6, maxHold: 21, block: 21, ctlMin: 10 },
};
const P = (cite, url) => ({ cite, url });
export const RULES = {
  'SQ22-CASHCONV': { family: 'Value', hold: TH.cash.hold, block: TH.cash.block, name: 'Cash-conversion inflection: operating cash flow / net income rising 2 quarters to 1.0+, gross margin up, no dilution (SEC filing date)',
    papers: [P('Sloan (1996) Do Stock Prices Fully Reflect Information in Accruals and Cash Flows about Future Earnings? The Accounting Review 71(3)', 'https://www.jstor.org/stable/248290'), P('Piotroski (2000) Value Investing, Journal of Accounting Research 38 (cash flow > net income as one of 9 checks)', 'https://doi.org/10.2307/2672906')],
    lib: 'ANOM-ACC (accrual level decile: rejected), ANOM-CFOA (cash profitability level: rejected), V15 (F-score uptrend: live). New: a filing-date EVENT of a two-quarter rise in cash conversion to 1.0+, with gross margin up and diluted shares flat; must beat V15 on the same sessions.' },
  'SQ22-SPINOFF': { family: 'Value', hold: TH.spin.hold, block: TH.spin.block, name: 'Spin-off bought on its 21st regular-way session (after index-fund selling), hold 126, stop 35%',
    papers: [P('Cusatis, Miles & Woolridge (1993) Restructuring through spinoffs, Journal of Financial Economics 33(3)', 'https://doi.org/10.1016/0304-405X(93)90011-Z'), P('Greenblatt (1997) You Can Be a Stock Market Genius (forced selling of spin-offs by index funds)', null)],
    lib: 'ANOM-SPIN (10-12B, 2nd session: TOO FEW CASES 21 / 17), E7 / DEC2-SPINOFF (queued / needs data). New: entry after the forced-selling window, 10-12G added, liquid 5 USD / 5M USD. Count first.' },
  'SQ22-NEGLECTED': { family: 'Timing', hold: TH.negl.maxHold, block: TH.negl.block, name: 'Neglected-then-noticed: crashed, least-traded third, at a 52-week-low base, +4-15% up day on 2-3x volume closing strong; stop the day low, exit under the 10-day average, max 21',
    papers: [P('Outside reviewer to the owner, 25 Oct 2026 (rule text as given)', null), P('Gervais, Kaniel & Mingelgrin (2001) The High-Volume Return Premium, Journal of Finance 56(3)', 'https://doi.org/10.1111/0022-1082.00349')],
    lib: 'M8 (1-year low + heavy volume + no dilution: failed discovery), DEC-CRASH (rejected), DEC-EP (rejected), UNDER5-JUMP (too few). New: least-traded third, 2-3x volume band, strong up-day close, 52-week-low base with no lower low for 10 sessions; yardstick = same-day crashed stocks without the burst.' },
};
export const TEST_IDS = Object.keys(RULES);
export const NOT_RUN = [
  { id: 'SQ22-13D', name: 'First-ever SC 13D by the filer (activist ownership disclosure), clean supply, hold 63, stop 15%', status: 'not run: duplicate of ANOM-13D (rejected 23 Oct 2026)',
    why: 'ANOM-13D (original SC 13D, next open, hold 63) was REJECTED in both halves (edge -3.9% / -3.4% a trade). A first-ever 13D is in practice the same original filing; adding liquidity, supply filters and a stop makes a variant of a failed rule, which the owner\'s anti-fixation rules (25 Oct 2026) forbid. The 13G (passive) information version is not run either.' },
  { id: 'REV-QUALITY', name: 'Revenue quality (owner reviewer)', status: 'needs data', why: 'needs a point-in-time history of analyst revenue estimates (what the consensus was on each past day); the system has only today\'s estimates' },
  { id: 'SUPPLIER-ASIA', name: 'Asian supplier of a capex announcer (owner reviewer)', status: 'needs data', why: 'needs a dated history of capital-spending headlines and Asian listings with prices; the US price data has neither' },
  { id: 'BUYBACK-INSIDER-CASH', name: 'Buyback + insider buying + cash-rich (owner reviewer)', status: 'left to Agent C (overlaps C-INSQ1)', why: 'overlaps C-INSQ1 (insider cluster + cash-rich quality, queued for Agent C). Its "NOT SIC 35/36/38" clause comes from V15\'s own past losses (fitted to the result) and must not be used.' },
];

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoMs = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoMs(ms(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
const near = (a, b, tol) => Math.abs(daysBetween(a, b)) <= tol;
export const shiftYear = (d, n = -1) => (+d.slice(0, 4) + n) + d.slice(4);

// ---------------- SEC XBRL facts (point in time) ----------------
// compact company facts: { tag: [[start, end, value, filed]] } for the tags below (USD; diluted shares in 'shares'), periods ending 2019+
export const XTAGS = { ni: ['NetIncomeLoss', 'ProfitLoss'], cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'],
  gp: ['GrossProfit'], cogs: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'], dil: ['WeightedAverageNumberOfDilutedSharesOutstanding'] };
export function compactFacts(j) { const out = {}, g = j && j.facts && j.facts['us-gaap']; if (!g) return out;
  for (const tag of [...new Set(Object.values(XTAGS).flat())]) { const u = g[tag] && g[tag].units && (tag === 'WeightedAverageNumberOfDilutedSharesOutstanding' ? g[tag].units.shares : g[tag].units.USD); if (!Array.isArray(u)) continue;
    const rows = [], seen = new Set(); for (const x of [...u].sort((a, b) => a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : 0)) { if (!x || !x.end || !x.filed || !ok(x.val) || x.end < '2019-01-01') continue;
      const k = (x.start || '') + '|' + x.end + '|' + x.val; if (seen.has(k)) continue; seen.add(k); rows.push([x.start || '', x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; } return out; }
// rows -> fact objects
export const factsOf = (rows) => (rows || []).map(([s, e, v, f]) => ({ s, e, v, f }));
// the latest-filed value of every DURATION period known before asOf -> [{ s, e, v, d }]
function knownDur(facts, asOf, maxEnd) { const m = new Map(), when = new Map();
  for (const x of facts || []) { if (!x || !x.s || !(x.f < asOf) || !ok(x.v) || (maxEnd && x.e > maxEnd)) continue; const k = x.s + '|' + x.e; if (!when.has(k) || x.f >= when.get(k)) { when.set(k, x.f); m.set(k, { s: x.s, e: x.e, v: x.v, d: daysBetween(x.s, x.e) + 1 }); } }
  return [...m.values()]; }
const isYear = (p) => p.d >= 350 && p.d <= 380, isQuarter = (p) => p.d >= 80 && p.d <= 100;
// TTM at the latest period end <= maxEnd known before asOf (value-core ttmAt logic): { end, val } or null
export function ttm(facts, asOf, maxEnd) { const P = knownDur(facts, asOf, maxEnd); if (!P.length) return null;
  const E = P.reduce((a, p) => p.e > a ? p.e : a, ''), atE = P.filter(p => p.e === E);
  const yr = atE.find(isYear); if (yr) return { end: E, val: yr.v };
  for (const p of atE.filter(q => q.d >= 80 && q.d < 350).sort((a, b) => b.d - a.d)) {
    const fy = P.find(q => isYear(q) && near(q.e, addDays(p.s, -1), 5)), prior = P.find(q => near(q.e, shiftYear(E), 7) && Math.abs(q.d - p.d) <= 10);
    if (fy && prior) return { end: E, val: p.v + fy.v - prior.v }; }
  const qs = []; let e = E; for (let k = 0; k < 4; k++) { const q = P.find(z => isQuarter(z) && near(z.e, e, 5)); if (!q) break; qs.push(q); e = addDays(q.s, -1); }
  return qs.length === 4 ? { end: E, val: qs.reduce((a, q) => a + q.v, 0) } : null; }
// TTM whose period end is `end` (within 5 days) or null
export const ttmEnding = (facts, asOf, end) => { const a = ttm(facts, asOf, addDays(end, 5)); return a && near(a.end, end, 5) ? a : null; };
// a diluted share figure for the period ending `end` (the 3-month one, else the 12-month one) -> { v, d } or null
export function dilAt(facts, asOf, end, want = null) { const P = knownDur(facts, asOf).filter(p => near(p.e, end, want ? 10 : 5));
  const q = P.find(p => isQuarter(p) && (!want || want === 'q')), y = P.find(p => isYear(p) && (!want || want === 'y'));
  return q ? { v: q.v, d: 'q' } : y ? { v: y.v, d: 'y' } : null; }
const each = (m) => Object.entries(m || {}).filter(([, f]) => f && f.length);
// RULE 1 check at filing date F. co = { ni|cfo|rev|gp|cogs|dil: { tag: facts } } -> { ok, why, E0, r, gm, dil }
export function cashConvAt(co, F) { const asOf = addDays(F, 1), out = { ok: false, why: null, E0: null, r: null, gm: null, dil: null }, no = (w) => ({ ...out, why: w });
  let cf = null; for (const [tag, f] of each(co.cfo)) { const a = ttm(f, asOf); if (a) { cf = { tag, f, a }; break; } }
  if (!cf) return no('no operating cash flow'); const E0 = cf.a.end; out.E0 = E0;
  if (daysBetween(E0, F) > TH.cash.stale || daysBetween(E0, F) < 0) return no('stale');
  const before = ttm(cf.f, F); if (before && before.end >= E0) return no('not a new quarter');
  const ends = [E0]; for (let k = 1; k < 3; k++) { const a = ttm(cf.f, asOf, addDays(ends[k - 1], -20)); if (!a) return no('no earlier quarter'); const dd = daysBetween(a.end, ends[k - 1]); if (dd < 80 || dd > 100) return no('quarters not 3 months apart'); ends.push(a.end); }
  const cfo = ends.map(e => { const a = ttmEnding(cf.f, asOf, e); return a ? a.val : null; }); if (cfo.some(v => v === null)) return no('cash flow gap');
  let ni = null; for (const [, f] of each(co.ni)) { const v = ends.map(e => { const a = ttmEnding(f, asOf, e); return a ? a.val : null; }); if (v.every(x => x !== null)) { ni = v; break; } }
  if (!ni) return no('no net income'); if (!ni.every(x => x > 0)) return no('net income not positive');
  const r = cfo.map((v, k) => v / ni[k]); out.r = r.map(r4);
  if (!(r[2] < r[1] && r[1] < r[0])) return no('cash conversion not rising'); if (!(r[0] >= TH.cash.rMin)) return no('cash conversion under 1');
  const Ey = shiftYear(E0); let gm = null;
  for (const [, rf] of each(co.rev)) { const a0 = ttmEnding(rf, asOf, E0), ay = ttm(rf, asOf, addDays(Ey, 15)); if (!a0 || !ay || !near(ay.end, Ey, 15) || !(a0.val > 0) || !(ay.val > 0)) continue;
    for (const [, gf] of each(co.gp)) { const g0 = ttmEnding(gf, asOf, a0.end), gy = ttmEnding(gf, asOf, ay.end); if (g0 && gy) { gm = [g0.val / a0.val, gy.val / ay.val]; break; } }
    if (!gm) for (const [, cg] of each(co.cogs)) { const c0 = ttmEnding(cg, asOf, a0.end), cy = ttmEnding(cg, asOf, ay.end); if (c0 && cy) { gm = [1 - c0.val / a0.val, 1 - cy.val / ay.val]; break; } }
    if (gm) break; }
  if (!gm) return no('no gross margin'); out.gm = gm.map(r4); if (!(gm[0] > gm[1])) return no('gross margin not up');
  let dil = null; for (const [, f] of each(co.dil)) { const a = dilAt(f, asOf, E0); if (!a) continue; const b = dilAt(f, asOf, Ey, a.d); if (b && b.v > 0 && a.v > 0) { dil = a.v / b.v - 1; break; } }
  if (dil === null) return no('no diluted shares'); out.dil = r4(dil); if (!(dil <= TH.cash.dilMax)) return no('diluted shares up');
  return { ...out, ok: true }; }
// candidate filing dates of a company: every distinct filed date of an operating-cash-flow fact on or after `from`
export function filingDates(co, from) { const s = new Set(); for (const [, f] of each(co.cfo)) for (const x of f) if (x.f >= from) s.add(x.f); return [...s].sort(); }

// ---------------- V15 (quality.mjs F-SCORE UPTREND, reproduced) ----------------
const num = (...v) => v.every(u => ok(u));
// c = fund cache company { year: { ni, cfo, assets, ltd, acur, lcur, gp, rev, rev2 } }, y = the fiscal year known, s1 / s0 = share counts
export function v15Fscore(c, y, s1, s0) { if (!c || !c[y] || !c[y - 1] || !c[y - 2]) return null; const a = c[y], b = c[y - 1], z = c[y - 2];
  if (!num(a.ni, b.ni, a.cfo, a.ltd, b.ltd, a.acur, b.acur, a.gp, b.gp) || !(a.assets > 0 && b.assets > 0 && z.assets > 0) || !(a.lcur > 0 && b.lcur > 0)) return null;
  const rk = num(a.rev, b.rev) ? 'rev' : num(a.rev2, b.rev2) ? 'rev2' : null; if (!rk || !(a[rk] > 0 && b[rk] > 0)) return null;
  if (!(s1 > 0 && s0 > 0)) return null;
  const chk = [a.ni > 0, a.cfo > 0, a.ni / b.assets > b.ni / z.assets, a.cfo > a.ni, a.ltd / ((a.assets + b.assets) / 2) < b.ltd / ((b.assets + z.assets) / 2),
    a.acur / a.lcur > b.acur / b.lcur, s1 <= s0, a.gp / a[rk] > b.gp / b[rk], a[rk] / b.assets > b[rk] / z.assets];
  return chk.filter(Boolean).length; }
export const v15Year = (d) => { const y = +d.slice(0, 4); return d.slice(5) >= '04-10' ? y - 1 : y - 2; };
// rows [{ key, fs }] (already liquid, non-financial, above the 200-day) -> the picked keys: every 8+, else the 10 best scores
export function v15Pick(rows) { const a = rows.filter(r => ok(r.fs)).sort((x, y) => y.fs - x.fs), hi = a.filter(r => r.fs >= 8); return (hi.length >= 10 ? hi : a.slice(0, 10)).map(r => r.key); }

// ---------------- prices ----------------
// S = { o, h, l, c, v } arrays (NaN = no bar)
// fixed hold with a percentage stop: bought at the open of k, stop px = (1 - stop) x entry -> { x, px, kind, held, lastClose } | { open, mark } | null
export function exitHold(S, k, stopFrac, hold, T = S.c.length) { const { o, l, c } = S, e = o[k]; if (!(e > 0)) return null; const stop = e * (1 - stopFrac);
  let last = -1; for (let q = T - 1; q >= 0; q--) if (c[q] > 0) { last = q; break; } const gone = last < T - 6; let lastQ = k;
  for (let q = k; q <= k + hold - 1; q++) { if (q >= T) return { open: true, k, mark: c[lastQ] > 0 ? c[lastQ] / e - 1 : null, lastQ };
    if (gone && q > last) return { x: last, px: c[last], kind: 'gone', held: Math.max(1, last - k + 1), lastClose: last };
    if (!(o[q] > 0) && !(c[q] > 0)) continue;
    if (q > k && o[q] > 0 && o[q] <= stop) return { x: q, px: o[q], kind: 'stop', held: q - k, lastClose: lastQ };
    if (l[q] > 0 && l[q] <= stop) return { x: q, px: stop, kind: 'stop', held: q - k + 1, lastClose: q };
    if (c[q] > 0) lastQ = q;
    if (q === k + hold - 1) return { x: q, px: c[lastQ], kind: 'max', held: hold, lastClose: lastQ }; }
  return { open: true, k, mark: c[lastQ] > 0 ? c[lastQ] / e - 1 : null, lastQ }; }
// the exit of RULE 3: stop = the signal-day low, next open after a close below the 10-session average, else the close of the 21st session
export function exitNegl(S, k, stop, T = S.c.length, maxHold = TH.negl.maxHold) { const { o, l, c } = S, e = o[k]; if (!(e > 0)) return null;
  let last = -1; for (let q = T - 1; q >= 0; q--) if (c[q] > 0) { last = q; break; } const gone = last < T - 6;
  if (e <= stop) return { x: k, px: e, kind: 'stop', held: 1, lastClose: k };
  const closes = []; for (let q = Math.max(0, k - 30); q < k; q++) if (c[q] > 0) closes.push(c[q]);
  let pending = false, lastQ = k;
  for (let q = k; q <= k + maxHold - 1; q++) { if (q >= T) return { open: true, k, mark: c[lastQ] > 0 ? c[lastQ] / e - 1 : null, lastQ };
    if (gone && q > last) return { x: last, px: c[last], kind: 'gone', held: Math.max(1, last - k + 1), lastClose: last };
    if (!(o[q] > 0) && !(c[q] > 0)) continue;
    if (pending && o[q] > 0) return { x: q, px: o[q], kind: 'ma', held: q - k, lastClose: lastQ };
    if (q > k && o[q] > 0 && o[q] <= stop) return { x: q, px: o[q], kind: 'stop', held: q - k, lastClose: lastQ };
    if (l[q] > 0 && l[q] <= stop) return { x: q, px: stop, kind: 'stop', held: q - k + 1, lastClose: q };
    if (!(c[q] > 0)) continue; lastQ = q; closes.push(c[q]);
    if (q === k + maxHold - 1) return { x: q, px: c[q], kind: 'max', held: maxHold, lastClose: q };
    if (closes.length >= 10) { const w = closes.slice(-10), m = w.reduce((a, b) => a + b, 0) / 10; if (c[q] < m) pending = true; } }
  return { open: true, k, mark: c[lastQ] > 0 ? c[lastQ] / e - 1 : null, lastQ }; }
// the q-quantile of numbers (linear between ranks) or null
export function quantile(v, q) { const a = v.filter(ok).sort((x, y) => x - y); if (!a.length) return null; const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return a[lo] + (a[hi] - a[lo]) * (p - lo); }
// RULE 3 base conditions a, b, g, i (crashed, neglected, at a 52-week-low close, tradable) at t; dv20 = 20-session average traded value, p33 = that day's 33rd percentile
export function crashedBase(S, t, dv20, p33) { const { c } = S, N = TH.negl; if (t < 252 || !(c[t] >= N.minClose) || !(dv20 >= N.minDv) || !(p33 > 0) || !(dv20 < p33)) return false;
  if (!(c[t - 63] > 0) || !(c[t] / c[t - 63] - 1 <= N.r63)) return false;
  let lo = Infinity, n = 0; for (let k = t - 251; k <= t; k++) if (c[k] > 0) { n++; if (c[k] < lo) lo = c[k]; } if (n < 240) return false;
  return c[t] <= (1 + N.near) * lo; }
// average volume of the 50 sessions before t (all 50 present) or null
export function vavg50(v, t) { if (t < 50) return null; let s = 0; for (let k = t - 50; k < t; k++) { if (!(v[k] >= 0)) return null; s += v[k]; } return s / 50; }
// RULE 3 price conditions (c, d, e, h) on top of the base; the supply conditions (f) are checked by the caller
export function neglPrice(S, t) { const { h, l, c, v } = S, N = TH.negl, va = vavg50(v, t); if (!(va > 0) || !(v[t] >= N.volLo * va) || !(v[t] < N.volHi * va)) return false;
  if (!(h[t] > l[t]) || !((c[t] - l[t]) / (h[t] - l[t]) >= N.top)) return false;
  if (!(c[t - 1] > 0)) return false; const up = c[t] / c[t - 1] - 1; if (!(up >= N.upLo && up <= N.upHi)) return false;
  let a = Infinity, b = Infinity; for (let k = t - N.noLow + 1; k <= t; k++) if (l[k] > 0) a = Math.min(a, l[k]); for (let k = t - 251; k <= t - N.noLow; k++) if (l[k] > 0) b = Math.min(b, l[k]);
  return isFinite(a) && isFinite(b) && a >= b; }
// DIAGNOSTIC ONLY (coverage check, no returns): the first RULE 3 price condition that fails at t, or null when all pass
export function neglWhy(S, t) { const { h, l, c, v } = S, N = TH.negl, va = vavg50(v, t); if (!(va > 0)) return 'no 50-session volume'; if (!(v[t] >= N.volLo * va)) return 'volume under 2x'; if (!(v[t] < N.volHi * va)) return 'volume 3x+';
  if (!(h[t] > 0) || !(l[t] > 0)) return 'no high/low'; if (!(h[t] > l[t])) return 'no range'; if (!((c[t] - l[t]) / (h[t] - l[t]) >= N.top)) return 'close not in the top quarter';
  if (!(c[t - 1] > 0)) return 'no prior close'; const up = c[t] / c[t - 1] - 1; if (!(up >= N.upLo && up <= N.upHi)) return 'up day not +4..15%';
  return neglPrice(S, t) ? null : 'lower low in the last 10 sessions'; }
// the yardstick of RULE 3: base true and volume < 2x its 50-session average
export function quietCrashed(S, t) { const va = vavg50(S.v, t); return va > 0 && S.v[t] >= 0 && S.v[t] < TH.negl.volLo * va; }
// share count growth: count known on d (lag days late) vs the count known `days` earlier -> fraction or null
export function sharesUp(series, d, days = 90, lag = 30) { const at = (x) => { const lim = addDays(x, -lag); let v = null; for (const [e, n] of series || []) if (e <= lim) v = n; return v; };
  const a = at(d), b = at(addDays(d, -days)); return a > 0 && b > 0 ? a / b - 1 : null; }
export function dilutedAt(dates, t, sessOf, n) { for (const d of dates || []) { const s = sessOf(d); if (s >= t - n + 1 && s <= t) return true; } return false; }

// ---------------- RULE 2 cases ----------------
// forms: [[cik, form, date]] (10-12B / 10-12G originals); firstTrade(cik, date) -> first session index of its point-in-time ticker or -1;
// D = session dates -> [{ cik, form, filed, s1 }] one per CIK (the earliest filing whose stock first trades on/after it, within 400 days)
export function spinCases(forms, firstTrade, D) { const by = new Map(); for (const [cik, form, d] of forms) { if (form !== '10-12B' && form !== '10-12G') continue; const o = by.get(cik); if (!o || d < o.d) by.set(cik, { d, form }); }
  const out = []; for (const [cik, { d, form }] of by) { const s1 = firstTrade(cik, d); if (s1 < 0 || s1 >= D.length) continue; if (D[s1] < d || daysBetween(d, D[s1]) > TH.spin.within) continue; out.push({ cik, form, filed: d, s1 }); }
  return out.sort((a, b) => a.s1 - b.s1); }

// ---------------- reporting ----------------
export function perMonth(dates, from, to) { const by = {}; for (let y = +from.slice(0, 4), m = +from.slice(5, 7); y * 12 + m <= +to.slice(0, 4) * 12 + +to.slice(5, 7); m === 12 ? (y++, m = 1) : m++) by[y + '-' + String(m).padStart(2, '0')] = 0;
  for (const d of dates) { const k = d.slice(0, 7); if (k in by) by[k]++; } const v = Object.values(by), s = [...v].sort((a, b) => a - b);
  return { months: v.length, mean: r4(mean(v)), median: s.length ? s[s.length >> 1] : null, min: v.length ? s[0] : null, max: v.length ? s[s.length - 1] : null, zeroMonths: v.filter(x => x === 0).length, byMonth: by }; }
export function perYear(rows, key = 'g', cost = COST) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
export function shapeOf(tr) { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), kinds = {};
  for (const z of tr) kinds[z.kind] = (kinds[z.kind] || 0) + 1;
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null, avgHeld: r4(mean(tr.map(z => z.days))), exits: kinds }; }
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(net.filter(x => x > 0).length / rows.length) : null, avg: rows.length ? r4(mean(net)) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null }; }

// ---------------- library (before any run; idempotent, append only) ----------------
const EXPLAIN = {
  'SQ22-CASHCONV': 'RULE (squad22-core.mjs header RULE 1, exact): on the SEC filing date F that first makes a new quarter end E0 known (companyfacts filed dates; usable the day after): TTM operating cash flow / TTM net income at E2 < E1 < E0 (3 months apart) strictly rising and >= 1.0 at E0, TTM net income > 0 at all three; TTM gross margin at E0 above a year earlier; weighted diluted shares of the E0 period up <= 2% on a year earlier. Liquid (close 5 USD+, 20-day traded value 5M USD+) the session before entry. Buy the next open after F; stop 35% under the entry; else sell at the close of the 126th session. Extra gate: beat V15 picks bought and sold on the same sessions in both halves. Yardsticks: average stock same days; same stock other days; per year vs SPY.',
  'SQ22-SPINOFF': 'RULE (squad22-core.mjs header RULE 2, exact): a CIK filing an original Form 10-12B / 10-12G (EDGAR master index) whose point-in-time ticker first trades on/after the filing date and within 400 days (first regular-way session s1; delisted kept). Buy the open of s1+20 if at s1+19 close 5 USD+ and 20-session traded value 5M USD+; stop 35%; else sell at the close of the 126th session. COUNT FIRST: under 20 cases in a half -> TOO FEW CASES, no return computed.',
  'SQ22-NEGLECTED': 'RULE (owner\'s outside reviewer, as written; squad22-core.mjs header RULE 3): 63-session return <= -30%; 20-day traded value below that day\'s market 33rd percentile and >= 0.5M USD; close 1 USD+; volume >= 2x and < 3x its prior 50-session average; close in the top 25% of the range; close +4% to +15%; SEC share count up < 5% in 90 days (30-day lag) and no 424B5 / S-1 in 20 sessions; close within 5% of the 52-week low close; no lower low in the last 10 sessions (vs t-251..t-10). Buy the next open (1 session); stop the signal-day low; exit the next open after a close under the 10-day average, else after 21 sessions. Extra yardstick: same-day crashed neglected stocks without the 2x volume.',
};
export function preRegister(LB, date = REG_DATE) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  const add = (e) => { if (LB.strategies.some(x => x.id === e.id)) return; LB.strategies.push(e); ch++; };
  for (const id of TEST_IDS) add({ id, family: 'Squad 22 (new mechanisms, ' + RULES[id].family + ')', name: RULES[id].name, agent: 'squad22', kind: 'buy', hold: RULES[id].hold, explain: EXPLAIN[id],
    status: 'pre-registered ' + date + ' (squad 22 lab); 5-year one-shot pending', libraryCheck: RULES[id].lib, sources: RULES[id].papers.map(p => p.url).filter(Boolean),
    note: 'Pre-registered ' + date + ' BEFORE any run (one version); run ONCE by squad22-lab.mjs, first complete verdict frozen in data/squad22-lab.json firstRun.' });
  for (const x of NOT_RUN) add({ id: x.id, family: 'Squad 22 (new mechanisms)', name: x.name, agent: 'squad22', kind: 'buy', status: x.status, explain: x.why + '.', sources: [], note: 'Listed ' + date + ' by squad 22 so it is not lost or repeated.' });
  if (ch) LB.updated = date; return ch; }
