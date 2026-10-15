// SELL NOW, BUY BACK LOWER? The owner's question: "do I sell some stocks, keep the cash, and buy them again at lower prices?"
// This tests it on 5 years of the whole US market (stocks that later collapsed included). Read-only; never places an order.
// At a fixed moment (the trigger), compare two owners of the same stock:
//   HOLDER  keeps the stock.
//   SWITCHER sells at the next open, then buys the same stock back by a fixed rule, and in any case buys it back after 60 sessions
//            if the rule never fired (so both end up holding it on day 60 and are compared on the same day).
// Costs: 0.4% per side (your 3 USD fee on about 1,000 USD + the spread), 0.6% per side as stress.
// Triggers (fixed in advance):
//   STRETCH  the stock closes 30%+ above its 50-day average (it "ran too far")
//   SPIKE    the stock rose 25%+ in 10 sessions
//   FALLING  the stock closes under its 50-day average after dropping 10%+ from its 20-day high (it "is falling, get out and re-enter lower")
// Buy-back rules (fixed in advance):
//   LOWER10  a buy order 10% under the sell price (filled at that price, or at the open if it opens below it)
//   UPTURN   buy at the next open after the first close back above the 20-day average (re-enter when it turns up again)
// The switch WINS only if it beats holding in both halves of the 5 years, by more than luck (6 versions -> rising bar), without its
// 2 best cases, with no single stock making over 25% of the gain. It also reports how often the stock never came back lower.
// Output: data/rebuy.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org', OUT = 'data/rebuy.json';
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
fs.mkdirSync('data', { recursive: true });
const SIDE = 0.004, SIDE_S = 0.006, H = 60;
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + T + ' sessions' })); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), LO = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; LO[k] = x.l ? x.l[j] : Math.min(x.o[j], x.c[j]); V[k] = x.v[j]; } }); store = null;
const TRIG = ['STRETCH', 'SPIKE', 'FALLING'], REBUY = ['LOWER10', 'UPTURN'];
const TNAME = { STRETCH: 'stock 30%+ above its 50-day average', SPIKE: 'stock up 25%+ in 10 sessions', FALLING: 'stock falling: under its 50-day average, 10%+ off its 20-day high' };
const RNAME = { LOWER10: 'buy back 10% lower (or after 60 sessions)', UPTURN: 'buy back when it closes above its 20-day average again (or after 60 sessions)' };
const cases = {}; for (const a of TRIG) for (const b of REBUY) cases[a + '/' + b] = [];
for (let i = 0; i < NS; i++) { const b = i * T, q20 = [], q50 = [], dq = []; let s20 = 0, s50 = 0, dv = 0; const a20 = new Float32Array(T).fill(NaN), a50 = new Float32Array(T).fill(NaN), ok = new Uint8Array(T), hi20 = new Float32Array(T).fill(NaN);
  for (let t = 0; t < T; t++) { const c = C[b + t]; if (!isFinite(c)) { q20.length = q50.length = dq.length = 0; s20 = s50 = dv = 0; continue; }
    q20.push(c); s20 += c; if (q20.length > 20) s20 -= q20.shift(); q50.push(c); s50 += c; if (q50.length > 50) s50 -= q50.shift();
    if (q20.length === 20) { a20[t] = s20 / 20; hi20[t] = Math.max(...q20); } if (q50.length === 50) a50[t] = s50 / 50;
    dq.push(c * V[b + t]); dv += c * V[b + t]; if (dq.length > 20) dv -= dq.shift(); ok[t] = c >= 5 && dq.length === 20 && dv / 20 >= 5e6 ? 1 : 0; }
  const nextFree = {};
  for (let t = 60; t < T - H - 2; t++) { if (!ok[t]) continue; const c = C[b + t], p = C[b + t - 1];
    const hit = { STRETCH: a50[t] > 0 && c >= a50[t] * 1.3 && !(p >= a50[t - 1] * 1.3), SPIKE: isFinite(C[b + t - 10]) && c >= C[b + t - 10] * 1.25 && !(isFinite(C[b + t - 11]) && p >= C[b + t - 11] * 1.25),
      FALLING: a50[t] > 0 && c < a50[t] && hi20[t] > 0 && c <= hi20[t] * 0.9 && !(p < a50[t - 1] && p <= hi20[t - 1] * 0.9) };
    for (const tg of TRIG) { if (!hit[tg]) continue;
      const sp = O[b + t + 1], end = C[b + t + H]; if (!(sp > 0) || !(end > 0)) continue;
      for (const rb of REBUY) { const key = tg + '/' + rb; if (t < (nextFree[key] || 0)) continue;
        let px = null, when = null;
        for (let k = t + 2; k <= t + H && px === null; k++) { const o = O[b + k], lo = LO[b + k], cc = C[b + k]; if (!isFinite(cc)) continue;
          if (rb === 'LOWER10') { const lim = sp * 0.9; if (o > 0 && o <= lim) { px = o; when = k; } else if (lo <= lim) { px = lim; when = k; } }
          else if (rb === 'UPTURN' && cc > a20[k] && k + 1 <= t + H && O[b + k + 1] > 0) { px = O[b + k + 1]; when = k + 1; } }
        const back = px !== null; if (!back) { px = end; when = t + H; }
        // value on day 60 per 1 USD at the trigger: holder end/sp; switcher (1-c)^2 * sp/px * end/sp  ->  advantage = (1-c)^2 * sp/px - 1
        cases[key].push({ t, s: SYMS[i], adv: (1 - SIDE) ** 2 * sp / px - 1, advS: (1 - SIDE_S) ** 2 * sp / px - 1, back, days: when - t, hold: end / sp - 1 });
        nextFree[key] = t + H; } } } }
// ---- verdicts
const mid = Math.floor((60 + T - H) / 2), NT = TRIG.length * REBUY.length;
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + z / 2), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
const zInv = (p) => { let lo = 0, hi = 10; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (0.5 * erfc(m / Math.SQRT2) > p) lo = m; else hi = m; } return (lo + hi) / 2; };
const TCRIT = Math.max(2, zInv(0.05 / 2 / NT));
const stat = (a, f = 'adv') => { if (a.length < 3) return { n: a.length }; const d = a.map(x => x[f]), m = mean(d), sd = Math.sqrt(d.reduce((u, v) => u + (v - m) ** 2, 0) / (d.length - 1)), srt = [...d].sort((u, v) => v - u), byS = {}; let pos = 0;
  for (let k = 0; k < a.length; k++) if (d[k] > 0) { byS[a[k].s] = (byS[a[k].s] || 0) + d[k]; pos += d[k]; }
  return { n: d.length, adv: +m.toFixed(4), t: sd > 0 ? +(m / (sd / Math.sqrt(d.length))).toFixed(2) : null, better: +(d.filter(x => x > 0).length / d.length).toFixed(3), cameBack: +(a.filter(x => x.back).length / a.length).toFixed(3),
    holdAvg: +mean(a.map(x => x.hold)).toFixed(4), worst: +Math.min(...d).toFixed(3), noTop2: srt.length > 2 ? +(srt.slice(2).reduce((u, v) => u + v, 0) / (srt.length - 2)).toFixed(4) : null, topStock: pos > 0 ? +(Math.max(...Object.values(byS)) / pos).toFixed(3) : null, days: (bk => bk.length ? +mean(bk).toFixed(1) : null)(a.filter(x => x.back).map(x => x.days)) }; };
const RES = {};
for (const key of Object.keys(cases)) { const a = cases[key], R = { older: stat(a.filter(x => x.t < mid)), newer: stat(a.filter(x => x.t >= mid)), stress: stat(a.filter(x => x.t >= mid), 'advS') }, why = [];
  let verdict = 'SWITCH WINS';
  if (R.older.n < 40 || R.newer.n < 40) { verdict = 'NOT PROVEN'; why.push('too few cases (' + R.older.n + ' / ' + R.newer.n + '; 40 each needed)'); }
  else { for (const h of ['older', 'newer']) { if (!(R[h].adv > 0)) why.push('holding did better in the ' + h + ' half (switch ' + pc(R[h].adv) + ')'); else if (!(R[h].t >= TCRIT)) why.push('switch ahead by ' + pc(R[h].adv) + ' in the ' + h + ' half, but that could be luck (t ' + R[h].t + ', ' + TCRIT.toFixed(1) + ' needed)'); }
    if (!(R.stress.adv > 0)) why.push('loses at higher costs'); if (!(R.newer.noTop2 > 0)) why.push('the gain disappears without its 2 best cases'); if (R.newer.topStock > 0.25) why.push('one stock made over 25% of the gain');
    if (why.length) verdict = R.older.adv < 0 && R.newer.adv < 0 ? 'HOLDING WINS' : 'NOT PROVEN'; }
  const [tg, rb] = key.split('/'); RES[key] = { trigger: tg, rebuy: rb, name: TNAME[tg] + ' -> sell, ' + RNAME[rb], verdict, why: why.join('; ') || 'selling and buying back beat holding in both halves, beyond luck, at stress cost', results: R }; }
const out = { generatedAt: new Date().toISOString(), status: 'OK', from: D[60], to: D[T - H - 3], versions: NT, tCrit: +TCRIT.toFixed(2), costPerSide: SIDE, results: RES };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const msg = ['SELL NOW, BUY BACK LOWER? (' + out.from + ' to ' + out.to + ', whole market, compared on day 60 with simply holding, costs included)', ''];
for (const r of Object.values(RES)) { const n = r.results.newer; msg.push(r.name + ': ' + r.verdict + (n.n ? ' | newer half ' + n.n + ' cases: switch ' + pc(n.adv) + ' vs holding, better ' + Math.round(n.better * 100) + '% of the time, came back to the buy-back price ' + Math.round(n.cameBack * 100) + '% of the time' : '')); }
msg.push('', NT + ' versions, bar t ' + TCRIT.toFixed(1) + '. Research only.');
console.log(msg.join('\n'));
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
