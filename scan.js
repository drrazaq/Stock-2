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
  const stocks = [], fresh = [], exits = [], openTrades = [], results = [], horizons = {}, picks = [], quick = [], qFin = [], blocked = [], wk = [], famRes = {};
  const refLine = (sym, d) => { const r = L.refPlan ? L.refPlan(d.candles, d.last) : null; if (r) picks.push({ tier: r.extended ? 3 : 2, text: sym + ' now ' + money(d.last) + ' (reference, not tested)\n  ' + (r.extended ? 'wait for a pullback, then buy ' : 'buy range ') + money(r.lo) + ' to ' + money(r.hi) + '\n  stop ' + money(r.stop) + ', reward marker ' + money(r.target) + (r.exit ? ', exit on a close below ~' + money(r.exit) : '') + (() => { const o = L.refOdds ? L.refOdds(d.candles) : null; return o ? '\n  marker reached before the stop in ' + Math.round(o.won * 100) + '% of ' + o.cases + ' past cases (under 25% loses on average)' : ''; })() }); };

  for (const sym of LIST) {
    const d = loaded[sym]; if (!d) continue;
    const only = QONLY.has(sym);
    if (d.candles.length < 600) { if (DISC.has(sym)) refLine(sym, d); continue; }
    const c = d.candles, i = c.length - 1, ind = L.indicators(c, mkt), T = L.trendStats(c, ind, mom6), halal = L.halalOf(sym, null);
    if (!only && i > 140) { const e2 = ind.e[L.CFG.TREND], e5 = ind.e[50], j = i - 5; wk.push({ sym, chg: c[i].c / c[j].c - 1, up: T.up, wasUp: c[j].c > e2[j] && e5[j] > e2[j] && c[j].c / c[j - 126].c - 1 > 0 }); }
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
        if (v.act) picks.push({ tier: 0, text: sym + ' now ' + money(d.last) + ' (ENTRY CONFIRMED, tested rule)\n  buy range ' + money(row.buyLo) + ' to ' + money(row.buyHi) + '\n  stop ' + money(row.stop) + (row.target ? ', target ' + money(row.target) : ', no fixed target') + ', exit on a close below ~' + money(row.exitBelow) });
        else if (Lr.proven && trig.price && trig.price / d.last < 1.15) picks.push({ tier: 1, text: sym + ' now ' + money(d.last) + ' (BUY WATCH, tested rule)\n  buy only after a close above ~' + money(trig.price) + ', then up to ' + money(trig.price + 0.5 * ind.atr[i]) + '\n  stop ~' + money(trig.price - dist) + (Lr.v.tp ? ', target ~' + money(trig.price + Lr.v.tp * dist) : ', no fixed target') });
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
          text: sym + ' now ' + money(d.last) + '\n  why: in an uptrend, ' + L.quickWhat(Q.v) + '\n  buy ' + money(d.last) + ' to ' + money(d.last + 0.5 * ind.atr[i]) + ' at the next open' + (t1 ? '\n  target 1: ' + money(t1) + ' (half of its past quick trades got this far)' : '') + (t2 ? '\n  target 2: ' + money(t2) + ' (about one in four)' : '') + '\n  rule exit: first close above ~' + money(ind.sma5[i]) + ' (its 5 day average)\n  time exit: after 5 sessions\n  invalidation: ' + money(d.last - qd) + ' (stop loss)\n  size: about ' + per10k + ' shares per 10,000 USD of account (risking about ' + Math.round(per10k * qd) + ' USD)\n  past result here: ' + Math.round(Q.test.winRate * 100) + '% wins over ' + Q.test.n + ' unseen trades, average ' + (Q.avgPct * 100).toFixed(2) + '% a trade, about ' + Q.medDays + ' days held\n  ' + L.HALAL_TEXT[halal] });
        if (!mine.some(x => x.d === c[i].d && x.kind === 'quick')) { const e = { sym, d: c[i].d, key: Q.key, v: Q.v, dist: +qd.toFixed(6), ref: d.last, t1, state: 'Quick trade', kind: 'quick', loggedAt: new Date(now).toISOString() }; fresh.push(e); fs.appendFileSync('data/journal.jsonl', JSON.stringify(e) + '\n'); }
      }
    }
  }
  quick.sort((a, b) => b.t - a.t);
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
  const msg = ['Daily scan, ' + session + ' close', 'Market: ' + (mktUp ? 'uptrend' : 'downtrend') + '. Scanned ' + stocks.length + ' stocks' + (QEXTRA.length ? ', plus ' + QEXTRA.length + ' large companies for quick trades' : '') + '.' + (errors.length ? ' ' + errors.length + ' failed to load.' : ''), '', 'ENTRY CONFIRMED (' + buys.length + ')'];
  for (const s of buys) msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ' now ' + money(s.last) + '\n  buy range ' + money(s.buyLo) + ' to ' + money(s.buyHi) + ' at the next open\n  stop ' + money(s.stop) + (s.target ? ', target ' + money(s.target) + (s.hit !== null && s.hit !== undefined ? ' (reached in ' + Math.round(s.hit * 100) + '% of past trades)' : '') : ', no fixed target') + ', exit on a close below ~' + money(s.exitBelow) + (s.days ? '\n  typical holding time ' + s.days + ' trading days' : '') + '\n  ' + L.HALAL_TEXT[s.halal] + '\n  ' + s.why);
  if (!buys.length) msg.push('None today.');
  else msg.push('Manual review only. Check earnings dates and halal status before acting.');
  if (quick.length) msg.push('', 'QUICK TRADES, 2 TO 5 DAYS (' + Math.min(quick.length, 3) + (quick.length > 3 ? ' of ' + quick.length : '') + ')', ...quick.slice(0, 3).map(x => x.text));
  else msg.push('', 'QUICK TRADES, 2 TO 5 DAYS', 'No setup at this close.');
  if (blocked.length) msg.push('', 'BLOCKED, BINARY EVENT RISK (' + blocked.length + ')', ...blocked.slice(0, 8), 'No prices are given for blocked stocks.');
  if (exits.length) msg.push('', 'SELL / REASSESS WATCH (paper trades)', ...exits);
  if (near.length) { msg.push('', 'BUY WATCH, WAITING FOR CONFIRMATION'); near.forEach(s => msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ': needs a close above ~' + money(s.trigger) + ' (now ' + money(s.last) + ')')); }
  if (picks.length) { picks.sort((a, b) => a.tier - b.tier); msg.push('', 'DISCOVERY PICKS WITH PRICES (' + picks.length + ')', ...picks.slice(0, 12).map(x => x.text)); if (picks.length > 12) msg.push('...and ' + (picks.length - 12) + ' more on the page.'); }
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

async function intraday() {
  const now = Date.now();
  if (!marketOpen(now) && !env.FORCE) { console.log('Market closed. Nothing to do.'); return; }
  const sig = readJson('data/signals.json', null); if (!sig) { console.log('No daily scan yet.'); return; }
  const st = readJson('data/alert-state.json', { day: '', sent: {} }), day = ny(now).d; if (st.day !== day) { st.day = day; st.sent = {}; }
  const buys = sig.stocks.filter(s => s.state === 'Buy watch'), trig = sig.stocks.filter(s => s.state !== 'Buy watch' && s.trigger && s.trigger / s.last < 1.03);
  const qk = sig.quick || [];
  const watch = [...new Set([...qk.map(s => s.sym), ...buys.map(s => s.sym), ...(sig.openTrades || []).map(t => t.sym), ...trig.map(s => s.sym)])].slice(0, 24), alerts = [];
  for (const sym of watch) {
    const j = await td('/price?symbol=' + encodeURIComponent(sym)), p = +j.price; if (!(p > 0)) continue;
    const say = (k, text) => { if (!st.sent[sym + k]) { st.sent[sym + k] = 1; alerts.push(sym + ' at ' + money(p) + ': ' + text); } };
    const b = buys.find(s => s.sym === sym), t = trig.find(s => s.sym === sym), qs = qk.find(s => s.sym === sym);
    if (qs) {   // a quick trade setup from last night's close
      if (p > qs.buyHi) say('qhi', 'QUICK TRADE: above its entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + '). The dip is gone. Skip it.');
      else if (p <= qs.stop) say('qlo', 'QUICK TRADE: already at its invalidation level ' + money(qs.stop) + '. The setup has failed.');
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
  if (alerts.length) await telegram('Market hours check\n\n' + alerts.join('\n\n') + '\n' + FOOT);
  console.log('intraday check done:', watch.length, 'watched,', alerts.length, 'new alerts');
}

await (MODE === 'intraday' ? intraday() : daily());
