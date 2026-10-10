// Cloud scanner for the US stock signal board. Runs on GitHub Actions (free), so it works while your phone is off.
// It reuses the exact rules inside index.html, writes data/signals.json and an append-only journal, and sends Telegram alerts.
// Read only: it holds no broker login and cannot trade.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const env = process.env, MODE = env.MODE === 'intraday' ? 'intraday' : env.MODE === 'chat' ? 'chat' : 'daily', RATE = Math.max(1, parseInt(env.RATE || '8', 10) || 8);
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', FMPB = local(env.FMP_BASE) || 'https://financialmodelingprep.com';
const MV_HOSTS = local(env.MASSIVE_BASE) ? [local(env.MASSIVE_BASE)] : ['https://api.massive.com', 'https://api.polygon.io'];
const TD = local(env.TD_BASE) || 'https://api.twelvedata.com', TG = local(env.TG_BASE) || 'https://api.telegram.org', FAST = Boolean(local(env.TD_BASE));
if (!env.TWELVE_KEY) { console.error('Missing secret TWELVE_KEY'); process.exit(1); }

// The rules come from the page itself, so the page and the scanner can never disagree.
const html = fs.readFileSync('index.html', 'utf8'), m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
if (!m) { console.error('index.html has no logic block. Upload the latest index.html first.'); process.exit(1); }
const tmp = path.join(os.tmpdir(), 'logic-' + Date.now() + '.cjs'); fs.writeFileSync(tmp, m[1]);
const L = createRequire(import.meta.url)(tmp);

const readJson0 = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const DEFAULT = 'SPY QQQ IWM DIA AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO AMD NFLX ORCL CRM JPM BAC V MA UNH LLY JNJ XOM CVX WMT COST HD PG KO PEP DIS'.split(' ');
const fromFile = fs.existsSync('watchlist.txt') ? fs.readFileSync('watchlist.txt', 'utf8').toUpperCase().split(/[\s,]+/).filter(s => /^[A-Z.\-]{1,8}$/.test(s)) : [];
// Candidates from the discovery engine are tested automatically, so a Buy watch with prices is sent if a tested rule fires on one.
let DISC = new Set(), BIOBLOCK = new Map(), DISCMETA = null;
try { DISCMETA = JSON.parse(fs.readFileSync('data/discovery.json', 'utf8')); const cs = DISCMETA.candidates || []; DISC = new Set(cs.map(c => c.sym).filter(x => /^[A-Z.\-]{1,8}$/.test(x))); for (const c of cs) { if (c.bio && (c.bio.risk === 'high' || c.bio.risk === 'unknown')) BIOBLOCK.set(c.sym, c.bio.text); else if (c.hardBlock) BIOBLOCK.set(c.sym, 'dilution: ' + String(c.hardBlock).slice(0, 120)); } } catch {}
// YOUR HALAL MARKS from ZAD: "halal BFLY no" blocks it everywhere (plan, radar, checks); "halal BFLY yes" marks it as checked.
const HALAL_FILE = 'data/halal.json', HALAL_DAYS = 90;
// FILTERING POLICY: only YOUR OWN ZAD marks ever remove a stock. Every other screen (the built-in list, Zoya, Halal Terminal,
// HalalScreener) is SHOWN on the card as information, never used to drop a stock: platforms rule differently, you decide.
const myHalal = (sym) => { const m = HALALM()[sym]; return m && (m.s === 'fail' || m.s === 'ok') ? m.s : 'unknown'; };
// your ZAD marks. A NOT HALAL mark counts for 90 days, then expires: companies change their debt and income every quarter, so a
// stock can become halal again. When an expired one shows up as a buy, the card asks you to check it in ZAD again.
const HALALM = () => { const m = readJson0(HALAL_FILE) || {}, out = {}; for (const [k, v] of Object.entries(m)) out[k] = v && (v.s === 'fail' || v.s === 'ok') && v.d && Date.now() - Date.parse(v.d) > HALAL_DAYS * 86400000 ? { ...v, was: v.s, s: 'expired' } : v; return out; };
// ZOYA (AAOIFI) halal pre-check. Secret ZOYA_KEY holds the key WITH its prefix ("live-..." or "sandbox-..."). Each stock on
// the buy list is checked about weekly and remembered in data/zoya.json. The result is SHOWN only, never used to drop a stock
// from the buy list; your own ZAD mark always wins. Sandbox data are dummy values: shown, never acted on.
const ZOYA_FILE = 'data/zoya.json', ZOYAM = () => readJson0(ZOYA_FILE) || {};
const zoyaLive = () => /^live-/.test(env.ZOYA_KEY || '');
async function zoyaCheck(syms) {
  if (!env.ZOYA_KEY) return 0;
  const url = local(env.ZOYA_BASE) ? local(env.ZOYA_BASE) + '/graphql' : (zoyaLive() ? 'https://api.zoya.finance/graphql' : 'https://sandbox-api.zoya.finance/graphql'), Z = ZOYAM(); let n = 0;
  for (const sym of [...new Set(syms)].slice(0, 40)) {
    const old = Z[sym]; if (old && Date.now() - Date.parse(old.at) < 7 * 86400000 && old.live === zoyaLive()) continue;   // re-checked weekly: a status can change after new financial statements
    for (let a = 0; a < 2; a++) try { const r = await fetch(url, { method: 'POST', headers: { 'Authorization': env.ZOYA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query { basicCompliance { report(symbol: "' + sym + '") { symbol status purificationRatio reportDate } } }' }) });
      if (!r.ok) { console.log('Zoya: HTTP ' + r.status + ' for ' + sym); if (r.status === 401 || r.status === 403) break; continue; }
      const j = await r.json(), rep = j && j.data && j.data.basicCompliance ? j.data.basicCompliance.report : null;
      Z[sym] = { s: rep ? String(rep.status || 'UNRATED') : 'UNRATED', p: rep && typeof rep.purificationRatio === 'number' ? rep.purificationRatio : null, d: rep ? rep.reportDate : null, at: new Date().toISOString(), live: zoyaLive() }; n++; break;
    } catch (e) { console.log('Zoya: ' + e.message + (a ? '' : ', retrying')); await sleep(FAST ? 5 : 2000); }
    await sleep(FAST ? 0 : 300);
  }
  fs.writeFileSync(ZOYA_FILE, JSON.stringify(Z, null, 1)); return n;
}
// MORE HALAL PRE-CHECKS: Halal Terminal (secret HALALTERMINAL_KEY, free key about 50 checks a month) and HalalScreener.app
// (secret HALALSCREENER_KEY). Same rules as Zoya: each stock at most once every 30 days, results in data/halal-ext.json.
const HEXT_FILE = 'data/halal-ext.json', HEXTM = () => readJson0(HEXT_FILE) || {};
const verdictOf = (j) => {   // tolerant reading of a provider's answer: true = passes, false = fails, null = unknown
  if (!j || typeof j !== 'object') return null; const o = j.data && typeof j.data === 'object' ? j.data : j.result && typeof j.result === 'object' ? j.result : j;
  for (const k of ['aaoifi_compliant', 'is_compliant', 'compliant', 'isCompliant', 'shariah_compliant', 'halal']) if (typeof o[k] === 'boolean') return o[k];
  const st = String(o.status || o.compliance || o.compliance_status || o.verdict || o.rating || '').toUpperCase();
  if (/NOT|NON|FAIL|HARAM|NO_?PASS/.test(st)) return false; if (/^(COMPLIANT|HALAL|PASS|YES)/.test(st)) return true; return null; };
async function halalExtCheck(syms) {
  const SRC = [];
  if (env.HALALTERMINAL_KEY) SRC.push({ k: 'ht', name: 'Halal Terminal', max: 10, days: 30, req: (sym) => [(local(env.HT_BASE) || 'https://api.halalterminal.com') + '/api/screen/' + encodeURIComponent(sym), { method: 'POST', headers: { 'X-API-Key': env.HALALTERMINAL_KEY, 'Content-Type': 'application/json' } }] });
  if (env.HALALSCREENER_KEY) SRC.push({ k: 'hs', name: 'HalalScreener', max: 25, days: 14, req: (sym) => [(local(env.HS_BASE) || 'https://halalscreener.app') + '/api/v1/screen?symbol=' + encodeURIComponent(sym), { headers: { 'Authorization': 'Bearer ' + env.HALALSCREENER_KEY } }] });
  if (!SRC.length) return 0; const X = HEXTM(); let n = 0;
  for (const src of SRC) { let used = 0;
    for (const sym of [...new Set(syms)]) { if (used >= src.max) break;   // free plans are small: a few new stocks a night, each remembered 30 days
      const old = X[sym] && X[sym][src.k]; if (old && Date.now() - Date.parse(old.at) < src.days * 86400000) continue;
      try { const [u, o] = src.req(sym); let r = null; for (let a = 0; a < 2 && !r; a++) { try { r = await fetch(u, o); } catch (e) { if (a) throw e; await sleep(FAST ? 5 : 2000); } } used++;
        if (r.status === 401 || r.status === 402 || r.status === 403 || r.status === 429) { console.log(src.name + ': HTTP ' + r.status + ' (key or monthly limit), stopped for tonight'); break; }
        if (!r.ok) continue; const j = await r.json().catch(() => null), v = verdictOf(j);
        X[sym] = X[sym] || {}; X[sym][src.k] = { v, pur: j && typeof (j.purification_rate ?? (j.data && j.data.purification_rate)) === 'number' ? (j.purification_rate ?? j.data.purification_rate) : null, at: new Date().toISOString() }; n++;
      } catch (e) { console.log(src.name + ': ' + e.message); }
      await sleep(FAST ? 0 : 400); } }
  fs.writeFileSync(HEXT_FILE, JSON.stringify(X, null, 1)); return n;
}
// All halal pre-checks for one stock: { pass: [...names], fail: [...names], text }
const halalChecks = (sym) => {
  const pass = [], fail = [], unk = [], z = ZOYAM()[sym], x = HEXTM()[sym] || {};
  if (z && z.live) (z.s === 'COMPLIANT' ? pass : z.s === 'NON_COMPLIANT' ? fail : unk).push('Zoya');
  for (const [k, name] of [['ht', 'Halal Terminal'], ['hs', 'HalalScreener']]) if (x[k]) (x[k].v === true ? pass : x[k].v === false ? fail : unk).push(name);
  const parts = [...pass.map(n => n + ' PASS'), ...fail.map(n => n + ' FAIL'), ...unk.map(n => n + ' unclear')];
  return { pass, fail, text: parts.length ? 'Halal pre-checks: ' + parts.join(' | ') + (pass.length && fail.length ? '. SOURCES DISAGREE' : '') + '. Confirm in ZAD.' : null };
};
const zoyaText = (sym) => { const z = ZOYAM()[sym]; if (!z) return null; const tag = z.live ? '' : ' (SANDBOX test data, not real)';
  return 'Halal pre-check (Zoya, AAOIFI): ' + (z.s === 'COMPLIANT' ? 'COMPLIANT' : z.s === 'NON_COMPLIANT' ? 'NOT COMPLIANT' : z.s === 'QUESTIONABLE' ? 'QUESTIONABLE (cannot decide)' : 'not rated') + (z.p ? ', purify ' + (z.p * 100).toFixed(1) + '% of gains' : '') + tag + '. Confirm in ZAD.'; };
const EXTRA_FILE = 'data/watch-extra.json', readExtra = () => { try { const a = JSON.parse(fs.readFileSync(EXTRA_FILE, 'utf8')); return Array.isArray(a) ? a.filter(x => /^[A-Z.\-]{1,8}$/.test(x)) : []; } catch { return []; } };
// Stocks the live whole-market radar flagged today (only if that feed is available): tonight's scan runs the tested rules on them.
const RADAR = (() => { const r = readJson0('data/intraday-radar.json'); return (r && r.status === 'OK' ? (r.candidates || []).filter(x => x.verdict === 'EARLY_WAVE_REVIEW').map(x => x.sym) : []).filter(x => /^[A-Z]{1,5}$/.test(x)).slice(0, 10); })();
// Names from the smart-money job (insider buying, analysts turning positive, upgrades): tested with all rules tonight.
const SMART = (() => { const r = readJson0('data/smart-money.json'); return ((r && r.picks) || []).filter(x => /^[A-Z]{1,5}$/.test(x)).slice(0, 30); })();
const MAIN = ['SPY', ...new Set([...(fromFile.length ? fromFile : DEFAULT), ...readExtra(), ...DISC, ...RADAR, ...SMART].filter(s => s !== 'SPY'))].slice(0, 1000);
// Extra large, heavily traded companies scanned for QUICK TRADES only. Short bounces behave best in liquid names.
const QEXTRA = env.NO_QUICK_EXTRA ? [] : 'ABBV ABT ACN ADBE AMAT AMGN BKNG BMY CAT COP CSCO CVS DE DHR GE GILD HON IBM INTC INTU ISRG LIN LOW MCD MDT MMM MRK NEE NKE NOW PFE QCOM SBUX SO T TGT TMO TMUS TXN UNP UPS VZ PLTR UBER SHOP PANW MU ADP SPGI TJX VRTX REGN ZTS CI ELV'.split(' ').filter(x => !MAIN.includes(x));
const FMOVERS = (() => { try { const f = JSON.parse(fs.readFileSync('data/fm-state.json', 'utf8')); return Object.keys(f.sent || {}).filter(x => /^[A-Z]{1,5}$/.test(x) && !MAIN.includes(x) && !QEXTRA.includes(x)).slice(0, 12); } catch { return []; } })();
// Whole-market leaders: the strongest liquid stocks found by the morning sweep of every US stock. Loaded so the LEADERS list can rank them.
const LEADU = (() => { const u = readJson0('data/leaders-universe.json'); return ((u && u.syms) || []).map(x => x.sym).filter(x => /^[A-Z]{1,5}$/.test(x) && !MAIN.includes(x) && !QEXTRA.includes(x) && !FMOVERS.includes(x)).slice(0, 25); })();
// WIDER HUNT: the most traded strong-trend COMPANIES from the morning whole-market sweep (funds removed), scanned for
// QUICK TRADES only. More stocks tested = more chances that a proven setup fires. Each stock is still judged only on its
// own trades the rule never saw, with the same 30-trade and after-cost rules. Set WIDE_N to change the number (0 = off).
const QWIDE = (() => { const n = env.WIDE_N !== undefined ? +env.WIDE_N || 0 : 120; if (!n) return []; const u = readJson0('data/radar-universe.json'), co = readJson0('data/companies.json'), cs = co && co.syms && co.syms.length > 3000 ? new Set(co.syms) : null;
  return ((u && u.syms) || []).map(x => x.sym).filter(x => /^[A-Z]{1,5}$/.test(x) && (!cs || cs.has(x)) && !MAIN.includes(x) && !QEXTRA.includes(x) && !FMOVERS.includes(x) && !LEADU.includes(x)).slice(0, n); })();
const BTSET = new Set([...(fromFile.length ? fromFile : DEFAULT), ...QEXTRA]);   // the past test uses only the fixed list, never stocks picked BECAUSE they already rose
const QONLY = new Set([...QEXTRA, ...FMOVERS, ...LEADU, ...QWIDE]), LEADHELD = (() => { const u = readJson0('data/leaders.json'); return ((u && u.paper) || []).map(x => x.sym).filter(x => /^[A-Z]{1,5}$/.test(x)); })(),   // leaders still being ridden on paper: always loaded, so their exits are never missed
  LIST = [...new Set([...MAIN, ...QEXTRA, ...FMOVERS, ...LEADU, ...LEADHELD, ...QWIDE])];
for (const x of LEADHELD) if (!MAIN.includes(x)) QONLY.add(x);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const money = (x) => x.toFixed(2);
fs.mkdirSync('data', { recursive: true });

function ny(ms) {
  const o = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms)).forEach(p => o[p.type] = p.value);
  return { d: o.year + '-' + o.month + '-' + o.day, mins: +o.hour * 60 + +o.minute, weekend: o.weekday === 'Sat' || o.weekday === 'Sun' };
}
const barClosed = (d, now) => { const n = ny(now); return d < n.d || (d === n.d && n.mins >= 970); };
// US stock market holidays, worked out from the exchange's standing rules (New Year, Martin Luther King Jr. Day, Presidents' Day,
// Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas, with the weekend-observance rule).
// Early closes and one-off closures are not covered.
const HOLS = {};
function usHolidays(y) {
  if (HOLS[y]) return HOLS[y];
  const d = (m, day) => new Date(Date.UTC(y, m, day)), isoD = (x) => x.toISOString().slice(0, 10);
  const nth = (m, wd, k) => { const f = d(m, 1); return d(m, 1 + (wd - f.getUTCDay() + 7) % 7 + 7 * (k - 1)); }, lastW = (m, wd) => { const l = d(m + 1, 0); return d(m, l.getUTCDate() - (l.getUTCDay() - wd + 7) % 7); };
  const obs = (x) => x.getUTCDay() === 6 ? new Date(+x - 86400000) : x.getUTCDay() === 0 ? new Date(+x + 86400000) : x;
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = d(Math.floor((h + l - 7 * m + 114) / 31) - 1, (h + l - 7 * m + 114) % 31 + 1), ny1 = d(0, 1);
  const list = [ny1.getUTCDay() === 6 ? null : obs(ny1), nth(0, 1, 3), nth(1, 1, 3), new Date(+easter - 2 * 86400000), lastW(4, 1), obs(d(5, 19)), obs(d(6, 4)), nth(8, 1, 1), nth(10, 4, 4), obs(d(11, 25))];
  return (HOLS[y] = new Set(list.filter(Boolean).map(isoD)));
}
const isHoliday = (dateStr) => usHolidays(+dateStr.slice(0, 4)).has(dateStr);
const marketOpen = (now) => { const n = ny(now); return !n.weekend && !isHoliday(n.d) && n.mins >= 570 && n.mins < 960; };

let used = 0;
async function td(pathname) {   // rate-limited Twelve Data call with one retry on a limit error
  for (let attempt = 0; attempt < 3; attempt++) {
    if (used >= RATE) { console.log('rate limit pause'); await sleep(FAST ? 5 : 61000); used = 0; }
    used++;
    let j; try { const r = await fetch(TD + pathname + '&apikey=' + encodeURIComponent(env.TWELVE_KEY)); j = await r.json(); } catch (e) { await sleep(FAST ? 5 : 3000); continue; }   // a dropped connection must not stop the run
    if (j.code === 429) { await sleep(FAST ? 5 : 61000); used = 0; continue; }
    return j;
  }
  return { status: 'error', message: 'rate limit' };
}
// Live prices: Finnhub quote first (60 calls a minute, free), so the Twelve Data daily budget is kept for the nightly
// price histories (that budget is what limits how many stocks can be tested). Twelve Data is the fallback.
let fhUsed = 0, fhStart = Date.now();
async function liveQ(sym) {
  if (env.FINNHUB_KEY) {
    if (Date.now() - fhStart > 60000) { fhStart = Date.now(); fhUsed = 0; }
    if (fhUsed >= 50) { await sleep(FAST ? 5 : Math.max(0, 61000 - (Date.now() - fhStart))); fhStart = Date.now(); fhUsed = 0; }
    fhUsed++;
    try { const r = await fetch(FH + '/quote?symbol=' + encodeURIComponent(sym) + '&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (r.ok) { const j = await r.json(); if (j && +j.c > 0) return { price: +j.c, src: 'finnhub' }; } } catch (e) {}
  }
  return td('/price?symbol=' + encodeURIComponent(sym));
}
// ---- WHOLE MARKET (paid Massive plan: unlimited calls, 5+ years of daily prices). Every liquid US company is tested every
// night with the same rules and the same proof gates as the core list. On the free plan (5 calls a minute) the first refusal
// switches this off by itself and the scan continues as before.
let mvHost = 0, mv429 = 0;
async function mv(pathq) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(MV_HOSTS[mvHost] + pathq + (pathq.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY));
      if (r.status === 429) { mv429++; if (mv429 > 6) return null; await sleep(FAST ? 5 : 3000); continue; }
      if (!r.ok) return null; return await r.json(); }
    catch (e) { if (mvHost + 1 < MV_HOSTS.length) mvHost++; else await sleep(FAST ? 5 : 1500); }
  }
  return null;
}
async function wideUniverse(already) {
  if (!env.MASSIVE_KEY || env.WIDE_ALL === '0') return [];
  const co = readJson0('data/companies.json'), cs = co && co.syms && co.syms.length > 3000 ? new Set(co.syms) : null;
  if (!cs) { console.log('whole market: no company list yet (discovery makes it), skipped'); return []; }
  const days = []; for (let k = 0; k < 10 && days.length < 5; k++) { const d = new Date(Date.now() - k * 86400000); if ([0, 6].includes(d.getUTCDay())) continue;
    const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + d.toISOString().slice(0, 10) + '?adjusted=true'); if (mv429 > 6) { console.log('whole market: Massive refused (free plan?), skipped'); return []; }
    if (j && Array.isArray(j.results) && j.results.length > 500) days.push(new Map(j.results.map(r => [r.T, r]))); }
  if (days.length < 3) return [];
  const MIN_DV = +(env.WIDE_DV || 1e7), MAX = +(env.WIDE_MAX || 2500), out = [];
  for (const [sym, r] of days[0]) {
    if (!/^[A-Z]{1,5}$/.test(sym) || !cs.has(sym) || already.has(sym) || !(r.c >= +(env.WIDE_MIN_PX || 2))) continue;
    const dv = days.map(m => m.get(sym)).filter(Boolean).map(x => x.c * x.v).sort((a, b) => a - b); if (dv.length < 3) continue;
    const med = dv[Math.floor(dv.length / 2)]; if (med >= (r.c < 5 ? MIN_DV / 2 : MIN_DV)) out.push({ sym, dv: med });   // under 5 USD: 5M USD a day or more
  }
  return out.sort((a, b) => b.dv - a.dv).slice(0, MAX).map(x => x.sym);
}
async function loadWide(syms, loaded, now) {
  const from = new Date(now - (365 * 5 + 10) * 86400000).toISOString().slice(0, 10), to = new Date(now).toISOString().slice(0, 10);
  let i = 0, ok = 0; const worker = async () => { while (i < syms.length && mv429 <= 6) { const sym = syms[i++];
    const j = await mv('/v2/aggs/ticker/' + sym + '/range/1/day/' + from + '/' + to + '?adjusted=true&sort=asc&limit=50000');
    if (!j || !Array.isArray(j.results) || j.results.length < 30) continue;
    const all = j.results.map(x => ({ d: new Date(x.t).toISOString().slice(0, 10), o: +(+x.o).toFixed(4), h: +(+x.h).toFixed(4), l: +(+x.l).toFixed(4), c: +(+x.c).toFixed(4), v: Math.round(+x.v || 0) }));
    loaded[sym] = { candles: all.filter(c => barClosed(c.d, now)), last: all[all.length - 1].c, wide: true }; ok++; } };
  await Promise.all(Array.from({ length: +(env.WIDE_CONC || 8) }, worker));
  return ok;
}
async function telegram(text) {
  if (!env.TG_TOKEN || !env.TG_CHAT) { console.log('[no Telegram secrets, message not sent]\n' + text); return; }
  const parts = []; { let rest = text; while (rest.length > 3800) { let cut = rest.lastIndexOf('\n\n', 3800); if (cut < 1500) cut = rest.lastIndexOf('\n', 3800); if (cut < 1500) cut = 3800; parts.push(rest.slice(0, cut)); rest = rest.slice(cut).replace(/^\n+/, ''); } parts.push(rest); }   // split long messages between paragraphs, never mid-word
  for (let i = 0; i < parts.length; i++) {
    for (let a = 0; a < 3; a++) {   // a dropped connection is retried, so a message is not lost and the run does not stop
      try { const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: parts[i], disable_web_page_preview: true }) });
        if (!r.ok) console.error('Telegram error', r.status, await r.text()); break; }
      catch (e) { console.error('Telegram connection error, retrying', e.message); await sleep(FAST ? 50 : 3000); }
    }
    if (i + 1 < parts.length) await sleep(FAST ? 0 : 700);   // keeps the parts in order on your phone
  }
}
const FOOT = '\nTested signals, not instructions. Not financial advice, not a halal ruling.' + (env.PAGE_URL ? '\n' + env.PAGE_URL : '');

// ---- Your own positions, told to the bot in Telegram. Read at every run (every 30 minutes in market hours).
// Stored in data/my-positions.json: ticker, entry price, levels and date. No share counts, no money amounts.
const POS_FILE = 'data/my-positions.json';
const loadPos = () => readJson(POS_FILE, {});
const savePos = (p) => fs.writeFileSync(POS_FILE, JSON.stringify(p, null, 1));
const HELP = 'You do not need these. Just write or forward anything. For reference, you can ask in plain words:\nfrom ClayTrader what to buy   (any source or channel you logged)\nwhen to sell VRTX\nreview   (HOLD or SELL study of every stock you own, from its own past)\nreview ZETA   (one stock)\nshould I buy more VRTX\nwhen to buy LPG\npenny stock for today\nlook for energy stocks\nwhat to buy today\nstrongest stocks\n\nOr use the commands:\nleaders   (the strongest stocks to ride, with buy range, stop and exit rule)\nradar   (today\u2019s early-wave board: buy reviews, pre-wave watches, do-not-chase; new rules, paper only)\ntoday   (the short plan: what to buy, stop, when to sell, with live prices)\ndetails   (the long version with every setup)\nreport   (last night\u2019s full scan report)\nmarket   (indexes, sectors and headlines right now)\nmovers   (stocks up 20%+ right now, with the news: investigate, do not chase)\nhalal BFLY no   (BFLY is not halal in ZAD: never offered again;  halal BFLY yes  to undo)\ncheck LPG   (analyses ANY ticker now and adds it to my nightly scan)\nremove LPG   (takes it off)\ntips SOURCE NAME + the tickers or the pasted message   (logs a source\u2019s tips, checks each, scores the source)\nsources   (scoreboard of the sources you logged)\nname SOURCE NAME   (gives a name to tips you pasted without one)\nfollow NAME CHANNEL-ID   (follow a YouTube channel: its stock mentions are logged, checked and scored)\nunfollow NAME   |   channels\nbought VRTX 500.55 20 shares   (with the shares: kept encrypted, used to learn your usual buy size)\nbought VRTX 500.55\nbought VRTX   (uses the current price)\nbought TTD 20.16 stop 10.50 target 15\nfee 3   (your broker fee per buy and per sell, in USD)\nstop VRTX 480\ntarget VRTX 516\nsold VRTX 520.10   (records the result in your real record)\nrecord   (your real results, by kind of trade)\nwinners   (what this week\u2019s winners study learned)\nscore   (every stock scored 0 to 100, and whether the score has worked)\nscore NVDA   (one stock\u2019s score and rank)\nlab   (this week\u2019s hunting lab: new ways to catch moves, tested on two years of the whole market)\nlessons   (what the system learned from its finished trades, and which rules it demoted)\npositions\n\nPaste or forward any market message or advice (Arabic or English): I check its warning signs, what my data says about the themes it names, and which of those stocks have tested support.\n\nI usually reply within a minute. You do not need commands: anything you write or forward is studied, and the important things (buys, sells, stops, targets, the weekly review of your stocks) are sent to you without asking.';
function planFor(sym, entry, sig) {   // levels for a new position, scaled from last night's plan to the price you actually paid
  const q = ((sig && sig.quick) || []).find(x => x.sym === sym), b = ((sig && sig.stocks) || []).find(x => x.sym === sym && x.buyLo);
  if (q) return { kind: 'quick', q: q.q || 'rsi', maxHold: q.maxHold || 5, stop: +(entry - (q.buyLo - q.stop)).toFixed(2), t1: q.t1 ? +(entry * q.t1 / q.buyLo).toFixed(2) : null, t2: q.t2 ? +(entry * q.t2 / q.buyLo).toFixed(2) : null };
  const ld = ((sig && sig.leaders) || []).find(x => x.sym === sym);
  if (!q && !b && ld) return { kind: 'leader', stop: +(entry - (ld.buyLo - ld.stop)).toFixed(2), t1: null, t2: null };
  if (b) return { kind: 'entry', maxHold: b.maxHold || null, stop: +(entry - (b.buyLo - b.stop)).toFixed(2), t1: b.target ? +(entry * b.target / b.buyLo).toFixed(2) : null, t2: null };
  const rd = readJson('data/intraday-radar.json', null), rc = rd && (rd.candidates || []).find(x => x.sym === sym && x.levels && x.group);
  if (rc) return { kind: 'radar', maxHold: 5, stop: +(entry - (rc.levels.entry - rc.levels.stop)).toFixed(2), t1: +(entry + (rc.levels.t1 - rc.levels.entry)).toFixed(2), t2: null };
  return { kind: 'manual', stop: null, t1: null, t2: null };
}
const posLine = (sym, P, price) => sym + ': bought ' + money(P.entry) + (price ? ', now ' + money(price) + ' (' + (price >= P.entry ? '+' : '') + ((price / P.entry - 1) * 100).toFixed(1) + '%)' : '') + '\n  stop ' + (P.stop ? money(P.stop) : 'NOT SET') + ', target 1 ' + (P.t1 ? money(P.t1) : 'not set') + (P.t2 ? ', target 2 ' + money(P.t2) : '') + (P.kind === 'leader' ? '\n  leader trade: no fixed target. I raise the stop as it climbs; also sell on a close under its 50 day average' : '') + (P.kind === 'radar' ? '\n  early-wave trade: sell at target 1 or after 5 sessions, whichever comes first' : '') + (P.kind === 'quick' ? '\n  quick trade: also sell on the first close ' + (P.q === 'gap' ? 'below' : 'above') + ' its 5 day average, or after ' + (P.maxHold || 5) + ' sessions' : '');
// "today": the short-trade list. Only setups that passed the tests at the last close, re-priced now.
// ---- YOUR REAL RECORD: every sale you report, split by the kind of trade, so paper and real results can be compared.
const MY_TRADES = 'data/my-trades.jsonl';
function myRecord(full) {
  const all = fs.existsSync(MY_TRADES) ? fs.readFileSync(MY_TRADES, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  if (!all.length) return 'YOUR REAL RECORD: no sale recorded yet. When you sell, send: sold SYMBOL PRICE';
  const line = (name, a) => { if (!a.length) return null; const w = a.filter(t => t.pct > 0), l = a.filter(t => t.pct <= 0), sw = w.reduce((x, t) => x + t.pct, 0), sl = -l.reduce((x, t) => x + t.pct, 0);
    return name + ': ' + a.length + ' trades, ' + Math.round(w.length / a.length * 100) + '% won, average ' + pcs(a.reduce((x, t) => x + t.pct, 0) / a.length) + (sl > 0 ? ', profit factor ' + (sw / sl).toFixed(2) : ''); };
  const names = { quick: 'Quick trades', entry: 'Swing trades', leader: 'Leaders', radar: 'Early-wave', manual: 'Your own picks' };
  const rows = [line('All system trades', all.filter(t => t.kind !== 'manual')), ...(full ? Object.keys(names).map(k => line(names[k], all.filter(t => t.kind === k))) : [line('Your own picks', all.filter(t => t.kind === 'manual'))])].filter(Boolean);
  return 'YOUR REAL RECORD (after about 0.4% costs; in dollars, your $' + 2 * FEE() + ' broker fees)\n' + rows.join('\n') + (all.length < 20 ? '\nUnder 20 sales: too few to judge.' : '') + (full ? '\nLast sales: ' + all.slice(-5).map(t => t.sym + ' ' + pcs(t.pct)).join(', ') : '');
}
function lessonsText() {
  const LS = readJson('data/lessons.json', null), rs = LS ? Object.entries(LS.rules || {}).map(([k, r]) => r).sort((a, b) => b.n - a.n) : [];
  if (!rs.length) return 'LESSONS: no live paper trade has finished yet. Each finished trade is reviewed after the nightly scan.';
  const endName = { stop: 'stop', target: 'target', rule_exit: 'rule exit', time_exit: 'time limit' };
  return ['LESSONS FROM FINISHED TRADES (live paper, after costs), ' + LS.session, ...rs.slice(0, 10).map(r => (r.demoted ? 'DEMOTED ' : '') + r.name + ': ' + r.n + ' trades, ' + Math.round(r.win * 100) + '% won, average ' + pcs(r.avg)
    + '\n  how they ended: ' + Object.entries(r.ends).map(([k, v]) => v + ' ' + (endName[k] || k)).join(', ')
    + (r.t1Rate !== null ? '\n  reached target 1: ' + Math.round(r.t1Rate * 100) + '% (the test expected about half)' : '') + '\n  typical best price before the exit: ' + pcs(r.medianRunUp)
    + (r.fill && r.fill.inN + r.fill.upN ? '\n  opened inside the buy range ' + r.fill.inN + ' of ' + (r.fill.inN + r.fill.upN) + ' times' + (r.fill.inN ? ' (average ' + pcs(r.fill.inSum / r.fill.inN) + ')' : '') + (r.fill.upN ? '; above it ' + r.fill.upN + ' (average ' + pcs(r.fill.upSum / r.fill.upN) + ', skipped by the plan)' : '') : '')
    + (r.demoted ? '\n  lesson: it loses live, so it is paper only until its record turns positive' : r.n < 10 ? '\n  too few trades to draw a lesson yet' : '')),
    'A rule is demoted automatically after 10+ live trades with a negative average, and restored when the average turns positive.'].join('\n');
}
function soldLesson(P, exit) {
  if (P.t2 && exit >= P.t2) return 'It reached target 2: the plan worked in full.';
  if (P.t1 && exit >= P.t1) return 'It reached target 1: the plan worked.';
  if (P.stop && exit <= P.stop * 1.002) return 'It hit the stop: the loss was capped as planned. One stop is normal; a run of them is a lesson the review will catch.';
  if (P.kind === 'quick') return 'It was sold on the quick-trade rule (the bounce back to the 5 day average, or the time limit) before target 1. That is by design: target 1 is a level only about half of past trades reached, and a dip trade is built to take the bounce back to the average and get out. Every tested result of this rule already includes that exit.';
  if (P.kind === 'radar') return 'It ended on the 5 day time limit before marker 1. The radar record counts this.';
  return 'Sold before the target and above the stop.';
}
// ---- THE PLAN: the one short message. At most 2 buys, each with buy range, stop, sell, how long, what to expect and why.
// A buy needs proof on trades it never saw: 30 or more, and a positive average after YOUR costs (0.4% a round trip).
// The tests already charged 0.1%, so 0.3% more is taken off here. No two buys from the same industry.
const MY_COST = 0.004, TEST_COST = 0.001, CHEAP_COST = 0.012;
// after-cost average for YOU: stocks under 5 USD are charged 1.2% a round trip (wide spreads, gaps), others 0.4%
// YOUR BROKER FEE: a fixed fee per buy and per sell (default 3 USD each, change with:  fee 3). Rules are judged on a standard
// 1,000 USD buy: fixed fees + spread (0.2%, or 1% under 5 USD) must still leave a profit. Every card also shows the dollars.
const FEE = () => { const st = readJson0('data/settings.json') || {}; return typeof st.feeUSD === 'number' ? st.feeUSD : 3; }, STD_BUY = 1000;
const costPct = (px, usd) => 2 * FEE() / (usd || STD_BUY) + (px > 0 && px < 5 ? 0.01 : 0.002);
const netOf = (avg, px) => typeof avg === 'number' ? avg + TEST_COST - costPct(px, STD_BUY) : null;
const usdLine = (net, gross, px) => { if (net === null) return ''; const ub = (typeof usualBuy === 'function' && usualBuy()) || null, sz = ub ? ub.usd : STD_BUY, fees = 2 * FEE(), n2 = gross + TEST_COST - costPct(px, sz);
  return ' (on a ' + '$' + Math.round(sz) + ' buy: about ' + (n2 >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(n2 * sz)) + ' after your $' + fees + ' broker fees' + (fees / sz > 0.01 ? '. WARNING: the fees alone are ' + (fees / sz * 100).toFixed(1) + '% of this buy; buy about $' + Math.ceil(fees / 0.005 / 100) * 100 + '+ or the fee eats the gain' : '') + ')'; };
// Ranking by evidence, not by luck: average after costs, weighted by how many unseen trades back it (more trades, more trust).
const evid = (net, n) => (net || 0) * Math.sqrt(Math.min(n || 0, 200));
const secGroup = (x) => !x ? null : /biotech|pharma|life sciences|health/i.test(x) ? 'Health care and biotech' : /semiconductor/i.test(x) ? 'Semiconductors' : x;
const pcs = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
// BUY evidence: 30+ unseen trades with a positive average after costs, OR an EARLY-EVIDENCE buy: 15 to 29 unseen trades
// with a strong average (+1.5% or more after costs) and at least half won. Early-evidence buys get a smaller size and are
// demoted automatically if their live record turns negative.
const okEv = (n, net, win) => (n >= 30 && net > 0) || (n >= 15 && net >= 0.015 && (win || 0) >= 0.5);
function planCands(sig, held0) {
  const c = [], HM = HALALM(), held = new Proxy(held0 || {}, { get: (o, k) => o[k] || (HM[k] && HM[k].s === 'fail' ? { notHalal: true } : undefined) });   // not halal in ZAD: never offered
  for (const q of sig.quickPaused ? [] : (sig.quick || [])) { if (held[q.sym]) continue; const net = netOf(q.avgPct, q.last);
    c.push({ sym: q.sym, kind: 'quick trade', n: q.n, net, live: q.live, lo: q.buyLo, hi: q.buyHi, stop: q.stop, days: q.maxHold || 5, earnDays: q.earnDays, sector: q.sector,
      sell: (q.t1 ? money(q.t1) + (q.t2 ? ', then ' + money(q.t2) : '') + ', or the ' : 'the ') + (q.exitText || 'first daily close above its 5 day average'),
      wait: 'up to ' + (q.maxHold || 5) + ' trading days, then sell anyway (holding time tested on this stock: the best of ' + (q.q === 'gap' ? '5, 10 and 15' : '3, 5, 7 and 10') + ' days on past data)',
      expect: (q.n ? Math.round(q.win * 100) + '% of ' + q.n + ' past trades it never saw won; average ' + (net === null ? 'n/a' : pcs(net) + usdLine(net, q.avgPct, q.last)) + ' a trade after fees and spread' : 'no tested record') + (q.live ? '. Live paper so far: ' + q.live.n + ' trades, average ' + pcs(q.live.avg) : '') + (q.demoted ? '. DEMOTED: this rule lost money on live paper, so it is paper only' : ''),
      why: q.q === 'gap' ? 'strong gap up on heavy volume, held near the high' : 'a short dip inside an uptrend' + (q.what ? ' (' + q.what + ')' : ''),
      ok: okEv(q.n, net, q.win) && !q.demoted, thin: q.n < 30, cheap: q.last < 5, score: evid(net, q.n) }); }
  for (const b of (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo)) { if (held[b.sym]) continue; const net = netOf(b.avgPct, b.last);
    c.push({ sym: b.sym, kind: 'swing trade', n: b.n, net, live: b.live, lo: b.buyLo, hi: b.buyHi, stop: b.stop, days: b.days || 20, earnDays: b.earnDays, sector: b.sector,
      sell: b.target ? money(b.target) + ', or a daily close under ~' + money(b.exitBelow) : 'when it closes under ~' + money(b.exitBelow) + ' (no fixed target)',
      wait: (b.days ? 'about ' + b.days + ' trading days is typical' : 'days to weeks') + (b.maxHold ? '; sell after ' + b.maxHold + ' days at the latest (the test chose this over no limit, on this stock\u2019s own past)' : '; no time limit (the test chose this over a 20 day limit, on this stock\u2019s own past)'),
      expect: (b.n ? Math.round(b.win * 100) + '% of ' + b.n + ' past trades it never saw won; average ' + (net === null ? 'n/a' : pcs(net) + usdLine(net, b.avgPct, b.last)) + ' a trade after fees and spread' + (b.hit ? '; target reached in ' + Math.round(b.hit * 100) + '%' : '') : 'tested rule, record not stored') + (b.live ? '. Live paper so far: ' + b.live.n + ' trades, average ' + pcs(b.live.avg) : '') + (b.demoted ? '. DEMOTED: this rule lost money on live paper, so it is paper only' : ''),
      why: String(b.why || 'a tested entry signal fired').split('. ')[0].replace(/\.$/, ''),
      ok: okEv(b.n, net, b.win) && !b.demoted, thin: b.n < 30, cheap: b.last < 5, score: evid(net, b.n) }); }
  const RD = readJson('data/intraday-radar.json', null);
  if (RD && RD.session === ny(Date.now()).d && marketOpen(Date.now())) for (const r of (RD.candidates || []).filter(x => x.proven && x.levels && !held[x.sym])) {
    const L0 = r.levels; c.push({ sym: r.sym, kind: 'early-wave ' + (String(r.group || '').startsWith('pullback') ? 'pullback' : 'breakout') + ' (radar, today)', lo: L0.lo, hi: Math.min(L0.noEntryAbove, Math.max(L0.hi, L0.lo)), stop: L0.stop, days: 5, earnDays: null, sector: null,
      sell: money(L0.t1) + ' (marker 1), or after 5 trading days', wait: 'up to 5 trading days', expect: r.record || 'proven on paper',
      why: (String(r.group || '').startsWith('pullback') ? 'broke the first-45-minute high, pulled back to it and turned up' : 'broke above the high of the first 45 minutes') + (r.catalyst && r.catalyst.status === 'STRONG' ? '; news: ' + r.catalyst.kind : ''),
      ok: true, score: 0.0005 }); }
  const fair = (sig.leadFair && sig.leadFair.state) || 'NOT RUN';
  for (const r of sig.leaders || []) { if (held[r.sym]) continue;
    c.push({ sym: r.sym, kind: 'trend trade', lo: r.buyLo, hi: r.buyHi, stop: r.stop, days: 30, earnDays: r.earnDays, sector: r.sector,
      sell: 'no fixed target. Sell when it closes under the stop (I raise it as it climbs) or under its 50 day average (~' + money(r.e50) + ')',
      wait: 'weeks, as long as the trend holds',
      expect: fair === 'PROVISIONALLY PROMISING' ? 'passed the whole-market fair test; live record still building' : 'NOT proven on the whole-market fair test (' + fair.toLowerCase() + ')',
      why: 'one of the strongest stocks: ' + pcs(r.mom) + ' in 6 months',
      ok: fair === 'PROVISIONALLY PROMISING', score: -0.001 }); }
  return c;
}
// Your accepted loss per trade (set with:  risk 50). Only this one number is stored; share counts are worked out in the message.
const myRisk = () => null;     // retired: the system sizes each buy itself
// PRIVATE FIGURES (share counts, money amounts). The repository is public, so these are kept ENCRYPTED in data/private.enc with
// the GitHub secret PRIVATE_KEY. Without that secret nothing is stored: the numbers are used for the reply and then forgotten.
const PRIV_FILE = 'data/private.enc', privKey = () => env.PRIVATE_KEY ? crypto.createHash('sha256').update(String(env.PRIVATE_KEY)).digest() : null;
function privRead() {
  const k = privKey(); if (!k || !fs.existsSync(PRIV_FILE)) return { buys: [], shares: {} };
  try { const b = Buffer.from(fs.readFileSync(PRIV_FILE, 'utf8'), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString()); }
  catch (e) { return { buys: [], shares: {} }; }
}
function privWrite(o) {
  const k = privKey(); if (!k) return false; const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv), enc = Buffer.concat([c.update(JSON.stringify(o)), c.final()]);
  fs.writeFileSync(PRIV_FILE, Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')); return true;
}
// Your usual buy, learned from what you actually buy (the median of your last 10 buys in USD). Sizes are suggested relative to it.
const usualBuy = () => { const b = (privRead().buys || []).slice(-10).map(x => x.usd).filter(x => x > 0).sort((a, c) => a - c); return b.length ? { usd: b[Math.floor(b.length / 2)], n: b.length } : null; };
// The account size is private: it comes ONLY from the GitHub secret ACCOUNT_USD, never from a file (the repository is public).
const myAccount = () => { const v = +(env.ACCOUNT_USD || 0); return v > 0 ? v : null; };
{ const st = readJson('data/settings.json', null); if (st && (st.accountUSD !== undefined || st.riskUSD !== undefined)) { delete st.accountUSD; delete st.riskUSD; fs.writeFileSync('data/settings.json', JSON.stringify(st)); } }   // scrub any amount saved earlier
// SIZING DECIDED BY THE SYSTEM. How much of the account a trade may lose depends on how strong its evidence is, how it has
// done live, and the market. 0.5% is the normal bet; strong, long records earn up to 1%; thin records, live losses, a weak
// market or a paper-only setup get less. A position is never more than a fifth of the account.
function sizeFor(x, mk) {
  const n = x.n || 0, net = x.net === undefined || x.net === null ? null : x.net, why = [];
  let pct = 0.005;
  if (x.kind && /radar/.test(x.kind)) { pct = 0.0025; why.push('early-wave setup: smaller bet'); }
  else if (x.thin) { pct = 0.0025; why.push('EARLY EVIDENCE, only ' + n + ' tested trades: half the normal size'); }
  else if (n >= 100 && net >= 0.015) { pct = 0.01; why.push('long, strong record (' + n + ' trades, ' + pcs(net) + ')'); }
  else if (n >= 60 && net >= 0.01) { pct = 0.0075; why.push('strong record (' + n + ' trades, ' + pcs(net) + ')'); }
  else if (n < 40 || (net !== null && net < 0.005)) { pct = 0.0035; why.push('thinner evidence (' + n + ' trades' + (net !== null ? ', ' + pcs(net) : '') + ')'); }
  else why.push('normal evidence (' + n + ' trades' + (net !== null ? ', ' + pcs(net) : '') + ')');
  if (x.cheap) { pct *= 0.5; why.push('cheap stock under 5 USD: halved'); }
  if (x.live && x.live.n >= 10) { if (x.live.avg > 0) { pct *= 1.2; why.push('making money live'); } else { pct *= 0.5; why.push('losing live: halved'); } }
  if (mk && (mk.up === false || mk.above50 === false)) { pct *= 0.5; why.push('weak market: halved'); }
  { const sd = x.lo > 0 && x.stop > 0 ? (x.lo - x.stop) / x.lo : 0; if (sd > 0.08) { pct *= 0.08 / sd; why.push('wide stop (' + Math.round(sd * 100) + '% away): smaller, so a stop-out costs about the same as a normal trade'); } }
  return { pct: Math.min(0.01, pct), why: why.join(', ') };
}
function planText(sig, pos, px, title, only) {
  const held = pos || {}, out = [title || 'PLAN'];
  if (!sig) return out.concat('No scan has run yet.').join('\n');
  const c = planCands(sig, held), pick = c.filter(x => x.ok && (!only || only.includes(x.sym))).sort((a, b) => b.score - a.score), skipped = [];
  for (const x of pick) { const g = secGroup(x.sector), first = g && pick.find(p => p !== x && secGroup(p.sector) === g && pick.indexOf(p) < pick.indexOf(x)); if (first) x.sameAs = first.sym; }
  const pv = sig.posVerdict || {}, sells = [], holds = [];
  for (const sym of Object.keys(held)) { const P = held[sym], p = px && px[sym], now = p ? ' Now ' + money(p) + ' (' + pcs(p / P.entry - 1) + ').' : '';
    if (p && P.stop && p <= P.stop) sells.push(sym + ': SELL NOW. Your stop ' + money(P.stop) + ' is reached.' + now);
    else if (p && P.t2 && p >= P.t2) sells.push(sym + ': SELL. Target 2 (' + money(P.t2) + ') reached.' + now);
    else if (pv[sym]) sells.push(sym + ': SELL at the ' + (px ? 'close or next open' : 'open') + '. ' + pv[sym].replace(/^\w/, ch => ch.toUpperCase()).replace(/\.?$/, '.') + now);
    else if (p && P.t1 && p >= P.t1) sells.push(sym + ': TAKE PROFIT. Target 1 (' + money(P.t1) + ') reached: sell, or sell half and move the stop to ' + money(P.entry) + '.' + now);
    else holds.push(sym + ': stop ' + (P.stop ? money(P.stop) : 'NOT SET') + (P.t1 ? ', target ' + money(P.t1) : '') + (P.own ? ' (your own stop)' : '') + (p ? ', now ' + money(p) + ' (' + pcs(p / P.entry - 1) + ')' : '')); }
  if (sells.length && !only) out.push('', 'SELL', ...sells);
  const mk = sig.market || {};
  if (!only && (mk.above50 === false || mk.up === false)) out.push('', 'MARKET: ' + (mk.up === false ? 'the S&P 500 is in a downtrend' : 'the S&P 500 is under its 50 day average (' + pcs(mk.spyVs50) + ')') + '. Dips fail more often in a weak market: consider smaller size.');
  pick.sort((a, b) => (a.thin ? 1 : 0) - (b.thin ? 1 : 0) || b.score - a.score);   // fully proven first, early evidence after, under its own heading
  const nFull = pick.filter(x => !x.thin).length;
  if (!only) out.push('', 'BUY' + (pick.length ? ' (' + nFull + ' fully proven' + (pick.length > nFull ? ', ' + (pick.length - nFull) + ' early evidence' : '') + ', strongest evidence first)' : ''));
  if (!only && pick.length && !nFull) out.push('None fully proven (30+ tested trades) today.');
  if (!pick.length && !only) out.push('Nothing today. No setup has proof: 30+ unseen trades with a profit after costs, or 15+ with +1.5% or more a trade. Waiting is a result.');
  pick.forEach((x, n) => {
    if (!only && x.thin && (n === 0 || !pick[n - 1].thin)) out.push('', 'EARLY EVIDENCE (15 to 29 tested trades with a strong average: promising, NOT fully proven. Smaller size, your choice)');
    const p = px && px[x.sym], risk = x.lo - x.stop;
    { const SS = readJson('data/score-study.json', null), sc = SS && SS.scores ? SS.scores[x.sym] : undefined;
      out.push((n ? '\n' : '') + (n + 1) + ') ' + x.sym + ', ' + x.kind + (x.thin ? ' (EARLY EVIDENCE: ' + x.n + ' tested trades, smaller size)' : '') + (x.cheap ? ' (CHEAP STOCK under 5 USD: higher risk, smaller size)' : '') + (x.sector ? ', ' + x.sector : '') + (sc !== undefined ? ', score ' + sc + '/100' : '')); }
    if (p) out.push('   Now: ' + money(p) + (p > x.hi ? ', ABOVE the range: SKIP, do not chase' : p <= x.stop ? ', AT THE STOP: CANCELLED' : p < x.lo ? ', under the range: wait for it to turn up' : ', inside the range: OK to buy'));
    out.push('   Buy: ' + money(x.lo) + ' to ' + money(x.hi) + ' (skip if above ' + money(x.hi) + ')',
      '   Stop: ' + money(x.stop) + ' (' + pcs(x.stop / x.lo - 1) + '). If it is hit: about -$' + Math.round(1000 * (1 - x.stop / ((x.lo + x.hi) / 2)) + 2 * FEE() + 2) + ' on a $1,000 buy, fees included' + ((x.lo - x.stop) / x.lo > 0.12 ? '. WIDE STOP: buy less' : ''),
      '   Sell: ' + x.sell,
      '   Wait: ' + x.wait,
      '   Expected: ' + x.expect,
      '   Why: ' + x.why,
      ...(() => { const hm = HALALM()[x.sym], zt = zoyaText(x.sym); const hc0 = halalChecks(x.sym).text, bi = L.halalOf(x.sym, null), hc = bi === 'fail' ? 'Built-in screen: FAILS (business type, e.g. interest-based finance or tobacco)' + (hc0 ? '. ' + hc0.replace(/\. Confirm in ZAD\.$/, '') : '') + '. Your decision: check ZAD.' : hc0 ? hc0.replace('Confirm in ZAD.', 'Shown for information, not filtered. Your decision: check ZAD.') : null; return hm && hm.s !== 'expired' ? ['   Halal: ' + (hm.s === 'ok' ? 'HALAL in ZAD (your mark, ' + hm.d + ')' : 'NOT halal in ZAD (your mark)')] : hm ? ['   Halal: you marked it ' + (hm.was === 'ok' ? 'HALAL' : 'NOT halal') + ' on ' + hm.d + ', over 90 days ago. Its finances may have changed: CHECK ZAD AGAIN' + (hc ? '. ' + hc : '')] : hc ? ['   ' + hc] : zt ? ['   ' + zt] : []; })(),
      '   Size: ' + (!myRisk() ? (() => { const z = sizeFor(x, sig.market), acct = myAccount(), ub = usualBuy();
        if (!(risk > 0)) return 'n/a';
        if (!acct && ub) { const mult = z.pct / 0.005, usd = ub.usd * mult, sh = Math.floor(usd / x.lo);
          return sh < 1 ? 'skip: one share costs more than this trade should take' : sh + ' shares, about ' + money(sh * x.lo) + ' USD = ' + (mult === 1 ? 'your usual buy' : mult.toFixed(1) + 'x your usual buy of ' + money(ub.usd) + ' USD') + ' (' + z.why + '). It may lose about ' + money(sh * risk) + ' USD at the stop'; }
        if (!acct) return 'size ' + (z.pct / 0.005).toFixed(1) + 'x your usual buy (' + z.why + '). Tell me your shares when you buy (bought SYMBOL PRICE SHARES) and I will learn your usual size'; if (false) return 'risk ' + (z.pct * 100).toFixed(2) + '% of your account (' + z.why + '). Add your account size as the GitHub secret ACCOUNT_USD and I will give the exact shares';
        const usd = acct * z.pct, sh = Math.min(Math.floor(usd / risk), Math.floor(acct * 0.2 / x.lo));
        return sh < 1 ? 'skip: even 1 share risks ' + money(risk) + ' USD, more than the ' + money(usd) + ' USD this trade should risk' : sh + ' shares, about ' + money(sh * x.lo) + ' USD (it may lose about ' + money(sh * risk) + ' USD = ' + (z.pct * 100).toFixed(2) + '% of your account; ' + z.why + ')' + (sh * x.lo < 2000 ? '. Under 2,000 USD the 3 USD minimum fee eats more of the edge' : ''); })() : myRisk() && risk > 0 && Math.floor(myRisk() / risk) < 1 ? 'even 1 share risks ' + money(risk) + ' USD, more than your accepted loss of ' + money(myRisk()) + ': skip it, or accept the bigger risk knowingly' : myRisk() && risk > 0 ? Math.floor(myRisk() / risk) + ' shares (your accepted loss ' + money(myRisk()) + ' USD / ' + money(risk) + ' risk per share' + (Math.floor(myRisk() / risk) * x.lo < 2000 ? '; under 2,000 USD the 3 USD minimum fee eats more of the edge' : '') + ')' : 'shares = the loss you accept / ' + money(risk) + (risk > 0 ? (risk <= 100 ? '. Example: 100 USD / ' + money(risk) + ' = ' + Math.floor(100 / risk) + ' shares' : '. Example: 1 share risks ' + money(risk) + ' USD') : '') + '. Set yours once with:  risk 50'));
    if (x.sameAs) out.push('   NOTE: same industry as ' + x.sameAs + '. Both can fall together.');
    if (x.earnDays !== null && x.earnDays !== undefined && x.earnDays <= x.days * 1.5) out.push('   WARNING: earnings in ' + x.earnDays + ' days, inside the holding time. A result can jump the price past the stop.');
  });
  if (only) { out.push('', 'Check halal in ZAD first. Buy only inside the range and place the stop at once. Then send: bought SYMBOL PRICE SHARES'); return out.join('\n'); }
  const notProven = c.filter(x => !x.ok).map(x => x.sym);
  if (skipped.length) out.push('', 'Also passed, left out: ' + skipped.join(', ') + '.');
  if (notProven.length) out.push('', 'Not proven, paper only: ' + [...new Set(notProven)].join(', ') + '.');
  if (holds.length) out.push('', 'HOLD (keep these stops at your broker)', ...holds);
  { const LS = readJson('data/lessons.json', null), rs = LS ? Object.values(LS.rules || {}) : [], n = rs.reduce((a, r) => a + r.n, 0);
    if (n) { const dem = rs.filter(r => r.demoted), sum = rs.reduce((a, r) => a + r.avg * r.n, 0);
      out.push('', 'LEARNING: ' + n + ' live paper trades reviewed, average ' + pcs(sum / n) + '.' + (dem.length ? ' Demoted for losing live: ' + dem.map(r => r.name).join('; ') + '.' : ' No rule demoted.') + ' Send  lessons  for what each rule taught.'); } }
  { const RR = readJson('data/radar-record.json', null), gs = RR ? Object.values(RR.groups || {}) : [], pv = gs.filter(g => g.proven), best = [...gs].sort((a, b) => (b.n || 0) - (a.n || 0))[0];
    out.push('', 'EARLY-WAVE RADAR (alerts during the session): ' + (pv.length ? 'PROVEN on paper: ' + pv.map(g => g.name.toLowerCase() + ' (' + g.n + ' trades, ' + Math.round(g.win * 100) + '% won, average ' + pcs(g.avg) + ' after costs)').join('; ') + '. Its alerts marked BUY can be acted on.'
      : 'not proven yet' + (best && best.n ? ' (furthest: ' + best.name.toLowerCase() + ', ' + best.n + ' of ' + (RR.need || 30) + ' paper trades, average ' + pcs(best.avg) + ')' : '') + '. Its alerts are paper only.')); }
  { const ru = readJson('data/radar-universe.json', null), rn = ru && ru.syms ? ru.syms.length : 0;
    out.push('', 'COVERAGE: ' + (sig.tested || sig.scanned || 0) + ' stocks tested last night; ' + c.length + ' had a setup, ' + c.filter(x => x.ok).length + ' proven (passed the test on unseen trades, profit after costs).' + (rn ? ' The radar watches about ' + rn + ' strong stocks live in the session.' : '')); }
  out.push('', 'Before buying: check halal in ZAD. Buy only inside the range and place the stop at once. Then send: bought SYMBOL PRICE SHARES', 'Full details: send  details');
  return out.join('\n');
}
// CONCLUSION: one line per trade. Buy range, stop, where to sell. Only setups that passed their tests and are not blocked.
function conclusion(sig, pos) {
  const out = ['CONCLUSION'];
  if (!sig) return out.concat('No scan has run yet.');
  const held = pos || {};
  for (const q of (sig.quick || []).filter(x => !held[x.sym]).slice(0, 4)) out.push(q.sym + ': BUY ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ' | STOP ' + money(q.stop) + ' | SELL ' + (q.t1 ? money(q.t1) + (q.t2 ? ' then ' + money(q.t2) : '') : 'on the rule exit') + ' | out after ' + (q.maxHold || 5) + ' sessions at the latest');
  for (const b of (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo && !held[x.sym]).slice(0, 4)) out.push(b.sym + ': BUY ' + money(b.buyLo) + ' to ' + money(b.buyHi) + ' | STOP ' + money(b.stop) + ' | SELL ' + (b.target ? money(b.target) : 'when it closes below ~' + money(b.exitBelow)) + ' | swing trade, days to weeks');
  for (const r of (sig.leaders || []).filter(x => !held[x.sym]).slice(0, 5)) out.push(leadLine(r));
  if (sig.quickPaused) out.push('Quick trades are paused by the circuit breaker.');
  if (out.length === 1) out.push('No new trade today. Nothing passed its tests.');
  const pv = sig.posVerdict || {};
  for (const sym of Object.keys(pos || {})) { const P = pos[sym]; out.push(sym + ' (yours): ' + (pv[sym] ? 'SELL at the next open, ' + pv[sym] : 'HOLD | STOP ' + (P.stop ? money(P.stop) : 'none set') + ' | SELL ' + (P.t1 ? money(P.t1) + (P.t2 ? ' then ' + money(P.t2) : '') : 'no target set'))); }
  return out;
}
// The same conclusion, recalculated from the price RIGHT NOW (market hours only): buy near the live price, with the stop and
// selling prices moved by the same amount. A setup that has run away or failed is marked SKIP or CANCELLED.
function conclusionLive(sig, pos, px) {
  const out = ['WHAT TO DO NOW (' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' }) + ' Kuwait time, live prices)'], held = pos || {}; let any = false;
  for (const q of (sig.quick || []).filter(x => !held[x.sym]).slice(0, 5)) { const p = px[q.sym]; if (!p) continue; any = true; const k = p / q.buyLo;
    out.push(p > q.buyHi ? q.sym + ': SKIP. Now ' + money(p) + ', above its entry range (' + money(q.buyLo) + ' to ' + money(q.buyHi) + ').' : p <= q.stop ? q.sym + ': CANCELLED. Now ' + money(p) + ', at or below its invalidation level ' + money(q.stop) + '.'
      : q.sym + ': BUY near ' + money(p) + ' | STOP ' + money(p - (q.buyLo - q.stop)) + ' | SELL ' + (q.t1 ? money(q.t1 * k) + (q.t2 ? ' then ' + money(q.t2 * k) : '') : 'on the rule exit') + ' | out after ' + (q.maxHold || 5) + ' sessions at the latest'); }
  for (const b of (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo && !held[x.sym]).slice(0, 4)) { const p = px[b.sym]; if (!p) continue; any = true;
    out.push(p > b.buyHi ? b.sym + ': SKIP. Now ' + money(p) + ', above its buy range (' + money(b.buyLo) + ' to ' + money(b.buyHi) + ').' : p <= b.stop ? b.sym + ': CANCELLED. Now ' + money(p) + ', at its stop level.'
      : b.sym + ': BUY near ' + money(p) + ' | STOP ' + money(p - (b.buyLo - b.stop)) + ' | SELL ' + (b.target ? money(b.target * p / b.buyLo) : 'when it closes below ~' + money(b.exitBelow)) + ' | swing trade, days to weeks'); }
  if (sig.quickPaused) out.push('Quick trades are paused by the circuit breaker.');
  if (!any) out.push('No new trade right now. Nothing passed its tests at the last close.');
  const pv = sig.posVerdict || {};
  for (const sym of Object.keys(held)) { const P = held[sym], p = px[sym], chg = p ? ' Now ' + money(p) + ' (' + (p >= P.entry ? '+' : '') + ((p / P.entry - 1) * 100).toFixed(1) + '%).' : '';
    out.push(sym + ' (yours): ' + (p && P.stop && p <= P.stop ? 'SELL NOW, your stop ' + money(P.stop) + ' is reached.' + chg : p && P.t2 && p >= P.t2 ? 'TARGET 2 REACHED (' + money(P.t2) + '). Sell.' + chg : p && P.t1 && p >= P.t1 ? 'TARGET 1 REACHED (' + money(P.t1) + '). Take profit, or sell part and raise the stop to your entry.' + chg : pv[sym] ? 'SELL at the next open, ' + pv[sym] + chg : 'HOLD | STOP ' + (P.stop ? money(P.stop) : 'none set') + ' | SELL ' + (P.t1 ? money(P.t1) + (P.t2 ? ' then ' + money(P.t2) : '') : 'no target set') + '.' + chg)); }
  return out;
}
async function hotList(sig) {
  if (!sig) return 'No scan has run yet.';
  const open = marketOpen(Date.now()), pos = loadPos(), px = {};
  if (open) { const c = planCands(sig, pos); for (const sym of [...new Set([...c.filter(x => x.ok).map(x => x.sym), ...Object.keys(pos)])].slice(0, 30)) { const j = await liveQ((sym)); if (j && +j.price > 0) px[sym] = +j.price; } }
  return planText(sig, pos, open ? px : null, open ? 'WHAT TO DO NOW (' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' }) + ' Kuwait, live prices)' : 'PLAN, from the ' + sig.session + ' close');
}
async function detailList(sig) {
  if (!sig) return 'No scan has run yet.';
  const open = marketOpen(Date.now()), pos = loadPos(), px = {};
  const qk = (sig.quick || []).filter(x => !pos[x.sym]).slice(0, 5), buys = (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo && !pos[x.sym]).slice(0, 4);
  if (open) for (const sym of [...new Set([...qk.map(q => q.sym), ...buys.map(b => b.sym), ...Object.keys(pos)])].slice(0, 30)) { const j = await liveQ((sym)); if (j && +j.price > 0) px[sym] = +j.price; }
  const out = [...(open ? conclusionLive(sig, pos, px) : conclusion(sig, pos)), '', 'DETAILS, from the ' + sig.session + ' close' + (open ? ', priced now' : ' (market closed: these are the prices to use at the next open)')], live = async (sym, fallback) => px[sym] || fallback;
  if (qk.length) out.push('', 'QUICK TRADES, 2 TO 5 DAYS (' + qk.length + ')');
  for (const q of qk) {
    const p = await live(q.sym, q.last), where = p > q.buyHi ? 'ABOVE its entry range: the dip is gone, skip it' : p <= q.stop ? 'FAILED: at or below its invalidation level' : p < q.buyLo ? 'below its planned range, dip still running' : 'inside its entry range';
    out.push(q.sym + ' ' + money(p) + ': ' + where + '\n  entry ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ', invalidation ' + money(q.stop) + (q.t1 ? ', target 1 ' + money(q.t1) : '') + (q.t2 ? ', target 2 ' + money(q.t2) : '') + '\n  exit on the ' + (q.exitText || 'first close above its 5 day average') + ', or after ' + (q.maxHold || 5) + ' sessions\n  past result: ' + Math.round(q.win * 100) + '% wins over ' + q.n + ' trades, average ' + (q.avgPct * 100).toFixed(2) + '% a trade' + (q.earn ? '\n  ' + q.earn : ''));
  }
  if (buys.length) out.push('', 'ENTRY CONFIRMED, swing trades of days to weeks (' + buys.length + ')');
  for (const b of buys) {
    const p = await live(b.sym, b.last), where = p > b.buyHi ? 'ABOVE its buy range: too late for this signal' : p <= b.stop ? 'FAILED: at its stop level' : 'in or below its buy range';
    out.push(b.sym + ' ' + money(p) + ': ' + where + '\n  buy range ' + money(b.buyLo) + ' to ' + money(b.buyHi) + ', stop ' + money(b.stop) + (b.target ? ', target ' + money(b.target) : ', no fixed target') + (b.earn ? '\n  ' + b.earn : ''));
  }
  const lds = (sig.leaders || []).filter(x => !pos[x.sym]).slice(0, 5);
  if (lds.length) { out.push('', 'LEADERS, strongest stocks, trend trades of weeks (' + lds.length + ')');
    for (const r of lds) { let p = r.last; if (open) { const j = await liveQ((r.sym)); if (j && +j.price > 0) p = +j.price; }
      out.push(r.sym + ' ' + money(p) + ': ' + (p > r.buyHi ? 'ABOVE its buy range. Do not chase; wait for it to come back under ' + money(r.buyHi) : p <= r.stop ? 'FAILED: at or under its stop. Skip it' : 'in its buy range') + '\n  buy ' + money(r.buyLo) + ' to ' + money(r.buyHi) + ', stop ' + money(r.stop) + ', up ' + Math.round(r.mom * 100) + '% in ' + Math.round(LEADCFG.LOOK / 21) + ' months' + (r.earn ? '\n  ' + r.earn : '')); }
    out.push('Full list and its record: send   leaders'); }
  if (!qk.length && !buys.length && !lds.length) out.push('', 'Nothing passed the tests at that close. On most days the honest answer is: no trade today.');
  out.push('', 'These are tested setups, not hot tips. Small wins, strict stops, manual review only. Check halal status first. After buying, tell me: bought SYMBOL PRICE SHARES');
  return out.join('\n');
}
// On-demand analysis of ANY ticker, right now, with the same rules as the nightly scan. The ticker then joins the nightly list.
let spyDaily = null;
async function loadDaily(sym) {
  if (sym === 'SPY' && spyDaily) return spyDaily;
  const j = await td('/time_series?symbol=' + encodeURIComponent(sym) + '&interval=1day&outputsize=4000&order=ASC'); if (!j || !j.values) return null;
  const now = Date.now(), all = j.values.map(v => ({ d: v.datetime.slice(0, 10), o: +(+v.open).toFixed(4), h: +(+v.high).toFixed(4), l: +(+v.low).toFixed(4), c: +(+v.close).toFixed(4), v: Math.round(+v.volume || 0) })).sort((a, b) => a.d < b.d ? -1 : 1);
  const res = { candles: all.filter(c => barClosed(c.d, now)), last: all[all.length - 1].c }; if (sym === 'SPY') spyDaily = res; return res;
}
function addExtra(sym) { const a = readExtra(); if (a.includes(sym)) return false; a.push(sym); fs.writeFileSync(EXTRA_FILE, JSON.stringify(a.slice(-60))); return true; }
async function checkLive(sym) {
  const d = await loadDaily(sym); if (!d || !d.candles.length) return sym + ': I could not load prices for this ticker. Check the symbol.';
  const c = d.candles, i = c.length - 1, out = [sym + ', analysed now from the ' + c[i].d + ' close', 'Closed ' + money(c[i].c) + '.'], added = addExtra(sym);
  const refLine2 = () => { const r = L.refPlan(c, d.last), o = L.refOdds(c);
    if (!r) return 'CONCLUSION: no plan. ' + (c.length < 30 ? 'It is too new.' : 'It is trading under its 50 day average, so the trend is weakening.');
    if (o && o.won < 0.25) return 'CONCLUSION: no plan. On its own history the reward marker came before the stop in only ' + Math.round(o.won * 100) + '% of cases, which loses on average.';
    return 'CONCLUSION (reference only, not tested): ' + (r.extended ? 'wait for a pullback, then BUY ' : 'BUY ') + money(r.lo) + ' to ' + money(r.hi) + ' | STOP ' + money(r.stop) + ' | reward marker ' + money(r.target) + (o ? '. The marker came first in ' + Math.round(o.won * 100) + '% of ' + o.cases + ' past cases.' : '.'); };
  let word = 'NO BUY: no tested rule supports a trade on it.';
  if (c.length < 600) out.push('It has under three years of price history, so no rule can be tested on it.', refLine2());
  else {
    const spy = await loadDaily('SPY'), mkt = spy ? L.marketMap(spy.candles) : null, ind = L.indicators(c, mkt);
    const mom = spy && spy.candles.length > 130 ? spy.candles[spy.candles.length - 1].c / spy.candles[spy.candles.length - 127].c - 1 : undefined;
    const T = L.trendStats(c, ind, mom), Lr = L.learn(c, ind, null, false), halal = myHalal(sym), v = L.applyGates(L.verdict(c, ind, Lr, null, d.last, false), { dollarVol: T.dollarVol, halal, limit: null });
    const trig = L.buyTrigger(c, ind, Lr), dist = Lr.v.mult * ind.atr[i], half = 0.5 * ind.atr[i], Q = d.last >= 5 ? L.quickFire(c, ind, L.quickStudy(c, ind, false)) : null;
    out.push((T.up ? 'In an uptrend' : c[i].c < ind.e[L.CFG.TREND][i] ? 'In a downtrend' : 'Mixed trend') + ', ' + (T.mom6 >= 0 ? '+' : '') + Math.round(T.mom6 * 100) + '% over 6 months' + (T.rs === null ? '' : ' (' + (T.rs >= 0 ? '+' : '') + Math.round(T.rs * 100) + '% vs the market)') + '.',
      'Rule tested for it: ' + L.ruleText(Lr.v) + '. ' + Lr.test.n + ' unseen trades, ' + Math.round(Lr.test.winRate * 100) + '% wins. ' + L.statusText(Lr));
    if (v.act) word = 'BUY: a tested rule confirmed an entry. Prices below.';
    else if (v.blocked) word = 'NO BUY: ' + v.why;
    else if (Lr.proven && trig.price) word = 'WATCH: not yet. It becomes a buy only after a daily close above ~' + money(trig.price) + '.';
    else if (Q) { const net = netOf(Q.avgPct, d.last); word = okEv(Q.test.n, net, Q.test.winRate) ? 'BUY' + (Q.test.n < 30 ? ' (EARLY EVIDENCE, smaller size)' : '') + ': quick trade with ' + Q.test.n + ' tested past trades. Prices below.' : 'WATCH: quick trade setup, but only ' + Q.test.n + ' past trades' + (net > 0 ? '' : ' and no profit after your costs') + '. Paper only.'; }
    else if (Lr.proven) word = 'WATCH: tested rule, but no entry now.';
    if (v.act) out.push('CONCLUSION: ENTRY CONFIRMED. BUY ' + money(d.last) + ' to ' + money(d.last + half) + ' | STOP ' + money(d.last - dist) + ' | SELL ' + (Lr.v.tp ? money(d.last + Lr.v.tp * dist) : 'when it closes below ~' + money(L.sellLevel({ v: Lr.v }, c, ind))));
    else if (v.blocked) out.push('CONCLUSION: no trade. ' + v.why);
    else if (Lr.proven && trig.price) out.push('CONCLUSION: not yet. BUY only after a daily close above ~' + money(trig.price) + ' (' + ((trig.price / d.last - 1) * 100).toFixed(1) + '% away) | then STOP ~' + money(trig.price - dist) + ' | SELL ' + (Lr.v.tp ? '~' + money(trig.price + Lr.v.tp * dist) : 'on the rule exit'));
    else if (Q) { const P = L.quickPlan(d.last, ind.atr[i], ind.sma5[i], Q); out.push('CONCLUSION: quick trade setup. BUY ' + money(P.lo) + ' to ' + money(P.hi) + ' | STOP ' + money(P.stop) + ' | SELL ' + (P.t1 ? money(P.t1) + (P.t2 ? ' then ' + money(P.t2) : '') : 'on the rule exit') + ' | out after ' + Q.v.maxHold + ' sessions. Past result: ' + Math.round(Q.test.winRate * 100) + '% wins over ' + Q.test.n + ' trades.'); }
    else if (Lr.proven) out.push('CONCLUSION: no trade now. ' + trig.text);
    else out.push('No tested rule supports a trade on this stock.', refLine2());
    out.push(L.HALAL_TEXT[halal] + '. Earnings date not checked: verify it before acting.');
  }
  if (myHalal(sym) === 'fail') word = 'NO BUY: you marked it NOT halal in ZAD.';
  out.unshift(sym + ': ' + word);
  out.push(added ? 'I have added ' + sym + ' to my nightly scan. Send: remove ' + sym + '   to take it off.' : sym + ' is on my nightly scan list.');
  return out.join('\n');
}
// ---- Tip log. You forward what a channel or person recommends; the bot stamps date and price, checks each stock against the
// tested rules, adds it to the nightly scan, and from then on scores that source against the S&P 500.
const TIP_FILE = 'data/tips.jsonl', NOT_TICKERS = new Set(['USD', 'US', 'USA', 'ETF', 'FDA', 'CEO', 'AI', 'IPO', 'EPS', 'PE', 'ATH', 'GTC', 'NYSE', 'KWD', 'KD', 'TP', 'SL', 'BUY', 'SELL', 'TIPS', 'TIP', 'LOG']);
const readTips = () => fs.existsSync(TIP_FILE) ? fs.readFileSync(TIP_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
const western = (t) => t.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[\u066B]/g, '.').replace(/[\u066C]/g, '');
function parseTips(raw) {       // source name, tickers, and any "buy below" / "current price" figures (Arabic or English)
  const text = western(raw), first = text.split('\n')[0], m = first.match(/^\s*(?:tips?|log|\u062A\u0648\u0635\u064A\u0627\u062A|\u062A\u0648\u0635\u064A\u0629)\s*[:\-]?\s*(.*)$/i);
  let src = m ? m[1].replace(/\b[A-Z]{1,5}\b.*$/, '').replace(/[:\-]+\s*$/, '').trim().slice(0, 40) : '';
  const body = m ? text.slice(first.length) + ' ' + m[1] : text, found = [], re = /\b[A-Z]{1,5}\b/g; let x;
  while ((x = re.exec(body))) if (!NOT_TICKERS.has(x[0]) && !found.some(f => f.sym === x[0])) found.push({ sym: x[0], at: x.index });
  found.forEach((f, n) => { const seg = body.slice(f.at, n + 1 < found.length ? found[n + 1].at : f.at + 220), num = (r) => { const q = seg.match(r); return q ? +q[1].replace(/,/g, '') : null; };
    f.below = num(/(?:\u0627\u0642\u0644 \u0645\u0646|\u0623\u0642\u0644 \u0645\u0646|below|under)\s*\$?\s*([\d.,]+)/i); f.stated = num(/(?:\u0627\u0644\u062D\u0627\u0644\u064A|current(?: price)?|now)\s*[:\-]?\s*\$?\s*([\d.,]+)/i); });
  // the source's name: one you logged before that appears anywhere in the text wins; then a line like "Tip NAME source" / "source: NAME"
  { const known = [...new Set(readTips().map(t => t.src))].filter(n => n && n.length >= 3 && n !== 'Unnamed source').sort((a, b) => b.length - a.length).find(n => text.includes(n.replace(/^youtube:\s*/i, '')));
    const line = text.match(/^\s*(?:tips?\s+)?(.{2,40}?)\s+source\s*$/im) || text.match(/^\s*(?:source|from|\u0627\u0644\u0645\u0635\u062F\u0631)\s*[:\-]\s*(.{2,40})$/im);
    if (known) src = known; else if (line && !/\b[A-Z]{2,5}\b/.test(line[1])) src = line[1].trim(); }
  return { src: src || 'Unnamed source', tips: found.slice(0, 15) };
}
async function logTips(raw, fwd) {     // fwd = the channel or person a message was forwarded from, used as the source name when none is typed
  const parsed = parseTips(raw), tips = parsed.tips, src = parsed.src === 'Unnamed source' && fwd ? fwd : parsed.src; if (!tips.length) return 'I found no tickers in that message. Send it like this:\ntips SOURCE NAME\nLPG ETON PAYS';
  const old = readTips(), day = ny(Date.now()).d, out = ['Logged ' + tips.length + ' tip' + (tips.length > 1 ? 's' : '') + ' from: ' + src, ''];
  for (const t of tips) {
    const rep = await checkLive(t.sym), px = rep.match(/Closed ([\d.]+)\./), concl = rep.split('\n').find(l => l.startsWith('CONCLUSION')) || (rep.includes('could not load') ? 'I could not load prices for this ticker.' : 'No tested rule supports a trade on this stock.');
    const p0 = px ? +px[1] : null;
    if (!p0) { out.push(t.sym + ': not logged. I could not load prices for it, so it is probably not a US ticker.'); continue; }
    if (!old.some(o => o.sym === t.sym && o.src === src && o.d === day)) fs.appendFileSync(TIP_FILE, JSON.stringify({ sym: t.sym, src, d: day, p0, below: t.below, ts: Date.now() }) + '\n');
    out.push(t.sym + (p0 ? ' at ' + money(p0) : '') + (t.below ? ' (source says buy below ' + money(t.below) + (p0 ? p0 <= t.below ? ', it is inside that zone' : ', it is ABOVE that level' : '') + ')' : '') + '\n  ' + concl.replace(/^CONCLUSION:?\s*/, 'My check: '));
  }
  out.push('', 'The source gave no stop and no selling price for any of these. I will follow each one and score this source against the S&P 500. Send: sources   to see the scoreboard. All of them are now on my nightly scan.');
  return out.join('\n');
}
function tipBoard(sig) {
  const b = sig && sig.tipBoard; if (!b || !b.tips || !b.tips.length) return readTips().length ? 'Tips are logged. Their results appear after the next nightly scan.' : 'No tips logged yet. Send:\ntips SOURCE NAME\nLPG ETON PAYS';
  const pcx = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', out = ['TIP SOURCES, scored against the S&P 500 (from the ' + sig.session + ' close)'];
  for (const s0 of b.sources) out.push(s0.src + ': ' + s0.n + ' tips, average ' + pcx(s0.avg) + ' against ' + pcx(s0.spy) + ' for the S&P 500. ' + s0.beat + ' of ' + s0.n + ' beat the market. ' + (s0.muted ? 'MUTED: trails the market. ' : s0.trusted ? 'TRUSTED so far: ahead of the market. ' : '') + 'Record: ' + (s0.n < 10 || s0.days < 20 ? 'INSUFFICIENT EVIDENCE (under 10 tips or under a month)' : s0.n < 30 ? 'EARLY RECORD (10 to 29 tips)' : s0.n < 50 ? 'TRACKABLE RECORD (30+ tips)' : 'MORE RELIABLE RECORD (50+ tips)') + '.');
  out.push('', 'EACH TIP'); for (const t of b.tips.slice(-20)) out.push(t.sym + ' (' + t.src + ', ' + t.d + '): ' + (t.ret === null ? 'too early' : pcx(t.ret) + ' in ' + t.days + ' sessions, S&P 500 ' + pcx(t.spy)));
  return out.join('\n');
}
function checkOne(sym, sig) {
  if (!sig) return 'No scan has run yet.';
  const q = (sig.quick || []).find(x => x.sym === sym), st = (sig.stocks || []).find(x => x.sym === sym), qOk = q && okEv(q.n, netOf(q.avgPct, q.last), q.win), stOk = st && st.state === 'Buy watch' && okEv(st.n || 0, netOf(st.avgPct || 0, st.last), st.win);
  const word = qOk || stOk ? 'BUY: a tested setup is open. Send  today  for the prices.' : st && st.state === 'Buy watch' ? 'WATCH: entry signal, but too few tested trades. Paper only.' : q ? 'WATCH: quick setup with too little proof. Paper only.' : st && st.state === 'Blocked' ? 'NO BUY: blocked by earnings or news.' : st && st.proven && st.trigger ? 'WATCH: needs a daily close above ~' + money(st.trigger) + '.' : 'NO BUY: no tested setup.';
  const lines = [sym + ': ' + (myHalal(sym) === 'fail' ? 'NO BUY: you marked it NOT halal in ZAD.' : word), sym + ', from the ' + sig.session + ' close'];
  if (q) lines.push('Quick trade setup: entry ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ', invalidation ' + money(q.stop) + (q.t1 ? ', target 1 ' + money(q.t1) : '') + '. Past result ' + Math.round(q.win * 100) + '% wins over ' + q.n + ' trades.');
  if (st) lines.push('Closed ' + money(st.last) + '. ' + (st.uptrend ? 'In an uptrend' : 'Not in an uptrend') + ', ' + (st.mom6 >= 0 ? '+' : '') + Math.round(st.mom6 * 100) + '% over 6 months.', 'Rule: ' + st.rule + '. ' + (st.proven ? 'It passed its tests.' : 'It did not pass its tests, so no signals are given.'), 'State: ' + (st.state === 'Buy watch' ? 'ENTRY CONFIRMED' : st.trigger ? 'BUY WATCH, needs a close above ~' + money(st.trigger) : st.state) + '. ' + st.why, L.HALAL_TEXT[st.halal] || '');
  if (!q && !st) lines.push('Not on the scanned list, or it has under three years of price history. To have me scan it, add it to watchlist.txt in the repository. To check it right away, add it to the watchlist in Setup on the page.');
  return lines.filter(Boolean).join('\n');
}
// Pre-market briefing: sent once each weekday about an hour before the US open, without being asked.
async function preMarket(sig) {
  if (!sig || !env.TG_TOKEN || !env.TG_CHAT) return;
  const n = ny(Date.now());
  if (!env.BRIEF_NOW && (n.weekend || isHoliday(n.d) || n.mins < 240 || n.mins > 300)) return;        // 4:00 to 5:00 am New York = when US pre-market trading opens (11 am Kuwait time while New York is on summer time, noon in winter)
  const st = readJson('data/tg-state.json', { offset: 0 }); if (st.brief === n.d && !env.BRIEF_NOW) return;
  await telegram(planText(sig, loadPos(), null, 'MORNING PLAN, ' + n.d + '. Market opens 4:30 pm Kuwait. Prices from the ' + sig.session + ' close.') + '\nDuring the session send: today   for live prices.');
  st.brief = n.d; fs.writeFileSync('data/tg-state.json', JSON.stringify(st));
  console.log('pre-market briefing sent');
}
// "market": what is moving right now. Indexes, the eleven sectors ranked by today's change, and the latest tagged headlines.
const SECTORS = { XLK: 'Technology', XLF: 'Financials', XLE: 'Energy', XLV: 'Health care', XLY: 'Consumer discretionary', XLP: 'Consumer staples', XLI: 'Industrials', XLB: 'Materials', XLU: 'Utilities', XLRE: 'Real estate', XLC: 'Communication' };
async function marketNow() {
  // Outside forces that move groups of stocks: oil for energy companies, metals for miners, Bitcoin for crypto-linked and speculative stocks.
  // Shown as context through exchange-traded funds that follow them. Not a suggestion to trade any of them.
  const DRIVERS = { USO: 'Crude oil', GLD: 'Gold', SLV: 'Silver', CPER: 'Copper', XME: 'Metals and mining companies', IBIT: 'Bitcoin' };
  const idx = { SPY: 'S&P 500', QQQ: 'Nasdaq 100', IWM: 'Small companies' }, syms = [...Object.keys(idx), ...Object.keys(SECTORS), ...Object.keys(DRIVERS)], q = {};
  for (let k = 0; k < syms.length; k += 7) {            // two batches: the free plan allows 8 quotes a minute
    if (k) await sleep(FAST ? 5 : 62000);
    try { const part = syms.slice(k, k + 7), r = await fetch(TD + '/quote?symbol=' + part.join(',') + '&apikey=' + encodeURIComponent(env.TWELVE_KEY)), j = await r.json(); for (const x of part) { const v = part.length === 1 ? j : j[x]; if (v && v.percent_change !== undefined) q[x] = +v.percent_change / 100; } } catch (e) {}
  }
  const pcx = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%', out = ['MARKET NOW' + (marketOpen(Date.now()) ? '' : ' (market closed: last session)')];
  out.push(Object.keys(idx).filter(x => q[x] !== undefined).map(x => idx[x] + ' ' + pcx(q[x])).join(', ') || 'Index prices unavailable.');
  const secs = Object.keys(SECTORS).filter(x => q[x] !== undefined).sort((a, b) => q[b] - q[a]);
  if (secs.length) out.push('', 'SECTORS TODAY, strongest first', ...secs.map(x => SECTORS[x] + ' ' + pcx(q[x])), '', 'Strongest: ' + secs.slice(0, 2).map(x => SECTORS[x]).join(', ') + '. Weakest: ' + secs.slice(-2).map(x => SECTORS[x]).join(', ') + '.', 'One day of sector moves is mostly noise. The weekly review shows which sectors are really leading.');
  const drv = Object.keys(DRIVERS).filter(x => q[x] !== undefined);
  if (drv.length) out.push('', 'OIL, METALS AND BITCOIN TODAY (context for the stocks tied to them)', ...drv.map(x => DRIVERS[x] + ' ' + pcx(q[x])), 'Oil moves energy stocks, metals move miners, and Bitcoin tends to move with crypto-linked and speculative stocks. A one-day move is context, not a signal.');
  if (env.FINNHUB_KEY) {
    const tag = (t) => /\bFDA\b|PDUFA|phase (2|3|ii|iii)\b|trial/i.test(t) ? 'FDA' : /\bmerg|acqui|takeover|buyout|tender offer/i.test(t) ? 'Deal' : /earnings|guidance|results/i.test(t) ? 'Earnings' : /\bFed\b|rates?\b|inflation|jobs|tariff/i.test(t) ? 'Economy' : null, heads = [];
    for (const cat of ['merger', 'general']) { try { const r = await fetch(FH + '/news?category=' + cat + '&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (r.ok) for (const x of (await r.json()).slice(0, 25)) { const t = tag(x.headline || '') || (cat === 'merger' ? 'Deal' : null); if (t && Date.now() - x.datetime * 1000 < 36 * 3600000) heads.push({ t, h: String(x.headline).slice(0, 120), rel: String(x.related || '').split(',')[0], at: x.datetime }); } } catch (e) {} }
    heads.sort((a, b) => b.at - a.at);
    const seen = new Set(), top = heads.filter(x => !seen.has(x.h) && seen.add(x.h)).slice(0, 8);
    out.push('', 'HEADLINES, last 36 hours', ...(top.length ? top.map(x => x.t + (x.rel ? ' ' + x.rel : '') + ': ' + x.h) : ['Nothing tagged deal, FDA, earnings or economy.']));
  } else out.push('', 'Headlines are off: the Finnhub key is not passed to this bot yet.');
  out.push('', 'This is a picture of the moment, not advice on what to buy or sell. By the time a headline is here, the price has usually moved.');
  return out.join('\n');
}
// Negative news that blocks a NEW entry for a week. Evidence: disclosed regulator investigations are followed by months of
// underperformance; drug rejections, going-concern warnings, delisting notices, short-seller reports and bankruptcies bring losses
// too large to step in front of. Lawsuits and law-firm notices are common and mostly priced in at once, so they warn but do not block.
const HARD_NEG = [
  ['Regulator investigation', /\b(SEC|DOJ|FTC|Justice Department|regulators?)\b[^.]{0,60}\b(investigat\w*|probe|subpoena\w*|charges?|inquiry)|\bsubpoena(ed)?\b|under (federal |criminal )?investigation/i],
  ['FDA rejection', /complete response letter|\bCRL\b|FDA (rejects|rejection|declines|refuses|refusal)|refus(e|al)[- ]to[- ]file|clinical hold/i],
  ['Going-concern warning', /going[- ]concern/i],
  ['Delisting notice', /delisting|to be delisted|listing (deficiency|standards)|deficiency (notice|letter)|non-?compliance (notice|letter)/i],
  ['Short-seller report', /short[- ]seller|short report|hindenburg|muddy waters|citron research|spruce point|grizzly research/i],
  ['Bankruptcy', /bankruptcy|chapter 11/i],
  ['Accounting restatement', /restat(e|es|ed|ement)\b[^.]{0,40}(financial|results|earnings|statements)|accounting irregularit/i],
  // New shares sold to raise money. Evidence: companies that issue stock lag the market afterwards, and the sale itself is usually priced under the market.
  ['Share offering', /\b(pric(es|ed|ing)|announc(es|ed|ing)|launch(es|ed|ing)?|propos(es|ed)|commenc(es|ed|ing)|clos(es|ed|ing)|files? for|plans?)\b[^.]{0,70}\b((public|follow-on|underwritten|registered direct|secondary) offering|offering of (common |ordinary )?(stock|shares|ADSs)|private placement|convertible (senior )?notes)|\bregistered direct\b|\bsecondary offering\b|at-the-market (offering|program|facility)|\bATM (offering|program|facility)\b|\b(share|stock|equity) offering\b/i]];
const SOFT_NEG = /class action|lawsuit|\bsue[sd]?\b|securities fraud|shareholder alert|investor alert|lead plaintiff|on behalf of (investors|shareholders)|law (firm|offices?)/i;
const LAWFIRM = /shareholder alert|investor alert|investors? (are )?(encouraged|reminded|urged)|reminds (investors|shareholders)|law (firm|offices?)|lead plaintiff|on behalf of (investors|shareholders)|pomerantz|rosen law|levi & korsinsky|bragar eagel|glancy prongay|faruqi|kessler topaz|robbins geller|bernstein liebhard|schall law|hagens berman/i;
const ROUNDUP = /stocks? (mixed|moving|movers)|gap up and gap down|pre-market session|midday stories|top stories|market (wrap|update)|biggest (gainers|movers|losers)/i;
function negNews(heads) {      // heads: this company's own headlines, newest first
  const own = heads.filter(h => h && !ROUNDUP.test(h));
  for (const h of own) { if (LAWFIRM.test(h)) continue; const t = HARD_NEG.find(([, re]) => re.test(h)); if (t) return { hard: { tag: t[0], h: h.slice(0, 110) }, soft: null }; }
  const s = own.find(h => SOFT_NEG.test(h));
  return { hard: null, soft: s ? { tag: 'Legal news', h: s.slice(0, 110) } : null };
}
async function newsRisk(sym) {
  if (!env.FINNHUB_KEY) return { known: false };
  try { const d = (ms) => new Date(ms).toISOString().slice(0, 10), r = await fetch(FH + '/company-news?symbol=' + sym + '&from=' + d(Date.now() - 7 * 86400000) + '&to=' + d(Date.now()) + '&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (!r.ok) return { known: false };
    const it = await r.json(); return { known: true, ...negNews((Array.isArray(it) ? it : []).map(x => String(x.headline || ''))) }; } catch (e) { return { known: false }; } finally { await sleep(FAST ? 0 : 1100); }
}
// ---- Fast movers requiring investigation. A SEPARATE category from quality candidates: a stock up 50% is not a good
// investment because it is up 50%; it is a priority to look into. Source: FMP's live gainers list (if your plan allows it).
async function gainersNow() {
  if (!env.FMP_KEY) return { off: 'no FMP key is passed to the bot' };
  try {
    const r = await fetch(FMPB + '/stable/biggest-gainers?apikey=' + encodeURIComponent(env.FMP_KEY));
    if (!r.ok) return { off: 'FMP answered HTTP ' + r.status + ' for the live gainers list (not on your plan)' };
    const j = await r.json(); if (!Array.isArray(j)) return { off: 'FMP returned no list' };
    return { list: j.map(x => ({ sym: String(x.symbol || ''), price: +x.price, pct: +(x.changesPercentage ?? x.changePercentage ?? x.changePercent ?? 0) / 100, name: String(x.name || '').slice(0, 40) })).filter(x => /^[A-Z]{1,5}$/.test(x.sym) && x.price >= 0.1 && x.pct >= 0.2 && x.pct < 20).sort((a, b) => b.pct - a.pct) };
  } catch (e) { return { off: 'the live gainers list could not be reached' }; }
}
async function whyMoved(sym, name) {     // the headline must be about THIS company; general market round-ups are ignored
  if (!env.FINNHUB_KEY) return '';
  try { const d = (ms) => new Date(ms).toISOString().slice(0, 10), r = await fetch(FH + '/company-news?symbol=' + sym + '&from=' + d(Date.now() - 2 * 86400000) + '&to=' + d(Date.now()) + '&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (!r.ok) return '';
    const it = await r.json(); if (!Array.isArray(it) || !it.length) return '\n  news: none found. A big move with no news is a warning sign.';
    const word = String(name || '').split(/[\s,.]+/)[0], esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const about = new RegExp('\\b' + esc(sym) + '\\b' + (word.length >= 4 ? '|' + esc(word) : ''), 'i'), roundup = /stocks? (mixed|moving|movers)|gap up and gap down|pre-market session|midday stories|top stories|market (wrap|update)|biggest (gainers|movers)/i;
    const tagOf = (h) => { const hn = LAWFIRM.test(h) ? null : HARD_NEG.find(([, re]) => re.test(h)); if (hn) return 'WARNING, ' + hn[0].toUpperCase(); return tagOf0(h); };
    const tagOf0 = (h) => /offering|private placement|warrants|registered direct/i.test(h) ? 'SHARE OFFERING (dilution)' : /trading halt|halted/i.test(h) ? 'TRADING HALT' : /\bFDA\b|PDUFA|phase (2|3|ii|iii)|trial|approval/i.test(h) ? 'FDA / trial' : /\bmerg|acqui|takeover|buyout|to be bought/i.test(h) ? 'Deal' : /earnings|guidance|results|quarter/i.test(h) ? 'Earnings' : /contract|partnership|awarded|agreement/i.test(h) ? 'Contract' : null;
    const heads = it.map(x => String(x.headline || '')).filter(Boolean), own = heads.filter(h => about.test(h) && !roundup.test(h)), pick = own.find(h => /^WARNING/.test(tagOf(h) || '')) || own.find(h => tagOf(h)) || own[0] || heads.find(h => tagOf(h) && !roundup.test(h));
    if (!pick) return '\n  news: no headline about this company found, only general market round-ups. Treat the move as unexplained.';
    return '\n  news: ' + (tagOf(pick) || 'Company news') + ' \u2014 ' + pick.slice(0, 120) + (tagOf(pick) === 'Deal' && /to be (acquired|bought|taken private)|acquired by|agrees? to be|buyout|takeover (bid|offer)|tender offer|to sell itself/i.test(pick) ? '\n  note: if this company is being bought, the price usually jumps to near the offer at once and then barely moves.' : tagOf(pick) === 'Deal' && /to acquire|acquires|acquisition of|to buy\b/i.test(pick) ? '\n  note: this company is the buyer. A buyer\u2019s share price often dips on the news.' : ''); } catch (e) { return ''; } finally { await sleep(FAST ? 0 : 1100); }
}
const moverEvidence = () => { const m = readJson('data/movers-state.json', null); return m && m.study ? '\nWhat the last ' + m.sessions + ' sessions say about buying after a 20% jump: ' + m.study : '\nThe movers radar has not produced its study yet.'; };
const moverLine = async (x) => x.sym + ' ' + (x.pct >= 0 ? '+' : '') + Math.round(x.pct * 100) + '% at ' + money(x.price) + (x.name ? ' (' + x.name + ')' : '') + (x.price < 5 ? '\n  under 5 USD: can be halted, wide spread, gaps past stops' : '') + (await whyMoved(x.sym, x.name));
async function fastMovers() {     // automatic alert, at most a few a day, each stock once
  const now = Date.now(); if (!marketOpen(now)) return;
  const st = readJson('data/fm-state.json', { day: '', sent: {}, off: '' }), day = ny(now).d; if (st.day !== day) { st.day = day; st.sent = {}; st.off = ''; }
  if (st.off || Object.keys(st.sent).length >= 12) return;
  const g = await gainersNow();
  if (g.off) { st.off = g.off; console.log('fast movers off today: ' + g.off); fs.writeFileSync('data/fm-state.json', JSON.stringify(st)); return; }
  const fresh = g.list.filter(x => x.price >= 1 && !st.sent[x.sym]).slice(0, 4); if (!fresh.length) return;      // automatic alerts stay at 1 USD and over
  const lines = []; for (const x of fresh) { st.sent[x.sym] = 1; lines.push(await moverLine(x)); }
  fs.writeFileSync('data/fm-state.json', JSON.stringify(st));
  await telegram('FAST MOVERS REQUIRING INVESTIGATION\nNot quality candidates. Already moving. Investigate before anything else.\n\n' + lines.join('\n\n') + '\n' + moverEvidence() + '\n\nNo entry or exit prices are given for fast movers: nothing here has been tested on them. Not financial advice, not a halal ruling.');
  console.log('fast movers alert: ' + fresh.length);
}
async function moversNow() {      // the "movers" command
  const g = await gainersNow(); if (g.off) return 'Live movers are unavailable: ' + g.off + '. The nightly movers radar still reports the day\u2019s movers after the close.';
  if (!g.list.length) return 'No stock is up 20% or more right now.';
  const main = g.list.filter(x => x.price >= 1), sub = g.list.filter(x => x.price < 1), lines = []; for (const x of main.slice(0, 8)) lines.push(await moverLine(x));
  return 'FAST MOVERS RIGHT NOW (investigation list, not quality candidates)\n\n' + (lines.length ? lines.join('\n\n') : 'None at 1 USD and over.')
    + (sub.length ? '\n\nUNDER 1 USD (extreme risk: shown so nothing is hidden, never a trade)\n' + sub.slice(0, 6).map(x => x.sym + ' +' + Math.round(x.pct * 100) + '% at ' + x.price.toFixed(3) + (x.name ? ' (' + x.name + ')' : '')).join('\n') + '\nStocks under 1 USD can be halted, delisted or diluted within days.' : '') + '\n' + moverEvidence();
}
// ---- Plain questions. No AI: the bot looks for a few words (sell, buy, penny, a sector name, a ticker) and answers from its own data.
const SECTORS_OF = {}; for (const [name, list] of Object.entries({
  'Technology': 'AAPL MSFT NVDA AVGO AMD ORCL CRM ADBE AMAT CSCO IBM INTC INTU NOW QCOM TXN ACN PLTR PANW MU SHOP ADP',
  'Consumer discretionary': 'AMZN TSLA HD BKNG LOW MCD NKE SBUX TGT TJX UBER', 'Communication': 'GOOGL META NFLX DIS T TMUS VZ CMCSA',
  'Financials': 'JPM BAC V MA SPGI', 'Health care': 'UNH LLY JNJ ABBV ABT AMGN BMY CVS DHR GILD ISRG MDT MRK PFE TMO VRTX REGN ZTS CI ELV',
  'Energy': 'XOM CVX COP', 'Consumer staples': 'WMT COST PG KO PEP', 'Industrials': 'CAT DE GE HON MMM UNP UPS', 'Materials': 'LIN', 'Utilities': 'NEE SO' })) for (const x of list.split(' ')) SECTORS_OF[x] = name;
const SECTOR_WORDS = [['Technology', /\b(tech|technology|software|semiconductors?|chips?|ai)\b/i], ['Health care', /\b(health|healthcare|pharma|biotech|medical|drug)\w*/i], ['Energy', /\b(energy|oil|gas)\b/i], ['Financials', /\b(financ\w*|banks?|payments?)\b/i],
  ['Consumer discretionary', /\b(consumer|retail|discretionary|cars?|autos?)\b/i], ['Consumer staples', /\b(staples|food|beverages?)\b/i], ['Communication', /\b(communication|media|telecom|streaming)\b/i], ['Industrials', /\b(industrials?|machinery|transport|airlines?|defen[cs]e)\b/i], ['Materials', /\b(materials?|mining|metals?|chemicals?)\b/i], ['Utilities', /\butilit\w*/i]];
const COMMON_WORDS = new Set('IT THIS THAT MY THE A AN NOW TODAY STOCK STOCKS PENNY ME SOME ANY THEM ALL AND OR FOR TO IN ON OF IS ARE WHAT WHEN SHOULD CAN DO I WE YOU BUY SELL HOLD SHARE SHARES PLEASE NEW GOOD BEST HOT ONE HUNT FIND LOOK GIVE WANT NEED UP DOWN OUT AT MORE AGAIN BACK HIGH LOW INTO SOON LATER HERE THERE BEFORE AFTER MUCH MANY JUST RIGHT GOING WHEN THEN IF NOT YET'.split(' '));
function findTicker(text, sig, pos) {
  const known = new Set([...Object.keys(pos || {}), ...((sig && sig.stocks) || []).map(x => x.sym), ...((sig && sig.quick) || []).map(x => x.sym), ...((sig && sig.uni) || []).map(x => x.sym)]);
  const toks = text.replace(/[^A-Za-z.\s-]/g, ' ').split(/\s+/).filter(Boolean), okT = (t) => !COMMON_WORDS.has(t) && !NOT_TICKERS.has(t);
  for (const t of toks) if (/^[A-Z]{2,5}$/.test(t) && okT(t)) return t;                                  // written in capitals
  for (const t of toks) if (known.has(t.toUpperCase()) && okT(t.toUpperCase())) return t.toUpperCase();   // a stock I already follow
  const m = text.match(/\b(?:sell|buy|check|about|hunt|find)\s+([A-Za-z]{1,5})\b/i); return m && okT(m[1].toUpperCase()) ? m[1].toUpperCase() : null;
}
const universe = (sig) => { const ind = {}; for (const c of ((DISCMETA && DISCMETA.candidates) || [])) if (c.industry) ind[c.sym] = c.industry;
  return [...((sig && sig.stocks) || []), ...((sig && sig.uni) || [])].map(x => ({ ...x, sector: SECTORS_OF[x.sym] || ind[x.sym] || 'Other' })); };
const supportLine = (x, sig) => { const q = ((sig && sig.quick) || []).find(k => k.sym === x.sym);
  return x.state === 'Buy watch' && x.buyLo ? x.sym + ': ENTRY CONFIRMED. BUY ' + money(x.buyLo) + ' to ' + money(x.buyHi) + ' | STOP ' + money(x.stop) + ' | SELL ' + (x.target ? money(x.target) : 'below ~' + money(x.exitBelow))
    : q ? x.sym + ': QUICK TRADE. BUY ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ' | STOP ' + money(q.stop) + ' | SELL ' + (q.t1 ? money(q.t1) : 'on the rule exit')
    : x.proven && x.trigger && x.trigger / x.last < 1.15 ? x.sym + ': BUY WATCH. Only after a daily close above ~' + money(x.trigger) + ' (now ' + money(x.last) + ')' : null; };
function sectorReply(name, sig) {
  const rows = universe(sig).filter(x => x.sector.toLowerCase().includes(name.toLowerCase()) || (name === 'Health care' && /bio|pharma|health|medical|drug/i.test(x.sector)) || (name === 'Technology' && /semi|software|tech|electron/i.test(x.sector)));
  if (!rows.length) return name + ': I have no stocks from this sector on my scan. Add some with:  check TICKER';
  const sup = rows.map(x => supportLine(x, sig)).filter(Boolean), up = rows.filter(x => x.uptrend).sort((a, b) => b.mom6 - a.mom6);
  return [name.toUpperCase() + ', from the ' + sig.session + ' close: ' + rows.length + ' stock' + (rows.length === 1 ? '' : 's') + ' on my scan, ' + up.length + ' in an uptrend.', '', 'WITH TESTED SUPPORT', ...(sup.length ? sup : ['None today.']), '', 'STRONGEST TRENDS (no trade unless listed above)', ...(up.length ? up.slice(0, 6).map(x => x.sym + ' ' + (x.mom6 >= 0 ? '+' : '') + Math.round(x.mom6 * 100) + '% in 6 months, closed ' + money(x.last)) : ['None in an uptrend.']), '', 'For any of them: check TICKER'].join('\n');
}
// OPINION CHECK: a pasted or forwarded opinion with no tickers (a market call, a "buy now" message) cannot be scored as a tip,
// so it is answered with what can be checked: its warning signs, what the system's own data says about the themes it names,
// and which stocks in those themes have tested support today.
const RED_FLAGS = [
  [/استثمر بالكامل|كل (اموالك|أموالك|فلوسك|المال)|all[\s-]?in\b|invest (everything|it all)|fully invested/i, 'It tells you to put in everything. That one advice can cost a large part of an account in a single fall.'],
  [/لا تقلق|ولا تقلق|don'?t worry|no risk|بدون مخاطر|مضمون|guarantee/i, 'It tells you not to worry. Any real plan says where you get out if it is wrong; this one has no stop.'],
  [/(حتى|الى|إلى)\s*عام\s*\S{2,4}|until\s+20\d\d|لا يمكن ايقاف|لا يمكن إيقاف|unstoppable|can'?t be stopped|سوف تتجاوز|will (surely|definitely)/i, 'It states the future as a fact. Nobody knows that.'],
  [/متلاعب|manipulat/i, 'It blames every drop on manipulators in advance, so you would ignore any warning.'],
  [/حان (وقت|الوقت)|فرص[ةه] رائع|now is the time|don'?t miss|لا تفوت/i, 'It pushes urgency: "now". Real opportunities can wait for a plan.'],
  [/مذهل|سعداء|استمتع|amazing|incredible|!!/i, 'It runs on excitement, not evidence: no prices, no record, no numbers.']];
const THEMES = [
  ['AI, chips, memory and data centres', /ذكاء|اصطناعي|\bai\b|مراكز البيانات|data ?cent|الذاكرة|الذكرة|memory|chip|رقائق|semiconductor/i, 'Technology'],
  ['Energy and power', /طاقة|الطاقه|energy|power|نفط|oil|كهرباء|electric/i, 'Energy'],
  ['Shipping and transport', /شحن|shipping|ناقلات|tankers?|transport/i, 'Industrials']];
const THEME_PROXY = { 'AI, chips, memory and data centres': 'SMH', 'Energy and power': 'XLE', 'Shipping and transport': 'XLI' };   // measuring sticks only, never suggested as buys
const OPIN_FILE = 'data/opinions.jsonl';
const readOpinions = () => fs.existsSync(OPIN_FILE) ? fs.readFileSync(OPIN_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
// Does the message touch what the system is working on right now: your positions, today's buys, the radar?
const themeOfSector = (sec) => !sec ? null : /semi|software|tech|electron|communication/i.test(sec) ? 'AI, chips, memory and data centres' : /energy|oil|gas|utilit|power/i.test(sec) ? 'Energy and power' : /marine|shipping|transport|logistic|airline|industrial/i.test(sec) ? 'Shipping and transport' : null;
async function opinionReply(text, sig, src) {
  const flags = RED_FLAGS.filter(([re]) => re.test(text)).map(([, w]) => w), themes = THEMES.filter(([, re]) => re.test(text));
  const now = Date.now(), day = ny(now).d, past = readOpinions(), tnames = themes.map(t => t[0]);
  // 1. REPEATED: has this theme been pushed before, by whom, and what has it done since? (scored on a broad fund for the theme)
  const proxyNow = {}; for (const t of tnames) { const p = THEME_PROXY[t]; if (p) { const j = await liveQ(p); if (j && +j.price > 0) proxyNow[t] = +j.price; } }
  fs.appendFileSync(OPIN_FILE, JSON.stringify({ d: day, ts: now, src: src || 'unnamed', themes: tnames, flags: flags.length, proxy: proxyNow }) + '\n');
  const repeat = tnames.map(t => { const prev = past.filter(o => (o.themes || []).includes(t) && now - o.ts < 30 * 86400000), first = past.filter(o => (o.themes || []).includes(t) && o.proxy && o.proxy[t]).sort((a, b) => a.ts - b.ts)[0];
    return prev.length ? t + ': pushed ' + (prev.length + 1) + ' times in 30 days by ' + new Set([...prev.map(o => o.src), src || 'unnamed']).size + ' source(s)' + (first && proxyNow[t] ? '. Since the first push (' + first.d + '), ' + THEME_PROXY[t] + ' moved ' + pcs(proxyNow[t] / first.proxy[t] - 1) : '') + '. Many people repeating a theme is crowd mood, not new information.' : null; }).filter(Boolean);
  // 2. RELEVANT TO WHAT I AM WORKING ON: your positions, tonight's buys, today's radar
  const SC = readJson('data/sectors.json', {}), pos = loadPos(), touch = [];
  if (env.FINNHUB_KEY) { let got = 0; for (const sym of Object.keys(pos)) if (SC[sym] === undefined && got < 8) { got++; try { const j = await (await fetch(FH + '/stock/profile2?symbol=' + sym + '&token=' + encodeURIComponent(env.FINNHUB_KEY))).json(); SC[sym] = (j && j.finnhubIndustry) || null; } catch (e) { } } if (got) fs.writeFileSync('data/sectors.json', JSON.stringify(SC)); }
  for (const sym of Object.keys(pos)) { const th = themeOfSector(SC[sym]); if (th && tnames.includes(th)) { const P = pos[sym]; touch.push(sym + ' (yours): in this theme. Plan unchanged: stop ' + (P.stop ? money(P.stop) : 'NOT SET') + '. A message is not a reason to add or to remove the stop.'); } }
  for (const c of sig ? planCands(sig, pos).filter(x => x.ok) : []) { const th = themeOfSector(c.sector || SC[c.sym]); if (th && tnames.includes(th)) touch.push(c.sym + ': on tonight\u2019s BUY list and in this theme (' + c.kind + '). The plan\u2019s prices and stop still decide.'); }
  { const rd = readJson('data/intraday-radar.json', null); if (rd && rd.session === day) for (const c of (rd.candidates || []).filter(x => x.levels)) { const th = themeOfSector(SC[c.sym]); if (th && tnames.includes(th)) touch.push(c.sym + ': on today\u2019s radar (' + c.stage.toLowerCase().replace(/_/g, ' ') + ')' + (c.proven ? ', proven setup' : ', paper only') + '.'); } }
  // 3. CLAIMS THAT CAN BE CHECKED: "earnings season" -> your stocks reporting in the next three weeks
  const earn = [];
  if (/اعلانات|إعلانات|نتائج|ارباح|أرباح|earnings|results|guidance/i.test(text) && env.FINNHUB_KEY) for (const sym of Object.keys(pos).slice(0, 8)) {
    try { const r = await fetch(FH + '/calendar/earnings?from=' + day + '&to=' + new Date(now + 21 * 86400000).toISOString().slice(0, 10) + '&symbol=' + sym + '&token=' + encodeURIComponent(env.FINNHUB_KEY)), j = r.ok ? await r.json() : null, e = j && (j.earningsCalendar || [])[0];
      if (e && e.date) earn.push(sym + ' (yours) reports on ' + e.date + '. A result can jump the price past the stop: decide before that day whether to hold through it.'); } catch (e) { } }
  const out = ['OPINION CHECK' + (src ? ' (' + src + ')' : '') + ': no stock is named, so there is nothing to buy from it and nothing I can score.'];
  if (flags.length) out.push('', 'WARNING SIGNS (' + flags.length + ')', ...flags.map(x => '- ' + x));
  const mk = sig && sig.market ? sig.market : null, fair = readJson('data/leaders-study.json', null), ws = readJson('data/winners-study.json', null);
  out.push('', 'WHAT MY DATA SAYS');
  if (mk) out.push('- S&P 500: ' + (mk.up ? 'in an uptrend' : 'in a downtrend') + (typeof mk.above50 === 'boolean' ? ', ' + (mk.above50 ? 'above' : 'under') + ' its 50 day average' : '') + '.');
  if (fair && fair.liveVerdict) out.push('- Buying the strongest stocks (LEADERS) on the whole market: ' + fair.liveVerdict + ' in the fair test up to ' + fair.to + '. A strong theme did not make its strongest stocks a winning buy.');
  if (ws && ws.base && ws.base.newer && ws.base.newer.n) out.push('- A random stock held 10 days in the newer year: average ' + pcs(ws.base.newer.avg) + ' a trade after costs. Most single stocks lagged the index.');
  for (const [name, , sec] of themes) {
    const rows = sig ? universe(sig).filter(x => x.sector && (x.sector.toLowerCase().includes(sec.toLowerCase()) || (sec === 'Technology' && /semi|software|tech|electron/i.test(x.sector)))) : [];
    const sup = rows.map(x => supportLine(x, sig)).filter(Boolean), up = rows.filter(x => x.uptrend).length;
    out.push('', name.toUpperCase() + ': ' + (rows.length ? rows.length + ' on my scan, ' + up + ' in an uptrend.' : 'none on my scan.'), ...(sup.length ? ['With tested support today:', ...sup.slice(0, 5)] : ['No stock in this theme has tested support today.']));
  }
  if (touch.length) out.push('', 'WHAT THIS TOUCHES IN MY WORK RIGHT NOW', ...touch.slice(0, 10));
  if (repeat.length) out.push('', 'REPEATED', ...repeat);
  if (earn.length) out.push('', 'CHECKED CLAIM: earnings season', ...earn);
  out.push('', 'WHAT TO DO: nothing changes. Keep your stops, buy only from the plan’s BUY lines, and never put everything in.', 'If this source names stocks, send:  tips ' + (src || 'SOURCE NAME') + ' TICKER TICKER   and I will check each one and score the source against the S&P 500.');
  return out.join('\n');
}
async function pennyReply(sig) {
  const rows = universe(sig).filter(x => x.last < 5), sup = rows.map(x => supportLine(x, sig)).filter(Boolean), out = ['PENNY STOCKS (under 5 USD), from the ' + (sig ? sig.session : 'last') + ' close', '', 'WITH TESTED SUPPORT', ...(sup.length ? sup : ['None. No stock under 5 USD on my scan has a tested rule firing or close to firing.'])];
  const g = marketOpen(Date.now()) ? await gainersNow() : { list: [] };
  const pm = (g.list || []).filter(x => x.price < 5).slice(0, 5);
  if (pm.length) out.push('', 'MOVING NOW under 5 USD (investigation only, no prices given)', ...pm.map(x => x.sym + ' +' + Math.round(x.pct * 100) + '% at ' + money(x.price)));
  const m = readJson('data/movers-state.json', null);
  out.push('', m && m.penny ? 'What my own radar measured over the last ' + m.sessions + ' sessions: stocks under 5 USD bought the morning after a 20% jump were ' + m.penny : 'My movers radar has not measured penny-stock jumps yet.', 'So I will not name a penny stock to buy unless a tested rule supports it. To have one checked: check TICKER');
  return out.join('\n');
}
async function sellReply(sym, sig, pos) {
  const P = pos[sym];
  if (P) { let p = null; if (marketOpen(Date.now())) { const j = await liveQ((sym)); p = +j.price || null; }
    const pv = (sig && sig.posVerdict || {})[sym], lines = ['WHEN TO SELL ' + sym + ' (you bought at ' + money(P.entry) + (p ? ', now ' + money(p) + ', ' + (p >= P.entry ? '+' : '') + ((p / P.entry - 1) * 100).toFixed(1) + '%' : '') + ')'];
    if (p && P.stop && p <= P.stop) lines.push('SELL NOW: your stop ' + money(P.stop) + ' is reached.');
    else if (pv) lines.push('SELL at the next open: ' + pv);
    else lines.push('Not yet. HOLD.');
    lines.push('Sell if it falls to: ' + (P.stop ? money(P.stop) + ' (stop loss)' : 'no stop set. Send: stop ' + sym + ' PRICE'), 'Sell for profit at: ' + (P.t1 ? money(P.t1) + (P.t2 ? ', then ' + money(P.t2) : '') : 'no target set. Send: target ' + sym + ' PRICE'));
    if (P.kind === 'quick') lines.push('Also sell on the first daily close ' + (P.q === 'gap' ? 'below' : 'above') + ' its 5 day average, or after ' + (P.maxHold || 5) + ' sessions.');
    else lines.push('Also sell on a daily close below its 50 day average. I check this every night and tell you in YOUR POSITIONS.');
    return lines.join('\n'); }
  const d = await loadDaily(sym); if (!d || d.candles.length < 60) return sym + ': I could not load prices for it. Check the ticker.';
  const c = d.candles, i = c.length - 1, ind = L.indicators(c, null), a = ind.atr[i], e50 = ind.e[50][i];
  return ['WHEN TO SELL ' + sym + ' (closed ' + money(c[i].c) + '). I am not tracking it for you, so these are general levels for a holder:', 'Trend exit: a daily close below its 50 day average, now ~' + money(e50) + (c[i].c < e50 ? '. It is ALREADY below that line: the trend has broken.' : '.'), 'Volatility stop: ' + money(c[i].c - 2 * a) + ', two normal daily moves under the price.', 'If you hold it, send:  bought ' + sym + ' YOUR-PRICE   and I will set a stop, raise it as it rises, and alert you.'].join('\n');
}
// HOLD OR SELL REVIEW of a stock you own (bought before the system or not). It studies the stock's OWN past: every earlier
// day when it was in the same state as now (trend, and how stretched it was above its 50 day average), what it did over the
// next 20 sessions, against the S&P 500 on the same days. Then it applies the holder rules: a close under the 50 day average
// ends the trend (sell); a very stretched stock whose own past says it lagged from here: take part profit or tighten the stop.
async function reviewReply(sym, sig, pos) {
  const d = await loadDaily(sym); if (!d || d.candles.length < 260) return sym + ': not enough price history to study (one year needed). Check the ticker.';
  const spy = await loadDaily('SPY'), sMap = new Map((spy ? spy.candles : []).map(x => [x.d, x.c]));
  const c = d.candles, n = c.length, i = n - 1, cl = c.map(x => x.c);
  const sma = (p) => { const o = new Array(n).fill(null); let t = 0; for (let k = 0; k < n; k++) { t += cl[k]; if (k >= p) t -= cl[k - p]; if (k >= p - 1) o[k] = t / p; } return o; };
  const m50 = sma(50), m200 = sma(200), tr = c.map((x, k) => k ? Math.max(x.h - x.l, Math.abs(x.h - c[k - 1].c), Math.abs(x.l - c[k - 1].c)) : x.h - x.l);
  const a14 = (() => { const o = new Array(n).fill(null); let t = 0; for (let k = 0; k < n; k++) { t += tr[k]; if (k >= 14) t -= tr[k - 14]; if (k >= 13) o[k] = t / 14; } return o; })();
  const bucket = (k) => { const z = a14[k] ? (cl[k] - m50[k]) / a14[k] : 0; return (cl[k] > m50[k] ? 'A' : 'B') + (cl[k] > m200[k] ? 'A' : 'B') + (z < 0 ? 0 : z < 2 ? 1 : z < 4 ? 2 : 3); };
  const H = 20, now = bucket(i), same = [];
  for (let k = 200; k < n - H; k += 5) if (bucket(k) === now) { const r = cl[k + H] / cl[k] - 1, s0 = sMap.get(c[k].d), s1 = sMap.get(c[k + H].d); same.push({ r, s: s0 && s1 ? s1 / s0 - 1 : null }); }
  const avgOf = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, hr = avgOf(same.map(x => x.r)), hs = avgOf(same.filter(x => x.s !== null).map(x => x.s)), hw = same.length ? same.filter(x => x.r > 0).length / same.length : null;
  let hi52 = 0; for (let k = Math.max(0, n - 252); k < n; k++) hi52 = Math.max(hi52, c[k].h);
  const z = a14[i] ? (cl[i] - m50[i]) / a14[i] : 0, P = pos[sym];
  let p = null; if (marketOpen(Date.now())) { const j = await liveQ(sym); p = +j.price || null; }
  const px = p || cl[i], trail = +Math.max(cl[i] - 2 * a14[i], m50[i] < cl[i] ? m50[i] : 0).toFixed(2);
  let earn = ''; if (env.FINNHUB_KEY) { try { const day = new Date().toISOString().slice(0, 10), r = await fetch(FH + '/calendar/earnings?from=' + day + '&to=' + new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10) + '&symbol=' + sym + '&token=' + encodeURIComponent(env.FINNHUB_KEY)), j = r.ok ? await r.json() : null, e = j && (j.earningsCalendar || [])[0]; if (e && e.date) earn = e.date; } catch (e) {} }
  const SS = readJson('data/score-study.json', null), sc = SS && SS.scores ? SS.scores[sym] : undefined;
  const enough = same.length >= 20, lag = enough && hs !== null && hr < hs, neg = enough && hr < 0;
  let verdict, why;
  if (cl[i] < m50[i] && cl[i] < m200[i]) { verdict = 'SELL'; why = 'the trend is broken: it closed under both its 50 day (' + money(m50[i]) + ') and 200 day (' + money(m200[i]) + ') averages.'; }
  else if (cl[i] < m50[i]) { verdict = neg || lag ? 'SELL' : 'SELL OR TIGHTEN'; why = 'it closed under its 50 day average (' + money(m50[i]) + '), the holder exit rule.' + (enough ? ' Its own past from this state: ' + (neg || lag ? 'weak.' : 'not clearly weak, so a tight stop is the alternative.') : ''); }
  else if (z >= 4 && (neg || lag)) { verdict = 'TAKE PART PROFIT'; why = 'it is very stretched (' + z.toFixed(1) + ' daily moves above its 50 day average) and from this stretch its own past lagged. Sell part, raise the stop on the rest.'; }
  else if (z >= 4) { verdict = 'HOLD, RAISE THE STOP'; why = 'strong but very stretched (' + z.toFixed(1) + ' daily moves above its 50 day average). Nobody knows the top; a raised stop keeps most of the gain if it turns.'; }
  else { verdict = 'HOLD'; why = 'the trend is intact: above its 50 day' + (cl[i] > m200[i] ? ' and 200 day averages.' : ' average (under its 200 day, so weaker).'); }
  // a SYSTEM trade (quick, swing, radar, leader) follows its own tested exit and stop; the general holder rules do not override it
  const sysTrade = P && ['quick', 'entry', 'radar', 'leader'].includes(P.kind), pv = sig && sig.posVerdict ? sig.posVerdict[sym] : null;
  if (sysTrade && pv) { verdict = 'SELL (its tested exit fired)'; why = pv.replace(/\.?$/, '.') + ' This trade follows its own tested rule.'; }
  else if (sysTrade && !verdict.startsWith('SELL')) { verdict = 'HOLD (follow its tested rule)'; why = 'this is a ' + (P.kind === 'entry' ? 'swing' : P.kind) + ' trade from the plan: keep its own stop ' + money(P.stop) + ' and exit rule; the bot tells you when it fires. ' + why; }
  const out = ['HOLD OR SELL: ' + sym + ' → ' + verdict, 'Price ' + money(px) + (p ? ' (live)' : ' (last close ' + c[i].d + ')') + (P ? ' | you bought at ' + money(P.entry) + ', ' + (px >= P.entry ? '+' : '') + ((px / P.entry - 1) * 100).toFixed(1) + '%' : ''),
    'Why: ' + why,
    'Its own past: ' + (enough ? same.length + ' earlier times in this same state, the next 20 sessions averaged ' + pcs(hr) + ' (' + Math.round(hw * 100) + '% up)' + (hs !== null ? ', S&P 500 ' + pcs(hs) + ' on the same days' : '') + '.' : 'only ' + same.length + ' earlier times in this state, too few to judge; the trend rule decides.'),
    'From its 1-year high: ' + pcs(px / hi52 - 1) + (sc !== undefined && sc !== null ? ' | score ' + sc + '/100' : ''),
    sysTrade ? 'Stop to use: ' + money(P.stop) + ' (the trade\u2019s own tested stop; the bot raises it when its rule says so).' : 'Stop to use: ' + money(Math.max(trail, P && P.stop || 0)) + (P && P.stop && P.stop >= trail ? ' (your current stop)' : ' (2 daily moves under the price, or the 50 day average if closer)') + '. Raise it as it rises, never lower it.'];
  if (earn) out.push('Earnings on ' + earn + ': a result can jump the price past the stop. Decide before that day whether to hold through it.');
  if (!P) out.push('', 'I am not tracking it. Send:  bought ' + sym + ' YOUR-PRICE SHARES   and I will watch the stop every day and tell you when to sell.');
  else if (!sysTrade && (verdict === 'HOLD' || verdict.startsWith('HOLD,'))) out.push('', 'To set this stop: stop ' + sym + ' ' + Math.max(trail, P.stop || 0).toFixed(2));
  out.push('Tested on its own history, not a promise. Not financial advice, not a halal ruling.');
  return out.join('\n');
}
// "Should I buy more of X?" for a stock you already hold. The answer follows the plan, not the mood of the day.
async function addReply(sym, pos) {
  const P = pos[sym]; let p = null;
  if (marketOpen(Date.now())) { const j = await liveQ((sym)); p = +j.price || null; }
  const now = p ? ' You bought at ' + money(P.entry) + ', now ' + money(p) + ' (' + (p >= P.entry ? '+' : '') + ((p / P.entry - 1) * 100).toFixed(1) + '%).' : ' You bought at ' + money(P.entry) + '.';
  const plan = 'Your plan is unchanged: HOLD | STOP ' + (P.stop ? money(P.stop) : 'none set') + ' | SELL ' + (P.t1 ? money(P.t1) + (P.t2 ? ' then ' + money(P.t2) : '') : 'no target set') + (P.kind === 'quick' ? ' | or on the rule exit, or after ' + (P.maxHold || 5) + ' sessions.' : '.');
  const out = ['SHOULD YOU BUY MORE ' + sym + '?'];
  if (p && P.stop && p <= P.stop) out.push('No. It has reached your stop at ' + money(P.stop) + '.' + now, 'The plan says sell or reassess here, not add.');
  else if (p && p < P.entry) out.push('No.' + now, 'It is below your entry. Buying more now is adding to a losing trade: it doubles the bet at the moment the trade is going against you, and it is how a small planned loss becomes a large one.', plan);
  else if (P.kind === 'quick') out.push('No.' + now, 'A quick trade is a single entry. Its edge is small, so the plan is to take the bounce and leave, not to build a bigger position.', plan);
  else if (p) out.push('Only as a planned second stage.' + now, 'It is above your entry, so adding is allowed by the rules if: it has made a daily close above your entry, you then move the stop on ALL shares up to your entry price, and your total open risk stays under 2% of the account. Otherwise, no.', plan);
  else out.push('The market is closed, so I cannot see the price.' + now, 'The rule either way: never add while it is below your entry. Above your entry, only as a planned second stage with the stop moved up to your entry price.', plan);
  return out.join('\n');
}
// "From SOURCE what to buy?"  Lists what that source recommended, and which of it your tested rules support today.
function sourceReply(src, sig) {
  const mine = readTips().filter(t => t.src === src), seen = new Set(), tips = mine.filter(t => !seen.has(t.sym) && seen.add(t.sym)).slice(-20);
  const rows = universe(sig), board = (sig && sig.tipBoard) || { tips: [], sources: [] }, pcx = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  const good = [], rest = [];
  for (const t of tips) {
    const x = rows.find(r => r.sym === t.sym), sup = x ? supportLine(x, sig) : null, perf = board.tips.find(b => b.sym === t.sym && b.src === src && b.d === t.d);
    const since = perf && perf.ret !== null ? ' Since the tip: ' + pcx(perf.ret) + ' in ' + perf.days + ' sessions (S&P 500 ' + pcx(perf.spy) + ').' : '';
    if (sup) good.push(sup + (t.below ? ' | the source said: buy below ' + money(t.below) : '') + (since ? '.' + since : ''));
    else rest.push(t.sym + ': ' + (x ? 'no tested support today' : 'not scanned yet, wait for tonight') + (t.below ? ', source said buy below ' + money(t.below) : '') + '.' + since);
  }
  const rec = board.sources.find(g => g.src === src);
  return ['FROM ' + src + ': ' + tips.length + ' stock' + (tips.length === 1 ? '' : 's') + ' logged', '', 'WHAT YOUR TESTED RULES SUPPORT TODAY', ...(good.length ? good : ['None. Nothing this source named has a tested entry or setup today.']), '', 'THE REST', ...(rest.length ? rest : ['None.']), '',
    rec ? 'This source\u2019s record so far: ' + rec.n + ' tip' + (rec.n === 1 ? '' : 's') + ', average ' + pcx(rec.avg) + ' against ' + pcx(rec.spy) + ' for the S&P 500' + (rec.muted ? '. MUTED: it trails the market.' : rec.trusted ? '. Ahead of the market so far.' : rec.n < 10 || rec.days < 20 ? '. Too early to judge.' : '.') : 'No record yet: results start after the next nightly scan.',
    'A source naming a stock is a lead. Only a line starting ENTRY CONFIRMED, QUICK TRADE or BUY WATCH carries prices from your tested rules.'].join('\n');
}
async function natural(text, sig, pos) {
  if (/^(i\s+)?(bought|sold)\b|^(check|add|analy[sz]e|remove|delete|unwatch|stop|target|tips?|log|name|rename|source|follow|unfollow|channels?|positions?|status|list|sources?|scoreboard|market|news|movers?|gainers?|today|update|hot|leaders?|radar|early|wave|ladder|details?|report|record|results?|performance|winners?|patterns?|lessons?|mistakes?|lab|hunting|hunt|risk|account|capital|balance|score)\b/i.test(text)) return null;
  { const low = text.toLowerCase(), srcs = [...new Set(readTips().map(t => t.src))].sort((a, b) => b.length - a.length), hit = srcs.find(n => { const k = n.toLowerCase().replace(/^youtube:\s*/, '').trim(); return k.length >= 3 && low.includes(k); }); if (hit) return sourceReply(hit, sig); }
  if (/\bleaders?\b|\bstrongest\b|\bwaves?\b|\btrending\b|ride\b/i.test(text) && !findTicker(text, sig, pos)) return leadersText();
  if (/\bpenn(y|ies)\b|under\s*\$?\s*5\b|\bcheap stocks?\b/i.test(text)) return pennyReply(sig);
  const sec = SECTOR_WORDS.find(([, re]) => re.test(text)), tk = findTicker(text, sig, pos);
  if (sec && !tk && sig) return sectorReply(sec[0], sig);
  if (/^review\b|\bhold or sell\b|\bkeep or sell\b|\breach(ed)? (its|their|the) (limit|top|peak)|\bstudy (my|them|it)\b/i.test(text)) {   // HOLD OR SELL review: one stock, or all you own
    if (tk) return reviewReply(tk, sig, pos);
    const mine = Object.keys(pos); if (!mine.length) return 'You have no positions recorded. Send:  bought SYMBOL PRICE SHARES   for each stock you own, then:  review';
    const parts = []; for (const x of mine.slice(0, 8)) parts.push(await reviewReply(x, sig, pos));
    return parts.join('\n\n') + (mine.length > 8 ? '\n\nOnly the first 8 shown. Send:  review SYMBOL   for the others.' : '');
  }
  if (tk && pos[tk] && /\b(more|add|adding|average|averaging|double)\b/i.test(text) && !/\bsell\b/i.test(text)) return addReply(tk, pos);
  if (/\bsell\b|\bexit\b|take profit|get out/i.test(text)) return tk ? sellReply(tk, sig, pos) : hotList(sig);
  if (!tk && /\bbuy\b|\bhunt\b|\brecommend/i.test(text)) return hotList(sig);
  if (tk && /\bbuy\b|\bhunt\b|\bfind\b|look (for|at|into)|what about|how about|\bentry\b|\bworth\b/i.test(text)) { const known = sig && ((sig.quick || []).some(x => x.sym === tk) || (sig.stocks || []).some(x => x.sym === tk)); return known ? checkOne(tk, sig) : checkLive(tk); }
  return null;
}
// ---- Watchdog. The bot wakes every few minutes, so it can notice when one of the nightly programs did NOT do its job
// (crashed, was cancelled, or never started) and tell you once, instead of you discovering a missing message days later.
async function watchdog(sig) {
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  const now = Date.now(), n = ny(now);
  let expected = ''; for (let k = 0; k < 10; k++) { const x = ny(now - k * 86400000); if (x.weekend || isHoliday(x.d) || (k === 0 && x.mins < 970)) continue; expected = x.d; break; }
  if (!expected) return;
  const later = n.d > expected, st = readJson('data/tg-state.json', { offset: 0 }), warned = st.warned || {}, out = [];
  const late = (key, have, due, what, name) => { if (due && (have || '') < expected && warned[key] !== expected) { warned[key] = expected; out.push(what + ' for the ' + expected + ' close has not completed' + (have ? ' (its last result is from ' + have + ')' : '') + '. In GitHub open Actions, then ' + name + '. If the newest run is red, cancelled or missing, tap Run workflow, and send Claude the red lines if it fails again.'); } };
  late('scan', sig && sig.session, later || n.mins >= 1230, 'The nightly scan', 'Stock scanner');                         // due by 8:30 pm New York
  late('disc', DISCMETA && DISCMETA.session, later && n.mins >= 150, 'The discovery engine', 'Discovery engine');        // due by 2:30 am New York
  late('movers', (readJson('data/movers-state.json', {}) || {}).session, later && n.mins >= 210, 'The movers radar', 'Movers radar');   // due by 3:30 am New York
  if (!out.length) return;
  st.warned = warned; fs.writeFileSync('data/tg-state.json', JSON.stringify(st));
  await telegram('WATCHDOG\n' + out.join('\n\n') + '');
  console.log('watchdog: ' + out.length + ' warning(s) sent');
}
async function tgCommands(sig) {
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  const state = readJson('data/tg-state.json', { offset: 0 }), pos = loadPos(), out = [];
  let ups = [];
  try { const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/getUpdates?timeout=' + Math.min(50, Math.max(0, parseInt(env.TG_WAIT || '0', 10) || 0)) + '&offset=' + state.offset); ups = ((await r.json()).result) || []; } catch (e) { console.log('could not read Telegram messages'); return; }
  // One message may carry several commands, one per line (for example four "follow" lines pasted together). Split those up.
  // A leading dash, bullet or backtick copied from a list is ignored. A multi-line tip message is left whole.
  const CMD_LINE = /^(follow|unfollow|bought|i bought|sold|i sold|stop|target|check|add|remove)\b/i, clean = (x) => x.replace(/^[\s\-\u2022*`>]+/, '').replace(/`+$/, '').trim(), queue = [];
  for (const u of ups) {
    const m = u.message, lines = m && m.text ? m.text.split('\n').map(clean).filter(Boolean) : [];
    if (lines.length > 1 && lines.every(x => CMD_LINE.test(x))) lines.forEach(x => queue.push({ update_id: u.update_id, message: { ...m, text: x } }));
    else { if (m && m.text && lines.length === 1) m.text = lines[0]; queue.push(u); }
  }
  for (const u of queue) {
    state.offset = u.update_id + 1;
    const m = u.message; if (!m || !m.text || String(m.chat.id) !== String(env.TG_CHAT)) continue;      // only you
    const text = m.text.trim().replace(/\$/g, ''), num = (re) => { const x = text.match(re); return x ? +x[1] : null; };
    let k;
    { const tk = (text.match(/\b[A-Z]{2,5}\b/g) || []).filter(x => !NOT_TICKERS.has(x) && !COMMON_WORDS.has(x)), fwd = m.forward_origin || m.forward_from_chat;
      if (!tk.length && !/^\s*(?:tips?|log)\b/i.test(text) && (text.length >= 160 || (fwd && text.length >= 60))) {
        const src = (m.forward_origin && (m.forward_origin.sender_user_name || (m.forward_origin.sender_user && m.forward_origin.sender_user.first_name) || (m.forward_origin.chat && m.forward_origin.chat.title))) || (m.forward_from_chat && m.forward_from_chat.title) || null;
        out.push(await opinionReply(text, sig, src)); continue; } }
    { const h1 = text.match(/^(?:halal|zad)\s+([a-z.\-]{1,6})\s+(yes|ok|halal|pass|no|not(?:\s+halal)?|fail|haram)\s*$/i), h2 = text.match(/^([a-z.\-]{1,6})\s+(?:is\s+)?(not\s+halal|haram|halal)(?:\s+(?:in|on)\s+zad)?\s*$/i), h3 = text.match(/^(?:not\s+halal|haram)\s+([a-z.\-]{1,6})\s*$/i);
      const hm = h1 ? [h1[1], !/^(yes|ok|halal|pass)$/i.test(h1[2])] : h2 ? [h2[1], !/^halal$/i.test(h2[2])] : h3 ? [h3[1], true] : null;
      if (hm) { const sym = hm[0].toUpperCase(), mk = HALALM(); mk[sym] = { s: hm[1] ? 'fail' : 'ok', d: ny(Date.now()).d, by: 'ZAD (you)' }; fs.writeFileSync(HALAL_FILE, JSON.stringify(mk, null, 1));
        out.push(sym + (hm[1] ? ': marked NOT HALAL (ZAD). I will not offer it as a buy anywhere: plan, BUY NOW, radar or checks.' + (pos[sym] ? ' You hold it: decide yourself whether to sell.' : '') : ': marked HALAL (checked in ZAD). Thank you.') + ' To change it: halal ' + sym + (hm[1] ? ' yes' : ' no')); continue; } }
    if (!(m.forward_origin || m.forward_from_chat)) { const nl = await natural(text, sig, pos); if (nl) { out.push(nl); continue; } }   // a forwarded message is someone else's words: treat it as a tip, not as your question
    if (/^(sources?|tips?|scoreboard)\s*$/i.test(text)) { out.push(tipBoard(sig)); continue; }
    if ((k = m.text.trim().match(/^follow\s+(.+)$/i))) {       // follow NAME UCxxxxxxxx   (or a channel link containing the ID)
      let id = (k[1].match(/UC[\w-]{20,24}/) || [])[0];
      const handle = (k[1].match(/@([\w.-]{3,40})/) || [])[1], name = k[1].replace(/https?:\/\/\S+/g, '').replace(/UC[\w-]{20,24}/, '').replace(/@[\w.-]+/, '').trim().slice(0, 30) || (handle || '');
      if (!id && handle && env.YT_KEY) {      // a channel link with an @name: ask the official API which channel ID that handle belongs to
        try { const r = await fetch(YTAPI + '/youtube/v3/channels?part=snippet&forHandle=' + encodeURIComponent('@' + handle) + '&key=' + encodeURIComponent(env.YT_KEY)); if (r.ok) { const it = ((await r.json()).items || [])[0]; if (it && /^UC[\w-]{20,24}$/.test(it.id || '')) id = it.id; } else console.log('YouTube handle lookup answered ' + r.status); } catch (e) {}
        if (!id) { out.push('I could not find a YouTube channel for @' + handle + '. Check the spelling of the link, or send the channel ID that starts with UC.'); continue; }
      }
      if (!id || !name) out.push('Send it like this:\nfollow ZipTrader UCxxxxxxxxxxxxxxxxxxxxxx\nThe ID starts with UC. On YouTube open the channel, tap its description, then Share channel, then Copy channel ID.');
      else {    // ask YouTube whose channel this is. If YouTube does not answer, follow anyway, marked unverified, and say so honestly.
        const f = await ytFeed(id), a = readChannels().filter(c => c.id !== id && c.name !== name);
        if (f.ok) { const real = String(f.channel || '').slice(0, 60), latest = String((f.items[0] || {}).title || '').slice(0, 90);
          a.push({ name, id }); fs.writeFileSync(CH_FILE, JSON.stringify(a.slice(-12)));
          out.push('Following ' + name + '.\nYouTube says this ID belongs to: ' + (real || 'unknown') + (latest ? '\nIts latest video: "' + latest + '"' : '') + '\nIf that is not the channel you meant, send:  unfollow ' + name); }
        else if (env.YT_KEY && f.status === 404) out.push('Not followed: YouTube\u2019s official API says no channel has the ID ' + id + '. Copy the real one from the YouTube app: open the channel, tap its description, Share channel, Copy channel ID.');
        else { a.push({ name, id, unverified: true }); fs.writeFileSync(CH_FILE, JSON.stringify(a.slice(-12)));
          out.push('Saved ' + name + ', but NOT verified: YouTube (' + f.via + ') answered ' + (f.status === -1 ? 'nothing' : 'HTTP ' + f.status) + '. ' + (env.YT_KEY ? (f.status === 404 ? 'With the official API a 404 means this channel ID does not exist.' : f.status === 403 ? 'A 403 means the YT_KEY secret is wrong, or the YouTube Data API is not switched on for it, or its daily allowance is used up.' : '') + ' ' : 'Without a YT_KEY secret I use the public feed, which YouTube often refuses to GitHub\u2019s servers. ') + 'To check the ID yourself, open this link in your phone\u2019s browser:\nhttps://www.youtube.com/feeds/videos.xml?channel_id=' + id + '\nIf you see a page of text with video titles, the ID is right and YouTube is blocking my server. I will keep trying each night and report it under SCAN HEALTH.'); }
      }
      continue;
    }
    if ((k = m.text.trim().match(/^unfollow\s+(.+)$/i))) { const a = readChannels(), b = a.filter(c => c.name.toLowerCase() !== k[1].trim().toLowerCase()); fs.writeFileSync(CH_FILE, JSON.stringify(b)); out.push(b.length < a.length ? 'Stopped following ' + k[1].trim() + '. Its past record stays in the scoreboard.' : 'I was not following "' + k[1].trim() + '".'); continue; }
    if (/^channels?\s*$/i.test(text)) { const a = readChannels(); out.push(a.length ? 'Channels I follow (' + a.length + ' of 12):\n' + a.map(c => c.name).join('\n') : 'No channels followed yet.\nfollow NAME CHANNEL-ID'); continue; }
    if ((k = m.text.trim().match(/^(?:name|rename|source)\s+(.{1,80})$/i))) {     // "name NEW" names the unnamed tips; "name OLD = NEW" renames a source
      const parts = k[1].split(/\s*=\s*/), from = parts.length > 1 ? parts[0].trim() : 'Unnamed source', to = (parts.length > 1 ? parts[1] : parts[0]).trim().slice(0, 40), all = readTips(), hit = all.filter(t => t.src === from).length;
      if (!to || !hit) out.push(hit ? 'Send it like this: name SOURCE NAME' : 'I have no tips logged under "' + from + '".');
      else { fs.writeFileSync(TIP_FILE, all.map(t => JSON.stringify(t.src === from ? { ...t, src: to } : t)).join('\n') + '\n'); out.push(hit + ' tip' + (hit > 1 ? 's' : '') + ' moved from "' + from + '" to "' + to + '". The scoreboard will show the new name after the next nightly scan.'); }
      continue;
    }
    if (/^\s*(?:tips?\b|log\b|\u062A\u0648\u0635\u064A\u0627\u062A|\u062A\u0648\u0635\u064A\u0629)/i.test(text) || (/\u062A\u0648\u0635\u064A|\u0633\u0647\u0645|\u0634\u0631\u0627\u0621|\u0627\u0634\u062A\u0631|\btips?\b|\bsource\b/i.test(text) && (text.match(/\b[A-Z]{2,5}\b/g) || []).filter(x => !NOT_TICKERS.has(x)).length >= 1) || ((m.forward_origin || m.forward_from_chat) && /\$[A-Z]{1,5}\b|\u0633\u0647\u0645|\b[A-Z]{2,5}\b.*\b(buy|target|entry|stop)\b|\b(buy|target|entry|stop)\b.*\b[A-Z]{2,5}\b/i.test(m.text))) { const fo = m.forward_origin || {}, fwd = String((fo.chat && fo.chat.title) || fo.sender_user_name || (fo.sender_user && [fo.sender_user.first_name, fo.sender_user.last_name].filter(Boolean).join(' ')) || (m.forward_from_chat && m.forward_from_chat.title) || '').slice(0, 40); out.push(await logTips(m.text, fwd)); continue; }
    if (/^(leaders?|strongest)\b/i.test(text)) { out.push(leadersText()); continue; }
    if (/^(details?|more|full)\s*$/i.test(text)) { out.push(await detailList(sig)); continue; }
    if (/^(record|my record|results?|performance)\s*$/i.test(text)) { out.push(myRecord(true)); continue; }
    if (/^(lessons?|learn\w*|mistakes?)\s*$/i.test(text)) { out.push(lessonsText()); continue; }
    if ((k = text.match(/^(account|capital|balance)\s+(\d+(?:\.\d+)?)\s*(usd|\$)?\s*$/i))) { const ub = usualBuy(); out.push('No account size needed, and I do not store it. I size each buy from YOUR usual buy, learned from what you actually buy: report the shares when you buy, for example  bought CRWD 268.50 10  . Strong records then get up to 2x your usual buy; thin evidence, live losses, a weak market or radar setups get less.' + (ub ? ' Your usual buy so far: about ' + money(ub.usd) + ' USD (' + ub.n + ' buys).' : ' No buy with shares reported yet.')); continue; }
    if ((k = text.match(/^(?:fee|fees|commission)\s+(\d+(?:\.\d+)?)\s*(usd|\$)?\s*$/i))) { const st = readJson('data/settings.json', {}); st.feeUSD = +k[1]; fs.writeFileSync('data/settings.json', JSON.stringify(st)); out.push('Saved: your broker fee is ' + money(+k[1]) + ' USD per buy and per sell (' + money(2 * k[1]) + ' a round trip). Every BUY is now judged after this fee on a 1,000 USD buy, and each card shows the dollars on your usual buy.'); continue; }
    if ((k = text.match(/^risk\s+(\d+(?:\.\d+)?)\s*(usd|\$)?\s*$/i))) { const st = readJson('data/settings.json', {}); st.riskUSD = +k[1]; fs.writeFileSync('data/settings.json', JSON.stringify(st)); out.push('Saved: you accept losing about ' + money(+k[1]) + ' USD per trade. Every buy in the plan now shows the exact number of shares for that loss (shares = ' + money(+k[1]) + ' / (buy price - stop)).'); continue; }
    if ((k = text.match(/^score(?:\s+([a-z.\-]{1,6}))?\s*$/i))) { const w = readJson('data/score-study.json', null);
      if (!w || !w.text) out.push('The stock score runs every Sunday with the fair test. No result yet.');
      else if (!k[1]) out.push(w.text);
      else { const sy = k[1].toUpperCase(), sc = (w.scores || {})[sy], all = Object.values(w.scores || {}), rank = sc === undefined ? null : all.filter(x => x > sc).length + 1;
        out.push(sc === undefined ? sy + ': no score (under 5 USD, thinly traded, a fund, or under 6 months of prices).' : sy + ': score ' + sc + ' of 100, rank ' + rank + ' of ' + all.length + ' liquid US companies. The score itself is ' + w.verdict + ' as a way to pick stocks' + (w.verdict === 'PROMISING' ? '.' : ', so treat it as research only.')); }
      continue; }
    if (/^(lab|hunting|hunting lab|hunt)\s*$/i.test(text)) { const w = readJson('data/hunting-lab.json', null); out.push(w && w.text ? w.text : 'The hunting lab runs every Sunday with the fair test. No result yet.'); continue; }
    if (/^(winners?|winner study|patterns?)\s*$/i.test(text)) { const w = readJson('data/winners-study.json', null); out.push(w && w.text ? w.text : 'The winners study runs every Sunday with the fair test. No result yet.'); continue; }
    if (/^(report|scan|full report)\s*$/i.test(text)) { const r = fs.existsSync('data/scan-report.txt') ? fs.readFileSync('data/scan-report.txt', 'utf8') : ''; out.push(r || 'No nightly report saved yet. It arrives after tonight\u2019s scan.'); continue; }
    if (/^(radar|early|wave|ladder)\b/i.test(text)) { const r = readJson('data/intraday-radar.json', null); out.push(r && r.text ? r.text : 'The early-wave radar has not produced a board yet. It runs about every 15 minutes while the US market is open (from 4:30 pm Kuwait).'); continue; }
    if (/^(today|hot|hot\s*list|quick|setups?|ideas?|list today|update|recommend\w*|buy|sell|what now|now what)\s*\??$/i.test(text) || /^(today|hot)\b/i.test(text) || /what.*\b(buy|sell|do)\b/i.test(text) || /^buy\s+(today|now|what|list)\b/i.test(text) || /^(\u0627\u0644\u064A\u0648\u0645|\u0634\u0646\u0648 \u0627\u0634\u062A\u0631\u064A|\u0645\u0627\u0630\u0627 \u0627\u0634\u062A\u0631\u064A|\u0648\u0634 \u0627\u0634\u062A\u0631\u064A|\u062A\u062D\u062F\u064A\u062B)\s*\??$/.test(text)) { out.push(await hotList(sig)); continue; }
    if (/^(movers?|gainers?|fast|pennies|penny)\b/i.test(text)) { out.push(await moversNow()); continue; }
    if (/^(market|news|now|sectors?|breaking)\b/i.test(text) || /what.*(happening|going on|news)/i.test(text)) { out.push(await marketNow()); continue; }
    if ((k = text.match(/^(?:check|ask|about|add|analy[sz]e)\s+([a-z.\-]{1,6})\b/i))) { const sy = k[1].toUpperCase(), known = sig && ((sig.quick || []).some(x => x.sym === sy) || (sig.stocks || []).some(x => x.sym === sy)); out.push(known ? checkOne(sy, sig) : await checkLive(sy)); continue; }
    if ((k = text.match(/^(?:remove|delete|unwatch)\s+([a-z.\-]{1,6})\b/i))) { const sy = k[1].toUpperCase(), a = readExtra(); if (a.includes(sy)) { fs.writeFileSync(EXTRA_FILE, JSON.stringify(a.filter(x => x !== sy))); out.push('Removed ' + sy + ' from my nightly scan.'); } else out.push(sy + ' was not one of the stocks you added.'); continue; }
    if ((k = text.match(/^(?:i\s+)?bought\s+([a-z.\-]{1,6})(?:\s+(?:at\s+)?(\d+(?:\.\d+)?))?/i))) {
      const sym = k[1].toUpperCase(); let entry = k[2] ? +k[2] : null;
      const shm = text.match(/(\d+(?:\.\d+)?)\s*(?:shares?|sh|stocks?|اسهم|سهم)\b/i) || text.match(/\b(?:x|qty|shares?)\s*(\d+(?:\.\d+)?)/i) || text.match(/^(?:i\s+)?bought\s+[a-z.\-]{1,6}\s+(?:at\s+)?\d+(?:\.\d+)?\s+(\d+)\s*$/i), shares = shm ? +shm[1] : null;
      if (!entry) { const j = await liveQ((sym)); entry = +j.price || null; }
      if (!entry) { out.push(sym + ': I could not get a price. Send it with the price, for example: bought ' + sym + ' 12.50'); continue; }
      const P = { entry, since: ny(Date.now()).d, ...planFor(sym, entry, sig) };
      if (P.kind === 'manual' && !P.stop) {   // no tested plan today: suggest a stop from the stock's own volatility and trend
        const d = await loadDaily(sym);
        if (d && d.candles.length > 60) {
          const c = d.candles, i = c.length - 1, ind = L.indicators(c, null), a = ind.atr[i], e50 = ind.e[50][i], px = d.last, vol = px - 2 * a, trend = e50 < px ? e50 : null;
          P.stop = +Math.max(vol, trend || 0).toFixed(2); P.stopWhy = trend && trend > vol ? 'its 50 day average, the trend line a holder of this stock should not see broken' : 'two normal daily moves (ATR) below the current price ' + money(px);
          if (P.stop > entry) P.stopWhy += '. It is above your entry, so it locks in part of your gain'; else P.stopWhy += '. It is below your entry, so hitting it means accepting a loss of ' + ((1 - P.stop / entry) * 100).toFixed(1) + '%';
          P.stopWhy += '. I will raise it if the stock rises, never lower it.';
        }
      }
      const st = num(/stop\s+(\d+(?:\.\d+)?)/i), tg = num(/target\s+(\d+(?:\.\d+)?)/i); if (st) { P.stop = st; delete P.stopWhy; P.own = true; } if (tg) P.t1 = tg;
      pos[sym] = P;
      if (shares > 0) { const pv = privRead(); pv.buys = (pv.buys || []).concat({ sym, usd: +(shares * entry).toFixed(2), d: ny(Date.now()).d }).slice(-50); pv.shares = pv.shares || {}; pv.shares[sym] = shares;
        const saved = privWrite(pv); out.push('Noted ' + shares + ' shares, about ' + money(shares * entry) + ' USD' + (P.stop ? '; at the stop this position would lose about ' + money(shares * (entry - P.stop)) + ' USD' : '') + '. ' + (saved ? 'Kept encrypted (only your PRIVATE_KEY secret can read it); I learn your usual buy size from it.' : 'Not stored: add the GitHub secret PRIVATE_KEY (any long password) and I will keep share counts encrypted and learn your usual buy size.')); }
      out.push('Tracking ' + posLine(sym, P) + (P.stopWhy ? '\n  Suggested stop ' + money(P.stop) + ': ' + P.stopWhy + ' To change it: stop ' + sym + ' <price>' : P.kind === 'manual' && !P.stop ? '\n  I could not load enough price history to suggest a stop. Send: stop ' + sym + ' <price>' : '') + '\n  I check your positions about every 15 minutes in market hours. Place the stop with your broker too: my alerts can be late.');
    } else if ((k = text.match(/^(?:i\s+)?sold\s+([a-z.\-]{1,6})(?:\s+(?:at\s+)?(\d+(?:\.\d+)?))?/i))) {
      const sym = k[1].toUpperCase();
      if (!pos[sym]) { out.push('I was not tracking ' + sym + '.'); continue; }
      let exit = k[2] ? +k[2] : null; if (!exit) { const j = await liveQ((sym)); exit = +j.price || null; }
      const P = pos[sym]; delete pos[sym];
      if (exit && P.entry) {     // your real trades are the evidence that matters most: every sale is recorded
        const t = { sym, kind: P.kind || 'manual', entry: P.entry, exit, since: P.since || null, out: ny(Date.now()).d, pct: +(exit / P.entry - 1 - MY_COST).toFixed(5), priced: k[2] ? 'you' : 'quote at the time of your message', t1: P.t1 || null, stop: P.stop || null, lesson: soldLesson(P, exit) };
        fs.appendFileSync(MY_TRADES, JSON.stringify(t) + '\n');
        { const pv = privRead(), sh = pv.shares && pv.shares[sym]; if (sh) { const usd = sh * (exit - P.entry) - 2 * FEE() - sh * P.entry * 0.002; pv.closed = (pv.closed || []).concat({ sym, usd: +usd.toFixed(2), d: t.out }).slice(-200); delete pv.shares[sym]; privWrite(pv); out.push('In money: about ' + (usd >= 0 ? '+' : '') + money(usd) + ' USD on ' + sh + ' shares (private, encrypted). Total so far: ' + money(pv.closed.reduce((a, x) => a + x.usd, 0)) + ' USD over ' + pv.closed.length + ' sales.'); } }
        out.push('Sold ' + sym + ' at ' + money(exit) + ' (' + (k[2] ? 'your price' : 'price now; send  sold ' + sym + ' PRICE  next time for your exact fill') + '). Result ' + pcs(t.pct) + ' after about 0.4% costs. Recorded.\nWHY: ' + t.lesson + '\n' + myRecord());
      } else out.push('Stopped tracking ' + sym + '. I could not get a price, so this sale is not in your record. Next time send: sold ' + sym + ' PRICE');
    } else if ((k = text.match(/^(stop|target)\s+([a-z.\-]{1,6})\s+(\d+(?:\.\d+)?)/i))) {
      const sym = k[2].toUpperCase(); if (!pos[sym]) { out.push('I am not tracking ' + sym + '. Send: bought ' + sym + ' <price>'); continue; }
      const mine = k[1].toLowerCase() === 'stop';
      if (mine) { pos[sym].stop = +k[3]; delete pos[sym].stopWhy; pos[sym].own = true; } else pos[sym].t1 = +k[3];      // a stop you set yourself is yours: it is never moved by the bot
      out.push('Updated ' + posLine(sym, pos[sym]) + (mine ? '\n  This is now your own stop. I will not raise or change it; I only alert you if the price reaches it. Place it with your broker too.' : ''));
    } else if (/^(positions?|status|list)\b/i.test(text)) {
      const syms = Object.keys(pos); out.push(syms.length ? 'Your tracked positions:\n' + syms.map(x => posLine(x, pos[x])).join('\n') : 'No positions tracked. Send: bought VRTX 500.55');
    } else if (/^(help|commands?|menu|\?)\s*$/i.test(text)) out.push(HELP);
    else out.push(await hotList(sig) + '\n\nYou do not need commands. Write anything, a ticker, or forward a post, and I will study it. Send  help  for the full list.');
  }
  fs.writeFileSync('data/tg-state.json', JSON.stringify(state)); savePos(pos);
  if (out.length) await telegram(out.join('\n\n'));
  if (ups.length) console.log('Telegram: ' + ups.length + ' message(s) read');
}

// ---- Followed channels: public YouTube feeds of channels you choose. Every stock a channel names in a video title or description
// is logged under that channel's name, checked by the tested rules, and scored over time. Titles and descriptions only; no video is watched.
const YT = local(env.YT_BASE) || 'https://www.youtube.com', CH_FILE = 'data/channels.json';
const readChannels = () => { const a = readJson(CH_FILE, []); return Array.isArray(a) ? a.filter(c => c && /^UC[\w-]{20,24}$/.test(c.id || '')) : []; };
const unxml = (t) => String(t || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const FUNDS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'VXX', 'VIX', 'SPX', 'NDX', 'DJI', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'USO', 'TLT', 'IBIT']);   // index and sector funds are market talk, not a stock tip
function tickersIn(text, known) {
  const found = new Set(), add = (x) => { if (x && x.length > 1 && !NOT_TICKERS.has(x) && !FUNDS.has(x)) found.add(x); };
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) add(m[1]);                                   // $NVDA
  for (const m of text.matchAll(/\b(?:NASDAQ|NYSE|AMEX)\s*:\s*([A-Z]{1,5})\b/g)) add(m[1]);      // NASDAQ: NVDA
  for (const m of text.matchAll(/\(([A-Z]{2,5})\)/g)) add(m[1]);                                   // (NVDA)
  for (const m of text.matchAll(/\b[A-Z]{2,5}\b/g)) if (known.has(m[0])) add(m[0]);               // a bare word counts only if it is a stock the system already knows
  return [...found].slice(0, 5);
}
// Reads a channel's newest videos. With a YT_KEY secret it uses YouTube's official Data API (the permitted route from a server);
// without one it falls back to the public feed, which YouTube often refuses to cloud servers.
const YTAPI = local(env.YTAPI_BASE) || 'https://www.googleapis.com';
async function ytFeed(id) {
  if (env.YT_KEY) {
    try {
      const r = await fetch(YTAPI + '/youtube/v3/playlistItems?part=snippet&maxResults=8&playlistId=UU' + id.slice(2) + '&key=' + encodeURIComponent(env.YT_KEY));
      if (!r.ok) return { ok: false, status: r.status, via: 'YouTube Data API' };
      const items = (((await r.json()).items) || []).map(x => x.snippet || {}).map(x => ({ title: String(x.title || ''), desc: String(x.description || ''), pub: Date.parse(x.publishedAt || ''), channel: String(x.channelTitle || '') }));
      return { ok: true, items, channel: (items[0] || {}).channel || '', via: 'YouTube Data API' };
    } catch (e) { return { ok: false, status: -1, via: 'YouTube Data API' }; }
  }
  const H = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept': 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };
  let status = 0;
  for (let t = 0; t < 2; t++) {
    try { const r = await fetch(YT + '/feeds/videos.xml?channel_id=' + id, { headers: H }); status = r.status;
      if (r.ok) { const xml = await r.text(), items = xml.split('<entry>').slice(1, 9).map(e => ({ title: unxml((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]), desc: unxml((e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1]), pub: Date.parse((e.match(/<published>([^<]+)<\/published>/) || [])[1] || '') }));
        return { ok: true, items, channel: unxml((xml.match(/<author>\s*<name>([\s\S]*?)<\/name>/) || [])[1] || ''), via: 'public feed' }; } } catch (e) { status = -1; }
    await sleep(FAST ? 0 : 2500);
  }
  return { ok: false, status, via: 'public feed' };
}
async function channelMentions(known, now) {
  const out = [], chans = readChannels().slice(0, 12); let ok = 0;
  for (const ch of chans) {
    try {
      const f = await ytFeed(ch.id); if (!f.ok) { console.log('YouTube (' + f.via + ') for ' + ch.name + ' answered ' + f.status); continue; } ok++;
      for (const e of f.items) {
        if (!(now - e.pub < 3 * 86400000)) continue;
        const title = e.title, desc = e.desc.slice(0, 1500);
        for (const sym of tickersIn(title + ' ' + desc, known)) if (!out.some(o => o.sym === sym && o.name === ch.name)) out.push({ sym, name: ch.name, title: title.slice(0, 90) });
      }
    } catch (e) {}
    await sleep(FAST ? 0 : 500);
  }
  return { mentions: out.slice(0, 12), channels: chans.length, ok };
}

// ---- Crowd radar: the stocks Reddit's trading forums mention most (ApeWisdom's free public feed). The crowd is a LEAD, not a signal:
// each name is run through the same tested rules, only the ones with tested support are shown, and the crowd itself is scored.
const AW = local(env.AW_BASE) || 'https://apewisdom.io';
async function crowdList() {
  try {
    const r = await fetch(AW + '/api/v1.0/filter/all-stocks/page/1', { headers: { Accept: 'application/json', 'User-Agent': 'Stock-2 personal research scanner (one request a day)' } }); if (!r.ok) return null;
    const skip = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TQQQ', 'SQQQ', 'UVXY', 'VIX']);
    const rows = (((await r.json()).results) || []).filter(x => /^[A-Z]{1,5}$/.test(x.ticker || '') && !skip.has(x.ticker)).map(x => ({ sym: x.ticker, mentions: +x.mentions || 0, was: +x.mentions_24h_ago || 0 }));
    if (!rows.length) { console.log('crowd radar: the feed answered but no tickers were recognised'); return null; }
    const top = rows.slice(0, 5), surge = rows.filter(x => !top.includes(x) && x.mentions >= 15 && x.was > 0 && x.mentions >= 2 * x.was).sort((a, b) => b.mentions / b.was - a.mentions / a.was).slice(0, 4);
    return [...top, ...surge.map(x => ({ ...x, surge: true }))];
  } catch (e) { return null; }
}

// ---- LEADERS: ride the strongest stocks. The rule has no tuned settings: rank by 6-month gain, keep only stocks above their rising
// 50 and 200 day averages while the S&P 500 is above its own 200 day average, buy at the next open, and trail a stop three normal
// daily moves (ATR) under the close. It is tested on ALL stocks of the fixed list together, with at most five held at a time.
const LEAD_COST = 0.004;   // round trip: broker fee of 0.15% each way plus about 0.1% for the spread and a worse fill
const LEAD_FILE = 'data/leaders.json', LEADCFG = { N: 5, LOOK: 126, ATR: 3 };
// SELF-TUNING. Nine versions of the one rule (strength measured over 3, 6 or 12 months; stop 2, 3 or 4 daily moves wide) are
// re-tested every night. A version is usable only if it made money overall AND in the last two years. The one in use changes only
// when another is clearly better on the OLDER years, so the choice is never made on the same data it is then judged by.
const LEAD_VARIANTS = [63, 126, 252].flatMap(LOOK => [2, 3, 4].map(ATR => ({ LOOK, ATR }))), leadKey = (v) => v.LOOK + '-' + v.ATR;
const leadName = (v) => 'strength over ' + Math.round(v.LOOK / 21) + ' months, stop ' + v.ATR + ' normal daily moves under the close';
{ const k = (readJson0(LEAD_FILE) || {}).rule, v = LEAD_VARIANTS.find(x => leadKey(x) === k); if (v) Object.assign(LEADCFG, v); }   // keep using last night's choice until tonight's test
function leadersPick(loaded, spy, btSet, current) {
  const cut = spy[Math.max(0, spy.length - 505)].d, res = [];
  for (const v of LEAD_VARIANTS) {
    Object.assign(LEADCFG, v);
    const r = leadersCalc(loaded, spy, btSet), early = r.done.filter(x => x.d < cut).map(x => x.pct), late = r.done.filter(x => x.d >= cut).map(x => x.pct);
    const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, m = mean(early), sd = Math.sqrt(mean(early.map(x => (x - m) ** 2)));
    res.push({ key: leadKey(v), v, r, ts: early.length >= 20 && sd > 0 ? m / sd * Math.sqrt(early.length) : -9, ok: Boolean(r.bt && r.bt.avg > 0 && r.bt.second > 0 && late.length >= 8 && mean(late) > 0) });
  }
  const ok = res.filter(x => x.ok).sort((a, b) => b.ts - a.ts), cur = res.find(x => x.key === current) || res.find(x => x.key === '126-3');
  const pick = cur.ok && (!ok.length || ok[0].ts < cur.ts + 0.5) ? cur : ok[0] || cur;
  Object.assign(LEADCFG, pick.v);
  return { ...pick.r, rule: pick.key, was: cur.key, tried: res.length, passed: ok.length };
}
function leadersCalc(loaded, spy, btSet) {
  const T = spy.length, tOf = new Map(spy.map((k, t) => [k.d, t])), spyE = L.indicators(spy, null).e[L.CFG.TREND], S = {}, COST = LEAD_COST;
  for (const sym of Object.keys(loaded)) {
    if (sym === 'SPY' || FUNDS.has(sym)) continue;
    const c = loaded[sym].candles; if (c.length < 260) continue;
    const ind = L.indicators(c, null), at = new Int32Array(T).fill(-1);
    for (let i = 0; i < c.length; i++) { const t = tOf.get(c[i].d); if (t !== undefined) at[t] = i; }
    S[sym] = { c, ind, at };
  }
  const elig = (sym, t) => {
    const x = S[sym], i = x.at[t]; if (i < 200) return null;
    const c = x.c, px = c[i].c, e50 = x.ind.e[50][i], e200 = x.ind.e[L.CFG.TREND][i], a = x.ind.atr[i];
    if (!(px >= 5) || !(a > 0) || !(px > e50 && e50 > e200)) return null;
    let dv = 0; for (let k = i - 19; k <= i; k++) dv += c[k].c * c[k].v; if (dv / 20 < L.CFG.MIN_DOLLAR_VOL) return null;
    if (i <= LEADCFG.LOOK) return null;
    const mom = px / c[i - LEADCFG.LOOK].c - 1; if (!(mom > 0)) return null;
    return { sym, i, mom, px, a, e50 };
  };
  const rank = (t, only) => Object.keys(S).filter(x => !only || only.has(x)).map(x => elig(x, t)).filter(Boolean).sort((a, b) => b.mom - a.mom);
  // the past test
  const open = [], done = [], t0 = Math.max(330, T - 2520);
  for (let t = t0; t < T - 1; t++) {
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k], x = S[p.sym], i = x.at[t]; if (i < 0 || i < p.i0) continue;
      const cl = x.c[i].c;
      if (cl < p.stop || cl < x.ind.e[50][i]) { if (i + 1 < x.c.length) { const ex = x.c[i + 1].o, tx = tOf.get(x.c[i + 1].d); done.push({ sym: p.sym, d: p.d, pct: ex / p.entry - 1 - COST, days: i + 1 - p.i0, spy: tx !== undefined ? spy[tx].o / spy[p.t].o - 1 : null }); open.splice(k, 1); } }
      else p.stop = Math.max(p.stop, cl - LEADCFG.ATR * x.ind.atr[i]);
    }
    if (open.length < LEADCFG.N && spy[t].c > spyE[t]) for (const r of rank(t, btSet)) {
      if (open.length >= LEADCFG.N) break;
      if (open.some(p => p.sym === r.sym)) continue;
      const c = S[r.sym].c; if (r.i + 1 >= c.length) continue;
      const en = c[r.i + 1].o; if (en > r.px + 0.5 * r.a || en <= r.px - LEADCFG.ATR * r.a) continue;    // opened above the buy range, or already under the stop: skipped, as you would
      const te = tOf.get(c[r.i + 1].d); if (te === undefined) continue;
      open.push({ sym: r.sym, entry: en, i0: r.i + 1, stop: r.px - LEADCFG.ATR * r.a, d: c[r.i + 1].d, t: te });
    }
  }
  let bt = null;
  if (done.length >= 30) {
    done.sort((a, b) => a.d < b.d ? -1 : 1);
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, w = done.filter(x => x.pct > 0), l = done.filter(x => x.pct <= 0), h = Math.floor(done.length / 2);
    const days = done.map(x => x.days).sort((a, b) => a - b), sp = done.filter(x => x.spy !== null), years = (Date.parse(spy[T - 1].d) - Date.parse(spy[t0].d)) / 31557600000;
    const growth = done.reduce((g, x) => g * (1 + x.pct / LEADCFG.N), 1);
    bt = { n: done.length, from: spy[t0].d.slice(0, 4), win: w.length / done.length, avgWin: avg(w.map(x => x.pct)), avgLoss: avg(l.map(x => x.pct)), avg: avg(done.map(x => x.pct)), medDays: days[Math.floor(days.length / 2)],
      spy: sp.length ? avg(sp.map(x => x.spy)) : null, first: avg(done.slice(0, h).map(x => x.pct)), second: avg(done.slice(h).map(x => x.pct)), worst: Math.min(...done.map(x => x.pct)), best: Math.max(...done.map(x => x.pct)),
      perYear: Math.pow(growth, 1 / years) - 1, spyYear: Math.pow(spy[T - 1].c / spy[t0].c, 1 / years) - 1, stocks: Object.keys(S).filter(x => btSet.has(x)).length };
  }
  return { S, bt, done, marketOk: spy[T - 1].c > spyE[T - 1], ranked: rank(T - 1, null) };
}
const leadEvidence = (b) => !b ? 'Past test: too few trades to judge.' : 'Past test, ' + b.stocks + ' large stocks together since ' + b.from + ', five held at a time: ' + b.n + ' trades, ' + Math.round(b.win * 100) + '% won. Winners averaged +' + (b.avgWin * 100).toFixed(1) + '%, losers ' + (b.avgLoss * 100).toFixed(1) + '%, all trades ' + (b.avg >= 0 ? '+' : '') + (b.avg * 100).toFixed(2) + '% each after costs'
  + (b.spy !== null ? ' (S&P 500 over the same days ' + (b.spy >= 0 ? '+' : '') + (b.spy * 100).toFixed(2) + '%)' : '') + '. Typical hold ' + b.medDays + ' sessions. Earlier half ' + (b.first * 100).toFixed(2) + '%, later half ' + (b.second * 100).toFixed(2) + '% a trade. Whole account about ' + (b.perYear * 100).toFixed(0) + '% a year against ' + (b.spyYear * 100).toFixed(0) + '% for the S&P 500. Best trade +' + Math.round(b.best * 100) + '%, worst ' + Math.round(b.worst * 100) + '%.'
  + '\nCaution: the test list is today’s well-known companies, which flatters the past. The paper record below, counted from now on, is the honest test.';
// The paper ledger's summary: what decides profit is the size of winners against losers, not the share of winners.
function leadLedger(dn) {
  const w = dn.filter(p => p.pct > 0), l = dn.filter(p => p.pct <= 0), sum = (a) => a.reduce((x, p) => x + p.pct, 0), pc = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  let eq = 0, peak = 0, dd = 0; for (const p of dn) { eq += p.pct / LEADCFG.N; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  return ' Winners averaged ' + (w.length ? pc(sum(w) / w.length) : 'none yet') + ', losers ' + (l.length ? pc(sum(l) / l.length) : 'none yet') + '. Profit factor ' + (l.length && sum(l) < 0 ? (sum(w) / -sum(l)).toFixed(2) : 'not yet measurable') + ' (above 1 means it earns). Best ' + pc(Math.max(...dn.map(p => p.pct))) + ', worst ' + pc(Math.min(...dn.map(p => p.pct))) + '. Deepest fall of the paper account ' + (dd * 100).toFixed(1) + '%.' + (dn.length < 20 ? ' Under 20 finished trades: too few to judge.' : '');
}
const leadLine = (r) => r.sym + ': BUY ' + money(r.buyLo) + ' to ' + money(r.buyHi) + ' | STOP ' + money(r.stop) + ' | SELL when it closes under its trailing stop or its 50 day average (now ~' + money(r.e50) + ') | trend trade, weeks';
const leadersText = () => { const s = readJson(LEAD_FILE, null); return s && s.text ? s.text : 'The LEADERS list is built by the nightly scan. None has run on this version yet; it arrives after tonight’s close.'; };

async function daily() {
  const now = Date.now(), loaded = {}, errors = [];
  await tgCommands(readJson('data/signals.json', null));
  const myPos = loadPos(), myLines = [], posVerdict = {};
  for (const x of Object.keys(myPos)) if (!LIST.includes(x)) LIST.push(x);
  const crowd = env.NO_CROWD ? null : await crowdList();
  if (crowd) for (const x of crowd) if (!LIST.includes(x.sym)) LIST.push(x.sym);
  const chan = await channelMentions(new Set([...LIST, ...QEXTRA, ...DISC]), now);
  for (const x of chan.mentions) if (!LIST.includes(x.sym)) LIST.push(x.sym);
  for (const sym of LIST) {
    const j = await td('/time_series?symbol=' + encodeURIComponent(sym) + '&interval=1day&outputsize=4000&order=ASC');
    if (j.status === 'error' || !j.values) { errors.push(sym); continue; }
    const all = j.values.map(v => ({ d: v.datetime.slice(0, 10), o: +(+v.open).toFixed(4), h: +(+v.high).toFixed(4), l: +(+v.low).toFixed(4), c: +(+v.close).toFixed(4), v: Math.round(+v.volume || 0) })).sort((a, b) => a.d < b.d ? -1 : 1);
    loaded[sym] = { candles: all.filter(c => barClosed(c.d, now)), last: all[all.length - 1].c };
  }
  const WIDE = new Set();
  { const t0 = Date.now(), ws = await wideUniverse(new Set(LIST));
    if (ws.length) { const n = await loadWide(ws, loaded, now); for (const x of ws) if (loaded[x]) { WIDE.add(x); LIST.push(x); } console.log('whole market:', n, 'of', ws.length, 'liquid companies loaded in', Math.round((Date.now() - t0) / 1000), 's'); } }
  if (!loaded.SPY) { await telegram('Stock scanner: could not load market data today (' + errors.length + ' errors). Check the TWELVE_KEY secret.'); process.exit(1); }
  const spy = loaded.SPY.candles, session = spy[spy.length - 1].d, prev = readJson('data/signals.json', null);
  if (prev && prev.session === session && !env.FORCE) { console.log('No new session since ' + session + ' (weekend or holiday). Nothing sent.'); return; }
  const mkt = L.marketMap(spy), mktUp = mkt[session].up, mom6 = spy[spy.length - 1].c / spy[spy.length - 127].c - 1;
  const models = readJson('data/models.json', {});
  const journal = fs.existsSync('data/journal.jsonl') ? fs.readFileSync('data/journal.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const uni = [];
  const VR = L.volRegime ? L.volRegime(spy) : { known: false, mult: 1 }, VOLM = VR.mult;
  const stocks = [], fresh = [], exits = [], openTrades = [], results = [], horizons = {}, picks = [], quick = [], qFin = [], blocked = [], wk = [], famRes = {}, live = {};
  // LESSONS: every finished live paper trade is reviewed: how it ended, how far it ran up before it ended, and whether it
  // reached its first target. Grouped by the exact rule that produced it. A rule whose live record turns negative
  // (10+ trades) is DEMOTED: its signals stay on paper and are no longer offered as BUY until the live record recovers.
  const PREV_LESSONS = readJson('data/lessons.json', { rules: {} });
  const weak = [];
  const refLine = (sym, d) => {
    if (myPos[sym]) return;   // already held: it is tracked under YOUR POSITIONS, not offered again
    const r = L.refPlan ? L.refPlan(d.candles, d.last) : null; if (!r) return;
    const o = L.refOdds ? L.refOdds(d.candles) : null;
    if (o && o.won < 0.25) { weak.push(sym + ' ' + Math.round(o.won * 100) + '%'); return; }   // the marker came first too rarely: this plan loses on average
    picks.push({ tier: r.extended ? 3 : 2, text: sym + ' closed ' + money(d.last) + ' (reference, not tested)\n  ' + (r.extended ? 'wait for a pullback, then buy ' : 'buy range ') + money(r.lo) + ' to ' + money(r.hi) + '\n  stop ' + money(r.stop) + ', reward marker ' + money(r.target) + (r.exit ? ', exit on a close below ~' + money(r.exit) : '')
      + (o ? '\n  marker reached before the stop in ' + Math.round(o.won * 100) + '% of ' + o.cases + ' past cases' + (o.cases < 100 ? ' (few cases, weak evidence)' : '') : '\n  too little history to count how often this worked') });
  };

  for (const sym of LIST) {
    const d = loaded[sym]; if (!d) continue;
    const only = QONLY.has(sym);
    if (d.candles.length < 600) { if (DISC.has(sym)) refLine(sym, d); continue; }
    const c = d.candles, i = c.length - 1, ind = L.indicators(c, mkt), T = L.trendStats(c, ind, mom6), halal = myHalal(sym);
    if (!only && !WIDE.has(sym) && i > 140) { const e2 = ind.e[L.CFG.TREND], e5 = ind.e[50], j = i - 5; wk.push({ sym, chg: c[i].c / c[j].c - 1, up: T.up, wasUp: c[j].c > e2[j] && e5[j] > e2[j] && c[j].c / c[j - 126].c - 1 > 0 }); }
    if (myPos[sym]) {   // your own position: end-of-day checks
      if (myPos[sym].stopWhy && c.some(k => k.d > myPos[sym].since)) { const a = ind.atr[i], e50 = ind.e[50][i], ns = +Math.max(c[i].c - 2 * a, e50 < c[i].c ? e50 : 0).toFixed(2); if (ns > myPos[sym].stop && c[i].c > myPos[sym].stop) { myPos[sym].stop = ns; myPos[sym].raised = c[i].d; } }
      if (myPos[sym].kind === 'leader' && myPos[sym].stop && c.some(k => k.d > myPos[sym].since)) { const ns = +(c[i].c - LEADCFG.ATR * ind.atr[i]).toFixed(2); if (ns > myPos[sym].stop && c[i].c > myPos[sym].stop) { myPos[sym].stop = ns; myPos[sym].raised = c[i].d; } }
      const P = myPos[sym], held = c.filter(k => k.d > P.since).length, flags = [];
      if (P.kind === 'leader' && held >= 1 && c[i].c < ind.e[50][i]) flags.push('LEADER EXIT: it closed under its 50 day average, the trend is broken. Sell at the next open.');
      if (P.stop && c[i].c <= P.stop) flags.push('CLOSED AT OR BELOW YOUR STOP ' + money(P.stop) + '. Sell / reassess at the next open.');
      if (held >= 1 && P.t1 && c[i].h >= P.t1) flags.push('Target 1 ' + money(P.t1) + ' was reached today.');
      const gapT = P.q === 'gap', hit = gapT ? c[i].c < ind.sma5[i] : c[i].c > ind.sma5[i];
      if (P.kind === 'quick' && held >= 1 && hit) flags.push('QUICK TRADE EXIT: it closed ' + (gapT ? 'below' : 'above') + ' its 5 day average. Sell at the next open.');
      else if ((P.kind === 'quick' || P.kind === 'radar' || (P.kind === 'entry' && P.maxHold)) && held >= (P.maxHold || 5)) flags.push((P.kind === 'radar' ? 'EARLY-WAVE' : P.kind === 'entry' ? 'SWING TRADE' : 'QUICK TRADE') + ' TIME EXIT: ' + (P.maxHold || 5) + ' sessions have passed. Sell at the next open.');
      if (flags.some(f => /STOP|EXIT/.test(f))) posVerdict[sym] = flags.find(f => /STOP|EXIT/.test(f)).replace(/ Sell.*$/, '').replace(/^(QUICK TRADE (TIME )?|LEADER )EXIT: /, '').toLowerCase();
      { const bc = L.bearishCandle ? L.bearishCandle(c, i) : 0; if (bc) flags.push('Candle warning: a ' + L.BEAR_NAMES[bc] + ' at this close. Weak evidence alone; check your stop.'); }
      if (P.raised === c[i].d) flags.push('Stop raised to ' + money(P.stop) + (P.entry && c[i].c > P.entry ? ' as the stock rose' : ' (it is still below your entry; the stop only tightened)') + '. Move it at your broker too.');
      myLines.push(posLine(sym, P, d.last) + (flags.length ? '\n  ' + flags.join('\n  ') : '\n  no exit signal at this close') + '\n  held ' + held + ' session' + (held === 1 ? '' : 's'));
    }
    const mine = journal.filter(x => x.sym === sym), resolved = mine.map(x => ({ x, t: L.resolveCall(x, c, ind) })).filter(y => y.t);
    for (const y of resolved) {
      const isQ = y.x.kind === 'quick', si = c.findIndex(k => k.d === y.x.d);
      if (y.t.open) {
        openTrades.push({ sym, stop: +y.t.stop.toFixed(4), target: isFinite(y.t.target) ? +y.t.target.toFixed(4) : null, t1: y.x.t1 || null, quick: isQ, since: y.x.d });
        // Exit alert: the rule's exit fired at this close, so the paper trade is sold at the next open
        const timeUp = y.x.v.maxHold && i - si >= y.x.v.maxHold;
        if (i > si && (L.exitAt(ind, c, y.x.v, i) || timeUp)) exits.push(sym + (isQ ? ' (quick trade)' : '') + ': exit signal at the close, ' + (timeUp && !L.exitAt(ind, c, y.x.v, i) ? 'time limit reached' : isQ ? 'closed ' + (y.x.v.q === 'gap' ? 'below' : 'above') + ' its 5 day average' : 'rule exit fired') + '. Sell at the next open. Entered after ' + y.x.d + ', now ' + (y.t.pct >= 0 ? '+' : '') + (y.t.pct * 100).toFixed(1) + '%.');
      } else {
        { const fk = isQ ? (y.x.v.q === 'gap' ? 'Quick trade: gap and hold' : y.x.v.q === 'candle' ? 'Quick trade: candlestick' : 'Quick trade: dip') : y.x.v.fam === 'brk20' ? '20 day volume breakout' : y.x.v.fam === 'pull' ? 'Dip in an uptrend' : y.x.v.fam === 'brk' ? 'New 52 week high' : 'Average cross', g = famRes[fk] || (famRes[fk] = { n: 0, pct: 0, win: 0, week: 0 }); g.n++; g.pct += y.t.pct; if (y.t.pct > 0) g.win++; if (y.t.exitIdx >= i - 4) g.week++; }
        { const lr = live[y.x.key] || (live[y.x.key] = { name: (isQ ? 'Quick trade: ' + L.quickWhat(y.x.v) : L.famText(y.x.v)) + ' (stop ' + y.x.v.mult + ' daily moves' + (y.x.v.maxHold ? ', max ' + y.x.v.maxHold + ' days' : '') + ')', n: 0, sum: 0, wins: 0, ends: {}, t1: 0, t1n: 0, runUp: [], last: [] });
          let mx = 0; for (let k = y.t.entryIdx; k <= y.t.exitIdx; k++) mx = Math.max(mx, c[k].h);
          { const hiB = y.x.ref + 0.5 * (y.x.dist / y.x.v.mult), above = y.t.entry > hiB; lr.fill = lr.fill || { inN: 0, inSum: 0, upN: 0, upSum: 0 };   // would you have bought? (the plan says skip if it opens above the range)
            if (above) { lr.fill.upN++; lr.fill.upSum += y.t.pct; } else { lr.fill.inN++; lr.fill.inSum += y.t.pct; } }
          lr.n++; lr.sum += y.t.pct; if (y.t.pct > 0) lr.wins++; lr.ends[y.t.reason] = (lr.ends[y.t.reason] || 0) + 1; lr.runUp.push(mx / y.t.entry - 1);
          if (y.x.t1) { lr.t1n++; if (mx >= y.x.t1 * (y.t.entry / y.x.ref)) lr.t1++; }
          lr.last.push(sym + ' ' + (y.t.pct >= 0 ? '+' : '') + (y.t.pct * 100).toFixed(1) + '% (' + y.t.reason.replace('_', ' ') + ')'); }
        if (isQ) qFin.push({ d: c[y.t.exitIdx].d, pct: y.t.pct, spy: ind.bench && ind.bench[y.t.sigIdx] ? ind.bench[y.t.exitIdx] / ind.bench[y.t.sigIdx] - 1 : null }); else results.push(y.t.r);
        if (y.t.exitIdx === i) exits.push(sym + (isQ ? ' (quick trade)' : '') + ': paper trade from ' + y.x.d + ' ended by ' + y.t.reason.replace('_', ' ') + ' (' + (y.t.pct >= 0 ? '+' : '') + (y.t.pct * 100).toFixed(1) + '%)');
      }
      if (!isQ) { const o = L.barOutcomes(y.x, c, ind); for (const h in o) { const g = horizons[h] || (horizons[h] = { n: 0, ret: 0, bench: 0 }); g.n++; g.ret += o[h].ret; g.bench += o[h].bench || 0; } }
    }
    if (only) uni.push({ sym, last: d.last, uptrend: T.up, mom6: +T.mom6.toFixed(4) });
    if (!only) {
      const Lr = L.learn(c, ind, models[sym], sym === 'SPY'); models[sym] = Lr.key;
      const paused = L.isPaused(resolved.filter(y => !y.t.open && y.x.kind !== 'quick').map(y => y.t.r));
      const v = L.applyGates(L.verdict(c, ind, Lr, null, d.last, paused), { dollarVol: T.dollarVol, halal, limit: null }), trig = L.buyTrigger(c, ind, Lr), dist = Lr.v.mult * ind.atr[i];
      const row = { sym, last: d.last, state: v.word, why: v.why, halal, rule: L.ruleText(Lr.v), proven: Lr.proven, uptrend: T.up, mom6: +T.mom6.toFixed(4), trigger: trig.price ? +trig.price.toFixed(4) : null };
      if (v.act) Object.assign(row, { buyLo: d.last, buyHi: +(d.last + 0.5 * ind.atr[i]).toFixed(4), stop: +(d.last - dist).toFixed(4), target: Lr.v.tp ? +(d.last + Lr.v.tp * dist).toFixed(4) : null, exitBelow: +L.sellLevel({ v: Lr.v }, c, ind).toFixed(4), hit: Lr.hitRate, days: Lr.medDays, n: Lr.test ? Lr.test.n : null, win: Lr.test ? Lr.test.winRate : null, avgPct: Lr.avgPct, key: Lr.key, maxHold: Lr.v.maxHold || null });
      stocks.push(row);
      if (BIOBLOCK.has(sym)) { if (v.act) { blocked.push(sym + ': a tested rule fired, but ' + BIOBLOCK.get(sym)); row.state = 'Blocked'; } else if (DISC.has(sym)) blocked.push(sym + ' (discovery pick): ' + BIOBLOCK.get(sym)); }
      else if (DISC.has(sym) && halal !== 'fail') {
        if (v.act) picks.push({ tier: 0, text: sym + ' closed ' + money(d.last) + ' (ENTRY CONFIRMED, tested rule)\n  buy range ' + money(row.buyLo) + ' to ' + money(row.buyHi) + '\n  stop ' + money(row.stop) + (row.target ? ', target ' + money(row.target) : ', no fixed target') + ', exit on a close below ~' + money(row.exitBelow) });
        else if (Lr.proven && trig.price && trig.price / d.last < 1.15) picks.push({ tier: 1, text: sym + ' closed ' + money(d.last) + ' (BUY WATCH, tested rule)\n  buy only after a close above ~' + money(trig.price) + ', then up to ' + money(trig.price + 0.5 * ind.atr[i]) + '\n  stop ~' + money(trig.price - dist) + (Lr.v.tp ? ', target ~' + money(trig.price + Lr.v.tp * dist) : ', no fixed target') });
        else refLine(sym, d);
      }
      if (v.signal && !BIOBLOCK.has(sym) && !mine.some(x => x.d === c[i].d && x.kind !== 'quick')) { const e = { sym, d: c[i].d, key: Lr.key, v: Lr.v, dist: +dist.toFixed(6), ref: d.last, state: v.word, loggedAt: new Date(now).toISOString() }; fresh.push(e); fs.appendFileSync('data/journal.jsonl', JSON.stringify(e) + '\n'); }
    }
    // Quick trades: three kinds of dip, each shown only where it passed its own tests on this stock
    if (L.quickStudy && !myPos[sym] && !BIOBLOCK.has(sym) && d.last >= (WIDE.has(sym) ? 2 : 5) && !(T.dollarVol !== null && T.dollarVol < L.CFG.MIN_DOLLAR_VOL) && halal !== 'fail') {
      const Q = L.quickFire(c, ind, L.quickStudy(c, ind, sym === 'SPY'));
      if (Q) {
        const qd = Q.v.mult * ind.atr[i], per10k = Math.floor(VOLM * Math.min(10000 * 0.005 / qd, 10000 * 0.20 / d.last)), P = L.quickPlan ? L.quickPlan(d.last, ind.atr[i], ind.sma5[i], Q) : {};
        const t1 = P.t1 ? +P.t1.toFixed(4) : null, t2 = P.t2 ? +P.t2.toFixed(4) : null;
        quick.push({ t: Q.test.t, row: { sym, last: d.last, buyLo: d.last, buyHi: +(d.last + 0.5 * ind.atr[i]).toFixed(4), sellAbove: +ind.sma5[i].toFixed(4), stop: +(d.last - qd).toFixed(4), t1, t2, q: Q.v.q, maxHold: Q.v.maxHold, exitText: L.quickExitText ? L.quickExitText(Q.v, ind.sma5[i]) : '', what: L.quickWhat(Q.v), key: Q.key, win: Q.test.winRate, n: Q.test.n, avgPct: Q.avgPct, days: Q.medDays },
          text: sym + ' closed ' + money(d.last) + '\n  why: ' + (Q.v.q === 'gap' ? 'momentum, ' : 'in an uptrend, ') + L.quickWhat(Q.v) + '\n  buy ' + money(d.last) + ' to ' + money(d.last + 0.5 * ind.atr[i]) + ' at the next open' + (t1 ? '\n  target 1: ' + money(t1) + ' (half of its past quick trades got this far)' : '') + (t2 ? '\n  target 2: ' + money(t2) + ' (about one in four)' : '') + '\n  rule exit: ' + (L.quickExitText ? L.quickExitText(Q.v, ind.sma5[i]) : 'first close above its 5 day average') + '\n  time exit: after ' + Q.v.maxHold + ' sessions\n  invalidation: ' + money(d.last - qd) + ' (stop loss)\n  size: about ' + per10k + ' shares per 10,000 USD of account (risking about ' + Math.round(per10k * qd) + ' USD)\n  past result here: ' + Math.round(Q.test.winRate * 100) + '% wins over ' + Q.test.n + ' unseen trades, average ' + (Q.avgPct * 100).toFixed(2) + '% a trade, about ' + Q.medDays + ' days held\n  ' + L.HALAL_TEXT[halal] });
        quick[quick.length - 1].entry = mine.some(x => x.d === c[i].d && x.kind === 'quick') ? null : { sym, d: c[i].d, key: Q.key, v: Q.v, dist: +qd.toFixed(6), ref: d.last, t1, state: 'Quick trade', kind: 'quick', loggedAt: new Date(now).toISOString() };
      }
    }
  }
  quick.sort((a, b) => b.t - a.t);
  // Earnings check (Finnhub). Results within 7 days block a quick trade or a confirmed entry: the price can gap through any stop.
  const earnings = async (sym) => {
    if (!env.FINNHUB_KEY) return { known: false };
    try {
      const today = new Date(now).toISOString().slice(0, 10), r = await fetch(FH + '/calendar/earnings?from=' + today + '&to=' + new Date(now + 21 * 86400000).toISOString().slice(0, 10) + '&symbol=' + sym + '&token=' + encodeURIComponent(env.FINNHUB_KEY));
      if (!r.ok) return { known: false };
      const cal = ((await r.json()).earningsCalendar) || [], ds = cal.map(e => e.date).filter(Boolean).sort(), hr = ds[0] ? String((cal.find(e => e.date === ds[0]) || {}).hour || '').toLowerCase() : '';
      return { known: true, date: ds[0] || null, days: ds[0] ? Math.round((Date.parse(ds[0]) - now) / 86400000) : null, when: hr === 'bmo' ? ' before the market opens' : hr === 'amc' ? ' after the market closes' : '' };
    } catch (e) { return { known: false }; } finally { await sleep(FAST ? 0 : 1100); }
  };
  const earnText = (e) => !e.known ? 'earnings date NOT CHECKED, verify before acting' : e.date ? 'next earnings ' + e.date + (e.when || '') + ', in ' + e.days + ' days' : 'no earnings in the next three weeks';
  const keep = [];
  for (const q of quick.slice(0, 10)) {
    const e = await earnings(q.row.sym);
    if (e.known && e.date && e.days <= 7) { blocked.push(q.row.sym + ' (quick trade): earnings on ' + e.date + ', in ' + Math.max(e.days, 0) + ' days. A result can gap the price through the stop.'); continue; }
    const nr = await newsRisk(q.row.sym);
    if (nr.hard) { blocked.push(q.row.sym + ' (quick trade): ' + nr.hard.tag + ' in the news this week. "' + nr.hard.h + '"'); continue; }
    q.text += '\n  ' + earnText(e) + (nr.soft ? '\n  WARNING, ' + nr.soft.tag.toLowerCase() + ': "' + nr.soft.h + '"' : nr.known ? '\n  no negative news found this week' : ''); q.row.earn = earnText(e); q.row.earnDays = e.known && e.date ? e.days : null;
    if (q.entry) { fresh.push(q.entry); fs.appendFileSync('data/journal.jsonl', JSON.stringify(q.entry) + '\n'); }
    keep.push(q);
  }
  quick.length = 0; quick.push(...keep);
  for (const st of stocks.filter(x => x.state === 'Buy watch')) {
    const e = await earnings(st.sym);
    if (e.known && e.date && e.days <= 7) { st.state = 'Blocked'; blocked.push(st.sym + ': a tested rule fired, but earnings are on ' + e.date + ', in ' + Math.max(e.days, 0) + ' days.'); continue; }
    const nr = await newsRisk(st.sym);
    if (nr.hard) { st.state = 'Blocked'; blocked.push(st.sym + ': a tested rule fired, but there is ' + nr.hard.tag.toLowerCase() + ' in the news this week. "' + nr.hard.h + '"'); }
    else { st.earn = earnText(e) + (nr.soft ? '\n  WARNING, ' + nr.soft.tag.toLowerCase() + ': "' + nr.soft.h + '"' : ''); st.earnDays = e.known && e.date ? e.days : null; }
  }
  // ---- LEADERS: rank tonight, keep a paper portfolio of five going forward, and give prices only while the past test is positive
  // memory: the whole-market stocks have been tested already; keep only their last year, and leave them out of the LEADERS
  // re-test (which runs nine versions over every loaded stock and would not fit in memory with 2,500 more)
  for (const x of WIDE) if (loaded[x]) loaded[x] = { candles: loaded[x].candles.slice(-260), last: loaded[x].last, wide: true };
  const coreLoaded = Object.fromEntries(Object.entries(loaded).filter(([k]) => !WIDE.has(k)));
  const LS0 = readJson(LEAD_FILE, { paper: [], done: [] }), LS = LS0, LC = leadersPick(coreLoaded, spy, BTSET, LS0.rule), leadRows = [], leadOut = [], leadSkip = [];
  LS.paper = (LS.paper || []).filter(p => !(p.picked === session && !p.entry)); LS.done = LS.done || [];   // a re-run of the same night rebuilds tonight's picks
  for (const p of LS.paper) {
    const x = LC.S[p.sym]; if (!x) continue; const c = x.c, i = c.length - 1;
    if (!p.entry) { const k = c.findIndex(z => z.d > p.picked); if (k >= 0) { if (c[k].o > p.buyHi || c[k].o <= p.stop) { p.skip = true; LS.missed = LS.missed || { above: 0, under: 0 }; LS.missed[c[k].o > p.buyHi ? 'above' : 'under']++; } else { p.entry = c[k].o; p.in = c[k].d; p.entryWorst = +Math.max(c[k].o, Math.min(c[k].h, p.buyHi)).toFixed(4); } } }
    if (p.exitOn && !p.exit) { const k = c.findIndex(z => z.d > p.exitOn); if (k >= 0) { p.exit = c[k].o; p.out = c[k].d; p.gross = +(p.exit / p.entry - 1).toFixed(5); p.pct = +(p.gross - LEAD_COST).toFixed(5); if (p.entryWorst) p.pctWorst = +(p.exit / p.entryWorst - 1 - LEAD_COST).toFixed(5); const a = spy.find(z => z.d >= p.in), b = spy.find(z => z.d >= p.out); p.spy = a && b ? b.o / a.o - 1 : null; } }
    else if (p.entry && !p.exitOn) { if (c[i].c < p.stop || c[i].c < x.ind.e[50][i]) { p.exitOn = session; p.why = c[i].c < p.stop ? 'closed under its trailing stop ' + money(p.stop) : 'closed under its 50 day average'; } else p.stop = +Math.max(p.stop, c[i].c - LEADCFG.ATR * x.ind.atr[i]).toFixed(2); }
  }
  LS.done.push(...LS.paper.filter(p => p.exit)); LS.done = LS.done.slice(-300);
  LS.paper = LS.paper.filter(p => !p.exit && !p.skip);
  // The weekly fair test (whole market, dead stocks included, judged only on data the choice never saw) can veto the list.
  const FAIR = readJson('data/leaders-study.json', null), fairRow = FAIR && (FAIR.rows || []).find(r => r.key === LC.rule);
  const rowRejected = Boolean(fairRow && fairRow.test && fairRow.test.base && fairRow.test.base.n >= 30 && fairRow.test.low && !(fairRow.test.low.avg > 0));
  const fairBad = Boolean(FAIR && ((FAIR.liveVerdict === 'REJECTED' && FAIR.live === LC.rule) || rowRejected));
  const fairState = !FAIR ? 'NOT RUN' : fairBad ? 'REJECTED' : FAIR.live === LC.rule ? FAIR.liveVerdict : 'NOT PROVEN';
  const leadOk = LC.bt && LC.bt.avg > 0 && LC.bt.second > 0 && !fairBad;
  if (LC.marketOk && (leadOk || fairBad)) {
    let checked = 0;
    for (const r of LC.ranked) {
      if (LS.paper.length >= LEADCFG.N || checked >= 12) break;
      if (LS.paper.some(p => p.sym === r.sym)) continue;
      checked++;
      if (BIOBLOCK.has(r.sym)) { leadSkip.push(r.sym + (BIOBLOCK.get(r.sym).startsWith('dilution') ? ' (heavy share dilution)' : ' (trial risk)')); continue; }
      if (myHalal(r.sym) === 'fail') { leadSkip.push(r.sym + ' (you marked it NOT halal in ZAD)'); continue; }
      const e = await earnings(r.sym); if (e.known && e.date && e.days <= 7) { leadSkip.push(r.sym + ' (earnings ' + e.date + ')'); continue; }
      const nr = await newsRisk(r.sym); if (nr.hard) { leadSkip.push(r.sym + ' (' + nr.hard.tag.toLowerCase() + ')'); continue; }
      const row = { sym: r.sym, last: r.px, buyLo: +r.px.toFixed(2), buyHi: +(r.px + 0.5 * r.a).toFixed(2), stop: +(r.px - LEADCFG.ATR * r.a).toFixed(2), e50: +r.e50.toFixed(2), mom: r.mom, earn: earnText(e) + (nr.soft ? '. WARNING, ' + nr.soft.tag.toLowerCase() : ''), earnDays: e.known && e.date ? e.days : null };
      if (leadOk) leadRows.push(row); LS.paper.push({ sym: r.sym, picked: session, buyHi: row.buyHi, stop: row.stop, mom: r.mom, rule: LC.rule, paperOnly: !leadOk || undefined });
    }
  }
  {
    const pc = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', top = LC.ranked.slice(0, 5).map(r => r.sym + ' +' + Math.round(r.mom * 100) + '%').join(', ');
    leadOut.push('LEADERS, ' + session + ' close', 'The strongest stocks I follow, to ride for weeks. Prices are from that close; buy at the next open (4:30 pm Kuwait).', 'Strongest over ' + Math.round(LEADCFG.LOOK / 21) + ' months: ' + (top || 'none in an uptrend') + '.', '');
    if (fairBad) leadOut.push('NO PRICES: the weekly fair test on the whole market (' + FAIR.to + ') REJECTED this version: it lost money on the newer data even at the lowest cost. Do not buy these. I keep following the picks on paper, so the live record keeps growing; the test re-runs every Sunday.');
    else if (!leadOk) leadOut.push('NO PRICES: on the past test this rule did not make money' + (LC.bt ? ' (' + (LC.bt.avg * 100).toFixed(2) + '% a trade, later half ' + (LC.bt.second * 100).toFixed(2) + '%)' : ' (too few trades to judge)') + ', so I will not suggest buying on it.');
    else if (!LC.marketOk) leadOut.push('NO NEW BUYS: the S&P 500 is under its 200 day average. Leaders fail most often in a falling market. Existing ones keep their stops.');
    else if (leadRows.length) { leadOut.push('NEW TO BUY (' + leadRows.length + ')'); for (const r of leadRows) leadOut.push(r.sym + ' closed ' + money(r.last) + ', up ' + Math.round(r.mom * 100) + '% in ' + Math.round(LEADCFG.LOOK / 21) + ' months\n  BUY ' + money(r.buyLo) + ' to ' + money(r.buyHi) + '. If it opens higher, skip it\n  STOP ' + money(r.stop) + ' (' + ((1 - r.stop / r.last) * 100).toFixed(1) + '% below). I raise it as the stock climbs\n  SELL when it closes under the stop or under its 50 day average (now ~' + money(r.e50) + '). No fixed target: let it run\n  ' + r.earn + (myPos[r.sym] ? '\n  you already hold this one' : '')); }
    else leadOut.push('NEW TO BUY: none tonight. All five places are taken by the stocks below.');
    const lastOf = (p) => loaded[p.sym] ? ', closed ' + money(loaded[p.sym].last) + ' (' + pc(loaded[p.sym].last / p.entry - 1) + ')' : ', no price tonight', held = LS.paper.filter(p => p.entry && !p.exitOn), sells = LS.paper.filter(p => p.exitOn);
    if (sells.length) leadOut.push('', 'SELL AT THE NEXT OPEN (' + sells.length + ')', ...sells.map(p => p.sym + ': ' + p.why + '. In at ' + money(p.entry) + lastOf(p)));
    if (held.length) leadOut.push('', 'STILL RIDING (' + held.length + ')', ...held.map(p => p.sym + ': in at ' + money(p.entry) + ' on ' + p.in + lastOf(p) + ', stop now ' + money(p.stop)));
    if (leadSkip.length) leadOut.push('', 'Strong but left out: ' + leadSkip.join(', ') + '.');
    leadOut.push('', 'Rule in use: ' + leadName(LEADCFG) + '.' + (LS0.rule && LC.rule !== LC.was ? ' CHANGED TONIGHT (it was ' + leadName(LEAD_VARIANTS.find(x => leadKey(x) === LC.was)) + '): the new one tested clearly better on the older years and still made money in the last two.' : '') + ' I re-test ' + LC.tried + ' versions every night; ' + LC.passed + ' pass tonight.', leadEvidence(LC.bt),
      FAIR && FAIR.verdict && FAIR.verdict !== 'NOT RUN' ? 'FAIR TEST (whole market, collapsed stocks included, ' + FAIR.from + ' to ' + FAIR.to + '): this version ' + fairState + '.' + (FAIR.live === LC.rule && FAIR.liveWhy ? ' ' + FAIR.liveWhy.replace(/^\w/, ch => ch.toUpperCase()) + '.' : '') : 'FAIR TEST: not run yet. Until it is, the past test above is flattered and the edge is NOT proven. Use small size or paper only.');
    const dn = LS.done.filter(p => typeof p.pct === 'number');
    leadOut.push('Paper record since this list started: ' + (dn.length ? dn.length + ' finished, ' + Math.round(dn.filter(p => p.pct > 0).length / dn.length * 100) + '% won, average ' + pc(dn.reduce((a, p) => a + p.pct, 0) / dn.length) + ' a trade after costs.' + leadLedger(dn) + (dn.some(p => typeof p.pctWorst === 'number') ? ' If every entry had been filled at the dearest price inside its buy range: average ' + pc(dn.filter(p => typeof p.pctWorst === 'number').reduce((a, p) => a + p.pctWorst, 0) / dn.filter(p => typeof p.pctWorst === 'number').length) + ' a trade.' : '') : 'no finished trade yet.') + (LS.missed ? ' Picks never entered: ' + LS.missed.above + ' opened above the buy range, ' + LS.missed.under + ' opened under the stop.' : ''), 'Costs in these figures: 0.4% a trade (your broker\u2019s 0.15% each way plus the spread). That holds for a position of about 2,000 USD or more; below it the 3 USD minimum fee each way takes a bigger share.', 'If you buy one, tell me: bought SYMBOL price. I will then trail its stop for you.');
    LS.session = session; LS.text = leadOut.join('\n'); LS.bt = LC.bt; LS.rule = LC.rule;
    fs.writeFileSync(LEAD_FILE, JSON.stringify(LS, null, 1));
  }
  // Circuit breaker: if the last five finished quick paper trades lost money overall, quick trades are paused.
  // Setups are still journaled as paper trades, so the record keeps running and the pause lifts by itself when it recovers.
  qFin.sort((a, b) => a.d < b.d ? -1 : 1);
  const lastFive = qFin.slice(-5), quickPaused = lastFive.length >= 5 && lastFive.reduce((a, x) => a + x.pct, 0) < 0;
  const tipRows = readTips().map(t => { const dd = loaded[t.sym], k = dd ? dd.candles.findIndex(x => x.d > t.d) : -1, ks = spy.findIndex(x => x.d > t.d);
    return k < 0 || ks < 0 ? { sym: t.sym, src: t.src, d: t.d, ret: null, spy: null, days: 0 } : { sym: t.sym, src: t.src, d: t.d, ret: dd.last / dd.candles[k].o - 1, spy: spy[spy.length - 1].c / spy[ks].o - 1, days: dd.candles.length - k }; });
  const bySrc = {}; for (const t of tipRows) if (t.ret !== null) { const g = bySrc[t.src] || (bySrc[t.src] = { src: t.src, n: 0, avg: 0, spy: 0, beat: 0, days: 0 }); g.n++; g.avg += t.ret; g.spy += t.spy; if (t.ret > t.spy) g.beat++; g.days = Math.max(g.days, t.days); }
  // Self-pruning: once a source has a real record (10+ tips, a month old) and its picks trail the S&P 500, it is muted.
  // Its mentions are still logged and scored, so it can earn its way back, but they no longer appear in the daily message.
  const srcStats = Object.values(bySrc).map(g => ({ ...g, avg: g.avg / g.n, spy: g.spy / g.n })).map(g => ({ ...g, judged: g.n >= 10 && g.days >= 20, muted: g.n >= 10 && g.days >= 20 && g.avg < g.spy, trusted: g.n >= 10 && g.days >= 20 && g.avg > g.spy && g.beat / g.n >= 0.5 }));
  const MUTED = new Set(srcStats.filter(g => g.muted).map(g => g.src)), TRUSTED = new Set(srcStats.filter(g => g.trusted).map(g => g.src));
  const tipBoardData = { sources: srcStats, tips: tipRows };
  savePos(myPos);
  const LESSONS = { updated: new Date(now).toISOString(), session, rules: {} };
  for (const [k, r] of Object.entries(live)) {
    const med = [...r.runUp].sort((a, b) => a - b)[Math.floor(r.runUp.length / 2)], avg = r.sum / r.n;
    LESSONS.rules[k] = { name: r.name, n: r.n, win: r.wins / r.n, avg, ends: r.ends, fill: r.fill || null, t1Rate: r.t1n ? r.t1 / r.t1n : null, medianRunUp: med, demoted: r.n >= 10 && avg < 0, last: r.last.slice(-5),
      wasDemoted: Boolean(PREV_LESSONS.rules && PREV_LESSONS.rules[k] && PREV_LESSONS.rules[k].demoted) };
  }
  fs.writeFileSync('data/lessons.json', JSON.stringify(LESSONS, null, 1));
  for (const r of [...quick.map(x => x.row), ...stocks.filter(s => s.state === 'Buy watch')]) { const ls = r.key && LESSONS.rules[r.key]; if (ls) { r.live = { n: ls.n, avg: ls.avg, win: ls.win }; if (ls.demoted) r.demoted = true; } }
  { const SECF = 'data/sectors.json', SC = readJson(SECF, {}); let asked = 0;
    for (const r of [...quick.slice(0, 10).map(x => x.row), ...stocks.filter(s => s.state === 'Buy watch'), ...leadRows]) {
      if (SC[r.sym] === undefined && env.FINNHUB_KEY && asked < 15) { asked++; try { const j = await (await fetch(FH + '/stock/profile2?symbol=' + encodeURIComponent(r.sym) + '&token=' + encodeURIComponent(env.FINNHUB_KEY))).json(); SC[r.sym] = (j && j.finnhubIndustry) || null; } catch (e) {} await sleep(FAST ? 0 : 1100); }
      r.sector = SC[r.sym] || null;
    }
    fs.writeFileSync(SECF, JSON.stringify(SC)); }
  const qn = qFin.length, qs = qFin.filter(x => x.spy !== null);
  const quickRecord = qn ? { n: qn, winRate: qFin.filter(x => x.pct > 0).length / qn, avgPct: qFin.reduce((a, x) => a + x.pct, 0) / qn, avgSpy: qs.length ? qs.reduce((a, x) => a + x.spy, 0) / qs.length : null } : null;

  const fin = results.length, wins = results.filter(r => r > 0).length;
  const outcomes = { updated: new Date(now).toISOString(), finished: fin, winRate: fin ? wins / fin : null, avgR: fin ? results.reduce((a, b) => a + b, 0) / fin : null,
    horizons: Object.fromEntries(Object.entries(horizons).map(([h, g]) => [h, { n: g.n, avgReturn: g.ret / g.n, avgBenchmark: g.bench / g.n }])) };
  fs.writeFileSync('data/outcomes.json', JSON.stringify(outcomes, null, 1));
  fs.writeFileSync('data/models.json', JSON.stringify(models, null, 1));
  { const n = await zoyaCheck([...quick.slice(0, 30).map(x => x.row.sym), ...stocks.filter(x => x.state === 'Buy watch').map(x => x.sym), ...Object.keys(myPos)]); if (env.ZOYA_KEY) console.log('Zoya halal checks:', n, zoyaLive() ? '(live)' : '(sandbox)'); }
  { const n = await halalExtCheck([...quick.slice(0, 30).map(x => x.row.sym), ...stocks.filter(x => x.state === 'Buy watch').map(x => x.sym)]); if (n) console.log('other halal checks:', n); }
  fs.writeFileSync('data/signals.json', JSON.stringify({ generatedAt: new Date(now).toISOString(), session, logicVersion: L.LOGIC_VERSION, market: { up: mktUp, ...(() => { let e = spy[0].c; const k = 2 / 51; for (const x of spy) e = x.c * k + e * (1 - k); const last = spy[spy.length - 1].c; return { above50: last > e, spyVs50: +(last / e - 1).toFixed(4) }; })() }, scanned: stocks.length, tested: Object.keys(loaded).length, errors, openTrades, quick: quickPaused ? [] : quick.slice(0, 30).map(x => x.row), quickPaused, quickRecord, posVerdict, leaders: leadRows, leadFair: { state: fairState, to: FAIR ? FAIR.to : null }, tipBoard: tipBoardData, uni, stocks }, null, 1));
  fs.writeFileSync('data/alert-state.json', JSON.stringify({ day: '', sent: {} }));

  const buys = stocks.filter(s => s.state === 'Buy watch'), near = stocks.filter(s => s.state !== 'Buy watch' && s.trigger && s.trigger / s.last < 1.03).sort((a, b) => a.trigger / a.last - b.trigger / b.last).slice(0, 8);
  const msg = ['Daily scan, ' + session + ' close', 'All prices below are from that close. They do not update. Live prices come in the market-hours alerts.', 'Market: ' + (mktUp ? 'uptrend' : 'downtrend') + (VR.known ? ', volatility ' + (VR.high ? 'HIGH (top fifth of the past year): suggested sizes are halved' : 'normal') : '') + '. Scanned ' + stocks.length + ' stocks' + (QEXTRA.length ? ', plus ' + QEXTRA.length + ' large companies for quick trades' : '') + (QWIDE.length ? ', plus ' + QWIDE.filter(x => loaded[x]).length + ' of the most traded strong companies (wider hunt, quick trades)' : '') + (WIDE.size ? ', plus ' + WIDE.size + ' more liquid companies from the whole market (all rules)' : '') + '.' + (errors.length ? ' ' + errors.length + ' failed to load.' : ''), '', 'ENTRY CONFIRMED (' + buys.length + ')'];
  for (const s of buys) msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ' closed ' + money(s.last) + '\n  buy range ' + money(s.buyLo) + ' to ' + money(s.buyHi) + ' at the next open\n  stop ' + money(s.stop) + (s.target ? ', target ' + money(s.target) + (s.hit !== null && s.hit !== undefined ? ' (reached in ' + Math.round(s.hit * 100) + '% of past trades)' : '') : ', no fixed target') + ', exit on a close below ~' + money(s.exitBelow) + (s.days ? '\n  typical holding time ' + s.days + ' trading days' : '') + '\n  ' + (s.earn || 'earnings date NOT CHECKED') + '\n  ' + L.HALAL_TEXT[s.halal] + '\n  ' + s.why);
  if (!buys.length) msg.push('None today.');
  else msg.push('Manual review only. Check earnings dates and halal status before acting.');
  if (quickPaused) msg.push('', 'QUICK TRADES PAUSED BY THE CIRCUIT BREAKER', 'The last five finished quick paper trades lost ' + Math.abs(lastFive.reduce((a, x) => a + x.pct, 0) * 100).toFixed(1) + '% in total, so no quick trade prices are given.' + (quick.length ? ' Setups still being followed on paper: ' + quick.map(x => x.row.sym).join(', ') + '.' : ''), 'The pause lifts by itself once the last five are positive again.');
  else if (quick.length) msg.push('', 'QUICK TRADES (' + Math.min(quick.length, 3) + (quick.length > 3 ? ' of ' + quick.length : '') + ')', ...quick.slice(0, 3).map(x => x.text));
  else msg.push('', 'QUICK TRADES', 'No setup at this close.');
  for (const x of Object.keys(myPos)) if (!myLines.some(l => l.startsWith(x + ':'))) myLines.push(posLine(x, myPos[x]) + '\n  no price data for this stock today, so it could not be checked');
  if (myLines.length) msg.splice(3, 0, '', 'YOUR POSITIONS (' + myLines.length + ')', ...myLines);
  if (crowd) {     // only names with tested support are shown; the rest are counted and dropped
    const good = [], dropped = [], old = readTips(), day = session;
    for (const x of crowd) {
      const st = stocks.find(k => k.sym === x.sym), q = quick.find(k => k.row.sym === x.sym), tag = x.sym + ' (' + x.mentions + ' mentions' + (x.was ? ', ' + (x.surge ? 'surging from ' : 'was ') + x.was + ' yesterday' : '') + ')';
      if (loaded[x.sym] && !old.some(o => o.sym === x.sym && o.src === 'Reddit crowd' && Date.parse(day) - Date.parse(o.d) < 7 * 86400000)) fs.appendFileSync(TIP_FILE, JSON.stringify({ sym: x.sym, src: 'Reddit crowd', d: day, p0: loaded[x.sym].last, below: null, ts: now }) + '\n');
      if (BIOBLOCK.has(x.sym) || blocked.some(b => b.startsWith(x.sym + ':') || b.startsWith(x.sym + ' '))) dropped.push(x.sym + ' (blocked)');
      else if (st && st.state === 'Buy watch') good.push(tag + ': ENTRY CONFIRMED by a tested rule. Its prices are in the CONCLUSION.');
      else if (q) good.push(tag + ': a tested quick trade setup fired. See QUICK TRADES.');
      else if (st && st.proven && st.trigger && st.trigger / st.last < 1.15) good.push(tag + ': BUY WATCH. Needs a daily close above ~' + money(st.trigger) + ', ' + ((st.trigger / st.last - 1) * 100).toFixed(1) + '% away.');
      else dropped.push(x.sym);
    }
    if (MUTED.has('Reddit crowd')) msg.push('', 'CROWD RADAR', 'Muted: over its record so far, Reddit\u2019s most-mentioned stocks have trailed the S&P 500. Still being scored; it returns if that changes.');
    else msg.push('', 'CROWD RADAR (Reddit\u2019s most-mentioned stocks, filtered by the tested rules)', ...(good.length ? good : ['None of the crowd\u2019s favourites has tested support today.']), 'Checked ' + crowd.length + ', dropped ' + dropped.length + ' with no tested support' + (dropped.length ? ': ' + dropped.join(', ') : '') + '. The crowd is scored like any source: send   sources');
  }
  if (chan.mentions.length) {
    const good = [], dropped = [], old = readTips();
    for (const x of chan.mentions) {
      const st = stocks.find(k => k.sym === x.sym), q = quick.find(k => k.row.sym === x.sym), src = 'YouTube: ' + x.name, tag = x.sym + ' (' + x.name + (TRUSTED.has(src) ? ', a source that has beaten the market so far' : '') + ': "' + x.title + '")';
      if (!loaded[x.sym]) continue;                                   // not a real ticker: ignore it
      if (!old.some(o => o.sym === x.sym && o.src === src && Date.parse(session) - Date.parse(o.d) < 7 * 86400000)) fs.appendFileSync(TIP_FILE, JSON.stringify({ sym: x.sym, src, d: session, p0: loaded[x.sym].last, below: null, ts: now }) + '\n');
      if (MUTED.has(src)) { if (!dropped.includes('(' + x.name + ' is muted: its record trails the market)')) dropped.push('(' + x.name + ' is muted: its record trails the market)'); }
      else if (BIOBLOCK.has(x.sym)) dropped.push(x.sym + ' (blocked)');
      else if (st && st.state === 'Buy watch') good.push(tag + ': ENTRY CONFIRMED by a tested rule. Its prices are in the CONCLUSION.');
      else if (q) good.push(tag + ': a tested quick trade setup fired. See QUICK TRADES.');
      else if (st && st.proven && st.trigger && st.trigger / st.last < 1.15) good.push(tag + ': BUY WATCH. Needs a daily close above ~' + money(st.trigger) + '.');
      else dropped.push(x.sym + ' (' + x.name + ')');
    }
    msg.push('', 'FOLLOWED CHANNELS (stocks named in the last 3 days, filtered by the tested rules)', ...(good.length ? good : ['No stock named by your channels has tested support today.']), dropped.length ? 'Named but no tested support: ' + dropped.join(', ') + '.' : '', 'Each channel is scored: send   sources');
  }
  if (blocked.length) msg.push('', 'BLOCKED, EVENT OR NEWS RISK (' + blocked.length + ')', ...blocked.slice(0, 8), 'No prices are given for blocked stocks.');
  if (exits.length) msg.push('', 'SELL / REASSESS WATCH (paper trades)', ...exits);
  if (near.length) { msg.push('', 'BUY WATCH, WAITING FOR CONFIRMATION'); near.forEach(s => msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ': needs a close above ~' + money(s.trigger) + ' (closed ' + money(s.last) + ')')); }
  if (picks.length) { picks.sort((a, b) => a.tier - b.tier); msg.push('', 'DISCOVERY PICKS WITH PRICES (' + picks.length + ')', ...picks.slice(0, 12).map(x => x.text)); if (picks.length > 12) msg.push('...and ' + (picks.length - 12) + ' more on the page.'); }
  if (weak.length) msg.push('', 'NO PLAN, POOR ODDS (' + weak.length + ')', 'The reward marker came before the stop in under 25% of past cases, so no prices are given: ' + weak.join(', ') + '.');
  if (quickRecord) msg.push('', 'Quick trade scoreboard: ' + quickRecord.n + ' finished, ' + Math.round(quickRecord.winRate * 100) + '% wins, average ' + (quickRecord.avgPct * 100).toFixed(2) + '% a trade' + (quickRecord.avgSpy !== null ? ' (S&P 500 ' + (quickRecord.avgSpy * 100).toFixed(2) + '% over the same days)' : '') + '.');
  if (fin) msg.push('', 'Paper record: ' + fin + ' finished, ' + Math.round(wins / fin * 100) + '% wins, average ' + outcomes.avgR.toFixed(2) + 'R.');
  if (FMOVERS.length) msg.push('', 'TODAY\'S FAST MOVERS, VERDICT', ...FMOVERS.map(x => x + ': ' + (quick.some(q => q.row.sym === x) ? 'a tested rule fired. See QUICK TRADES for its prices.' : !loaded[x] ? 'no price history available. No trade.' : loaded[x].candles.length < 600 ? 'too new to test (under three years of prices). No trade.' : 'no tested rule fired on it. No trade.')));
  msg.splice(1, 0, ...conclusion(readJson('data/signals.json', null), myPos), '', 'DETAILS');
  // Scan health: what was asked for, what came back, and which feeds were off. If a feed failed, say so rather than show an empty list.
  const fm = readJson('data/fm-state.json', {}), health = ['SCAN HEALTH', 'Prices: ' + LIST.length + ' requested, ' + (LIST.length - errors.length) + ' returned' + (errors.length ? ', ' + errors.length + ' failed (' + errors.slice(0, 8).join(', ') + (errors.length > 8 ? '\u2026' : '') + ')' : '') + '.',
    'Earnings check (Finnhub): ' + (env.FINNHUB_KEY ? 'on' : 'OFF, no key') + '. Live fast movers (FMP, run by the bot): ' + (fm.off ? 'OFF today: ' + fm.off : Object.keys(fm.sent || {}).length ? 'on, ' + Object.keys(fm.sent).length + ' alerted today' : fm.day ? 'on, none alerted today' : 'no report from the bot yet') + '.',
    'Crowd radar (ApeWisdom): ' + (env.NO_CROWD ? 'off' : crowd ? 'on, ' + crowd.length + ' names checked' : 'UNREACHABLE today') + '.',
    'Followed channels: ' + (chan.channels ? chan.ok + ' of ' + chan.channels + ' reachable, ' + chan.mentions.length + ' stocks named in the last 3 days' : 'none followed yet. Send the bot: follow NAME CHANNEL-ID') + '.',
    'Discovery list: ' + (DISCMETA && DISCMETA.session ? 'from the ' + DISCMETA.session + ' close, ' + DISC.size + ' candidates' : 'not received') + '. Journal: ' + journal.length + ' entries, ' + (sig0 => sig0 ? 'last scan ' + sig0.session : 'first scan')(readJson('data/signals.json', null)) + '.'];
  if (errors.length > LIST.length * 0.2) health.push('WARNING: more than a fifth of the prices failed to load. Treat this scan as incomplete.');
  msg.push('', ...health);
  fs.writeFileSync('data/scan-report.txt', msg.join('\n') + '\n\n' + leadOut.join('\n'));
  const healthBad = errors.length > LIST.length * 0.2;
  // ---- Weekly review: sent with the scan of each Friday close (or when WEEKLY is set)
  if (new Date(session + 'T12:00:00Z').getUTCDay() === 5 || env.WEEKLY) {
    const pc = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', si = spy.length - 1, SEC = { SPY: 'Index funds', QQQ: 'Index funds', IWM: 'Index funds', DIA: 'Index funds', AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology', AVGO: 'Technology', AMD: 'Technology', ORCL: 'Technology', CRM: 'Technology', AMZN: 'Consumer discretionary', TSLA: 'Consumer discretionary', HD: 'Consumer discretionary', GOOGL: 'Communication', META: 'Communication', NFLX: 'Communication', DIS: 'Communication', JPM: 'Financials', BAC: 'Financials', V: 'Financials', MA: 'Financials', UNH: 'Health care', LLY: 'Health care', JNJ: 'Health care', XOM: 'Energy', CVX: 'Energy', WMT: 'Consumer staples', COST: 'Consumer staples', PG: 'Consumer staples', KO: 'Consumer staples', PEP: 'Consumer staples' };
    const w = ['Weekly review, week ending ' + session, 'S&P 500 fund: ' + pc(spy[si].c / spy[si - 5].c - 1) + ' this week, market ' + (mktUp ? 'in an uptrend' : 'in a downtrend') + '.'];
    const bySec = {}; for (const x of wk) { const k = SEC[x.sym]; if (!k || k === 'Index funds') continue; const g = bySec[k] || (bySec[k] = { n: 0, chg: 0, up: 0 }); g.n++; g.chg += x.chg; g.up += x.up ? 1 : 0; }
    const secs = Object.entries(bySec).sort((a, b) => b[1].chg / b[1].n - a[1].chg / a[1].n);
    if (secs.length) w.push('', 'SECTORS, strongest first', ...secs.map(([k, g]) => k + ': ' + pc(g.chg / g.n) + ', ' + g.up + ' of ' + g.n + ' in uptrend'));
    const sorted = [...wk].sort((a, b) => b.chg - a.chg);
    if (sorted.length >= 6) w.push('', 'BIGGEST MOVES ON YOUR LIST', 'Up: ' + sorted.slice(0, 3).map(x => x.sym + ' ' + pc(x.chg)).join(', '), 'Down: ' + sorted.slice(-3).reverse().map(x => x.sym + ' ' + pc(x.chg)).join(', '));
    const better = wk.filter(x => x.up && !x.wasUp).map(x => x.sym), worse = wk.filter(x => !x.up && x.wasUp).map(x => x.sym);
    w.push('', 'TREND CHANGES', 'Moved into an uptrend: ' + (better.join(', ') || 'none'), 'Fell out of an uptrend: ' + (worse.join(', ') || 'none'));
    const weekStart = new Date(Date.parse(session) - 6 * 86400000).toISOString().slice(0, 10), newSig = [...journal, ...fresh].filter(x => x.d >= weekStart);
    w.push('', 'SIGNALS THIS WEEK', newSig.length ? newSig.length + ' logged. Quick trades: ' + newSig.filter(x => x.kind === 'quick').length + '. Confirmed entries: ' + newSig.filter(x => x.kind !== 'quick').length + '.' : 'None. A quiet week is a normal result.');
    const fams = Object.entries(famRes);
    if (fams.length) w.push('', 'WHAT IS WORKING, all finished paper trades', ...fams.map(([k, g]) => k + ': ' + g.n + ' finished, ' + Math.round(g.win / g.n * 100) + '% wins, average ' + pc(g.pct / g.n) + (g.week ? ' (' + g.week + ' ended this week)' : '')), (results.length + qFin.length) < 20 ? 'Fewer than 20 finished trades: too few to judge.' : '');
    else w.push('', 'WHAT IS WORKING', 'No paper trade has finished yet.');
    if (DISCMETA && DISCMETA.candidates) { const bl = DISCMETA.candidates.filter(c => c.bio && (c.bio.risk === 'high' || c.bio.risk === 'unknown')).length; w.push('', 'DISCOVERY', DISCMETA.candidates.length + ' candidates on the list' + (bl ? ', ' + bl + ' blocked for binary event risk' : '') + '.' + (DISCMETA.record ? ' Earlier picks after 4+ weeks: ' + pc(DISCMETA.record.avgReturn) + ' on average, S&P 500 ' + pc(DISCMETA.record.avgSpy) + ' (' + DISCMETA.record.n + ' stocks).' : ' Their results are counted after four weeks.')); }
    if (tipBoardData.sources.length) w.push('', 'TIP SOURCES', ...tipBoardData.sources.map(g => g.src + ': ' + g.n + ' tips, average ' + pc(g.avg) + ' against ' + pc(g.spy) + ' for the S&P 500' + (g.n < 10 || g.days < 20 ? ' (too early to judge)' : '')));
    w.push('', 'FOR NEXT WEEK', 'Check earnings dates and halal status on the page before acting on anything. Research only: nothing here is an order.');
    await telegram(w.filter(x => x !== '').join('\n').replace(/\n(SECTORS|BIGGEST|TREND|SIGNALS|WHAT|DISCOVERY|TIP SOURCES|FOR NEXT)/g, '\n\n$1') + '\n' + FOOT);
  }
  // ---- The last message of the night: one short plan. Everything above it is background.
  { const sg = readJson('data/signals.json', null);
    await telegram(planText(sg, loadPos(), null, 'PLAN FOR THE NEXT SESSION, from the ' + session + ' close. Market opens 4:30 pm Kuwait (5:30 pm from November).')
      + (healthBad ? '\n\nWARNING: over a fifth of the prices failed to load tonight. Treat this plan as incomplete.' : '')
      + '\n\n' + myRecord() + '\nNightly report: send  report   Your record: send  record' + '\n' + FOOT);
    // every Friday close: a HOLD OR SELL study of every stock you own, sent without being asked
    const mine = Object.keys(loadPos());
    if (mine.length && (new Date(session + 'T12:00:00Z').getUTCDay() === 5 || env.REVIEW_ALL)) {
      const parts = []; for (const x of mine.slice(0, 10)) { try { parts.push(await reviewReply(x, sg, loadPos())); } catch (e) {} }
      if (parts.length) await telegram('WEEKLY REVIEW OF YOUR STOCKS (automatic, every Friday close)\n\n' + parts.join('\n\n') + '\n' + FOOT); } }
  console.log('daily scan done:', stocks.length, 'stocks,', buys.length, 'buy watch,', fresh.length, 'journal entries');
}

async function intraday(onlyMine) {
  const now = Date.now();
  const sig = readJson('data/signals.json', null);
  await tgCommands(sig);
  if (env.BOT_ONLY) return;   // fast reply loop: answer messages only; the full checks run every few minutes
  await preMarket(sig);
  if (onlyMine) { await fastMovers(); await watchdog(sig); }
  if (onlyMine && (!Object.keys(loadPos()).length || new Date(now).getUTCMinutes() % 15 >= 5)) return;   // chat mode: your positions only, about every 15 minutes
  if (!marketOpen(now) && !env.FORCE) { console.log('Market closed. Nothing to do.'); return; }
  if (!sig) { console.log('No daily scan yet.'); return; }
  const myPos = loadPos();
  const st = readJson('data/alert-state.json', { day: '', sent: {} }), day = ny(now).d; if (st.day !== day) { st.day = day; st.sent = {}; }
  const buys = sig.stocks.filter(s => s.state === 'Buy watch'), trig = sig.stocks.filter(s => s.state !== 'Buy watch' && s.trigger && s.trigger / s.last < 1.03);
  const qk = sig.quick || [], planBuys = planCands(sig, myPos).filter(x => x.ok);
  const buyNowCards = [];
  const watch = onlyMine ? Object.keys(myPos).slice(0, 12) : [...new Set([...Object.keys(myPos), ...planBuys.map(s => s.sym), ...qk.map(s => s.sym), ...(sig.leaders || []).map(s => s.sym), ...buys.map(s => s.sym), ...(sig.openTrades || []).map(t => t.sym), ...trig.map(s => s.sym)])].slice(0, 40), alerts = [];
  const seen = {};
  for (const sym of watch) {
    const j = await liveQ((sym)), p = +j.price; if (!(p > 0)) continue; seen[sym] = p;
    const say = (k, text) => { if (!st.sent[sym + k]) { st.sent[sym + k] = 1; alerts.push(sym + ' at ' + money(p) + ': ' + text); } };
    const b = buys.find(s => s.sym === sym), t = trig.find(s => s.sym === sym), qs0 = qk.find(s => s.sym === sym), mp = myPos[sym];
    if (mp) {   // you told the bot you bought this one
      const chg = ' You bought at ' + money(mp.entry) + ' (' + (p >= mp.entry ? '+' : '') + ((p / mp.entry - 1) * 100).toFixed(1) + '%).';
      if (mp.stop && p <= mp.stop) say('myst', 'YOUR POSITION: STOP LOSS REACHED (' + money(mp.stop) + '). Sell / reassess now.' + chg);
      else if (mp.t2 && p >= mp.t2) say('myt2', 'YOUR POSITION: TARGET 2 REACHED (' + money(mp.t2) + ').' + chg);
      else if (mp.t1 && p >= mp.t1) say('myt1', 'YOUR POSITION: TARGET 1 REACHED (' + money(mp.t1) + '). Review, or take the profit.' + chg);
    }
    const pb = mp ? null : planBuys.find(x => x.sym === sym);
    if (pb && p >= pb.lo && p <= pb.hi && !st.sent[sym + 'buynow']) { st.sent[sym + 'buynow'] = 1; buyNowCards.push(planText(sig, myPos, { [sym]: p }, sym + ' is inside its buy range now', [sym])); }
    const qs = mp || (pb && st.sent[sym + 'buynow']) ? null : qs0;
    if (qs) {   // a quick trade setup from last night's close
      if (p > qs.buyHi) say('qhi', 'QUICK TRADE: above its entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + '). The dip is gone. Skip it.');
      else if (p <= qs.stop) say('qlo', 'QUICK TRADE: already at its invalidation level ' + money(qs.stop) + '. The setup has failed.');
      else if (p < qs.buyLo) say('qlow', 'QUICK TRADE: below its planned entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + ') and above the invalidation level ' + money(qs.stop) + '. The dip is still running. A lower entry than planned, but no bounce yet. Manual review only.');
      else say('qin', 'QUICK TRADE: trading inside its entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + '). Invalidation ' + money(qs.stop) + (qs.t1 ? ', target 1 ' + money(qs.t1) : '') + '. Manual review only.');
    }
    const ld = mp ? null : (sig.leaders || []).find(s => s.sym === sym);
    if (ld) {   // a leader picked at last night's close
      if (p <= ld.stop) say('lst', 'LEADER: already at its stop ' + money(ld.stop) + '. Skip it.');
      else if (p > ld.buyHi) say('lhi', 'LEADER: above its buy range (' + money(ld.buyLo) + ' to ' + money(ld.buyHi) + '). Do not chase. It is a buy again only if it comes back into the range.');
      else say('lin', 'LEADER: in its buy range now (' + money(ld.buyLo) + ' to ' + money(ld.buyHi) + '). Stop ' + money(ld.stop) + '. Sell when it closes under its trailing stop or its 50 day average. If you buy, tell me: bought ' + sym + ' ' + money(p));
    }
    if (b && p > b.buyHi) say('hi', 'above its buy range (' + money(b.buyLo) + ' to ' + money(b.buyHi) + '). Too late for this signal.');
    if (b && p <= b.stop) say('lo', 'already down to its stop level ' + money(b.stop) + '. The signal has failed.');
    if (t && p >= t.trigger) say('tr', 'BUY WATCH forming. It is above its trigger ~' + money(t.trigger) + '. It only counts if it closes above it today.');
    for (const o of (sig.openTrades || []).filter(x => x.sym === sym)) {
      if (p <= o.stop) say('st' + o.since, 'SELL / REASSESS WATCH. Paper trade from ' + o.since + ' is at its stop ' + money(o.stop) + '.');
      if (o.t1 && p >= o.t1) say('t1' + o.since, 'QUICK TRADE: paper trade from ' + o.since + ' reached Target 1 at ' + money(o.t1) + '. Review, or take part of the profit.');
      if (o.target && p >= o.target) say('tg' + o.since, 'paper trade from ' + o.since + ' reached its target ' + money(o.target) + '.');
    }
  }
  // ONE MARKET-OPEN CHECK a day, so you always know the system is running and where each holding stands, even when no alert fires.
  let openMsg = null;
  if (!onlyMine && !st.sent.__open && Object.keys(seen).length) {
    st.sent.__open = 1;
    const kt = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' });
    const posL = Object.entries(myPos).filter(([k]) => seen[k]).map(([k, P]) => { const p = seen[k], g = p / P.entry - 1;
      return k + ' ' + money(p) + ' (' + (g >= 0 ? '+' : '') + (g * 100).toFixed(1) + '% from your ' + money(P.entry) + ')' + (P.stop ? ' | stop ' + money(P.stop) + ' (' + ((P.stop / p - 1) * 100).toFixed(1) + '%)' : ' | NO STOP SET') + (P.t1 ? ' | target ' + money(P.t1) + ' (+' + ((P.t1 / p - 1) * 100).toFixed(1) + '%)' : '') + ': HOLD'; });
    const buyL = planBuys.filter(x => seen[x.sym] && !myPos[x.sym]).map(x => { const p = seen[x.sym]; return x.sym + ' ' + money(p) + ' | buy range ' + money(x.lo) + ' to ' + money(x.hi) + ': ' + (p > x.hi ? 'ABOVE the range, do not chase' : p < x.lo ? 'below the range, wait' : 'INSIDE the range'); });
    openMsg = ['MARKET OPEN CHECK (' + kt + ' Kuwait). The system is running.', '', 'YOUR POSITIONS', ...(posL.length ? posL : ['none recorded']), '', 'PROVEN BUYS TODAY', ...(buyL.length ? buyL : ['none. Nothing passed the test last night. I will message you the moment one does.']), '', 'I check every 30 minutes and message you only when something happens: a stop, a target, a sell rule, or a proven buy inside its range.'].join('\n');
  }
  fs.writeFileSync('data/alert-state.json', JSON.stringify(st));
  if (openMsg) await telegram(openMsg + '\n' + FOOT);
  alerts.sort((a, b) => (b.includes('YOUR POSITION') ? 1 : 0) - (a.includes('YOUR POSITION') ? 1 : 0));
  if (buyNowCards.length) await telegram('BUY NOW: a proven setup is inside its buy range (' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' }) + ' Kuwait)\n\n' + buyNowCards.join('\n\n') + '\n' + FOOT);
  if (alerts.length) await telegram('Market hours check\n\n' + alerts.join('\n\n') + '\n' + FOOT);
  console.log('intraday check done:', watch.length, 'watched,', alerts.length, 'new alerts');
}

await (MODE === 'chat' ? intraday(true) : MODE === 'intraday' ? intraday() : daily());
