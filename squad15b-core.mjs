// SQUAD 15B CORE (27 Oct 2026; squad15b-lab.mjs uses it). "THE AFFORDABLE CALL" - a FORWARD PAPER LANE ONLY. Pure functions, no network.
// test/squad15b-core.test.mjs. LONG CALLS ONLY (never sell or write an option); one contract per signal; never places an order; no backtest
// and no backtest claim (there is no option bid/ask history: Alpaca v1beta1/options/quotes 404, see squad15-core.mjs).
// WHY: the owner's live cap is 300 USD per contract. Squad 15's rules pick contracts by delta (ATM / 0.70 / 0.85, 150-270 days) and most
// cost far more than 300 USD on the large names. This lane records, forward, what the best call that FITS the cap would have done.
//
// PRE-REGISTERED 27 Oct 2026, BEFORE ANY SIGNAL, WITH THE OWNER-REVIEW CORRECTIONS (one version, v1; written into
// data/strategy-library.json on 27 Oct 2026 and again, idempotently, by squad15b-lab.mjs before it reads anything):
// SQ15-PB12-300 (v1)
//   SIGNALS: each new signal of SQ11-PB12 (data/squad11-today.json), SQ6-MTUM and SQ6-QMOM (data/squad6-today.json) dated 27 Oct 2026 or
//   later. Stored with the signal file's timestamp and the stock's ZAD status at signal time (data/halal.json mark {s, by, d}; data/zad-list
//   notHalal = fail). Only ZAD "ok" stocks are traded; others are stored as 'EXCLUDED: not ZAD-halal-ok' (counted). The same stock on the same
//   signal day from two sources counts once (order PB12, MTUM, QMOM); a stock that already has an open call in this lane is stored as
//   'SKIP: already holding' (counted).
//   ENTRY: during the ENTRY SESSION (the session after the signal), on the first lab run while the market is open (runs at about 10-11,
//   12-13 and 14-15 New York time), from a live OPRA snapshot. A quote is USABLE only if: bid > 0 and ask > 0, ask > bid (not crossed, not
//   locked), bid size > 0 and ask size > 0, quote time present and no older than 15 minutes at the run. ELIGIBLE = standard 100-share calls
//   (OCC root = the stock's symbol) 45-180 calendar days to expiry (from the entry session), usable quote, FULL relative spread
//   (ask - bid) / mid <= 5%, an OPRA delta, and ALL-IN cost ask x 100 + 5 USD fee <= 300 USD (premium <= 295; the 5 USD fee is provisional
//   until ZAD confirms it). CHOSEN = the eligible call with the HIGHEST delta (tie: lower cost, nearer expiry, lower strike). The chosen
//   contract AND every eligible alternative are stored with the quotes, the quote ages and the rejection counts; the choice is never
//   changed or substituted later. No eligible call -> 'SKIP: no affordable contract' (counted). If more than half of the window's quotes
//   are stale (> 15 min), the snapshot is a data failure, nothing is recorded and the next run that session tries again; an entry session
//   that ends with no usable snapshot -> 'MISSED' (counted, never back-filled).
//   FILL = the chosen contract's ASK in that snapshot (+5 USD). The SAME-DOLLAR STOCK is bought with the same all-in dollars at the stock's
//   latest SIP trade at that same run (0.8% round trip), and sold at the stock's latest trade at the moment of the call's exit quote.
//   EXIT TRIGGER: the stock rule's own sell session (its hold counted from the entry session as session 1: PB12 126, MTUM 126, QMOM 63) or
//   the last session on or before expiry - 30 calendar days, whichever is FIRST. From that session's first open-market run on, the FIRST
//   EXECUTABLE BID (bid > 0, bid size > 0, not crossed, quote <= 15 minutes old) is the exit; its quote age is stored and feasible = true.
//   Non-executable attempts are stored. If none within 5 sessions after the trigger, the result is recorded at the last bid seen (0 if none)
//   with feasible = false (counted). 5 USD fee on exit; a bid x 100 under the fee is not sold (the loss stops at -100%).
//   STRESS (1.5x COSTS): pay mid + 1.5 x (ask - mid) and receive mid - 1.5 x (mid - bid) at entry and exit, fee 7.50 USD each way; stock
//   1.2% round trip.
//   BOARD (data/squad15b-board.json), overall and per source: signals, distinct signal days, distinct underlyings, skips by reason, open;
//   per closed call: n, mean AND median return on premium, win rate, share losing >= 25 / 50 / 100% of premium, worst, best, mean and
//   median without the 2 best, max drawdown (cumulative USD P&L of one contract per signal, by exit time) and longest losing streak, the
//   same-dollar stock (mean, median), call minus stock (mean, median), share of calls beating the stock, infeasible exits, and the same
//   figures at 1.5x costs. Averages are never shown alone. No verdict before 20 closed calls; information for the owner, not a buy, never
//   wired into scan.mjs by this squad.
export const RULE = 'SQ15-PB12-300', VERSION = 'v1', FEE = 5, CAP = 300, LO = 45, HI = 180, MAX_SPREAD = 0.05, MAX_AGE_MIN = 15, EXIT_BEFORE = 30, EXIT_GRACE = 5,
  STOCK_COST = 0.008, STRESS_X = 1.5, START = '2026-10-27', MIN_N = 20;
export const SOURCES = [['PB12', 'data/squad11-today.json', 'SQ11-PB12', 126], ['MTUM', 'data/squad6-today.json', 'SQ6-MTUM', 126], ['QMOM', 'data/squad6-today.json', 'SQ6-QMOM', 63]];
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
export const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const cost = (ask) => 100 * ask + FEE;
export const ageMin = (t, nowMs) => t ? (nowMs - Date.parse(t)) / 60000 : null;
export const fullSpread = (r) => (r.ap - r.bp) / ((r.ap + r.bp) / 2);
// quote quality: null = usable, else the reason
export function quoteProblem(r, nowMs) { if (!(r.bp > 0 && r.ap > 0)) return 'one-sided or missing'; if (r.ap < r.bp) return 'crossed'; if (r.ap === r.bp) return 'locked';
  if (!(r.bs > 0 && r.as > 0)) return 'missing size'; const a = ageMin(r.qt, nowMs); if (a === null || !(a <= MAX_AGE_MIN)) return 'stale'; return null; }
// rows [{ occ, exp, k, delta, ap, bp, as, bs, qt }] (already filtered to the stock's own root) -> { pick, eligible, rejected, inWindow, stale, dataFailure }
export function choose(rows, day, nowMs) { const rej = {}, el = [], bump = (k) => { rej[k] = (rej[k] || 0) + 1; }; let inWindow = 0, stale = 0;
  for (const r of rows || []) { const n = dayDiff(day, r.exp); if (!(n >= LO && n <= HI)) continue; inWindow++;
    const qp = quoteProblem(r, nowMs); if (qp) { bump(qp); if (qp === 'stale') stale++; continue; }
    if (!(fullSpread(r) <= MAX_SPREAD)) { bump('spread > 5%'); continue; } if (!ok(r.delta)) { bump('no delta'); continue; } if (!(cost(r.ap) <= CAP)) { bump('over 300 USD all-in'); continue; }
    el.push({ ...r, days: n, ageMin: r4(ageMin(r.qt, nowMs)), spread: r4(fullSpread(r)), allIn: r4(cost(r.ap)) }); }
  el.sort((a, b) => b.delta - a.delta || a.ap - b.ap || (a.exp < b.exp ? -1 : a.exp > b.exp ? 1 : 0) || a.k - b.k);
  return { pick: el[0] || null, eligible: el, rejected: rej, inWindow, stale, dataFailure: inWindow === 0 || stale > inWindow / 2 }; }
// exit trigger: the hold-th session counting the entry session as 1, or the last session on or before expiry - 30, whichever first
export function exitTrigger(cal, entry, hold, exp) { const i = cal.indexOf(entry); if (i < 0) return null; const byHold = cal[i + hold - 1] || null, lim = addDays(exp, -EXIT_BEFORE);
  let byExp = null; for (const d of cal) if (d <= lim) byExp = d; if (byExp && byExp < entry) byExp = entry;
  const calEnd = cal[cal.length - 1] || ''; if (byHold && byExp) return byHold < byExp ? byHold : byExp; return byHold || (byExp && lim < calEnd ? byExp : null); }
// exit quote: null = executable, else the reason
export function exitProblem(q, nowMs) { if (!q) return 'no quote'; if (!(q.bp > 0)) return 'no bid'; if (!(q.bs > 0)) return 'missing bid size'; if (q.ap > 0 && q.ap < q.bp) return 'crossed';
  const a = ageMin(q.t, nowMs); if (a === null || !(a <= MAX_AGE_MIN)) return 'stale'; return null; }
export function callNet(premium, bid) { const got = Math.max(0, 100 * (bid || 0) - FEE); return got / premium - 1; }
// 1.5x costs: pay mid + 1.5 x half the spread, receive mid - 1.5 x half the spread, fee 7.50 each way
export function callNetStress(eBid, eAsk, xBid, xAsk) { const em = (eBid + eAsk) / 2, paid = 100 * (em + STRESS_X * (eAsk - em)) + STRESS_X * FEE;
  const xm = xAsk > 0 && xAsk >= xBid ? (xBid + xAsk) / 2 : xBid, got = Math.max(0, 100 * (xm - STRESS_X * (xm - (xBid || 0))) - STRESS_X * FEE); return got / paid - 1; }
export const stockNet = (p0, p1, c = STOCK_COST) => p0 > 0 && p1 > 0 ? p1 / p0 - 1 - c : null;
// de-duplicate the run's signals: same stock same day once (sources in order); skip a stock with an open call
export function dedupe(sigs, openSyms) { const seen = new Set(), out = [];
  for (const s of sigs) { const k = s.sym + '|' + s.d; if (seen.has(k)) continue; seen.add(k); out.push(openSyms.has(s.sym) ? { ...s, skip: 'SKIP: already holding' } : s); } return out; }
// max drawdown of the cumulative USD P&L (one contract per signal) in exit order, and the longest run of losing calls
export function pathStats(res) { const s = [...res].sort((a, b) => (a.exitAt < b.exitAt ? -1 : a.exitAt > b.exitAt ? 1 : 0)); let cum = 0, peak = 0, dd = 0, run = 0, longest = 0;
  for (const r of s) { cum += r.pnlUSD; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); run = r.net <= 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  return { maxDrawdownUSD: r4(dd), longestLosingStreak: longest, cumulativeUSD: r4(cum) }; }
// the board block for closed results [{ net, stock, netStress, stockStress, pnlUSD, pnlUSDStress, exitAt, feasible }]
export function boardStats(res) { const one = (key, skey) => { const v = res.filter(r => ok(r[key])), net = v.map(r => r[key]), srt = [...net].sort((a, b) => b - a), wo = srt.slice(2), st = v.filter(r => ok(r[skey])), ed = st.map(r => r[key] - r[skey]);
    return { n: net.length, mean: r4(mean(net)), median: r4(median(net)), win: net.length ? r4(net.filter(x => x > 0).length / net.length) : null,
      lost25: net.length ? r4(net.filter(x => x <= -0.25).length / net.length) : null, lost50: net.length ? r4(net.filter(x => x <= -0.5).length / net.length) : null, lost100: net.length ? r4(net.filter(x => x <= -0.999).length / net.length) : null,
      worst: r4(srt.length ? srt[srt.length - 1] : null), best: r4(srt.length ? srt[0] : null), meanWithout2Best: r4(wo.length ? mean(wo) : null), medianWithout2Best: r4(wo.length ? median(wo) : null),
      stockMean: r4(mean(st.map(r => r[skey]))), stockMedian: r4(median(st.map(r => r[skey]))), callMinusStockMean: r4(mean(ed)), callMinusStockMedian: r4(median(ed)), callBeatStock: st.length ? r4(ed.filter(x => x > 0).length / st.length) : null }; };
  const base = one('net', 'stock'), stress = one('netStress', 'stockStress');
  return { ...base, ...pathStats(res.map(r => ({ net: r.net, pnlUSD: r.pnlUSD, exitAt: r.exitAt }))), infeasibleExits: res.filter(r => r.feasible === false).length,
    atStress1_5x: { ...stress, ...pathStats(res.filter(r => ok(r.netStress)).map(r => ({ net: r.netStress, pnlUSD: r.pnlUSDStress, exitAt: r.exitAt }))) }, enough: base.n >= MIN_N }; }
export const LIB_ENTRY = { id: RULE, version: VERSION, family: 'Options: long calls on the large, liquid winners (Squad 15)', name: 'Affordable call (<= 300 USD all-in, highest delta, 45-180 days, full spread <= 5%) on each SQ11-PB12 / SQ6-MTUM / SQ6-QMOM signal on a ZAD-halal-ok stock',
  explain: 'RULE v1 (squad15b-core.mjs header = the exact text; owner-review corrections applied before any signal). SIGNALS: new SQ11-PB12, SQ6-MTUM, SQ6-QMOM signals dated 27 Oct 2026 or later; stored with the signal-file timestamp and the ZAD status at signal time; only ZAD-halal-ok stocks traded (others EXCLUDED, counted); same stock same day once; a stock already held -> SKIP: already holding. ENTRY on the first open-market run of the entry session (session after the signal) from a live OPRA snapshot. Usable quote: bid > 0, ask > bid (not crossed or locked), bid and ask sizes > 0, quote <= 15 minutes old. Eligible: standard calls (root = the stock) 45-180 days to expiry, usable quote, FULL spread (ask-bid)/mid <= 5%, OPRA delta present, ask x 100 + 5 USD <= 300 USD all-in (premium <= 295; the 5 USD fee is provisional until ZAD confirms). Chosen = highest delta (tie: lower cost, nearer expiry, lower strike). The chosen contract and ALL eligible alternatives, quote ages and rejection counts are stored; never substituted later. None -> SKIP: no affordable contract (counted). More than half the window stale = data failure, retried within the session; session over with no usable snapshot -> MISSED (counted). Fill at the ask (+5 USD). EXIT trigger: the stock rule\'s own sell session (PB12 / MTUM 126 sessions, QMOM 63, counted from entry) or the last session <= expiry - 30 days, whichever first; the first executable bid after the trigger (bid > 0, bid size > 0, not crossed, <= 15 minutes old) is the exit, its quote age stored, feasible = true; none within 5 sessions -> last bid seen, feasible = false (counted). 5 USD fee on exit. Same-dollar stock at the stock\'s latest trade at the same runs, 0.8% round trip. Stress = 1.5x costs (1.5x half-spread each side, 7.50 USD fees, stock 1.2%). Board overall and per source: signals, distinct signal days and underlyings, skips by reason, open; closed: n, mean AND median return per call, win rate, % losing 25/50/100% of premium, worst, best, mean/median without the 2 best, max drawdown (cumulative USD, one contract each, exit order), longest losing streak, same-dollar stock (mean, median), call minus stock (mean, median), share beating the stock, infeasible exits, and all of it at 1.5x costs. No verdict before 20 closed calls.',
  status: 'forward paper only from 27 Oct 2026', agent: 'squad15b', registered: '2026-10-27',
  libraryCheck: 'Not SQ15-PB12-ATM / -ITM / -MOM-* / -REPL (those pick by delta target 150-270 days with no cost cap and were back-tested); this one is capped at the owner\'s 300 USD all-in live cap, 45-180 days, highest delta that fits, forward paper only, no backtest.',
  note: 'Pre-registered 27 Oct 2026 before any signal (v1 = with the owner-review corrections: full spread <= 5%, 300 USD all-in, stale / crossed / locked / missing-size quotes rejected, chosen + all eligible alternatives stored, first executable bid after the exit trigger, drawdown / losing streak / 1.5x costs on the board). FORWARD PAPER ONLY: no backtest exists or is claimed (no option bid/ask history). squad15b-lab.mjs -> data/squad15b-paper.jsonl, data/squad15b-board.json, data/squad15b-today.json. Never places an order; never wired into scan.mjs by this squad.' };
export function preRegister(LB) { if (!LB || !Array.isArray(LB.strategies) || LB.strategies.some(e => e.id === RULE)) return 0; LB.strategies.push({ ...LIB_ENTRY }); LB.updated = START; return 1; }
