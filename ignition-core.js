// IGNITION RULES: shared by the Saturday minute-bar test (fastmover-lab.mjs MODE=intraday), the live watcher (ignition-watch.mjs)
// and the morning paper scoring. "Ignition" = the moment a stock starts running during the day. Fixed in advance, never tuned.
// Bars are [minute of the New York day, open, high, low, close, volume]; 570 = 9:30, 959 = 15:59. Pre-market bars (240-569) count
// toward the volume traded so far.
export const IG_RULES = [
  { id: 'IG1', name: 'Crosses +10% before 11:00 New York with a normal day’s volume already traded', trig: 0.10, by: 660, rv: 1.0 },
  { id: 'IG2', name: 'Crosses +20% before 11:00 with 1.5x a normal day’s volume', trig: 0.20, by: 660, rv: 1.5 },
  { id: 'IG3', name: 'Crosses +10% before 11:00, normal day’s volume, small float (under 20M shares)', trig: 0.10, by: 660, rv: 1.0, float: 20e6, base: 'IG1' },
  { id: 'IG4', name: 'Crosses +10% before 11:00, normal day’s volume, listed under a year', trig: 0.10, by: 660, rv: 1.0, young: 250, base: 'IG1' },
  { id: 'IG5', name: 'Gap-up 10%+ that breaks its first 5-minute high (opening range breakout)', orb: true, gap: 0.10, by: 720 },
  { id: 'IG6', name: 'Classic low-float runner: crosses +10% before 11:00, under 5 USD, float under 20M, normal day’s volume', trig: 0.10, by: 660, rv: 1.0, float: 20e6, maxPx: 5, base: 'IG1' },
  { id: 'IG9', name: 'First orderly pullback after an early run: crossed +10% before 11:00 with a normal day\u2019s volume, pulled back 4-12% from its high without falling under +6%, then a minute closes above the 3 minutes before it (before 13:00)', pull: true, trig: 0.10, by: 660, rv: 1.0, entryBy: 780 },
  { id: 'IG7', name: 'Micro-float pre-market gapper: gap 15%+, pre-market volume 5x+ a normal day, float under 10M, 1-5 USD, breaks its first 5-minute high', orb: true, gap: 0.15, by: 720, pmRv: 5, float: 10e6, maxPx: 5 },
];
// LIVE-ONLY rules: a fair history test would need minute bars for EVERY stock on EVERY day (the Saturday sample only holds days
// that touched +10%, which would leak the future into a rule that fires earlier). So these are tested FORWARD only, on paper.
export const LIVE_RULES = [
  { id: 'IG8', name: 'Quiet build-up before a run: 15-minute rise of 2-8%, 4 of the last 5 minutes higher, near its recent high (pullback 3% or less), volume pace 1.5x+, not yet 12% above the open', live: true },
  { id: 'IG8T', name: 'Quiet build-up, time-of-day version: same as IG8, but volume must be 1.5x+ what the stock normally trades BY THIS TIME OF DAY (mornings are always busy, so a whole-day comparison flatters them)', live: true },
];
export const EXITS = [
  { id: 'close', name: 'stop 8% (opening-range low for the breakout), sell at the close' },
  { id: 'trail', name: 'same stop, then sell when it falls 10% from its high since the buy, else at the close', trail: 0.10 },
  { id: 'trail5', name: 'same stop, then sell when it falls 5% from its high since the buy, else at the close', trail: 0.05 },
];
export const STOP = 0.08, TRAIL = 0.10, IG_VERSION = 3;   // raise IG_VERSION whenever a rule or exit changes: the Saturday test then re-tests every day
export const costOf = (p) => (p < 5 ? 0.016 : p < 20 ? 0.009 : 0.007) + 0.005;   // + 0.5% for buying into a fast move
const fmtM = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export { fmtM };
// Does the rule fire on this day, and where? meta = { float, age }. Returns { k (index of the trigger bar), m, rv } or null.
// the stock-level filters of a rule (known before the day starts)
export function passes(R, prevC, meta) {
  if (R.maxPx && !(prevC < R.maxPx)) return false;
  if (R.float && !(meta && meta.float > 0 && meta.float < R.float)) return false;
  if (R.young && !(meta && meta.age !== null && meta.age !== undefined && meta.age < R.young)) return false;
  return true;
}
export function trigger(bars, prevC, avgVol, meta, R) {
  if (!(prevC > 0) || !bars.length || !passes(R, prevC, meta)) return null;
  let vol = 0;
  if (R.orb) { const reg = bars.filter(b => b[0] >= 570 && b[0] <= 959); if (!reg.length || reg[0][0] > 571 || !(reg[0][1] / prevC - 1 >= R.gap)) return null;
    if (R.pmRv) { const pm = bars.filter(b => b[0] < 570).reduce((a, b) => a + b[5], 0); if (!(avgVol > 0 && pm / avgVol >= R.pmRv)) return null; }
    let orH = 0, orL = Infinity; for (const b of reg) { if (b[0] > 574) break; orH = Math.max(orH, b[2]); orL = Math.min(orL, b[3]); }
    for (let k = 0; k < bars.length; k++) { const b = bars[k]; if (b[0] < 575 || b[0] > 959) continue; if (b[0] >= R.by) return null; if (b[2] > orH) return { k, m: b[0], orH, orL }; }
    return null; }
  if (R.pull) { let k0 = -1;
    for (let k = 0; k < bars.length; k++) { const b = bars[k]; vol += b[5]; if (b[0] < 570) continue; if (b[0] > 959 || b[0] >= R.by) return null;
      if (b[2] >= prevC * (1 + R.trig)) { if (!(avgVol > 0 && vol / avgVol >= R.rv)) return null; k0 = k; break; } }
    if (k0 < 0) return null; let hi = bars[k0][2], low = Infinity, pulled = false;
    for (let j = k0 + 1; j < bars.length; j++) { const b = bars[j]; if (b[0] >= R.entryBy || b[0] > 959) return null;
      if (!pulled) { if (b[2] > hi) hi = b[2]; if (b[3] <= hi * 0.96) { pulled = true; low = b[3]; } }
      else { low = Math.min(low, b[3]); const prev3 = Math.max(bars[j - 1][2], bars[j - 2] ? bars[j - 2][2] : 0, bars[j - 3] ? bars[j - 3][2] : 0); if (b[4] > prev3 && b[4] > low) return { k: j, m: b[0], stop: low, hi }; }
      if (b[3] < prevC * 1.06 || b[3] < hi * 0.88) return null; }
    return null; }
  for (let k = 0; k < bars.length; k++) { const b = bars[k]; vol += b[5]; if (b[0] < 570) continue; if (b[0] > 959 || b[0] >= R.by) return null;
    if (b[2] >= prevC * (1 + R.trig)) { const rv = avgVol > 0 ? vol / avgVol : null; return rv !== null && rv >= R.rv ? { k, m: b[0], rv } : null; } }
  return null;
}
// The trade after a trigger. Conservative: bought at the NEXT minute's open (the breakout buys at the range high or the bar's open
// if it jumped past it); the stop is checked before anything else in every minute, gaps through it fill at the open.
export function simulate(bars, prevC, tr, R, X) {
  let i, e, stop;
  if (R.orb) { i = tr.k; e = Math.max(tr.orH, bars[i][1]); stop = tr.orL; if (!(e > stop) || (e - stop) / e > 0.15) return null; }
  else { i = tr.k + 1; if (!bars[i] || bars[i][0] > 959) return null; e = bars[i][1]; stop = R.pull && tr.stop ? Math.max(tr.stop * 0.995, e * 0.88) : e * (1 - STOP); if (!(e > stop)) return null; }
  let hi = e, best = e;
  for (let j = i; j < bars.length && bars[j][0] <= 959; j++) { const b = bars[j];
    if (j > i && b[1] <= stop) return { e, x: b[1], g: b[1] / e - 1, best: best / e - 1, m: b[0], why: 'stop' };
    if (b[3] <= stop) return { e, x: stop, g: stop / e - 1, best: Math.max(best, b[2]) / e - 1, m: b[0], why: 'stop' };
    if (X.trail && hi > e) { const lv = hi * (1 - X.trail); if (lv > stop) { if (j > i && b[1] <= lv) return { e, x: b[1], g: b[1] / e - 1, best: best / e - 1, m: b[0], why: 'trail' }; if (b[3] <= lv) return { e, x: lv, g: lv / e - 1, best: Math.max(best, b[2]) / e - 1, m: b[0], why: 'trail' }; } }
    hi = Math.max(hi, b[2]); best = Math.max(best, b[2]); }
  const last = bars.filter(b => b[0] <= 959).pop(); if (!last) return null;
  return { e, x: last[4], g: last[4] / e - 1, best: best / e - 1, m: last[0], why: 'close' };
}
// minute bars from the Massive/Polygon aggregates answer -> [m, o, h, l, c, v], New York time, 4:00-15:59
export function toBars(results, day) {
  const off = nyOffset(day); const out = [];
  for (const r of results || []) { const m = Math.floor(((r.t / 60000) + off) % 1440 + 1440) % 1440; if (m < 240 || m > 959) continue; out.push([m, +(+r.o).toPrecision(6), +(+r.h).toPrecision(6), +(+r.l).toPrecision(6), +(+r.c).toPrecision(6), Math.round(r.v || 0)]); }
  return out.sort((a, b) => a[0] - b[0]);
}
export function nyOffset(day) {   // minutes to add to UTC to get New York time on that day (-240 in summer, -300 in winter)
  const ms = Date.parse(day + 'T16:00:00Z'), p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value);
  return (+p.hour * 60 + +p.minute) - 16 * 60;
}
