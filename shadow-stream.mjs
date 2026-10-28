// SHADOW CANDIDATE STREAM (owner, 28 Oct 2026, Phase 1: "shadow-test every soft filter against winners and losers"; "record bid/ask").
// Research recording only: nothing here sends a message, changes an alert or a rule. One row per stock per day from the first minute it
// became a CANDIDATE (an early-wave observation, or any intraday rule trigger including the ones held back for low volume / after 11:00),
// whatever happened to it later - winners, losers and stocks that never ran are all kept, so no study is selected on outcomes.
// For the research-lead trigger EW-ALERT-1 (early-alerts.mjs LEAD) each row also keeps the FIRST minute the trigger was met with ALL its soft
// gates ('base') and with each soft gate removed in turn ('no_window', 'no_chgMin', 'no_chgMax', 'no_score', 'no_dollarVol'), with the
// price, the bid/ask at that minute, the next minute's price (one minute of alert delay), the price 30 minutes later and the highest /
// lowest price after it. That is what a filter ablation needs: same candidates, same timestamps, one gate changed. Limits: the early-wave
// lane only covers +2% to +15%, so 'no_chgMax' is measured up to +15%; hard rules (under 1 USD, NOT HALAL, AVOID list) are recorded as
// flags, never relaxed. The daily outcomes (1, 5, 10 sessions; 5-session high and low) are added after the close by shadow-outcomes.mjs.
import { LEAD } from './early-alerts.mjs';

export const VARIANTS = ['base', 'no_window', 'no_chgMin', 'no_chgMax', 'no_score', 'no_dollarVol'];
// c: { m, chg, score, dollarVol, live } -> does the EW-ALERT-1 trigger pass with one gate switched off?
export function variantPass(v, c) {
  if (!c.live) return false;
  const win = c.m >= LEAD.from && c.m <= LEAD.to, lo = c.chg >= LEAD.chgMin, hi = c.chg <= LEAD.chgMax, sc = c.score >= LEAD.minScore, dv = c.dollarVol >= LEAD.minDollarVol;
  return (v === 'no_window' || win) && (v === 'no_chgMin' || lo) && (v === 'no_chgMax' || hi) && (v === 'no_score' || sc) && (v === 'no_dollarVol' || dv);
}
const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : +(+x).toFixed(4));
export const spreadPct = (bid, ask) => (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid ? r4((ask - bid) / (ask / 2 + bid / 2)) : null);

export function createShadow({ day }) {
  const book = new Map();   // sym -> row
  const entry = (q) => ({ m: q.m, px: r4(q.price), bid: q.bid > 0 ? r4(q.bid) : null, ask: q.ask > 0 ? r4(q.ask) : null, qAgeSec: q.qAgeSec === null || q.qAgeSec === undefined ? null : Math.round(q.qAgeSec), next: null, px30: null, hi: r4(q.price), lo: r4(q.price) });
  const tickEntry = (e, q) => { if (q.m === e.m + 1 && e.next === null) e.next = r4(q.price); if (q.m >= e.m + 30 && e.px30 === null) e.px30 = r4(q.price); if (q.m > e.m) { e.hi = Math.max(e.hi, r4(q.price)); e.lo = Math.min(e.lo, r4(q.price)); } };
  return {
    book,
    // every minute, every stock with a fresh price that is already in the book: follow its entries (cheap: a map lookup)
    tick(q) { const row = book.get(q.sym); if (!row || !q.live || !(q.price > 0)) return; row.last = r4(q.price); row.lastM = q.m; for (const e of Object.values(row.v)) tickEntry(e, q); for (const t of row.ig) tickEntry(t, q); },
    // an early-wave observation this minute (ewc from early-wave-discovery.mjs); q: { sym, m, price, chg, score, rv, rvT, dollarVol, live, bid, ask, qAgeSec, fc, hard: {...} }
    early(q) { let row = book.get(q.sym);
      if (!row) { row = { d: day, sym: q.sym, src: 'early', m0: q.m, px0: r4(q.price), chg0: r4(q.chg), score0: q.score, rv0: r4(q.rv), rvT0: r4(q.rvT), dv0: Math.round(q.dollarVol || 0), firstSeenChg: r4(q.fc), spr0: spreadPct(q.bid, q.ask), hard: q.hard, v: {}, ig: [], last: r4(q.price), lastM: q.m }; book.set(q.sym, row); }
      else if (!/early/.test(row.src)) row.src += '+early';
      for (const v of VARIANTS) if (!row.v[v] && variantPass(v, q)) row.v[v] = entry(q); },
    // an intraday rule trigger (t from ignition-watch.mjs, including the ones held back: t.logged = 'volume too low' ...)
    trigger(t, q) { let row = book.get(t.sym);
      if (!row) { row = { d: day, sym: t.sym, src: 'ig', m0: t.m, px0: r4(t.price), chg0: r4(t.price / t.prevC - 1), score0: null, rv0: r4(t.rv), rvT0: r4(t.rvT), dv0: Math.round(q.dollarVol || 0), firstSeenChg: r4(q.fc), spr0: spreadPct(q.bid, q.ask), hard: q.hard, v: {}, ig: [], last: r4(t.price), lastM: t.m }; book.set(t.sym, row); }
      if (!row.ig.some(x => x.rule === t.rule)) row.ig.push({ rule: t.rule, held: t.logged || null, ...entry({ ...q, m: t.m, price: t.price }) }); },
    // (28 Oct, owner items 2-3) D: a fresh 8-K / 6-K from the SEC live feed, decided at the first live minute after acceptance (rank-models.mjs
    // dEligible gives f.eligible / f.why); every decided filing keeps an entry, eligible or not, so already-moved filers are measured too
    filing(q) { let row = book.get(q.sym);
      if (!row) { row = { d: day, sym: q.sym, src: 'filing', m0: q.m, px0: r4(q.price), chg0: r4(q.chg), score0: null, rv0: null, rvT0: null, dv0: Math.round(q.prevDollarVol || 0), firstSeenChg: r4(q.fc), spr0: spreadPct(q.bid, q.ask), hard: q.hard, v: {}, ig: [], last: r4(q.price), lastM: q.m }; book.set(q.sym, row); }
      else if (!/filing/.test(row.src)) row.src += '+filing';
      if (row.f) return; row.f = q.f; row.v.D = entry(q); },
    // R0: the no-information control (9:45 New York, liquid stocks that have not moved), same entry rules
    control(q) { let row = book.get(q.sym);
      if (!row) { row = { d: day, sym: q.sym, src: 'control', m0: q.m, px0: r4(q.price), chg0: r4(q.chg), score0: null, rv0: null, rvT0: null, dv0: Math.round(q.prevDollarVol || 0), firstSeenChg: r4(q.fc), spr0: spreadPct(q.bid, q.ask), hard: q.hard, v: {}, ig: [], last: r4(q.price), lastM: q.m }; book.set(q.sym, row); }
      else if (!/control/.test(row.src)) row.src += '+control';
      if (!row.v.R0) row.v.R0 = entry(q); },
    rows() { return [...book.values()]; },
  };
}
