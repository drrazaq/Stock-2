// REBALANCING TEST: does keeping a portfolio of single stocks in balance help, or does it cut the winners that make the money?
// Classic advice (trim winners above their target, add to the laggards, put new cash into what is underweight) comes from funds of
// stocks AND bonds. For a few single stocks it may work differently: winners often keep winning for months. So it is tested here on 5
// years of the whole US market (stocks that later collapsed included). Read-only; never places an order.
// Portfolios: 10 stocks, 2,000 USD each (20,000 USD), held 12 months. New portfolios start every 3 months, 30 at each start, from two
// pools: ANY liquid stock (5 USD+, 5M USD+ traded a day) and STRONG stocks (top 30% of 6-month gains: the kind this system buys).
// Your rules apply: no trade under 1,000 USD, 3 USD fee per trade + 0.1% spread. A stock that disappears is sold at its last price -30%.
// Ways of managing them (fixed in advance):
//   HOLD     buy and never touch (the yardstick)
//   QUARTER  every 3 months, back to 10% each
//   BAND     every week: any stock over 15% of the portfolio is trimmed to 10%, the cash goes to the most underweight stocks (up to 10%)
//   NEWCASH  1,000 USD of new money each month, into the most underweight stock; compared with the same 1,000 USD into the biggest
//            winner (WINNERCASH). Nothing is sold in either.
// Judged on the gain after 12 months AND on the worst fall along the way (risk), per start date, older and newer half, and the bar
// rises with the number of versions (8). Output: data/rebalance.json.
import fs from 'node:fs';
import { belowLeague, BELOW } from './league-bar.mjs';   // a passing verdict must also clear the league luck bar (22 Oct 2026)
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org', OUT = 'data/rebalance.json';
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
fs.mkdirSync('data', { recursive: true });
const N = 10, START = 20000, H = 252, STEP = 63, PER = +(env.RB_PER || 30), FEE = 3, SPREAD = 0.001, MINTRADE = 1000, GONE = 0.7;
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 130 + H + STEP * 4) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + T + ' sessions' })); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; C[k] = x.c[j]; V[k] = x.v[j]; } }); store = null;
// liquidity and 6-month gain at each start date
const liquid = (i, t) => { const b = i * T, c = C[b + t]; if (!(c >= 5)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0 || !isFinite(C[b + k])) return false; dv += C[b + k] * V[b + k]; n++; } return dv / n >= 5e6; };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261015);
const pick = (pool, n) => { const a = [...pool]; for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a.slice(0, n); };
// price of stock i at session t; once it disappears for good, the portfolio keeps 70% of its last price as cash
function sim(ids, t0, mode) {
  const sh = new Float64Array(N), gone = new Uint8Array(N), last = new Float64Array(N); let cash = 0, invested = START, fees = 0, trades = 0;
  ids.forEach((i, k) => { const p = C[i * T + t0]; last[k] = p; const usd = START / N; sh[k] = (usd - FEE) * (1 - SPREAD) / p; fees += FEE; trades++; });
  const px = (k, t) => { const c = C[ids[k] * T + t]; if (isFinite(c) && c > 0) { last[k] = c; return c; } return last[k]; };
  const vanish = (k, t) => { if (gone[k]) return; let later = false; for (let j = t; j < Math.min(T, t + 15); j++) if (isFinite(C[ids[k] * T + j])) { later = true; break; } if (!later && t + 15 < T) { cash += sh[k] * last[k] * GONE; sh[k] = 0; gone[k] = 1; } };
  const trade = (k, usd, t) => { const p = px(k, t); if (Math.abs(usd) < MINTRADE || gone[k]) return false; if (usd > 0) { if (cash < usd) usd = cash; if (usd < MINTRADE) return false; sh[k] += (usd - FEE) * (1 - SPREAD) / p; cash -= usd; } else { const q = Math.min(sh[k], -usd / p); sh[k] -= q; cash += q * p * (1 - SPREAD) - FEE; } fees += FEE; trades++; return true; };
  let peak = START, mdd = 0;
  for (let t = t0 + 1; t <= t0 + H; t++) {
    for (let k = 0; k < N; k++) if (!isFinite(C[ids[k] * T + t])) vanish(k, t);
    const val = () => { let v = cash; for (let k = 0; k < N; k++) v += sh[k] * px(k, t); return v; };
    const d = t - t0;
    if (mode === 'QUARTER' && d % 63 === 0 && d < H) { const tot = val(), live = [...Array(N).keys()].filter(k => !gone[k]), tgt = tot / Math.max(1, live.length);
      for (const k of live) { const w = sh[k] * px(k, t); if (w > tgt) trade(k, tgt - w, t); } for (const k of live) { const w = sh[k] * px(k, t); if (w < tgt) trade(k, Math.min(tgt - w, cash), t); } }
    if (mode === 'BAND' && d % 5 === 0 && d < H) { const tot = val(); let did = false;
      for (let k = 0; k < N; k++) { const w = sh[k] * px(k, t); if (!gone[k] && w > 0.15 * tot) did = trade(k, 0.10 * tot - w, t) || did; }
      if (did) { const order = [...Array(N).keys()].filter(k => !gone[k]).sort((a, b) => sh[a] * px(a, t) - sh[b] * px(b, t)); for (const k of order) { const w = sh[k] * px(k, t); if (w < 0.10 * tot && cash >= MINTRADE) trade(k, Math.min(0.10 * tot - w, cash), t); } } }
    if ((mode === 'NEWCASH' || mode === 'WINNERCASH') && d % 21 === 0 && d < H) { cash += 1000; invested += 1000;
      const live = [...Array(N).keys()].filter(k => !gone[k]).sort((a, b) => sh[a] * px(a, t) - sh[b] * px(b, t)); if (live.length) trade(mode === 'NEWCASH' ? live[0] : live[live.length - 1], 1000, t); }
    const v = val(); if (v - (invested - START) > peak) peak = v - (invested - START); const dd = (v - (invested - START)) / peak - 1; if (dd < mdd) mdd = dd; }
  let v = cash, big = 0; for (let k = 0; k < N; k++) { const w = sh[k] * last[k]; v += w; } for (let k = 0; k < N; k++) big = Math.max(big, sh[k] * last[k] / v);
  return { ret: v / invested - 1, mdd, trades, fees, big }; }
// ---- run
const MODES = ['HOLD', 'QUARTER', 'BAND', 'NEWCASH', 'WINNERCASH'], POOLS = ['ANY', 'STRONG'], starts = [];
for (let t0 = 130; t0 + H < T; t0 += STEP) starts.push(t0);
const rows = { ANY: [], STRONG: [] };
for (const t0 of starts) { const liq = []; for (let i = 0; i < NS; i++) if (SYMS[i] !== 'SPY' && liquid(i, t0)) liq.push(i); if (liq.length < 100) continue;
  const g6 = liq.filter(i => isFinite(C[i * T + t0 - 126])).map(i => [i, C[i * T + t0] / C[i * T + t0 - 126] - 1]).sort((a, b) => b[1] - a[1]), strong = g6.slice(0, Math.ceil(g6.length * 0.3)).map(x => x[0]);
  for (const pool of POOLS) { const P = pool === 'ANY' ? liq : strong; if (P.length < 30) continue; const per = {}; for (const m of MODES) per[m] = [];
    for (let r = 0; r < PER; r++) { const ids = pick(P, N); for (const m of MODES) per[m].push(sim(ids, t0, m)); }
    rows[pool].push({ t0, d: D[t0], res: Object.fromEntries(MODES.map(m => [m, { ret: mean(per[m].map(x => x.ret)), mdd: mean(per[m].map(x => x.mdd)), trades: mean(per[m].map(x => x.trades)), big: mean(per[m].map(x => x.big)) }])) }); } }
// ---- verdicts: per start date (portfolios started the same day share the same market, so they count as one case)
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + z / 2), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
const zInv = (p) => { let lo = 0, hi = 10; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (0.5 * erfc(m / Math.SQRT2) > p) lo = m; else hi = m; } return (lo + hi) / 2; };
const NT = 4 * POOLS.length, TCRIT = Math.max(2, zInv(0.05 / 2 / NT));
const tst = (d) => { if (d.length < 3) return { n: d.length, diff: d.length ? mean(d) : null, t: null }; const m = mean(d), sd = Math.sqrt(d.reduce((u, v) => u + (v - m) ** 2, 0) / (d.length - 1)); return { n: d.length, diff: +m.toFixed(4), t: sd > 0 ? +(m / (sd / Math.sqrt(d.length))).toFixed(2) : null }; };
const RES = {};
for (const pool of POOLS) { const R = rows[pool], mid = Math.floor(R.length / 2), halves = { older: R.slice(0, mid), newer: R.slice(mid) };
  for (const [m, base] of [['QUARTER', 'HOLD'], ['BAND', 'HOLD'], ['NEWCASH', 'WINNERCASH']]) { const out = { pool, mode: m, vs: base };
    for (const h of ['older', 'newer']) { const a = halves[h]; out[h] = { starts: a.length, ret: mean(a.map(x => x.res[m].ret)), baseRet: mean(a.map(x => x.res[base].ret)), mdd: mean(a.map(x => x.res[m].mdd)), baseMdd: mean(a.map(x => x.res[base].mdd)),
      gain: tst(a.map(x => x.res[m].ret - x.res[base].ret)), safer: tst(a.map(x => x.res[m].mdd - x.res[base].mdd)), trades: mean(a.map(x => x.res[m].trades)), big: mean(a.map(x => x.res[m].big)), baseBig: mean(a.map(x => x.res[base].big)) }; }
    const both = (k, sgn) => ['older', 'newer'].every(h => out[h][k].diff * sgn > 0 && out[h][k].t !== null && Math.abs(out[h][k].t) >= TCRIT);
    const enough = out.older.starts >= 6 && out.newer.starts >= 6;
    out.moreProfit = enough && both('gain', 1); out.lessProfit = enough && both('gain', -1); out.lowerRisk = enough && both('safer', 1); out.higherRisk = enough && both('safer', -1);
    out.verdict = !enough ? 'NOT ENOUGH HISTORY' : out.moreProfit && !out.higherRisk ? 'BETTER' : out.lowerRisk && !out.lessProfit ? 'SAFER, SAME PROFIT' : out.lowerRisk && out.lessProfit ? 'SAFER BUT LESS PROFIT' : out.lessProfit ? 'WORSE' : 'NO CLEAR DIFFERENCE';
    if (/^(BETTER|SAFER, SAME PROFIT)$/.test(out.verdict)) { const k = out.verdict === 'BETTER' ? 'gain' : 'safer', lw = belowLeague(['older', 'newer'].map(h => Math.abs(out[h][k].t)), TCRIT); if (lw) { out.ownVerdict = out.verdict; out.verdict = BELOW; out.why = (out.ownVerdict === 'BETTER' ? 'more profit than holding' : 'safer than holding at the same profit') + ' in both halves; ' + lw; } }
    RES[pool + '_' + m] = out; } }
const out = { generatedAt: new Date().toISOString(), status: 'OK', from: rows.ANY.length ? rows.ANY[0].d : null, to: rows.ANY.length ? rows.ANY[rows.ANY.length - 1].d : null, starts: rows.ANY.length, perStart: PER, tCrit: +TCRIT.toFixed(2), results: RES, rules: { stocks: N, start: START, minTrade: MINTRADE, fee: FEE, band: '15% -> 10%' } };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const NAME = { QUARTER: 'Back to equal weights every 3 months', BAND: 'Trim any stock over 15% back to 10%, add to the laggards', NEWCASH: 'New cash into the most underweight stock (vs into the biggest winner)' };
const msg = ['REBALANCING TEST (' + out.from + ' to ' + out.to + ' starts, 10-stock portfolios held 12 months, ' + PER + ' at each of ' + out.starts + ' start dates, your 1,000 USD minimum and 3 USD fees)', ''];
for (const pool of POOLS) { msg.push(pool === 'ANY' ? 'ANY LIQUID STOCKS:' : 'STRONG STOCKS (top 30% of 6-month gains):');
  for (const m of ['QUARTER', 'BAND', 'NEWCASH']) { const r = RES[pool + '_' + m]; if (!r) continue; const n = r.newer;
    msg.push('- ' + NAME[m] + ': ' + r.verdict + ' | newer half: ' + pc(n.ret) + ' vs ' + pc(n.baseRet) + ' a year, worst fall ' + pc(n.mdd) + ' vs ' + pc(n.baseMdd) + ', biggest stock ' + Math.round(n.big * 100) + '% of the portfolio vs ' + Math.round(n.baseBig * 100) + '%'); }
  msg.push(''); }
msg.push('Research only. Your  rebalance  message uses this result to decide whether to tell you to trim.');
console.log(msg.join('\n'));
const QUIET_ = (() => { try { return JSON.parse(fs.readFileSync('data/settings.json', 'utf8')).quiet !== false; } catch (e) { return true; } })();   // quiet (default): study results stay in the files and reach you through ACTIONS and the weekly report
if (env.TG_TOKEN && env.TG_CHAT && !QUIET_) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
