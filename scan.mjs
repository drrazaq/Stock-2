// Cloud scanner for the US stock signal board. Runs on GitHub Actions (free), so it works while your phone is off.
// It reuses the exact rules inside index.html, writes data/signals.json and an append-only journal, and sends Telegram alerts.
// Read only: it holds no broker login and cannot trade.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const env = process.env, MODE = env.MODE === 'intraday' ? 'intraday' : env.MODE === 'chat' ? 'chat' : 'daily', RATE = Math.max(1, parseInt(env.RATE || '8', 10) || 8);
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1';
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
const MAIN = ['SPY', ...new Set([...(fromFile.length ? fromFile : DEFAULT), ...DISC].filter(s => s !== 'SPY'))].slice(0, 1000);
// Extra large, heavily traded companies scanned for QUICK TRADES only. Short bounces behave best in liquid names.
const QEXTRA = env.NO_QUICK_EXTRA ? [] : 'ABBV ABT ACN ADBE AMAT AMGN BKNG BMY CAT COP CSCO CVS DE DHR GE GILD HON IBM INTC INTU ISRG LIN LOW MCD MDT MMM MRK NEE NKE NOW PFE QCOM SBUX SO T TGT TMO TMUS TXN UNP UPS VZ PLTR UBER SHOP PANW MU ADP SPGI TJX VRTX REGN ZTS CI ELV'.split(' ').filter(x => !MAIN.includes(x));
const QONLY = new Set(QEXTRA), LIST = [...MAIN, ...QEXTRA];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const money = (x) => x.toFixed(2);
fs.mkdirSync('data', { recursive: true });

function ny(ms) {
  const o = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms)).forEach(p => o[p.type] = p.value);
  return { d: o.year + '-' + o.month + '-' + o.day, mins: +o.hour * 60 + +o.minute, weekend: o.weekday === 'Sat' || o.weekday === 'Sun' };
}
const barClosed = (d, now) => { const n = ny(now); return d < n.d || (d === n.d && n.mins >= 970); };
const marketOpen = (now) => { const n = ny(now); return !n.weekend && n.mins >= 570 && n.mins < 960; };

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
const HELP = 'Commands:\ntoday   (short-trade setups that passed the tests, with live prices)\ncheck AAPL   (what the scanner says about one stock)\nbought VRTX 500.55\nbought VRTX   (uses the current price)\nbought TTD 20.16 stop 10.50 target 15\nstop VRTX 480\ntarget VRTX 516\nsold VRTX\npositions\n\nI read messages every few minutes, so replies are not instant.';
function planFor(sym, entry, sig) {   // levels for a new position, scaled from last night's plan to the price you actually paid
  const q = ((sig && sig.quick) || []).find(x => x.sym === sym), b = ((sig && sig.stocks) || []).find(x => x.sym === sym && x.buyLo);
  if (q) return { kind: 'quick', stop: +(entry - (q.buyLo - q.stop)).toFixed(2), t1: q.t1 ? +(entry * q.t1 / q.buyLo).toFixed(2) : null, t2: q.t2 ? +(entry * q.t2 / q.buyLo).toFixed(2) : null };
  if (b) return { kind: 'entry', stop: +(entry - (b.buyLo - b.stop)).toFixed(2), t1: b.target ? +(entry * b.target / b.buyLo).toFixed(2) : null, t2: null };
  return { kind: 'manual', stop: null, t1: null, t2: null };
}
const posLine = (sym, P, price) => sym + ': bought ' + money(P.entry) + (price ? ', now ' + money(price) + ' (' + (price >= P.entry ? '+' : '') + ((price / P.entry - 1) * 100).toFixed(1) + '%)' : '') + '\n  stop ' + (P.stop ? money(P.stop) : 'NOT SET') + ', target 1 ' + (P.t1 ? money(P.t1) : 'not set') + (P.t2 ? ', target 2 ' + money(P.t2) : '') + (P.kind === 'quick' ? '\n  quick trade: also sell on the first close above its 5 day average, or after 5 sessions' : '');
// "today": the short-trade list. Only setups that passed the tests at the last close, re-priced now.
async function hotList(sig) {
  if (!sig) return 'No scan has run yet.';
  const out = ['Short-trade list, from the ' + sig.session + ' close' + (marketOpen(Date.now()) ? ', priced now' : ' (market closed, prices are from that close)')], live = async (sym, fallback) => { if (!marketOpen(Date.now())) return fallback; const j = await td('/price?symbol=' + encodeURIComponent(sym)); return +j.price > 0 ? +j.price : fallback; };
  const qk = (sig.quick || []).slice(0, 5), buys = (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo).slice(0, 4);
  if (qk.length) out.push('', 'QUICK TRADES, 2 TO 5 DAYS (' + qk.length + ')');
  for (const q of qk) {
    const p = await live(q.sym, q.last), where = p > q.buyHi ? 'ABOVE its entry range: the dip is gone, skip it' : p <= q.stop ? 'FAILED: at or below its invalidation level' : p < q.buyLo ? 'below its planned range, dip still running' : 'inside its entry range';
    out.push(q.sym + ' ' + money(p) + ': ' + where + '\n  entry ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ', invalidation ' + money(q.stop) + (q.t1 ? ', target 1 ' + money(q.t1) : '') + (q.t2 ? ', target 2 ' + money(q.t2) : '') + '\n  exit on the first close above its 5 day average, or after 5 sessions\n  past result: ' + Math.round(q.win * 100) + '% wins over ' + q.n + ' trades, average ' + (q.avgPct * 100).toFixed(2) + '% a trade' + (q.earn ? '\n  ' + q.earn : ''));
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
function checkOne(sym, sig) {
  if (!sig) return 'No scan has run yet.';
  const q = (sig.quick || []).find(x => x.sym === sym), st = (sig.stocks || []).find(x => x.sym === sym), lines = [sym + ', from the ' + sig.session + ' close'];
  if (q) lines.push('Quick trade setup: entry ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ', invalidation ' + money(q.stop) + (q.t1 ? ', target 1 ' + money(q.t1) : '') + '. Past result ' + Math.round(q.win * 100) + '% wins over ' + q.n + ' trades.');
  if (st) lines.push('Closed ' + money(st.last) + '. ' + (st.uptrend ? 'In an uptrend' : 'Not in an uptrend') + ', ' + (st.mom6 >= 0 ? '+' : '') + Math.round(st.mom6 * 100) + '% over 6 months.', 'Rule: ' + st.rule + '. ' + (st.proven ? 'It passed its tests.' : 'It did not pass its tests, so no signals are given.'), 'State: ' + (st.state === 'Buy watch' ? 'ENTRY CONFIRMED' : st.trigger ? 'BUY WATCH, needs a close above ~' + money(st.trigger) : st.state) + '. ' + st.why, L.HALAL_TEXT[st.halal] || '');
  if (!q && !st) lines.push('Not on the scanned list, or it has under three years of price history. To have me scan it, add it to watchlist.txt in the repository. To check it right away, add it to the watchlist in Setup on the page.');
  return lines.filter(Boolean).join('\n');
}
async function tgCommands(sig) {
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  const state = readJson('data/tg-state.json', { offset: 0 }), pos = loadPos(), out = [];
  let ups = [];
  try { const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/getUpdates?timeout=0&offset=' + state.offset); ups = ((await r.json()).result) || []; } catch (e) { console.log('could not read Telegram messages'); return; }
  for (const u of ups) {
    state.offset = u.update_id + 1;
    const m = u.message; if (!m || !m.text || String(m.chat.id) !== String(env.TG_CHAT)) continue;      // only you
    const text = m.text.trim().replace(/\$/g, ''), num = (re) => { const x = text.match(re); return x ? +x[1] : null; };
    let k;
    if (/^(today|hot|hot\s*list|quick|setups?|ideas?|list today)\b/i.test(text) || /what.*\bbuy\b/i.test(text) || /^buy\s+(today|now|what|list)\b/i.test(text)) { out.push(await hotList(sig)); continue; }
    if ((k = text.match(/^(?:check|ask|about)\s+([a-z.\-]{1,6})\b/i))) { out.push(checkOne(k[1].toUpperCase(), sig)); continue; }
    if ((k = text.match(/^(?:i\s+)?(?:bought|buy)\s+([a-z.\-]{1,6})(?:\s+(?:at\s+)?(\d+(?:\.\d+)?))?/i))) {
      const sym = k[1].toUpperCase(); let entry = k[2] ? +k[2] : null;
      if (!entry) { const j = await td('/price?symbol=' + encodeURIComponent(sym)); entry = +j.price || null; }
      if (!entry) { out.push(sym + ': I could not get a price. Send it with the price, for example: bought ' + sym + ' 12.50'); continue; }
      const P = { entry, since: ny(Date.now()).d, ...planFor(sym, entry, sig) };
      const st = num(/stop\s+(\d+(?:\.\d+)?)/i), tg = num(/target\s+(\d+(?:\.\d+)?)/i); if (st) P.stop = st; if (tg) P.t1 = tg;
      pos[sym] = P;
      out.push('Tracking ' + posLine(sym, P) + (P.kind === 'manual' && !P.stop ? '\n  No tested plan exists for this stock today, so I have no stop for it. Send: stop ' + sym + ' <price>' : '') + '\n  I check your positions about every 15 minutes in market hours. Place the stop with your broker too: my alerts can be late.');
    } else if ((k = text.match(/^(?:i\s+)?(?:sold|sell)\s+([a-z.\-]{1,6})/i))) {
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

async function daily() {
  const now = Date.now(), loaded = {}, errors = [];
  await tgCommands(readJson('data/signals.json', null));
  const myPos = loadPos(), myLines = [];
  for (const x of Object.keys(myPos)) if (!LIST.includes(x)) LIST.push(x);
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
      const P = myPos[sym], held = c.filter(k => k.d > P.since).length, flags = [];
      if (P.stop && c[i].c <= P.stop) flags.push('CLOSED AT OR BELOW YOUR STOP ' + money(P.stop) + '. Sell / reassess at the next open.');
      if (held >= 1 && P.t1 && c[i].h >= P.t1) flags.push('Target 1 ' + money(P.t1) + ' was reached today.');
      if (P.kind === 'quick' && held >= 1 && c[i].c > ind.sma5[i]) flags.push('QUICK TRADE EXIT: it closed above its 5 day average. Sell at the next open.');
      else if (P.kind === 'quick' && held >= 5) flags.push('QUICK TRADE TIME EXIT: 5 sessions have passed. Sell at the next open.');
      myLines.push(posLine(sym, P, d.last) + (flags.length ? '\n  ' + flags.join('\n  ') : '\n  no exit signal at this close') + '\n  held ' + held + ' session' + (held === 1 ? '' : 's'));
    }
    const mine = journal.filter(x => x.sym === sym), resolved = mine.map(x => ({ x, t: L.resolveCall(x, c, ind) })).filter(y => y.t);
    for (const y of resolved) {
      const isQ = y.x.kind === 'quick', si = c.findIndex(k => k.d === y.x.d);
      if (y.t.open) {
        openTrades.push({ sym, stop: +y.t.stop.toFixed(4), target: isFinite(y.t.target) ? +y.t.target.toFixed(4) : null, t1: y.x.t1 || null, quick: isQ, since: y.x.d });
        // Exit alert: the rule's exit fired at this close, so the paper trade is sold at the next open
        const timeUp = y.x.v.maxHold && i - si >= y.x.v.maxHold;
        if (i > si && (L.exitAt(ind, c, y.x.v, i) || timeUp)) exits.push(sym + (isQ ? ' (quick trade)' : '') + ': exit signal at the close, ' + (timeUp && !L.exitAt(ind, c, y.x.v, i) ? 'time limit reached' : isQ ? 'closed above its 5 day average' : 'rule exit fired') + '. Sell at the next open. Entered after ' + y.x.d + ', now ' + (y.t.pct >= 0 ? '+' : '') + (y.t.pct * 100).toFixed(1) + '%.');
      } else {
        { const fk = isQ ? 'Quick trade' : y.x.v.fam === 'pull' ? 'Dip in an uptrend' : y.x.v.fam === 'brk' ? 'New 52 week high' : 'Average cross', g = famRes[fk] || (famRes[fk] = { n: 0, pct: 0, win: 0, week: 0 }); g.n++; g.pct += y.t.pct; if (y.t.pct > 0) g.win++; if (y.t.exitIdx >= i - 4) g.week++; }
        if (isQ) qFin.push({ pct: y.t.pct, spy: ind.bench && ind.bench[y.t.sigIdx] ? ind.bench[y.t.exitIdx] / ind.bench[y.t.sigIdx] - 1 : null }); else results.push(y.t.r);
        if (y.t.exitIdx === i) exits.push(sym + (isQ ? ' (quick trade)' : '') + ': paper trade from ' + y.x.d + ' ended by ' + y.t.reason.replace('_', ' ') + ' (' + (y.t.pct >= 0 ? '+' : '') + (y.t.pct * 100).toFixed(1) + '%)');
      }
      if (!isQ) { const o = L.barOutcomes(y.x, c, ind); for (const h in o) { const g = horizons[h] || (horizons[h] = { n: 0, ret: 0, bench: 0 }); g.n++; g.ret += o[h].ret; g.bench += o[h].bench || 0; } }
    }
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
        const qd = Q.v.mult * ind.atr[i], per10k = Math.floor(Math.min(10000 * 0.005 / qd, 10000 * 0.20 / d.last)), P = L.quickPlan ? L.quickPlan(d.last, ind.atr[i], ind.sma5[i], Q) : {};
        const t1 = P.t1 ? +P.t1.toFixed(4) : null, t2 = P.t2 ? +P.t2.toFixed(4) : null;
        quick.push({ t: Q.test.t, row: { sym, last: d.last, buyLo: d.last, buyHi: +(d.last + 0.5 * ind.atr[i]).toFixed(4), sellAbove: +ind.sma5[i].toFixed(4), stop: +(d.last - qd).toFixed(4), t1, t2, what: L.quickWhat(Q.v), win: Q.test.winRate, n: Q.test.n, avgPct: Q.avgPct, days: Q.medDays },
          text: sym + ' closed ' + money(d.last) + '\n  why: in an uptrend, ' + L.quickWhat(Q.v) + '\n  buy ' + money(d.last) + ' to ' + money(d.last + 0.5 * ind.atr[i]) + ' at the next open' + (t1 ? '\n  target 1: ' + money(t1) + ' (half of its past quick trades got this far)' : '') + (t2 ? '\n  target 2: ' + money(t2) + ' (about one in four)' : '') + '\n  rule exit: first close above ~' + money(ind.sma5[i]) + ' (its 5 day average)\n  time exit: after 5 sessions\n  invalidation: ' + money(d.last - qd) + ' (stop loss)\n  size: about ' + per10k + ' shares per 10,000 USD of account (risking about ' + Math.round(per10k * qd) + ' USD)\n  past result here: ' + Math.round(Q.test.winRate * 100) + '% wins over ' + Q.test.n + ' unseen trades, average ' + (Q.avgPct * 100).toFixed(2) + '% a trade, about ' + Q.medDays + ' days held\n  ' + L.HALAL_TEXT[halal] });
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
      const ds = (((await r.json()).earningsCalendar) || []).map(e => e.date).filter(Boolean).sort();
      return { known: true, date: ds[0] || null, days: ds[0] ? Math.round((Date.parse(ds[0]) - now) / 86400000) : null };
    } catch (e) { return { known: false }; } finally { await sleep(FAST ? 0 : 1100); }
  };
  const earnText = (e) => !e.known ? 'earnings date NOT CHECKED, verify before acting' : e.date ? 'next earnings ' + e.date + ', in ' + e.days + ' days' : 'no earnings in the next three weeks';
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
  const qn = qFin.length, qs = qFin.filter(x => x.spy !== null);
  const quickRecord = qn ? { n: qn, winRate: qFin.filter(x => x.pct > 0).length / qn, avgPct: qFin.reduce((a, x) => a + x.pct, 0) / qn, avgSpy: qs.length ? qs.reduce((a, x) => a + x.spy, 0) / qs.length : null } : null;

  const fin = results.length, wins = results.filter(r => r > 0).length;
  const outcomes = { updated: new Date(now).toISOString(), finished: fin, winRate: fin ? wins / fin : null, avgR: fin ? results.reduce((a, b) => a + b, 0) / fin : null,
    horizons: Object.fromEntries(Object.entries(horizons).map(([h, g]) => [h, { n: g.n, avgReturn: g.ret / g.n, avgBenchmark: g.bench / g.n }])) };
  fs.writeFileSync('data/outcomes.json', JSON.stringify(outcomes, null, 1));
  fs.writeFileSync('data/models.json', JSON.stringify(models, null, 1));
  fs.writeFileSync('data/signals.json', JSON.stringify({ generatedAt: new Date(now).toISOString(), session, logicVersion: L.LOGIC_VERSION, market: { up: mktUp }, scanned: stocks.length, errors, openTrades, quick: quick.slice(0, 6).map(x => x.row), quickRecord, stocks }, null, 1));
  fs.writeFileSync('data/alert-state.json', JSON.stringify({ day: '', sent: {} }));

  const buys = stocks.filter(s => s.state === 'Buy watch'), near = stocks.filter(s => s.state !== 'Buy watch' && s.trigger && s.trigger / s.last < 1.03).sort((a, b) => a.trigger / a.last - b.trigger / b.last).slice(0, 8);
  const msg = ['Daily scan, ' + session + ' close', 'All prices below are from that close. They do not update. Live prices come in the market-hours alerts.', 'Market: ' + (mktUp ? 'uptrend' : 'downtrend') + '. Scanned ' + stocks.length + ' stocks' + (QEXTRA.length ? ', plus ' + QEXTRA.length + ' large companies for quick trades' : '') + '.' + (errors.length ? ' ' + errors.length + ' failed to load.' : ''), '', 'ENTRY CONFIRMED (' + buys.length + ')'];
  for (const s of buys) msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ' closed ' + money(s.last) + '\n  buy range ' + money(s.buyLo) + ' to ' + money(s.buyHi) + ' at the next open\n  stop ' + money(s.stop) + (s.target ? ', target ' + money(s.target) + (s.hit !== null && s.hit !== undefined ? ' (reached in ' + Math.round(s.hit * 100) + '% of past trades)' : '') : ', no fixed target') + ', exit on a close below ~' + money(s.exitBelow) + (s.days ? '\n  typical holding time ' + s.days + ' trading days' : '') + '\n  ' + (s.earn || 'earnings date NOT CHECKED') + '\n  ' + L.HALAL_TEXT[s.halal] + '\n  ' + s.why);
  if (!buys.length) msg.push('None today.');
  else msg.push('Manual review only. Check earnings dates and halal status before acting.');
  if (quick.length) msg.push('', 'QUICK TRADES, 2 TO 5 DAYS (' + Math.min(quick.length, 3) + (quick.length > 3 ? ' of ' + quick.length : '') + ')', ...quick.slice(0, 3).map(x => x.text));
  else msg.push('', 'QUICK TRADES, 2 TO 5 DAYS', 'No setup at this close.');
  for (const x of Object.keys(myPos)) if (!myLines.some(l => l.startsWith(x + ':'))) myLines.push(posLine(x, myPos[x]) + '\n  no price data for this stock today, so it could not be checked');
  if (myLines.length) msg.splice(3, 0, '', 'YOUR POSITIONS (' + myLines.length + ')', ...myLines);
  if (blocked.length) msg.push('', 'BLOCKED, EVENT RISK (' + blocked.length + ')', ...blocked.slice(0, 8), 'No prices are given for blocked stocks.');
  if (exits.length) msg.push('', 'SELL / REASSESS WATCH (paper trades)', ...exits);
  if (near.length) { msg.push('', 'BUY WATCH, WAITING FOR CONFIRMATION'); near.forEach(s => msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ': needs a close above ~' + money(s.trigger) + ' (closed ' + money(s.last) + ')')); }
  if (picks.length) { picks.sort((a, b) => a.tier - b.tier); msg.push('', 'DISCOVERY PICKS WITH PRICES (' + picks.length + ')', ...picks.slice(0, 12).map(x => x.text)); if (picks.length > 12) msg.push('...and ' + (picks.length - 12) + ' more on the page.'); }
  if (weak.length) msg.push('', 'NO PLAN, POOR ODDS (' + weak.length + ')', 'The reward marker came before the stop in under 25% of past cases, so no prices are given: ' + weak.join(', ') + '.');
  if (quickRecord) msg.push('', 'Quick trade scoreboard: ' + quickRecord.n + ' finished, ' + Math.round(quickRecord.winRate * 100) + '% wins, average ' + (quickRecord.avgPct * 100).toFixed(2) + '% a trade' + (quickRecord.avgSpy !== null ? ' (S&P 500 ' + (quickRecord.avgSpy * 100).toFixed(2) + '% over the same days)' : '') + '.');
  if (fin) msg.push('', 'Paper record: ' + fin + ' finished, ' + Math.round(wins / fin * 100) + '% wins, average ' + outcomes.avgR.toFixed(2) + 'R.');
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
    w.push('', 'FOR NEXT WEEK', 'Check earnings dates and halal status on the page before acting on anything. Research only: nothing here is an order.');
    await telegram(w.filter(x => x !== '').join('\n').replace(/\n(SECTORS|BIGGEST|TREND|SIGNALS|WHAT|DISCOVERY|FOR NEXT)/g, '\n\n$1') + '\n' + FOOT);
  }
  console.log('daily scan done:', stocks.length, 'stocks,', buys.length, 'buy watch,', fresh.length, 'journal entries');
}

async function intraday(onlyMine) {
  const now = Date.now();
  const sig = readJson('data/signals.json', null);
  await tgCommands(sig);
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
