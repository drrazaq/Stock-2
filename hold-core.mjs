// HOLD LAB CORE (23 Oct 2026; hold-lab.mjs uses it). Pure functions, no network, no files.
// The owner's question: "a loss is sometimes caused by a pandemic or inflation; many traders hold and do not sell, later they sell with
// a win or the gap closes. Test holding, not selling, opening new trades and waiting for the stock to come up again, and correcting the
// average with time (averaging down)." These functions are the exact rules pre-registered in data/strategy-library.json (HOLD-*).
//
// A PRICE SERIES is { o(k), c(k), last, T }: open and close of session k (NaN / undefined = no price that session), `last` = the last
// session with a close, T = the number of sessions in the data. A stock that has no close in its last GONE_AFTER+1 sessions of the data
// has VANISHED (delisted, bought out, merged or renamed). If its last close was under DEAD_UNDER (3 USD: it had collapsed before it
// went) it is DEAD: the remaining value is lost (-100%). Otherwise it is paid out at its last close (a buyout or a ticker change).
// Buys and sells at the open of a session; every exit triggered by a close happens at the NEXT open (no perfect fills), except on the
// last allowed session, which sells at its close.
import { halfStat, judge, r4 } from './value-core.mjs';
export { halfStat, r4 };
export const COST = 0.008, STRESS = 0.012, DEAD_UNDER = 3, GONE_AFTER = 5, YEAR = 252;
const EPS = 1e-9, ge = (a, b) => a >= b * (1 - EPS), le = (a, b) => a <= b * (1 + EPS);
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function series(o, c, T = c.length) { let last = -1; for (let k = 0; k < T; k++) if (c[k] > 0) last = k; return { o: (k) => o[k], c: (k) => c[k], last, T }; }
export const vanished = (s) => s.last >= 0 && s.last < s.T - 1 - GONE_AFTER;
export const isDead = (s) => vanished(s) && s.c(s.last) < DEAD_UNDER;
// the value of one share at the close of session k (the latest close at or before k; 0 after a dead stock vanished)
export function markAt(s, k) { if (vanished(s) && k > s.last) return isDead(s) ? 0 : s.c(s.last); for (let q = Math.min(k, s.T - 1); q >= 0; q--) { const z = s.c(q); if (z > 0) return z; } return null; }

// GET EVEN (H-GETEVEN): buy at the open of session te; no stop; sell at the next open after the first close >= buy x (1 + target);
// else sell at the close of session te + maxH - 1. Optional stop (the yardstick: the system's 35% disaster stop): sell at the next open
// after a close <= buy x (1 - stop). A window that runs past the data is not judged (null).
// Returns { kind: target|stop|max|dead|gone, x: exit session, at: 'o'|'c', g: gross return, worst: worst close vs the buy, days }.
export function getEven(s, te, { target = 0.05, maxH = 252, stop = null } = {}) {
  const e = s.o(te); if (!(e > 0)) return null; const last = te + maxH - 1; if (last > s.T - 1) return null;
  let worst = 0; const out = (kind, x, at, p) => ({ kind, x, at, g: p / e - 1, worst: Math.min(worst, p / e - 1), days: x - te + 1 });
  const hit = (kind, k, c) => { if (k === last) return out(kind, k, 'c', c); const o = s.o(k + 1); return o > 0 ? out(kind, k + 1, 'o', o) : out(kind, k, 'c', c); };
  for (let k = te; k <= last; k++) {
    if (vanished(s) && k > s.last) return isDead(s) ? out('dead', s.last + 1, 'c', 0) : out('gone', s.last, 'c', s.c(s.last));
    const c = s.c(k); if (!(c > 0)) continue; worst = Math.min(worst, c / e - 1);
    if (ge(c, e * (1 + target))) return hit('target', k, c);
    if (stop !== null && le(c, e * (1 - stop))) return hit('stop', k, c); }
  return out('max', last, 'c', markAt(s, last));
}

// AVERAGING DOWN (H-AVGDOWN): buy 1 unit (equal money per unit) at the open of te; add 1 unit at the next open after the first close
// <= the first buy x (1 - drop) for each drop (default -15% and -30%: at most 3 units); one close under both levels buys both at the
// same open; a missing open leaves the level armed. With `hi(k)` (the fund version) a level is measured from hi(k) (the fund's 1-year
// high known that day) instead of the first buy. Sell everything at the next open after the first close >= the AVERAGE COST
// (money in / shares) x (1 + target), else at the close of session te + maxH - 1. The exit is checked before the adds on each close.
// Returns units, profit (per 1-money units), gInv = profit per money invested, gRes = profit per money of the full budget (all units),
// worstInv / worstRes = the worst close of the combined position (vs money in / vs the full budget), unitYears = money x years tied up.
export function avgDown(s, te, { drops = [0.15, 0.30], target = 0.10, maxH = 252, hi = null } = {}) {
  const e = s.o(te); if (!(e > 0)) return null; const last = te + maxH - 1; if (last > s.T - 1) return null;
  const units = [{ k: te, px: e }], armed = drops.map(() => true), R = drops.length + 1; let worstInv = 0, worstRes = 0;
  const value = (p) => units.reduce((a, u) => a + p / u.px, 0), avgCost = () => units.length / units.reduce((a, u) => a + 1 / u.px, 0);
  const fin = (kind, x, at, p) => { const n = units.length, profit = value(p) - n; return { kind, x, at, units: units.map(u => ({ k: u.k, px: u.px })), n, profit, gInv: profit / n, gRes: profit / R, avgCost: avgCost(),
    worstInv: Math.min(worstInv, profit / n), worstRes: Math.min(worstRes, profit / R), unitYears: units.reduce((a, u) => a + (x - u.k + 1), 0) / YEAR, days: x - te + 1 }; };
  for (let k = te; k <= last; k++) {
    if (vanished(s) && k > s.last) return isDead(s) ? fin('dead', s.last + 1, 'c', 0) : fin('gone', s.last, 'c', s.c(s.last));
    const c = s.c(k); if (!(c > 0)) continue; const n = units.length, v = value(c); worstInv = Math.min(worstInv, v / n - 1); worstRes = Math.min(worstRes, (v - n) / R);
    if (ge(c, avgCost() * (1 + target))) { if (k === last) return fin('target', k, 'c', c); const o = s.o(k + 1); return o > 0 ? fin('target', k + 1, 'o', o) : fin('target', k, 'c', c); }
    if (k === last) break;
    const ref = hi ? hi(k) : e, go = []; drops.forEach((d, j) => { if (armed[j] && le(c, ref * (1 - d))) go.push(j); });
    if (go.length) { const o = s.o(k + 1); if (o > 0) for (const j of go) { armed[j] = false; units.push({ k: k + 1, px: o }); } } }
  return fin('max', last, 'c', markAt(s, last));
}

// MARKET REGIME known at the close of each day, from S&P 500 (SPY) closes up to that day only:
//   above200 = close above its 200-session average (null under 200 closes); dd = close vs the highest close of the last 252 sessions
//   (incl. today); crash = dd <= -15%; vol20 = annualised standard deviation of the last 20 daily log returns; vol = calm (< 15%),
//   normal (15-25%), stressed (> 25%), the bands leaders-study.mjs uses.
export const volBucket = (v) => v === null || v === undefined || !isFinite(v) ? null : v < 0.15 ? 'calm' : v <= 0.25 ? 'normal' : 'stressed';
export function regimeLabels(c) {
  const n = c.length, above200 = new Array(n).fill(null), dd = new Array(n).fill(null), crash = new Array(n).fill(null), vol20 = new Array(n).fill(null), vol = new Array(n).fill(null);
  let s200 = 0; const q = [];
  for (let k = 0; k < n; k++) { const x = c[k]; if (!(x > 0)) continue;
    s200 += x; q.push(x); if (q.length > 200) s200 -= q.shift(); if (q.length === 200) above200[k] = x > s200 / 200;
    let hi = 0; for (let j = Math.max(0, k - 251); j <= k; j++) if (c[j] > hi) hi = c[j]; dd[k] = x / hi - 1; crash[k] = dd[k] <= -0.15;
    if (k >= 20) { const r = []; for (let j = k - 19; j <= k; j++) if (c[j] > 0 && c[j - 1] > 0) r.push(Math.log(c[j] / c[j - 1]));
      if (r.length >= 15) { const m = mean(r), sd = Math.sqrt(r.reduce((a, y) => a + (y - m) ** 2, 0) / (r.length - 1)); vol20[k] = sd * Math.sqrt(252); vol[k] = volBucket(vol20[k]); } } }
  return { above200, dd, crash, vol20, vol };
}

// deterministic sampling (registered seed 20261023 + the session index)
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function sampleOf(arr, n, seed) { const a = [...arr]; if (a.length <= n) return a; const r = mulberry32(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }

// return per year of capital tied up: total net return / total money-years (simple, not compounded)
export const perYear = (nets, years) => { const y = years.reduce((a, b) => a + b, 0); return nets.length && y > 0 ? nets.reduce((a, b) => a + b, 0) / y : null; };
// the recovery report of a list of results { kind, g, days, spy?, spus?, ctrl?, worst, w?, unitYears? }: g / spy / spus / ctrl are gross
// returns PER MONEY INVESTED; w = the money invested (units; 1 if absent), unitYears = money x years tied up (else days / 252 x w).
// Return per year of capital tied up = sum of (g - cost) x w over the sum of money-years (simple, not compounded).
export function recoveryStats(tr, { cost = COST } = {}) {
  const n = tr.length; if (!n) return { n: 0 }; const sh = (f) => r4(tr.filter(f).length / n), W = (z) => z.w || 1, Y = (z) => z.unitYears !== undefined ? z.unitYears : z.days / YEAR * W(z);
  const rec = tr.filter(z => z.kind === 'target'), net = tr.map(z => z.g - cost), ws = tr.map(z => z.worst).filter(x => x !== undefined && x !== null);
  const opt = (k) => { const v = tr.filter(z => typeof z[k] === 'number' && isFinite(z[k])); return v.length ? r4(perYear(v.map(z => z[k] * W(z)), v.map(Y))) : null; };
  return { n, recovered: sh(z => z.kind === 'target'), medianDaysToRecover: median(rec.map(z => z.days)), stopped: sh(z => z.kind === 'stop'), underwaterAtMax: sh(z => z.kind === 'max' && z.g < 0), aboveWaterAtMax: sh(z => z.kind === 'max' && z.g >= 0),
    gone: sh(z => z.kind === 'gone'), dead: sh(z => z.kind === 'dead'), avgNet: r4(mean(net)), medianNet: r4(median(net)), avgDays: r4(mean(tr.map(z => z.days))), win: sh(z => z.g - cost > 0),
    perYear: r4(perYear(tr.map(z => (z.g - cost) * W(z)), tr.map(Y))), spyPerYear: opt('spy'), spusPerYear: opt('spus'), avgStockPerYear: opt('ctrl'),
    worstOpenLoss: { median: r4(median(ws)), p10: ws.length ? r4([...ws].sort((a, b) => a - b)[Math.floor(ws.length * 0.1)]) : null, under30: r4(ws.filter(x => x <= -0.3).length / n), under50: r4(ws.filter(x => x <= -0.5).length / n) } };
}

// MONTHLY SAVING (H-DIPFUND): 1 unit of money arrives at the first session of every month. DCA buys the fund with it at that open. DIP
// keeps it as cash and invests ALL saved cash at the next open after a close 10%+ under the highest close of the last 252 sessions (a
// buy pending from the day before is done with the cash saved up to that day, before the new month's money arrives). Cost `side` on each
// buy and on the final sale. Value = shares x the last close x (1 - side) + cash.
export function dcaVsDip(dates, o, c, { dip = 0.10, side = 0.004 } = {}) {
  const n = dates.length; let dS = 0, dI = 0, pS = 0, cash = 0, pI = 0, buys = 0, pend = false;
  for (let k = 0; k < n; k++) { const newMonth = k === 0 || dates[k].slice(0, 7) !== dates[k - 1].slice(0, 7);
    if (pend && o[k] > 0 && cash > 0) { pS += cash * (1 - side) / o[k]; cash = 0; buys++; } pend = false;
    if (newMonth && o[k] > 0) { dS += (1 - side) / o[k]; dI++; cash += 1; pI++; }
    let hi = 0; for (let j = Math.max(0, k - 251); j <= k; j++) if (c[j] > hi) hi = c[j];
    if (c[k] > 0 && le(c[k], hi * (1 - dip)) && cash > 0) pend = true; }
  let lc = null; for (let k = n - 1; k >= 0 && lc === null; k--) if (c[k] > 0) lc = c[k];
  return { dca: { invested: dI, value: dS * lc * (1 - side) }, dip: { invested: pI, value: pS * lc * (1 - side) + cash, cash, buys } };
}

// THE VERDICT: the system's tier-2 standard (value-core.mjs judge: both halves positive after 0.8% and 1.2% cost, better than the average
// stock over the same days, better than the named yardstick on the same buys (the `own` field), positive without the 2 best, block t >=
// 2.5; PROVEN at the proof bar) + the HOLD gate registered for long holds: the return per year of capital tied up must beat the S&P 500
// over the same days in both halves. perYear = { older: [rule, S&P 500], newer: [...] }.
export function judgeHold(R, { bar, ownName, perYear: py = {}, extra = [] } = {}) {
  const x = [...extra]; for (const h of ['older', 'newer']) { const p = py[h]; if (!p || !(p[0] > p[1])) x.push('return per year of capital tied up ' + (p ? (p[0] * 100).toFixed(1) + '%' : 'n/a') + ' not above the S&P 500 on the same days in the ' + h + ' half (' + (p ? (p[1] * 100).toFixed(1) + '%' : 'n/a') + ')'); }
  const v = judge(R, { bar, extra: x });
  return { ...v, why: v.why.replace(/not better than the same stocks on their other days/g, 'not better than ' + (ownName || 'the yardstick on the same buys')) };
}
