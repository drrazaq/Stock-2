// TIP-SOURCE SCORING (Agent C, Crowd). Research only; no orders; no Telegram. Output: data/tip-score.json.
// PRE-REGISTERED 20 Oct 2026, written before any score was seen. The rule is fixed; the numbers come from the weekly study run.
// Scores every source the user logs (data/tips.jsonl: pasted tips, Reddit crowd, followed YouTube channels, analysts, insiders),
// the market calls (data/market-calls.jsonl) and the theme opinions (data/opinions.jsonl), on the same whole-market price cache the
// studies use (study-cache/grouped.json.gz, no extra data calls).
//   Each tip is "bought" at the next open after the tip day and held 5 and 20 sessions (fixed horizons; 0.8% round-trip cost).
//   Yardsticks over the SAME sessions: (1) the average tradable stock (close 3 USD+, 1M USD+ traded a day) bought the same day,
//   (2) the S&P 500 (SPY). The edge is tip minus yardstick, averaged per calendar day first (date-clustered), then a t-statistic.
//   One tip per (source, stock, day); a tip whose horizon has not finished yet is "too early" and counted only in the "so far" column.
// FLAGS (C-FADE1): FADE when a source has 10+ finished tips on 5+ distinct days AND t <= -2 vs the average stock at 5 or 20 sessions;
//   its tips of the last 20 sessions become an AVOID list ("fade" in the output, with the session the avoid ends). The main session
//   wires that list into ACTIONS; this script never edits scan.mjs. LISTEN (information only, never a buy) when t >= +2 with the same
//   counts. Under 10 tips or under 5 days: "too early to judge". Nothing here is tuned on its own results.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, MONITOR_LABEL } from './first-run.mjs';   // run once per source: first judged verdict frozen (22 Oct 2026)
const env = process.env, OUT = env.OUT || 'data/tip-score.json', COST = 0.008, HOLDS = [5, 20], MIN_TIPS = 10, MIN_DAYS = 5, FADE_T = -2, LISTEN_T = 2;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, gz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
const THEME_PROXY = { 'AI, chips, memory and data centres': 'SMH', 'Energy and power': 'XLE', 'Shipping and transport': 'XLI' };   // same measuring sticks as scan.mjs
let store = gz(env.CACHE || 'study-cache/grouped.json.gz'); if (!store) { console.log('tip-score: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 60) { console.log('tip-score: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; } }); store = null;
const spyI = SY.get('SPY');
const lastOnOrBefore = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo - 1; };   // -1 if before the cache
const tradable = (i, t) => { const c = C[i * T + t]; if (!(c >= 3)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 15 && dv / n >= 1e6; };
// buy at the open of session t+1, sell at the close of session t+h (null while the horizon is unfinished)
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) if (isFinite(C[b + k])) { last = C[b + k]; break; } return last === null ? null : last / e - 1; }
function soFar(i, t) { const b = i * T, e = O[b + t + 1]; if (!(e > 0)) return null; let last = null, n = 0; for (let k = t + 1; k < T; k++) if (isFinite(C[b + k])) { last = C[b + k]; n = k - t; } return last === null ? null : { r: last / e - 1, n }; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && tradable(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
// ---- tips ----
const seen = new Set(), tips = [];
for (const x of lines(env.TIPS || 'data/tips.jsonl')) { if (!x || !x.sym || !x.src || !x.d) continue; const key = x.src + '|' + x.sym + '|' + x.d; if (seen.has(key)) continue; seen.add(key);
  const i = SY.get(String(x.sym).toUpperCase()), t = lastOnOrBefore(x.d); if (i === undefined || t < 20 || t + 1 >= T) { tips.push({ src: x.src, sym: x.sym, d: x.d, t: -1, noPrice: true }); continue; }
  const row = { src: x.src, sym: x.sym, d: x.d, t, entry: D[t + 1], sf: soFar(i, t) }; for (const h of HOLDS) { const g = fwd(i, t, h); row['r' + h] = g === null ? null : g; row['c' + h] = ctrl(t, h); row['s' + h] = spyF(t, h); } tips.push(row); }
const statFor = (a, h) => { const f = a.filter(z => typeof z['r' + h] === 'number' && typeof z['c' + h] === 'number'); if (!f.length) return { n: 0 };
  const ev = byDay(f, z => z['r' + h] - COST - z['c' + h]), sv = byDay(f, z => typeof z['s' + h] === 'number' ? z['r' + h] - COST - z['s' + h] : null), p = f.map(z => z['r' + h] - COST);
  return { n: f.length, days: ev.length, avg: +mean(p).toFixed(4), ctrl: +mean(f.map(z => z['c' + h])).toFixed(4), spy: sv.length ? +mean(f.filter(z => typeof z['s' + h] === 'number').map(z => z['s' + h])).toFixed(4) : null, edge: +mean(ev).toFixed(4), t: tOf(ev), vsSpy: sv.length ? +mean(sv).toFixed(4) : null, tSpy: tOf(sv), win: +(p.filter(x => x > 0).length / p.length).toFixed(3), beatCtrl: +(f.filter(z => z['r' + h] - COST > z['c' + h]).length / f.length).toFixed(3) }; };
const srcs = {}; for (const z of tips) (srcs[z.src] = srcs[z.src] || []).push(z);
const sources = Object.entries(srcs).map(([src, a]) => { const priced = a.filter(z => !z.noPrice), R = {}; for (const h of HOLDS) R['h' + h] = statFor(priced, h);
  const sf = priced.filter(z => z.sf), sfN = sf.length ? +mean(sf.map(z => z.sf.r - COST)).toFixed(4) : null;
  const judged = HOLDS.map(h => R['h' + h]).filter(r => r.n >= MIN_TIPS && r.days >= MIN_DAYS), fade = judged.some(r => typeof r.t === 'number' && r.t <= FADE_T), listen = !fade && judged.some(r => typeof r.t === 'number' && r.t >= LISTEN_T);
  return { src, tips: a.length, noPrice: a.filter(z => z.noPrice).length, firstTip: a.map(z => z.d).sort()[0], lastTip: a.map(z => z.d).sort().slice(-1)[0], soFar: sfN, soFarN: sf.length, ...R, verdict: fade ? 'FADE' : listen ? 'LISTEN (information only)' : judged.length ? 'NO EDGE EITHER WAY' : 'TOO EARLY TO JUDGE' }; })
  .sort((x, y) => y.tips - x.tips);
// RUN ONCE per source: the first run in which a source is judged (10+ finished tips on 5+ days, i.e. not TOO EARLY) freezes its verdict
// in firstRun.sources; later runs never change it. Each row's `verdict` is that frozen verdict; `latestVerdict` is this run's
// re-score, MONITORING ONLY. The FADE / AVOID list uses the frozen verdicts.
const PREV = J(OUT, {}) || {}, frozenSrc = freezeEach(PREV.firstRun && PREV.firstRun.sources, Object.fromEntries(sources.map(s => [s.src, s])), (r) => r.verdict !== 'TOO EARLY TO JUDGE');
for (const s of sources) { s.latestVerdict = s.verdict; s.verdict = frozenSrc[s.src] ? frozenSrc[s.src].verdict : 'TOO EARLY TO JUDGE'; if (frozenSrc[s.src]) s.verdictFrozenAt = frozenSrc[s.src].frozenAt; }
const firstRun = Object.keys(frozenSrc).length ? { at: (PREV.firstRun && PREV.firstRun.at) || new Date().toISOString(), note: 'per source: the first judged verdict, never overwritten', sources: frozenSrc } : null;
// AVOID list for C-FADE1: every tip of a FADE source whose 20-session window has not ended (the avoid ends at the close of session entry+19)
const fadeList = []; for (const s of sources.filter(s => s.verdict === 'FADE')) for (const z of srcs[s.src]) { if (z.noPrice) continue; const endT = z.t + 20; if (endT >= T - 1) fadeList.push({ src: s.src, sym: z.sym, tip: z.d, from: z.entry, until: endT < T ? D[endT] : 'about ' + (endT - (T - 1)) + ' sessions after ' + D[T - 1] }); }
// ---- market calls (SPY after a bullish / bearish call vs the unconditional average over the cache window) ----
const calls = lines(env.CALLS || 'data/market-calls.jsonl').filter(x => x && x.src && x.d && (x.dir === 1 || x.dir === -1)), callSrc = {};
const uncond = {}; for (const h of HOLDS) { const v = []; for (let t = 20; t + h < T; t++) { const g = spyF(t, h); if (g !== null) v.push(g); } uncond[h] = v.length ? +mean(v).toFixed(4) : null; }
for (const x of calls) { const t = lastOnOrBefore(x.d); if (t < 0 || t + 1 >= T) continue; const g = callSrc[x.src] = callSrc[x.src] || { src: x.src, calls: 0, bullish: 0 }; g.calls++; if (x.dir === 1) g.bullish++;
  for (const h of HOLDS) { const r = spyF(t, h); if (r === null) continue; (g['h' + h] = g['h' + h] || []).push(x.dir * r); } }
const marketCalls = Object.values(callSrc).map(g => { const o = { src: g.src, calls: g.calls, bullish: g.bullish }; for (const h of HOLDS) { const v = g['h' + h] || []; o['h' + h] = { n: v.length, spyInCallDirection: v.length ? +mean(v).toFixed(4) : null, unconditional: uncond[h], t: tOf(v.map(x => x - (uncond[h] || 0))) }; } return o; });
// ---- theme opinions (the theme's ETF proxy after the push, vs the S&P 500) ----
const ops = lines(env.OPINIONS || 'data/opinions.jsonl'), opSrc = {};
for (const x of ops) { if (!x || !x.d || !Array.isArray(x.themes)) continue; const t = lastOnOrBefore(x.d); if (t < 0 || t + 1 >= T) continue;
  for (const th of x.themes) { const p = THEME_PROXY[th], i = p ? SY.get(p) : undefined; if (i === undefined) continue; const g = opSrc[x.src || 'unnamed'] = opSrc[x.src || 'unnamed'] || { src: x.src || 'unnamed', pushes: 0 }; g.pushes++;
    for (const h of HOLDS) { const r = fwd(i, t, h), s = spyF(t, h); if (r === null || s === null) continue; (g['h' + h] = g['h' + h] || []).push(r - s); } } }
const opinions = Object.values(opSrc).map(g => { const o = { src: g.src, themePushes: g.pushes }; for (const h of HOLDS) { const v = g['h' + h] || []; o['h' + h] = { n: v.length, themeVsSpy: v.length ? +mean(v).toFixed(4) : null, t: tOf(v) }; } return o; });
// ---- channels with no logged mention yet ----
const chans = (J('data/channels.json', []) || []).map(c => c.name).filter(Boolean), chanRows = chans.map(n => ({ channel: n, source: 'YouTube: ' + n, tips: (srcs['YouTube: ' + n] || []).length }));
// ---- plain table ----
const tbl = ['TIP SOURCES, scored on the whole-market cache ' + D[0] + ' to ' + D[T - 1] + ' (buy next open, 0.8% cost; edge = tip minus the average stock bought the same day; t by day)', 'source | tips | 5 sessions: n, avg, vs avg stock (t), vs S&P | 20 sessions: n, avg, vs avg stock (t), vs S&P | so far (open to last close) | verdict'];
tbl.push('verdict = frozen first judged verdict per source; this run (monitoring only) in brackets when different');
for (const s of sources) { const f = (r) => r.n ? r.n + ', ' + pc(r.avg) + ', ' + pc(r.edge) + ' (t ' + r.t + '), ' + pc(r.vsSpy) : 'none finished'; tbl.push(s.src + ' | ' + s.tips + (s.noPrice ? ' (' + s.noPrice + ' no price)' : '') + ' | ' + f(s.h5) + ' | ' + f(s.h20) + ' | ' + (s.soFar === null ? 'n/a' : pc(s.soFar) + ' on ' + s.soFarN) + ' | ' + s.verdict + (s.latestVerdict !== s.verdict ? ' [this run: ' + s.latestVerdict + ']' : '')); }
for (const m of marketCalls) tbl.push('MARKET CALLS ' + m.src + ': ' + m.calls + ' calls (' + m.bullish + ' bullish); S&P in the call direction 5 sessions ' + pc(m.h5.spyInCallDirection) + ' (any day ' + pc(m.h5.unconditional) + ', n ' + m.h5.n + '), 20 sessions ' + pc(m.h20.spyInCallDirection) + ' (any day ' + pc(m.h20.unconditional) + ', n ' + m.h20.n + ')');
for (const o of opinions) tbl.push('THEME PUSHES ' + o.src + ': ' + o.themePushes + ' pushes; theme ETF vs S&P 5 sessions ' + pc(o.h5.themeVsSpy) + ' (n ' + o.h5.n + '), 20 sessions ' + pc(o.h20.themeVsSpy) + ' (n ' + o.h20.n + ')');
tbl.push(fadeList.length ? 'FADE / AVOID now: ' + fadeList.map(f => f.sym + ' (' + f.src + ', until ' + f.until + ')').join(', ') : 'FADE / AVOID now: none (no source has a 10-tip, 5-day record at t <= -2 yet)');
const out = { generatedAt: new Date().toISOString(), agent: 'C', preRegistered: '2026-10-20', asOf: D[T - 1], cacheFrom: D[0], cost: COST, horizons: HOLDS, rule: 'FADE: 10+ finished tips on 5+ days and t <= -2 vs the average stock at 5 or 20 sessions; its tips become AVOID for 20 sessions. LISTEN (information only): t >= +2 with the same counts. Never a buy rule.', firstRun, latest: { label: MONITOR_LABEL, at: new Date().toISOString(), verdicts: Object.fromEntries(sources.map(s => [s.src, s.latestVerdict])) }, sources, fade: fadeList, marketCalls, opinions, channels: chanRows, tips: tips.filter(z => !z.noPrice).map(z => ({ src: z.src, sym: z.sym, d: z.d, entry: z.entry, r5: z.r5, c5: z.c5, s5: z.s5, r20: z.r20, c20: z.c20, s20: z.s20, soFar: z.sf ? +z.sf.r.toFixed(4) : null, soFarSessions: z.sf ? z.sf.n : 0 })), text: tbl.join('\n') };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(out.text);
