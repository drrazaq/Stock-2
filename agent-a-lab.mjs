// AGENT A LAB (23 Oct 2026, run at the owner's request instead of Sunday). Research only; never places an order.
// Runs these PRE-REGISTERED library entries ONCE AS WRITTEN (data/strategy-library.json; not tuned; the first complete verdict of
// each version is frozen in firstRun, later runs are monitoring only). Pure rules: agent-a-core.mjs (tested in test/agent-a-core.test.mjs).
//   A-ROT1  each month hold the 3 halal funds with the best 6-month return (and the 12-1 month version), equal weights.
//           Yardsticks: holding SPUS, holding HLAL, the S&P 500 (SPY); also the same funds held equally.
//   A-ROT2  each month hold SPUS (or HLAL) if above its 10-month average, else the ZAD-allowed gold fund BAR if gold is above its own
//           10-month average, else cash (0%). Yardstick: always holding the same fund.
//   A-SWR1  the sell-high / buy-back switch (STRETCH and SPIKE, buy back 10% lower, else at the day-60 close as the live rule says),
//           scored as USD gained or lost against simply holding, the cases that never came back included at their opportunity cost.
//   A-E1W1  the frozen E1 earnings-drift rule (earnings-study.mjs, unchanged) on the whole liquid market: the 270 tested companies, the
//           rest and the whole, from the Nasdaq earnings calendar (actual and consensus EPS, report time, every company that reported).
// TIERS (owner, 22 Oct): PROVEN = every gate and t >= the proof bar (max 4.0, league bar). TRADABLE SMALL = both halves positive after 0.8%
// and 1.2% cost, ahead of the yardstick(s) named in the entry AND of the same stock/fund on other days, still ahead without the 2 best,
// block t >= 2.5. HALAL: a fund counts as allowed only if data/halal.json or the ZAD list marks it ok; otherwise it is used as one of the
// commonly listed Shariah-screened US ETFs and every result says 'ZAD check needed'.
// DATA: Massive daily bars (split-adjusted) + Massive cash dividends -> total-return prices for the funds (Massive gives 5 years);
// the whole-market 5-year cache (study-cache/grouped.json.gz, READ ONLY) for A-SWR1 and A-E1W1; the Nasdaq calendar is kept in a-cache/.
// OUTPUTS: data/agent-a-lab.json, data/rot-today.json (this month's holdings per rotation version and its tier), library entries.
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freezeEach, latestBlock } from './first-run.mjs';
import { runRotation, monthEnds, rot1Pick, rot2Pick, monthlyStats, judgeMonthly, switchCase, switchVerdict, nasdaqReport, tStat } from './agent-a-core.mjs';
const env = process.env, HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = env.OUT || 'data/agent-a-lab.json', TODAY_OUT = env.TODAY_OUT || 'data/rot-today.json', CD = env.A_CACHE || 'a-cache';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, W = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pc = (x, d = 1) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%', r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
const SIDE = 0.004, SIDE_S = 0.006, T0 = Date.now(), BUDGET = (+env.A_MINUTES || 100) * 60e3, outOfTime = () => Date.now() - T0 > BUDGET;
fs.mkdirSync(CD, { recursive: true });
const PREV = J(OUT, {}) || {}, LG = J('data/agent-league.json', {}), BAR = +Math.max(2.5, typeof LG.bar === 'number' ? LG.bar : 0, 4.0).toFixed(2);
async function get(url, headers = {}) { for (let a = 0; a < 4; a++) { try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) }); if (r.status === 404) return null; if (r.status === 429 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) return { httpError: r.status }; return await r.json(); } catch (e) { await sleep(1500 * (a + 1)); } } return null; }

// ---- halal status of a fund (ZAD / data/halal.json only; nothing is assumed) ----
const HAL = J('data/halal.json', {}), ZAD = J('data/zad-list.json', {}), zOk = new Set([...(ZAD.halalAgain || []), ...(ZAD.newHalal || [])]), zBad = new Set(ZAD.notHalal || []);
const halalOf = (s) => zBad.has(s) || (HAL[s] && HAL[s].s === 'fail') ? 'not halal (ZAD)' : (HAL[s] && HAL[s].s === 'ok') || zOk.has(s) ? 'ZAD ok' : 'ZAD check needed';

// ================= 1. A-ROT1 / A-ROT2: halal fund rotation =================
const FUNDS = ['SPUS', 'HLAL', 'SPSK', 'SPRE', 'SPTE', 'SPWO', 'UMMA', 'AMAP'], GOLD = 'BAR', SPX = 'SPY';
async function fundBars(sym) { const f = CD + '/etf/' + sym + '.json', had = J(f, null); if (had && Date.now() - Date.parse(had.at) < 12 * 3600e3) return had;
  if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return had; const k = '&apiKey=' + encodeURIComponent(env.MASSIVE_KEY || '');
  const a = await get(PX + '/v2/aggs/ticker/' + sym + '/range/1/day/2016-01-01/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000' + k);
  if (!a || !Array.isArray(a.results)) return had || { at: new Date().toISOString(), bars: [], divs: [], missing: true };
  const dv = []; let p = '/v3/reference/dividends?ticker=' + sym + '&limit=1000', pages = 0;
  while (p && pages++ < 10) { const j = await get(PX + p + k); if (!j || !Array.isArray(j.results)) break; for (const x of j.results) if (x.ex_dividend_date && x.cash_amount > 0) dv.push([x.ex_dividend_date, +x.cash_amount]); p = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null; }
  const out = { at: new Date().toISOString(), bars: a.results.map(b => [iso(b.t), b.o, b.c]), divs: dv }; W(f, out); return out; }
// total-return open/close aligned to D: a cash dividend is reinvested at the previous close (factor 1 + cash / previous close on its ex-date)
function totalReturn(x, D) { const by = new Map(x.bars.map(b => [b[0], b])), dv = new Map(); for (const [d, c] of x.divs) dv.set(d, (dv.get(d) || 0) + c);
  const o = new Array(D.length).fill(NaN), c = new Array(D.length).fill(NaN); let f = 1, prevC = null;
  for (let i = 0; i < D.length; i++) { const b = by.get(D[i]); if (dv.has(D[i]) && prevC > 0) f *= 1 + dv.get(D[i]) / prevC; if (b) { o[i] = b[1] * f; c[i] = b[2] * f; prevC = b[2]; } }
  return { o, c, first: x.bars.length ? x.bars[0][0] : null, divs: x.divs.length }; }

async function rotation() {
  const raw = {}; for (const s of [...FUNDS, GOLD, SPX]) raw[s] = await fundBars(s);
  if (!raw[SPX] || !raw[SPX].bars.length) return { status: 'NOT RUN', why: 'no S&P 500 (SPY) prices from Massive' };
  const D = raw[SPX].bars.map(b => b[0]), TR = {}; for (const [s, x] of Object.entries(raw)) if (x && x.bars && x.bars.length > 30) TR[s] = totalReturn(x, D);
  const funds = FUNDS.filter(s => TR[s]), open = Object.fromEntries(Object.entries(TR).map(([s, x]) => [s, x.o])), close = Object.fromEntries(Object.entries(TR).map(([s, x]) => [s, x.c]));
  const fundClose = Object.fromEntries(funds.map(s => [s, close[s]])), E = monthEnds(D);
  const run = (pick, side) => runRotation({ D, open, close, side, pick }).months, byK = (ms) => new Map(ms.map(m => [m.k, m]));
  const hold = (s) => byK(run(() => (open[s] ? { [s]: 1 } : null), 0));
  const Y = { SPUS: hold('SPUS'), HLAL: hold('HLAL'), 'S&P 500': hold(SPX) };
  const ewPick = (k) => { const ok = funds.filter(s => close[s][E[k]] > 0 && open[s][E[k] + 1] > 0); return ok.length ? Object.fromEntries(ok.map(s => [s, 1 / ok.length])) : null; }, EW = byK(run(ewPick, 0));
  const RES = {}, live = {}, curves = {};
  const build = (id, name, pick, yards, ownMap) => { const base = run(pick, SIDE), st = byK(run(pick, SIDE_S));
    const rows = base.map(m => ({ k: m.k, from: m.from, to: m.to, w: m.w, net: m.net, netStress: st.get(m.k).net, yard: Object.fromEntries(yards.map(y => [y, Y[y].has(m.k) ? Y[y].get(m.k).gross : null])), own: ownMap ? (ownMap.has(m.k) ? ownMap.get(m.k).gross : null) : null }))
      .filter(r => Object.values(r.yard).every(v => typeof v === 'number'));
    const J0 = judgeMonthly(rows, BAR), whole = { strategy: monthlyStats(rows.map(r => r.net)), strategyStress: monthlyStats(rows.map(r => r.netStress)) };
    for (const y of ['SPUS', 'HLAL', 'S&P 500']) whole[y] = monthlyStats(rows.map(r => Y[y].get(r.k)).filter(Boolean).map(m => m.gross));
    if (ownMap) whole['same funds held equally'] = monthlyStats(rows.map(r => r.own).filter(v => typeof v === 'number'));
    whole.beatSPUS = rows.length ? rows.filter(r => r.net > Y.SPUS.get(r.k).gross).length / rows.length : null;
    const held = {}; for (const r of rows) for (const s of Object.keys(r.w)) held[s] = (held[s] || 0) + 1; const cashMonths = rows.filter(r => !Object.keys(r.w).length).length;
    const used = [...new Set(rows.flatMap(r => Object.keys(r.w)))], hal = Object.fromEntries(used.map(s => [s, halalOf(s)]));
    RES[id] = { name, verdict: J0.verdict, why: J0.why, months: rows.length, from: rows[0] && rows[0].from, to: rows.length ? rows[rows.length - 1].to : null, results: J0.results,
      whole: Object.fromEntries(Object.entries(whole).map(([k, v]) => [k, v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, r4(b)])) : r4(v)])),
      monthsHeld: held, cashMonths, halal: hal, label: Object.values(hal).some(v => v !== 'ZAD ok') ? 'ZAD check needed' : 'ZAD ok' };
    curves[id] = rows.map(r => [r.from, r4(r.net), r4(r.yard[yards[0]])]);
    // this month's holding: the pick at the latest month end (decided on its close, bought at the next open)
    const kL = E.length - 1, wL = kL >= 0 ? pick(kL, E) : null; live[id] = { decidedOn: kL >= 0 ? D[E[kL]] : null, buyOn: kL >= 0 && E[kL] + 1 < D.length ? D[E[kL] + 1] : 'the next session', hold: wL, halal: wL ? Object.fromEntries(Object.keys(wL).map(s => [s, halalOf(s)])) : {} }; };
  build('A-ROT1/6m', 'Top 3 halal funds by 6-month return, monthly', (k, E0) => rot1Pick({ k, E: E0, close: fundClose, open, look: '6m' }), ['SPUS', 'HLAL', 'S&P 500'], EW);
  build('A-ROT1/12-1', 'Top 3 halal funds by 12-1 month return, monthly', (k, E0) => rot1Pick({ k, E: E0, close: fundClose, open, look: '12-1' }), ['SPUS', 'HLAL', 'S&P 500'], EW);
  for (const f of ['SPUS', 'HLAL']) if (TR[f]) build('A-ROT2/' + f, f + ' above its 10-month average, else gold (BAR) above its own, else cash', (k, E0) => rot2Pick({ k, E: E0, close, fund: f, gold: GOLD }), [f], null);
  const funds0 = Object.fromEntries([...FUNDS, GOLD, SPX].map(s => [s, TR[s] ? { first: TR[s].first, dividends: TR[s].divs, halal: s === SPX ? 'S&P 500 yardstick (not halal-screened)' : halalOf(s) } : { missing: 'no Massive bars' }]));
  return { status: 'OK', sessions: D.length, from: D[0], to: D[D.length - 1], funds: funds0, results: RES, live, curves, complete: !!(TR.SPUS && TR.HLAL && TR[GOLD] && funds.length >= 4) };
}

// ================= 2. A-SWR1 and 3. A-E1W1 need the whole-market cache =================
function loadStore() { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { return null; } }
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let z = Math.imul(seed ^ seed >>> 15, 1 | seed); z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z; return ((z ^ z >>> 14) >>> 0) / 4294967296; };
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
function switchStudy(store) {
  const D = Object.keys(store.days).sort(), T = D.length, H = 60; if (T < 400) return { status: 'NOT RUN', why: 'only ' + T + ' sessions' };
  const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
  const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), LO = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN), MAIN = new Uint8Array(NS * T);
  D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; LO[k] = x.l ? x.l[j] : Math.min(x.o[j], x.c[j]); V[k] = x.v[j]; MAIN[k] = 1; }
    // dead stocks: rows after a stock fell under the cache's filter are used for exit prices only (never for a trigger)
    if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; O[k] = x.x.o[j]; C[k] = x.x.c[j]; LO[k] = x.x.l ? x.x.l[j] : Math.min(x.x.o[j], x.x.c[j]); } });
  const mid = Math.floor((60 + T - H) / 2), KEYS = ['STRETCH', 'SPIKE'], cases = { STRETCH: [], SPIKE: [] }, ratio = { STRETCH: [], SPIKE: [] }, later = { STRETCH: [], SPIKE: [] };
  let dropped = 0;
  for (let i = 0; i < NS; i++) { const b = i * T, o = O.subarray(b, b + T), c = C.subarray(b, b + T), lo = LO.subarray(b, b + T), q50 = [], dq = []; let s50 = 0, dv = 0; const a50 = new Float32Array(T).fill(NaN), ok = new Uint8Array(T), trig = new Uint8Array(T);
    for (let t = 0; t < T; t++) { const z = MAIN[b + t] ? c[t] : NaN; if (!isFinite(z)) { q50.length = dq.length = 0; s50 = dv = 0; continue; }
      q50.push(z); s50 += z; if (q50.length > 50) s50 -= q50.shift(); if (q50.length === 50) a50[t] = s50 / 50;
      dq.push(z * V[b + t]); dv += z * V[b + t]; if (dq.length > 20) dv -= dq.shift(); ok[t] = z >= 5 && dq.length === 20 && dv / 20 >= 5e6 ? 1 : 0; }
    const nextFree = {}, own = { 0: [], 1: [] }, n0 = { STRETCH: cases.STRETCH.length, SPIKE: cases.SPIKE.length };
    for (let t = 60; t < T - H - 2; t++) { if (!ok[t]) continue; const z = c[t], p = c[t - 1];
      const hit = { STRETCH: a50[t] > 0 && z >= a50[t] * 1.3 && !(p >= a50[t - 1] * 1.3), SPIKE: isFinite(c[t - 10]) && z >= c[t - 10] * 1.25 && !(isFinite(c[t - 11]) && p >= c[t - 11] * 1.25) };
      if (a50[t] > 0 && z >= a50[t] * 1.3 || isFinite(c[t - 10]) && z >= c[t - 10] * 1.25) trig[t] = 1;
      for (const key of KEYS) { if (!hit[key] || t < (nextFree[key] || 0)) continue;
        const r = switchCase({ o, c, lo, t, H, side: SIDE }), rs = switchCase({ o, c, lo, t, H, side: SIDE_S }); if (!r || !rs) { dropped++; continue; }
        cases[key].push({ t, s: SYMS[i], usd: r.usdAdv, usdS: rs.usdAdv, back: r.back, days: r.days, hold: r.hold }); ratio[key].push(r.ratioAdv);
        if (!r.back && t + 120 < T && c[t + 120] > 0) later[key].push((1 - SIDE) - c[t + 120] / o[t + 1]);   // never bought back, still in cash on day 120
        nextFree[key] = t + H; } }
    // the same stock on its OTHER days: the same sale and 10%-lower buy-back on up to 30 random liquid non-trigger days per half
    const R0 = rng(hash(SYMS[i]));
    for (const hf of [0, 1]) { const cand = []; for (let t = hf ? mid : 60; t < (hf ? T - H - 2 : mid); t++) if (ok[t] && !trig[t]) cand.push(t); if (cand.length < 10) continue;
      for (let n = 0; n < Math.min(30, cand.length); n++) { const t = cand[Math.floor(R0() * cand.length)], r = switchCase({ o, c, lo, t, H, side: SIDE }); if (r) own[hf].push(r.usdAdv); } }
    const om = { 0: own[0].length >= 5 ? mean(own[0]) : null, 1: own[1].length >= 5 ? mean(own[1]) : null };
    for (const key of KEYS) for (let j = n0[key]; j < cases[key].length; j++) { const x = cases[key][j]; x.own = om[x.t < mid ? 0 : 1]; delete x.i; } }
  const RES = {};
  for (const key of KEYS) { const V0 = switchVerdict(cases[key], mid, BAR), a = cases[key];
    RES[key + '/LOWER10'] = { name: (key === 'STRETCH' ? 'stock 30%+ above its 50-day average' : 'stock up 25%+ in 10 sessions') + ' -> sell at the next open, buy back 10% lower, else at the day-60 close', verdict: V0.verdict, why: V0.why, results: V0.results,
      whole: { n: a.length, avgUsd: r4(mean(a.map(x => x.usd))), avgUsdStress: r4(mean(a.map(x => x.usdS))), cameBack: r4(a.filter(x => x.back).length / a.length), avgBack: r4(mean(a.filter(x => x.back).map(x => x.usd))), avgNotBack: r4(mean(a.filter(x => !x.back).map(x => x.usd))),
        holdAvg: r4(mean(a.map(x => x.hold))), rebuyMeasure: r4(mean(ratio[key])), neverBuyBackDay120: { n: later[key].length, avg: r4(mean(later[key])) }, tBlockWhole: tStat(Object.values(a.reduce((o, x) => { (o[Math.floor(x.t / 20)] = o[Math.floor(x.t / 20)] || []).push(x.usd); return o; }, {})).map(mean)) } }; }
  return { status: 'OK', from: D[60], to: D[T - H - 3], midSession: D[mid], dropped, results: RES };
}

// ---- A-E1W1: the Nasdaq earnings calendar for every session of the cache window (cached per date) ----
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
async function nasdaqDays(from, to) { const days = []; for (let x = Date.parse(from + 'T12:00:00Z'); x <= Date.parse(to + 'T12:00:00Z'); x += 864e5) { const w = new Date(x).getUTCDay(); if (w > 0 && w < 6) days.push(iso(x)); }
  const reps = [], miss = []; let fetched = 0, last = 0;
  for (const d of days) { const f = CD + '/nasdaq/' + d + '.json'; let rows = J(f, null);
    if (!rows || d >= iso(Date.now() - 7 * 864e5)) { if (outOfTime()) miss.push(d);
      else { const w = (local(env.NASDAQ_BASE) ? 0 : 400) - (Date.now() - last); if (w > 0) await sleep(w); last = Date.now();
        const j = await get(NQ + '/api/calendar/earnings?date=' + d, NQ_HEAD); fetched++;
        if (!j || j.httpError || !j.data) miss.push(d); else { rows = (j.data.rows || []).map(r => nasdaqReport(r, d)).filter(Boolean).map(r => [r.sym, r.t, r.a, r.e]); W(f, rows); } } }
    for (const r of rows || []) reps.push({ sym: r[0], d, t: r[1], a: r[2], e: r[3] }); }
  return { days: days.length, fetched, missing: miss, reps }; }
// run the frozen E1 study (earnings-study.mjs, unchanged) on one set of reports, in a scratch folder, and read back its gates
function runE1(label, syms, cache) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e1w-')); fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data/earnings-cache.json.gz'), zlib.gzipSync(JSON.stringify({ syms: Object.fromEntries(syms.filter(s => cache[s]).map(s => [s, cache[s]])), tried: {} })));
  for (const f of ['data/agent-league.json']) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, f)); fs.writeFileSync(path.join(dir, 'data/settings.json'), JSON.stringify({ quiet: true }));
  const r = spawnSync(process.execPath, [path.join(HERE, 'earnings-study.mjs')], { cwd: dir, env: { PATH: env.PATH, NODE_OPTIONS: env.NODE_OPTIONS || '', MODE: 'study', CACHE: path.resolve(env.CACHE || 'study-cache/grouped.json.gz') }, encoding: 'utf8', maxBuffer: 64e6 });
  const o = J(path.join(dir, 'data/earnings-study.json'), null); fs.rmSync(dir, { recursive: true, force: true });
  if (!o || !o.latest) return { label, status: 'NOT RUN', why: (r.stderr || r.stdout || '').slice(-400) };
  const G = o.latest.gates || {}, H = [['older', G.older, G.stressOlder], ['newer', G.newer, G.stressNewer]], why = [];
  // TRADABLE SMALL gates on E1's own numbers (date-clustered t, one average per entry day = the block)
  if (!H.every(([, g]) => (g && g.n) >= 30)) why.push('fewer than 30 trades in a half (' + H.map(([, g]) => (g && g.n) || 0).join(' / ') + ')');
  else for (const [hf, g, s] of H) { if (!(g.avg > 0)) why.push('lost money after 0.8% costs in the ' + hf + ' half (' + pc(g.avg, 2) + ')'); if (!(s.avg > 0)) why.push('lost money after 1.2% costs in the ' + hf + ' half (' + pc(s.avg, 2) + ')');
    if (!(g.vsAvgStock > 0)) why.push('not better than the average stock in the ' + hf + ' half (' + pc(g.vsAvgStock, 2) + ')'); if (!(g.vsSpy > 0)) why.push('not better than the S&P 500 in the ' + hf + ' half (' + pc(g.vsSpy, 2) + ')');
    if (!(g.vsOwn > 0)) why.push('not better than the same stocks on their non-earnings days in the ' + hf + ' half (' + pc(g.vsOwn, 2) + ')'); if (!(g.without2Best > 0)) why.push('loses without its 2 best trades in the ' + hf + ' half');
    if (!(g.t >= 2.5)) why.push('date-clustered t ' + g.t + ' under 2.5 in the ' + hf + ' half'); }
  const few = !H.every(([, g]) => (g && g.n) >= 30), tier = few ? 'TOO FEW CASES' : why.length ? (H.every(([, g]) => g && g.avg > 0) ? 'NOT PROVEN' : 'REJECTED') : (H.every(([, g]) => g.t >= BAR) ? 'PROVEN' : 'TRADABLE SMALL');
  return { label, status: 'OK', stocksWithReports: syms.filter(s => cache[s]).length, verdict: tier, why: why.join('; ') || 'every tier-2 gate passed in both halves', e1OwnVerdict: o.latest.verdict, e1OwnWhy: o.latest.why, e1Bar: o.latest.bar, gates: G, mainNewer: o.latest.results && o.latest.results.main && o.latest.results.main.newer, allReactionsNewer: o.latest.results && o.latest.results.all && o.latest.results.all.newer }; }

(async () => {
  const out = { generatedAt: new Date().toISOString(), preRegistered: 'data/strategy-library.json entries A-ROT1, A-ROT2, A-SWR1, A-E1W1 (before this run)', bar: BAR, tier2T: 2.5 };
  // 1. rotation
  try { out.rotation = await rotation(); } catch (e) { out.rotation = { status: 'ERROR', why: String(e.stack || e).slice(0, 400) }; }
  // 2 + 3. whole-market cache
  let store = loadStore();
  if (!store) { out.switch = { status: 'NOT RUN', why: 'no price cache' }; out.e1w = { status: 'NOT RUN', why: 'no price cache' }; }
  else { const D = Object.keys(store.days).sort();
    try { out.switch = switchStudy(store); } catch (e) { out.switch = { status: 'ERROR', why: String(e.stack || e).slice(0, 400) }; }
    store = null;
    try { const NQD = await nasdaqDays(iso(Date.parse(D[0]) - 10 * 864e5), D[D.length - 1]), cache = {};
      for (const r of NQD.reps) (cache[r.sym] = cache[r.sym] || []).push({ d: r.d, t: r.t, a: r.a, e: r.e });
      for (const L of Object.values(cache)) L.sort((x, y) => x.d < y.d ? -1 : 1);
      const tested = new Set((J('data/e1-tested-270.json', {}).syms) || []), all = Object.keys(cache).sort(), rest = all.filter(s => !tested.has(s));
      const complete = NQD.missing.length <= Math.ceil(NQD.days * 0.02);
      out.e1w = { status: 'OK', source: 'Nasdaq earnings calendar (api.nasdaq.com/api/calendar/earnings, one call per weekday): reported EPS, consensus EPS forecast, report time', days: NQD.days, fetchedNow: NQD.fetched, missingDays: NQD.missing.length, missingSample: NQD.missing.slice(0, 10), complete,
        companies: all.length, reports: NQD.reps.length, testedInCalendar: [...tested].filter(s => cache[s]).length,
        segments: { tested270: runE1('the 270 tested companies (Nasdaq estimates)', [...tested], cache), rest: runE1('every other company', rest, cache), whole: runE1('the whole liquid market', all, cache) },
        original270: (() => { const o = J('data/earnings-study.json', {}); return { note: 'E1 study on its own data (Alpha Vantage history), as written by the leaders fair test', verdict: o.verdict, why: o.why, at: o.generatedAt }; })() };
    } catch (e) { out.e1w = { status: 'ERROR', why: String(e.stack || e).slice(0, 400) }; } }

  // verdicts (frozen at the first complete run of each version)
  const RES = {}; if (out.rotation && out.rotation.status === 'OK' && out.rotation.complete) for (const [k, r] of Object.entries(out.rotation.results)) RES[k] = { verdict: r.verdict, why: r.why, label: r.label, months: r.months, results: r.results, whole: r.whole };
  if (out.switch && out.switch.status === 'OK') for (const [k, r] of Object.entries(out.switch.results)) RES['A-SWR1/' + k] = { verdict: r.verdict, why: r.why, results: r.results, whole: r.whole };
  if (out.e1w && out.e1w.status === 'OK' && out.e1w.complete) for (const [k, r] of Object.entries(out.e1w.segments)) if (r.status === 'OK') RES['A-E1W1/' + k] = { verdict: r.verdict, why: r.why, gates: r.gates, e1OwnVerdict: r.e1OwnVerdict };
  const FR = freezeEach(PREV.firstRun && PREV.firstRun.results, RES, (r) => !/^TOO FEW/.test(r.verdict));
  out.firstRun = Object.keys(FR).length ? { at: (PREV.firstRun && PREV.firstRun.at) || new Date().toISOString(), bar: (PREV.firstRun && PREV.firstRun.bar) || BAR, results: FR } : null;
  out.verdicts = Object.fromEntries(Object.keys({ ...RES, ...FR }).map(k => [k, FR[k] ? FR[k].verdict : 'NO VERDICT YET (' + RES[k].verdict + ')']));
  out.latest = latestBlock({ at: out.generatedAt, verdicts: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r.verdict])) });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

  // live: this month's holdings per rotation version; actionable only for a version whose FROZEN verdict is TRADABLE SMALL or PROVEN
  if (out.rotation && out.rotation.status === 'OK') { const tierOf = (id) => { const r = FR[id]; return r && (r.verdict === 'PROVEN' || r.verdict === 'TRADABLE SMALL') ? r.verdict : null; };
    W(TODAY_OUT, { generatedAt: out.generatedAt, lastClose: out.rotation.to, note: 'This month\'s holdings of each halal fund rotation (decided on the last month-end close, bought at the next open, reviewed at every month end). The scan shows a version in ACTIONS only if its frozen verdict is TRADABLE SMALL or PROVEN. Halal: ZAD check needed unless ZAD lists the fund.',
      versions: Object.fromEntries(Object.entries(out.rotation.live).map(([k, v]) => [k, { ...v, tier: tierOf(k), label: out.rotation.results[k] ? out.rotation.results[k].label : 'ZAD check needed' }])) }); }

  console.log('AGENT A LAB (bar t ' + BAR + ')');
  if (out.rotation && out.rotation.results) for (const [k, r] of Object.entries(out.rotation.results)) { const w = r.whole, o = r.results.older || {}, n = r.results.newer || {};
    console.log('- ' + k + ' [' + r.label + ']: ' + r.verdict + ' | ' + r.months + ' months ' + r.from + '..' + r.to + ' | CAGR ' + pc(w.strategy.cagr) + ' (SPUS ' + pc(w.SPUS.cagr) + ', HLAL ' + pc(w.HLAL.cagr) + ', S&P ' + pc(w['S&P 500'].cagr) + ') worst DD ' + pc(w.strategy.maxDD) + ' win ' + pc(w.strategy.win, 0) + ' | ' + r.why.slice(0, 300)); }
  if (out.switch && out.switch.results) for (const [k, r] of Object.entries(out.switch.results)) console.log('- A-SWR1 ' + k + ': ' + r.verdict + ' | ' + JSON.stringify(r.whole) + ' | ' + r.why.slice(0, 300));
  if (out.e1w && out.e1w.segments) for (const [k, r] of Object.entries(out.e1w.segments)) console.log('- A-E1W1 ' + k + ': ' + r.verdict + ' (E1 own: ' + r.e1OwnVerdict + ') | ' + (r.why || '').slice(0, 300));
  else if (out.e1w) console.log('- A-E1W1: ' + out.e1w.status + ' ' + (out.e1w.why || ''));

  // library: from firstRun only
  try { const LB = J('data/strategy-library.json', null); let ch = false;
    const put = (id, keys) => { const e = LB && LB.strategies.find(x => x.id === id), got = keys.filter(k => FR[k]); if (!e || !got.length) return;
      const vs = got.map(k => FR[k].verdict), best = vs.includes('PROVEN') ? 'proven' : vs.includes('TRADABLE SMALL') ? 'tradable small' : vs.every(v => v === 'REJECTED' || v === 'HOLDING WINS') ? 'rejected' : 'not proven';
      e.status = 'tested: ' + best; e.tested = out.firstRun.at.slice(0, 10); e.study = 'agent-a-lab.mjs -> data/agent-a-lab.json (run once as written, first complete run frozen)';
      e.result = Object.fromEntries(got.map(k => [k.split('/').slice(1).join('/'), FR[k].verdict + ': ' + String(FR[k].why).slice(0, 400)])); if (/ROT/.test(id)) e.result.halal = 'ZAD check needed for every fund ZAD has not listed'; ch = true; };
    put('A-ROT1', ['A-ROT1/6m', 'A-ROT1/12-1']); put('A-ROT2', ['A-ROT2/SPUS', 'A-ROT2/HLAL']); put('A-SWR1', ['A-SWR1/STRETCH/LOWER10', 'A-SWR1/SPIKE/LOWER10']); put('A-E1W1', ['A-E1W1/tested270', 'A-E1W1/rest', 'A-E1W1/whole']);
    if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('agent-a-lab: library not updated: ' + e.message); }
})();
