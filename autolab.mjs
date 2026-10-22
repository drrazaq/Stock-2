// AUTOLAB: the system invents its own trading rules, tests them, and keeps only what survives. Read-only; never places an order.
// Every Sunday it builds NEW candidate rules by combining fixed building blocks (trend, momentum, pullback depth, short drop, volume,
// distance from the 1-year high and low, daily swing size, market state, share-count change = dilution, market dispersion) with a holding period, and puts each through three gates that are
// kept strictly apart so the system cannot fool itself:
//   1. DISCOVERY (the oldest 60% of the 5 years): must beat an average stock bought the same days, after costs, beyond luck. The luck
//      bar counts EVERY rule ever tried (data/autolab.json keeps them all), so the more it tries, the harder a pass gets.
//   2. VALIDATION (the next 20%): the same rule, unchanged, must still beat the average stock.
//   3. VAULT (the newest 20%): looked at once per rule, only after 1 and 2 pass. Must still win.
//   4. LIVE PAPER: survivors' picks are logged every week and scored on real later prices. 30+ paper trades, positive after costs and
//      better than the average stock, before a rule may appear in your ACTIONS (as AUTO-DISCOVERED, with its record).
// A rule is never tested twice (same id = same rule), and none is ever adjusted after seeing its result.
// Output: data/autolab.json (every rule tried, its verdicts, live candidates, their paper record, this week's picks).
import fs from 'node:fs';
import { belowLeague, BELOW } from './league-bar.mjs';   // a passing verdict must also clear the league luck bar (22 Oct 2026)
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org', OUT = 'data/autolab.json';
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
fs.mkdirSync('data', { recursive: true });
const PER_WEEK = +(env.AUTO_N || 60), COST = 0.008, GONE = -0.3;
const LAB = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return { tried: {}, candidates: {}, paper: [], weeks: 0 }; } })();
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('autolab: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 500) { console.log('autolab: only ' + T + ' sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), HI = new Float32Array(NS * T).fill(NaN), LO = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; HI[k] = x.h ? x.h[j] : x.c[j]; LO[k] = x.l ? x.l[j] : x.c[j]; V[k] = x.v[j]; } }); const SICS = store.sic || {}; store = null;
const spyI = SY.get('SPY');
// ---- features per stock-day (all known at the close of day t)
const F = { tr50: new Int8Array(NS * T), tr200: new Int8Array(NS * T), m6: new Float32Array(NS * T).fill(NaN), dd20: new Float32Array(NS * T).fill(NaN), r5: new Float32Array(NS * T).fill(NaN), vx: new Float32Array(NS * T).fill(NaN), dh: new Float32Array(NS * T).fill(NaN), atrp: new Float32Array(NS * T).fill(NaN), ok: new Uint8Array(NS * T), bk: new Uint8Array(NS * T) };
for (let i = 0; i < NS; i++) { const b = i * T; let s50 = 0, s200 = 0, sv = 0, dv = 0, tr = 0; const q50 = [], q200 = [], qv = [], dq = [], tq = [], h20 = [], h252 = [];
  for (let t = 0; t < T; t++) { const c = C[b + t]; if (!isFinite(c)) { q50.length = q200.length = qv.length = dq.length = tq.length = h20.length = h252.length = 0; s50 = s200 = sv = dv = tr = 0; continue; } const k = b + t;
    q50.push(c); s50 += c; if (q50.length > 50) s50 -= q50.shift(); q200.push(c); s200 += c; if (q200.length > 200) s200 -= q200.shift();
    const v = V[k]; if (qv.length === 20) F.vx[k] = sv / 20 > 0 ? v / (sv / 20) : NaN; qv.push(v); sv += v; if (qv.length > 20) sv -= qv.shift();
    dq.push(c * v); dv += c * v; if (dq.length > 20) dv -= dq.shift();
    const pcl = t > 0 && isFinite(C[k - 1]) ? C[k - 1] : c, x = Math.max(HI[k], pcl) - Math.min(LO[k], pcl); tq.push(x); tr += x; if (tq.length > 14) tr -= tq.shift(); if (tq.length === 14) F.atrp[k] = tr / 14 / c;
    h20.push(HI[k]); if (h20.length > 20) h20.shift(); h252.push(HI[k]); if (h252.length > 252) h252.shift();
    if (q50.length === 50) F.tr50[k] = c > s50 / 50 ? 1 : -1; if (q200.length === 200) F.tr200[k] = c > s200 / 200 ? 1 : -1;
    if (t >= 126 && isFinite(C[k - 126])) F.m6[k] = c / C[k - 126] - 1; if (t >= 5 && isFinite(C[k - 5])) F.r5[k] = c / C[k - 5] - 1;
    if (h20.length === 20) F.dd20[k] = 1 - c / Math.max(...h20); if (h252.length >= 200) F.dh[k] = 1 - c / Math.max(...h252);
    F.ok[k] = c >= 5 && dq.length === 20 && dv / 20 >= 5e6 ? 1 : 0;
    if (F.ok[k]) { const d = dv / 20, a = F.atrp[k]; F.bk[k] = 1 + (d < 2e7 ? 0 : d < 2e8 ? 1 : 2) * 3 + (!(a >= 0.03) ? 0 : a < 0.06 ? 1 : 2); } } }   // bk: size (daily dollar volume) x daily-swing group, for the similar-stocks yardstick
// share count change over a year, known on each day (SEC counts, public 30 days after their date): data/shares.json.gz
let SHR = null; try { SHR = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/shares.json.gz')).toString()); } catch (e) {}
const dil = new Float32Array(NS * T).fill(NaN);
if (SHR && SHR.t) { const lag = (SHR.lagDays || 30) * 864e5; for (let i = 0; i < NS; i++) { const a = SHR.c[SHR.t[SYMS[i]]]; if (!a || a.length < 2) continue; let k = 0;
    for (let t = 0; t < T; t++) { const lim = new Date(Date.parse(D[t]) - lag).toISOString().slice(0, 10), yr = new Date(Date.parse(D[t]) - lag - 365 * 864e5).toISOString().slice(0, 10); while (k + 1 < a.length && a[k + 1][0] <= lim) k++; if (a[k][0] > lim) continue;
      let j = k; while (j > 0 && a[j][0] > yr) j--; if (a[j][0] <= yr && a[j][1] > 0 && j < k) dil[i * T + t] = a[k][1] / a[j][1] - 1; } } }
// distance above the 1-year low
const LOW = new Float32Array(NS * T).fill(NaN); for (let i = 0; i < NS; i++) { const b = i * T, q = []; for (let t = 0; t < T; t++) { const l = LO[b + t]; if (!isFinite(l)) { q.length = 0; continue; } while (q.length && q[q.length - 1][1] >= l) q.pop(); q.push([t, l]); while (q[0][0] <= t - 252) q.shift(); if (t >= 200) LOW[b + t] = C[b + t] / q[0][1] - 1; } }
// market dispersion: how differently stocks moved over the last 20 sessions (high = stock-picking matters more)
const DISP = new Float32Array(T).fill(NaN); { const day = new Float32Array(T).fill(NaN); for (let t = 1; t < T; t++) { const v = []; for (let i = 0; i < NS; i += 5) { const c0 = C[i * T + t - 1], c1 = C[i * T + t]; if (c0 > 5 && c1 > 0) v.push(c1 / c0 - 1); } if (v.length > 50) { const m = mean(v); day[t] = Math.sqrt(mean(v.map(x => (x - m) ** 2))); } }
  for (let t = 20; t < T; t++) { const w = []; for (let k = t - 19; k <= t; k++) if (isFinite(day[k])) w.push(day[k]); if (w.length >= 15) DISP[t] = mean(w); } }
const dispMed = (() => { const v = [...DISP.slice(0, Math.floor(T * 0.6))].filter(isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; })();
const mkt200 = new Int8Array(T); if (spyI !== undefined) { let s = 0; const q = []; for (let t = 0; t < T; t++) { const c = C[spyI * T + t]; if (!isFinite(c)) continue; q.push(c); s += c; if (q.length > 200) s -= q.shift(); if (q.length === 200) mkt200[t] = c > s / 200 ? 1 : -1; } }
const mktUp = new Int8Array(T); if (spyI !== undefined) { let s = 0; const q = []; for (let t = 0; t < T; t++) { const c = C[spyI * T + t]; if (!isFinite(c)) continue; q.push(c); s += c; if (q.length > 50) s -= q.shift(); if (q.length === 50) mktUp[t] = c > s / 50 ? 1 : -1; } }
// ---- extra measures for the strategy-library blocks (added 19 Oct): 10/20-day averages, 20-day range tightness, days under the 200-day
const MA10 = new Float32Array(NS * T).fill(NaN), MA20 = new Float32Array(NS * T).fill(NaN), RNG20 = new Float32Array(NS * T).fill(NaN), LO20 = new Float32Array(NS * T).fill(NaN), BEL200 = new Int16Array(NS * T);
for (let i = 0; i < NS; i++) { const b = i * T; let s10 = 0, s20 = 0, n = 0, bel = 0; for (let t = 0; t < T; t++) { const k = b + t, c = C[k]; if (!isFinite(c)) { s10 = s20 = n = bel = 0; continue; } n++; s10 += c; s20 += c;
    if (n > 10) s10 -= C[k - 10]; if (n > 20) s20 -= C[k - 20]; if (n >= 10) MA10[k] = s10 / 10; if (n >= 20) MA20[k] = s20 / 20;
    if (n >= 21) { let hi = -Infinity, lo = Infinity, l2 = Infinity; for (let j = k - 19; j <= k; j++) { if (C[j] > hi) hi = C[j]; if (C[j] < lo) lo = C[j]; } for (let j = k - 20; j < k; j++) if (LO[j] < l2) l2 = LO[j]; RNG20[k] = (hi - lo) / c; LO20[k] = l2; }
    BEL200[k] = F.tr200[k] === -1 ? Math.min(30000, bel = bel + 1) : (bel = 0); } }
// FROG-IN-THE-PAN (Da, Gurun & Warachka 2014): momentum built from many small up days lasts longer than momentum from a few jumps.
// SMOOTH = share of up days minus share of down days over the last 126 sessions (needs 100+ valid days).
const SMOOTH = new Float32Array(NS * T).fill(NaN); for (let i = 0; i < NS; i++) { const b = i * T; let up = 0, dn = 0, n = 0; const q = [];
  for (let t = 1; t < T; t++) { const c0 = C[b + t - 1], c1 = C[b + t]; const v = c0 > 0 && c1 > 0 ? Math.sign(c1 - c0) : null; q.push(v); if (v !== null) { n++; if (v > 0) up++; else if (v < 0) dn++; }
    if (q.length > 126) { const o = q.shift(); if (o !== null) { n--; if (o > 0) up--; else if (o < 0) dn--; } } if (n >= 100) SMOOTH[b + t] = (up - dn) / n; } }
// INDUSTRY MOMENTUM (Moskowitz & Grinblatt 1999): the stock's industry (SEC 3-digit code, 5+ members) is in the top 20% of industries by
// median 6-month return on that day. Computed every 5th session and carried forward (speed).
const INDTOP = new Uint8Array(NS * T); { const ind = new Map(); for (let i = 0; i < NS; i++) { const x = SICS[SYMS[i]]; if (x && x.c) { const g = String(x.c).slice(0, 3); if (!ind.has(g)) ind.set(g, []); ind.get(g).push(i); } }
  const groups = [...ind.values()].filter(a => a.length >= 5); let top = new Set();
  for (let t = 126; t < T; t++) { if (t % 5 === 0) { const sc = []; for (const g of groups) { const v = []; for (const i of g) { const a = C[i * T + t - 126], c = C[i * T + t]; if (a > 0 && c > 0) v.push(c / a - 1); } if (v.length >= 5) { v.sort((x, y) => x - y); sc.push([g, v[v.length >> 1]]); } }
      sc.sort((x, y) => y[1] - x[1]); top = new Set(); for (const [g] of sc.slice(0, Math.max(1, Math.ceil(sc.length * 0.2)))) for (const i of g) top.add(i); }
    for (const i of top) INDTOP[i * T + t] = 1; } }
const MAX21 = new Float32Array(NS * T).fill(NaN); for (let i = 0; i < NS; i++) { const b = i * T; for (let t = 22; t < T; t++) { let m = -Infinity, ok = 0; for (let k = t - 20; k <= t; k++) { const c0 = C[b + k - 1], c1 = C[b + k]; if (c0 > 0 && c1 > 0) { ok++; if (c1 / c0 - 1 > m) m = c1 / c0 - 1; } } if (ok >= 15) MAX21[b + t] = m; } }
// ---- building blocks (each a fixed yes/no test on a stock-day)
const BLOCKS = {
  up50: [(k) => F.tr50[k] === 1, 'above its 50-day average'], dn50: [(k) => F.tr50[k] === -1, 'under its 50-day average'],
  up200: [(k) => F.tr200[k] === 1, 'above its 200-day average'], dn200: [(k) => F.tr200[k] === -1, 'under its 200-day average'],
  momHi: [(k) => F.m6[k] >= 0.3, 'up 30%+ in 6 months'], momLo: [(k) => F.m6[k] <= -0.2, 'down 20%+ in 6 months'],
  pb5: [(k) => F.dd20[k] >= 0.05 && F.dd20[k] < 0.12, '5-12% under its 20-day high'], pb12: [(k) => F.dd20[k] >= 0.12 && F.dd20[k] < 0.25, '12-25% under its 20-day high'],
  drop5: [(k) => F.r5[k] <= -0.07, 'fell 7%+ in 5 days'], pop5: [(k) => F.r5[k] >= 0.07, 'rose 7%+ in 5 days'],
  volHi: [(k) => F.vx[k] >= 2, 'volume 2x+ its normal day'], volLo: [(k) => F.vx[k] <= 0.6, 'quiet volume (under 0.6x)'],
  nearHi: [(k) => F.dh[k] <= 0.03, 'within 3% of its 1-year high'], farHi: [(k) => F.dh[k] >= 0.4, '40%+ under its 1-year high'],
  calm: [(k) => F.atrp[k] <= 0.02, 'calm (daily swing under 2%)'], wild: [(k) => F.atrp[k] >= 0.05, 'wild (daily swing 5%+)'],
  dilut: [(k) => dil[k] >= 0.2, 'share count up 20%+ in a year (dilution)'], noDil: [(k) => dil[k] <= 0.02, 'share count flat or shrinking'],
  offLow: [(k) => LOW[k] >= 0.5, '50%+ above its 1-year low'], nearLow: [(k) => LOW[k] <= 0.1, 'within 10% of its 1-year low'],
  dispHi: [(k, t) => DISP[t] > dispMed * 1.2, 'stocks moving very differently (high dispersion)'], dispLo: [(k, t) => DISP[t] < dispMed * 0.85, 'stocks moving together (low dispersion)'],
  mkt200: [(k, t) => mkt200[t] === 1, 'S&P 500 above its 200-day average'],
  mktUp: [(k, t) => mktUp[t] === 1, 'S&P 500 above its 50-day average'], mktDn: [(k, t) => mktUp[t] === -1, 'S&P 500 under its 50-day average'],
  // day-shape blocks (added 18 Oct): the opening gap, a big one-day move, where it closed in the day's range, a run of up or down days
  gapUp: [(k) => O[k] / C[k - 1] - 1 >= 0.04, 'opened 4%+ above the day before'], gapDn: [(k) => O[k] / C[k - 1] - 1 <= -0.04, 'opened 4%+ below the day before'],
  day8: [(k) => C[k] / C[k - 1] - 1 >= 0.08, 'rose 8%+ in one day'], dayDn8: [(k) => C[k] / C[k - 1] - 1 <= -0.08, 'fell 8%+ in one day'],
  closeTop: [(k) => HI[k] > LO[k] && (C[k] - LO[k]) / (HI[k] - LO[k]) >= 0.9, 'closed at the top of the day'], closeBot: [(k) => HI[k] > LO[k] && (C[k] - LO[k]) / (HI[k] - LO[k]) <= 0.1, 'closed at the bottom of the day'],
  up3: [(k) => C[k] > C[k - 1] && C[k - 1] > C[k - 2] && C[k - 2] > C[k - 3], '3 up days in a row'], dn3: [(k) => C[k] < C[k - 1] && C[k - 1] < C[k - 2] && C[k - 2] < C[k - 3], '3 down days in a row'],
  // strategy-library blocks (added 19 Oct; see data/strategy-library.json)
  tight20: [(k) => RNG20[k] <= 0.10, 'tight: 20-day range under 10% of the price (quiet base)'],
  stack: [(k) => C[k] > MA10[k] && MA10[k] > MA20[k] && F.tr50[k] === 1 && F.tr200[k] === 1, 'full uptrend stack (price > 10-day > 20-day, above 50- and 200-day)'],
  reclaim200: [(k) => F.tr200[k] === 1 && BEL200[k - 1] >= 120, 'first close above the 200-day after 6+ months below'],
  up25in10: [(k) => C[k] / C[k - 10] - 1 >= 0.25, 'up 25%+ in 10 sessions'],
  snap: [(k) => F.r5[k] <= -0.15 && C[k] > C[k - 1], 'fell 15%+ in 5 days, then an up day (snap-back)'],
  bearTrap: [(k) => LO[k] < LO20[k] && C[k] > LO20[k], 'broke under its 20-day low, closed back above (failed breakdown)'],
  atHi: [(k) => F.dh[k] <= 0.001, 'closed at a new 1-year high'],
  tom: [(k, t) => { const d = +D[t].slice(8, 10); return d >= 27 || d <= 3; }, 'turn of the month (last days / first 3 days)'],
  // MAX / lottery effect (Bali, Cakici & Whitelaw 2011): the biggest one-day gain of the last 21 sessions; lottery-like stocks tend to lag
  smooth: [(k) => SMOOTH[k] >= 0.1, 'smooth climb: clearly more up days than down days over 6 months'], jumpy: [(k) => SMOOTH[k] <= -0.05, 'more down days than up days over 6 months'],
  indTop: [(k) => INDTOP[k] === 1, 'its industry is in the top 20% over 6 months'],
  lotHi: [(k) => MAX21[k] >= 0.15, 'lottery-like: a 15%+ one-day jump in the last month'], lotLo: [(k) => MAX21[k] < 0.04, 'no day above +4% in the last month'] };
const BK = Object.keys(BLOCKS), HOLDS = [5, 10, 20, 60], CLASH = [['smooth', 'jumpy'], ['lotHi', 'lotLo'], ['lotLo', 'day8'], ['lotLo', 'up25in10'], ['stack', 'dn50'], ['stack', 'dn200'], ['reclaim200', 'dn200'], ['atHi', 'farHi'], ['atHi', 'pb12'], ['atHi', 'nearLow'], ['snap', 'pop5'], ['up25in10', 'drop5'], ['tight20', 'wild'], ['gapUp', 'gapDn'], ['day8', 'dayDn8'], ['closeTop', 'closeBot'], ['up3', 'dn3'], ['day8', 'dn3'], ['dayDn8', 'up3'], ['up50', 'dn50'], ['up200', 'dn200'], ['momHi', 'momLo'], ['pb5', 'pb12'], ['drop5', 'pop5'], ['volHi', 'volLo'], ['nearHi', 'farHi'], ['calm', 'wild'], ['mktUp', 'mktDn'], ['nearHi', 'pb12'], ['nearHi', 'drop5'], ['dilut', 'noDil'], ['offLow', 'nearLow'], ['dispHi', 'dispLo'], ['nearLow', 'nearHi'], ['nearLow', 'momHi']];
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(+(env.AUTO_SEED || (Date.parse(D[T - 1]) / 864e5 | 0)));
const ruleId = (r) => [...r.b].sort().join('+') + '/h' + r.h;
// EVOLUTION (added 18 Oct): half of each week's rules are BRED from the best near-misses of past weeks (rules that did well at
// discovery even if they failed later): swap one ingredient, add one, drop one, or change the holding time. The other half stay
// random so the search keeps exploring. Every bred rule still pays the same luck bar, which counts EVERY rule ever tried.
const okRule = (b) => b.size >= 2 && b.size <= 4 && !CLASH.some(([x, y]) => b.has(x) && b.has(y)) && [...b].every(x => BLOCKS[x]);
function bred(n, taken) { const par = Object.values(LAB.tried).filter(x => x.discovery && x.discovery.t >= 1.5 && x.discovery.edge > 0 && x.verdict !== 'FAILED LIVE' && x.b.every(y => BLOCKS[y])).sort((a, b) => b.discovery.t - a.discovery.t).slice(0, 15), out = []; let guard = 0;
  while (par.length && out.length < n && guard++ < n * 80) { const p = par[Math.floor(rnd() * Math.min(par.length, 1 + Math.floor(rnd() * par.length)))], b = new Set(p.b); let h = p.h; const op = Math.floor(rnd() * 4), pick = () => BK[Math.floor(rnd() * BK.length)];
    if (op === 0) { const a = [...b]; b.delete(a[Math.floor(rnd() * a.length)]); b.add(pick()); } else if (op === 1) b.add(pick()); else if (op === 2) { const a = [...b]; b.delete(a[Math.floor(rnd() * a.length)]); } else h = HOLDS[Math.floor(rnd() * HOLDS.length)];
    if (!okRule(b)) continue; const r = { b: [...b], h, from: p.name }, id = ruleId(r); if (LAB.tried[id] || taken.some(z => ruleId(z) === id) || out.some(z => ruleId(z) === id)) continue; out.push(r); } return out; }
// STRATEGY LIBRARY (added 19 Oct): data/strategy-library.json lists named strategies; every entry with a fixed rule is tested here FIRST,
// exactly as written (no tuning), and pays the same luck bar as everything else. Its verdict is written back into the library.
const LIBF = 'data/strategy-library.json', LIBR = (() => { try { return JSON.parse(fs.readFileSync(LIBF, 'utf8')); } catch (e) { return null; } })();
function libRules(n) { if (!LIBR) return []; const out = []; for (const e of LIBR.strategies || []) { if (out.length >= n || !e.rule || !Array.isArray(e.rule.b) || !e.rule.b.every(x => BLOCKS[x])) continue;
    const r = { b: [...e.rule.b], h: e.rule.h, lib: e.id }; if (LAB.tried[ruleId(r)]) { if (!/^(LIVE|FAILED|PASSED)/.test(e.status || '')) { const x = LAB.tried[ruleId(r)]; e.status = x.verdict; e.result = x.discovery ? { t: x.discovery.t, edge: x.discovery.edge, n: x.discovery.n, why: x.discovery.why } : null; } continue; } out.push(r); } return out; }
function newRules(n) { const lib = libRules(n), kids = bred(Math.floor((n - lib.length) / 2), lib), out = [...lib, ...kids]; let guard = 0; while (out.length < n && guard++ < n * 50) { const k = 2 + Math.floor(rnd() * 2), b = new Set(); while (b.size < k) b.add(BK[Math.floor(rnd() * BK.length)]);
  const arr = [...b]; if (CLASH.some(([x, y]) => b.has(x) && b.has(y))) continue; const r = { b: arr, h: HOLDS[Math.floor(rnd() * HOLDS.length)] }, id = ruleId(r); if (LAB.tried[id] || out.some(z => ruleId(z) === id)) continue; out.push(r); } return out; }
// ---- testing
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null, lk = t; for (let k = t + 1; k <= t + h; k++) if (isFinite(C[b + k])) { last = C[b + k]; lk = k; }
  if (last === null) return null; if (lk === t + h) return last / e - 1; let later = false; for (let k = t + h + 1; k < Math.min(T, t + h + 15); k++) if (isFinite(C[b + k])) { later = true; break; } if (later) return last / e - 1; if (t + h + 15 >= T) return null; return Math.max(-1, last / e - 1 + GONE); }
const ctrlCache = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlCache) return ctrlCache[key]; const v = []; for (let i = 0; i < NS; i += 3) if (i !== spyI && F.ok[i * T + t]) { const g = fwd(i, t, h); if (g !== null && isFinite(g)) v.push(g); } return (ctrlCache[key] = v.length >= 30 ? mean(v) : null); };
// SIMILAR-STOCKS YARDSTICK: the average stock of the SAME size group (daily dollar volume under 20M / 20-200M / over 200M USD) and the
// SAME daily-swing group (under 3% / 3-6% / over 6%) on the same day. Beating the average stock is not enough if the rule only buys
// small, wild stocks that carry more risk: it must also beat stocks like the ones it buys. Uses prices only, so dead stocks count too.
const mCache = {}; const ctrlM = (t, h, b) => { const key = t + '_' + h; if (!(key in mCache)) { const s = new Float64Array(10), n = new Uint32Array(10); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const k = i * T + t; if (!F.bk[k]) continue; const g = fwd(i, t, h); if (g === null || !isFinite(g)) continue; s[F.bk[k]] += g; n[F.bk[k]]++; } mCache[key] = [...s].map((v, j) => n[j] >= 10 ? v / n[j] : null); } return mCache[key][b]; };
const P1 = Math.floor(T * 0.6), P2 = Math.floor(T * 0.8), STEP = 3;   // signals checked every 3rd session (speed); one trade per stock per holding period
function run(r, from, to) { const tr = []; const fs_ = r.b.map(x => BLOCKS[x][0]);
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; let free = 0; for (let t = Math.max(from, 252); t < Math.min(to, T - r.h - 1); t += STEP) { if (t < free) continue; const k = i * T + t; if (!F.ok[k]) continue; let hit = true; for (const f of fs_) if (!f(k, t)) { hit = false; break; } if (!hit) continue;
    const g = fwd(i, t, r.h), c0 = ctrl(t, r.h); if (g === null || c0 === null) continue; const cm = ctrlM(t, r.h, F.bk[k]); tr.push({ t, s: SYMS[i], x: g - c0, m: cm === null ? null : g - cm, g: g - COST }); free = t + r.h; } }
  return tr; }
function judge(tr, bar) { if (tr.length < 40) return { pass: false, n: tr.length, why: 'too few trades (' + tr.length + ')' };
  const byT = {}; for (const z of tr) (byT[z.t] = byT[z.t] || []).push(z.x - COST); const v = Object.values(byT).map(mean), m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / Math.max(1, v.length - 1)), t = sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0;
  const avg = mean(tr.map(z => z.g)), byS = {}; let pos = 0; for (const z of tr) if (z.g > 0) { byS[z.s] = (byS[z.s] || 0) + z.g; pos += z.g; } const top = pos > 0 ? Math.max(...Object.values(byS)) / pos : 1;
  const why = []; if (!(m > 0.003)) why.push('not 0.3%+ better than an average stock (' + pc(m) + ')'); if (!(t >= bar)) why.push('could be luck (t ' + t.toFixed(1) + ', ' + bar.toFixed(1) + ' needed)'); if (!(avg > 0)) why.push('lost money after costs'); if (top > 0.25) why.push('one stock made over 25% of the profit'); const mm = tr.filter(z => z.m !== null), byM = {}; for (const z of mm) (byM[z.t] = byM[z.t] || []).push(z.m - COST); const vm = Object.values(byM).map(mean), msim = vm.length ? mean(vm) : null; if (!(msim > 0)) why.push('not better than similar stocks (same size and swing): ' + pc(msim)); { const srt = tr.map(z => z.g).sort((a, b) => b - a).slice(2); if (!(mean(srt) > 0)) why.push('loses money without its 2 best trades'); }
  return { pass: !why.length, n: tr.length, days: v.length, edge: +m.toFixed(4), vsSimilar: msim === null ? null : +msim.toFixed(4), t: +t.toFixed(2), avg: +avg.toFixed(4), why: why.join('; ') }; }
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + z / 2), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
const zInv = (p) => { let lo = 0, hi = 10; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (0.5 * erfc(m / Math.SQRT2) > p) lo = m; else hi = m; } return (lo + hi) / 2; };
const name = (r) => r.b.map(x => BLOCKS[x][1]).join(' + ') + ', held ' + r.h + ' sessions';
// ---- STABILITY: a rule that passed all gates is split by year and by market type (S&P above/below its 200-day average),
// with a 95% range from 1000 resamples of whole DAYS (trades on the same day are not independent). A year or market type that
// clearly loses (average below the average stock and t <= -2), or a whole-period range that includes zero, labels it REGIME-DEPENDENT.
function stability(tr) { const grp = (key) => { const g = {}; for (const z of tr) (g[key(z)] = g[key(z)] || []).push(z); return Object.fromEntries(Object.entries(g).map(([k, a]) => { const byT = {}; for (const z of a) (byT[z.t] = byT[z.t] || []).push(z.x - COST); const v = Object.values(byT).map(mean), m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / Math.max(1, v.length - 1)); return [k, { n: a.length, days: v.length, edge: +m.toFixed(4), t: sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : 0 }]; })); };
  const byYear = grp(z => D[z.t].slice(0, 4)), byMkt = grp(z => mkt200[z.t] === 1 ? 'above200' : mkt200[z.t] === -1 ? 'below200' : 'unknown');
  const byT = {}; for (const z of tr) (byT[z.t] = byT[z.t] || []).push(z.x - COST); const days = Object.values(byT).map(mean), rr = mulberry32(12345), bs = [];
  if (days.length >= 20) for (let b = 0; b < 1000; b++) { let s = 0; for (let j = 0; j < days.length; j++) s += days[Math.floor(rr() * days.length)]; bs.push(s / days.length); } bs.sort((a, b) => a - b);
  const ci = bs.length ? [+bs[25].toFixed(4), +bs[974].toFixed(4)] : null, bad = [...Object.entries(byYear), ...Object.entries(byMkt)].filter(([k, v]) => k !== 'unknown' && v.n >= 20 && v.edge < 0 && v.t <= -2).map(([k]) => k);
  return { byYear, byMkt, ci, label: !ci || ci[0] <= 0 || bad.length ? 'REGIME-DEPENDENT' : 'STABLE', loses: bad }; }
// ---- 1. this week's new rules through the three gates
const fresh = newRules(PER_WEEK), totalTried = Object.keys(LAB.tried).length + fresh.length, BAR = Math.max(2.5, zInv(0.05 / totalTried)), VBAR = 2;
let passedAll = 0;
for (const r of fresh) { const id = ruleId(r), d1 = judge(run(r, 0, P1), BAR); let d2 = null, d3 = null, verdict = 'FAILED DISCOVERY';
  if (d1.pass) { d2 = judge(run(r, P1, P2), VBAR); verdict = 'FAILED VALIDATION'; if (d2.pass) { d3 = judge(run(r, P2, T), VBAR); verdict = d3.pass ? 'LIVE CANDIDATE' : 'FAILED VAULT'; LAB.vaultLooks = (LAB.vaultLooks || 0) + 1; } }
  let belowL = null; if (verdict === 'LIVE CANDIDATE') { belowL = belowLeague([d1.t], BAR); if (belowL) verdict = BELOW; }
  LAB.tried[id] = { week: D[T - 1], name: (r.lib ? 'LIBRARY ' + r.lib + ': ' : '') + name(r), b: r.b, h: r.h, bredFrom: r.from || null, lib: r.lib || null, verdict, discovery: d1, validation: d2, vault: d3, ...(belowL ? { belowLeagueBar: 'passed discovery, validation and vault; at discovery ' + belowL } : {}) };
  // ABLATION: every block must earn its place. Drop one block at a time (whole period): if a simpler rule does about as well
  // (at least 90% of the edge), the extra block is decoration and the rule is flagged; the simpler version is NOT promoted (it was not pre-tested).
  if (verdict === 'LIVE CANDIDATE' && r.b.length > 1) { const full = judge(run(r, 0, T), 0).edge; const idle = r.b.filter(x => { const e = judge(run({ b: r.b.filter(y => y !== x), h: r.h }, 0, T), 0).edge; return typeof e === 'number' && typeof full === 'number' && e >= full * 0.9; }); LAB.tried[id].idleBlocks = idle; r.idle = idle.map(x => BLOCKS[x][1]); }
  if (verdict === 'LIVE CANDIDATE') { const st = stability(run(r, 0, T)); LAB.tried[id].stability = st; LAB.candidates[id] = { since: D[T - 1], name: name(r), b: r.b, h: r.h, vsSimilar: d3 ? d3.vsSimilar : null, stability: st.label, ci: st.ci, loses: st.loses, idle: r.idle || [] }; passedAll++; } }
// ---- 2. live paper: score last weeks' picks whose holding period has ended, then log this week's picks of every candidate
const idx = new Map(D.map((d, t) => [d, t]));
for (const p of LAB.paper) { if (p.done) continue; const t = idx.get(p.d), i = SY.get(p.sym); if (t === undefined || i === undefined || t + p.h >= T) continue; const g = fwd(i, t, p.h), c0 = ctrl(t, p.h); if (g === null) continue; p.g = +(g - COST).toFixed(4); p.x = c0 === null ? null : +(g - c0).toFixed(4); p.done = true; }
const tLast = T - 1, today = {};
for (const [id, c] of Object.entries(LAB.candidates)) { const fs_ = c.b.map(x => BLOCKS[x][0]), picks = [];
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; const k = i * T + tLast; if (!F.ok[k]) continue; if (fs_.every(f => f(k, tLast))) picks.push(SYMS[i]); }
  const sel = picks.slice(0, 15); today[id] = sel; for (const s of sel) if (!LAB.paper.some(p => p.id === id && p.sym === s && p.d === D[tLast])) LAB.paper.push({ id, sym: s, d: D[tLast], h: c.h }); }
const rec = {}; for (const p of LAB.paper.filter(z => z.done)) { const r = rec[p.id] || (rec[p.id] = { n: 0, g: 0, x: 0, nx: 0, win: 0 }); r.n++; r.g += p.g; if (p.x !== null) { r.x += p.x; r.nx++; } if (p.g > 0) r.win++; }
for (const [id, c] of Object.entries(LAB.candidates)) { const r = rec[id]; c.paper = r ? { n: r.n, avg: +(r.g / r.n).toFixed(4), vsAvg: r.nx ? +(r.x / r.nx).toFixed(4) : null, win: +(r.win / r.n).toFixed(3) } : { n: 0 };
  c.status = c.paper.n >= 30 && c.paper.avg > 0 && c.paper.vsAvg > 0 ? 'PROVEN LIVE' : c.paper.n >= 30 ? 'FAILED LIVE' : 'ON PAPER'; c.today = today[id] || []; }
for (const [id, c] of Object.entries(LAB.candidates)) if (c.status === 'FAILED LIVE') { LAB.tried[id].verdict = 'FAILED LIVE'; delete LAB.candidates[id]; }
if (LAB.paper.length > 20000) LAB.paper = LAB.paper.slice(-20000);
LAB.weeks++; LAB.generatedAt = new Date().toISOString(); LAB.status = 'OK'; LAB.last = { week: D[T - 1], tested: fresh.length, passed: passedAll, bar: +BAR.toFixed(2), totalTried };
fs.writeFileSync(OUT, JSON.stringify(LAB));
if (LIBR) { for (const e of LIBR.strategies || []) { if (!e.rule) continue; const x = LAB.tried[ruleId({ b: e.rule.b, h: e.rule.h })]; if (!x) continue; e.status = x.verdict; e.tested = x.week; e.result = x.discovery ? { t: x.discovery.t, edge: x.discovery.edge, n: x.discovery.n, why: x.discovery.why || '' } : null; }
  LIBR.updated = D[T - 1]; fs.writeFileSync(LIBF, JSON.stringify(LIBR, null, 1)); }
const nLib = fresh.filter(r => r.lib).length, nBred = fresh.filter(r => r.from).length, cand = Object.values(LAB.candidates), msg = ['AUTOLAB: the system invented and tested ' + fresh.length + ' new rules this week (' + nLib + ' named strategies from the library, ' + nBred + ' bred from the best near-misses of past weeks, ' + (fresh.length - nBred - nLib) + ' brand new; ' + totalTried + ' tried in total; luck bar t ' + BAR.toFixed(1) + ')', '',
  passedAll ? passedAll + ' passed discovery, validation AND the untouched vault: now on live paper.' : 'None passed all three gates this week. That is the normal result; it means the bar is working.',
  'Failed at discovery ' + fresh.filter(r => LAB.tried[ruleId(r)].verdict === 'FAILED DISCOVERY').length + ', validation ' + fresh.filter(r => LAB.tried[ruleId(r)].verdict === 'FAILED VALIDATION').length + ', vault ' + fresh.filter(r => LAB.tried[ruleId(r)].verdict === 'FAILED VAULT').length + '.', '',
  ...(cand.length ? ['LIVE CANDIDATES (' + cand.length + '):', ...cand.map(c => '- ' + c.name + ': ' + c.status + (c.stability ? ' [' + c.stability + (c.ci ? ', 95% range ' + pc(c.ci[0]) + ' to ' + pc(c.ci[1]) + ' vs average stock' : '') + (c.loses && c.loses.length ? ', loses in ' + c.loses.join(', ') : '') + ']' : '') + (typeof c.vsSimilar === 'number' ? ' (newest 20%: ' + pc(c.vsSimilar) + ' vs similar stocks)' : '') + (c.idle && c.idle.length ? ' (adds nothing: ' + c.idle.join(', ') + ')' : '') + (c.paper.n ? ' (' + c.paper.n + ' paper trades, ' + pc(c.paper.avg) + ' a trade, ' + pc(c.paper.vsAvg) + ' vs an average stock)' : ' (paper starts now)'))] : ['No live candidates yet.']),
  ...(LAB.vaultLooks ? ['The newest 20% (vault) has now been used by ' + LAB.vaultLooks + ' rules in total, so it is no longer fully untouched: the truly untouched test is live paper on future days.'] : []),
  '', 'Only PROVEN LIVE rules (30+ paper trades, profitable and better than an average stock) reach your ACTIONS. Research only.'];
console.log(msg.join('\n'));
const QUIET_ = (() => { try { return JSON.parse(fs.readFileSync('data/settings.json', 'utf8')).quiet !== false; } catch (e) { return true; } })();   // quiet (default): study results stay in the files and reach you through ACTIONS and the weekly report
if (env.TG_TOKEN && env.TG_CHAT && !QUIET_) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
