// SQUAD 19 LAB (25 Oct 2026): "the same-day jump" - under-5 USD stocks that jump 40% to 100%+ in one day. Rules and conventions:
// squad19-core.mjs header. Never places an order. Keys only from the environment (MASSIVE_KEY, ALPACA_KEY / ALPACA_SECRET, SEC_UA);
// never printed.
// MODES (argv[2]):
//   plan    raw (unadjusted) whole-market daily bars from Massive (grouped, cached per day in sq19-daily/), splits -> every stock-day from
//           2024-01-02 with a prior close of 0.10-5 USD and a daily high 8%+ over it (+ its pre-day facts and next 5 closes)
//           -> sq19-work/plan.json.gz. PAPER=1: only the sessions from PAPER_START not yet in data/squad19-paper.jsonl.
//   shard   SHARD=i of SHARDS=n: Massive ticker details (type, CIK, shares outstanding as of the date), short interest, Alpaca SIP
//           1-minute bars 04:00-15:59 (raw), Alpaca historical news; facts + every base trigger x exit + matched control
//           -> sq19-work/shard-i.json.gz (no bars kept)
//   sec     SEC EDGAR submissions of every CIK in the shards (acceptance times) -> sq19-work/sec.json.gz
//   report  STAGE 1 case study (all months) + trigger precision table (OLDER part only) -> data/squad19-lab.json caseStudy
//   judge   STAGE 2: the pre-registered RULES once on both parts, first complete verdict frozen (firstRun) in data/squad19-lab.json
//   paper   forward paper record of the RULES (data/squad19-paper.jsonl, squad19-today.json, squad19-board.json)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { nyOffset } from './ignition-core.mjs';
import { freezeEach } from './first-run.mjs';
import { VERSION, SLIP, STRESS, SPLIT_HALF, START, HIST_FROM, MIN_PREV, MAX_PREV, FETCH_UP, OPEN, EXITS, EXIT_IDS, BASE, BASE_IDS, FILTERS, FILTER_IDS, OK_TYPES,
  r4, mean, median, halfOf, commonLike, toNy, dayFacts, trade, after, cumVol, pxAt, classifyNews, secClass, summarize, verdict, RULES, RULE_IDS, ruleTrades, preRegister,
  D_SPLIT, D_FROM, D_SIGNALS, D_COST, D_STRESS, D_SLIP, D_SLIP3, FDA_PHRASES, TOPLINE_PHRASES, DAILY_RULES, DAILY_IDS, SKIPPED_OWNER, dv20, holdTrade, jumpTrade, legsNet, legsGross,
  sigJump, sigReverse, sigEpsLow, sigCat, dSummary, dVerdict, preRegisterDaily } from './squad19-core.mjs';
const env = process.env, MODE = process.argv[2] || 'report', t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const WZ = (f, x) => fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(x))), sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const AD = local(env.ALPACA_DATA_BASE) || 'https://data.alpaca.markets', MV = local(env.MASSIVE_BASE) || 'https://api.massive.com', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const WORK = 'sq19-work', DDIR = 'sq19-daily', LAB = 'data/squad19-lab.json', PAPER = 'data/squad19-paper.jsonl', TODAY = 'data/squad19-today.json', BOARD = 'data/squad19-board.json', LIB = 'data/strategy-library.json';
const PAPER_START = '2026-10-26';
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(DDIR, { recursive: true });
const nyMs = (day, min) => Date.parse(day + 'T00:00:00Z') + (min - nyOffset(day)) * 60000;
const relMin = (day, ms) => Math.floor((ms - nyMs(day, 0)) / 60000);

// ---------- network ----------
const calls = { alp: 0, mv: 0, sec: 0, fail: {} }, fail = (k) => { calls.fail[k] = (calls.fail[k] || 0) + 1; };
const AH = { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' };
async function alp(path) { if (!env.ALPACA_KEY) return null;
  for (let a = 0; a < 6; a++) { calls.alp++; let r; try { r = await fetch(AD + path, { headers: AH, signal: AbortSignal.timeout(120000) }); } catch (e) { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 429) { await sleep(3000 * (a + 1)); continue; } if (r.status === 401 || r.status === 403) { fail('alpaca ' + r.status); return { refused: r.status }; }
    if (!r.ok) { if (r.status === 400 || r.status === 422 || r.status === 404) { fail('alpaca ' + r.status); return { bad: r.status }; } await sleep(2000 * (a + 1)); continue; }
    return await r.json().catch(() => null); } fail('alpaca gave up'); return null; }
let mvGap = 0;
async function mv(path) { if (!env.MASSIVE_KEY) return null; const url = (path.startsWith('http') ? path : MV + path);
  for (let a = 0; a < 5; a++) { const w = mvGap - Date.now(); if (w > 0) await sleep(w); mvGap = Date.now() + (local(env.MASSIVE_BASE) ? 0 : 60); calls.mv++; let r;
    try { r = await fetch(url + (url.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(15000 * (a + 1)); continue; } if (r.status === 404) return { notFound: true }; if (r.status === 401 || r.status === 403) { fail('massive ' + r.status); return { refused: r.status }; }
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } fail('massive gave up'); return null; }
let secGap = 0;
async function sec(path) { for (let a = 0; a < 5; a++) { const w = secGap - Date.now(); if (w > 0) await sleep(w); secGap = Date.now() + (local(env.SEC_BASE) ? 0 : 130); calls.sec++; let r;
    try { r = await fetch(SECD + path, { headers: { 'User-Agent': env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com', 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 404) return { notFound: true }; if (r.status === 429 || r.status === 403) { await sleep(10000 * (a + 1)); continue; } if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } fail('sec gave up'); return null; }

// ---------- PLAN ----------
async function grouped(d) { const f = DDIR + '/' + d + '.json.gz'; const c = JZ(f, null); if (c) return c;
  const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=false'); if (!j || j.refused) return null;
  const rows = (j.results || []).filter(x => x && commonLike(x.T || '') && x.c > 0 && x.v > 0);
  const out = { T: rows.map(x => x.T), o: rows.map(x => +x.o), h: rows.map(x => +x.h), l: rows.map(x => +x.l), c: rows.map(x => +x.c), v: rows.map(x => Math.round(+x.v)) };
  if (rows.length > 2000 && d < iso(Date.now())) WZ(f, out); return rows.length ? out : { T: [] }; }
async function loadSplits() { const by = new Map(), add = (s, d, r) => { if (!s || !d || !(r > 0) || Math.abs(r - 1) < 1e-9) return; const a = by.get(s) || by.set(s, []).get(s); if (!a.some(x => x.d === d)) a.push({ d, r }); };
  for (const x of (J('data/splits.json', {}).splits || [])) add(x.s, x.d, +x.r);
  let url = '/v3/reference/splits?execution_date.gte=' + HIST_FROM + '&limit=1000&order=asc&sort=execution_date', pages = 0, got = 0;
  while (url && pages < 60) { const j = await mv(url); if (!j || j.refused || j.notFound) break; pages++;
    for (const x of j.results || []) { got++; add(String(x.ticker || '').toUpperCase(), String(x.execution_date || ''), +x.split_to / +x.split_from); }
    url = j.next_url || null; }
  log('splits: ' + [...by.values()].reduce((s, a) => s + a.length, 0) + ' (Massive pages ' + pages + ', rows ' + got + ')'); for (const a of by.values()) a.sort((x, y) => x.d < y.d ? -1 : 1); return by; }
async function plan() {
  const paper = env.PAPER === '1', today = env.SQ19_TODAY || iso(Date.now()), from = paper ? iso(Date.now() - 200 * 864e5) : (env.SQ19_FROM || D_FROM);   // the daily-bar rules need raw bars from 2021
  const days = []; for (let ms = Date.parse(from + 'T12:00:00Z'); iso(ms) < today; ms += 864e5) { const wd = new Date(ms).getUTCDay(); if (wd && wd < 6) days.push(iso(ms)); }
  const splits = await loadSplits(), D = [], data = [];
  for (const d of days) { const g = await grouped(d); if (!g) { log('grouped ' + d + ' FAILED'); continue; } if (g.T.length < 2000) continue; D.push(d); data.push(g); }
  log('market days ' + D.length + ' (' + D[0] + ' .. ' + D[D.length - 1] + '), Massive calls ' + calls.mv);
  let first = env.SQ19_START || START; if (paper) { const done = new Set(fs.existsSync(PAPER) ? fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l).d; } catch (e) { return null; } }) : []); first = D.find(d => d >= PAPER_START && !done.has(d)) || '9999'; }
  // per-symbol rolling history in today's share units: [t, o, h, l, c, v, u40]
  const H = new Map(), cand = {}, universe = {}, closeAt = D.map(() => null);
  const splitOn = (s, d) => (splits.get(s) || []).find(x => x.d === d);
  for (let t = 0; t < D.length; t++) { const d = D[t], g = data[t], cm = new Map(); closeAt[t] = cm; let n5 = 0, n5l = 0, up40 = 0, up100 = 0; const list = [];
    for (let j = 0; j < g.T.length; j++) { const s = g.T[j], o = g.o[j], h = g.h[j], l = g.l[j], c = g.c[j], v = g.v[j]; cm.set(s, c);
      let hist = H.get(s); if (!hist) { hist = []; H.set(s, hist); }
      const sp = splitOn(s, d); if (sp) for (const x of hist) { x[1] /= sp.r; x[2] /= sp.r; x[3] /= sp.r; x[4] /= sp.r; x[5] *= sp.r; }
      const prev = hist.length ? hist[hist.length - 1] : null, contiguous = prev && prev[0] === t - 1, pc = prev ? prev[4] : null;
      if (d >= first && contiguous && pc >= MIN_PREV && pc < MAX_PREV) { n5++; if (c * v >= 1e6) n5l++; if (h >= pc * 1.4) up40++; if (h >= pc * 2) up100++;
        if (!sp && h >= pc * (1 + FETCH_UP)) { const last20 = hist.slice(-20), vols = last20.map(x => x[5]);
          const cut = d < '9' ? Date.parse(d) - 90 * 864e5 : 0, rs90 = (splits.get(s) || []).some(x => x.r < 1 && x.d < d && Date.parse(x.d) >= cut);
          list.push({ s, p: pc, o, h, l, c, v, av: vols.length >= 10 ? Math.round(mean(vols)) : null, adv: last20.length >= 10 ? Math.round(mean(last20.map(x => x[4] * x[5]))) : null,
            n90: hist.slice(-90).filter(x => x[6]).length, mx90: hist.length ? r4(Math.max(...hist.slice(-90).map(x => x[4])) / pc) : null, hn: hist.length, rs90 }); } }
      hist.push([t, o, h, l, c, v, prev && contiguous && !sp && h >= prev[4] * 1.4 ? 1 : 0]); if (hist.length > 100) hist.shift(); }
    if (d >= first) { cand[d] = list; universe[d] = { n5, n5l, up40, up100, cand: list.length }; }
    data[t] = null; }
  // next 1-5 closes (raw, adjusted for a split in between) relative to the day's close
  const tOf = new Map(D.map((d, i) => [d, i]));
  for (const [d, list] of Object.entries(cand)) { const t = tOf.get(d); for (const x of list) { const nx = []; let k = 1, adj = 1;
      for (; k <= 5 && t + k < D.length; k++) { const sp = splitOn(x.s, D[t + k]); if (sp) adj *= sp.r; const c = closeAt[t + k].get(x.s); nx.push(c > 0 ? r4(c * adj / x.c - 1) : null); } x.nx = nx; } }
  const CD = Object.keys(cand).sort(); log('candidate days ' + CD.length + ', stock-days ' + CD.reduce((s, d) => s + cand[d].length, 0));
  WZ(WORK + '/plan.json.gz', { v: VERSION, at: new Date().toISOString(), paper, marketDays: D, cand, universe, mvCalls: calls.mv });
}

// ---------- SHARD ----------
const quarter = (d) => d.slice(0, 4) + 'Q' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1);
async function shard() {
  const P = JZ(WORK + '/plan.json.gz', null); if (!P) { log('no plan'); return; }
  const n = +(env.SHARDS || 1), i = +(env.SHARD || 0), CD = Object.keys(P.cand).sort(), per = Math.ceil(CD.length / n), mine = CD.slice(i * per, (i + 1) * per);
  const MD = P.marketDays, prevDay = (d) => MD[MD.indexOf(d) - 1];
  log('shard ' + i + '/' + n + ': ' + mine.length + ' days ' + (mine[0] || '') + '..' + (mine[mine.length - 1] || ''));
  const det = new Map(), siBy = new Map(); let siOk = null;
  { const pr = await mv('/stocks/v1/short-interest?ticker=AAPL&limit=1'); siOk = !!(pr && !pr.refused && !pr.notFound && Array.isArray(pr.results)); log('short interest endpoint: ' + (siOk ? 'available' : 'NOT available')); }
  let newsOk = null; const rowsOut = [], stat = { cands: 0, noBars: 0, mismatch: 0, notCommon: 0, rows: 0, newsItems: 0 };
  const T_START = Date.now(), BUDGET = +(env.SQ19_MINUTES || 300) * 60000;
  for (const d of mine) { if (Date.now() - T_START > BUDGET) { log('time budget reached at ' + d); stat.cut = d; break; }
    const list = P.cand[d], off = nyOffset(d); stat.cands += list.length;
    // ticker details (point in time): one call per symbol and quarter
    const need = [...new Set(list.map(x => x.s + '|' + quarter(d)))].filter(k => !det.has(k));
    let q = 0; await Promise.all(Array.from({ length: 4 }, async () => { while (q < need.length) { const k = need[q++], s = k.split('|')[0];
      const j = await mv('/v3/reference/tickers/' + encodeURIComponent(s) + '?date=' + d), r = j && j.results;
      det.set(k, r ? { type: r.type || null, cik: r.cik ? String(+r.cik) : null, so: +(r.share_class_shares_outstanding || r.weighted_shares_outstanding || 0) || null, mc: r.market_cap ? Math.round(r.market_cap) : null, name: (r.name || '').slice(0, 60), sic: r.sic_code || null } : { type: null }); } }));
    if (siOk) for (const x of list) if (!siBy.has(x.s)) { const j = await mv('/stocks/v1/short-interest?ticker=' + encodeURIComponent(x.s) + '&limit=50000&sort=settlement_date.asc'); siBy.set(x.s, ((j && j.results) || []).map(z => [z.settlement_date, +z.days_to_cover || null, +z.short_interest || null])); }
    const keep = list.filter(x => { const m = det.get(x.s + '|' + quarter(d)); if (m && m.type && !OK_TYPES.has(m.type)) { stat.notCommon++; return false; } return true; });
    // 1-minute bars 04:00-15:59 New York, SIP, raw
    const bars = new Map(), syms = keep.map(x => x.s);
    for (let c = 0; c < syms.length; c += 100) { const chunk = syms.slice(c, c + 100); let tok = null, pages = 0;
      do { const j = await alp('/v2/stocks/bars?symbols=' + chunk.map(encodeURIComponent).join(',') + '&timeframe=1Min&start=' + new Date(nyMs(d, 240)).toISOString() + '&end=' + new Date(nyMs(d, 960)).toISOString() + '&adjustment=raw&feed=sip&sort=asc&limit=10000' + (tok ? '&page_token=' + encodeURIComponent(tok) : ''));
        if (!j || j.bad || j.refused) break; pages++; tok = j.next_page_token || null;
        for (const [s, arr] of Object.entries(j.bars || {})) { const a = bars.get(s) || bars.set(s, []).get(s); for (const x of arr) a.push(x); } } while (tok && pages < 300); }
    for (const [s, a] of bars) bars.set(s, toNy(a, off));
    // news: prior session 16:00 -> this day 16:00
    const news = new Map(), pd = prevDay(d) || d;
    for (let c = 0; c < syms.length; c += 50) { const chunk = syms.slice(c, c + 50), set = new Set(chunk); let tok = null, pages = 0;
      do { const j = await alp('/v1beta1/news?symbols=' + chunk.map(encodeURIComponent).join(',') + '&start=' + new Date(nyMs(pd, 960)).toISOString() + '&end=' + new Date(nyMs(d, 960)).toISOString() + '&limit=50&sort=asc&include_content=false' + (tok ? '&page_token=' + encodeURIComponent(tok) : ''));
        if (!j || j.bad || j.refused) { if (newsOk === null) newsOk = false; break; } if (newsOk === null) newsOk = true; pages++; tok = j.next_page_token || null;
        for (const it of j.news || []) { stat.newsItems++; const m = relMin(d, Date.parse(it.created_at)), cat = classifyNews(it.headline);
          for (const s of it.symbols || []) if (set.has(s)) (news.get(s) || news.set(s, []).get(s)).push([m, cat, String(it.headline || '').slice(0, 110), (it.symbols || []).length]); } } while (tok && pages < 60); }
    // facts + triggers
    const B = new Map(); for (const x of keep) { const b = bars.get(x.s); if (!b || !b.some(z => z[0] >= OPEN)) { stat.noBars++; continue; }
      const reg = b.filter(z => z[0] >= OPEN), lastC = reg[reg.length - 1][4]; if (Math.abs(lastC / x.c - 1) > 0.03 && Math.abs(reg[0][1] / x.o - 1) > 0.03) { stat.mismatch++; continue; } B.set(x.s, { x, b }); }
    const ctrlCache = new Map();
    const control = (m, exitId, self) => { const key = m + '|' + exitId; let c = ctrlCache.get(key);
      if (!c) { c = []; for (const [s, { x, b }] of B) { const px = pxAt(b, m); if (!(px >= x.p * 1.10)) continue; let k = -1; for (let q = 0; q < b.length && b[q][0] <= m; q++) k = q; if (k < 0) continue;
          const t2 = trade(b, k, EXITS[exitId], SLIP), t3 = trade(b, k, EXITS[exitId], STRESS); if (t2) c.push([s, t2.g, t3.g]); } ctrlCache.set(key, c); }
      const o = c.filter(z => z[0] !== self); return o.length ? [r4(mean(o.map(z => z[1]))), r4(mean(o.map(z => z[2]))), o.length] : [null, null, 0]; };
    for (const [s, { x, b }] of B) { const f = dayFacts(b, { prevC: x.p, avgVol: x.av }); if (!f) continue; const m = det.get(s + '|' + quarter(d)) || {};
      const si = siBy.get(s) || [], siNow = (() => { let v = null; for (const [sd, dtc] of si) { if (Date.parse(sd) + 10 * 864e5 < Date.parse(d)) v = dtc; else break; } return v; })();
      const nw = (news.get(s) || []).sort((a, c) => a[0] - c[0]), t = {};
      for (const id of BASE_IDS) { const k = BASE[id].fn(b, x.p); if (k < 0) continue; const a = after(b, k, x.p); if (!a) continue; const xs = {};
        for (const e of EXIT_IDS) { const t2 = trade(b, k, EXITS[e], SLIP), t3 = trade(b, k, EXITS[e], STRESS); if (!t2) continue; const [c2, c3, cn] = control(b[k][0], e, s); xs[e] = [r4(t2.g), r4(t3.g), c2, c3, cn, t2.why[0]]; }
        t[id] = { m: b[k][0], cv: cumVol(b, k), a, x: xs }; }
      rowsOut.push({ d, s, p: x.p, av: x.av, adv: x.adv, n90: x.n90, mx90: x.mx90, hn: x.hn, rs90: x.rs90, nx: x.nx, dv: x.c * x.v, type: m.type || null, cik: m.cik || null, so: m.so || null, mc: m.mc || null, name: m.name || null, sic: m.sic || null,
        si: siNow, f, news: nw.map(z => f.reach40 ? z : z.slice(0, 2)), t }); stat.rows++; }
    log(d + ': ' + list.length + ' candidates, ' + B.size + ' with bars, rows ' + stat.rows + ', alpaca ' + calls.alp + ', massive ' + calls.mv); }
  WZ(WORK + '/shard-' + i + '.json.gz', { v: VERSION, shard: i, days: mine, stat, newsOk, siOk, calls, rows: rowsOut });
  log('shard done', JSON.stringify(stat), JSON.stringify(calls));
}

// ---------- SEC ----------
async function secMode() {
  const shards = fs.readdirSync(WORK).filter(f => /^shard-\d+\.json\.gz$/.test(f)), ciks = new Set();
  for (const f of shards) for (const r of JZ(WORK + '/' + f, { rows: [] }).rows) if (r.cik) ciks.add(r.cik);
  log('SEC: ' + ciks.size + ' CIKs'); const out = {}; let ok = 0, miss = 0;
  for (const cik of ciks) { const pad = cik.padStart(10, '0'), j = await sec('/submissions/CIK' + pad + '.json'); if (!j || j.notFound || !j.filings) { miss++; continue; }
    const rows = []; const take = (R) => { if (!R || !R.form) return; for (let k = 0; k < R.form.length; k++) { const c = secClass(R.form[k]), at = R.acceptanceDateTime && R.acceptanceDateTime[k]; if (!c || !at || at < '2023-11') continue; rows.push([at, R.form[k], c]); } };
    take(j.filings.recent); const rec = j.filings.recent || {}, oldest = (rec.filingDate || []).slice(-1)[0];
    if (oldest && oldest > '2023-11-01') for (const fl of j.filings.files || []) { if (fl.filingTo && fl.filingTo < '2023-11-01') continue; const k = await sec('/submissions/' + fl.name); if (k && !k.notFound) take(k); }
    out[cik] = rows; ok++; if (ok % 500 === 0) log('SEC ' + ok + ' / ' + ciks.size); }
  WZ(WORK + '/sec.json.gz', { at: new Date().toISOString(), ok, miss, filings: out }); log('SEC done: ' + ok + ' found, ' + miss + ' missing, calls ' + calls.sec);
}

// ---------- shared: load rows + attach SEC ----------
function loadRows() {
  const P = JZ(WORK + '/plan.json.gz', null), S = JZ(WORK + '/sec.json.gz', { filings: {} }), MD = P ? P.marketDays : [], rows = [], meta = { shards: [], newsOk: null, siOk: null };
  for (const f of fs.readdirSync(WORK).filter(f => /^shard-\d+\.json\.gz$/.test(f)).sort()) { const x = JZ(WORK + '/' + f, null); if (!x) continue; meta.shards.push({ shard: x.shard, days: x.days.length, stat: x.stat, calls: x.calls });
    meta.newsOk = meta.newsOk || x.newsOk; meta.siOk = meta.siOk || x.siOk; for (const r of x.rows) rows.push(r); }
  const prevIdx = new Map(MD.map((d, i) => [d, MD[i - 1]]));
  for (const r of rows) { const L = r.cik ? S.filings[r.cik] : null; r.secOk = !!L; if (!L) { r.sec = []; continue; }
    const pd = prevIdx.get(r.d) || r.d, lo = nyMs(pd, 960), hi = nyMs(r.d, 960), lo30 = Date.parse(r.d) - 30 * 864e5;
    r.sec = L.map(([at, form, c]) => [Date.parse(at), form, c]).filter(([ms, , c]) => ms < hi && (c === 'offer' ? ms >= lo30 : ms >= lo)).map(([ms, form, c]) => [relMin(r.d, ms), c, form]); }
  rows.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.s < b.s ? -1 : 1);
  return { P, rows, meta, secMeta: { ok: S.ok, miss: S.miss, at: S.at } };
}
const pct = (a, f) => a.length ? r4(a.filter(f).length / a.length) : null, med = (a) => r4(median(a.filter(x => x !== null && x !== undefined && isFinite(x))));
const hm = (m) => m === null || m === undefined ? null : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

// ---------- REPORT (Stage 1) ----------
function report() {
  const { P, rows, meta, secMeta } = loadRows(); if (!P || !rows.length) { log('nothing to report'); return; }
  const tradeable = (r) => r.f.dv >= 1e6, R40 = rows.filter(r => r.f.reach40), R100 = rows.filter(r => r.f.reach100), T40 = R40.filter(tradeable), T100 = R100.filter(tradeable);
  // 1. per month
  const months = {}; for (const [d, u] of Object.entries(P.universe)) { const k = d.slice(0, 7), m = months[k] || (months[k] = { days: 0, under5PerDay: 0, under5LiquidPerDay: 0, dailyHigh40: 0, up40: 0, up100: 0, up40Liquid: 0, up100Liquid: 0, up40Over1: 0, weeksWith40Liquid: new Set() }); m.days++; m.under5PerDay += u.n5; m.under5LiquidPerDay += u.n5l; m.dailyHigh40 += u.up40; }
  for (const r of rows) { const m = months[r.d.slice(0, 7)]; if (!m) continue; if (r.f.reach40) { m.up40++; if (r.p >= 1) m.up40Over1++; } if (r.f.reach100) m.up100++; if (r.f.reach40 && tradeable(r)) { m.up40Liquid++; m.weeksWith40Liquid.add(weekOf(r.d)); } if (r.f.reach100 && tradeable(r)) m.up100Liquid++; }
  for (const m of Object.values(months)) { m.under5PerDay = Math.round(m.under5PerDay / m.days); m.under5LiquidPerDay = Math.round(m.under5LiquidPerDay / m.days); m.weeksWith40Liquid = m.weeksWith40Liquid.size; }
  // 2. the runner profile (tradeable +40% days): what was knowable first and when
  const prof = (A) => { const first10 = A.map(r => r.f.cross['0.1']), t20 = A.map(r => r.f.cross['0.2']), t40 = A.map(r => r.f.cross['0.4']);
    const newsBefore = (r, m) => r.news.some(([nm, c]) => nm < m && c !== 'reaction');
    const x10 = A.map(r => r.t.X10).filter(Boolean), x20 = A.map(r => r.t.X20).filter(Boolean);
    const cats = {}; for (const r of A) { const n = r.news.find(([nm, c]) => c !== 'reaction' && nm < (r.f.cross['0.4'] ?? 9999)); const c = n ? n[1] : (r.news.some(([nm]) => nm < (r.f.cross['0.4'] ?? 9999)) ? 'reaction only' : 'none'); cats[c] = (cats[c] || 0) + 1; }
    return { n: A.length, medianFirst10: hm(median(first10.filter(x => x !== null))), medianFirst20: hm(median(t20.filter(x => x !== null))), medianFirst40: hm(median(t40.filter(x => x !== null))), medianHighOfDay: hm(median(A.map(r => r.f.hiM))),
      first10By0945: pct(A, r => r.f.cross['0.1'] !== null && r.f.cross['0.1'] < 585), first40Before1000: pct(A, r => r.f.cross['0.4'] !== null && r.f.cross['0.4'] < 600), first40After1200: pct(A, r => r.f.cross['0.4'] >= 720),
      gap10AtOpen: pct(A, r => r.f.open >= 0.10), gap40AtOpen: pct(A, r => r.f.open >= 0.40), pmHigh20: pct(A, r => r.f.pmHi >= 0.20), pmVol1x: pct(A, r => r.f.pmRv >= 1),
      catalystNewsBeforeOpen: pct(A, r => newsBefore(r, OPEN)), catalystNewsBeforeFirst10: pct(A, r => r.f.cross['0.1'] !== null && newsBefore(r, r.f.cross['0.1'])), noHeadlineBeforeFirst40: pct(A, r => !r.news.some(([nm]) => nm < (r.f.cross['0.4'] ?? 9999))),
      newsCategoryFirst: cats, sec8KBefore: pct(A.filter(r => r.secOk), r => r.sec.some(([m, c]) => c === 'current' && m < (r.f.cross['0.1'] ?? 9999))), offeringFiling30d: pct(A.filter(r => r.secOk), r => r.sec.some(([, c]) => c === 'offer')), secCovered: pct(A, r => r.secOk),
      sharesOutMedianM: med(A.filter(r => r.so).map(r => r.so / 1e6)), soUnder10M: pct(A.filter(r => r.so), r => r.so < 10e6), soCovered: pct(A, r => r.so > 0), siMedianDtc: med(A.map(r => r.si)), siCovered: pct(A, r => r.si !== null && r.si !== undefined),
      repeatRunner90: pct(A, r => r.n90 > 0), reverseSplit90: pct(A, r => r.rs90), haltLike: pct(A, r => r.f.halts > 0), priceUnder1: pct(A, r => r.p < 1), price2to5: pct(A, r => r.p >= 2),
      closeVsHighMedian: med(A.map(r => r.f.closeVsHi)), closedAbove40: pct(A, r => r.f.close >= 0.4), closeOnPrevMedian: med(A.map(r => r.f.close)), highMedian: med(A.map(r => r.f.hi)),
      moveLeftAfterFirst10: { highAfterFill: med(x10.map(t => t.a.up)), closeVsFill: med(x10.map(t => t.a.cl)), fillOnPrev: med(x10.map(t => t.a.ePc)) },
      moveLeftAfterFirst20: { highAfterFill: med(x20.map(t => t.a.up)), closeVsFill: med(x20.map(t => t.a.cl)), fillOnPrev: med(x20.map(t => t.a.ePc)) },
      nextDays: [0, 1, 2, 3, 4].map(k => ({ day: k + 1, medianVsClose: med(A.map(r => r.nx && r.nx[k])), up: pct(A.filter(r => r.nx && r.nx[k] !== null && r.nx[k] !== undefined), r => r.nx[k] > 0) })) }; };
  // 3. runners vs same-day non-runners among the +10% crossers (who looked the same at +10%)
  const X10 = rows.filter(r => r.t.X10), cmp = (f) => ({ runners: pct(X10.filter(r => r.f.reach40), f), others: pct(X10.filter(r => !r.f.reach40), f) });
  const contrast = { n: { runners: X10.filter(r => r.f.reach40).length, others: X10.filter(r => !r.f.reach40).length }, baseRate40: pct(X10, r => r.f.reach40), baseRate100: pct(X10, r => r.f.reach100),
    catalystBeforeOpen: cmp(r => r.news.some(([m, c]) => m < OPEN && c !== 'reaction')), anyHeadlineBefore10: cmp(r => r.news.some(([m]) => m < r.t.X10.m)), gap10: cmp(r => r.f.open >= 0.1), pmVol1x: cmp(r => r.f.pmRv >= 1),
    rvAt10Over3: cmp(r => r.av > 0 && r.t.X10.cv / r.av >= 3), soUnder10M: cmp(r => r.so > 0 && r.so < 10e6), repeat90: cmp(r => r.n90 > 0), rs90: cmp(r => r.rs90), offer30: cmp(r => r.sec.some(([, c]) => c === 'offer')), priceUnder1: cmp(r => r.p < 1), cross10Before10: cmp(r => r.t.X10.m < 600) };
  // 4. trigger precision table: OLDER PART ONLY (signal day before SPLIT_HALF) - the newer part is kept unseen for Stage 2
  const old = rows.filter(r => halfOf(r.d) === 'older'), oldMonths = new Set(old.map(r => r.d.slice(0, 7))).size;
  const cell = (A, base, fs) => { const tr = []; for (const r of A) { const t = r.t[base]; if (!t || !t.x.S10) continue; if (!fs.every(f => FILTERS[f].fn(r, t))) continue; tr.push({ r, t }); } if (tr.length < 15) return null;
    const ex = {}; for (const e of EXIT_IDS) { const g = tr.map(z => z.t.x[e]).filter(Boolean); const s = summarize(g.map((v, j) => ({ d: tr[j].r.d, s: tr[j].r.s, g2: v[0], g3: v[1], c2: v[2], c3: v[3] }))); ex[e] = { avg: s.avg, avgStress: s.avgStress, median: s.median, win: s.win, noTop2: s.noTop2, edge: s.edge, ctrl: s.ctrl, tBlock: s.tBlock, worst: s.worst3[0] }; }
    return { base, filters: fs, n: tr.length, perMonth: r4(tr.length / oldMonths), stocks: new Set(tr.map(z => z.r.s)).size, precision40: pct(tr, z => z.t.a.r40), precision100: pct(tr, z => z.t.a.r100), alreadyAt40: pct(tr, z => z.t.a.ePc >= 0.4),
      highAfterFillMedian: med(tr.map(z => z.t.a.up)), closeVsFillMedian: med(tr.map(z => z.t.a.cl)), fillWaitOver3min: pct(tr, z => z.t.a.wait > 3), medianTime: hm(median(tr.map(z => z.t.m))), exits: ex }; };
  const table = []; for (const b of BASE_IDS) for (const f of FILTER_IDS) { const c = cell(old, b, f === 'ALL' ? [] : [f]); if (c) table.push(c); }
  const PAIR_BASES = ['GAP10', 'GAP20', 'X10', 'X20', 'X30', 'FAST', 'HALTUP', 'HODBRK'], PF = ['P_LT1', 'P_1_2', 'P_2_5', 'T_PRE10', 'T_10_12', 'RV1', 'RV3', 'PMRV1', 'NEWS_PRE', 'NEWS_ANY', 'NEWS_NONE', 'NEWS_LIVE30', 'SEC_PRE', 'SEC_NOOFF', 'SO_LT10', 'FRESH', 'REPEAT', 'DV1M'];
  const pairs = []; for (const b of PAIR_BASES) for (let a = 0; a < PF.length; a++) for (let c = a + 1; c < PF.length; c++) { const x = cell(old, b, [PF[a], PF[c]]); if (x && x.n >= 30) pairs.push(x); }
  // 5. biggest examples (tradeable +100% days): what was visible and when
  const examples = T100.sort((a, b) => b.f.hi - a.f.hi).slice(0, 40).map(r => ({ d: r.d, s: r.s, prevClose: r.p, high: r.f.hi, close: r.f.close, open: r.f.open, pmHigh: r.f.pmHi, first10: hm(r.f.cross['0.1']), first40: hm(r.f.cross['0.4']), hod: hm(r.f.hiM),
    so: r.so, halts: r.f.halts, news: r.news.filter(z => z[0] < (r.f.cross['0.4'] ?? 9999) + 60).slice(0, 3).map(z => hm(z[0] < 0 ? z[0] + 1440 : z[0]) + (z[0] < 0 ? ' (prior day)' : '') + ' [' + z[1] + '] ' + (z[2] || '')), sec: r.sec.filter(z => z[1] !== 'offer').slice(0, 2).map(z => z[2] + ' ' + hm(z[0] < 0 ? z[0] + 1440 : z[0])), next1: r.nx && r.nx[0], next5: r.nx && r.nx[4] }));
  const zad = J('data/zad-list.json', {}), zadHalal = new Set([...(zad.newHalal || []), ...(zad.halalAgain || [])]), zadNot = new Set(zad.notHalal || []), halal = J('data/halal.json', {});
  const zadCover = { runnerSymbols: new Set(T40.map(r => r.s)).size, markedNotHalal: new Set(T40.filter(r => zadNot.has(r.s) || (halal[r.s] && halal[r.s].s === 'fail')).map(r => r.s)).size, markedHalal: new Set(T40.filter(r => zadHalal.has(r.s) || (halal[r.s] && halal[r.s].s === 'pass')).map(r => r.s)).size };
  const caseStudy = { version: VERSION, at: new Date().toISOString(), window: { from: rows[0].d, to: rows[rows.length - 1].d, olderPartBefore: SPLIT_HALF, olderMonths: oldMonths },
    data: { fetchSet: 'prior close 0.10-5 USD (raw), daily high +8%+ (Massive grouped, raw); 1-minute SIP bars 04:00-15:59 (Alpaca); news Alpaca v1beta1 (Benzinga)', stockDays: rows.length, newsApi: meta.newsOk, shortInterestApi: meta.siOk, sec: secMeta, shards: meta.shards },
    definitions: { tradeable: 'traded value that day 1M USD+ (pre-market + regular, from the minute bars)', reach40: 'regular-session high 40%+ above the prior regular close', exits: EXITS, costs: '2% slippage each way, 3% stress' },
    months, totals: { up40: R40.length, up100: R100.length, up40Liquid: T40.length, up100Liquid: T100.length, weeks: new Set(Object.keys(P.universe).map(weekOf)).size, weeksWith40Liquid: new Set(T40.map(r => weekOf(r.d))).size, weeksWith100Liquid: new Set(T100.map(r => weekOf(r.d))).size },
    profile40: prof(T40), profile100: prof(T100), contrastAtPlus10: contrast, zad: zadCover, triggersOlder: table, pairsOlder: pairs.sort((a, b) => (b.exits.S10.avg ?? -9) - (a.exits.S10.avg ?? -9)).slice(0, 150), examples };
  const L = J(LAB, {}); L.caseStudy = caseStudy; L.squad = 19; L.updated = new Date().toISOString(); fs.writeFileSync(LAB, JSON.stringify(L, null, 1));
  log('Stage 1 written: ' + rows.length + ' stock-days, +40% ' + R40.length + ' (liquid ' + T40.length + '), +100% ' + R100.length + ' (liquid ' + T100.length + ')');
}
function weekOf(d) { const ms = Date.parse(d + 'T12:00:00Z'), wd = new Date(ms).getUTCDay(); return iso(ms - ((wd + 6) % 7) * 864e5); }

// ---------- JUDGE (Stage 2) ----------
function judgeMode() {
  if (!RULE_IDS.length) { log('no Stage 2 rules registered yet'); return; }
  const LB = J(LIB, null); if (LB && preRegister(LB, '2026-10-25')) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1));
  const { rows } = loadRows(); if (!rows.length) { log('no rows'); return; }
  const lastDay = rows[rows.length - 1].d, complete = lastDay >= '2026-10-01', results = {};
  for (const id of RULE_IDS) { const R = RULES[id], tr = ruleTrades(rows, R), H = { older: summarize(tr.filter(x => halfOf(x.d) === 'older')), newer: summarize(tr.filter(x => halfOf(x.d) === 'newer')) };
    const wk = (h, part) => { const days = rows.filter(r => halfOf(r.d) === part).map(r => r.d); const u = new Set(days.map(weekOf)).size; return { perWeek: r4(h.n / Math.max(1, u)), perMonth: r4(h.n / Math.max(1, new Set(days.map(d => d.slice(0, 7))).size)), weeksWithSignal: h.weeksWithSignal, weeks: u }; };
    const v = verdict(H); results[id] = { name: R.name, rule: R.rule, base: R.base, filters: R.filters, exit: R.exit, results: H, frequency: { older: wk(H.older, 'older'), newer: wk(H.newer, 'newer') }, ...v,
      worstTrades: [...tr].sort((a, b) => a.g2 - b.g2).slice(0, 5).map(x => ({ d: x.d, s: x.s, g2: x.g2 })), bestTrades: [...tr].sort((a, b) => b.g2 - a.g2).slice(0, 5).map(x => ({ d: x.d, s: x.s, g2: x.g2 })), window: { from: rows[0].d, to: lastDay } };
    log(id + ': ' + v.verdict + ' | older n ' + H.older.n + ' avg ' + H.older.avg + ' | newer n ' + H.newer.n + ' avg ' + H.newer.avg); }
  const L = J(LAB, {}); L.firstRun = complete ? freezeEach(L.firstRun, results) : (L.firstRun || {}); L.lastRun = { at: new Date().toISOString(), results }; fs.writeFileSync(LAB, JSON.stringify(L, null, 1));
  if (LB) { const LB2 = J(LIB, null); for (const e of LB2.strategies) { const r = L.firstRun[e.id]; if (!r || e.agent !== 'squad19') continue; e.tested = r.frozenAt.slice(0, 10);
      e.status = 'tested: ' + r.verdict + ' (squad 19, 1-minute bars, 2024-01 to ' + r.window.to + '); intraday entry: paper alert only';
      e.result = { verdict: r.verdict, n: [r.results.older.n, r.results.newer.n], avg: [r.results.older.avg, r.results.newer.avg], stress: [r.results.older.avgStress, r.results.newer.avgStress], edge: [r.results.older.edge, r.results.newer.edge], noTop2: [r.results.older.noTop2, r.results.newer.noTop2], tBlock: [r.results.older.tBlock, r.results.newer.tBlock], perMonth: [r.frequency.older.perMonth, r.frequency.newer.perMonth] }; }
    fs.writeFileSync(LIB, JSON.stringify(LB2, null, 1)); }
  writeToday(L);
}
function writeToday(L) { const methods = {}; for (const id of RULE_IDS) methods[id] = { name: RULES[id].name, hold: 'same day (intraday)', newSignals: [], note: 'Intraday entry: never a next-open TRY SMALL buy. Paper alert only; check ZAD first (most under-5 USD names are not ZAD-marked).' };
  fs.writeFileSync(TODAY, JSON.stringify({ at: new Date().toISOString(), methods }, null, 1)); }

// ---------- PAPER ----------
function paperMode() {
  if (!RULE_IDS.length) { log('no rules: paper lane idle'); return; }
  const { rows } = loadRows(), have = new Set(fs.existsSync(PAPER) ? fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(l => { try { const x = JSON.parse(l); return x.d + '|' + x.id + '|' + x.s; } catch (e) { return ''; } }) : []);
  const lines = []; for (const id of RULE_IDS) for (const t of ruleTrades(rows.filter(r => r.d >= PAPER_START), RULES[id])) { const k = t.d + '|' + id + '|' + t.s; if (have.has(k)) continue; lines.push(JSON.stringify({ d: t.d, id, s: t.s, at: hm(t.m), g2: t.g2, g3: t.g3, ctrl2: t.c2, zad: 'check ZAD first' })); }
  if (lines.length) fs.appendFileSync(PAPER, lines.join('\n') + '\n');
  const all = fs.existsSync(PAPER) ? fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [], board = {};
  for (const id of RULE_IDS) { const a = all.filter(x => x.id === id); board[id] = { n: a.length, avg: r4(mean(a.map(x => x.g2))), avgStress: r4(mean(a.map(x => x.g3))), win: a.length ? r4(a.filter(x => x.g2 > 0).length / a.length) : null }; }
  fs.writeFileSync(BOARD, JSON.stringify({ at: new Date().toISOString(), since: PAPER_START, board }, null, 1)); writeToday(J(LAB, {})); log('paper: +' + lines.length);
}

// ---------- DAILY (owner's daily-bar candidates) ----------
const EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov';
async function eftsHits(phrase, a, b) { const out = []; for (let from = 0; from < 10000; from += 100) { let j = null;
    for (let k = 0; k < 4 && !j; k++) { const w = secGap - Date.now(); if (w > 0) await sleep(w); secGap = Date.now() + (local(env.EFTS_BASE) ? 0 : 130); calls.sec++;
      try { const r = await fetch(EFTS + '/LATEST/search-index?q=' + encodeURIComponent('"' + phrase + '"') + '&forms=8-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from, { headers: { 'User-Agent': env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com' }, signal: AbortSignal.timeout(30000) }); if (r.ok) j = await r.json(); else await sleep(3000 * (k + 1)); } catch (e) { await sleep(2000); } }
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    for (const h of j.hits.hits || []) { const x = h._source || {}; out.push([x.adsh || String(h._id).split(':')[0], String(+((x.ciks || [])[0] || 0)), x.file_date]); }
    if ((j.hits.hits || []).length < 100 || from + 100 >= tot) break; } return out; }
async function daily() {
  const L0 = J(LAB, {}); if (L0.dailyFirstRun && DAILY_IDS.every(id => L0.dailyFirstRun[id])) { log('daily rules already frozen: nothing to run'); return; }
  const files = fs.readdirSync(DDIR).filter(f => /^\d{4}-\d\d-\d\d\.json\.gz$/.test(f)).sort(), D = [], G = [];
  for (const f of files) { const d = f.slice(0, 10); if (d < D_FROM) continue; const g = JZ(DDIR + '/' + f, null); if (!g || g.T.length < 2000) continue; D.push(d); G.push(g); }
  const T = D.length; log('daily: ' + T + ' market days ' + D[0] + '..' + D[T - 1]);
  // symbols that were ever 0.40-6 USD
  const want = new Set(); for (const g of G) for (let j = 0; j < g.T.length; j++) if (g.c[j] >= 0.4 && g.c[j] < 6) want.add(g.T[j]);
  const syms = [...want].sort(), SI = new Map(syms.map((s, i) => [s, i])), NS = syms.length; log('daily: ' + NS + ' symbols ever 0.40-6 USD');
  const A = syms.map(() => ({ o: new Float64Array(T).fill(NaN), h: new Float64Array(T).fill(NaN), l: new Float64Array(T).fill(NaN), c: new Float64Array(T).fill(NaN), v: new Float64Array(T).fill(NaN) })), RC = syms.map(() => new Float64Array(T).fill(NaN));
  G.forEach((g, t) => { for (let j = 0; j < g.T.length; j++) { const i = SI.get(g.T[j]); if (i === undefined) continue; const a = A[i]; a.o[t] = g.o[j]; a.h[t] = g.h[j]; a.l[t] = g.l[j]; a.c[t] = g.c[j]; a.v[t] = g.v[j]; RC[i][t] = g.c[j]; } G[t] = null; });
  const splits = await loadSplits(), dIdx = new Map(D.map((d, i) => [d, i])), splitIdx = syms.map(() => []), splitDates = syms.map(() => []);
  for (let i = 0; i < NS; i++) { const sp = (splits.get(syms[i]) || []).filter(x => x.d > D[0] && x.d <= D[T - 1]); const a = A[i];
    for (const x of sp) { let t = dIdx.get(x.d); if (t === undefined) t = D.findIndex(d => d > x.d); if (t < 0) continue;
      let pre = null, post = null; for (let k = t - 1; k >= Math.max(0, t - 10) && pre === null; k--) if (a.c[k] > 0) pre = a.c[k]; for (let k = t; k < Math.min(T, t + 5) && post === null; k++) if (a.c[k] > 0) post = a.c[k];
      if (!(pre > 0 && post > 0) || !(Math.abs(Math.log(pre / post) - Math.log(x.r)) < Math.abs(Math.log(pre / post)))) continue;   // the split must show in the raw prices
      for (let k = 0; k < t; k++) { a.o[k] /= x.r; a.h[k] /= x.r; a.l[k] /= x.r; a.c[k] /= x.r; a.v[k] *= x.r; } if (x.r < 1) { splitIdx[i].push(t); splitDates[i].push(x.d); } } }
  // in-band days per rule (for the yardstick) and symbols that need SEC data
  const bandDays = {}, need = new Map(); for (const id of DAILY_IDS) bandDays[id] = D.map(() => []);
  for (let i = 0; i < NS; i++) for (let t = 21; t < T; t++) { const rc = RC[i][t]; if (!(rc > 0)) continue; const dv = dv20(A[i], t); if (dv === null) continue;
    for (const id of DAILY_IDS) { const R = DAILY_RULES[id]; if (rc >= R.band[0] && rc < R.band[1] && dv >= R.dv) { bandDays[id][t].push(i); need.set(syms[i], D[t]); } } }
  log('daily: ' + need.size + ' symbols in a rule band; details + SEC next');
  const detF = DDIR + '/details.json.gz', det = JZ(detF, {}), legacy = J('data/sec-ciks.json', {}); let q = 0; const todo = [...need].filter(([s]) => !(s in det));
  await Promise.all(Array.from({ length: 4 }, async () => { while (q < todo.length) { const [s, d] = todo[q++]; const j = await mv('/v3/reference/tickers/' + encodeURIComponent(s) + '?date=' + d), r = j && j.results; det[s] = r && r.cik ? String(+r.cik) : (legacy[s] ? String(legacy[s][0]) : null); } }));
  WZ(detF, det); const cikOf = (s) => det[s] || (legacy[s] ? String(legacy[s][0]) : null);
  // SEC submissions (forms of interest with items), cached per CIK
  const subF = DDIR + '/sec-sub.json.gz', SUB = JZ(subF, {}), ciks = [...new Set([...need.keys()].map(cikOf).filter(Boolean))]; let fetched = 0;
  for (const cik of ciks) { if (SUB[cik]) continue; const j = await sec('/submissions/CIK' + cik.padStart(10, '0') + '.json'); if (!j || j.notFound || !j.filings) { SUB[cik] = { miss: 1 }; continue; }
    const rows = [], take = (R) => { if (!R || !R.form) return; for (let k = 0; k < R.form.length; k++) { const f = String(R.form[k]), at = R.acceptanceDateTime && R.acceptanceDateTime[k]; if (!at || at < '2020-10') continue;
        if (/^8-K|^6-K|^424B|^S-1|^S-3|^F-1|^F-3/.test(f)) rows.push([at, f, (R.items && R.items[k]) || '', R.accessionNumber && R.accessionNumber[k]]); } };
    take(j.filings.recent); const oldest = ((j.filings.recent || {}).filingDate || []).slice(-1)[0];
    if (oldest && oldest > '2020-11-01') for (const fl of j.filings.files || []) { if (fl.filingTo && fl.filingTo < '2020-11-01') continue; const k = await sec('/submissions/' + fl.name); if (k && !k.notFound) take(k); }
    SUB[cik] = { f: rows }; if (++fetched % 500 === 0) { log('SEC ' + fetched); WZ(subF, SUB); } }
  WZ(subF, SUB); log('daily: SEC submissions for ' + ciks.length + ' CIKs (' + fetched + ' fetched now, calls ' + calls.sec + ')');
  // EDGAR full-text phrases (8-K) by month, cached
  const ftF = DDIR + '/efts.json.gz', FT = JZ(ftF, {}); let ftMiss = 0; const typeA = new Set(), typeC = new Set(), thisMonth = iso(Date.now()).slice(0, 7);
  for (const [set, P] of [[typeA, FDA_PHRASES], [typeC, TOPLINE_PHRASES]]) for (const ph of P) for (let y = 2021, m = 1; y * 100 + m <= +thisMonth.replace('-', ''); m === 12 ? (y++, m = 1) : m++) {
    const ym = y + '-' + String(m).padStart(2, '0'), key = ph + '|' + ym; if (!FT[key] || ym === thisMonth) { const h = await eftsHits(ph, ym + '-01', iso(Date.UTC(y, m, 0))); if (h) FT[key] = h; else { ftMiss++; continue; } }
    for (const [adsh] of FT[key]) set.add(adsh); }
  WZ(ftF, FT); log('daily: full-text hits type A ' + typeA.size + ', type C ' + typeC.size + ', months missing ' + ftMiss);
  // filings -> sessions
  const close16 = D.map(d => nyMs(d, 960)), open930 = D.map(d => nyMs(d, 570));
  const sessOf = (ms) => { let lo = 0, hi = T - 1; if (ms >= close16[T - 1]) return T; while (lo < hi) { const m = (lo + hi) >> 1; if (close16[m] > ms) hi = m; else lo = m + 1; } return lo; };
  const secOf = new Map(); for (const cik of ciks) { const S = SUB[cik]; if (!S || !S.f) continue; const x = { s8k: [], offer: [], offerCat: [], pre202: new Set(), catA: [], catC: [] };
    for (const [at, form, items, adsh] of S.f) { const ms = Date.parse(at), t = sessOf(ms); if (t >= T) continue; const pre = ms < open930[t];
      if (/^8-K|^6-K/.test(form)) { x.s8k.push([t, items]); if (/3\.02/.test(items)) x.offer.push(t); if (/2\.02/.test(items) && pre) x.pre202.add(t);
        if (/^8-K/.test(form) && typeA.has(adsh)) x.catA.push([t, pre ? 'pre' : 'in']); if (/^8-K/.test(form) && typeC.has(adsh) && /8\.01|2\.02/.test(items)) x.catC.push([t, pre ? 'pre' : 'in']); }
      if (/^424B5|^S-1$|^S-1\/A/.test(form)) x.offer.push(t); if (/^424B5|^S-1$|^S-1\/A|^S-3$|^S-3\/A/.test(form)) x.offerCat.push(t); }
    secOf.set(cik, x); }
  // share counts (SEC frames), usable 45 days after the period
  const SH = JZ('data/shares.json.gz', { c: {} }).c || {};
  const sharesAt = (cik, d) => { const a = SH[cik]; if (!a) return null; const lim = Date.parse(d) - 45 * 864e5; let v = null; for (const [pd, n] of a) { if (Date.parse(pd) <= lim) v = n; else break; } return v; };
  const growth90 = (cik, d) => { const now = sharesAt(cik, d), then = sharesAt(cik, iso(Date.parse(d) - 90 * 864e5)); return now > 0 && then > 0 ? now / then - 1 : null; };
  // signals -> trades
  const ctrlCache = new Map(), cap = (x) => Math.min(x, 3);
  const control = (id, t, ent, ex) => { const k = id + '|' + t + '|' + ex; if (ctrlCache.has(k)) return ctrlCache.get(k); const v = [];
    for (const i of bandDays[id][t]) { const a = A[i]; if (a.o[ent] > 0 && a.c[ex] > 0) v.push(cap(a.c[ex] / a.o[ent] - 1)); } const r = v.length >= 20 ? mean(v) : null; ctrlCache.set(k, r); return r; };
  const own = (id, i, t, held) => { const a = A[i], v = []; for (let u = 21; u + held < T; u++) { if (Math.abs(u - t) <= 20) continue; const rc = RC[i][u]; const R = DAILY_RULES[id]; if (!(rc >= R.band[0] && rc < R.band[1])) continue;
      if (a.o[u + 1] > 0 && a.c[u + held] > 0) v.push(cap(a.c[u + held] / a.o[u + 1] - 1)); } return v.length >= 5 ? mean(v) : null; };
  const sigFrom = dIdx.get(D.find(d => d >= D_SIGNALS)), results = {}, cover = { symbolsInBand: need.size, withCik: [...need.keys()].filter(cikOf).length, ciks: ciks.length, secFound: [...secOf.keys()].length, eftsMissingMonths: ftMiss, typeAHits: typeA.size, typeCHits: typeC.size };
  for (const id of DAILY_IDS) { const tr = []; let lastEnd = new Map();
    for (let i = 0; i < NS; i++) { const a = A[i], rc = RC[i], cik = cikOf(syms[i]), sx = cik ? secOf.get(cik) || null : null;
      const cand = []; if (id === 'CAT-HUNTER-SUB5') { if (!sx) continue; for (const [t, pub] of [...sx.catA, ...sx.catC]) cand.push({ t, pub }); }
      else if (id === 'UNDER5-EPS-LOW') { if (!sx) continue; for (const g of sx.pre202) cand.push({ g }); }
      else for (let t = sigFrom; t < T - 1; t++) cand.push({ t });
      for (const c of cand.sort((x, y) => (x.t ?? x.g) - (y.t ?? y.g))) { let t = c.t, stopPx = null, T1 = null, why = null;
        if (id === 'UNDER5-JUMP') { if (!(rc[t] > 0)) continue; const s = sigJump(a, rc, t, sx, cik ? growth90(cik, D[t]) : null); if (!s) continue; why = s.why; stopPx = a.l[t]; }
        else if (id === 'UNDER5-REVERSE') { if (!(rc[t] > 0)) continue; const s = sigReverse(a, rc, t, sx, splitIdx[i]); if (!s) continue; why = s.why; stopPx = a.l[t]; }
        else if (id === 'UNDER5-EPS-LOW') { const s = sigEpsLow(a, rc, c.g, sx); if (!s) continue; t = s.t; stopPx = s.mid; why = 'gap ' + D[c.g]; }
        else { if (t < sigFrom || t >= T - 1) continue; const sd = splitDates[i].filter(x => x <= D[t]).pop(), ago = sd ? (Date.parse(D[t]) - Date.parse(sd)) / 864e5 : null; const s = sigCat(a, rc, t, sx, ago, c.pub); if (!s) continue; why = c.pub; }
        if (t < sigFrom || t + 1 >= T || (lastEnd.get(i) ?? -1) >= t) continue; const ent = t + 1;
        T1 = id === 'UNDER5-JUMP' ? jumpTrade(a, ent, stopPx) : id === 'CAT-HUNTER-SUB5' ? holdTrade(a, ent, 10, a.o[ent] * 0.75) : holdTrade(a, ent, 10, stopPx, true);
        if (!T1 || !T1.exitIdx) continue; lastEnd.set(i, T1.exitIdx); const gross = legsGross(T1), held = T1.exitIdx - ent + 1;
        tr.push({ d: D[t], s: syms[i], t, n2: legsNet(T1, D_SLIP), n3: legsNet(T1, D_SLIP3), h8: r4(gross - D_COST), h12: r4(gross - D_STRESS), gross, ctrl: control(id, t, ent, T1.exitIdx), own: own(id, i, t, held), why, exit: T1.why, held }); } }
    const H = { older: dSummary(tr.filter(x => x.d < D_SPLIT)), newer: dSummary(tr.filter(x => x.d >= D_SPLIT)) }, v = dVerdict(H);
    results[id] = { name: DAILY_RULES[id].name, rule: DAILY_RULES[id].rule, results: H, ...v, perMonth: { older: r4(H.older.n / Math.max(1, new Set(D.filter(d => d >= D_SIGNALS && d < D_SPLIT).map(d => d.slice(0, 7))).size)), newer: r4(H.newer.n / Math.max(1, new Set(D.filter(d => d >= D_SPLIT).map(d => d.slice(0, 7))).size)) },
      worstTrades: [...tr].sort((x, y) => x.n2 - y.n2).slice(0, 5).map(x => ({ d: x.d, s: x.s, n2: x.n2, exit: x.exit })), bestTrades: [...tr].sort((x, y) => y.n2 - x.n2).slice(0, 5).map(x => ({ d: x.d, s: x.s, n2: x.n2, exit: x.exit })), window: { from: D_SIGNALS, to: D[T - 1] } };
    log(id + ': ' + v.verdict + ' | older n ' + H.older.n + ' avg2 ' + H.older.avg2 + ' | newer n ' + H.newer.n + ' avg2 ' + H.newer.avg2); }
  const complete = D[T - 1] >= '2026-10-01' && ftMiss === 0 && cover.secFound > 0.8 * cover.ciks;
  fs.writeFileSync(WORK + '/daily-out.json', JSON.stringify({ at: new Date().toISOString(), complete, coverage: cover, results }));
  log('daily done; complete ' + complete + ' ' + JSON.stringify(cover));
}
// report job: fold the daily job's output into the lab (first complete run frozen per rule) and the library
function mergeDaily() { const X = J(WORK + '/daily-out.json', null), L = J(LAB, {});
  if (X) { L.dailyFirstRun = X.complete ? freezeEach(L.dailyFirstRun, X.results) : (L.dailyFirstRun || {}); L.dailyLastRun = { at: X.at, complete: X.complete, coverage: X.coverage, results: X.results }; L.skippedOwnerIdeas = SKIPPED_OWNER; fs.writeFileSync(LAB, JSON.stringify(L, null, 1)); }
  const LB = J(LIB, null); if (!LB) return; preRegisterDaily(LB, '2026-10-25');
  for (const e of LB.strategies) { const r = (L.dailyFirstRun || {})[e.id]; if (!r || e.agent !== 'squad19') continue; e.tested = r.frozenAt.slice(0, 10); e.status = 'tested: ' + r.verdict + ' (squad 19, daily bars, 2% slippage each way decides)';
    e.result = { verdict: r.verdict, n: [r.results.older.n, r.results.newer.n], avg: [r.results.older.avg2, r.results.newer.avg2], stress: [r.results.older.avg3, r.results.newer.avg3], house: [r.results.older.avgHouse, r.results.newer.avgHouse], edge: [r.results.older.edge, r.results.newer.edge], vsOwn: [r.results.older.vsOwn, r.results.newer.vsOwn], noTop2: [r.results.older.noTop2, r.results.newer.noTop2], tBlock: [r.results.older.tBlock, r.results.newer.tBlock] }; }
  fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('daily merged: ' + (X ? Object.keys(X.results).map(k => k + ' ' + X.results[k].verdict).join('; ') : 'no daily output')); }

if (MODE === 'daily') await daily(); else if (MODE === 'mergeDaily') mergeDaily(); else if (MODE === 'plan') await plan(); else if (MODE === 'shard') await shard(); else if (MODE === 'sec') await secMode(); else if (MODE === 'report') report(); else if (MODE === 'judge') judgeMode(); else if (MODE === 'paper') paperMode();
else console.log('unknown mode ' + MODE);
