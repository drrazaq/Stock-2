// C-GOV1b GOVERNMENT AWARDS WITH THE PARENT MAP (Agent C, Crowd). Research only; no orders; no Telegram. Output: data/gov-awards2.json.
// PRE-REGISTERED 22 Oct 2026, written before any result was seen. RUN ONCE AS WRITTEN (each version's first judged verdict frozen).
// Why a second version: C-GOV1 (gov-awards.mjs, 20 Oct) stopped on its own data rule with no verdict: only 16% of 50M+ awards matched
// a ticker, because awards go to subsidiaries (RAYTHEON COMPANY, NORTHROP GRUMMAN SYSTEMS CORP, ELECTRIC BOAT ...) whose names differ
// from the listed parent. C-GOV1 is NOT re-run or changed; this is a new pre-registered version with two data changes only:
//   1. PARENT MAP: every award's `recipient_id` is looked up once in the official USAspending recipient profile
//      (GET /api/v2/recipient/<recipient_id>/?year=all -> parent_name). A recipient that does not match a ticker by its own name is
//      matched by its parent's name, with the same STRICT normalised exact match to the SEC company list as C-GOV1.
//   2. COVERAGE: C-GOV1 kept only the 6,000 largest awards per family over five years, which are almost all giant contractors whose
//      award can never reach 20% of market cap. Here awards are fetched per calendar quarter (largest first, up to GOV2_PAGES pages
//      of 100 per quarter and family), so mid and small awards to small listed companies are in the sample. A quarter that still had
//      more pages is logged as truncated.
// DATA RULES (fixed now): (a) the 30% stop rule of C-GOV1 is unchanged: under 30% of 50M+ awards matched to one ticker = "needs data";
//   (b) NEW completeness rule: no verdict until the parent lookup is done for 95%+ of the 50M+ awards (lookups continue each run
//   within the time budget, cached in study-cache/gov2); (c) a quarter list that is not fully fetched = no verdict yet.
// EVENT (identical to C-GOV1): award amount 20%+ of the market cap on its Start Date (close x SEC share count known by then,
//   data/shares.json.gz, 30-day lag); stock tradable (3 USD+, 1M USD+ a day); one event per stock per 60 sessions. Buy the next open.
//   G1 = amount 20%+ of cap; G2 = G1 + share count up under 5% over 90 days + no 10%+ one-day move in the 5 sessions before.
//   Holds 20 and 60 sessions (4 versions). ALL = any matched 50M+ award (information only).
// GATES: 0.8% costs (1.2% stress), both halves of the 5-year window, date-clustered t, must beat the average stock bought the same day,
//   the S&P 500 and the same stock on its other days, must survive without its 2 best trades.
//   PROVEN: every gate with t >= max(own bar, league bar, 4.0).
//   TRADABLE SMALL (tier 2, owner's decision 22 Oct): in BOTH halves the edge vs the average stock is positive, the average trade is
//   positive after the 1.2% stress cost, it beats the S&P 500, it stays positive without its 2 best trades, and t >= 2.5 in each half.
// CAVEAT (unchanged from C-GOV1): "Award Amount" is the total obligated to date, which flatters the rule; any pass goes to live paper
//   first, never straight into buys.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
const env = process.env, OUT = env.OUT || 'data/gov-awards2.json', COST = 0.008, STRESS = 0.012, GDIR = (env.CACHE_DIR || 'study-cache') + '/gov2', API = env.USA_BASE || 'https://api.usaspending.gov';
const MIN_AWARD = 2e7, BIG = 5e7, CAP_FRAC = 0.2, MATCH_STOP = 0.3, PARENT_DONE = 0.95, FAMS = { contracts: ['C', 'D'], grants: ['04', '05'] }, PAGES = +(env.GOV2_PAGES || 25), BUDGET = +(env.GOV2_MINUTES || 60) * 60000, T0 = Date.now();
const TIER2_T = 2.5, LEAGUE_FLOOR = 4.0;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, gz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), timeLeft = () => Date.now() - T0 < BUDGET;
const PREV = J(OUT, {});
let store = gz(env.CACHE || 'study-cache/grouped.json.gz'); if (!store) { console.log('gov-awards2: no price cache'); process.exit(0); }
const SHR = gz(env.SHARES || 'data/shares.json.gz');
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) { console.log('gov-awards2: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN), CX = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; } if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; } }); store = null;
const spyI = SY.get('SPY');
fs.mkdirSync(GDIR, { recursive: true });
const SEC_UA = env.SEC_UA || 'stock-2 research (github actions)', SEC_WWW = env.SEC_BASE && /^http:\/\/(127\.0\.0\.1|localhost)/.test(env.SEC_BASE) ? env.SEC_BASE : 'https://www.sec.gov';
async function api(method, path, body) { for (let a = 0; a < 3; a++) { try { const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', 'User-Agent': SEC_UA }, body: body ? JSON.stringify(body) : undefined }); if (r.ok) return await r.json(); if (r.status === 404) return { notFound: true }; console.log('gov-awards2: HTTP ' + r.status + ' ' + path.slice(0, 60)); } catch (e) { console.log('gov-awards2: ' + (e.message || e)); } await sleep(3000 * (a + 1)); } return null; }
// ---- 1. awards per quarter (official API, cached, resumable) ----
const quarters = (() => { const q = [], y0 = +D[0].slice(0, 4), y1 = +D[T - 1].slice(0, 4); for (let y = y0; y <= y1; y++) for (const [a, b] of [['01-01', '03-31'], ['04-01', '06-30'], ['07-01', '09-30'], ['10-01', '12-31']]) { const s = y + '-' + a, e = y + '-' + b; if (e >= D[0] && s <= D[T - 1]) q.push([s < D[0] ? D[0] : s, e > D[T - 1] ? D[T - 1] : e]); } return q; })();
async function fetchQuarter(fam, codes, [from, to]) { const f = GDIR + '/' + fam + '-' + from + '.json', had = J(f, null); if (had && had.done) return had;
  const rows = had && had.rows ? had.rows : []; let page = had && had.page ? had.page + 1 : 1, more = true;
  for (; page <= PAGES && timeLeft(); page++) { const j = await api('POST', '/api/v2/search/spending_by_award/', { filters: { award_type_codes: codes, time_period: [{ start_date: from, end_date: to }], award_amounts: [{ lower_bound: MIN_AWARD }] }, fields: ['Award ID', 'Recipient Name', 'recipient_id', 'Award Amount', 'Start Date', 'Awarding Agency', 'Description', 'generated_internal_id'], sort: 'Award Amount', order: 'desc', limit: 100, page });
    if (!j || !Array.isArray(j.results)) { fs.writeFileSync(f, JSON.stringify({ rows, page: page - 1, done: false })); return { rows, done: false, truncated: false }; }
    for (const x of j.results) rows.push({ id: x['Award ID'] || x.generated_internal_id, r: x['Recipient Name'], rid: x.recipient_id || null, a: +x['Award Amount'] || 0, d: String(x['Start Date'] || '').slice(0, 10), ag: x['Awarding Agency'], t: x['Description'] ? String(x['Description']).slice(0, 80) : '' });
    more = !!(j.page_metadata && j.page_metadata.hasNext) && j.results.length > 0; fs.writeFileSync(f, JSON.stringify({ rows, page, done: false })); if (!more) break; await sleep(300); }
  const done = !more || page > PAGES, out = { rows, page: Math.min(page, PAGES), done, truncated: done && more }; if (done) fs.writeFileSync(f, JSON.stringify(out)); return out; }
// ---- 2. matching (SEC company list, strict; same normalisation as C-GOV1) ----
const norm = (s) => String(s || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\b(INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LLC|L L C|LTD|LIMITED|PLC|HOLDINGS?|HLDGS?|GROUP|GRP|THE|LP|L P|NV|N V|SA|S A|AG|DE|USA|US|INTERNATIONAL|INTL|TECHNOLOGIES|TECHNOLOGY|TECH)\b/g, ' ').replace(/\s+/g, ' ').trim();
async function secNames() { const f = GDIR + '/sec-names.json', had = J(f, null); if (had) return had; let j = null;
  try { const r = await fetch(SEC_WWW + '/files/company_tickers.json', { headers: { 'User-Agent': SEC_UA } }); if (r.ok) j = await r.json(); else console.log('gov-awards2: SEC company list HTTP ' + r.status); } catch (e) { console.log('gov-awards2: SEC company list: ' + (e.message || e)); }
  if (!j) return null; const m = {}; for (const x of Object.values(j)) { const sym = String(x.ticker || '').toUpperCase().replace(/-/g, '.'), n = norm(x.title); if (!n || !SY.has(sym)) continue; if (!m[n] || m[n].length < 2 && !m[n].includes(sym)) (m[n] = m[n] || []).push(sym); }
  fs.writeFileSync(f, JSON.stringify(m)); return m; }
// ---- 3. statistics (same as C-GOV1) ----
const firstOnOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
const lag = SHR ? (+SHR.lagDays || 30) * 864e5 : 0, sharesKnown = (a, ms) => { const lim = new Date(ms - lag).toISOString().slice(0, 10); let v = null; for (const [d, n] of a) { if (d <= lim) v = n; else break; } return v; };
const tradable = (i, t) => { const c = C[i * T + t]; if (!(c >= 3)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 15 && dv / n >= 1e6; };
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) { const z = isFinite(C[b + k]) ? C[b + k] : CX[b + k]; if (isFinite(z)) { last = z; break; } } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && tradable(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);
const START = 60, midT = Math.floor((START + T) / 2), ownC = {}; const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : START; k < (half ? T - 1 : midT); k += 2) { if (Math.abs(k - t) <= h) continue; if (tradable(i, k)) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } } return (ownC[key] = v.length >= 30 ? mean(v) : null); };
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
const stat = (a, cost) => { if (a.length < 20) return { n: a.length };
  const v = byDay(a, z => z.g - cost - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - cost - z.sp : null), p = a.map(z => z.g - cost).sort((x, y) => y - x);
  return { n: a.length, days: v.length, stocks: new Set(a.map(z => z.s)).size, avg: +mean(p).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +mean(v).toFixed(4), t: tOf(v), vsSpy: sv.length ? +mean(sv).toFixed(4) : null, tSpy: tOf(sv), vsOwn: ov.length ? +mean(ov).toFixed(4) : null, tOwn: tOf(ov), win: +(p.filter(x => x > 0).length / p.length).toFixed(3), noTop2: +mean(p.slice(2)).toFixed(4) }; };
(async () => {
  // awards
  const fam = {}, qstat = { quarters: quarters.length, done: 0, truncated: [] };
  for (const [name, codes] of Object.entries(FAMS)) { fam[name] = []; for (const q of quarters) { const r = await fetchQuarter(name, codes, q); fam[name].push(...r.rows); if (r.done) qstat.done++; if (r.truncated) qstat.truncated.push(name + ' ' + q[0]); } }
  const allQ = qstat.done === quarters.length * Object.keys(FAMS).length;
  const awards = []; for (const [name, rows] of Object.entries(fam)) for (const r of rows) if (r.d && r.r && r.a >= MIN_AWARD) awards.push({ ...r, fam: name });
  console.log('gov-awards2: ' + awards.length + ' awards of 20M+ (' + qstat.done + ' of ' + quarters.length * 2 + ' quarter lists complete, ' + qstat.truncated.length + ' truncated at ' + PAGES + ' pages)');
  // parent map (cached, resumable; biggest number of 50M+ awards first)
  const PF = GDIR + '/parents.json', parents = J(PF, {}), need = {};
  for (const a of awards) if (a.rid && !(a.rid in parents)) need[a.rid] = (need[a.rid] || 0) + (a.a >= BIG ? 1 : 0.001);
  let calls = 0; for (const rid of Object.keys(need).sort((x, y) => need[y] - need[x])) { if (!timeLeft()) break; const j = await api('GET', '/api/v2/recipient/' + encodeURIComponent(rid) + '/?year=all'); calls++; if (!j) continue;
    parents[rid] = j.notFound ? { p: null } : { p: j.parent_name || null, lvl: j.recipient_level || null, alt: Array.isArray(j.alternate_names) ? j.alternate_names.slice(0, 5) : [] }; if (calls % 100 === 0) fs.writeFileSync(PF, JSON.stringify(parents)); await sleep(150); }
  fs.writeFileSync(PF, JSON.stringify(parents));
  const bigA = awards.filter(a => a.a >= BIG), parentDone = bigA.length ? bigA.filter(a => a.rid && a.rid in parents).length / bigA.length : 0;
  console.log('gov-awards2: parent lookups this run ' + calls + ', done for ' + (parentDone * 100).toFixed(0) + '% of 50M+ awards');
  const names = await secNames();
  const base = { generatedAt: new Date().toISOString(), agent: 'C', id: 'C-GOV1b', preRegistered: '2026-10-22', window: [D[START], D[T - 1]], awards: awards.length, quarterLists: qstat, parentLookupsDone: +parentDone.toFixed(3) };
  if (!names || !awards.length) { fs.writeFileSync(OUT, JSON.stringify({ ...base, status: 'needs data', why: !names ? 'the SEC company list could not be read' : 'no awards came back from USAspending' }, null, 1)); console.log('gov-awards2: needs data'); return; }
  const symOf = (a) => { const own0 = names[norm(a.r)]; if (own0 && own0.length === 1) return { sym: own0[0], via: 'own name' }; const P = a.rid && parents[a.rid]; if (P && P.p) { const s = names[norm(P.p)]; if (s && s.length === 1) return { sym: s[0], via: 'parent' }; } return null; };
  let matched = 0, viaParent = 0, bigMatched = 0; const ev = {}, unmatchedBig = {};
  for (const a of awards) { const m = symOf(a); if (!m) { if (a.a >= BIG) { const P = a.rid && parents[a.rid], k = (P && P.p ? P.p + ' <- ' : '') + a.r; unmatchedBig[k] = (unmatchedBig[k] || 0) + 1; } continue; }
    matched++; if (m.via === 'parent') viaParent++; if (a.a >= BIG) bigMatched++; a.sym = m.sym; (ev[a.sym] = ev[a.sym] || []).push(a); }
  const rate = bigA.length ? bigMatched / bigA.length : 0, topUnmatched = Object.entries(unmatchedBig).sort((x, y) => y[1] - x[1]).slice(0, 25).map(([n, c]) => n + ' (' + c + ')');
  Object.assign(base, { matched, matchedViaParent: viaParent, big: bigA.length, bigMatched, matchRate: +rate.toFixed(3), topUnmatchedBig: topUnmatched });
  console.log('gov-awards2: ' + matched + ' matched (' + viaParent + ' through the parent); 50M+ match rate ' + (rate * 100).toFixed(0) + '%');
  const stopWhy = !allQ ? 'award lists not complete yet (' + qstat.done + ' of ' + quarters.length * 2 + ' quarter lists); fetching continues next run' : parentDone < PARENT_DONE ? 'parent lookups done for ' + (parentDone * 100).toFixed(0) + '% of 50M+ awards (95% needed); lookups continue next run' : rate < MATCH_STOP ? 'only ' + (rate * 100).toFixed(0) + '% of awards of 50M+ matched a ticker even with the parent map (30% needed). No verdict.' : null;
  if (stopWhy) { fs.writeFileSync(OUT, JSON.stringify({ ...base, status: rate < MATCH_STOP && allQ && parentDone >= PARENT_DONE ? 'needs data' : 'data loading', why: stopWhy, firstRun: PREV.firstRun || null }, null, 1)); console.log('gov-awards2: ' + stopWhy); return; }
  // events and tests (identical to C-GOV1)
  const VERS = { G1_20: 20, G1_60: 60, G2_20: 20, G2_60: 60, ALL_20: 20, ALL_60: 60 }, trades = {}, counts = {}; for (const k in VERS) { trades[k] = []; counts[k] = 0; }
  const add = (k, i, t, extra) => { counts[k]++; const h = VERS[k], g = fwd(i, t, h), c0 = ctrl(t, h), ob = own(i, t, h), sp = spyF(t, h); if (g === null || c0 === null || ob === null || Math.abs(g) > 3) return; trades[k].push({ t, s: SYMS[i], g, c: c0, ob, sp, ...extra }); };
  let capKnown = 0, sized = 0; const today = [];
  for (const [sym, list] of Object.entries(ev)) { const i = SY.get(sym); if (i === undefined || i === spyI) continue; const b = i * T, A = SHR && SHR.c && SHR.t && sym in SHR.t ? SHR.c[SHR.t[sym]] : null; list.sort((x, y) => x.d < y.d ? -1 : 1); let lastAll = -999, lastG = -999;
    for (const a of list) { const t = firstOnOrAfter(a.d); if (t < START || t >= T) continue; if (!isFinite(C[b + t])) continue;
      if (a.a >= BIG && t - lastAll > 60 && tradable(i, t) && t + 1 < T) { lastAll = t; add('ALL_20', i, t, { amt: a.a }); add('ALL_60', i, t, { amt: a.a }); }
      const ms = Date.parse(D[t]), n1 = A ? sharesKnown(A, ms) : null; if (!(n1 > 0)) continue; capKnown++; const frac = a.a / (n1 * C[b + t]); if (!(frac >= CAP_FRAC)) continue; sized++;
      if (t + 1 >= T) { today.push({ sym, d: a.d, amount: a.a, capFrac: +frac.toFixed(2), agency: a.ag, what: a.t }); continue; }
      if (t - lastG <= 60 || !tradable(i, t)) continue; lastG = t; const ex = { amt: a.a, frac: +frac.toFixed(2) }; add('G1_20', i, t, ex); add('G1_60', i, t, ex);
      const n0 = sharesKnown(A, ms - 90 * 864e5); let jump = false; for (let k = t - 5; k < t; k++) { const p0 = C[b + k - 1], p1 = C[b + k]; if (p0 > 0 && p1 > 0 && Math.abs(p1 / p0 - 1) >= 0.1) { jump = true; break; } }
      if (n0 > 0 && n1 / n0 - 1 < 0.05 && !jump) { add('G2_20', i, t, ex); add('G2_60', i, t, ex); } } }
  const NV = 4, OWN_BAR = 2.4 + 0.1 * NV / 2, LG = J('data/agent-league.json', {}), BAR = Math.max(OWN_BAR, typeof LG.bar === 'number' ? LG.bar : 0, LEAGUE_FLOOR);
  const NAMES = { G1: 'Federal award (parent-mapped) worth 20%+ of market cap on its start day', G2: 'Federal award (parent-mapped) 20%+ of market cap, share count up under 5% in 90 days, no 10% day in the 5 sessions before', ALL: 'Any matched federal award of 50M+ (information only)' }, RES = {};
  for (const [k, a] of Object.entries(trades)) { const [r0, hs] = k.split('_'), R = { older: stat(a.filter(z => z.t < midT), COST), newer: stat(a.filter(z => z.t >= midT), COST), olderStress: stat(a.filter(z => z.t < midT), STRESS), stress: stat(a.filter(z => z.t >= midT), STRESS) }, why = [], why2 = [];
    for (const hf of ['older', 'newer']) { const r = R[hf], rs = R[hf === 'older' ? 'olderStress' : 'stress']; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); why2.push('too few cases'); continue; }
      if (!(r.edge > 0)) why.push('not better than an average stock in the ' + hf + ' half (' + pc(r.edge) + ')');
      if (!(r.t >= BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', ' + BAR.toFixed(2) + ' needed)');
      if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half');
      if (!(r.vsSpy > 0)) why.push('did not beat the S&P 500 in the ' + hf + ' half (' + pc(r.vsSpy) + ')');
      if (!(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')');
      if (!(r.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + hf + ' half');
      if (!(rs.avg > 0)) why.push('loses at 1.2% costs in the ' + hf + ' half');
      // tier 2
      if (!(r.edge > 0)) why2.push(hf + ': not better than the average stock'); if (!(rs.avg > 0)) why2.push(hf + ': loses at 1.2% cost'); if (!(r.vsSpy > 0)) why2.push(hf + ': did not beat the S&P 500');
      if (!(r.noTop2 > 0)) why2.push(hf + ': loses without its 2 best trades'); if (!(r.t >= TIER2_T)) why2.push(hf + ': t ' + r.t + ' under 2.5'); }
    const verdict = !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PASSED' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED';
    const level = verdict === 'PASSED' ? 'PROVEN' : verdict !== 'TOO FEW CASES' && !why2.length ? 'TRADABLE SMALL (tier 2)' : 'NONE';
    RES[k] = { rule: r0, name: NAMES[r0] + ', hold ' + hs + ' sessions', signals: counts[k], info: r0 === 'ALL', verdict: r0 === 'ALL' ? 'INFORMATION: ' + verdict : verdict, level: r0 === 'ALL' ? 'information only' : level, why: why.join('; ') || 'every gate passed', whyTier2: why2.join('; ') || 'tier-2 test passed', results: R }; }
  const thisRun = { at: new Date().toISOString(), from: D[START], to: D[T - 1], bar: +BAR.toFixed(2), awardsWithCap: capKnown, awardsOver20pctCap: sized, results: RES };
  const frozen = freezeEach(PREV.firstRun && PREV.firstRun.results, RES, (r) => r.verdict !== 'TOO FEW CASES'), firstRun = Object.keys(frozen).length ? { at: (PREV.firstRun && PREV.firstRun.at) || thisRun.at, bar: (PREV.firstRun && PREV.firstRun.bar) || thisRun.bar, to: (PREV.firstRun && PREV.firstRun.to) || thisRun.to, results: frozen } : null;
  fs.writeFileSync(OUT, JSON.stringify({ ...base, status: 'OK', versions: NV, bar: +BAR.toFixed(2), caveat: 'Award Amount is the total obligated to date (may exceed the amount known on the start day): a pass goes to live paper first.', firstRun, latest: latestBlock(thisRun), today, examples: Object.fromEntries(Object.entries(trades).map(([k, a]) => [k, a.slice(-8).map(z => ({ s: z.s, d: D[z.t], amt: z.amt, frac: z.frac, ret: +z.g.toFixed(3) }))])) }, null, 1));
  const shown = firstRun ? firstRun.results : {};
  console.log('GOV AWARDS (parent map), ' + D[START] + ' to ' + D[T - 1] + ', ' + capKnown + ' matched awards with a known cap, ' + sized + ' at 20%+ of cap, bar t ' + BAR.toFixed(2));
  for (const [k, r] of Object.entries(RES)) { const f = shown[k] || r, n = f.results.newer, o = f.results.older; console.log('- ' + k + ' ' + f.verdict + ' / level ' + f.level + (shown[k] ? ' (frozen)' : ' (not frozen: too few cases)') + ' | older ' + (o.n || 0) + ', edge ' + pc(o.edge) + ' t ' + o.t + ' | newer ' + (n.n || 0) + ', edge ' + pc(n.edge) + ' t ' + n.t); }
  // library C-GOV1b from the frozen first run only
  try { const LB = J('data/strategy-library.json', null), e = LB && LB.strategies.find(x => x.id === 'C-GOV1b'); if (e && firstRun && !/^tested/.test(e.status || '')) { const order = ['PASSED', 'NOT PROVEN', 'REJECTED', 'TOO FEW CASES'];
    const vs = Object.entries(firstRun.results).filter(([k]) => /^G/.test(k)).sort(([, x], [, y]) => order.indexOf(x.verdict) - order.indexOf(y.verdict) || ((y.results.newer.t || -9) - (x.results.newer.t || -9)));
    if (vs.length) { const [bk, br] = vs[0], R = br.results, tier2 = vs.filter(([, r]) => /TRADABLE/.test(r.level)).map(([k]) => k);
      e.agent = 'C'; e.status = 'tested: ' + (br.verdict === 'PASSED' ? 'passed' : br.verdict.toLowerCase()) + (tier2.length ? ' (tier 2: ' + tier2.join(', ') + ')' : ''); e.tested = firstRun.to; e.study = 'gov-awards2.mjs -> data/gov-awards2.json (run once, first run frozen)';
      e.result = { best: bk, level: br.level, t: R.newer.t, tOlder: R.older.t, edge: R.newer.edge, edgeOlder: R.older.edge, vsSpy: R.newer.vsSpy, vsOwn: R.newer.vsOwn, n: [R.older.n || 0, R.newer.n || 0], bar: firstRun.bar, matchRate: +rate.toFixed(2), why: vs.map(([k, r]) => k + ' ' + r.verdict + ' / ' + r.level + (r.verdict === 'PASSED' ? '' : ': ' + r.why.split(';')[0])).join(' | ') };
      fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } } catch (e) {}
})();
