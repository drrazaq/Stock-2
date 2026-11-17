// SQUAD 31: WHO IS BUYING (owner, 17 Nov 2026). Rules and parsers: insider-core.mjs (pre-registered there before any number).
// MODES (env MODE):
//   lab    5-year test: SEC quarterly insider data sets (every Form 4 open-market buy) + every electronic House PTR (the Clerk's yearly
//          index and PDFs), priced on the hunter lab's Massive cache (squad30-cache: every US stock, dead ones included), scored against
//          the S&P 500 after penny-size costs; first verdicts frozen. Writes data/squad31-buyers.json.
//   daily  08:00 New York: new Form 4 buys from the EDGAR daily index since the last run + new House PTRs; who bought, how much, their
//          role / committees, the stock's last 20 days, the latest news headline (the "why"), the rule label; Telegram WHO IS BUYING;
//          data/buyers-today.json. The live events are kept (data/buyers-live.json) so later labs can test them too.
// Never places an order. Halal = the owner's ZAD marks only (fail = never listed; no ok mark = CHECK ZAD). Research only, not advice.
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RULES, testOf, isoDate, cleanSym, roleOf, parseForm4Xml, parseHousePtr, insiderEvents, addClusters, scoreTrade, entryCtx, labelOf, stats, verdict } from './insider-core.mjs';
import { tierOf } from './hunter-core.mjs';
import { nyParts, HOLIDAYS } from './watcher-guard-core.mjs';

const env = process.env, MODE = env.MODE || 'lab', PCACHE = env.HUNT_CACHE || 'squad30-cache', CACHE = env.BUY_CACHE || 'squad31-cache', OUT = 'data/squad31-buyers.json';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const SEC = local(env.SEC_BASE) || 'https://www.sec.gov', HOUSE = local(env.HOUSE_BASE) || 'https://disclosures-clerk.house.gov', LEG = local(env.LEG_BASE) || 'https://unitedstates.github.io';
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const UA = 'Stock-2 research (owner razzaqstation@gmail.com)', SPLIT = '2024-03-01';
const FROM = env.BUY_FROM || new Date(Date.now() - (5 * 365 - 10) * 864e5).toISOString().slice(0, 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const rgz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
const wgz = (f, x) => fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(x)));
for (const d of ['sec', 'house']) fs.mkdirSync(CACHE + '/' + d, { recursive: true });
const iso = (t) => new Date(t).toISOString().slice(0, 10);

// ---------- HTTP: SEC asks for a named User-Agent and at most 10 requests a second
let secCalls = 0, lastSec = 0;
async function get(url, { bin = false, sec = false } = {}) {
  for (let a = 0; a < 4; a++) {
    if (sec) { const w = lastSec + 125 - Date.now(); if (w > 0) await sleep(w); lastSec = Date.now(); secCalls++; }
    let r; try { r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(90000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 404) return null;
    if (r.status === 429 || r.status === 403) { await sleep(a ? 60000 : 15000); continue; }
    if (!r.ok) { await sleep(2000); continue; }
    return bin ? Buffer.from(await r.arrayBuffer()) : await r.text();
  }
  return null;
}
let mCalls = 0;
async function massive(p) {
  if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  if (mCalls++) await sleep(local(env.MASSIVE_BASE) ? 0 : 110);
  const t = await get(PX + p + (p.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''));
  try { return t ? JSON.parse(t) : null; } catch (e) { return null; }
}
async function telegram(text) { if (!env.TG_TOKEN || !env.TG_CHAT) return; for (let i = 0; i < text.length; i += 3900) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(i, i + 3900), disable_web_page_preview: true }) }).catch(() => {}); }
function unzipTo(buf, files) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'z')), zf = path.join(dir, 'a.zip'); fs.writeFileSync(zf, buf);
  try { execFileSync('unzip', ['-o', '-q', zf, ...files, '-d', dir], { stdio: 'ignore' }); } catch (e) { /* missing members are reported by the caller */ }
  return dir; }
const tsv = (f) => { if (!fs.existsSync(f)) return []; const L = fs.readFileSync(f, 'utf8').split('\n'), h = L[0].replace(/^\uFEFF/, '').split('\t'); return L.slice(1).filter(Boolean).map(l => { const a = l.split('\t'), o = {}; h.forEach((k, i) => o[k] = a[i]); return o; }); };

// ---------- 1. SEC history: quarterly insider data sets -> buy rows { sym, filed, name, rel, title, sh, px }
async function secHistory() {
  const page = await get(SEC + '/data-research/sec-markets-data/insider-transactions-data-sets', { sec: true }) || '';
  const links = [...new Set([...page.matchAll(/href="([^"]*?(\d{4})q(\d)_form345\.zip)"/g)].map(m => m[1]))]
    .filter(u => { const m = /(\d{4})q(\d)_/.exec(u); const qEnd = m[1] + '-' + String(+m[2] * 3).padStart(2, '0') + '-28'; return qEnd >= FROM; });
  let rows = [], quarters = [];
  for (const u of links) {
    const q = /(\d{4}q\d)_/.exec(u)[1], f = CACHE + '/sec/' + q + '.json.gz'; let R = rgz(f);
    if (!R) { const buf = await get((u.startsWith('http') ? '' : SEC) + u, { bin: true, sec: true }); if (!buf) { console.log('SEC data set ' + q + ': not downloaded'); continue; }
      const dir = unzipTo(buf, ['SUBMISSION.tsv', 'REPORTINGOWNER.tsv', 'NONDERIV_TRANS.tsv']);
      const sub = new Map(tsv(dir + '/SUBMISSION.tsv').filter(r => r.DOCUMENT_TYPE === '4').map(r => [r.ACCESSION_NUMBER, r]));
      const own = new Map(); for (const r of tsv(dir + '/REPORTINGOWNER.tsv')) { const a = own.get(r.ACCESSION_NUMBER) || []; a.push(r); own.set(r.ACCESSION_NUMBER, a); }
      R = [];
      for (const t of tsv(dir + '/NONDERIV_TRANS.tsv')) { if (t.TRANS_CODE !== 'P' || t.TRANS_ACQUIRED_DISP_CD !== 'A') continue; const s = sub.get(t.ACCESSION_NUMBER); if (!s) continue;
        const sym = cleanSym(s.ISSUERTRADINGSYMBOL), sh = +t.TRANS_SHARES, px = +t.TRANS_PRICEPERSHARE; if (!sym || !(sh > 0) || !(px > 0)) continue;
        const o = (own.get(t.ACCESSION_NUMBER) || [])[0] || {};
        R.push({ sym, filed: isoDate(s.FILING_DATE), name: o.RPTOWNERNAME || '?', rel: o.RPTOWNER_RELATIONSHIP || '', title: o.RPTOWNER_TITLE || '', sh, px }); }
      fs.rmSync(dir, { recursive: true, force: true });
      if (R.length > 100) wgz(f, R); console.log('SEC ' + q + ': ' + R.length + ' open-market buy rows'); }
    rows = rows.concat(R); quarters.push(q);
  }
  const lastFiled = rows.reduce((m, r) => r.filed > m ? r.filed : m, '');
  return { rows, quarters, lastFiled };
}

// ---------- 2. House PTRs: the Clerk's yearly index -> electronic PDFs -> stock purchases
async function houseIndex(year) {
  const buf = await get(HOUSE + '/public_disc/financial-pdfs/' + year + 'FD.zip', { bin: true }); if (!buf) return [];
  const dir = unzipTo(buf, [year + 'FD.xml']), f = dir + '/' + year + 'FD.xml'; const x = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; fs.rmSync(dir, { recursive: true, force: true });
  const g = (s, t) => ((new RegExp('<' + t + '>([^<]*)</' + t + '>')).exec(s) || [])[1] || '';
  return [...x.matchAll(/<Member>([\s\S]*?)<\/Member>/g)].map(m => m[1]).filter(s => g(s, 'FilingType') === 'P')
    .map(s => ({ doc: g(s, 'DocID'), year, member: (g(s, 'First') + ' ' + g(s, 'Last')).trim(), dst: g(s, 'StateDst'), filed: isoDate(g(s, 'FilingDate')) })).filter(r => r.doc && r.filed);
}
async function housePtr(r) {
  const f = CACHE + '/house/' + r.doc + '.json', c = readJson(f, null); if (c) return c;
  if (!/^2/.test(r.doc)) return { paper: true };   // 8xxxxxxx / 9xxxxxxx = scanned paper filings: cannot be read reliably
  const buf = await get(HOUSE + '/public_disc/ptr-pdfs/' + r.year + '/' + r.doc + '.pdf', { bin: true }); if (!buf) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p')), pf = dir + '/a.pdf'; fs.writeFileSync(pf, buf); let text = '';
  try { text = execFileSync('pdftotext', ['-layout', pf, '-'], { encoding: 'utf8', maxBuffer: 64e6 }); } catch (e) { text = ''; }
  fs.rmSync(dir, { recursive: true, force: true });
  const out = { tx: parseHousePtr(text) }; fs.writeFileSync(f, JSON.stringify(out)); return out;
}
async function houseHistory(years) {
  const events = []; let docs = 0, paper = 0, unread = 0, txAll = 0;
  for (const y of years) { const idx = await houseIndex(y); console.log('House ' + y + ': ' + idx.length + ' trade reports');
    for (const r of idx) { if (r.filed < FROM) continue; docs++; const p = await housePtr(r); if (!p) { unread++; continue; } if (p.paper) { paper++; continue; }
      for (const t of p.tx) { txAll++; if (t.type !== 'P') continue; events.push({ sym: t.sym, filed: r.filed, tdate: t.tdate, lag: Math.round((Date.parse(r.filed) - Date.parse(t.tdate)) / 864e5), lo: t.lo, hi: t.hi, owner: t.owner, member: r.member, dst: r.dst, doc: r.doc }); } } }
  return { events, docs, paper, unread, txAll };
}

// ---------- 3. prices (hunter lab cache)
function loadSeries(keep, lastN = 0) {
  let files = fs.existsSync(PCACHE + '/days') ? fs.readdirSync(PCACHE + '/days').filter(f => f.endsWith('.json.gz')).sort() : []; if (lastN) files = files.slice(-lastN);
  const days = [], S = new Map();
  for (const f of files) { const x = rgz(PCACHE + '/days/' + f); if (!x || x.holiday || !x.s) continue; const di = days.length; days.push(f.slice(0, 10));
    for (let i = 0; i < x.s.length; i++) { const sym = x.s[i]; if (!keep(sym)) continue; let s = S.get(sym); if (!s) { s = { d: [], o: [], h: [], l: [], c: [], v: [] }; S.set(sym, s); }
      s.d.push(di); s.o.push(x.o[i]); s.h.push(x.h[i]); s.l.push(x.l[i]); s.c.push(x.c[i]); s.v.push(x.v[i]); } }
  return { days, S };
}
const firstAfter = (days, d) => { let lo = 0, hi = days.length; while (lo < hi) { const m = (lo + hi) >> 1; if (days[m] > d) hi = m; else lo = m + 1; } return lo; };
const kOf = (s, di) => { let lo = 0, hi = s.d.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (s.d[m] === di) return m; if (s.d[m] < di) lo = m + 1; else hi = m - 1; } return -1; };
const pct = (x) => x === null || x === undefined || !Number.isFinite(x) ? null : +(x * 100).toFixed(2);
const fmt = (x) => x.n ? { n: x.n, days: x.days, avgNet: pct(x.avg), median: pct(x.median), win: pct(x.win), t: +(x.t || 0).toFixed(2), withoutBest2: pct(x.withoutBest2) } : { n: 0 };

function runRules(days, S, ins, cong) {
  const spy = S.get('SPY'), lastDi = days.length - 1, res = {};
  if (!spy) throw new Error('SPY missing from the price cache');
  for (const [id, R] of Object.entries(RULES)) {
    const test = testOf(id), list = R.kind === 'ins' ? ins : cong, trades = [], t15 = [], tiers = {}, last = new Map(), best = [];
    let matched = 0, noPrice = 0;
    for (const e of list) { const s = S.get(e.sym); const di = firstAfter(days, e.filed); if (!s || di > lastDi) { noPrice++; continue; }
      const k = kOf(s, di); if (k < 0) { noPrice++; continue; }
      const c = entryCtx(s, k); if (!test(e, c)) continue; matched++;
      if (last.has(e.sym) && di - last.get(e.sym) < R.hold) continue;     // one open trade per stock per rule
      const x = scoreTrade(s, k, spy, R.hold, lastDi), x15 = scoreTrade(s, k, spy, R.hold, lastDi, 1.5); if (!x) continue; last.set(e.sym, di);
      const t = { di, net: x.net, px: x.px, sym: e.sym }; trades.push(t); t15.push({ ...t, net: x15.net }); (tiers[tierOf(x.px)] = tiers[tierOf(x.px)] || []).push(t);
      best.push({ sym: e.sym, d: days[di], net: pct(x.net), stock: pct(x.gross), spy: pct(x.mkt) }); }
    let insample = null;
    if (R.forwardFrom) { const fi = firstAfter(days, R.forwardFrom) - 1, isT = trades.filter(t => t.di < fi); insample = { note: 'found after looking: not evidence', ...fmt(stats(isT)) };
      for (const a of [trades, t15]) { const keep = a.filter(t => t.di >= fi); a.length = 0; a.push(...keep); } for (const k of Object.keys(tiers)) tiers[k] = tiers[k].filter(t => t.di >= fi); }
    const all = stats(trades), older = stats(trades.filter(t => days[t.di] < SPLIT)), newer = stats(trades.filter(t => days[t.di] >= SPLIT)), at15 = stats(t15), v = verdict(all, older, newer, at15, R);
    res[id] = { id, text: R.text, verdict: v.verdict, why: v.why, insample, forwardFrom: R.forwardFrom || null, matched, noPrice, all: fmt(all), older: fmt(older), newer: fmt(newer), at15: fmt(at15),
      tiers: Object.fromEntries(Object.entries(tiers).map(([k, a]) => [k, fmt(stats(a))])), best: best.sort((a, b) => b.net - a.net).slice(0, 3), worst: best.slice(-3).reverse(), avgStock: pct(trades.length ? best.reduce((a, b) => a + b.stock, 0) / best.length / 100 : null), avgSpy: pct(trades.length ? best.reduce((a, b) => a + b.spy, 0) / best.length / 100 : null) };
    console.log(id + ': ' + v.verdict + ' - ' + all.n + ' trades, ' + (pct(all.avg) ?? '-') + '% a trade vs the S&P 500 after costs (median ' + (pct(all.median) ?? '-') + '%, t ' + (all.t || 0).toFixed(2) + ')');
  }
  return res;
}
const ref = () => { const R = readJson(PCACHE + '/ref.json', null); return R ? new Set(R.common) : null; };
const insRowsToEvents = (rows) => addClusters(insiderEvents(rows.map(r => ({ sym: r.sym, filed: r.filed, name: r.name, role: roleOf(r.rel, r.title), sh: r.sh, px: r.px }))));

// ================= LAB
async function lab() {
  const common = ref(); if (!common) throw new Error('the hunter lab price cache (squad30-cache) is missing; run Squad 30 lab first');
  const sec = await secHistory(), live = readJson('data/buyers-live.json', { ins: [], house: [] });
  const insRows = sec.rows.concat((live.ins || []).filter(r => !sec.rows.length || r.filed > sec.lastFiled));
  const ins = insRowsToEvents(insRows).filter(e => common.has(e.sym));
  const y0 = +FROM.slice(0, 4), y1 = +iso(Date.now()).slice(0, 4), years = []; for (let y = y0; y <= y1; y++) years.push(y);
  const H = await houseHistory(years); const cong = H.events.filter(e => common.has(e.sym));
  console.log('insider events: ' + ins.length + ' (from ' + sec.quarters.length + ' quarters, ' + secCalls + ' SEC calls); House: ' + H.docs + ' reports (' + H.paper + ' scanned paper, ' + H.unread + ' not downloaded), ' + H.txAll + ' stock lines, ' + cong.length + ' purchases');
  const keep = new Set([...ins.map(e => e.sym), ...cong.map(e => e.sym), 'SPY']);
  const { days, S } = loadSeries(s => keep.has(s)); if (days.length < 500) throw new Error('only ' + days.length + ' sessions in the price cache; need 500+');
  console.log('prices: ' + S.size + ' symbols over ' + days.length + ' sessions (' + days[0] + ' to ' + days[days.length - 1] + ')');
  const res = runRules(days, S, ins, cong), prev = readJson(OUT, {});
  const out = { generatedAt: new Date().toISOString(), preRegistered: '2026-11-17 (insider-core.mjs)', window: [days[0], days[days.length - 1]], split: SPLIT,
    score: 'stock return minus the S&P 500 (SPY) over the same open-to-close window, minus penny-size costs (hunter-core costOf); entry = the open of the first market day after the filing / report date',
    caveat: 'Daily bars. Insider data = SEC quarterly data sets (Form 4, code P, open market) + live EDGAR events; Congress = House electronic PTRs only (the Senate site needs a browser session; scanned paper PTRs cannot be read). Amounts in Congress reports are ranges; the lower bound is used.',
    data: { secQuarters: sec.quarters, insiderEvents: ins.length, house: { reports: H.docs, paper: H.paper, unread: H.unread, stockLines: H.txAll, purchases: cong.length } },
    firstRun: prev.firstRun || Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { verdict: v.verdict, n: v.all.n, avgNet: v.all.avgNet, at: new Date().toISOString().slice(0, 10) }])), results: res };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
}

// ================= DAILY
const halal = readJson('data/halal.json', {}) || {};
const zad = (sym) => { const h = halal[sym]; return h && h.s === 'ok' ? 'ZAD ok' : 'CHECK ZAD'; };
const notHalal = (sym) => { const h = halal[sym]; return !!(h && h.s === 'fail'); };
function marketDaysBetween(a, b) { const o = []; for (let t = Date.parse(a + 'T12:00:00Z') + 864e5; t <= Date.parse(b + 'T12:00:00Z'); t += 864e5) { const d = iso(t), w = new Date(t).getUTCDay(); if (w && w < 6 && !HOLIDAYS.includes(d)) o.push(d); } return o; }
async function edgarDay(d) {
  const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await get(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/form.' + d.replace(/-/g, '') + '.idx', { sec: true });
  if (idx === null) return null;
  const paths = [...new Set(idx.split('\n').filter(l => /^4\s{2,}/.test(l)).map(l => (/(edgar\/data\/\S+\.txt)\s*$/.exec(l) || [])[1]).filter(Boolean))];
  const rows = []; let read = 0; const cap = +(env.FORM4_CAP || 4000);
  for (const p of paths.slice(0, cap)) { const t = await get(SEC + '/Archives/' + p, { sec: true }); read++; if (!t) continue;
    const xml = (/<XML>([\s\S]*?)<\/XML>/i.exec(t) || [])[1]; const f = parseForm4Xml(xml); if (!f || !f.sym || !f.buys.length) continue;
    const o = f.owners[0] || { name: '?', role: roleOf('', '') };
    for (const b of f.buys) rows.push({ sym: f.sym, issuer: f.issuer, filed: d, tdate: b.date, name: o.name, rel: [o.role.director && 'Director', o.role.officer && 'Officer', o.role.ten && 'TenPercentOwner'].filter(Boolean).join(','), title: o.role.title, sh: b.sh, px: b.px }); }
  console.log('EDGAR ' + d + ': ' + paths.length + ' Form 4 filings, ' + read + ' read, ' + rows.length + ' open-market buy lines');
  return rows;
}
async function committees() {
  const f = CACHE + '/committees.json', c = readJson(f, null); if (c && Date.now() - c.at < 7 * 864e5) return c;
  try { const L = JSON.parse(await get(LEG + '/congress-legislators/legislators-current.json') || 'null'), M = JSON.parse(await get(LEG + '/congress-legislators/committee-membership-current.json') || 'null'), C = JSON.parse(await get(LEG + '/congress-legislators/committees-current.json') || 'null');
    if (!L || !M || !C) return c || { at: 0, byDst: {} };
    const name = {}; for (const x of C) name[x.thomas_id] = x.name.replace(/^House Committee on (the )?/, '');
    const comm = {}; for (const [id, mem] of Object.entries(M)) { if (!name[id]) continue; for (const m of mem) (comm[m.bioguide] = comm[m.bioguide] || []).push(name[id]); }
    const byDst = {}; for (const p of L) { const t = p.terms[p.terms.length - 1]; if (t.type !== 'rep') continue; byDst[t.state + String(t.district).padStart(2, '0')] = (comm[p.id.bioguide] || []).slice(0, 3); }
    const out = { at: Date.now(), byDst }; fs.writeFileSync(f, JSON.stringify(out)); return out; } catch (e) { return c || { at: 0, byDst: {} }; }
}
const usd = (x) => x >= 1e6 ? (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? Math.round(x / 1e3) + 'k' : String(Math.round(x));
async function headline(sym) { const j = await massive('/v2/reference/news?ticker=' + encodeURIComponent(sym) + '&published_utc.gte=' + iso(Date.now() - 7 * 864e5) + '&order=desc&limit=1');
  const r = j && Array.isArray(j.results) && j.results[0]; return r ? r.title.slice(0, 110) + ' (' + r.published_utc.slice(5, 10) + ')' : null; }

async function daily() {
  const live = readJson('data/buyers-live.json', { ins: [], house: [], seenDocs: [], lastIdx: null }), today = nyParts(Date.now()).d;
  const start = live.lastIdx || iso(Date.now() - 4 * 864e5), dates = marketDaysBetween(start, iso(Date.parse(today) - 864e5)).slice(-4);
  const newRows = []; for (const d of dates) { const r = await edgarDay(d); if (r === null) continue; newRows.push(...r); live.lastIdx = d; }
  // House: this year's index (and last year's in January)
  const y = +today.slice(0, 4), years = +today.slice(5, 7) === 1 ? [y - 1, y] : [y], seen = new Set(live.seenDocs || []), newHouse = []; let paper = 0;
  for (const yy of years) for (const r of await houseIndex(yy)) { if (seen.has(r.doc)) continue; if (!(live.seenDocs || []).length && r.filed < iso(Date.now() - 7 * 864e5)) { seen.add(r.doc); continue; }  // first run: only the last 7 days
    const p = await housePtr(r); if (!p) continue; seen.add(r.doc); if (p.paper) { paper++; continue; }
    for (const t of p.tx) if (t.type === 'P') newHouse.push({ sym: t.sym, filed: r.filed, tdate: t.tdate, lag: Math.round((Date.parse(r.filed) - Date.parse(t.tdate)) / 864e5), lo: t.lo, hi: t.hi, owner: t.owner, member: r.member, dst: r.dst, doc: r.doc }); }
  const keepFrom = '2026-10-01';   // kept for good: the forward test of INS-LEAD13 and the months the SEC quarterly sets do not cover yet
  live.ins = (live.ins || []).concat(newRows).filter(r => r.filed >= keepFrom); live.house = (live.house || []).concat(newHouse).filter(r => r.filed >= keepFrom); live.seenDocs = [...seen];
  fs.writeFileSync('data/buyers-live.json', JSON.stringify(live));

  const common = ref(), V = (readJson(OUT, {}).results) || {}, { days, S } = loadSeries(() => true, 45), lastDi = days.length - 1;
  // context for an entry at the NEXT open: a placeholder bar after the last close (as the hunter lab does), px = the last close
  const ctxNow = (sym) => { const s = S.get(sym); if (!s || s.d[s.d.length - 1] < lastDi - 3) return null; const k = s.d.length - 1, L = s.c[k];
    const t = { d: [...s.d, s.d[k] + 1], o: [...s.o, L], h: [...s.h, L], l: [...s.l, L], c: [...s.c, L], v: [...s.v, s.v[k]] };
    return { ...entryCtx(t, k + 1), last: L }; };
  const ok = (sym) => sym && !notHalal(sym) && (!common || common.has(sym));
  // insider events from the new filings (clusters look back over the kept live rows)
  const evAll = insRowsToEvents(live.ins), newKeys = new Set(newRows.map(r => r.sym + '|' + r.filed));
  const ins = evAll.filter(e => newKeys.has(e.sym + '|' + e.filed) && ok(e.sym) && e.usd >= 1e4).map(e => { const c = ctxNow(e.sym); const ids = c ? Object.keys(RULES).filter(id => RULES[id].kind === 'ins' && !RULES[id].same && testOf(id)(e, c)) : [];
    return { ...e, ctx: c, rules: ids, label: ids.length ? labelOf(ids, V) : 'no rule matched', zad: zad(e.sym) }; }).sort((a, b) => b.usd - a.usd);
  // one line per member and stock (members often report many small buys of the same stock at once), biggest first
  const G = new Map(); for (const e of newHouse.filter(x => ok(x.sym))) { const k = e.member + '|' + e.sym, g = G.get(k);
    if (!g) G.set(k, { ...e, buys: 1 }); else { g.buys++; g.lo += e.lo; g.hi = g.hi && e.hi ? g.hi + e.hi : null; g.lag = Math.min(g.lag, e.lag); if (e.tdate > g.tdate) g.tdate = e.tdate; } }
  const cong = [...G.values()].sort((a, b) => b.lo - a.lo).map(e => { const c = ctxNow(e.sym); const ids = c ? Object.keys(RULES).filter(id => RULES[id].kind === 'cong' && !RULES[id].same && testOf(id)(e, c)) : [];
    return { ...e, ctx: c, rules: ids, label: ids.length ? labelOf(ids, V) : 'no rule matched', zad: zad(e.sym) }; });
  const C = await committees();
  for (const e of ins.slice(0, 10)) e.news = await headline(e.sym);
  for (const e of cong.slice(0, 6)) e.news = await headline(e.sym);
  fs.writeFileSync('data/buyers-today.json', JSON.stringify({ at: new Date().toISOString(), filedDays: dates, insiders: ins.slice(0, 60), congress: cong, housePaper: paper }, null, 1));

  const vv = (id) => (V[id] || {}).verdict || 'not tested yet';
  const msg = ['WHO IS BUYING (filings of ' + (dates.length ? dates.map(d => d.slice(5)).join(', ') : 'none new') + ')', '',
    'INSIDERS buying their own company on the open market (10k USD+): ' + ins.length];
  for (const e of ins.slice(0, 12)) { const c = e.ctx, w = e.names[0] || {};
    msg.push('- ' + e.sym + (c ? ' ' + (c.last < 1 ? c.last.toFixed(3) : c.last.toFixed(2)) : '') + ': ' + (w.title || 'insider') + ' ' + (w.name || '') + ' bought ' + usd(e.usd) + ' USD at ' + (e.avgPx < 1 ? e.avgPx.toFixed(3) : e.avgPx.toFixed(2)) + (e.cluster >= 2 ? ' (' + e.cluster + ' insiders in 10 days)' : '')
      + (c && c.pre20 !== null ? ' | last 20 days ' + (c.pre20 >= 0 ? '+' : '') + Math.round(c.pre20 * 100) + '%' : '') + ' | ' + e.label + (e.rules.length ? ' [' + e.rules.join(', ') + ']' : '') + ' | ' + e.zad + (e.news ? '\n    why/news: ' + e.news : '')); }
  msg.push('', 'CONGRESS (House reports filed since the last run): ' + cong.length + ' stock purchases' + (paper ? ' (+' + paper + ' scanned paper reports not readable)' : ''));
  for (const e of cong.slice(0, 8)) { const cm = (C.byDst[e.dst] || []).join(', ');
    msg.push('- ' + e.sym + ': ' + e.member + ' (' + e.dst + (cm ? '; ' + cm : '') + ')' + (e.owner !== 'self' ? ' [' + e.owner + ']' : '') + ' bought ' + usd(e.lo) + (e.hi ? '-' + usd(e.hi) : '+') + ' USD' + (e.buys > 1 ? ' in ' + e.buys + ' buys, last' : '') + ' on ' + e.tdate.slice(5) + ', reported ' + e.lag + ' days later | ' + e.label + ' | ' + e.zad + (e.news ? '\n    news: ' + e.news : '')); }
  msg.push('', '5-year test: INS-ANY ' + vv('INS-ANY') + ', INS-CEO ' + vv('INS-CEO') + ', INS-MOM ' + vv('INS-MOM') + ', INS-PENNY ' + vv('INS-PENNY') + ', CONG-BUY ' + vv('CONG-BUY') + '; 1-3 USD lead: forward test since 18 Nov.',
    'TRY SMALL = its rule passed the 5-year test; WATCH = not proven yet; INFO = the rule failed. Buy only in ZAD, only names ZAD shows as halal, 1,000 USD at most. Research only, not advice.');
  await telegram(msg.join('\n'));
  console.log('daily: ' + ins.length + ' insider events, ' + cong.length + ' Congress purchases; SEC calls ' + secCalls);
}

if (MODE === 'lab') await lab(); else if (MODE === 'daily') await daily(); else throw new Error('unknown MODE ' + MODE);
