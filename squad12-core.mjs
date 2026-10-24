// SQUAD 12 CORE (24 Oct 2026; squad12-lab.mjs uses it). "EVENTS IN BIG COMPANIES ONLY."
// Pure functions, no network, no files. test/squad12-core.test.mjs.
// Why: most event rules in the library were tested on the WHOLE liquid market, where small-cap noise and costs dominate; the system's own
// results (24 Oct UPDATE) say the gains of 2021-2026 sat in the giants (average stock ~2%/yr vs SPY ~10%/yr). These rules take events
// with published support and run them ONLY on the largest US companies by point-in-time market value, each with a trigger that is NOT
// already in data/strategy-library.json (checked 24 Oct 2026: ANG-LCGAP20/60, ANOM-EAR, ANOM-SUE, ANOM-SUESURGE, ANOM-52WH, E1, E16,
// A-E1W1, B-EM1, SQ1-GUIDEUP, SQ4-GROWLEAD, TIP-THEME(-100) are different triggers and/or the whole market).
//
// PRE-REGISTERED 24 Oct 2026, BEFORE ANY RESULT WAS SEEN (one version each; ids SQ12-*; the same text is written into
// data/strategy-library.json before the first computation). Each rule is run ONCE on the 5-year window; the first complete verdict is
// frozen in data/squad12-lab.json firstRun (first-run.mjs freezeEach). No tuning on results.
//
// COMMON (all rules):
//   BIG = among the 300 largest US companies by market value at the LATEST MONTH START on or before the signal session (the session
//     before the entry). Market value and the universe exactly as Squad 5 (squad5-core.mjs capAt / byCap / usCompany; liquid US stocks,
//     close >= 5 USD and 20-session traded value >= 5M USD, dead and delisted included, one ticker per company, the SEC company number
//     (CIK) from the historical Form 3/4/5 ticker map = point in time, US domicile, share counts 30+ days old or from their filing date,
//     split-repaired). Companies are matched to events BY CIK (SEC filings) or by the ticker AS IT TRADED that day (earnings calendar),
//     never by today's ticker list (the squad1 survivorship lesson).
//   TOP-100 CUT (information, pre-registered too): the same events restricted to the 100 largest are reported next to each rule; the
//     verdict and TRY SMALL use the 300 version only.
//   ENTRY at the OPEN of the first session after the signal session; EXIT at the CLOSE of session 63 (hold counts the entry session).
//   One open trade per stock per rule (a new event while a trade is open is skipped). A stock that stops trading: under 3 USD at its
//   last close = worth 0, else paid its last close.
//   COSTS 0.8% a round trip (1.2% stress). Every gross return, the rule's and the yardsticks', capped at +300% alike (AUD-1 capBoth).
//   JUDGED (value-core judge via hold-core judgeHold, unchanged): halves = signal before / from 2024-01-01; in BOTH halves > 0 after
//   0.8% and 1.2%, better than the average liquid stock over the same sessions, better than the same stock held 63 sessions on its
//   other days (entries every 21 sessions, 63+ sessions away), > 0 without its 2 best trades, 20+ trades and 3+ blocks (63 sessions),
//   block t >= 2.5 (TRADABLE SMALL) / >= the proof bar (PROVEN), AND return per year of capital tied up above SPY on the same days
//   (perYear). Also reported: a calendar-year table (by entry year: average net vs SPY and vs the average stock on the same days).
//   EARNINGS DATES (AMENDED 24 Oct 2026 BEFORE ANY RESULT, after the DIAG coverage run: the Nasdaq calendar cache has a before-open /
//     after-close flag on only 47 of 65,130 past reports, so the registered "no flag = skipped" left 3 events in 5 years): the company's
//     own SEC 8-K with Item 2.02 (Results of Operations), by CIK, from EDGAR submissions, with its EDGAR acceptance time (UTC, read on
//     the New York clock by sec-time.mjs). Accepted before 09:30 -> reaction session R = that day's session (the first session on / after
//     that date); 16:00 or later -> the next session; 09:30-15:59 -> skipped; 8-K/A left out. CLOCK CALIBRATED (DIAG 3-5, before
//     any rule result; see reactionFromAcceptance): read hour < 14:00 = before the open, 16:00-17:59 / 20:00-21:59 = after the close,
//     other hours skipped (many EDGAR acceptance stamps carry the New York offset twice).
//   SEC XBRL (company facts, by CIK): a value is known from its FILING date; the filing's event session = the first session strictly
//   after the filing date (an evening filing is bought the next morning; a morning filing one day late: conservative).
//   8-K TEXT: SEC EDGAR full-text search (efts.sec.gov, 8-K incl. exhibits), the filer's CIK; "confirmed" = the close of the first
//   session strictly after the filing date is above the close of the last session strictly before it (covers a pre-open or an
//   after-close release alike); that session is the signal session.
import { secNY } from './sec-time.mjs';
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', CAP = 3, HOLD = 63, YEAR = 252;
export const TOPN = 300, TOP100 = 100, GAP = 0.03, HIGH_LOOK = 252, GROW = 0.10, GUIDE_GAP_DAYS = 60, INV_GAP_DAYS = 180;
export const INV_PHRASES = ['investor day', 'analyst day', 'capital markets day'];
const ok = (x) => typeof x === 'number' && isFinite(x), DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z');
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const addDays = (d, n) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
const P = (cite, url) => ({ cite, url });

// ================= sessions =================
// D = sorted session dates. first index with D[t] >= d (D.length if none); first index with D[t] > d
export function onOrAfter(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; }
export function after(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; }
// reaction session of an earnings report on date d: before the open -> the first session on / after d; after the close -> the first
// session after d; no time flag -> -1 (skipped). Returns an index (may be D.length = not yet traded).
export function reactionIdx(D, d, time) { if (time === 'bmo') return onOrAfter(D, d); if (time === 'amc') return after(D, d); return -1; }
// reaction session of an 8-K Item 2.02 from its EDGAR acceptance time. CLOCK CALIBRATION (24 Oct 2026, DIAG runs 3-5, before any rule
// result): read as UTC on the New York clock, the big companies' releases cluster at 06-09 and 16 (correct) AND at 10-13 and 20-21 (the
// same releases shifted by the New York UTC offset a second time; the shift follows daylight saving: 20 in summer, 21 in winter). The
// average opening gap confirms it on 8,945 releases: hours 06-13 move the filing-date open (3.0-3.5% vs 0.7-0.9% next day), hours 16 and
// 20-21 move the next open (4.2-5.1% vs 0.9-1.1%). So: read hour < 14:00 -> before the open (reaction = the first session on / after
// that date); 16:00-17:59 or 20:00-21:59 -> after the close (next session); 14:00-15:59, 18:00-19:59, 22:00+ -> ambiguous, skipped.
export function reactionFromAcceptance(D, acc) { const x = secNY(acc); if (!x || !x.hm) return -1; const h = x.hm;
  return reactionIdx(D, x.d, h < '14:00' ? 'bmo' : (h >= '16:00' && h < '18:00') || (h >= '20:00' && h < '22:00') ? 'amc' : null); }
// EDGAR submissions (filings.recent or an older page) -> [[accession, filingDate, acceptanceDateTime]] of original 8-Ks with Item 2.02
export function earnings8k(cols) { const out = [], f = (cols && cols.form) || []; for (let k = 0; k < f.length; k++) { if (f[k] !== '8-K') continue; const it = String((cols.items || [])[k] || '');
    if (!/(^|,)\s*2\.02\b/.test(it)) continue; out.push([cols.accessionNumber[k], cols.filingDate[k], cols.acceptanceDateTime[k]]); } return out; }
// the latest month start on or before t (MS = sorted month-start indices); -1 if none
export function monthStartFor(MS, t) { let lo = 0, hi = MS.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (MS[m] <= t) { ans = MS[m]; lo = m + 1; } else hi = m - 1; } return ans; }

// ================= price triggers =================
// gap that holds: open >= previous close x (1 + GAP), close in the upper half of the day's range ((c - l) / (h - l) >= 0.5, h > l) and
// close above the previous close
export function gapHolds({ pc, o, h, l, c }, gap = GAP) {
  if (![pc, o, h, l, c].every(x => ok(x) && x > 0) || !(h > l)) return false;
  return o >= pc * (1 + gap) && (c - l) / (h - l) >= 0.5 && c > pc;
}
// new 52-week closing high: close at t above every close of the previous `look` sessions (90%+ of them present)
export function newHigh(c, t, look = HIGH_LOOK) { if (t < look || !(c[t] > 0)) return false; let mx = -Infinity, n = 0; for (let k = t - look; k < t; k++) if (c[k] > 0) { n++; if (c[k] > mx) mx = c[k]; } return n >= look * 0.9 && c[t] > mx; }
// confirmation of an 8-K: close of the first session after the filing date > close of the last session before it. Returns the signal
// session index or -1. c = closes array-like, d = filing date.
export function confirmIdx(D, c, d) { const ta = after(D, d), tb = onOrAfter(D, d) - 1; if (ta >= D.length || tb < 0) return -1; let base = null; for (let k = tb; k >= Math.max(0, tb - 5); k--) if (c[k] > 0) { base = c[k]; break; }
  return base > 0 && c[ta] > 0 && c[ta] > base ? ta : -1; }

// ================= SEC quarterly figures (point in time) =================
// rows = [{ s, e, v, f, form, accn }] of ONE tag (s = period start, e = end, f = filing date). Durations: quarter 80-100 days, nine
// months 260-285, year 350-380.
export const durOf = (s, e) => s ? Math.round((ms(e) - ms(s)) / DAY) + 1 : 0;
const isQ = (r) => { const d = durOf(r.s, r.e); return d >= 80 && d <= 100; }, is9 = (r) => { const d = durOf(r.s, r.e); return d >= 260 && d <= 285; }, isY = (r) => { const d = durOf(r.s, r.e); return d >= 350 && d <= 380; };
// quarter values known on asOf (rows filed on / before asOf; the latest filing wins = restated comparatives): Map end -> value. A fourth
// quarter with no quarterly row = the year minus the nine-month year-to-date of the same start (+-5 days), else minus the three quarters
// that end inside the year (exactly three).
export function quarterValues(rows, asOf) {
  const known = (rows || []).filter(r => r && r.f <= asOf && ok(r.v)).sort((a, b) => a.f < b.f ? -1 : a.f > b.f ? 1 : 0), q = new Map(), nine = [], yr = [];
  for (const r of known) { if (isQ(r)) q.set(r.e, r.v); else if (is9(r)) nine.push(r); else if (isY(r)) yr.push(r); }
  const near = (a, b, tol) => Math.abs(ms(a) - ms(b)) / DAY <= tol, yLatest = new Map(); for (const r of yr) yLatest.set(r.s + '|' + r.e, r);
  for (const y of yLatest.values()) { if (q.has(y.e) || [...q.keys()].some(e => near(e, y.e, 5))) continue;
    const n9 = nine.filter(r => near(r.s, y.s, 5) && r.e < y.e && near(r.e, addDays(y.e, -91), 20)).pop();
    if (n9) { q.set(y.e, y.v - n9.v); continue; }
    const inside = [...q.entries()].filter(([e]) => e > y.s && e <= addDays(y.e, -45)); if (inside.length === 3) q.set(y.e, y.v - inside.reduce((a, [, v]) => a + v, 0)); }
  return q;
}
// the quarter end in map q closest to target within tol days (null if none)
export function nearestEnd(q, target, tol = 20) { let best = null, bd = Infinity; for (const e of q.keys()) { const d = Math.abs(ms(e) - ms(target)) / DAY; if (d <= tol && d < bd) { bd = d; best = e; } } return best; }
// year-on-year growth of quarter `end` (same quarter a year earlier: 364 +-20 days); prior must be > 0
export function yoy(q, end) { const v = q.get(end), pe = nearestEnd(q, addDays(end, -364)); if (!ok(v) || !pe || pe === end) return null; const p = q.get(pe); return ok(p) && p > 0 ? v / p - 1 : null; }
// the previous quarter's end (91 +-25 days earlier)
export const prevEnd = (q, end) => { const e = nearestEnd(q, addDays(end, -91), 25); return e && e < end ? e : null; };
// growth of the quarter and the two before it: [g0, g1, g2] or null
export function growth3(q, end) { const e1 = prevEnd(q, end), e2 = e1 ? prevEnd(q, e1) : null; if (!e1 || !e2) return null; const g = [yoy(q, end), yoy(q, e1), yoy(q, e2)]; return g.every(ok) ? g : null; }
// accelerating two quarters in a row: g0 > g1 > g2 and g0 > 0
export const accel2 = (g) => !!g && g[0] > g[1] && g[1] > g[2] && g[0] > 0;
// filings of a company from its tagged rows: [{ accn, f, form, end (the latest period end in that filing among quarter / year rows) }],
// original 10-Q and 10-K only (amendments out), sorted by filing date
export function filingsOf(tagged) { const m = new Map();
  for (const rows of Object.values(tagged || {})) for (const r of rows || []) { if (!r || !r.accn || !/^10-[QK]$/.test(String(r.form || ''))) continue; if (!isQ(r) && !isY(r)) continue;
    const o = m.get(r.accn); if (!o) m.set(r.accn, { accn: r.accn, f: r.f, form: r.form, end: r.e, qEnd: isQ(r) ? r.e : null }); else { if (r.e > o.end) o.end = r.e; if (isQ(r) && (!o.qEnd || r.e > o.qEnd)) o.qEnd = r.e; if (r.f < o.f) o.f = r.f; } }
  return [...m.values()].sort((a, b) => a.f < b.f ? -1 : a.f > b.f ? 1 : 0); }
// revenue growth of a filing's quarter, the first tag (priority order) that gives all three growths: { tag, g: [g0, g1, g2] } or the first
// that gives g0 only ({ tag, g0 }); tagged = { tag: rows } in priority order
export function revGrowth(tagged, asOf, end) { let one = null;
  for (const [tag, rows] of Object.entries(tagged || {})) { const q = quarterValues(rows, asOf); if (!q.has(end)) continue; const g3 = growth3(q, end); if (g3) return { tag, g: g3, g0: g3[0] }; if (!one) { const g0 = yoy(q, end); if (ok(g0)) one = { tag, g: null, g0 }; } }
  return one; }
// EPS (diluted) of a quarter vs the same quarter a year earlier: { eps, prior, g } or null (needs a prior > 0)
export function epsGrowth(rows, asOf, end) { const q = quarterValues(rows, asOf), v = q.get(end), pe = nearestEnd(q, addDays(end, -364)); if (!ok(v) || !pe || pe === end) return null; const p = q.get(pe); if (!ok(p) || !(p > 0)) return null; return { eps: v, prior: p, g: v / p - 1 }; }

// ================= event bookkeeping =================
// keep the first event per key within gapDays (events [{ key, d, ... }], sorted by d inside)
export function firstPer(events, gapDays) { const last = new Map(), out = [];
  for (const e of [...events].sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0)) { const p = last.get(e.key); if (p && daysBetween(p, e.d) < gapDays) continue; last.set(e.key, e.d); out.push(e); }
  return out; }
// one open trade per stock: signals [{ i, t }] (t = signal session, entry t + 1, exit close t + hold); a signal while the previous trade of
// that stock is open (t + 1 <= its exit session) is skipped; duplicates of the same (i, t) dropped
export function oneOpen(signals, hold = HOLD) { const busy = new Map(), out = [];
  for (const s of [...signals].sort((a, b) => a.t - b.t || a.i - b.i)) { const x = busy.get(s.i); if (x !== undefined && s.t + 1 <= x) continue; busy.set(s.i, s.t + hold); out.push(s); }
  return out; }
// EDGAR full-text answer -> [adsh, cik, fileDate, items[], tickers[]] (one row per hit document)
export function eftsRows(j) { const out = []; for (const h of (j && j.hits && j.hits.hits) || []) { const s = h._source || {}, tk = [];
    for (const dn of s.display_names || []) { const m = String(dn).match(/\(([A-Z0-9.,\s-]+)\)\s+\(CIK/); if (m) tk.push(...m[1].split(',').map(x => x.trim()).filter(Boolean)); }
    out.push([s.adsh || String(h._id || '').split(':')[0], String(+((s.ciks || [])[0] || 0)), s.file_date, Array.isArray(s.items) ? s.items.map(String) : null, tk]); } return out; }
// investor / analyst day 8-K: items known and include 7.01 or 8.01 and NOT 2.02 (not an earnings release)
export const invItemsOk = (items) => Array.isArray(items) && items.some(x => /^(7\.01|8\.01)$/.test(x)) && !items.some(x => /^2\.02$/.test(x));

// ================= reporting =================
// calendar-year table by entry year: trades [{ buy (date), net, spy, avg }] -> { year: { n, net, spy, avgStock, beatsSpy } }
export function byYear(trades) { const m = new Map(); for (const z of trades) { const y = String(z.buy).slice(0, 4); (m.get(y) || m.set(y, []).get(y)).push(z); }
  const out = {}; for (const [y, a] of [...m.entries()].sort()) { const f = (k) => { const v = a.map(z => z[k]).filter(ok); return v.length ? r4(mean(v)) : null; }; const net = f('net'), spy = f('spy');
    out[y] = { n: a.length, net, spy, avgStock: f('avg'), beatsSpy: ok(net) && ok(spy) ? net > spy : null }; }
  return out; }
export function boardStats(rows) { const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => r.g - r.c))) : null, pf: loss.length && sum(loss) < 0 ? r4(sum(win) / -sum(loss)) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;

// ================= the rules as registered =================
const COMMON = 'BIG = among the 300 largest US companies by point-in-time market value at the latest month start on or before the signal session (Squad 5 universe and market value: liquid US stocks, close >= 5 USD and 20-session traded value >= 5M USD, dead and delisted included, one ticker per company, CIK from the historical SEC Form 3/4/5 ticker map, US domicile, SEC share counts 30+ days old or from their filing date, split-repaired); events matched by the filer\'s CIK, never today\'s ticker list. Top-100 cut of the same events reported as information. Entry at the next open after the signal session; exit at the close of session 63; one open trade per stock; a stock that stops trading under 3 USD = 0. Earnings dates (amended before any result: the Nasdaq calendar cache has almost no before/after-open flags): the company\'s own SEC 8-K Item 2.02 by CIK with its EDGAR acceptance time on the New York clock; clock calibrated before any result on the opening gaps of 8,945 releases (many EDGAR stamps carry the New York offset twice): read hour < 14:00 = before the open (reaction that day), 16:00-17:59 or 20:00-21:59 = after the close (next session), other hours skipped; 8-K/A out. SEC XBRL values known from their filing date; event session = first session after the filing date. 8-K text: EDGAR full-text search (8-K incl. exhibits), filer CIK; confirmed = close of the first session after the filing date above the close of the last session before it. Cost 0.8% (1.2% stress); every gross return (rule and yardsticks) capped at +300% (AUD-1). Judged at the tier-2 standard (halves before / from 2024-01-01; > 0 after both costs, better than the average liquid stock on the same sessions, better than the same stock held 63 sessions on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= 2.5) plus return per year of capital above SPY on the same days in both halves; calendar-year table vs SPY reported. Run once, first complete verdict frozen.';
const CJL = P('Chan, Jegadeesh & Lakonishok (1996) Momentum Strategies, Journal of Finance 51(5)', 'https://doi.org/10.1111/j.1540-6261.1996.tb05222.x');
const BKSV = P('Brandt, Kishore, Santa-Clara & Venkatachalam (2008) Earnings announcements are full of surprises, SSRN 909563', 'https://ssrn.com/abstract=909563');
export const RULES = {
  'SQ12-EGAPHOLD': { family: 'earnings', hold: HOLD, name: 'Big company: earnings gap-up of 3%+ that closes in the upper half of the day',
    papers: [BKSV, CJL, P('Zhou & Zhu (2012) Jump on the Post-Earnings Announcement Drift, Financial Analysts Journal 68(3)', 'https://doi.org/10.2469/faj.v68.n3.1')],
    reported: 'the stock\'s own reaction to earnings (announcement return) predicts drift over the next quarter; strongest when the reaction is a jump that holds',
    rule: 'On the earnings reaction session R: open >= 3% above the previous close, close in the upper half of R\'s high-low range ((close - low) / (high - low) >= 0.5) and close above the previous close; a top-300 company. Signal = R; buy the open of R+1; hold 63.',
    lib: 'ANG-LCGAP20/60 (top-500, 4% gap on 2x volume, 3 later lows hold, buy R+4: rejected), ANOM-EAR (top 10% 3-day announcement return, whole market: rejected), E16 (5% gap + 3 quiet days, 20-day hold). New: the giants only, entry the next morning, the gap must hold THE SAME DAY (upper half of the range)' },
  'SQ12-EARN52H': { family: 'earnings', hold: HOLD, name: 'Big company closes at a new 52-week high on its earnings reaction day',
    papers: [P('George & Hwang (2004) The 52-Week High and Momentum Investing, Journal of Finance 59(5)', 'https://doi.org/10.1111/j.1540-6261.2004.00695.x'), BKSV],
    reported: 'stocks near their 52-week high keep outperforming (anchoring: investors under-react to good news at the high); earnings reactions drift',
    rule: 'On the earnings reaction session R the close is above every close of the previous 252 sessions (a new 52-week closing high); a top-300 company. Buy the open of R+1; hold 63.',
    lib: 'ANOM-52WH (monthly near-high rank, whole market: not proven), SQ4-GROWLEAD (monthly, fast growers near the high: not proven), DEC2-DARVAS. New: the high is made ON the earnings reaction day, giants only' },
  'SQ12-REVEPS': { family: 'fundamentals', hold: HOLD, name: 'Big company 10-Q: revenue AND diluted EPS both up 10%+ on the same quarter last year',
    papers: [P('Jegadeesh & Livnat (2006) Revenue surprises and stock returns, Journal of Accounting and Economics 41(1-2)', 'https://doi.org/10.1016/j.jacceco.2005.10.002'), P('Foster, Olsen & Shevlin (1984) Earnings Releases, Anomalies, and the Behavior of Security Returns, The Accounting Review 59(4)', 'https://www.jstor.org/stable/247321')],
    reported: 'time-series (same quarter last year) earnings surprises drift; the drift is larger when revenue growth confirms the earnings growth',
    rule: 'An original 10-Q (SEC XBRL, by CIK) of a top-300 company whose quarter shows revenue >= +10% and diluted EPS >= +10% versus the same quarter a year earlier (prior-year EPS > 0; values as known on the filing date, restated comparatives included; revenue = the first tag of Revenues / RevenueFromContractWithCustomerExcludingAssessedTax / SalesRevenueNet / RevenueFromContractWithCustomerIncludingAssessedTax that gives both quarters). Entry = the open of the first session after the filing date; hold 63.',
    lib: 'ANOM-SUESURGE (analyst SUE + revenue surprise vs history, whole market: not proven), ANOM-SUE, B-EM1 (3 beats in a row: rejected), A-E1W1. New: the filing itself (no analyst data), both growths 10%+, giants only' },
  'SQ12-ACCEL2': { family: 'fundamentals', hold: HOLD, name: 'Big company whose revenue growth accelerated two quarters in a row (10-Q / 10-K)',
    papers: [P('He & Narayanamoorthy (2020) Earnings acceleration and stock returns, Journal of Accounting and Economics 69(1)', 'https://doi.org/10.1016/j.jacceco.2019.101238'), P('Jegadeesh & Livnat (2006) Revenue surprises and stock returns, Journal of Accounting and Economics 41(1-2)', 'https://doi.org/10.1016/j.jacceco.2005.10.002')],
    reported: 'acceleration of growth predicts returns beyond the level of growth (shown for earnings; here applied to revenue: a deviation)',
    rule: 'An original 10-Q or 10-K (SEC XBRL, by CIK) of a top-300 company: its latest quarter\'s year-on-year revenue growth g0 > the previous quarter\'s g1 > the one before g2, and g0 > 0 (values known on the filing date; a fourth quarter = the year minus the nine-month year-to-date, else minus the three quarters; the same revenue tag for all three). Entry = the open of the first session after the filing date; hold 63.',
    lib: 'SQ4-GROWLEAD (monthly, TTM +30% and one acceleration, near the high: not proven), TIP-THEME(-100) (industry-level acceleration), B-EM1 (beats + rising growth: rejected). New: the filing event, two accelerations in a row, giants only' },
  'SQ12-RAISECONF': { family: '8-K', hold: HOLD, name: 'Big company raises its guidance (8-K) and the market confirms with a higher close',
    papers: [P('Ng, Tuna & Verdi (2013) Management forecast credibility and underreaction to news, Review of Accounting Studies 18(4)', 'https://ideas.repec.org/a/spr/reaccs/v18y2013i4d10.1007_s11142-012-9217-4.html'), CJL],
    reported: 'prices underreact to management forecast news; the reaction confirms the news direction',
    rule: 'An 8-K of a top-300 company (filer CIK) matched by the Squad 1 guidance-raise phrases (squad1-core GUIDE_PHRASES, EDGAR full-text search), first per company in 60 days; CONFIRMED: the close of the first session after the filing date is above the close of the last session before it. Signal = that session; buy the next open; hold 63.',
    lib: 'SQ1-GUIDEUP (the same phrases, whole market, no confirmation, bought the day after the filing: rejected). New: giants only, matched by the filing CIK, and the market must confirm' },
  'SQ12-INVDAY': { family: '8-K', hold: HOLD, name: 'Big company investor / analyst day (8-K) followed by a higher close',
    papers: [P('Kirk & Markov (2016) Come on Over: Analyst/Investor Days as a Disclosure Medium, The Accounting Review 91(6)', 'https://doi.org/10.2308/accr-51441')],
    reported: 'analyst / investor days carry new information: significant price and volume reactions and analyst forecast revisions',
    rule: 'An 8-K of a top-300 company (filer CIK) with items 7.01 or 8.01 and NOT 2.02 (not an earnings release) that contains "investor day", "analyst day" or "capital markets day" (EDGAR full-text search), first per company in 180 days; CONFIRMED as SQ12-RAISECONF (close after the filing date above the close before it). Signal = that session; buy the next open; hold 63.',
    lib: 'none (first investor-day rule)' },
};
export const IDS = Object.keys(RULES);
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Events in big companies (Squad 12)', name: r.name, explain: r.rule + ' ' + COMMON + ' Paper(s): ' + r.papers.map(p => p.cite).join('; ') + '. Reported: ' + r.reported + '.',
      status: 'pre-registered ' + today + ' (squad 12); 5-year one-shot pending', agent: 'squad12', registered: today, libraryCheck: r.lib,
      note: 'Pre-registered ' + today + ' BEFORE any run (squad12-core.mjs = the exact rule). 5-year one-shot by squad12-lab.mjs, first complete verdict frozen in data/squad12-lab.json; forward paper lane (data/squad12-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
