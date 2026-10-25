// SQUAD 20 CORE (25 Oct 2026; Stock-2): "USE THE JUMP DIFFERENTLY". Pure functions, no network, no files. Used by squad20-lab.mjs and
// test/squad20-core.test.mjs. Long only; no leverage; no shorting; never places an order; never gives a halal ruling.
//
// WHAT WAS ALREADY LEARNED (read before writing this; the reason for the four ideas below):
//   Squad 19 (squad19-core.mjs, data/squad19-lab.json): under-5 USD same-day jumps of +40% (about 15 a day) CANNOT be bought profitably
//   long-only: the typical runner closes 22% under its high and falls about 12% over the next 5 days. Squad 13: buying the pullback of a
//   15%+ 10-day runner LOSES. Squad 8: buying after a 15%+ run lags the average stock (short-term reversal). So the jump is not a buy.
//   Here the jump is used (A) as an AVOID filter on the rules that work, (B) as an EXIT for stocks already held, (C) only after the spike
//   has been digested (a "second setup"), and (D) the published one-month momentum among HIGH-turnover large caps.
//
// PRE-REGISTERED 25 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ20-*; squad20-lab.mjs writes the same text into
// data/strategy-library.json before computing anything). Each rule is run ONCE on the 5-year window; the first complete verdict is frozen
// in data/squad20-lab.json firstRun (first-run.mjs freezeEach). No tuning on results. NOT tested (as instructed): sector exclusions chosen
// from past results, DEC-CONTRACT (= DEC2-CONTRACT, rejected), DEC-EPS-REV (no estimate history).
//
// COMMON
//   THE BASE RULES (each rebuilt once, then the filter / exit applied to the SAME trades):
//     PB12     = SQ11-PB12, hold 126 (block 63): the full frozen trade list in data/squad11-lab.json (355 = 99 + 256 trades; signal dates).
//     MTUM     = SQ6-MTUM, hold 126: rebuilt with squad6-core mtumPick exactly as squad 18 did (that rebuild matched the frozen 360 / 479).
//     QMOM     = SQ6-QMOM, hold 63: rebuilt with squad6-core qmomPick (squad 18 rebuild matched the frozen 250 / 500).
//     FCF1     = B-FCF1, hold 63: data/value-lab.json trades (full list; d = the formation close).
//     FROG     = DEC-FROG, hold 126: data/decoded-history.json trades (full list; sig).
//     RESMOM   = ANOM-RESMOM, hold 63, and SUESURGE = ANOM-SUESURGE, hold 60: data/confluence-signals.json.gz (the full lists recomputed by
//                the confluence lab; its check says they match the frozen counts).
//     GOLD     = MACRO-GOLD-S20, hold 20, and USD = MACRO-USD-E60, hold 60 (XLK; loaded from Massive daily bars when not in the cache):
//                data/macro-lab.json trades (full lists).
//     Every base trade: signal close t (the session of its signal date; a date that is not a session -> the last session before it), buy
//     the open of t+1, sell the close of session hold counted from the buy (squad 11 holdTrade convention: a stock whose bars stop early
//     is sold at its last close, 'gone'); one trade per listed signal (the labs' lists already applied their own one-open-trade rules;
//     MTUM / QMOM formations are independent, as in squad 6). A base whose rebuilt count is under 90% of its frozen count is NOT RUN.
//   ONE-DAY MOVE of a stock at session q = close[q] / the last close before q (within 5 sessions) - 1. A move that is a split artifact
//   (squad4-core artifactJumps: a ratio within 3% of a whole number 3..50) is NOT a move. Missing closes count as no move.
//   COST 0.8% round trip (1.2% stress). Halves by signal date (before / from 2024-01-01). Each trade rule is JUDGED like squads 11 / 18
//   (hold-core judgeHold): > 0 after 0.8% and 1.2%, better than the average liquid stock (close 5+ USD, 5M+ USD a day; every second one)
//   bought and sold at the same moments (rule and yardstick capped at +300%, AUD-1), better than the same stock held as long on its other
//   days, > 0 without its 2 best, 20+ trades and 3+ blocks per half, block t >= 2.5, return per year of capital tied up above SPY on the
//   same days in both halves -> TRADABLE SMALL; block t >= the proof bar -> PROVEN. A trade whose path holds a split artifact is left out.
//   The unfiltered base rule is judged by the same code next to every A / B variant (REF-*, reference only, never a new verdict).
//
// A) JUMP AS AN AVOID FILTER (18 rules: SQ20-AV40-<base>, SQ20-AV25-<base>):
//   The base rule, but a signal is SKIPPED when the stock made a one-day move of +40% or more (AV40), or +25% or more (AV25), on any of the
//   10 sessions before the entry (the signal close t and the 9 before it: all known before the entry open). Reported for each: the
//   REMOVED trades (n, average after cost, average stock, win rate, per year vs SPY, per half; winners or losers?) and the KEPT trades.
//   ADOPTION (pre-registered): the coordinator should adopt the filter on a base rule only if in BOTH halves: (1) 5+ trades were removed;
//   (2) the removed trades' average after cost is at least 2 percentage points BELOW the kept trades' average; (3) the removed trades lost to
//   the average stock (their average minus the average stock < 0); and (4) the filtered rule's return per year of capital is not below the
//   base rule's. Otherwise: DO NOT ADOPT (also when nothing, or almost nothing, is removed).
//
// B) JUMP AS AN EXIT (36 rules: SQ20-XH25-<base>, SQ20-XA25-<base>, SQ20-XH40-<base>, SQ20-XA40-<base>):
//   On the base rule's trades: at the FIRST close of a holding session q (buy session k <= q < the planned sell session x) where the stock's
//   one-day move is +25% or more (XH25 / XA25) or +40% or more (XH40 / XA40), sell HALF (XH) or ALL (XA) at that close. For q = k (the buy
//   day) the move is measured from the buy OPEN to the close (the part actually held). The kept half (XH) is sold at the original exit.
//   g(XH) = 0.5 x (close[q] / buy - 1) + 0.5 x g(original); g(XA) = close[q] / buy - 1, sold at q (yardstick and holding time end at q;
//   for XH both legs are averaged). Cost unchanged (0.8% of the money round trip). Compared with the original exit TRADE BY TRADE
//   (the triggered trades: n, new minus original, share better, t) per half, and the changed rule judged under the full standard.
//   ADOPTION (pre-registered): adopt the exit on a base rule only if in BOTH halves: (1) 10+ trades triggered; (2) the average of
//   (new - original) over the triggered trades is > 0; and (3) the changed rule's return per year of capital is not below the base rule's.
//   An exit is not a buy signal: these ids never publish newSignals (data/squad20-today.json methods carry no entry for them).
//
// C) SECOND SETUP AFTER A BIG SPIKE (SQ20-SPIKE2, hold 63, stop 15%):
//   SPIKE at session s: a one-day move of +40% or more from a prior close of 1 USD or more.
//   SIGNAL at the close of t, s + 10 <= t <= s + 30, ALL of: (1) no later spike in s+1..t (the newest spike is the one followed); (2) the
//   stock HELD at least half of the spike's gain: every close s+1..t >= close[s-1] + 0.5 x (close[s] - close[s-1]); (3) no lower low in
//   the last 10: the lowest low of sessions t-9..t >= the lowest low of t-19..t-10 (closes where a low is missing); (4) volume dried up:
//   the average volume of t-10..t-1 < the 50-session average volume of t-50..t-1; (5) breakout: close[t] > the highest close of t-20..t-1
//   AND volume[t] >= 1.5 x that 50-session average; (6) close[t] >= 1 USD and the 20-session average traded value (close x volume, all
//   rows of the price cache, small stocks included) >= 2M USD. The FIRST qualifying t of a spike is the only signal of that spike; one
//   open trade per stock. Buy the next open; STOP: after a close 15% or more under the buy, sell at the next open; else sell at the close
//   of session 63. MATCHED CONTROLS (information, same exits): every spike (no later spike in s+1..s+20; close[s+20] >= 1 USD and 2M+ USD
//   a day at s+20) bought at the open of s+21: NOTHELD = some close in s+1..s+20 under the half-gain level; HELD = all held. Reported per
//   half next to the rule.
//
// D) TURNOVER-CONDITIONED SHORT-TERM MOMENTUM (Medhat & Schmeling, RFS 2022; SQ20-STMOM-1000 and SQ20-STMOM-500, hold 21):
//   At the last session t of every month: the 1000 (resp. 500) largest US companies by point-in-time market value (squad 5 / squad 18
//   universe: liquid close 5+ USD and 5M+ USD a day, company = CIK from the historical SEC Form 3/4/5 ticker map, never today's ticker
//   list; share count = SEC cover count known 30+ days before, else the statement count by filing date; US domicile). Prior-month return =
//   close[t] / close at the previous month's last session - 1; prior-month TURNOVER = the sum of daily share volume over that month's
//   sessions / the point-in-time share count (split basis of the prices; 15+ volume days). BUY = the stocks in BOTH the top decile by
//   prior-month return AND the top decile by turnover (deciles within the 1000 / 500; ceil(10%)). Buy the next open, sell at the close of
//   session 21. Library check: A-TURN1 (the weekly version, queued, never tested); SQ8-LOWTURN (low turnover runners, rejected),
//   ANG-LCREV-M (large-cap 1-month LOSERS, rejected), ANOM-DAYMOM1 (intraday 1-month momentum, rejected): none is this rule.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', YEAR = 252, REGISTERED = '2026-10-25';
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };
export const tStat = (a) => { const s = sd(a); return a.length >= 3 && s > 0 ? +(mean(a) / (s / Math.sqrt(a.length))).toFixed(2) : null; };
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';

// ---------------- the base rules ----------------
export const BASES = {
  PB12:     { id: 'SQ11-PB12',      hold: 126, block: 63,  lab: 'squad11-lab', name: 'Leader 12% pullback (SQ11-PB12)' },
  MTUM:     { id: 'SQ6-MTUM',       hold: 126, block: 126, lab: 'rebuild',     name: 'MSCI-style momentum (SQ6-MTUM)' },
  QMOM:     { id: 'SQ6-QMOM',       hold: 63,  block: 63,  lab: 'rebuild',     name: 'Quantitative momentum (SQ6-QMOM)' },
  FCF1:     { id: 'B-FCF1',         hold: 63,  block: 63,  lab: 'value-lab',   name: 'Free-cash-flow value (B-FCF1)' },
  FROG:     { id: 'DEC-FROG',       hold: 126, block: 126, lab: 'decoded-history', name: 'Frog in the pan (DEC-FROG)' },
  RESMOM:   { id: 'ANOM-RESMOM',    hold: 63,  block: 63,  lab: 'confluence-signals', name: 'Residual momentum (ANOM-RESMOM)' },
  SUESURGE: { id: 'ANOM-SUESURGE',  hold: 60,  block: 60,  lab: 'confluence-signals', name: 'Earnings + revenue surprise (ANOM-SUESURGE)' },
  GOLD:     { id: 'MACRO-GOLD-S20', hold: 20,  block: 20,  lab: 'macro-lab',   name: 'Gold up -> gold miners (MACRO-GOLD-S20)' },
  USD:      { id: 'MACRO-USD-E60',  hold: 60,  block: 60,  lab: 'macro-lab',   name: 'Dollar falling -> XLK (MACRO-USD-E60)' },
};
export const BASE_KEYS = Object.keys(BASES);
export const FILTERS = { AV40: 0.40, AV25: 0.25 }, EXITS = { XH25: { thr: 0.25, part: 0.5 }, XA25: { thr: 0.25, part: 1 }, XH40: { thr: 0.40, part: 0.5 }, XA40: { thr: 0.40, part: 1 } };
export const LOOK = 10;   // sessions before the entry checked by the AVOID filter (the signal close and the 9 before)
export const ADOPT = { minRemoved: 5, gap: 0.02, minTriggered: 10 };
export const SPIKE = { jump: 0.40, minPrev: 1, from: 10, to: 30, keep: 0.5, lowWin: 10, vAvg: 50, dryWin: 10, hiWin: 20, volX: 1.5, minPx: 1, minDv: 2e6, hold: 63, stop: 0.15, ctrlAge: 20 };
export const STM = { hold: 21, frac: 0.10, minVolDays: 15, sizes: { 'SQ20-STMOM-1000': 1000, 'SQ20-STMOM-500': 500 } };

const COMMON = 'Common (squad20-core.mjs header, pre-registered 25 Oct 2026 before any run): base rules rebuilt once from their frozen trade lists (SQ11-PB12 squad11-lab trades; SQ6-MTUM / SQ6-QMOM rebuilt with squad6-core as squad 18 did; B-FCF1 value-lab; DEC-FROG decoded-history; ANOM-RESMOM / ANOM-SUESURGE confluence-signals; MACRO-GOLD-S20 / MACRO-USD-E60 macro-lab), buy the next open, sell at the close of the rule\'s hold. One-day move = close / previous close - 1 (split artifacts are not moves). Cost 0.8% (1.2% stress); judged once (first complete run frozen in data/squad20-lab.json firstRun) with hold-core judgeHold on both halves (signal before / from 2024-01-01): average liquid stock capped +300% (AUD-1), same stock other days, no top 2, 20+ trades, 3+ blocks, block t >= 2.5, per year above SPY.';
const CHECK = 'Library check 25 Oct 2026: SQ19-* (same-day under-5 jumps: rejected, long-only buying of the jump), SQ13-RPB* (runner pullbacks: rejected), SQ8-* (runners: rejected), SQ18-* (human-behaviour filters on PB12 / MTUM / QMOM: market stress, accumulation, dry pullback; none uses the stock\'s own jump), SQ3-CUTRUN (cut losers / let winners run on a 50-day average: no jump exit), A-TURN1 (weekly turnover momentum, queued, never tested), SQ8-LOWTURN, ANG-LCREV-M, ANOM-DAYMOM1: none is any SQ20 rule.';
export const RULES = {};
for (const b of BASE_KEYS) { const B = BASES[b];
  for (const [f, thr] of Object.entries(FILTERS)) RULES['SQ20-' + f + '-' + b] = { kind: 'filter', base: b, thr, hold: B.hold, block: B.block,
    name: B.name + ', skipping stocks with a +' + Math.round(thr * 100) + '% day in the 10 sessions before entry',
    rule: B.id + ' signals, SKIPPED when the stock had a one-day close-to-close move of +' + Math.round(thr * 100) + '% or more on the signal close or any of the 9 sessions before it. Buy the next open; sell at the close of session ' + B.hold + '. Reported: the removed trades (winners or losers) and the kept ones; ADOPT only if the removed trades were 5+ and 2+ points worse than the kept ones, lost to the average stock, and the filtered per-year return was not lower, in BOTH halves.' };
  for (const [x, X] of Object.entries(EXITS)) RULES['SQ20-' + x + '-' + b] = { kind: 'exit', base: b, thr: X.thr, part: X.part, hold: B.hold, block: B.block,
    name: B.name + ', selling ' + (X.part === 1 ? 'ALL' : 'HALF') + ' on a +' + Math.round(X.thr * 100) + '% day while held',
    rule: B.id + ' trades; at the first close of a holding session (buy day to the session before the planned sell) with a one-day move of +' + Math.round(X.thr * 100) + '% or more (buy day: from the buy open), sell ' + (X.part === 1 ? 'the whole position' : 'half (the other half at the original exit)') + ' at that close. Compared trade by trade with the original exit in both halves; ADOPT only if 10+ trades triggered, the average change was > 0 and the per-year return was not lower, in BOTH halves. An exit, never a buy signal.' }; }
RULES['SQ20-SPIKE2'] = { kind: 'trade', hold: SPIKE.hold, block: SPIKE.hold, name: 'Second setup after a +40% spike: held half the gain, quiet base, breakout on volume (hold 63, stop 15%)',
  rule: 'A +40% one-day move from 1 USD+ (spike, session s); 10 to 30 sessions later (t) with no newer spike: every close since s at or above the half-gain level (prior close + half the spike), the lowest low of the last 10 sessions not under the lowest low of the 10 before, the average volume of the last 10 sessions under its 50-session average, and close[t] at a new 20-session closing high on 1.5x the 50-session average volume; close 1 USD+ and 2M+ USD a day. First signal per spike, one open trade per stock. Buy the next open; sell at the next open after a close 15% under the buy, else at the close of session 63. Matched controls: spikes that did NOT hold half the gain (and those that did), bought at s+21 with the same exits.' };
RULES['SQ20-STMOM-1000'] = { kind: 'trade', hold: STM.hold, block: STM.hold, name: 'One-month winners with the highest turnover among the 1000 largest (Medhat & Schmeling 2022), hold 21',
  rule: 'At each month end: among the 1000 largest US companies by point-in-time market value (CIK-based, SEC share counts), the stocks in both the top 10% by last-month return and the top 10% by last-month turnover (share volume / shares outstanding). Buy the next open; sell at the close of session 21.', papers: ['https://doi.org/10.1093/rfs/hhab055'] };
RULES['SQ20-STMOM-500'] = { kind: 'trade', hold: STM.hold, block: STM.hold, name: 'One-month winners with the highest turnover among the 500 largest, hold 21 (long-only large-cap version)',
  rule: 'As SQ20-STMOM-1000, but the universe and both deciles are the 500 largest US companies by point-in-time market value. Buy the next open; sell at the close of session 21.', papers: ['https://doi.org/10.1093/rfs/hhab055'] };
export const IDS = Object.keys(RULES);
export const A_IDS = IDS.filter(id => RULES[id].kind === 'filter'), B_IDS = IDS.filter(id => RULES[id].kind === 'exit'), TRADE_IDS = IDS.filter(id => RULES[id].kind === 'trade');

// ---------------- one-day moves ----------------
// the one-day move at q: close[q] / the last close in q-5..q-1 - 1; null when unknown; an artifact session (in `art`, a Set or array) -> null
export function dayMove(c, q, art) { if (q < 1 || !(c[q] > 0)) return null; if (art && (art.has ? art.has(q) : art.includes(q))) return null;
  for (let p = q - 1; p >= Math.max(0, q - 5); p--) if (c[p] > 0) return c[q] / c[p] - 1; return null; }
// A: a move >= thr on any of the n sessions t-n+1..t -> { q, move } of the first such session, else null
export function jumpBefore(c, t, thr, art, n = LOOK) { for (let q = Math.max(1, t - n + 1); q <= t; q++) { const m = dayMove(c, q, art); if (m !== null && m >= thr - 1e-12) return { q, move: m }; } return null; }
// B: the first holding session q (k <= q < x) whose move >= thr (q = k: close / buy open - 1) -> q, else -1
export function exitDay(S, k, x, thr, art) { for (let q = k; q < x; q++) { let m; if (q === k) m = S.o[k] > 0 && S.c[k] > 0 && !(art && (art.has ? art.has(k) : art.includes(k))) ? S.c[k] / S.o[k] - 1 : null; else m = dayMove(S.c, q, art);
    if (m !== null && m >= thr - 1e-12) return q; } return -1; }
// B: the changed trade. tr = { k, x, px0, g } (original); returns { g, xq, part } or null when not triggered
export function exitOverlay(S, tr, thr, part, art) { const q = exitDay(S, tr.k, tr.x, thr, art); if (q < 0) return null; const gq = S.c[q] / tr.px0 - 1;
  return { q, gq, g: part === 1 ? gq : part * gq + (1 - part) * tr.g, part }; }
// the fixed hold from a given buy (squad 11 holdTrade convention). S = { o, c }; last = the stock's last session with a close
export function holdFrom(S, k, last, T, hold) { if (k > T - 1) return { open: true, k, px0: null, pending: true }; if (!(S.o[k] > 0)) return null; const px0 = S.o[k], x = k + hold - 1;
  if (last < T - 6 && last < x) { for (let q = last; q >= k; q--) if (S.c[q] > 0) return { k, x: q, px0, px1: S.c[q], g: S.c[q] / px0 - 1, kind: 'gone', days: q - k + 1 }; return { k, x: k, px0, px1: px0, g: 0, kind: 'gone', days: 1 }; }
  if (x > T - 1) return { open: true, k, px0 };
  for (let q = x; q >= k; q--) if (S.c[q] > 0) return { k, x, px0, px1: S.c[q], g: S.c[q] / px0 - 1, kind: 'max', days: x - k + 1 };
  return null; }
// hold with a stop: after a close <= buy x (1 - stop) at a session before the planned sell, sell at the next open (no next open: that close)
export function holdStop(S, k, last, T, hold, stop) { const r = holdFrom(S, k, last, T, hold); if (!r || r.pending) return r; const px0 = r.px0, lv = px0 * (1 - stop), end = r.open ? Math.min(T - 1, last) : r.x;
  for (let q = k; q <= end; q++) { if (!(S.c[q] > 0) || S.c[q] > lv) continue; if (!r.open && q >= r.x) break;
    for (let u = q + 1; u <= Math.min(T - 1, last); u++) if (S.o[u] > 0) return { k, x: u, px0, px1: S.o[u], g: S.o[u] / px0 - 1, kind: 'stop', days: u - k + 1, atOpen: true };
    if (last < T - 6) return { k, x: q, px0, px1: S.c[q], g: S.c[q] / px0 - 1, kind: 'stop', days: q - k + 1 };   // no bar after the stop close: the stock is gone
    return { open: true, k, px0, stopped: true }; }   // the next open is not in the data yet
  return r; }

// ---------------- C: second setup after a spike ----------------
const minOf = (a, i, j) => { let m = Infinity; for (let q = Math.max(0, i); q <= j; q++) if (a[q] > 0 && a[q] < m) m = a[q]; return m === Infinity ? null : m; };
const maxOf = (a, i, j) => { let m = -Infinity; for (let q = Math.max(0, i); q <= j; q++) if (a[q] > 0 && a[q] > m) m = a[q]; return m === -Infinity ? null : m; };
const avgOf = (a, i, j, need) => { let s = 0, n = 0; for (let q = Math.max(0, i); q <= j; q++) if (a[q] >= 0 && isFinite(a[q])) { s += a[q]; n++; } return n >= need ? s / n : null; };
// spike sessions of one stock: move >= jump from a prior close >= minPrev (artifacts excluded)
export function spikesOf(c, art, P = SPIKE) { const out = []; for (let q = 1; q < c.length; q++) { const m = dayMove(c, q, art); if (m === null || m < P.jump - 1e-12) continue; const prev = c[q] / (1 + m); if (prev >= P.minPrev - 1e-12) out.push(q); } return out; }
// the half-gain level of spike s
export const halfLevel = (c, s, art, P = SPIKE) => { const m = dayMove(c, s, art); if (m === null) return null; const prev = c[s] / (1 + m); return prev + P.keep * (c[s] - prev); };
// S = { c, l, v }; spikes = spikesOf; eligible(t) = price / liquidity gate at t. Returns [{ s, t }] (first qualifying t per spike)
export function spikeSignals(S, spikes, eligible, art, P = SPIKE) { const out = [], T = S.c.length;
  for (let j = 0; j < spikes.length; j++) { const s = spikes[j], next = j + 1 < spikes.length ? spikes[j + 1] : Infinity, lvl = halfLevel(S.c, s, art, P); if (lvl === null) continue;
    for (let t = s + 1; t <= Math.min(T - 1, s + P.to); t++) { if (t >= next) break; if (S.c[t] > 0 && S.c[t] < lvl) break;   // failed to hold: this spike is done
      if (t < s + P.from || !(S.c[t] > 0)) continue; if (t < P.vAvg + 1) continue; if (!eligible(t)) continue;
      const L = S.l && S.l[t] > 0 ? S.l : S.c, lowNow = minOf(L, t - P.lowWin + 1, t), lowBefore = minOf(L, t - 2 * P.lowWin + 1, t - P.lowWin); if (lowNow === null || lowBefore === null || lowNow < lowBefore) continue;
      const v50 = avgOf(S.v, t - P.vAvg, t - 1, Math.ceil(P.vAvg * 0.9)), v10 = avgOf(S.v, t - P.dryWin, t - 1, P.dryWin - 1); if (!(v50 > 0) || v10 === null || !(v10 < v50)) continue;
      const hi = maxOf(S.c, t - P.hiWin, t - 1); if (hi === null || !(S.c[t] > hi) || !(S.v[t] >= P.volX * v50)) continue;
      out.push({ s, t }); break; } }
  return out; }
// matched controls: every spike with no newer spike by s+age, eligible at s+age; held = every close s+1..s+age >= the half level
export function spikeControls(c, spikes, eligible, art, P = SPIKE) { const out = [], T = c.length;
  for (let j = 0; j < spikes.length; j++) { const s = spikes[j], next = j + 1 < spikes.length ? spikes[j + 1] : Infinity, a = s + P.ctrlAge; if (a > T - 2 || next <= a) continue; if (!(c[a] > 0) || !eligible(a)) continue;
    const lvl = halfLevel(c, s, art, P); if (lvl === null) continue; let held = true; for (let q = s + 1; q <= a; q++) if (c[q] > 0 && c[q] < lvl) { held = false; break; }
    out.push({ s, t: a, held }); }
  return out; }

// ---------------- D: turnover-conditioned short-term momentum ----------------
// rows [{ key, r, to }] -> keys in both the top ceil(frac) by r and the top ceil(frac) by to (desc by r); fewer than 50 usable -> []
export function stmomPick(rows, frac = STM.frac) { const v = rows.filter(x => ok(x.r) && ok(x.to) && x.to > 0); if (v.length < 50) return []; const n = Math.ceil(v.length * frac);
  const topR = new Set([...v].sort((a, b) => b.r - a.r).slice(0, n).map(x => x.key)), topT = new Set([...v].sort((a, b) => b.to - a.to).slice(0, n).map(x => x.key));
  return [...v].sort((a, b) => b.r - a.r).filter(x => topR.has(x.key) && topT.has(x.key)).map(x => x.key); }
// turnover of one stock over sessions a..b: sum of volume / shares; null under minDays volume days or without shares
export function turnover(v, a, b, shares, minDays = STM.minVolDays) { if (!(shares > 0)) return null; let s = 0, n = 0; for (let q = a; q <= b; q++) if (v[q] > 0) { s += v[q]; n++; } return n >= minDays ? s / shares : null; }

// ---------------- reporting ----------------
export function perYearOf(rows, key, cost) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
export function groupReport(rows, cost = COST) { const v = rows.filter(z => ok(z.g)); if (!v.length) return { n: 0 }; const y = v.reduce((a, z) => a + z.days / YEAR, 0);
  return { n: v.length, avg: r4(mean(v.map(z => z.g - cost))), avgStock: r4(mean(v.filter(z => ok(z.c)).map(z => z.c - cost))), edge: r4(mean(v.filter(z => ok(z.c)).map(z => z.g - z.c))), spy: r4(mean(v.filter(z => ok(z.spy)).map(z => z.spy))),
    win: r4(v.filter(z => z.g - cost > 0).length / v.length), perYear: y > 0 ? r4(v.reduce((a, z) => a + z.g - cost, 0) / y) : null, spyPerYear: y > 0 ? r4(v.filter(z => ok(z.spy)).reduce((a, z) => a + z.spy, 0) / y) : null,
    bigWinners: v.filter(z => z.g - cost >= 0.30).length, bigLosers: v.filter(z => z.g - cost <= -0.20).length }; }
// trade-by-trade: rows { g (new), base (original) }
export function paired(rows) { const v = rows.filter(z => ok(z.g) && ok(z.base)); if (!v.length) return { n: 0 };
  return { n: v.length, newAvg: r4(mean(v.map(z => z.g - COST))), originalAvg: r4(mean(v.map(z => z.base - COST))), diff: r4(mean(v.map(z => z.g - z.base))), better: r4(v.filter(z => z.g > z.base + 1e-12).length / v.length), worse: r4(v.filter(z => z.g < z.base - 1e-12).length / v.length), t: tStat(v.map(z => z.g - z.base)) }; }
export function byYear(rows) { const m = new Map(); for (const z of rows) { const y = z.sig.slice(0, 4); (m.get(y) || m.set(y, []).get(y)).push(z); }
  return Object.fromEntries([...m.entries()].sort().map(([y, a]) => { const ry = perYearOf(a, 'g', COST), sy = perYearOf(a, 'spy', 0);
    return [y, { n: a.length, avg: r4(mean(a.map(z => z.g - COST))), avgStock: r4(mean(a.filter(z => ok(z.c)).map(z => z.c - COST))), spy: r4(mean(a.filter(z => ok(z.spy)).map(z => z.spy))), perYear: r4(ry), spyPerYear: r4(sy), beatsSpy: ok(ry) && ok(sy) ? ry > sy : null }]; })); }
// A adoption: removed / kept = { older, newer } groupReport; py / basePy = { older, newer } per-year numbers
export function adoptFilter(removed, kept, py, basePy, A = ADOPT) { const why = [];
  for (const h of ['older', 'newer']) { const r = removed[h] || {}, k = kept[h] || {};
    if (!(r.n >= A.minRemoved)) why.push(h + ': only ' + (r.n || 0) + ' trades removed');
    else { if (!(ok(r.avg) && ok(k.avg) && r.avg <= k.avg - A.gap)) why.push(h + ': removed average ' + pct(r.avg) + ' not 2+ points under the kept ' + pct(k.avg));
      if (!(ok(r.edge) && r.edge < 0)) why.push(h + ': removed trades did not lose to the average stock (edge ' + pct(r.edge) + ')'); }
    if (!(ok(py[h]) && ok(basePy[h]) && py[h] >= basePy[h])) why.push(h + ': per year ' + pct(py[h]) + ' below the base ' + pct(basePy[h])); }
  return { adopt: !why.length, why: why.length ? why.join('; ') : 'removed trades clearly worse in both halves and per-year return not lower' }; }
// B adoption: pairs = { older, newer } paired(); py / basePy as above
export function adoptExit(pairs, py, basePy, A = ADOPT) { const why = [];
  for (const h of ['older', 'newer']) { const p = pairs[h] || {};
    if (!(p.n >= A.minTriggered)) why.push(h + ': only ' + (p.n || 0) + ' trades triggered');
    else if (!(p.diff > 0)) why.push(h + ': average change ' + pct(p.diff) + ' per triggered trade');
    if (!(ok(py[h]) && ok(basePy[h]) && py[h] >= basePy[h])) why.push(h + ': per year ' + pct(py[h]) + ' below the base ' + pct(basePy[h])); }
  return { adopt: !why.length, why: why.length ? why.join('; ') : 'the exit helped the triggered trades in both halves and the per-year return was not lower' }; }
const pct = (x) => ok(x) ? (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%' : 'n/a';
export const boardStats = (rows) => { const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(mean(net)) : null, edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => r.g - r.c))) : null }; };
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;

// ---------------- library pre-registration (idempotent; before any computation) ----------------
export function preRegister(LB, today = REGISTERED) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Use the jump differently (Squad 20)', name: r.name, explain: 'RULE: ' + r.rule + ' ' + COMMON, status: 'pre-registered ' + today + ' (squad 20); 5-year one-shot pending', agent: 'squad20', registered: today, hold: r.hold || null, kind: r.kind === 'exit' ? 'exit' : 'buy',
      libraryCheck: CHECK, sources: r.papers || undefined, note: 'Pre-registered ' + today + ' BEFORE any run (squad20-core.mjs = the exact rule; one version). 5-year one-shot by squad20-lab.mjs, first complete verdict frozen' + (r.kind === 'exit' ? '; an exit overlay (no buy signal), adoption decided by the pre-registered test.' : '; forward paper lane (data/squad20-paper.jsonl) from 26 Oct 2026.') }); ch++; }
  if (ch) LB.updated = today; return ch; }
