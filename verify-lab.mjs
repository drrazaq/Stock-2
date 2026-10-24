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
  msciMomentumPick, textOf, authorizedSize, sizeOfCompany, sharesKnownOn, firstPerKey, sameStockOtherDays, compareTrades } from './verify-core.mjs';
const env = process.env, OUT = 'data/verify-lab.json', VC = env.VERIFY_CACHE || 'verify-cache', LOG = [];
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
for (const k of Object.keys(store.days)) delete store.days[k];
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
const OUTPUT = { generatedAt: new Date().toISOString(), what: 'Independent re-implementation of SQ6-MTUM and SQ1-BBAUTH from their written specs (verify-core.mjs), compared with the squads\' frozen results', window: [D[0], D[T - 1]], cost: COST, prices: { sessions: T, symbols: NS, cacheEnd, fresh: freshDays, postCacheSplitsRepaired: splitFix } };

// ================= SQ6-MTUM =================
{ const forms = lastSessionsOf(D, [5, 11]).filter(t => t >= 252), trades = [], formInfo = [];
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
async function search(phrase, a, b) { const out = []; for (let from = 0; ; from += 100) {
    const j = await sec('https://efts.sec.gov/LATEST/search-index?q=' + encodeURIComponent('"' + phrase + '"') + '&forms=8-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from, 'json');
    if (!j || !j.hits) return null; const total = (j.hits.total && j.hits.total.value) || 0, hs = j.hits.hits || [];
    if (from === 0 && total >= 9900 && a < b) { const mid = isoOf((Date.parse(a) + Date.parse(b)) / 2), x = await search(phrase, a, mid), y = await search(phrase, plusDays(mid, 1), b); return x && y ? x.concat(y) : null; }
    for (const h of hs) { const s = h._source || {}, tk = []; for (const n of s.display_names || []) { const m = /\(([A-Z0-9.,\s-]+)\)\s*\(CIK/.exec(String(n)); if (m) tk.push(...m[1].split(',').map(z => z.trim()).filter(Boolean)); }
      out.push({ id: h._id, adsh: s.adsh, cik: +((s.ciks || [])[0] || 0), d: s.file_date, form: s.form || s.file_type || '', tk }); }
    if (hs.length < 100 || from + 100 >= total) break; } return out; }
{ const hits = [], miss = [], thisMonth = isoOf(Date.now()).slice(0, 7); let fetched = 0;
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

OUTPUT.log = LOG; fs.writeFileSync(OUT, JSON.stringify(OUTPUT));
console.log('VERIFY LAB done: ' + OUT);
