// A-EW1 EARLY-WAVE STACK (Agent A, Timing), PRE-REGISTERED 20 Oct 2026 from the outside review. Research only; no orders; no Telegram.
// RUN ONCE AS WRITTEN: the first complete verdict is frozen in data/ew-stack.json (firstRun) and in the library; later runs only add
// a fresh today's list and the newer data for information, never a second chance to pass.
// Signal on day t (all must hold; written before any result was seen):
//   1. supply: SEC share count known on t (counts public 30 days after their date) is less than 5% above the count known 90 calendar
//      days earlier (both counts must exist; unknown is not "flat"), and NO share offering (424B4/424B5 prospectus) or private share
//      sale (8-K 3.02) accepted by the SEC in the last 20 sessions (t-19..t). Stocks without an SEC filing history are left out.
//      Note: the events cache files 424B4 and 424B5 together, so 424B4 is excluded too (stricter than the review's wording).
//   2. quiet before: volume on each of days t-7..t-3 under 150% of the stock's median volume (median of t-50..t-1).
//   3. ignition: volume on t over 3x that median, and the close in the top 25% of the day's range ((close-low)/(high-low) >= 0.75).
//   4. not a lottery stock: no close-to-close jump of 15%+ on any of the last 21 sessions (t-20..t, the signal day included).
//   5. tradable: close 3 USD+, 20-day average traded value 1M USD+ (the price cache's own floor).
//   Version 2 also needs an 8-K item 1.01 (material agreement) accepted in the last 10 sessions (t-9..t).
// Entry at the next open; hold 3 and 10 sessions (4 versions in all). Same gates as everything else: 0.8% costs (1.2% stress), both
// halves of 5 years, date-clustered t above the higher of this study's luck bar and the LEAGUE bar (read only), must beat the average
// stock (same floor) bought the same day, the S&P 500 over the same days and the same stock on its other days, must survive without its
// 2 best trades. If it fails: early-wave buying on daily data is NOT PROVEN and the ignition buy alerts stay paper-only.
// Output: data/ew-stack.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { secNY } from './sec-time.mjs';   // SEC acceptance times are UTC: converted to the New York clock (fixed 22 Oct 2026)
const env = process.env, OUT = env.OUT || 'data/ew-stack.json', COST = 0.008, STRESS = 0.012, HOLDS = [3, 10];
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const gz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
const PREV = J(OUT, {});
let store = gz(env.CACHE || 'study-cache/grouped.json.gz'); if (!store) { console.log('ew-stack: no price cache'); process.exit(0); }
const EV = gz(env.EV_CACHE || 'ev-cache/events-cache.json.gz'), SHR = gz(env.SHARES || 'data/shares.json.gz');
if (!EV || !EV.syms || !SHR || !SHR.t) { console.log('ew-stack: no SEC filings or share counts (needs ev-cache and data/shares.json.gz); not run'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) { console.log('ew-stack: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), Hh = new Float32Array(NS * T).fill(NaN), Ll = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; Hh[k] = x.h ? x.h[j] : NaN; Ll[k] = x.l ? x.l[j] : NaN; C[k] = x.c[j]; V[k] = x.v[j]; } }); store = null;
const spyI = SY.get('SPY');
const tradable = (i, t) => { const c = C[i * T + t]; if (!(c >= 3)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 15 && dv / n >= 1e6; };
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) if (isFinite(C[b + k])) { last = C[b + k]; break; } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && tradable(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);
const midT = Math.floor((60 + T) / 2), ownC = {}; const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : 60; k < (half ? T - 1 : midT); k += 2) { if (Math.abs(k - t) <= h) continue; if (tradable(i, k)) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } } return (ownC[key] = v.length >= 30 ? mean(v) : null); };
// SEC events per stock as session indexes (an event accepted after 16:00 New York counts for the next session)
const firstOnOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
const evT = (S, fam) => (S.ev || []).filter(e => String(e.f).split(',').includes(fam) && secNY(e.p)).map(e => { const ny = secNY(e.p), d = ny.d, late = !!ny.hm && ny.hm >= '16:00'; let t = firstOnOrAfter(d); if (late && D[t] === d) t++; return t; }).filter(t => t < T);
const lag = (SHR.lagDays || 30) * 864e5, sharesKnown = (a, ms) => { const lim = new Date(ms - lag).toISOString().slice(0, 10); let v = null; for (const [d, n] of a) { if (d <= lim) v = n; else break; } return v; };
const trades = {}; for (const v of ['V1', 'V2']) for (const h of HOLDS) trades[v + '_' + h] = [];
const today = []; let covered = 0, signals = 0, signals2 = 0; const fail = { supply: 0, quiet: 0, lottery: 0 };
for (let i = 0; i < NS; i++) { const sym = SYMS[i]; if (i === spyI) continue; const S = EV.syms[sym], A = SHR.c[SHR.t[sym]]; if (!S || !S.old || !A || A.length < 2) continue; covered++;
  const sup = new Uint8Array(T + 1), con = new Uint8Array(T + 1); for (const t of [...evT(S, 'OFFERING'), ...evT(S, 'DILUTION')]) sup[t] = 1; for (const t of evT(S, 'CONTRACT')) con[t] = 1;
  const b = i * T;
  for (let t = 60; t < T; t++) { const v = V[b + t], c = C[b + t], h = Hh[b + t], l = Ll[b + t]; if (!isFinite(v) || !(c >= 3) || !(h > l)) continue;
    const win = []; for (let k = t - 50; k < t; k++) { const x = V[b + k]; if (isFinite(x)) win.push(x); } if (win.length < 40) continue; win.sort((x, y) => x - y); const med = win[win.length >> 1]; if (!(med > 0)) continue;
    if (!(v > 3 * med) || !((c - l) / (h - l) >= 0.75)) continue;                                                     // 3. ignition
    let quiet = true; for (let k = t - 7; k <= t - 3; k++) { const x = V[b + k]; if (!isFinite(x) || !(x < 1.5 * med)) { quiet = false; break; } } if (!quiet) { fail.quiet++; continue; }   // 2.
    let lot = false; for (let k = t - 20; k <= t; k++) { const a = C[b + k - 1], z = C[b + k]; if (a > 0 && z > 0 && z / a - 1 >= 0.15) { lot = true; break; } } if (lot) { fail.lottery++; continue; }   // 4.
    if (!tradable(i, t)) continue;                                                                                    // 5.
    const ms = Date.parse(D[t]), n1 = sharesKnown(A, ms), n0 = sharesKnown(A, ms - 90 * 864e5); let off = false; for (let k = Math.max(0, t - 19); k <= t; k++) if (sup[k]) { off = true; break; }
    if (!(n1 > 0 && n0 > 0) || !(n1 / n0 - 1 < 0.05) || off) { fail.supply++; continue; }                              // 1.
    let c2 = false; for (let k = Math.max(0, t - 9); k <= t; k++) if (con[k]) { c2 = true; break; }
    signals++; if (c2) signals2++;
    if (t === T - 1) today.push({ sym, d: D[t], close: +c.toFixed(2), volX: +(v / med).toFixed(1), contract: c2 });
    for (const hd of HOLDS) { const g = fwd(i, t, hd), c0 = ctrl(t, hd), ob = own(i, t, hd), sp = spyF(t, hd); if (g === null || c0 === null || ob === null || Math.abs(g) > 3) continue; const z = { t, s: sym, g, c: c0, ob, sp }; trades['V1_' + hd].push(z); if (c2) trades['V2_' + hd].push(z); } } }
// ---- statistics (date-clustered: one average per entry day, t over days)
const NV = Object.keys(trades).length, OWN_BAR = 2.4 + 0.1 * NV / 2, LG = J('data/agent-league.json', {}), LEAGUE_BAR = typeof LG.bar === 'number' ? LG.bar : null, BAR = Math.max(OWN_BAR, LEAGUE_BAR || 0);
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
const stat = (a, cost) => { if (a.length < 20) return { n: a.length };
  const v = byDay(a, z => z.g - cost - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - cost - z.sp : null), p = a.map(z => z.g - cost).sort((x, y) => y - x);
  return { n: a.length, days: v.length, stocks: new Set(a.map(z => z.s)).size, avg: +mean(p).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +mean(v).toFixed(4), t: tOf(v), vsSpy: sv.length ? +mean(sv).toFixed(4) : null, tSpy: tOf(sv), vsOwn: ov.length ? +mean(ov).toFixed(4) : null, tOwn: tOf(ov), win: +(p.filter(x => x > 0).length / p.length).toFixed(3), noTop2: +mean(p.slice(2)).toFixed(4) }; };
const RES = {};
for (const [k, a] of Object.entries(trades)) { const [ver, hs] = k.split('_'), R = { older: stat(a.filter(z => z.t < midT), COST), newer: stat(a.filter(z => z.t >= midT), COST), stress: stat(a.filter(z => z.t >= midT), STRESS) }, why = [];
  for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); continue; }
    if (!(r.edge > 0)) why.push('not better than an average stock in the ' + hf + ' half (' + pc(r.edge) + ')');
    if (!(r.t >= BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', ' + BAR.toFixed(2) + ' needed)');
    if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half');
    if (!(r.vsSpy > 0)) why.push('did not beat the S&P 500 in the ' + hf + ' half (' + pc(r.vsSpy) + ')');
    if (!(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')');
    if (!(r.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + hf + ' half'); }
  if (R.stress.n >= 20 && !(R.stress.avg > 0)) why.push('loses at 1.2% costs');
  const verdict = !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PASSED' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED';
  RES[k] = { name: 'Early-wave stack' + (ver === 'V2' ? ' + 8-K 1.01 contract in the last 10 sessions' : '') + ', hold ' + hs + ' sessions', verdict, why: why.join('; ') || 'beat the average stock, the S&P 500 and the same stock on its other days in both halves, beyond the luck bar, at stress cost, without its 2 best trades', results: R }; }
const order = ['PASSED', 'NOT PROVEN', 'REJECTED', 'TOO FEW CASES'], best = Object.entries(RES).sort(([, x], [, y]) => order.indexOf(x.verdict) - order.indexOf(y.verdict) || ((y.results.newer.t || -9) - (x.results.newer.t || -9)))[0];
const overall = Object.values(RES).some(r => r.verdict === 'PASSED') ? 'PASSED' : 'NOT PROVEN';
const thisRun = { at: new Date().toISOString(), from: D[60], to: D[T - 1], verdict: overall, best: best ? best[0] : null, results: RES, bar: +BAR.toFixed(2) };
const firstRun = PREV.firstRun && PREV.firstRun.verdict ? PREV.firstRun : (covered >= 100 ? thisRun : null);   // frozen: run once as written
const out = { generatedAt: new Date().toISOString(), agent: 'A', preRegistered: '2026-10-20', from: D[60], to: D[T - 1], stocksWithSecHistory: covered, signals, signalsWithContract: signals2, filteredOut: fail, versions: NV, ownBar: +OWN_BAR.toFixed(2), leagueBar: LEAGUE_BAR, bar: +BAR.toFixed(2),
  verdict: firstRun ? firstRun.verdict : 'NOT RUN (fewer than 100 stocks with an SEC filing history)', firstRun, latest: thisRun, today,
  meaning: 'If NOT PROVEN: early-wave buying on daily data is not proven and the ignition buy alerts stay paper-only. A PASS goes to live paper first, never straight into buys.' };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('EW-STACK A-EW1 (' + out.from + ' to ' + out.to + ', ' + covered + ' stocks with SEC history, ' + signals + ' signals, ' + signals2 + ' with a contract): ' + out.verdict + (PREV.firstRun ? ' (frozen first run of ' + PREV.firstRun.at.slice(0, 10) + ')' : ''));
for (const r of Object.values(RES)) { const n = r.results.newer, o = r.results.older; console.log('- ' + r.name + ': ' + r.verdict + ' | older ' + (o.n || 0) + ' trades, edge ' + pc(o.edge) + ' t ' + o.t + ' | newer ' + (n.n || 0) + ' trades, edge ' + pc(n.edge) + ' t ' + n.t + ', vs S&P ' + pc(n.vsSpy) + ', vs own ' + pc(n.vsOwn) + (r.verdict !== 'PASSED' ? ' (' + r.why.split(';')[0] + ')' : '')); }
// library A-EW1: written once, from the frozen first run; "tested: passed" only when the code above says PASSED
try { const LB = J('data/strategy-library.json', null), e = LB && LB.strategies.find(x => x.id === 'A-EW1');
  if (e && firstRun && !/^tested/.test(e.status || '')) { const [bk, br] = Object.entries(firstRun.results).sort(([, x], [, y]) => order.indexOf(x.verdict) - order.indexOf(y.verdict) || ((y.results.newer.t || -9) - (x.results.newer.t || -9)))[0], R = br.results;
    e.status = 'tested: ' + (firstRun.verdict === 'PASSED' ? 'passed' : 'not proven'); e.tested = firstRun.to; e.study = 'ew-stack.mjs -> data/ew-stack.json (run once, first run frozen)';
    e.result = { best: bk, t: R.newer.t, tOlder: R.older.t, edge: R.newer.edge, edgeOlder: R.older.edge, vsSpy: R.newer.vsSpy, vsSpyOlder: R.older.vsSpy, vsOwn: R.newer.vsOwn, n: [R.older.n || 0, R.newer.n || 0], bar: firstRun.bar, why: Object.entries(firstRun.results).map(([k, r]) => k + ' ' + r.verdict + (r.verdict === 'PASSED' ? '' : ': ' + r.why.split(';')[0])).join(' | ') };
    fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } catch (e) {}
