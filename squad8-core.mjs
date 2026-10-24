// SQUAD 8 CORE (24 Oct 2026; Stock-2 squads 5-8): REAL DEMAND vs FRAGILE RALLIES - "path edge" and "share supply". Pure functions, no
// network, no files. Used by squad8-lab.mjs (one 5-year run per rule, first complete verdict frozen in data/squad8-lab.json firstRun, then
// a forward PAPER lane from Monday 26 Oct 2026) and test/squad8-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// QUESTION: two stocks can show the same multi-day gain and still be very different rallies. Does HOW the gain was made (the path: overnight
// gaps vs regular-hours buying, volume on up days, a smooth climb vs one jump, a breakout that holds) or WHO can still sell (the share
// supply: a shrinking vs growing share count, float turnover, IPO lock-ups already past, reverse splits) separate runners that keep going
// from runners that fade?
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ8-*; the same text is written into
// data/strategy-library.json before the first computation). Every threshold below was fixed from the papers cited and round numbers,
// never from this data. Common conventions (the system's, unchanged; copied from the squad 1 / anomaly labs):
//   DAILY BARS ONLY: the 5-year whole-market cache (open, close, volume per session, dead stocks included). Overnight return of session u
//   = ln(open_u / close_u-1); regular-hours (intraday) return = ln(close_u / open_u); they add up to the close-to-close log return.
//   LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ on the signal session (SPY excluded).
//   RUNNER (the common base event of every rule except SQ8-HOLD3): at the close of session t the stock is liquid, its 10-session gain
//   g10 = close_t / close_t-10 - 1 is between +15% and +100%, and it was NOT a runner one session earlier (g10 at t-1 under +15%): the
//   first session it crosses. All 11 closes and the 10 opens must exist (no gaps in the data).
//   ENTRY / EXIT: signal at the CLOSE of t (only what is known then); buy the OPEN of t+1; sell the CLOSE of the 20th session (hold 20,
//   counting the entry session). One open trade per stock per rule.
//   POINT IN TIME: SEC cover share counts known 30 days after their date (data/shares.json.gz, put on one split basis; a whole-ratio jump
//   between two rows is treated as an unadjusted split); a split is known on its execution date; an IPO is known on its 424B4 filing date.
//   COSTS 0.8% a round trip (1.2% stress). Every gross return, the rule's and the yardstick's, is capped at +300% alike (AUD-1).
//   JUDGED at the system's tier-2 standard (value-core.mjs judge, unchanged): halves = signal before / from 2024-01-01; in BOTH halves
//   > 0 after 0.8% and 1.2%, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its
//   other days, > 0 without its 2 best trades, 20+ trades and 3+ blocks, block t >= 2.5 (blocks = 20 sessions) -> TRADABLE SMALL;
//   block t >= the proof bar -> PROVEN. Nothing is lowered.
//   INFORMATION ONLY (never frozen, never a buy): the plain RUNNER base, and for each rule the runners that did NOT pass it (same base,
//   feature known) - the comparison the question is about.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', CAP = 3, HOLD = 20;
export const RUN = { n: 10, min: 0.15, max: 1.0 };
export const TH = {
  nightShare: 0.75,      // SQ8-NIGHTRUN: overnight share of the 10-session log gain
  tugMin: 7,             // SQ8-TUG: 7+ of the last 21 sessions open up and then close under their open
  udMin: 2.0,            // SQ8-ACCUM: volume on up sessions / volume on down sessions over the 10 sessions
  upDaysMin: 7, maxDayShare: 0.40,   // SQ8-ORDERLY: 7+ up closes of 10 and no single session above 40% of the 10-session log gain
  boLook: 60, boQuiet: 20, boHold: 3, // SQ8-HOLD3: close above the highest close of the prior 60 sessions, first in 20 sessions, 3 closes stay at/above that level
  shrink: -0.02,         // SQ8-SHRINK: share count down 2%+ in a year
  turnMax: 0.20,         // SQ8-LOWTURN: 10-session volume under 20% of the share count
  ipoMin: 200, ipoMax: 730,           // SQ8-POSTLOCK: 200-730 calendar days after the IPO (424B4)
  cleanMax: 0.03, rsDays: 1095,       // SQ8-CLEAN: share count up at most 3% in a year AND no reverse split in 3 years
  realNight: 0.5, realUd: 1.5, realShares: 0.05,   // SQ8-REAL
};
const P = (cite, url) => ({ cite, url });
const LPS = P('Lou, Polk & Skouras (2019) A tug of war: Overnight versus intraday expected returns, Journal of Financial Economics 134(1)', 'https://personal.lse.ac.uk/polk/research/TugOfWar.pdf');
const BBM = P('Barardehi, Bogousslavsky & Muravyev, What Drives Momentum and Reversal? Evidence from Day and Night Signals (SSRN 4069509)', 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4069509');
const PW = P('Pontiff & Woodgate (2008) Share Issuance and Cross-sectional Returns, Journal of Finance 63(2)', 'https://doi.org/10.1111/j.1540-6261.2008.01338.x');
const DT = P('Daniel & Titman (2006) Market Reactions to Tangible and Intangible Information, Journal of Finance 61(4) (composite share issuance)', 'https://doi.org/10.1111/j.1540-6261.2006.00884.x');
const BASE = 'RUNNER at the close of t (liquid; 10-session gain +15% to +100%; first session crossing +15%; complete data)';
export const RULES = {
  'SQ8-NIGHTRUN': { family: 'path', name: 'Runner whose gain came from overnight gaps (75%+ of the 10-session gain made close-to-open)',
    papers: [LPS, BBM], reported: 'momentum profits accrue overnight (LPS); past intraday returns reverse at one month while past overnight returns do not (BBM): the evidence favours the overnight-driven runner on the long side',
    rule: BASE + ' AND the overnight part of the gain, sum over the 10 sessions of ln(open / previous close), is at least 75% of ln(close_t / close_t-10). Buy the next open; hold 20; one open trade per stock.',
    lib: 'ANOM-OVNMOM / ANOM-DAYMOM12 / ANOM-DAYNIGHT (12-month monthly sorts: rejected). A 10-day runner split by its path was never run' },
  'SQ8-TUG': { family: 'path', name: 'Runner with a strong daily tug of war (7+ of 21 sessions open up then close under the open)',
    papers: [P('Akbas, Boehmer, Jiang & Koch (2022) Overnight returns, daytime reversals, and future stock returns, Journal of Financial Economics 145(3)', 'https://ideas.repec.org/a/eee/jfinec/v145y2022i3p850-875.html'), LPS],
    reported: 'a more intense daily tug of war (positive overnight returns followed by daytime reversals) predicts HIGHER future returns: daytime arbitrageurs over-correct (the long side the evidence favours, against the "fragile" intuition)',
    rule: BASE + ' AND in the 21 sessions ending t, 7 or more sessions had open > previous close AND close < open. Buy the next open; hold 20; one open trade per stock.',
    lib: 'none: the tug-of-war count was never used. DEC2-GAPFILL / M10 are gap-down rules' },
  'SQ8-ACCUM': { family: 'path', name: 'Runner with accumulation volume (volume on up sessions 2x+ volume on down sessions)',
    papers: [P('Gervais, Kaniel & Mingelgrin (2001) The High-Volume Return Premium, Journal of Finance 56(3)', 'https://doi.org/10.1111/0022-1082.00349'), P('Granville (1963) on-balance volume (practitioner: volume on up days = accumulation)', 'https://www.investopedia.com/terms/o/onbalancevolume.asp')],
    reported: 'stocks with unusually high volume tend to rise afterwards (GKM); practitioners read heavier volume on up days than on down days as accumulation',
    rule: BASE + ' AND over the 10 sessions ending t, total volume of sessions closing above the previous close is at least 2.0x the total volume of sessions closing below it (no down session at all also passes). Buy the next open; hold 20; one open trade per stock.',
    lib: 'I6 (3 up days on rising volume: failed discovery), T2 / I3 (volume breakouts). Up/down volume on a 10-day runner was never run' },
  'SQ8-ORDERLY': { family: 'path', name: 'Orderly runner: 7+ up closes of 10 and no single session above 40% of the gain',
    papers: [P('Da, Gurun & Warachka (2014) Frog in the Pan: Continuous Information and Momentum, Review of Financial Studies 27(7)', 'https://doi.org/10.1093/rfs/hhu003')],
    reported: 'momentum built from many small moves (continuous information) persists much more than momentum from a few large jumps',
    rule: BASE + ' AND 7+ of the 10 sessions closed above the previous close AND no single session\'s close-to-close log return exceeds 40% of ln(close_t / close_t-10). Buy the next open; hold 20; one open trade per stock.',
    lib: 'T11 / I4 (tight bases: failed discovery), DEC-QBO / DEC-VCP (paper). The information-discreteness split of a runner was never run' },
  'SQ8-HOLD3': { family: 'path', name: 'Breakout that holds: a new 60-session closing high whose next 3 closes stay at or above the old high',
    papers: [P('George & Hwang (2004) The 52-Week High and Momentum Investing, Journal of Finance 59(5)', 'https://doi.org/10.1111/j.1540-6261.2004.00695.x'), P('Lo, Mamaysky & Wang (2000) Foundations of Technical Analysis, Journal of Finance 55(4)', 'https://doi.org/10.1111/0022-1082.00265')],
    reported: 'stocks near their highs keep outperforming (anchoring); practitioners treat a breakout that does not fall back as accepted by the market',
    rule: 'Breakout session b: liquid; close_b above L = the highest close of the 60 sessions before b; no such breakout in the 20 sessions before b. Signal at the close of t = b+3 when the closes of b+1, b+2 and b+3 are all >= L and the stock is liquid at t. Buy the next open; hold 20; one open trade per stock.',
    lib: 'DEC2-TURT20 / DEC2-TURT55 (breakouts with stops: paper), ANG-LCGAP20 (earnings gaps that hold, large caps), E16 (earnings gaps), X8 (failed breakouts as avoid: queued). A plain 60-day closing breakout confirmed by 3 closes was never run' },
  'SQ8-SHRINK': { family: 'shares', name: 'Runner whose share count shrank 2%+ in a year (buybacks)',
    papers: [PW, DT, P('Ikenberry, Lakonishok & Vermaelen (1995) Market underreaction to open market share repurchases, Journal of Financial Economics 39(2-3)', 'https://doi.org/10.1016/0304-405X(95)00826-Z')],
    reported: 'firms that shrink their share count outperform; issuers lag (one of the most replicated anomalies)',
    rule: BASE + ' AND the SEC share count known at t (30 days late) is at least 2% below the count known 365 days earlier (and not below 60% of it: a data error), both counts dated within 200 days of their cut-off. Buy the next open; hold 20; one open trade per stock.',
    lib: 'ANOM-NSI (monthly bottom 10% of all stocks: rejected), S1 (flat share count above the 50-day: failed), SQ1-BBAUTH (buyback announcements). Shrinking count as a filter on runners was never run' },
  'SQ8-LOWTURN': { family: 'shares', name: 'Runner on low float turnover (10-session volume under 20% of the shares)',
    papers: [P('Lee & Swaminathan (2000) Price Momentum and Trading Volume, Journal of Finance 55(5)', 'https://doi.org/10.1111/0022-1082.00280'), P('Medhat & Schmeling (2022) Short-term Momentum, Review of Financial Studies 35(3) (the opposite at one month: winners continue among HIGH-turnover stocks)', 'https://repec.cepr.org/repec/cpr/ceprdp/DP15857.pdf')],
    reported: 'low-volume winners keep their momentum longer than high-volume (glamour) winners (Lee & Swaminathan); Medhat & Schmeling find the opposite at one month: a genuine test between the two',
    rule: BASE + ' AND the sum of volume over the 10 sessions ending t is under 20% of the SEC share count known at t (30 days late, split basis of the prices). Buy the next open; hold 20; one open trade per stock.',
    lib: 'A-TURN1 (queued: 1-week, high turnover, large caps), I10 (low float + 3x volume: paper), DEC2-STINE (small share count). Low turnover as a filter on 10-day runners was never run' },
  'SQ8-POSTLOCK': { family: 'ipo', name: 'Young-company runner after its IPO lock-up has passed (200-730 days after the IPO)',
    papers: [P('Field & Hanka (2001) The Expiration of IPO Share Lockups, Journal of Finance 56(2)', 'https://doi.org/10.1111/0022-1082.00336'), P('Ritter (1991) The Long-Run Performance of Initial Public Offerings, Journal of Finance 46(1)', 'https://doi.org/10.1111/j.1540-6261.1991.tb03743.x')],
    reported: 'lock-up expiry releases a wave of insider supply (price dip, a lasting 40% volume rise); once it has passed, that supply overhang is gone',
    rule: BASE + ' AND the company\'s IPO (first 424B4 in the SEC EDGAR index, the stock first in the price cache within 15 sessions after it, not before; blank-check companies left out) was 200 to 730 calendar days before t. Buy the next open; hold 20; one open trade per stock.',
    lib: 'ANG-LOCKUP (bounce 3 sessions after expiry: too few), C-LOCK (avoid around expiry), ANG-IPOBASE (first base). Runners past the lock-up were never run' },
  'SQ8-CLEAN': { family: 'shares+splits', name: 'Clean-supply runner: share count up at most 3% in a year and no reverse split in 3 years',
    papers: [PW, P('Martell & Webb (2008) The performance of stocks that are reverse split, Review of Quantitative Finance and Accounting 30', 'https://doi.org/10.1007/s11156-007-0076-y')],
    reported: 'issuers lag (Pontiff & Woodgate); reverse-split stocks underperform for years afterwards (Martell & Webb)',
    rule: BASE + ' AND the SEC share count known at t is at most 3% above the count known 365 days earlier (both dated within 200 days of their cut-off) AND no reverse split (split_to < split_from, Massive split list) executed in the 1,095 calendar days up to t. Buy the next open; hold 20; one open trade per stock.',
    lib: 'S1 (flat count above the 50-day: failed), S2 / C-NSI1 (dilution avoid), S4 (reverse-split risk rule). A clean-supply filter on runners was never run' },
  'SQ8-REAL': { family: 'shares', name: 'Real-demand runner: overnight-led gain (50%+), up-volume 1.5x+ down-volume, share count up at most 5% in a year',
    papers: [LPS, P('Gervais, Kaniel & Mingelgrin (2001) JF 56(3)', 'https://doi.org/10.1111/0022-1082.00349'), PW],
    reported: 'combination of the three published directions above (overnight-led momentum, high-volume premium, no issuance); the combination itself has no published record',
    rule: BASE + ' AND the overnight part of the 10-session log gain is at least 50% of it AND volume on up sessions is at least 1.5x volume on down sessions over the 10 sessions AND the share count known at t is at most 5% above the count known 365 days earlier. Buy the next open; hold 20; one open trade per stock.',
    lib: 'none: combination of the SQ8 path and supply features' },
};
export const IDS = Object.keys(RULES);

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
const pos = (x) => ok(x) && x > 0;
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoMs = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoMs(ms(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);

// ---------------- path features (c, o, v: one stock's arrays by session; t = signal session) ----------------
// 10-session gain at t, null without the 11 closes
export const gainAt = (c, t, n = RUN.n) => t >= n && pos(c[t]) && pos(c[t - n]) ? c[t] / c[t - n] - 1 : null;
// RUNNER: g10 in [min, max] at t, under min at t-1, all closes t-11..t and opens t-9..t present. Returns g10 or null.
export function runnerAt(c, o, t, { n, min, max } = RUN) { if (t < n + 1) return null; for (let u = t - n - 1; u <= t; u++) if (!pos(c[u])) return null; for (let u = t - n + 1; u <= t; u++) if (!pos(o[u])) return null;
  const g = gainAt(c, t, n), g1 = gainAt(c, t - 1, n); return g !== null && g >= min && g <= max && g1 !== null && g1 < min ? g : null; }
// overnight / regular-hours split of the n sessions ending t (log returns): { night, day, total, nightShare }
export function pathSplit(o, c, t, n = RUN.n) { let night = 0, day = 0; for (let u = t - n + 1; u <= t; u++) { if (!pos(o[u]) || !pos(c[u]) || !pos(c[u - 1])) return null; night += Math.log(o[u] / c[u - 1]); day += Math.log(c[u] / o[u]); }
  const total = night + day; return { night, day, total, nightShare: total > 0 ? night / total : null }; }
// tug-of-war sessions in the n sessions ending t: open above the previous close AND close below the open
export function tugCount(o, c, t, n = 21) { if (t < n) return null; let k = 0; for (let u = t - n + 1; u <= t; u++) { if (!pos(o[u]) || !pos(c[u]) || !pos(c[u - 1])) return null; if (o[u] > c[u - 1] && c[u] < o[u]) k++; } return k; }
// up / down volume over the n sessions ending t: ratio = Infinity when no down session (and some up volume)
export function upDownVol(c, v, t, n = RUN.n) { let up = 0, dn = 0; for (let u = t - n + 1; u <= t; u++) { if (!pos(c[u]) || !pos(c[u - 1]) || !(ok(v[u]) && v[u] >= 0)) return null; if (c[u] > c[u - 1]) up += v[u]; else if (c[u] < c[u - 1]) dn += v[u]; }
  return { up, dn, ratio: dn > 0 ? up / dn : up > 0 ? Infinity : null }; }
// orderliness: up closes and the largest single close-to-close log return as a share of the n-session log gain
export function orderly(c, t, n = RUN.n) { let up = 0, mx = -Infinity; for (let u = t - n + 1; u <= t; u++) { if (!pos(c[u]) || !pos(c[u - 1])) return null; const r = Math.log(c[u] / c[u - 1]); if (r > 0) up++; if (r > mx) mx = r; }
  const total = Math.log(c[t] / c[t - n]); return { upDays: up, maxShare: total > 0 ? mx / total : null }; }
// 10-session turnover: summed volume / shares
export function turnover(v, t, shares, n = RUN.n) { if (!pos(shares)) return null; let s = 0; for (let u = t - n + 1; u <= t; u++) { if (!(ok(v[u]) && v[u] >= 0)) return null; s += v[u]; } return s / shares; }
// highest close of the `look` sessions before b (all present), or null
export function priorHigh(c, b, look = TH.boLook) { if (b < look) return null; let h = -Infinity; for (let u = b - look; u < b; u++) { if (!pos(c[u])) return null; if (c[u] > h) h = c[u]; } return h; }
export const breakoutAt = (c, b, look = TH.boLook) => { const h = priorHigh(c, b, look); return h !== null && pos(c[b]) && c[b] > h ? h : null; };
// breakout levels of a whole series: bo[b] = the old high L when close_b > L (the highest close of the `look` sessions before b), else NaN
export function breakoutSeries(c, look = TH.boLook) { const bo = new Float64Array(c.length).fill(NaN); for (let b = look; b < c.length; b++) { const L = breakoutAt(c, b, look); if (L !== null) bo[b] = L; } return bo; }
// SQ8-HOLD3 at signal session t (= b + hold): b is a breakout, the first in `quiet` sessions, and closes b+1..b+hold stay >= the old high.
// bo = breakoutSeries(c) (optional, for speed)
export function hold3At(c, t, { look = TH.boLook, quiet = TH.boQuiet, hold = TH.boHold } = {}, bo = null) { const b = t - hold; if (b < look) return null;
  const L = bo ? (isNaN(bo[b]) ? null : bo[b]) : breakoutAt(c, b, look); if (L === null) return null;
  for (let q = Math.max(look, b - quiet); q < b; q++) if (bo ? !isNaN(bo[q]) : breakoutAt(c, q, look) !== null) return null;
  for (let u = b + 1; u <= t; u++) if (!pos(c[u]) || c[u] < L) return null; return { b, level: L }; }

// ---------------- supply features ----------------
// share rows [[date, count]] ascending: a whole-ratio jump (2..50, within 3%) between two rows is an unadjusted split: earlier rows rescaled
export function splitFix(rows) { const out = (rows || []).map(([d, n]) => [d, n]);
  for (let k = out.length - 2; k >= 0; k--) { const a = out[k][1], b = out[k + 1][1]; if (!(a > 0 && b > 0)) continue; const r = b / a, R = r >= 1 ? r : 1 / r, w = Math.round(R);
    if (w >= 2 && w <= 50 && Math.abs(R / w - 1) <= 0.03) for (let j = 0; j <= k; j++) out[j][1] *= r; }
  return out; }
// the count usable on day d: the latest row dated `lag`+ days before d and within `maxAge` days of that cut-off; null otherwise
export function sharesKnownAt(rows, d, lag = 30, maxAge = 200) { if (!rows || !rows.length) return null; const lim = addDays(d, -lag); let v = null, e0 = null; for (const [e, n] of rows) { if (e > lim) break; v = n; e0 = e; }
  return pos(v) && daysBetween(e0, lim) <= maxAge ? v : null; }
// share-count change over a year as known at d: count known at d / count known at d-365 - 1 (null if either unknown)
export function shareChange(rows, d) { const now = sharesKnownAt(rows, d), then = sharesKnownAt(rows, addDays(d, -365)); return pos(now) && pos(then) ? now / then - 1 : null; }
// a reverse split (to < from) executed in (d - days, d]
export const reverseSplitWithin = (splits, d, days = TH.rsDays) => (splits || []).some(s => s.to < s.from && s.d <= d && s.d > addDays(d, -days));
export const spacLike = (c, f0) => { let n = 0; for (let k = f0; k < c.length && n < 10; k++) { if (!(c[k] > 0)) continue; n++; if (c[k] < 9.5 || c[k] > 10.6) return false; } return n >= 10; };

// ---------------- the rules on one runner's features ----------------
// f = { run (g10 or null), nightShare, tug, ud (ratio), upDays, maxShare, shChg, turn, ipoDays, rs3 (bool or null), hold3 (bool) }.
// Returns true / false, or null when a feature the rule needs is unknown (the runner is then outside that rule and its complement).
export function passes(id, f) { const need = (...x) => x.every(v => v !== null && v !== undefined && !(typeof v === 'number' && isNaN(v)));
  if (id === 'SQ8-HOLD3') return !!f.hold3;
  if (f.run === null || f.run === undefined) return null;
  switch (id) {
    case 'SQ8-NIGHTRUN': return need(f.nightShare) ? f.nightShare >= TH.nightShare : null;
    case 'SQ8-TUG': return need(f.tug) ? f.tug >= TH.tugMin : null;
    case 'SQ8-ACCUM': return need(f.ud) ? f.ud >= TH.udMin : null;
    case 'SQ8-ORDERLY': return need(f.upDays, f.maxShare) ? f.upDays >= TH.upDaysMin && f.maxShare <= TH.maxDayShare : null;
    case 'SQ8-SHRINK': return need(f.shChg) ? f.shChg <= TH.shrink && f.shChg >= -0.4 : null;
    case 'SQ8-LOWTURN': return need(f.turn) ? f.turn < TH.turnMax : null;
    case 'SQ8-POSTLOCK': return need(f.ipoDays) ? f.ipoDays >= TH.ipoMin && f.ipoDays <= TH.ipoMax : null;
    case 'SQ8-CLEAN': return need(f.shChg, f.rs3) ? f.shChg <= TH.cleanMax && !f.rs3 : null;
    case 'SQ8-REAL': return need(f.nightShare, f.ud, f.shChg) ? f.nightShare >= TH.realNight && f.ud >= TH.realUd && f.shChg <= TH.realShares : null;
  }
  return null; }

// ---------------- the same stock on its other days (capped like the trades) ----------------
export function ownAverage({ from, to, len, step = 10, okAt, busy = [], ret }) { const v = []; for (let u = from; u + len - 1 <= to; u += step) { if (!okAt(u)) continue; const x = u + len - 1; if (busy.some(([a, b]) => u <= b && x >= a)) continue; const g = ret(u, x); if (ok(g)) v.push(capG(g)); } return v.length >= 3 ? mean(v) : null; }

// ---------------- paper board ----------------
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null, avgWin: win.length ? r4(sum(win) / win.length) : null, avgLoss: loss.length ? r4(sum(loss) / loss.length) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
export function shapeOf(tr, yearOf) { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), by = {};
  tr.forEach((z, i) => { const y = yearOf(z); (by[y] = by[y] || []).push(net[i]); });
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null,
    byYear: Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y])) }])) }; }

// ---------------- library pre-registration (written before any run; idempotent, append only) ----------------
export function preRegister(LB, date = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, a] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Squad 8 (path edge and share supply)', name: a.name, explain: a.rule + ' Paper(s): ' + a.papers.map(p => p.cite).join('; ') + '. Reported: ' + a.reported + '.',
      status: 'pre-registered ' + date + ' (squad 8 lab); 5-year one-shot pending', agent: 'squad8', kind: 'buy', hold: HOLD, libraryCheck: a.lib, sources: a.papers.map(p => p.url).filter(Boolean),
      note: 'Pre-registered ' + date + ' BEFORE any run (squad8-core.mjs RULES + TH = the exact rule; one version; hold ' + HOLD + ' sessions). 5-year one-shot by squad8-lab.mjs, first complete verdict frozen in data/squad8-lab.json; forward paper lane (data/squad8-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = date; return ch; }
