// SQUAD 27 LAB (27 Oct 2026): odd-lot issuer tender arbitrage (squad27-core.mjs header = the exact pre-registered rule).
// Research only; never places an order; no Telegram. Keys only from secrets via env, never printed. Official files only:
// EDGAR quarterly full index + filing index pages + the filed documents (SEC_UA, a shared gate of 8 requests a second, cached in
// squad27-cache); prices = Alpaca SIP daily raw bars (Massive daily aggregates as the fallback). Resumes from its cache until complete;
// the first complete result is frozen in data/squad27-lab.json firstRun (never re-run). Every run also refreshes data/squad27-board.json
// (open SC TO-I offers with an odd-lot clause, filed in the last 60 days, not yet expired) and appends new paper lines.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { ID, ID_A1, FROM, SPLIT, SHARES, BUY_COST, COMMISSION, CA_FEE, PAY_LAG, parseMaster, indexUrl, parseIndexHtm, pickOfferDoc, pickAmendDocs, html2text, offerFields,
  amendmentFields, timeline, expiryAsOf, arbTrade, byHalf, summarize, isComplete, halalMark, preRegister, addDays, dayDiff, r2, r4, mean, median } from './squad27-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const SEC = local(env.SEC_BASE) || 'https://www.sec.gov', AD = local(env.ALPACA_DATA_BASE) || 'https://data.alpaca.markets', MV = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ27_CACHE || 'squad27-cache';
const OUT = 'data/squad27-lab.json', OFFERS = 'data/squad27-offers.json', BOARD = 'data/squad27-board.json', PAPER = 'data/squad27-paper.jsonl', LIB = 'data/strategy-library.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const W = (f, o, pretty) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, pretty ? 1 : 0)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ27_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
const TODAY = env.SQ27_TODAY || iso(Date.now());
fs.mkdirSync(SC + '/f', { recursive: true }); fs.mkdirSync(SC + '/idx', { recursive: true }); fs.mkdirSync(SC + '/px', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {};
log('squad 27 lab; today ' + TODAY + '; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none'));

// ================= 0. PRE-REGISTRATION (idempotent) =================
{ const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' squad 27 entries written now'); }

// ================= 1. NETWORK =================
let lastSec = 0, secReq = 0, secFail = 0, bytes = 0; const SECFAILS = [];
const CODES = {}; async function sec(url, kind = 'text') { for (let a = 0; a < 8; a++) { const w = (local(env.SEC_BASE) ? 0 : 150) - (Date.now() - lastSec); if (w > 0) await sleep(w); lastSec = Date.now(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(120000) }); if (r.status === 404 || r.status === 410) return null;
      CODES[r.status] = (CODES[r.status] || 0) + 1; if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(Math.min(60000, 10000 * (a + 1))); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 160)); return undefined; }
      if (kind === 'buf') { const b = Buffer.from(await r.arrayBuffer()); bytes += b.length; return b; } const txt = await r.text(); bytes += txt.length; return txt; } catch (e) { CODES[e.name] = (CODES[e.name] || 0) + 1; await sleep(3000 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 160)); return undefined; }
let alpReq = 0, mvReq = 0;
async function alp(path) { if (!env.ALPACA_KEY) return null; for (let a = 0; a < 4; a++) { alpReq++; try { const r = await fetch(AD + path, { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET }, signal: AbortSignal.timeout(60000) });
      if (r.status === 429) { await sleep(5000 * (a + 1)); continue; } if (!r.ok) return r.status === 404 || r.status === 422 ? { bars: [] } : null; return await r.json(); } catch (e) { await sleep(2000); } } return null; }
async function mv(path) { if (!env.MASSIVE_KEY) return null; for (let a = 0; a < 4; a++) { mvReq++; await sleep(150); try { const r = await fetch(MV + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) });
      if (r.status === 429) { await sleep(30000); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(2000); } } return null; }

// ================= 2. QUARTERLY INDEX (SC TO-I and SC TO-I/A rows) =================
const quarters = []; for (let y = +FROM.slice(0, 4); y <= +TODAY.slice(0, 4); y++) for (let q = 1; q <= 4; q++) { const start = y + '-' + String((q - 1) * 3 + 1).padStart(2, '0') + '-01'; if (start <= TODAY) quarters.push({ y, q, start }); }
const curQ = quarters[quarters.length - 1], ROWS = [], ST = { quartersNeed: quarters.length, quartersRead: 0 }; const OTHER_FORMS = {};
for (const Q of quarters) { const f = SC + '/idx/' + Q.y + 'Q' + Q.q + '.json', isCur = Q === curQ || (Q.start >= addDays(TODAY, -100)); let rows = isCur ? null : J(f, null);
  if (!rows) { const buf = await sec(SEC + '/Archives/edgar/full-index/' + Q.y + '/QTR' + Q.q + '/master.gz', 'buf');
    if (buf) { let txt; try { txt = zlib.gunzipSync(buf).toString('latin1'); } catch (e) { txt = buf.toString('latin1'); }
      for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length >= 5 && /TO-I|TO-C|TO-T/.test(p[2]) && !/^SC TO-I(\/A)?$/.test(p[2])) OTHER_FORMS[p[2]] = (OTHER_FORMS[p[2]] || 0) + 1; }
      rows = parseMaster(txt).filter(r => r.date >= FROM); W(f, rows); }
    else if (isCur) rows = J(f, null); }
  if (rows) { ST.quartersRead++; ROWS.push(...rows); } else log('index ' + Q.y + 'Q' + Q.q + ' not read'); }
// the current quarter's master index is updated nightly; add the daily indexes since its last day (form.YYYYMMDD.idx are fixed-width, master.YYYYMMDD.idx pipe-delimited)
{ const lastDay = ROWS.reduce((m, r) => r.date > m ? r.date : m, ''); for (let d = addDays(lastDay || TODAY, 1); d <= TODAY; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) continue;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, txt = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx'); if (txt) ROWS.push(...parseMaster(txt).map(r => ({ ...r, date: r.date.length === 8 ? r.date.slice(0, 4) + '-' + r.date.slice(4, 6) + '-' + r.date.slice(6) : r.date }))); } }
{ const seen = new Set(); for (let i = ROWS.length - 1; i >= 0; i--) { if (seen.has(ROWS[i].acc)) ROWS.splice(i, 1); else seen.add(ROWS[i].acc); } }
const ORIGS = ROWS.filter(r => r.form === 'SC TO-I').sort((a, b) => a.date < b.date ? -1 : 1), AMENDS = ROWS.filter(r => r.form === 'SC TO-I/A').sort((a, b) => a.date < b.date ? -1 : 1);
log('index: ' + ST.quartersRead + '/' + ST.quartersNeed + ' quarters; ' + ORIGS.length + ' originals, ' + AMENDS.length + ' amendments; other TO forms seen: ' + JSON.stringify(OTHER_FORMS));

// ================= 3. DOCUMENTS =================
const ffile = (acc) => SC + '/f/' + acc + '.json';
async function readDocs(row, pick) { const idx = await sec(SEC + indexUrl(row.cik, row.acc)); if (idx === undefined) return undefined; if (idx === null) return { miss: 'no index page' };
  const docs = parseIndexHtm(idx), chosen = pick(docs); if (!chosen || (Array.isArray(chosen) && !chosen.length)) return { miss: 'no offer document', types: docs.map(d => d.type).slice(0, 12) };
  const list = Array.isArray(chosen) ? chosen : [chosen.doc]; let text = '', urls = [];
  for (const d of list) { const h = await sec(SEC + d.href); if (h === undefined) return undefined; if (h) { text += '\n' + html2text(h); urls.push(SEC + d.href); } }
  return { text, urls, how: Array.isArray(chosen) ? 'amendment' : chosen.how }; }
async function doOriginal(row) { const prev = J(ffile(row.acc), null); if (prev && (prev.v === 3 || prev.miss || (!prev.ticker && !(prev.security === 'common' && (prev.type === 'dutch' || prev.type === 'fixed'))))) return prev;   // v2 currency check; v3 = bug SQ27-B1 ticker reader: candidates re-read once
  const r = await readDocs(row, pickOfferDoc); if (r === undefined) return undefined;
  const rec = r.miss ? { acc: row.acc, miss: r.miss, types: r.types } : { v: 3, acc: row.acc, how: r.how, url: r.urls[0], ...offerFields(r.text, row.date), chars: r.text.length };
  W(ffile(row.acc), rec); return rec; }
async function doAmend(row, expiryNow) { const prev = J(ffile(row.acc), null); if (prev && prev.v === 1) return prev;
  const r = await readDocs(row, pickAmendDocs); if (r === undefined) return undefined;
  const rec = r.miss ? { v: 1, acc: row.acc, miss: r.miss } : { v: 1, acc: row.acc, urls: r.urls, text: r.text.length > 400000 ? r.text.slice(0, 400000) : r.text };
  W(ffile(row.acc), rec); return rec; }
async function pool(items, fn, n = 4, reserve = 20 * 60e3) { const q = [...items]; await Promise.all(Array.from({ length: n }, async () => { while (q.length && left() > reserve) { const x = q.shift(); try { await fn(x); } catch (e) { log('error ' + (x.acc || '') + ': ' + e.message); } } })); }
const OREC = new Map(); let done = 0;
await pool(ORIGS, async (row) => { const r = await doOriginal(row); if (r) OREC.set(row.acc, r); if (++done % 500 === 0) log('originals ' + done + '/' + ORIGS.length + ', SEC ' + secReq + ' requests, ' + (bytes / 1e9).toFixed(2) + ' GB, failures ' + secFail + ' ' + JSON.stringify(CODES)); });
ST.origNeed = ORIGS.length; ST.origRead = OREC.size;
// offers worth following: listed common-stock cash buybacks with a dollar price (amendments are read for these only)
const OFF = []; for (const row of ORIGS) { const r = OREC.get(row.acc); if (!r || r.miss) continue; OFF.push({ ...row, ...r, date: row.date, cik: row.cik, name: row.name, source: SEC + indexUrl(row.cik, row.acc) }); }
const listed = OFF.filter(o => o.ticker && o.security === 'common' && (o.type === 'dutch' || o.type === 'fixed'));
const byCik = new Map(); for (const o of OFF) { if (!byCik.has(o.cik)) byCik.set(o.cik, []); byCik.get(o.cik).push(o); }
const AM = new Map(); for (const a of AMENDS) { const cand = (byCik.get(a.cik) || []).filter(o => o.date <= a.date && dayDiff(o.date, a.date) <= 400); if (!cand.length) continue; const o = cand[cand.length - 1];
  if (!AM.has(o.acc)) AM.set(o.acc, []); AM.get(o.acc).push(a); }
const followAcc = new Set(listed.map(o => o.acc)), amendNeed = []; for (const o of listed) for (const a of AM.get(o.acc) || []) amendNeed.push({ row: a, o });
const AREC = new Map(); done = 0;
await pool(amendNeed, async ({ row, o }) => { const r = await doAmend(row, o.expiry); if (r) AREC.set(row.acc, r); if (++done % 500 === 0) log('amendments ' + done + '/' + amendNeed.length); }, 4, 12 * 60e3);
ST.amendNeed = amendNeed.length; ST.amendRead = AREC.size;
log('documents: originals ' + ST.origRead + '/' + ST.origNeed + ', listed cash share offers ' + listed.length + ', amendments ' + ST.amendRead + '/' + ST.amendNeed);

// timelines (amendments parsed in filing order, each against the expiry in force at its filing)
for (const o of listed) { const am = []; let exp = o.expiry; for (const a of (AM.get(o.acc) || []).sort((x, y) => x.date < y.date ? -1 : 1)) { const r = AREC.get(a.acc); if (!r || r.miss) continue;
    const fields = amendmentFields(r.text, a.date, exp); if (fields.extendTo && exp && fields.extendTo > exp) exp = fields.extendTo; am.push({ date: a.date, acc: a.acc, url: (r.urls || [])[0], fields }); }
  Object.assign(o, timeline(o, am, TODAY), { amendments: am.map(a => ({ date: a.date, url: a.url, extendTo: a.fields.extendTo, terminated: a.fields.terminated, finalPrice: a.fields.finalPrice })) }); }

// ================= 4. PRICES =================
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []);
async function barsFor(sym, from, to) { const f = SC + '/px/' + sym.replace(/[^A-Z0-9.]/g, '_') + '_' + from + '_' + to + '.json'; const c = J(f, null); if (c && (c.D.length || to < addDays(TODAY, -10))) return c;
  let D = [], C = [], src = 'alpaca', tok = null;
  do { const j = await alp('/v2/stocks/bars?symbols=' + encodeURIComponent(sym) + '&timeframe=1Day&start=' + from + '&end=' + to + '&adjustment=raw&feed=sip&sort=asc&limit=10000' + (tok ? '&page_token=' + encodeURIComponent(tok) : ''));
    if (!j) { D = null; break; } for (const b of (j.bars && j.bars[sym]) || []) { D.push(b.t.slice(0, 10)); C.push(b.c); } tok = j.next_page_token; } while (tok);
  if (!D || !D.length) { const j = await mv('/v2/aggs/ticker/' + encodeURIComponent(sym.replace('.', '')) + '/range/1/day/' + from + '/' + to + '?adjusted=false&sort=asc&limit=50000');
    if (j && Array.isArray(j.results) && j.results.length) { D = j.results.map(x => iso(x.t)); C = j.results.map(x => x.c); src = 'massive'; } else if (!D) return null; }
  const out = { D, C, src }; if (D.length || to < addDays(TODAY, -10)) W(f, out); return out; }
const eligible = listed.filter(o => o.oddLot); ST.pxNeed = 0; ST.pxOk = 0; const PX = new Map();
for (const o of eligible) { if (o.status === 'open' || o.status === 'unknown') continue; ST.pxNeed++; if (left() < 6 * 60e3) continue;
  const to = addDays(o.termDate && o.termDate > (o.finalExpiry || '') ? o.termDate : (o.finalExpiry || addDays(o.date, 60)), 20); const b = await barsFor(o.ticker, addDays(o.date, -7), to < TODAY ? to : TODAY);
  if (b && b.D.length) { PX.set(o.acc, b); ST.pxOk++; } }
log('prices: ' + ST.pxOk + '/' + ST.pxNeed + ' odd-lot offers priced (alpaca ' + alpReq + ', massive ' + mvReq + ' requests)');

// ================= 5. TRADES AND SUMMARIES =================
const TRADES = { E2: [], A1: [] }, SKIPS = { E2: {}, A1: {} };
for (const o of eligible) for (const how of ['E2', 'A1']) { const b = PX.get(o.acc); const t = b ? arbTrade(o, b, how) : (o.status === 'open' || o.status === 'unknown' ? { skip: o.status === 'open' ? 'open' : 'outcome unknown' } : { skip: 'no prices' });
  if (t.skip) { SKIPS[how][t.skip] = (SKIPS[how][t.skip] || 0) + 1; if (how === 'E2') o.e2 = { skip: t.skip, close: t.close ?? null }; continue; }
  t.halal = halalMark(o.ticker, HAL, ZBAD); t.name = o.name; TRADES[how].push(t); if (how === 'E2') o.e2 = t; else o.a1 = t; }
const years = {}; for (const o of OFF) { const y = o.date.slice(0, 4); const Y = years[y] = years[y] || { scToI: 0, listedCashShares: 0, oddLot: 0, oddLotCompleted: 0, oddLotTerminated: 0, oddLotUnknown: 0, gapAtE2: 0 }; Y.scToI++;
  if (!listed.includes(o)) continue; Y.listedCashShares++; if (o.oddLot) { Y.oddLot++; if (o.status === 'completed') Y.oddLotCompleted++; if (o.status === 'terminated') Y.oddLotTerminated++; if (o.status === 'unknown') Y.oddLotUnknown++; } }
for (const t of TRADES.E2) years[t.entry.slice(0, 4)] && (years[t.entry.slice(0, 4)].gapAtE2++);
const allListedDone = listed.filter(o => o.status === 'completed' || o.status === 'terminated'), oddDone = eligible.filter(o => o.status === 'completed' || o.status === 'terminated');
const headline = { listedOffers: listed.length, oddLotOffers: eligible.length, oddLotShare: r4(eligible.length / Math.max(1, listed.length)), completionRateListed: r4(allListedDone.filter(o => o.status === 'completed').length / Math.max(1, allListedDone.length)),
  completionRateOddLot: r4(oddDone.filter(o => o.status === 'completed').length / Math.max(1, oddDone.length)), outcomeUnknownOddLot: eligible.filter(o => o.status === 'unknown').length,
  typeCounts: listed.reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {}), oddLotByType: eligible.reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {}), dutchActualPriceMissing: TRADES.E2.filter(t => t.profitActual === null).length };
const results = (how) => ({ actual: byHalf(TRADES[how], 'profitActual'), min: byHalf(TRADES[how], 'profitMin'), skips: SKIPS[how], halalOk: summarize(TRADES[how].filter(t => t.halal === 'ok'), 'profitActual'), haveHalalMark: TRADES[how].filter(t => t.halal !== 'unknown').length });
const COMPL = isComplete(ST), VER = (how) => { const R = results(how), a = R.actual.all; return { verdict: !a.n ? 'TOO FEW' : a.n < 20 ? 'TOO FEW (information only)' : 'INFORMATION ONLY (not a scan rule)', results: R, headline, years,
    assumptions: { shares: SHARES, buyCost: BUY_COST, commissionUSD: COMMISSION + ' (ASSUMED: scan.mjs default ZAD stock fee)', corporateActionFeeUSD: CA_FEE + ' (ASSUMED: ZAD fee unknown)', cashDate: PAY_LAG + ' sessions after the final expiry (ASSUMED)', split: SPLIT }, data: { ...ST, complete: COMPL.ok, why: COMPL.why, secRequests: secReq, secFailures: secFail, httpCodes: CODES, failSample: SECFAILS.slice(0, 5) } }; };
const RES = { [ID]: VER('E2'), [ID_A1]: VER('A1') };
const firstRun = COMPL.ok ? freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), ...r }]))) : FROZEN;
// corrected run (bug SQ27-B1, squad27-core.mjs header): frozen once, next to firstRun, on the same rule and window
const BUGS = { bugs: ['SQ27-B1'], explanation: 'Ticker reader missed \'New York Stock Exchange ("NYSE") under the symbol "X"\' (a quote between the exchange and the symbol), so about 50 listed offers were counted as NOT LISTED. Fixed reader; candidates re-read; same rule, costs, entries and window.' };
const correctedRun = COMPL.ok && Object.keys(FROZEN).length ? freezeEach(PREV.correctedRun || {}, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), ...BUGS, ...r }]))) : (PREV.correctedRun || {});

// ================= 6. BOARD (open offers now) =================
const board = []; for (const o of OFF.filter(o => o.oddLot && o.ticker && dayDiff(o.date, TODAY) <= 60)) { const exp = expiryAsOf(o.expiryHist || [{ from: o.date, expiry: o.expiry }], TODAY);
  if (!exp || exp < TODAY || o.status === 'terminated' || o.status === 'completed') continue;
  const j = await alp('/v2/stocks/bars?symbols=' + encodeURIComponent(o.ticker) + '&timeframe=1Day&start=' + addDays(TODAY, -10) + '&adjustment=raw&feed=sip&sort=desc&limit=1'), b = j && j.bars && (j.bars[o.ticker] || [])[0];
  const close = b ? b.c : null, gap = close && o.min ? o.min / close - 1 : null, buy = close ? SHARES * close * (1 + BUY_COST) : null;
  board.push({ sym: o.ticker, name: o.name, filed: o.date, expiry: exp, type: o.type, min: o.min, max: o.max, security: o.security, financingCondition: o.financingCondition, minimumCondition: o.minimumCondition,
    oddLotQuote: o.oddLotQuote, lastClose: close, lastCloseDate: b ? b.t.slice(0, 10) : null, gapToMin: r4(gap), profitAtMinUSD: buy && o.min ? r2(SHARES * o.min - buy - COMMISSION - CA_FEE) : null, capitalUSD: buy ? r2(buy + COMMISSION) : null,
    halal: halalMark(o.ticker, HAL, ZBAD), source: o.source, offerDoc: o.url, note: o.security !== 'common' || !(o.type === 'dutch' || o.type === 'fixed') ? 'not a plain cash share offer: read it' : gap !== null && gap <= 0 ? 'no gap now: the stock trades at or above the minimum' : '' }); }
board.sort((a, b) => (b.gapToMin ?? -9) - (a.gapToMin ?? -9));
W(BOARD, { at: new Date().toISOString(), today: TODAY, note: 'Open issuer tender offers (SC TO-I filed in the last 60 days, not yet expired) whose Offer to Purchase has an odd-lot priority clause. Information only: no order is ever placed. Profit = 99 x minimum price - 99 x last close x 1.008 - 3 USD commission - 25 USD corporate-action fee (both ASSUMED). Ask ZAD before acting.', offers: board }, true);
// paper lane: one line per new board offer (record only)
{ const seen = new Set(); try { for (const l of fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean)) seen.add(JSON.parse(l).key); } catch (e) {}
  const add = board.filter(x => !seen.has(x.sym + '|' + x.filed)).map(x => JSON.stringify({ type: 'seen', key: x.sym + '|' + x.filed, at: TODAY, sym: x.sym, expiry: x.expiry, min: x.min, max: x.max, lastClose: x.lastClose, gapToMin: x.gapToMin, halal: x.halal }));
  if (add.length) fs.appendFileSync(PAPER, add.join('\n') + '\n'); }

// ================= 7. WRITE =================
const slim = (o) => ({ acc: o.acc, cik: o.cik, name: o.name, filed: o.date, ticker: o.ticker || null, security: o.security, type: o.type, min: o.min, max: o.max, oddLot: o.oddLot, oddLotQuote: o.oddLotQuote || undefined,
  expiry: o.expiry, finalExpiry: o.finalExpiry, extensions: o.expiryHist ? o.expiryHist.length - 1 : undefined, financingCondition: o.financingCondition, minimumCondition: o.minimumCondition, status: o.status, finalPrice: o.finalPrice, finalQuote: o.finalQuote || undefined, termDate: o.termDate || undefined,
  halal: o.ticker ? halalMark(o.ticker, HAL, ZBAD) : undefined, e2: o.e2, a1: o.a1, source: o.source, offerDoc: o.url, amendments: o.amendments });
W(OFFERS, { at: new Date().toISOString(), note: 'Every SC TO-I original 2019..now whose offer document was read. listed = a ticker quoted next to an exchange in the offer; only listed common-stock cash offers with a dollar price have amendments read and a status.', count: OFF.length,
  listed: listed.map(slim), notListedOrOther: OFF.filter(o => !listed.includes(o)).map(o => ({ acc: o.acc, cik: o.cik, name: o.name, filed: o.date, ticker: o.ticker || null, security: o.security, type: o.type, oddLot: o.oddLot, source: o.source })),
  unread: ORIGS.filter(r => !OREC.has(r.acc) || OREC.get(r.acc).miss).map(r => ({ acc: r.acc, name: r.name, filed: r.date, why: OREC.get(r.acc) ? OREC.get(r.acc).miss : 'not read yet' })) });
W(OUT, { updated: new Date().toISOString(), what: 'Squad 27: odd-lot issuer tender arbitrage (SQ27-ODDLOT). Rule = squad27-core.mjs header. Information / paper lane only; not read by scan.mjs.', status: COMPL.ok ? 'complete' : 'collecting: ' + COMPL.why,
  firstRun, correctedRun, latest: latestBlock({ at: new Date().toISOString(), results: RES }), board: { count: board.length, file: BOARD } }, true);

// library result (once, from firstRun)
try { const LB = J(LIB, null); let ch = 0; for (const id of [ID, ID_A1]) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const a = r.results.actual, m = r.results.min;
    e.status = 'tested ' + r.at.slice(0, 10) + ': ' + r.verdict; e.result = { n: a.all.n, older: a.older, newer: a.newer, conservativeMin: { n: m.all.n, avg: m.all.avg, median: m.all.median, worst: m.all.worst, total: m.all.total }, offersPerYear: r.years, headline: r.headline }; ch++; }
  for (const id of [ID, ID_A1]) { const e = LB && LB.strategies.find(x => x.id === id), r = correctedRun[id]; if (!e || !r || e.correctedResult) continue; const a = r.results.actual, m = r.results.min;
    e.status = 'tested 27 Oct 2026: ' + r.verdict + ' (corrected run, bug SQ27-B1)'; e.correctedResult = { bugs: r.bugs, n: a.all.n, older: a.older, newer: a.newer, conservativeMin: { n: m.all.n, avg: m.all.avg, median: m.all.median, worst: m.all.worst, total: m.all.total }, offersPerYear: r.years, headline: r.headline }; ch++; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { log('library result: ' + e.message); }
const A = RES[ID].results.actual.all, M = RES[ID].results.min.all;
console.log('SQUAD 27 LAB | ' + (COMPL.ok ? 'complete' : 'collecting (' + COMPL.why + ')') + ' | listed offers ' + listed.length + ', odd-lot ' + eligible.length + ' | E2 trades ' + (A.n || 0) + ' avg ' + A.avg + ' median ' + A.median + ' worst ' + A.worst + ' total ' + A.total + ' | min case avg ' + M.avg + ' | board ' + board.length + ' | frozen ' + Object.keys(firstRun).join(', '));
