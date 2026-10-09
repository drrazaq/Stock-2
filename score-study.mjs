// STOCK SCORE. Every liquid US stock gets a score from 0 to 100, built from four measures with long research records:
//   strength over 6 months (momentum), closeness to its 6 month high, calm price moves (low volatility), and a recent dip
//   (short-term reversal). The score is only trusted if it WORKS: every month of the last two years, the 20 top-scored stocks
//   are bought at the next open and held one month, against all stocks and against the S&P 500, after costs. Older half and
//   newer half are judged separately. If the top 20 win in both, the current top 20 are shown as a monthly basket (paper first).
// Uses the price cache built by leaders-study.mjs (same weekly job). No data calls. Read-only.
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const TG = local(env.TG_BASE) || 'https://api.telegram.org';
const pc = (x, d = 1) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
const OUT = 'data/score-study.json';
fs.mkdirSync('data', { recursive: true });
let store;
try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); }
catch (e) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache yet' })); console.log('score study: no cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length, LOOK = 126, HOLD = 21, TOP = 20, COST = 0.008;
if (T < LOOK + HOLD * 6) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + T + ' sessions' })); process.exit(0); }
const COS = (() => { try { const j = JSON.parse(fs.readFileSync('data/companies.json', 'utf8')); return j.syms && j.syms.length > 3000 ? new Set(j.syms) : null; } catch { return null; } })();

// per-stock close and open by session index
const C = new Map(), O = new Map(), V = new Map();
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const s = x.T[j]; if (!C.has(s)) { C.set(s, new Float64Array(T).fill(NaN)); O.set(s, new Float64Array(T).fill(NaN)); V.set(s, new Float64Array(T).fill(NaN)); } C.get(s)[t] = x.c[j]; O.get(s)[t] = x.o[j]; V.get(s)[t] = x.v[j] * x.c[j]; } });
const spy = C.get('SPY'), spyO = O.get('SPY');

function factors(t) {      // measures at the close of session t, for stocks with a full 6 months of prices
  const rows = [];
  for (const [s, c] of C) {
    if (s === 'SPY' || (COS && !COS.has(s))) continue;
    if (!(c[t] >= 5) || !(c[t - LOOK] > 0)) continue;
    let ok = 0, hi = 0, dv = 0, rs = [], miss = 0;
    for (let u = t - LOOK; u <= t; u++) { if (!(c[u] > 0)) { miss++; continue; } hi = Math.max(hi, c[u]); }
    if (miss > 10) continue;
    for (let u = t - 20; u <= t; u++) if (V.get(s)[u] > 0) { dv += V.get(s)[u]; ok++; }
    if (!ok || dv / ok < 2e6) continue;
    for (let u = t - 62; u <= t; u++) if (c[u] > 0 && c[u - 1] > 0) rs.push(c[u] / c[u - 1] - 1);
    if (rs.length < 40) continue;
    const m = rs.reduce((a, b) => a + b, 0) / rs.length, vol = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (rs.length - 1));
    const c5 = c[t - 5] > 0 ? c[t - 5] : c[t], c21 = c[t - 21] > 0 ? c[t - 21] : null;
    rows.push({ s, mom: c5 / c[t - LOOK] - 1, prox: c[t] / hi, vol, rev: c21 ? c[t] / c21 - 1 : 0 });
  }
  // percentile ranks; the score is their average (higher = better on every measure)
  const rank = (key, asc) => { const a = [...rows].sort((x, y) => asc ? x[key] - y[key] : y[key] - x[key]); a.forEach((r, i) => r['r_' + key] = 1 - i / Math.max(1, a.length - 1)); };
  rank('mom', false); rank('prox', false); rank('vol', true); rank('rev', true);
  for (const r of rows) r.score = Math.round(100 * (r.r_mom + r.r_prox + r.r_vol + r.r_rev) / 4);
  return rows;
}
const fwd = (s, t) => { const o = O.get(s)[t + 1], c = C.get(s); if (!(o > 0)) return null; let k = Math.min(T - 1, t + HOLD); while (k > t + 1 && !(c[k] > 0)) k--; if (t + HOLD > T - 1) return null; return c[t + HOLD] > 0 ? c[t + HOLD] / o - 1 - COST : (k > t + 1 && c[k] > 0 ? c[k] / o - 1 - COST : -0.3 - COST); };   // vanished = -30%
const periods = [];
for (let t = LOOK + 5; t + HOLD <= T - 1; t += HOLD) {
  const rows = factors(t).map(r => ({ ...r, f: fwd(r.s, t) })).filter(r => r.f !== null); if (rows.length < 200) continue;
  const avg = a => a.length ? a.reduce((x, y) => x + y.f, 0) / a.length : null, by = (k) => [...rows].sort((a, b) => b[k] - a[k]);
  const q = Math.floor(rows.length / 5);
  periods.push({ t, d: D[t], n: rows.length, top: avg(by('score').slice(0, TOP)), all: avg(rows), tops: Object.fromEntries(['score', 'r_mom', 'r_prox', 'r_vol', 'r_rev'].map(k => [k, avg(by(k).slice(0, TOP))])), spy: spyO[t + 1] > 0 && spy[t + HOLD] > 0 ? spy[t + HOLD] / spyO[t + 1] - 1 : null,
    q: Object.fromEntries(['r_mom', 'r_prox', 'r_vol', 'r_rev', 'score'].map(k => { const a = by(k); return [k, { hi: avg(a.slice(0, q)), lo: avg(a.slice(-q)) }]; })) });
}
const half = Math.floor(periods.length / 2), parts = { older: periods.slice(0, half), newer: periods.slice(half) };
const mean = (a, f) => { const v = a.map(f).filter(x => x !== null && isFinite(x)); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const res = Object.fromEntries(Object.entries(parts).map(([k, a]) => [k, { months: a.length, top: mean(a, p => p.top), all: mean(a, p => p.all), spy: mean(a, p => p.spy), beatAll: a.filter(p => p.top > p.all).length,
  factors: Object.fromEntries(['r_mom', 'r_prox', 'r_vol', 'r_rev', 'score'].map(f => [f, { hi: mean(a, p => p.q[f].hi), lo: mean(a, p => p.q[f].lo) }])) }]));
const pass = (r) => r.months >= 4 && r.top > r.all + 0.005 && r.spy !== null && r.top > r.spy && r.beatAll / r.months >= 0.5;
// Each single measure is also tried as its own score (top 20 by that measure alone). One is used only if it passes in BOTH
// years; if several pass, the one that did best in the OLDER year is chosen (never picked by the newer half).
const KEYS = ['score', 'r_mom', 'r_prox', 'r_vol', 'r_rev'], label = { score: 'all four measures', r_mom: 'strength over 6 months only', r_prox: 'closeness to the high only', r_vol: 'calm moves only', r_rev: 'a recent dip only' };
const variant = Object.fromEntries(KEYS.map(k => [k, Object.fromEntries(Object.entries(parts).map(([pn, a]) => { const r = { months: a.length, top: mean(a, p => p.tops[k]), all: mean(a, p => p.all), spy: mean(a, p => p.spy), beatAll: a.filter(p => p.tops[k] > p.all).length }; return [pn, r]; }))]));
const passing = KEYS.filter(k => pass(variant[k].older) && pass(variant[k].newer)).sort((a, b) => variant[b].older.top - variant[a].older.top);
const useKey = passing[0] || 'score';
const verdict = passing.length ? 'PROMISING' : res.newer.top !== null && res.newer.top < res.newer.all ? 'REJECTED' : 'NOT PROVEN';
const nowRows = factors(T - 1), now = [...nowRows].sort((a, b) => b.score - a.score), top = [...nowRows].sort((a, b) => b[useKey] - a[useKey]).slice(0, TOP).map(r => ({ sym: r.s, score: r.score, price: C.get(r.s)[T - 1], mom: r.mom, prox: r.prox }));
// keep the current top list on paper, month by month, to build a live record
const PP = (() => { try { return JSON.parse(fs.readFileSync('data/score-paper.json', 'utf8')); } catch { return { baskets: [] }; } })();
const lastB = PP.baskets[PP.baskets.length - 1];
if (!lastB || D.indexOf(lastB.d) < 0 || T - 1 - D.indexOf(lastB.d) >= HOLD) PP.baskets.push({ d: D[T - 1], syms: top.map(x => x.sym) });
for (const b of PP.baskets) { const t = D.indexOf(b.d); if (t < 0 || b.result !== undefined || t + HOLD > T - 1) continue; const f = b.syms.map(s => C.has(s) ? fwd(s, t) : null).filter(x => x !== null); b.result = f.length ? f.reduce((a, x) => a + x, 0) / f.length : null; b.spy = spyO[t + 1] > 0 && spy[t + HOLD] > 0 ? spy[t + HOLD] / spyO[t + 1] - 1 : null; }
fs.writeFileSync('data/score-paper.json', JSON.stringify(PP, null, 1));
const done = PP.baskets.filter(b => typeof b.result === 'number');
const name = { r_mom: 'strength over 6 months', r_prox: 'close to its 6 month high', r_vol: 'calm price moves', r_rev: 'a recent dip', score: 'the combined score' };
const fl = (r) => Object.entries(r.factors).map(([k, v]) => '- ' + name[k] + ': best fifth ' + pc(v.hi) + ', worst fifth ' + pc(v.lo) + (v.hi > v.lo ? '' : '  (backwards)')).join('\n');
const msg = ['STOCK SCORE, ' + D[T - 1], 'Every liquid US company scored 0 to 100 from four measures: strength over 6 months, closeness to its high, calm moves, a recent dip. Tested every month over the whole history (dead stocks included): the 20 top-scored stocks bought at the next open, held one month, 0.8% cost.', '',
  'OLDER YEAR (' + res.older.months + ' months): top 20 ' + pc(res.older.top) + ' a month, all stocks ' + pc(res.older.all) + ', S&P 500 ' + pc(res.older.spy) + '; top 20 beat all stocks in ' + res.older.beatAll + ' of ' + res.older.months + ' months',
  'NEWER YEAR (' + res.newer.months + ' months): top 20 ' + pc(res.newer.top) + ' a month, all stocks ' + pc(res.newer.all) + ', S&P 500 ' + pc(res.newer.spy) + '; top 20 beat all stocks in ' + res.newer.beatAll + ' of ' + res.newer.months + ' months', '',
  'WHICH MEASURE WORKED IN THE NEWER YEAR (one month later, best fifth vs worst fifth of stocks)', fl(res.newer), '',
  'EACH WAY OF SCORING, top 20 a month (older half / newer half; all stocks ' + pc(res.older.all) + ' / ' + pc(res.newer.all) + '; S&P 500 ' + pc(res.older.spy) + ' / ' + pc(res.newer.spy) + ')',
  ...KEYS.map(k => '- ' + label[k] + ': ' + pc(variant[k].older.top) + ' / ' + pc(variant[k].newer.top) + (passing.includes(k) ? '  PASSED both halves' : '')), '',
  'VERDICT: ' + verdict + (verdict === 'PROMISING' ? ' (' + label[useKey] + '). It picked better stocks in both halves. Its current top 20 is shown below as a monthly basket, on paper first.' : verdict === 'REJECTED' ? '. The top-scored stocks did worse than the average stock in the newer half. Do not buy by this score.' : '. The score did not clearly beat the market in both halves. The list below is for research only.'),
  '', 'TOP SCORED NOW (' + (verdict === 'PROMISING' ? 'monthly basket, paper first' : 'research only') + '; check each in ZAD)', ...top.slice(0, 12).map(x => x.sym + ' ' + x.price.toFixed(2) + ': score ' + x.score + ', ' + pc(x.mom, 0) + ' in 6 months, ' + Math.round((1 - x.prox) * 100) + '% under its high'),
  done.length ? '\nPAPER BASKETS FINISHED: ' + done.length + ', average ' + pc(done.reduce((a, b) => a + b.result, 0) / done.length) + ' a month vs S&P 500 ' + pc(done.filter(b => b.spy !== null).reduce((a, b) => a + b.spy, 0) / Math.max(1, done.filter(b => b.spy !== null).length)) : '\nPaper baskets: the first one is recorded today and judged in a month.',
  'About 2 years, one market climate; price measures only (no company figures in this history). Research, not an order. Not financial advice, not a halal ruling.'];
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status: 'OK', verdict, useKey, variant, results: res, top, scores: Object.fromEntries(now.map(r => [r.s, r.score])), text: msg.join('\n') }));
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
console.log(msg.join('\n'));
