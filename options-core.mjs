// OPTIONS LANE, pure rules (pre-registered 23 Oct 2026 in data/strategy-library.json as OPT-LH1 / OPT-CAT1 / OPT-FOLLOW1 / OPT-UOA1).
// Long calls only, 1 contract. No network here; options-lab.mjs fetches and calls these. Tests: test/options-core.test.mjs.
export const FEE = 5, STOCK_COST = 0.008, MIN_PER_HALF = 20, TIER2_T = 2.5, PROOF_T = 4.0, STRESS_X = 1.5;

// one contract: paid open x (1 + h) plus 5 USD; got close x (1 - h) minus 5 USD (a worthless call is not sold: the loss stops at -100%)
export function optionNet(entryOpen, exitClose, h) {
  const paid = 100 * entryOpen * (1 + h) + FEE, got = 100 * exitClose * (1 - h) - FEE;
  return Math.max(-1, got / paid - 1);
}

// CONTRACT: among the calls of the chosen expiry (chain = [{ occ, k }]), the 8 strikes nearest the raw spot are tried, nearest first
// (tie = lower strike); the first with a daily bar ON the entry session is taken. bars = { occ: [{ t: 'YYYY-MM-DD', o, c }] }.
export const day10 = (t) => String(t).slice(0, 10);
export function pickContract(chain, bars, day, spot) {
  const near = [...chain].sort((a, b) => Math.abs(a.k - spot) - Math.abs(b.k - spot) || a.k - b.k).slice(0, 8);
  for (const c of near) { const b = (bars[c.occ] || []).find(x => day10(x.t) === day); if (b && b.o > 0) return { ...c, open: b.o }; }
  return null;
}
// EXIT: the contract's close on the exit session; if it did not trade that day, the intrinsic value at the stock's raw close (a floor)
export function exitValue(bars, day, rawClose, strike) {
  const b = (bars || []).find(x => day10(x.t) === day);
  if (b && b.c >= 0) return { px: b.c, by: 'close' };
  return { px: Math.max(0, rawClose - strike), by: 'intrinsic' };
}

// ---- verdict (the registered gates) ------------------------------------------------------------------------------------------------
// trades: [{ e: entry session index, net, netStress, stock }]; opts: { B: block length in sessions, bar: the PROVEN bar }
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const tStat = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
// non-overlapping blocks of B sessions: a block's value = the average of its per-entry-day averages
export function blockValues(trades, B, f = (z) => z.net) { const o = new Map();
  for (const z of trades) { const x = f(z); if (!isFinite(x)) continue; const b = Math.floor(z.e / B); if (!o.has(b)) o.set(b, new Map()); const m = o.get(b); if (!m.has(z.e)) m.set(z.e, []); m.get(z.e).push(x); }
  return [...o.values()].map(m => mean([...m.values()].map(mean))); }
export function stats(trades, B) { const net = trades.map(z => z.net), srt = [...net].sort((a, b) => b - a), blk = blockValues(trades, B);
  return { n: trades.length, days: new Set(trades.map(z => z.e)).size, win: r4(net.filter(x => x > 0).length / (net.length || 1)), avg: r4(mean(net)), median: r4(median(net)), avgStress: r4(mean(trades.map(z => z.netStress))),
    stock: r4(mean(trades.map(z => z.stock))), edge: r4(mean(trades.map(z => z.net - z.stock))), noBest2: r4(srt.length > 2 ? mean(srt.slice(2)) : null), worst: r4(srt[srt.length - 1]), best: r4(srt[0]),
    blocks: blk.length, tBlock: blk.length >= 3 ? tStat(blk) : null }; }
export function splitHalves(trades) { const days = [...new Set(trades.map(z => z.e))].sort((a, b) => a - b), cut = days[Math.floor(days.length / 2)];
  return { older: trades.filter(z => z.e < cut), newer: trades.filter(z => z.e >= cut), cut }; }
export function verdictOf(trades, { B, bar }) {
  const S = stats(trades, B), hv = splitHalves(trades), half = { older: stats(hv.older, B), newer: stats(hv.newer, B) }, why = [], out = (verdict, w) => ({ verdict, why: w, ...S, half, B, bar });
  if (!(half.older.n >= MIN_PER_HALF && half.newer.n >= MIN_PER_HALF)) return out('TOO FEW CASES', 'fewer than ' + MIN_PER_HALF + ' priced trades in a half (' + half.older.n + ' / ' + half.newer.n + ')');
  for (const k of ['older', 'newer']) { const h = half[k];
    if (!(h.avg > 0)) why.push('lost money after the spread and ZAD fees in the ' + k + ' half (' + h.avg + ')');
    if (!(h.avgStress > 0)) why.push('lost money at the 1.5x spread stress in the ' + k + ' half (' + h.avgStress + ')');
    if (!(h.edge > 0)) why.push('did not beat buying the same stock with the same money in the ' + k + ' half (' + h.avg + ' vs ' + h.stock + ')'); }
  if (!(S.noBest2 > 0)) why.push('loses without its 2 best trades (' + S.noBest2 + ')');
  if (!(S.tBlock >= TIER2_T)) why.push('block t ' + S.tBlock + ' over ' + S.blocks + ' non-overlapping ' + B + '-session blocks, under ' + TIER2_T);
  if (!why.length) return S.tBlock >= bar ? out('PROVEN', 'every gate passed; block t ' + S.tBlock + ' clears the proof bar ' + bar) : out('TRADABLE SMALL', 'every gate passed with block t ' + S.tBlock + ' >= ' + TIER2_T + ', below the proof bar ' + bar);
  return out(half.older.edge > 0 && half.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED', why.join('; '));
}
export const tierOfVerdict = (v) => v === 'PROVEN' ? 'proven' : v === 'TRADABLE SMALL' ? 'small' : null;

// ---- OPT-FOLLOW1: an explicit, bullish options call on the named stock (fixed 23 Oct 2026, before any run) -----------------------
export const FUND_SYMS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'VXX', 'VIX', 'SPX', 'NDX', 'DJI', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'USO', 'TLT', 'IBIT', 'SMH', 'ARKK']);
const OPT_WORD = [/\b(calls|call options?|call contracts?|leaps)\b/i, /\$?\d+(\.\d+)?c\b/i, /\$\d+(\.\d+)?\s*calls?\b/i, /\b\d+(\.\d+)?\s*strike\b/i, /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\s+\$?\d+(\.\d+)?\s*c\b/i];
const NOT_OPT = /\b(explained|what is|what are|how to|beginners?|tutorial|course|covered calls?|sell|selling|sold|puts?|margin calls?|conference calls?|earnings calls?|phone calls?|cold calls?|calls? out|calls? for|calls of the day|morning call|close call|wake[- ]up call|0dte)\b/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function isOptionsCall(c) {
  const sym = String(c && c.sym || ''), text = [c && c.tt, c && c.tx].filter(x => typeof x === 'string').join(' ');
  if (!c || c.bull !== 1 || !sym || FUND_SYMS.has(sym)) return false;
  if (!new RegExp('(\\$' + esc(sym) + '\\b|(^|[^A-Za-z0-9$])' + esc(sym) + '(?![A-Za-z0-9]))').test(text)) return false;
  return OPT_WORD.some(re => re.test(text)) && !NOT_OPT.test(text);
}
// ENTRY: the first regular-session open after the post was public (New York time); sessions = sorted 'YYYY-MM-DD'
export function nyParts(ms) { const o = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).forEach(p => o[p.type] = p.value);
  return { d: o.year + '-' + o.month + '-' + o.day, min: +o.hour * 60 + +o.minute }; }
export function entrySession(pubIso, sessions) { const ms = Date.parse(pubIso); if (!isFinite(ms)) return null; const n = nyParts(ms);
  const i = sessions.findIndex(d => d > n.d || (d === n.d && n.min < 570)); return i < 0 ? null : i; }
