// CHAINS: how each link of a value chain is doing (AI: chip equipment -> chips -> networking -> servers -> power -> data centers ->
// cloud -> software -> security ...), and how every industry is doing, from the 5-year whole-market price cache (no extra data calls).
// For each layer and each industry: average return over 1, 3 and 6 months of its members, against the S&P 500 over the same days.
// Read by scan.mjs for the STOCK MAP (snapshot SYM / check SYM / second opinion). Context only, never a buy signal by itself.
// Runs weekly in the leaders-study job after the cache is loaded. Output: data/chains-status.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, OUT = 'data/chains-status.json';
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('chains: no price cache'); process.exit(0); }
const CH = JSON.parse(fs.readFileSync('data/chains.json', 'utf8')).chains;
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 130) { console.log('chains: too few sessions'); process.exit(0); }
const t0 = T - 1, back = { r1: 21, r3: 63, r6: 126 }, at = (t) => { const x = store.days[D[t]], m = new Map(); for (let j = 0; j < x.T.length; j++) m.set(x.T[j], x.c[j]); return m; };
const now = at(t0), past = Object.fromEntries(Object.entries(back).map(([k, n]) => [k, at(t0 - n)]));
const ret = (s, k) => { const a = past[k].get(s), b = now.get(s); return a > 0 && b > 0 ? b / a - 1 : null; };
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, med = (a) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const spy = Object.fromEntries(Object.keys(back).map(k => [k, ret('SPY', k)]));
const group = (syms) => { const o = { n: 0 }; for (const k of Object.keys(back)) { const v = syms.map(s => ret(s, k)).filter(x => x !== null && isFinite(x)); o[k] = v.length ? +med(v).toFixed(4) : null; o.n = Math.max(o.n, v.length); } return o; };
const chains = {}; for (const [name, layers] of Object.entries(CH)) chains[name] = layers.map(L => ({ layer: L.layer, ...group(L.syms), members: L.syms.map(s => ({ s, r3: ret(s, 'r3') === null ? null : +ret(s, 'r3').toFixed(3) })) }));
// every industry (3-digit SEC industry code from the cache's reference data), 5+ liquid members
const sic = store.sic || {}, byInd = {}; for (const [s, x] of Object.entries(sic)) { if (!x || !x.c || !now.has(s)) continue; const g = x.c.slice(0, 3); (byInd[g] = byInd[g] || { name: x.n, syms: [] }).syms.push(s); }
const ind = {}, symInd = {}; for (const [g, v] of Object.entries(byInd)) { if (v.syms.length < 5) continue; ind[g] = { name: v.name, ...group(v.syms) }; for (const s of v.syms) symInd[s] = g; }
const ranked = Object.entries(ind).filter(([, v]) => v.r3 !== null).sort((a, b) => b[1].r3 - a[1].r3); ranked.forEach(([g], n) => { ind[g].rank = n + 1; }); const nInd = ranked.length;
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), asOf: D[t0], spy, chains, ind, nInd, symInd }));
const pc = (x) => x === null || x === undefined ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
console.log('CHAINS ' + D[t0] + ' (3 months, S&P 500 ' + pc(spy.r3) + ')');
for (const [name, ls] of Object.entries(chains)) { console.log(name + ':'); for (const L of ls) console.log('  ' + L.layer + ': ' + pc(L.r3) + ' (' + L.n + ' stocks)'); }
console.log(nInd + ' industries ranked.');
