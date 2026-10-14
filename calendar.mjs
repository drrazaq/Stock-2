// ECONOMIC CALENDAR: what is coming this week and how the market reacted to it in the past. Read-only; never places an order.
// MODE=fetch (weekdays before the nightly scan, and Sunday morning):
//   - US economic releases from the TipRanks economic calendar (your TIPRANKS_KEY, its official MCP API): CPI, core CPI, PPI,
//     retail sales, jobs, the Fed, GDP, PCE... with time, forecast, previous and (once out) actual.
//   - market holidays and half days, and the ex-dividend dates of the stocks you hold (Massive, your MASSIVE_KEY).
//   TipRanks forbids republishing its data and the repository is public, so everything is saved ENCRYPTED in data/calendar.enc
//   (with your PRIVATE_KEY, like your shares and budget). Only a status line (which source worked, how many events) is public.
// MODE=study (Sunday, after the 5-year prices are loaded): for every past release with an actual and a forecast, the S&P 500's
//   move that session and the next 5, by surprise (hotter / cooler than forecast), compared with all other days, older and newer
//   half. A kind of release becomes a DECISION in ACTIONS only if it passes the usual fair-test rules; otherwise "no tested effect".
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
const env = process.env, MODE = env.MODE === 'study' ? 'study' : 'fetch', local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const MCP = (local(env.TR_BASE) || 'https://mcp.tipranks.com') + '/mcp/?apikey=' + encodeURIComponent(env.TIPRANKS_KEY || ''), PX = local(env.PX_BASE) || 'https://api.massive.com';
const FILE = 'data/calendar.enc', STATUS = 'data/calendar-status.json', iso = (ms) => new Date(ms).toISOString().slice(0, 10), sleep = (ms) => new Promise(r => setTimeout(r, local(env.TR_BASE) ? 0 : ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
fs.mkdirSync('data', { recursive: true });
const key = () => env.PRIVATE_KEY ? crypto.createHash('sha256').update(String(env.PRIVATE_KEY)).digest() : null;
export function calRead(f = FILE) { const k = key(); if (!k || !fs.existsSync(f)) return null; try { const b = Buffer.from(fs.readFileSync(f, 'utf8'), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(b.subarray(28)), d.final()])).toString()); } catch (e) { return null; } }
function calWrite(o) { const k = key(); if (!k) return false; const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv), enc = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(o))), c.final()]); fs.writeFileSync(FILE, Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')); return true; }

// ---- which releases matter (fixed in advance) and which direction counts as "hotter" (good for rates going up, usually bad for stocks)
export const KINDS = [
  ['CPI', /\b(cpi|consumer price)/i], ['CORE_CPI', /core (cpi|consumer price|inflation)/i], ['PPI', /\b(ppi|producer price)/i], ['PCE', /\bpce\b|personal consumption expenditure/i],
  ['RETAIL', /retail sales/i], ['JOBS', /non[- ]?farm|payrolls|employment situation|unemployment rate/i], ['CLAIMS', /jobless claims|initial claims/i],
  ['FED', /fomc|fed(eral)? (funds|interest) rate|interest rate decision|fed rate/i], ['GDP', /\bgdp\b|gross domestic/i], ['ISM', /\bism\b|pmi/i], ['SENTIMENT', /consumer (sentiment|confidence)/i]];
export const kindOf = (name) => { const n = String(name || ''); if (KINDS[1][1].test(n)) return 'CORE_CPI'; for (const [k, re] of KINDS) if (re.test(n)) return k; return null; };
// every event, small or big, is studied under its own name: 'CPI YoY (Sep)' and 'CPI YoY (Oct)' are the same event 'cpi yoy'
export const nameKey = (name) => String(name || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/g, ' ').replace(/\bq[1-4]\b/g, ' ').replace(/\b(final|prel|preliminary|flash|adv|advance|second estimate|third estimate|2nd|3rd)\b/g, ' ').replace(/[^a-z0-9%\- ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const num = (v) => { if (v === null || v === undefined || v === '') return null; const x = parseFloat(String(v).replace(/[,%KMB\s]/gi, '')); return isFinite(x) ? x : null; };

if (MODE === 'fetch') {
  const status = { at: new Date().toISOString(), tipranks: 'not tried', massive: 'not tried' }, old = calRead() || {}, out = { updated: status.at, econ: [], hist: old.hist || [], holidays: old.holidays || [], div: {} };
  if (!key()) { status.tipranks = 'no PRIVATE_KEY: nothing can be saved privately'; fs.writeFileSync(STATUS, JSON.stringify(status, null, 1)); console.log(status.tipranks); process.exit(0); }
  // ---- 1. TipRanks economic calendar
  if (env.TIPRANKS_KEY) try {
    let session = null, id = 0;
    const rpc = async (method, params, notify) => { const h = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }; if (session) h['Mcp-Session-Id'] = session;
      const r = await fetch(MCP, { method: 'POST', headers: h, body: JSON.stringify(notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params }) }); if (r.headers.get('mcp-session-id')) session = r.headers.get('mcp-session-id'); if (notify) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status); const t = await r.text(); let m = null;
      if ((r.headers.get('content-type') || '').includes('event-stream')) { for (const l of t.split('\n')) if (l.startsWith('data:')) { try { const j = JSON.parse(l.slice(5).trim()); if (j.id === id) m = j; } catch { } } } else { try { m = JSON.parse(t); } catch { } }
      if (!m) throw new Error('unreadable reply'); if (m.error) throw new Error(m.error.message); return m.result; };
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stock-signal-board-calendar', version: '1.0' } }); await rpc('notifications/initialized', {}, true);
    const tools = (await rpc('tools/list', {})).tools || [], tool = tools.find(t => /economic.*calendar|calendar.*economic/i.test(t.name));
    if (!tool) throw new Error('no economic calendar tool among ' + tools.length + ' TipRanks tools');
    const props = (tool.inputSchema && tool.inputSchema.properties) || {}, req = (tool.inputSchema && tool.inputSchema.required) || [];
    status.toolArgs = Object.keys(props);   // argument NAMES only (no data), so the run can be checked
    status.toolSchema = Object.fromEntries(Object.entries(props).map(([k, p]) => [k, { type: p.type || (p.items ? 'array of ' + (p.items.type || '?') : '?'), enum: p.enum ? p.enum.slice(0, 12) : p.items && p.items.enum ? p.items.enum.slice(0, 12) : undefined, desc: String(p.description || '').slice(0, 140), required: req.includes(k) }]));   // the input format only, no data
    const dayN = (d) => Math.round((Date.parse(d) - Date.parse(iso(Date.now()))) / 864e5);
    const usVal = (p) => { const en = p.enum || (p.items && p.items.enum); const pick = en ? (en.find(e => /^(us|usa|united states|united-states|usd)$/i.test(String(e))) || en.find(e => /united states|^us/i.test(String(e)))) : 'US'; return (p.type === 'array' || p.items) ? [pick] : pick; };
    const argsFor = (from, to) => { const a = {};
      if (props.daysBack || props.daysForward) { if (props.daysBack) a.daysBack = Math.max(0, -dayN(from)); if (props.daysForward) a.daysForward = Math.max(0, dayN(to)); }
      else { if (props.fromDate) a.fromDate = from; if (props.toDate) a.toDate = to; }
      if (props.daysBack && dayN(to) < 0) { delete a.daysBack; delete a.daysForward; if (props.fromDate) a.fromDate = from; if (props.toDate) a.toDate = to; }   // a past window (history backfill): exact dates
      if (props.countries) a.countries = usVal(props.countries); if (props.limit) a.limit = props.limit.maximum || 500;
      for (const [k, p] of Object.entries(props)) { if (k in a || !req.includes(k)) continue;
        if (/from|start|begin/i.test(k)) a[k] = from; else if (/(^to|until|end)/i.test(k)) a[k] = to; else if (/country|region|market/i.test(k)) a[k] = usVal(p);
        else a[k] = p.default !== undefined ? p.default : p.enum ? p.enum[0] : p.type === 'number' || p.type === 'integer' ? 100 : p.type === 'boolean' ? false : ''; }
      status.lastArgs = a; return a; };
    const rowsOf = (data, acc = []) => { if (Array.isArray(data)) data.forEach(x => rowsOf(x, acc)); else if (data && typeof data === 'object') { const ks = Object.keys(data);
        const nk = ks.find(k => /^(event|eventName|name|title|indicator|eventTitle|description)$/i.test(k)), dk = ks.find(k => /^(date|dateTime|datetime|time|releaseDate|eventDate|timestamp|eventTime|dateUtc|releaseTime)$/i.test(k));
        if (nk && dk && typeof data[nk] === 'string') acc.push(data); else for (const v of Object.values(data)) if (v && typeof v === 'object') rowsOf(v, acc); } return acc; };
    const pickK = (o, re) => { const k = Object.keys(o).find(x => re.test(x)); return k ? o[k] : null; };
    const norm = (o) => { const name = String(pickK(o, /^(event|eventName|name|title|indicator|eventTitle|description)$/i)), when = pickK(o, /^(date|dateTime|datetime|time|releaseDate|eventDate|timestamp|eventTime|dateUtc|releaseTime)$/i), country = String(pickK(o, /country|region|currency/i) || 'US');
      const t = typeof when === 'number' ? new Date(when > 1e12 ? when : when * 1000).toISOString() : String(when || '');
      return { t: t.slice(0, 19), name: name.slice(0, 80), key: nameKey(name), kind: kindOf(name), country: country.slice(0, 20), imp: String(pickK(o, /impact|importance|volatility|priority/i) || '').slice(0, 10),
        fc: num(pickK(o, /forecast|consensus|estimate|expected/i)), prev: num(pickK(o, /^prev|previous|prior/i)), act: num(pickK(o, /^actual$|^act$|^value$/i)), unit: String(pickK(o, /unit/i) || (/%/.test(String(pickK(o, /forecast|consensus|estimate|expected|^actual$|^prev|previous/i) || '')) ? '%' : '')).slice(0, 6) }; };
    const isUS = (e) => /^(us|usa|united states|usd)$/i.test(e.country) || /^us/i.test(e.country);
    const call = async (from, to) => { const res = await rpc('tools/call', { name: tool.name, arguments: argsFor(from, to) }); if (res.isError) throw new Error('tool error');
      let d = res.structuredContent, raw = ''; if (!d) { const tx = (res.content || []).find(c => c.type === 'text'); raw = tx ? String(tx.text) : ''; try { d = JSON.parse(raw); } catch { d = null; } }
      const rows = rowsOf(d), us = rows.map(norm).filter(e => e.t && isUS(e));
      // the reply's SHAPE only (key names, counts, country values), never the data itself, so a mismatch can be fixed after one run
      const keysOf = (o, dep = 0) => !o || typeof o !== 'object' || dep > 2 ? typeof o : Array.isArray(o) ? ['list of ' + o.length, o.length ? keysOf(o[0], dep + 1) : null] : Object.fromEntries(Object.entries(o).slice(0, 25).map(([k, v]) => [k, v && typeof v === 'object' ? keysOf(v, dep + 1) : typeof v]));
      status.replyShape = d ? keysOf(d) : (raw ? 'text, not JSON: ' + raw.length + ' characters' : 'empty'); status.rowsFound = rows.length; status.countriesSeen = [...new Set(rows.map(norm).map(e => e.country))].slice(0, 15);
      return us; };
    const now = Date.now(), week = await call(iso(now - 3 * 864e5), iso(now + 10 * 864e5));
    out.econ = week; status.tipranks = 'ok: ' + week.length + ' US events read (all sizes), ' + week.filter(e => e.kind).length + ' major';
    // history for the study: keep EVERY past US release with an actual and a forecast or a previous value (grows every week);
    // a one-time backfill of up to 5 years (the price history), 2 to 8 months a run depending on the TipRanks calls left this month
    const seen = new Set(out.hist.map(e => e.t + e.name)), add = (L) => { for (const e of L) if (e.act !== null && (e.fc !== null || e.prev !== null) && e.t < new Date().toISOString() && !seen.has(e.t + e.name)) { seen.add(e.t + e.name); out.hist.push(e); } };
    add(week);
    let left = null; { const u = tools.find(t => /usage/i.test(t.name)); if (u) try { const r = await rpc('tools/call', { name: u.name, arguments: {} }); const tx = r.structuredContent ? JSON.stringify(r.structuredContent) : ((r.content || [])[0] || {}).text || ''; const m = tx.match(/remain[a-z_]*"?\s*[:=]\s*(\d+)/i); if (m) left = +m[1]; } catch (e) { } }
    status.tipranksCallsLeft = left; const perRun = left === null ? 2 : left > 400 ? 8 : left > 150 ? 4 : left > 60 ? 2 : 0;   // never use the calls the daily radar needs
    const back = old.backTo || iso(now - 10 * 864e5); let bt = back;
    for (let k = 0; k < perRun && bt > iso(now - 1830 * 864e5); k++) { const to = bt, from = iso(Date.parse(bt) - 31 * 864e5); try { add(await call(from, to)); bt = from; await sleep(800); } catch (e) { break; } }
    out.backTo = bt; out.hist.sort((a, b) => a.t < b.t ? -1 : 1); status.history = out.hist.length + ' past releases (all sizes) with an actual, back to ' + (out.hist[0] ? out.hist[0].t.slice(0, 10) : 'n/a');
  } catch (e) { status.tipranks = 'failed: ' + String(e.message || e).slice(0, 120); out.econ = old.econ || []; }
  // ---- 2. Massive: market holidays, and ex-dividend dates of the stocks you hold
  if (env.MASSIVE_KEY) try {
    const get = async (p) => { const r = await fetch(PX + p + (p.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY)); return r.ok ? r.json() : null; };
    const h = await get('/v1/marketstatus/upcoming'); if (Array.isArray(h)) out.holidays = h.filter(x => /nyse|nasdaq/i.test(x.exchange || '')).map(x => ({ d: x.date, name: x.name, status: x.status, open: x.open || null, close: x.close || null })).filter((x, i, a) => a.findIndex(y => y.d === x.d) === i).slice(0, 12);
    const held = Object.keys(readJson('data/my-positions.json', {})).filter(s => /^[A-Z.]{1,6}$/.test(s)).slice(0, 30);
    for (const s of held) { const j = await get('/v3/reference/dividends?ticker=' + encodeURIComponent(s) + '&ex_dividend_date.gte=' + iso(Date.now() - 864e5) + '&limit=3&order=asc&sort=ex_dividend_date'); const r = j && j.results; if (r && r.length) out.div[s] = r.map(x => ({ ex: x.ex_dividend_date, pay: x.pay_date, amt: x.cash_amount })); await sleep(150); }
    status.massive = 'ok: ' + out.holidays.length + ' holidays, dividends for ' + Object.keys(out.div).length + ' of ' + held.length + ' held stocks';
  } catch (e) { status.massive = 'failed: ' + String(e.message || e).slice(0, 120); }
  out.study = old.study || null;
  calWrite(out); status.econUpcoming = out.econ.filter(e => e.t >= new Date().toISOString().slice(0, 10)).length;
  fs.writeFileSync(STATUS, JSON.stringify(status, null, 1)); console.log('calendar: ' + JSON.stringify(status));
  process.exit(0);
}


// ======================= MODE=study: EVERY release, small or big, on its own and in families =======================
// For each event (its own name: 'redbook yoy', '17-week bill auction', 'nfib business optimism index', 'cpi yoy'...) and each
// family (INFLATION, GROWTH, FED), split by surprise: above / below the forecast, or above / below the previous value when there is
// no forecast (auctions, Redbook). For each: the S&P 500 that day and over 5 sessions, and EVERY industry vs the market over 5
// sessions. Thousands of tests are run, so the pass bar rises with their number: it is set so that fewer than 0.5 false passes are
// expected in the whole study (each half must be clear on its own, same direction, 0.5%+ per half, 10+ events per half).
const C = calRead(); if (!C || !C.hist || !C.hist.length) { console.log('calendar study: no release history yet'); process.exit(0); }
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('calendar study: no price cache'); process.exit(0); }
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, PC = new Float32Array(NS * T).fill(NaN), DV = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; PC[k] = x.c[j]; DV[k] = x.c[j] * x.v[j]; } });
const sicMap = store.sic || {}, IND3 = new Array(NS).fill(null), indName = {}; for (const [s, i] of SY) if (sicMap[s] && sicMap[s].c) { const g = String(sicMap[s].c).slice(0, 3); IND3[i] = g; if (!indName[g] && sicMap[s].n) indName[g] = String(sicMap[s].n).slice(0, 40); }
store = null;
const spyI = SY.has('SPY') ? SY.get('SPY') : -1, spyC = (t) => spyI < 0 || t < 0 || t >= T ? NaN : PC[spyI * T + t];
const nyHM = (t) => { const d = new Date(t + (t.length <= 19 ? 'Z' : '')); if (isNaN(d)) return null; const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d), g = (k) => p.find(x => x.type === k).value; return { d: g('year') + '-' + g('month') + '-' + g('day'), hm: g('hour') + ':' + g('minute') }; };
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const tst = (a) => { if (a.length < 3) return 0; const m = avg(a), sd = Math.sqrt(a.reduce((u, v) => u + (v - m) ** 2, 0) / (a.length - 1)); return sd > 0 ? m / (sd / Math.sqrt(a.length)) : 0; };
const GROUP = { CPI: 'INFLATION', CORE_CPI: 'INFLATION', PPI: 'INFLATION', PCE: 'INFLATION', RETAIL: 'GROWTH', JOBS: 'GROWTH', GDP: 'GROWTH', ISM: 'GROWTH', SENTIMENT: 'GROWTH', FED: 'FED' };
const LOWER_IS_STRONGER = /claims|unemployment|jobless/i;   // for these a higher number means a weaker economy
// 1. events -> one case per key (event name or family) per day, with its surprise direction
const cases = {}, label = {};
for (const e of C.hist) { const w = nyHM(e.t); if (!w) continue; const t = tOf.get(w.d); if (t === undefined) continue; const pre = w.hm < '09:30';
  const base = e.fc !== null && e.fc !== undefined ? e.fc : e.prev; if (base === null || base === undefined || e.act === null) continue;
  const s = Math.sign((e.act - base) * (LOWER_IS_STRONGER.test(e.name) ? -1 : 1)); if (!s) continue;
  const a = pre ? t - 1 : t, b = (pre ? t : t + 1) + 4; if (a < 0 || b >= T) continue;
  const k0 = e.key || nameKey(e.name); label[k0] = label[k0] || { name: e.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(), basis: e.fc !== null && e.fc !== undefined ? 'forecast' : 'previous' };
  for (const k of [k0, GROUP[e.kind]].filter(Boolean)) { const id = k + '|' + t, x = cases[id] || (cases[id] = { k, t, a, b, a1: a, b1: pre ? t : t + 1, sum: 0, core: null }); x.sum += s; if (e.kind === 'CORE_CPI' && k === 'INFLATION') x.core = s; } }
for (const g of ['INFLATION', 'GROWTH', 'FED']) label[g] = { name: g === 'INFLATION' ? 'inflation releases (CPI, core CPI, PPI, PCE)' : g === 'GROWTH' ? 'economy releases (retail sales, jobs, GDP, ISM, sentiment)' : 'Fed decisions', basis: 'forecast', family: true };
// 2. industry excess return between two sessions (cached: many events share days)
const exCache = new Map();
function indExcess(a, b) { const id = a + '|' + b; if (exCache.has(id)) return exCache.get(id); const sums = {}, ns = {}; let ms = 0, mn = 0;
  for (let i = 0; i < NS; i++) { const p = PC[i * T + a], q = PC[i * T + b]; if (!(p >= 5) || !(q > 0) || !(DV[i * T + a] >= 2e6)) continue; const r = Math.max(-0.5, Math.min(0.5, q / p - 1)); ms += r; mn++; const g = IND3[i]; if (!g) continue; sums[g] = (sums[g] || 0) + r; ns[g] = (ns[g] || 0) + 1; }
  const o = {}; if (mn) { const m = ms / mn; for (const g of Object.keys(sums)) if (ns[g] >= 5) o[g] = sums[g] / ns[g] - m; } exCache.set(id, o); return o; }
// 3. all tests first (to count them), then the pass bar
const byKey = {}; for (const x of Object.values(cases)) { const sg = Math.sign(x.core !== null ? x.core : x.sum); if (!sg) continue; (byKey[x.k + (sg > 0 ? '_HOT' : '_COOL')] = byKey[x.k + (sg > 0 ? '_HOT' : '_COOL')] || []).push(x); }
const cand = [], mkt = {}; let nTests = 0;
for (const [ks, L0] of Object.entries(byKey)) { const L = L0.sort((p, q) => p.t - q.t); if (L.length < 20) continue; const half = Math.floor(L.length / 2);
  const r1 = L.map(x => spyC(x.b1) / spyC(x.a1) - 1), r5 = L.map(x => spyC(x.b) / spyC(x.a) - 1), ok = (v) => isFinite(v);
  const mo = r1.slice(0, half).filter(ok), mn = r1.slice(half).filter(ok); nTests++;
  mkt[ks] = { events: L.length, older: { n: mo.length, r1: avg(mo), t: tst(mo), r5: avg(r5.slice(0, half).filter(ok)) }, newer: { n: mn.length, r1: avg(mn), t: tst(mn), r5: avg(r5.slice(half).filter(ok)) } };
  const per = {}; L.forEach((x, i) => { const ex = indExcess(x.a, x.b); for (const [g, v] of Object.entries(ex)) (per[g] || (per[g] = [])).push({ i, v }); });
  for (const [g, P] of Object.entries(per)) { const o = P.filter(z => z.i < half).map(z => z.v), n = P.filter(z => z.i >= half).map(z => z.v); if (o.length < 10 || n.length < 10) continue; nTests++;
    cand.push({ ks, g, name: indName[g] || 'industry ' + g, older: { n: o.length, ex: avg(o), t: tst(o) }, newer: { n: n.length, ex: avg(n), t: tst(n) } }); } }
// pass bar: expected false passes in the whole study <= 0.5  ->  per half one-sided tail q = sqrt(0.25 / tests)
const q = Math.sqrt(0.25 / Math.max(1, nTests)), zOf = (p) => { let lo = 0, hi = 10; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2, tail = 0.5 * erfc(m / Math.SQRT2); if (tail > p) lo = m; else hi = m; } return (lo + hi) / 2; };
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
const tCrit = Math.max(2, zOf(q)), passes = (o, n, minAbs) => Math.sign(o.x) === Math.sign(n.x) && Math.abs(o.t) >= tCrit && Math.abs(n.t) >= tCrit && Math.abs(o.x) >= minAbs && Math.abs(n.x) >= minAbs;
const market = {}, industry = {};
for (const [ks, m] of Object.entries(mkt)) { market[ks] = { ...m, verdict: m.older.n >= 10 && m.newer.n >= 10 && passes({ x: m.older.r1, t: m.older.t }, { x: m.newer.r1, t: m.newer.t }, 0.003) ? (m.newer.r1 > 0 ? 'UP' : 'DOWN') + ' in both halves' : 'no steady effect' };
  industry[ks] = { events: m.events, up: [], down: [] }; }
for (const c of cand) if (passes({ x: c.older.ex, t: c.older.t }, { x: c.newer.ex, t: c.newer.t }, 0.005)) (c.newer.ex > 0 ? industry[c.ks].up : industry[c.ks].down).push(c);
for (const v of Object.values(industry)) { v.up.sort((p, q2) => q2.newer.ex - p.newer.ex); v.down.sort((p, q2) => p.newer.ex - q2.newer.ex); v.up = v.up.slice(0, 12); v.down = v.down.slice(0, 12); }
for (const k of Object.keys(industry)) if (!industry[k].up.length && !industry[k].down.length && !/both halves/.test(market[k].verdict)) delete industry[k];   // keep the file small: only keys with a finding
const found = Object.values(industry).reduce((a, v) => a + v.up.length + v.down.length, 0), mFound = Object.values(market).filter(m => /both halves/.test(m.verdict)).length;
C.study = { at: new Date().toISOString(), releases: C.hist.length, kinds: Object.keys(byKey).length, studied: Object.keys(mkt).length, labels: label, bySurprise: market, industry, industryTests: nTests, tCrit: +tCrit.toFixed(2), luck: 0.5 };
calWrite(C);
fs.writeFileSync(STATUS, JSON.stringify({ ...readJson(STATUS, {}), study: { at: C.study.at, releases: C.hist.length, eventKinds: Object.keys(label).length, keysWithEnoughCases: Object.keys(mkt).length, tests: nTests, passBar: +tCrit.toFixed(2), marketEffects: mFound, industryEffects: found } }, null, 1));
console.log('calendar study: ' + C.hist.length + ' releases, ' + Object.keys(mkt).length + ' event kinds with 20+ cases, ' + nTests + ' tests, pass bar t ' + tCrit.toFixed(2) + ' (fewer than 0.5 false passes expected) | market effects: ' + mFound + ' | industry effects: ' + found + (found ? ' (' + Object.entries(industry).filter(([, v]) => v.up.length || v.down.length).slice(0, 8).map(([k, v]) => k + ' ' + v.up.length + '+/' + v.down.length + '-').join(', ') + ')' : ''));
