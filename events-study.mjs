import {telegramFetch as sharedTelegramFetch} from './telegram-delivery.mjs';
const telegramFetch=(u,o)=>sharedTelegramFetch(u,o,{research:true});
// EVENT-TO-TRADE EVIDENCE ENGINE. Read-only research; never places an order.
// Question it answers: when a company announces something (a big contract, an acquisition, an FDA approval, an activist stake,
// a share sale, a restatement, faster earnings growth...), what did its stock do AFTERWARDS, compared with the market and with
// similar stocks that moved the same way on the same day WITHOUT that news? Only event types that beat both, in the older AND
// the newer half of five years, at stress cost, become buys. Event types that keep losing become WARNINGS for stocks you hold.
// It also tests the supply chain ("history repeats"): when an industry is hot (chips), do the industries that supply it
// (machines, materials, power) follow in the next month?
//
// Sources: official and free only, no scraping. SEC EDGAR submissions API (data.sec.gov, every filing with its exact acceptance
// time, 8-K item numbers, Schedule 13D, prospectuses), openFDA (drug approvals), the earnings history already collected by
// earnings-study.mjs, and the 5-year whole-market price cache. Public filings only.
//
// POINT IN TIME: an event counts from the moment the SEC accepted the filing. Filed before 9:30 New York time -> that session is
// the reaction day; filed during or after the session -> reaction that day or the next. A trade is ALWAYS bought at the open
// AFTER the reaction day closed, so nothing is used before the public could know it.
//
// MODE=fetch (weekdays, smart-money workflow): fills ev-cache/events-cache.json.gz (Actions cache, not the public repository),
//   data/sec-ciks.json (ticker -> SEC number and industry code) and data/events-recent.json (the last 10 days of events).
// MODE=study (Sunday, leaders-study workflow, after the price cache is loaded): the fair test -> data/events-study.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { secNY, nyStamp } from './sec-time.mjs';
import { freezeEach, latestBlock } from './first-run.mjs';   // run once: first judged verdict frozen (22 Oct 2026)   // SEC acceptance times are UTC: converted to the New York clock (fixed 22 Oct 2026)
const env = process.env, MODE = env.MODE === 'study' ? 'study' : 'fetch';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const SEC_WWW = local(env.SEC_BASE) || 'https://www.sec.gov', SEC_DATA = local(env.SEC_BASE) || 'https://data.sec.gov', FDA = local(env.FDA_BASE) || 'https://api.fda.gov', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const FAST = Boolean(local(env.SEC_BASE));
const UA = env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com';   // the SEC asks every program to name itself
const CACHE = env.EV_CACHE || 'ev-cache/events-cache.json.gz', OUT = 'data/events-study.json', RECENT = 'data/events-recent.json', CIKS = 'data/sec-ciks.json';
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const pc = (x, d = 1) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const QUIET = (() => { const s = readJson('data/settings.json', {}); return s.quiet !== false; })();
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(CACHE.split('/').slice(0, -1).join('/') || '.', { recursive: true });

// ---- the event families (fixed in advance; sign +1 = tested as a BUY idea, -1 = tested as a WARNING, 0 = tested both ways)
export const FAM = {
  CONTRACT: { name: 'major contract or agreement signed (8-K item 1.01)', sign: 0 },
  ACQUIRED: { name: 'completed an acquisition (8-K item 2.01)', sign: 0 },
  ACTIVIST: { name: 'an investor took a 5%+ stake with plans (Schedule 13D)', sign: 0 },
  BIO_NEWS: { name: 'drug company news: trial data, FDA letters, deals (8-K 7.01/8.01 from a drug maker)', sign: 0 },
  NEWS: { name: 'other company news (8-K 7.01/8.01)', sign: 0 },
  MGMT: { name: 'chief executive, finance chief or director change (8-K 5.02)', sign: 0 },
  FDA_APPROVAL: { name: 'FDA approved a new drug (openFDA)', sign: 0 },
  FDA_NEW_USE: { name: 'FDA approved a new use for a drug (openFDA)', sign: 0 },
  EPS_ACCEL: { name: 'earnings growth speeding up (EPS up 25%+ on the year and faster than last quarter)', sign: 0 },
  CONTRACT_END: { name: 'a major agreement ended (8-K item 1.02)', sign: -1 },
  RESTRUCTURE: { name: 'restructuring or write-down (8-K 2.05/2.06)', sign: -1 },
  DELIST: { name: 'exchange listing-rule notice (8-K 3.01)', sign: -1 },
  DILUTION: { name: 'sold new shares privately (8-K 3.02)', sign: -1 },
  AUDITOR: { name: 'auditor changed (8-K 4.01)', sign: -1 },
  RESTATE: { name: 'past results can no longer be relied on (8-K 4.02)', sign: -1 },
  OFFERING: { name: 'share or debt offering priced (prospectus 424B4/424B5)', sign: -1 },
};
const ITEM = { '1.01': 'CONTRACT', '1.02': 'CONTRACT_END', '2.01': 'ACQUIRED', '2.02': 'EARN', '2.05': 'RESTRUCTURE', '2.06': 'RESTRUCTURE', '3.01': 'DELIST', '3.02': 'DILUTION', '4.01': 'AUDITOR', '4.02': 'RESTATE', '5.02': 'MGMT', '7.01': 'NEWS', '8.01': 'NEWS' };
const BIO = (sic) => /^(283[3-6]|8731)$/.test(String(sic || ''));
// one filing -> its families (EARN = an earnings release, kept only to keep earnings days out of the other tests)
export function famsOf(form, items, sic) {
  const f = String(form || '').toUpperCase(), out = new Set();
  if (f === '8-K') for (const it of String(items || '').split(',').map(s => s.trim())) { let k = ITEM[it]; if (k === 'NEWS' && BIO(sic)) k = 'BIO_NEWS'; if (k) out.add(k); }
  if (f === 'SC 13D' || f === 'SCHEDULE 13D') out.add('ACTIVIST');
  if (f === '424B4' || f === '424B5') out.add('OFFERING');
  if (out.has('EARN')) { out.delete('NEWS'); out.delete('BIO_NEWS'); }   // a results release with a slide deck is earnings, not news
  return [...out];
}

// ---- supply-chain links between industries (SIC, first 3 digits), fixed in advance. Upstream hot -> does downstream follow?
const LINKS = [
  ['737', '367', 'software and AI -> chips'], ['737', '357', 'software and AI -> computers and servers'], ['357', '367', 'computers and servers -> chips'],
  ['366', '367', 'communications equipment -> chips'], ['367', '355', 'chips -> chip-making machines'], ['367', '382', 'chips -> measuring and lab instruments'],
  ['367', '281', 'chips -> industrial chemicals and gases'], ['367', '333', 'chips -> metals (copper, aluminium)'], ['367', '100', 'chips -> metal mining'],
  ['367', '362', 'chips -> electrical equipment'], ['357', '362', 'data centres -> electrical equipment'], ['357', '491', 'data centres -> electric power'],
  ['357', '369', 'data centres -> batteries and electrical parts'], ['283', '873', 'drug makers -> research labs'], ['283', '382', 'drug makers -> lab instruments'],
  ['131', '138', 'oil and gas producers -> oilfield services'], ['131', '461', 'oil and gas producers -> pipelines'], ['153', '242', 'home builders -> lumber'],
  ['153', '327', 'home builders -> cement and concrete'], ['153', '521', 'home builders -> building materials shops'], ['371', '331', 'car makers -> steel'],
  ['371', '367', 'car makers -> chips'], ['451', '372', 'airlines -> aircraft and parts'], ['372', '331', 'aircraft -> steel and metals'],
];

const nextDay = (d) => { let ms = Date.parse(d + 'T12:00:00Z'); do { ms += 864e5; } while ([0, 6].includes(new Date(ms).getUTCDay())); return iso(ms); };
let cache = { syms: {}, ciks: null, ciksAt: null };
try { cache = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE)).toString()); } catch (e) {}
cache.syms = cache.syms || {};
const save = () => fs.writeFileSync(CACHE, zlib.gzipSync(JSON.stringify(cache)));

if (MODE === 'fetch') {
  const t0 = Date.now(), MAXMS = +(env.EV_MINUTES || 45) * 60000, MAXC = +(env.EV_CALLS || 1500);
  let calls = 0, note = '';
  async function sec(url) {
    if (note) return null; await sleep(FAST ? 0 : 150); calls++;   // SEC fair-use limit: 10 requests a second
    const go = () => fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    let r; try { r = await go(); } catch (e) { return null; }
    for (let k = 0; k < 3 && (r.status === 403 || r.status === 429); k++) { await sleep(FAST ? 0 : 4000 + Math.random() * 6000); try { r = await go(); } catch (e) { return null; } }
    if (r.status === 403 || r.status === 429) { note = 'SEC refused this server (HTTP ' + r.status + ') after 3 retries; the rest waits for the next run'; console.log(note); return null; }
    if (!r.ok) return null; return r.json().catch(() => null);
  }
  // 1. ticker -> SEC number (CIK), refreshed weekly
  if (!cache.ciks || !cache.ciksAt || Date.now() - Date.parse(cache.ciksAt) > 7 * 864e5) {
    const j = await sec(SEC_WWW + '/files/company_tickers.json');
    if (j) { const m = {}; for (const x of Object.values(j)) if (x && x.ticker) m[String(x.ticker).toUpperCase().replace(/-/g, '.')] = [x.cik_str, String(x.title || '').slice(0, 60)]; cache.ciks = m; cache.ciksAt = new Date().toISOString(); }
  }
  const secStatus = (ok, why) => fs.writeFileSync('data/sec-status.json', JSON.stringify({ at: new Date().toISOString(), ok, why, contact: /noreply/.test(UA) ? 'no-reply address (add the secret SEC_UA with a real email)' : 'own contact set' }));
  if (!cache.ciks) { const why = note || 'request failed'; console.log('events: no SEC ticker list (' + why + ')'); secStatus(false, why); save(); process.exit(0); }
  const sig = readJson('data/signals.json', {}), extra = readJson('data/watch-extra.json', {});
  const uni = [...new Set([...(sig.stocks || []).map(x => x.sym), ...(sig.uni || []).map(x => x.sym), ...(sig.leaders || []).map(x => x.sym), ...(Array.isArray(extra) ? extra : Object.keys(extra || {}))])].filter(s => /^[A-Z]{1,5}(\.[A-Z])?$/.test(s) && cache.ciks[s]);
  const cut = iso(Date.now() - 6 * 365 * 864e5);
  const addRows = (S, R) => {   // R = SEC columnar filings object
    const n = (R.form || []).length, have = new Set(S.ev.map(e => e.a));
    for (let k = 0; k < n; k++) { const acc = R.accessionNumber[k]; if (have.has(acc)) continue;
      const f = famsOf(R.form[k], (R.items || [])[k], S.sic); if (!f.length) continue;
      const acc0 = String(R.acceptanceDateTime[k] || ''), p = acc0.length >= 16 ? acc0.slice(0, 16) + 'Z' : String(R.filingDate[k] || '').slice(0, 10); if (!p || p.slice(0, 10) < cut) continue;   // stored in UTC with an explicit Z (older cache rows: same UTC cut without the Z; sec-time.mjs reads both as UTC)
      S.ev.push({ p, f: f.join(','), a: acc }); have.add(acc); }
    S.ev.sort((x, y) => x.p < y.p ? -1 : 1);
  };
  // 2. every stock in the scan universe: newest filings (refresh oldest first); five years of older pages once
  const order = uni.sort((a, b) => ((cache.syms[a] || {}).t || '') < ((cache.syms[b] || {}).t || '') ? -1 : 1);
  let done = 0;
  for (const sym of order) { if (calls >= MAXC || Date.now() - t0 > MAXMS || note) break;
    const S = cache.syms[sym] || (cache.syms[sym] = { cik: cache.ciks[sym][0], ev: [] }); if (S.t === iso(Date.now())) continue;
    const j = await sec(SEC_DATA + '/submissions/CIK' + String(S.cik).padStart(10, '0') + '.json'); if (!j || !j.filings) continue;
    S.sic = j.sic || S.sic || null; S.name = String(j.name || '').slice(0, 60); addRows(S, j.filings.recent || {});
    if (!S.old) { let ok = true; for (const fl of j.filings.files || []) { if (String(fl.filingTo || '') < cut) continue; const o = await sec(SEC_DATA + '/submissions/' + fl.name); if (o) addRows(S, o); else ok = false; } S.old = ok; }
    S.t = iso(Date.now()); done++; }
  // 3. FDA approvals for drug makers (openFDA, no key: 1,000 requests a day), each company weekly
  let fda = 0; const STOP = new Set(['AMERICAN', 'UNITED', 'FIRST', 'GLOBAL', 'INTERNATIONAL', 'GENERAL', 'NATIONAL', 'PACIFIC', 'NEW', 'BIO', 'PHARMA', 'THE', 'ADVANCED', 'APPLIED']);
  for (const [sym, S] of Object.entries(cache.syms)) { if (!/^283[3-6]$/.test(String(S.sic || '')) || fda >= +(env.FDA_CALLS || 150) || Date.now() - t0 > MAXMS) continue;
    if (S.fdaT && Date.now() - Date.parse(S.fdaT) < 7 * 864e5) continue;
    const tok = String(S.name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().split(/\s+/)[0] || ''; S.fdaT = new Date().toISOString(); if (tok.length < 4 || STOP.has(tok)) continue;
    let j = null; try { const r = await fetch(FDA + '/drug/drugsfda.json?search=sponsor_name:' + encodeURIComponent(tok) + '&limit=100'); fda++; j = r.ok ? await r.json() : null; } catch (e) {}
    if (!FAST) await sleep(300);
    const have = new Set(S.ev.map(e => e.a));
    for (const app of (j && j.results) || []) { if (!String(app.sponsor_name || '').toUpperCase().startsWith(tok) || /^ANDA/.test(String(app.application_number || ''))) continue;
      for (const s of app.submissions || []) { if (s.submission_status !== 'AP' || !/^\d{8}$/.test(String(s.submission_status_date || ''))) continue;
        const kind = s.submission_type === 'ORIG' ? 'FDA_APPROVAL' : s.submission_type === 'SUPPL' && /EFFICACY/i.test(String(s.submission_class_code || '')) ? 'FDA_NEW_USE' : null; if (!kind) continue;
        const d = s.submission_status_date, p = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), a = 'fda-' + app.application_number + '-' + s.submission_type + '-' + s.submission_number; if (have.has(a) || p < cut) continue;
        S.ev.push({ p, f: kind, a }); have.add(a); } }
    S.ev.sort((x, y) => x.p < y.p ? -1 : 1); }
  // 4. small public files: ticker -> [SEC number, industry code], and the last 10 days of events (for check, holdings, the nightly scan)
  const ck = {}; for (const sym of uni) ck[sym] = [cache.ciks[sym][0], (cache.syms[sym] || {}).sic || null];
  fs.writeFileSync(CIKS, JSON.stringify(ck));
  const since = iso(Date.now() - 10 * 864e5), recent = [];
  // events-recent.json `p` FORMAT: New York local time WITH its UTC offset, e.g. '2026-10-21T08:05-04:00' (EDGAR's UTC acceptance time
  // converted), or a date only 'YYYY-MM-DD'. p.slice(0, 10) is the New York calendar date (scan.mjs reads that); Date.parse(p) is exact.
  for (const [sym, S] of Object.entries(cache.syms)) for (const e of S.ev) { const p = nyStamp(e.p); if (p && p.slice(0, 10) >= since) recent.push({ sym, p, f: e.f, ms: (secNY(e.p) || {}).ms || null }); }
  recent.sort((x, y) => (x.ms || Date.parse(x.p.slice(0, 10) + 'T12:00:00Z')) < (y.ms || Date.parse(y.p.slice(0, 10) + 'T12:00:00Z')) ? 1 : -1); for (const r of recent) delete r.ms;
  fs.writeFileSync(RECENT, JSON.stringify({ updated: new Date().toISOString(), events: recent }, null, 1));
  save();
  const nev = Object.values(cache.syms).reduce((a, S) => a + S.ev.length, 0);
  secStatus(!note, note || 'ok: ' + calls + ' SEC calls');
  console.log('events: ' + Object.keys(cache.syms).length + ' stocks, ' + nev + ' events stored | today ' + done + ' stocks refreshed, ' + calls + ' SEC calls, ' + fda + ' FDA calls | ' + recent.length + ' events in the last 10 days' + (note ? ' | ' + note : '') + ' | still never fetched: ' + uni.filter(s => !(cache.syms[s] || {}).t).length);
  process.exit(0);
}

// ======================= MODE=study =======================
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('events study: no price cache'); fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t])), mid = Math.floor(T / 2), COST = 0.008;
const want = new Set(['SPY', ...Object.keys(cache.syms)]);
const bars = new Map(); D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { if (!want.has(x.T[j])) continue; let a = bars.get(x.T[j]); if (!a) bars.set(x.T[j], a = []); a.push({ t, o: x.o[j], h: x.h[j], l: x.l[j], c: x.c[j], v: x.v[j] }); } });
const spy = bars.get('SPY'), spyC = new Array(T).fill(null); if (spy) spy.forEach(b => spyC[b.t] = b.c);
const spyRet = (a, b) => spyC[a] && spyC[b] ? spyC[b] / spyC[a] - 1 : null;
const spyUp = (() => { const o = new Array(T).fill(null); let sum = 0, k = 0; const q = []; for (let t = 0; t < T; t++) { if (spyC[t] === null) continue; q.push(spyC[t]); sum += spyC[t]; if (q.length > 50) sum -= q.shift(); if (q.length === 50) o[t] = spyC[t] > sum / 50; } return o; })();   // S&P 500 above its 50 day average
const avg = (a, p) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p; } return o; };
const tAt = (d) => { for (let k = 0; k < 6; k++) { const x = k ? iso(Date.parse(d + 'T12:00:00Z') + k * 864e5) : d; if (tOf.has(x)) return { t: tOf.get(x), moved: k > 0 }; } return null; };
// reaction session (index into the stock's bars) of an event published at p (EDGAR UTC time, converted to New York by sec-time.mjs; or a date only)
function reactIdx(P, p, tHint) {
  const ny = secNY(p); if (!ny) return null;
  const a = tAt(ny.d); if (!a) return null; let i = P.idx.get(a.t); if (i === undefined) return null; const c = P.c;
  const hm = ny.hm;
  if (a.moved) return i;                                          // weekend/holiday filing: the next session reacts
  if (hm) return hm >= '16:00' ? i + 1 : i;                       // after the close -> next session; before or during -> that session
  if (tHint === 'bmo') return i; if (tHint === 'amc') return i + 1;
  if (i > 0 && c[i + 1] && c[i + 1].t === c[i].t + 1) { const g0 = Math.abs(c[i].o / c[i - 1].c - 1), g1 = Math.abs(c[i + 1].o / c[i].c - 1); if (g1 > g0) return i + 1; }
  return i;                                                        // time unknown: the session with the bigger opening gap
}
function tradeMA(c, e, stop, ma, hold) {   // stop first (gaps fill at the open); then a close under the 20 day average (sell next open); else the close after `hold` sessions
  for (let j = e; j < c.length && c[j].t <= c[e].t + hold - 1; j++) { const b = c[j];
    if (j > e && b.o <= stop) return { exit: b.o, j }; if (b.l <= stop) return { exit: stop, j };
    if (ma[j] && b.c < ma[j]) { const n = c[j + 1]; if (!n) return null; return { exit: n.o, j: j + 1 }; } }
  let j = e; while (j + 1 < c.length && c[j + 1].t <= c[e].t + hold - 1) j++; return c[j].t === c[e].t + hold - 1 || c[j + 1] ? { exit: c[j].c, j } : null;
}
const RULE = { minUp: 0.03, minLoc: 0.5, maxGap: 0.03, maxStop: 0.15, exitMA: 20, hold: 40, minPx: 5, minDv: 5e6, drift: 20, ctrl: 3 };
const confirmed = (c, i) => { const b = c[i], p = c[i - 1]; if (!b || !p || b.t !== p.t + 1) return false; const up = b.c / p.c - 1, loc = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5; return up >= RULE.minUp && loc >= RULE.minLoc && b.c >= RULE.minPx && b.c * b.v >= RULE.minDv; };
function confTrade(P, i, dly = 0) {   // the confirmed trade after reaction bar i (dly = sessions of extra delay before buying), or null
  const c = P.c, b = c[i], n1 = c[i + 1 + dly]; if (!n1 || n1.t !== b.t + 1 + dly) return null; const e = n1.o, stop = b.l * 0.995;
  if (!(e > stop) || (e - stop) / e > RULE.maxStop || e > b.c * (1 + RULE.maxGap)) return null;
  const r = tradeMA(c, i + 1 + dly, stop, P.m20, RULE.hold); if (!r) return null; return { t: n1.t, gross: r.exit / e - 1, spy: spyRet(n1.t, c[r.j].t), jEnd: r.j, up: spyUp[n1.t] === true };
}
// per stock: bars, index, 20 day average, and the sessions of its earnings releases (kept out of the other tests)
const ESx = (() => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync('data/earnings-cache.json.gz')).toString()).syms || {}; } catch (e) { return {}; } })();
const PS = new Map();
for (const [sym, S] of Object.entries(cache.syms)) { const c = bars.get(sym); if (!c || c.length < 60) continue;
  const P = { c, idx: new Map(c.map((b, i) => [b.t, i])), m20: avg(c.map(x => x.c), 20), earn: new Set(), fam: {} }; PS.set(sym, P);
  P.wk = {};
  for (const e of S.ev) { const i = reactIdx(P, e.p); if (i === null || i < 25 || !c[i]) continue; const ny = secNY(e.p), wd = new Date((ny ? ny.d : e.p.slice(0, 10)) + 'T12:00:00Z').getUTCDay(), late = wd === 6 || wd === 0 || (wd === 5 && !!ny && !!ny.hm && ny.hm >= '16:00');   // New York clock
    for (const f of e.f.split(',')) { if (f === 'EARN') { for (let k = -2; k <= 2; k++) if (c[i + k]) P.earn.add(c[i + k].t); continue; } (P.fam[f] || (P.fam[f] = [])).push(i); if (late) (P.wk[f] || (P.wk[f] = new Set())).add(i); } }
  for (const r of ESx[sym] || []) { const i = reactIdx(P, r.d, r.t); if (i !== null && c[i]) for (let k = -2; k <= 2; k++) if (c[i + k]) P.earn.add(c[i + k].t); }
  // earnings acceleration from the EPS history: year-on-year growth 25%+ and faster than the quarter before
  const R = (ESx[sym] || []).filter(r => isFinite(r.a)), g = (k) => k >= 4 && Math.abs(R[k - 4].a) >= 0.05 ? (R[k].a - R[k - 4].a) / Math.abs(R[k - 4].a) : null;
  for (let k = 5; k < R.length; k++) { const g1 = g(k), g0 = g(k - 1); if (g1 === null || g0 === null || !(g1 >= 0.25 && g1 > g0 && g0 > 0 && R[k].a > 0)) continue;
    const i = reactIdx(P, R[k].d, R[k].t); if (i !== null && i >= 25 && c[i]) (P.fam.EPS_ACCEL || (P.fam.EPS_ACCEL = [])).push(i); } }
// control pools: on each session, the stocks that moved the same way (confirmed) WITHOUT the news; one pool on plain days, one on earnings days
const poolPlain = new Map(), poolEarn = new Map();
for (const [sym, P] of PS) { const c = P.c; for (let i = 25; i < c.length - 1; i++) { if (!confirmed(c, i)) continue; const pool = P.earn.has(c[i].t) ? poolEarn : poolPlain; let a = pool.get(c[i].t); if (!a) pool.set(c[i].t, a = []); a.push(sym); } }
const ALL = [...PS.keys()];
const hash = (s) => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };
function stats(a, cost) { if (!a.length) return { n: 0 }; const p = a.map(x => x.gross - cost), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sum = z => z.reduce((x, y) => x + y, 0), sp = a.filter(x => x.spy !== null).map(x => x.spy);
  return { n: p.length, win: w.length / p.length, avg: sum(p) / p.length, pf: l.length && sum(l) < 0 ? sum(w) / -sum(l) : w.length ? 99 : null, spy: sp.length ? sum(sp) / sp.length : null, bestShare: sum(w) > 0 ? Math.max(...w) / sum(w) : null }; }
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const older = a => a.filter(x => x.t < mid), newer = a => a.filter(x => x.t >= mid);
const FR = {};
for (const code of Object.keys(FAM)) {
  const trades = [], ctrl = [], drift = [], d0 = [], late = [], delayed = [];
  for (const [sym, P] of PS) { const L = P.fam[code]; if (!L) continue; const c = P.c; let free = -1;
    for (const i of [...new Set(L)].sort((x, y) => x - y)) {
      if (code !== 'EPS_ACCEL' && P.earn.has(c[i].t)) continue;                       // earnings days are kept out
      const b = c[i], p = c[i - 1]; if (!b || !p || b.t !== p.t + 1) continue;
      // RAW: what the stock did after the news, against the S&P 500 (bought at the next open, 20 sessions)
      const e = c[i + 1], x = c[i + RULE.drift]; if (e && x && e.t === b.t + 1 && b.c >= 2 && b.c * b.v >= 1e6) { const s = spyRet(e.t, x.t), s0 = spyRet(p.t, b.t);
        // compared with 3 random other stocks over the SAME days (an ordinary stock also lags the S&P 500 at times)
        const cx = []; for (let k = 0, h0 = hash(code + sym + b.t); k < 9 && cx.length < 3; k++) { const s2 = ALL[(h0 + k * 7919) % ALL.length]; if (s2 === sym) continue; const Q = PS.get(s2), a = Q.idx.get(e.t), z = a === undefined ? undefined : Q.c[a + RULE.drift - 1]; if (a === undefined || !z || z.t !== x.t) continue; cx.push(z.c / Q.c[a].o - 1); }
        if (s !== null && cx.length) { const dx = { t: e.t, ex: x.c / e.o - 1 - s, vs: x.c / e.o - 1 - mean(cx) }; drift.push(dx); if (P.wk[code] && P.wk[code].has(i)) late.push(dx); } if (s0 !== null) d0.push(b.c / p.c - 1 - s0); }
      // CONFIRMED: the news AND a strong reaction day, traded with the fixed rule; one trade at a time per stock
      if (i <= free || !confirmed(c, i)) continue; const tr = confTrade(P, i); if (!tr) continue; trades.push({ sym, ...tr }); free = tr.jEnd; { const td = confTrade(P, i, 1); if (td) delayed.push({ sym, ...td }); }
      // matched controls: up to 3 stocks that moved the same way that day without this news (and without any of its own news of this kind near it)
      const pool = ((code === 'EPS_ACCEL' ? poolEarn : poolPlain).get(b.t) || []).filter(s => s !== sym).sort((u, v) => hash(u + b.t + code) - hash(v + b.t + code));
      let got = 0; for (const s of pool) { if (got >= RULE.ctrl) break; const Q = PS.get(s); if ((Q.fam[code] || []).some(k => Math.abs(Q.c[k].t - b.t) <= 10)) continue; const k = Q.idx.get(b.t); const ct = k !== undefined ? confTrade(Q, k) : null; if (ct) { ctrl.push({ sym: s, ...ct }); got++; } } } }
  const R = { older: stats(older(trades), COST), newer: stats(newer(trades), COST), stress: stats(newer(trades), COST + 0.004), last12: stats(trades.filter(x => x.t >= T - 252), COST), ctrlOlder: stats(older(ctrl), COST), ctrlNewer: stats(newer(ctrl), COST) };
  const dh = (a) => ({ n: a.length, avg: mean(a.map(x => x.ex)), vs: mean(a.map(x => x.vs)), med: med(a.map(x => x.vs)) }), DR = { older: dh(older(drift)), newer: dh(newer(drift)), d0: mean(d0), lateFriday: dh(late) };
  // REPORT-ONLY checks (never change the verdict by themselves except the 2-best-trades check): bought one day later; by market; without the 2 best trades
  { const nw = newer(trades), net = nw.map(x => x.gross - COST).sort((u, v) => v - u); R.noTop2 = net.length > 2 ? net.slice(2).reduce((u, v) => u + v, 0) / (net.length - 2) : null;
    R.delayed = stats(newer(delayed), COST); R.risingMkt = stats(nw.filter(x => x.up), COST); R.fallingMkt = stats(nw.filter(x => !x.up), COST); }
  // BUY verdict (confirmed trades): same bar as the earnings-drift test, PLUS it must beat stocks that moved the same way without the news
  const why = []; let verdict = 'PROMISING';
  if ((R.older.n || 0) < 30 || (R.newer.n || 0) < 30) { verdict = 'NOT PROVEN'; why.push('too few trades yet (' + (R.older.n || 0) + ' older, ' + (R.newer.n || 0) + ' newer; 30 each needed)'); }
  else { if (!(R.older.avg > 0)) why.push('lost money in the older half'); if (!(R.newer.avg > 0)) why.push('lost money in the newer half'); if (!(R.stress.avg > 0)) why.push('loses at 1.2% cost');
    if (!((R.newer.pf || 0) > 1.2)) why.push('profit factor ' + (R.newer.pf ? R.newer.pf.toFixed(2) : 'n/a')); if (R.newer.spy !== null && !(R.newer.avg > R.newer.spy)) why.push('no better than the S&P 500 over the same days');
    if (!(R.ctrlNewer.n >= 30 && R.newer.avg > R.ctrlNewer.avg + 0.005 && R.older.avg > (R.ctrlOlder.avg || 0))) why.push('not clearly better than stocks that jumped the same way WITHOUT this news (' + pc(R.newer.avg) + ' vs ' + pc(R.ctrlNewer.avg) + ')');
    if (R.last12.n >= 10 && !(R.last12.avg > 0)) why.push('lost money in the last 12 months'); if (R.newer.bestShare > 0.5) why.push('one trade made half the gains'); if (R.noTop2 !== null && !(R.noTop2 > 0)) why.push('loses without its 2 best trades');
    if (why.length) verdict = R.newer.avg > 0 && R.older.avg > 0 ? 'NOT PROVEN' : 'REJECTED'; }
  // WARNING verdict (raw drift): over the next 20 sessions the stock lagged BOTH the S&P 500 and random stocks over the same days by 1%+,
  // in BOTH halves (average and median), 30+ cases each
  const warn = DR.older.n >= 30 && DR.newer.n >= 30 && ['older', 'newer'].every(h => DR[h].avg < -0.01 && DR[h].vs < -0.01 && DR[h].med < 0);
  FR[code] = { name: FAM[code].name, sign: FAM[code].sign, verdict: FAM[code].sign < 0 ? 'NOT TESTED AS A BUY' : verdict, why: FAM[code].sign < 0 ? 'a warning type' : why.join('; ') || 'passed both halves, stress cost, the last 12 months, the S&P 500 and the matched stocks', warn, results: R, drift: DR };
}

// ---- SUPPLY CHAIN: when an industry is among the hottest 20% (3 months), do the industries that supply it, not yet moved, beat the market next month?
const LINK = (() => {
  const sic = store.sic || {}, known = Object.values(sic).filter(Boolean).length; if (known < 300) return { verdict: 'NOT RUN: industry codes still loading (' + known + ' known)' };
  const indOf = (s) => sic[s] ? String(sic[s].c).slice(0, 3) : null, lastC = new Map(), I = {}, M = new Array(T).fill(1), cnt = {};
  let mi = 1;
  for (let t = 0; t < T; t++) { const x = store.days[D[t]], sums = {}, ns = {}; let ms = 0, mn = 0;
    for (let j = 0; j < x.T.length; j++) { const s = x.T[j], cl = x.c[j], prev = lastC.get(s); lastC.set(s, { c: cl, t });
      if (!prev || prev.t !== t - 1 || !(cl >= 5) || !(prev.c > 0) || cl * x.v[j] < 2e6) continue; const r = Math.max(-0.5, Math.min(0.5, cl / prev.c - 1)); ms += r; mn++;
      const g = indOf(s); if (!g) continue; sums[g] = (sums[g] || 0) + r; ns[g] = (ns[g] || 0) + 1; }
    mi *= 1 + (mn ? ms / mn : 0); M[t] = mi;
    for (const g of Object.keys(sums)) { if (!I[g]) { I[g] = new Array(T).fill(null); cnt[g] = new Array(T).fill(0); } }
    for (const g of Object.keys(I)) { const prev = t ? I[g][t - 1] : null, r = ns[g] >= 5 ? sums[g] / ns[g] : 0; I[g][t] = (prev === null ? 1 : prev) * (1 + r); cnt[g][t] = ns[g] || 0; } }
  const linked = [], base = [], perPair = {};
  for (let t = 126; t + 21 < T; t += 21) {
    const live = Object.keys(I).filter(g => cnt[g][t] >= 5 && I[g][t - 63]), mom = Object.fromEntries(live.map(g => [g, I[g][t] / I[g][t - 63] - 1]));
    const rk = [...live].sort((a, b) => mom[b] - mom[a]), hot = new Set(rk.slice(0, Math.ceil(rk.length * 0.2))), moved = new Set(rk.slice(0, Math.ceil(rk.length * 0.4)));
    const ex = (g) => I[g][t + 21] / I[g][t] - 1 - (M[t + 21] / M[t] - 1), down = new Set();
    for (const [a, b, name] of LINKS) if (hot.has(a) && mom[b] !== undefined && !moved.has(b)) { down.add(b); const e = ex(b); linked.push({ t, ex: e }); (perPair[name] || (perPair[name] = [])).push({ t, ex: e }); }
    for (const g of live) if (!moved.has(g) && !down.has(g)) base.push({ t, ex: ex(g) }); }
  const h = (a, f) => { const z = a.filter(f).map(x => x.ex); return { n: z.length, avg: mean(z) }; }, o = x => x.t < mid, nw = x => x.t >= mid;
  const L = { older: h(linked, o), newer: h(linked, nw) }, B = { older: h(base, o), newer: h(base, nw) }, why = [];
  let verdict = 'PROMISING';
  if (L.older.n < 30 || L.newer.n < 30) { verdict = 'NOT PROVEN'; why.push('too few cases (' + L.older.n + ' older, ' + L.newer.n + ' newer)'); }
  else { for (const k of ['older', 'newer']) { if (!(L[k].avg > 0)) why.push('lagged the market in the ' + k + ' half'); if (!(L[k].avg > B[k].avg + 0.005)) why.push('not better than other not-yet-moved industries in the ' + k + ' half'); }
    if (why.length) verdict = L.older.avg > 0 && L.newer.avg > 0 ? 'NOT PROVEN' : 'REJECTED'; }
  // now: hot upstream industries and their suppliers that have not moved yet, with their strongest liquid stocks
  const t = T - 1, live = Object.keys(I).filter(g => cnt[g][t] >= 5 && I[g][t - 63]), mom = Object.fromEntries(live.map(g => [g, I[g][t] / I[g][t - 63] - 1]));
  const rk = [...live].sort((a, b) => mom[b] - mom[a]), hot = new Set(rk.slice(0, Math.ceil(rk.length * 0.2))), moved = new Set(rk.slice(0, Math.ceil(rk.length * 0.4)));
  const nameOf = (g) => { for (const v of Object.values(sic)) if (v && String(v.c).slice(0, 3) === g) return v.n; return 'industry ' + g; };
  const now = [], X = store.days[D[t]], Y = store.days[D[t - 21]], yAt = new Map(Y.T.map((s, k) => [s, Y.c[k]]));
  for (const [a, b, name] of LINKS) { if (!hot.has(a) || mom[b] === undefined || moved.has(b)) continue;
    const mem = []; for (let j = 0; j < X.T.length; j++) { const s = X.T[j]; if (indOf(s) !== b || !(X.c[j] >= 5) || X.c[j] * X.v[j] < 5e6 || !yAt.get(s)) continue; mem.push({ s, r: X.c[j] / yAt.get(s) - 1 }); }
    mem.sort((x, y) => y.r - x.r);
    now.push({ link: name, up: nameOf(a), upMom: mom[a], down: nameOf(b), downMom: mom[b], stocks: mem.slice(0, 4).map(x => x.s) }); }
  return { verdict, why: why.join('; ') || 'suppliers of hot industries beat the market and other lagging industries in both halves', linked: L, base: B,
    pairs: Object.entries(perPair).map(([k, a]) => ({ link: k, older: h(a, o), newer: h(a, nw) })).sort((x, y) => (y.newer.avg || 0) - (x.newer.avg || 0)), now };
})();

// ---- PEER LAG (from the outside reviews; fixed in advance): when one of the 3 biggest stocks of an industry (SIC, first 3 digits,
// by 20 day dollar volume) jumps 6%+ on 2.5x its normal volume, do the industry's other liquid stocks that moved less than 1.5% that
// day catch up? Bought the next open, sold at the close 3 sessions later, 0.8% cost. Compared with the same kind of laggard stocks
// in OTHER industries on the same days (so a strong market day is not mistaken for a catch-up).
const PEER = (() => {
  const sic = store.sic || {}; if (Object.values(sic).filter(Boolean).length < 300) return { verdict: 'NOT RUN: industry codes still loading' };
  const indOf = (s) => sic[s] ? String(sic[s].c).slice(0, 3) : null, hist = new Map(), sig = [], ctl = [];
  const rowsAt = (t) => { const x = store.days[D[t]], m = new Map(); for (let j = 0; j < x.T.length; j++) m.set(x.T[j], { o: x.o[j], c: x.c[j], v: x.v[j] }); return m; };
  let prev = null, cur = rowsAt(0);
  const fwd = []; for (let t = 1; t < Math.min(T, 4); t++) fwd.push(rowsAt(t));
  for (let t = 1; t + 3 < T; t++) { prev = cur; cur = fwd.shift(); fwd.push(rowsAt(t + 3));
    const groups = {}, info = [];
    for (const [s, b] of cur) { const p = prev.get(s), H = hist.get(s); if (p && H && H.n >= 15 && b.c >= 5 && p.c > 0) { const r = b.c / p.c - 1, avgV = H.v / H.n, avgDv = H.dv / H.n, g = indOf(s); if (g && avgDv >= 5e6) { const it = { s, r, vr: b.v / avgV, dv: avgDv }; info.push(it); (groups[g] || (groups[g] = [])).push(it); } } }
    const n1 = fwd[0], n3 = fwd[2], ret = (s) => { const a = n1.get(s), z = n3.get(s); return a && z && a.o > 0 ? z.c / a.o - 1 - 0.008 : null; };
    const hot = new Set();
    for (const [g, L] of Object.entries(groups)) { if (L.length < 5) continue; const top = [...L].sort((a, b) => b.dv - a.dv).slice(0, 3);
      if (!top.some(x => x.r >= 0.06 && x.vr >= 2.5)) continue; hot.add(g); const lead = new Set(top.map(x => x.s));
      for (const x of L) { if (lead.has(x.s) || !(x.r < 0.015 && x.r > -0.03)) continue; const v = ret(x.s); if (v !== null && isFinite(v) && v < 2) sig.push({ t, g, s: x.s, v }); } }
    if (hot.size) for (const x of info) { const g = indOf(x.s); if (hot.has(g) || !(x.r < 0.015 && x.r > -0.03)) continue; if (hash(x.s + t) % 20) continue; const v = ret(x.s); if (v !== null && isFinite(v) && v < 2) ctl.push({ t, v }); }
    for (const [s, b] of cur) { const H = hist.get(s) || { q: [], v: 0, dv: 0, n: 0 }; H.q.push([b.v, b.v * b.c]); H.v += b.v; H.dv += b.v * b.c; H.n++; if (H.q.length > 20) { const [ov, od] = H.q.shift(); H.v -= ov; H.dv -= od; H.n--; } hist.set(s, H); } }
  const st = (a) => ({ n: a.length, avg: mean(a.map(x => x.v)), win: a.length ? a.filter(x => x.v > 0).length / a.length : null }), o = (x) => x.t < mid, w = (x) => x.t >= mid;
  const R = { older: st(sig.filter(o)), newer: st(sig.filter(w)), ctrlOlder: st(ctl.filter(o)), ctrlNewer: st(ctl.filter(w)), stress: st(sig.filter(w).map(x => ({ ...x, v: x.v - 0.004 }))), days: new Set(sig.map(x => x.t)).size }, why = [];
  { const net = sig.filter(w).map(x => x.v).sort((u, v) => v - u); R.noTop2 = net.length > 2 ? net.slice(2).reduce((u, v) => u + v, 0) / (net.length - 2) : null; }
  let verdict = 'PROMISING';
  if (R.older.n < 30 || R.newer.n < 30) { verdict = 'NOT PROVEN'; why.push('too few cases (' + R.older.n + ' / ' + R.newer.n + ')'); }
  else { for (const h of ['older', 'newer']) { if (!(R[h].avg > 0)) why.push('lost money in the ' + h + ' half'); if (!(R[h].avg > (R['ctrl' + h[0].toUpperCase() + h.slice(1)].avg || 0) + 0.005)) why.push('not better than laggards in other industries (' + h + ' half)'); }
    if (!(R.stress.avg > 0)) why.push('loses at 1.2% cost'); if (R.noTop2 !== null && !(R.noTop2 > 0)) why.push('loses without its 2 best trades'); if (R.days < 30) why.push('only ' + R.days + ' different days');
    if (why.length) verdict = R.older.avg > 0 && R.newer.avg > 0 ? 'NOT PROVEN' : 'REJECTED'; }
  return { verdict, why: why.join('; ') || 'laggards in a leader’s industry beat laggards elsewhere in both halves, at stress cost, without their 2 best trades', results: R };
})();

const nev = Object.values(cache.syms).reduce((a, S) => a + S.ev.length, 0);
// RUN ONCE. A family (and the supply-chain and peer tests) is judged once: its first run with 30+ cases in both halves, AFTER the SEC
// history is complete (90%+ of companies with their full 5-year filing history) and after the SEC-time fix of 22 Oct 2026, is frozen
// in firstRun and never overwritten. Until then its verdict reads 'NO VERDICT YET' and it drives nothing live (no buy, no warning).
// This run's numbers go to `latest` (MONITORING ONLY). scan.mjs reads the top-level fam/link/peer, which carry the frozen verdicts.
const nSym = Object.keys(cache.syms).length, covOld = nSym ? Object.values(cache.syms).filter(S => S.old).length / nSym : 0, COMPLETE = covOld >= 0.9;
const PREVO = readJson(OUT, {}) || {}, PF = PREVO.firstRun || {};
const famJudged = (x) => x.sign < 0 ? !!(x.drift && x.drift.older && x.drift.newer && x.drift.older.n >= 30 && x.drift.newer.n >= 30) : ((x.results.older || {}).n || 0) >= 30 && ((x.results.newer || {}).n || 0) >= 30;
const testJudged = (x) => !!x && !/^NOT RUN/.test(x.verdict || '') && !/too few/i.test(x.why || '');
const FF = COMPLETE ? freezeEach(PF.fam, FR, famJudged) : { ...(PF.fam || {}) };
const FL = PF.link || (COMPLETE && testJudged(LINK) ? { ...LINK, frozenAt: new Date().toISOString() } : null), FP = PF.peer || (COMPLETE && testJudged(PEER) ? { ...PEER, frozenAt: new Date().toISOString() } : null);
const noVerdict = (x) => ({ ...x, verdict: 'NO VERDICT YET (this run: ' + x.verdict + ')', warn: false });
const FAMOUT = Object.fromEntries(Object.keys(FR).map(k => [k, FF[k] || noVerdict(FR[k])])), LINKOUT = FL ? { ...FL, now: LINK.now } : noVerdict(LINK), PEEROUT = FP || noVerdict(PEER);
const firstRun = Object.keys(FF).length || FL || FP ? { at: PF.at || new Date().toISOString(), coverage: PF.coverage || +covOld.toFixed(3), fam: FF, link: FL, peer: FP } : null;
const out = { generatedAt: new Date().toISOString(), status: 'OK', from: D[0], to: D[T - 1], stocks: PS.size, events: nev, secHistoryComplete: +covOld.toFixed(3), rule: RULE, fam: FAMOUT, link: LINKOUT, peer: PEEROUT,
  firstRun, latest: latestBlock({ at: new Date().toISOString(), to: D[T - 1], coverage: +covOld.toFixed(3), fam: FR, link: LINK, peer: PEER }),
  map: { item: ITEM, bioSic: '2833-2836, 8731', forms: { ACTIVIST: ['SC 13D', 'SCHEDULE 13D'], OFFERING: ['424B4', '424B5'] } } };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const line = s => !s || !s.n ? 'no trades' : s.n + ' trades, ' + Math.round(s.win * 100) + '% won, avg ' + pc(s.avg);
const pass = Object.entries(FAMOUT).filter(([, x]) => x.verdict === 'PROMISING'), warns = Object.entries(FAMOUT).filter(([, x]) => x.warn);
const msg = ['EVENT STUDY (company news -> what the stock did next), fair test ' + D[T - 1], PS.size + ' stocks, ' + nev + ' SEC/FDA events, prices ' + D[0] + ' to ' + D[T - 1] + '.', '',
  'BUY IDEAS (news + a strong reaction day, bought the next open, sold under the 20 day average or after 40 sessions; must beat stocks that jumped the same way without the news):',
  ...Object.entries(FAMOUT).filter(([, x]) => x.sign >= 0).map(([k, x]) => '- ' + x.name + ': ' + x.verdict + ' | newer ' + line((x.results.newer || {})) + ' | without the news ' + ((x.results.ctrlNewer || {}).n ? pc(x.results.ctrlNewer.avg) : 'n/a')), '',
  'WARNINGS (over the next 20 sessions the stock lagged the market AND random stocks by 1%+, both halves):', ...(warns.length ? warns.map(([, x]) => '- ' + x.name + ': ' + pc(x.drift.older.vs) + ' / ' + pc(x.drift.newer.vs) + ' vs other stocks (' + x.drift.newer.n + ' newer cases)') : ['- none proven yet']), '',
  'PEER LAG (industry leader jumps 6%+, laggard peers bought next day, 3 sessions): ' + PEEROUT.verdict + (PEEROUT.results ? ' | newer ' + PEEROUT.results.newer.n + ' trades, ' + pc(PEEROUT.results.newer.avg) + ' vs other laggards ' + pc(PEEROUT.results.ctrlNewer.avg) : '') + (PEEROUT.why ? '. ' + PEEROUT.why : '') + '.',
  'SUPPLY CHAIN: ' + LINKOUT.verdict + (LINKOUT.why ? '. ' + LINKOUT.why : '') + '.', ...(LINKOUT.now || []).slice(0, 5).map(x => '- ' + x.up + ' is hot (' + pc(x.upMom, 0) + ' in 3 months) -> ' + x.down + ' not yet (' + pc(x.downMom, 0) + '): ' + x.stocks.join(', ')), '',
  pass.length ? 'PASSED: ' + pass.map(([, x]) => x.name).join('; ') + '. These now go on the nightly list as "event drift" buys (paper account follows them too).' : 'Nothing passed yet, so nothing changes in your ACTIONS. The test repeats every Sunday as the SEC history fills in.',
  'Research, not an order. Not financial advice, not a halal ruling.'];
console.log(msg.join('\n'));
if (env.TG_TOKEN && env.TG_CHAT && (!QUIET || pass.length || warns.length)) await telegramFetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n'), disable_web_page_preview: true }) }).catch(() => {});
