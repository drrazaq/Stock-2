// SQUAD 18 CORE (24 Oct 2026; squad18-lab.mjs uses it). "THINK LIKE THE HUMANS ON THE OTHER SIDE." Pure functions, no network, no files.
// test/squad18-core.test.mjs. Long only; no leverage; no shorting; never places an order.
// THE OWNER'S IDEA: the index never stops, but a careful trader can STOP when the news is bad and hunt only the right deals; traders are
// people (they sell on Fridays to hold cash over the weekend; volume shows on which days they are buying). Test these human habits mainly
// as FILTERS / TIMING on the rules that already work, and a few standalone.
//
// ALREADY TESTED (not repeated; the answer is quoted in the report): day of the week of the buy (the bot's `days` study, data/dow-study.json:
// "no steady difference" Monday to Friday in both halves); market-day study (data/mday-study.json: buys after a big DOWN day or a gap down
// did BETTER in both halves, i.e. the opposite of standing aside); turn of the month C1 / C2 / ANOM-TOM / DEC2-TOM (all REJECTED); pre-holiday
// ANOM-PREHOL (REJECTED); month-day effects C4; HOLD-DIPFUND (save monthly, buy only on a 10% fund dip: mixed, +1.0% SPUS / -2.3% HLAL vs
// monthly buying); A-RG1 / SQ3-REGIME / HOLD-REGIME (S&P 500 under its 200-day as a gate: not worse; regime sizing REJECTED); MACRO-VIX-E20/E60
// (buy SPY after a fear spike: TOO FEW); ANOM-HVP (high-volume premium: REJECTED); SQ8-ACCUM (up-volume vs down-volume on runners: REJECTED).
// NEW HERE: a market-stress stand-aside, the weekend-selling entry delay and the Friday leader dip, market accumulation vs distribution
// (IBD-style day counts) as a gate, the volume of a leader's own pullback, delaying fund-rule rebalances while the market is stressed, and
// WHEN in the month the owner's monthly contribution is invested.
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ18-*; squad18-lab.mjs writes the same text into
// data/strategy-library.json before computing anything). Each rule is run ONCE on the 5-year window; the first complete verdict is frozen
// in data/squad18-lab.json firstRun (first-run.mjs freezeEach). No tuning on results.
//
// COMMON:
//   THE RULES FILTERED (rebuilt exactly as written, then the filter applied to the SAME signals):
//     PB12 = SQ11-PB12 (squad11-core.mjs: leader = top 20% by 12-1 month return of the 300 largest US companies by point-in-time market value
//       at the prior month end; signal = the FIRST close >= 12% under the highest close of the last 50 sessions while above the 200-session
//       average; buy the next open; sell at the close of session 126; one open trade per stock).
//     MTUM = SQ6-MTUM (squad6-core.mjs mtumPick: last session of May / November, the 600 most traded liquid stocks, risk-adjusted 6 and
//       12-month momentum, top 20%; buy the next open; sell at the close of session 126).
//     QMOM = SQ6-QMOM (squad6-core.mjs qmomPick: last session of Feb / May / Aug / Nov, the 1000 most traded liquid stocks minus REITs,
//       top 10% 12-2 momentum, the smoother half by FIP; buy the next open; sell at the close of session 63).
//     BASKET = SQ10-SH20-C15 (the 20 largest Shariah-screened companies, cap-weighted with no stock above 15%, re-formed quarterly): the
//       quarterly member lists exactly as frozen in data/squad10-lab.json trades (point in time, made by squad 10), each member bought at
//       its buy open and sold at its sell close; weights = squad10-core weightsFor at the member list's signal close with this lab's
//       point-in-time market value (squad 5 capAt; a member without a market value gets the average weight of the others, reported).
//     SPUS (the owner's halal fund) and MIX50 (SQ17-MIX50: 50% SPUS + 50% BASKET, back to 50/50 at each basket re-forming) are reported
//       next to the basket for the contribution rules (information).
//   MARKET STRESS at a close t (all inputs known at that close; the buy is the next open):
//     (a) SPY closes 2%+ under its previous close; OR
//     (b) FEAR JUMP: VIXY (the VIX short-term futures fund; the VIX index itself is not in the price data) closes 15%+ over its previous
//         close (a VIXY day of +15% is roughly a VIX day of +25-30%); OR
//     (c) DISTRIBUTION: 5+ ACTIVE IBD distribution days among the last 25 sessions (t included): SPY closes 0.2%+ down on HIGHER volume
//         than the session before; a distribution day stops counting once SPY closes 5%+ above that day's close (IBD's own expiry rule).
//         AMENDMENT (24 Oct 2026, after the DIAG data check, BEFORE any rule was run or any trade result seen): the first text had no 5%
//         expiry; the DIAG run showed 5+ raw distribution days on 736 of 1012 sessions (73%: "stress" nearly always on, not the owner's
//         "bad-news day"). The expiry is IBD's published rule (the text already said IBD-style), not a value fitted to results; nothing else
//         changed. The raw count is still used for the ACCUM rule (accumulation vs distribution, both raw), as registered.
//         Data note from the same DIAG: VIXY and SPUS are not in the stock price cache; they are loaded from Massive daily bars.
//   ACCUMULATION DAY = SPY closes 0.2%+ up on higher volume than the session before.
//   COST 0.8% round trip (1.2% stress). Halves by signal date (before / from 2024-01-01). Trade rules JUDGED exactly like squad 11 (hold-core
//   judgeHold: > 0 after 0.8% and 1.2%, better than the average liquid stock bought and sold at the same moments (rule and yardstick capped
//   at +300%, AUD-1), better than the same stock held as long on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks per half,
//   block t >= 2.5, return per year of capital tied up above SPY on the same days in both halves). A trade whose path holds an unadjusted
//   split jump is left out.
//   EVERY FILTER ALSO REPORTS WHAT IT REMOVED (information, not a gate): the removed trades' n, average after cost, average stock, win rate,
//   per year vs SPY, per half; and the unfiltered base rule judged by the same code next to it (reference, not a new rule).
//
// THE RULES:
//   SQ18-PB12-CALM   hold 126: PB12, but a signal is SKIPPED when the market is under STRESS at the signal close (a, b or c).
//   SQ18-PB12-MON    hold 126: PB12, but a signal at a Thursday or Friday close is bought at the open of the first session of the NEXT
//                    calendar week (Monday, or Tuesday after a holiday) instead of the next open (does weekend selling give a better
//                    price?); the sell is the close of session 126 counted from the actual buy. Other signals unchanged. Reported: for the
//                    moved trades, the Monday entry vs the next-open entry, trade by trade.
//   SQ18-FRIDIP      hold 21 (standalone): a leader (PB12's leader set) closes 2%+ under its previous close on a FRIDAY while SPY closes
//                    better than -1% that day (stock-specific weekend selling, not a market fall); buy the next open (Monday); sell at the
//                    close of session 21; one open trade per stock. Reported as information: the same rule on Monday-Thursday closes.
//   SQ18-PB12-ACCUM  hold 126: PB12, kept only when the market's accumulation days >= its distribution days over the last 25 sessions
//                    (signal close included).
//   SQ18-PB12-DRY    hold 126: PB12, kept only when the pullback came on SHRINKING volume: the stock's average volume over the last 10
//                    sessions (t-9..t) is below its average over the 50 sessions before them (t-59..t-10) (sellers tired). The removed
//                    trades = pullbacks on heavy volume.
//   SQ18-MTUM-CALM   hold 126: MTUM, but when the market is under STRESS at the formation close, the buy waits: the open after the first
//                    calm close among the next 21 sessions (else the open after the 21st); the sell stays the base trade's (close of
//                    session 126 from the base buy). Reported: the delayed trades vs the base entry.
//   SQ18-QMOM-CALM   hold 63: QMOM, delayed the same way; the sell stays the base trade's (session 63 from the base buy).
//   CONTRIBUTION TIMING (the owner's monthly 1,000 USD into the BASKET; account rules, NOT trades, never TRY SMALL):
//     plain = buy at the open of the FIRST session of each calendar month (the comparison).
//     SQ18-BASK-DIP3  buy at the open after the first close of the month (first to second-to-last session) that is 3%+ under SPY's highest
//                     close since the previous month's last close (that close included); no such close -> the open of the month's last session.
//     SQ18-BASK-MID   buy at the open of the first session on or after the 15th (mid-month, when salary money has gone in).
//     SQ18-BASK-END   buy at the open of the LAST session of the month (just before the turn-of-month / salary inflows).
//     Each month the same 1,000 USD, 0.4% per buy, all months from January 2022 to the last COMPLETE month. Accounts per half: months before
//     2024 valued at the last close of 2023; months from 2024 valued at the newest close. MONTHLY ADVANTAGE = plain-day open price /
//     variant-day open price - 1 (> 0 = the variant bought cheaper; the units bought are in that ratio). Verdict (pre-set): BETTER TIMING
//     when the basket's average monthly advantage > 0 AND its account value > plain in BOTH halves AND the t of the monthly advantages over all
//     months >= 2.0; WORSE when the average advantage < 0 in both halves; else NO STEADY DIFFERENCE. SPUS, SPY and MIX50 reported alongside.
//   INFORMATION SPLITS of the base PB12 trades (no rule; already-tested habits re-checked on the one rule that works): by buy weekday, signal
//   on a pre-holiday session, signal inside the turn-of-month window (last 2 / first 3 sessions of a month), signal on an SPY -2% day.
import { isoWeek } from './squad6-core.mjs';
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', BUY_COST = 0.004, YEAR = 252;
export const STRESS_SPY = -0.02, STRESS_VIXY = 0.15, DIST_TH = 0.002, DIST_N = 25, DIST_MAX = 5, DIST_EXPIRE = 0.05, DELAY_MAX = 21, DIP_MKT = 0.03;
export const RULES = {
  'SQ18-PB12-CALM': { name: 'Leader 12% pullback (SQ11-PB12), skipped on market-stress closes (hold 126)', hold: 126, block: 63, base: 'PB12', kind: 'filter',
    rule: 'SQ11-PB12 signals, SKIPPED when the market is under stress at the signal close: SPY closes 2%+ down, or VIXY closes 15%+ up, or 5+ active IBD distribution days (SPY 0.2%+ down on higher volume than the session before, retired once SPY closes 5%+ above it) among the last 25 sessions. Buy the next open; sell at the close of session 126.' },
  'SQ18-PB12-MON': { name: 'Leader 12% pullback (SQ11-PB12), Thursday/Friday signals bought at the next week\'s first open (hold 126)', hold: 126, block: 63, base: 'PB12', kind: 'timing',
    rule: 'SQ11-PB12 signals; a signal at a Thursday or Friday close is bought at the open of the first session of the next calendar week (Monday, or Tuesday after a holiday) instead of the next open; sell at the close of session 126 from the actual buy. Other signals unchanged.' },
  'SQ18-FRIDIP': { name: 'Leader falls 2%+ on a Friday while SPY falls less than 1%; buy Monday open (hold 21)', hold: 21, block: 21, kind: 'standalone',
    rule: 'Leader (top 20% by 12-1 month return among the 300 largest US companies by market value at the prior month end, as SQ11). Signal: on a Friday close, the leader closes 2%+ under its previous close while SPY closes better than -1%. Buy the next open (Monday); sell at the close of session 21; one open trade per stock.' },
  'SQ18-PB12-ACCUM': { name: 'Leader 12% pullback (SQ11-PB12), only when market accumulation days >= distribution days (hold 126)', hold: 126, block: 63, base: 'PB12', kind: 'filter',
    rule: 'SQ11-PB12 signals, kept only when, over the last 25 sessions (signal close included), SPY accumulation days (0.2%+ up on higher volume than the session before) >= distribution days (0.2%+ down on higher volume). Buy the next open; sell at the close of session 126.' },
  'SQ18-PB12-DRY': { name: 'Leader 12% pullback (SQ11-PB12) on shrinking volume only (hold 126)', hold: 126, block: 63, base: 'PB12', kind: 'filter',
    rule: 'SQ11-PB12 signals, kept only when the stock\'s average volume over the last 10 sessions (t-9..t) is below its average volume over the 50 sessions before them (t-59..t-10). Buy the next open; sell at the close of session 126.' },
  'SQ18-MTUM-CALM': { name: 'MSCI-style momentum (SQ6-MTUM), buy delayed while the market is stressed (hold to the base exit, 126)', hold: 126, block: 126, base: 'MTUM', kind: 'delay',
    rule: 'SQ6-MTUM picks (last session of May / November). When the market is under stress at the formation close (as SQ18-PB12-CALM), buy at the open after the first calm close among the next 21 sessions (else after the 21st); sell at the base trade\'s exit (the close of session 126 from the base buy).' },
  'SQ18-QMOM-CALM': { name: 'Quantitative momentum (SQ6-QMOM), buy delayed while the market is stressed (hold to the base exit, 63)', hold: 63, block: 63, base: 'QMOM', kind: 'delay',
    rule: 'SQ6-QMOM picks (last session of Feb / May / Aug / Nov). When the market is under stress at the formation close (as SQ18-PB12-CALM), buy at the open after the first calm close among the next 21 sessions (else after the 21st); sell at the base trade\'s exit (the close of session 63 from the base buy).' },
  'SQ18-BASK-DIP3': { name: 'Monthly 1,000 USD into the halal basket: buy after the first 3% SPY dip of the month (else the last session)', kind: 'contribution', variant: 'dip3',
    rule: 'Each month: buy the halal top-20 basket (SQ10-SH20-C15) at the open after the first close of the month (first to second-to-last session) that is 3%+ under SPY\'s highest close since the previous month\'s last close; if none, at the open of the month\'s last session. Compared with buying at the open of the month\'s first session.' },
  'SQ18-BASK-MID': { name: 'Monthly 1,000 USD into the halal basket: buy mid-month (first session on or after the 15th)', kind: 'contribution', variant: 'mid',
    rule: 'Each month: buy the halal top-20 basket (SQ10-SH20-C15) at the open of the first session on or after the 15th. Compared with buying at the open of the month\'s first session.' },
  'SQ18-BASK-END': { name: 'Monthly 1,000 USD into the halal basket: buy at the month\'s last session (before turn-of-month inflows)', kind: 'contribution', variant: 'end',
    rule: 'Each month: buy the halal top-20 basket (SQ10-SH20-C15) at the open of the month\'s last session. Compared with buying at the open of the month\'s first session.' },
};
export const IDS = Object.keys(RULES), TRADE_IDS = IDS.filter(id => RULES[id].kind !== 'contribution'), CONTRIB_IDS = IDS.filter(id => RULES[id].kind === 'contribution');
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };
export const tStat = (a) => { const s = sd(a); return a.length >= 3 && s > 0 ? +(mean(a) / (s / Math.sqrt(a.length))).toFixed(2) : null; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const weekday = (d) => new Date(d + 'T00:00:00Z').getUTCDay();   // 1 = Monday ... 5 = Friday
// ---------------- market habits (c = SPY closes, v = SPY volumes; index t = the signal close) ----------------
const dayRet = (c, t) => t >= 1 && c[t] > 0 && c[t - 1] > 0 ? c[t] / c[t - 1] - 1 : null;
// counts over the last n sessions (t included): distribution = close th+ down on higher volume than the day before; accumulation = th+ up
export function volDays(c, v, t, n = DIST_N, th = DIST_TH) { let dist = 0, acc = 0, have = 0;
  for (let u = Math.max(1, t - n + 1); u <= t; u++) { const r = dayRet(c, u); if (r === null || !(v[u] > 0) || !(v[u - 1] > 0)) continue; have++;
    if (v[u] > v[u - 1]) { if (r <= -th + 1e-12) dist++; else if (r >= th - 1e-12) acc++; } }
  return { dist, acc, have }; }
// ACTIVE IBD distribution days at t: distribution days among the last n sessions whose close has not since been exceeded by 5%+ (any close
// after the day up to t at or above the day's close x 1.05 retires it)
export function distActive(c, v, t, n = DIST_N, th = DIST_TH, exp = DIST_EXPIRE) { let dist = 0;
  for (let u = Math.max(1, t - n + 1); u <= t; u++) { const r = dayRet(c, u); if (r === null || !(v[u] > 0) || !(v[u - 1] > 0) || !(v[u] > v[u - 1]) || !(r <= -th + 1e-12)) continue;
    let gone = false; for (let q = u + 1; q <= t; q++) if (c[q] > 0 && c[q] >= c[u] * (1 + exp) - 1e-9) { gone = true; break; } if (!gone) dist++; }
  return dist; }
// market stress at close t: { stress, spyDrop, fear, dist }. vixy may be null (that leg off).
export function stressAt(spyC, spyV, vixy, t) { const r = dayRet(spyC, t), f = vixy ? dayRet(vixy, t) : null, vd = volDays(spyC, spyV, t), da = distActive(spyC, spyV, t);
  const spyDrop = r !== null && r <= STRESS_SPY + 1e-12, fear = f !== null && f >= STRESS_VIXY - 1e-12, dist = da >= DIST_MAX;
  return { stress: spyDrop || fear || dist, spyDrop, fear, dist, nDist: vd.dist, nDistActive: da, nAcc: vd.acc }; }
export const accumOk = (spyC, spyV, t) => { const x = volDays(spyC, spyV, t); return x.acc >= x.dist; };
// the pullback on shrinking volume: avg volume t-9..t below avg t-59..t-10 (90% of the days present in each window)
export function dryPullback(v, t) { if (t - 59 < 0) return null; const avg = (a, b) => { let s = 0, n = 0; for (let k = a; k <= b; k++) if (v[k] > 0) { s += v[k]; n++; } return n >= (b - a + 1) * 0.9 ? s / n : null; };
  const near = avg(t - 9, t), before = avg(t - 59, t - 10); return near === null || before === null ? null : near < before; }
// Friday leader dip: the stock's close 2%+ down on a Friday while SPY is better than -1%. isDay = the weekday wanted (5 = Friday)
export function dayDip(c, spy, t, wd, isDay = (w) => w === 5) { if (!isDay(wd)) return false; const r = dayRet(c, t), m = dayRet(spy, t);
  return r !== null && m !== null && r <= -0.02 + 1e-12 && m > -0.01; }
// the first session of the next calendar (ISO) week after t (index into D); null if none in the data
export function nextWeekStart(D, t) { const w = isoWeek(D[t]); for (let k = t + 1; k < D.length; k++) if (isoWeek(D[k]) !== w) return k; return null; }
// MON timing: the buy session of a signal at t (Thursday / Friday -> next week's first session; else t + 1). T = sessions in the data.
export function monBuy(D, t, T) { const wd = weekday(D[t]); if (wd === 4 || wd === 5) { const k = nextWeekStart(D, t); return k === null ? T : k; } return t + 1; }
// DELAY: formation close t; stressed(u) -> bool. Returns the buy session (the open after the first calm close in t..t+max; t+1 when t is calm).
export function delayBuy(stressed, t, max = DELAY_MAX) { for (let u = t; u <= t + max; u++) if (!stressed(u)) return u + 1; return t + max + 1; }
// the fixed hold from a given buy session k (squad11-core holdTrade with k = t + 1 is the same): buy the open of k, sell the close of
// xFix (when given) or of k + hold - 1; a stock that stops trading = its last close; { open: true } when the data ends first; null if no open at k.
export function holdFrom(S, k, last, T, hold, xFix = null) { if (k > T - 1) return { open: true, k, px0: null, pending: true }; if (!(S.o[k] > 0)) return null; const px0 = S.o[k], x = xFix === null ? k + hold - 1 : xFix;
  if (last < T - 6 && last < x) { for (let q = last; q >= k; q--) if (S.c[q] > 0) return { k, x: q, px0, px1: S.c[q], g: S.c[q] / px0 - 1, kind: 'gone', days: q - k + 1 }; return { k, x: k, px0, px1: px0, g: 0, kind: 'gone', days: 1 }; }
  if (x > T - 1) return { open: true, k, px0 };
  for (let q = x; q >= k; q--) if (S.c[q] > 0) return { k, x, px0, px1: S.c[q], g: S.c[q] / px0 - 1, kind: 'max', days: x - k + 1 };
  return null; }
// a pre-holiday session: the next session is not the next weekday (a weekday market closure follows). next = the next session's date.
export function preHoliday(d, next) { if (!next) return false; const x = new Date(d + 'T00:00:00Z'); do { x.setUTCDate(x.getUTCDate() + 1); } while (x.getUTCDay() === 0 || x.getUTCDay() === 6); return x.toISOString().slice(0, 10) !== next; }
// turn-of-month window: t among the last 2 or the first 3 sessions of its month (D = all session dates)
export function inTom(D, t) { const ym = D[t].slice(0, 7); let before = 0, after = 0; for (let k = t + 1; k < D.length && D[k].slice(0, 7) === ym; k++) after++; for (let k = t - 1; k >= 0 && D[k].slice(0, 7) === ym; k--) before++;
  const lastKnown = t + after + 1 < D.length; return before < 3 || (lastKnown && after < 2); }
// ---------------- contribution timing ----------------
// month groups: [{ ym, idx: [session indexes] }] (all calendar months in D, in order)
export function monthGroups(D) { const o = []; D.forEach((d, t) => { const ym = d.slice(0, 7); if (!o.length || o[o.length - 1].ym !== ym) o.push({ ym, idx: [] }); o[o.length - 1].idx.push(t); }); return o; }
// the buy session of a month for each variant; prevLast = the previous month's last session index (or -1); spy = SPY closes
export function contribDay(variant, g, D, spy, prevLast) { const idx = g.idx;
  if (variant === 'plain') return idx[0];
  if (variant === 'end') return idx[idx.length - 1];
  if (variant === 'mid') { const j = idx.find(t => +D[t].slice(8, 10) >= 15); return j === undefined ? idx[idx.length - 1] : j; }
  if (variant === 'dip3') { let hi = prevLast >= 0 && spy[prevLast] > 0 ? spy[prevLast] : -Infinity;
    for (let q = 0; q < idx.length - 1; q++) { const t = idx[q]; if (spy[t] > 0) { if (spy[t] > hi) hi = spy[t]; else if (spy[t] <= hi * (1 - DIP_MKT) + 1e-9) return idx[q + 1]; } }
    return idx[idx.length - 1]; }
  return null; }
// accounts: buys = [{ ym, t }] (session indexes), navO / navC = the basket's value at each open / close. Returns per half final value,
// money put in, and the monthly advantage vs plain (plainBuys by ym).
export function account(buys, navO, navC, endOlder, endNewer, cost = BUY_COST) { const half = { older: { units: 0, paid: 0, n: 0 }, newer: { units: 0, paid: 0, n: 0 } };
  for (const b of buys) { const p = navO[b.t]; if (!(p > 0)) continue; const h = halfOf(b.ym + '-01'), H = half[h]; H.units += 1000 * (1 - cost) / p; H.paid += 1000; H.n++; }
  const out = {}; for (const h of ['older', 'newer']) { const e = h === 'older' ? endOlder : endNewer, v = navC[e] > 0 ? half[h].units * navC[e] : null;
    out[h] = { months: half[h].n, paid: half[h].paid, value: r4(v), gain: v !== null && half[h].paid ? r4(v / half[h].paid - 1) : null }; }
  return out; }
export function advantage(plainBuys, buys, navO) { const P = new Map(plainBuys.map(b => [b.ym, b.t])), rows = [];
  for (const b of buys) { const tp = P.get(b.ym); if (tp === undefined || !(navO[tp] > 0) || !(navO[b.t] > 0)) continue; rows.push({ ym: b.ym, half: halfOf(b.ym + '-01'), adv: navO[tp] / navO[b.t] - 1 }); }
  const st = (a) => ({ months: a.length, avg: r4(mean(a.map(x => x.adv))), better: a.length ? r4(a.filter(x => x.adv > 0).length / a.length) : null, t: tStat(a.map(x => x.adv)) });
  return { older: st(rows.filter(x => x.half === 'older')), newer: st(rows.filter(x => x.half === 'newer')), all: st(rows), rows }; }
// pre-set verdict for a contribution rule from the BASKET's numbers
export function contribVerdict(adv, acc, accPlain) { const a = adv, both = (f) => f('older') && f('newer');
  if (both(h => a[h].avg > 0) && both(h => acc[h].value > accPlain[h].value) && a.all.t !== null && a.all.t >= 2.0) return 'BETTER TIMING';
  if (both(h => a[h].avg < 0)) return 'WORSE TIMING';
  return 'NO STEADY DIFFERENCE'; }
// basket value series. P = [{ k, x, w, i }] member legs (buy open k, sell close x, weight w within its period, stock i); periods in order:
// at each period's first buy open the whole value is re-spread by weight; between a leg's sell close and the next period, its money is cash.
// px(i, t, 'o'|'c') = price (null if none). Returns { navO, navC } (NaN before the first buy).
export function basketNav(periods, T, px) { const navO = new Float64Array(T).fill(NaN), navC = new Float64Array(T).fill(NaN); let val = 1;
  for (let p = 0; p < periods.length; p++) { const legs = periods[p].legs, k0 = Math.min(...legs.map(l => l.k)), end = p + 1 < periods.length ? Math.min(...periods[p + 1].legs.map(l => l.k)) - 1 : T - 1;
    const sw = legs.reduce((a, l) => a + l.w, 0); if (!(sw > 0)) continue;
    const L = legs.map(l => { const e = px(l.i, l.k, 'o'); return { ...l, e, w: l.w / sw, cash: null }; }).filter(l => l.e > 0); const lw = L.reduce((a, l) => a + l.w, 0); L.forEach(l => { l.w /= lw; });
    const last = L.map(() => 1);   // each leg's latest value ratio
    for (let t = k0; t <= end; t++) { let o = 0, c = 0;
      L.forEach((l, j) => { if (t < l.k) { o += l.w; c += l.w; return; } if (t > l.x) { o += l.w * last[j]; c += l.w * last[j]; return; } const po = t === l.k ? l.e : px(l.i, t, 'o'), pc = px(l.i, t, 'c');
        const ro = po > 0 ? po / l.e : last[j]; o += l.w * ro; if (pc > 0) last[j] = pc / l.e; c += l.w * last[j]; });
      navO[t] = val * o; navC[t] = val * c; }
    val = navC[end] > 0 ? navC[end] : val; }
  return { navO, navC }; }
// ---------------- reporting ----------------
export function removedReport(rows, cost = COST) { const v = rows.filter(z => ok(z.g)), y = v.reduce((a, z) => a + z.days / YEAR, 0);
  if (!v.length) return { n: 0 };
  return { n: v.length, avg: r4(mean(v.map(z => z.g - cost))), avgStock: r4(mean(v.filter(z => ok(z.c)).map(z => z.c - cost))), spy: r4(mean(v.filter(z => ok(z.spy)).map(z => z.spy))),
    win: r4(v.filter(z => z.g - cost > 0).length / v.length), perYear: y > 0 ? r4(v.reduce((a, z) => a + z.g - cost, 0) / y) : null, spyPerYear: y > 0 ? r4(v.filter(z => ok(z.spy)).reduce((a, z) => a + z.spy, 0) / y) : null,
    bigWinners: v.filter(z => z.g - cost >= 0.30).length, bigLosers: v.filter(z => z.g - cost <= -0.20).length }; }
export function paired(rows) { const v = rows.filter(z => ok(z.g) && ok(z.base)); if (!v.length) return { n: 0 };
  return { n: v.length, ruleAvg: r4(mean(v.map(z => z.g - COST))), baseAvg: r4(mean(v.map(z => z.base - COST))), diff: r4(mean(v.map(z => z.g - z.base))), better: r4(v.filter(z => z.g > z.base).length / v.length), t: tStat(v.map(z => z.g - z.base)) }; }
export function splitBy(rows, f, cost = COST) { const m = new Map(); for (const z of rows) { const k = f(z); if (k === null || k === undefined) continue; (m.get(k) || m.set(k, []).get(k)).push(z); }
  return Object.fromEntries([...m.entries()].sort().map(([k, a]) => [k, { older: removedReport(a.filter(z => z.half === 'older'), cost), newer: removedReport(a.filter(z => z.half === 'newer'), cost) }])); }
// ---------------- library pre-registration (idempotent; before any computation) ----------------
const COMMON = 'Common (squad18-core.mjs header): human-behaviour filters on the rules that already work. PB12 = SQ11-PB12 rebuilt exactly (leaders = top 20% by 12-1 month return of the 300 largest US companies by point-in-time market value; first close 12% under the 50-day closing high above the 200-day; buy the next open, hold 126). MTUM / QMOM = SQ6-MTUM / SQ6-QMOM rebuilt with squad6-core. Market stress at a close = SPY 2%+ down, or VIXY 15%+ up, or 5+ active IBD distribution days (SPY 0.2%+ down on higher volume, retired once SPY closes 5%+ above that day; amended before any run, see the core header) in the last 25 sessions. Cost 0.8% (1.2% stress); judged once (first complete run frozen in data/squad18-lab.json firstRun) with hold-core judgeHold on both halves (signal before / from 2024-01-01), the squad 11 standard (average stock capped +300% AUD-1, same stock other days, no top 2, 20+ trades, 3+ blocks, block t >= 2.5, per year above SPY). Every filter also reports the trades it REMOVED. Contribution rules are accounts on the halal top-20 basket (SQ10-SH20-C15 member lists from data/squad10-lab.json) vs buying on the first session of each month; verdict BETTER TIMING only with a positive monthly advantage and a larger account in both halves and t >= 2.';
const CHECK = 'Not among the bot days study (data/dow-study.json: buy weekday, no steady difference), data/mday-study.json (buy after big down day / gap: better), C1 / C2 / ANOM-TOM / DEC2-TOM (turn of the month, REJECTED), ANOM-PREHOL (REJECTED), C4 (month days), HOLD-DIPFUND (save and buy only a 10% fund dip), A-RG1 / SQ3-REGIME / HOLD-REGIME (200-day regime gates), MACRO-VIX-E20/E60 (buy SPY after a fear spike), ANOM-HVP (high-volume premium), SQ8-ACCUM (up vs down volume on runners), SQ11-FLUSH (leader -5% on an SPY -2% day): none filters the surviving rules or times the monthly basket contribution.';
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Human-behaviour filters and timing (Squad 18)', name: r.name, explain: 'RULE: ' + r.rule + ' ' + COMMON, status: 'pre-registered ' + today + ' (squad 18); 5-year one-shot pending', agent: 'squad18', registered: today, hold: r.hold || null,
      libraryCheck: CHECK, note: 'Pre-registered ' + today + ' BEFORE any run (squad18-core.mjs = the exact rule; one version). 5-year one-shot by squad18-lab.mjs, first complete verdict frozen; forward paper lane (data/squad18-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
