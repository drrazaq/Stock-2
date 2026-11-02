import {telegramFetch as sharedTelegramFetch,splitTelegramText} from './telegram-delivery.mjs';
const telegramFetch=(u,o)=>sharedTelegramFetch(u,o,{research:true});
import {readJsonSource,providerSymbol,strictNumber,parseSourceTime,latestCompletedSession,closeLagSessions,adjustmentBasis,nextSession,isDay as isDayShared} from './source-contract.mjs';
// Review B2-1 (Codex, 2 Nov): an impossible day is a malformed row, never a crash, whichever shared-helper version is in use.
const isDay = (d) => { try { return isDayShared(d); } catch { return false; } };
// SMART MONEY AND ANALYSTS. Once each market morning (Kuwait ~2:20 pm):
//   1. INSIDER BUYING (Finnhub, free): company executives buying their own stock on the open market in the last 14 days:
//      two or more buyers of 10,000 USD+ each (50,000 USD+ together), or 250,000 USD+ in total.
//   2. ANALYSTS TURNING POSITIVE (Finnhub recommendation trends, free): more analysts at Buy/Strong Buy than last month.
//   3. ANALYST UPGRADES (FMP, if the plan allows it): today's upgrades from named firms.
// Every name found is (a) added to the nightly scan, so a tested entry can turn it into a BUY with range and stop, and
// (b) logged as a tip of its source, so the bot scores "Insider buying", "Analyst upgrades" against the S&P 500 over time.
// On Sundays (or STUDY=1) it also TESTS insider buying on years of history: buy the next open after a cluster of insider
// purchases, hold 20 sessions, after costs, against the S&P 500 over the same days, older half vs newer half.
// Read-only. Never an order. Not a halal ruling.
import fs from 'node:fs';
import zlib from 'node:zlib';
const QUIET = (() => { try { return JSON.parse(fs.readFileSync('data/settings.json', 'utf8')).quiet !== false; } catch (e) { return true; } })();   // quiet mode (default): research messages are kept in the files, not sent

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const FMP = local(env.FMP_BASE) || 'https://financialmodelingprep.com';
const MV = local(env.MASSIVE_BASE) ? [local(env.MASSIVE_BASE)] : ['https://api.massive.com', 'https://api.polygon.io'];
const FAST = Boolean(local(env.FH_BASE));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const money = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (+x).toFixed(2);
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const big = (x) => x >= 1e6 ? (x / 1e6).toFixed(1) + 'M USD' : Math.round(x / 1e3) + 'K USD';
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
fs.mkdirSync('data', { recursive: true });
if (!env.FINNHUB_KEY) { console.log('smart money: FINNHUB_KEY missing'); process.exit(0); }
const STUDY = Boolean(env.STUDY) || new Date().getUTCDay() === 0;

let fhLast = 0;
async function fh(path) {                       // free plan: 60 calls a minute
  for (let a = 0; a < 3; a++) {
    const wait = 1050 - (Date.now() - fhLast); if (wait > 0 && !FAST) await sleep(wait); fhLast = Date.now();
    try { const r = await fetch(FH + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(env.FINNHUB_KEY));
      if (r.status === 429) { await sleep(FAST ? 5 : 30000); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(FAST ? 5 : 2000); }
  }
  return null;
}
// Live ingress (MARKET-03 batch 2, 2 Nov 2026): every Finnhub answer keeps its outcome, so a failed call is never read as
// "no insider buying" or "no analyst change". Same pacing and 429 retries as fh(); bounded body and a hard deadline.
async function fhLive(path) {
  let last = { status: 'NOT_FETCHED' };
  for (let a = 0; a < 3; a++) {
    const wait = 1050 - (Date.now() - fhLast); if (wait > 0 && !FAST) await sleep(wait); fhLast = Date.now();
    last = await readJsonSource(fetch, FH + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(env.FINNHUB_KEY), { timeoutMs: 15000 });
    if (last.status === 'RATE_LIMITED') { await sleep(FAST ? 5 : 30000); continue; }
    if (last.status === 'NETWORK_ERROR' || last.status === 'TIMEOUT') { await sleep(FAST ? 5 : 2000); continue; }
    return last; }
  return last;
}
let mvHost = 0;
async function mv(path) {
  if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(MV[mvHost] + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY));
      if (r.status === 429) { await sleep(FAST ? 5 : 5000); continue; } if (!r.ok) return null; return await r.json(); }
    catch (e) { if (mvHost + 1 < MV.length) mvHost++; else await sleep(FAST ? 5 : 1500); }
  }
  return null;
}

// ---- universe: liquid companies (price 5 USD+, 10M USD+ a day), strongest-traded first, plus your holdings and candidates
const co = read('data/companies.json', null), CS = co && co.syms && co.syms.length > 3000 ? new Set(co.syms) : null;
const last = new Map();
// Prices: the newest completed session on the exchange calendar (holidays skipped), at most 5 sessions back. The day used, its
// lag and the adjustment basis are recorded; a malformed bar is dropped, never a NaN price.
const priceStatus = { status: 'NOT_FETCHED', day: null, lagSessions: null, basis: adjustmentBasis({ provider: 'MASSIVE', adjusted: true }), triedDays: [], rejectedBars: 0 };
{ const nowMs = Date.now(); let d = latestCompletedSession(nowMs);
  for (let k = 0; k < 5 && d && !last.size; k++) { priceStatus.triedDays.push(d);
    const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true');
    if (j && typeof j === 'object' && !Array.isArray(j) && j.status !== 'ERROR' && Array.isArray(j.results)) for (const r of j.results) { const c = strictNumber(r && r.c, { min: 1e-9 }), v = strictNumber(r && r.v, { min: 0 });
      if (!r || !/^[A-Z]{1,5}$/.test(r.T) || c.status !== 'OK' || v.status !== 'OK') { priceStatus.rejectedBars++; continue; } last.set(r.T, { ...r, c: c.value, v: v.value }); }
    if (last.size) { priceStatus.day = d; break; }
    let p = d; for (let i = 0; i < 10; i++) { p = new Date(Date.parse(p + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10); if (nextSession(p, { inclusive: true }) === p) break; } d = p; }
  priceStatus.lagSessions = priceStatus.day ? closeLagSessions(priceStatus.day, nowMs) : null;
  priceStatus.status = !env.MASSIVE_KEY ? 'NOT_FETCHED' : !priceStatus.day ? 'UNAVAILABLE' : priceStatus.lagSessions > 1 ? 'STALE' : 'OBSERVED'; }
const liquid = [...last.values()].filter(r => r.c >= 5 && r.c * r.v >= 1e7 && (!CS || CS.has(r.T))).sort((a, b) => b.c * b.v - a.c * a.v).map(r => r.T);
const extra = [...Object.keys(read('data/my-positions.json', {})), ...((read('data/discovery.json', {}).candidates || []).map(c => c.sym)), ...((read('data/radar-universe.json', {}).syms || []).map(x => x.sym))];
const MAXN = +(env.SM_MAX || 450);
const UNI = [...new Set([...extra, ...liquid])].filter(s => /^[A-Z]{1,5}$/.test(s)).slice(0, MAXN);
const px = (s) => last.get(s) ? last.get(s).c : null;
console.log('smart money universe:', UNI.length, 'stocks');

// ---- 1 + 2: insider buying and analyst trends
const today = iso(Date.now()), since14 = iso(Date.now() - 14 * 86400000), insiders = [], analysts = [], snap = [];
const counts = () => ({ calls: 0, observed: 0, empty: 0, failed: 0, identityMismatch: 0, malformedRows: 0, duplicateRows: 0, failures: {} });
const insS = counts(), recS = { ...counts(), notConsecutive: 0, unordered: 0, futureRows: 0, missingCountRows: 0 };
// Review B2-3/B2-4 (Codex, 2 Nov): a recommendation row counts only if its period is a real day in a month that has started (no future
// observation can create a current turn) and all five counts are finite whole numbers >= 0. Missing and invalid counts are
// kept apart from zero and from each other.
const REC_FIELDS = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'], monthStart = today.slice(0, 7) + '-01';
const recRow = (x) => { if (!x || typeof x !== 'object' || !isDay(String(x.period || ''))) return { bad: 'MALFORMED' }; if (x.period > monthStart) return { bad: 'FUTURE' };
  const v = {}; for (const f of REC_FIELDS) { const n = strictNumber(x[f], { min: 0 }); if (n.status === 'MISSING') return { bad: 'MISSING_COUNT' }; if (n.status !== 'OK' || !Number.isInteger(n.value)) return { bad: 'MALFORMED' }; v[f] = n.value; }
  return { row: { ...x, ...v } }; };
const fail = (S, st) => { S.failed++; S.failures[st] = (S.failures[st] || 0) + 1; };
const person = (n) => String(n).trim().replace(/\s+/g, ' ').toUpperCase();          // one person, however the name is spaced or cased
const monthBefore = (p) => { const [y, m] = p.split('-').map(Number), t = new Date(Date.UTC(y, m - 2, 1)); return t.toISOString().slice(0, 7); };
for (const sym of UNI) {
  insS.calls++; const insR = await fhLive('/stock/insider-transactions?symbol=' + sym + '&from=' + since14), ins = insR.status === 'OK' ? insR.body : null;
  let buys = [];
  if (insR.status !== 'OK') fail(insS, insR.status);
  else if (!ins || typeof ins !== 'object' || Array.isArray(ins) || !Array.isArray(ins.data)) fail(insS, 'MALFORMED');
  else if (ins.symbol !== undefined && providerSymbol(ins.symbol, { provider: 'FINNHUB', requested: sym }).status !== 'OK') insS.identityMismatch++;
  else { if (ins.data.length) insS.observed++; else insS.empty++; const seen = new Set();
    for (const t of ins.data) { if (!t || typeof t !== 'object') { insS.malformedRows++; continue; }
      if (t.transactionCode !== 'P') continue;
      const ch = strictNumber(t.change), pr = strictNumber(t.transactionPrice), d = String(t.transactionDate || t.filingDate || '');
      if (ch.status !== 'OK' || pr.status !== 'OK' || typeof t.name !== 'string' || !t.name.trim() || !isDay(d) || d > today) { insS.malformedRows++; continue; }
      if (!(ch.value > 0 && pr.value > 0) || d < since14) continue;
      const key = [person(t.name), d, ch.value, pr.value].join('|'); if (seen.has(key)) { insS.duplicateRows++; continue; } seen.add(key);   // a repeated (amended) row counts once
      buys.push({ ...t, name: t.name.trim(), change: ch.value, transactionPrice: pr.value, who: person(t.name), d }); } }
  // count a buyer only if they put in 10,000 USD or more (small employee-plan purchases are not a signal)
  const per = {}; for (const b of buys) per[b.who] = (per[b.who] || 0) + b.change * b.transactionPrice;
  const real = buys.filter(b => per[b.who] >= 10000);
  if (real.length) { const who = new Set(real.map(b => b.who)), usd = real.reduce((a, b) => a + b.change * b.transactionPrice, 0);
    if ((who.size >= 2 && usd >= 50000) || usd >= 250000) insiders.push({ sym, n: who.size, usd, names: [...new Set(real.map(b => b.name))].slice(0, 3), last: real.map(b => b.d).sort().pop() }); }
  // analysts: real rating changes only (not new analysts starting coverage), stocks 5 USD+
  recS.calls++; const recR = await fhLive('/stock/recommendation?symbol=' + sym); let rec = null;
  if (recR.status !== 'OK') fail(recS, recR.status);
  else if (!Array.isArray(recR.body)) fail(recS, 'MALFORMED');
  else { const rows = []; for (const x of recR.body) { const v = recRow(x); if (v.row) rows.push(v.row); else if (v.bad === 'FUTURE') recS.futureRows++; else if (v.bad === 'MISSING_COUNT') recS.missingCountRows++; else recS.malformedRows++; }
    if (rows.some(x => x.symbol !== undefined && providerSymbol(x.symbol, { provider: 'FINNHUB', requested: sym }).status !== 'OK')) recS.identityMismatch++;
    else { const sorted = [...rows].sort((p, q) => q.period < p.period ? -1 : q.period > p.period ? 1 : 0); if (sorted.some((x, i) => x !== rows[i])) recS.unordered++;
      rec = sorted; if (rec.length) recS.observed++; else recS.empty++; } }
  if (Array.isArray(rec) && rec.length) { const a = rec[0]; snap.push({ s: sym, p: a.period, sb: a.strongBuy || 0, b: a.buy || 0, h: a.hold || 0, se: a.sell || 0, ss: a.strongSell || 0 }); }
  if (Array.isArray(rec) && rec.length >= 2 && monthBefore(rec[0].period) !== rec[1].period.slice(0, 7)) recS.notConsecutive++;
  else if (Array.isArray(rec) && rec.length >= 2) { const [a, b] = rec, pos = (x) => (x.strongBuy || 0) + (x.buy || 0), tot = (x) => pos(x) + (x.hold || 0) + (x.sell || 0) + (x.strongSell || 0);
    if ((px(sym) || 0) >= 5 && tot(a) >= 5 && tot(b) >= 5 && tot(a) - tot(b) <= 2 && pos(a) - pos(b) >= 2 && pos(a) / tot(a) >= 0.6) analysts.push({ sym, now: pos(a), was: pos(b), of: tot(a), period: a.period }); }
}
insiders.sort((p, q) => q.usd - p.usd); analysts.sort((p, q) => (q.now - q.was) - (p.now - p.was));
// POINT-IN-TIME ANALYST ARCHIVE (forward only): today's analyst counts for every stock, saved with the capture time, so analyst
// revisions can be tested honestly in a few months (past values cannot be rebuilt: providers show only today's numbers).
if (snap.length) { const F = 'data/analyst-archive-' + today.slice(0, 7) + '.jsonl.gz';   // one file a month keeps each daily save small
  let old = ''; try { old = zlib.gunzipSync(fs.readFileSync(F)).toString(); } catch (e) {}
  if (!old.includes('"at":"' + today)) fs.writeFileSync(F, zlib.gzipSync(old + JSON.stringify({ at: today, capturedAt: new Date().toISOString(), source: 'finnhub recommendation', rows: snap }) + '\n')); }

// ---- 3: FMP upgrades (only if the FMP plan allows this endpoint; otherwise skipped quietly)
let upgrades = [], fmpNote = '';
const fmpS = { status: 'NOT_FETCHED', received: 0, malformedRows: 0, futureRows: 0, classRows: 0 };
if (env.FMP_KEY) {
  const res = await readJsonSource(fetch, FMP + '/stable/grades-latest-news?page=0&limit=100&apikey=' + encodeURIComponent(env.FMP_KEY), { timeoutMs: 15000 });
  if (res.status !== 'OK') { fmpS.status = res.status; fmpNote = res.status === 'REFUSED' ? 'FMP upgrades not available on this plan (HTTP ' + res.httpStatus + ').' : 'FMP upgrades unreachable (' + res.status + ').'; }
  else if (!Array.isArray(res.body)) { fmpS.status = 'MALFORMED'; fmpNote = 'FMP upgrades answer was malformed.'; }
  else { const arr = res.body; fmpS.received = arr.length; const from3 = iso(Date.now() - 3 * 86400000), sel = [];
    for (const x of arr) { if (!x || typeof x !== 'object') { fmpS.malformedRows++; continue; }
      const id = providerSymbol(x.symbol, { provider: 'FMP' }), d = String(x.publishedDate || '').slice(0, 10);
      if (id.status !== 'OK' || !isDay(d)) { fmpS.malformedRows++; continue; } if (!/^[A-Z]{1,5}$/.test(id.symbol)) { fmpS.classRows++; continue; }
      if (d > today) { fmpS.futureRows++; continue; }
      if (/upgrade/i.test(x.action || x.newsTitle || '') && d >= from3) sel.push({ sym: id.symbol, firm: x.gradingCompany || x.newsPublisher || '', to: x.newGrade || '', from: x.previousGrade || '', d }); }
    upgrades = sel.filter((u, i) => sel.findIndex(v => v.sym === u.sym) === i && px(u.sym));
    fmpS.status = fmpS.malformedRows ? 'PARTIAL' : arr.length ? 'OBSERVED' : 'EMPTY'; }
}
const live = (S) => S.calls === 0 ? 'NOT_FETCHED' : S.failed + S.identityMismatch === S.calls ? 'UNAVAILABLE' : S.failed || S.identityMismatch || S.malformedRows || S.futureRows || S.missingCountRows ? 'PARTIAL' : S.observed ? 'OBSERVED' : 'EMPTY';
const sourceStatus = { GROUPED_PRICES: priceStatus, FINNHUB_INSIDER: { status: live(insS), ...insS }, FINNHUB_RECOMMENDATION: { status: live(recS), ...recS }, FMP_UPGRADES: fmpS };

// ---- hand the names to the nightly scan, and log each as a tip of its source (scored against the S&P 500)
const picks = [...new Set([...insiders.slice(0, 15).map(x => x.sym), ...analysts.slice(0, 10).map(x => x.sym), ...upgrades.slice(0, 10).map(x => x.sym)])];
fs.writeFileSync('data/smart-money.json', JSON.stringify({ generatedAt: new Date().toISOString(), insiders, analysts, upgrades, picks, sourceStatus, priceDay: priceStatus.day,
  contract: 'smart-money ingress v2 (2 Nov 2026): failed calls are counted, not read as no activity; the price day, its lag and basis are recorded; tips are not logged on a stale or missing price day' }, null, 1));
{ const TIPS = 'data/tips.jsonl', old = fs.existsSync(TIPS) ? fs.readFileSync(TIPS, 'utf8') : '', lines = [];
  const add = (sym, src) => { const p0 = priceStatus.status === 'OBSERVED' ? px(sym) : null; if (!p0 || old.includes('"sym":"' + sym + '","src":"' + src + '","d":"' + today)) return; lines.push(JSON.stringify({ sym, src, d: today, p0, below: null, ts: Date.now() })); };
  insiders.slice(0, 15).forEach(x => add(x.sym, 'Insider buying')); analysts.slice(0, 10).forEach(x => add(x.sym, 'Analysts turning positive')); upgrades.slice(0, 10).forEach(x => add(x.sym, 'Analyst upgrades'));
  if (lines.length) fs.appendFileSync(TIPS, lines.join('\n') + '\n'); }

// ---- 4: Sunday study: does buying after insider buying make money? (years of history, whole universe above)
let study = read('data/smart-money-study.json', null);
if (STUDY && env.MASSIVE_KEY) {
  const from5 = iso(Date.now() - (365 * 5 + 30) * 86400000), spyJ = await mv('/v2/aggs/ticker/SPY/range/1/day/' + from5 + '/' + today + '?adjusted=true&sort=asc&limit=50000');
  const spy = new Map(((spyJ && spyJ.results) || []).map(x => [iso(x.t), x.c])), trades = [], strict = [];
  // STRICT CLUSTER (fixed in advance, from the outside reviews): 3+ different insiders buying 10K USD+ each on the open market
  // (code P) within 14 days, together 100K USD+, at a company whose LAST REPORTED quarter (before the filing) had positive EPS.
  const EH = (() => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync('data/earnings-cache.json.gz')).toString()).syms || {}; } catch (e) { return {}; } })();
  const profitableAt = (sym, d) => { const L = (EH[sym] || []).filter(r => r.d < d && isFinite(r.a)); return L.length ? L[L.length - 1].a > 0 : null; };
  const spyUp = new Map(); { const a = ((spyJ && spyJ.results) || []).map(x => [iso(x.t), x.c]); let sum = 0; a.forEach(([d, c], i) => { sum += c; if (i >= 50) sum -= a[i - 50][1]; if (i >= 49) spyUp.set(d, c > sum / 50); }); }   // S&P 500 above its 50 day average = a rising market
  for (const sym of UNI.slice(0, +(env.SM_STUDY_MAX || 400))) {
    const ins = await fh('/stock/insider-transactions?symbol=' + sym + '&from=' + from5); const ev = ((ins && ins.data) || []).filter(t => t.transactionCode === 'P' && t.change > 0 && t.transactionPrice > 0);
    if (!ev.length) continue;
    const pj = await mv('/v2/aggs/ticker/' + sym + '/range/1/day/' + from5 + '/' + today + '?adjusted=true&sort=asc&limit=50000'); const c = ((pj && pj.results) || []).map(x => ({ d: iso(x.t), o: x.o, c: x.c })); if (c.length < 60) continue;
    // a "cluster": 2+ different insiders, or 250K USD+, within 14 days; the signal day is the FILING date (when the public knew)
    const byDay = ev.map(t => ({ d: String(t.filingDate || t.transactionDate).slice(0, 10), who: t.name, usd: t.change * t.transactionPrice })).sort((a, b) => a.d < b.d ? -1 : 1);
    let nextFree = '', nextStrict = '';
    for (let i = 0; i < byDay.length; i++) { const d0 = byDay[i].d; if (d0 <= nextFree) continue;
      const win0 = byDay.filter(x => x.d <= d0 && x.d >= iso(Date.parse(d0) - 14 * 86400000)), pw = {}; for (const x of win0) pw[x.who] = (pw[x.who] || 0) + x.usd;
      const win = win0.filter(x => pw[x.who] >= 10000), who = new Set(win.map(x => x.who)), usd = win.reduce((a, x) => a + x.usd, 0);
      if (d0 > nextStrict && who.size >= 3 && usd >= 100000 && profitableAt(sym, d0) === true) { const k2 = c.findIndex(x => x.d > d0); if (k2 >= 0 && k2 + 20 < c.length) { const s0 = spy.get(c[k2].d), s1 = spy.get(c[k2 + 20].d);
        strict.push({ sym, d: c[k2].d, r: c[k2 + 20].c / c[k2].o - 1 - 0.008, spy: s0 && s1 ? s1 / s0 - 1 : null, up: spyUp.get(c[k2].d) === true }); nextStrict = c[k2 + 20].d; } }
      if (!((who.size >= 2 && usd >= 50000) || usd >= 250000)) continue;
      const k = c.findIndex(x => x.d > d0); if (k < 0 || k + 20 >= c.length) continue;
      const entry = c[k].o, exit = c[k + 20].c, s0 = spy.get(c[k].d), s1 = spy.get(c[k + 20].d);
      trades.push({ sym, d: c[k].d, r: exit / entry - 1 - 0.008, spy: s0 && s1 ? s1 / s0 - 1 : null, up: spyUp.get(c[k].d) === true }); nextFree = c[k + 20].d; }
  }
  trades.sort((a, b) => a.d < b.d ? -1 : 1);
  const half = Math.floor(trades.length / 2), st = (a) => { if (!a.length) return { n: 0 }; const avg = a.reduce((x, t) => x + t.r, 0) / a.length, sp = a.filter(t => t.spy !== null);
    return { n: a.length, win: a.filter(t => t.r > 0).length / a.length, avg, spy: sp.length ? sp.reduce((x, t) => x + t.spy, 0) / sp.length : null }; };
  const older = st(trades.slice(0, half)), newer = st(trades.slice(half)), why = [];
  if (older.n < 30 || newer.n < 30) why.push('too few cases (' + older.n + ' older, ' + newer.n + ' newer; 30 each needed)');
  else { if (!(older.avg > 0)) why.push('lost money in the older half'); if (!(newer.avg > 0)) why.push('lost money in the newer half');
    if (newer.spy !== null && !(newer.avg > newer.spy)) why.push('no better than the S&P 500 over the same days'); }
  const ol = trades.slice(0, half), nw = trades.slice(half), rising = { older: st(ol.filter(t => t.up)), newer: st(nw.filter(t => t.up)) }, falling = { older: st(ol.filter(t => !t.up)), newer: st(nw.filter(t => !t.up)) };
  strict.sort((a, b) => a.d < b.d ? -1 : 1); const sh = Math.floor(strict.length / 2), so = st(strict.slice(0, sh)), sn = st(strict.slice(sh)), sw = [];
  if (so.n < 30 || sn.n < 30) sw.push('too few cases (' + so.n + ' older, ' + sn.n + ' newer; 30 each needed)');
  else { if (!(so.avg > 0)) sw.push('lost money in the older half'); if (!(sn.avg > 0)) sw.push('lost money in the newer half'); if (sn.spy !== null && !(sn.avg > sn.spy)) sw.push('no better than the S&P 500'); if (!(sn.avg > newer.avg)) sw.push('no better than the ordinary insider rule'); }
  const strictRes = { older: so, newer: sn, verdict: sw.length ? 'NOT PROVEN' : 'PROMISING', why: sw.join('; ') || 'beat costs, the S&P 500 and the ordinary rule in both halves. Paper only until its live record passes.' };
  study = { at: today, older, newer, rising, falling, strict: strictRes, verdict: why.length ? 'NOT PROVEN' : 'PROMISING', why: why.join('; ') || 'beat costs and the S&P 500 in both halves. Paper only until its live record also passes.' };
  fs.writeFileSync('data/smart-money-study.json', JSON.stringify(study, null, 1));
}

// ---- message
const line = (s) => !s || !s.n ? 'no cases' : s.n + ' cases, ' + Math.round(s.win * 100) + '% up, average ' + pc(s.avg) + ' after 0.8% costs' + (s.spy !== null ? ' (S&P 500 ' + pc(s.spy) + ' over the same days)' : '');
const msg = ['SMART MONEY AND ANALYSTS, ' + today, 'Checked ' + UNI.length + ' liquid companies.', ''];
msg.push('INSIDER BUYING (executives buying their own shares, last 14 days)');
if (insiders.length) for (const x of insiders.slice(0, 10)) msg.push(x.sym + ' ' + money(px(x.sym)) + ' | ' + x.n + ' insider' + (x.n > 1 ? 's' : '') + ' bought ' + big(x.usd) + ' | latest ' + x.last + ' | ' + x.names.join(', ').slice(0, 60));
else msg.push('None found.');
msg.push('', 'ANALYSTS TURNING POSITIVE (more Buy ratings than last month)');
if (analysts.length) for (const x of analysts.slice(0, 8)) msg.push(x.sym + ' ' + money(px(x.sym)) + ' | Buy ratings ' + x.was + ' -> ' + x.now + ' of ' + x.of);
else msg.push('None found.');
if (env.FMP_KEY && !fmpNote) { msg.push('', 'ANALYST UPGRADES (last 3 days)'); if (upgrades.length) for (const x of upgrades.slice(0, 8)) msg.push(x.sym + ' ' + money(px(x.sym)) + ' | ' + x.firm + (x.from || x.to ? ': ' + (x.from || '?') + ' -> ' + (x.to || '?') : '')); else msg.push('None found.'); }
msg.push('', 'WHAT HAPPENS NEXT: all of these are added to tonight’s scan. If one also has a tested entry, it appears in the PLAN as a BUY with range and stop. Each source is scored against the S&P 500 (send: sources).');
if (study && study.strict) msg.push('', 'STRICT CLUSTER TEST (3+ insiders, 100K USD+, profitable company): older ' + line(study.strict.older) + ' | newer ' + line(study.strict.newer) + ' -> ' + study.strict.verdict + ': ' + study.strict.why);
if (study) msg.push('', 'HISTORY TEST (' + study.at + '): buying the next open after insider buying, holding 20 sessions', '  older half: ' + line(study.older), '  newer half: ' + line(study.newer), '  ' + study.verdict + ': ' + study.why, ...(study.rising ? ['  rising markets only (S&P 500 above its 50 day average): older ' + line(study.rising.older) + ' | newer ' + line(study.rising.newer), '  falling markets: older ' + line(study.falling.older) + ' | newer ' + line(study.falling.newer)] : []));
msg.push('', 'Insiders sell for many reasons; buying with their own money is the rarer, stronger signal. Not an order, not a halal ruling: check ZAD.');
const text = msg.join('\n');
if (env.TG_TOKEN && env.TG_CHAT && !QUIET) for (const part of splitTelegramText(text,3800)) await telegramFetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: part, disable_web_page_preview: true }) }).catch(() => {});
console.log(text);
