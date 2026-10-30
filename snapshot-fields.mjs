// Each field keeps its own provider clock. Missing clocks remain unknown (0).
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const number = x => positive(x) ? x : 0;
const isoTime = x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x)) ? Date.parse(x) : 0;
const nsTime = x => positive(x) ? x / 1e6 : 0;
export function massiveSnapshot(x) {
  const lt=x.lastTrade||{}, mn=x.min||{}, dy=x.day||{}, pd=x.prevDay||{}, q=x.lastQuote||{};
  const trade=positive(lt.p), minute=!trade&&positive(mn.c), minuteVolume=positive(mn.av);
  return {sym:x.ticker,price:trade?lt.p:minute?mn.c:number(dy.c),
    t:trade?nsTime(lt.t):minute?number(mn.t):number(dy.t),
    prevC:number(pd.c),prevV:number(pd.v),open:number(dy.o),hi:number(dy.h),lo:number(dy.l),
    vol:minuteVolume?mn.av:number(dy.v),vt:minuteVolume?number(mn.t):number(dy.t),
    bid:number(q.p),ask:number(q.P),qt:nsTime(q.t),
    priceProvider:'MASSIVE',priceKind:trade?'TRADE':minute?'MINUTE_BAR':'DAILY_BAR',
    quoteProvider:'MASSIVE',quoteFeed:'PLAN_DEPENDENT',volumeProvider:'MASSIVE'};
}
export function alpacaSnapshot(symbol,x={},sip=false) {
  const lt=x.latestTrade||{}, db=x.dailyBar||{}, pb=x.prevDailyBar||{}, q=x.latestQuote||{};
  const trade=positive(lt.p), volume=sip&&positive(db.v);
  return {sym:symbol,price:trade?lt.p:number(db.c),t:trade?isoTime(lt.t):isoTime(db.t),
    prevC:number(pb.c),open:number(db.o),vol:volume?db.v:null,vt:volume?isoTime(db.t):0,
    bid:number(q.bp),ask:number(q.ap),qt:isoTime(q.t),
    priceProvider:'ALPACA',priceFeed:sip?'sip':'iex',priceKind:trade?'TRADE':'DAILY_BAR',
    quoteProvider:'ALPACA',quoteFeed:sip?'sip':'iex',volumeProvider:volume?'ALPACA':null,volumeFeed:volume?'sip':null};
}
export function mergeLiveSnapshot(row, live, nowMs = Date.now()) {
  if (!live) return false;
  let refreshed=false;
  if (positive(live.price) && positive(live.t) && live.t <= nowMs &&
      (live.t > row.t || row.t > nowMs || !positive(row.t))) {
    row.price=live.price;row.t=live.t;refreshed=true;
    if (positive(live.open)) row.open=live.open;
    row.priceProvider=live.priceProvider||'UNKNOWN';row.priceFeed=live.priceFeed||null;row.priceKind=live.priceKind||'UNKNOWN';
  }
  // An updated trade is no evidence that the aggregate volume has advanced.
  if (positive(live.vol) && positive(live.vt) && live.vt<=nowMs &&
      (live.vt>row.vt || row.vt>nowMs || !positive(row.vt))) {
    row.vol=live.vol;row.vt=live.vt;row.volumeProvider=live.volumeProvider||'UNKNOWN';row.volumeFeed=live.volumeFeed||null;
  }
  // A future clock must not pin either BBO or volume against later real data.
  // Equal-clock conflicts are not resolved by choosing the last arriving quote.
  if (positive(live.bid) && positive(live.ask) && live.ask>=live.bid && positive(live.qt) && live.qt<=nowMs &&
      (live.qt>row.qt || row.qt>nowMs || !positive(row.qt))) {
    row.bid=live.bid;row.ask=live.ask;row.qt=live.qt;row.quoteProvider=live.quoteProvider||'UNKNOWN';row.quoteFeed=live.quoteFeed||null;
  }
  return refreshed;
}
