// SQUAD 15 LAB (24 Oct 2026): LONG CALLS on the large, liquid winners (squad15-core.mjs = the pre-registered rules, written after the data
// probe and before any run). Never sells or writes an option, never places an order, no Telegram, never wired into scan.mjs by this squad.
// MODES (env MODE): probe = the Alpaca data probe (kept in data/squad15-lab.json "probe"); run = the one-shot test of the SQ15 rules (first
// complete verdict frozen in firstRun; later runs = monitoring in latest) + the paper lane; paper = the paper lane only (weekday evenings).
// DATA: Alpaca (Algo Trader Plus): SIP daily stock bars, option contracts (active and expired), daily option bars (from 2024-01-18), OPRA
// snapshots (today's bid / ask and greeks). There is NO option bid / ask history (probe: v1beta1/options/quotes 404), so entries are the
// contract's daily-bar open and exits its close, each moved by today's OPRA half-spread of the same stock and contract kind.
// SIGNALS: data/squad11-lab.json (SQ11-PB12, all trades), data/tipster-lab.json (TIP-DIPLEAD), and squad15-cache/sq6-full.json = Squad 6's own
// code re-run offline in a scratch copy keeping ALL trades (the workflow builds it; nothing of Squad 6 is committed).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { RULES, IDS, TARGET, FEE, STOCK_COST, STRESS_X, ERA_FROM, BIG_TV, CAP_USD, PAPER_START, RATE, EXIT_BEFORE, PROOF_T, LATE_EXIT, mean, median, pct, r4, halfOf, dayDiff, addDays, day10,
  impliedVol, bsDelta, pickExpiry, expiryOrder, pickAtm, pickDelta, exitIndex, exitPrice, optionNet, premiumOf, halfSpread, snapPick, onePerStock, judge, preRegister } from './squad15-core.mjs';
const env = process.env, MODE = env.MODE || 'run', OUT = 'data/squad15-lab.json', PAPER = 'data/squad15-paper.jsonl', TODAYF = 'data/squad15-today.json', BOARD = 'data/squad15-board.json', LIB = 'data/strategy-library.json', CD = env.SQ15_CACHE || 'squad15-cache';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const WZ = (f, o) => fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o)));
const AD = 'https://data.alpaca.markets', AT = 'https://paper-api.alpaca.markets';
const AH = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), TODAY = iso(Date.now());
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(CD, { recursive: true });
const PREV = J(OUT, {});
const crash = (e) => { try { fs.writeFileSync(OUT, JSON.stringify({ ...J(OUT, {}), crashedAt: new Date().toISOString(), crash: String(e && e.stack || e).slice(0, 2000) }, null, 1)); } catch (x) {} console.error(e); process.exit(1); };
process.on('uncaughtException', crash); process.on('unhandledRejection', crash);
async function get(url) { try { const r = await fetch(url, AH), txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {} return { status: r.status, j, txt: txt.slice(0, 600), bytes: txt.length }; } catch (e) { return { status: 'ERR', txt: String(e.message).slice(0, 200) }; } }

// ================= PROBE (24 Oct 2026; its result is kept in data/squad15-lab.json "probe") =================
if (MODE === 'probe') {
  if (!env.ALPACA_KEY) { console.log('no key'); process.exit(0); }
  const P = { at: new Date().toISOString() };
  const ct = await get(AT + '/v2/options/contracts?underlying_symbols=AAPL&type=call&expiration_date_gte=' + addDays(TODAY, 150) + '&expiration_date_lte=' + addDays(TODAY, 270) + '&limit=200');
  const list = (ct.j && ct.j.option_contracts) || []; P.contractsActive = { status: ct.status, n: list.length };
  const occ = list.length ? list.sort((a, b) => Math.abs(+a.strike_price - 250) - Math.abs(+b.strike_price - 250))[0].symbol : null; P.activeContract = occ;
  const OLD = 'AAPL250117C00200000';
  const sum = (r, key) => { const v = r.j && r.j[key]; let n = 0, first = null, last = null; if (v && typeof v === 'object') for (const a of Object.values(v)) if (Array.isArray(a)) { n += a.length; if (a.length) { first = first || a[0]; last = a[a.length - 1]; } }
    return { status: r.status, n, first, last, msg: r.j && r.j.message || (r.status !== 200 ? r.txt : undefined) }; };
  P.quotesHist = sum(await get(AD + '/v1beta1/options/quotes?symbols=' + OLD + '&start=2024-10-01T13:30:00Z&end=2024-10-01T14:00:00Z&limit=20'), 'quotes');
  P.quotesHistOpra = sum(await get(AD + '/v1beta1/options/quotes?symbols=' + OLD + '&start=2024-10-01T13:30:00Z&end=2024-10-01T14:00:00Z&limit=20&feed=opra'), 'quotes');
  P.quotesHistRecent = sum(await get(AD + '/v1beta1/options/quotes?symbols=' + (occ || OLD) + '&start=' + addDays(TODAY, -6) + 'T13:30:00Z&end=' + addDays(TODAY, -6) + 'T14:00:00Z&limit=20&feed=opra'), 'quotes');
  { const r = await get(AD + '/v1beta1/options/quotes/latest?symbols=' + (occ || OLD) + '&feed=opra'); P.latestQuoteOpra = { status: r.status, body: r.txt.slice(0, 300) }; }
  { const r = await get(AD + '/v1beta1/options/snapshots/AAPL?feed=opra&type=call&limit=3&expiration_date_gte=' + addDays(TODAY, 150) + '&expiration_date_lte=' + addDays(TODAY, 270));
    const s = r.j && r.j.snapshots ? Object.entries(r.j.snapshots)[0] : null; P.snapshotOpra = { status: r.status, sample: s ? { occ: s[0], keys: Object.keys(s[1]), quote: s[1].latestQuote, greeks: s[1].greeks || null, iv: s[1].impliedVolatility ?? null } : r.txt.slice(0, 300) }; }
  { const r = await get(AD + '/v1beta1/options/snapshots/AAPL?feed=indicative&type=call&limit=3&expiration_date_gte=' + addDays(TODAY, 150) + '&expiration_date_lte=' + addDays(TODAY, 270));
    const s = r.j && r.j.snapshots ? Object.entries(r.j.snapshots)[0] : null; P.snapshotIndicative = { status: r.status, sample: s ? { occ: s[0], quote: s[1].latestQuote, greeks: s[1].greeks || null } : r.txt.slice(0, 300) }; }
  for (const [k, sym, from, to] of [['bars2023', 'AAPL230616C00180000', '2022-06-01', '2023-06-16'], ['barsJan2024', 'AAPL240119C00190000', '2023-01-01', '2024-01-19'], ['barsJun2024', 'AAPL240621C00190000', '2023-06-01', '2024-06-21'], ['barsRecent', occ || OLD, addDays(TODAY, -10), TODAY]])
    P[k] = sum(await get(AD + '/v1beta1/options/bars?symbols=' + sym + '&timeframe=1Day&start=' + from + '&end=' + to + '&limit=1000'), 'bars');
  P.tradesHist = sum(await get(AD + '/v1beta1/options/trades?symbols=' + OLD + '&start=2024-10-01T13:30:00Z&end=2024-10-01T13:40:00Z&limit=5'), 'trades');
  P.stockSipOld = sum(await get(AD + '/v2/stocks/bars?symbols=AAPL&timeframe=1Day&start=2016-01-01&end=2016-01-10&feed=sip&adjustment=raw'), 'bars');
  P.stockSipToday = sum(await get(AD + '/v2/stocks/bars?symbols=AAPL&timeframe=1Day&start=' + addDays(TODAY, -7) + '&end=' + TODAY + '&feed=sip&adjustment=raw'), 'bars');
  P.stockSipMinuteNow = sum(await get(AD + '/v2/stocks/bars?symbols=AAPL&timeframe=1Min&start=' + new Date(Date.now() - 30 * 60e3).toISOString() + '&feed=sip&limit=5'), 'bars');
  fs.writeFileSync(OUT, JSON.stringify({ ...PREV, probe: P }, null, 1));
  console.log(JSON.stringify(P, null, 1).slice(0, 6000)); process.exit(0);
}
if (!env.ALPACA_KEY || !env.ALPACA_SECRET) { fs.writeFileSync(OUT, JSON.stringify({ ...PREV, generatedAt: new Date().toISOString(), status: 'NOT RUN', why: 'no Alpaca key' }, null, 1)); console.log('no Alpaca key'); process.exit(0); }

// ================= 0. PRE-REGISTRATION in the library (idempotent; before any computation) =================
{ const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ15 entries pre-registered now'); }

// ================= 1. ALPACA (throttled, counted, cached) =================
const COV = { requests: 0, errors: {}, failedSample: [] };
const kindOf = (u) => /\/v2\/stocks\/bars/.test(u) ? 'stockBars' : /\/options\/contracts/.test(u) ? 'contracts' : /\/options\/bars/.test(u) ? 'optionBars' : /snapshots/.test(u) ? 'snapshots' : /quotes\/latest/.test(u) ? 'latestQuotes' : /calendar/.test(u) ? 'calendar' : 'other';
let lastCall = 0;
async function alp(url) { for (let a = 0; a < 5; a++) { const w = 40 - (Date.now() - lastCall); if (w > 0) await sleep(w); lastCall = Date.now(); COV.requests++;
    let r; try { r = await fetch(url, { ...AH, signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(2000); if (a === 4) fail(url, e.message); continue; }
    if (r.status === 429) { await sleep(10000); continue; } if (!r.ok) { if (r.status >= 500 && a < 4) { await sleep(2000); continue; } fail(url, 'HTTP ' + r.status); return null; }
    const j = await r.json().catch(() => null); if (j) return j; } return null; }
function fail(url, why) { const k = kindOf(url) + ' ' + why; COV.errors[k] = (COV.errors[k] || 0) + 1; if (COV.failedSample.length < 20) COV.failedSample.push(k + ' ' + url.replace(/^https?:\/\/[^/]+/, '').slice(0, 160)); }
async function pages(url, key) { const out = {}; let tok = null, n = 0;
  do { const j = await alp(url + (tok ? '&page_token=' + encodeURIComponent(tok) : '')); if (!j) return n ? out : null; const v = j[key];
    if (Array.isArray(v)) (out._ = out._ || []).push(...v); else if (v) for (const [k, a] of Object.entries(v)) { if (Array.isArray(a)) (out[k] = out[k] || []).push(...a); else out[k] = a; }
    tok = j.next_page_token; n++; } while (tok && n < 300); return out; }
// stock daily bars (SIP), raw and split-adjusted, from 2023-06-01; cached, refreshed when older than the newest session
const STK = JZ(CD + '/stocks.json.gz', {});
async function stockBars(syms, fresh) { const need = [...new Set(syms)].filter(s => s && !(STK[s] && STK[s].to >= fresh));
  for (let i = 0; i < need.length; i += 50) { const b = need.slice(i, i + 50), got = {};
    for (const adj of ['raw', 'split']) got[adj] = await pages(AD + '/v2/stocks/bars?symbols=' + b.map(encodeURIComponent).join(',') + '&timeframe=1Day&start=2023-06-01&end=' + TODAY + '&adjustment=' + adj + '&feed=sip&limit=10000', 'bars');
    if (!got.raw || !got.split) continue;
    for (const s of b) { const a = got.raw[s] || [], m = new Map((got.split[s] || []).map(x => [x.t.slice(0, 10), x]));
      STK[s] = { to: fresh, d: a.map(x => x.t.slice(0, 10)), o: a.map(x => x.o), c: a.map(x => x.c), v: a.map(x => x.v), ao: a.map(x => (m.get(x.t.slice(0, 10)) || {}).o ?? null), ac: a.map(x => (m.get(x.t.slice(0, 10)) || {}).c ?? null) }; } }
  if (need.length) WZ(CD + '/stocks.json.gz', STK); }
const sx = (s, d) => { const x = STK[s]; if (!x) return -1; if (!x._i) Object.defineProperty(x, '_i', { value: new Map(x.d.map((q, i) => [q, i])), enumerable: false }); return x._i.has(d) ? x._i.get(d) : -1; };
const sv = (s, d, f) => { const i = sx(s, d); return i < 0 ? null : STK[s][f][i]; };
// 63-session average traded value (raw close x volume) up to and including day d
const tv63 = (s, d) => { const x = STK[s], i = sx(s, d); if (i < 62) return null; let a = 0; for (let k = i - 62; k <= i; k++) { const v = x.c[k] * x.v[k]; if (!isFinite(v)) return null; a += v; } return a / 63; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
// newest complete session: SPY's last bar (today's only after 21:00 UTC)
const nowH = new Date().getUTCHours();
await stockBars(['SPY'], TODAY);
const SESS = STK.SPY.d.filter(d => d < TODAY || (d === TODAY && nowH >= 21)), SI = new Map(SESS.map((d, i) => [d, i])), LASTI = SESS.length - 1, LAST = SESS[LASTI];
const idxOnOrBefore = (d) => { let r = -1; for (let i = 0; i < SESS.length && SESS[i] <= d; i++) r = i; return r; };
log('sessions ' + SESS[0] + ' to ' + LAST + ' (' + SESS.length + ')');
// OPRA snapshots of one stock's calls expiring lo..hi (rows { occ, exp, k, delta, ap, bp, iv })
async function chainSnap(sym, lo, hi) { const g = await pages(AD + '/v1beta1/options/snapshots/' + encodeURIComponent(sym) + '?feed=opra&type=call&limit=1000&expiration_date_gte=' + lo + '&expiration_date_lte=' + hi, 'snapshots'); if (!g) return null;
  return Object.entries(g).filter(([occ]) => /C\d{8}$/.test(occ)).map(([occ, v]) => { const m = occ.match(/(\d{6})C(\d{8})$/), q = v.latestQuote || {};
    return { occ, exp: '20' + m[1].slice(0, 2) + '-' + m[1].slice(2, 4) + '-' + m[1].slice(4, 6), k: +m[2] / 1000, delta: v.greeks && isFinite(v.greeks.delta) ? v.greeks.delta : null, iv: v.impliedVolatility ?? null, ap: q.ap, bp: q.bp }; }); }

// ================= 2. THE ONE-SHOT TEST =================
const FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(PROOF_T, +LEAGUE.bar || 0);
let RES = null, TRADES = null, DATA = null;
if (MODE === 'run' || MODE === 'diag') {
  // ---- signals ----
  const S11 = J('data/squad11-lab.json', {}), TIP = J('data/tipster-lab.json', {}), SQ6 = J(CD + '/sq6-full.json', null);
  const SIG = { PB12: [], MOM: [], DIP: [] }, srcInfo = {};
  const pb = (S11.trades || {})['SQ11-PB12'] || []; SIG.PB12 = pb.map(z => ({ src: 'PB12', from: 'SQ11-PB12', sym: z.s, sig: z.sig, buy: z.buy, sell: z.sell }));
  srcInfo.PB12 = { all: pb.length, frozenN: ((S11.firstRun || {})['SQ11-PB12'] || {}).results ? S11.firstRun['SQ11-PB12'].results.all.n : null };
  const dl = (TIP.trades || {})['TIP-DIPLEAD'] || []; SIG.DIP = dl.map(z => ({ src: 'DIP', from: 'TIP-DIPLEAD', sym: z.s, sig: z.sig, buy: z.buy, sell: z.sell })); srcInfo.DIP = { all: dl.length };
  const mt = SQ6 && SQ6.trades ? SQ6.trades['SQ6-MTUM'] || [] : [], qm = SQ6 && SQ6.trades ? SQ6.trades['SQ6-QMOM'] || [] : [];
  srcInfo.MOM = { file: !!SQ6, mtum: mt.length, qmom: qm.length, mtumFrozenN: SQ6 && SQ6.firstRun && SQ6.firstRun['SQ6-MTUM'] ? SQ6.firstRun['SQ6-MTUM'].results.all.n : null, qmomFrozenN: SQ6 && SQ6.firstRun && SQ6.firstRun['SQ6-QMOM'] ? SQ6.firstRun['SQ6-QMOM'].results.all.n : null };
  const momOk = mt.length > 300 && qm.length > 300; srcInfo.MOM.ok = momOk;
  if (momOk) { const seen = new Set(); for (const [z, from] of [...mt.map(z => [z, 'SQ6-MTUM']), ...qm.map(z => [z, 'SQ6-QMOM'])]) { const key = z.s + '|' + z.sig; if (seen.has(key)) continue; seen.add(key); SIG.MOM.push({ src: 'MOM', from, sym: z.s, sig: z.sig, buy: z.buy, sell: z.sell }); } }
  const era = (a) => a.filter(z => z.buy >= ERA_FROM);
  for (const k of Object.keys(SIG)) { srcInfo[k].inEra = era(SIG[k]).length; }
  await stockBars([...new Set(Object.values(SIG).flatMap(a => era(a).map(z => z.sym)))], LAST);
  // MOM: largest names only (63-session traded value >= 500M USD at the formation close)
  { const keep = []; let small = 0, noTv = 0; for (const z of era(SIG.MOM)) { const v = tv63(z.sym, z.sig); if (v === null) { noTv++; continue; } if (v >= BIG_TV) keep.push({ ...z, tv: Math.round(v) }); else small++; }
    srcInfo.MOM.largest = keep.length; srcInfo.MOM.tooSmall = small; srcInfo.MOM.noTradedValue = noTv; SIG.MOM = keep; }
  SIG.PB12 = era(SIG.PB12); SIG.DIP = era(SIG.DIP);
  log('signals in the option era: ' + JSON.stringify(srcInfo));
  // ---- contracts (cached 7 days) and option bars (cached) ----
  const CT = JZ(CD + '/contracts.json.gz', {}), OB = JZ(CD + '/optbars.json.gz', {});
  async function contracts(sym) { const c = CT[sym]; if (c && Date.now() - Date.parse(c.at) < 7 * 864e5) return c.list; const list = []; let okAll = true;
    for (const st of ['inactive', 'active']) { const g = await pages(AT + '/v2/options/contracts?underlying_symbols=' + encodeURIComponent(sym) + '&type=call&status=' + st + '&expiration_date_gte=' + addDays(ERA_FROM, 140) + '&limit=10000', 'option_contracts');
      if (!g) { okAll = false; continue; } for (const x of g._ || []) if (x.underlying_symbol === sym || x.root_symbol === sym) list.push({ occ: x.symbol, exp: x.expiration_date, k: +x.strike_price, size: +x.size || 100 }); }
    if (okAll) CT[sym] = { at: new Date().toISOString(), list }; return list; }
  // bars of contracts from..to; key = occ|from|to
  async function optBars(occs, from, to) { const key = (o) => o + '|' + from + '|' + to, need = occs.filter(o => !OB[key(o)]);
    for (let i = 0; i < need.length; i += 50) { const b = need.slice(i, i + 50), g = await pages(AD + '/v1beta1/options/bars?symbols=' + b.join(',') + '&timeframe=1Day&start=' + from + '&end=' + to + '&limit=10000', 'bars'); if (!g) continue;
      for (const o of b) OB[key(o)] = (g[o] || []).map(x => ({ t: x.t.slice(0, 10), o: x.o, c: x.c, v: x.v })); }
    const out = {}; for (const o of occs) out[o] = OB[key(o)] || []; return out; }
  // ---- price each signal once for each contract kind ----
  const uniq = new Map(); for (const k of ['PB12', 'MOM', 'DIP']) for (const z of SIG[k]) { const key = z.src + '|' + z.sym + '|' + z.buy; if (!uniq.has(key)) uniq.set(key, z); }
  const DBG = [], CNT = {}, cnt = (src, k) => { CNT[src] = CNT[src] || {}; CNT[src][k] = (CNT[src][k] || 0) + 1; }, PRICED = [];
  let done = 0;
  for (const z of uniq.values()) { cnt(z.src, 'signals'); if (++done % 100 === 0) { log('priced ' + done + ' / ' + uniq.size + ' signals'); WZ(CD + '/contracts.json.gz', CT); WZ(CD + '/optbars.json.gz', OB); }
    const e = SI.has(z.buy) ? SI.get(z.buy) : -1, sellI = idxOnOrBefore(z.sell); if (e < 0) { cnt(z.src, 'entryNotASession'); continue; }
    const o0 = sv(z.sym, z.buy, 'o'), a0 = sv(z.sym, z.buy, 'ao'), rc0 = sv(z.sym, z.buy, 'c'), ac0 = sv(z.sym, z.buy, 'ac'); if (!(o0 > 0 && a0 > 0 && rc0 > 0 && ac0 > 0)) { cnt(z.src, 'noStockPrice'); continue; }
    const list = await contracts(z.sym); if (!list.length) { cnt(z.src, 'noContracts'); continue; }
    const order = expiryOrder(list.map(x => x.exp), z.buy); if (!order.length) { cnt(z.src, 'noExpiry'); continue; }
    // the longest monthly whose ATM area traded on the entry day (entry-day bars of its 8 ATM candidates)
    const occDate = (o) => { const m = o.match(/(\d{6})C\d{8}$/); return m ? '20' + m[1].slice(0, 2) + '-' + m[1].slice(2, 4) + '-' + m[1].slice(4, 6) : null; };
    let exp = null, chain = null, atmC = null, b1 = null, atm = null;
    for (const ex of order) { const ch = list.filter(x => x.exp === ex && occDate(x.occ) === ex && x.size === 100 && /^[A-Z][A-Z.]*\d{6}C\d{8}$/.test(x.occ) && x.occ.startsWith(z.sym.replace('.', ''))); if (!ch.length) continue;
      const ac = [...ch].sort((a, b) => Math.abs(a.k - o0) - Math.abs(b.k - o0) || a.k - b.k).slice(0, 8), bb = await optBars(ac.map(c => c.occ), z.buy, addDays(z.buy, 1)), p = pickAtm(ac, bb, z.buy, o0);
      if (!exp) { exp = ex; chain = ch; atmC = ac; b1 = bb; } if (p) { exp = ex; chain = ch; atmC = ac; b1 = bb; atm = p; break; } }
    if (!exp) { cnt(z.src, 'noStandardChain'); continue; }
    const x0 = exitIndex(SESS, sellI, exp); if (x0 > LASTI || x0 <= e) { cnt(z.src, x0 > LASTI ? 'notFinished' : 'exitNotAfterEntry'); continue; }
    const T = dayDiff(z.buy, exp) / 365;
    if (atm) cnt(z.src, 'expiryRank' + order.indexOf(exp));
    if (!atm) { cnt(z.src, 'noAtmTraded'); if (MODE === 'diag' && DBG.length < 8) { const wide = await optBars(atmC.map(c => c.occ), addDays(z.buy, -10), addDays(z.buy, 10)), exps = [...new Set(list.map(x => x.exp))].filter(e => dayDiff(z.buy, e) >= 120 && dayDiff(z.buy, e) <= 300).sort();
        DBG.push({ sym: z.sym, buy: z.buy, spot: o0, exp, expsNear: exps, chainN: chain.length, cands: atmC.map(c => ({ occ: c.occ, k: c.k, entryDayBars: (b1[c.occ] || []).length, barsPm10d: (wide[c.occ] || []).map(b => b.t + ':' + b.v) })) }); } continue; }
    const iv = impliedVol(atm.open, o0, atm.k, T, RATE); const picks = { ATM: { ...atm, delta: null } };
    if (iv) for (const kind of ['ITM70', 'DEEP85']) { const t = TARGET[kind];
        const cand = chain.map(c => ({ ...c, delta: bsDelta(o0, c.k, T, RATE, iv) })).sort((a, b) => Math.abs(a.delta - t) - Math.abs(b.delta - t) || a.k - b.k).slice(0, 8);
        const b2 = await optBars(cand.map(c => c.occ), z.buy, addDays(z.buy, 1)), p = pickDelta(cand, b2, z.buy, o0, T, iv, t); if (p) picks[kind] = p; else cnt(z.src, 'no' + kind + 'Traded'); }
    else cnt(z.src, 'noImpliedVol');
    const endI = Math.min(LASTI, x0 + LATE_EXIT), full = await optBars(Object.values(picks).map(p => p.occ), z.buy, addDays(SESS[endI], 1));
    for (const [kind, p] of Object.entries(picks)) { const ex = exitPrice(full[p.occ], SESS, x0, (q) => sv(z.sym, SESS[q], 'c'), p.k); if (!ex) { cnt(z.src, 'noExitPrice' + kind); continue; }
      const xd = SESS[ex.x], c1 = sv(z.sym, xd, 'c'), a1 = sv(z.sym, xd, 'ac'); if (!(c1 > 0 && a1 > 0)) { cnt(z.src, 'noStockExit' + kind); continue; }
      if (Math.abs((c1 / a1) / (rc0 / ac0) - 1) > 0.01) { cnt(z.src, 'splitDuringHold' + kind); continue; }
      const spy = sv('SPY', xd, 'ac') / sv('SPY', z.buy, 'ao') - 1;
      PRICED.push({ src: z.src, from: z.from, sym: z.sym, sig: z.sig, entry: z.buy, e, exit: xd, x: ex.x, stockSell: z.sell, exp, kind, occ: p.occ, k: p.k, spot: o0, open: p.open, out: ex.px, by: ex.by, iv: r4(iv), delta: r4(p.delta),
        stock: r4(a1 / a0 - 1 - STOCK_COST), spy: r4(spy), days: ex.x - e + 1 }); cnt(z.src, 'priced' + kind); } }
  WZ(CD + '/contracts.json.gz', CT); WZ(CD + '/optbars.json.gz', OB);
  log('priced: ' + JSON.stringify(CNT));
  // DIAG = a data check only (counts and entry-side contract details; no exit, no return, nothing judged or frozen)
  if (MODE === 'diag') { const smp = (src, kind) => PRICED.filter(t => t.src === src && t.kind === kind).slice(0, 4).map(t => ({ sym: t.sym, entry: t.entry, exp: t.exp, occ: t.occ, k: t.k, spot: t.spot, open: t.open, iv: t.iv, delta: t.delta, days: t.days }));
    const byHalf = {}; for (const t of PRICED) { const k = t.src + ' ' + t.kind + ' ' + halfOf(t.entry); byHalf[k] = (byHalf[k] || 0) + 1; }
    fs.writeFileSync(OUT, JSON.stringify({ ...PREV, diag: { at: new Date().toISOString(), last: LAST, sources: srcInfo, counts: CNT, pricedByHalf: byHalf, exitsBy: PRICED.reduce((a, t) => (a[t.by] = (a[t.by] || 0) + 1, a), {}), requests: COV.requests, debugNoAtm: DBG, errors: COV.errors, failedSample: COV.failedSample,
      sample: Object.fromEntries(['PB12', 'MOM', 'DIP'].flatMap(s => ['ATM', 'ITM70', 'DEEP85'].map(k => [s + ' ' + k, smp(s, k)]))) } }, null, 1));
    log('DIAG written: ' + JSON.stringify(byHalf)); process.exit(0); }
  // ---- today's OPRA half-spreads per stock and contract kind ----
  const SPR = {}, syms = [...new Set(PRICED.map(t => t.sym))]; let snapOk = 0;
  await stockBars(syms, LAST);
  for (const s of syms) { const rows = await chainSnap(s, addDays(TODAY, 150), addDays(TODAY, 270)), x = STK[s], spot = x && x.c.length && x.d[x.d.length - 1] >= addDays(LAST, -5) ? x.c[x.c.length - 1] : null;
    SPR[s] = {}; if (rows && rows.length && spot) { snapOk++; for (const kind of ['ATM', 'ITM70', 'DEEP85']) SPR[s][kind] = halfSpread(rows, spot, kind); } }
  const p75 = {}, medH = {}; for (const kind of ['ATM', 'ITM70', 'DEEP85']) { const v = Object.values(SPR).map(o => o[kind]).filter(x => x > 0); p75[kind] = v.length ? pct(v, 0.75) : 0.05; medH[kind] = r4(median(v)); }
  for (const t of PRICED) { const m = SPR[t.sym] && SPR[t.sym][t.kind]; t.h = r4(m > 0 ? m : p75[t.kind]); t.hMeasured = m > 0; t.net = r4(optionNet(t.open, t.out, t.h)); t.netStress = r4(optionNet(t.open, t.out, t.h * STRESS_X)); t.premium = r4(premiumOf(t.open, t.h)); }
  log('spreads: ' + snapOk + ' / ' + syms.length + ' stocks measured; median h ' + JSON.stringify(medH) + '; 75th pct (for unmeasured) ' + JSON.stringify(Object.fromEntries(Object.entries(p75).map(([k, v]) => [k, r4(v)]))));
  // ---- judge each rule ----
  RES = {}; TRADES = {};
  const pool = (src, kind) => onePerStock(PRICED.filter(t => src.includes(t.src) && t.kind === kind).map(t => ({ ...t, entryIdx: t.e, exitIdx: t.x })));
  const sens = (tr) => { const at = (f) => tr.map(t => ({ ...t, net: f(t), netStress: f(t) })), brief = (a) => { const v = judge(a, { bar: BAR }); return { wouldBe: v.verdict, older: pick(v.results.older), newer: pick(v.results.newer) }; };
    const pick = (h) => ({ n: h.n, avg: h.avg, stock: h.stock, edge: h.edge, tBlock: h.tBlock });
    return { note: 'INFORMATION ONLY, never a second chance: the registered verdict is above', atMidFeesOnly: brief(at(t => optionNet(t.open, t.out, 0))), closeExitsOnly: brief(tr.filter(t => t.by === 'close')), withoutTheFee: brief(at(t => (100 * t.out * (1 - t.h)) / (100 * t.open * (1 + t.h)) - 1)) }; };
  for (const id of IDS) { const R = RULES[id];
    if (R.src.includes('MOM') && !momOk) { RES[id] = { verdict: 'NOT RUN', why: 'the full Squad 6 trade list (squad15-cache/sq6-full.json) was not built this run' }; continue; }
    const tr = pool(R.src, R.kind), v = judge(tr, { bar: BAR, info: !!R.info });
    RES[id] = { ...v, name: R.name, kind: R.kind, sources: R.src, counts: Object.fromEntries(R.src.map(s => [s, CNT[s] || {}])), hMedian: medH[R.kind], sensitivity: sens(tr) };
    if (R.info) { const a = pool(R.src, 'ATM'), va = judge(a, { bar: BAR, info: true }); RES[id].atm = { verdict: va.verdict, results: va.results }; }
    TRADES[id] = tr.map(t => ({ s: t.sym, from: t.from, in: t.entry, out: t.exit, exp: t.exp, occ: t.occ, k: t.k, spot: t.spot, o: t.open, x: t.out, by: t.by, iv: t.iv, d: t.delta, h: t.h, prem: t.premium, net: t.net, st: t.stock, spy: t.spy }));
    const h = v.results; log('- ' + id + ': ' + RES[id].verdict + ' | 2024 n ' + h.older.n + ' avg ' + pc(h.older.avg) + ' stress ' + pc(h.older.avgStress) + ' vs stock ' + pc(h.older.stock) + ' t ' + h.older.tBlock
      + ' | 2025-26 n ' + h.newer.n + ' avg ' + pc(h.newer.avg) + ' stress ' + pc(h.newer.avgStress) + ' vs stock ' + pc(h.newer.stock) + ' t ' + h.newer.tBlock + ' | premium median ' + h.all.premium.median + ' USD | ' + v.why.slice(0, 300)); }
  // completeness counts failures that a rerun could change (network, 5xx, 429 left after retries, auth); a deterministic refusal of a symbol
  // (HTTP 422 / 404: Alpaca has no option listing for it, e.g. BK, PSTG) is a 'noContracts' case, not a failed request. Fixed 24 Oct 2026
  // after the first run was refused the freeze only for that (4 x 422 among 245 cached-run requests); its numbers were identical.
  const errN = Object.entries(COV.errors).filter(([k]) => /^(stockBars|contracts|optionBars) /.test(k) && !/HTTP (422|404)$/.test(k)).reduce((a, [, b]) => a + b, 0);
  DATA = { complete: errN <= COV.requests * 0.01 && momOk, failedRequests: errN, requests: COV.requests, sources: srcInfo, counts: CNT, spreadsMeasured: snapOk, stocksPriced: syms.length, medianHalfSpread: medH, p75HalfSpread: Object.fromEntries(Object.entries(p75).map(([k, v]) => [k, r4(v)])) };
}

// ================= 3. PAPER LANE (from Monday 26 Oct 2026) =================
const START = env.PAPER_START || PAPER_START, lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })(), newLines = [];
const has = (type, id) => lines.some(l => l.type === type && l.id === id) || newLines.some(l => l.type === type && l.id === id);
let CAL = null; const calendar = async () => { if (CAL) return CAL; const j = await alp(AT + '/v2/calendar?start=' + addDays(LAST, -10) + '&end=' + addDays(LAST, 420)); CAL = Array.isArray(j) ? j.map(x => x.date) : []; return CAL; };
const PAPER_SRC = [['PB12', 'data/squad11-today.json', 'SQ11-PB12', 126], ['MOM', 'data/squad6-today.json', 'SQ6-MTUM', 126], ['MOM', 'data/squad6-today.json', 'SQ6-QMOM', 63], ['DIP', 'data/tipster-today.json', 'TIP-DIPLEAD', 252]];
{ // 3a. new signals
  for (const [src, f, m, hold] of PAPER_SRC) { const T = J(f, {}), ms = T.methods && T.methods[m]; if (!ms) continue;
    for (const s of ms.newSignals || []) { const d = s.d || T.lastClose; if (!d || d < START || d > LAST) continue;
      if (src === 'MOM') { await stockBars([s.sym], LAST); const v = tv63(s.sym, d); if (!(v >= BIG_TV)) continue; }
      for (const id of IDS) { if (!RULES[id].src.includes(src)) continue; const lid = id + '|' + s.sym + '|' + d; if (has('signal', lid)) continue;
        newLines.push({ type: 'signal', id: lid, rule: id, kind: RULES[id].kind, from: m, sym: s.sym, d, close: s.close, hold, halal: halal(s.sym), recordedAfter: LAST }); } } }
  // 3b. fills: the OPRA ask on the evening of the entry session (the session after the signal)
  const open = [...lines, ...newLines].filter(l => l.type === 'signal' && !has('entry', l.id));
  for (const l of open) { const ei = SESS.findIndex(d => d > l.d); if (ei < 0) continue; const entry = SESS[ei]; if (entry !== LAST) { if (entry < LAST && !has('entry', l.id)) newLines.push({ type: 'entry', id: l.id, missed: true, entry, why: 'no run on the evening of the entry session' }); continue; }
    await stockBars([l.sym], LAST); const spot = sv(l.sym, entry, 'c'), rows = spot ? await chainSnap(l.sym, addDays(entry, 150), addDays(entry, 270)) : null, p = rows ? snapPick(rows, spot, l.kind, entry) : null;
    if (!p) { newLines.push({ type: 'entry', id: l.id, missed: true, entry, why: 'no OPRA quote for a ' + l.kind + ' call 150-270 days out' }); continue; }
    const cal = await calendar(), ci = cal.indexOf(entry), byHold = ci >= 0 ? cal[ci + l.hold - 1] || null : null, lim = addDays(p.exp, -EXIT_BEFORE), byExp = [...cal].reverse().find(d => d <= lim) || null;
    const calEnd = cal[cal.length - 1] || '', exit = byHold && byExp ? (byHold < byExp ? byHold : byExp) : byHold || (byExp && lim < calEnd ? byExp : null);
    newLines.push({ type: 'entry', id: l.id, entry, occ: p.occ, exp: p.exp, k: p.k, delta: p.delta, ask: p.ap, bid: p.bp, premium: r4(100 * p.ap + FEE), within300: 100 * p.ap + FEE <= CAP_USD, spot, plannedExit: exit }); }
  // 3c. exits: the OPRA bid on the evening of the planned exit session
  for (const en of [...lines, ...newLines].filter(l => l.type === 'entry' && !l.missed && l.plannedExit && l.plannedExit <= LAST && !has('result', l.id))) {
    const j = await alp(AD + '/v1beta1/options/quotes/latest?feed=opra&symbols=' + en.occ), q = j && j.quotes && j.quotes[en.occ]; if (!q) continue;
    await stockBars([en.id.split('|')[1]], LAST); const sym = en.id.split('|')[1], s0 = sv(sym, en.entry, 'ac'), s1 = sv(sym, LAST, 'ac');
    const got = Math.max(0, 100 * (q.bp || 0) - FEE), net = got / en.premium - 1;
    newLines.push({ type: 'result', id: en.id, exitDay: LAST, bid: q.bp || 0, net: r4(net), stock: s0 > 0 && s1 > 0 ? r4(s1 / s0 - 1 - STOCK_COST) : null, late: LAST > en.plannedExit }); }
  if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
  log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals, ' + newLines.filter(x => x.type === 'entry').length + ' fills, ' + newLines.filter(x => x.type === 'result').length + ' results');
  const all = [...lines, ...newLines], board = {}, today = {};
  for (const id of IDS) { const sig = all.filter(l => l.type === 'signal' && l.rule === id), res = all.filter(l => l.type === 'result' && l.id.startsWith(id + '|')), ent = all.filter(l => l.type === 'entry' && !l.missed && l.id.startsWith(id + '|'));
    board[id] = { name: RULES[id].name, signals: sig.length, filled: ent.length, open: ent.filter(e => !res.some(r => r.id === e.id)).length, closed: res.length, avgNet: r4(mean(res.map(r => r.net))), avgStock: r4(mean(res.filter(r => r.stock !== null).map(r => r.stock))),
      callBeatStock: res.filter(r => r.stock !== null).length ? r4(res.filter(r => r.stock !== null && r.net > r.stock).length / res.filter(r => r.stock !== null).length) : null, medianPremium: r4(median(ent.map(e => e.premium))), within300: ent.length ? r4(ent.filter(e => e.within300).length / ent.length) : null };
    const fr = (PREV.firstRun || {})[id] || (RES && RES[id]) || null;
    today[id] = { name: RULES[id].name, hold: null, kind: RULES[id].kind, tier: fr ? fr.verdict : null, newSignals: sig.filter(l => l.d === LAST).map(l => ({ sym: l.sym, close: l.close, halal: l.halal, from: l.from })),
      newFills: all.filter(l => l.type === 'entry' && !l.missed && l.entry === LAST && l.id.startsWith(id + '|')).map(e => ({ sym: e.id.split('|')[1], occ: e.occ, ask: e.ask, premium: e.premium, plannedExit: e.plannedExit })) }; }
  fs.writeFileSync(TODAYF, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: LAST, paperStart: START, note: 'PAPER ONLY, LONG CALLS ONLY. Squad 15 calls on the large, liquid winners, recorded forward from 26 Oct 2026. Nothing here is a buy: this file is not read by scan.mjs; a rule must qualify in data/squad15-lab.json firstRun and be wired by the coordinator. Halal = the owner\'s ZAD mark.', methods: today }, null, 1));
  fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: LAST, paperStart: START, fill: 'OPRA ask on the evening of the entry session; exit = OPRA bid on the evening of the exit session; 5 USD a side', methods: board }, null, 1));
}

// ================= 4. OUTPUT + LIBRARY =================
if (MODE === 'run') {
  const strip = (r) => r, isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
  const firstRun = DATA.complete ? freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), window: [ERA_FROM, LAST], bar: BAR, ...strip(r) }])), isJudged) : FROZEN;
  const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad15-core.mjs header + RULES (24 Oct 2026, after the data probe, before any run) + data/strategy-library.json SQ15-*', window: [ERA_FROM, LAST], bar: BAR,
    halves: 'older = entries in 2024, newer = entries in 2025-2026', costs: 'half-spread h measured today on OPRA (floor 1%) applied to the past; stress 1.5x h; ZAD fee 5 USD per contract each side; stock 0.8% round trip',
    data: DATA, coverage: COV, rules: Object.fromEntries(IDS.map(id => [id, RULES[id]])), firstRun, latest: latestBlock({ at: new Date().toISOString(), results: RES }), trades: TRADES, probe: PREV.probe };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  try { const LB = J(LIB, null); let ch = false;
    for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || (e.result && e.result.frozenAt === r.frozenAt)) continue; const R = r.results, H = (k) => R[k] || {};
      e.status = 'tested: ' + r.verdict.toLowerCase() + '; forward paper lane from 26 Oct 2026'; e.tested = LAST; e.study = 'squad15-lab.mjs -> data/squad15-lab.json (run once as written, first complete run frozen)';
      e.result = { verdict: r.verdict, n: [H('older').n, H('newer').n], avg: [H('older').avg, H('newer').avg], stress: [H('older').avgStress, H('newer').avgStress], stock: [H('older').stock, H('newer').stock], edge: [H('older').edge, H('newer').edge],
        noTop2: [H('older').noTop2, H('newer').noTop2], tBlock: [H('older').tBlock, H('newer').tBlock], perYear: [H('older').perYear, H('newer').perYear], premiumMedian: H('all').premium && H('all').premium.median, why: r.why, frozenAt: r.frozenAt }; ch = true; }
    if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('library not updated: ' + e.message); }
  console.log('SQUAD 15 LAB ' + ERA_FROM + ' to ' + LAST + ' | complete ' + DATA.complete + ' | ' + IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict : RES[id].verdict)).join(', '));
} else if (MODE === 'paper') { const p = J(OUT, {}); fs.writeFileSync(OUT, JSON.stringify({ ...p, paperRunAt: new Date().toISOString(), paperLastClose: LAST }, null, 1)); }
