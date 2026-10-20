// C-GOV1 GOVERNMENT AWARDS (Agent C, Crowd). Research only; no orders; no Telegram. Output: data/gov-awards.json.
// PRE-REGISTERED 20 Oct 2026, written before any result was seen. RUN ONCE AS WRITTEN (first verdict frozen, as in pattern-lab).
// Idea (outside review, 20 Oct): cash from the government is a hard fact, not a press release. Does a large federal award predict gains?
// DATA: the official USAspending API (api.usaspending.gov/api/v2/search/spending_by_award/, no key), definitive contracts (type D),
//   delivery orders (C) and project / cooperative-agreement grants (04, 05), action dates in the 5-year price window, award total
//   20M USD and over, one page of 100 at a time, kept in study-cache/gov (one fetch; later runs reuse it). The event date is the
//   award's own Start Date (period of performance), never Last Modified. Caveat written before the run: "Award Amount" is the total
//   obligated to date, so a contract that grew later looks bigger than it was on its start day; this flatters the rule, so a pass
//   goes to live paper first and never straight into buys.
// MATCHING: recipient name to ticker through the SEC company list (www.sec.gov/files/company_tickers.json), STRICT: exact match after
//   normalising (upper case, punctuation out, INC/CORP/CO/LLC/LTD/PLC/HOLDINGS/GROUP/COMPANY/THE and similar dropped). Subsidiaries
//   with other names do not match: the match rate is logged. STOP RULE: if under 30% of the awards of 50M USD and over match a ticker,
//   the study records "needs data" with the numbers and no verdict.
// EVENT: award amount 20% or more of the market cap on the start day (close x SEC share count known by then, data/shares.json.gz);
//   stock tradable (close 3 USD+, 1M USD+ traded a day). One event per stock per 60 sessions (the first). Versions:
//   G1 = amount 20%+ of market cap; G2 = G1 + share count up under 5% over 90 days + no 10%+ one-day move in the 5 sessions before.
//   Buy the next open, hold 20 and 60 sessions (4 versions).
// GATES unchanged: 0.8% costs (1.2% stress), both halves of 5 years, date-clustered t at or above max(own bar, league bar), must beat
//   the average stock bought the same day, the S&P 500 over the same days AND the same stock on its other days, must survive without
//   its 2 best trades. Also for information: ALL matched awards of 50M+ (no size-vs-cap test).
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, OUT = env.OUT || 'data/gov-awards.json', COST = 0.008, STRESS = 0.012, GDIR = (env.CACHE_DIR || 'study-cache') + '/gov', API = env.USA_BASE || 'https://api.usaspending.gov';
const MIN_AWARD = 2e7, BIG = 5e7, CAP_FRAC = 0.2, MATCH_STOP = 0.3, FAMS = { contracts: ['C', 'D'], grants: ['04', '05'] }, MAX_PAGES = +(env.GOV_PAGES || 60);
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, gz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PREV = J(OUT, {});
let store = gz(env.CACHE || 'study-cache/grouped.json.gz'); if (!store) { console.log('gov-awards: no price cache'); process.exit(0); }
const SHR = gz(env.SHARES || 'data/shares.json.gz');
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) { console.log('gov-awards: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; } }); store = null;
const spyI = SY.get('SPY');
// ---- 1. awards (official API, cached) ----
fs.mkdirSync(GDIR, { recursive: true });
const SEC_UA = env.SEC_UA || 'stock-2 research (github actions)';
async function fetchFamily(name, codes) { const f = GDIR + '/' + name + '.json', had = J(f, null); if (had && had.done) return had;
  const rows = had && had.rows ? had.rows : [], from = D[0], to = D[T - 1]; let page = had && had.page ? had.page + 1 : 1, status = 'done', firstKeys = null;
  for (; page <= MAX_PAGES; page++) { const body = { filters: { award_type_codes: codes, time_period: [{ start_date: from, end_date: to }], award_amounts: [{ lower_bound: MIN_AWARD }] }, fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Start Date', 'End Date', 'Awarding Agency', 'Description', 'generated_internal_id'], sort: 'Award Amount', order: 'desc', limit: 100, page };
    let j = null; for (let a = 0; a < 3 && !j; a++) { try { const r = await fetch(API + '/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': SEC_UA }, body: JSON.stringify(body) }); if (r.ok) j = await r.json(); else { console.log('gov-awards: HTTP ' + r.status + ' on ' + name + ' page ' + page + (a < 2 ? ', retrying' : '')); await sleep(3000 * (a + 1)); } } catch (e) { console.log('gov-awards: ' + name + ' page ' + page + ': ' + (e.message || e)); await sleep(3000); } }
    if (!j || !Array.isArray(j.results)) { status = 'partial'; break; }
    if (!firstKeys && j.results[0]) { firstKeys = Object.keys(j.results[0]); console.log('gov-awards: ' + name + ' record fields: ' + firstKeys.join(', ')); }
    for (const x of j.results) rows.push({ id: x['Award ID'] || x.generated_internal_id, r: x['Recipient Name'], a: +x['Award Amount'] || 0, d: String(x['Start Date'] || '').slice(0, 10), e: String(x['End Date'] || '').slice(0, 10), ag: x['Awarding Agency'], t: x['Description'] ? String(x['Description']).slice(0, 80) : '' });
    fs.writeFileSync(f, JSON.stringify({ rows, page, done: false }));
    if (!(j.page_metadata && j.page_metadata.hasNext) || !j.results.length) break; await sleep(400); }
  const out = { rows, page, done: status === 'done' || page > MAX_PAGES, status, from, to }; fs.writeFileSync(f, JSON.stringify(out)); return out; }
// ---- 2. ticker matching (SEC company list, strict) ----
const norm = (s) => String(s || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\b(INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LLC|L L C|LTD|LIMITED|PLC|HOLDINGS?|HLDGS?|GROUP|GRP|THE|LP|L P|NV|N V|SA|S A|AG|DE|USA|US|INTERNATIONAL|INTL|TECHNOLOGIES|TECHNOLOGY|TECH)\b/g, ' ').replace(/\s+/g, ' ').trim();
async function secNames() { const f = GDIR + '/sec-names.json', had = J(f, null); if (had) return had; let j = null;
  try { const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' } }); if (r.ok) j = await r.json(); else console.log('gov-awards: SEC company list HTTP ' + r.status); } catch (e) { console.log('gov-awards: SEC company list: ' + (e.message || e)); }
  if (!j) return null; const m = {}; for (const x of Object.values(j)) { const sym = String(x.ticker || '').toUpperCase().replace(/-/g, '.'), n = norm(x.title); if (!n || !SY.has(sym)) continue; if (!m[n] || m[n].length < 2 && !m[n].includes(sym)) (m[n] = m[n] || []).push(sym); }
  fs.writeFileSync(f, JSON.stringify(m)); return m; }
const firstOnOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
const lag = SHR ? (+SHR.lagDays || 30) * 864e5 : 0, sharesKnown = (a, ms) => { const lim = new Date(ms - lag).toISOString().slice(0, 10); let v = null; for (const [d, n] of a) { if (d <= lim) v = n; else break; } return v; };
const tradable = (i, t) => { const c = C[i * T + t]; if (!(c >= 3)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 15 && dv / n >= 1e6; };
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) if (isFinite(C[b + k])) { last = C[b + k]; break; } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && tradable(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);
const START = 60, midT = Math.floor((START + T) / 2), ownC = {}; const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : START; k < (half ? T - 1 : midT); k += 2) { if (Math.abs(k - t) <= h) continue; if (tradable(i, k)) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } } return (ownC[key] = v.length >= 30 ? mean(v) : null); };
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
const stat = (a, cost) => { if (a.length < 20) return { n: a.length };
  const v = byDay(a, z => z.g - cost - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - cost - z.sp : null), p = a.map(z => z.g - cost).sort((x, y) => y - x);
  return { n: a.length, days: v.length, stocks: new Set(a.map(z => z.s)).size, avg: +mean(p).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +mean(v).toFixed(4), t: tOf(v), vsSpy: sv.length ? +mean(sv).toFixed(4) : null, tSpy: tOf(sv), vsOwn: ov.length ? +mean(ov).toFixed(4) : null, tOwn: tOf(ov), win: +(p.filter(x => x > 0).length / p.length).toFixed(3), noTop2: +mean(p.slice(2)).toFixed(4) }; };
(async () => {
  const fam = {}; for (const [name, codes] of Object.entries(FAMS)) { fam[name] = await fetchFamily(name, codes); console.log('gov-awards: ' + name + ' ' + fam[name].rows.length + ' awards of ' + MIN_AWARD / 1e6 + 'M+ (' + fam[name].status + ', ' + fam[name].page + ' pages)'); }
  const awards = []; for (const [name, F] of Object.entries(fam)) for (const r of F.rows) if (r.d && r.r && r.a >= MIN_AWARD) awards.push({ ...r, fam: name });
  const names = await secNames(); if (!names || !awards.length) { fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), agent: 'C', preRegistered: '2026-10-20', status: 'needs data', why: !names ? 'the SEC company list could not be read' : 'no awards came back from USAspending (' + Object.values(fam).map(f => f.status).join('/') + ')', awards: awards.length }, null, 1)); console.log('gov-awards: needs data'); return; }
  let matched = 0, big = 0, bigMatched = 0; const ev = {}, uniqBig = new Set(), uniqBigM = new Set(), unmatchedBig = {};
  for (const a of awards) { const key = norm(a.r), syms = names[key]; const isBig = a.a >= BIG; if (isBig) { big++; uniqBig.add(key); }
    if (!syms || syms.length !== 1) { if (isBig) unmatchedBig[a.r] = (unmatchedBig[a.r] || 0) + 1; continue; } matched++; if (isBig) { bigMatched++; uniqBigM.add(key); }
    a.sym = syms[0]; (ev[a.sym] = ev[a.sym] || []).push(a); }
  const rate = big ? bigMatched / big : 0, rateNames = uniqBig.size ? uniqBigM.size / uniqBig.size : 0;
  console.log('gov-awards: ' + awards.length + ' awards, ' + matched + ' matched to one ticker; of ' + big + ' awards 50M+ (' + uniqBig.size + ' recipient names) ' + bigMatched + ' matched (' + (rate * 100).toFixed(0) + '% of awards, ' + (rateNames * 100).toFixed(0) + '% of names)');
  const topUnmatched = Object.entries(unmatchedBig).sort((x, y) => y[1] - x[1]).slice(0, 25).map(([n, c]) => n + ' (' + c + ')');
  const base = { generatedAt: new Date().toISOString(), agent: 'C', preRegistered: '2026-10-20', window: [D[START], D[T - 1]], awards: awards.length, matched, big, bigMatched, matchRate: +rate.toFixed(3), matchRateNames: +rateNames.toFixed(3), families: Object.fromEntries(Object.entries(fam).map(([k, f]) => [k, { awards: f.rows.length, status: f.status, pages: f.page }])), topUnmatchedBig: topUnmatched };
  if (rate < MATCH_STOP) { fs.writeFileSync(OUT, JSON.stringify({ ...base, status: 'needs data', why: 'only ' + (rate * 100).toFixed(0) + '% of awards of 50M+ matched a ticker by strict name (30% needed); subsidiaries and non-listed recipients are the gap. No verdict.' }, null, 1)); console.log('gov-awards: NEEDS DATA, match rate ' + (rate * 100).toFixed(0) + '% under 30%. Top unmatched: ' + topUnmatched.slice(0, 10).join('; ')); return; }
  // ---- 3. events and tests ----
  const VERS = { G1_20: 20, G1_60: 60, G2_20: 20, G2_60: 60, ALL_20: 20, ALL_60: 60 }, trades = {}, counts = {}; for (const k in VERS) { trades[k] = []; counts[k] = 0; }
  const add = (k, i, t, extra) => { counts[k]++; const h = VERS[k], g = fwd(i, t, h), c0 = ctrl(t, h), ob = own(i, t, h), sp = spyF(t, h); if (g === null || c0 === null || ob === null || Math.abs(g) > 3) return; trades[k].push({ t, s: SYMS[i], g, c: c0, ob, sp, ...extra }); };
  let capKnown = 0, sized = 0; const today = [];
  for (const [sym, list] of Object.entries(ev)) { const i = SY.get(sym); if (i === undefined || i === spyI) continue; const b = i * T, A = SHR && SHR.c && SHR.t && sym in SHR.t ? SHR.c[SHR.t[sym]] : null; list.sort((x, y) => x.d < y.d ? -1 : 1); let lastAll = -999, lastG = -999;
    for (const a of list) { const t = firstOnOrAfter(a.d); if (t < START || t >= T) continue; if (!isFinite(C[b + t])) continue;
      if (a.a >= BIG && t - lastAll > 60 && tradable(i, t) && t + 1 < T) { lastAll = t; add('ALL_20', i, t, { amt: a.a }); add('ALL_60', i, t, { amt: a.a }); }
      const ms = Date.parse(D[t]), n1 = A ? sharesKnown(A, ms) : null; if (!(n1 > 0)) continue; capKnown++; const cap = n1 * C[b + t], frac = a.a / cap; if (!(frac >= CAP_FRAC)) continue; sized++;
      if (t + 1 >= T) { if (t >= T - 2) today.push({ sym, d: a.d, amount: a.a, capFrac: +frac.toFixed(2), agency: a.ag, what: a.t }); continue; }
      if (t - lastG <= 60 || !tradable(i, t)) continue; lastG = t; const ex = { amt: a.a, frac: +frac.toFixed(2) }; add('G1_20', i, t, ex); add('G1_60', i, t, ex);
      const n0 = sharesKnown(A, ms - 90 * 864e5); let jump = false; for (let k = t - 5; k < t; k++) { const p0 = C[b + k - 1], p1 = C[b + k]; if (p0 > 0 && p1 > 0 && Math.abs(p1 / p0 - 1) >= 0.1) { jump = true; break; } }
      if (n0 > 0 && n1 / n0 - 1 < 0.05 && !jump) { add('G2_20', i, t, ex); add('G2_60', i, t, ex); } } }
  const NV = 4, OWN_BAR = 2.4 + 0.1 * NV / 2, LG = J('data/agent-league.json', {}), LEAGUE_BAR = typeof LG.bar === 'number' ? LG.bar : null, BAR = Math.max(OWN_BAR, LEAGUE_BAR || 0);
  const NAMES = { G1: 'Federal award (USAspending) worth 20%+ of market cap on its start day', G2: 'Federal award 20%+ of market cap, share count up under 5% in 90 days, no 10% day in the 5 sessions before', ALL: 'Any matched federal award of 50M+ (information only, no size test)' }, RES = {};
  for (const [k, a] of Object.entries(trades)) { const [r0, hs] = k.split('_'), R = { older: stat(a.filter(z => z.t < midT), COST), newer: stat(a.filter(z => z.t >= midT), COST), stress: stat(a.filter(z => z.t >= midT), STRESS) }, why = [];
    for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); continue; }
      if (!(r.edge > 0)) why.push('not better than an average stock in the ' + hf + ' half (' + pc(r.edge) + ')');
      if (!(r.t >= BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', ' + BAR.toFixed(2) + ' needed)');
      if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half');
      if (!(r.vsSpy > 0)) why.push('did not beat the S&P 500 in the ' + hf + ' half (' + pc(r.vsSpy) + ')');
      if (!(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')');
      if (!(r.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + hf + ' half'); }
    if (R.stress.n >= 20 && !(R.stress.avg > 0)) why.push('loses at 1.2% costs');
    const verdict = !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PASSED' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED';
    RES[k] = { rule: r0, name: NAMES[r0] + ', hold ' + hs + ' sessions', signals: counts[k], info: r0 === 'ALL', verdict: r0 === 'ALL' ? 'INFORMATION: ' + verdict : verdict, why: why.join('; ') || 'beat the average stock, the S&P 500 and the same stock on its other days in both halves, beyond the luck bar, at stress cost, without its 2 best trades', results: R }; }
  const thisRun = { at: new Date().toISOString(), from: D[START], to: D[T - 1], bar: +BAR.toFixed(2), awardsWithCap: capKnown, awardsOver20pctCap: sized, results: RES };
  const firstRun = PREV.firstRun && PREV.firstRun.results ? PREV.firstRun : thisRun;
  fs.writeFileSync(OUT, JSON.stringify({ ...base, status: 'OK', versions: NV, bar: +BAR.toFixed(2), caveat: 'Award Amount is the total obligated to date (may exceed the amount known on the start day): a pass goes to live paper first.', firstRun, latest: thisRun, today, examples: Object.fromEntries(Object.entries(trades).map(([k, a]) => [k, a.slice(-8).map(z => ({ s: z.s, d: D[z.t], amt: z.amt, frac: z.frac, ret: +z.g.toFixed(3) }))])) }, null, 1));
  console.log('GOV AWARDS, ' + D[START] + ' to ' + D[T - 1] + ', ' + capKnown + ' matched awards with a known market cap, ' + sized + ' at 20%+ of cap, bar t ' + BAR.toFixed(2) + (PREV.firstRun ? ' (verdicts frozen from ' + PREV.firstRun.at.slice(0, 10) + ')' : ''));
  for (const [k, r] of Object.entries(firstRun.results)) { const n = r.results.newer, o = r.results.older; console.log('- ' + k + ' ' + r.verdict + ' | ' + r.signals + ' signals | older ' + (o.n || 0) + ', edge ' + pc(o.edge) + ' t ' + o.t + ' | newer ' + (n.n || 0) + ', edge ' + pc(n.edge) + ' t ' + n.t + ' win ' + n.win + ', vs S&P ' + pc(n.vsSpy) + ', vs own ' + pc(n.vsOwn) + (!/PASSED/.test(r.verdict) ? ' (' + r.why.split(';')[0] + ')' : '')); }
  try { const LB = J('data/strategy-library.json', null); if (LB) { const e = LB.strategies.find(x => x.id === 'C-GOV1'); if (e && !/^tested/.test(e.status || '')) { const order = ['PASSED', 'NOT PROVEN', 'REJECTED', 'TOO FEW CASES'];
    const vs = Object.entries(firstRun.results).filter(([k]) => /^G/.test(k)).sort(([, x], [, y]) => order.indexOf(x.verdict) - order.indexOf(y.verdict) || ((y.results.newer.t || -9) - (x.results.newer.t || -9)));
    if (vs.length) { const [bk, br] = vs[0], R = br.results; e.agent = 'C'; e.status = 'tested: ' + (br.verdict === 'PASSED' ? 'passed' : br.verdict.toLowerCase()); e.tested = firstRun.to; e.study = 'gov-awards.mjs -> data/gov-awards.json (run once, first run frozen)';
      e.result = { best: bk, t: R.newer.t, tOlder: R.older.t, edge: R.newer.edge, edgeOlder: R.older.edge, vsSpy: R.newer.vsSpy, vsOwn: R.newer.vsOwn, n: [R.older.n || 0, R.newer.n || 0], bar: firstRun.bar, matchRate: +rate.toFixed(2), why: vs.map(([k, r]) => k + ' ' + r.verdict + (r.verdict === 'PASSED' ? '' : ': ' + r.why.split(';')[0])).join(' | ') };
      fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } } } catch (e) {}
})();
