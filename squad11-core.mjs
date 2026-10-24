// SQUAD 11 CORE (24 Oct 2026; squad11-lab.mjs uses it). "BUY THE DIP ONLY IN PROVEN LEADERS." Pure functions, no network, no files.
// test/squad11-core.test.mjs. Long only; no leverage; no shorting; never places an order.
// WHY: what survived so far is momentum among large caps held for months (SQ6-MTUM, SQ6-QMOM), bought on FIXED dates. Many dip rules
// failed on the WHOLE market (T5, M6, M7, DEC-PB, SQ4-QUALDIP...). The question here: among the same kind of leaders (large caps with the
// best 12-1 month return), does buying on a pullback beat buying them on the fixed date (the month start)? And does it beat the average
// stock and SPY per year of capital tied up?
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ11-*; squad11-lab.mjs writes the same text into
// data/strategy-library.json before computing anything). Each rule is run ONCE on the 5-year window; the first complete verdict is frozen
// in data/squad11-lab.json firstRun (first-run.mjs freezeEach). No tuning on results.
//
// COMMON (all rules):
//   UNIVERSE = THE 300 LARGEST BY MARKET VALUE at the close of each month end t0 (the last session of a calendar month), point in time:
//     exactly Squad 5's market value (squad5-core capAt): liquid US operating companies (close >= 5 USD, 20-session average traded value
//     >= 5M USD, dead stocks included, SEC company number from the historical Form 3/4/5 ticker map, SEC revenue facts, one ticker per
//     company, US domicile, no 20-F / 40-F), close as traded x the SEC share count known 30+ days before t0 (else the financial-statement
//     count from its filing date; split-corrected), the 0.02% turnover guard. No look-ahead: everything known at the t0 close.
//   LEADER = among those 300, the top 20% (ceil) by 12-1 month return = close 21 sessions before t0 / close 252 sessions before t0 - 1
//     (both known; ties by key). The leader set of month end t0 is used for signals at the closes t with t0 < t <= the next month end.
//     (The MSCI risk-adjusted variant is SQ6-MTUM's; not repeated here.)
//   SIGNAL at the close of t on a leader that is liquid at t; BUY the next open (session t+1); SELL at the close of the rule's hold
//     session (k + hold - 1); a stock that stops trading = its last close. One open trade per stock per rule (a signal while that rule
//     already holds the stock is skipped). No stops (the hold is the plan).
//   COST 0.8% round trip (1.2% stress). Halves by signal date (before / from 2024-01-01). JUDGED with hold-core judgeHold (value-core
//     tier-2 standard + the long-hold gate) on both halves: > 0 after 0.8% and 1.2%, better than the average liquid stock bought and sold at
//     the same moments (yardstick.mjs capBoth: rule and yardstick capped at +300%, engine audit AUD-1), better than the same stock held as
//     long on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks per half, block t >= 2.5 (blocks: 21 sessions for hold 21,
//     63 sessions for holds 63 and 126), AND return per year of capital tied up (sum of net returns / sum of years held) above SPY's over the
//     same days (SPY not charged any cost) in both halves. A trade whose path holds a near-whole 3x-50x one-day jump (an unadjusted split)
//     is left out, and so is such a stock in the yardstick.
//   THE TIMING QUESTION (reported for every dip rule, information, not a gate): each dip trade's TWIN = the same stock bought at the open
//     of the first session after its leader month end t0 (the fixed date) and held the SAME number of sessions. Reported per half: average
//     dip net minus twin net, share of trades where the dip did better. Plus the control rule SQ11-MS63 below, judged like the others.
//   PER CALENDAR YEAR (information): per signal year, trades, average net, average SPY and average liquid stock over the same days.
//
// THE RULES (hold fixed before the run):
//   SQ11-PB8    hold 63:  the FIRST close >= 8% under the leader's highest close of the last 50 sessions (today included) while the close
//                         is above its 200-session average (the previous close was less than 8% under its own 50-session high).
//   SQ11-PB12   hold 126: the same with 12%.
//   SQ11-MA50   hold 63:  touch of the 50-day average from above: today's low <= the 50-session average of the closes, and each of the 10
//                         previous closes was above its own 50-session average.
//   SQ11-3DN    hold 21:  the third down close in a row (close < previous close on t, t-1, t-2) and the close of t-3 was not under t-4's.
//   SQ11-FLUSH  hold 63:  market-wide selloff: the leader closes 5%+ down (close to close) on a session SPY closes 2%+ down. (A news check
//                         is not possible point in time; the SPY condition makes it market-wide.)
//   SQ11-20D    hold 21:  first close under the 20-session average after a 3-month run: close < its 20-session average; each of the 20
//                         previous closes at or above its own 20-session average; close of t-1 / close of t-64 - 1 >= 20%.
//   SQ11-MS63   hold 63:  CONTROL (the fixed date): every leader bought at the open of the first session after each month end (signal =
//                         the month-end close), held 63 sessions; one open trade per stock.
import { smaArr } from './squad6-core.mjs';
export { smaArr };
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', TOPN = 300, LEADER_FRAC = 0.20, YEAR = 252;
export const RULES = {
  'SQ11-PB8': { name: 'Leader pullback: first close 8% under its 50-day high, still above its 200-day (hold 63)', hold: 63, block: 63,
    rule: 'Leader (top 20% by 12-1 month return among the 300 largest US companies by market value at the prior month end). Signal: the first close >= 8% under the highest close of the last 50 sessions (today included) while the close is above the 200-session average (the previous close was less than 8% under its own 50-session high). Buy the next open; sell at the close of session 63.' },
  'SQ11-PB12': { name: 'Leader pullback: first close 12% under its 50-day high, still above its 200-day (hold 126)', hold: 126, block: 63,
    rule: 'Leader (as SQ11-PB8). Signal: the first close >= 12% under the highest close of the last 50 sessions while the close is above the 200-session average (the previous close was less than 12% under its own 50-session high). Buy the next open; sell at the close of session 126.' },
  'SQ11-MA50': { name: 'Leader touches its 50-day average from above (hold 63)', hold: 63, block: 63,
    rule: 'Leader (as SQ11-PB8). Signal: today\'s low <= the 50-session average of the closes, and each of the 10 previous closes was above its own 50-session average. Buy the next open; sell at the close of session 63.' },
  'SQ11-3DN': { name: 'Leader after 3 down days in a row (hold 21)', hold: 21, block: 21,
    rule: 'Leader (as SQ11-PB8). Signal: the third down close in a row (close below the previous close on t, t-1 and t-2) and the close of t-3 not below that of t-4. Buy the next open; sell at the close of session 21.' },
  'SQ11-FLUSH': { name: 'Leader drops 5%+ on a day SPY drops 2%+ (market-wide selloff, hold 63)', hold: 63, block: 63,
    rule: 'Leader (as SQ11-PB8). Signal: the leader\'s close is 5%+ under the previous close on a session when SPY\'s close is 2%+ under its previous close. Buy the next open; sell at the close of session 63. (No point-in-time news check exists; the SPY condition makes the drop market-wide.)' },
  'SQ11-20D': { name: 'Leader\'s first close under its 20-day average after a 3-month run of 20%+ (hold 21)', hold: 21, block: 21,
    rule: 'Leader (as SQ11-PB8). Signal: close below its 20-session average; each of the 20 previous closes at or above its own 20-session average; close of t-1 / close of t-64 - 1 >= 20%. Buy the next open; sell at the close of session 21.' },
  'SQ11-MS63': { name: 'CONTROL: buy every leader at the month start (fixed date, hold 63)', hold: 63, block: 63, control: true,
    rule: 'Every leader (as SQ11-PB8) bought at the open of the first session after each month end (signal = the month-end close); sell at the close of session 63; one open trade per stock (a leader still held is not bought again).' },
};
export const IDS = Object.keys(RULES), DIP_IDS = IDS.filter(id => !RULES[id].control);
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
// ---------------- calendar ----------------
// month ends: the last session of each calendar month whose next session is known to be in a later month (index into D)
export function monthEnds(D) { const o = []; for (let t = 0; t + 1 < D.length; t++) if (D[t + 1].slice(0, 7) !== D[t].slice(0, 7)) o.push(t); return o; }
// the latest month end strictly before t (binary search over the sorted month ends); -1 if none
export function leaderMonthOf(ME, t) { let lo = 0, hi = ME.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (ME[m] < t) { r = ME[m]; lo = m + 1; } else hi = m - 1; } return r; }
// ---------------- leaders ----------------
// 12-1 month return at t: close 21 sessions ago / close 252 sessions ago - 1
export function mom121(c, t) { if (t < 252) return null; const a = c[t - 252], b = c[t - 21]; return a > 0 && b > 0 ? b / a - 1 : null; }
// rows [{ key, m }] -> keys of the top `frac` (ceil) by m (desc; ties key asc); rows without m are left out
export function leaderPick(rows, frac = LEADER_FRAC) { const r = rows.filter(x => ok(x.m)).sort((a, b) => b.m - a.m || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)); return r.slice(0, Math.ceil(r.length * frac)).map(x => x.key); }
// ---------------- setups (c, l = closes / lows; s20 / s50 / s200 = precomputed averages of the closes) ----------------
export function highClose(c, t, n) { if (t - n + 1 < 0) return null; let m = -Infinity, have = 0; for (let k = t - n + 1; k <= t; k++) if (c[k] > 0) { have++; if (c[k] > m) m = c[k]; } return have >= n * 0.9 ? m : null; }
const under = (c, t, n, pct) => { const h = highClose(c, t, n); return h !== null && c[t] > 0 && c[t] <= h * (1 - pct) * (1 + 1e-12); };
export function pullbackFirst(c, s200, t, pct, n = 50) { if (t < 1 || !(c[t] > 0) || !(s200[t] > 0) || !(c[t] > s200[t])) return false; return under(c, t, n, pct) && !under(c, t - 1, n, pct) && c[t - 1] > 0; }
export function ma50Touch(c, l, s50, t, look = 10) { if (t - look < 0 || !(l[t] > 0) || !(s50[t] > 0) || !(l[t] <= s50[t])) return false; for (let k = t - look; k < t; k++) if (!(c[k] > 0) || !(s50[k] > 0) || !(c[k] > s50[k])) return false; return true; }
export function down3(c, t) { if (t < 4) return false; for (let k = t - 4; k <= t; k++) if (!(c[k] > 0)) return false; return c[t] < c[t - 1] && c[t - 1] < c[t - 2] && c[t - 2] < c[t - 3] && !(c[t - 3] < c[t - 4]); }
export function flush(c, spy, t, drop = 0.05, mkt = 0.02) { if (t < 1 || !(c[t] > 0) || !(c[t - 1] > 0) || !(spy[t] > 0) || !(spy[t - 1] > 0)) return false; return c[t] / c[t - 1] - 1 <= -drop + 1e-12 && spy[t] / spy[t - 1] - 1 <= -mkt + 1e-12; }
export function first20(c, s20, t, run = 0.20) { if (t - 64 < 0 || !(c[t] > 0) || !(s20[t] > 0) || !(c[t] < s20[t])) return false; for (let k = t - 20; k < t; k++) if (!(c[k] > 0) || !(s20[k] > 0) || c[k] < s20[k]) return false; return c[t - 64] > 0 && c[t - 1] / c[t - 64] - 1 >= run - 1e-12; }
// which dip rules fire at t (A = { c, l, s20, s50, s200 } of one stock, spy = SPY closes)
export function dipSignals(A, spy, t) { const o = [];
  if (pullbackFirst(A.c, A.s200, t, 0.08)) o.push('SQ11-PB8'); if (pullbackFirst(A.c, A.s200, t, 0.12)) o.push('SQ11-PB12'); if (ma50Touch(A.c, A.l, A.s50, t)) o.push('SQ11-MA50');
  if (down3(A.c, t)) o.push('SQ11-3DN'); if (flush(A.c, spy, t)) o.push('SQ11-FLUSH'); if (first20(A.c, A.s20, t)) o.push('SQ11-20D'); return o; }
// ---------------- the fixed hold ----------------
// buy the open of k = t + 1, sell the close of k + hold - 1. S = { o, c }; last = the stock's last session with a close; T = sessions.
// Returns { k, x, px0, px1, g, kind ('max' | 'gone'), days } ; { open: true, k, px0 } when the data ends first ; null if never bought.
// A stock is gone when its last close is 6+ sessions before the newest session (a missing final bar or two is not a delisting).
export function holdTrade(S, t, last, T, hold) { const k = t + 1; if (k > T - 1) return { open: true, k, px0: null, pending: true }; if (!(S.o[k] > 0)) return null; const px0 = S.o[k], x = k + hold - 1;
  if (last < T - 6 && last < x) { for (let q = last; q >= k; q--) if (S.c[q] > 0) return { k, x: q, px0, px1: S.c[q], g: S.c[q] / px0 - 1, kind: 'gone', days: q - k + 1 }; return { k, x: k, px0, px1: px0, g: 0, kind: 'gone', days: 1 }; }
  if (x > T - 1) return { open: true, k, px0 };
  for (let q = x; q >= k; q--) if (S.c[q] > 0) return { k, x, px0, px1: S.c[q], g: S.c[q] / px0 - 1, kind: 'max', days: x - k + 1 };
  return null; }
// ---------------- reporting ----------------
// return per year of capital tied up: sum of (key - cost) over the sum of years held (days / 252); rows with the key only
export function perYearOf(rows, key, cost) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
// the timing question: rows with g (dip, capped) and twin (fixed date, same stock, same hold, capped)
export function timing(rows) { const v = rows.filter(z => ok(z.g) && ok(z.twin)); if (!v.length) return { n: 0 };
  return { n: v.length, dipAvg: r4(mean(v.map(z => z.g - COST))), fixedDateAvg: r4(mean(v.map(z => z.twin - COST))), dipMinusFixed: r4(mean(v.map(z => z.g - z.twin))), dipBetterShare: r4(v.filter(z => z.g > z.twin).length / v.length) }; }
export function byYear(rows) { const m = new Map(); for (const z of rows) { const y = z.sig.slice(0, 4); (m.get(y) || m.set(y, []).get(y)).push(z); }
  return Object.fromEntries([...m.entries()].sort().map(([y, a]) => [y, { n: a.length, avg: r4(mean(a.map(z => z.g - COST))), spy: r4(mean(a.filter(z => ok(z.spy)).map(z => z.spy))), avgStock: r4(mean(a.filter(z => ok(z.c)).map(z => z.c - COST))), beatsSpy: mean(a.map(z => z.g - COST)) > mean(a.filter(z => ok(z.spy)).map(z => z.spy)) }])); }
export function shape(tr, cost = COST) { const net = tr.map(z => z.g - cost), w = net.filter(x => x > 0), l = net.filter(x => x <= 0);
  return { n: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avg: tr.length ? r4(mean(net)) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, worst: net.length ? r4(Math.min(...net)) : null }; }
export function boardStats(rows) { const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => r.g - r.c))) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
// ---------------- library pre-registration (idempotent; before any computation) ----------------
const COMMON = 'Common (squad11-core.mjs header): universe = the 300 largest US operating companies by point-in-time market value at each month-end close (Squad 5\'s market value: close as traded x the SEC share count known 30+ days earlier, dead stocks included, US domicile, one ticker per company); leader = the top 20% of them by 12-1 month return, used for the signals of the following month. Buy the next open, sell at the close of the hold session (a stock that stops trading: its last close); one open trade per stock per rule; no stops. Cost 0.8% (1.2% stress). Judged once (first complete run frozen in data/squad11-lab.json firstRun) with hold-core judgeHold on both halves (signal before / from 2024-01-01): > 0 after 0.8% and 1.2%, better than the average liquid stock at the same moments (rule and yardstick capped at +300%, AUD-1), better than the same stock held as long on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks per half, block t >= 2.5, and return per year of capital tied up above SPY on the same days in both halves. Reported: each dip trade vs buying the same leader at the month start for the same hold (the timing question), and per calendar year vs SPY.';
const CHECK = 'Not among T5 / M6 / M7 / M13 / DEC-PB / DEC2-H2 / DEC2-HOLYG (dips on the whole liquid market or trend templates, no point-in-time market-value universe), SQ4-QUALDIP (quality 20% dip, 12-month plan), TIP-DIPLEAD (industry top-3 30% under its high in a 15% market drawdown), SQ5-MOMBUF / SQ6-MTUM / SQ6-QMOM (momentum baskets on fixed dates: the comparison this squad makes).';
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Buy the dip only in proven leaders (Squad 11)', name: r.name, explain: 'RULE: ' + r.rule + ' ' + COMMON, status: 'pre-registered ' + today + ' (squad 11); 5-year one-shot pending', agent: 'squad11', registered: today, hold: r.hold,
      libraryCheck: CHECK, note: 'Pre-registered ' + today + ' BEFORE any run (squad11-core.mjs = the exact rule; one version). 5-year one-shot by squad11-lab.mjs, first complete verdict frozen; forward paper lane (data/squad11-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
