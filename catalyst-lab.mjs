// CATALYST RUN-UP LAB (the owner's OCGN case, 23 Oct 2026). Research + the weekly upcoming-catalyst list; never places an order.
// PRE-REGISTERED 23 Oct 2026 in data/strategy-library.json BEFORE any run (CAT-RUN1, CAT-RUN2, CAT-NEWS1, CAT-OCGN); every rule is in
// catalyst-core.mjs and is not tuned after the first run. RUN ONCE AS WRITTEN: each rule's first complete verdict is frozen (firstRun).
//   CAT-RUN1  a biotech/medtech 8-K states a PDUFA date, an advisory committee date or an expected topline readout; BUY the open 30
//             sessions before the event session, SELL the close 2 sessions before it (never through the binary event).
//   CAT-NEWS1 3+ positive company 8-Ks (designations, trial progress, contracts, partnerships) in the last 60 sessions and none
//             negative, close above its 50-day average; BUY the next open, SELL the close 15 sessions later.
//   CAT-RUN2  ClinicalTrials.gov primary-completion dates: registered as conditional (only if CAT-RUN1 has too few cases); not built.
// DATA (official, free): SEC EDGAR full-text search (efts.sec.gov, 8-K incl. exhibits, 2001+) for the phrases, the 8-K documents
//   themselves for the dates, the EDGAR quarterly full index for 424B5 / S-1 / S-3 filings (dilution gate, every filer incl. dead
//   companies), Massive reference tickers (active + delisted, by CIK) for dead tickers; prices from the 5-year whole-market cache
//   (study-cache/grouped.json.gz, read only). Everything fetched is kept in cat-cache/ (its own Actions cache), so a run resumes.
// TIME: EDGAR full-text search gives the filing DATE only; read with sec-time.mjs secNY (a date-only value is a New York date). An 8-K
//   counts from the first session on/after its filing date and is never used before that session's close.
// OUTPUTS: data/catalyst-lab.json (verdicts, frozen first run, full numbers, OCGN illustration), data/catalyst-today.json (upcoming
//   catalysts with buy/sell dates, halal/dilution/lottery checked: the scan shows them in ACTIONS only if a rule reached tier 2 or proven),
//   library entries CAT-RUN1 / CAT-NEWS1 (status from firstRun only).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { secNY } from './sec-time.mjs';
import { extractCatalysts, html2text, tradingSessions, runUpPlan, firstOnOrAfter, dilutedBefore, lotteryJump, POSITIVE, NEGATIVE, CATALYST_PHRASES, BIO_SIC, DILUTION_FORMS, verdictOf, RUN_BEFORE, SELL_BEFORE } from './catalyst-core.mjs';
const env = process.env, OUT = env.OUT || 'data/catalyst-lab.json', TODAY_OUT = env.TODAY_OUT || 'data/catalyst-today.json', CD = env.CAT_CACHE || 'cat-cache';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', BUDGET_MS = (+env.CAT_MINUTES || 60) * 60e3, T0 = Date.now(), outOfTime = () => Date.now() - T0 > BUDGET_MS;
const COST = 0.008, STRESS = 0.012, HOLD_NEWS = 15, FROM_RUN = '2021-06-01', FROM_NEWS = '2021-03-01';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(CD, { recursive: true });

// ---- prices (read only) ----
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('catalyst-lab: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) { console.log('catalyst-lab: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN), CX = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; } });
const XROWS = {}; { const want = new Set(['OCGN']); D.forEach((d, t) => { const x = store.days[d]; if (x.x) for (let j = 0; j < x.x.T.length; j++) if (want.has(x.x.T[j])) (XROWS[x.x.T[j]] = XROWS[x.x.T[j]] || {})[t] = { o: x.x.o[j], c: x.x.c[j] }; }); }
store = null;
const spyI = SY.get('SPY'), CC = (i, t) => { const z = C[i * T + t]; return isFinite(z) ? z : CX[i * T + t]; };
const dv20 = (i, t) => { let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 10 ? dv / n : 0; };
const gateOk = (i, t) => C[i * T + t] >= 2 && dv20(i, t) >= 2e6;                                   // registered entry gate
const liquidCtrl = (i, t) => C[i * T + t] >= 3 && dv20(i, t) >= 1e6;                               // the average-stock yardstick
const lottery = (i, t) => { const a = []; for (let k = Math.max(0, t - 21); k <= t; k++) a[k] = CC(i, k); return lotteryJump(a, t); };
const above50 = (i, t) => { let s = 0, n = 0; for (let k = t - 49; k <= t; k++) { if (k < 0) continue; const z = CC(i, k); if (isFinite(z)) { s += z; n++; } } return n >= 40 && CC(i, t) > s / n; };
// buy the open of t+1, sell the close of t+h (a stock that left the cache keeps its real later price via CX; else its last close)
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) { const z = CC(i, k); if (isFinite(z)) { last = z; break; } } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && liquidCtrl(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const START = 60, midT = Math.floor((START + T) / 2), ownC = {};
const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : START; k < (half ? T - 1 : midT); k += 2) { if (Math.abs(k - t) <= h) continue; if (liquidCtrl(i, k)) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } } return (ownC[key] = v.length >= 20 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);

// ---- network (SEC: at most ~8 requests a second, with the declared User-Agent) ----
let lastReq = 0, nReq = 0, nFail = 0;
async function get(url, kind = 'json', headers = { 'User-Agent': UA }) {
  for (let a = 0; a < 4; a++) { const w = (local(env.EFTS_BASE) ? 0 : 125) - (Date.now() - lastReq); if (w > 0) await sleep(w); lastReq = Date.now(); nReq++;
    try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null; if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) { nFail++; if (nFail <= 5) console.log('catalyst-lab: HTTP ' + r.status + ' ' + url.replace(/apiKey=[^&]+/, 'apiKey=***').slice(0, 200)); return null; }
      return kind === 'json' ? await r.json() : kind === 'bin' ? Buffer.from(await r.arrayBuffer()) : await r.text(); } catch (e) { await sleep(1000 * (a + 1)); } }
  nFail++; return null; }
const months = (from) => { const out = [], now = new Date(); for (let y = +from.slice(0, 4), m = +from.slice(5, 7); y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) out.push(y + '-' + String(m).padStart(2, '0')); return out; };
const monthEnd = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10), thisMonth = new Date().toISOString().slice(0, 7);
const slug = (p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-');
// one phrase, one date range -> compact hits [id, adsh, cik, fileDate, sic, tickers]; splits the range if EDGAR's 10,000 cap is near
async function efts(phrase, a, b) {
  const hits = []; for (let from = 0; from < 10000; from += 100) {
    const j = await get(EFTS + '/LATEST/search-index?q=' + encodeURIComponent('"' + phrase + '"') + '&forms=8-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) { if (j) { nFail++; if (nFail <= 5) console.log('catalyst-lab: full-text search answered without hits: ' + JSON.stringify(j).slice(0, 200)); } return null; } const tot = (j.hits.total && j.hits.total.value) || 0;
    if (from === 0 && tot >= 9900 && a < b) { const mid = new Date((Date.parse(a) + Date.parse(b)) / 2).toISOString().slice(0, 10), x = await efts(phrase, a, mid), y = await efts(phrase, new Date(Date.parse(mid) + 864e5).toISOString().slice(0, 10), b); return x && y ? x.concat(y) : null; }
    for (const h of j.hits.hits || []) { const s = h._source || {}, tk = []; for (const dn of s.display_names || []) { const m = dn.match(/\(([A-Z0-9.,\s-]+)\)\s+\(CIK/); if (m) tk.push(...m[1].split(',').map(x => x.trim()).filter(Boolean)); }
      hits.push([h._id, s.adsh, +((s.ciks || [])[0] || 0), s.file_date, (s.sics || [])[0] || '', tk]); }
    if ((j.hits.hits || []).length < 100 || from + 100 >= tot) break; }
  return hits; }
const FT = { complete: true, phrases: 0, months: 0, missing: [] };
async function phraseHits(phrase, from) { const out = []; FT.phrases++;
  for (const ym of months(from)) { const f = CD + '/efts/' + slug(phrase) + '/' + ym + '.json', had = J(f, null);
    if (had && ym !== thisMonth) { out.push(...had); continue; }
    if (outOfTime()) { FT.complete = false; FT.missing.push(phrase + ' ' + ym); if (had) out.push(...had); continue; }
    const h = await efts(phrase, ym + '-01', monthEnd(ym)); FT.months++; if (!h) { FT.complete = false; FT.missing.push(phrase + ' ' + ym); if (had) out.push(...had); continue; }
    W(f, h); out.push(...h); }
  return out; }

// ---- EDGAR quarterly full index: dilution filings (424B5, S-1, S-1/A, S-3, S-3/A) by CIK ----
async function dilutionIndex() { const by = new Map(); let ok = 0, all = 0; const y0 = +D[0].slice(0, 4), now = new Date();
  for (let y = y0; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { if (y === now.getUTCFullYear() && (q - 1) * 3 > now.getUTCMonth()) continue; all++;
    const f = CD + '/idx/' + y + 'Q' + q + '.json', cur = y === now.getUTCFullYear() && Math.floor(now.getUTCMonth() / 3) + 1 === q; let rows = J(f, null);
    if (!rows || cur) { const buf = outOfTime() && rows ? null : await get(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', 'bin');
      if (buf) { let txt; try { txt = zlib.gunzipSync(buf).toString('latin1'); } catch (e) { txt = buf.toString('latin1'); } rows = [];
        for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length < 5) continue; const form = p[2].trim(); if (DILUTION_FORMS.has(form)) rows.push([+p[0], form, p[3].trim()]); } W(f, rows); } }
    if (rows) { ok++; for (const [cik, form, d] of rows) { if (!by.has(cik)) by.set(cik, []); by.get(cik).push({ form, d }); } } }
  return { by, ok, all }; }

// ---- CIK -> tickers (EDGAR display names + Massive reference, active and delisted) ----
async function massiveRef() { const f = CD + '/ref.json', had = J(f, null); if (had && Date.now() - Date.parse(had.at) < 30 * 864e5) return had.m; if (!env.MASSIVE_KEY) return had ? had.m : {};
  const m = {}; let okAll = true;
  for (const [type, active] of [['CS', true], ['ADRC', true], ['CS', false], ['ADRC', false]]) { let path = '/v3/reference/tickers?market=stocks&type=' + type + '&active=' + active + '&limit=1000', pages = 0;
    while (path && pages < 80) { const j = await get(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), 'json', {}); pages++; if (!j || !Array.isArray(j.results)) { okAll = false; break; }
      for (const x of j.results) if (x.cik && /^[A-Z.]{1,6}$/.test(x.ticker || '')) { const c = +x.cik; (m[c] = m[c] || []).includes(x.ticker) || m[c].push(x.ticker); }
      path = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null; } }
  if (Object.keys(m).length > 1000) W(f, { at: new Date().toISOString(), complete: okAll, m }); return Object.keys(m).length > 1000 ? m : had ? had.m : {}; }

// ---- statistics (date-clustered: one average per entry day) ----
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || x === undefined || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
function stat(a) { if (!a.length) return { n: 0 };
  const net = a.map(z => z.g - COST), sorted = [...net].sort((x, y) => y - x), v = byDay(a, z => z.g - COST - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - COST - z.sp : null);
  return { n: a.length, days: new Set(a.map(z => z.t)).size, stocks: new Set(a.map(z => z.s)).size, win: r4(net.filter(x => x > 0).length / net.length), avg: r4(mean(net)), median: r4(median(net)), worst: r4(Math.min(...net)), best: r4(Math.max(...net)),
    avgStress: r4(mean(a.map(z => z.g - STRESS))), ctrl: r4(mean(a.map(z => z.c))), edge: r4(mean(v)), t: tOf(v), vsOwn: ov.length ? r4(mean(ov)) : null, tOwn: tOf(ov), vsSpy: sv.length ? r4(mean(sv)) : null, noTop2: r4(mean(sorted.slice(2))) }; }
const judge = (trades, bar) => { const R = { all: stat(trades), older: stat(trades.filter(z => z.t < midT)), newer: stat(trades.filter(z => z.t >= midT)) }; return { ...verdictOf(R, bar), results: R }; };

(async () => {
  const PREV = J(OUT, {}) || {}, LG = J('data/agent-league.json', {}), BAR = +Math.max(2.5, typeof LG.bar === 'number' ? LG.bar : 0, 4.0).toFixed(2);
  // 1. EDGAR full-text search (cached per phrase and month)
  const catHits = []; for (const p of CATALYST_PHRASES) catHits.push(...(await phraseHits(p, FROM_RUN)));
  const posHits = [], negHits = []; for (const p of POSITIVE) posHits.push(...(await phraseHits(p, FROM_NEWS))); for (const p of NEGATIVE) negHits.push(...(await phraseHits(p, FROM_NEWS)));
  console.log('catalyst-lab: full-text search ' + FT.phrases + ' phrases, ' + FT.months + ' months fetched now, ' + nReq + ' requests' + (FT.complete ? '' : ', INCOMPLETE (' + FT.missing.length + ' phrase-months missing)'));
  // 2. the 8-K documents of biotech/medtech catalyst hits -> dated catalysts (cached per document)
  const docF = CD + '/docs.json', DOCS = J(docF, {}); let docNew = 0, docMissing = 0; const bioDocs = new Map();
  for (const h of catHits) if (BIO_SIC.test(String(h[4])) && !bioDocs.has(h[0])) bioDocs.set(h[0], h);
  for (const [id, h] of bioDocs) { if (id in DOCS) continue; if (outOfTime()) { docMissing++; continue; }
    const file = id.split(':')[1], url = SEC + '/Archives/edgar/data/' + h[2] + '/' + String(h[1]).replace(/-/g, '') + '/' + file, html = await get(url, 'text');
    if (html === null) { docMissing++; continue; } DOCS[id] = extractCatalysts(html2text(html.slice(0, 600000)), h[3]).map(x => [x.kind, x.date, x.precision, x.text.slice(0, 200)]); docNew++;
    if (docNew % 500 === 0) { W(docF, DOCS); console.log('catalyst-lab: ' + docNew + ' documents read'); } }
  W(docF, DOCS);
  console.log('catalyst-lab: ' + bioDocs.size + ' biotech/medtech catalyst documents (' + docNew + ' read now, ' + docMissing + ' not read yet)');
  // 3. dilution index + tickers
  const DIL = await dilutionIndex(), REF = await massiveRef();
  const cikTick = new Map(); const addT = (cik, t) => { if (!cik || !t) return; if (!cikTick.has(cik)) cikTick.set(cik, []); if (!cikTick.get(cik).includes(t)) cikTick.get(cik).push(t); };
  for (const h of [...catHits, ...posHits, ...negHits]) for (const t of h[5]) addT(h[2], t); for (const [c, ts] of Object.entries(REF)) for (const t of ts) addT(+c, t);
  const symAt = (cik, t, needOpen) => { for (const s of cikTick.get(cik) || []) { const i = SY.get(s); if (i !== undefined && i !== spyI && isFinite(C[i * T + t]) && (!needOpen || O[i * T + t + 1] > 0)) return i; } return undefined; };
  const complete = FT.complete && docMissing === 0 && DIL.ok === DIL.all && Object.keys(REF).length > 1000;
  const fsess = (d) => firstOnOrAfter(D, secNY(d).d);   // an 8-K counts from the first session on/after its filing date (New York date)
  const diag = { OCGN: [] }, OCIK = 1372299, isOC = (cik, i) => cik === OCIK || SYMS[i] === 'OCGN';

  // 4. CAT-RUN1: group by (company, event date); first disclosure = the earliest filing that stated it
  const groups = new Map();
  for (const [id, h] of bioDocs) { const cs = DOCS[id]; if (!cs || !cs.length) continue;
    for (const [kind, date, precision, text] of cs) { const k = h[2] + '|' + date, g = groups.get(k);
      if (!g) groups.set(k, { cik: h[2], date, kinds: new Set([kind]), precision, filed: h[3], adsh: h[1], text }); else { g.kinds.add(kind); if (h[3] < g.filed) Object.assign(g, { filed: h[3], adsh: h[1], text }); if (['day', 'month', 'quarter', 'half'].indexOf(precision) < ['day', 'month', 'quarter', 'half'].indexOf(g.precision)) g.precision = precision; } } }
  const run1 = [], openUntil = new Map(), runCounts = { groups: groups.size, inWindow: 0, tooLate: 0, noPrice: 0, gate: 0, dilution: 0, lottery: 0, overlap: 0 };
  for (const g of [...groups.values()].sort((a, b) => a.date < b.date ? -1 : 1)) {
    const p = runUpPlan(D, g.date); if (!p || p.iSell >= T || p.iBuy < START) continue; runCounts.inWindow++;
    const t = p.iBuy - 1, fs0 = fsess(g.filed), note = (why) => { if (isOC(g.cik)) diag.OCGN.push({ rule: 'CAT-RUN1', event: g.date, kinds: [...g.kinds], filed: g.filed, buy: p.buy, sell: p.sell, result: why }); };
    if (!(fs0 < p.iBuy)) { runCounts.tooLate++; note('first stated on ' + g.filed + ', after the planned buy day'); continue; }
    const i = symAt(g.cik, t, true); if (i === undefined) { runCounts.noPrice++; note('no tradable price (3 USD+, 1M USD+ rows) on the day before the buy'); continue; }
    if (!gateOk(i, t)) { runCounts.gate++; note('under 2 USD or under 2M USD a day'); continue; }
    const dil = dilutedBefore(DIL.by.get(g.cik), D, p.iBuy); if (dil) { runCounts.dilution++; note('dilution filing ' + dil); continue; }
    const lj = lottery(i, t); if (lj) { runCounts.lottery++; note('lottery: +' + Math.round(lj * 100) + '% in one day in the last month'); continue; }
    if ((openUntil.get(i) || -1) >= p.iBuy) { runCounts.overlap++; note('already in a trade on this stock'); continue; }
    const h = p.iSell - t, gR = fwd(i, t, h), c0 = ctrl(t, h); if (gR === null || c0 === null || Math.abs(gR) > 3) { note('no exit price'); continue; }
    openUntil.set(i, p.iSell); const tr = { t, s: SYMS[i], g: gR, c: c0, ob: own(i, t, h), sp: spyF(t, h), event: g.date, kinds: [...g.kinds], precision: g.precision, filed: g.filed, buy: p.buy, sell: p.sell };
    run1.push(tr); note('TRADE: ' + pc(gR - COST) + ' after costs'); }

  // 5. CAT-NEWS1: positive / negative 8-Ks per company (a filing with both counts as negative only)
  const negA = new Set(negHits.map(h => h[1])), ev = new Map();
  const addE = (h, sign) => { const cik = h[2]; if (!ev.has(cik)) ev.set(cik, { pos: new Map(), neg: new Map() }); const E = ev.get(cik), s = fsess(h[3]); if (s >= T) return; (sign > 0 ? E.pos : E.neg).set(h[1], s); };
  for (const h of negHits) addE(h, -1); for (const h of posHits) if (!negA.has(h[1])) addE(h, 1);
  const news = [], newsToday = [], nCounts = { companies: ev.size, signals: 0, noPrice: 0, gate: 0, dilution: 0, lottery: 0 };
  for (const [cik, E] of ev) { const P = [...E.pos.values()].sort((a, b) => a - b), N = [...E.neg.values()]; if (P.length < 3) continue;
    const cand = new Set(); for (const s of P) for (let t = s; t <= Math.min(T - 1, s + 59); t++) cand.add(t);
    let busyUntil = -1; const done = new Set();
    for (const t of [...cand].sort((a, b) => a - b)) { if (t < START || t <= busyUntil) continue;
      const nPos = P.filter(s => s <= t && s >= t - 59).length; if (nPos < 3 || N.some(s => s <= t && s >= t - 59)) continue;
      const i = symAt(cik, t, t + 1 < T); if (i === undefined) { nCounts.noPrice++; continue; } if (done.has(i + '_' + t)) continue; done.add(i + '_' + t);
      if (!above50(i, t)) continue; nCounts.signals++;
      const note = (why) => { if (isOC(cik, i)) diag.OCGN.push({ rule: 'CAT-NEWS1', signal: D[t], positives: nPos, result: why }); };
      if (!gateOk(i, t)) { nCounts.gate++; note('under 2 USD or under 2M USD a day'); continue; }
      const dil = dilutedBefore(DIL.by.get(cik), D, t + 1); if (dil) { nCounts.dilution++; note('dilution filing ' + dil); continue; }
      const lj = lottery(i, t); if (lj) { nCounts.lottery++; note('lottery: +' + Math.round(lj * 100) + '% in one day in the last month'); continue; }
      if (t === T - 1) { newsToday.push({ sym: SYMS[i], cik, signal: D[t], positives: nPos, lastClose: +CC(i, t).toFixed(2) }); busyUntil = t + HOLD_NEWS; continue; }
      const g = fwd(i, t, HOLD_NEWS), c0 = ctrl(t, HOLD_NEWS); if (g === null || c0 === null || Math.abs(g) > 3) { note('no exit price yet'); continue; }
      busyUntil = t + HOLD_NEWS; news.push({ t, s: SYMS[i], g, c: c0, ob: own(i, t, HOLD_NEWS), sp: spyF(t, HOLD_NEWS), positives: nPos }); note('TRADE: buy ' + D[t + 1] + ', ' + pc(g - COST) + ' after costs'); } }

  // 6. verdicts (frozen at the first complete run)
  const RES = { 'CAT-RUN1': { name: 'Run-up into a scheduled biotech/medtech catalyst: buy ' + RUN_BEFORE + ' sessions before, sell ' + SELL_BEFORE + ' sessions before', ...judge(run1, BAR), funnel: runCounts },
    'CAT-NEWS1': { name: 'News build-up: 3+ positive 8-Ks in 60 sessions, none negative, above the 50-day; hold ' + HOLD_NEWS + ' sessions', ...judge(news, BAR), funnel: nCounts } };
  const byKind = {}; for (const k of ['PDUFA', 'ADCOM', 'TOPLINE']) byKind[k] = stat(run1.filter(z => z.kinds.includes(k))); const byPrec = {}; for (const k of ['day', 'month', 'quarter', 'half']) byPrec[k] = stat(run1.filter(z => z.precision === k));
  RES['CAT-RUN1'].information = { byKind, byPrecision: byPrec };
  const FR = complete ? freezeEach(PREV.firstRun && PREV.firstRun.results, RES, (r) => r.verdict !== 'TOO FEW CASES') : { ...((PREV.firstRun && PREV.firstRun.results) || {}) };
  const firstRun = Object.keys(FR).length ? { at: (PREV.firstRun && PREV.firstRun.at) || new Date().toISOString(), bar: (PREV.firstRun && PREV.firstRun.bar) || BAR, results: FR } : null;
  const results = Object.fromEntries(Object.keys(RES).map(k => [k, FR[k] || { ...RES[k], verdict: 'NO VERDICT YET (' + RES[k].verdict + (complete ? '' : ', data still loading') + ')' }]));

  // 7. OCGN illustration (not evidence): its biggest 15-session runs in the cache and what each rule did
  const oc = SY.get('OCGN'), ocPx = []; if (oc !== undefined) for (let t = 0; t < T; t++) { const z = CC(oc, t); if (isFinite(z)) ocPx.push([D[t], +z.toFixed(2)]); }
  for (const [t, r] of Object.entries(XROWS.OCGN || {})) if (oc === undefined) ocPx.push([D[t], +r.c.toFixed(2)]);
  const runs = []; for (let a = 0; a < ocPx.length; a++) { let best = a; for (let b = a + 1; b < Math.min(ocPx.length, a + 16); b++) if (ocPx[b][1] > ocPx[best][1]) best = b; if (ocPx[best][1] / ocPx[a][1] >= 1.6 && !runs.some(r => r.to >= ocPx[a][0])) runs.push({ from: ocPx[a][0], px0: ocPx[a][1], to: ocPx[best][0], px1: ocPx[best][1], gain: +(ocPx[best][1] / ocPx[a][1] - 1).toFixed(2) }); }
  const ocCat = [...groups.values()].filter(g => g.cik === OCIK).map(g => ({ event: g.date, kinds: [...g.kinds], precision: g.precision, firstStated: g.filed, text: g.text }));
  const ocNews = ev.get(OCIK) ? { positive: [...ev.get(OCIK).pos.values()].map(s => D[s]).sort(), negative: [...ev.get(OCIK).neg.values()].map(s => D[s]).sort() } : { positive: [], negative: [] };
  const ocgn = { note: 'ILLUSTRATION ONLY, not evidence: one stock cannot prove or disprove a rule.', cacheDays: ocPx.length, firstDay: ocPx[0] && ocPx[0][0], lastDay: ocPx.length ? ocPx[ocPx.length - 1][0] : null, runs60pctIn15: runs, catalystsFound: ocCat, news8K: ocNews, ruleCalls: diag.OCGN, lastClose: ocPx.length ? ocPx[ocPx.length - 1] : null };

  // 8. LIVE: upcoming catalysts (entry window) with buy/sell dates on the NYSE calendar, gates checked on the last cached close
  const last = D[T - 1], future = tradingSessions(new Date(Date.parse(last) + 864e5).toISOString().slice(0, 10), new Date(Date.parse(last) + 400 * 864e5).toISOString().slice(0, 10)), S2 = D.concat(future);
  const HAL = J('data/halal.json', {}), ZAD = J('data/zad-list.json', {}), zbad = new Set(ZAD.notHalal || []), upcoming = [];
  for (const g of groups.values()) { if (g.date <= last) continue; const p = runUpPlan(S2, g.date); if (!p || p.iSell < T) continue;   // its window is over
    const t = T - 1, i = symAt(g.cik, t, false), sym = i !== undefined ? SYMS[i] : (cikTick.get(g.cik) || [])[0] || null;
    const why = []; if (i === undefined) why.push('no tradable price (3 USD+, 1M USD+) on ' + last); else { if (!gateOk(i, t)) why.push('under 2 USD or 2M USD a day'); const lj = lottery(i, t); if (lj) why.push('lottery: +' + Math.round(lj * 100) + '% in one day in the last month'); }
    const dil = dilutedBefore(DIL.by.get(g.cik), S2, p.iBuy); if (dil) why.push('dilution filing ' + dil);
    const hal = sym ? (zbad.has(sym) ? 'fail' : (HAL[sym] && HAL[sym].s) || 'unknown') : 'unknown';
    upcoming.push({ sym, cik: g.cik, event: g.date, eventSession: p.eventSession, kinds: [...g.kinds], precision: g.precision, buy: p.buy, sell: p.sell, entryPassed: p.iBuy < T, firstStated: g.filed, source: SEC + '/Archives/edgar/data/' + g.cik + '/' + String(g.adsh).replace(/-/g, '') + '/', text: g.text, lastClose: i !== undefined ? +CC(i, t).toFixed(2) : null, halal: hal, blocked: why.length > 0, why }); }
  upcoming.sort((a, b) => a.buy < b.buy ? -1 : a.buy > b.buy ? 1 : a.event < b.event ? -1 : 1);
  const tierOf = (id) => { const r = FR[id]; return r && (r.verdict === 'PROVEN' || r.verdict === 'TRADABLE SMALL') ? r.verdict : null; };
  for (const u of newsToday) { u.buy = future[0]; u.sell = future[HOLD_NEWS - 1]; u.halal = zbad.has(u.sym) ? 'fail' : (HAL[u.sym] && HAL[u.sym].s) || 'unknown'; }
  W(TODAY_OUT, { generatedAt: new Date().toISOString(), lastClose: last, sessions: future.slice(0, 260), rules: { 'CAT-RUN1': tierOf('CAT-RUN1'), 'CAT-NEWS1': tierOf('CAT-NEWS1') }, stopPct: 0.15, buyUpToPct: 0.03,
    note: 'Upcoming dated catalysts from 8-Ks (PDUFA, advisory committee, expected topline). Gates (price, dollar volume, lottery, dilution) on the last cached close; halal from data/halal.json + ZAD list. The scan shows a buy only for a rule whose frozen verdict is TRADABLE SMALL or PROVEN; otherwise this is a calendar for information.',
    upcoming: upcoming.filter(u => u.sell >= last).slice(0, 300), news: newsToday });

  const out = { generatedAt: new Date().toISOString(), preRegistered: '2026-10-23', window: [D[START], last], sessions: T - START, bar: BAR, complete,
    data: { fullTextPhrases: FT.phrases, fullTextComplete: FT.complete, missing: FT.missing.slice(0, 20), catalystHits: catHits.length, bioDocuments: bioDocs.size, documentsNotRead: docMissing, dilutionIndexQuarters: DIL.ok + ' of ' + DIL.all, companiesWithTickers: cikTick.size, massiveRefCiks: Object.keys(REF).length, positive8K: posHits.length, negative8K: negHits.length, requests: nReq, failedRequests: nFail },
    caveat: 'Prices: 5-year whole-market cache incl. dead stocks; its rows hold 3 USD+ stocks with 1M USD+ traded, so the 2 USD floor is in practice 3 USD (penny-stock run-ups like OCGN under 3 USD are outside the test). EDGAR full-text search gives filing dates only (no time), used from the first session on/after that date. CAT-NEWS1 positive/negative is by fixed phrases, not by reading: some hits are mentions, not events. results = frozen first verdict (firstRun); latest = monitoring only.',
    results, firstRun, latest: latestBlock({ at: new Date().toISOString(), to: last, results: RES }), ocgn, trades: { 'CAT-RUN1': run1.map(z => ({ s: z.s, buy: z.buy, sell: z.sell, event: z.event, kinds: z.kinds, precision: z.precision, filed: z.filed, net: r4(z.g - COST), avgStock: r4(z.c), sameStock: r4(z.ob) })), 'CAT-NEWS1': news.map(z => ({ s: z.s, buy: D[z.t + 1], sell: D[z.t + HOLD_NEWS], positives: z.positives, net: r4(z.g - COST), avgStock: r4(z.c), sameStock: r4(z.ob) })) } };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('CATALYST LAB (' + D[START] + ' to ' + last + ', bar t ' + BAR + (complete ? '' : '; DATA INCOMPLETE: no verdict frozen') + ')');
  for (const [k, r] of Object.entries(RES)) { const a = r.results.all, o = r.results.older, n = r.results.newer;
    console.log('- ' + k + ': ' + r.verdict + ' | ' + a.n + ' trades, ' + (a.days || 0) + ' days, ' + (a.stocks || 0) + ' stocks, win ' + (a.win !== undefined ? Math.round(a.win * 100) + '%' : 'n/a') + ', avg ' + pc(a.avg) + ', median ' + pc(a.median) + ', worst ' + pc(a.worst) + ' | older ' + (o.n || 0) + ' edge ' + pc(o.edge) + ' t ' + o.t + ' | newer ' + (n.n || 0) + ' edge ' + pc(n.edge) + ' t ' + n.t + ' | ' + r.why.split(';')[0]);
    console.log('  funnel ' + JSON.stringify(r.funnel)); }
  console.log('OCGN: ' + ocPx.length + ' cached days; runs of 60%+ in 15 sessions: ' + runs.map(r => r.from + '->' + r.to + ' ' + pc(r.gain)).join(', ') + '; rule calls: ' + diag.OCGN.length);
  console.log('upcoming catalysts: ' + upcoming.length + ' (' + upcoming.filter(u => !u.blocked && !u.entryPassed).length + ' pass the gates, entry still ahead)');
  // library: from firstRun only
  try { const LB = J('data/strategy-library.json', null); let ch = false;
    for (const id of ['CAT-RUN1', 'CAT-NEWS1']) { const e = LB && LB.strategies.find(x => x.id === id), r = FR[id]; if (!e || !r) continue; const R = r.results;
      e.status = 'tested: ' + r.verdict.toLowerCase(); e.tested = firstRun.at.slice(0, 10); e.study = 'catalyst-lab.mjs -> data/catalyst-lab.json (run once as written, first complete run frozen)';
      e.result = { t: R.newer.t, tOlder: R.older.t, edge: R.newer.edge, edgeOlder: R.older.edge, vsOwn: R.newer.vsOwn, vsOwnOlder: R.older.vsOwn, n: [R.older.n || 0, R.newer.n || 0], avg: R.all.avg, win: R.all.win, bar: firstRun.bar, why: r.why }; ch = true; }
    if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('catalyst-lab: library not updated: ' + e.message); }
})();
