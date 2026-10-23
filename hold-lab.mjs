// HOLD LAB (23 Oct 2026, owner: "don't let the system mix up events: sometimes a loss is caused by a pandemic or inflation. Many traders
// hold and don't sell; that is not a loss, because later they sell with a win or the gap closes. Test holding, not selling, opening new
// trades and waiting for the stock to come up again, and correcting the average with time"). Research only; never places an order.
// Runs the pre-registered library entries HOLD-GETEVEN, HOLD-AVGDOWN, HOLD-REGIME and HOLD-DIPFUND ONCE AS WRITTEN (rules: hold-core.mjs);
// the first complete verdict of each version is frozen in data/hold-lab.json (firstRun), later runs are monitoring only (latest).
// DATA (all read only): the 5-year whole-market price cache of the Sunday job (study-cache/grouped.json.gz; its x rows keep the prices of
// stocks that collapsed under 3 USD or went thin, so dead stocks are IN the test), quality.mjs's yearly SEC cache (study-cache/fund.json.gz,
// F-score, same code), data/shares.json.gz, the frozen B-FCF1 picks (data/value-lab.json), SPY / SPUS / HLAL daily history (Nasdaq, else
// Massive; price only, like the cache), the owner's buys (data/my-trades.jsonl, data/my-positions.json, prices from Massive) and the lanes'
// stored trade lists. OUTPUT: data/hold-lab.json and the HOLD-* library entries (from firstRun only). DIAG=1: coverage only, nothing written.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { TIER2_T } from './value-core.mjs';
import { getEven, avgDown, regimeLabels, sampleOf, recoveryStats, dcaVsDip, judgeHold, halfStat, series, r4, COST, YEAR, DEAD_UNDER, GONE_AFTER } from './hold-core.mjs';
const env = process.env, OUT = env.OUT || 'data/hold-lab.json', DIAG = !!env.DIAG;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);
const SEED = 20261023, PER_DAY = 12, STEP = 5, START = 126, SPLIT = '2024-01-01', BLOCK = 63, STOP = 0.35;
const T0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + 's]', ...a);

// ---- prices (read only; same loading as value-lab.mjs) ----
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null); if (!store) { console.log('hold-lab: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { console.log('hold-lab: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN), CX = new Float32Array(NS * T).fill(NaN), OX = new Float32Array(NS * T).fill(NaN);
let xDays = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) { xDays++; for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) { CX[q * T + t] = x.x.c[j]; OX[q * T + t] = x.x.o[j]; } } } });
const SIC = store.sic || {}; store = null;
const spyI = SY.get('SPY'), CC = (i, t) => { const z = C[i * T + t]; return isFinite(z) ? z : CX[i * T + t]; }, OO = (i, t) => { const z = O[i * T + t]; return isFinite(z) ? z : OX[i * T + t]; };
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CC(i, t) > 0) { lastI[i] = t; break; }
const serMemo = new Map(), ser = (i) => { if (!serMemo.has(i)) serMemo.set(i, { o: (k) => OO(i, k), c: (k) => CC(i, k), last: lastI[i], T }); return serMemo.get(i); };
const liquid = (i, t) => { const b = i * T, c = C[b + t]; if (!(c >= 5)) return false; let dv = 0; for (let k = t - 19; k <= t; k++) { if (k < 0 || !isFinite(C[b + k])) return false; dv += C[b + k] * V[b + k]; } return dv / 20 >= 5e6; };
const LIQ = new Map(), liqAt = (t) => { if (!LIQ.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (i !== spyI && liquid(i, t)) a.push(i); LIQ.set(t, a); } return LIQ.get(t); };
const vanishedI = (i) => lastI[i] >= 0 && lastI[i] < T - 1 - GONE_AFTER, deadI = (i) => vanishedI(i) && CC(i, lastI[i]) < DEAD_UNDER;
const tOfDate = new Map(D.map((d, t) => [d, t]));

// ---- F-score point in time (quality.mjs's yearly cache and code, unchanged; as value-lab.mjs) ----
const SH = JZ('data/shares.json.gz', null) || { t: {}, c: {} }, F = JZ(env.FUND_CACHE || 'study-cache/fund.json.gz', { v: {} });
const symCik = (s) => SH.t[s] || SH.t[s.replace(/\./g, '-')] || null;
const sharesAtYearEnd = (cik, y) => { const a = SH.c[cik]; if (!a) return null; let v = null; for (const [e, n] of a) { if (e <= y + '-12-31' && e >= y + '-07-01') v = n; } return v; };
const num = (...v) => v.every(u => typeof u === 'number' && isFinite(u));
function fscore(cik, y) { const c = F.v[cik]; if (!c || !c[y] || !c[y - 1] || !c[y - 2]) return null; const a = c[y], b = c[y - 1], z = c[y - 2];
  if (!num(a.ni, b.ni, a.cfo, a.ltd, b.ltd, a.acur, b.acur, a.gp, b.gp) || !(a.assets > 0 && b.assets > 0 && z.assets > 0) || !(a.lcur > 0 && b.lcur > 0)) return null;
  const rk = num(a.rev, b.rev) ? 'rev' : num(a.rev2, b.rev2) ? 'rev2' : null; if (!rk || !(a[rk] > 0 && b[rk] > 0)) return null;
  const s1 = sharesAtYearEnd(cik, y), s0 = sharesAtYearEnd(cik, y - 1); if (!(s1 > 0 && s0 > 0)) return null;
  const chk = [a.ni > 0, a.cfo > 0, a.ni / b.assets > b.ni / z.assets, a.cfo > a.ni, a.ltd / ((a.assets + b.assets) / 2) < b.ltd / ((b.assets + z.assets) / 2),
    a.acur / a.lcur > b.acur / b.lcur, s1 <= s0, a.gp / a[rk] > b.gp / b[rk], a[rk] / b.assets > b[rk] / z.assets];
  return chk.filter(Boolean).length; }
const knownYear = (d) => { const y = +d.slice(0, 4), md = d.slice(5); return md >= '04-10' ? y - 1 : y - 2; };
const finCo = (s) => { const x = SIC[s]; return !!(x && x.c && String(x.c)[0] === '6'); };
const fsMemo = new Map(), fsOf = (i, t) => { const s = SYMS[i], y = knownYear(D[t]), k = s + '_' + y; if (!fsMemo.has(k)) { const cik = finCo(s) ? null : symCik(s); fsMemo.set(k, cik ? fscore(cik, y) : null); } return fsMemo.get(k); };

// ---- SPY / SPUS / HLAL daily history (price only) ----
async function get(url, headers = {}) { for (let a = 0; a < 4; a++) { try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(45000) }); if (r.status === 404) return null; if (r.status === 429 || r.status >= 500) { await sleep(2500 * (a + 1)); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const nnum = (v) => { const x = parseFloat(String(v || '').replace(/[$,]/g, '')); return isFinite(x) && x > 0 ? x : NaN; };
async function nasdaqBars(sym, cls) { if (env.NO_NET) return null; const j = await get(NQ + '/api/quote/' + sym + '/historical?assetclass=' + cls + '&fromdate=2015-01-01&todate=' + iso(Date.now()) + '&limit=9999', NQ_HEAD);
  const rows = j && j.data && j.data.tradesTable && j.data.tradesTable.rows; if (!Array.isArray(rows) || rows.length < 100) return null;
  const out = rows.map(r => { const m = String(r.date || '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? { d: m[3] + '-' + m[1] + '-' + m[2], o: nnum(r.open), c: nnum(r.close) } : null; }).filter(b => b && b.c > 0);
  return out.sort((a, b) => a.d < b.d ? -1 : 1); }
async function massiveBars(sym, from) { if (env.NO_NET || (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE))) return null;
  const j = await get(PX + '/v2/aggs/ticker/' + sym + '/range/1/day/' + from + '/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000&apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''));
  return j && Array.isArray(j.results) && j.results.length ? j.results.map(b => ({ d: iso(b.t), o: b.o, c: b.c })) : null; }
const SRC = {};
async function history(sym) { if (env.FIXTURE_HIST) { const b = (J(env.FIXTURE_HIST, {}) || {})[sym] || null; SRC[sym] = b ? 'fixture' : 'missing'; return b; } let b = await nasdaqBars(sym, 'etf'), src = 'nasdaq'; if (!b) { b = await massiveBars(sym, '2015-01-01'); src = 'massive'; } SRC[sym] = b ? src + ' ' + b[0].d + '..' + b[b.length - 1].d + ' (' + b.length + ')' : 'missing'; return b; }
const spyHist = await history('SPY'), fundHist = { SPUS: await history('SPUS'), HLAL: await history('HLAL') };
// SPY: the cache's own SPY inside the window (the same prices as the stocks), the Nasdaq / Massive history before it (for the 200-day)
const spyBy = new Map(); if (spyHist) for (const b of spyHist) if (b.d < D[0]) spyBy.set(b.d, { o: b.o, c: b.c });
if (spyI !== undefined) D.forEach((d, t) => { const c = C[spyI * T + t], o = O[spyI * T + t]; if (c > 0) spyBy.set(d, { o, c }); });
const SD = [...spyBy.keys()].sort(), SC = SD.map(d => spyBy.get(d).c), SO = SD.map(d => spyBy.get(d).o), REG = regimeLabels(SC), sIdx = new Map(SD.map((d, k) => [d, k]));
const sAtOrBefore = (d) => { let lo = 0, hi = SD.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (SD[m] <= d) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const regAt = (d) => { const k = sAtOrBefore(d); return k < 0 ? { trend: null, crash: null, vol: null } : { trend: REG.above200[k] === null ? null : REG.above200[k] ? 'above200' : 'below200', crash: REG.crash[k] === null ? null : REG.crash[k] ? 'crash' : 'no crash', vol: REG.vol[k], dd: r4(REG.dd[k]) }; };
const regCover = D.filter(d => { const r = regAt(d); return r.trend && r.crash && r.vol; }).length / T;
const crashDays = D.filter(d => regAt(d).crash === 'crash');
const idxOf = (by) => ({ o: (d) => by.get(d) ? by.get(d).o : NaN, c: (d) => by.get(d) ? by.get(d).c : NaN });
const SPY = idxOf(spyBy), spusBy = new Map((fundHist.SPUS || []).map(b => [b.d, b])), SPUS = idxOf(spusBy);
const ret = (ix, dIn, dOut, at) => { const a = ix.o(dIn), b = at === 'o' ? ix.o(dOut) : ix.c(dOut); return a > 0 && b > 0 ? b / a - 1 : null; };

// ---- the average liquid stock bought at the open of session te (liquid the session before) and held: curve by offset; each stock
// capped at +300%; a dead stock counts 0 after it vanished; every second liquid stock (speed) ----
const curveMemo = new Map();
function curve(te, len) { const m = curveMemo.get(te); if (m && m.length >= Math.min(len, T - te)) return m; const L = Math.min(len, T - te), sum = new Float64Array(L), cnt = new Uint32Array(L), lq = liqAt(te - 1);
  for (let q = 0; q < lq.length; q += 2) { const i = lq[q], e = OO(i, te); if (!(e > 0)) continue; const li = lastI[i], van = vanishedI(i), dead = deadI(i); let lc = NaN;
    for (let off = 0; off < L; off++) { const k = te + off; let v; if (van && k > li) v = dead ? 0 : CC(i, li); else { const z = CC(i, k); if (z > 0) lc = z; v = lc; } if (!(v >= 0)) continue; sum[off] += Math.min(v / e, 4); cnt[off]++; } }
  const out = new Float32Array(L); for (let off = 0; off < L; off++) out[off] = cnt[off] >= 50 ? sum[off] / cnt[off] - 1 : NaN; curveMemo.set(te, out); return out; }
const ctrlG = (te, x, at, len) => { const cv = curve(te, len), off = (at === 'o' ? x - 1 : x) - te; const v = off >= 0 && off < cv.length ? cv[off] : NaN; return isFinite(v) ? v : null; };

// ---- entry sets ----
const ENTRY = []; for (let t = START; t + 1 < T; t += STEP) ENTRY.push(t);
const SETS = { a: [], b1: [], b2: [], c: [] }, fsCover = { asked: 0, known: 0 };
for (const t of ENTRY) { const lq = liqAt(t);
  for (const i of sampleOf(lq, PER_DAY, SEED + t)) SETS.a.push({ i, t });
  const q = []; for (const i of lq) { if (finCo(SYMS[i])) continue; fsCover.asked++; const f = fsOf(i, t); if (f !== null) { fsCover.known++; if (f >= 8) q.push(i); } } for (const i of sampleOf(q, PER_DAY, SEED + t)) SETS.b2.push({ i, t });
  const dn = []; for (const i of lq) { let hi = 0; for (let k = t - 125; k <= t; k++) { const z = CC(i, k); if (z > hi) hi = z; } if (hi > 0 && CC(i, t) <= hi * 0.8) dn.push(i); } for (const i of sampleOf(dn, PER_DAY, SEED + t)) SETS.c.push({ i, t }); }
const VL = J('data/value-lab.json', {}), fcfPicks = ((VL.trades || {})['B-FCF1'] || []); for (const z of fcfPicks) { const t = tOfDate.get(z.d), i = SY.get(z.s); if (t !== undefined && i !== undefined && t + 1 < T) SETS.b1.push({ i, t }); }
const SETNAME = { a: 'every liquid stock, random dates (baseline)', b1: 'quality: B-FCF1 picks', b2: 'quality: F-score 8-9 (point in time)', c: 'stocks 20%+ under their 6-month high' };
log('cache ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks, x rows on ' + xDays + ' days); vanished ' + [...Array(NS).keys()].filter(vanishedI).length + ', dead ' + [...Array(NS).keys()].filter(deadI).length + '; regime cover ' + pc(regCover) + '; sets ' + Object.entries(SETS).map(([k, v]) => k + ' ' + v.length).join(', '));

// ---- owner's buys ----
const owner = []; try { for (const ln of fs.readFileSync('data/my-trades.jsonl', 'utf8').split('\n')) { if (!ln.trim()) continue; const z = JSON.parse(ln); if (z.sym && z.entry > 0 && z.since) owner.push({ sym: z.sym, entry: z.entry, since: z.since, sold: { exit: z.exit, out: z.out, pct: z.pct }, kind: z.kind }); } } catch (e) {}
for (const [sym, p] of Object.entries(J('data/my-positions.json', {}))) if (p && p.entry > 0 && p.since) owner.push({ sym, entry: p.entry, since: p.since, sold: null, kind: p.kind });

const DIAGS = { cache: { from: D[0], to: D[T - 1], sessions: T, stocks: NS, xRowDays: xDays, vanished: [...Array(NS).keys()].filter(vanishedI).length, dead: [...Array(NS).keys()].filter(deadI).length },
  regime: { sources: SRC, cover: r4(regCover), crashSessionsInWindow: crashDays.length, crashFirst: crashDays[0] || null, crashLast: crashDays[crashDays.length - 1] || null }, sets: Object.fromEntries(Object.entries(SETS).map(([k, v]) => [k, { entries: v.length, days: new Set(v.map(z => z.t)).size }])),
  fscore: fsCover, fcfPicks: fcfPicks.length, owner: owner.map(o => o.sym + ' ' + o.since) };
if (DIAG) { console.log('HOLD LAB DIAGNOSTICS (coverage only, nothing computed or written)'); console.log(JSON.stringify(DIAGS, null, 1)); process.exit(0); }

// ================= stock sets: H-GETEVEN (4 versions) and H-AVGDOWN =================
const half = (d) => d < SPLIT ? 'older' : 'newer';
const RES = {}, TRADES = {}, REGROWS = {};
const GE = [[0.05, 252], [0.05, 504], [0.10, 252], [0.10, 504]];
const pack = (z) => [z.s, z.buy, z.sell, z.kind, r4(z.g - COST), z.n || 1];
function regimeSplit(tr) { const out = {}; for (const dim of ['crash', 'trend', 'vol']) { out[dim] = {}; for (const b of [...new Set(tr.map(z => z.reg[dim]))]) { const v = tr.filter(z => z.reg[dim] === b); const st = recoveryStats(v);
      out[dim][b === null ? 'unknown' : b] = { ...st, edge: r4(mean(v.filter(z => z.c !== null).map(z => z.g - COST - z.c))), vsOwn: r4(mean(v.filter(z => typeof z.own === 'number').map(z => z.g - z.own))) }; } }
  const W = (z) => z.w || 1, losses = tr.map(z => Math.min(0, (z.g - COST) * W(z))), tot = losses.reduce((a, b) => a + b, 0), inCrash = tr.map((z, k) => z.reg.crash === 'crash' ? losses[k] : 0).reduce((a, b) => a + b, 0);
  out.lossShare = { buysInCrash: r4(tr.filter(z => z.reg.crash === 'crash').length / tr.length), lossesFromCrashBuys: tot < 0 ? r4(inCrash / tot) : null }; return out; }
function finish(key, tr, { ownName, kind, extra = {} }) {
  const by = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') }, R = { older: halfStat(by.older, BLOCK), newer: halfStat(by.newer, BLOCK), all: halfStat(tr, BLOCK) };
  const rec = { older: recoveryStats(by.older), newer: recoveryStats(by.newer), all: recoveryStats(tr) }, py = { older: [rec.older.perYear, rec.older.spyPerYear], newer: [rec.newer.perYear, rec.newer.spyPerYear] };
  const worst = [...tr].sort((a, b) => (a.g - b.g)).slice(0, 10).map(z => ({ s: z.s, buy: z.buy, sell: z.sell, kind: z.kind, net: r4(z.g - COST), worstOnTheWay: r4(z.worst) }));
  RES[key] = { ...judgeHold(R, { bar: BAR, ownName, perYear: py }), kind, ownName, results: R, recovery: rec, regime: regimeSplit(tr), worst, ...extra }; TRADES[key] = tr; }
const label = (tg, H) => 'GE' + Math.round(tg * 100) + '-' + H;
for (const [set, list] of Object.entries(SETS)) {
  const ge = Object.fromEntries(GE.map(([tg, H]) => [label(tg, H), []])), av = [], holdInfo = { 252: [], 504: [] };
  for (const { i, t } of list) { const te = t + 1, s = ser(i), d = D[t], reg = regAt(d), base = { t, s: SYMS[i], i, half: half(d), reg, buy: D[te] };
    const own = {}, hold = {}; for (const H of [252, 504]) { own[H] = getEven(s, te, { target: Infinity, stop: STOP, maxH: H }); hold[H] = getEven(s, te, { target: Infinity, maxH: H }); if (hold[H]) holdInfo[H].push({ ...base, ...hold[H], c: null }); }
    for (const [tg, H] of GE) { const r = getEven(s, te, { target: tg, maxH: H }); if (!r) continue;
      ge[label(tg, H)].push({ ...base, ...r, sell: D[r.x], c: ctrlG(te, r.x, r.at, 505), own: own[H] ? own[H].g : null, spy: ret(SPY, D[te], D[r.x], r.at), spus: ret(SPUS, D[te], D[r.x], r.at), ctrl: ctrlG(te, r.x, r.at, 505) }); }
    const a = avgDown(s, te, { drops: [0.15, 0.30], target: 0.10, maxH: 252 }); if (a) { const single = getEven(s, te, { target: 0.10, maxH: 252 });
      const uc = a.units.map(u => ctrlG(u.k, a.x, a.at, 253)), us = a.units.map(u => ret(SPY, D[u.k], D[a.x], a.at)), uu = a.units.map(u => ret(SPUS, D[u.k], D[a.x], a.at));
      const xp = (a.profit + a.n) / a.units.reduce((q, w) => q + 1 / w.px, 0);   // the exit price of the position (0 if dead)
      const extraUnits = a.units.slice(1).map((u, j) => us[j + 1] === null ? null : xp / u.px - 1 - COST - us[j + 1]).filter(x => x !== null);
      av.push({ ...base, kind: a.kind, x: a.x, at: a.at, sell: D[a.x], g: a.gInv, w: a.n, n: a.n, unitYears: a.unitYears, days: a.days, worst: a.worstInv, worstRes: a.worstRes, gRes: (a.profit - COST * a.n) / 3,
        c: uc.every(x => x !== null) ? mean(uc) : null, own: single ? single.g : null, spy: us.every(x => x !== null) ? mean(us) : null, spus: uu.every(x => x !== null) ? mean(uu) : null, ctrl: uc.every(x => x !== null) ? mean(uc) : null, extraUnits }); } }
  for (const [k, tr] of Object.entries(ge)) { const H = +k.split('-')[1]; finish('H-GETEVEN/' + set + '/' + k, tr, { kind: 'stocks', ownName: 'the same buys sold by the 35% disaster stop (held to the same ' + H + ' sessions)', extra: { set: SETNAME[set], plainHold: recoveryStats(holdInfo[H]) } }); }
  const ex = av.flatMap(z => z.extraUnits), units = [1, 2, 3].map(n => r4(av.filter(z => z.n === n).length / Math.max(1, av.length))), wr = av.map(z => z.worstRes);
  finish('H-AVGDOWN/' + set, av, { kind: 'stocks', ownName: 'the same buys without averaging down (1 unit, sold at +10% or 252 sessions)', extra: { set: SETNAME[set],
    perFullBudget: { older: r4(mean(av.filter(z => z.half === 'older').map(z => z.gRes))), newer: r4(mean(av.filter(z => z.half === 'newer').map(z => z.gRes))), all: r4(mean(av.map(z => z.gRes))), note: 'profit after 0.8% per unit over the FULL 3-unit budget (the reserve cannot be used elsewhere)' },
    extraCapital: { addedUnits: ex.length, avgVsSpy: r4(mean(ex)), medianVsSpy: r4(median(ex)), beatSpy: ex.length ? r4(ex.filter(x => x > 0).length / ex.length) : null, note: 'each added unit after 0.8% minus the same money in SPY over the same sessions' },
    unitsUsed: { one: units[0], two: units[1], three: units[2] }, worstCombinedVsBudget: { median: r4(median(wr)), worst: r4(Math.min(...wr)), under30: r4(wr.filter(x => x <= -0.3).length / Math.max(1, wr.length)) } } });
  log('set ' + set + ' done (' + list.length + ' entries)'); }

// ================= fund sets (SPUS, HLAL): all days and dips; GE x4, AVGDOWN, AVGDOWN from the high =================
const FUNDINFO = {}, sinceInception = {};
for (const [f, bars] of Object.entries(fundHist)) { if (!bars || bars.length < 600) { FUNDINFO[f] = 'missing'; continue; }
  const FD = bars.map(b => b.d), fo = bars.map(b => b.o > 0 ? b.o : b.c), fc = bars.map(b => b.c), s = series(fo, fc), hi = (k) => { let h = 0; for (let j = Math.max(0, k - 251); j <= k; j++) if (fc[j] > h) h = fc[j]; return h; };
  const all = [], dip = []; let nd = 0; for (let t = 0; t + 1 < FD.length; t++) { if (t % STEP === 0) all.push(t); if (fc[t] <= hi(t) * 0.9) { if (nd % STEP === 0) dip.push(t); nd++; } }
  FUNDINFO[f] = { first: FD[0], last: FD[FD.length - 1], entriesAll: all.length, entriesDip: dip.length };
  const run = (ts, inWindow) => { const out = { ge: Object.fromEntries(GE.map(([tg, H]) => [label(tg, H), []])), av: [], avhi: [] };
    for (const t of ts) { const d = FD[t]; if (inWindow !== (d >= D[0])) continue; const te = t + 1, base = { t, s: f, half: half(d), reg: regAt(d), buy: FD[te] };
      for (const [tg, H] of GE) { const r = getEven(s, te, { target: tg, maxH: H }); if (!r) continue; const o35 = getEven(s, te, { target: Infinity, stop: STOP, maxH: H }), sp = ret(SPY, FD[te], FD[r.x], r.at);
        out.ge[label(tg, H)].push({ ...base, ...r, sell: FD[r.x], c: sp, ctrl: null, spy: sp, spus: f === 'SPUS' ? r.g : ret(SPUS, FD[te], FD[r.x], r.at), own35: o35 ? o35.g : null }); }
      for (const [k, opt] of [['av', {}], ['avhi', { drops: [0.10, 0.20], hi }]]) { const a = avgDown(s, te, { drops: [0.15, 0.30], target: 0.10, maxH: 252, ...opt }); if (!a) continue; const single = getEven(s, te, { target: 0.10, maxH: 252 }), us = a.units.map(u => ret(SPY, FD[u.k], FD[a.x], a.at));
        out[k].push({ ...base, kind: a.kind, x: a.x, at: a.at, sell: FD[a.x], g: a.gInv, w: a.n, n: a.n, unitYears: a.unitYears, days: a.days, worst: a.worstInv, worstRes: a.worstRes, gRes: (a.profit - COST * a.n) / 3, c: us.every(x => x !== null) ? mean(us) : null, spy: us.every(x => x !== null) ? mean(us) : null, ctrl: null, own: single ? single.g : null }); } }
    return out; };
  const A = run(all, true), P = run(dip, true);
  for (const [tg, H] of GE) { const k = label(tg, H), aT = A.ge[k], pT = P.ge[k];
    for (const z of aT) z.own = z.own35;
    const avgAll = { older: mean(aT.filter(z => z.half === 'older').map(z => z.g)), newer: mean(aT.filter(z => z.half === 'newer').map(z => z.g)) }; for (const z of pT) z.own = avgAll[z.half];
    finish('H-GETEVEN/' + f + '-all/' + k, aT, { kind: 'fund', ownName: 'the same buys sold by the 35% disaster stop', extra: { set: f + ' bought every 5th session', yardstick: 'average-stock gate = the S&P 500 (SPY) over the same days' } });
    finish('H-GETEVEN/' + f + '-dip/' + k, pT, { kind: 'fund', ownName: 'the same fund bought on any day (every 5th session) with the same rule, same half', extra: { set: f + ' bought 10%+ under its 1-year high', yardstick: 'average-stock gate = the S&P 500 (SPY) over the same days' } }); }
  for (const [nm, tr, setn] of [['all', A.av, f + ' bought every 5th session'], ['dip', P.av, f + ' bought 10%+ under its 1-year high']]) finish('H-AVGDOWN/' + f + '-' + nm, tr, { kind: 'fund', ownName: 'the same buys without averaging down', extra: { set: setn, perFullBudget: { all: r4(mean(tr.map(z => z.gRes))) } } });
  finish('H-AVGDOWN/' + f + '-fundhi', A.avhi, { kind: 'fund', ownName: 'the same buys without averaging down', extra: { set: f + ' bought every 5th session; adds at -10% / -20% from the fund 1-year high', perFullBudget: { all: r4(mean(A.avhi.map(z => z.gRes))) } } });
  // information: since the fund's first price (incl. 2020 where the history has it), not judged
  const B = run(all, false), Bd = run(dip, false); sinceInception[f] = { before: D[0], note: 'buys before the cache window (' + FD[0] + '..' + D[0] + '): information only',
    'GE10-252 all days': recoveryStats(B.ge['GE10-252']), 'GE10-252 dips': recoveryStats(Bd.ge['GE10-252']), 'GE5-252 dips': recoveryStats(Bd.ge['GE5-252']), 'AVGDOWN all days': recoveryStats(B.av), 'AVGDOWN dips': recoveryStats(Bd.av), 'AVGDOWN from high': recoveryStats(B.avhi) };
  // H-DIPFUND: monthly saving, window and since the first price
  const w0 = FD.findIndex(d => d >= D[0]), win = dcaVsDip(FD.slice(w0), fo.slice(w0), fc.slice(w0)), full = dcaVsDip(FD, fo, fc);
  RES['H-DIPFUND/' + f] = { verdict: 'INFORMATION', why: 'one path per fund: no statistics', kind: 'fund', window: { from: FD[w0], to: FD[FD.length - 1], ...win, dipVsDca: r4(win.dip.value / win.dca.value - 1) }, sinceFirst: { from: FD[0], to: FD[FD.length - 1], ...full, dipVsDca: r4(full.dip.value / full.dca.value - 1) } };
  log('fund ' + f + ' done'); }
{ const ss = SD.map((d, k) => ({ d, o: SO[k] > 0 ? SO[k] : SC[k], c: SC[k] })), w0 = ss.findIndex(b => b.d >= D[0]);
  const win = dcaVsDip(ss.slice(w0).map(b => b.d), ss.slice(w0).map(b => b.o), ss.slice(w0).map(b => b.c)), full = dcaVsDip(ss.map(b => b.d), ss.map(b => b.o), ss.map(b => b.c));
  RES['H-DIPFUND/SPY'] = { verdict: 'INFORMATION', why: 'one path: no statistics; the S&P 500 (not halal-screened) for comparison', kind: 'fund', window: { from: ss[w0].d, ...win, dipVsDca: r4(win.dip.value / win.dca.value - 1) }, sinceFirst: { from: ss[0].d, ...full, dipVsDca: r4(full.dip.value / full.dca.value - 1) } }; }

// ================= H-REGIME: lanes (pause vs buy more in a crash) =================
const LANES = {}, laneFiles = [['decoded-history', 'data/decoded-history.json'], ['discovery2', 'data/discovery2.json'], ['chain-decoder', 'data/chain-decoder.json'], ['catalyst-lab', 'data/catalyst-lab.json'], ['value-lab', 'data/value-lab.json']];
const pooled = []; for (const [nm, f] of laneFiles) { const j = J(f, null); if (!j || !j.trades || typeof j.trades !== 'object') continue;
  for (const [k, list] of Object.entries(j.trades)) { if (!Array.isArray(list) || /^DEC2-(X|F)-/.test(k)) continue; const rows = [];
    for (const z of list) { const buy = z.buy || z.in || null, sig = z.sig || z.d || (buy ? SD[sAtOrBefore(buy) - 1] : null); const net = typeof z.net === 'number' ? z.net : typeof z.gross === 'number' ? z.gross - COST : null; if (!sig || net === null) continue;
      const rg = regAt(sig); if (!rg.crash) continue; rows.push({ crash: rg.crash === 'crash', net, edge: typeof z.avgStock === 'number' ? net - z.avgStock : null }); }
    if (rows.length < 30) continue; const cr = rows.filter(r => r.crash), no = rows.filter(r => !r.crash), sum = (a) => a.reduce((x, r) => x + r.net, 0);
    LANES[nm + ':' + k] = { n: rows.length, crashN: cr.length, crashAvg: r4(mean(cr.map(r => r.net))), otherAvg: r4(mean(no.map(r => r.net))), crashEdge: r4(mean(cr.filter(r => r.edge !== null).map(r => r.edge))), otherEdge: r4(mean(no.filter(r => r.edge !== null).map(r => r.edge))),
      policy: { normal: r4(sum(rows)), pause: r4(sum(no)), double: r4(sum(rows) + sum(cr)) }, best: cr.length < 10 ? 'too few crash buys' : sum(cr) > 0 ? 'DOUBLE' : 'PAUSE' }; pooled.push(...rows); } }
{ const cr = pooled.filter(r => r.crash), no = pooled.filter(r => !r.crash), sum = (a) => a.reduce((x, r) => x + r.net, 0), L = Object.values(LANES).filter(l => l.crashN >= 10);
  RES['H-REGIME/lanes'] = { verdict: 'INFORMATION', why: 'lane trade lists as stored (some are capped samples); information', kind: 'lanes', lanes: Object.keys(LANES).length, pooled: { n: pooled.length, crashN: cr.length, crashAvg: r4(mean(cr.map(r => r.net))), otherAvg: r4(mean(no.map(r => r.net))),
      crashEdge: r4(mean(cr.filter(r => r.edge !== null).map(r => r.edge))), otherEdge: r4(mean(no.filter(r => r.edge !== null).map(r => r.edge))), policy: { normal: r4(sum(pooled)), pause: r4(sum(no)), double: r4(sum(pooled) + sum(cr)) } },
    lanesWithCrashBuys: L.length, pauseBetter: L.filter(l => l.best === 'PAUSE').length, doubleBetter: L.filter(l => l.best === 'DOUBLE').length, perLane: LANES }; }

// ================= H-REGIME summary: are losses mostly in crash regimes; does holding / buying more in a crash pay =================
{ const pick = (k) => RES[k] && RES[k].regime ? { key: k, buysInCrash: RES[k].regime.lossShare.buysInCrash, lossesFromCrashBuys: RES[k].regime.lossShare.lossesFromCrashBuys,
    crash: RES[k].regime.crash.crash || null, noCrash: RES[k].regime.crash['no crash'] || null } : null;
  const keys = Object.keys(RES).filter(k => /^H-(GETEVEN\/[^/]+\/GE10-252|AVGDOWN\/[^/]+)$/.test(k));
  RES['H-REGIME/summary'] = { verdict: 'INFORMATION', why: 'regime at the signal day, SPY only up to that day', kind: 'regime', crashSessions: crashDays.length, crashFirst: crashDays[0] || null, crashLast: crashDays[crashDays.length - 1] || null,
    rows: keys.map(pick).filter(Boolean).map(r => ({ key: r.key, buysInCrash: r.buysInCrash, lossesFromCrashBuys: r.lossesFromCrashBuys,
      crash: r.crash && { n: r.crash.n, recovered: r.crash.recovered, dead: r.crash.dead, avgNet: r.crash.avgNet, perYear: r.crash.perYear, spyPerYear: r.crash.spyPerYear, edge: r.crash.edge },
      noCrash: r.noCrash && { n: r.noCrash.n, recovered: r.noCrash.recovered, dead: r.noCrash.dead, avgNet: r.noCrash.avgNet, perYear: r.noCrash.perYear, spyPerYear: r.noCrash.spyPerYear, edge: r.noCrash.edge } })) }; }

// ================= the owner's own buys (information) =================
const OWN = [];
for (const o of owner) { let bars = await massiveBars(o.sym, '2021-10-01'), src = 'massive';
  if (!bars) { const i = SY.get(o.sym); if (i !== undefined) { bars = []; for (let t = 0; t < T; t++) { const c = CC(i, t); if (c > 0) bars.push({ d: D[t], o: OO(i, t), c }); } src = 'cache'; } }
  if (!bars || !bars.length) { OWN.push({ sym: o.sym, since: o.since, entry: o.entry, note: 'no prices' }); continue; }
  const k0 = bars.findIndex(b => b.d >= o.since); if (k0 < 0) { OWN.push({ sym: o.sym, since: o.since, entry: o.entry, note: 'no prices since the buy' }); continue; }
  const after = bars.slice(k0), last = after[after.length - 1], e = o.entry; let worst = 0, hit5 = null, hit10 = null;
  for (const b of after) { worst = Math.min(worst, b.c / e - 1); if (!hit5 && b.c >= e * 1.05) hit5 = b.d; if (!hit10 && b.c >= e * 1.10) hit10 = b.d; }
  // the averaging-down plan from the owner's own price: adds at -15% / -30% (next open), sell all at average cost +10%
  const units = [{ d: o.since, px: e }], armed = [true, true]; let avgHit = null;
  for (let q = 0; q < after.length; q++) { const b = after[q], ac = units.length / units.reduce((a, u) => a + 1 / u.px, 0); if (!avgHit && b.c >= ac * 1.1) { avgHit = b.d; break; }
    const go = [0.15, 0.30].map((dr, j) => armed[j] && b.c <= e * (1 - dr) ? j : -1).filter(j => j >= 0); if (go.length && after[q + 1]) for (const j of go) { armed[j] = false; units.push({ d: after[q + 1].d, px: after[q + 1].o > 0 ? after[q + 1].o : after[q + 1].c }); } }
  const ac = units.length / units.reduce((a, u) => a + 1 / u.px, 0), val = units.reduce((a, u) => a + last.c / u.px, 0);
  // the same stock's own past: buys every 5th session with a full year after them (survivor: this stock is alive today)
  const S = series(bars.map(b => b.o > 0 ? b.o : b.c), bars.map(b => b.c)), past = [], pastDown = [];
  for (let t = 126; t + 253 < bars.length; t += STEP) { const r = getEven(S, t + 1, { target: 0.10, maxH: 252 }); if (!r) continue; past.push(r); let h = 0; for (let j = t - 125; j <= t; j++) h = Math.max(h, bars[j].c); if (bars[t].c <= h * 0.8) pastDown.push(r); }
  const ps = recoveryStats(past), pd = recoveryStats(pastDown);
  OWN.push({ sym: o.sym, kind: o.kind, since: o.since, entry: e, sold: o.sold, source: src, lastDate: last.d, lastClose: r4(last.c), sessionsSinceBuy: after.length, nowVsBuy: r4(last.c / e - 1), worstSinceBuy: r4(worst), closedAbove5: hit5, closedAbove10: hit10,
    ifHeldInsteadOfSold: o.sold ? r4(last.c / e - 1 - (o.sold.pct || 0)) : null,
    avgDownPlan: { units: units.map(u => ({ d: u.d, px: r4(u.px) })), avgCost: r4(ac), sellLevel: r4(ac * 1.1), reachedSellLevel: avgHit, nowVsMoneyIn: r4(val / units.length - 1), nowVsFullBudget: r4((val - units.length) / 3) },
    ownPast: { buys: ps.n, recovered10in252: ps.recovered, medianDays: ps.medianDaysToRecover, underwaterAtMax: ps.underwaterAtMax, whenDown20: { buys: pd.n, recovered10in252: pd.recovered, medianDays: pd.medianDaysToRecover }, note: 'this stock survived to today: its own past is a survivor sample, kinder than the whole market' } });
  await sleep(local(PX) ? 0 : 150); }

// ---- output ----
const PREV = J(OUT, {}), complete = T >= 1000 && regCover >= 0.95 && xDays >= T * 0.9 && SETS.b1.length > 0;
const isJudged = (r) => complete && r && r.verdict !== 'TOO FEW CASES';
const strip = (r) => r;   // RES holds no trade lists (they are in TRADES)
const firstRun = freezeEach(PREV.firstRun, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), to: D[T - 1], bar: BAR, ...strip(r) }])), isJudged);
const keep = Object.keys(TRADES).filter(k => /GE10-252$|^H-AVGDOWN\//.test(k));
const out = { generatedAt: new Date().toISOString(), preRegistered: 'data/strategy-library.json HOLD-GETEVEN, HOLD-AVGDOWN, HOLD-REGIME, HOLD-DIPFUND (23 Oct 2026, before any run)', window: [D[0], D[T - 1]], bar: BAR, leagueBar: LEAGUE.bar || null, complete, diagnostics: DIAGS, funds: FUNDINFO,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock held over the same sessions (funds: the S&P 500), better than the named yardstick on the same buys, > 0 without the 2 best, block t >= ' + TIER2_T + ' (63-session blocks; holds overlap so t is optimistic) -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN; plus return per year of capital tied up above the S&P 500 over the same days in both halves',
  deadRule: 'a stock with no price in the last ' + (GONE_AFTER + 1) + ' sessions of the data has vanished; last close under ' + DEAD_UNDER + ' USD = DEAD (remaining value lost); else paid out at its last close',
  firstRun, latest: latestBlock({ at: new Date().toISOString(), to: D[T - 1], results: RES }), sinceInception, owner: OWN,
  trades: Object.fromEntries(keep.map(k => [k, TRADES[k].map(pack)])), tradesFormat: '[symbol, buy day, sell day, exit kind, net after 0.8% per money invested, units]' };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('HOLD LAB ' + D[0] + ' to ' + D[T - 1] + ' | proof bar ' + BAR + (complete ? '' : ' | INCOMPLETE: nothing frozen'));
for (const [k, r] of Object.entries(RES)) { if (!r.results) { console.log('- ' + k + ': ' + r.verdict + (r.window ? ' | window DIP vs DCA ' + pc(r.window.dipVsDca) + ', since first ' + pc(r.sinceFirst.dipVsDca) : r.pooled ? ' | pooled crash avg ' + pc(r.pooled.crashAvg) + ' other ' + pc(r.pooled.otherAvg) : '')); continue; }
  const f = (h) => { const a = r.results[h], q = r.recovery[h]; return a.n ? a.n + ' rec ' + pc(q.recovered) + ' med ' + q.medianDaysToRecover + 'd under ' + pc(q.underwaterAtMax) + ' dead ' + pc(q.dead) + ' avg ' + pc(a.avg) + ' edge ' + pc(a.edge) + ' own ' + pc(a.vsOwn) + ' /yr ' + pc(q.perYear) + ' SPY/yr ' + pc(q.spyPerYear) + ' tB ' + a.tBlock : '0'; };
  console.log('- ' + k + ': ' + r.verdict + ' | older ' + f('older') + ' | newer ' + f('newer') + ' | ' + String(r.why).slice(0, 300)); }
// library: from firstRun only
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const [id, pre] of [['HOLD-GETEVEN', 'H-GETEVEN/'], ['HOLD-AVGDOWN', 'H-AVGDOWN/'], ['HOLD-REGIME', 'H-REGIME/'], ['HOLD-DIPFUND', 'H-DIPFUND/']]) { const e = LB && LB.strategies.find(x => x.id === id), ks = Object.keys(firstRun).filter(k => k.startsWith(pre)); if (!e || !ks.length || /^tested/.test(e.status || '')) continue;
    const v = ks.map(k => firstRun[k].verdict), best = v.includes('PROVEN') ? 'proven' : v.includes('TRADABLE SMALL') ? 'tradable small (tier 2)' : v.every(x => x === 'INFORMATION') ? 'information' : v.includes('NOT PROVEN') ? 'not proven' : v.every(x => x === 'TOO FEW CASES') ? 'too few cases' : 'rejected';
    e.status = 'tested: ' + best; e.tested = firstRun[ks[0]].to; e.study = 'hold-lab.mjs -> data/hold-lab.json (run once as written, first complete run frozen)';
    e.result = Object.fromEntries(ks.map(k => { const r = firstRun[k]; if (!r.results) return [k, { verdict: r.verdict, ...(r.window ? { dipVsDcaWindow: r.window.dipVsDca, dipVsDcaSinceFirst: r.sinceFirst.dipVsDca } : {}), ...(r.pooled ? { pooled: r.pooled } : {}) }];
      const R = r.results, q = r.recovery; return [k, { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], tBlock: [R.older.tBlock, R.newer.tBlock],
        recovered: [q.older.recovered, q.newer.recovered], dead: [q.older.dead, q.newer.dead], perYear: [q.older.perYear, q.newer.perYear], spyPerYear: [q.older.spyPerYear, q.newer.spyPerYear] }]; })); ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('hold-lab: library not updated: ' + e.message); }
