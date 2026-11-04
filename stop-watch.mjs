// LIVE STOP WATCH (23 Oct 2026; price validity and one wording 4 Nov 2026). The nightly scan saw a broken stop only at the close, and the
// owner then sold days later (DOCN: stop 120.81 broken on 14 Oct, sold 20 Oct at 100). The live watcher calls stopHits() every minute,
// and the bot's market-hours check uses the same evidence rule and the same wording as a fallback.
// (4 Nov) A stop crossing is shown as current ONLY on valid price evidence: a positive trade price whose response is bound to that exact
// ticker, with a provider timestamp that is known, not in the future and at most STOP_MAX_AGE_MIN old. Anything else is a STOP CHECK
// UNKNOWN line (never silently "safe"). Stop levels, holdings and trading rules are read, never changed. The wording respects a broker stop
// order that may already have filled: it never tells the owner to sell a second time.
export const STOP_MAX_AGE_MIN = 5;
const m2 = (x) => (+x).toFixed(2);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Nov 4 10:12 New York": full date and one time zone for every observation time
export function nyStamp(ms) {
  if (!Number.isFinite(ms)) return 'time unknown';
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value);
  return MON[+p.month - 1] + ' ' + (+p.day) + ' ' + p.hour + ':' + p.minute + ' New York';
}
const ageText = (s) => s < 90 ? Math.round(s) + ' s old' : Math.round(s / 60) + ' min old';
// q: { sym, price, t (ms), provider, feed, kind }. Returns OK evidence or UNKNOWN with the exact reason.
export function priceEvidence(sym, q, nowMs = Date.now(), maxAgeMin = STOP_MAX_AGE_MIN) {
  const unk = (why) => ({ state: 'UNKNOWN', why });
  if (!q || typeof q !== 'object') return unk('no live price for this stock');
  if (q.sym !== sym) return unk('the price response is not for this ticker');
  if (!(+q.price > 0)) return unk('no valid price');
  if (q.kind && q.kind !== 'TRADE') return unk('the only price is a ' + String(q.kind).toLowerCase().replace('_', ' ') + ', not a live trade');
  const t = +q.t; if (!(t > 0)) return unk('the price has no source timestamp');
  if (t > nowMs + 60000) return unk('the price timestamp is in the future');
  const ageSec = Math.max(0, (nowMs - t) / 1000);
  if (ageSec > maxAgeMin * 60) return unk('the latest price is ' + ageText(ageSec).replace(' old', '') + ' old (limit ' + maxAgeMin + ' min)');
  const src = String(q.provider || 'unknown source').toUpperCase() + (q.feed ? ' ' + String(q.feed).toUpperCase() : '');
  return { state: 'OK', price: +q.price, t, ageSec, src };
}
const chgOf = (P, px) => P && P.entry > 0 ? ' (bought ' + m2(P.entry) + ', ' + (px >= P.entry ? '+' : '') + ((px / P.entry - 1) * 100).toFixed(1) + '%)' : '';
const seenOf = (ev) => ev.src + ', ' + nyStamp(ev.t) + ', ' + ageText(ev.ageSec);
// one wording for both routes
export function stopText(kind, sym, P, ev) {
  const st = m2(P.stop);
  if (kind === 'hit') return 'STOP LEVEL REACHED: ' + sym + ' traded at or below your stop ' + st + ': last price ' + m2(ev.price) + ' (' + seenOf(ev) + ')' + chgOf(P, ev.price) + '.\n'
    + 'If your broker stop order has filled, you are already out: do not sell again; send  sold ' + sym + ' FILLPRICE  with the fill price.\n'
    + 'If no stop order is working at your broker, decide now whether to sell, then send  sold ' + sym + ' PRICE.';
  if (kind === 'near') return 'NEAR STOP: ' + sym + ' ' + m2(ev.price) + ' is ' + ((ev.price / P.stop - 1) * 100).toFixed(1) + '% above your stop ' + st + ' (' + seenOf(ev) + ')' + chgOf(P, ev.price) + '. Check that your stop order is working at your broker.';
  return 'STOP CHECK UNKNOWN: ' + sym + ': ' + ev.why + '. Whether your stop ' + st + ' was reached cannot be confirmed right now; this is not a sign the position is safe. Check the price and your stop order at your broker.';
}
// quotes: { SYM: q } (q as in priceEvidence). sent: once-a-day memory, one key per stock and kind.
export function stopHits(pos, quotes, sent, nowMs = Date.now(), maxAgeMin = STOP_MAX_AGE_MIN) {
  const out = [];
  for (const [sym, P] of Object.entries(pos || {})) {
    if (!(P && P.stop > 0)) continue;
    const ev = priceEvidence(sym, quotes && quotes[sym], nowMs, maxAgeMin);
    if (ev.state !== 'OK') { if (!sent[sym + '|unknown'] && !sent[sym + '|hit']) { sent[sym + '|unknown'] = 1; out.push({ sym, kind: 'unknown', why: ev.why, text: stopText('unknown', sym, P, ev) }); } continue; }
    if (ev.price <= P.stop) { if (sent[sym + '|hit']) continue; sent[sym + '|hit'] = 1; out.push({ sym, kind: 'hit', price: ev.price, t: ev.t, text: stopText('hit', sym, P, ev) }); continue; }
    if (ev.price <= P.stop * 1.02 && !sent[sym + '|near'] && !sent[sym + '|hit']) { sent[sym + '|near'] = 1; out.push({ sym, kind: 'near', price: ev.price, t: ev.t, text: stopText('near', sym, P, ev) }); }
  }
  return out;
}
// The watcher's delivery record for a stop message (data/watcher-message-state/DAY/sha256(key).json, key 'stop:SYM:KIND').
// Only an ACKNOWLEDGED record counts as delivered; missing, UNSENT or UNCERTAIN never suppresses the bot's fallback.
export function stopMessageKey(sym, kind) { return 'stop:' + sym + ':' + kind; }
