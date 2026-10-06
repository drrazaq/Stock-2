// Cloud scanner for the US stock signal board. Runs on GitHub Actions (free), so it works while your phone is off.
// It reuses the exact rules inside index.html, writes data/signals.json and an append-only journal, and sends Telegram alerts.
// Read only: it holds no broker login and cannot trade.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const env = process.env, MODE = env.MODE === 'intraday' ? 'intraday' : env.MODE === 'chat' ? 'chat' : 'daily', RATE = Math.max(1, parseInt(env.RATE || '8', 10) || 8);
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', FMPB = local(env.FMP_BASE) || 'https://financialmodelingprep.com';
const TD = local(env.TD_BASE) || 'https://api.twelvedata.com', TG = local(env.TG_BASE) || 'https://api.telegram.org', FAST = Boolean(local(env.TD_BASE));
if (!env.TWELVE_KEY) { console.error('Missing secret TWELVE_KEY'); process.exit(1); }

// The rules come from the page itself, so the page and the scanner can never disagree.
const html = fs.readFileSync('index.html', 'utf8'), m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
if (!m) { console.error('index.html has no logic block. Upload the latest index.html first.'); process.exit(1); }
const tmp = path.join(os.tmpdir(), 'logic-' + Date.now() + '.cjs'); fs.writeFileSync(tmp, m[1]);
const L = createRequire(import.meta.url)(tmp);

const DEFAULT = 'SPY QQQ IWM DIA AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO AMD NFLX ORCL CRM JPM BAC V MA UNH LLY JNJ XOM CVX WMT COST HD PG KO PEP DIS'.split(' ');
const fromFile = fs.existsSync('watchlist.txt') ? fs.readFileSync('watchlist.txt', 'utf8').toUpperCase().split(/[\s,]+/).filter(s => /^[A-Z.\-]{1,8}$/.test(s)) : [];
// Candidates from the discovery engine are tested automatically, so a Buy watch with prices is sent if a tested rule fires on one.
let DISC = new Set(), BIOBLOCK = new Map(), DISCMETA = null;
try { DISCMETA = JSON.parse(fs.readFileSync('data/discovery.json', 'utf8')); const cs = DISCMETA.candidates || []; DISC = new Set(cs.map(c => c.sym).filter(x => /^[A-Z.\-]{1,8}$/.test(x))); for (const c of cs) if (c.bio && (c.bio.risk === 'high' || c.bio.risk === 'unknown')) BIOBLOCK.set(c.sym, c.bio.text); } catch {}
const EXTRA_FILE = 'data/watch-extra.json', readExtra = () => { try { const a = JSON.parse(fs.readFileSync(EXTRA_FILE, 'utf8')); return Array.isArray(a) ? a.filter(x => /^[A-Z.\-]{1,8}$/.test(x)) : []; } catch { return []; } };
const MAIN = ['SPY', ...new Set([...(fromFile.length ? fromFile : DEFAULT), ...readExtra(), ...DISC].filter(s => s !== 'SPY'))].slice(0, 1000);
// Extra large, heavily traded companies scanned for QUICK TRADES only. Short bounces behave best in liquid names.
const QEXTRA = env.NO_QUICK_EXTRA ? [] : 'ABBV ABT ACN ADBE AMAT AMGN BKNG BMY CAT COP CSCO CVS DE DHR GE GILD HON IBM INTC INTU ISRG LIN LOW MCD MDT MMM MRK NEE NKE NOW PFE QCOM SBUX SO T TGT TMO TMUS TXN UNP UPS VZ PLTR UBER SHOP PANW MU ADP SPGI TJX VRTX REGN ZTS CI ELV'.split(' ').filter(x => !MAIN.includes(x));
const FMOVERS = (() => { try { const f = JSON.parse(fs.readFileSync('data/fm-state.json', 'utf8')); return Object.keys(f.sent || {}).filter(x => /^[A-Z]{1,5}$/.test(x) && !MAIN.includes(x) && !QEXTRA.includes(x)).slice(0, 12); } catch { return []; } })();
const QONLY = new Set([...QEXTRA, ...FMOVERS]), LIST = [...MAIN, ...QEXTRA, ...FMOVERS];

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
async function telegram(text) {
  if (!env.TG_TOKEN || !env.TG_CHAT) { console.log('[no Telegram secrets, message not sent]\n' + text); return; }
  for (let i = 0; i < text.length; i += 3800) {
    const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(i, i + 3800), disable_web_page_preview: true }) });
    if (!r.ok) console.error('Telegram error', r.status, await r.text());
  }
}
const FOOT = '\nTested signals, not instructions. Not financial advice, not a halal ruling.' + (env.PAGE_URL ? '\n' + env.PAGE_URL : '');

// ---- Your own positions, told to the bot in Telegram. Read at every run (every 30 minutes in market hours).
// Stored in data/my-positions.json: ticker, entry price, levels and date. No share counts, no money amounts.
const POS_FILE = 'data/my-positions.json';
const loadPos = () => readJson(POS_FILE, {});
const savePos = (p) => fs.writeFileSync(POS_FILE, JSON.stringify(p, null, 1));
const HELP = 'You can ask in plain words:\nwhen to sell VRTX\nwhen to buy LPG\npenny stock for today\nlook for energy stocks\nwhat to buy today\n\nOr use the commands:\ntoday   (short-trade setups that passed the tests, with live prices)\nmarket   (indexes, sectors and headlines right now)\nmovers   (stocks up 20%+ right now, with the news: investigate, do not chase)\ncheck LPG   (analyses ANY ticker now and adds it to my nightly scan)\nremove LPG   (takes it off)\ntips SOURCE NAME + the tickers or the pasted message   (logs a source\u2019s tips, checks each, scores the source)\nsources   (scoreboard of the sources you logged)\nname SOURCE NAME   (gives a name to tips you pasted without one)\nfollow NAME CHANNEL-ID   (follow a YouTube channel: its stock mentions are logged, checked and scored)\nunfollow NAME   |   channels\nbought VRTX 500.55\nbought VRTX   (uses the current price)\nbought TTD 20.16 stop 10.50 target 15\nstop VRTX 480\ntarget VRTX 516\nsold VRTX\npositions\n\nI read messages every few minutes, so replies are not instant.';
function planFor(sym, entry, sig) {   // levels for a new position, scaled from last night's plan to the price you actually paid
  const q = ((sig && sig.quick) || []).find(x => x.sym === sym), b = ((sig && sig.stocks) || []).find(x => x.sym === sym && x.buyLo);
  if (q) return { kind: 'quick', q: q.q || 'rsi', maxHold: q.maxHold || 5, stop: +(entry - (q.buyLo - q.stop)).toFixed(2), t1: q.t1 ? +(entry * q.t1 / q.buyLo).toFixed(2) : null, t2: q.t2 ? +(entry * q.t2 / q.buyLo).toFixed(2) : null };
  if (b) return { kind: 'entry', stop: +(entry - (b.buyLo - b.stop)).toFixed(2), t1: b.target ? +(entry * b.target / b.buyLo).toFixed(2) : null, t2: null };
  return { kind: 'manual', stop: null, t1: null, t2: null };
}
const posLine = (sym, P, price) => sym + ': bought ' + money(P.entry) + (price ? ', now ' + money(price) + ' (' + (price >= P.entry ? '+' : '') + ((price / P.entry - 1) * 100).toFixed(1) + '%)' : '') + '\n  stop ' + (P.stop ? money(P.stop) : 'NOT SET') + ', target 1 ' + (P.t1 ? money(P.t1) : 'not set') + (P.t2 ? ', target 2 ' + money(P.t2) : '') + (P.kind === 'quick' ? '\n  quick trade: also sell on the first close ' + (P.q === 'gap' ? 'below' : 'above') + ' its 5 day average, or after ' + (P.maxHold || 5) + ' sessions' : '');
// "today": the short-trade list. Only setups that passed the tests at the last close, re-priced now.
// CONCLUSION: one line per trade. Buy range, stop, where to sell. Only setups that passed their tests and are not blocked.
function conclusion(sig, pos) {
  const out = ['CONCLUSION'];
  if (!sig) return out.concat('No scan has run yet.');
  const held = pos || {};
  for (const q of (sig.quick || []).filter(x => !held[x.sym]).slice(0, 4)) out.push(q.sym + ': BUY ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ' | STOP ' + money(q.stop) + ' | SELL ' + (q.t1 ? money(q.t1) + (q.t2 ? ' then ' + money(q.t2) : '') : 'on the rule exit') + ' | out after ' + (q.maxHold || 5) + ' sessions at the latest');
  for (const b of (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo && !held[x.sym]).slice(0, 4)) out.push(b.sym + ': BUY ' + money(b.buyLo) + ' to ' + money(b.buyHi) + ' | STOP ' + money(b.stop) + ' | SELL ' + (b.target ? money(b.target) : 'when it closes below ~' + money(b.exitBelow)) + ' | swing trade, days to weeks');
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
  const qk = (sig.quick || []).filter(x => !pos[x.sym]).slice(0, 5), buys = (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo && !pos[x.sym]).slice(0, 4);
  if (open) for (const sym of [...new Set([...qk.map(q => q.sym), ...buys.map(b => b.sym), ...Object.keys(pos)])].slice(0, 14)) { const j = await td('/price?symbol=' + encodeURIComponent(sym)); if (j && +j.price > 0) px[sym] = +j.price; }
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
  if (!qk.length && !buys.length) out.push('', 'Nothing passed the tests at that close. On most days the honest answer is: no trade today.');
  out.push('', 'These are tested setups, not hot tips. Small wins, strict stops, manual review only. Check halal status first. After buying, tell me: bought SYMBOL price');
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
  if (c.length < 600) out.push('It has under three years of price history, so no rule can be tested on it.', refLine2());
  else {
    const spy = await loadDaily('SPY'), mkt = spy ? L.marketMap(spy.candles) : null, ind = L.indicators(c, mkt);
    const mom = spy && spy.candles.length > 130 ? spy.candles[spy.candles.length - 1].c / spy.candles[spy.candles.length - 127].c - 1 : undefined;
    const T = L.trendStats(c, ind, mom), Lr = L.learn(c, ind, null, false), halal = L.halalOf(sym, null), v = L.applyGates(L.verdict(c, ind, Lr, null, d.last, false), { dollarVol: T.dollarVol, halal, limit: null });
    const trig = L.buyTrigger(c, ind, Lr), dist = Lr.v.mult * ind.atr[i], half = 0.5 * ind.atr[i], Q = d.last >= 5 ? L.quickFire(c, ind, L.quickStudy(c, ind, false)) : null;
    out.push((T.up ? 'In an uptrend' : c[i].c < ind.e[L.CFG.TREND][i] ? 'In a downtrend' : 'Mixed trend') + ', ' + (T.mom6 >= 0 ? '+' : '') + Math.round(T.mom6 * 100) + '% over 6 months' + (T.rs === null ? '' : ' (' + (T.rs >= 0 ? '+' : '') + Math.round(T.rs * 100) + '% vs the market)') + '.',
      'Rule tested for it: ' + L.ruleText(Lr.v) + '. ' + Lr.test.n + ' unseen trades, ' + Math.round(Lr.test.winRate * 100) + '% wins. ' + L.statusText(Lr));
    if (v.act) out.push('CONCLUSION: ENTRY CONFIRMED. BUY ' + money(d.last) + ' to ' + money(d.last + half) + ' | STOP ' + money(d.last - dist) + ' | SELL ' + (Lr.v.tp ? money(d.last + Lr.v.tp * dist) : 'when it closes below ~' + money(L.sellLevel({ v: Lr.v }, c, ind))));
    else if (v.blocked) out.push('CONCLUSION: no trade. ' + v.why);
    else if (Lr.proven && trig.price) out.push('CONCLUSION: not yet. BUY only after a daily close above ~' + money(trig.price) + ' (' + ((trig.price / d.last - 1) * 100).toFixed(1) + '% away) | then STOP ~' + money(trig.price - dist) + ' | SELL ' + (Lr.v.tp ? '~' + money(trig.price + Lr.v.tp * dist) : 'on the rule exit'));
    else if (Q) { const P = L.quickPlan(d.last, ind.atr[i], ind.sma5[i], Q); out.push('CONCLUSION: quick trade setup. BUY ' + money(P.lo) + ' to ' + money(P.hi) + ' | STOP ' + money(P.stop) + ' | SELL ' + (P.t1 ? money(P.t1) + (P.t2 ? ' then ' + money(P.t2) : '') : 'on the rule exit') + ' | out after ' + Q.v.maxHold + ' sessions. Past result: ' + Math.round(Q.test.winRate * 100) + '% wins over ' + Q.test.n + ' trades.'); }
    else if (Lr.proven) out.push('CONCLUSION: no trade now. ' + trig.text);
    else out.push('No tested rule supports a trade on this stock.', refLine2());
    out.push(L.HALAL_TEXT[halal] + '. Earnings date not checked: verify it before acting.');
  }
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
  const q = (sig.quick || []).find(x => x.sym === sym), st = (sig.stocks || []).find(x => x.sym === sym), lines = [sym + ', from the ' + sig.session + ' close'];
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
  const pos = loadPos(), mine = [];
  for (const x of Object.keys(pos)) mine.push(posLine(x, pos[x]) + (await whyMoved(x, '')).replace('none found. A big move with no news is a warning sign.', 'nothing in the last two days.').replace('no headline about this company found, only general market round-ups. Treat the move as unexplained.', 'nothing specific in the last two days.'));
  await telegram('PRE-MARKET BRIEFING, ' + n.d + '\nSent as US pre-market trading opens (4:00 am New York). The regular session opens at 9:30 am New York, 4:30 pm Kuwait time. Prices below are from the last close and will differ at the open; the stop and sell prices move with the actual entry.\n\n' + (await hotList(sig))
    + (mine.length ? '\n\nYOUR POSITIONS (' + mine.length + ')\n' + mine.join('\n') : '') + '\n\nDuring the session, send: today   for the same list with live prices.');
  st.brief = n.d; fs.writeFileSync('data/tg-state.json', JSON.stringify(st));
  console.log('pre-market briefing sent');
}
// "market": what is moving right now. Indexes, the eleven sectors ranked by today's change, and the latest tagged headlines.
const SECTORS = { XLK: 'Technology', XLF: 'Financials', XLE: 'Energy', XLV: 'Health care', XLY: 'Consumer discretionary', XLP: 'Consumer staples', XLI: 'Industrials', XLB: 'Materials', XLU: 'Utilities', XLRE: 'Real estate', XLC: 'Communication' };
async function marketNow() {
  const idx = { SPY: 'S&P 500', QQQ: 'Nasdaq 100', IWM: 'Small companies' }, syms = [...Object.keys(idx), ...Object.keys(SECTORS)], q = {};
  for (let k = 0; k < syms.length; k += 7) {            // two batches: the free plan allows 8 quotes a minute
    if (k) await sleep(FAST ? 5 : 62000);
    try { const part = syms.slice(k, k + 7), r = await fetch(TD + '/quote?symbol=' + part.join(',') + '&apikey=' + encodeURIComponent(env.TWELVE_KEY)), j = await r.json(); for (const x of part) { const v = part.length === 1 ? j : j[x]; if (v && v.percent_change !== undefined) q[x] = +v.percent_change / 100; } } catch (e) {}
  }
  const pcx = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%', out = ['MARKET NOW' + (marketOpen(Date.now()) ? '' : ' (market closed: last session)')];
  out.push(Object.keys(idx).filter(x => q[x] !== undefined).map(x => idx[x] + ' ' + pcx(q[x])).join(', ') || 'Index prices unavailable.');
  const secs = Object.keys(SECTORS).filter(x => q[x] !== undefined).sort((a, b) => q[b] - q[a]);
  if (secs.length) out.push('', 'SECTORS TODAY, strongest first', ...secs.map(x => SECTORS[x] + ' ' + pcx(q[x])), '', 'Strongest: ' + secs.slice(0, 2).map(x => SECTORS[x]).join(', ') + '. Weakest: ' + secs.slice(-2).map(x => SECTORS[x]).join(', ') + '.', 'One day of sector moves is mostly noise. The weekly review shows which sectors are really leading.');
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
    const tagOf = (h) => /offering|private placement|warrants|registered direct/i.test(h) ? 'SHARE OFFERING (dilution)' : /trading halt|halted/i.test(h) ? 'TRADING HALT' : /\bFDA\b|PDUFA|phase (2|3|ii|iii)|trial|approval/i.test(h) ? 'FDA / trial' : /\bmerg|acqui|takeover|buyout|to be bought/i.test(h) ? 'Deal' : /earnings|guidance|results|quarter/i.test(h) ? 'Earnings' : /contract|partnership|awarded|agreement/i.test(h) ? 'Contract' : null;
    const heads = it.map(x => String(x.headline || '')).filter(Boolean), own = heads.filter(h => about.test(h) && !roundup.test(h)), pick = own.find(h => tagOf(h)) || own[0] || heads.find(h => tagOf(h) && !roundup.test(h));
    if (!pick) return '\n  news: no headline about this company found, only general market round-ups. Treat the move as unexplained.';
    return '\n  news: ' + (tagOf(pick) || 'Company news') + ' \u2014 ' + pick.slice(0, 120) + (tagOf(pick) === 'Deal' ? '\n  note: if this company is being bought, the price usually jumps to near the offer at once and then barely moves.' : ''); } catch (e) { return ''; } finally { await sleep(FAST ? 0 : 1100); }
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
const COMMON_WORDS = new Set('IT THIS THAT MY THE A AN NOW TODAY STOCK STOCKS PENNY ME SOME ANY THEM ALL AND OR FOR TO IN ON OF IS ARE WHAT WHEN SHOULD CAN DO I WE YOU BUY SELL HOLD SHARE SHARES PLEASE NEW GOOD BEST HOT ONE HUNT FIND LOOK GIVE WANT NEED UP DOWN OUT AT'.split(' '));
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
  if (P) { let p = null; if (marketOpen(Date.now())) { const j = await td('/price?symbol=' + encodeURIComponent(sym)); p = +j.price || null; }
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
async function natural(text, sig, pos) {
  if (/^(i\s+)?(bought|sold)\b|^(check|add|analy[sz]e|remove|delete|unwatch|stop|target|tips?|log|name|rename|source|follow|unfollow|channels?|positions?|status|list|sources?|scoreboard|market|news|movers?|gainers?|today|update|hot)\b/i.test(text)) return null;
  if (/\bpenn(y|ies)\b|under\s*\$?\s*5\b|\bcheap stocks?\b/i.test(text)) return pennyReply(sig);
  const sec = SECTOR_WORDS.find(([, re]) => re.test(text)), tk = findTicker(text, sig, pos);
  if (sec && !tk && sig) return sectorReply(sec[0], sig);
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
  try { const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/getUpdates?timeout=0&offset=' + state.offset); ups = ((await r.json()).result) || []; } catch (e) { console.log('could not read Telegram messages'); return; }
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
    if (/^\s*(?:tips?|log|\u062A\u0648\u0635\u064A\u0627\u062A|\u062A\u0648\u0635\u064A\u0629)\b/i.test(text) || (/\u0633\u0647\u0645|\u0634\u0631\u0627\u0621/.test(text) && (text.match(/\b[A-Z]{2,5}\b/g) || []).length >= 2) || ((m.forward_origin || m.forward_from_chat) && /\$[A-Z]{1,5}\b|\u0633\u0647\u0645|\b[A-Z]{2,5}\b.*\b(buy|target|entry|stop)\b|\b(buy|target|entry|stop)\b.*\b[A-Z]{2,5}\b/i.test(m.text))) { const fo = m.forward_origin || {}, fwd = String((fo.chat && fo.chat.title) || fo.sender_user_name || (fo.sender_user && [fo.sender_user.first_name, fo.sender_user.last_name].filter(Boolean).join(' ')) || (m.forward_from_chat && m.forward_from_chat.title) || '').slice(0, 40); out.push(await logTips(m.text, fwd)); continue; }
    if (/^(today|hot|hot\s*list|quick|setups?|ideas?|list today|update|recommend\w*|buy|sell|what now|now what)\s*\??$/i.test(text) || /^(today|hot)\b/i.test(text) || /what.*\b(buy|sell|do)\b/i.test(text) || /^buy\s+(today|now|what|list)\b/i.test(text) || /^(\u0627\u0644\u064A\u0648\u0645|\u0634\u0646\u0648 \u0627\u0634\u062A\u0631\u064A|\u0645\u0627\u0630\u0627 \u0627\u0634\u062A\u0631\u064A|\u0648\u0634 \u0627\u0634\u062A\u0631\u064A|\u062A\u062D\u062F\u064A\u062B)\s*\??$/.test(text)) { out.push(await hotList(sig)); continue; }
    if (/^(movers?|gainers?|fast|pennies|penny)\b/i.test(text)) { out.push(await moversNow()); continue; }
    if (/^(market|news|now|sectors?|breaking)\b/i.test(text) || /what.*(happening|going on|news)/i.test(text)) { out.push(await marketNow()); continue; }
    if ((k = text.match(/^(?:check|ask|about|add|analy[sz]e)\s+([a-z.\-]{1,6})\b/i))) { const sy = k[1].toUpperCase(), known = sig && ((sig.quick || []).some(x => x.sym === sy) || (sig.stocks || []).some(x => x.sym === sy)); out.push(known ? checkOne(sy, sig) : await checkLive(sy)); continue; }
    if ((k = text.match(/^(?:remove|delete|unwatch)\s+([a-z.\-]{1,6})\b/i))) { const sy = k[1].toUpperCase(), a = readExtra(); if (a.includes(sy)) { fs.writeFileSync(EXTRA_FILE, JSON.stringify(a.filter(x => x !== sy))); out.push('Removed ' + sy + ' from my nightly scan.'); } else out.push(sy + ' was not one of the stocks you added.'); continue; }
    if ((k = text.match(/^(?:i\s+)?bought\s+([a-z.\-]{1,6})(?:\s+(?:at\s+)?(\d+(?:\.\d+)?))?/i))) {
      const sym = k[1].toUpperCase(); let entry = k[2] ? +k[2] : null;
      if (!entry) { const j = await td('/price?symbol=' + encodeURIComponent(sym)); entry = +j.price || null; }
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
      const st = num(/stop\s+(\d+(?:\.\d+)?)/i), tg = num(/target\s+(\d+(?:\.\d+)?)/i); if (st) P.stop = st; if (tg) P.t1 = tg;
      pos[sym] = P;
      out.push('Tracking ' + posLine(sym, P) + (P.stopWhy ? '\n  Suggested stop ' + money(P.stop) + ': ' + P.stopWhy + ' To change it: stop ' + sym + ' <price>' : P.kind === 'manual' && !P.stop ? '\n  I could not load enough price history to suggest a stop. Send: stop ' + sym + ' <price>' : '') + '\n  I check your positions about every 15 minutes in market hours. Place the stop with your broker too: my alerts can be late.');
    } else if ((k = text.match(/^(?:i\s+)?sold\s+([a-z.\-]{1,6})/i))) {
      const sym = k[1].toUpperCase(); if (pos[sym]) { delete pos[sym]; out.push('Stopped tracking ' + sym + '.'); } else out.push('I was not tracking ' + sym + '.');
    } else if ((k = text.match(/^(stop|target)\s+([a-z.\-]{1,6})\s+(\d+(?:\.\d+)?)/i))) {
      const sym = k[2].toUpperCase(); if (!pos[sym]) { out.push('I am not tracking ' + sym + '. Send: bought ' + sym + ' <price>'); continue; }
      if (k[1].toLowerCase() === 'stop') pos[sym].stop = +k[3]; else pos[sym].t1 = +k[3];
      out.push('Updated ' + posLine(sym, pos[sym]));
    } else if (/^(positions?|status|list)\b/i.test(text)) {
      const syms = Object.keys(pos); out.push(syms.length ? 'Your tracked positions:\n' + syms.map(x => posLine(x, pos[x])).join('\n') : 'No positions tracked. Send: bought VRTX 500.55');
    } else out.push(HELP);
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
function tickersIn(text, known) {
  const found = new Set(), add = (x) => { if (x && !NOT_TICKERS.has(x)) found.add(x); };
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
  if (!loaded.SPY) { await telegram('Stock scanner: could not load market data today (' + errors.length + ' errors). Check the TWELVE_KEY secret.'); process.exit(1); }
  const spy = loaded.SPY.candles, session = spy[spy.length - 1].d, prev = readJson('data/signals.json', null);
  if (prev && prev.session === session && !env.FORCE) { console.log('No new session since ' + session + ' (weekend or holiday). Nothing sent.'); return; }
  const mkt = L.marketMap(spy), mktUp = mkt[session].up, mom6 = spy[spy.length - 1].c / spy[spy.length - 127].c - 1;
  const models = readJson('data/models.json', {});
  const journal = fs.existsSync('data/journal.jsonl') ? fs.readFileSync('data/journal.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const uni = [];
  const VR = L.volRegime ? L.volRegime(spy) : { known: false, mult: 1 }, VOLM = VR.mult;
  const stocks = [], fresh = [], exits = [], openTrades = [], results = [], horizons = {}, picks = [], quick = [], qFin = [], blocked = [], wk = [], famRes = {};
  const weak = [];
  const refLine = (sym, d) => {
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
    const c = d.candles, i = c.length - 1, ind = L.indicators(c, mkt), T = L.trendStats(c, ind, mom6), halal = L.halalOf(sym, null);
    if (!only && i > 140) { const e2 = ind.e[L.CFG.TREND], e5 = ind.e[50], j = i - 5; wk.push({ sym, chg: c[i].c / c[j].c - 1, up: T.up, wasUp: c[j].c > e2[j] && e5[j] > e2[j] && c[j].c / c[j - 126].c - 1 > 0 }); }
    if (myPos[sym]) {   // your own position: end-of-day checks
      if (myPos[sym].stopWhy) { const a = ind.atr[i], e50 = ind.e[50][i], ns = +Math.max(c[i].c - 2 * a, e50 < c[i].c ? e50 : 0).toFixed(2); if (ns > myPos[sym].stop && c[i].c > myPos[sym].stop) { myPos[sym].stop = ns; myPos[sym].raised = c[i].d; } }
      const P = myPos[sym], held = c.filter(k => k.d > P.since).length, flags = [];
      if (P.stop && c[i].c <= P.stop) flags.push('CLOSED AT OR BELOW YOUR STOP ' + money(P.stop) + '. Sell / reassess at the next open.');
      if (held >= 1 && P.t1 && c[i].h >= P.t1) flags.push('Target 1 ' + money(P.t1) + ' was reached today.');
      const gapT = P.q === 'gap', hit = gapT ? c[i].c < ind.sma5[i] : c[i].c > ind.sma5[i];
      if (P.kind === 'quick' && held >= 1 && hit) flags.push('QUICK TRADE EXIT: it closed ' + (gapT ? 'below' : 'above') + ' its 5 day average. Sell at the next open.');
      else if (P.kind === 'quick' && held >= (P.maxHold || 5)) flags.push('QUICK TRADE TIME EXIT: ' + (P.maxHold || 5) + ' sessions have passed. Sell at the next open.');
      if (flags.some(f => /STOP|EXIT/.test(f))) posVerdict[sym] = flags.find(f => /STOP|EXIT/.test(f)).replace(/ Sell.*$/, '').replace(/^QUICK TRADE (TIME )?EXIT: /, '').toLowerCase();
      { const bc = L.bearishCandle ? L.bearishCandle(c, i) : 0; if (bc) flags.push('Candle warning: a ' + L.BEAR_NAMES[bc] + ' at this close. Weak evidence alone; check your stop.'); }
      if (P.raised === c[i].d) flags.push('Stop raised to ' + money(P.stop) + ' as the stock rose. Move it at your broker too.');
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
      if (v.act) Object.assign(row, { buyLo: d.last, buyHi: +(d.last + 0.5 * ind.atr[i]).toFixed(4), stop: +(d.last - dist).toFixed(4), target: Lr.v.tp ? +(d.last + Lr.v.tp * dist).toFixed(4) : null, exitBelow: +L.sellLevel({ v: Lr.v }, c, ind).toFixed(4), hit: Lr.hitRate, days: Lr.medDays });
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
    if (L.quickStudy && !BIOBLOCK.has(sym) && d.last >= 5 && !(T.dollarVol !== null && T.dollarVol < L.CFG.MIN_DOLLAR_VOL) && halal !== 'fail') {
      const Q = L.quickFire(c, ind, L.quickStudy(c, ind, sym === 'SPY'));
      if (Q) {
        const qd = Q.v.mult * ind.atr[i], per10k = Math.floor(VOLM * Math.min(10000 * 0.005 / qd, 10000 * 0.20 / d.last)), P = L.quickPlan ? L.quickPlan(d.last, ind.atr[i], ind.sma5[i], Q) : {};
        const t1 = P.t1 ? +P.t1.toFixed(4) : null, t2 = P.t2 ? +P.t2.toFixed(4) : null;
        quick.push({ t: Q.test.t, row: { sym, last: d.last, buyLo: d.last, buyHi: +(d.last + 0.5 * ind.atr[i]).toFixed(4), sellAbove: +ind.sma5[i].toFixed(4), stop: +(d.last - qd).toFixed(4), t1, t2, q: Q.v.q, maxHold: Q.v.maxHold, exitText: L.quickExitText ? L.quickExitText(Q.v, ind.sma5[i]) : '', what: L.quickWhat(Q.v), win: Q.test.winRate, n: Q.test.n, avgPct: Q.avgPct, days: Q.medDays },
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
  for (const q of quick.slice(0, 6)) {
    const e = await earnings(q.row.sym);
    if (e.known && e.date && e.days <= 7) { blocked.push(q.row.sym + ' (quick trade): earnings on ' + e.date + ', in ' + Math.max(e.days, 0) + ' days. A result can gap the price through the stop.'); continue; }
    q.text += '\n  ' + earnText(e); q.row.earn = earnText(e);
    if (q.entry) { fresh.push(q.entry); fs.appendFileSync('data/journal.jsonl', JSON.stringify(q.entry) + '\n'); }
    keep.push(q);
  }
  quick.length = 0; quick.push(...keep);
  for (const st of stocks.filter(x => x.state === 'Buy watch')) {
    const e = await earnings(st.sym);
    if (e.known && e.date && e.days <= 7) { st.state = 'Blocked'; blocked.push(st.sym + ': a tested rule fired, but earnings are on ' + e.date + ', in ' + Math.max(e.days, 0) + ' days.'); } else st.earn = earnText(e);
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
  const qn = qFin.length, qs = qFin.filter(x => x.spy !== null);
  const quickRecord = qn ? { n: qn, winRate: qFin.filter(x => x.pct > 0).length / qn, avgPct: qFin.reduce((a, x) => a + x.pct, 0) / qn, avgSpy: qs.length ? qs.reduce((a, x) => a + x.spy, 0) / qs.length : null } : null;

  const fin = results.length, wins = results.filter(r => r > 0).length;
  const outcomes = { updated: new Date(now).toISOString(), finished: fin, winRate: fin ? wins / fin : null, avgR: fin ? results.reduce((a, b) => a + b, 0) / fin : null,
    horizons: Object.fromEntries(Object.entries(horizons).map(([h, g]) => [h, { n: g.n, avgReturn: g.ret / g.n, avgBenchmark: g.bench / g.n }])) };
  fs.writeFileSync('data/outcomes.json', JSON.stringify(outcomes, null, 1));
  fs.writeFileSync('data/models.json', JSON.stringify(models, null, 1));
  fs.writeFileSync('data/signals.json', JSON.stringify({ generatedAt: new Date(now).toISOString(), session, logicVersion: L.LOGIC_VERSION, market: { up: mktUp }, scanned: stocks.length, errors, openTrades, quick: quickPaused ? [] : quick.slice(0, 6).map(x => x.row), quickPaused, quickRecord, posVerdict, tipBoard: tipBoardData, uni, stocks }, null, 1));
  fs.writeFileSync('data/alert-state.json', JSON.stringify({ day: '', sent: {} }));

  const buys = stocks.filter(s => s.state === 'Buy watch'), near = stocks.filter(s => s.state !== 'Buy watch' && s.trigger && s.trigger / s.last < 1.03).sort((a, b) => a.trigger / a.last - b.trigger / b.last).slice(0, 8);
  const msg = ['Daily scan, ' + session + ' close', 'All prices below are from that close. They do not update. Live prices come in the market-hours alerts.', 'Market: ' + (mktUp ? 'uptrend' : 'downtrend') + (VR.known ? ', volatility ' + (VR.high ? 'HIGH (top fifth of the past year): suggested sizes are halved' : 'normal') : '') + '. Scanned ' + stocks.length + ' stocks' + (QEXTRA.length ? ', plus ' + QEXTRA.length + ' large companies for quick trades' : '') + '.' + (errors.length ? ' ' + errors.length + ' failed to load.' : ''), '', 'ENTRY CONFIRMED (' + buys.length + ')'];
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
  if (blocked.length) msg.push('', 'BLOCKED, EVENT RISK (' + blocked.length + ')', ...blocked.slice(0, 8), 'No prices are given for blocked stocks.');
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
  await telegram(msg.join('\n') + '\n' + FOOT);
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
  console.log('daily scan done:', stocks.length, 'stocks,', buys.length, 'buy watch,', fresh.length, 'journal entries');
}

async function intraday(onlyMine) {
  const now = Date.now();
  const sig = readJson('data/signals.json', null);
  await tgCommands(sig);
  await preMarket(sig);
  if (onlyMine) { await fastMovers(); await watchdog(sig); }
  if (onlyMine && (!Object.keys(loadPos()).length || new Date(now).getUTCMinutes() % 15 >= 5)) return;   // chat mode: your positions only, about every 15 minutes
  if (!marketOpen(now) && !env.FORCE) { console.log('Market closed. Nothing to do.'); return; }
  if (!sig) { console.log('No daily scan yet.'); return; }
  const myPos = loadPos();
  const st = readJson('data/alert-state.json', { day: '', sent: {} }), day = ny(now).d; if (st.day !== day) { st.day = day; st.sent = {}; }
  const buys = sig.stocks.filter(s => s.state === 'Buy watch'), trig = sig.stocks.filter(s => s.state !== 'Buy watch' && s.trigger && s.trigger / s.last < 1.03);
  const qk = sig.quick || [];
  const watch = onlyMine ? Object.keys(myPos).slice(0, 12) : [...new Set([...Object.keys(myPos), ...qk.map(s => s.sym), ...buys.map(s => s.sym), ...(sig.openTrades || []).map(t => t.sym), ...trig.map(s => s.sym)])].slice(0, 24), alerts = [];
  for (const sym of watch) {
    const j = await td('/price?symbol=' + encodeURIComponent(sym)), p = +j.price; if (!(p > 0)) continue;
    const say = (k, text) => { if (!st.sent[sym + k]) { st.sent[sym + k] = 1; alerts.push(sym + ' at ' + money(p) + ': ' + text); } };
    const b = buys.find(s => s.sym === sym), t = trig.find(s => s.sym === sym), qs0 = qk.find(s => s.sym === sym), mp = myPos[sym];
    if (mp) {   // you told the bot you bought this one
      const chg = ' You bought at ' + money(mp.entry) + ' (' + (p >= mp.entry ? '+' : '') + ((p / mp.entry - 1) * 100).toFixed(1) + '%).';
      if (mp.stop && p <= mp.stop) say('myst', 'YOUR POSITION: STOP LOSS REACHED (' + money(mp.stop) + '). Sell / reassess now.' + chg);
      else if (mp.t2 && p >= mp.t2) say('myt2', 'YOUR POSITION: TARGET 2 REACHED (' + money(mp.t2) + ').' + chg);
      else if (mp.t1 && p >= mp.t1) say('myt1', 'YOUR POSITION: TARGET 1 REACHED (' + money(mp.t1) + '). Review, or take the profit.' + chg);
    }
    const qs = mp ? null : qs0;
    if (qs) {   // a quick trade setup from last night's close
      if (p > qs.buyHi) say('qhi', 'QUICK TRADE: above its entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + '). The dip is gone. Skip it.');
      else if (p <= qs.stop) say('qlo', 'QUICK TRADE: already at its invalidation level ' + money(qs.stop) + '. The setup has failed.');
      else if (p < qs.buyLo) say('qlow', 'QUICK TRADE: below its planned entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + ') and above the invalidation level ' + money(qs.stop) + '. The dip is still running. A lower entry than planned, but no bounce yet. Manual review only.');
      else say('qin', 'QUICK TRADE: trading inside its entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + '). Invalidation ' + money(qs.stop) + (qs.t1 ? ', target 1 ' + money(qs.t1) : '') + '. Manual review only.');
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
  fs.writeFileSync('data/alert-state.json', JSON.stringify(st));
  alerts.sort((a, b) => (b.includes('YOUR POSITION') ? 1 : 0) - (a.includes('YOUR POSITION') ? 1 : 0));
  if (alerts.length) await telegram('Market hours check\n\n' + alerts.join('\n\n') + '\n' + FOOT);
  console.log('intraday check done:', watch.length, 'watched,', alerts.length, 'new alerts');
}

await (MODE === 'chat' ? intraday(true) : MODE === 'intraday' ? intraday() : daily());
