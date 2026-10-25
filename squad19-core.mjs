// SQUAD 19 CORE: "THE SAME-DAY JUMP" (25 Oct 2026). Pure functions, no network, no files. Used by squad19-lab.mjs and
// test/squad19-core.test.mjs. Long only; never places an order; never gives a halal ruling.
//
// THE OWNER'S WISH: catch, at least weekly or monthly, a stock under 5 USD that jumps 40% to 100%+ IN THE SAME DAY.
//
// WHAT WAS ALREADY LEARNED (read before writing this; not repeated here):
//   1. IG1-IG9 (ignition-core.mjs: +10%/+20% crosses before 11:00, opening-range breaks, low float, first pullback) were all REJECTED
//      on their minute-bar history test, and their live paper record is mostly losing (IG8 quiet build-up -0.7% a trade over 973).
//   2. The missed-runner audit (data/missed-runners.json) found that most 15%+ movers were missed for eligibility/timing reasons
//      (under 1 USD, volume figure late, after 11:00, gapped at the open), not for lack of a rule; one alert in 1,332 movers.
//   3. Squad 2: classic intraday setups (ORB, VWAP reclaim, first pullback, episodic pivot) on 5 USD+ liquid stocks lose after costs.
//   4. Squad 8 / lottery rule: buying AFTER a 15%+ run (next open, days to weeks) lags the average stock: short-term reversal.
//   5. Catalyst lane (OCGN-style FDA run-up, news build-up): failed both halves; dilution filings into runs are a classic trap.
//
// STAGE 1 (CASE STUDY, descriptive): every US stock-day from 2024-01-02 whose PRIOR close is 0.10-5 USD (raw, unadjusted) and whose
//   daily high reached +8% or more (the fetch set; every trigger below implies a regular-session price of +10% or more, so the fetch set
//   holds the WHOLE population of every trigger and nothing is selected on the outcome). Alpaca SIP 1-minute bars 04:00-15:59 New York
//   (raw). Knowable facts per stock-day: pre-market gap/volume, Alpaca historical news (Benzinga; reaction articles such as "shares are
//   trading higher" are NOT catalysts), SEC filings with acceptance times (by point-in-time CIK from Massive ticker details), shares
//   outstanding (Massive ticker details as of the date), short interest (Massive, settlement + 10 days), reverse splits (data/splits.json
//   + Massive splits), +40% days in the prior 90 sessions, halt-like gaps in the minute bars. Outcome: high vs prior close, close vs high,
//   next 1-5 closes. TRIGGER PRECISION is reported for the OLDER part only (signal day before 2025-07-01): Stage 2 rules are chosen from it.
//
// TRADE CONVENTIONS (Stage 1 triggers and Stage 2 rules alike)
//   Trigger minute T = the 1-minute bar in which the condition is first met (its high crossing the level, or the 09:30 bar for opens).
//   FILL = the OPEN of the next bar that exists after T (a halt or a quiet minute pushes the fill to the next real trade; no fill inside a
//   halt). No new entry after 15:30. SLIPPAGE 2% each way (buy 2% above, sell 2% below the bar price: 4% a round trip); STRESS 3% each way.
//   EXITS (each trigger is reported under all four; a rule names ONE, fixed in advance):
//     S10   stop 10% under the fill, else sell at the 15:59 bar close
//     S15   stop 15% under the fill, else 15:59 close
//     TR15  stop 10%; once above the fill, sell when it falls 15% from its highest high since the fill; else 15:59 close
//     TP20  stop 10%; sell at +20% over the fill (limit, filled when a bar's high reaches it, or at the bar's open if it opens above); else close
//   Stops: a bar that OPENS at or under the stop fills at its open (gap or halt through the stop); otherwise a low at or under the stop fills
//   at the stop. In the fill bar the open comes first, so a low under the stop in that bar is a stop (worst case).
//   MATCHED CONTROL for a trade at minute T: every OTHER fetched stock that day that is up 10%+ on its prior close at minute T (last bar
//   close at or before T), bought the same way at its next bar after T, same exit: the "any under-5 runner at that minute" yardstick.
// STAGE 3 (DESIGN ONLY, NOT WIRED; written 25 Oct 2026 after Stage 2). No Stage 2 rule passed, so nothing is to be wired. IF a rule ever
//   passes a future frozen test, it would alert like this in ignition-watch.mjs: compute the rule's base trigger and filters each minute on
//   the SIP snapshot + Alpaca news stream; on a hit send a PAPER alert ("PAPER ONLY - not a buy; intraday entry, never a next-open TRY
//   SMALL order"; symbol, minute, trigger price, stop level, the rule's frozen older/newer averages) and log it to data/squad19-paper.jsonl;
//   every alert says "Check ZAD first - most under-5 USD names are not ZAD-marked; this alert is not a halal ruling". Live alerts only after
//   60+ paper alerts stay positive after 3% slippage each way without their 2 best.
export const VERSION = 1, SLIP = 0.02, STRESS = 0.03, SPLIT_HALF = '2025-07-01', START = '2024-01-02', HIST_FROM = '2023-08-01';
export const MIN_PREV = 0.10, MAX_PREV = 5, FETCH_UP = 0.08, LAST_ENTRY = 930, OPEN = 570, LAST = 959, PM_FROM = 240;
export const EXITS = { S10: { stop: 0.10 }, S15: { stop: 0.15 }, TR15: { stop: 0.10, trail: 0.15 }, TP20: { stop: 0.10, target: 0.20 } };
export const EXIT_IDS = Object.keys(EXITS);
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4;
export const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const halfOf = (d) => d < SPLIT_HALF ? 'older' : 'newer';
export const net = (e, x, s = SLIP) => (x * (1 - s)) / (e * (1 + s)) - 1;
// a ticker that is a warrant / unit / right / preferred-like line (5 letters ending W U R Z, or containing a dot) is not a common share
export const commonLike = (sym) => /^[A-Z]{1,5}$/.test(sym) && !(sym.length === 5 && /[WURZ]$/.test(sym));
export const OK_TYPES = new Set(['CS', 'ADRC', 'OS', 'GDR', 'NYRS']);

// ---------- minute bars ----------
// Alpaca bars -> [m (New York minute of the day), o, h, l, c, v], 04:00-15:59 only, sorted. off = minutes to add to UTC (nyOffset).
export function toNy(rows, off) { const out = [];
  for (const r of rows || []) { const ms = typeof r.t === 'number' ? r.t : Date.parse(r.t), m = Math.floor((((ms / 60000) + off) % 1440 + 1440) % 1440);
    if (m < PM_FROM || m > LAST) continue; out.push([m, +r.o, +r.h, +r.l, +r.c, +(r.v || 0)]); }
  return out.sort((a, b) => a[0] - b[0]); }

// Halt-like gaps: in the regular session, 5+ minutes with no bar right after a stretch of trading (8+ bars in the 10 minutes before).
export function haltGaps(bars) { const out = []; const reg = bars.filter(b => b[0] >= OPEN);
  for (let i = 1; i < reg.length; i++) { const gap = reg[i][0] - reg[i - 1][0]; if (gap < 6) continue;
    let act = 0; for (let j = i - 1; j >= 0 && reg[j][0] > reg[i - 1][0] - 10; j--) act++;
    if (act >= 8) out.push({ from: reg[i - 1][0] + 1, to: reg[i][0], pre: reg[i - 1][4], reopen: reg[i][1], up: reg[i][1] >= reg[i - 1][4] }); }
  return out; }

// Facts of a stock-day from its bars. ctx = { prevC, avgVol } (avgVol = 20-session average daily share volume, split-adjusted)
export const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.6, 1.0];
export function dayFacts(bars, ctx) {
  const { prevC, avgVol } = ctx, pm = bars.filter(b => b[0] < OPEN), reg = bars.filter(b => b[0] >= OPEN && b[0] <= LAST);
  if (!reg.length || !(prevC > 0)) return null;
  const pmVol = pm.reduce((s, b) => s + b[5], 0), pmHi = pm.length ? Math.max(...pm.map(b => b[2])) : null, pmLast = pm.length ? pm[pm.length - 1][4] : null;
  let hi = -Infinity, hiM = null, lo = Infinity, vol = 0; for (const b of reg) { if (b[2] > hi) { hi = b[2]; hiM = b[0]; } lo = Math.min(lo, b[3]); vol += b[5]; }
  const cross = {}; for (const L of LEVELS) { const lv = prevC * (1 + L); const b = reg.find(x => x[2] >= lv); cross[L] = b ? b[0] : null; }
  const pmCross = {}; for (const L of [0.1, 0.2, 0.4]) { const lv = prevC * (1 + L); const b = pm.find(x => x[2] >= lv); pmCross[L] = b ? b[0] : null; }
  const open = reg[0][1], close = reg[reg.length - 1][4], halts = haltGaps(bars);
  return { open: r4(open / prevC - 1), openMin: reg[0][0], hi: r4(hi / prevC - 1), hiM, lo: r4(lo / prevC - 1), close: r4(close / prevC - 1), closeVsHi: r4(close / hi - 1),
    pmVol, pmRv: avgVol > 0 ? r4(pmVol / avgVol) : null, pmHi: pmHi ? r4(pmHi / prevC - 1) : null, pmLast: pmLast ? r4(pmLast / prevC - 1) : null,
    regVol: vol, rv: avgVol > 0 ? r4((vol + pmVol) / avgVol) : null, dv: Math.round(reg.reduce((s, b) => s + b[5] * (b[1] + b[4]) / 2, 0) + pm.reduce((s, b) => s + b[5] * (b[1] + b[4]) / 2, 0)),
    cross, pmCross, halts: halts.length, haltsUp: halts.filter(h => h.up).length, firstHalt: halts.length ? halts[0].from : null,
    reach40: hi >= prevC * 1.4, reach100: hi >= prevC * 2 }; }

// ---------- trade after a trigger ----------
// k = index (in bars) of the trigger bar. Returns null when there is no fill bar by 15:30.
export function trade(bars, k, X, slip = SLIP) {
  let i = k + 1; while (i < bars.length && bars[i][0] < OPEN) i++;
  if (i >= bars.length || bars[i][0] > LAST_ENTRY) return null;
  const e = bars[i][1]; if (!(e > 0)) return null;
  const stop = e * (1 - X.stop), tgt = X.target ? e * (1 + X.target) : null; let hi = e, best = e;
  const out = (x, j, why) => ({ e, x, fm: bars[i][0], xm: bars[j][0], g: net(e, x, slip), mfe: best / e - 1, why });
  for (let j = i; j < bars.length && bars[j][0] <= LAST; j++) { const b = bars[j];
    if (j > i && b[1] <= stop) return out(b[1], j, 'stop');
    if (b[3] <= stop) return out(stop, j, 'stop');
    if (X.trail && hi > e) { const lv = hi * (1 - X.trail); if (lv > stop) { if (j > i && b[1] <= lv) return out(b[1], j, 'trail'); if (b[3] <= lv) { best = Math.max(best, b[2]); return out(lv, j, 'trail'); } } }
    if (tgt) { if (j > i && b[1] >= tgt) { best = Math.max(best, b[2]); return out(b[1], j, 'target'); } if (b[2] >= tgt) { best = Math.max(best, b[2]); return out(tgt, j, 'target'); } }
    hi = Math.max(hi, b[2]); best = Math.max(best, b[2]); }
  let j = bars.length - 1; while (j > i && bars[j][0] > LAST) j--; return out(bars[j][4], j, 'close'); }
// the rest of the day after the fill (independent of the exit): highest high after the fill, the close, reached +40% / +100% on prevC
export function after(bars, k, prevC) { let i = k + 1; while (i < bars.length && bars[i][0] < OPEN) i++; if (i >= bars.length || bars[i][0] > LAST_ENTRY) return null;
  const e = bars[i][1]; let h = 0, c = null; for (let j = i; j < bars.length && bars[j][0] <= LAST; j++) { h = Math.max(h, bars[j][2]); c = bars[j][4]; }
  return { e, fm: bars[i][0], wait: bars[i][0] - bars[k][0], up: r4(h / e - 1), cl: r4(c / e - 1), r40: h >= prevC * 1.4, r100: h >= prevC * 2, ePc: r4(e / prevC - 1) }; }

// ---------- base triggers (each fires at most once per stock-day; every one implies a regular-session price of +10% or more) ----------
// returns the index k of the trigger bar or -1
const regIdx = (bars) => bars.findIndex(b => b[0] >= OPEN);
export const BASE = {
  GAP10: { name: 'opens 10%+ above the prior close (09:30 bar), buy the next minute', fn: (b, p) => gapAt(b, p, 0.10) },
  GAP20: { name: 'opens 20%+ above the prior close', fn: (b, p) => gapAt(b, p, 0.20) },
  GAP40: { name: 'opens 40%+ above the prior close', fn: (b, p) => gapAt(b, p, 0.40) },
  X10: { name: 'first regular-session minute whose high reaches +10% on the prior close', fn: (b, p) => crossAt(b, p, 0.10) },
  X20: { name: 'first minute reaching +20%', fn: (b, p) => crossAt(b, p, 0.20) },
  X30: { name: 'first minute reaching +30%', fn: (b, p) => crossAt(b, p, 0.30) },
  X40: { name: 'first minute reaching +40% (the move already happened: how much is left?)', fn: (b, p) => crossAt(b, p, 0.40) },
  X60: { name: 'first minute reaching +60%', fn: (b, p) => crossAt(b, p, 0.60) },
  FAST: { name: 'NOT a gap (09:30 open under +10%), then +10% to +20% within 10 minutes: trigger at the +20% minute', fn: (b, p) => fastAt(b, p) },
  HALTUP: { name: 'first halt-like gap (5+ silent minutes after active trading) that reopens ABOVE the last price before it, while up 10%+: trigger at the reopen bar', fn: (b, p) => haltUpAt(b, p) },
  HODBRK: { name: 'after reaching +20%, pulls back 10%+ from the high, then a minute breaks the high of day: trigger at that minute', fn: (b, p) => hodBreakAt(b, p) },
};
export const BASE_IDS = Object.keys(BASE);
function gapAt(bars, p, g) { const i = regIdx(bars); if (i < 0 || bars[i][0] > 571) return -1; return bars[i][1] >= p * (1 + g) ? i : -1; }
function crossAt(bars, p, L) { const lv = p * (1 + L); for (let k = 0; k < bars.length; k++) { if (bars[k][0] < OPEN) continue; if (bars[k][2] >= lv) return k; } return -1; }
function fastAt(bars, p) { const i = regIdx(bars); if (i < 0 || !(bars[i][1] < p * 1.10)) return -1; const k10 = crossAt(bars, p, 0.10); if (k10 < 0) return -1;
  for (let k = k10; k < bars.length && bars[k][0] <= bars[k10][0] + 10; k++) if (bars[k][2] >= p * 1.20) return k; return -1; }
function haltUpAt(bars, p) { for (let i = 1; i < bars.length; i++) { const b = bars[i], a = bars[i - 1]; if (b[0] < OPEN || a[0] < OPEN) continue; if (b[0] - a[0] < 6) continue;
    let act = 0; for (let j = i - 1; j >= 0 && bars[j][0] > a[0] - 10 && bars[j][0] >= OPEN; j--) act++; if (act < 8) continue;
    if (b[1] > a[4] && a[4] >= p * 1.10) return i; return -1; } return -1; }
function hodBreakAt(bars, p) { let hi = 0, armed = false, reached = false;
  for (let k = 0; k < bars.length; k++) { const b = bars[k]; if (b[0] < OPEN) continue;
    if (armed && b[2] > hi) return k;
    if (b[2] > hi) hi = b[2]; if (hi >= p * 1.2) reached = true; if (reached && b[3] <= hi * 0.90) armed = true; }
  return -1; }

// cumulative volume (pre-market included) up to and including bar k
export const cumVol = (bars, k) => { let v = 0; for (let j = 0; j <= k; j++) v += bars[j][5]; return v; };
// price state at minute m: last close at or before m (null if none)
export function pxAt(bars, m) { let px = null; for (const b of bars) { if (b[0] > m) break; px = b[4]; } return px; }

// ---------- news ----------
// Benzinga via Alpaca. A REACTION article reports a move that already happened (not a catalyst). Categories, first match wins.
const REACT = /(shares?|stock)\s+(are|is)?\s*(trading|moving|spik|soar|jump|surg|rall|climb|trad(e|ing) (higher|lower)|halted)|why .{1,60} (shares?|stock) (is|are)|movers|gainers|losers|mid-?day|pre-?market (session|movers|gainers)|after-?hours (movers|session)|stocks? to watch|on the move|unusual (options|volume)|52-week|session:|top (gainers|losers)|stocks moving|penny stocks?|short squeeze|(spikes|jumps|soars|surges|rallies|tumbles|plunges|falls|drops) (on|after|following|as)|is (higher|lower|up|down)/i;
export const NEWS_CATS = [
  ['offering', /\b(offering|pricing of|prices \$|registered direct|private placement|at-the-market|ATM program|shelf registration|warrant (exercise|inducement)|securities purchase agreement|dilut)/i],
  ['split', /reverse (stock )?split|minimum bid|nasdaq (compliance|deficiency|notice)|delist|regain(s|ed)? compliance/i],
  ['merger', /\b(merger|acquir|acquisition|to be acquired|buyout|take-?private|tender offer|definitive agreement|business combination|strategic alternatives)/i],
  ['fda', /\b(FDA|clinical|trial|phase [123i]|topline|top-line|orphan|fast track|breakthrough (therapy|device)|IND\b|NDA\b|BLA\b|510\(k\)|CE mark|patient|efficacy|pre-?clinical|EMA\b)/i],
  ['deal', /\b(contract|purchase order|order(s)? (from|worth|valued)|agreement|partnership|partner(s|ed)? with|collaborat|award|supply|licens|distribution|LOI|letter of intent|memorandum|MOU|joint venture|pilot|deploy|selected by)/i],
  ['theme', /\b(bitcoin|crypto|blockchain|AI\b|artificial intelligence|treasury (strategy|reserve)|token|ethereum|solana|XRP|quantum|drone|nuclear|robot|data cent(er|re)|GPU|stablecoin|rare earth)/i],
  ['earnings', /\b(results|revenue|earnings|quarter|fiscal|guidance|financial|profit|sales (grow|increase|rise))/i],
  ['uplist', /uplist|approved for listing|begin(s)? trading on (the )?(nasdaq|nyse)/i],
];
export function classifyNews(headline) { const h = String(headline || ''); if (REACT.test(h)) return 'reaction'; for (const [c, re] of NEWS_CATS) if (re.test(h)) return c; return 'other'; }
// SEC forms of interest -> class
export function secClass(form) { const f = String(form || '').toUpperCase();
  if (/^424B|^S-1|^F-1|^S-3|^F-3|^EFFECT|^S-1\/A|^F-1\/A/.test(f)) return 'offer';
  if (/^8-K|^6-K/.test(f)) return 'current'; if (/^10-Q|^10-K|^20-F|^40-F/.test(f)) return 'periodic';
  if (/^SC 13D|^SC 13G|^SCHEDULE 13/.test(f)) return 'holder'; if (/^425|^DEFM14|^PREM14|^S-4/.test(f)) return 'merger'; return null; }

// ---------- per-row filters used by the trigger table (Stage 1) and the rules (Stage 2) ----------
// row = { d, s, p (prevC), f (dayFacts), so (shares outstanding), si (short interest days to cover), n90 (+40% days in the prior 90
// sessions), rs90 (reverse split in the prior 90 calendar days), news [[minute, cat]] (minute of the New York day; prior-day evening as
// negative), sec [[minute, class, form]], t: { [base]: { m, cv (cumulative volume to T), a (after), x: { [exit]: [g2, g3, ctrl2, ctrl3] } } } }
const catNews = (row, m, cats) => (row.news || []).some(([nm, c]) => nm < m && c !== 'reaction' && (!cats || cats.includes(c)));
export const FILTERS = {
  ALL: { name: 'no filter', fn: () => true },
  P_LT1: { name: 'prior close under 1 USD', fn: (r) => r.p < 1 },
  P_1_2: { name: 'prior close 1-2 USD', fn: (r) => r.p >= 1 && r.p < 2 },
  P_2_5: { name: 'prior close 2-5 USD', fn: (r) => r.p >= 2 },
  T_PRE10: { name: 'trigger 09:30-09:59', fn: (r, t) => t.m < 600 },
  T_10_12: { name: 'trigger 10:00-11:59', fn: (r, t) => t.m >= 600 && t.m < 720 },
  T_12PLUS: { name: 'trigger 12:00 or later', fn: (r, t) => t.m >= 720 },
  RV1: { name: 'volume so far (pre-market included) at least 1x a normal day', fn: (r, t) => r.av > 0 && t.cv / r.av >= 1 },
  RV3: { name: 'volume so far at least 3x a normal day', fn: (r, t) => r.av > 0 && t.cv / r.av >= 3 },
  RVLOW: { name: 'volume so far under 1x a normal day', fn: (r, t) => r.av > 0 && t.cv / r.av < 1 },
  PM20: { name: 'pre-market high 20%+ above the prior close', fn: (r) => r.f.pmHi !== null && r.f.pmHi >= 0.20 },
  PMRV1: { name: 'pre-market volume at least 1x a normal day', fn: (r) => r.f.pmRv !== null && r.f.pmRv >= 1 },
  NEWS_PRE: { name: 'a catalyst headline (not a reaction article) between the prior 16:00 and 09:30', fn: (r) => (r.news || []).some(([m, c]) => m < OPEN && c !== 'reaction') },
  NEWS_ANY: { name: 'a catalyst headline any time before the trigger minute', fn: (r, t) => catNews(r, t.m) },
  NEWS_NONE: { name: 'NO headline at all (catalyst or reaction) before the trigger minute', fn: (r, t) => !(r.news || []).some(([m]) => m < t.m) },
  NEWS_LIVE30: { name: 'a catalyst headline in the 30 minutes before the trigger, during the session', fn: (r, t) => (r.news || []).some(([m, c]) => c !== 'reaction' && m >= OPEN && m < t.m && m >= t.m - 30) },
  N_FDA: { name: 'FDA / clinical headline before the trigger', fn: (r, t) => catNews(r, t.m, ['fda']) },
  N_DEAL: { name: 'contract / partnership / order headline before the trigger', fn: (r, t) => catNews(r, t.m, ['deal']) },
  N_MERGER: { name: 'merger / acquisition headline before the trigger', fn: (r, t) => catNews(r, t.m, ['merger']) },
  N_THEME: { name: 'hot-theme headline (crypto, AI, quantum, drones, nuclear...) before the trigger', fn: (r, t) => catNews(r, t.m, ['theme']) },
  N_EARN: { name: 'earnings / results headline before the trigger', fn: (r, t) => catNews(r, t.m, ['earnings']) },
  N_OFFER: { name: 'offering / placement headline before the trigger (dilution)', fn: (r, t) => catNews(r, t.m, ['offering']) },
  SEC_PRE: { name: 'an 8-K / 6-K accepted between the prior session\'s 16:00 and the trigger', fn: (r, t) => (r.sec || []).some(([m, c]) => c === 'current' && m < t.m) },
  SEC_OFF30: { name: 'an offering filing (424B / S-1 / F-1 / S-3 / F-3 / EFFECT) in the 30 days before the trigger', fn: (r, t) => (r.sec || []).some(([m, c]) => c === 'offer' && m < t.m) },
  SEC_NOOFF: { name: 'NO offering filing in the 30 days before the trigger (SEC history found)', fn: (r, t) => r.secOk && !(r.sec || []).some(([m, c]) => c === 'offer' && m < t.m) },
  SO_LT10: { name: 'shares outstanding under 10M', fn: (r) => r.so > 0 && r.so < 10e6 },
  SO_10_50: { name: 'shares outstanding 10M-50M', fn: (r) => r.so >= 10e6 && r.so < 50e6 },
  SO_GT50: { name: 'shares outstanding 50M+', fn: (r) => r.so >= 50e6 },
  FRESH: { name: 'no +40% day in the prior 90 sessions', fn: (r) => r.n90 === 0 },
  REPEAT: { name: 'had a +40% day in the prior 90 sessions', fn: (r) => r.n90 > 0 },
  RS90: { name: 'reverse split in the prior 90 days', fn: (r) => !!r.rs90 },
  SI5: { name: 'short interest days-to-cover 5+ (published before the day)', fn: (r) => r.si !== null && r.si !== undefined && r.si >= 5 },
  DV1M: { name: 'pre-day liquidity: 20-day average traded value 1M USD+', fn: (r) => r.adv >= 1e6 },
  DVLOW: { name: 'pre-day liquidity under 200k USD a day', fn: (r) => r.adv < 2e5 },
};
export const FILTER_IDS = Object.keys(FILTERS);

// ---------- stats ----------
export const tOf = (a) => { if (a.length < 2) return null; const m = mean(a), sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); return sd > 0 ? r4(m / (sd / Math.sqrt(a.length))) : null; };
export const weekKey = (d) => { const ms = Date.parse(d + 'T12:00:00Z'), wd = new Date(ms).getUTCDay(); return new Date(ms - ((wd + 6) % 7) * 864e5).toISOString().slice(0, 10); };
// trades: [{ d, s, g2, g3, c2, c3 }] -> summary. Block = a calendar week (mean of its daily means of g2).
export function summarize(tr) {
  if (!tr.length) return { n: 0 };
  const g2 = tr.map(x => x.g2), g3 = tr.map(x => x.g3), sorted = [...g2].sort((a, b) => b - a), byDay = new Map();
  for (const x of tr) (byDay.get(x.d) || byDay.set(x.d, []).get(x.d)).push(x.g2);
  const wk = new Map(); for (const [d, v] of byDay) (wk.get(weekKey(d)) || wk.set(weekKey(d), []).get(weekKey(d))).push(mean(v));
  const bv = [...wk.values()].map(mean), ed = tr.filter(x => x.c2 !== null && x.c2 !== undefined).map(x => x.g2 - x.c2);
  const months = new Set(tr.map(x => x.d.slice(0, 7))), days = [...byDay.keys()].sort(), span = days.length ? (Date.parse(days[days.length - 1]) - Date.parse(days[0])) / 864e5 / 7 + 1 : 0;
  return { n: tr.length, days: byDay.size, stocks: new Set(tr.map(x => x.s)).size, avg: r4(mean(g2)), avgStress: r4(mean(g3)), median: r4(median(g2)), win: r4(g2.filter(x => x > 0).length / g2.length),
    noTop2: tr.length > 2 ? r4(mean(sorted.slice(2))) : null, best: r4(sorted[0]), worst3: sorted.slice(-3).reverse().map(r4), ctrl: ed.length ? r4(mean(tr.filter(x => x.c2 !== null && x.c2 !== undefined).map(x => x.c2))) : null,
    edge: ed.length ? r4(mean(ed)) : null, ctrlCovered: ed.length, blocks: bv.length, tBlock: bv.length >= 3 ? tOf(bv) : null, weeksWithSignal: wk.size, months: months.size };
}
export const PASS_T = 2.5, MIN_N = 20;
export function verdict(R) { const H = ['older', 'newer'].map(k => R[k] || { n: 0 }), why = [];
  if (!H.every(h => h.n >= MIN_N && h.blocks >= 3)) return { verdict: 'TOO FEW CASES', why: H.map((h, j) => (j ? 'newer ' : 'older ') + (h.n || 0) + ' trades / ' + (h.blocks || 0) + ' weeks').join('; ') };
  H.forEach((h, j) => { const p = j ? 'newer' : 'older';
    if (!(h.avg > 0)) why.push('loses after 2% slippage each way in the ' + p + ' part');
    if (!(h.avgStress > 0)) why.push('loses after 3% each way in the ' + p + ' part');
    if (!(h.edge > 0)) why.push('not better than the matched same-minute runners in the ' + p + ' part');
    if (!(h.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + p + ' part');
    if (!(h.tBlock >= PASS_T)) why.push('weekly block t ' + h.tBlock + ' under ' + PASS_T + ' in the ' + p + ' part'); });
  if (!why.length) return { verdict: 'PASSED (paper alert candidate)', why: 'every gate passed in both parts' };
  return { verdict: H.every(h => h.avg > 0 && h.edge > 0) ? 'NOT PROVEN' : 'REJECTED', why: why.join('; ') }; }

// ---------- STAGE 2 RULES ----------
// Pre-registered 25 Oct 2026 AFTER the Stage 1 run (data/squad19-lab.json caseStudy.triggersOlder / pairsOlder, OLDER part only:
// signal days 2024-01-02..2025-06-30) and BEFORE any Stage 2 run; never seen on the newer part. Chosen = the strongest older-part cells by
// average after 2% slippage each way with 25+ older trades, one exit each (the best of the four in the older part). Warning written
// before the run: in the older part EVERY one of them is negative without its 2 best trades and none has a weekly block t above 1, so
// they are expected to fail; they are run once so the owner sees the out-of-sample answer, not a guess.
const OLDER_NOTE = (n, avg, nt2) => ' Older part (chosen on it): ' + n + ' trades, ' + avg + ' a trade after 2% each way, ' + nt2 + ' without the 2 best.';
export const RULES = {
  'SQ19-FAST-PM': { base: 'FAST', filters: ['PMRV1'], exit: 'S15', name: 'Fast ignition (+10% to +20% within 10 minutes, not a gap) after a pre-market of 1x a normal day\'s volume; stop 15%, sell at the close',
    rule: 'Under-5 USD stock (prior close 0.10-5). The 09:30 open is under +10%; it crosses +10% and then +20% within 10 minutes; trigger = the +20% minute; pre-market volume (04:00-09:29) >= the 20-session average daily volume. Buy the next bar\'s open; stop 15% under the fill; else sell at the 15:59 close.' + OLDER_NOTE(178, '+1.2%', '-5.6%') },
  'SQ19-FAST-PM-RV3': { base: 'FAST', filters: ['PMRV1', 'RV3'], exit: 'S15', name: 'Fast ignition with pre-market volume 1x and 3x a normal day traded by the trigger; stop 15%, close',
    rule: 'SQ19-FAST-PM plus: volume from 04:00 to the trigger minute >= 3x the 20-session average daily volume.' + OLDER_NOTE(134, '+5.2%', '-3.8%') },
  'SQ19-FAST-PM-REPEAT': { base: 'FAST', filters: ['PMRV1', 'REPEAT'], exit: 'S15', name: 'Fast ignition with pre-market volume, in a stock that already had a +40% day in the prior 90 sessions; stop 15%, close',
    rule: 'SQ19-FAST-PM plus: at least one session in the prior 90 whose high was 40%+ over its prior close.' + OLDER_NOTE(102, '+7.0%', '-4.9%') },
  'SQ19-FAST-EARLY-RV3': { base: 'FAST', filters: ['T_PRE10', 'RV3'], exit: 'S15', name: 'Fast ignition before 10:00 with 3x a normal day traded by the trigger; stop 15%, close',
    rule: 'FAST trigger at 09:30-09:59 and volume from 04:00 to the trigger >= 3x the 20-session average daily volume. Buy the next bar\'s open; stop 15%; else the 15:59 close.' + OLDER_NOTE(130, '+4.4%', '-4.9%') },
  'SQ19-FAST-2TO5-PM': { base: 'FAST', filters: ['P_2_5', 'PMRV1'], exit: 'S10', name: 'Fast ignition in a 2-5 USD stock with pre-market volume 1x; stop 10%, close',
    rule: 'SQ19-FAST-PM restricted to prior close 2-5 USD, stop 10% under the fill.' + OLDER_NOTE(38, '+25.5%', '-6.5%') },
  'SQ19-GAP20-8K-NONEWS': { base: 'GAP20', filters: ['NEWS_NONE', 'SEC_PRE'], exit: 'S15', name: 'Opens 20%+ up on an overnight 8-K / 6-K with no news headline at all; buy 09:31, stop 15%, close',
    rule: 'Under-5 USD stock opens (09:30 bar) 20%+ over the prior close; an 8-K or 6-K was accepted between the prior session\'s 16:00 and the open; no Benzinga headline (catalyst or reaction) before the open. Buy the 09:31 bar open; stop 15%; else the 15:59 close.' + OLDER_NOTE(46, '+4.8%', '-0.1%') },
  'SQ19-HODBRK-LIVENEWS': { base: 'HODBRK', filters: ['NEWS_LIVE30', 'DV1M'], exit: 'S15', name: 'Second leg: after reaching +20% and pulling back 10%+, breaks the high of day within 30 minutes of a fresh in-session catalyst headline; liquid; stop 15%, close',
    rule: 'Under-5 USD stock with a 20-day average traded value >= 1M USD; reached +20% on the prior close, pulled back 10%+ from its high, then a minute breaks the high of day (trigger); a catalyst headline (not a reaction article) was published during the session in the 30 minutes before the trigger. Buy the next bar\'s open; stop 15%; else the 15:59 close.' + OLDER_NOTE(72, '+0.8%', '-3.8%') },
};
export const RULE_IDS = Object.keys(RULES);
export function ruleTrades(rows, R) { const out = [];
  for (const r of rows) { const t = r.t && r.t[R.base]; if (!t || !t.x || !t.x[R.exit]) continue; if (!R.filters.every(f => FILTERS[f].fn(r, t))) continue;
    const [g2, g3, c2, c3] = t.x[R.exit]; out.push({ d: r.d, s: r.s, m: t.m, g2, g3, c2, c3, p: r.p }); }
  return out; }
export function preRegister(LB, day) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, R] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Same-day jump under 5 USD (squad 19, minute bars)', name: R.name, explain: R.rule + ' Common conventions: squad19-core.mjs header (fill = next bar open after the trigger minute, no fill in a halt, 2% slippage each way, 3% stress, matched same-minute runners).',
      status: 'pre-registered ' + day + ' (squad 19, after the Stage 1 case study, older part only); one-shot on 2024-01 to now pending', agent: 'squad19', libraryCheck: R.check || 'IG1-IG9 (ignition-core), SQ2-*, SQ8-*',
      sources: R.src || [], spec: 'squad19-core.mjs RULES[' + id + '] = base ' + R.base + ' + filters ' + R.filters.join(', ') + ' + exit ' + R.exit + '.',
      note: 'INTRADAY ENTRY: never a next-open TRY SMALL buy; a winner becomes a PAPER alert first. Most under-5 USD names are not ZAD-marked: check ZAD first.',
      study: 'squad19-lab.mjs judge -> data/squad19-lab.json (run once as written, first complete run frozen)' }); ch++; }
  if (ch) LB.updated = day; return ch; }

// =====================================================================================================================================
// DAILY-BAR CANDIDATES FROM THE OWNER'S OUTSIDE REVIEWERS (pre-registered 25 Oct 2026, BEFORE any Squad 19 run; one version each)
// Window: raw Massive grouped daily bars from 2021-01-04 (signals from 2021-11-01), whole market incl. dead stocks; series are split-
// adjusted for returns/indicators, but every PRICE BAND uses the RAW close of that day. Halves: signal before / from 2024-01-01.
// Entry next open. Costs reported twice: house 0.8% / 1.2% round trip AND 2% / 3% slippage each way; the 2%-each-way version DECIDES.
// Stops on daily bars: an open at or under the stop fills at the open; else a low at or under it fills at the stop.
// Yardsticks: average stock of the rule's price band the same entry day, same holding sessions, open to close, capped +300% (AUD-1);
// the same stock on its other in-band days. Judge: both halves n >= 20 and 3+ blocks of 20 sessions; average after 2% and 3% each way
// > 0; beats the band average (net of 2% each way vs the gross yardstick); beats the same stock's other days; > 0 without its 2 best;
// block t >= 2.5.
// SEC: 8-K items and acceptance times from EDGAR submissions by CIK (CIK from Massive ticker details as of the symbol's last in-band
// day; fallback data/sec-ciks.json); a filing is public in the session it is accepted before 16:00 New York, else the next session.
// FDA / topline wording: EDGAR full-text search (8-K, exact phrases below) joined to the submissions by accession number.
// Share counts: data/shares.json.gz (SEC dei frames by CIK), usable 45 days after the period date.
// DEVIATIONS FROM THE REVIEWERS' TEXT (data limits, written before any run):
//   CAT-HUNTER-SUB5 type B (contract value >= 10% of market cap, named counterparty) is NOT tested: no validated dollar-value extractor;
//     the idea is already C-CT1 (Agent C, contract size vs company size) and DEC2-CONTRACT (REJECTED). Only types A and C are tested.
//     "Signal-day volume >= 20x with type C and no named trial" is not applied (trial names are not parsed). "Already up 40% when public":
//     pre-open filing -> the open; filing in the session -> the close (proxy: intraday price at the minute is not on daily bars).
//   UNDER5-JUMP: the 1.01 "value >= 10% of revenue" and the 7.01/8.01 "government award" tests need document parsing -> fresh reason =
//     any 8-K with item 1.01 in the last 10 sessions, OR (no 8-K at all in the last 10 sessions AND quiet: none of the 10 prior sessions
//     traded over 1.5x its 50-session average volume). The crash/base tests are read at t-1 (the close before the jump day) except the
//     10-session windows, which include t as written. Unknown share count or no SEC history -> excluded.
//   UNDER5-REVERSE / UNDER5-EPS-LOW: liquidity floor 20-day average traded value 0.5M USD and raw close 0.50-5 USD (not in the text).
//     REVERSE "no lower low 10d" = the lowest low since the split was set 10+ sessions ago. EPS-LOW "earnings gap" = an 8-K with item
//     2.02 public before that session's open, and the open 5%+ above the prior close; "quiet" = each of the 3 days trades less volume
//     than the gap day and its low stays above the gap midpoint (prior close + gap-day open) / 2.
// =====================================================================================================================================
export const D_SPLIT = '2024-01-01', D_FROM = '2021-01-04', D_SIGNALS = '2021-11-01', D_COST = 0.008, D_STRESS = 0.012, D_SLIP = 0.02, D_SLIP3 = 0.03, D_BLOCK = 20;
export const FDA_PHRASES = ['Breakthrough Device designation', 'Breakthrough Therapy designation', 'Fast Track designation', 'Orphan Drug designation', 'Rare Pediatric Disease designation'];
export const TOPLINE_PHRASES = ['positive topline', 'positive top-line', 'met its primary endpoint', 'met the primary endpoint', 'achieved its primary endpoint', 'achieved the primary endpoint'];
export const DAILY_RULES = {
  'CAT-HUNTER-SUB5': { band: [1, 5], dv: 1e6, name: 'Under-5 primary-source catalyst hunter (FDA designation or positive topline 8-K), clean supply, hold 10 / stop 25%',
    rule: 'Raw close 1-5 USD on the signal session t, 20-day average traded value >= 1M USD. Signal: an 8-K public in session t whose text contains an FDA designation phrase (Breakthrough Device/Therapy, Fast Track, Orphan Drug, Rare Pediatric Disease designation) [type A], or a positive-topline / primary-endpoint-met phrase in an 8-K carrying item 8.01 or 2.02 [type C]. Exclude: reverse split in the 60 days before t; 424B5 / S-1 / S-1/A / S-3 / S-3/A public in sessions t-19..t; any close-to-close move of 15%+ (either way) in t-21..t-1; already up 40%+ on the prior close when public (open for a pre-open filing, close for a filing in the session). Buy t+1 open; sell at the close of session 10 (entry day = 1) or a 25% stop under the fill.' },
  'UNDER5-JUMP': { band: [0.5, 5], dv: 0.5e6, name: 'Crashed and stabilising under-5 stock that jumps on 3x volume with a fresh reason, clean supply (sell half at +20%, rest by day 3)',
    rule: 'Raw close 0.50-5 USD, 20-day average traded value >= 0.5M USD. At t-1: close <= 60% of its 200-day average and within 2% of the lowest close of 252 sessions. Lowest low of t-9..t >= lowest low of t-29..t-10; high-low range of t-9..t <= 0.6x that of t-29..t-10; average volume of t-9..t >= 1.2x that of t-29..t-10. Day t: volume >= 3x its 50-session average, close in the top 25% of the day range, close +15% on the prior close, or +4% with a fresh reason (see deviations). Share count up < 5% over 90 days; no 424B5 / S-1 / S-1/A / 8-K item 3.02 public in t-19..t; no close-to-close rise of 15%+ in t-21..t-1. Buy t+1 open (skip if it opens at or under the day-t low); stop = day-t low; at the first close 20%+ over the fill sell half at that close and move the stop to the fill; sell the rest at the next open after a close under the 10-day average, else at the close of session 3.' },
  'UNDER5-REVERSE': { band: [0.5, 5], dv: 0.5e6, name: 'Down 70%+ since a recent reverse split, no new low for 10 sessions, 2x volume and a fresh 8-K 1.01 (hold 10)',
    rule: 'Raw close 0.50-5 USD, 20-day average traded value >= 0.5M USD. A reverse split executed in sessions t-62..t-10; close t <= 30% of the first post-split close; the lowest low since the split was set before t-9 (no lower low in t-9..t); volume t >= 2x its 50-session average; an 8-K with item 1.01 public in t-9..t. Buy t+1 open (skip if at or under the day-t low); stop = day-t low; sell at the close of session 10.' },
  'UNDER5-EPS-LOW': { band: [0.5, 5], dv: 0.5e6, name: 'Under-5 earnings gap-up of 5%+, then 3 quiet days holding above the gap midpoint (buy day 4, hold 10)',
    rule: 'Gap session g: an 8-K with item 2.02 public before the open of g; raw prior close 0.50-5 USD; 20-day average traded value >= 0.5M USD; open g >= 1.05x the prior close. Midpoint = (prior close + open g) / 2. Sessions g+1..g+3 each: low above the midpoint and volume under the gap day volume. Buy the open of g+4 (skip if at or under the midpoint); stop = midpoint; sell at the close of session 10.' },
};
export const DAILY_IDS = Object.keys(DAILY_RULES);
export const SKIPPED_OWNER = {
  'CAT-HUNTER-SUB5 type B': 'dollar value / named counterparty needs a validated 8-K text extractor; duplicate of C-CT1 (pre-registered by Agent C) and close to DEC2-CONTRACT (REJECTED)',
  'DEC-CONTRACT': 'already tested as DEC2-CONTRACT (8-K 1.01 contract, +4% close on 2x volume): REJECTED',
  'DEC-INSIDER-QUALITY': 'already tested as DEC2-INSQ (TOO FEW CASES) and EXP-INS1 / ANOM-INSIDER / SQ1-INSCLU (REJECTED)',
  'DEC-EPS-REV': 'needs point-in-time analyst estimate history (ANOM-REVISION / C-REV1: needs data); none of the keys provides it historically',
  'DEC-SUPPLIER-ASIA': 'already in the library as DEC2-ASIA-SUPPLIER: needs data (supplier links with dates)',
  'DEC-SHORT-CATALYST': 'needs historical short interest for dead stocks (C-SQZ1 / S5: needs data); the related ANOM-SILOW / ANOM-SIDROP were REJECTED',
};
// ---- daily helpers: a = { o, h, l, c, v } split-adjusted arrays of one symbol (NaN = no trade), rc = raw closes
const okN = (x) => x > 0 && isFinite(x);
export function avgOf(arr, from, to, minShare = 0.9) { let s = 0, k = 0; for (let i = Math.max(0, from); i <= to; i++) if (okN(arr[i])) { s += arr[i]; k++; } return k >= Math.ceil((to - from + 1) * minShare) ? s / k : null; }
export function minOf(arr, from, to) { let m = Infinity; for (let i = Math.max(0, from); i <= to; i++) if (okN(arr[i])) m = Math.min(m, arr[i]); return isFinite(m) ? m : null; }
export function maxOf(arr, from, to) { let m = -Infinity; for (let i = Math.max(0, from); i <= to; i++) if (okN(arr[i])) m = Math.max(m, arr[i]); return isFinite(m) ? m : null; }
export const dv20 = (a, t) => { let s = 0, k = 0; for (let i = t - 20; i < t; i++) if (okN(a.c[i]) && a.v[i] >= 0) { s += a.c[i] * a.v[i]; k++; } return k >= 15 ? s / k : null; };
export const inBand = (R, rc, t) => rc[t] >= R.band[0] && rc[t] < R.band[1];
// any close-to-close move of `x` or more (abs = either direction) in sessions from..to
export function bigMove(c, from, to, x, abs) { for (let i = Math.max(1, from); i <= to; i++) if (okN(c[i]) && okN(c[i - 1])) { const g = c[i] / c[i - 1] - 1; if (abs ? Math.abs(g) >= x : g >= x) return true; } return false; }
// hold-N trade with a fixed stop; returns { legs: [{ w, e, x }], held, why } or null (skipped)
export function holdTrade(a, ent, hold, stopPx, skipIfOpenAtStop = false) { const e = a.o[ent]; if (!okN(e)) return null; if (skipIfOpenAtStop && stopPx !== null && e <= stopPx) return null;
  let last = ent; for (let k = 0, i = ent; k < hold && i < a.c.length; i++) { if (!okN(a.c[i])) continue; k++; last = i;
    if (stopPx !== null) { if (i > ent && a.o[i] <= stopPx) return { legs: [{ w: 1, e, x: a.o[i] }], held: k, exitIdx: i, why: 'stop' }; if (a.l[i] <= stopPx) return { legs: [{ w: 1, e, x: Math.min(stopPx, a.o[i]) }], held: k, exitIdx: i, why: 'stop' }; }
    if (k === hold) return { legs: [{ w: 1, e, x: a.c[i] }], held: k, exitIdx: i, why: 'time' }; }
  return okN(a.c[last]) && last > ent - 1 ? { legs: [{ w: 1, e, x: a.c[last] }], held: null, exitIdx: last, why: 'data end' } : null; }
// UNDER5-JUMP exit: stop = signal low; half at the first close >= +20% (stop to the fill); rest next open after a close under the 10-day average, else close of session 3
export function jumpTrade(a, ent, stopPx) { const e = a.o[ent]; if (!okN(e) || e <= stopPx) return null; let stop = stopPx, half = false; const legs = []; let k = 0;
  for (let i = ent; i < a.c.length; i++) { if (!okN(a.c[i])) continue; k++; const w = half ? 0.5 : 1;
    if (i > ent && a.o[i] <= stop) { legs.push({ w, e, x: a.o[i] }); return { legs, held: k, exitIdx: i, why: 'stop' }; }
    if (a.l[i] <= stop) { legs.push({ w, e, x: Math.min(stop, a.o[i]) }); return { legs, held: k, exitIdx: i, why: 'stop' }; }
    if (!half && a.c[i] >= e * 1.2) { legs.push({ w: 0.5, e, x: a.c[i] }); half = true; stop = Math.max(stop, e); }
    if (k >= 3) { legs.push({ w: half ? 0.5 : 1, e, x: a.c[i] }); return { legs, held: k, exitIdx: i, why: 'day 3' }; }
    const s10 = avgOf(a.c, i - 9, i, 0.8); if (s10 !== null && a.c[i] < s10) { let j = i + 1; while (j < a.c.length && !okN(a.o[j])) j++; if (j < a.c.length) { legs.push({ w: half ? 0.5 : 1, e, x: a.o[j] }); return { legs, held: k + 1, exitIdx: j, why: '10-day average' }; } } }
  return null; }
export const legsNet = (T, slip) => r4(T.legs.reduce((s, z) => s + z.w * ((z.x * (1 - slip)) / (z.e * (1 + slip)) - 1), 0));
export const legsGross = (T) => r4(T.legs.reduce((s, z) => s + z.w * (z.x / z.e - 1), 0));
// sec = { s8k: [[session, items]], offer: [session] (form list per rule), all8k: Set of sessions } built by the lab per CIK
export function sigJump(a, rc, t, sec, shareGrowth) { const R = DAILY_RULES['UNDER5-JUMP'];
  if (t < 253 || !inBand(R, rc, t) || !okN(a.c[t]) || !okN(a.c[t - 1])) return null; const dv = dv20(a, t); if (!(dv >= R.dv)) return null;
  const s200 = avgOf(a.c, t - 200, t - 1, 0.8), lo252 = minOf(a.c, t - 252, t - 1); if (s200 === null || lo252 === null || !(a.c[t - 1] <= 0.6 * s200) || !(a.c[t - 1] <= 1.02 * lo252)) return null;
  const lA = minOf(a.l, t - 9, t), lB = minOf(a.l, t - 29, t - 10); if (lA === null || lB === null || lA < lB) return null;
  const rA = maxOf(a.h, t - 9, t) - lA, rB = maxOf(a.h, t - 29, t - 10) - lB; if (!(rA <= 0.6 * rB)) return null;
  const vA = avgOf(a.v, t - 9, t), vB = avgOf(a.v, t - 29, t - 10), v50 = avgOf(a.v, t - 50, t - 1, 0.8); if (vA === null || vB === null || v50 === null || !(vA >= 1.2 * vB) || !(a.v[t] >= 3 * v50)) return null;
  if (!(a.h[t] > a.l[t]) || (a.c[t] - a.l[t]) / (a.h[t] - a.l[t]) < 0.75) return null;
  if (bigMove(a.c, t - 21, t - 1, 0.15, false)) return null;
  if (!sec) return null; if (sec.offer.some(s => s >= t - 19 && s <= t)) return null; const g = shareGrowth; if (g === null || g === undefined || !(g < 0.05)) return null;
  const up = a.c[t] / a.c[t - 1] - 1; if (up >= 0.15) return { why: '+15%' };
  if (up < 0.04) return null;
  if (sec.s8k.some(([s, it]) => s >= t - 9 && s <= t && /1\.01/.test(it))) return { why: '+4% with an 8-K 1.01' };
  const any8k = sec.s8k.some(([s]) => s >= t - 9 && s <= t), base = avgOf(a.v, t - 60, t - 11, 0.8), mx = maxOf(a.v, t - 10, t - 1);
  if (!any8k && base !== null && mx !== null && mx <= 1.5 * base) return { why: '+4% quiet-then-3x, no filing' };
  return null; }
export function sigReverse(a, rc, t, sec, splitIdx) { const R = DAILY_RULES['UNDER5-REVERSE'];
  if (!inBand(R, rc, t) || !okN(a.c[t])) return null; const dv = dv20(a, t); if (!(dv >= R.dv)) return null; if (!sec) return null;
  const sp = splitIdx.filter(s => s >= t - 62 && s <= t - 10).pop(); if (sp === undefined || !okN(a.c[sp])) return null;
  if (!(a.c[t] <= 0.3 * a.c[sp])) return null; const lA = minOf(a.l, t - 9, t), lB = minOf(a.l, sp, t - 10); if (lA === null || lB === null || !(lA > lB)) return null;
  const v50 = avgOf(a.v, t - 50, t - 1, 0.8); if (v50 === null || !(a.v[t] >= 2 * v50)) return null;
  if (!sec.s8k.some(([s, it]) => s >= t - 9 && s <= t && /1\.01/.test(it))) return null; return { why: 'reverse split + 1.01' }; }
// returns the signal session t (= g+3) for a gap session g, or null
export function sigEpsLow(a, rc, g, sec) { const R = DAILY_RULES['UNDER5-EPS-LOW'];
  if (g < 21 || !(rc[g - 1] >= R.band[0] && rc[g - 1] < R.band[1]) || !okN(a.o[g]) || !okN(a.c[g - 1])) return null; const dv = dv20(a, g); if (!(dv >= R.dv)) return null; if (!sec) return null;
  if (!sec.pre202.has(g)) return null; if (!(a.o[g] >= 1.05 * a.c[g - 1])) return null; const mid = (a.c[g - 1] + a.o[g]) / 2;
  for (let k = 1; k <= 3; k++) { const i = g + k; if (i >= a.c.length || !okN(a.l[i]) || !(a.l[i] > mid) || !(a.v[i] < a.v[g])) return null; }
  return { t: g + 3, mid }; }
export function sigCat(a, rc, t, sec, splitDaysAgo, pub) { const R = DAILY_RULES['CAT-HUNTER-SUB5'];
  if (!inBand(R, rc, t) || !okN(a.c[t]) || !okN(a.c[t - 1])) return null; const dv = dv20(a, t); if (!(dv >= R.dv)) return null; if (!sec) return null;
  if (splitDaysAgo !== null && splitDaysAgo <= 60) return null; if (sec.offerCat.some(s => s >= t - 19 && s <= t)) return null; if (bigMove(a.c, t - 21, t - 1, 0.15, true)) return null;
  const px = pub === 'pre' ? a.o[t] : a.c[t]; if (okN(px) && px >= 1.4 * a.c[t - 1]) return null; return { why: 'catalyst' }; }
// daily summary per half: tr = [{ d, s, t (entry index), n2, n3, h8, h12, gross, ctrl, own }]
export function dSummary(tr) { if (!tr.length) return { n: 0 };
  const n2 = tr.map(x => x.n2), srt = [...n2].sort((a, b) => b - a), ed = tr.filter(x => x.ctrl !== null).map(x => ({ t: x.t, v: x.n2 - x.ctrl })), ow = tr.filter(x => x.own !== null).map(x => x.gross - x.own);
  const blk = new Map(); for (const z of ed) { const k = Math.floor(z.t / D_BLOCK); (blk.get(k) || blk.set(k, []).get(k)).push(z.v); } const bv = [...blk.values()].map(mean);
  return { n: tr.length, stocks: new Set(tr.map(x => x.s)).size, avg2: r4(mean(n2)), avg3: r4(mean(tr.map(x => x.n3))), avgHouse: r4(mean(tr.map(x => x.h8))), avgHouseStress: r4(mean(tr.map(x => x.h12))), median2: r4(median(n2)),
    win: r4(n2.filter(x => x > 0).length / n2.length), ctrl: r4(mean(tr.filter(x => x.ctrl !== null).map(x => x.ctrl))), edge: ed.length ? r4(mean(ed.map(z => z.v))) : null, vsOwn: ow.length ? r4(mean(ow)) : null,
    noTop2: tr.length > 2 ? r4(mean(srt.slice(2))) : null, worst3: srt.slice(-3).reverse().map(r4), best: r4(srt[0]), blocks: bv.length, tBlock: bv.length >= 3 ? tOf(bv) : null }; }
export function dVerdict(R) { const H = ['older', 'newer'].map(k => R[k] || { n: 0 }), why = [];
  if (!H.every(h => h.n >= MIN_N && h.blocks >= 3)) return { verdict: 'TOO FEW CASES', why: H.map((h, j) => (j ? 'newer ' : 'older ') + (h.n || 0) + ' trades / ' + (h.blocks || 0) + ' blocks').join('; ') };
  H.forEach((h, j) => { const p = j ? 'newer' : 'older';
    if (!(h.avg2 > 0)) why.push('loses after 2% slippage each way in the ' + p + ' half'); if (!(h.avg3 > 0)) why.push('loses after 3% each way in the ' + p + ' half');
    if (!(h.edge > 0)) why.push('not better than the average stock of its band in the ' + p + ' half'); if (!(h.vsOwn > 0)) why.push('not better than the same stocks on their other days in the ' + p + ' half');
    if (!(h.noTop2 > 0)) why.push('loses without its 2 best in the ' + p + ' half'); if (!(h.tBlock >= PASS_T)) why.push('block t ' + h.tBlock + ' under ' + PASS_T + ' in the ' + p + ' half'); });
  if (!why.length) return { verdict: H.every(h => h.tBlock >= 4) ? 'PROVEN' : 'TRADABLE SMALL', why: 'every gate passed in both halves (2% slippage each way)' };
  return { verdict: H.every(h => h.edge > 0) ? 'NOT PROVEN' : 'REJECTED', why: why.join('; ') }; }
export function preRegisterDaily(LB, day) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, R] of Object.entries(DAILY_RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Under-5 USD daily-bar ideas from the owner\'s outside reviewers (squad 19)', name: R.name, explain: R.rule + ' Deviations and data: squad19-core.mjs DAILY section header.',
      status: 'pre-registered ' + day + ' (squad 19) before any run; one-shot on 5 years of daily bars pending', agent: 'squad19', libraryCheck: 'DEC-CRASH, DEC2-CONTRACT, C-CT1, E13/E16, catalyst lane CAT-*', sources: [],
      spec: 'squad19-core.mjs DAILY_RULES[' + id + ']', note: 'Owner-supplied spec (outside reviewers). Costs: house 0.8%/1.2% and 2%/3% slippage each way; the 2% version decides. Under-5 names are rarely ZAD-marked: check ZAD first.',
      study: 'squad19-lab.mjs daily -> data/squad19-lab.json dailyFirstRun (run once as written, first complete run frozen)' }); ch++; }
  if (ch) LB.updated = day; return ch; }

// DIAGNOSTIC twins of sigJump / sigReverse (same tests, same order): the name of the first failing test, or 'SIGNAL'. Changes no verdict.
export function jumpFunnel(a, rc, t, sec, g) { const R = DAILY_RULES['UNDER5-JUMP'];
  if (t < 253) return '0 history < 253'; if (!inBand(R, rc, t) || !okN(a.c[t]) || !okN(a.c[t - 1])) return '1 price band'; const dv = dv20(a, t); if (!(dv >= R.dv)) return '2 liquidity';
  const s200 = avgOf(a.c, t - 200, t - 1, 0.8), lo252 = minOf(a.c, t - 252, t - 1); if (s200 === null || lo252 === null) return '3 history gaps'; if (!(a.c[t - 1] <= 0.6 * s200)) return '4 not 40% under 200-day'; if (!(a.c[t - 1] <= 1.02 * lo252)) return '5 not near 52-week low';
  const lA = minOf(a.l, t - 9, t), lB = minOf(a.l, t - 29, t - 10); if (lA === null || lB === null || lA < lB) return '6 lower low';
  const rA = maxOf(a.h, t - 9, t) - lA, rB = maxOf(a.h, t - 29, t - 10) - lB; if (!(rA <= 0.6 * rB)) return '7 range not tight';
  const vA = avgOf(a.v, t - 9, t), vB = avgOf(a.v, t - 29, t - 10), v50 = avgOf(a.v, t - 50, t - 1, 0.8); if (vA === null || vB === null || v50 === null || !(vA >= 1.2 * vB)) return '8 volume not rising'; if (!(a.v[t] >= 3 * v50)) return '9 day volume < 3x';
  if (!(a.h[t] > a.l[t]) || (a.c[t] - a.l[t]) / (a.h[t] - a.l[t]) < 0.75) return '10 close not top quarter'; if (bigMove(a.c, t - 21, t - 1, 0.15, false)) return '11 15% day in prior 21';
  if (!sec) return '12 no SEC history'; if (sec.offer.some(s => s >= t - 19 && s <= t)) return '13 offering filing'; if (g === null || g === undefined) return '14 share count unknown'; if (!(g < 0.05)) return '15 share count +5%';
  const up = a.c[t] / a.c[t - 1] - 1; if (up >= 0.15) return 'SIGNAL'; if (up < 0.04) return '16 up < 4%';
  if (sec.s8k.some(([s, it]) => s >= t - 9 && s <= t && /1\.01/.test(it))) return 'SIGNAL'; const any8k = sec.s8k.some(([s]) => s >= t - 9 && s <= t), base = avgOf(a.v, t - 60, t - 11, 0.8), mx = maxOf(a.v, t - 10, t - 1);
  return !any8k && base !== null && mx !== null && mx <= 1.5 * base ? 'SIGNAL' : '17 no fresh reason'; }
export function reverseFunnel(a, rc, t, sec, splitIdx) { const R = DAILY_RULES['UNDER5-REVERSE'];
  if (!inBand(R, rc, t) || !okN(a.c[t])) return '1 price band'; const dv = dv20(a, t); if (!(dv >= R.dv)) return '2 liquidity'; const sp = splitIdx.filter(s => s >= t - 62 && s <= t - 10).pop(); if (sp === undefined || !okN(a.c[sp])) return '3 no reverse split 10-62 sessions ago';
  if (!sec) return '4 no SEC history'; if (!(a.c[t] <= 0.3 * a.c[sp])) return '5 not down 70% since split'; const lA = minOf(a.l, t - 9, t), lB = minOf(a.l, sp, t - 10); if (lA === null || lB === null || !(lA > lB)) return '6 lower low';
  const v50 = avgOf(a.v, t - 50, t - 1, 0.8); if (v50 === null || !(a.v[t] >= 2 * v50)) return '7 volume < 2x'; if (!sec.s8k.some(([s, it]) => s >= t - 9 && s <= t && /1\.01/.test(it))) return '8 no 8-K 1.01'; return 'SIGNAL'; }
