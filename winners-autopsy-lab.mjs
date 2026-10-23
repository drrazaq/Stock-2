// WINNER AUTOPSY LAB (owner's request, 23 Oct 2026: "how did the stocks that actually won do it, and turn what repeats into live
// opportunities"). Research + a forward paper record; never places an order. Pure rules: winners-autopsy-core.mjs (tested first).
// MODES (env MODE; the workflow runs discover -> commit the pre-registration -> test -> paper on a trigger, paper alone on weekdays):
//  discover  1. UNIVERSE: every US common stock / ADR (active AND delisted, Massive reference list) with a close >= 1 USD and a median
//               daily dollar volume >= 2M USD over 20 sessions, as it was on each day.
//            2. WINNERS: every stock whose close rose 30%+ over a 1-10 session window starting in the last 90 sessions (core findEpisodes).
//            3. What was KNOWABLE on each of the 10 sessions before the start: the price/volume features and 28 registered yes/no flags
//               (core FEATURES / FLAGS), earnings dates (Nasdaq earnings calendar, as agent-a-lab.mjs), SEC filings (official EDGAR full
//               index: 8-K, Form 4, S-1/S-3/F-1/F-3/424B, 13D; plus 8-K ITEMS from EDGAR submissions for winners and controls), industry
//               (SEC SIC, 2 digits) and its 20-day move vs the S&P 500. The realistic entry (next open after the first +10% close) and
//               what was left of the move.
//            4. MATCHED CONTROLS: 5 stocks per winner, same base day, in the universe, same industry first, nearest price / 20-day
//               volatility / market value, that did NOT rise 30%+ in the same 10-session window (nor start a winner within 10 sessions).
//            5. Winners vs controls per flag and per combination of 2-3 flags (counts). CANDIDATES (criteria registered here, before any
//               number was seen): (a) >= max(10, 3% of winners) winners, lift >= 1.5, two-proportion z >= 3.0, each extra flag adds 10%+
//               lift; (b) as a buy rule on the WHOLE universe over the same 90 sessions (fresh signal, buy next open; exits S8T10 and
//               TRAIL, core EXITS) at least 20 resolved trades and an average after 0.8% cost above 0 with at least one exit. Up to 6
//               candidates by z, no candidate contained in another. If fewer than 3 pass both, the best (a)-only combinations fill up to
//               3 and are labelled FALLBACK (failed the 90-day money test). Each is written to data/strategy-library.json (ids WIN-001...)
//               as 'pre-registered' BEFORE any 5-year number exists; the workflow commits that before the test step runs.
//  test      The registered rules ONCE on the 5-year history at the system's tier-2 standard (value-core.mjs halfStat/judge): halves
//            2021-23 and 2024-26 (split 2024-01-01), > 0 after 0.8% AND 1.2% cost, better than the average universe stock bought the
//            same open and sold the same close, better than the same stock on its other days, > 0 without the 2 best trades, block t >=
//            2.5 (TRADABLE SMALL) / >= the proof bar (PROVEN). Signals end before the autopsy window (its 10 knowable sessions and its
//            exits), so the discovery days are never part of the test. The first verdict of each rule/exit is FROZEN (firstRun).
//  paper     Every registered rule, whatever its verdict: today's fresh signals -> data/winners-paper.jsonl (entry = the first open
//            AFTER the day the signal was detected; exits as registered), open records resolved, data/winners-board.json written.
// DATA: Massive grouped daily bars (adjusted; this lab's own cache w-cache/, rows of common stocks / ADRs with 20k USD+ traded, so
// collapsed and delisted stocks keep their last prices), split repair from Massive's split list, SEC share counts (data/shares.json.gz)
// for market value, insider purchases (study-cache/insider, read only, descriptive), Nasdaq calendar (own cache; a-cache read only as a
// fallback). Secrets: MASSIVE_KEY, SEC_UA (never printed).
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as K from './winners-autopsy-core.mjs';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
const env = process.env, MODE = env.MODE || 'discover', WC = env.W_CACHE || 'w-cache', OUT = env.OUT || 'data/winners-autopsy.json', PAPER = env.PAPER || 'data/winners-paper.jsonl', BOARD = env.BOARD || 'data/winners-board.json', LIB = env.LIB || 'data/strategy-library.json';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SECW = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', T0 = Date.now(), BUDGET = (+env.W_MINUTES || 200) * 60e3, outOfTime = () => Date.now() - T0 > BUDGET;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o, pretty) => { fs.mkdirSync(f.replace(/\/[^/]+$/, '') || '.', { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, pretty ? 1 : 0)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = (a) => { const s = a.filter(x => isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', r4 = K.r4, secs = () => Math.round((Date.now() - T0) / 1000);
const nextDay = (d) => iso(Date.parse(d + 'T12:00:00Z') + 864e5);
const log = (...a) => console.log('[' + secs() + 's]', ...a);
fs.mkdirSync(WC, { recursive: true });
const PREV = J(OUT, {}) || {};
const LG = J('data/agent-league.json', {}), BAR = +Math.max(TIER2_T, typeof LG.bar === 'number' ? LG.bar : 0, 4.0).toFixed(2);

// ================= fetching (Massive, SEC, Nasdaq) =================
let mCalls = 0;
async function massive(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) { mCalls++; let r; try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(20000); continue; } if (r.status === 401) { console.error('The MASSIVE_KEY secret was rejected.'); process.exit(1); }
    if (r.status === 403) return { refused: true }; if (r.status === 404) return null; if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); }
  return null; }
async function pool(items, n, fn) { let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < items.length && !outOfTime()) { const x = items[k++]; await fn(x); } })); }
let secLast = 0; async function sec(url, asBuf) { for (let a = 0; a < 4; a++) { const w = (local(env.SEC_BASE) ? 0 : 130) - (Date.now() - secLast); if (w > 0) await sleep(w); secLast = Date.now();
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(120000) }); if (r.status === 404) return null; if (r.status === 429 || r.status >= 500) { await sleep(5000 * (a + 1)); continue; } if (!r.ok) return null;
      return asBuf ? Buffer.from(await r.arrayBuffer()) : await r.json(); } catch (e) { await sleep(3000 * (a + 1)); } } return null; }
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
let nqLast = 0; async function nasdaq(d) { for (let a = 0; a < 3; a++) { const w = (local(env.NASDAQ_BASE) ? 0 : 400) - (Date.now() - nqLast); if (w > 0) await sleep(w); nqLast = Date.now();
    try { const r = await fetch(NQ + '/api/calendar/earnings?date=' + d, { headers: NQ_HEAD, signal: AbortSignal.timeout(30000) }); if (!r.ok) { await sleep(1500 * (a + 1)); continue; } const j = await r.json(); if (j && j.data) return (j.data.rows || []).map(x => [String(x.symbol || '').trim(), x.time === 'time-pre-market' ? 'bmo' : x.time === 'time-after-hours' ? 'amc' : '']).filter(x => /^[A-Z]{1,5}$/.test(x[0])); } catch (e) { await sleep(1500 * (a + 1)); } }
  return null; }

// ---- reference list (common stocks + ADRs, active and delisted) ----
async function refList() { const f = WC + '/ref.json', had = J(f, null); if (had && had.complete && Date.now() - Date.parse(had.at) < 30 * 864e5) return had;
  const out = new Set(); let complete = true;
  for (const [type, active] of [['CS', true], ['ADRC', true], ['CS', false], ['ADRC', false]]) { let p = `/v3/reference/tickers?market=stocks&type=${type}&active=${active}&limit=1000`, pages = 0;
    while (p && pages++ < 80) { const j = await massive(p); if (!j || j.refused || !Array.isArray(j.results)) { complete = false; break; } for (const x of j.results) if (/^[A-Z]{1,5}$/.test(x.ticker || '')) out.add(x.ticker); p = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null; }
    if (p) complete = false; }
  const r = { at: new Date().toISOString(), complete, syms: [...out] }; if (r.syms.length > 1000 && (complete || !had)) W(f, r); return r.syms.length > 1000 ? r : (had || r); }

// ---- daily bars: one compact record per session, by month file ----
const PXD = WC + '/px';
function loadPx() { const days = {}; try { for (const f of fs.readdirSync(PXD).filter(f => /^\d{4}-\d{2}\.json\.gz$/.test(f))) Object.assign(days, JZ(PXD + '/' + f, {})); } catch (e) {} return days; }
function savePx(days, months) { for (const m of months) { const o = {}; for (const d of Object.keys(days)) if (d.slice(0, 7) === m) o[d] = days[d]; WZ(PXD + '/' + m + '.json.gz', o); } }
async function updatePx(days, want) {
  const ref = await refList(), CS = new Set(ref.syms), gone = new Set(J(PXD + '/gone.json', [])), touched = new Set(); let refused = null, added = 0;
  const now = new Date(), nowMin = now.getUTCHours() * 60 + now.getUTCMinutes(), today = iso(Date.now());
  let have = Object.keys(days).length;
  for (let k = 0; k < want * 1.6 && !outOfTime(); k++) { const ms = Date.now() - k * 864e5, d = iso(ms), wd = new Date(ms).getUTCDay();
    if (wd === 0 || wd === 6 || days[d] || gone.has(d)) continue; if (have >= want && k > 14) break;
    if (d === today && nowMin < 21 * 60 + 30) continue;                                    // today's bars only after the close is settled
    const j = await massive(`/v2/aggs/grouped/locale/us/market/stocks/${d}?adjusted=true`);
    if (j && j.refused) { refused = d; break; } if (!j) continue;
    const rows = (j.results || []).filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY') && x.c > 0 && x.v > 0 && (x.c * x.v >= 2e4 || x.T === 'SPY'));
    if (!rows.length) { if (k > 4) gone.add(d); continue; }
    days[d] = { at: today, T: rows.map(x => x.T), o: rows.map(x => +(+x.o).toFixed(4)), h: rows.map(x => +(+x.h).toFixed(4)), l: rows.map(x => +(+x.l).toFixed(4)), c: rows.map(x => +(+x.c).toFixed(4)), v: rows.map(x => Math.round(x.v)) };
    touched.add(d.slice(0, 7)); added++; have++; if (added % 100 === 0) { savePx(days, touched); touched.clear(); log('sessions fetched', added, 'held', have); } }
  savePx(days, touched); W(PXD + '/gone.json', [...gone]);
  return { added, refused, refComplete: ref.complete, refSyms: ref.syms.length };
}
async function splitList(from) { const f = WC + '/splits.json', had = J(f, null); if (had && Date.now() - Date.parse(had.at) < 20 * 3600e3) return had.list;
  const list = []; let p = '/stocks/v1/splits?execution_date.gte=' + from + '&limit=5000', pages = 0, okAny = false;
  while (p && pages++ < 30) { const j = await massive(p); if (!j || j.refused || !Array.isArray(j.results)) { if (pages === 1) { p = '/v3/reference/splits?execution_date.gte=' + from + '&limit=1000'; continue; } break; } okAny = true;
    for (const x of j.results) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), fr = +x.split_from, to = +x.split_to; if (!s || !d || !(fr > 0) || !(to > 0) || fr === to || /dividend/i.test(String(x.adjustment_type || ''))) continue; list.push({ s, d, r: to / fr }); }
    p = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null; }
  if (okAny) { W(f, { at: new Date().toISOString(), list }); return list; } return had ? had.list : []; }

// ---- EDGAR full index per quarter: 8-K, Form 4, registration / prospectus (dilution), 13D, by CIK and filing date ----
const kindOf = (form) => form === '8-K' ? 'k8' : form === '4' ? 'f4' : /^(S-1|S-3|F-1|F-3)(\/A)?$/.test(form) || /^424B\d$/.test(form) ? 'dil' : /^(SC 13D|SCHEDULE 13D)(\/A)?$/.test(form) ? 'd13' : null;
async function edgarIndex(fromDate) { const dir = WC + '/edgar', now = new Date(), out = new Map(); fs.mkdirSync(dir, { recursive: true }); let got = 0, failed = 0, quarters = 0;
  const cq = now.getUTCFullYear() + 'Q' + (Math.floor(now.getUTCMonth() / 3) + 1);
  for (let y = +fromDate.slice(0, 4); y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { const key = y + 'Q' + q; if (key > cq) continue;
    const f = dir + '/' + key + '.json.gz'; let rows = JZ(f, null); const qEnd = new Date(Date.UTC(y, q * 3, 1)), stale = rows && rows.at && Date.parse(rows.at) < qEnd.getTime() + 3 * 864e5;
    if ((!rows || stale || key === cq) && !outOfTime()) { const buf = await sec(SECW + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', true);
      if (buf) { let txt; try { txt = zlib.gunzipSync(buf).toString('latin1'); } catch (e) { txt = buf.toString('latin1'); } const r = {};
        for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length < 5) continue; const k = kindOf(p[2].trim()); if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(p[3].trim())) continue; (r[+p[0]] = r[+p[0]] || []).push([p[3].trim(), k]); }
        rows = { at: new Date().toISOString(), r }; WZ(f, rows); got++; } else failed++; }
    if (rows && rows.r) { quarters++; for (const [cik, a] of Object.entries(rows.r)) { const L = out.get(+cik) || out.set(+cik, []).get(+cik); for (const x of a) L.push(x); } } }
  return { byCik: out, quarters, got, failed };
}
// ---- Nasdaq earnings calendar per weekday (own cache; a-cache rows as a read-only fallback) ----
async function earningsDays(from, to) { const dir = WC + '/nq', today = iso(Date.now()), res = new Map(); let fetched = 0, fallback = 0, missing = 0; fs.mkdirSync(dir, { recursive: true });
  for (let x = Date.parse(from + 'T12:00:00Z'); x <= Date.parse(to + 'T12:00:00Z'); x += 864e5) { const wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6) continue; const d = iso(x), f = dir + '/' + d + '.json';
    let rows = J(f, null); const recent = d >= iso(Date.now() - 6 * 864e5);
    if ((!rows || recent) && !outOfTime()) { const r = await nasdaq(d); if (r) { rows = r; fetched++; if (d < today) W(f, r); } }
    if (!rows) { const a = J('a-cache/nasdaq/' + d + '.json', null); if (a) { rows = a.map(z => [z[0], z[1] || '']); fallback++; } }
    if (!rows) { missing++; continue; } res.set(d, rows); }
  return { byDay: res, fetched, fallback, missing };
}

// ================= load everything into matrices =================
async function load({ want, keep }) {
  const days = loadPx(); const up = await updatePx(days, want); log('prices: +' + up.added + ' sessions fetched, ' + Object.keys(days).length + ' held' + (up.refused ? ', plan refused ' + up.refused : ''));
  let D = Object.keys(days).sort(); if (keep && D.length > keep) D = D.slice(D.length - keep);
  const T = D.length, SY = new Map(); for (const d of D) for (const s of days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
  const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), H = new Float32Array(N).fill(NaN), L = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN);
  D.forEach((d, t) => { const x = days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; H[k] = x.h[j]; L[k] = x.l[j]; C[k] = x.c[j]; V[k] = x.v[j]; } });
  // split repair: a day fetched before a split (its 'at' earlier than the split day) and dated before it is put on the post-split basis
  const splits = await splitList(D[0]); let fixed = 0; const atOf = D.map(d => days[d].at);
  for (const sp of splits) { const i = SY.get(sp.s); if (i === undefined) continue; for (let t = 0; t < T; t++) { if (!(D[t] < sp.d && atOf[t] < sp.d)) continue; const k = i * T + t; if (!(C[k] > 0)) continue; O[k] /= sp.r; H[k] /= sp.r; L[k] /= sp.r; C[k] /= sp.r; V[k] *= sp.r; fixed++; } }
  for (const d of Object.keys(days)) delete days[d];
  const splitDays = new Map(); for (const sp of splits) (splitDays.get(sp.s) || splitDays.set(sp.s, []).get(sp.s)).push(sp.d);
  log('matrix ' + NS + ' stocks x ' + T + ' sessions ' + D[0] + '..' + D[T - 1] + '; split repairs ' + fixed + ' cells from ' + splits.length + ' splits');
  return { D, T, NS, SYMS, SY, O, H, L, C, V, splitDays, up, splits: splits.length };
}

// meta: industry (SIC) and CIK per symbol. CIK from SEC's ticker list (data/shares.json.gz), else Massive ticker details (dated at the
// stock's last session, so delisted tickers resolve); SIC from Massive ticker details. Cached in w-cache/meta.json.
async function meta(M, need, maxCalls) { const f = WC + '/meta.json', m = J(f, {}), SH = JZ('data/shares.json.gz', {}) || {}, todo = need.filter(s => !(s in m)).slice(0, maxCalls); let got = 0;
  await pool(todo, 6, async (s) => { const i = M.SY.get(s); let last = M.T - 1; while (last > 0 && !(M.C[i * M.T + last] > 0)) last--; const j = await massive('/v3/reference/tickers/' + s + '?date=' + M.D[last]); const r = j && j.results;
    m[s] = r ? { sic: r.sic_code ? String(r.sic_code) : null, cik: r.cik ? +r.cik : null } : { sic: null, cik: null }; got++; });
  if (got) W(f, m); const cikOf = (s) => (SH.t && (SH.t[s] || SH.t[s.replace(/\./g, '-')])) || (m[s] && m[s].cik) || null;
  return { sic2: (s) => m[s] && m[s].sic ? String(m[s].sic).padStart(4, '0').slice(0, 2) : null, cikOf, SH, got, asked: todo.length }; }

// ================= features, flags, universe for every stock and session =================
function buildFlags(M, X) {
  const { T, NS, SYMS, O, H, L, C, V, D } = M, N = NS * T, R20 = new Float32Array(N).fill(NaN), VOL = new Float32Array(N).fill(NaN), DVM = new Float32Array(N).fill(NaN), MC = new Float32Array(N).fill(NaN), MASK = new Uint32Array(N);
  const px = (i) => { const b = i * T; return { o: O.subarray(b, b + T), h: H.subarray(b, b + T), l: L.subarray(b, b + T), c: C.subarray(b, b + T), v: V.subarray(b, b + T) }; };
  const spyI = M.SY.get('SPY'), spyF = spyI !== undefined ? K.featureSeries(px(spyI)) : null;
  // calendar with 10 weekdays after the last session, so a report due after today maps to a future session index
  const DX = [...D]; for (let x = Date.parse(D[T - 1] + 'T12:00:00Z') + 864e5; DX.length < T + 10; x += 864e5) { const wd = new Date(x).getUTCDay(); if (wd && wd < 6) DX.push(iso(x)); }
  const ER = new Map(); for (const [d, rows] of X.earn.byDay) for (const [s, tm] of rows) { if (!M.SY.has(s)) continue; let k = K.firstOnOrAfter(DX, d); if (k >= DX.length) continue; if (tm !== 'bmo' && DX[k] === d) k++; (ER.get(s) || ER.set(s, []).get(s)).push(k); }
  for (const a of ER.values()) a.sort((x, y) => x - y);
  const FILE = new Map(); const fsess = (d) => K.firstOnOrAfter(D, nextDay(d));   // a filing counts from the session after its filing date
  const sumF = { k8: 0, f4: 0, dil: 0, d13: 0 };
  for (let i = 0; i < NS; i++) { const cik = X.meta.cikOf(SYMS[i]), a = cik ? X.edgar.byCik.get(+cik) : null; if (!a) continue; const o = { k8: [], f4: [], dil: [], d13: [] }; for (const [d, k] of a) { if (d < D[0] || d > D[T - 1]) continue; o[k].push(fsess(d)); sumF[k]++; } for (const k in o) o[k].sort((x, y) => x - y); FILE.set(i, o); }
  const lag = (+X.meta.SH.lagDays || 30) * 864e5, lim = D.map(d => iso(Date.parse(d + 'T00:00:00Z') - lag));
  for (let i = 0; i < NS; i++) { const p = px(i), F = K.featureSeries(p), b = i * T, er = ER.get(SYMS[i]) || [], fl = FILE.get(i), cik = X.meta.cikOf(SYMS[i]), sh = cik && X.meta.SH.c ? X.meta.SH.c[cik] : null; let q = -1;
    for (let t = 0; t < T; t++) { const c = p.c[t]; if (!(c > 0)) continue; R20[b + t] = F.r20[t]; VOL[b + t] = F.vol20[t]; DVM[b + t] = F.dvMed20[t];
      if (sh) { while (q + 1 < sh.length && sh[q + 1][0] <= lim[t]) q++; if (q >= 0 && sh[q][1] > 0) MC[b + t] = c * sh[q][1]; }
      const f = { c }; for (const k of K.FEATURES) f[k] = F[k][t];
      const ctx = { earnNext5: K.countIn(er, t + 1, t + 5) > 0, earnLast10: K.countIn(er, t - 9, t) > 0, k8: fl ? K.countIn(fl.k8, t - 9, t) : 0, dil: fl ? K.countIn(fl.dil, t - 29, t) : 0, d13: fl ? K.countIn(fl.d13, t - 29, t) : 0, f4: fl ? K.countIn(fl.f4, t - 9, t) : 0,
        sectorEx: NaN, mktUp: spyF ? spyF.d50[t] > 0 : false, mcap: MC[b + t] > 0 ? MC[b + t] : null };
      MASK[b + t] = K.flagMask(f, ctx); } }
  // industry 20-day move vs the S&P 500 (universe members, 5+ per industry), then the two industry bits
  const SIC2 = SYMS.map(s => X.meta.sic2(s)), HOT = 1 << K.FLAG_BIT.SECTOR_HOT, COLD = 1 << K.FLAG_BIT.SECTOR_COLD, SECX = new Float32Array(N).fill(NaN);
  const U = (i, t) => { const k = i * T + t; return K.inUniverse(C[k], DVM[k]); };
  for (let t = 20; t < T; t++) { const g = new Map(); for (let i = 0; i < NS; i++) { if (i === spyI || !SIC2[i] || !U(i, t) || !isFinite(R20[i * T + t])) continue; const a = g.get(SIC2[i]) || g.set(SIC2[i], []).get(SIC2[i]); a.push(R20[i * T + t]); }
    const sp = spyF ? spyF.r20[t] : NaN, m = new Map(); for (const [k, a] of g) if (a.length >= 5) m.set(k, mean(a) - sp);
    for (let i = 0; i < NS; i++) { const ex = SIC2[i] ? m.get(SIC2[i]) : undefined; if (ex === undefined || !isFinite(ex)) continue; const k = i * T + t; SECX[k] = ex; if (!(C[k] > 0)) continue; if (ex >= 0.05) MASK[k] |= HOT; if (ex <= -0.05) MASK[k] |= COLD; MASK[k] >>>= 0; } }
  return { R20, VOL, DVM, MC, MASK, SECX, SIC2, px, U, spyI, ER, FILE, sumF, DX };
}

// ================= discover =================
async function discover(M, X, B, frozenRules) {
  const { T, D, SYMS, C, NS } = M, from = T - 90, to = T - 1;
  const EP = []; let artifacts = 0;
  for (let i = 0; i < NS; i++) { if (i === B.spyI) continue; const p = B.px(i);
    for (const e of K.findEpisodes(p.c, from, to, (b) => B.U(i, b))) { const sd = M.splitDays.get(SYMS[i]) || []; if (sd.some(d => d >= D[e.b] && d <= D[Math.min(T - 1, e.e + 1)])) { artifacts++; continue; } EP.push({ i, ...e }); } }
  log('winners: ' + EP.length + ' episodes in ' + new Set(EP.map(e => e.i)).size + ' stocks (' + artifacts + ' dropped: a split inside the move)');
  const near = new Map(); for (const e of EP) (near.get(e.i) || near.set(e.i, []).get(e.i)).push(e.s);
  const vec = (i, t) => { const k = i * T + t; return { px: C[k], vol: B.VOL[k], mcap: B.MC[k] > 0 ? B.MC[k] : null, sec: B.SIC2[i] }; };
  const candMemo = new Map(), cands = (b) => { if (candMemo.has(b)) return candMemo.get(b); const a = []; for (let i = 0; i < NS; i++) if (i !== B.spyI && B.U(i, b) && isFinite(B.VOL[i * T + b])) a.push({ i, ...vec(i, b) }); candMemo.set(b, a); return a; };
  const ran = (j, e) => { const p = M.C, base = p[j * T + e.b]; for (let k = e.s; k <= Math.min(T - 1, e.s + 9); k++) if (p[j * T + k] >= base * 1.3) return true; return (near.get(j) || []).some(s => Math.abs(s - e.s) <= 10); };
  const rows = { win: [], ctrl: [] }, ctrlOf = [];
  for (const e of EP) { const w = { i: e.i, ...vec(e.i, e.b) }, cs = cands(e.b).filter(x => !ran(x.i, e)); const pk = K.pickControls(w, cs, 5); ctrlOf.push(pk);
    rows.win.push({ days: Array.from({ length: 10 }, (_, q) => B.MASK[e.i * T + e.b - 9 + q] || 0) });
    for (const c of pk) rows.ctrl.push({ days: Array.from({ length: 10 }, (_, q) => B.MASK[c.i * T + e.b - 9 + q] || 0), w: EP.length }); }
  const nW = rows.win.length, nC = rows.ctrl.length, sameSec = ctrlOf.flat().filter(c => c.sameSector).length;
  log('controls: ' + nC + ' (' + sameSec + ' same industry); median match distance ' + r4(median(ctrlOf.flat().map(c => c.dist))));
  // feature by feature
  const eveFeat = (i, t) => { const p = B.px(i), F = K.featureSeries(p), o = { c: p.c[t] }; for (const k of K.FEATURES) o[k] = F[k][t]; return o; };
  const featMemo = new Map(), FE = (i, t) => { const k = i * T + t; if (!featMemo.has(k)) featMemo.set(k, eveFeat(i, t)); return featMemo.get(k); };
  const flagTable = K.FLAGS.map(([n, txt], j) => { const bit = 1 << j, anyW = rows.win.filter(r => r.days.some(m => m & bit)).length, anyC = rows.ctrl.filter(r => r.days.some(m => m & bit)).length,
    eveW = rows.win.filter(r => r.days[9] & bit).length, eveC = rows.ctrl.filter(r => r.days[9] & bit).length;
    return { flag: n, text: txt, winners: anyW, controls: anyC, winnersPct: r4(anyW / nW), controlsPct: r4(anyC / nC), lift: r4((anyW / nW) / ((anyC + 0.5) / (nC + 1))), eveWinners: eveW, eveControls: eveC, eveWinnersPct: r4(eveW / nW), eveControlsPct: r4(eveC / nC) }; });
  const numTable = K.FEATURES.map(k => { const w = EP.map(e => FE(e.i, e.b)[k]), c = EP.flatMap((e, q) => ctrlOf[q].map(x => FE(x.i, e.b)[k])); return { feature: k, winnersMedian: r4(median(w)), controlsMedian: r4(median(c)), winnersKnown: w.filter(isFinite).length, controlsKnown: c.filter(isFinite).length }; });
  // combinations of up to 3 flags
  const need = Math.max(10, Math.ceil(nW * 0.03)), table = K.comboTable(rows.win, rows.ctrl, { maxK: 3, minW: need }), A = K.clearlyMoreOften(table, { minW: need });
  log('combinations with ' + need + '+ winners: ' + table.length + '; clearly more often before winners (a): ' + A.length);
  // (b) each (a) combination as a buy rule on the whole universe over the same 90 sessions
  const ninety = (mask) => { const res = {}; for (const kind of Object.keys(K.EXITS)) { const tr = []; for (let i = 0; i < NS; i++) { if (i === B.spyI) continue; const m = B.MASK.subarray(i * T, i * T + T);
        for (const z of K.ruleTrades(B.px(i), m, (t) => B.U(i, t), mask, kind, from - 10, T - 2)) if (!z.open) tr.push({ g: z.g, day: D[z.t], sym: SYMS[i] }); }
      res[kind] = K.boardStats(tr); } return res; };
  const tested = []; for (const r of A.slice(0, 150)) { if (outOfTime()) break; const n = ninety(r.mask); tested.push({ ...r, ninety: n, passB: Object.values(n).some(s => s.n >= 20 && s.avg > 0) }); }
  const chosen = [], contains = (a, b) => ((a & b) >>> 0) === b; for (const r of tested) { if (chosen.length >= 6) break; if (!r.passB) continue; if (chosen.some(c => contains(c.mask, r.mask) || contains(r.mask, c.mask))) continue; chosen.push({ ...r, fallback: false }); }
  if (chosen.length < 3) for (const r of tested) { if (chosen.length >= 3) break; if (chosen.some(c => c.mask === r.mask || contains(c.mask, r.mask) || contains(r.mask, c.mask))) continue; chosen.push({ ...r, fallback: true }); }
  log('candidates: ' + chosen.length + ' (' + chosen.filter(c => !c.fallback).length + ' passed both tests)');
  // SEC submissions: 8-K items on the 10 knowable sessions, winners vs controls (descriptive)
  const subsDir = WC + '/subs'; fs.mkdirSync(subsDir, { recursive: true }); const ciks = new Set(); for (const e of EP) { const c = X.meta.cikOf(SYMS[e.i]); if (c) ciks.add(+c); } for (const pk of ctrlOf) for (const c of pk) { const k = X.meta.cikOf(SYMS[c.i]); if (k) ciks.add(+k); }
  let subsGot = 0, subsFail = 0; const SUB = new Map(), since = D[Math.max(0, from - 15)];
  for (const cik of ciks) { const f = subsDir + '/' + cik + '.json'; let s = J(f, null);
    if ((!s || Date.now() - Date.parse(s.at) > 20 * 3600e3) && !outOfTime()) { const j = await sec(SECD + '/submissions/CIK' + String(cik).padStart(10, '0') + '.json'); if (j && j.filings && j.filings.recent) { const R = j.filings.recent, a = []; for (let q = 0; q < (R.form || []).length; q++) if (R.filingDate[q] >= since) a.push([R.form[q], R.filingDate[q], R.items ? R.items[q] || '' : '']); s = { at: new Date().toISOString(), sic: j.sic || null, f: a }; W(f, s); subsGot++; } else subsFail++; }
    if (s) SUB.set(cik, s); }
  const itemsOf = (i, e) => { const cik = X.meta.cikOf(SYMS[i]), s = cik ? SUB.get(+cik) : null; if (!s) return null; const a = D[e.b - 9 - 1] || D[0], b = D[e.b]; return s.f.filter(x => x[0] === '8-K' && x[1] >= a && x[1] < b).flatMap(x => String(x[2]).split(',').map(y => y.trim()).filter(Boolean)); };
  const itemTab = {}, cov = { win: 0, ctrl: 0 }; EP.forEach((e, q) => { const w = itemsOf(e.i, e); if (w) { cov.win++; for (const it of new Set(w)) (itemTab[it] = itemTab[it] || { w: 0, c: 0 }).w++; }
    for (const c of ctrlOf[q]) { const x = itemsOf(c.i, e); if (x) { cov.ctrl++; for (const it of new Set(x)) (itemTab[it] = itemTab[it] || { w: 0, c: 0 }).c++; } } });
  const ITEM = { '1.01': 'material agreement', '1.02': 'agreement ended', '2.01': 'acquisition / sale completed', '2.02': 'results', '2.03': 'new debt', '3.01': 'listing notice', '3.02': 'unregistered share sale', '3.03': 'holder rights changed', '5.02': 'officer / director change', '5.03': 'charter / bylaws', '5.07': 'shareholder vote', '7.01': 'Regulation FD (news / presentation)', '8.01': 'other events (news)', '9.01': 'exhibits', '4.01': 'auditor change', '2.05': 'restructuring costs', '2.06': 'impairment', '1.05': 'cyber incident', '5.01': 'change of control' };
  const items = Object.entries(itemTab).map(([k, v]) => ({ item: k, what: ITEM[k] || '', winners: v.w, controls: v.c, winnersPct: r4(v.w / Math.max(1, cov.win)), controlsPct: r4(v.c / Math.max(1, cov.ctrl)) })).sort((a, b) => b.winners - a.winners);
  // insider purchases (SEC Form 4 data sets, quarterly; read only, descriptive) in the 30 sessions before the start
  let insNote = 'study-cache/insider not available in this run'; const INS = new Map(); try { let last = ''; for (const f of fs.readdirSync('study-cache/insider').filter(f => f.endsWith('.json'))) for (const r of J('study-cache/insider/' + f, [])) { const d = String(r[1]).slice(0, 10); if (d > last) last = d; (INS.get(r[0]) || INS.set(r[0], []).get(r[0])).push(d); } insNote = 'insider purchase filings known up to ' + last; } catch (e) {}
  const insBuy = (i, e) => (INS.get(SYMS[i]) || []).some(d => d >= (D[e.b - 29] || D[0]) && d < D[e.b]);
  const insider = { note: insNote, winners: EP.filter(e => insBuy(e.i, e)).length, controls: EP.reduce((a, e, q) => a + ctrlOf[q].filter(c => insBuy(c.i, e)).length, 0), nW, nC };
  // realistic entry and what was left, for every winner
  const sigRules = frozenRules && frozenRules.length ? frozenRules : chosen;
  const firstSig = (e) => { for (let q = 0; q < 10; q++) { const t = e.b - 9 + q; for (const c of sigRules) if (K.has(B.MASK[e.i * T + t], c.mask) && !K.has(B.MASK[e.i * T + t - 1], c.mask)) return { t, rule: c }; } return null; };
  const W1 = EP.map((e, q) => { const p = B.px(e.i), fs0 = firstSig(e), re = K.realisticEntry(p, e, fs0 ? fs0.t : null), m = re.momentum;
    return { sym: SYMS[e.i], start: D[e.s], base: D[e.b], peak: D[e.peakT], firstHitSessions: e.firstHit, gain: r4(e.gain), baseClose: r4(C[e.i * T + e.b]), dollarVol: Math.round(B.DVM[e.i * T + e.b]), mcap: B.MC[e.i * T + e.b] > 0 ? Math.round(B.MC[e.i * T + e.b]) : null, sic2: B.SIC2[e.i],
      momentum: m ? { signal: D[m.signalT], buy: m.te < T ? D[m.te] : 'after the data', entry: r4(m.entry), left: r4(m.left), atEnd: r4(m.atEnd) } : null, catchable: !!(m && m.left >= 0.15),
      precursor: fs0 ? { rule: fs0.rule.id || fs0.rule.flags.join('+'), signal: D[fs0.t], entry: r4(re.precursor.entry), left: r4(re.precursor.left), atEnd: r4(re.precursor.atEnd) } : null, _q: q, _e: e }; });
  return { EP, W1, ctrlOf, rows, nW, nC, sameSec, flagTable, numTable, table, A, tested, chosen, items, itemCov: cov, subs: { ciks: ciks.size, got: subsGot, failed: subsFail }, insider, FE, artifacts };
}

// ================= 5-year test of the registered rules =================
function fiveYear(M, B, reg, cutDate) {
  const { T, D, NS, SYMS, C, O } = M, tCut = K.firstOnOrAfter(D, cutDate), SPLIT = K.firstOnOrAfter(D, '2024-01-01'), start = 252, RES = {}, TR = {};
  const cMemo = new Map(), avgStock = (t, te, x) => { const key = te * 4096 + x; if (cMemo.has(key)) return cMemo.get(key); const v = []; for (let j = 0; j < NS; j += 3) { if (j === B.spyI || !B.U(j, t)) continue; const e = O[j * T + te]; let z = C[j * T + x]; for (let k = x; !(z > 0) && k > te; k--) z = C[j * T + k]; if (e > 0 && z > 0 && Math.abs(z / e - 1) < 3) v.push(z / e - 1); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
  for (const r of reg) for (const kind of Object.keys(K.EXITS)) { const id = r.id + '/' + kind, X = K.EXITS[kind], to = tCut - 10 - X.max - 1, trades = []; let sigs = 0;
    for (let i = 0; i < NS; i++) { if (i === B.spyI) continue; const m = B.MASK.subarray(i * T, i * T + T), px = B.px(i), tr = K.ruleTrades(px, m, (t) => B.U(i, t), r.mask >>> 0, kind, start, to).filter(z => !z.open); if (!tr.length) continue; sigs += tr.length;
      const sig = tr.map(z => z.t), own = {}; for (const half of [0, 1]) { const v = []; for (let u = half ? SPLIT : start; u < (half ? to : SPLIT); u += 5) { if (!B.U(i, u) || sig.some(s => Math.abs(s - u) <= 10)) continue; const w = K.walkExit(px, u + 1, kind); if (w && !w.open && Math.abs(w.g) < 3) v.push(w.g); } own[half] = v.length >= 3 ? mean(v) : null; }
      for (const z of tr) { const c = avgStock(z.t, z.te, z.x); if (c === null) continue; trades.push({ t: z.t, s: SYMS[i], g: z.g, c, own: own[z.t < SPLIT ? 0 : 1], h: X.max, half: z.t < SPLIT ? 'older' : 'newer', why: z.why, x: z.x }); } }
    const R = { older: halfStat(trades.filter(z => z.half === 'older'), X.max), newer: halfStat(trades.filter(z => z.half === 'newer'), X.max) };
    const extra = (h) => { const a = trades.filter(z => z.half === h), net = a.map(z => z.g - K.COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), s = (q) => q.reduce((x, y) => x + y, 0); return { pf: l.length && s(l) < 0 ? r4(s(w) / -s(l)) : null, avgWin: r4(mean(w)), avgLoss: r4(mean(l)), stops: a.filter(z => z.why !== 'time').length }; };
    RES[id] = { rule: r.id, exit: kind, ...judge(R, { bar: BAR }), results: R, extra: { older: extra('older'), newer: extra('newer') }, window: [D[start], D[Math.min(to, T - 1)]], split: '2024-01-01', cut: cutDate };
    TR[id] = trades.map(z => ({ s: z.s, d: D[z.t], net: r4(z.g - K.COST), avgStock: r4(z.c - K.COST), sameStock: r4(z.own === null ? null : z.own - K.COST), why: z.why }));
    log('5y ' + id + ': ' + RES[id].verdict + ' | older ' + (R.older.n || 0) + ' avg ' + pc(R.older.avg) + ' edge ' + pc(R.older.edge) + ' | newer ' + (R.newer.n || 0) + ' avg ' + pc(R.newer.avg) + ' edge ' + pc(R.newer.edge)); }
  return { RES, TR };
}

// ================= paper =================
function paper(M, B, reg) {
  const { T, D, SYMS, SY } = M, today = iso(Date.now()), lines = fs.existsSync(PAPER) ? fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean) : [];
  const HAL = J('data/halal.json', {}), zbad = new Set((J('data/zad-list.json', {}).notHalal) || []), halal = (s) => zbad.has(s) || (HAL[s] && HAL[s].s === 'fail') ? 'not halal (ZAD)' : HAL[s] && HAL[s].s === 'ok' ? 'ok' : 'unknown';
  const BPREV = J(BOARD, {}) || {}; let lastScanned = BPREV.lastScanned || null; const added = [];
  const keyOf = (z) => z.id + '|' + z.sym + '|' + z.signal, have = new Set(lines.map(keyOf));
  // scan every session after the last one scanned (the first run scans only the latest close: the record starts from the next session)
  const fromT = lastScanned ? K.firstOnOrAfter(D, nextDay(lastScanned)) : T - 1;
  for (let t = Math.max(1, fromT); t < T; t++) for (const r of reg) for (const kind of Object.keys(K.EXITS)) { const id = r.id + '/' + kind, mask = r.mask >>> 0;
    for (let i = 0; i < M.NS; i++) { if (i === B.spyI || !B.U(i, t)) continue; const m = B.MASK[i * T + t], m0 = B.MASK[i * T + t - 1]; if (!K.has(m, mask) || K.has(m0, mask)) continue;
      const sym = SYMS[i]; if (lines.some(z => z.id === id && z.sym === sym && (z.status === 'open' || z.status === 'pending'))) continue;
      const z = { id, rule: r.id, exit: kind, sym, signal: D[t], detected: today, close: r4(M.C[i * T + t]), halal: halal(sym), status: 'pending' }; if (have.has(keyOf(z))) continue; have.add(keyOf(z)); lines.push(z); added.push(z); } }
  if (T) lastScanned = D[T - 1];
  // resolve: entry = the first open AFTER the later of the signal day and the day it was detected
  for (const z of lines) { if (z.status === 'closed' || z.status === 'void') continue; const i = SY.get(z.sym), te = K.firstOnOrAfter(D, nextDay(z.detected > z.signal ? z.detected : z.signal));
    if (i === undefined) { if (Date.now() - Date.parse(z.signal) > 30 * 864e5) { z.status = 'void'; z.why = 'no prices after the signal'; } continue; }
    if (te >= T) { z.status = 'pending'; continue; } const px = B.px(i), w = K.walkExit(px, te, z.exit);
    if (!w) { if (T - te > 10) { z.status = 'void'; z.why = 'no opening price on the entry day'; } continue; }
    z.entryDate = D[te]; z.entry = r4(px.o[te]);
    if (w.open) { z.status = 'open'; z.stopNow = r4(w.stop); z.held = w.held; continue; }
    z.status = 'closed'; z.exitDate = D[w.x]; z.g = r4(w.g); z.net = r4(w.g - K.COST); z.why = w.why; delete z.stopNow; delete z.held; }
  fs.writeFileSync(PAPER, lines.map(z => JSON.stringify(z)).join('\n') + (lines.length ? '\n' : ''));
  const rules = {}; for (const r of reg) for (const kind of Object.keys(K.EXITS)) { const id = r.id + '/' + kind, a = lines.filter(z => z.id === id), cl = a.filter(z => z.status === 'closed').map(z => ({ g: z.g, day: z.signal, sym: z.sym }));
    const clH = a.filter(z => z.status === 'closed' && z.halal !== 'not halal (ZAD)').map(z => ({ g: z.g, day: z.signal, sym: z.sym })), st = K.boardStats(cl);
    rules[id] = { rule: r.id, exit: kind, flags: r.flags, fallback: !!r.fallback, fiveYear: (PREV.firstRun && PREV.firstRun[id] && PREV.firstRun[id].verdict) || null, ...st, open: a.filter(z => z.status === 'open').length, pending: a.filter(z => z.status === 'pending').length,
      firstSignal: a.length ? a.map(z => z.signal).sort()[0] : null, excludingNotHalal: K.boardStats(clH),
      status: st.ready ? 'READY FOR A SMALL REAL TEST (30+ paper trades on 10+ days, positive after 0.8% cost) - the owner decides' : 'RECORDING (needs 30+ closed paper trades on 10+ distinct days and a positive average after 0.8% cost)' }; }
  W(BOARD, { generatedAt: new Date().toISOString(), lastScanned, lastClose: D[T - 1], cost: K.COST, note: 'Forward PAPER record of the WIN- rules (winner autopsy). Entry = the first open after the day the signal was detected; exits as registered (S8T10: 8% stop, sell the 10th close; TRAIL: 8% stop rising to 10% under the highest close, 20 sessions max). Not orders. Halal: ZAD status is tagged on each signal; a real buy needs a halal stock.', rules }, true);
  log('paper: ' + added.length + ' new signals, ' + lines.filter(z => z.status === 'open').length + ' open, ' + lines.filter(z => z.status === 'closed').length + ' closed');
  return { added: added.length, rules };
}

// ================= main =================
const ruleText = (flags) => flags.map(n => K.FLAGS[K.FLAG_BIT[n]][1]).join(' AND ');
(async () => {
  const want = MODE === 'paper' ? 330 : 1300, keep = MODE === 'paper' ? 330 : null;
  const M = await load({ want, keep });
  if (M.T < (MODE === 'paper' ? 260 : 600)) { log('too few sessions (' + M.T + '): nothing done'); W(OUT, { ...PREV, lastAttempt: { at: new Date().toISOString(), mode: MODE, why: 'only ' + M.T + ' sessions of prices' } }, true); return; }
  // which symbols need industry / CIK: everything in the universe at some session (plus all, for small runs)
  const DVM0 = new Map(); { for (let i = 0; i < M.NS; i++) { const b = i * M.T; let any = false; for (let t = 20; t < M.T && !any; t += 5) { const c = M.C[b + t]; if (!(c >= 1)) continue; let n = 0; for (let k = t - 19; k <= t; k++) if (M.C[b + k] * M.V[b + k] >= 2e6) n++; if (n >= 10) any = true; } if (any) DVM0.set(M.SYMS[i], 1); } }
  const metaM = await meta(M, [...DVM0.keys()], MODE === 'paper' ? 300 : 12000); log('industry codes: ' + metaM.got + ' fetched now (' + metaM.asked + ' asked) for ' + DVM0.size + ' universe stocks');
  const edgar = await edgarIndex(M.D[0]); log('EDGAR full index: ' + edgar.quarters + ' quarters (' + edgar.got + ' fetched now, ' + edgar.failed + ' failed), ' + edgar.byCik.size + ' companies');
  const earn = await earningsDays(iso(Date.parse(M.D[0]) - 15 * 864e5), iso(Date.now() + 10 * 864e5)); log('Nasdaq earnings calendar: ' + earn.byDay.size + ' days (' + earn.fetched + ' fetched now, ' + earn.fallback + ' from a-cache, ' + earn.missing + ' missing)');
  const X = { meta: metaM, edgar, earn }, B = buildFlags(M, X); log('flags built');
  const uniStocks = (t) => { let n = 0; for (let i = 0; i < M.NS; i++) if (B.U(i, t)) n++; return n; };
  const coverage = { sessions: M.T, from: M.D[0], to: M.D[M.T - 1], stocks: M.NS, universeToday: uniStocks(M.T - 1), universeSic: (() => { let a = 0, b = 0; for (const s of DVM0.keys()) { a++; if (metaM.sic2(s)) b++; } return b + '/' + a; })(),
    universeCik: (() => { let a = 0, b = 0; for (const s of DVM0.keys()) { a++; if (metaM.cikOf(s)) b++; } return b + '/' + a; })(), refComplete: M.up.refComplete, refTickers: M.up.refSyms, planLimit: M.up.refused, splits: M.splits,
    edgarQuarters: edgar.quarters, edgarFailed: edgar.failed, filingsInWindow: B.sumF, earningsDays: earn.byDay.size, earningsMissingDays: earn.missing, earningsFromACache: earn.fallback, massiveCalls: mCalls };
  const sourcesComplete = M.up.refComplete && edgar.failed === 0 && earn.missing <= 30 && M.T >= 1000;
  let out = { ...PREV, generatedAt: new Date().toISOString(), [MODE === 'discover' ? 'coverage' : MODE + 'Coverage']: coverage };

  if (MODE === 'discover') {
    const frozen = Array.isArray(PREV.registered) && PREV.registered.length > 0, R = await discover(M, X, B, frozen ? PREV.registered.map(r => ({ ...r, mask: K.maskOf(r.flags) })) : null), nW = R.nW;
    const catchable = R.W1.filter(w => w.catchable).length, withMom = R.W1.filter(w => w.momentum && w.momentum.entry).length;
    let registered = PREV.registered || [];
    if (!frozen) { registered = R.chosen.map((c, k) => ({ id: 'WIN-' + String(k + 1).padStart(3, '0'), flags: c.flags, mask: c.mask >>> 0, text: ruleText(c.flags), exits: Object.keys(K.EXITS), fallback: c.fallback,
      autopsy: { winners: c.w, controls: c.c, nWinners: c.nW, nControls: c.nC, winnersPct: c.pw, controlsPct: c.pc, lift: c.lift, z: c.z }, ninetyDays: c.ninety }));
      out.registeredAt = new Date().toISOString(); out.autopsyWindow = { from: M.D[M.T - 90], to: M.D[M.T - 1], knowableFrom: M.D[M.T - 100] }; }
    for (const w of R.W1) if (w.precursor) { const c = registered.find(r => r.flags.join('+') === w.precursor.rule); if (c) w.precursor.rule = c.id; }
    // 10 worked examples: the most traded winners, 5 that were catchable and 5 that were not
    const byDv = [...R.W1].sort((a, b) => b.dollarVol - a.dollarVol), ex = [...byDv.filter(w => w.catchable).slice(0, 5), ...byDv.filter(w => !w.catchable).slice(0, 5)];
    const examples = ex.map(w => { const e = w._e, i = e.i, f = R.FE(i, e.b), ctrl = R.ctrlOf[w._q].map(c => M.SYMS[c.i]);
      const on = (t) => K.namesOf(B.MASK[i * M.T + t]), any = new Set(); for (let t = e.b - 9; t <= e.b; t++) for (const n of on(t)) any.add(n);
      const er = (B.ER.get(w.sym) || []).filter(k => k >= e.b - 9 && k <= e.s + 9).map(k => B.DX[k]), fl = B.FILE.get(i), fdays = (k) => fl ? fl[k].filter(s => s >= e.b - 29 && s <= e.b).map(s => M.D[s]) : [];
      const cik = metaM.cikOf(w.sym), sub = cik ? J(WC + '/subs/' + cik + '.json', null) : null, k8 = sub ? sub.f.filter(x => x[0] === '8-K' && x[1] >= M.D[e.b - 10] && x[1] <= M.D[Math.min(M.T - 1, e.s + 9)]).map(x => x[1] + ' items ' + x[2]) : null;
      return { ...Object.fromEntries(Object.entries(w).filter(([k]) => !k.startsWith('_'))), eve: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, r4(v)])), flagsOnEve: on(e.b), flagsOnAnyOf10: [...any], earningsReports: er, filings30: { '8-K': fdays('k8'), 'Form 4': fdays('f4'), dilution: fdays('dil'), '13D': fdays('d13') }, eightK: k8, sectorVsSpy20d: r4(B.SECX[i * M.T + e.b]), controls: ctrl }; });
    out.autopsy = { at: new Date().toISOString(), window: { from: M.D[M.T - 90], to: M.D[M.T - 1] }, definition: 'close 30%+ above the lowest close of the 10 sessions before it; start = the session after that close; universe at the base close: price >= 1 USD, median 20-day dollar volume >= 2M USD; one episode per stock per 10 sessions; moves with a split inside dropped',
      winners: nW, stocks: new Set(R.W1.map(w => w.sym)).size, droppedSplitArtifacts: R.artifacts, catchable, withMomentumEntry: withMom, catchableRule: 'still 15%+ from the next open after the first close 10%+ above the base, to the best close of the 10-session window',
      leftMedian: r4(median(R.W1.filter(w => w.momentum && w.momentum.left !== null).map(w => w.momentum.left))), atEndMedian: r4(median(R.W1.filter(w => w.momentum && w.momentum.atEnd !== null).map(w => w.momentum.atEnd))),
      gainMedian: r4(median(R.W1.map(w => w.gain))), firstHitSessions: Object.fromEntries([1, 2, 3, 5, 10].map(n => ['<=' + n, R.W1.filter(w => w.firstHitSessions <= n).length])),
      controls: R.nC, controlsSameIndustry: R.sameSec, flagTable: R.flagTable, numericMedians: R.numTable, eightKItems: { coverage: R.itemCov, items: R.items }, insider: R.insider, submissions: R.subs,
      combos: { minWinners: Math.max(10, Math.ceil(nW * 0.03)), counted: R.table.length, clearlyMoreOften: R.A.length, top: R.A.slice(0, 40).map(r => ({ flags: r.flags, winners: r.w, controls: r.c, winnersPct: r.pw, controlsPct: r.pc, lift: r.lift, z: r.z })),
        ninetyDayRuleTests: R.tested.map(r => ({ flags: r.flags, winners: r.w, controls: r.c, lift: r.lift, z: r.z, passB: r.passB, S8T10: r.ninety.S8T10, TRAIL: r.ninety.TRAIL })) },
      candidates: R.chosen.map(c => ({ flags: c.flags, fallback: c.fallback })), registeredNow: !frozen,
      precursorFired: R.W1.filter(w => w.precursor).length, precursorCatchable: R.W1.filter(w => w.precursor && w.precursor.left >= 0.15).length,
      examples, allWinners: R.W1.map(w => ({ sym: w.sym, start: w.start, gain: w.gain, catchable: w.catchable, left: w.momentum ? w.momentum.left : null, precursor: w.precursor ? w.precursor.rule : null })) };
    out.registered = registered;
    W(OUT, out, true);
    // library: pre-register (only on the first discovery; later runs never change the registered rules)
    if (!frozen && registered.length) { const LB = J(LIB, null); if (LB && Array.isArray(LB.strategies)) { for (const r of registered) { if (LB.strategies.some(x => x.id === r.id)) continue;
          LB.strategies.push({ id: r.id, family: 'Winner autopsy', name: 'Winner precursor: ' + r.flags.join(' + ').toLowerCase().replace(/_/g, ' '), agent: 'WIN', status: 'pre-registered',
            explain: 'Buy at the next open after this combination appears (fresh: on at the close, off the close before) on a stock with price >= 1 USD and median 20-day dollar volume >= 2M USD: ' + r.text + '. Two exits fixed before any result: S8T10 = 8% stop, else sell the close of the 10th session; TRAIL = 8% stop rising to 10% under the highest close, 20 sessions max.',
            built: 'Registered ' + out.registeredAt + ' by winners-autopsy-lab.mjs BEFORE any 5-year run, from the winner autopsy of ' + out.autopsyWindow.from + '..' + out.autopsyWindow.to + ': ' + r.autopsy.winners + ' of ' + r.autopsy.nWinners + ' winners vs ' + r.autopsy.controls + ' of ' + r.autopsy.nControls + ' matched controls (lift ' + r.autopsy.lift + ', z ' + r.autopsy.z + ').' + (r.fallback ? ' FALLBACK: it did NOT make money as a 90-day buy rule; registered only because fewer than 3 combinations passed both tests.' : ' 90-day buy rule on the whole universe: S8T10 ' + (r.ninetyDays.S8T10.n || 0) + ' trades avg ' + pc(r.ninetyDays.S8T10.avg) + ', TRAIL ' + (r.ninetyDays.TRAIL.n || 0) + ' trades avg ' + pc(r.ninetyDays.TRAIL.avg) + ' after 0.8%.') + ' 5-year test: halves 2021-23 / 2024-26 (split 2024-01-01), signals end before the autopsy window, tier-2 standard of value-core.mjs (0.8% and 1.2% cost, vs the average stock, vs the same stock on other days, without the 2 best, block t). Forward paper record from the next session: data/winners-paper.jsonl, data/winners-board.json.',
            note: 'Run once as written; the first 5-year verdict of each exit is frozen in data/winners-autopsy.json firstRun.', registered: out.registeredAt, flags: r.flags }); }
        W(LIB, LB, true); log('library: ' + registered.length + ' WIN- rules pre-registered'); } }
    log('AUTOPSY: ' + nW + ' winners, ' + catchable + ' catchable; ' + registered.length + ' rules registered' + (frozen ? ' earlier (frozen)' : ' now'));
    for (const r of registered) log('  ' + r.id + (r.fallback ? ' [FALLBACK]' : '') + ': ' + r.flags.join(' + ') + ' | winners ' + r.autopsy.winners + '/' + r.autopsy.nWinners + ' vs controls ' + r.autopsy.controls + '/' + r.autopsy.nControls + ' lift ' + r.autopsy.lift + ' z ' + r.autopsy.z);
    return;
  }

  const reg = (PREV.registered || []).map(r => ({ ...r, mask: K.maskOf(r.flags) }));
  if (MODE === 'test') {
    if (!reg.length || !PREV.autopsyWindow) { log('test: no registered rules'); return; }
    const { RES, TR } = fiveYear(M, B, reg, PREV.autopsyWindow.knowableFrom);
    const isJudged = () => sourcesComplete;
    out.firstRun = freezeEach(PREV.firstRun, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), bar: BAR, ...r }])), isJudged);
    out.latest = latestBlock({ at: new Date().toISOString(), results: RES }); out.trades5y = Object.fromEntries(Object.entries(TR).map(([k, a]) => [k, { n: a.length, note: 'the 150 most recent trades only (the verdict uses all)', recent: a.slice().sort((x, y) => x.d < y.d ? 1 : -1).slice(0, 150) }])); out.sourcesComplete = sourcesComplete; out.bar = BAR;
    out.standard = 'both halves (2021-23 / 2024-26): > 0 after 0.8% and 1.2% cost, edge over the average universe stock (same open, same close) > 0, better than the same stock on its other days, > 0 without the 2 best, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN';
    W(OUT, out, true);
    if (!sourcesComplete) log('test: sources incomplete (' + JSON.stringify(coverage) + '): nothing frozen');
    try { const LB = J(LIB, null); let ch = false; for (const r of reg) { const e = LB.strategies.find(x => x.id === r.id), ks = Object.keys(K.EXITS).map(k => r.id + '/' + k).filter(k => out.firstRun[k]); if (!e || !ks.length || /^tested/.test(e.status || '')) continue;
        const v = ks.map(k => out.firstRun[k].verdict), best = v.includes('PROVEN') ? 'proven' : v.includes('TRADABLE SMALL') ? 'tradable small' : v.includes('NOT PROVEN') ? 'not proven' : v.every(x => x === 'TOO FEW CASES') ? 'too few cases' : 'rejected';
        e.status = 'tested: ' + best; e.tested = out.firstRun[ks[0]].at.slice(0, 10); e.study = 'winners-autopsy-lab.mjs -> data/winners-autopsy.json (run once as written, first verdict frozen)';
        e.result = Object.fromEntries(ks.map(k => { const f = out.firstRun[k], R = f.results; return [k.split('/')[1], { verdict: f.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], why: f.why }]; })); ch = true; }
      if (ch) W(LIB, LB, true); } catch (e) { log('library not updated: ' + e.message); }
    return;
  }
  if (MODE === 'paper') { if (!reg.length) { log('paper: no registered rules yet'); return; } const P = paper(M, B, reg); out.paper = { at: new Date().toISOString(), added: P.added }; W(OUT, out, true); return; }
  log('unknown MODE ' + MODE);
})().catch(e => { console.error('winners-autopsy-lab failed: ' + (e && e.stack || e)); process.exit(1); });
