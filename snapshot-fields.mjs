// Each field keeps its own provider clock. Missing clocks remain unknown (0).
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const number = x => positive(x) ? x : 0;
const isoTime = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) ? Date.parse(x) : 0;
const nsTime = x => positive(x) ? x / 1e6 : 0;
export function massiveSnapshot(x) {
  const lt=x.lastTrade||{}, mn=x.min||{}, dy=x.day||{}, pd=x.prevDay||{}, q=x.lastQuote||{};
  const trade=positive(lt.p), minute=!trade&&positive(mn.c), minuteVolume=positive(mn.av);
  return {sym:x.ticker,price:trade?lt.p:minute?mn.c:number(dy.c),
    t:trade?nsTime(lt.t):minute?number(mn.t):number(dy.t),
    prevC:number(pd.c),prevV:number(pd.v),open:number(dy.o),hi:number(dy.h),lo:number(dy.l),
    vol:minuteVolume?mn.av:number(dy.v),vt:minuteVolume?number(mn.t):number(dy.t),
    bid:number(q.p),ask:number(q.P),qt:nsTime(q.t)};
}
export function alpacaSnapshot(symbol,x={},sip=false) {
  const lt=x.latestTrade||{}, db=x.dailyBar||{}, pb=x.prevDailyBar||{}, q=x.latestQuote||{};
  const trade=positive(lt.p), volume=sip&&positive(db.v);
  return {sym:symbol,price:trade?lt.p:number(db.c),t:trade?isoTime(lt.t):isoTime(db.t),
    prevC:number(pb.c),open:number(db.o),vol:volume?db.v:null,vt:volume?isoTime(db.t):0,
    bid:number(q.bp),ask:number(q.ap),qt:isoTime(q.t)};
}
export function mergeLiveSnapshot(row, live, nowMs = Date.now()) {
  if (!live) return false;
  let refreshed=false;
  if (positive(live.price) && positive(live.t) && live.t <= nowMs &&
      (live.t > row.t || row.t > nowMs || !positive(row.t))) {
    row.price=live.price;row.t=live.t;refreshed=true;
    if (live.open > 0) row.open=live.open;
  }
  // An updated trade is no evidence that the aggregate volume has advanced.
  if (positive(live.vol) && live.vt > (row.vt||0)) {row.vol=live.vol;row.vt=live.vt;}
  if (live.ask > 0 && live.qt >= (row.qt||0)) {row.bid=live.bid;row.ask=live.ask;row.qt=live.qt;}
  return refreshed;
}
