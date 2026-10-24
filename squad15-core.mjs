// SQUAD 15 CORE (24 Oct 2026; squad15-lab.mjs uses it). "CALLS ON THE LARGE, LIQUID WINNERS." Pure functions, no network, no files.
// test/squad15-core.test.mjs. LONG CALLS ONLY (never sell or write an option); one contract per signal; never places an order; kept apart
// from stock trading; paper first; halal "ok" (ZAD) only at a live stage.
// WHY: OPT-LH1 (calls on V15 mid-cap picks) and OPT-CAT1 (calls before biotech catalysts) were REJECTED, mostly by the spread (median
// half-spread 10% and 38%), contracts that did not trade, and premium decay. What survived on the stock side is momentum among large caps
// held for months (SQ6-MTUM, SQ6-QMOM) and the giants; SQ11-PB12 (a leader among the 300 largest, 12% under its 50-day high, above its
// 200-day) earned +14% / +17% per trade in its halves. The question here: on THESE large, liquid names, where spreads are tight, does a
// long-dated call beat simply owning the same stock with the same money?
//
// DATA PROBE (24 Oct 2026, after the owner's Alpaca upgrade to Algo Trader Plus; data/squad15-lab.json "probe"): historical option QUOTES
// (v1beta1/options/quotes) are still 404 (with and without feed=opra); OPRA now works for LATEST quotes and snapshots (with greeks and
// implied volatility); daily option BARS start 2024-01-18 (a 2023 contract returns nothing); option TRADES history answers; SIP stock bars
// work from 2016 to today. So there is NO bid/ask history: entries are priced at the contract's daily-bar OPEN and exits at its daily-bar
// CLOSE, each moved by a half-spread measured TODAY on the OPRA feed for the same stock and the same kind of contract (stated limit).
//
// PRE-REGISTERED 24 Oct 2026 AFTER THE DATA PROBE AND BEFORE ANY RESULT (one version each; ids SQ15-*; squad15-lab.mjs writes the same
// text into data/strategy-library.json before computing anything). Run ONCE; first complete verdict frozen in data/squad15-lab.json
// firstRun (first-run.mjs freezeEach). No tuning on results.
//
// SIGNAL SOURCES (frozen outputs of other squads, read only; the stock rule's own entry and exit sessions are kept):
//   PB12 = every trade of SQ11-PB12 in data/squad11-lab.json (squad11 keeps all 355; buy = next open after the signal, sell = close of session 126).
//   MOM  = every trade of SQ6-MTUM (hold 126) and SQ6-QMOM (hold 63) from Squad 6's own code re-run OFFLINE with ALL trades kept (its committed
//          file keeps only the last 300), LARGEST NAMES ONLY: the stock's 63-session average traded value (raw SIP close x volume, sessions
//          up to and including the formation close) >= 500M USD a day (the market-value ranking of Squad 5 is not in that output; traded value
//          is the proxy, and it is what makes the options liquid). A stock picked by both at the same formation counts once, as MTUM.
//   DIP  = every trade of TIP-DIPLEAD in data/tipster-lab.json (hold 252). INFORMATION ONLY (few cases in the option era; never a verdict).
// OPTION ERA: option daily bars exist from 2024-01-18, so only stock-rule entries on or after 2024-01-19 can be priced.
//   HALVES (by entry session): OLDER = 2024, NEWER = 2025-2026. 20+ priced trades per half, else TOO FEW CASES.
// THE CONTRACT (standard 100-share calls only; a contract adjusted by a corporate action is left out):
//   EXPIRY: among the call expiries 150-270 calendar days after the entry session, the LONGEST.
//   ATM:    the 8 strikes nearest the stock's raw open of the entry session (tie = lower strike) are tried, nearest first; the first that has a
//           daily bar on the entry session is taken, at that bar's OPEN.
//   ITM70:  the ATM contract's price gives the implied volatility (Black-Scholes, rate 4.5%, no dividends); with it the delta of every strike
//           is computed; the 8 strikes whose delta is nearest 0.70 are tried, nearest first; the first with a bar on the entry session is taken.
//   DEEP85: the same with delta 0.85 (the "stock replacement" call).
//   EXIT SESSION: the stock rule's sell session, or the last session on or before (expiry - 30 days), whichever is FIRST.
//   EXIT PRICE: the contract's daily-bar CLOSE on the exit session; if it did not trade, its first close in the next 5 sessions (that later
//           session is then the exit for the stock too); if none, the intrinsic value at the stock's raw close of the exit session (a floor).
//   A split of the stock between entry and exit (raw / split-adjusted ratio changes) = left out (counted).
//   ONE OPEN CALL PER STOCK PER RULE (a signal while the rule still holds a call on that stock is skipped).
// COSTS: pay the open x (1 + h) per share x 100 + 5 USD (ZAD fee); receive the close x (1 - h) x 100 - 5 USD; a call worth less than the fee
//   is not sold (the loss stops at -100%). h = the half-spread = max(1%, median of (ask - bid) / mid / 2) over the 4 contracts nearest the
//   same target (ATM: strike nearest the last close; ITM70 / DEEP85: OPRA delta nearest 0.70 / 0.85) among that stock's calls expiring
//   150-270 days from today, OPRA feed, measured today and applied to the past; a stock with no measurement takes the 75th percentile of the
//   measured ones of the same kind. STRESS = h x 1.5.
// THE STOCK, SAME MONEY: the same stock bought at the entry session's open and sold at the close of the option's exit session (split-
//   adjusted), 0.8% round trip. Per trade, the option's return on the premium is compared with the stock's return on the same money.
// JUDGED (each half): 20+ priced trades and 3+ blocks of 63 sessions; average net after h and fees > 0, and > 0 at the 1.5x spread stress;
//   average net > the same stock (edge > 0); average without the half's 2 best trades > 0; block t of the net (non-overlapping 63-session
//   blocks by entry session; a block = the average of its entry-day averages) >= 2.5 -> TRADABLE SMALL; >= the proof bar (max of 4.0 and the
//   league bar) in both halves -> PROVEN. Edge > 0 in both halves but another gate failed -> NOT PROVEN; else REJECTED.
//   PER YEAR (reported, as the scan's TRY SMALL asks): per half, sum of net returns / sum of years held (sessions / 252), for the call, the
//   same stock (same days) and SPY over the same days (no cost). PREMIUM per contract (what one contract cost) reported per rule and half:
//   median, 25th / 75th percentile, and the share at or under the live cap of 300 USD.
//
// THE RULES:
//   SQ15-PB12-ATM   PB12 signals, ATM call.
//   SQ15-PB12-ITM   PB12 signals, ~0.70-delta call (ITM70).
//   SQ15-MOM-ATM    MOM picks (largest names), ATM call.
//   SQ15-MOM-ITM    MOM picks (largest names), ~0.70-delta call.
//   SQ15-REPL       STOCK REPLACEMENT: PB12 + MOM signals together (one open call per stock), ~0.85-delta call (DEEP85). Same money in
//                   the deep call vs the stock, per trade and per year.
//   SQ15-DIP        INFORMATION ONLY: TIP-DIPLEAD signals, ~0.70-delta call (ATM reported beside it). Never a verdict above INFORMATION.
// PAPER LANE (from Monday 26 Oct 2026, data/squad15-paper.jsonl): each evening the new signals of SQ11-PB12 (squad11-today), SQ6-MTUM /
//   SQ6-QMOM (squad6-today, largest names) and TIP-DIPLEAD (tipster-today) are recorded with the contract each rule would buy, chosen from
//   that evening's OPRA snapshot (expiry 150-270 days after the next session, the longest; ATM = strike nearest the close; ITM70 / DEEP85 =
//   OPRA delta nearest). FILL = the OPRA ask in the snapshot of the evening of the entry session (the session after the signal); EXIT = the
//   OPRA bid in the snapshot of the evening of the exit session (the stock rule's hold counted from the entry session, or expiry - 30 days,
//   whichever is first). Fees 5 USD a side. The board compares each closed call with the same stock over the same days.
export const FEE = 5, STOCK_COST = 0.008, STRESS_X = 1.5, H_FLOOR = 0.01, HALF_SPLIT = '2025-01-01', ERA_FROM = '2024-01-19', MIN_PER_HALF = 20, MIN_BLOCKS = 3,
  TIER2_T = 2.5, PROOF_T = 4.0, BLOCK = 63, RATE = 0.045, EXP_LO = 150, EXP_HI = 270, EXIT_BEFORE = 30, LATE_EXIT = 5, BIG_TV = 5e8, CAP_USD = 300, PAPER_START = '2026-10-26', YEAR = 252;
export const RULES = {
  'SQ15-PB12-ATM': { src: ['PB12'], kind: 'ATM', name: 'At-the-money call (150-270 days) on each SQ11-PB12 leader pullback' },
  'SQ15-PB12-ITM': { src: ['PB12'], kind: 'ITM70', name: '0.70-delta call (150-270 days) on each SQ11-PB12 leader pullback' },
  'SQ15-MOM-ATM': { src: ['MOM'], kind: 'ATM', name: 'At-the-money call (150-270 days) on each SQ6-MTUM / SQ6-QMOM pick with 500M USD+ daily trading' },
  'SQ15-MOM-ITM': { src: ['MOM'], kind: 'ITM70', name: '0.70-delta call (150-270 days) on each SQ6-MTUM / SQ6-QMOM pick with 500M USD+ daily trading' },
  'SQ15-REPL': { src: ['PB12', 'MOM'], kind: 'DEEP85', name: 'Stock replacement: 0.85-delta call instead of the stock on PB12 + MTUM / QMOM signals' },
  'SQ15-DIP': { src: ['DIP'], kind: 'ITM70', info: true, name: 'INFORMATION: 0.70-delta call on each TIP-DIPLEAD signal (market 15% under its high, buy leaders)' },
};
export const IDS = Object.keys(RULES), TARGET = { ATM: null, ITM70: 0.70, DEEP85: 0.85 };
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < HALF_SPLIT ? 'older' : 'newer';
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
export const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const day10 = (t) => String(t).slice(0, 10);
// ---------------- Black-Scholes (no dividends) ----------------
export function ncdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804014327 * Math.exp(-x * x / 2), p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x >= 0 ? 1 - p : p; }
export function bsCall(S, K, T, r, v) { if (!(S > 0 && K > 0 && T > 0 && v > 0)) return Math.max(0, S - K); const s = v * Math.sqrt(T), d1 = (Math.log(S / K) + (r + v * v / 2) * T) / s; return S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d1 - s); }
export function bsDelta(S, K, T, r, v) { if (!(S > 0 && K > 0 && T > 0 && v > 0)) return S > K ? 1 : 0; const s = v * Math.sqrt(T); return ncdf((Math.log(S / K) + (r + v * v / 2) * T) / s); }
// implied volatility by bisection in [1%, 500%]; null when the price is outside the model range
export function impliedVol(price, S, K, T, r = RATE) { if (!(price > 0 && S > 0 && K > 0 && T > 0)) return null; let lo = 0.01, hi = 5;
  if (price < bsCall(S, K, T, r, lo) - 1e-9 || price > bsCall(S, K, T, r, hi)) return null;
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (bsCall(S, K, T, r, m) > price) hi = m; else lo = m; } return (lo + hi) / 2; }
// ---------------- the contract ----------------
// the longest expiry 150-270 calendar days after the entry day; null if none
export function pickExpiry(exps, day) { const ok2 = exps.filter(e => { const n = dayDiff(day, e); return n >= EXP_LO && n <= EXP_HI; }).sort(); return ok2.length ? ok2[ok2.length - 1] : null; }
// bars = { occ: [{ t, o, c }] }; the first of the ordered candidates with a bar (open > 0) on `day`
const barOn = (bars, occ, day) => (bars[occ] || []).find(x => day10(x.t) === day);
function firstTraded(cands, bars, day) { for (const c of cands.slice(0, 8)) { const b = barOn(bars, c.occ, day); if (b && b.o > 0) return { ...c, open: b.o }; } return null; }
export function pickAtm(chain, bars, day, spot) { return firstTraded([...chain].sort((a, b) => Math.abs(a.k - spot) - Math.abs(b.k - spot) || a.k - b.k), bars, day); }
// target delta: the ATM pick's implied vol prices every strike's delta; T in years (calendar days / 365)
export function pickDelta(chain, bars, day, spot, T, iv, target) { if (!(iv > 0)) return null;
  const c = chain.map(x => ({ ...x, delta: bsDelta(spot, x.k, T, RATE, iv) })).sort((a, b) => Math.abs(a.delta - target) - Math.abs(b.delta - target) || a.k - b.k); return firstTraded(c, bars, day); }
// exit session index: the stock rule's sell index, or the last session on or before expiry - 30 days, whichever is first
export function exitIndex(sessions, sellIdx, exp) { const lim = addDays(exp, -EXIT_BEFORE); let j = -1; for (let i = 0; i < sessions.length && sessions[i] <= lim; i++) j = i; return j < 0 ? sellIdx : Math.min(sellIdx, j); }
// exit price: close on session x; else the first close in the next 5 sessions; else intrinsic at the stock's raw close on x
export function exitPrice(series, sessions, x, rawCloseAt, k) { const m = new Map((series || []).map(b => [day10(b.t), b]));
  for (let q = x; q <= x + LATE_EXIT && q < sessions.length; q++) { const b = m.get(sessions[q]); if (b && b.c > 0) return { px: b.c, by: q === x ? 'close' : 'lateClose', x: q }; }
  const rc = rawCloseAt(x); return rc > 0 ? { px: Math.max(0, rc - k), by: 'intrinsic', x } : null; }
// one contract: paid open x (1 + h) x 100 + fee; got max(0, close x (1 - h) x 100 - fee)
export function optionNet(open, close, h) { const paid = 100 * open * (1 + h) + FEE, got = Math.max(0, 100 * close * (1 - h) - FEE); return got / paid - 1; }
export const premiumOf = (open, h) => 100 * open * (1 + h) + FEE;
// spread from snapshot rows [{ k, delta, ap, bp }] near the target (ATM: strike nearest spot); returns the half-spread h or null
export function halfSpread(rows, spot, kind) { const v = rows.filter(r => r.ap > 0 && r.bp > 0 && r.ap >= r.bp && (kind === 'ATM' || ok(r.delta)));
  const t = TARGET[kind], near = v.sort((a, b) => (t === null ? Math.abs(a.k - spot) - Math.abs(b.k - spot) : Math.abs(a.delta - t) - Math.abs(b.delta - t)) || a.k - b.k).slice(0, 4);
  if (!near.length) return null; return Math.max(H_FLOOR, median(near.map(r => (r.ap - r.bp) / ((r.ap + r.bp) / 2))) / 2); }
// snapshot pick for the paper lane: rows [{ occ, exp, k, delta, ap, bp }] -> the contract of `kind` on the longest expiry in the window
export function snapPick(rows, spot, kind, day) { const exp = pickExpiry([...new Set(rows.map(r => r.exp))], day); if (!exp) return null;
  const c = rows.filter(r => r.exp === exp && r.ap > 0 && r.bp > 0 && (kind === 'ATM' || ok(r.delta))), t = TARGET[kind];
  c.sort((a, b) => (t === null ? Math.abs(a.k - spot) - Math.abs(b.k - spot) : Math.abs(a.delta - t) - Math.abs(b.delta - t)) || a.k - b.k); return c[0] || null; }
// ---------------- one open call per stock per rule ----------------
// sigs sorted by entry; each { sym, entryIdx, exitIdx } -> those kept (a signal whose entry is on or before the stock's open exit is skipped)
export function onePerStock(sigs) { const busy = new Map(), out = []; for (const s of [...sigs].sort((a, b) => a.entryIdx - b.entryIdx || (a.sym < b.sym ? -1 : 1))) {
  if ((busy.get(s.sym) ?? -1) >= s.entryIdx) continue; busy.set(s.sym, s.exitIdx); out.push(s); } return out; }
// ---------------- judging ----------------
export const tStat = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
export function blockValues(tr, B = BLOCK, f = (z) => z.net) { const o = new Map();
  for (const z of tr) { const x = f(z); if (!ok(x)) continue; const b = Math.floor(z.e / B); if (!o.has(b)) o.set(b, new Map()); const m = o.get(b); if (!m.has(z.e)) m.set(z.e, []); m.get(z.e).push(x); }
  return [...o.values()].map(m => mean([...m.values()].map(mean))); }
const perYear = (tr, key) => { const v = tr.filter(z => ok(z[key]) && z.days > 0), y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? r4(v.reduce((a, z) => a + z[key], 0) / y) : null; };
export function halfStats(tr) { const net = tr.map(z => z.net), srt = [...net].sort((a, b) => b - a), blk = blockValues(tr), eb = blockValues(tr, BLOCK, z => z.net - z.stock), prem = tr.map(z => z.premium).filter(ok);
  return { n: tr.length, days: new Set(tr.map(z => z.e)).size, stocks: new Set(tr.map(z => z.sym)).size, win: tr.length ? r4(net.filter(x => x > 0).length / tr.length) : null,
    avg: r4(mean(net)), median: r4(median(net)), avgStress: r4(mean(tr.map(z => z.netStress))), stock: r4(mean(tr.map(z => z.stock))), edge: r4(mean(tr.map(z => z.net - z.stock))),
    edgeStress: r4(mean(tr.map(z => z.netStress - z.stock))), callBeatStockShare: tr.length ? r4(tr.filter(z => z.net > z.stock).length / tr.length) : null,
    noTop2: r4(srt.length > 2 ? mean(srt.slice(2)) : null), best: r4(srt[0]), worst: r4(srt[srt.length - 1]), lostHalfOrMore: tr.length ? r4(tr.filter(z => z.net <= -0.5).length / tr.length) : null,
    blocks: blk.length, tBlock: blk.length >= 3 ? tStat(blk) : null, tBlockEdge: eb.length >= 3 ? tStat(eb) : null,
    perYear: { call: perYear(tr, 'net'), stock: perYear(tr, 'stock'), spy: perYear(tr, 'spy') }, h: r4(median(tr.map(z => z.h))),
    premium: { median: r4(median(prem)), p25: r4(pct(prem, 0.25)), p75: r4(pct(prem, 0.75)), atOrUnder300: prem.length ? r4(prem.filter(p => p <= CAP_USD).length / prem.length) : null },
    exits: tr.reduce((a, z) => (a[z.by] = (a[z.by] || 0) + 1, a), {}) }; }
export function judge(tr, { bar = PROOF_T, info = false } = {}) {
  const H = { older: halfStats(tr.filter(z => halfOf(z.entry) === 'older')), newer: halfStats(tr.filter(z => halfOf(z.entry) === 'newer')), all: halfStats(tr) }, why = [];
  const out = (verdict) => ({ verdict: info ? 'INFORMATION (' + verdict + ')' : verdict, why: why.join('; '), results: H });
  for (const k of ['older', 'newer']) if (!(H[k].n >= MIN_PER_HALF && H[k].blocks >= MIN_BLOCKS)) why.push('too few in the ' + k + ' half (' + H[k].n + ' priced trades, ' + H[k].blocks + ' blocks; 20 and 3 needed)');
  if (why.length) return out('TOO FEW CASES');
  for (const k of ['older', 'newer']) { const h = H[k];
    if (!(h.avg > 0)) why.push('lost money after the spread and fees in the ' + k + ' half (' + h.avg + ')');
    if (!(h.avgStress > 0)) why.push('lost money at the 1.5x spread in the ' + k + ' half (' + h.avgStress + ')');
    if (!(h.edge > 0)) why.push('did not beat the same stock with the same money in the ' + k + ' half (call ' + h.avg + ' vs stock ' + h.stock + ')');
    if (!(h.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + k + ' half (' + h.noTop2 + ')');
    if (!(h.tBlock >= TIER2_T)) why.push('block t ' + h.tBlock + ' under ' + TIER2_T + ' in the ' + k + ' half'); }
  if (!why.length) return out(H.older.tBlock >= bar && H.newer.tBlock >= bar ? 'PROVEN' : 'TRADABLE SMALL');
  return out(H.older.edge > 0 && H.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED'); }
// ---------------- library pre-registration (idempotent; before any computation) ----------------
const COMMON = 'Common (squad15-core.mjs header): LONG CALLS ONLY, one contract per signal, one open call per stock per rule. Expiry = the longest 150-270 calendar days after the entry session; ATM = strike nearest the raw open (first of the 8 nearest with a daily bar that session, at its open); ITM70 / DEEP85 = delta nearest 0.70 / 0.85 using the ATM pick\'s Black-Scholes implied vol (rate 4.5%, no dividends). Exit = the stock rule\'s sell session or the last session on/before expiry - 30 days, whichever first, at the contract\'s close (else its first close within 5 sessions, else intrinsic). Costs: half-spread h = max(1%, median OPRA (ask-bid)/mid / 2 of the 4 contracts nearest the same target today, 150-270 days) applied to the past (no historical option quotes exist: Alpaca v1beta1/options/quotes 404), stress 1.5x h, ZAD fee 5 USD per contract each side. Option era from 2024-01-19 (Alpaca option bars start 2024-01-18); halves 2024 vs 2025-26 by entry; 20+ trades and 3+ 63-session blocks per half; judged per half: > 0 after h and fees and at 1.5x, beats the same stock bought with the same money over the same days (0.8% round trip), > 0 without the half\'s 2 best, block t >= 2.5. Per-year return (call, stock, SPY) and premium per contract (median, quartiles, share <= 300 USD) reported.';
const SRC = { PB12: 'SQ11-PB12 trades (data/squad11-lab.json, all kept)', MOM: 'SQ6-MTUM (hold 126) + SQ6-QMOM (hold 63) picks from Squad 6\'s own code re-run offline keeping all trades, only stocks with a 63-session average traded value >= 500M USD at formation (a pick in both counts once, as MTUM)', DIP: 'TIP-DIPLEAD trades (data/tipster-lab.json)' };
const CHECK = 'Not OPT-LH1 (calls 60-90 days on V15 mid-cap picks), OPT-CAT1 (calls before biotech catalysts), OPT-FOLLOW1 (options calls of followed traders) or OPT-UOA1 (unusual option activity): different signals, large liquid names only, 150-270 day calls, delta-chosen contracts, judged against the same stock with the same money.';
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Options: long calls on the large, liquid winners (Squad 15)', name: r.name, explain: 'RULE: ' + r.name + '. Signals: ' + r.src.map(s => SRC[s]).join(' + ') + '. Contract: ' + r.kind + '. ' + COMMON + (r.info ? ' INFORMATION ONLY (few cases in the option era); never a verdict.' : ''),
      status: 'pre-registered ' + today + ' (squad 15); one-shot pending', agent: 'squad15', registered: today, libraryCheck: CHECK,
      note: 'Pre-registered ' + today + ' after the data probe and BEFORE any run (squad15-core.mjs = the exact rule; one version). One-shot by squad15-lab.mjs, first complete verdict frozen; forward paper lane (data/squad15-paper.jsonl) from 26 Oct 2026. Never wired into scan.mjs by this squad.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
