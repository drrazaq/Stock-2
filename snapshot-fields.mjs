// Each field keeps its own provider clock. Missing clocks remain unknown (0).
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const number = x => positive(x) ? x : 0;
const isoTime = x => {
 // Date.parse normalizes impossible days (for example February30) into another session.
 if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(x))return 0;
 const day=new Date(x.slice(0,10)+'T00:00:00Z'),ms=Date.parse(x);
 return Number.isFinite(+day)&&day.toISOString().slice(0,10)===x.slice(0,10)&&Number.isFinite(ms)?ms:0;
};
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
    quoteProvider:'MASSIVE',quoteFeed:'PLAN_DEPENDENT',quoteBidSizeRaw:q.s??null,quoteAskSizeRaw:q.S??null,quoteSizeUnit:'UNKNOWN',volumeProvider:'MASSIVE'};
}
// Alpaca snapshot volume contract (official docs, read 1 Nov 2026):
//  - Snapshot reference (docs.alpaca.markets/us/reference/stocksnapshotsingle): "A snapshot provides the latest trade, latest quote,
//    latest minute bar, current daily bar and previous daily bar"; each t is "Timestamp in RFC-3339 format" (example dailyBar t 04:00Z).
//  - Market Data FAQ "How are bars aggregated?": a daily bar holds the day's trades, truncated "to the day (in New York)"; a bar's
//    timestamp is "the left side of the interval".
// So dailyBar.t is the SESSION START, not an as-of time, and the REST snapshot states no as-of time for the cumulative daily volume.
// The minute-bar start is a separate observation, not proof of when the daily total was computed. (The websocket page's "daily bars
// contain all trades until the time they were emitted" describes the stream, not this REST snapshot.)
// Observed: volumeSessionStart (dailyBar.t), volumeMinuteBarStart (minuteBar.t). Derived: none. vt stays 0 (as-of unknown) and the
// volume is labelled SIP_DAILY_BAR_ASOF_UNSTATED, never "live". It is rejected when it contradicts itself or is not today's session.
const NY_DAY = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const nyDay = ms => NY_DAY.format(new Date(ms));
export function sipDailyVolume(x = {}, nowMs = Date.now()) {
  const db = x.dailyBar || {}, mb = x.minuteBar || {};
  if (!positive(db.v)) return {ok:false, reason:'NO_DAILY_VOLUME'};
  const session = isoTime(db.t), minute = isoTime(mb.t);
  if (!session) return {ok:false, reason:'NO_SESSION_TIMESTAMP'};
  if (session > nowMs) return {ok:false, reason:'FUTURE_SESSION'};
  if (nyDay(session) !== nyDay(nowMs)) return {ok:false, reason:'NOT_TODAYS_SESSION'};
  if (minute) {
    if (minute > nowMs) return {ok:false, reason:'FUTURE_MINUTE_BAR'};
    if (nyDay(minute) !== nyDay(session)) return {ok:false, reason:'MINUTE_BAR_OTHER_SESSION'};
    if (positive(mb.v) && db.v < mb.v) return {ok:false, reason:'DAILY_BELOW_MINUTE_BAR'};
  }
  return {ok:true, vol:db.v, session, minute};
}
export function alpacaSnapshot(symbol,x={},sip=false,nowMs=Date.now()) {
  const lt=x.latestTrade||{}, db=x.dailyBar||{}, pb=x.prevDailyBar||{}, q=x.latestQuote||{};
  const trade=positive(lt.p), dv=sip?sipDailyVolume(x,nowMs):{ok:false,reason:'NOT_SIP'};
  return {sym:symbol,price:trade?lt.p:number(db.c),t:trade?isoTime(lt.t):isoTime(db.t),
    prevC:number(pb.c),open:number(db.o),vol:dv.ok?dv.vol:null,vt:0,
    volumeAsOf:null,volumeBasis:dv.ok?'SIP_DAILY_BAR_ASOF_UNSTATED':null,volumeSessionStart:dv.ok?dv.session:0,volumeMinuteBarStart:dv.ok?dv.minute||0:0,
    volumeRejected:dv.ok?null:dv.reason,
    bid:number(q.bp),ask:number(q.ap),qt:isoTime(q.t),
    priceProvider:'ALPACA',priceFeed:sip?'sip':'iex',priceKind:trade?'TRADE':'DAILY_BAR',
    quoteProvider:'ALPACA',quoteFeed:sip?'sip':'iex',quoteBidSizeRaw:q.bs??null,quoteAskSizeRaw:q.as??null,quoteSizeUnit:isoTime(q.t)>=Date.parse('2025-11-03T00:00:00-05:00')?'SHARES':'ROUND_LOTS_OR_UNKNOWN',volumeProvider:dv.ok?'ALPACA':null,volumeFeed:dv.ok?'sip':null};
}
// Per-field clock validation for rows that are used without a merge (top-50 fallback): a future or missing clock never vouches for its value.
export function validateClocks(row, nowMs = Date.now()) {
  if (!row) return row;
  if (positive(row.t) && row.t > nowMs) { row.t = 0; row.priceClockRejected = 'FUTURE'; }
  if (positive(row.vt) && row.vt > nowMs) { row.vol = null; row.vt = 0; row.volumeRejected = 'FUTURE_VOLUME_CLOCK'; row.volumeProvider = null; row.volumeFeed = null; }
  if (positive(row.qt) && row.qt > nowMs) { row.bid = 0; row.ask = 0; row.qt = 0; }
  return row;
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
  } else if (positive(live.vol) && live.volumeBasis==='SIP_DAILY_BAR_ASOF_UNSTATED') {
    // No as-of time: used only when consistent with any earlier clocked cumulative count for the session (a cumulative total
    // cannot be below an earlier observation). vt becomes 0: the age of this figure is unknown, so it is never "live".
    const earlier = positive(row.vol) && positive(row.vt) && row.vt<=nowMs ? row.vol : 0;
    if (live.vol >= earlier) { row.vol=live.vol;row.vt=0;row.volumeAsOf=null;row.volumeBasis=live.volumeBasis;row.volumeSessionStart=live.volumeSessionStart;row.volumeMinuteBarStart=live.volumeMinuteBarStart;row.volumeProvider=live.volumeProvider;row.volumeFeed=live.volumeFeed; }
    else row.volumeRejected='SIP_DAILY_BELOW_EARLIER_CLOCKED_COUNT';
  }
  // A future clock must not pin either BBO or volume against later real data.
  // Equal-clock conflicts are not resolved by choosing the last arriving quote.
  if (positive(live.bid) && positive(live.ask) && live.ask>=live.bid && positive(live.qt) && live.qt<=nowMs &&
      (live.qt>row.qt || row.qt>nowMs || !positive(row.qt))) {
    row.bid=live.bid;row.ask=live.ask;row.qt=live.qt;row.quoteProvider=live.quoteProvider||'UNKNOWN';row.quoteFeed=live.quoteFeed||null;row.quoteBidSizeRaw=live.quoteBidSizeRaw??null;row.quoteAskSizeRaw=live.quoteAskSizeRaw??null;row.quoteSizeUnit=live.quoteSizeUnit||'UNKNOWN';
  }
  return refreshed;
}
