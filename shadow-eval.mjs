// SHADOW EVALUATION (owner, 28 Oct 2026, Phase 1). Pure functions: turns the candidate stream (shadow-stream.mjs, data/shadow/DAY.jsonl.gz)
// and the daily outcomes (shadow-outcomes.mjs, data/shadow-outcomes/DAY.json.gz) into the soft-filter test. PRE-REGISTERED here on
// 28 Oct 2026, before any shadow row existed; changing a number below is a new test, not a correction.
// EXECUTION (never last-trade fills):
//   entry = the ASK at the entry minute when the quote is 120 s old or less and the spread is under 10%; otherwise the last price plus an
//           assumed half spread (0.5% under 5 USD, 0.15% above) and the trade is flagged 'assumedSpread'. Delay test: the next minute's price.
//   exit  = the horizon's price minus half the entry spread (the bid side is not recorded at the close: an estimate, said so).
//   fees  = 3 USD + 3 USD on 1,000 USD (0.6%).
//   SPREAD IS COUNTED ONCE (checked 28 Oct, owner item 6): relative spread s = (ask - bid) / mid. Buying at the ASK already pays s/2 over the
//   mid; selling pays the other s/2. So an ask entry subtracts only the exit half; a last-trade entry (about mid, side unknown) adds s/2 on
//   entry AND subtracts s/2 on exit. A recorded quote is NOT a guaranteed fill: 'stress' adds slippage of 0.5% each way under 5 USD
//   (0.1% above) on top, and 'dayDelayed' enters one minute later. Both are reported next to the base figure, never instead of it.
// HORIZONS: 30 minutes, the same day's close, 1, 5 and 10 sessions later (closes from daily bars); 5-session best high / worst low as
// excursions (reported, never used as returns: touching +2% is not capturing it).
// FILTER TEST: for each soft gate g, the candidates that pass 'no_g' but NOT 'base' are exactly the ones g rejects. Their outcomes say
// whether g removes losers (keep it) or removes winners (question it). Judged on ALL of them, median and without the 2 best, after costs.
// Verdict needs 10+ sessions and 30+ rejected candidates; before that it says COLLECTING.
export const FEE = 0.006, MAX_Q_AGE = 120, MAX_SPREAD = 0.10;
export const assumedHalf = (px) => (px < 5 ? 0.005 : 0.0015);
export const slip = (px) => (px < 5 ? 0.005 : 0.001);
export const GATES = ['window', 'chgMin', 'chgMax', 'score', 'dollarVol'];
const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : +x.toFixed(4));
export function entryOf(e, delayed = false) {
  if (!e || !Number.isFinite(e.px) || !(e.px > 0)) return null;
  const spr = Number.isFinite(e.bid) && Number.isFinite(e.ask) && e.bid > 0 && e.ask >= e.bid ? (e.ask - e.bid) / (e.ask / 2 + e.bid / 2) : null, fresh = spr !== null && Number.isFinite(e.qAgeSec) && e.qAgeSec >= 0 && e.qAgeSec <= MAX_Q_AGE && spr < MAX_SPREAD;
  const half = +(fresh ? spr / 2 : assumedHalf(e.px)).toFixed(6), base = delayed ? e.next : (fresh ? null : e.px);
  if (delayed && (!Number.isFinite(base) || !(base > 0))) return null;
  return { price: delayed ? base * (1 + half) : fresh ? e.ask : e.px * (1 + half), half, assumedSpread: !fresh };
}
export const netStress = (en, exitPx) => (en && exitPx > 0 ? r4(exitPx * (1 - en.half - slip(en.price)) / (en.price * (1 + slip(en.price))) - 1 - FEE) : null);
export const netExit = (en, exitPx) => (en && exitPx > 0 ? r4(exitPx * (1 - en.half) / en.price - 1 - FEE) : null);
// one candidate entry (a variant or a rule trigger) -> net results per horizon; o = daily outcome for the stock { c0, c1, c5, c10, h5, l5 }
export function score(e, o = {}, row = {}) {
  const en = entryOf(e), ed = entryOf(e, true);
  return { assumedSpread: en ? en.assumedSpread : null, m30: netExit(en, e.px30), day: netExit(en, o.c0 > 0 ? o.c0 : row.last), d1: netExit(en, o.c1), d5: netExit(en, o.c5), d10: netExit(en, o.c10),
    dayDelayed: netExit(ed, o.c0 > 0 ? o.c0 : row.last), dayStress: netStress(en, o.c0 > 0 ? o.c0 : row.last), d5Stress: netStress(en, o.c5), mfe5: en && o.h5 > 0 ? r4(o.h5 / en.price - 1) : null, mae5: en && o.l5 > 0 ? r4(o.l5 / en.price - 1) : null };
}
export function stats(vals) {
  const v = vals.filter(x => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => b - a), n = v.length;
  if (!n) return { n: 0 };
  const sum = v.reduce((a, b) => a + b, 0), wins = v.filter(x => x > 0), losses = v.filter(x => x <= 0);
  return { n, avg: r4(sum / n), median: r4(v[Math.floor(n / 2)]), win: r4(wins.length / n), hit2: r4(v.filter(x => x >= 0.02).length / n), worst: r4(v[n - 1]),
    noTop2: n > 2 ? r4(v.slice(2).reduce((a, b) => a + b, 0) / (n - 2)) : null, pf: losses.length ? r4(wins.reduce((a, b) => a + b, 0) / -losses.reduce((a, b) => a + b, 0)) : null };
}
// rows: shadow rows (all days); outcomes: { 'DAY|SYM': {c0, c1, c5, c10, h5, l5} }; only hard-eligible rows (1 USD+, not NOT HALAL, not AVOID)
export const eligible = (r) => r.hard && !r.hard.under1 && !r.hard.halalFail && !(r.hard.lottery >= 0.15);
export function filterTable(rows, outcomes = {}, horizon = 'day') {
  const el = rows.filter(eligible), out = { sessions: new Set(el.map(r => r.d)).size, candidates: el.length, base: null, gates: {} };
  const sc = (r, v) => score(r.v[v], outcomes[r.d + '|' + r.sym] || {}, r)[horizon];
  out.base = stats(el.filter(r => r.v.base).map(r => sc(r, 'base')));
  for (const g of GATES) { const rej = el.filter(r => r.v['no_' + g] && !r.v.base), s = stats(rej.map(r => sc(r, 'no_' + g)));
    out.gates[g] = { rejected: rej.length, ...s, verdict: out.sessions < 10 || s.n < 30 ? 'COLLECTING' : s.avg > 0 && s.median > 0 && s.noTop2 > 0 ? 'REJECTS WINNERS: question this gate' : 'REJECTS LOSERS OR NOISE: keep' }; }
  return out;
}
