// IGNITION WATCHER: runs during the US session (about 9:20 to 15:00 New York, a long GitHub Actions job). Every minute it checks
// the Massive snapshot universe (about 6,000+ US stocks) for stocks that START to run (rules in ignition-core.mjs, plus the
// live-only quiet build-up rule IG8). COVERAGE IS MEASURED, NOT ASSUMED: every minute's heartbeat records the coverage mode, how
// many stocks were received, how many had a live price, and how old the prices were.
// Every ignition is logged on PAPER and scored the next morning on minute bars (strict fills, normal and 1.5x costs).
// ALERT only when ALL hold: the rule passed its history test (IG1-IG7; IG8 has no fair history test), its own live paper record is
// strong enough, the price is live (3 minutes or newer), the SEC check WORKED and found no share sale, registration, delisting
// notice or late report in 30 days (a failed check blocks the alert), the stock is not marked NOT HALAL, at most 6 a day.
// VISIBILITY LEDGER: every stock is followed from the first minute it is seen (not only after +10%), so the audit can say whether
// a runner was visible while it was still +1%, +3% or +5%, and when it first had a live price.
// Data: Massive full-market snapshot (volume, previous close; Starter plan = 15 minutes late). When late, live PRICES come from
// Alpaca snapshots (IEX, free) for the whole snapshot universe; thin stocks may have no recent IEX trade (never alerted; the audit
// says so). Volume stays the late Massive figure (can only undercount). Last fallback: Alpaca's top-50 gainers (PARTIAL coverage).
// Read-only; never places an order.
import { snapshots, feedUsed } from './alpaca-feed.mjs';
import { sendAlert } from './opp-mode.mjs';
import { scoreEarlyWaveCandidate, updateEarlyWaveCandidate } from './early-wave-discovery.mjs';
import { stopHits } from './stop-watch.mjs';
import { createEarlyAlerts, alertLevel, classifyCatalyst } from './early-alerts.mjs';
import { createShadow, spreadPct } from './shadow-stream.mjs';
import { parseAtom, nyMinuteOf } from './edgar-feed.mjs';
import { dEligible, hash, FROZEN as RANK } from './rank-models.mjs';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { IG_RULES, LIVE_RULES, passes, fmtM, nyOffset, toBars, IG_VERSION } from './ignition-core.mjs';
import { isFreshPriceAge } from './ignition-gates.mjs';
import { paperRecordApproved, earlyPaperEligible } from './paper-gates.mjs';
import { sessionCoverage } from './session-coverage.mjs';
import { sendTelegramMessage } from './telegram-delivery.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const MV = local(env.MASSIVE_BASE) || 'https://api.massive.com', ALPD = local(env.ALPACA_DATA) || 'https://data.alpaca.markets', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const SEC_WWW = local(env.SEC_BASE) || 'https://www.sec.gov', SEC_DATA = local(env.SEC_BASE) || 'https://data.sec.gov', SEC_UA = env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com';
const FAST = Boolean(local(env.MASSIVE_BASE)), sleep = (ms) => new Promise(r => setTimeout(r, FAST ? 0 : ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const pc = (x) => x === null || x === undefined ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', CDIR = env.FM_CACHE_DIR || 'fm-cache';
const nyDay = () => new Date(Date.now() + nyOffset(new Date().toISOString().slice(0, 10)) * 60000).toISOString().slice(0, 10);
const nyMin = () => { const d = new Date(Date.now() + nyOffset(nyDay()) * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const day = env.IG_DAY || nyDay(), wd = new Date(day + 'T12:00:00Z').getUTCDay(), START = Date.now(), MAXMS = +(env.IG_RUN_MIN || 345) * 60000;
let loops = 0, PROC_START = null;   // test hook: IG_FAKE_MIN starts a fake clock, IG_FAKE_STEP moves it that many minutes each check
const clock = () => env.IG_FAKE_MIN ? +env.IG_FAKE_MIN + (env.IG_FAKE_STEP ? loops * +env.IG_FAKE_STEP : Math.floor((Date.now() - START) / 60000)) : nyMin();
PROC_START = fmtM(clock());   // (28 Oct) the real start time, New York, kept in data/ignition-days.jsonl (GitHub's cron can start it 35 min to 2 h late)
const kuwait = (m) => fmtM(((m - nyOffset(day) + 180) % 1440 + 1440) % 1440);
if (wd === 0 || wd === 6) { console.log('ignition watcher: weekend'); process.exit(0); }
if (!env.IG_FAKE_MIN && clock() >= 520 && clock() < 565) { console.log('ignition watcher: early start at ' + fmtM(clock()) + ' New York, waiting for 9:25'); while (clock() < 565) await new Promise(r => setTimeout(r, 20000)); }   // started early on purpose: GitHub often starts scheduled jobs 15-30 minutes late
if (clock() < 540 || clock() > 900) { console.log('ignition watcher: outside 9:00-15:00 New York (' + fmtM(clock()) + '), nothing to do'); process.exit(0); }
const RUN_START = Date.now();   // Runtime begins after the early 09:25 wait, not at cron startup.
// ---- each stock's normal daily volume (average over the days it traded, 15+ of the last 20 needed), float, time listed
const avgVol = new Map(), firstSeen = new Map(), avgRange5 = new Map(); let sessions = 0;   // avgRange5: average high-low range of the last 5 sessions (the 'ADR' idea, logged only)
try { const S = JSON.parse(zlib.gunzipSync(fs.readFileSync(CDIR + '/fm.json.gz')).toString()), D = Object.keys(S.days).sort(); sessions = D.length;
  const last = D.slice(-20), sum = new Map(), cnt = new Map(); for (const d of last) { const x = S.days[d]; for (let j = 0; j < x.T.length; j++) { sum.set(x.T[j], (sum.get(x.T[j]) || 0) + x.v[j]); cnt.set(x.T[j], (cnt.get(x.T[j]) || 0) + 1); } }
  for (const [s, v] of sum) if (cnt.get(s) >= 15) avgVol.set(s, v / cnt.get(s));
  { const rs = new Map(), rc = new Map(); for (const d of D.slice(-5)) { const x = S.days[d]; if (!x.h || !x.l) continue; for (let j = 0; j < x.T.length; j++) { rs.set(x.T[j], (rs.get(x.T[j]) || 0) + (x.h[j] - x.l[j])); rc.set(x.T[j], (rc.get(x.T[j]) || 0) + 1); } } for (const [s, v] of rs) if (rc.get(s) === 5) avgRange5.set(s, v / 5); }
  D.forEach((d, t) => { const x = S.days[d]; for (const s of x.T) if (!firstSeen.has(s)) firstSeen.set(s, t); }); } catch (e) { console.log('ignition watcher: no fast-mover cache yet (volume rules cannot be checked)'); }
// TIME-OF-DAY VOLUME CURVE: what share of a normal day's volume the whole market has traded by each 5 minutes of the session,
// learned from this watcher's own days (median of the last 20; needs 5+ days). A stock's volume is then judged against what it
// normally trades BY THIS TIME, not against a whole day: the first hour is always busy, so a whole-day comparison flatters it.
const VC = readJson('data/vol-curve.json', { days: {} }), vcToday = {};
const curveAt = (m) => { const b = Math.floor(m / 5) * 5, v = Object.keys(VC.days).sort().slice(-20).map(d => VC.days[d][b]).filter(x => typeof x === 'number' && x > 0).sort((a, c) => a - c); return v.length >= 5 ? v[Math.floor(v.length / 2)] : null; };
const floats = readJson(CDIR + '/floats.json', {}), meta = (s) => ({ float: floats[s] && floats[s].f, age: firstSeen.has(s) && firstSeen.get(s) > 5 ? sessions - firstSeen.get(s) : (sessions >= 250 ? 999 : null) });
// ---- alert gates
const LAB = readJson('data/ignition-lab.json', null), PREC = (readJson('data/ignition-results.json', {}) || {}).record || {};
const passed = LAB && LAB.rules ? Object.values(LAB.rules).filter(x => x.verdict === 'PROMISING' && (LAB.version === undefined || LAB.version === IG_VERSION)) : [];
// live paper record must hold at 1.5x costs and without its 2 best trades; the live-only rule needs a longer record (no history test)
const paperOk = (rule, exit, liveOnly) => paperRecordApproved(PREC[rule + '/' + exit], liveOnly);
const halal = readJson('data/halal.json', {}), zadNot = new Set((readJson('data/zad-list.json', {}) || {}).notHalal || []), notHalal = (s) => (halal[s] && halal[s].s === 'fail') || zadNot.has(s);
const LOTT = (readJson('data/signals.json', {}) || {}).lottery || {};   // tested 19 Oct: a 15%+ one-day jump in the last month lagged the average stock ~3% over the next month (t -5): never alerted   // your ZAD checks + ZAD's own not-halal list
// ---- data
let src = null, mode = 'NO_USABLE_MARKET_DATA', note = '';
async function snapMassive() {
  try { const r = await fetch(MV + '/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=' + encodeURIComponent(env.MASSIVE_KEY || '')); if (r.status === 401 || r.status === 403) { note = 'Massive snapshot not in the plan (HTTP ' + r.status + ')'; return null; } if (!r.ok) return []; const j = await r.json();
    return (j.tickers || []).filter(x => /^[A-Z]{1,5}$/.test(x.ticker || '')).map(x => { const lt = x.lastTrade || {}, mn = x.min || {}, dy = x.day || {}, pd = x.prevDay || {}, lq = x.lastQuote || {}, tms = lt.t ? lt.t / 1e6 : mn.t || (x.updated ? x.updated / 1e6 : 0);
      return { sym: x.ticker, price: +(lt.p || mn.c || dy.c || 0), prevC: +(pd.c || 0), prevV: +(pd.v || 0), open: +(dy.o || 0), hi: +(dy.h || 0), lo: +(dy.l || 0), vol: +(mn.av || dy.v || 0), t: tms, vt: tms, bid: +(lq.p || 0), ask: +(lq.P || 0), qt: lq.t ? lq.t / 1e6 : 0 }; }); } catch (e) { return []; } }
const AH = () => ({ headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET } });
async function snapTop50() {
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET) return null;
  try { const r = await fetch(ALPD + '/v1beta1/screener/stocks/movers?top=50', AH()); if (!r.ok) { if (!note.includes('Alpaca movers')) note += (note ? '; ' : '') + 'Alpaca movers HTTP ' + r.status; return null; } const j = await r.json(), syms = (j.gainers || []).map(x => x.symbol).filter(s => /^[A-Z]{1,5}$/.test(s)); if (!syms.length) return [];
    const sj = (await snapshots(ALPD, syms, AH())) || {}, sip = feedUsed() === 'sip';
    return syms.map(s => { const x = sj[s] || {}, lt = x.latestTrade || {}, db = x.dailyBar || {}, pb = x.prevDailyBar || {}, t = lt.t ? Date.parse(lt.t) : 0; return { sym: s, price: +(lt.p || db.c || 0), prevC: +(pb.c || 0), open: +(db.o || 0), vol: sip && db.v ? +db.v : null, t, vt: sip && db.v ? t : 0 }; }); } catch (e) { return null; } }
async function alpacaAll(syms) {   // live IEX prices for many stocks, 200 a request, 6 requests at a time
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET || !syms.length) return null; const out = new Map(), parts = [];
  for (let i = 0; i < syms.length; i += 200) parts.push(syms.slice(i, i + 200)); let fails = 0, k = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (k < parts.length) { const part = parts[k++];
    try { const sj = await snapshots(ALPD, part, AH()); if (!sj) { fails++; continue; } const sip = feedUsed() === 'sip';   // SIP = every exchange, so its day volume is the real one
      for (const [s, x] of Object.entries(sj || {})) { const lt = (x && x.latestTrade) || {}, db = (x && x.dailyBar) || {}, lq = (x && x.latestQuote) || {}; if (lt.p > 0) out.set(s, { price: +lt.p, t: lt.t ? Date.parse(lt.t) : 0, open: +(db.o || 0), vol: sip && db.v ? +db.v : null, bid: +(lq.bp || 0), ask: +(lq.ap || 0), qt: lq.t ? Date.parse(lq.t) : 0 }); } } catch (e) { fails++; } } }));   // (28 Oct) latestQuote was already in the answer: kept for the spread record
  if (fails === parts.length) { if (!note.includes('Alpaca snapshots')) note += (note ? '; ' : '') + 'Alpaca snapshots failed'; return null; }
  return out; }
async function snap() {
  const m = env.MASSIVE_KEY ? await snapMassive() : null, now = Date.now();
  const late = !m || !m.length ? Infinity : (() => { const d = m.filter(r => r.t > 0).map(r => (now - r.t) / 60000).sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : Infinity; })();
  if (m && m.length && late <= 3) { src = 'massive (live)'; mode = 'FULL_SNAPSHOT'; return m; }
  if (m && m.length) { const live = await alpacaAll(m.filter(r => r.prevC >= 1).map(r => r.sym));
    if (live) { let n = 0; for (const r of m) { const x = live.get(r.sym); if (x && x.t > r.t) { r.price = x.price; r.t = x.t; if (x.open > 0) r.open = x.open; if (x.vol > 0) { r.vol = x.vol; r.vt = x.t; } n++; } if (x && x.ask > 0 && x.qt >= (r.qt || 0)) { r.bid = x.bid; r.ask = x.ask; r.qt = x.qt; } }
      src = 'alpaca live prices (' + feedUsed().toUpperCase() + ' feed) for ' + n + ' of ' + m.length + ' stocks + ' + (feedUsed() === 'sip' ? 'live SIP volume' : 'massive volume (late)'); mode = 'FULL_SNAPSHOT_PLUS_ALPACA_LIVE'; return m; } }
  const a = await snapTop50();
  if (!a || !a.length) { src = m && m.length ? 'massive (late ' + Math.round(late) + ' min)' : 'none'; mode = m && m.length ? 'FULL_SNAPSHOT_LATE' : 'NO_USABLE_MARKET_DATA'; return m || []; }
  src = 'alpaca top-50 gainers only'; mode = 'PARTIAL_TOP50_FALLBACK';
  const byM = new Map((m || []).map(r => [r.sym, r]));
  for (const r of a) { const x = byM.get(r.sym); r.vol = x ? x.vol : null; r.vt = x ? x.vt : 0; if (!(r.prevC > 0) && x) r.prevC = x.prevC; if (!(r.open > 0) && x) r.open = x.open; byM.set(r.sym, r); }
  return [...byM.values()];
}
async function minuteBars(sym) { try { const r = await fetch(MV + `/v2/aggs/ticker/${sym}/range/1/minute/${day}/${day}?adjusted=true&sort=asc&limit=50000&apiKey=` + encodeURIComponent(env.MASSIVE_KEY || '')); if (!r.ok) return null; return toBars((await r.json()).results, day); } catch (e) { return null; } }
async function openingRange(sym) {   // first 5 minutes (9:30-9:34) and the pre-market volume, from minute bars
  const b = await minuteBars(sym); if (!b) return null; const o = b.filter(x => x[0] >= 570 && x[0] <= 574);
  if (o.length < 3) return null; return { orH: Math.max(...o.map(x => x[2])), orL: Math.min(...o.map(x => x[3])), pm: b.filter(x => x[0] < 570).reduce((a, x) => a + x[5], 0) }; }
// SEC check before any alert. FAIL-CLOSED: if the check cannot be done, the alert is blocked (the ignition stays on paper).
let TICK = null, secLogged = false;
async function secRisk(sym) {
  const H = { headers: { 'User-Agent': SEC_UA, 'Accept': 'application/json' } };
  try { if (!TICK) { const r = await fetch(SEC_WWW + '/files/company_tickers.json', H); if (!r.ok) { if (!secLogged) { secLogged = true; console.log('SEC check failed: HTTP ' + r.status + ' (alerts stay blocked until it works; check the SEC_UA secret)'); } return { known: false, tags: [] }; } TICK = {}; for (const x of Object.values(await r.json())) TICK[String(x.ticker || '').toUpperCase()] = x.cik_str; }
    const cik = TICK[sym]; if (!cik) return { known: false, tags: [] };
    const r = await fetch(SEC_DATA + '/submissions/CIK' + String(cik).padStart(10, '0') + '.json', H); if (!r.ok) return { known: false, tags: [] }; const R = (await r.json()).filings.recent, since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), since3 = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), tags = new Set(), filings = [];
    for (let k = 0; k < Math.min(R.form.length, 60); k++) { if (String(R.filingDate[k]) < since) break; const f = String(R.form[k]).toUpperCase(), it = String((R.items || [])[k] || ''); if (String(R.filingDate[k]) >= since3) filings.push({ form: f, items: it, at: (R.acceptanceDateTime || [])[k] || null });   // (28 Oct) recent filings with their SEC acceptance time: the catalyst check
      if (/^424B[1-5]$|^S-1|^S-3|^F-1|^F-3/.test(f)) tags.add('share sale / registration (' + f + ')'); if (f === '8-K' && /3\.01/.test(it)) tags.add('exchange listing-rule notice (delisting risk)'); if (f === '8-K' && /3\.02/.test(it)) tags.add('private share sale (8-K 3.02)'); if (/^NT 10-[KQ]/.test(f)) tags.add('late financial report (' + f + ')'); }
    return { known: true, tags: [...tags], filings }; } catch (e) { return { known: false, tags: [] }; } }
// headlines (Finnhub company news, the owner's existing key; official API): only for the few stocks an early alert is about to name
async function newsFor(sym) { if (!env.FINNHUB_KEY) return { ok: false, why: 'no FINNHUB_KEY' };
  try { const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), r = await fetch('https://finnhub.io/api/v1/company-news?symbol=' + encodeURIComponent(sym) + '&from=' + from + '&to=' + to + '&token=' + encodeURIComponent(env.FINNHUB_KEY));
    if (!r.ok) return { ok: false, why: 'HTTP ' + r.status }; const j = await r.json(); return { ok: true, items: (Array.isArray(j) ? j : []).map(x => ({ at: x.datetime ? x.datetime * 1000 : null, source: x.source || '', headline: String(x.headline || '').slice(0, 140) })) }; } catch (e) { return { ok: false, why: e.message }; } }
async function tg(message) {
 const outcome = await sendTelegramMessage({base:TG,token:env.TG_TOKEN,chat:env.TG_CHAT,text:message});
 if (!outcome.ok) console.error('TELEGRAM DELIVERY FAILED: ' + outcome.reason + ' | ' + String(message).slice(0,120));
 return outcome.ok;
}
// ---- the loop
const HELD = { at: 0, pos: {} }, STOP_SENT = {};   // live stop watch (23 Oct)
const seen = {}, orb = {}, triggers = [], beat = [], vis = {}, ser = {}, pull = {}, earlyWave = {}; let alerts = 0;   // earlyWave: observation only (23 Oct)
const flag = (sym, f, text) => { const v = vis[sym]; if (!v) return; v.flags[f] = true; if (text && !v.notes.includes(text)) v.notes.push(text); };
// IG8 RETIRED (24 Oct): lost on its live paper record (657 trades, -0.8% after costs) and on 23 Oct's first full SIP day (316 trades,
// -2.2% at the close, worse than matched stocks equally up at the same minute that did not trigger). IG8_ON=1 brings it back for research.
const IG8_RETIRED = process.env.IG8_ON !== '1';
const IG8 = IG8_RETIRED ? null : LIVE_RULES.find(r => r.id === 'IG8'), IG8T = IG8_RETIRED ? null : LIVE_RULES.find(r => r.id === 'IG8T');
let earlyAlerts = 0;
async function maybeAlert(r, t, R, chg, rd, rv, M, extra, liveOnly) {
  const ok0 = liveOnly ? [{ rule: R.id, exit: 'trail', exitName: 'stop 8%, then sell when it falls 10% from its high since the buy, else at the close' }, { rule: R.id, exit: 'close', exitName: 'stop 8%, sell at the close' }] : passed.filter(p => p.rule === R.id);
  if (!ok0.length) { flag(r.sym, 'ruleNotPassed', 'caught by ' + R.id + ' (paper only: the rule has not passed its history test)'); return; }
  // EARLY PAPER ALERT (owner's choice: every chance shown): a live-only rule whose paper record is positive so far (20+ trades, positive at
  // 1.5x costs) but not yet proven (60 trades over 30 days) still alerts, clearly labelled, max 3 a day, minimum size. It stops by itself
  // the moment its paper record turns negative.
  let ok = ok0.filter(p => paperOk(p.rule, p.exit, liveOnly)), early = false;
  if (!ok.length) { const e = liveOnly ? ok0.filter(p => { const q = PREC[p.rule + '/' + p.exit]; return earlyPaperEligible(q); }) : [];
    if (!e.length || earlyAlerts >= 3) { flag(r.sym, 'paperGate', 'caught by ' + R.id + ' (paper only: live paper record not yet strong enough)'); return; } ok = e; early = true; }
  if (notHalal(r.sym)) { flag(r.sym, 'notHalal', 'marked NOT HALAL'); return; } if (LOTT[r.sym] >= 0.15) { flag(r.sym, 'lottery', 'lottery-like: a ' + Math.round(LOTT[r.sym] * 100) + '% one-day jump in the last month (tested AVOID)'); return; } if (alerts >= 6) { flag(r.sym, 'alertCap', 'daily alert limit reached'); return; }
  if (!isFreshPriceAge(rd)) { flag(r.sym, 'noLive', 'price age ' + (typeof rd !== 'number' || !Number.isFinite(rd) ? 'unknown' : rd < 0 ? 'invalid (future timestamp)' : Math.round(rd) + ' minutes') + ': not fresh enough to alert'); return; }
  const risk = await secRisk(r.sym); if (!risk.known) { t.blocked = ['SEC_CHECK_UNAVAILABLE']; flag(r.sym, 'secUnavailable', 'alert blocked: SEC check unavailable'); return; }
  if (risk.tags.length) { t.blocked = risk.tags; flag(r.sym, 'secBlocked', 'alert blocked: ' + risk.tags.join(', ')); return; }
  t.early = early;
  const ex = ok.sort((a, b) => ((PREC[b.rule + '/' + b.exit] || {}).avg || 0) - ((PREC[a.rule + '/' + a.exit] || {}).avg || 0))[0], pr = PREC[ex.rule + '/' + ex.exit], stop = R.orb ? extra.orL : R.pull ? Math.max(extra.stop * 0.995, r.price * 0.88) : r.price * 0.92, hist = !liveOnly && ex.results ? ex.results.newer : null;
  if (!sendAlert({ early }, (() => { try { return JSON.parse(fs.readFileSync('data/settings.json', 'utf8')); } catch (e) { return {}; } })())) return;   // recorded as an early paper alert (t.alerted), not sent: opportunities only
  const delivered = await tg([(early ? 'EARLY WAVE ALERT [PAPER, NOT PROVEN] | only ' + pr.n + ' paper trades on ' + (pr.days || '?') + ' day(s). Ride it only with the minimum 1,000 USD and the stop.' : 'IGNITION ALERT | FAST DAY TRADE, separate from the tested swing buys in ACTIONS'), r.sym + ' ' + pc(chg) + ' at ' + fmtM(clock()) + ' New York (' + kuwait(clock()) + ' Kuwait, ' + (rd < 1 ? 'live' : Math.round(rd) + ' min old') + ' price). Coverage: ' + mode,
    'Price ' + r.price.toFixed(2) + ' | volume ' + (rv === null ? 'n/a' : rv.toFixed(1) + 'x a normal day (late figure)') + (M.float ? ' | float ' + (M.float / 1e6).toFixed(1) + 'M shares' : '') + (M.age !== null && M.age < 250 ? ' | traded only ' + M.age + ' sessions' : '') + ' | SEC: no share sale or delisting notice in 30 days',
    'BUY only up to ' + (r.price * 1.03).toFixed(2) + ' (3% above now; higher = skip). STOP ' + stop.toFixed(2) + '. EXIT: ' + ex.exitName + ' (sell before 11 pm Kuwait at the latest).',
    'Rule: ' + R.name + '. ' + (hist ? 'History test: ' + Math.round(hist.win * 100) + '% won, average ' + pc(hist.avg) + ' (' + hist.n + ' trades). ' : 'Forward-tested only. ') + 'Live paper: ' + pr.n + ' trades, ' + pc(pr.avg) + ' (' + pc(pr.stress) + ' at 1.5x costs).',
    'Check ZAD first. 1,000 USD at most. Not financial advice, not a halal ruling.'].join('\n'));
  if (delivered) { alerts++; if (early) earlyAlerts++; t.alerted = true; flag(r.sym, 'alerted', 'DELIVERED (' + R.id + (early ? ', early paper' : '') + ')'); }
  else { t.deliveryFailed = true; flag(r.sym, 'deliveryFailed', 'Telegram did not acknowledge message'); }
}
// ---- pre-market record (about 9:25 New York): volume traded before the open vs the stock's normal day, and the gap. Saved every day so the
// "heavy pre-market volume before take-off" idea can be tested after ~90 days (it cannot be tested on history: nobody saved it)
const pm = new Map();
if ((env.IG_PM_TEST || !env.IG_FAKE_MIN) && env.MASSIVE_KEY && clock() < 570) { const rows = await snapMassive(), nowMs = Date.now();
  if (rows && rows.length) { const ages = rows.filter(r => r.t > 0).map(r => (nowMs - r.t) / 60000).sort((a, b) => a - b), ageMed = ages.length ? +ages[Math.floor(ages.length / 2)].toFixed(1) : null;
    const all = rows.filter(r => r.prevC >= 0.10 && r.vol > 0 && r.price > 0).map(r => { const av = avgVol.get(r.sym) || (r.prevV > 0 ? r.prevV : 0); return { s: r.sym, pc: +r.prevC.toFixed(4), p: +r.price.toFixed(4), gap: +(r.price / r.prevC - 1).toFixed(4), v: Math.round(r.vol), x: av > 0 ? +(r.vol / av).toFixed(4) : null }; });
    for (const r of all) pm.set(r.s, r);
    const keep = [...all].filter(r => r.x !== null).sort((a, b) => b.x - a.x).slice(0, 600), ks = new Set(keep.map(r => r.s)); for (const r of all) if (!ks.has(r.s) && Math.abs(r.gap) >= 0.05) keep.push(r);
    fs.appendFileSync('data/premarket.jsonl', JSON.stringify({ day, at: fmtM(clock()), priceAgeMin: ageMed, stocks: all.length, rows: keep }) + '\n');
    console.log('pre-market record: ' + all.length + ' stocks traded before the open, ' + keep.length + ' saved (heaviest volume + gaps of 5%+), data about ' + ageMed + ' min old'); } }
// ---- the audit: every stock that ran 15%+ (moved above the loop on 28 Oct so the 11:15 OPPORTUNITY RADAR snapshot can use it too), one deterministic code (data and safety reasons first, so they are never blamed on a rule)
const codeOf = (v) => { const f = v.flags;
  if (f.alerted) return 'ALERTED'; if (f.under1) return 'UNDER_1_USD'; if (f.secUnavailable) return 'SEC_CHECK_UNAVAILABLE'; if (f.secBlocked) return 'SEC_BLOCKED'; if (f.notHalal) return 'NOT_HALAL'; if (f.lottery) return 'LOTTERY_AVOID'; if (f.alertCap) return 'ALERT_CAP_REACHED';
  if (f.noLive) return 'NO_LIVE_PRICE_AT_SIGNAL'; if (f.volLate && !f.paperGate && !f.ruleNotPassed) return 'VOLUME_FIGURE_LATE'; if (f.paperGate) return 'CAUGHT_PAPER_GATE_NOT_MET'; if (f.ruleNotPassed) return 'CAUGHT_RULE_NOT_PASSED';
  if ((v.fm <= 575 && v.fc >= 0.10) || v.fo >= 0.10) return 'GAPPED_AT_OPEN'; if (v.lm === undefined) return 'NOT_VISIBLE_LIVE';   // opened 10%+ up = the move happened before the open: no feed can fix that
  if (v.lc >= 0.25) return 'VISIBLE_TOO_LATE'; if (f.noVolHist) return 'NO_VOLUME_HISTORY';
  if (f.after11) return 'AFTER_11_00'; if (f.lowVol) return 'LOW_VOLUME'; return 'NO_RULE_FIT'; };
const fromFirst = (x, v) => +((1 + x) / (1 + v.fc) - 1).toFixed(3);   // bought at the first-seen price: best, worst and last move after that (no costs)
const buildMissed = () => { const movers = Object.values(vis).filter(v => v.maxC >= 0.15); return movers.map(v => ({ sym: v.sym, code: codeOf(v), openGap: v.fo === null || v.fo === undefined ? null : +v.fo.toFixed(3), maxUp: +v.maxC.toFixed(3), preMarketVolX: pm.has(v.sym) ? pm.get(v.sym).x : null, preMarketGap: pm.has(v.sym) ? pm.get(v.sym).gap : null, firstSeen: fmtM(v.fm), firstSeenUp: +v.fc.toFixed(3), afterFirstSeen: { best: fromFirst(v.maxC, v), worst: fromFirst(v.minC, v), last: fromFirst(v.lastC === undefined ? v.fc : v.lastC, v) }, firstQuoteAgeMin: v.fAge === null ? null : +v.fAge.toFixed(1), firstLive: v.lm === undefined ? null : fmtM(v.lm), firstLiveUp: v.lc === undefined ? null : +v.lc.toFixed(3), liveAt5pct: v.l5 === undefined ? null : fmtM(v.l5), crossed10: v.c10 === undefined ? null : fmtM(v.c10) + (v.c10live ? ' (live)' : ' (old price)'), result: v.caught ? 'caught (' + v.caught + ')' : 'not caught', why: v.notes.join('; ') || (v.fm <= 575 && v.fc >= 0.10 ? 'already +' + Math.round(v.fc * 100) + '% at the open (gap)' : 'no rule fired') })).sort((a, b) => b.maxUp - a.maxUp); };
// ---- DAILY OPPORTUNITY RADAR (owner, 28 Oct 2026): at 11:15 New York, a snapshot of what the watcher already knows goes to
// data/radar-v3-snap.json and opportunity-radar.mjs sends it (four labelled panels; rules in radar-v3-core.mjs). Never an alert or a buy.
const RADAR = { done: false, mkt: null };
// ---- EARLY ALERTS (owner, 28 Oct 2026): prompt RESEARCH LEAD / PAPER SETUP messages, separate from approved alerts, and the per-candidate
// log behind the DELIVERY SCORECARD (rules, hard blocks and caps in early-alerts.mjs). Approved alerts still come only from maybeAlert.
async function tgSend(text) { if (!env.TG_TOKEN || !env.TG_CHAT) { console.log('[early alert, not sent: no Telegram token]\n' + text); return { ok: false, why: 'no Telegram token' }; }
  try { const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(0, 3900), disable_web_page_preview: true }) }); const j = await r.json().catch(() => ({}));
    return { ok: !!(r.ok && j.ok), why: r.ok ? (j.description || '') : 'HTTP ' + r.status }; } catch (e) { return { ok: false, why: e.message }; } }
const EA = createEarlyAlerts({ day, level: alertLevel(readJson('data/settings.json', {})), send: tgSend, secRisk, notHalal, halalOk: (s) => !!(halal[s] && halal[s].s === 'ok') && !zadNot.has(s),
  lottery: LOTT, record: PREC, lab: (LAB && LAB.rules) || {}, now: () => clock(), catalyst: async (sym, sec) => classifyCatalyst({ sec: sec || await secRisk(sym), news: await newsFor(sym), nowMs: Date.now() }) });
const SR = createShadow({ day });
// ---- SEC LIVE FEED for the D shadow model and the R0 control (owner, 28 Oct 2026; rules frozen in rank-models.mjs). Research only.
// EDGAR's latest-filings feed, about every 2 minutes until 11:00 New York (first poll pages back to 4:00); each 8-K / 6-K is decided at the
// first live minute after its acceptance (9:30 at the earliest). SEC company checks only for filings that pass the cheap D checks, at
// most 15 a minute (the rest wait a minute and say so in decM), so the minute loop stays fast.
const EF = { seen: new Set(), pending: [], last: 0, first: true, polls: 0, fails: 0, filings: 0, lat: [], decided: 0, eligible: 0, noPrice: 0, firstOkM: null, ctlDone: false, cik: null }, DAY4 = Date.parse(day + 'T04:00:00Z') - nyOffset(day) * 60000;
async function pollEdgar(m) {
  if (m > 660 || Date.now() - EF.last < 110000) return; EF.last = Date.now();
  if (!TICK) await secRisk('SPY').catch(() => {}); if (!TICK) { EF.fails++; return; }
  if (!EF.cik) { EF.cik = new Map(); for (const [t, c] of Object.entries(TICK)) if (/^[A-Z]{1,5}$/.test(t)) { const k = +c; if (!EF.cik.has(k)) EF.cik.set(k, []); EF.cik.get(k).push(t); } }
  const H = { headers: { 'User-Agent': SEC_UA, Accept: 'application/atom+xml' } };
  for (const type of ['8-K', '6-K']) for (let start = 0; start < (EF.first ? 800 : 200); start += 100) {
    const r = await fetch(SEC_WWW + '/cgi-bin/browse-edgar?action=getcurrent&type=' + encodeURIComponent(type) + '&company=&dateb=&owner=include&start=' + start + '&count=100&output=atom', H).catch(() => null);
    EF.polls++; if (!r || !r.ok) { EF.fails++; break; } if (EF.firstOkM === null) EF.firstOkM = m;
    const ents = parseAtom(await r.text()); let older = false;
    for (const e of ents) { const t = Date.parse(e.at); if (!(t >= DAY4)) { older = true; continue; } const k = e.acc + '|' + e.cik; if (EF.seen.has(k)) continue; EF.seen.add(k); EF.filings++; if (!EF.first) EF.lat.push(Math.round((Date.now() - t) / 1000));
      for (const sym of EF.cik.get(e.cik) || []) EF.pending.push({ sym, acc: e.acc, form: e.form, items: e.items, at: e.at, atM: nyMinuteOf(e.at) }); }
    if (older || ents.length < 100) break; }
  EF.first = false;
}
async function decideFilings(m, bySym) {
  if (!EF.pending.length || m < 570) return; const keep = []; let secCalls = 0;
  for (const p of EF.pending) { const r = bySym.get(p.sym);
    if (m <= p.atM) { keep.push(p); continue; }
    const live = r && r.prevC > 0 && r.price > 0 && isFreshPriceAge(r.t > 0 ? (Date.now() - r.t) / 60000 : null);
    if (!live) { if (m <= 660) keep.push(p); else EF.noPrice++; continue; }
    const chg = r.price / r.prevC - 1, sp = spreadPct(r.bid, r.ask), qAge = r.qt > 0 ? (Date.now() - r.qt) / 1000 : null, hard = { under1: r.price < 1, halalFail: notHalal(p.sym), lottery: LOTT[p.sym] || 0 };
    const q = { form: p.form, items: p.items, atM: p.atM, decM: m, chg, price: r.price, prevDollarVol: (r.prevC || 0) * (r.prevV || 0), spread: sp, spreadFresh: sp !== null && qAge !== null && qAge <= 120, halalFail: hard.halalFail, lottery: hard.lottery };
    let sec = EA.S.sec[p.sym] || null;
    if (!sec && dEligible({ ...q, sec: { known: true, tags: [] } }).eligible) { if (secCalls >= 15) { keep.push(p); continue; } secCalls++; sec = EA.S.sec[p.sym] = await secRisk(p.sym).catch(() => ({ known: false, tags: [] })); }
    const D = dEligible({ ...q, sec: sec || { known: true, tags: [] } }); if (!sec) D.why.push('SEC not checked (failed another D rule first)');
    EF.decided++; if (D.eligible) EF.eligible++;
    SR.filing({ sym: p.sym, m, price: r.price, chg, bid: r.bid, ask: r.ask, qAgeSec: qAge, fc: vis[p.sym] ? vis[p.sym].fc : null, prevDollarVol: q.prevDollarVol, hard,
      f: { acc: p.acc, form: p.form, items: p.items, atM: p.atM, decM: m, chg: +chg.toFixed(4), prevDollarVol: Math.round(q.prevDollarVol), spread: sp, eligible: D.eligible, why: D.why } }); }
  EF.pending = keep;
}
// R0 control at 9:45: liquid 1 USD+ stocks that have not moved, by a fixed hash (no information, no choice)
function controlSample(m, rows) {
  if (EF.ctlDone || m < 585) return; EF.ctlDone = true;
  const pool = rows.filter(r => r.prevC >= 1 && r.price >= 1 && r.prevC * (r.prevV || 0) >= 1e6 && Math.abs(r.price / r.prevC - 1) <= 0.03 && isFreshPriceAge(r.t > 0 ? (Date.now() - r.t) / 60000 : null) && !notHalal(r.sym) && !((LOTT[r.sym] || 0) >= 0.15))
    .sort((a, b) => hash(day + a.sym) - hash(day + b.sym)).slice(0, RANK.controlsPerDay);
  for (const r of pool) SR.control({ sym: r.sym, m, price: r.price, chg: r.price / r.prevC - 1, bid: r.bid, ask: r.ask, qAgeSec: r.qt > 0 ? (Date.now() - r.qt) / 1000 : null, fc: vis[r.sym] ? vis[r.sym].fc : null, prevDollarVol: r.prevC * (r.prevV || 0), hard: { under1: false, halalFail: false, lottery: LOTT[r.sym] || 0 } });
}   // (28 Oct, Phase 1) every candidate with each soft gate removed, for the filter shadow test (shadow-stream.mjs)
const medChg = () => { const a = Object.values(vis).filter(v => v.last >= 1 && v.lastC !== undefined).map(v => v.lastC).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
async function radarSnap(m, scanned, live) {
  const ms = buildMissed(), tl = {}; for (const x of ms) tl[x.code] = (tl[x.code] || 0) + 1;
  const hits = triggers.filter(t => !t.logged).map(t => ({ sym: t.sym, rule: t.rule, m: t.m, price: t.price }));
  const early = Object.values(earlyWave).sort((x, y) => y.score - x.score).slice(0, 40).map(e => ({ sym: e.sym, change: e.change, rvT: e.rvT, price: e.price, score: e.score, firstMinute: e.firstMinute }));
  const now = {}; for (const s of new Set([...hits.map(h => h.sym), ...early.map(e => e.sym)])) if (vis[s] && vis[s].last > 0) now[s] = { px: vis[s].last, chg: +vis[s].lastC.toFixed(4) };
  RADAR.mkt = medChg();
  // (28 Oct fix) the live SEC check for every stock the radar may name (cached by the alert system when it already ran); a lead needs it
  const sec = {}; for (const s of new Set([...hits.map(h => h.sym), ...early.filter(e => e.price >= 1).map(e => e.sym)])) { if (!EA.S.sec[s]) EA.S.sec[s] = await secRisk(s).catch(() => ({ known: false, tags: [] })); sec[s] = { known: EA.S.sec[s].known, tags: EA.S.sec[s].tags || [] }; }
  const cat = {}; for (const r of Object.values(EA.S.seen)) if (r.catText) cat[r.sym] = r.catText;
  { let nq = 0; for (const s of [...hits.map(h => h.sym), ...early.filter(e => e.price >= 1).map(e => e.sym)]) { if (cat[s] || !sec[s] || !sec[s].known || sec[s].tags.length) continue;   // the radar's own catalyst check for names it may list
      const news = nq < 12 ? (nq++, await newsFor(s)) : { ok: false, why: 'not checked: radar limit of 12 headline look-ups' }; cat[s] = classifyCatalyst({ sec: EA.S.sec[s], news, nowMs: Date.now() }).text; } }
  fs.writeFileSync('data/radar-v3-snap.json', JSON.stringify({ day, at: fmtM(m), mode, firstMinute: beat.length ? fmtM(beat[0].m) : fmtM(m), scanned, live, alerts, mkt: RADAR.mkt, tally: tl, sec, cat,
    movers: ms.slice(0, 20).map(x => ({ sym: x.sym, code: x.code, maxUp: x.maxUp, firstSeen: x.firstSeen, firstSeenUp: x.firstSeenUp })), hits, early, now }));
  if (!env.IG_NO_RADAR) execSync('node opportunity-radar.mjs midday', { stdio: 'inherit', timeout: 120000 });
}
while (Date.now() - RUN_START < MAXMS) {
  const m = clock(); if (m > 900) break; if (m < 568) { await sleep(30000); continue; }
  const rows = await snap(); loops++; const tStart = triggers.length;
  // LIVE STOP WATCH (23 Oct): every held stock, every minute, on fresh live prices; positions re-read from GitHub every 10 minutes
  try { if (!HELD.at || Date.now() - HELD.at > 600000) { HELD.at = Date.now(); try { execSync('git fetch -q origin main', { stdio: 'ignore', timeout: 60000 }); HELD.pos = JSON.parse(execSync('git show origin/main:data/my-positions.json', { maxBuffer: 64 << 20, timeout: 60000 }).toString()); try { EA.setLevel(alertLevel(JSON.parse(execSync('git show origin/main:data/settings.json', { timeout: 60000 }).toString()))); } catch (e) {} } catch (e) { HELD.pos = readJson('data/my-positions.json', {}); } }
    const pxNow = {}, tNow = Date.now(); for (const r of rows) if (HELD.pos[r.sym] && r.price > 0 && isFreshPriceAge(r.t > 0 ? (tNow - r.t) / 60000 : null)) pxNow[r.sym] = r.price;
    for (const h of stopHits(HELD.pos, pxNow, STOP_SENT)) await tg(h.text); } catch (e) { console.log('stop watch: ' + e.message); } const nowMs = Date.now(); let liveN = 0, evald = 0; const ages = [], vages = [], cf = curveAt(m); let sumV = 0, sumA = 0;
  for (const r of rows) { if (!(r.prevC > 0) || !(r.price > 0)) continue; evald++; const chg = r.price / r.prevC - 1, rd = r.t > 0 ? (nowMs - r.t) / 60000 : null, live = isFreshPriceAge(rd);
    if (rd !== null) ages.push(rd); if (r.vt > 0) vages.push((nowMs - r.vt) / 60000); if (live) liveN++;
    // visibility ledger: every stock from its first sighting
    const prevSeenPx = vis[r.sym] ? vis[r.sym].last : null;
    const v = vis[r.sym] || (vis[r.sym] = { sym: r.sym, fm: m, fc: chg, fo: r.open > 0 ? r.open / r.prevC - 1 : null, fAge: rd, fMode: mode, maxC: chg, minC: chg, flags: {}, notes: [] });
    v.maxC = Math.max(v.maxC, chg); v.minC = Math.min(v.minC, chg); v.last = r.price; v.lastC = chg; if (live && v.lm === undefined) { v.lm = m; v.lc = chg; }
    if (live && chg >= 0.05 && v.l5 === undefined) v.l5 = m; if (chg >= 0.10 && v.c10 === undefined) { v.c10 = m; v.c10live = live; }
    const M = meta(r.sym), av = avgVol.get(r.sym) || (r.prevV > 0 ? r.prevV : 0), rv = r.vol !== null && av > 0 ? r.vol / av : null, hits = [], rvT = rv !== null && cf ? rv / cf : null;
    // EARLY-WAVE OBSERVATION (23 Oct): +2% to +15% with elevated volume pace, sub-$1 included; logged only, never an alert or a buy
    try { const ewc = scoreEarlyWaveCandidate({ change: chg, rv, rvT, live, price: r.price, oneMinuteChange: prevSeenPx > 0 ? r.price / prevSeenPx - 1 : null }); updateEarlyWaveCandidate(earlyWave, r.sym, ewc, fmtM(m));
      const dv = r.vol > 0 ? r.vol * r.price : 0; SR.tick({ sym: r.sym, m, price: r.price, live });
      if (ewc) { EA.noteLead({ sym: r.sym, m, price: r.price, chg, score: ewc.score, rvT, dollarVol: dv, live, bid: r.bid, ask: r.ask, qAgeSec: r.qt > 0 ? (nowMs - r.qt) / 1000 : null });
        SR.early({ sym: r.sym, m, price: r.price, chg, score: ewc.score, rv, rvT, dollarVol: dv, live, bid: r.bid, ask: r.ask, qAgeSec: r.qt > 0 ? (nowMs - r.qt) / 1000 : null, fc: v.fc, hard: { under1: r.price < 1, halalFail: notHalal(r.sym), lottery: LOTT[r.sym] || 0 } }); } } catch (e) {}
    if (!(r.prevC >= 1)) { if (chg >= 0.10) flag(r.sym, 'under1', 'under 1 USD (never traded by these rules)'); continue; }
    if (r.vol > 0 && avgVol.has(r.sym)) { sumV += r.vol; sumA += avgVol.get(r.sym); }   // no 20-day history (new listing, was under 1 USD): yesterday's volume stands in
    // minute price series from live quotes (for the build-up rule)
    if (live) { const S = ser[r.sym] || (ser[r.sym] = []); if (!S.length || S[S.length - 1].m !== m) { S.push({ m, p: r.price }); if (S.length > 35) S.shift(); } }
    for (const R of IG_RULES) { const k = R.id; if (seen[r.sym + k] || R.pull) continue;
      if (!live) { if (chg >= (R.trig || 0.05)) flag(r.sym, 'stale', 'its price was older than 3 minutes when it qualified (not used; the rule waits for a fresh price)'); continue; }   // (outside review, 22 Oct) a stale price may neither consume the one-shot flag nor become a signal
      if (R.orb) { if (m < 575 || m >= R.by || !(r.open / r.prevC - 1 >= R.gap)) continue;
        if (orb[r.sym] === undefined) { orb[r.sym] = false; orb[r.sym] = (await openingRange(r.sym)) || null; } const o = orb[r.sym]; if (!o || !(r.price > o.orH)) continue;
        seen[r.sym + k] = 1; if (R.pmRv && !(av > 0 && o.pm / av >= R.pmRv)) continue; if (!passes(R, r.prevC, M)) continue; hits.push({ R, extra: { orH: o.orH, orL: o.orL } }); continue; }
      if (chg < R.trig) continue;
      seen[r.sym + k] = 1;
      if (m >= R.by) { flag(r.sym, 'after11', 'first reached +' + Math.round(R.trig * 100) + '% after 11:00 New York'); continue; }
      if (!passes(R, r.prevC, M)) continue;
      if (rv === null || rv < R.rv) { flag(r.sym, rv === null ? 'noVolHist' : rv < 0.05 ? 'volLate' : 'lowVol', rv === null ? 'no normal-volume history' : rv < 0.05 ? 'volume figure late (' + rv.toFixed(2) + 'x shown: the delayed feed had not counted the trading yet)' : 'volume so far only ' + rv.toFixed(1) + 'x a FULL normal day when it crossed (this rule needs ' + R.rv + 'x' + (rvT !== null ? '; time-of-day pace ' + rvT.toFixed(1) + 'x normal' : '') + ')'); triggers.push({ v: IG_VERSION, d: day, sym: r.sym, rule: k, m, price: r.price, prevC: r.prevC, rv, mode, delay: rd, logged: rv === null ? 'volume unknown' : 'volume too low' }); continue; }
      hits.push({ R, extra: {} }); }
    // IG8 quiet build-up (live-only rule): needs 15+ minutes of live prices
    if (IG8 && live && (!seen[r.sym + 'IG8'] || (IG8T && !seen[r.sym + 'IG8T'])) && m >= 585 && m < 840 && r.price >= 1 && r.open > 0 && av > 0 && r.vol !== null) { const S = ser[r.sym] || [], n = S.length, p0 = S.find(x => x.m >= m - 16 && x.m <= m - 14);
      if (n >= 6 && p0) { const r15 = r.price / p0.p - 1, last6 = S.slice(-6); let ups = 0; for (let i = 1; i < last6.length; i++) if (last6[i].p > last6[i - 1].p) ups++;
        const win = S.filter(x => x.m >= m - 30), hi = Math.max(...win.map(x => x.p)), lo = Math.min(...win.map(x => x.p)), loc = hi > lo ? (r.price - lo) / (hi - lo) : 0.5, pace = r.vol / (av * Math.max(0.05, (m - 15 - 570) / 390));
        const shape = r15 >= 0.02 && r15 <= 0.08 && ups >= 4 && r.price / hi >= 0.97 && loc >= 0.65 && r.price / r.open - 1 <= 0.12;
        if (shape && pace >= 1.5 && !seen[r.sym + 'IG8']) { seen[r.sym + 'IG8'] = 1; hits.push({ R: IG8, extra: { r15: +r15.toFixed(3), pace: +pace.toFixed(1) }, liveOnly: true }); }
        if (shape && IG8T && rvT !== null && rvT >= 1.5 && !seen[r.sym + 'IG8T']) { seen[r.sym + 'IG8T'] = 1; hits.push({ R: IG8T, extra: { r15: +r15.toFixed(3), paceT: +rvT.toFixed(1) }, liveOnly: true }); } } }
    // IG9 first orderly pullback (live, from minute prices): starts after a qualified +10% cross before 11:00
    { const R9 = IG_RULES.find(x => x.id === 'IG9');
      if (R9 && live && !seen[r.sym + 'IG9']) { let ps = pull[r.sym];
        if (!ps && chg >= R9.trig && m < R9.by && rv !== null && rv >= R9.rv && passes(R9, r.prevC, M)) ps = pull[r.sym] = { hi: r.price, low: Infinity, pulled: false };
        if (ps) { if (m >= R9.entryBy || r.price < r.prevC * 1.06 || r.price < ps.hi * 0.88) { seen[r.sym + 'IG9'] = 1; delete pull[r.sym]; }
          else if (!ps.pulled) { ps.hi = Math.max(ps.hi, r.price); if (r.price <= ps.hi * 0.96) { ps.pulled = true; ps.low = r.price; } }
          else { ps.low = Math.min(ps.low, r.price); const prev = (ser[r.sym] || []).slice(-4, -1).map(x => x.p);
            if (prev.length === 3 && r.price > Math.max(...prev) && r.price > ps.low) { seen[r.sym + 'IG9'] = 1; hits.push({ R: R9, extra: { stop: +ps.low.toFixed(4), hi: +ps.hi.toFixed(4) } }); } } } } }
    for (const h of hits) { const t = { v: IG_VERSION, d: day, sym: r.sym, rule: h.R.id, m, price: r.price, prevC: r.prevC, rv: rv === null ? null : +rv.toFixed(2), rvT: rvT === null ? null : +rvT.toFixed(2), float: M.float || null, age: M.age, adr5: avgRange5.get(r.sym) && r.hi > 0 && r.lo > 0 ? +((Math.max(r.hi, r.price) - Math.min(r.lo, r.price)) / avgRange5.get(r.sym)).toFixed(2) : null, mode, delay: rd === null ? null : +rd.toFixed(1), ...h.extra }; triggers.push(t);
      if (vis[r.sym] && !vis[r.sym].caught) vis[r.sym].caught = h.R.id + ' at ' + fmtM(m);
      await maybeAlert(r, t, h.R, chg, rd, rv, M, h.extra, !!h.liveOnly); if (!(vis[r.sym] && vis[r.sym].flags.alerted)) EA.notePaper(t, chg, { bid: r.bid, ask: r.ask, qAgeSec: r.qt > 0 ? (Date.now() - r.qt) / 1000 : null }); } }
  const bySym = new Map(rows.map(x => [x.sym, x]));
  try { await pollEdgar(m); await decideFilings(m, bySym); controlSample(m, rows); } catch (e) { console.log('sec feed / control: ' + e.message); }   // D and R0 (rank-models.mjs)
  if (triggers.length > tStart) {   // shadow stream: every rule trigger this minute, including the held-back ones
    for (const t of triggers.slice(tStart)) { const x = bySym.get(t.sym) || {}; try { SR.trigger(t, { bid: x.bid, ask: x.ask, qAgeSec: x.qt > 0 ? (Date.now() - x.qt) / 1000 : null, dollarVol: x.vol > 0 ? x.vol * x.price : 0, fc: vis[t.sym] ? vis[t.sym].fc : null, hard: { under1: t.price < 1, halalFail: notHalal(t.sym), lottery: LOTT[t.sym] || 0 } }); } catch (e) {} } }
  try { await EA.process(); } catch (e) { console.log('early alerts: ' + e.message); }
  if (sumA > 0) vcToday[Math.floor(m / 5) * 5] = +(sumV / sumA).toFixed(4);   // the market's share of a normal day traded by now
  const sa = ages.sort((a, b) => a - b), q = (a, f) => a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * f))].toFixed(1) : null;
  beat.push({ m, mode, received: rows.length, evaluated: evald, live: liveN, ageP50: q(sa, 0.5), ageP95: q(sa, 0.95), volAgeP50: q(vages.sort((a, b) => a - b), 0.5), alerts });   // heartbeat: proves the watcher ran this minute
  if (m >= 675 && !RADAR.done) { RADAR.done = true; try { await radarSnap(m, rows.length, liveN); } catch (e) { console.log('radar: ' + e.message); } }   // 11:15 New York
  if (loops % 30 === 1) console.log(fmtM(m) + ' New York [' + mode + ']: ' + rows.length + ' stocks received, ' + liveN + ' with a live price (median price age ' + q(sa, 0.5) + ' min), ' + triggers.length + ' ignitions so far, ' + alerts + ' alerts');
  const wait = 60000 - (Date.now() - nowMs); if (wait > 0) await sleep(wait);
}
const movers = Object.values(vis).filter(v => v.maxC >= 0.15), missed = buildMissed();
const tally = {}; for (const x of missed) tally[x.code] = (tally[x.code] || 0) + 1;
const modes = {}; for (const b of beat) modes[b.mode] = (modes[b.mode] || 0) + 1;
const med = (a) => { const s = a.filter(x => x !== null && x !== undefined).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const session = sessionCoverage(beat);   // Full intended 09:30–15:00 NY session, unique observed minutes.
const coverage = beat.length ? { minutesWatched: beat.length, firstMinute: fmtM(beat[0].m), lastMinute: fmtM(beat[beat.length - 1].m), minutesCompletedRate: session.rate, completeSession: session.complete, expectedMinutes: session.expectedMinutes, observedMinutes: session.observedMinutes, modes,
  receivedMedian: med(beat.map(b => b.received)), evaluatedMedian: med(beat.map(b => b.evaluated)), liveMedian: med(beat.map(b => b.live)), liveRate: med(beat.map(b => b.evaluated ? +(b.live / b.evaluated).toFixed(3) : null)),
  priceAgeP50Min: med(beat.map(b => b.ageP50)), priceAgeP95Min: med(beat.map(b => b.ageP95)), volumeAgeP50Min: med(beat.map(b => b.volAgeP50)),
  moversLiveBeforePlus5: movers.filter(v => v.lm !== undefined && v.lc < 0.05).length, moversFirstLiveAfterPlus10: movers.filter(v => v.lm !== undefined && v.lc >= 0.10).length, moversNeverLive: movers.filter(v => v.lm === undefined).length } : null;
if (!session.complete) console.error('INCOMPLETE WATCHER SESSION: observed ' + session.observedMinutes + '/330 market minutes (rate ' + session.rate + '); do not interpret missed-runner counts or daily coverage as complete.');
if (Object.keys(vcToday).length >= 12) { VC.days[day] = vcToday; for (const d of Object.keys(VC.days).sort().slice(0, -25)) delete VC.days[d]; fs.writeFileSync('data/vol-curve.json', JSON.stringify(VC)); }
fs.writeFileSync('data/ignition-live.json', JSON.stringify({ version: IG_VERSION, day, mode, src, note, loops, coverage, alerts, triggers, missed: missed.slice(0, 150), tally, heartbeat: beat }, null, 1));
// FEED-FIXABLE: a data-feed miss that real-time prices could actually have helped = not visible/late live AND not already up 10%+
// at the open AND not gapped 20%+ before 9:25 (a gap happens before any feed can help). Real-time cannot fix the rest.
const DATA_CODES = new Set(['NOT_VISIBLE_LIVE', 'NO_LIVE_PRICE_AT_SIGNAL', 'VISIBLE_TOO_LATE', 'VOLUME_FIGURE_LATE']), dataMiss = missed.filter(x => DATA_CODES.has(x.code)),
  gapLike = (x) => (x.preMarketGap !== null && x.preMarketGap >= 0.2) || (x.openGap !== null && x.openGap >= 0.10) || (/^0?9:3[0-5]/.test(String(x.firstSeen)) && x.firstSeenUp >= 0.10), feedFix = dataMiss.filter(x => !gapLike(x));
const edgar = { polls: EF.polls, fails: EF.fails, firstOk: EF.firstOkM === null ? null : fmtM(EF.firstOkM), filings: EF.filings, decided: EF.decided, eligibleD: EF.eligible, noLivePrice: EF.noPrice, medianLatencySec: EF.lat.length ? EF.lat.sort((a, b) => a - b)[Math.floor(EF.lat.length / 2)] : null };   // feed readiness, measured
fs.appendFileSync('data/ignition-days.jsonl', JSON.stringify({ day, procStart: PROC_START, edgar, mode, feedFix: feedFix.length, feedGapLike: dataMiss.length - feedFix.length, feedFixAges: feedFix.map(x => x.firstQuoteAgeMin).filter(v => v !== null).slice(0, 50), liveRate: coverage ? coverage.liveRate : null, minutes: coverage ? coverage.minutesWatched : 0, sessionComplete: coverage ? coverage.completeSession : false, sessionCoverageRate: coverage ? coverage.minutesCompletedRate : 0, firstMinute: coverage ? coverage.firstMinute : null, movers: missed.length, tally, alerts }) + '\n');   // one line a day: why each 15%+ mover was or was not caught (the 'missed' report reads the history)
{ const ewl = Object.values(earlyWave).sort((x, y) => y.score - x.score); if (ewl.length) fs.appendFileSync('data/early-wave-obs.jsonl', JSON.stringify({ day, mode, src, n: ewl.length, top: ewl.slice(0, 300) }) + '\n'); }   // judged later against matched stocks; not a signal
fs.appendFileSync('data/ignition-paper.jsonl', triggers.filter(t => !t.logged).map(t => JSON.stringify(t) + '\n').join(''));
// SHADOW STREAM (Phase 1): the day's candidates, gzipped (about 1,000-2,000 rows); outcomes are added after the close by shadow-outcomes.mjs
try { const rs = SR.rows(); if (rs.length) { fs.mkdirSync('data/shadow', { recursive: true }); fs.writeFileSync('data/shadow/' + day + '.jsonl.gz', zlib.gzipSync(rs.map(x => JSON.stringify(x)).join('\n') + '\n')); console.log('shadow stream: ' + rs.length + ' candidates saved'); } } catch (e) { console.log('shadow stream: ' + e.message); }
// DELIVERY SCORECARD: every candidate that met an alert trigger (or was a rule hit) with its decision and 15:00 result; soft misses are
// counted in the day's summary only (about 1,500 a day would bloat the public repo)
try { const lastPx = {}; for (const v of Object.values(vis)) if (v.last > 0) lastPx[v.sym] = v.last; const E = EA.finish(lastPx, null, alerts), keep = E.rows.filter(r => !/^SOFT/.test(r.decision));
  if (keep.length) fs.appendFileSync('data/opp-ledger.jsonl', keep.map(r => JSON.stringify(r)).join('\n') + '\n'); fs.appendFileSync('data/opp-days.jsonl', JSON.stringify(E.summary) + '\n'); } catch (e) { console.log('delivery scorecard: ' + e.message); }
// OPPORTUNITY RADAR same-day score (pre-registered in radar-v3-core.mjs): each line listed at 11:15 gets its last watched price and the
// median $1+ stock's move over the same minutes, so the radar is judged against the average stock, not only against zero.
try { if (RADAR.done) { const L = fs.existsSync('data/radar-v3-ledger.jsonl') ? fs.readFileSync('data/radar-v3-ledger.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [], mEnd = medChg();
  const mkt = RADAR.mkt !== null && mEnd !== null ? +((1 + mEnd) / (1 + RADAR.mkt) - 1).toFixed(4) : null, have = new Set(L.filter(r => r.type === 'close' && r.d === day).map(r => r.sym));
  const rows = [...new Set(L.filter(r => r.type === 'list' && r.d === day).map(r => r.sym))].filter(s => !have.has(s) && vis[s] && vis[s].last > 0).map(s => JSON.stringify({ type: 'close', d: day, sym: s, px: vis[s].last, mkt }));
  if (rows.length) fs.appendFileSync('data/radar-v3-ledger.jsonl', rows.join('\n') + '\n'); } } catch (e) { console.log('radar close rows: ' + e.message); }
console.log('ignition watcher: ' + loops + ' minutes, modes ' + JSON.stringify(modes) + (note ? ' [' + note + ']' : '') + ', ' + triggers.length + ' ignitions, ' + alerts + ' alerts, ' + missed.length + ' movers of 15%+ audited ' + JSON.stringify(tally));
