// PRE-IGNITION: forward-testable, observation-only candidates BEFORE a +2% day move.
// This is NOT a proven breakout predictor, trade recommendation or BUY alert.
export function detectPreIgnition({change,rvT,price,live,dollarVol,minute}) {
  if (!live || !Number.isFinite(price) || price <= 0 || !Number.isFinite(change) || change < -0.02 || change > 0.02) return null;
  if (!Number.isFinite(rvT) || rvT < 1.8 || !Number.isFinite(dollarVol) || dollarVol < 250_000) return null;
  if (!Number.isInteger(minute) || minute < 570 || minute > 690) return null;
  // Deliberately record sub-$1 names for research without authorizing orders.
  return {score:Math.min(100,Math.round(40+Math.min(rvT,5)*8+Math.min(dollarVol/1e6,3)*5)),
    price,change:+change.toFixed(5),rvT:+rvT.toFixed(2),dollarVol:Math.round(dollarVol),minute,under1:price<1};
}
export function recordPreIgnition(book,sym,signal,minute,price) {
  const row=book[sym];
  if (row && Number.isFinite(price) && price>0) {row.lastPrice=price;row.highPrice=Math.max(row.highPrice,price);row.lowPrice=Math.min(row.lowPrice,price);row.lastMinute=minute;}
  if (!signal || row) return;
  book[sym]={sym,firstMinute:minute,firstPrice:signal.price,lastMinute:minute,lastPrice:signal.price,highPrice:signal.price,lowPrice:signal.price,
    score:signal.score,firstChange:signal.change,rvT:signal.rvT,dollarVol:signal.dollarVol,under1:signal.under1};
}
export function finishPreIgnition(book) {
  return Object.values(book).map(x=>({...x,bestAfter:+(x.highPrice/x.firstPrice-1).toFixed(5),worstAfter:+(x.lowPrice/x.firstPrice-1).toFixed(5),lastAfter:+(x.lastPrice/x.firstPrice-1).toFixed(5)})).sort((a,b)=>b.score-a.score);
}
