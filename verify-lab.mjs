// VERIFY LAB (independent check, 24 Oct 2026). Before real money goes into the two rules that feed TRY SMALL buys, SQ6-MTUM and SQ1-BBAUTH
// are re-implemented here FROM THEIR WRITTEN SPECS (verify-core.mjs), without the squads' rule code, run on the same 5-year whole-market
// price cache, and compared trade by trade with the squads' frozen outputs (data/squad6-lab.json, data/squad1-lab.json). Reused: only the
// shared data (study-cache price cache, data/shares.json.gz, data/sec-ciks.json, data/splits.json) and the shared judge (value-core.mjs).
// The 8-K data is fetched again here from SEC EDGAR full-text search and every matched document is read and parsed by verify-core.mjs.
// Writes data/verify-lab.json only (and its own verify-cache/). Never places an order; never touches another lab's files.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { halfStat, judge } from './value-core.mjs';
import { COST, avg, sdev, cap, half, rd, plusDays, sessionAfter, lastSessionsOf, closeOnOrBefore, firstBar, lastBar, holdReturn, liquidSeries, tradedValue63, weeklyReturnsUpTo,
  msciMomentumPick, textOf, authorizedSize, sizeOfCompany, sharesKnownOn, firstPerKey, sameStockOtherDays, compareTrades, frogInPan, quantMomentumPick, splitsAfter, rollingMaxClose, rollingMean, pullbackAt } from './verify-core.mjs';
import { execFileSync } from 'node:child_process';
const env = process.env, ONLY = new Set(String(env.VERIFY_ONLY || 'mtum,bbauth,qmom,pb12').split(',')), want = (k) => ONLY.has(k), OUT = 'data/verify-lab.json', VC = env.VERIFY_CACHE || 'verify-cache', LOG = [];
const t0 = Date.now(), log = (...a) => { const s = '[' + ((Date.now() - t0) / 1000).toFixed(0) + 's] ' + a.join(' '); LOG.push(s.slice(0, 600)); console.log(s); };
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const save = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const hide = (s) => String(s).replace(/(apiKey|token)=[^&\s]+/gi, '$1=***');
fs.mkdirSync(VC, { recursive: true });

// ================= PRICES: the shared 5-year cache, plus the sessions since (Massive grouped bars) =================
const store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('verify-lab: no price cache; nothing done'); process.exit(1); }
let nCalls = 0; async function massive(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (nCalls++) await sleep(130); let r; try { r = await fetch('https://api.massive.com' + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (!r.ok) { if (r.status === 401 || r.status === 403 || r.status === 404) return null; await sleep(3000); continue; } return r.json().catch(() => null); } return null; }
const ref = new Set(store.ref ? store.ref.syms : []), cacheEnd = Object.keys(store.days).sort().pop(), freshDays = [];
for (let ms = Date.parse(cacheEnd + 'T00:00:00Z') + 864e5; ms <= Date.now(); ms += 864e5) { const d = isoOf(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await massive('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || !Array.isArray(j.results) || !j.results.length) continue;
  const rows = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (ref.has(x.T) || x.T === 'SPY' || !ref.size) && x.c > 0);
  store.days[d] = { T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) }; freshDays.push(d); }
const D = Object.keys(store.days).sort(), T = D.length, idx = new Map(), names = [];
const symId = (s) => { let i = idx.get(s); if (i === undefined) { i = names.length; idx.set(s, i); names.push(s); } return i; };
for (const d of D) { const x = store.days[d]; x.T.forEach(symId); if (x.x) x.x.T.forEach(symId); }
const NS = names.length, O = new Float64Array(NS * T), C = new Float64Array(NS * T), V = new Float64Array(NS * T);
D.forEach((d, t) => { const x = store.days[d]; for (const part of [x, x.x]) { if (!part || !part.T) continue; for (let j = 0; j < part.T.length; j++) { const q = idx.get(part.T[j]) * T + t; if (C[q] > 0) continue; O[q] = +part.o[j] || 0; C[q] = +part.c[j] || 0; V[q] = +part.v[j] || 0; } } });
const SICS = store.sic || {}; for (const k of Object.keys(store.days)) delete store.days[k];
const row = (A, i) => A.subarray(i * T, (i + 1) * T);
// splits executed after the cache's last day: the cache rows (<= cacheEnd) are on the old basis, the fresh rows on the new one, so the
// break sits between cacheEnd and the first fresh session. Repaired only when the price break there matches the split ratio.
let splitFix = []; if (freshDays.length) { const j = await massive('/stocks/v1/splits?execution_date.gte=' + plusDays(cacheEnd, 1) + '&limit=1000'), list = j && Array.isArray(j.results) ? j.results : [];
  const tc = D.indexOf(cacheEnd);
  for (const s of list) { const i = idx.get(String(s.ticker || '').toUpperCase()), r = +s.split_to / +s.split_from; if (i === undefined || !(r > 0) || r === 1 || /dividend/i.test(String(s.adjustment_type || ''))) continue;
    const c = row(C, i), a = closeOnOrBefore(c, tc, 10); let b = null; for (let q = tc + 1; q < T && b === null; q++) if (c[q] > 0) b = c[q]; if (!(a > 0) || !(b > 0)) continue;
    const jump = Math.log(a / b); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump) / 2)) continue;
    for (let q = 0; q <= tc; q++) { O[i * T + q] /= r; C[i * T + q] /= r; V[i * T + q] *= r; } splitFix.push(names[i] + ' ' + s.execution_date + ' x' + rd(r, 3)); } }
const SPY = idx.get('SPY');
log('prices: ' + T + ' sessions ' + D[0] + '..' + D[T - 1] + ', ' + NS + ' symbols; cache to ' + cacheEnd + ', fresh ' + (freshDays.join(',') || 'none') + '; post-cache splits repaired: ' + (splitFix.join('; ') || 'none'));
const LIQ = new Uint8Array(NS * T); for (let i = 0; i < NS; i++) { if (i === SPY) continue; LIQ.set(liquidSeries(row(C, i), row(V, i)), i * T); }
const liquidAt = new Map(), liquidList = (t) => { if (!liquidAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liquidAt.set(t, a); } return liquidAt.get(t); };
const ret = (i, k, x) => { const r = holdReturn(row(O, i), row(C, i), k, Math.min(x, T - 1)); return r; };
// the average liquid stock bought at the open of k and sold at the close of x (gone: last close), every gross return capped at +300%
const yMemo = new Map(); function yardstick(k, x) { const key = k + '|' + x; if (yMemo.has(key)) return yMemo.get(key); const all = [];
  for (const i of liquidList(k - 1)) { const r = ret(i, k, x); if (!r) continue; all.push(cap(r.g)); } const m = all.length >= 50 ? avg(all) : null; yMemo.set(key, m); return m; }
// one-day close jumps of 2.5x+ (either way) inside (k, x]: a split the data did not adjust shows up like this
const SPL = J('data/splits.json', { splits: [] }).splits || [], splitsBy = new Map(); for (const s of SPL) (splitsBy.get(s.s) || splitsBy.set(s.s, []).get(s.s)).push(s);
function jumpsIn(i, k, x) { const c = row(C, i), out = []; let p = closeOnOrBefore(c, k, 5); for (let q = k + 1; q <= Math.min(x, T - 1); q++) { if (!(c[q] > 0)) continue; if (p > 0) { const r = c[q] / p; if (r >= 2.5 || r <= 0.4) out.push([D[q], rd(r, 3)]); } p = c[q]; } return out; }
// a split on the official list inside (k, x] whose ratio shows in the closes around it = NOT adjusted in the data
function unadjustedSplits(i, k, x) { const out = []; for (const s of splitsBy.get(names[i]) || []) { const q = sessionAfter(D, plusDays(s.d, -1)); if (q <= k || q > x || q >= T) continue; const c = row(C, i), a = closeOnOrBefore(c, q - 1, 10), b = c[q] > 0 ? c[q] : null;
    if (a > 0 && b > 0 && s.r > 0 && s.r !== 1 && Math.abs(Math.log(a / b) - Math.log(s.r)) < Math.abs(Math.log(a / b)) / 2) out.push([s.d, s.r]); } return out; }
const ownVariant = (i, len, hf, taken, from) => sameStockOtherDays({ from, last: T - 1, len, okStart: (u) => LIQ[i * T + u - 1] === 1 && half(D[u]) === hf, taken, ret: (u, x) => { const r = ret(i, u, x); return r ? r.g : null; } });
function judged(trades, hold) { const z = (h) => trades.filter(x => x.half === h).map(x => ({ t: x.t, s: x.s, g: x.g, c: x.c, own: x.own }));
  const R = { older: halfStat(z('older'), hold), newer: halfStat(z('newer'), hold), all: halfStat(z('older').concat(z('newer')), hold) }; return { ...judge(R, { bar: 4.02 }), results: R }; }
const withOwn = (trades, from) => { const taken = new Map(); for (const z of trades) (taken.get(z.i) || taken.set(z.i, []).get(z.i)).push([z.k, z.x]);
  const memo = new Map(); return trades.map(z => { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!memo.has(key)) memo.set(key, ownVariant(z.i, len, z.half, taken.get(z.i), from)); return { ...z, own: memo.get(key) }; }); };
const compact = (z) => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.exitAt], net: rd(z.g - COST), avgStock: z.c === null ? null : rd(z.c - COST), sameStock: z.own === null || z.own === undefined ? null : rd(z.own - COST) });
const OUTPUT = { ...J(OUT, {}), generatedAt: new Date().toISOString(), what: 'Independent re-implementation of SQ6-MTUM and SQ1-BBAUTH from their written specs (verify-core.mjs), compared with the squads\' frozen results', window: [D[0], D[T - 1]], cost: COST, prices: { sessions: T, symbols: NS, cacheEnd, fresh: freshDays, postCacheSplitsRepaired: splitFix } };

// ================= SQ6-MTUM =================
if (want('mtum')) { const forms = lastSessionsOf(D, [5, 11]).filter(t => t >= 252), trades = [], formInfo = [];
  for (const t of forms) {
    const cand = []; for (const i of liquidList(t)) { const c = row(C, i), fb = firstBar(c); if (fb < 0 || fb > t - 252) continue; const tv = tradedValue63(c, row(V, i), t); if (Number.isFinite(tv)) cand.push([i, tv]); }
    cand.sort((a, b) => b[1] - a[1]); const uni = cand.slice(0, 600).map(x => x[0]);
    const rows = uni.map(i => { const c = row(C, i), a = closeOnOrBefore(c, t - 21, 5), b12 = closeOnOrBefore(c, t - 252, 5), b6 = closeOnOrBefore(c, t - 126, 5), w = weeklyReturnsUpTo(D, c, t, 156);
      const vol = w.length >= 52 ? sdev(w) * Math.sqrt(52) : null; return { id: i, m12: a > 0 && b12 > 0 ? a / b12 - 1 : null, m6: a > 0 && b6 > 0 ? a / b6 - 1 : null, vol }; });
    const picks = msciMomentumPick(rows, Math.ceil(uni.length * 0.20)); let filled = 0, open = 0;
    for (const i of picks) { const k = t + 1, x = t + 126; if (x > T - 1) { open++; continue; } const r = ret(i, k, x); if (!r) continue; filled++;
      trades.push({ t, i, s: names[i], k, x: r.exitAt, exitAt: r.exitAt, gone: r.gone, g0: r.g, g: cap(r.g), c: yardstick(k, r.exitAt), half: half(D[t]), jumps: jumpsIn(i, k, r.exitAt), unadj: unadjustedSplits(i, k, r.exitAt) }); }
    formInfo.push({ d: D[t], universe: uni.length, withVol: rows.filter(r => r.vol).length, picks: picks.length, filled, open }); }
  const tr = withOwn(trades.filter(z => z.c !== null), 253), tr0 = withOwn(trades.filter(z => z.c !== null), 20);
  const main = judged(tr, 126), ownAll = judged(tr0, 126), noArt = judged(tr.filter(z => !z.unadj.length && !z.jumps.length), 126);
  const perForm = forms.map(t => { const a = tr.filter(z => z.t === t); return { d: D[t], n: a.length, avgNet: rd(avg(a.map(z => z.g - COST))), yard: rd(avg(a.map(z => z.c))), gone: a.filter(z => z.gone).length, capped: a.filter(z => z.g0 > 3).length }; }).filter(x => x.n);
  // the squad's frozen numbers and their saved trade list (the last 300)
  const SQ = J('data/squad6-lab.json', {}), FR = (SQ.firstRun || {})['SQ6-MTUM'], THEIRS = (SQ.trades || {})['SQ6-MTUM'] || [];
  const mine = tr.map(compact), cmp = compareTrades(mine, THEIRS);
  // audit of their saved trades: signal on the last session of May / November, buy the next session, sell at session 126 (or earlier: gone)
  const audit = { checked: THEIRS.length, sigNotMonthEnd: 0, buyNotNext: 0, sellNot126: 0, sellEarly: [], capped: 0, yardNotSameForSameDays: 0 };
  const yardBy = new Map(); for (const z of THEIRS) { const ts = D.indexOf(z.sig), tb = D.indexOf(z.buy), tx = D.indexOf(z.sell);
    if (!(ts >= 0 && ts + 1 < T && D[ts + 1].slice(0, 7) !== D[ts].slice(0, 7) && ['05', '11'].includes(z.sig.slice(5, 7)))) audit.sigNotMonthEnd++; if (tb !== ts + 1) audit.buyNotNext++;
    if (tx !== tb + 125) { audit.sellNot126++; if (audit.sellEarly.length < 20) audit.sellEarly.push(z.s + ' ' + z.buy + '->' + z.sell + ' (' + (tx - tb + 1) + ' sessions, last bar ' + (idx.has(z.s) ? D[lastBar(row(C, idx.get(z.s)))] : '?') + ')'); }
    if (z.net >= 3 - COST - 1e-4) audit.capped++; const k = z.buy + '|' + z.sell; if (yardBy.has(k) && Math.abs(yardBy.get(k) - z.avgStock) > 1e-4) audit.yardNotSameForSameDays++; yardBy.set(k, z.avgStock); }
  // the same subset both ways (the trades in their file that I also have)
  const M = new Map(mine.map(z => [z.s + '|' + z.sig, z])), both = THEIRS.filter(z => M.has(z.s + '|' + z.sig));
  const sub = { n: both.length, theirsAvgNet: rd(avg(both.map(z => z.net))), mineAvgNet: rd(avg(both.map(z => M.get(z.s + '|' + z.sig).net))), theirsAvgStock: rd(avg(both.map(z => z.avgStock))), mineAvgStock: rd(avg(both.map(z => M.get(z.s + '|' + z.sig).avgStock))) };
  const theirSigs = [...new Set(THEIRS.map(z => z.sig))].sort();
  OUTPUT.mtum = { spec: 'SQ6-MTUM (library entry): last session of May / November; 600 most traded liquid stocks (63-session traded value) with 252+ sessions; 12-1 and 6-1 momentum / annualised weekly sd (<=156 weeks, 52+), z, 50/50, re-z, +-3; top 20% with positive z; buy next open, sell the close of session 126; cap +300% both sides; cost 0.8%',
    formations: formInfo, perFormation: perForm, verdictMine: main.verdict, whyMine: main.why, mine: main.results, frozen: FR ? { verdict: FR.verdict, why: FR.why, older: FR.results.older, newer: FR.results.newer, notes: FR.notes, exits: FR.exits } : null,
    variants: { sameStockFromSession20: { verdict: ownAll.verdict, older: ownAll.results.older, newer: ownAll.results.newer }, withoutSplitJumpTrades: { verdict: noArt.verdict, older: noArt.results.older, newer: noArt.results.newer } },
    splitAudit: { tradesWithJump: tr.filter(z => z.jumps.length).map(z => z.s + ' ' + D[z.k] + ' ' + JSON.stringify(z.jumps)).slice(0, 30), tradesWithUnadjustedListedSplit: tr.filter(z => z.unadj.length).map(z => z.s + ' ' + D[z.k] + ' ' + JSON.stringify(z.unadj)).slice(0, 30), capped: tr.filter(z => z.g0 > 3).map(z => z.s + ' ' + D[z.k] + ' ' + rd(z.g0)) },
    dead: { gone: tr.filter(z => z.gone).length, examples: tr.filter(z => z.gone).slice(0, 15).map(z => z.s + ' ' + D[z.k] + '->' + D[z.exitAt] + ' ' + rd(z.g)) },
    theirFile: { trades: THEIRS.length, signalDates: theirSigs, audit }, compare: cmp, sameSubset: sub, trades: mine };
  log('MTUM mine: ' + main.verdict + ' | older ' + JSON.stringify(main.results.older).slice(0, 260) + ' | newer ' + JSON.stringify(main.results.newer).slice(0, 260));
  log('MTUM compare: ' + JSON.stringify({ ...cmp, bigNetDiff: cmp.bigNetDiff.length, onlyTheirs: cmp.onlyTheirs.length, onlyMine: cmp.onlyMine.length })); }

// ================= SQ1-BBAUTH =================
const UA = env.SEC_UA || 'stock-2 verify research admin@users.noreply.github.com';
let lastReq = 0, secN = 0, secBad = 0; async function sec(url, kind) { if (env.VERIFY_OFFLINE) return undefined; for (let a = 0; a < 4; a++) { const w = 130 - (Date.now() - lastReq); if (w > 0) await sleep(w); lastReq = Date.now(); secN++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(60000) }); if (r.status === 404) return kind === 'text' ? '' : null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2500 * (a + 1)); continue; } if (!r.ok) { secBad++; return undefined; } return kind === 'text' ? await r.text() : await r.json(); } catch (e) { await sleep(1500 * (a + 1)); } }
  secBad++; return undefined; }
// the phrases of the spec's BUYBACK_PHRASES list (the list of phrases is data the spec names, copied here, not the squad's code)
const PHRASES = ['authorized a new share repurchase', 'approved a new share repurchase', 'authorized a share repurchase program', 'approved a share repurchase program', 'authorized a new stock repurchase', 'approved a new stock repurchase',
  'authorized a stock repurchase program', 'approved a stock repurchase program', 'authorized the repurchase of up to', 'approved the repurchase of up to', 'new share repurchase program', 'new stock repurchase program', 'new repurchase authorization',
  'increase to its share repurchase', 'increase in its share repurchase', 'authorized a new buyback', 'new buyback program'];
const monthsFrom = (m0) => { const o = []; let [y, m] = m0.split('-').map(Number); const now = isoOf(Date.now()).slice(0, 7); while (true) { const s = y + '-' + String(m).padStart(2, '0'); if (s > now) break; o.push(s); m++; if (m > 12) { m = 1; y++; } } return o; };
const monthLast = (m) => isoOf(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0));
if (want('bbauth')) await runBbauth();
async function search(phrase, a, b) { const out = []; for (let from = 0; ; from += 100) {
    const j = await sec('https://efts.sec.gov/LATEST/search-index?q=' + encodeURIComponent('"' + phrase + '"') + '&forms=8-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from, 'json');
    if (!j || !j.hits) return null; const total = (j.hits.total && j.hits.total.value) || 0, hs = j.hits.hits || [];
    if (from === 0 && total >= 9900 && a < b) { const mid = isoOf((Date.parse(a) + Date.parse(b)) / 2), x = await search(phrase, a, mid), y = await search(phrase, plusDays(mid, 1), b); return x && y ? x.concat(y) : null; }
    for (const h of hs) { const s = h._source || {}, tk = []; for (const n of s.display_names || []) { const m = /\(([A-Z0-9.,\s-]+)\)\s*\(CIK/.exec(String(n)); if (m) tk.push(...m[1].split(',').map(z => z.trim()).filter(Boolean)); }
      out.push({ id: h._id, adsh: s.adsh, cik: +((s.ciks || [])[0] || 0), d: s.file_date, form: s.form || s.file_type || '', tk }); }
    if (hs.length < 100 || from + 100 >= total) break; } return out; }
async function runBbauth() { const hits = [], miss = [], thisMonth = isoOf(Date.now()).slice(0, 7); let fetched = 0;
  for (const p of PHRASES) for (const m of monthsFrom('2021-07')) { const f = VC + '/efts/' + p.replace(/[^a-z0-9]+/gi, '-') + '/' + m + '.json'; let h = m < thisMonth ? J(f, null) : null;
    if (!h) { h = await search(p, m + '-01', monthLast(m)); fetched++; if (!h) { miss.push(p + ' ' + m); continue; } if (m < thisMonth) save(f, h); } for (const x of h) hits.push({ ...x, phrase: p }); }
  log('EDGAR full-text search: ' + hits.length + ' hits (' + fetched + ' phrase-months fetched now, ' + miss.length + ' missing)');
  // tickers and CIKs
  const SH = JZ('data/shares.json.gz', { c: {}, t: {} }), CIKS = J('data/sec-ciks.json', {}), tickCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; return a ? String(a) : CIKS[s] ? String(CIKS[s][0]) : null; };
  const cikTicks = new Map(); for (const s of names) { const c = tickCik(s); if (c) (cikTicks.get(c) || cikTicks.set(c, []).get(c)).push(s); }
  const pricedNear = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (C[i * T + q] > 0) return true; return false; };
  const stockOf = (h) => { const t = Math.min(sessionAfter(D, h.d), T - 1); for (const s of h.tk) { const i = idx.get(s); if (i !== undefined && pricedNear(i, t)) return s; } for (const s of cikTicks.get(String(h.cik)) || []) if (pricedNear(idx.get(s), t)) return s; return null; };
  // read every matched document of a filing whose company we can price (once; cached)
  const DOCS = J(VC + '/docs.json', {}), want = new Map(); for (const h of hits) if (h.d >= '2021-07-01' && h.d <= D[T - 1] && !want.has(h.id) && stockOf(h)) want.set(h.id, h);
  let read = 0, unread = 0; for (const [id, h] of want) { if (id in DOCS) continue; if (Date.now() - t0 > (+env.VERIFY_MINUTES || 150) * 60e3) { unread++; continue; }
    const file = String(id).split(':')[1], url = 'https://www.sec.gov/Archives/edgar/data/' + h.cik + '/' + String(h.adsh).replace(/-/g, '') + '/' + file, html = await sec(url, 'text');
    if (html === undefined) { unread++; continue; } const a = authorizedSize(textOf(String(html).slice(0, 1000000))); DOCS[id] = [a.usd, a.shares]; if (++read % 500 === 0) { save(VC + '/docs.json', DOCS); log('documents read: ' + read); } }
  save(VC + '/docs.json', DOCS); log('buyback documents: ' + want.size + ' wanted, ' + read + ' read now, ' + unread + ' not read; SEC requests ' + secN + ', failed ' + secBad);
  // one size per filing (largest over its matched documents)
  const filings = new Map(); for (const [id, h] of want) { const a = DOCS[id]; if (!a) continue; const f = filings.get(h.adsh) || filings.set(h.adsh, { adsh: h.adsh, cik: h.cik, d: h.d, h, usd: null, shares: null }).get(h.adsh);
    if (a[0] > 0 && (f.usd === null || a[0] > f.usd)) f.usd = a[0]; if (a[1] > 0 && (f.shares === null || a[1] > f.shares)) f.shares = a[1]; }
  const sized = [], why = { noShares: 0, noAmount: 0, under5: 0, over40: 0 };
  for (const f of filings.values()) { const s = stockOf(f.h), i = idx.get(s), k = sessionAfter(D, f.d), t = k - 1; if (t < 20) continue;
    const px = closeOnOrBefore(row(C, i), Math.min(t, T - 1), 5), sh = sharesKnownOn(SH.c[String(f.cik)] || SH.c[tickCik(s)], D[Math.min(t, T - 1)]);
    if (!(f.usd > 0) && !(f.shares > 0)) { why.noAmount++; continue; } if (!sh) { why.noShares++; continue; } const z = sizeOfCompany(f, sh, px); if (z === null) { why.noAmount++; continue; }
    if (z >= 0.40) { why.over40++; continue; } if (z < 0.05) { why.under5++; continue; } sized.push({ key: String(f.cik), d: f.d, s, i, size: z, adsh: f.adsh }); }
  const events = firstPerKey(sized, 180), trades = [], drop = { notLiquid: 0, noFullHold: 0, busy: 0, noOpen: 0, noYard: 0 }, busyTo = new Map();
  for (const e of events.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0) || a.i - b.i)) { const k = sessionAfter(D, e.d), t = k - 1, x = k + 62; if (x > T - 1) { drop.noFullHold++; continue; }
    if (!LIQ[e.i * T + t]) { drop.notLiquid++; continue; } if ((busyTo.get(e.i) ?? -1) >= k) { drop.busy++; continue; } const r = ret(e.i, k, x); if (!r) { drop.noOpen++; continue; }
    const c = yardstick(k, x); if (c === null) { drop.noYard++; continue; } busyTo.set(e.i, x);
    trades.push({ t, i: e.i, s: e.s, k, x, exitAt: r.exitAt, gone: r.gone, g0: r.g, g: cap(r.g), c, half: half(D[t]), filed: e.d, size: e.size, jumps: jumpsIn(e.i, k, r.exitAt), unadj: unadjustedSplits(e.i, k, r.exitAt) }); }
  const tr = withOwn(trades, 253), tr0 = withOwn(trades, 20), main = judged(tr, 63), ownAll = judged(tr0, 63), noArt = judged(tr.filter(z => !z.unadj.length && !z.jumps.length), 63);
  const SQ = J('data/squad1-lab.json', {}), FR = (SQ.firstRun || {})['SQ1-BBAUTH'], THEIRS = (SQ.trades || {})['SQ1-BBAUTH'] || [];
  const mine = tr.map(compact), cmp = compareTrades(mine, THEIRS);
  // their trades vs the 8-K record: an 8-K buyback hit of that company filed on or after the signal session and BEFORE the buy session
  const hitsBySym = new Map(); for (const h of hits) { const s = stockOf(h); if (s) (hitsBySym.get(s) || hitsBySym.set(s, []).get(s)).push(h.d); }
  const audit = { checked: THEIRS.length, noFilingBeforeBuy: [], filingOnlyAfterBuy: [], buyNotNextAfterSig: 0, holdNot63: 0, holdShort: [], capped: 0 };
  for (const z of THEIRS) { const ts = D.indexOf(z.sig), tb = D.indexOf(z.buy), tx = D.indexOf(z.sell); if (tb !== ts + 1) audit.buyNotNextAfterSig++; if (tx - tb + 1 !== 63) { audit.holdNot63++; if (audit.holdShort.length < 20) audit.holdShort.push(z.s + ' ' + z.buy + '->' + z.sell); }
    if (z.net >= 3 - COST - 1e-4) audit.capped++; const ds = hitsBySym.get(z.s) || [];
    if (!ds.some(d => d >= z.sig && d < z.buy)) { if (ds.some(d => d >= z.buy && d <= plusDays(z.buy, 10))) audit.filingOnlyAfterBuy.push(z.s + ' ' + z.sig); else audit.noFilingBeforeBuy.push(z.s + ' ' + z.sig); } }
  audit.noFilingBeforeBuy = audit.noFilingBeforeBuy.slice(0, 40); audit.filingOnlyAfterBuy = audit.filingOnlyAfterBuy.slice(0, 40);
  const M = new Map(mine.map(z => [z.s + '|' + z.sig, z])), both = THEIRS.filter(z => M.has(z.s + '|' + z.sig));
  const sub = { n: both.length, theirsAvgNet: rd(avg(both.map(z => z.net))), mineAvgNet: rd(avg(both.map(z => M.get(z.s + '|' + z.sig).net))), theirsAvgStock: rd(avg(both.map(z => z.avgStock))), mineAvgStock: rd(avg(both.map(z => M.get(z.s + '|' + z.sig).avgStock))) };
  // their trades I do not have: why (no hit / no size / under 5% / not first in 180 days / not liquid)
  const sizedBy = new Map(); for (const e of sized) (sizedBy.get(e.s) || sizedBy.set(e.s, []).get(e.s)).push(e);
  const evKeys = new Set(events.map(e => e.s + '|' + D[sessionAfter(D, e.d) - 1]));
  const allSizes = new Map(); for (const f of filings.values()) { const s = stockOf(f.h); (allSizes.get(s) || allSizes.set(s, []).get(s)).push({ d: f.d, usd: f.usd, shares: f.shares }); }
  const whyMissing = cmp.onlyTheirs.slice(0, 40).map(k => { const [s, sig] = k.split('|'), ev = evKeys.has(k), fs_ = (allSizes.get(s) || []).filter(f => D[sessionAfter(D, f.d) - 1] === sig);
    return k + ': ' + (ev ? 'event kept, trade dropped (busy / liquidity / data)' : fs_.length ? 'filing found, size ' + JSON.stringify(fs_.map(f => [f.usd, f.shares])) + ((sizedBy.get(s) || []).some(e => D[sessionAfter(D, e.d) - 1] === sig) ? ' sized 5-40% but not first in 180 days' : ' not sized 5-40% here') : 'no matching filing in my search'); });
  OUTPUT.bbauth = { spec: 'SQ1-BBAUTH (library entry): EDGAR full-text 8-K hits for the buyback phrases; size = max(largest $ / (share count known 30 days late x close before entry), largest "up to N shares" / share count); 5% to 40%; first per company in 180 days; buy the open of the first session after the filing date; hold 63 (sell the close); liquid the session before entry; one open trade per stock; cap +300% both sides; cost 0.8%',
    data: { hits: hits.length, missingPhraseMonths: miss.slice(0, 20), documents: want.size, docsUnread: unread, filings: filings.size, sizing: why, sized5to40: sized.length, events: events.length, drops: drop, secRequests: secN, secFailed: secBad },
    verdictMine: main.verdict, whyMine: main.why, mine: main.results, frozen: FR ? { verdict: FR.verdict, why: FR.why, older: FR.results.older, newer: FR.results.newer } : null, frozenData: (SQ.data || {}).buyback || null,
    variants: { sameStockFromSession20: { verdict: ownAll.verdict, older: ownAll.results.older, newer: ownAll.results.newer }, withoutSplitJumpTrades: { verdict: noArt.verdict, older: noArt.results.older, newer: noArt.results.newer } },
    splitAudit: { tradesWithJump: tr.filter(z => z.jumps.length).map(z => z.s + ' ' + D[z.k] + ' ' + JSON.stringify(z.jumps)).slice(0, 30), tradesWithUnadjustedListedSplit: tr.filter(z => z.unadj.length).map(z => z.s + ' ' + D[z.k] + ' ' + JSON.stringify(z.unadj)).slice(0, 30), capped: tr.filter(z => z.g0 > 3).map(z => z.s + ' ' + D[z.k] + ' ' + rd(z.g0)) },
    dead: { gone: tr.filter(z => z.gone).length, examples: tr.filter(z => z.gone).slice(0, 15).map(z => z.s + ' ' + D[z.k] + '->' + D[z.exitAt] + ' ' + rd(z.g)) },
    theirFile: { trades: THEIRS.length, firstSig: THEIRS.length ? THEIRS[0].sig : null, audit }, compare: cmp, whyMissing, sameSubset: sub,
    trades: tr.map(z => ({ ...compact(z), filed: z.filed, size: rd(z.size, 3) })) };
  log('BBAUTH mine: ' + main.verdict + ' | older ' + JSON.stringify(main.results.older).slice(0, 260) + ' | newer ' + JSON.stringify(main.results.newer).slice(0, 260));
  log('BBAUTH compare: ' + JSON.stringify({ ...cmp, bigNetDiff: cmp.bigNetDiff.length, onlyTheirs: cmp.onlyTheirs.length, onlyMine: cmp.onlyMine.length })); }

// ================= SQ6-QMOM =================
if (want('qmom')) { const CIKS = J('data/sec-ciks.json', {}), sicOf = (s) => { const x = SICS[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = CIKS[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
  const forms = lastSessionsOf(D, [2, 5, 8, 11]).filter(t => t >= 252), trades = [], formInfo = [];
  for (const t of forms) { const cand = []; for (const i of liquidList(t)) { const c = row(C, i), fb = firstBar(c); if (fb < 0 || fb > t - 252 || sicOf(names[i]) === '6798') continue; const tv = tradedValue63(c, row(V, i), t); if (Number.isFinite(tv)) cand.push([i, tv]); }
    cand.sort((a, b) => b[1] - a[1]); const uni = cand.slice(0, 1000).map(x => x[0]);
    const rows = uni.map(i => { const c = row(C, i), a = closeOnOrBefore(c, t - 21, 5), b = closeOnOrBefore(c, t - 252, 5), mom = a > 0 && b > 0 ? a / b - 1 : NaN; return { id: i, mom, fip: frogInPan(c, t - 251, t - 21, mom) }; });
    const picks = quantMomentumPick(rows); let filled = 0, open = 0;
    for (const i of picks) { const k = t + 1, x = t + 63; if (x > T - 1) { open++; continue; } const r = ret(i, k, x); if (!r) continue; filled++;
      trades.push({ t, i, s: names[i], k, x: r.exitAt, exitAt: r.exitAt, gone: r.gone, g0: r.g, g: cap(r.g), c: yardstick(k, r.exitAt), half: half(D[t]), jumps: jumpsIn(i, k, r.exitAt), unadj: unadjustedSplits(i, k, r.exitAt) }); }
    formInfo.push({ d: D[t], universe: uni.length, ranked: rows.filter(r => Number.isFinite(r.mom) && Number.isFinite(r.fip)).length, picks: picks.length, filled, open }); }
  const tr = withOwn(trades.filter(z => z.c !== null), 253), main = judged(tr, 63), noArt = judged(tr.filter(z => !z.unadj.length && !z.jumps.length), 63), own20 = judged(withOwn(trades.filter(z => z.c !== null), 20), 63);
  const SQ = J('data/squad6-lab.json', {}), FR = (SQ.firstRun || {})['SQ6-QMOM'], THEIRS = (SQ.trades || {})['SQ6-QMOM'] || [], mine = tr.map(compact), cmp = compareTrades(mine, THEIRS);
  const audit = { checked: THEIRS.length, sigNotQuarterEnd: 0, buyNotNext: 0, sellNot63: [], capped: 0 };
  for (const z of THEIRS) { const ts = D.indexOf(z.sig), tb = D.indexOf(z.buy), tx = D.indexOf(z.sell); if (!(ts >= 0 && ts + 1 < T && D[ts + 1].slice(0, 7) !== D[ts].slice(0, 7) && ['02', '05', '08', '11'].includes(z.sig.slice(5, 7)))) audit.sigNotQuarterEnd++;
    if (tb !== ts + 1) audit.buyNotNext++; if (tx !== tb + 62 && audit.sellNot63.length < 20) audit.sellNot63.push(z.s + ' ' + z.buy + '->' + z.sell + ' last bar ' + (idx.has(z.s) ? D[lastBar(row(C, idx.get(z.s)))] : '?')); if (z.net >= 3 - COST - 1e-4) audit.capped++; }
  const M = new Map(mine.map(z => [z.s + '|' + z.sig, z])), both = THEIRS.filter(z => M.has(z.s + '|' + z.sig));
  const perForm = forms.map(t => { const a = tr.filter(z => z.t === t); return { d: D[t], n: a.length, avgNet: rd(avg(a.map(z => z.g - COST))), yard: rd(avg(a.map(z => z.c))), gone: a.filter(z => z.gone).length }; }).filter(x => x.n);
  OUTPUT.qmom = { spec: 'SQ6-QMOM (library entry): last session of Feb / May / Aug / Nov; 1000 most traded liquid stocks (63-session traded value) with 252+ sessions, SIC 6798 out; 12-2 momentum; top 10%; the 50% with the lowest frog-in-the-pan; buy next open, sell the close of session 63; cap +300% both sides; cost 0.8%',
    formations: formInfo, perFormation: perForm, verdictMine: main.verdict, whyMine: main.why, mine: main.results, frozen: FR ? { verdict: FR.verdict, why: FR.why, older: FR.results.older, newer: FR.results.newer, notes: FR.notes, exits: FR.exits } : null,
    variants: { sameStockFromSession20: { verdict: own20.verdict, older: own20.results.older, newer: own20.results.newer }, withoutSplitJumpTrades: { verdict: noArt.verdict, older: noArt.results.older, newer: noArt.results.newer } },
    splitAudit: { tradesWithJump: tr.filter(z => z.jumps.length).map(z => z.s + ' ' + D[z.k] + ' ' + JSON.stringify(z.jumps)).slice(0, 30), tradesWithUnadjustedListedSplit: tr.filter(z => z.unadj.length).map(z => z.s + ' ' + D[z.k] + ' ' + JSON.stringify(z.unadj)).slice(0, 30), capped: tr.filter(z => z.g0 > 3).map(z => z.s + ' ' + D[z.k] + ' ' + rd(z.g0)) },
    dead: { gone: tr.filter(z => z.gone).length, examples: tr.filter(z => z.gone).slice(0, 15).map(z => z.s + ' ' + D[z.k] + '->' + D[z.exitAt] + ' ' + rd(z.g)) },
    theirFile: { trades: THEIRS.length, signalDates: [...new Set(THEIRS.map(z => z.sig))].sort(), audit }, compare: cmp,
    sameSubset: { n: both.length, theirsAvgNet: rd(avg(both.map(z => z.net))), mineAvgNet: rd(avg(both.map(z => M.get(z.s + '|' + z.sig).net))), theirsAvgStock: rd(avg(both.map(z => z.avgStock))), mineAvgStock: rd(avg(both.map(z => M.get(z.s + '|' + z.sig).avgStock))) }, trades: mine };
  log('QMOM mine: ' + main.verdict + ' | older ' + JSON.stringify(main.results.older).slice(0, 260) + ' | newer ' + JSON.stringify(main.results.newer).slice(0, 260));
  log('QMOM compare: ' + JSON.stringify({ ...cmp, bigNetDiff: cmp.bigNetDiff.length, onlyTheirs: cmp.onlyTheirs.length, onlyMine: cmp.onlyMine.length })); }

// ================= SQ11-PB12 =================
if (want('pb12')) await runPb12();
async function runPb12() {
  const SH = JZ('data/shares.json.gz', { raw: {}, t: {} }), CIKS = J('data/sec-ciks.json', {}), cacheDay = D[T - 1];
  const SPLITS = new Map(); for (const s of SPL) if (s.d <= cacheDay && s.r > 0 && s.r !== 1) (SPLITS.get(s.s) || SPLITS.set(s.s, []).get(s.s)).push(s);
  // 1. historical ticker -> SEC company number from the SEC Form 3/4/5 data sets (issuer ticker as printed on each filing), per quarter
  const qs = []; for (let y = 2021; y <= +cacheDay.slice(0, 4); y++) for (let q = 1; q <= 4; q++) if (y + '-' + String(q * 3 - 2).padStart(2, '0') <= cacheDay.slice(0, 7)) qs.push(y + 'q' + q);
  const TM = J(VC + '/tickmap.json', {}), tmMiss = [];
  for (const q of qs) { if (TM[q]) continue; if (env.VERIFY_OFFLINE) { tmMiss.push(q); continue; } const zip = VC + '/f345.zip';
    try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, 'https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/' + q + '_form345.zip'], { stdio: 'ignore', timeout: 20 * 60e3 });
      const txt = execFileSync('unzip', ['-p', zip, 'SUBMISSION.tsv'], { maxBuffer: 1.5e9 }).toString(), L = txt.split(/\r?\n/), H = L[0].split('\t'), ci = H.indexOf('ISSUERCIK'), si = H.indexOf('ISSUERTRADINGSYMBOL'), m = {};
      for (const l of L.slice(1)) { const p = l.split('\t'), s = String(p[si] || '').trim().toUpperCase().replace(/-/g, '.'), c = String(+p[ci] || ''); if (!s || !c || c === '0' || !/^[A-Z][A-Z0-9.]{0,6}$/.test(s)) continue; const x = m[s] || (m[s] = {}); x[c] = (x[c] || 0) + 1; }
      TM[q] = m; fs.unlinkSync(zip); } catch (e) { tmMiss.push(q); } }
  save(VC + '/tickmap.json', TM);
  const qOf = (d) => +d.slice(0, 4) * 4 + Math.floor((+d.slice(5, 7) - 1) / 3), qKeys = Object.keys(TM).map(q => [q, +q.slice(0, 4) * 4 + (+q.slice(5) - 1)]);
  const cikMemo = new Map(); const cikOf = (s, d) => { const key = s + '|' + d.slice(0, 7); if (cikMemo.has(key)) return cikMemo.get(key); const qd = qOf(d), votes = {};
    for (const [q, n] of qKeys) { const w = Math.abs(n - qd); if (w > 4) continue; const x = TM[q][s]; if (x) for (const [c, k] of Object.entries(x)) votes[c] = (votes[c] || 0) + k / (1 + w); }
    let best = null; for (const [c, v] of Object.entries(votes)) if (!best || v > votes[best]) best = c; if (!best) { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; best = a ? String(a) : CIKS[s] ? String(CIKS[s][0]) : null; }
    cikMemo.set(key, best); return best; };
  // 2. share counts: SEC cover-page counts (printed, data/shares.json.gz raw, usable 30+ days after their date) put on the price basis with
  //    the official split list; financial-statement counts (companyfacts, usable after the filing date) for the candidates; > 3x apart -> statements
  const FACTS = J(VC + '/facts.json', {}), SUB = J(VC + '/subs.json', {});
  const pad = (c) => String(c).padStart(10, '0');
  const coverAt = (cik, s, d) => { const a = SH.raw[cik]; if (!a) return null; const lim = plusDays(d, -30); let v = null; for (const [e, n] of a) if (e <= lim && n > 0) v = n * splitsAfter(SPLITS.get(s), e); return v; };
  const stmtAt = (cik, s, d) => { const a = FACTS[cik]; if (!a) return null; let best = null; for (const [f, e, n] of a) if (f < d && n > 0 && (!best || e > best.e || (e === best.e && n > best.n))) best = { e, n, f }; return best ? best.n * splitsAfter(SPLITS.get(s), best.f) : null; };
  const US = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR'.split(' '));
  const usOk = (cik) => { const x = SUB[cik]; return !x ? null : US.has(x.st) && !x.f; };
  const monthEnds = lastSessionsOf(D, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).filter(t => t >= 252);
  const tv20 = (i, t) => { let s = 0; for (let q = t - 19; q <= t; q++) { const c = C[i * T + q], v = V[i * T + q]; if (c > 0 && v > 0) s += c * v; } return s / 20; };
  const rank = (t, useGuards) => { const by = new Map(); for (const i of liquidList(t)) { const s = names[i], cik = cikOf(s, D[t]); if (!cik) continue; const tv = tradedValue63(row(C, i), row(V, i), t); const p = by.get(cik); if (!p || (tv || 0) > (p.tv || 0)) by.set(cik, { i, s, cik, tv }); }
    const rows = []; for (const x of by.values()) { const cv = coverAt(x.cik, x.s, D[t]), st = useGuards ? stmtAt(x.cik, x.s, D[t]) : null, sh = cv && st && (cv / st > 3 || st / cv > 3) ? st : cv || st; if (!sh) continue; const mv = C[x.i * T + t] * sh;
      if (useGuards) { if (usOk(x.cik) === false) continue; if (!(mv < 2e13) || tv20(x.i, t) < 0.0002 * mv) continue; } rows.push({ ...x, mv, src: sh === cv ? 'cover' : 'statements' }); }
    return rows.sort((a, b) => b.mv - a.mv); };
  // candidates: anyone in the top 450 by cover-count market value, or in the top 600 by traded value, at any month end
  const cand = new Set(); for (const t of monthEnds) { rank(t, false).slice(0, 450).forEach(x => cand.add(x.cik)); const tvr = liquidList(t).map(i => [i, tradedValue63(row(C, i), row(V, i), t)]).filter(x => Number.isFinite(x[1])).sort((a, b) => b[1] - a[1]).slice(0, 600); for (const [i] of tvr) { const c = cikOf(names[i], D[t]); if (c) cand.add(c); } }
  let fGot = 0, sGot = 0, fBad = 0; for (const cik of cand) {
    if (!(cik in FACTS)) { const j = await sec('https://data.sec.gov/api/xbrl/companyfacts/CIK' + pad(cik) + '.json', 'json'); if (j === undefined) fBad++; else { const out = [];
        for (const [tax, tag] of [['us-gaap', 'WeightedAverageNumberOfSharesOutstandingBasic'], ['us-gaap', 'WeightedAverageNumberOfDilutedSharesOutstanding'], ['us-gaap', 'CommonStockSharesOutstanding'], ['dei', 'EntityCommonStockSharesOutstanding']]) { const u = j && j.facts && j.facts[tax] && j.facts[tax][tag] && j.facts[tax][tag].units && j.facts[tax][tag].units.shares; for (const x of u || []) if (x.filed && x.end && x.val > 0 && /^(10-K|10-Q)/.test(x.form || '')) out.push([x.filed, x.end, x.val]); }
        FACTS[cik] = out; fGot++; } }
    if (!(cik in SUB)) { const j = await sec('https://data.sec.gov/submissions/CIK' + pad(cik) + '.json', 'json'); if (j && j.addresses) { const f = (j.filings && j.filings.recent && j.filings.recent.form) || []; SUB[cik] = { st: String((j.addresses.business || {}).stateOrCountry || '').toUpperCase(), f: f.some(x => /^(20-F|40-F)/.test(x)) ? 1 : 0 }; sGot++; } } }
  save(VC + '/facts.json', FACTS); save(VC + '/subs.json', SUB);
  log('PB12 data: ticker-map quarters ' + Object.keys(TM).length + '/' + qs.length + ' (missing ' + (tmMiss.join(',') || 'none') + '), candidates ' + cand.size + ', facts fetched ' + fGot + ' (failed ' + fBad + '), submissions fetched ' + sGot);
  // 3. leaders per month end: top 300 by market value, then the top 20% by 12-1 month return
  const LEAD = [], leadInfo = [], mvWatch = {}, WATCH = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'META', 'AMZN', 'NVDA', 'BRK.B', 'AVGO', 'TSLA', 'LLY', 'JPM'];
  for (const t of monthEnds) { const r = rank(t, true), top = r.slice(0, 300); r.slice(0, 400).forEach((x, n) => { if (WATCH.includes(x.s) && ['2022-10', '2023-06', '2024-05', '2025-03', '2026-09'].includes(D[t].slice(0, 7))) (mvWatch[x.s] = mvWatch[x.s] || []).push(D[t] + ' #' + (n + 1) + ' ' + rd(x.mv / 1e9, 0) + 'B ' + x.src); });
    const mom = top.map(x => { const c = row(C, x.i), a = closeOnOrBefore(c, t - 21, 5), b = closeOnOrBefore(c, t - 252, 5); return { ...x, m: a > 0 && b > 0 ? a / b - 1 : NaN }; }).filter(x => Number.isFinite(x.m)).sort((a, b) => b.m - a.m || (a.s < b.s ? -1 : 1));
    const lead = mom.slice(0, Math.ceil(top.length * 0.20)); LEAD.push({ t, set: new Set(lead.map(x => x.i)) }); leadInfo.push({ d: D[t], top: top.length, statements: top.filter(x => x.src === 'statements').length, leaders: lead.length, cut300B: top.length ? rd(top[top.length - 1].mv / 1e9, 1) : null }); }
  const missingWatch = WATCH.filter(s => !mvWatch[s]);
  // 4. signals and trades
  const trades = [], busy = new Map(), memo = new Map(), arr = (i) => { if (!memo.has(i)) { const c = row(C, i); memo.set(i, { c, hi: rollingMaxClose(c, 50), ma: rollingMean(c, 200) }); } return memo.get(i); };
  let open = 0, skippedBusy = 0;
  for (let m = 0; m < LEAD.length; m++) { const t0 = LEAD[m].t, t1 = m + 1 < LEAD.length ? LEAD[m + 1].t : T - 1;
    for (let t = t0 + 1; t <= t1; t++) for (const i of LEAD[m].set) { if (!LIQ[i * T + t]) continue; const a = arr(i); if (!pullbackAt(a.c, a.hi, a.ma, t, 0.12)) continue;
      const k = t + 1, x = t + 126; if ((busy.get(i) ?? -1) >= k) { skippedBusy++; continue; } if (x > T - 1) { open++; busy.set(i, Infinity); continue; } const r = ret(i, k, x); if (!r) continue; busy.set(i, x);
      const sp = ret(SPY, k, r.exitAt); trades.push({ t, i, s: names[i], k, x: r.exitAt, exitAt: r.exitAt, gone: r.gone, g0: r.g, g: cap(r.g), c: yardstick(k, r.exitAt), spy: sp ? sp.g : null, half: half(D[t]), jumps: jumpsIn(i, k, r.exitAt), unadj: unadjustedSplits(i, k, r.exitAt) }); } }
  const tr = withOwn(trades.filter(z => z.c !== null), 253), main = judged(tr, 63), b126 = judged(tr, 126), noArt = judged(tr.filter(z => !z.unadj.length && !z.jumps.length), 63);
  const perYear = {}; for (const h of ['older', 'newer']) { const a = tr.filter(z => z.half === h), yrs = a.reduce((s, z) => s + (z.x - z.k + 1) / 252, 0); perYear[h] = { rule: rd(a.reduce((s, z) => s + z.g - COST, 0) / yrs), spy: rd(a.reduce((s, z) => s + (z.spy || 0), 0) / yrs), avgStock: rd(a.reduce((s, z) => s + z.c, 0) / yrs) }; }
  const SQ = J('data/squad11-lab.json', {}), FR = (SQ.firstRun || {})['SQ11-PB12'], THEIRS = (SQ.trades || {})['SQ11-PB12'] || [], mine = tr.map(compact), cmp = compareTrades(mine, THEIRS);
  // their trades re-checked on my data: a leader at the month end before the signal? the pullback condition true at the signal close?
  const leaderAt = (i, t) => { let m = -1; for (let q = 0; q < LEAD.length && LEAD[q].t < t; q++) m = q; return m >= 0 && LEAD[m].set.has(i); };
  const audit = { checked: THEIRS.length, notLeaderHere: [], conditionFalseHere: [], buyNotNext: 0, sellNot126: [], capped: 0, withJump: [] };
  for (const z of THEIRS) { const i = idx.get(z.s), ts = D.indexOf(z.sig), tb = D.indexOf(z.buy), tx = D.indexOf(z.sell); if (tb !== ts + 1) audit.buyNotNext++; if (tx !== tb + 125 && audit.sellNot126.length < 20) audit.sellNot126.push(z.s + ' ' + z.buy + '->' + z.sell + ' ' + z.kind);
    if (z.net >= 3 - COST - 1e-4) audit.capped++; if (i === undefined) continue; if (!leaderAt(i, ts)) audit.notLeaderHere.push(z.s + ' ' + z.sig); const a = arr(i); if (!pullbackAt(a.c, a.hi, a.ma, ts, 0.12)) audit.conditionFalseHere.push(z.s + ' ' + z.sig);
    const j = jumpsIn(i, tb, tx); if (j.length) audit.withJump.push(z.s + ' ' + z.buy + ' ' + JSON.stringify(j)); }
  const M = new Map(mine.map(z => [z.s + '|' + z.sig, z])), both = THEIRS.filter(z => M.has(z.s + '|' + z.sig));
  OUTPUT.pb12 = { spec: 'SQ11-PB12 (library entry): leaders = top 20% by 12-1 return of the 300 largest US companies by point-in-time market value at each month end (adjusted close x SEC share count 30+ days old on the same split basis; statements count when >3x apart; US business address, no 20-F/40-F; one ticker per company; turnover guard 0.02%); signal: first close >= 12% under the 50-session closing high while above the 200-session average; buy next open; sell the close of session 126; one open trade per stock; cap +300% both sides; cost 0.8%',
    deviationsHere: 'no SEC-revenue (operating company) filter; ticker -> company from the Form 3/4/5 data sets voted over +-4 quarters, else the current SEC ticker list; statements count = the latest-period of weighted basic / diluted / balance-sheet / cover facts filed before the day (the largest for that period)',
    leaders: leadInfo, megaCapWatch: mvWatch, megaCapsNeverInTop400: missingWatch, verdictMine: main.verdict, whyMine: main.why, mine: main.results, perYearMine: perYear, frozen: FR ? { verdict: FR.verdict, why: FR.why, older: FR.results.older, newer: FR.results.newer, perYear: FR.perYear, notes: FR.notes } : null,
    variants: { blocks126: { verdict: b126.verdict, older: b126.results.older, newer: b126.results.newer }, withoutSplitJumpTrades: { verdict: noArt.verdict, older: noArt.results.older, newer: noArt.results.newer } },
    notes: { open, skippedBusy }, splitAudit: { tradesWithJump: tr.filter(z => z.jumps.length).map(z => z.s + ' ' + D[z.k] + ' ' + JSON.stringify(z.jumps)).slice(0, 30), capped: tr.filter(z => z.g0 > 3).map(z => z.s + ' ' + D[z.k] + ' ' + rd(z.g0)) },
    dead: { gone: tr.filter(z => z.gone).length, examples: tr.filter(z => z.gone).slice(0, 15).map(z => z.s + ' ' + D[z.k] + '->' + D[z.exitAt] + ' ' + rd(z.g)) },
    theirFile: { trades: THEIRS.length, audit: { ...audit, notLeaderHere: audit.notLeaderHere.slice(0, 60), nNotLeader: audit.notLeaderHere.length, conditionFalseHere: audit.conditionFalseHere.slice(0, 60), nConditionFalse: audit.conditionFalseHere.length } }, compare: cmp,
    sameSubset: { n: both.length, theirsAvgNet: rd(avg(both.map(z => z.net))), mineAvgNet: rd(avg(both.map(z => M.get(z.s + '|' + z.sig).net))), theirsAvgStock: rd(avg(both.map(z => z.avgStock))), mineAvgStock: rd(avg(both.map(z => M.get(z.s + '|' + z.sig).avgStock))) },
    onlyTheirsStats: (() => { const a = THEIRS.filter(z => !M.has(z.s + '|' + z.sig)); return { n: a.length, avgNet: rd(avg(a.map(z => z.net))), older: a.filter(z => z.sig < '2024-01-01').length }; })(),
    onlyMineStats: (() => { const T2 = new Set(THEIRS.map(z => z.s + '|' + z.sig)), a = mine.filter(z => !T2.has(z.s + '|' + z.sig)); return { n: a.length, avgNet: rd(avg(a.map(z => z.net))), older: a.filter(z => z.sig < '2024-01-01').length, list: a.slice(0, 60).map(z => z.s + '|' + z.sig + ' ' + z.net) }; })(),
    trades: mine };
  log('PB12 mine: ' + main.verdict + ' | older ' + JSON.stringify(main.results.older).slice(0, 260) + ' | newer ' + JSON.stringify(main.results.newer).slice(0, 260));
  log('PB12 compare: ' + JSON.stringify({ ...cmp, bigNetDiff: cmp.bigNetDiff.length, onlyTheirs: cmp.onlyTheirs.length, onlyMine: cmp.onlyMine.length })); }

OUTPUT.log = LOG; fs.writeFileSync(OUT, JSON.stringify(OUTPUT));
console.log('VERIFY LAB done: ' + OUT);
