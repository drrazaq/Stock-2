// OPTIONS LANE (owner, 23 Oct 2026: "check not only trading but options too, with the same mindset"). Long calls only, 1 contract.
// Four rules, each pre-registered in data/strategy-library.json BEFORE any run (OPT-LH1, OPT-CAT1, OPT-FOLLOW1, OPT-UOA1); the pure
// rules live in options-core.mjs (tests: test/options-core.test.mjs). This file fetches and caches the data and writes
// data/options-lab.json (verdicts, the options-traders leaderboard, data coverage). Run once as written: the first complete verdict of
// each rule is frozen in firstRun; later runs are monitoring only. Never places orders, never sends Telegram.
// DATA (probe of 23 Oct 2026, kept in data/options-lab.json "probe"): Alpaca daily option bars (trade prices, no quotes) from about
// Jan 2024; Alpaca option contracts incl. expired ones; Alpha Vantage free key: HISTORICAL_OPTIONS refused (premium), 25 calls a day;
// Massive option aggregates 403. So spreads are measured today from Alpaca snapshots and applied to the past (stated limit).
// Env: MODE=probe runs the old probe only (kept in git history); V15_PICKS=opt-cache/v15-picks.json (written by quality.mjs Q_PICKS).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { optionNet, pickContract, exitValue, verdictOf, isOptionsCall, entrySession, tierOfVerdict, stats, splitHalves, tStat, STOCK_COST, STRESS_X, TIER2_T, PROOF_T, MIN_PER_HALF } from './options-core.mjs';
const env = process.env, sleep = (ms) => new Promise(r => setTimeout(r, ms)), OUT = 'data/options-lab.json', CD = env.OPT_CACHE || 'opt-cache';
const local=u=>u&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)?u:null;
const AD=local(env.ALPACA_DATA)||'https://data.alpaca.markets',AT=local(env.ALPACA_TRADE)||'https://paper-api.alpaca.markets';
const AH = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' } };
const WINDOW_FROM = '2024-02-01', r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10), dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const readJ = (f, d) => { try { const b = fs.readFileSync(f); return JSON.parse(f.endsWith('.gz') ? zlib.gunzipSync(b).toString() : b.toString()); } catch (e) { return d; } };
const writeGz = (f, o) => fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o)));
fs.mkdirSync(CD, { recursive: true }); fs.mkdirSync('data', { recursive: true });
// a crash is written into the output file (the Actions log cannot be read from outside)
const crash = (e) => { try { const p = readJ(OUT, {}); fs.writeFileSync(OUT, JSON.stringify({ ...p, crashedAt: new Date().toISOString(), crash: String(e && e.stack || e).slice(0, 2000) }, null, 1)); } catch (x) {} console.error(e); process.exit(1); };
process.on('uncaughtException', crash); process.on('unhandledRejection', crash);
const prev = readJ(OUT, {});
const cov = { alpaca: { requests: 0, errors: {}, firstOptionBar: null, lastOptionBar: null, contractLists: 0, contractsSeen: 0, optionSeriesFetched: 0, snapshotCalls: 0 },
  alphaVantage: (prev.coverage && prev.coverage.alphaVantage) || null, massive: (prev.coverage && prev.coverage.massive) || null };
// ---- Alpaca, throttled (free plan: 200 requests a minute) and cached ----------------------------------------------------------------
let lastCall = 0;
const kindOf = (url) => /\/v2\/stocks\/bars/.test(url) ? (/feed=sip/.test(url) ? 'stockBars-sip' : 'stockBars') : /\/options\/contracts/.test(url) ? 'contracts' : /\/options\/bars/.test(url) ? 'optionBars' : /snapshots/.test(url) ? 'snapshots' : 'other';
const failed = (url, why) => { const k = kindOf(url) + ' ' + why; cov.alpaca.errors[k] = (cov.alpaca.errors[k] || 0) + 1; if ((cov.alpaca.failedSample = cov.alpaca.failedSample || []).length < 25) cov.alpaca.failedSample.push(k + ' ' + url.replace(/^https?:\/\/[^/]+/, '').slice(0, 160)); };
async function alp(url) { for (let a = 0; a < 5; a++) { const w = 330 - (Date.now() - lastCall); if (w > 0) await sleep(w); lastCall = Date.now(); cov.alpaca.requests++;
    let r; try { r = await fetch(url, {...AH,redirect:'error',signal:AbortSignal.timeout(15000)}); } catch (e) { failed(url, e.message); await sleep(3000); continue; }
    if (r.status === 429) { await sleep(15000); continue; } if (!r.ok) { failed(url, 'HTTP ' + r.status); if (r.status >= 500) { await sleep(3000); continue; } return null; }
    return r.json().catch(() => null); } return null; }
async function pages(url, key) { const out = {}; let tok = null, n = 0;
  do { const j = await alp(url + (tok ? '&page_token=' + encodeURIComponent(tok) : '')); if (!j) return n ? out : null; const v = j[key];
    if (Array.isArray(v)) (out._ = out._ || []).push(...v); else if (v) for (const [k, a] of Object.entries(v)) (out[k] = out[k] || []).push(...a);
    tok = j.next_page_token; n++; } while (tok && n < 200); return out; }
// stock daily bars, raw and split-adjusted, from Dec 2023 (one cache file each, refreshed to yesterday)
const TODAY = new Date().toISOString().slice(0, 10);
const SB = { raw: readJ(CD + '/stocks-raw.json.gz', {}), split: readJ(CD + '/stocks-split.json.gz', {}) };
let stockFeed = 'sip';
async function stockBars(syms) { const need = [...new Set(syms)].filter(s => s && !(SB.raw[s] && SB.raw[s].to >= addDays(TODAY, -3)));
  for (let i = 0; i < need.length; i += 50) { const b = need.slice(i, i + 50);
    for (const adj of ['raw', 'split']) { let got = await pages(AD + '/v2/stocks/bars?symbols=' + b.map(encodeURIComponent).join(',') + '&timeframe=1Day&start=2023-12-01&end=' + TODAY + '&adjustment=' + adj + '&feed=' + stockFeed + '&limit=10000', 'bars');
      if (!got && stockFeed === 'sip') { stockFeed = 'iex'; got = await pages(AD + '/v2/stocks/bars?symbols=' + b.map(encodeURIComponent).join(',') + '&timeframe=1Day&start=2023-12-01&end=' + TODAY + '&adjustment=' + adj + '&feed=iex&limit=10000', 'bars'); }
      for (const s of b) { const a = (got && got[s]) || []; SB[adj][s] = { to: TODAY, feed: stockFeed, d: a.map(x => x.t.slice(0, 10)), o: a.map(x => x.o), c: a.map(x => x.c) }; } } }
  writeGz(CD + '/stocks-raw.json.gz', SB.raw); writeGz(CD + '/stocks-split.json.gz', SB.split); }
const px = (adj, s, d, f) => { const x = SB[adj][s]; if (!x) return null; const i = x.d.indexOf(d); return i < 0 ? null : x[f][i]; };
// call contracts of an underlying, expiring from 2024-01-01 (active and expired), cached per symbol for 7 days
const CT = readJ(CD + '/contracts.json.gz', {});
async function contracts(sym) { const c = CT[sym]; if (c && Date.now() - Date.parse(c.at) < 7 * 864e5) return c.list;
  const list = []; for (const st of ['inactive', 'active']) { const g = await pages(AT + '/v2/options/contracts?underlying_symbols=' + encodeURIComponent(sym) + '&type=call&status=' + st + '&expiration_date_gte=2024-01-01&limit=10000', 'option_contracts');
    cov.alpaca.contractLists++; for (const x of (g && g._) || []) if (x.underlying_symbol === sym || x.root_symbol === sym) list.push({ occ: x.symbol, exp: x.expiration_date, k: +x.strike_price, size: +x.size || 100 }); }
  CT[sym] = { at: new Date().toISOString(), list }; cov.alpaca.contractsSeen += list.length; return list; }
// daily bars of option contracts over their last 130 days, cached per contract (complete once the contract has expired)
const OB = readJ(CD + '/option-bars.json.gz', {});
async function optionBars(occs, exp) { const need = occs.filter(o => !(OB[o] && (OB[o].full || OB[o].to >= LAST)));
  for (let i = 0; i < need.length; i += 100) { const b = need.slice(i, i + 100), end = exp < LAST ? exp : LAST;   // never today: the free plan refuses the latest data (HTTP 403)
    const g = await pages(AD + '/v1beta1/options/bars?symbols=' + b.join(',') + '&timeframe=1Day&start=' + addDays(exp, -130) + '&end=' + end + '&limit=10000', 'bars'); if (!g) continue;
    for (const o of b) { const a = (g[o] || []).map(x => ({ t: x.t.slice(0, 10), o: x.o, c: x.c, v: x.v })); OB[o] = { to: end, full: exp < LAST, a }; cov.alpaca.optionSeriesFetched++;
      for (const x of a) { if (!cov.alpaca.firstOptionBar || x.t < cov.alpaca.firstOptionBar) cov.alpaca.firstOptionBar = x.t; if (!cov.alpaca.lastOptionBar || x.t > cov.alpaca.lastOptionBar) cov.alpaca.lastOptionBar = x.t; } } }
  const out = {}; for (const o of occs) out[o] = (OB[o] && OB[o].a) || []; return out; }
const saveCache = () => { writeGz(CD + '/contracts.json.gz', CT); writeGz(CD + '/option-bars.json.gz', OB); };

if ((env.MODE || 'run') === 'probe') { console.log('probe mode retired: the probe result is kept in data/options-lab.json (probe)'); process.exit(0); }
if (!env.ALPACA_KEY || !env.ALPACA_SECRET) { fs.writeFileSync(OUT, JSON.stringify({ ...prev, generatedAt: new Date().toISOString(), status: 'NOT RUN', why: 'no Alpaca key' }, null, 1)); process.exit(0); }

// ---- sessions (SPY) ------------------------------------------------------------------------------------------------------------------
await stockBars(['SPY']); const SESS = SB.raw.SPY.d.filter(d => d >= '2023-12-01' && d < TODAY), SI = new Map(SESS.map((d, i) => [d, i])), LAST = SESS[SESS.length - 1];
const nextSession = (d) => SESS.find(x => x > d) || null;
const lastOnOrBefore = (d) => { let r = null; for (const x of SESS) { if (x > d) break; r = x; } return r; };

// ---- one option trade (shared by OPT-LH1 / OPT-CAT1 / OPT-FOLLOW1) -----------------------------------------------------------------
// sig: { sym, entry: 'YYYY-MM-DD' session, exit: session, expPick: (expiries sorted) => expiry or null }
const counts = () => ({ signals: 0, beforeWindow: 0, notFinished: 0, noStockPrice: 0, noContracts: 0, noExpiry: 0, noPrice: 0, split: 0, priced: 0, exitByClose: 0, exitByIntrinsic: 0 });
async function oneTrade(sig, C) { C.signals++;
  if (sig.entry < WINDOW_FROM) { C.beforeWindow++; return null; } if (!sig.exit || sig.exit > LAST) { C.notFinished++; return null; }
  const o0 = px('raw', sig.sym, sig.entry, 'o'), c1 = px('raw', sig.sym, sig.exit, 'c'), a0 = px('split', sig.sym, sig.entry, 'o'), a1 = px('split', sig.sym, sig.exit, 'c'), ac0 = px('split', sig.sym, sig.entry, 'c'), rc0 = px('raw', sig.sym, sig.entry, 'c');
  if (!(o0 > 0 && c1 > 0 && a0 > 0 && a1 > 0)) { C.noStockPrice++; return null; }
  if (Math.abs((c1 / a1) / (rc0 / ac0) - 1) > 0.01) { C.split++; return null; }   // a split during the hold (raw / adjusted ratio changed)
  const list = await contracts(sig.sym); if (!list.length) { C.noContracts++; return null; }
  const exps = [...new Set(list.map(x => x.exp))].sort(), exp = sig.expPick(exps); if (!exp) { C.noExpiry++; return null; }
  const chain = list.filter(x => x.exp === exp && x.size === 100 && /^[A-Z][A-Z.]*\d{6}C\d{8}$/.test(x.occ)),   // standard contracts only (an adjusted '1RYTM...' is refused by the bars endpoint)
    near = [...chain].sort((a, b) => Math.abs(a.k - o0) - Math.abs(b.k - o0) || a.k - b.k).slice(0, 8);
  const bars = await optionBars(near.map(x => x.occ), exp), pick = pickContract(near, bars, sig.entry, o0); if (!pick) { C.noPrice++; return null; }
  const ex = exitValue(bars[pick.occ], sig.exit, c1, pick.k); C.priced++; C[ex.by === 'close' ? 'exitByClose' : 'exitByIntrinsic']++;
  return { sym: sig.sym, e: SI.get(sig.entry), entry: sig.entry, exit: sig.exit, occ: pick.occ, exp, k: pick.k, spot: o0, open: pick.open, out: ex.px, outBy: ex.by,
    stock: r4(a1 / a0 - 1 - STOCK_COST), ...(sig.extra || {}) }; }
// spreads measured today (Alpaca option snapshots, indicative feed): h = max(2%, median (ask-bid)/mid of the 6 calls nearest the money / 2)
const SPR = {};
async function spreadOf(sym, lo, hi) { const key = sym + '|' + lo + '|' + hi; if (key in SPR) return SPR[key];
  const spot = SB.raw[sym] && SB.raw[sym].c.length ? SB.raw[sym].c[SB.raw[sym].c.length - 1] : null; cov.alpaca.snapshotCalls++;
  const j = spot ? await alp(AD + '/v1beta1/options/snapshots/' + encodeURIComponent(sym) + '?feed=indicative&type=call&limit=1000&expiration_date_gte=' + addDays(TODAY, lo) + '&expiration_date_lte=' + addDays(TODAY, hi)) : null;
  const rows = j && j.snapshots ? Object.entries(j.snapshots).map(([occ, v]) => { const m = occ.match(/C(\d{8})$/), q = v.latestQuote || {}; return m && q.ap > 0 && q.bp > 0 && q.ap >= q.bp ? { k: +m[1] / 1000, rel: (q.ap - q.bp) / ((q.ap + q.bp) / 2) } : null; }).filter(Boolean) : [];
  const near = rows.sort((a, b) => Math.abs(a.k - spot) - Math.abs(b.k - spot)).slice(0, 6).map(x => x.rel).sort((a, b) => a - b);
  return SPR[key] = near.length ? near[near.length >> 1] : null; }
async function priceTrades(rule, raw, lo, hi) { const syms = [...new Set(raw.map(t => t.sym))], rel = {};
  for (const s of syms) rel[s] = await spreadOf(s, lo, hi);
  const hs = Object.values(rel).filter(x => x !== null).map(x => Math.max(0.02, x / 2)).sort((a, b) => a - b), p75 = hs.length ? hs[Math.floor(hs.length * 0.75)] : 0.05;
  for (const t of raw) { const h = rel[t.sym] !== null ? Math.max(0.02, rel[t.sym] / 2) : p75; t.h = r4(h); t.hMeasured = rel[t.sym] !== null;
    t.net = r4(optionNet(t.open, t.out, h)); t.netStress = r4(optionNet(t.open, t.out, h * STRESS_X)); t.cost = +(100 * t.open * (1 + h) + 5).toFixed(2); }
  return { measured: hs.length, of: syms.length, medianH: hs.length ? r4(hs[hs.length >> 1]) : null, p75H: r4(p75), window: lo + '-' + hi + ' days' }; }
const LEAGUE = (() => { const b = readJ('data/agent-league.json', {}).bar; return isFinite(b) ? b : null; })(), BAR = Math.max(TIER2_T, LEAGUE || 0, PROOF_T);
const info = (trades, B) => { const s = trades.filter(t => t.cost <= 300); return { under300: s.length ? stats(s, B) : { n: 0 }, byExit: { close: trades.filter(t => t.outBy === 'close').length, intrinsic: trades.filter(t => t.outBy === 'intrinsic').length } }; };
// INFORMATION ONLY, never a second chance to pass (the verdict is the registered one): the same trades at a 2% half-spread, at the
// mid (fees only), and only the trades whose exit was a real close (not the intrinsic floor)
const sens = (raw, B) => { const at = (a, h) => a.map(t => ({ ...t, net: optionNet(t.open, t.out, h === undefined ? t.h : h), netStress: optionNet(t.open, t.out, (h === undefined ? t.h : h) * STRESS_X) }));
  const brief = (a) => { const v = verdictOf(a, { B, bar: BAR }); return { wouldBe: v.verdict, n: v.n, avg: v.avg, median: v.median, win: v.win, stock: v.stock, tBlock: v.tBlock, halves: v.half ? [v.half.older.avg, v.half.newer.avg] : null }; };
  const cl = raw.filter(t => t.outBy === 'close'); return { note: 'information only; the verdict above is the registered one', halfSpread2pct: brief(at(raw, 0.02)), atMid: brief(at(raw, 0)), closeExitsOnly: brief(cl), closeExitsOnlyHalfSpread2pct: brief(at(cl, 0.02)) }; };
const slim = (t) => ({ s: t.sym, in: t.entry, out: t.exit, occ: t.occ, k: t.k, spot: t.spot, o: t.open, x: t.out, by: t.outBy, h: t.h, net: t.net, st: t.stock, ...(t.tr ? { tr: t.tr } : {}) });
const R = {}, T = {};

// ---- OPT-LH1: calls 60-90 days out on each NEW V15 pick ------------------------------------------------------------------------------
{ const P = readJ(env.V15_PICKS || CD + '/v15-picks.json', null), C = counts();
  if (!P || !Array.isArray(P.formations)) R['OPT-LH1'] = { verdict: 'NOT RUN', why: 'no V15 picks file (quality.mjs Q_PICKS did not run)' };
  else { const sigs = []; let prevSet = new Set();
    for (const f of P.formations) { const entry = nextSession(f.d); for (const s of f.syms) if (!prevSet.has(s) && entry) { const i = SI.get(entry);
        sigs.push({ sym: s, entry, extra: { formed: f.d }, mkExit: (exp) => { const a = SESS[i + 125] || null, b = addDays(exp, -21) <= LAST ? lastOnOrBefore(addDays(exp, -21)) : null; return a && (!b || a < b) ? a : b; },
          expPick: (exps) => exps.find(x => dayDiff(entry, x) >= 60 && dayDiff(entry, x) <= 90) || null }); }
      prevSet = new Set(f.syms); }
    await stockBars(sigs.filter(x => x.entry >= WINDOW_FROM).map(x => x.sym)); const raw = [];
    for (const s of sigs) { if (s.entry < WINDOW_FROM) { C.signals++; C.beforeWindow++; continue; } const list = await contracts(s.sym); if (!list.length) { C.signals++; C.noContracts++; continue; }
      const exp = s.expPick([...new Set(list.map(x => x.exp))].sort()); if (!exp) { C.signals++; C.noExpiry++; continue; } s.exit = s.mkExit(exp); const t = await oneTrade(s, C); if (t) raw.push(t); }
    saveCache(); const sp = await priceTrades('OPT-LH1', raw, 60, 90), v = verdictOf(raw, { B: 63, bar: BAR });
    R['OPT-LH1'] = { ...v, counts: C, spread: sp, formations: P.formations.length, picksFrom: P.formations[0] && P.formations[0].d, picksTo: P.to, ...info(raw, 63), sensitivity: sens(raw, 63) }; T['OPT-LH1'] = raw.map(slim); } }

// ---- OPT-CAT1: a call expiring after the catalyst, on each CAT-RUN1 entry ------------------------------------------------------------
{ const CL = readJ('data/catalyst-lab.json', null), tr = CL && CL.trades && CL.trades['CAT-RUN1'], C = counts();
  if (!Array.isArray(tr)) R['OPT-CAT1'] = { verdict: 'WAITS FOR CAT-RUN1', why: 'no CAT-RUN1 trades in data/catalyst-lab.json' };
  else { const sigs = tr.map(x => ({ sym: x.s, entry: x.buy, exit: x.sell, extra: { event: x.event, kinds: x.kinds, catNet: x.net }, expPick: (exps) => exps.find(e => e > x.event && dayDiff(x.event, e) <= 60) || null }));
    await stockBars(sigs.filter(x => x.entry >= WINDOW_FROM).map(x => x.sym)); const raw = [];
    for (const s of sigs) { const t = await oneTrade(s, C); if (t) raw.push(t); }
    saveCache(); const sp = await priceTrades('OPT-CAT1', raw, 30, 90), v = verdictOf(raw, { B: 30, bar: BAR });
    R['OPT-CAT1'] = { ...v, counts: C, spread: sp, catRun1Verdict: CL.results && CL.results['CAT-RUN1'] && (CL.results['CAT-RUN1'].verdict || CL.results['CAT-RUN1']), ...info(raw, 30), sensitivity: sens(raw, 30),
      stockSameTrades: raw.length ? r4(raw.reduce((a, t) => a + t.stock, 0) / raw.length) : null }; T['OPT-CAT1'] = raw.map(slim); } }

// ---- OPT-FOLLOW1: options traders of the follow lane ---------------------------------------------------------------------------------
const board = [];
{ const C = counts(); let rows = [];
  try { rows = fs.readFileSync('data/follow-calls.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) {}
  const opt = rows.filter(isOptionsCall).sort((a, b) => Date.parse(a.pub) - Date.parse(b.pub)), last = new Map(), calls = [];
  for (const c of opt) { const k = c.tr + '|' + c.sym, p = Date.parse(c.pub); if (last.has(k) && p - last.get(k) < 5 * 864e5) continue; last.set(k, p); calls.push(c); }
  const sigs = []; for (const c of calls) { const i = entrySession(c.pub, SESS); if (i === null) { C.signals++; C.notFinished++; continue; } const entry = SESS[i];
    sigs.push({ sym: c.sym, entry, exit: SESS[i + 9] || null, extra: { tr: c.tr, name: c.n, src: c.src, pub: c.pub, text: String(c.tt || '').slice(0, 140) }, expPick: (exps) => exps.find(x => dayDiff(entry, x) >= 30 && dayDiff(entry, x) <= 60) || null }); }
  await stockBars(sigs.filter(x => x.entry >= WINDOW_FROM).map(x => x.sym)); const raw = [];
  for (const s of sigs) { const t = await oneTrade(s, C); if (t) raw.push(t); }
  saveCache(); const sp = await priceTrades('OPT-FOLLOW1', raw, 30, 60);
  const byT = new Map(); for (const t of raw) { if (!byT.has(t.tr)) byT.set(t.tr, []); byT.get(t.tr).push(t); }
  const allTr = new Map(); for (const c of calls) allTr.set(c.tr, { name: c.n, src: c.src, calls: (allTr.get(c.tr) || { calls: 0 }).calls + 1 });
  const judgedN = [...byT.values()].filter(a => a.length >= 30 && new Set(a.map(z => z.e)).size >= 10).length, zInvBar = luckBar(judgedN);
  for (const [tr, a0] of allTr) { const a = byT.get(tr) || [], s = a.length ? stats(a, 10) : { n: 0 }, row = { tr, name: a0.name, src: a0.src, optionsCalls: a0.calls, priced: a.length, days: s.days || 0, avg: s.avg ?? null, stock: s.stock ?? null, win: s.win ?? null, tBlock: s.tBlock ?? null };
    if (a.length < 30 || (s.days || 0) < 10) { row.level = 'WATCH'; row.why = a.length + ' priced options calls on ' + (s.days || 0) + ' days (30 on 10 needed)'; }
    else { const v = verdictOf(a, { B: 10, bar: Math.max(BAR, zInvBar) }), hv = splitHalves(a), ho = stats(hv.older, 10), hn = stats(hv.newer, 10), w2 = [...a.map(z => z.net)].sort((x, y) => x - y).slice(2);
      const fade = ho.avg < 0 && hn.avg < 0 && s.tBlock <= -TIER2_T && w2.length && w2.reduce((x, y) => x + y, 0) / w2.length < 0;
      row.level = (v.verdict === 'TRADABLE SMALL' || v.verdict === 'PROVEN') && s.tBlock >= zInvBar ? 'FOLLOW' : fade ? 'FADE' : 'NO EDGE'; row.why = row.level === 'FADE' ? 'lost in both halves, block t ' + s.tBlock : v.why; row.half = v.half; }
    board.push(row); }
  board.sort((a, b) => b.priced - a.priced || (b.avg ?? -9) - (a.avg ?? -9));
  const pooled = raw.length ? verdictOf(raw, { B: 10, bar: BAR }) : null, fol = board.filter(b => b.level === 'FOLLOW');
  R['OPT-FOLLOW1'] = { verdict: fol.length ? 'TRADABLE SMALL' : board.some(b => b.level !== 'WATCH') ? 'NO FOLLOW TRADER' : 'TOO FEW CASES', why: fol.length ? fol.length + ' trader(s) passed: ' + fol.map(b => b.name).join(', ') : judgedN + ' trader(s) had 30+ priced options calls on 10+ days; none passed the gates and the luck bar (block t ' + zInvBar.toFixed(2) + ')',
    follow: fol.map(b => b.tr), luckBar: +zInvBar.toFixed(2), judged: judgedN, optionsCallsFound: opt.length, afterDedupe: calls.length, traders: allTr.size, counts: C, spread: sp,
    pooledInfo: pooled ? { verdict: pooled.verdict, why: pooled.why, n: pooled.n, days: pooled.days, avg: pooled.avg, median: pooled.median, win: pooled.win, stock: pooled.stock, noBest2: pooled.noBest2, tBlock: pooled.tBlock, half: pooled.half } : null, ...info(raw, 10), sensitivity: raw.length ? sens(raw, 10) : null };
  T['OPT-FOLLOW1'] = raw.map(slim); }

// ---- OPT-UOA1: needs daily call volume AND open-interest history ------------------------------------------------------------------
R['OPT-UOA1'] = { verdict: 'NEEDS DATA', why: 'call VOLUME history exists (Alpaca daily option bars carry each contract\'s volume), but OPEN INTEREST history does not: Alpaca\'s contract list gives only the latest open interest, ' +
  'Alpha Vantage HISTORICAL_OPTIONS (volume + open interest per day) is a premium endpoint the free key cannot call, and the free HISTORICAL_VOLUME_OPEN_INTEREST_RATIO gives only a per-contract ratio (the open interest of contracts that did not trade cannot be recovered) at 25 calls a day. ' +
  'Unlock: an Alpha Vantage premium plan key in ALPHAVANTAGE_KEY (HISTORICAL_OPTIONS gives each contract\'s daily volume and open interest); the rule then runs as registered.' };

// ---- verdicts, first run frozen, output -------------------------------------------------------------------------------------------
function luckBar(judged) { const erfc0 = (x) => { const z = Math.abs(x), t = 1 / (1 + 0.5 * z), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; };
  const zInv = (p) => { let lo = 0, hi = 10; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (0.5 * erfc0(m / Math.SQRT2) > p) lo = m; else hi = m; } return (lo + hi) / 2; };
  return Math.max(TIER2_T, zInv(0.05 / Math.max(1, judged))); }
// frozen once: a COMPLETE run (under 1% of Alpaca requests failed) with a real verdict for OPT-LH1 / OPT-CAT1. OPT-FOLLOW1 is a living
// per-trader board (as the follow lane): it is re-judged on every run, never frozen.
{ let f = null, l = null, n = 0; for (const v of Object.values(OB)) for (const x of v.a || []) { n++; if (!f || x.t < f) f = x.t; if (!l || x.t > l) l = x.t; }
  Object.assign(cov.alpaca, { firstOptionBar: f, lastOptionBar: l, optionSeriesCached: Object.keys(OB).length, optionBarsCached: n, underlyingsWithContracts: Object.values(CT).filter(c => c.list.length).length, underlyingsWithoutContracts: Object.values(CT).filter(c => !c.list.length).length, contractsCached: Object.values(CT).reduce((a, c) => a + c.list.length, 0) }); }
// completeness counts the requests that price trades (stock bars on the feed used, contract lists, option bars); the SIP feed refusal
// (the free plan falls back to IEX) and spread snapshots (a missing one uses the 75th percentile) do not make a run incomplete
const errN = Object.entries(cov.alpaca.errors).filter(([k]) => /^(stockBars|contracts|optionBars) /.test(k)).reduce((a, [, b]) => a + b, 0), complete = errN <= cov.alpaca.requests * 0.01;
const firstRun = prev.firstRun || { at: new Date().toISOString(), results: {} };
for (const id of ['OPT-LH1', 'OPT-CAT1']) { const r = R[id]; if (complete && r && !firstRun.results[id] && /^(PROVEN|TRADABLE SMALL|NOT PROVEN|REJECTED)$/.test(r.verdict)) firstRun.results[id] = { at: new Date().toISOString(), verdict: r.verdict, why: r.why, n: r.n ?? null, avg: r.avg ?? null, stock: r.stock ?? null, tBlock: r.tBlock ?? null }; }
const verdicts = Object.fromEntries(Object.entries(R).map(([id, r]) => [id, (firstRun.results[id] || {}).verdict || r.verdict]));
const out = { generatedAt: new Date().toISOString(), preRegistered: '2026-10-23', status: 'OK', complete, failedRequests: errN, window: [WINDOW_FROM, LAST], proofBar: BAR, leagueBar: LEAGUE,
  coverage: { ...cov, stockFeed: (() => { const f = {}; for (const v of Object.values(SB.raw)) f[v.feed || 'iex'] = (f[v.feed || 'iex'] || 0) + 1; return f; })(), note: 'Option prices: Alpaca daily option bars (trade prices; no historical quotes, so the spread is measured today from snapshots and applied to the past). Alpha Vantage: free key (25 calls a day; HISTORICAL_OPTIONS refused as premium; the ratio endpoints answer). Massive: option reference answers, option aggregates 403 (not in plan).' },
  verdicts, tiers: Object.fromEntries(Object.entries(verdicts).map(([id, v]) => [id, tierOfVerdict(v)])), firstRun, latest: R, leaderboard: board, trades: T, probe: prev.probe };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
// library: status and result of each rule (first complete verdict only; later runs leave the frozen status)
const L = readJ('data/strategy-library.json', null);
if (L && Array.isArray(L.strategies)) { for (const e of L.strategies) { const r = R[e.id], f = firstRun.results[e.id]; if (!r) continue;
    e.status = f ? 'tested: ' + f.verdict.toLowerCase() : r.verdict === 'NEEDS DATA' ? 'needs data' : r.verdict === 'WAITS FOR CAT-RUN1' ? 'waits for CAT-RUN1' : e.id === 'OPT-FOLLOW1' ? 'living board: ' + r.verdict.toLowerCase() : e.status;
    if (e.id === 'OPT-FOLLOW1') e.result = { optionsCalls: r.optionsCallsFound, afterDedupe: r.afterDedupe, traders: r.traders, judged: r.judged, luckBar: r.luckBar, follow: r.follow, why: r.why, asOf: TODAY };
    if (f && !(e.result && e.result.frozenAt === f.at)) { e.tested = e.tested || firstRun.at.slice(0, 10); e.study = 'options-lab.mjs -> data/options-lab.json (first complete run frozen)'; e.result = { n: r.n ?? null, nHalves: r.half ? [r.half.older.n, r.half.newer.n] : null, avg: r.avg ?? null, median: r.median ?? null, win: r.win ?? null, stock: r.stock ?? null, noBest2: r.noBest2 ?? null, tBlock: r.tBlock ?? null, bar: BAR, why: f.why, frozenAt: f.at }; }
    else if (r.verdict === 'NEEDS DATA') e.result = { why: r.why }; }
  fs.writeFileSync('data/strategy-library.json', JSON.stringify(L, null, 1)); }
console.log('OPTIONS LAB ' + LAST + '\n' + Object.entries(R).map(([id, r]) => id + ': ' + r.verdict + (r.n !== undefined ? ' | n ' + r.n + ', avg ' + r.avg + ', stock ' + r.stock + ', block t ' + r.tBlock : '') + ' | ' + r.why).join('\n'));
console.log('coverage ' + JSON.stringify(cov.alpaca));
