// IGNITION WATCHER: runs during the US session (about 9:20 to 15:00 New York, a long GitHub Actions job) and checks the whole
// market every minute for stocks that START to run (rules in ignition-core.mjs). Every ignition is logged on PAPER and scored the
// next morning on minute bars. You get an ALERT only when the rule passed the minute-by-minute test (data/ignition-lab.json), only
// on live prices (3 minutes old or less), only without a recent share sale or delisting notice at the SEC, at most 6 a day.
// It also keeps a MISSED-MOVER AUDIT: every stock that ran 15%+ today, when the watcher first saw it, how far it had already run,
// and why it was or was not caught. Read-only; never places an order.
// Data: Massive full-market snapshot (volume, previous close; on the Starter plan it is 15 minutes late). When it is late,
// real-time PRICES come from Alpaca's movers list (top 50 gainers); volume stays the late Massive figure, which only undercounts.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { IG_RULES, trigger, passes, fmtM, nyOffset, toBars } from './ignition-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const MV = local(env.MASSIVE_BASE) || 'https://api.massive.com', ALPD = local(env.ALPACA_DATA) || 'https://data.alpaca.markets', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const SEC_WWW = local(env.SEC_BASE) || 'https://www.sec.gov', SEC_DATA = local(env.SEC_BASE) || 'https://data.sec.gov', SEC_UA = env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com';
const FAST = Boolean(local(env.MASSIVE_BASE)), sleep = (ms) => new Promise(r => setTimeout(r, FAST ? 0 : ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const pc = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', CDIR = env.FM_CACHE_DIR || 'fm-cache';
const nyDay = () => new Date(Date.now() + nyOffset(new Date().toISOString().slice(0, 10)) * 60000).toISOString().slice(0, 10);
const nyMin = () => { const d = new Date(Date.now() + nyOffset(nyDay()) * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const day = env.IG_DAY || nyDay(), wd = new Date(day + 'T12:00:00Z').getUTCDay(), START = Date.now(), MAXMS = +(env.IG_RUN_MIN || 345) * 60000;
const clock = () => env.IG_FAKE_MIN ? +env.IG_FAKE_MIN + Math.floor((Date.now() - START) / 60000) : nyMin();
const kuwait = (m) => fmtM(((m - nyOffset(day) + 180) % 1440 + 1440) % 1440);
if (wd === 0 || wd === 6) { console.log('ignition watcher: weekend'); process.exit(0); }
if (clock() < 540 || clock() > 900) { console.log('ignition watcher: outside 9:00-15:00 New York (' + fmtM(clock()) + '), nothing to do'); process.exit(0); }
// ---- each stock's normal daily volume, float, and how long it has traded (from the fast-mover cache)
const avgVol = new Map(), firstSeen = new Map(); let sessions = 0;
try { const S = JSON.parse(zlib.gunzipSync(fs.readFileSync(CDIR + '/fm.json.gz')).toString()), D = Object.keys(S.days).sort(); sessions = D.length;
  const last = D.slice(-20), sum = new Map(); for (const d of last) { const x = S.days[d]; for (let j = 0; j < x.T.length; j++) sum.set(x.T[j], (sum.get(x.T[j]) || 0) + x.v[j]); }
  for (const [s, v] of sum) avgVol.set(s, v / last.length);
  D.forEach((d, t) => { const x = S.days[d]; for (const s of x.T) if (!firstSeen.has(s)) firstSeen.set(s, t); }); } catch (e) { console.log('ignition watcher: no fast-mover cache yet (volume rules cannot be checked)'); }
const floats = readJson(CDIR + '/floats.json', {}), meta = (s) => ({ float: floats[s] && floats[s].f, age: firstSeen.has(s) && firstSeen.get(s) > 5 ? sessions - firstSeen.get(s) : (sessions >= 250 ? 999 : null) });
const LAB = readJson('data/ignition-lab.json', null), passed = LAB && LAB.rules ? Object.values(LAB.rules).filter(x => x.verdict === 'PROMISING') : [];
const halal = readJson('data/halal.json', {}), notHalal = (s) => halal[s] && halal[s].s === 'fail';
// ---- data
let src = null, note = '';
async function snapMassive() {
  try { const r = await fetch(MV + '/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=' + encodeURIComponent(env.MASSIVE_KEY || '')); if (r.status === 401 || r.status === 403) { note = 'Massive snapshot not in the plan (HTTP ' + r.status + ')'; return null; } if (!r.ok) return []; const j = await r.json();
    return (j.tickers || []).filter(x => /^[A-Z]{1,5}$/.test(x.ticker || '')).map(x => { const lt = x.lastTrade || {}, mn = x.min || {}, dy = x.day || {}, pd = x.prevDay || {}, tms = lt.t ? lt.t / 1e6 : mn.t || (x.updated ? x.updated / 1e6 : 0);
      return { sym: x.ticker, price: +(lt.p || mn.c || dy.c || 0), prevC: +(pd.c || 0), open: +(dy.o || 0), vol: +(mn.av || dy.v || 0), t: tms }; }); } catch (e) { return []; } }
async function snapAlpaca() {
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET) return null; const H = { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET };
  try { const r = await fetch(ALPD + '/v1beta1/screener/stocks/movers?top=50', { headers: H }); if (!r.ok) { if (!note.includes('Alpaca')) note += (note ? '; ' : '') + 'Alpaca movers HTTP ' + r.status; return null; } const j = await r.json(), syms = (j.gainers || []).map(x => x.symbol).filter(s => /^[A-Z]{1,5}$/.test(s)); if (!syms.length) return [];
    const q = await fetch(ALPD + '/v2/stocks/snapshots?feed=iex&symbols=' + syms.join(','), { headers: H }), sj = q.ok ? await q.json() : {};
    return syms.map(s => { const x = sj[s] || {}, lt = x.latestTrade || {}, db = x.dailyBar || {}, pb = x.prevDailyBar || {}; return { sym: s, price: +(lt.p || db.c || 0), prevC: +(pb.c || 0), open: +(db.o || 0), vol: null, t: lt.t ? Date.parse(lt.t) : 0 }; }); } catch (e) { return null; } }
async function snap() {
  const m = env.MASSIVE_KEY ? await snapMassive() : null, now = Date.now();
  const late = !m || !m.length ? Infinity : (() => { const d = m.filter(r => r.t > 0).map(r => (now - r.t) / 60000).sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : Infinity; })();
  if (m && m.length && late <= 3) { src = 'massive (live)'; return m; }
  const a = await snapAlpaca();
  if (!a || !a.length) { src = m && m.length ? 'massive (late ' + Math.round(late) + ' min)' : 'none'; return m || []; }
  src = m && m.length ? 'alpaca prices + massive volume (late)' : 'alpaca only (no volume)';
  const byM = new Map((m || []).map(r => [r.sym, r]));
  for (const r of a) { const x = byM.get(r.sym); r.vol = x ? x.vol : null; if (!(r.prevC > 0) && x) r.prevC = x.prevC; if (!(r.open > 0) && x) r.open = x.open; byM.set(r.sym, r); }
  return [...byM.values()];
}
async function minuteBars(sym) { try { const r = await fetch(MV + `/v2/aggs/ticker/${sym}/range/1/minute/${day}/${day}?adjusted=true&sort=asc&limit=50000&apiKey=` + encodeURIComponent(env.MASSIVE_KEY || '')); if (!r.ok) return null; return toBars((await r.json()).results, day); } catch (e) { return null; } }
async function openingRange(sym) {   // first 5 minutes (9:30-9:34) and the pre-market volume, from minute bars
  const b = await minuteBars(sym); if (!b) return null; const o = b.filter(x => x[0] >= 570 && x[0] <= 574);
  if (o.length < 3) return null; return { orH: Math.max(...o.map(x => x[2])), orL: Math.min(...o.map(x => x[3])), pm: b.filter(x => x[0] < 570).reduce((a, x) => a + x[5], 0) }; }
// SEC check before any alert: a share sale, registration or delisting notice in the last 30 days blocks the alert (logged on paper)
let TICK = null;
async function secRisk(sym) {
  const H = { headers: { 'User-Agent': SEC_UA, 'Accept': 'application/json' } };
  try { if (!TICK) { const r = await fetch(SEC_WWW + '/files/company_tickers.json', H); TICK = {}; if (r.ok) for (const x of Object.values(await r.json())) TICK[String(x.ticker || '').toUpperCase()] = x.cik_str; }
    const cik = TICK[sym]; if (!cik) return { known: false, tags: [] };
    const r = await fetch(SEC_DATA + '/submissions/CIK' + String(cik).padStart(10, '0') + '.json', H); if (!r.ok) return { known: false, tags: [] }; const R = (await r.json()).filings.recent, since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), tags = new Set();
    for (let k = 0; k < Math.min(R.form.length, 60); k++) { if (String(R.filingDate[k]) < since) break; const f = String(R.form[k]).toUpperCase(), it = String((R.items || [])[k] || '');
      if (/^424B[1-5]$|^S-1|^S-3|^F-1|^F-3/.test(f)) tags.add('share sale / registration (' + f + ')'); if (f === '8-K' && /3\.01/.test(it)) tags.add('exchange listing-rule notice (delisting risk)'); if (f === '8-K' && /3\.02/.test(it)) tags.add('private share sale (8-K 3.02)'); if (/^NT 10-[KQ]/.test(f)) tags.add('late financial report (' + f + ')'); }
    return { known: true, tags: [...tags] }; } catch (e) { return { known: false, tags: [] }; } }
async function tg(text) { if (!env.TG_TOKEN || !env.TG_CHAT) { console.log('[alert]\n' + text); return; } await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text, disable_web_page_preview: true }) }).catch(() => {}); }
// ---- the loop
const seen = {}, orb = {}, triggers = [], delays = [], audit = {}; let alerts = 0, loops = 0;
const note1 = (sym, k, v) => { const a = audit[sym]; if (a && !a[k]) a[k] = v; };
while (Date.now() - START < MAXMS) {
  const m = clock(); if (m > 900) break; if (m < 568) { await sleep(30000); continue; }
  const rows = await snap(); loops++; const nowMs = Date.now();
  const ds = rows.filter(r => r.t > 0).map(r => (nowMs - r.t) / 60000).sort((a, b) => a - b); if (ds.length) delays.push(ds[Math.floor(ds.length / 2)]);
  for (const r of rows) { if (!(r.prevC > 0) || !(r.price > 0)) continue; const chg = r.price / r.prevC - 1, rd = r.t > 0 ? (nowMs - r.t) / 60000 : null;
    if (chg >= 0.10) { const a = audit[r.sym] || (audit[r.sym] = { sym: r.sym, firstM: m, firstChg: chg, maxChg: chg, prevC: r.prevC }); a.maxChg = Math.max(a.maxChg, chg); a.lastPrice = r.price; }
    if (!(r.prevC >= 1)) { if (chg >= 0.10) note1(r.sym, 'why', 'under 1 USD (never traded by these rules)'); continue; }
    const M = meta(r.sym), av = avgVol.get(r.sym) || 0, rv = r.vol !== null && av > 0 ? r.vol / av : null, hits = [];
    for (const R of IG_RULES) { const k = R.id; if (seen[r.sym + k]) continue;
      if (R.orb) { if (m < 575 || m >= R.by || !(r.open / r.prevC - 1 >= R.gap)) continue;
        if (orb[r.sym] === undefined) { orb[r.sym] = false; orb[r.sym] = (await openingRange(r.sym)) || null; } const o = orb[r.sym]; if (!o || !(r.price > o.orH)) continue;
        if (R.pmRv && !(av > 0 && o.pm / av >= R.pmRv)) { seen[r.sym + k] = 1; continue; }
        if (!passes(R, r.prevC, M)) { seen[r.sym + k] = 1; continue; } seen[r.sym + k] = 1; hits.push({ R, extra: { orH: o.orH, orL: o.orL } }); continue; }
      if (chg < R.trig) continue;
      if (m >= R.by) { seen[r.sym + k] = 1; note1(r.sym, 'why', 'first reached +' + Math.round(R.trig * 100) + '% after 11:00 New York (rules only buy early runs)'); continue; }
      if (!passes(R, r.prevC, M)) { seen[r.sym + k] = 1; continue; }
      seen[r.sym + k] = 1;
      if (rv === null || rv < R.rv) { note1(r.sym, 'why', rv === null ? 'volume unknown (no normal-volume history)' : 'volume only ' + rv.toFixed(1) + 'x a normal day when it crossed'); triggers.push({ d: day, sym: r.sym, rule: k, m, price: r.price, prevC: r.prevC, rv, src, delay: rd, logged: rv === null ? 'volume unknown' : 'volume too low' }); continue; }
      hits.push({ R, extra: {} }); }
    for (const h of hits) { const t = { d: day, sym: r.sym, rule: h.R.id, m, price: r.price, prevC: r.prevC, rv: rv === null ? null : +rv.toFixed(2), float: M.float || null, age: M.age, src, delay: rd === null ? null : +rd.toFixed(1), ...h.extra }; triggers.push(t); note1(r.sym, 'caught', h.R.id + ' at ' + fmtM(m));
      const ok = passed.filter(p => p.rule === h.R.id); if (!ok.length) { note1(r.sym, 'why', 'caught by ' + h.R.id + ' (paper only: the rule has not passed its test)'); continue; }
      if (alerts >= 6 || notHalal(r.sym)) continue; if (rd === null || rd > 3) { note1(r.sym, 'why', 'caught, but the price data was ' + (rd === null ? '?' : Math.round(rd)) + ' minutes old: too late to alert'); continue; }
      const risk = await secRisk(r.sym); if (risk.tags.length) { t.blocked = risk.tags; note1(r.sym, 'why', 'alert blocked: ' + risk.tags.join(', ')); continue; }
      alerts++; t.alerted = true; if (audit[r.sym]) audit[r.sym].why = 'ALERTED (' + h.R.id + ')';
      const ex = ok.sort((a, b) => (b.results.newer.avg || 0) - (a.results.newer.avg || 0))[0], res = ex.results.newer, stop = h.R.orb ? h.extra.orL : r.price * 0.92;
      await tg(['IGNITION ALERT (tested rule passed): ' + r.sym + ' ' + pc(chg) + ' at ' + fmtM(m) + ' New York (' + kuwait(m) + ' Kuwait, ' + (rd < 1 ? 'live' : Math.round(rd) + ' min old') + ' price)',
        'Price ' + r.price.toFixed(2) + ' | volume ' + (rv === null ? 'n/a' : rv.toFixed(1) + 'x a normal day already') + (M.float ? ' | float ' + (M.float / 1e6).toFixed(1) + 'M shares' : '') + (M.age !== null && M.age < 250 ? ' | traded only ' + M.age + ' sessions' : '') + (risk.known ? ' | SEC: no share sale or delisting notice in 30 days' : ' | SEC: not checked'),
        'BUY only up to ' + (r.price * 1.03).toFixed(2) + ' (3% above now; higher = skip). STOP ' + stop.toFixed(2) + '. EXIT: ' + ex.exitName + ' (sell before 11 pm Kuwait at the latest).',
        'Rule: ' + h.R.name + '. Tested minute by minute: ' + Math.round(res.win * 100) + '% won, average ' + pc(res.avg) + ' a trade after costs (' + res.n + ' trades in the newer year).',
        'Check ZAD first. 1,000 USD at most. Fast, risky trade. Not financial advice, not a halal ruling.'].join('\n')); } }
  if (loops % 30 === 1) console.log(fmtM(m) + ' New York: ' + rows.length + ' stocks checked, data ' + src + (ds.length ? ' (' + ds[Math.floor(ds.length / 2)].toFixed(1) + ' min old)' : '') + ', ' + triggers.length + ' ignitions so far, ' + alerts + ' alerts, ' + Object.keys(audit).length + ' stocks up 10%+ seen');   // a sign of life every 30 minutes
  const wait = 60000 - (Date.now() - nowMs); if (wait > 0) await sleep(wait);
}
// ---- save: today's ignitions (scored tomorrow morning on minute bars) and the missed-mover audit
const avgDelay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null;
const missed = Object.values(audit).filter(a => a.maxChg >= 0.15).map(a => ({ sym: a.sym, firstSeen: fmtM(a.firstM), alreadyUp: +a.firstChg.toFixed(3), maxUp: +a.maxChg.toFixed(3), result: a.caught ? 'caught (' + a.caught + ')' : 'not caught', why: a.why || (a.firstM <= 575 ? 'already up ' + Math.round(a.firstChg * 100) + '% at the open (gap): only the opening-range rules apply' : 'no rule fired') })).sort((a, b) => b.maxUp - a.maxUp);
const tally = {}; for (const x of missed) { const k = x.why.replace(/ \(.*$/, '').replace(/^volume only .*/, 'low volume when it crossed').replace(/\d+ minutes old.*/, 'data too late').replace(/already up \d+% at the open.*/, 'gapped up at the open'); tally[k] = (tally[k] || 0) + 1; }
fs.writeFileSync('data/ignition-live.json', JSON.stringify({ day, src, note, loops, avgDelayMin: avgDelay === null ? null : +avgDelay.toFixed(1), alerts, triggers, missed: missed.slice(0, 80), tally }, null, 1));
fs.appendFileSync('data/ignition-paper.jsonl', triggers.filter(t => !t.logged).map(t => JSON.stringify(t) + '\n').join(''));
console.log('ignition watcher: ' + loops + ' checks, data ' + (src || 'none') + (avgDelay === null ? '' : ' (' + avgDelay.toFixed(1) + ' min old on average)') + (note ? ' [' + note + ']' : '') + ', ' + triggers.length + ' ignitions, ' + alerts + ' alerts, ' + missed.length + ' movers of 15%+ audited');
