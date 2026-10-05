// Cloud scanner for the US stock signal board. Runs on GitHub Actions (free), so it works while your phone is off.
// It reuses the exact rules inside index.html, writes data/signals.json and an append-only journal, and sends Telegram alerts.
// Read only: it holds no broker login and cannot trade.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const env = process.env, MODE = env.MODE === 'intraday' ? 'intraday' : 'daily', RATE = Math.max(1, parseInt(env.RATE || '8', 10) || 8);
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
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
let DISC = new Set();
try { DISC = new Set((JSON.parse(fs.readFileSync('data/discovery.json', 'utf8')).candidates || []).map(c => c.sym).filter(x => /^[A-Z.\-]{1,8}$/.test(x))); } catch {}
const LIST = ['SPY', ...new Set([...(fromFile.length ? fromFile : DEFAULT), ...DISC].filter(s => s !== 'SPY'))].slice(0, 1000);

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
    const r = await fetch(TD + pathname + '&apikey=' + encodeURIComponent(env.TWELVE_KEY)), j = await r.json();
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

async function daily() {
  const now = Date.now(), loaded = {}, errors = [];
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
  const stocks = [], fresh = [], exits = [], openTrades = [], results = [], horizons = {}, picks = [];
  const refLine = (sym, d) => { const r = L.refPlan ? L.refPlan(d.candles, d.last) : null; if (r) picks.push({ tier: r.extended ? 3 : 2, text: sym + ' now ' + money(d.last) + ' (reference, not tested)\n  ' + (r.extended ? 'wait for a pullback, then buy ' : 'buy range ') + money(r.lo) + ' to ' + money(r.hi) + '\n  stop ' + money(r.stop) + ', target ' + money(r.target) + (r.exit ? ', exit on a close below ~' + money(r.exit) : '') }); };

  for (const sym of LIST) {
    const d = loaded[sym]; if (!d) continue;
    if (d.candles.length < 600) { if (DISC.has(sym)) refLine(sym, d); continue; }
    const c = d.candles, i = c.length - 1, ind = L.indicators(c, mkt), Lr = L.learn(c, ind, models[sym], sym === 'SPY'), T = L.trendStats(c, ind, mom6);
    models[sym] = Lr.key;
    const mine = journal.filter(x => x.sym === sym), resolved = mine.map(x => ({ x, t: L.resolveCall(x, c, ind) })).filter(y => y.t);
    for (const y of resolved) {
      if (y.t.open) openTrades.push({ sym, stop: +y.t.stop.toFixed(4), target: isFinite(y.t.target) ? +y.t.target.toFixed(4) : null, since: y.x.d });
      else { results.push(y.t.r); if (y.t.exitIdx === i) exits.push(sym + ': paper trade from ' + y.x.d + ' ended by ' + y.t.reason.replace('_', ' ') + ' (' + (y.t.r >= 0 ? '+' : '') + y.t.r.toFixed(2) + 'R)'); }
      const o = L.barOutcomes(y.x, c, ind); for (const h in o) { const g = horizons[h] || (horizons[h] = { n: 0, ret: 0, bench: 0 }); g.n++; g.ret += o[h].ret; g.bench += o[h].bench || 0; }
    }
    const paused = L.isPaused(resolved.filter(y => !y.t.open).map(y => y.t.r)), halal = L.halalOf(sym, null);
    const v = L.applyGates(L.verdict(c, ind, Lr, null, d.last, paused), { dollarVol: T.dollarVol, halal, limit: null }), trig = L.buyTrigger(c, ind, Lr), dist = Lr.v.mult * ind.atr[i];
    const row = { sym, last: d.last, state: v.word, why: v.why, halal, rule: L.ruleText(Lr.v), proven: Lr.proven, uptrend: T.up, mom6: +T.mom6.toFixed(4), trigger: trig.price ? +trig.price.toFixed(4) : null };
    if (v.act) Object.assign(row, { buyLo: d.last, buyHi: +(d.last + 0.5 * ind.atr[i]).toFixed(4), stop: +(d.last - dist).toFixed(4), target: Lr.v.tp ? +(d.last + Lr.v.tp * dist).toFixed(4) : null, exitBelow: +L.sellLevel({ v: Lr.v }, c, ind).toFixed(4) });
    stocks.push(row);
    if (DISC.has(sym) && halal !== 'fail') {
      if (v.act) picks.push({ tier: 0, text: sym + ' now ' + money(d.last) + ' (ENTRY CONFIRMED, tested rule)\n  buy range ' + money(row.buyLo) + ' to ' + money(row.buyHi) + '\n  stop ' + money(row.stop) + (row.target ? ', target ' + money(row.target) : ', no fixed target') + ', exit on a close below ~' + money(row.exitBelow) });
      else if (Lr.proven && trig.price && trig.price / d.last < 1.15) picks.push({ tier: 1, text: sym + ' now ' + money(d.last) + ' (BUY WATCH, tested rule)\n  buy only after a close above ~' + money(trig.price) + ', then up to ' + money(trig.price + 0.5 * ind.atr[i]) + '\n  stop ~' + money(trig.price - dist) + (Lr.v.tp ? ', target ~' + money(trig.price + Lr.v.tp * dist) : ', no fixed target') });
      else refLine(sym, d);
    }
    if (v.signal && !mine.some(x => x.d === c[i].d)) { const e = { sym, d: c[i].d, key: Lr.key, v: Lr.v, dist: +dist.toFixed(6), ref: d.last, state: v.word, loggedAt: new Date(now).toISOString() }; fresh.push(e); fs.appendFileSync('data/journal.jsonl', JSON.stringify(e) + '\n'); }
  }

  const fin = results.length, wins = results.filter(r => r > 0).length;
  const outcomes = { updated: new Date(now).toISOString(), finished: fin, winRate: fin ? wins / fin : null, avgR: fin ? results.reduce((a, b) => a + b, 0) / fin : null,
    horizons: Object.fromEntries(Object.entries(horizons).map(([h, g]) => [h, { n: g.n, avgReturn: g.ret / g.n, avgBenchmark: g.bench / g.n }])) };
  fs.writeFileSync('data/outcomes.json', JSON.stringify(outcomes, null, 1));
  fs.writeFileSync('data/models.json', JSON.stringify(models, null, 1));
  fs.writeFileSync('data/signals.json', JSON.stringify({ generatedAt: new Date(now).toISOString(), session, logicVersion: L.LOGIC_VERSION, market: { up: mktUp }, scanned: stocks.length, errors, openTrades, stocks }, null, 1));
  fs.writeFileSync('data/alert-state.json', JSON.stringify({ day: '', sent: {} }));

  const buys = stocks.filter(s => s.state === 'Buy watch'), near = stocks.filter(s => s.state !== 'Buy watch' && s.trigger && s.trigger / s.last < 1.03).sort((a, b) => a.trigger / a.last - b.trigger / b.last).slice(0, 8);
  const msg = ['Daily scan, ' + session + ' close', 'Market: ' + (mktUp ? 'uptrend' : 'downtrend') + '. Scanned ' + stocks.length + ' stocks.' + (errors.length ? ' ' + errors.length + ' failed to load.' : ''), '', 'ENTRY CONFIRMED (' + buys.length + ')'];
  for (const s of buys) msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ' now ' + money(s.last) + '\n  buy range ' + money(s.buyLo) + ' to ' + money(s.buyHi) + ' at the next open\n  stop ' + money(s.stop) + (s.target ? ', target ' + money(s.target) : ', no fixed target') + ', exit on a close below ~' + money(s.exitBelow) + '\n  ' + L.HALAL_TEXT[s.halal] + '\n  ' + s.why);
  if (!buys.length) msg.push('None today.');
  else msg.push('Manual review only. Check earnings dates and halal status before acting.');
  if (exits.length) msg.push('', 'SELL / REASSESS WATCH', ...exits);
  if (near.length) { msg.push('', 'BUY WATCH, WAITING FOR CONFIRMATION'); near.forEach(s => msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ': needs a close above ~' + money(s.trigger) + ' (now ' + money(s.last) + ')')); }
  if (picks.length) { picks.sort((a, b) => a.tier - b.tier); msg.push('', 'DISCOVERY PICKS WITH PRICES (' + picks.length + ')', ...picks.slice(0, 12).map(x => x.text)); if (picks.length > 12) msg.push('...and ' + (picks.length - 12) + ' more on the page.'); }
  if (fin) msg.push('', 'Paper record: ' + fin + ' finished, ' + Math.round(wins / fin * 100) + '% wins, average ' + outcomes.avgR.toFixed(2) + 'R.');
  await telegram(msg.join('\n') + '\n' + FOOT);
  console.log('daily scan done:', stocks.length, 'stocks,', buys.length, 'buy watch,', fresh.length, 'journal entries');
}

async function intraday() {
  const now = Date.now();
  if (!marketOpen(now) && !env.FORCE) { console.log('Market closed. Nothing to do.'); return; }
  const sig = readJson('data/signals.json', null); if (!sig) { console.log('No daily scan yet.'); return; }
  const st = readJson('data/alert-state.json', { day: '', sent: {} }), day = ny(now).d; if (st.day !== day) { st.day = day; st.sent = {}; }
  const buys = sig.stocks.filter(s => s.state === 'Buy watch'), trig = sig.stocks.filter(s => s.state !== 'Buy watch' && s.trigger && s.trigger / s.last < 1.03);
  const watch = [...new Set([...buys.map(s => s.sym), ...(sig.openTrades || []).map(t => t.sym), ...trig.map(s => s.sym)])].slice(0, 24), alerts = [];
  for (const sym of watch) {
    const j = await td('/price?symbol=' + encodeURIComponent(sym)), p = +j.price; if (!(p > 0)) continue;
    const say = (k, text) => { if (!st.sent[sym + k]) { st.sent[sym + k] = 1; alerts.push(sym + ' at ' + money(p) + ': ' + text); } };
    const b = buys.find(s => s.sym === sym), t = trig.find(s => s.sym === sym);
    if (b && p > b.buyHi) say('hi', 'above its buy range (' + money(b.buyLo) + ' to ' + money(b.buyHi) + '). Too late for this signal.');
    if (b && p <= b.stop) say('lo', 'already down to its stop level ' + money(b.stop) + '. The signal has failed.');
    if (t && p >= t.trigger) say('tr', 'BUY WATCH forming. It is above its trigger ~' + money(t.trigger) + '. It only counts if it closes above it today.');
    for (const o of (sig.openTrades || []).filter(x => x.sym === sym)) {
      if (p <= o.stop) say('st' + o.since, 'SELL / REASSESS WATCH. Paper trade from ' + o.since + ' is at its stop ' + money(o.stop) + '.');
      if (o.target && p >= o.target) say('tg' + o.since, 'paper trade from ' + o.since + ' reached its target ' + money(o.target) + '.');
    }
  }
  fs.writeFileSync('data/alert-state.json', JSON.stringify(st));
  if (alerts.length) await telegram('Market hours check\n\n' + alerts.join('\n\n') + '\n' + FOOT);
  console.log('intraday check done:', watch.length, 'watched,', alerts.length, 'new alerts');
}

await (MODE === 'intraday' ? intraday() : daily());
