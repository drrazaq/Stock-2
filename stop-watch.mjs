// LIVE STOP WATCH (23 Oct 2026). The nightly scan saw a broken stop only at the close, and the owner then sold days later (DOCN: stop
// 120.81 broken on 14 Oct, sold 20 Oct at 100). The live watcher now calls stopHits() every minute with full-market live prices:
// one SELL NOW message when a held stock trades at or under its stop, one NEAR STOP warning within 2% above it. Sent once a day each.
const m2 = (x) => (+x).toFixed(2);
export function stopHits(pos, priceOf, sent) {
  const out = [];
  for (const [sym, P] of Object.entries(pos || {})) {
    const px = priceOf && priceOf[sym], st = P && P.stop;
    if (!(st > 0) || !(px > 0)) continue;
    const chg = P.entry > 0 ? ' (bought ' + m2(P.entry) + ', ' + (px >= P.entry ? '+' : '') + ((px / P.entry - 1) * 100).toFixed(1) + '%)' : '';
    if (px <= st) { if (sent[sym + '|hit']) continue; sent[sym + '|hit'] = 1;
      out.push({ sym, kind: 'hit', text: 'STOP HIT NOW: ' + sym + ' ' + m2(px) + ' is under your stop ' + m2(st) + chg + '.\nSELL NOW at market (if your broker stop order already filled, you are out).\nThen send:  sold ' + sym + ' PRICE' });
      continue; }
    if (px <= st * 1.02 && !sent[sym + '|near'] && !sent[sym + '|hit']) { sent[sym + '|near'] = 1;
      out.push({ sym, kind: 'near', text: 'NEAR STOP: ' + sym + ' ' + m2(px) + ', only ' + ((px / st - 1) * 100).toFixed(1) + '% above your stop ' + m2(st) + chg + '. Make sure the stop order is placed at your broker.' }); }
  }
  return out;
}
