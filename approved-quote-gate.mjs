// A last-trade price alone is not enough to authorize a live BUY message.
// These are provisional execution safety thresholds, not validated profit targets.
export function approvedQuoteGate({price,bid,ask,quoteAgeSec}) {
  if (![price,bid,ask,quoteAgeSec].every(x=>typeof x==='number'&&Number.isFinite(x))) return {ok:false,reason:'QUOTE_UNKNOWN'};
  if (price<1 || bid<=0 || ask<=0 || ask<bid) return {ok:false,reason:'QUOTE_INVALID'};
  if (quoteAgeSec<0 || quoteAgeSec>120) return {ok:false,reason:'QUOTE_STALE'};
  const spread=(ask-bid)/((ask+bid)/2);
  const limit=price<5 ? 0.03 : 0.02;
  if (spread>limit) return {ok:false,reason:'SPREAD_TOO_WIDE',spreadPct:spread,limitPct:limit};
  return {ok:true,spreadPct:spread,limitPct:limit};
}
