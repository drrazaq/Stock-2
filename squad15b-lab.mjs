// SQUAD 15B LAB (27 Oct 2026): FORWARD PAPER LANE of SQ15-PB12-300 v1 (squad15b-core.mjs = the pre-registered rule, with the owner-review
// corrections). LONG CALLS ONLY, never sells or writes an option, never places an order, no Telegram, not read by scan.mjs. No backtest.
// Runs three times each weekday DURING the session (.github/workflows/squad15b-lab.yml), so that entry and exit quotes are live (<= 15 min).
// DATA: Alpaca (Algo Trader Plus): clock, trading calendar, SIP stock snapshots (latest trade), OPRA call snapshots and latest quotes.
// FILES (its own only): data/squad15b-paper.jsonl (append-only ledger), data/squad15b-board.json, data/squad15b-today.json,
// data/strategy-library.json (its one entry, idempotent).
import fs from 'node:fs';
import { RULE, VERSION, SOURCES, LO, HI, START, EXIT_GRACE, STOCK_COST, STRESS_X, r4, addDays, choose, exitTrigger, exitProblem, callNet, callNetStress, stockNet, dedupe, boardStats, preRegister, ageMin } from './squad15b-core.mjs';
const env = process.env, PAPER = 'data/squad15b-paper.jsonl', BOARD = 'data/squad15b-board.json', TODAYF = 'data/squad15b-today.json', LIB = 'data/strategy-library.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const AD = 'https://data.alpaca.markets', AT = 'https://paper-api.alpaca.markets', AH = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), log = (...a) => console.log(...a);
// 0. pre-registration (idempotent; before anything is read)
{ const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' entry added'); }
if (!env.ALPACA_KEY || !env.ALPACA_SECRET) { log('no Alpaca key'); process.exit(0); }
const errs = {};
async function alp(url) { for (let a = 0; a < 5; a++) { await sleep(40); let r;
  try { r = await fetch(url, { ...AH, signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(2000); continue; }
  if (r.status === 429) { await sleep(10000); continue; } if (!r.ok) { if (r.status >= 500) { await sleep(2000); continue; } errs['HTTP ' + r.status] = (errs['HTTP ' + r.status] || 0) + 1; return null; }
  return await r.json().catch(() => null); } return null; }
async function chainSnap(sym, lo, hi) { const out = {}; let tok = null, n = 0;
  do { const j = await alp(AD + '/v1beta1/options/snapshots/' + encodeURIComponent(sym) + '?feed=opra&type=call&limit=1000&expiration_date_gte=' + lo + '&expiration_date_lte=' + hi + (tok ? '&page_token=' + encodeURIComponent(tok) : ''));
    if (!j) return n ? out : null; Object.assign(out, j.snapshots || {}); tok = j.next_page_token; n++; } while (tok && n < 50);
  return Object.entries(out).filter(([o]) => /^[A-Z]+\d{6}C\d{8}$/.test(o) && o.slice(0, o.length - 15) === sym).map(([occ, v]) => { const m = occ.match(/(\d{6})C(\d{8})$/), q = v.latestQuote || {};
    return { occ, exp: '20' + m[1].slice(0, 2) + '-' + m[1].slice(2, 4) + '-' + m[1].slice(4, 6), k: +m[2] / 1000, delta: v.greeks && isFinite(v.greeks.delta) ? v.greeks.delta : null, iv: v.impliedVolatility ?? null, ap: q.ap, bp: q.bp, as: q.as, bs: q.bs, qt: q.t || null }; }); }
async function stockNow(sym) { const j = await alp(AD + '/v2/stocks/snapshots?symbols=' + encodeURIComponent(sym) + '&feed=sip'), t = j && j[sym] && j[sym].latestTrade; return t && t.p > 0 ? { p: t.p, t: t.t } : null; }
// clock and sessions (New York dates)
const clock = await alp(AT + '/v2/clock'); if (!clock) { log('Error: no market clock'); process.exit(1); }
const NOW = Date.now(), OPEN = !!clock.is_open, TODAY = new Date(clock.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const calJ = await alp(AT + '/v2/calendar?start=' + addDays(START, -10) + '&end=' + addDays(TODAY, 400)), CAL = Array.isArray(calJ) ? calJ.map(x => x.date) : [];
if (!CAL.length) { log('Error: no trading calendar'); process.exit(1); }
const nextSession = (d) => CAL.find(x => x > d) || null, sessionsAfter = (a, b) => CAL.filter(x => x > a && x <= b).length;
log('New York ' + TODAY + ', market ' + (OPEN ? 'OPEN' : 'closed'));
const HAL = J('data/halal.json', {}), BAD = new Set(J('data/zad-list.json', {}).notHalal || []), zad = (s) => BAD.has(s) ? { s: 'fail', by: 'ZAD list notHalal (data/zad-list.json)' } : HAL[s] ? { s: HAL[s].s, by: HAL[s].by, d: HAL[s].d } : { s: 'unknown' };
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })(), add = [];
const all = () => [...lines, ...add], first = (type, id) => all().find(l => l.type === type && l.id === id), at = new Date(NOW).toISOString();
// 1. new signals
{ const raw = [];
  for (const [src, f, m, hold] of SOURCES) { const T = J(f, {}), ms = T.methods && T.methods[m]; if (!ms) continue;
    for (const s of ms.newSignals || []) { const d = s.d || T.lastClose; if (!d || d < START || d > TODAY || !s.sym) continue; raw.push({ src, from: m, hold, sym: s.sym, d, close: s.close ?? null, signalFileAt: T.generatedAt || null }); } }
  const A = all(), closed = (id) => A.some(x => x.type === 'result' && x.id === id), dead = (id) => A.some(x => x.type === 'entry' && x.id === id && x.skip);
  const openSyms = new Set(A.filter(l => l.type === 'signal' && !l.skip && !closed(l.id) && !dead(l.id)).map(l => l.sym));
  for (const s of dedupe(raw.filter(s => !A.some(l => l.type === 'signal' && l.sym === s.sym && l.d === s.d)), openSyms)) { const id = RULE + '|' + s.sym + '|' + s.d, z = zad(s.sym);
    add.push({ type: 'signal', id, rule: RULE, version: VERSION, src: s.src, from: s.from, sym: s.sym, d: s.d, close: s.close, hold: s.hold, signalFileAt: s.signalFileAt, recordedAt: at, zadAtSignal: z,
      ...(z.s !== 'ok' ? { skip: 'EXCLUDED: not ZAD-halal-ok (' + z.s + ')' } : s.skip ? { skip: s.skip } : {}) });
    if (z.s === 'ok' && !s.skip) openSyms.add(s.sym); } }
// 2. entries: first open-market run of the entry session
for (const l of all().filter(l => l.type === 'signal' && !l.skip && !first('entry', l.id))) { const entry = nextSession(l.d); if (!entry || entry > TODAY) continue;
  if (entry < TODAY) { add.push({ type: 'entry', id: l.id, entry, at, skip: 'MISSED: no usable snapshot during the entry session' }); continue; }
  if (!OPEN) continue;
  const rows = await chainSnap(l.sym, addDays(entry, LO), addDays(entry, HI)), now = Date.now();
  if (!rows) { add.push({ type: 'attempt', id: l.id, at, why: 'OPRA snapshot failed' }); continue; }
  const c = choose(rows, entry, now);
  if (c.dataFailure) { add.push({ type: 'attempt', id: l.id, at, why: 'data failure: ' + c.stale + ' of ' + c.inWindow + ' quotes stale', rejected: c.rejected }); continue; }
  const st = await stockNow(l.sym), keep = (r) => ({ occ: r.occ, exp: r.exp, days: r.days, k: r.k, delta: r4(r.delta), iv: r4(r.iv), bid: r.bp, ask: r.ap, bidSize: r.bs, askSize: r.as, quoteAt: r.qt, ageMin: r.ageMin, spread: r.spread, allIn: r.allIn });
  if (!c.pick) { add.push({ type: 'entry', id: l.id, entry, at, skip: 'SKIP: no affordable contract', inWindow: c.inWindow, rejected: c.rejected, stock: st }); continue; }
  const p = c.pick, trig = exitTrigger(CAL, entry, l.hold, p.exp);
  add.push({ type: 'entry', id: l.id, entry, at, chosen: keep(p), alternatives: c.eligible.slice(1).map(keep), nEligible: c.eligible.length, inWindow: c.inWindow, rejected: c.rejected,
    premium: p.allIn, stock: st, stockShares: st ? r4(p.allIn / st.p) : null, exitTrigger: trig }); }
// 3. exits: the first executable bid from the trigger session on
for (const en of all().filter(l => l.type === 'entry' && !l.skip && l.exitTrigger && l.exitTrigger <= TODAY && !first('result', l.id))) {
  const sym = en.id.split('|')[1], occ = en.chosen.occ, late = sessionsAfter(en.exitTrigger, TODAY), seen = all().filter(x => x.type === 'exitTry' && x.id === en.id);
  let q = null, why = 'market closed';
  if (OPEN) { const j = await alp(AD + '/v1beta1/options/quotes/latest?feed=opra&symbols=' + occ); q = j && j.quotes && j.quotes[occ] || null; why = exitProblem(q, Date.now()); }
  const fin = (bid, ask, quoteAt, feasible, stk) => { const net = callNet(en.premium, bid), ns = callNetStress(en.chosen.bid, en.chosen.ask, bid, ask), s = stockNet(en.stock && en.stock.p, stk && stk.p), ss = stockNet(en.stock && en.stock.p, stk && stk.p, STOCK_COST * STRESS_X);
    add.push({ type: 'result', id: en.id, exitAt: at, exitDay: TODAY, trigger: en.exitTrigger, sessionsAfterTrigger: late, bid, ask, quoteAt, quoteAgeMin: r4(ageMin(quoteAt, Date.now())), feasible,
      net: r4(net), netStress: r4(ns), pnlUSD: r4(net * en.premium), pnlUSDStress: r4(ns * en.premium), stockExit: stk, stock: r4(s), stockStress: r4(ss), stockUSD: s === null ? null : r4(en.premium * (1 + s)) }); };
  if (OPEN && why === null) { fin(q.bp, q.ap, q.t, true, await stockNow(sym)); continue; }
  if (OPEN) add.push({ type: 'exitTry', id: en.id, at, why, bid: q ? q.bp ?? null : null, ask: q ? q.ap ?? null : null, quoteAt: q ? q.t ?? null : null });
  if (late > EXIT_GRACE) { const last = [...seen, ...(OPEN ? [add[add.length - 1]] : [])].reverse().find(x => x.bid > 0); fin(last ? last.bid : 0, last ? last.ask : 0, last ? last.quoteAt : null, false, OPEN ? await stockNow(sym) : null); } }
if (add.length) fs.appendFileSync(PAPER, add.map(x => JSON.stringify(x)).join('\n') + '\n');
log('ledger: +' + ['signal', 'entry', 'attempt', 'exitTry', 'result'].map(t => add.filter(x => x.type === t).length + ' ' + t).join(', '));
// 4. board and today
const A = all(), sigs = A.filter(l => l.type === 'signal'), ent = A.filter(l => l.type === 'entry'), resAll = A.filter(l => l.type === 'result');
const block = (keep) => { const S = sigs.filter(keep), ids = new Set(S.map(s => s.id)), E = ent.filter(e => ids.has(e.id)), R = resAll.filter(r => ids.has(r.id)), filled = E.filter(e => !e.skip), skips = {};
  for (const x of [...S.filter(s => s.skip), ...E.filter(e => e.skip)]) { const k = x.skip.split(' (')[0].split(':').slice(0, 2).join(':'); skips[k] = (skips[k] || 0) + 1; }
  const med = (a) => { const v = a.filter(x => typeof x === 'number').sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };
  return { signals: S.length, signalDays: new Set(S.map(s => s.d)).size, underlyings: new Set(S.map(s => s.sym)).size, filled: filled.length, filledDays: new Set(filled.map(e => e.entry)).size, filledUnderlyings: new Set(filled.map(e => e.id.split('|')[1])).size,
    skips, open: filled.filter(e => !R.some(r => r.id === e.id)).length,
    entryMedians: { premium: med(filled.map(e => e.premium)), delta: med(filled.map(e => e.chosen.delta)), days: med(filled.map(e => e.chosen.days)), spread: med(filled.map(e => e.chosen.spread)), quoteAgeMin: med(filled.map(e => e.chosen.ageMin)), eligible: med(filled.map(e => e.nEligible)) },
    closed: boardStats(R) }; };
const board = { [RULE]: { version: VERSION, all: block(() => true), bySource: Object.fromEntries(SOURCES.map(([src]) => [src, block(s => s.src === src)])) } };
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: at, newYorkDate: TODAY, marketOpen: OPEN, paperStart: START, rule: RULE, version: VERSION,
  status: 'forward paper only from 27 Oct 2026; no backtest exists or is claimed; no verdict before 20 closed calls',
  how: 'highest OPRA delta with ask x 100 + 5 <= 300 USD all-in (fee provisional), 45-180 days, full spread (ask-bid)/mid <= 5%, quote <= 15 min, not crossed/locked, sizes > 0; chosen live in the entry session, never substituted; fill ask; exit = first executable bid from the trigger (stock sell session or expiry - 30 days, first); 5 USD each way; stock = same dollars at the latest trade of the same runs, 0.8% round trip; stress = 1.5x costs',
  fields: 'closed: n, mean, median (return on premium), win, lost25/lost50/lost100, worst, best, meanWithout2Best, medianWithout2Best, maxDrawdownUSD, longestLosingStreak, cumulativeUSD, stockMean/stockMedian (same dollars), callMinusStockMean/Median, callBeatStock, infeasibleExits, atStress1_5x (same at 1.5x costs)',
  methods: board, errors: errs }, null, 1));
fs.writeFileSync(TODAYF, JSON.stringify({ generatedAt: at, newYorkDate: TODAY, marketOpen: OPEN, note: 'PAPER ONLY, LONG CALLS ONLY. SQ15-PB12-300 v1: nothing here is a buy; not read by scan.mjs. Halal = the owner\'s ZAD mark at signal time.',
  newSignals: add.filter(x => x.type === 'signal').map(s => ({ sym: s.sym, d: s.d, from: s.from, zad: s.zadAtSignal.s, skip: s.skip || null })),
  newEntries: add.filter(x => x.type === 'entry').map(e => ({ sym: e.id.split('|')[1], occ: e.chosen ? e.chosen.occ : null, delta: e.chosen ? e.chosen.delta : null, premium: e.premium ?? null, alternatives: e.alternatives ? e.alternatives.length : null, exitTrigger: e.exitTrigger || null, skip: e.skip || null })),
  newResults: add.filter(x => x.type === 'result').map(r => ({ sym: r.id.split('|')[1], net: r.net, stock: r.stock, feasible: r.feasible })) }, null, 1));
log(JSON.stringify(board[RULE].all));
