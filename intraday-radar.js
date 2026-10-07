// Early-wave radar for Stock-2. Runs on GitHub Actions about every 15 minutes while the US market is open.
// It follows the stocks the morning whole-market sweep found in strong uptrends and walks each one through a ladder:
//   PRE-WAVE WATCH  ->  BREAKOUT CONFIRMATION  ->  PULLBACK BUY REVIEW  ->  DO NOT CHASE
// so a move is shown while it is developing, with a review range, a stop and two markers, instead of after it has run.
// HONEST LIMITS. These are NEW rules with no past test: every card says PAPER ONLY, and every one is followed on paper so the
// record decides. Prices are single live quotes taken at each run (no minute bars, no live volume, no VWAP). Coverage is the
// prepared list (about 320 stocks), never the whole market. Read-only: no broker access, no orders.
import fs from 'node:fs';

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', TG = local(env.TG_BASE) || 'https://api.telegram.org', TEST = Boolean(local(env.FH_BASE));
if (!env.FINNHUB_KEY) { console.error('Missing FINNHUB_KEY'); process.exit(1); }
fs.mkdirSync('data', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const write = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 1));
const ny = ms => { const p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value); return { d: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute, weekend: p.weekday === 'Sat' || p.weekday === 'Sun' }; };
const now = Date.now(), n = ny(now);
if (TEST && env.TEST_MINS) { n.mins = +env.TEST_MINS; n.weekend = false; if (env.TEST_DAY) n.d = env.TEST_DAY; }      // local test clock
const marketOpen = !n.weekend && n.mins >= 570 && n.mins < 960;
if (!marketOpen && !env.FORCE) { console.log('Market closed; radar skipped.'); process.exit(0); }
const num = x => Number.isFinite(+x) ? +x : null;
const money = x => Number.isFinite(x) ? x.toFixed(2) : 'n/a';
const pct = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const clock = (ms, tz) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (r.status === 429) { await sleep(TEST ? 5 : 5000 * (i + 1)); continue; } return { status: r.status, json: await r.json().catch(() => ({})) }; }
    catch (e) { if (i === 2) return { status: 0, json: {} }; await sleep(TEST ? 5 : 1500); }
  }
  return { status: 0, json: {} };
}
async function telegram(text) {
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  const parts = []; let cur = '';
  for (const ln of text.split('\n')) { if ((cur + '\n' + ln).length > 3800) { parts.push(cur); cur = ln; } else cur = cur ? cur + '\n' + ln : ln; }
  if (cur) parts.push(cur);
  for (const part of parts) await fetch(`${TG}/bot${env.TG_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: part, disable_web_page_preview: true }) }).catch(() => {});
}

// ---- Settings, all in one place
const CFG = {
  OR_END: 570 + 45,        // the "opening range" is the first 45 minutes; its high is the trigger
  WATCH_LO: 0.01, WATCH_HI: 0.06,   // a pre-wave watch is up 1% to 6% on the day
  CHASE: 0.04,             // a review is offered only within 4% above the trigger
  FAST: 0.15,              // up more than 15% on the day: do not chase
  COST: 0.004, COST_PENNY: 0.012,   // round-trip cost taken off every paper trade (under 5 USD: three times as much)
  MAX_WATCH_ALERTS: 2, MAX_REVIEW_ALERTS: 3, MAX_PAPER_PER_DAY: 20, MAX_NEWS_CHECKS: 40
};

// ---- News: a hard block, a real catalyst, or commentary
const HARD = /\b(pric(es|ed|ing)|announc(es|ed|ing)|launch(es|ed|ing)?|propos(es|ed)|commenc(es|ed|ing)|clos(es|ed|ing)|files? for|plans?)\b[^.]{0,70}\b((public|follow-on|underwritten|registered direct|secondary) offering|offering of (common |ordinary )?(stock|shares|ADSs)|private placement|convertible (senior )?notes)|\bregistered direct\b|\bsecondary offering\b|at-the-market (offering|program|facility)|\bATM (offering|program|facility)\b|\b(share|stock|equity) offering\b|reverse (stock )?split|trading halt|\bhalted\b|bankruptcy|chapter 11|going[- ]concern|delist|\b(SEC|DOJ)\b[^.]{0,40}(investigat|probe|subpoena)|complete response letter|FDA (rejects|rejection|declines)|clinical hold|fails? to meet|did not meet|misses? (primary )?endpoint/i;
const STRONG = [
  ['earnings beat or raised guidance', /\b(beats?|tops|topped|crush\w*|surpass\w*|exceed\w*|smash\w*)\b[^.]{0,45}\b(estimates?|expectations|forecasts?|consensus|views)\b|\brecord (quarter(ly)?|revenue|sales|earnings|profit)|\b(raises?|raised|lifts?|lifted|boosts?|boosted|hikes?|hiked|increases?)\b[^.]{0,30}\b(guidance|outlook|forecast)\b|earnings (beat|surprise)/i],
  ['acquisition or buyout', /\bto be acquired\b|\bto acquire\b|\bacquisition of\b|\bbuyout\b|\btakeover (bid|offer)\b|\bmerger (agreement|with)\b|\bagrees? to (buy|be bought|merge|acquire)\b|\btender offer\b/i],
  ['drug or device approval', /\bFDA (approv\w*|clear\w*|grants?)\b|\b(receives?|wins?|gets?|secures?|granted)\b[^.]{0,30}\b(approval|clearance|breakthrough|fast track|orphan drug)\b|\b(meets?|met|achiev\w+)\b[^.]{0,30}\b(primary )?endpoints?\b|\bpositive (top-?line|phase [123i]+|pivotal)\b/i],
  ['government award', /\b(department of \w+|DoD|pentagon|army|navy|air force|space force|NASA|DARPA|government)\b[^.]{0,50}\b(contract|award|order)\b/i],
  ['major contract or order', /\b(wins?|won|awarded|secures?|secured|lands?|receives?|signs?|signed)\b[^.]{0,50}\b(contract|order|award|supply agreement|deal)\b|\$\s?\d[\d.,]*\s?(million|billion|[MB])\b[^.]{0,30}\b(contract|order|award)\b/i],
  ['strategic partnership', /\b(strategic )?(partnership|collaboration|alliance) with\b|\bpartners with\b|\bteams up with\b|\bjoint venture\b/i]];
const CHATTER = /cramer|should you (buy|sell)|stocks? to (buy|watch)|is it (a buy|time to)|\?|price target|upgrad|downgrad|analysts? (say|see|think|forecasts?|ratings?|calls?|picks?)|why (is|are|did|shares|.{1,25} stock)|here'?s why|here are|\btop \d+\b|\b\d+ (top|best)\b|(premarket|pre-market|midday|after-hours) (movers|stocks)|stocks? (moving|movers|jump|surge|slide)|market (wrap|update)|what to (know|watch)/i;
const strongOf = (h) => { if (CHATTER.test(h)) return null; const t = STRONG.find(([, re]) => re.test(h)); return t ? t[0] : null; };
let newsCalls = 0;
const GENERIC = /^(the|first|american|united|national|general|global|international|new|north|south|western|eastern|pacific|atlantic|advanced|applied|digital|energy|capital|financial|group|holdings?)$/i;
async function catalyst(sym) {
  if (newsCalls >= CFG.MAX_NEWS_CHECKS) return { status: 'NOT_CHECKED' };
  newsCalls++;
  const from = new Date(now - 48 * 3600000).toISOString().slice(0, 10), to = new Date(now).toISOString().slice(0, 10);
  const r = await get(`${FH}/company-news?symbol=${sym}&from=${from}&to=${to}&token=${encodeURIComponent(env.FINNHUB_KEY)}`); await sleep(TEST ? 0 : 1050);
  if (!Array.isArray(r.json)) return { status: 'NOT_CHECKED' };
  // A headline counts only if it is about THIS company: it must name the ticker or the company. News feeds attach
  // other companies' stories to a ticker, and those must not become its catalyst.
  let word = '';
  try { const pr = await get(`${FH}/stock/profile2?symbol=${sym}&token=${encodeURIComponent(env.FINNHUB_KEY)}`); await sleep(TEST ? 0 : 1050); const w = String((pr.json && pr.json.name) || '').split(/[\s,.]+/)[0]; if (w.length >= 4 && !GENERIC.test(w)) word = w; } catch (e) {}
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), about = new RegExp('(^|[^A-Za-z])' + esc(sym) + '([^A-Za-z]|$)' + (word ? '|\\b' + esc(word) : ''), word ? 'i' : '');
  const items = r.json.filter(x => x && x.headline && about.test(String(x.headline))).map(x => ({ h: String(x.headline), at: x.datetime ? x.datetime * 1000 : null }));
  const bad = items.find(x => HARD.test(x.h)); if (bad) return { status: 'BLOCKED', headline: bad.h.slice(0, 160), at: bad.at };
  const good = items.map(x => ({ ...x, kind: strongOf(x.h) })).find(x => x.kind);
  return good ? { status: 'STRONG', kind: good.kind, headline: good.h.slice(0, 160), at: good.at } : { status: items.length ? 'WEAK' : 'NONE', headline: items[0] ? items[0].h.slice(0, 160) : null };
}

// ---- Live quotes for the prepared list
const uni = new Map();
for (const x of (read('data/radar-universe.json', {}).syms || [])) if (/^[A-Z]{1,5}$/.test(x.sym || '')) uni.set(x.sym, +x.dv || 0);
for (const x of (read('data/leaders-universe.json', {}).syms || [])) if (/^[A-Z]{1,5}$/.test(x.sym || '') && !uni.has(x.sym)) uni.set(x.sym, 2e7);
for (const x of (read('data/discovery.json', {}).candidates || [])) if (/^[A-Z]{1,5}$/.test(x.sym || '') && !uni.has(x.sym)) uni.set(x.sym, 2e6);
const MAXQ = Math.min(400, +(env.RADAR_MAX_QUOTES || 320)), quotes = [];
async function quote(sym) {
  const r = await get(`${FH}/quote?symbol=${sym}&token=${encodeURIComponent(env.FINNHUB_KEY)}`); await sleep(TEST ? 0 : 1050);          // free plan: 60 calls a minute
  if (r.status === 401 || r.status === 403) { console.error('Finnhub refused the live quote (HTTP ' + r.status + '). Check the FINNHUB_KEY secret.'); process.exit(1); }
  const q = r.json || {}, c = num(q.c), pc = num(q.pc);
  if (!(c > 0 && pc > 0) || (q.t && now / 1000 - q.t > 20 * 3600 && !TEST)) return null;           // no quote, or one left over from an earlier day
  return { sym, c, o: num(q.o) || c, h: Math.max(num(q.h) || c, c), l: Math.min(num(q.l) || c, c), pc, age: q.t ? Math.max(0, Math.round((now / 1000 - q.t) / 60)) : null };
}
let asked = 0;
for (const [sym, dv] of [...uni].slice(0, MAXQ)) { asked++; const q = await quote(sym); if (q) quotes.push({ ...q, dv }); }
console.log(`live quotes: ${quotes.length} of ${asked}, list of ${uni.size}`);
if (!quotes.length) { write('data/intraday-radar.json', { generatedAt: new Date(now).toISOString(), session: n.d, status: 'NO_DATA', candidates: [] }); console.log('NO_DATA: no live quotes'); process.exit(0); }
const qmap = new Map(quotes.map(q => [q.sym, q]));

// ---- Paper ledger: every review is followed to its result. In at the price shown on the card. Out at the stop, at marker 1,
// or after five sessions. If the stop and the marker fall in one day, the stop counts.
const PAPER = read('data/radar-paper.json', { open: [], done: [] });
if (marketOpen) {
  for (const p of PAPER.open) {
    const t = qmap.get(p.sym) || await quote(p.sym); if (!t) continue;
    const same = p.d === n.d, lo = same ? t.c : t.l, hi = same ? t.c : t.h;
    if (p.lastD !== n.d) { p.lastD = n.d; p.days = (p.days || 0) + 1; }
    let exit = null, why = '';
    if (lo <= p.stop) { exit = !same && t.o > 0 && t.o < p.stop ? t.o : p.stop; why = 'stop'; }
    else if (hi >= p.t1) { exit = !same && t.o > p.t1 ? t.o : p.t1; why = 'marker 1'; }
    else if (p.days > 5) { exit = t.c; why = 'five sessions'; }
    if (exit) { p.exit = +exit.toFixed(4); p.why = why; p.out = n.d; p.gross = +(exit / p.entry - 1).toFixed(5); p.pct = +(p.gross - (p.entry < 5 ? CFG.COST_PENNY : CFG.COST)).toFixed(5); }
  }
  PAPER.done.push(...PAPER.open.filter(p => p.exit)); PAPER.done = PAPER.done.slice(-600); PAPER.open = PAPER.open.filter(p => !p.exit);
}

// ---- The ladder. One record per stock per day.
const DAY0 = read('data/radar-day.json', {}), DAY = DAY0.d === n.d ? DAY0 : { d: n.d, syms: {}, watchAlerts: 0, reviewAlerts: 0, paperToday: 0, late: 0 };
const REVIEW = new Set(['BREAKOUT_CONFIRMATION', 'PULLBACK_BUY_REVIEW']), AFTER = new Set(['BREAKOUT_CONFIRMATION', 'EXTENDED_WAIT_PULLBACK', 'PULLBACK_WATCH']);
function levels(s, q) {       // review range, stop and markers for a card
  const entry = q.c, range = Math.max(q.h - q.l, q.c * 0.005), stop = Math.min(entry * 0.975, Math.max(entry * 0.93, s.trig - 0.5 * range)), R = entry - stop;
  return { entry: +entry.toFixed(4), lo: +Math.min(s.trig, entry).toFixed(4), hi: +entry.toFixed(4), noEntryAbove: +(s.trig * (1 + CFG.CHASE)).toFixed(4), stop: +stop.toFixed(4), t1: +(entry + 1.5 * R).toFixed(4), t2: +(entry + 2.5 * R).toFixed(4) };
}
const changed = [];
if (marketOpen) for (const q of quotes) {
  const first = !DAY.syms[q.sym], s = DAY.syms[q.sym] || (DAY.syms[q.sym] = { t0: now, p0: q.c, ch0: +(q.c / q.pc - 1).toFixed(4), above: 0 });
  const change = q.c / q.pc - 1, pos = (q.c - q.l) / Math.max(q.h - q.l, 1e-9);
  if (first && change > 0.10) { s.late = true; DAY.late++; fs.appendFileSync('data/intraday-missed.jsonl', JSON.stringify({ sym: q.sym, d: n.d, seenAt: new Date(now).toISOString(), price: q.c, change: +change.toFixed(4), reason: 'already up over 10% when first seen today' }) + '\n'); }
  if (!s.trig) { if (n.mins < CFG.OR_END) { s.orh = Math.max(s.orh || 0, q.h); continue; } s.trig = +(s.orh || q.h).toFixed(4); if (!s.orh) continue; }     // the trigger is fixed once the opening range is over
  const prev = s.stage || null; let stage = prev;
  if (prev === 'BLOCKED' || prev === 'FAILED' || prev === 'PULLBACK_BUY_REVIEW') { /* final for today */ }
  else if (change > CFG.FAST) stage = 'DO_NOT_CHASE';
  else if (AFTER.has(prev)) {
    if (s.lv && q.c < s.lv.stop) stage = 'FAILED';
    else if (q.c <= s.trig * 1.01 && q.c >= s.trig * 0.985) { s.pbLow = q.c; stage = 'PULLBACK_WATCH'; }
    else if (prev === 'PULLBACK_WATCH' && q.c > s.pbLow && q.c > s.trig && q.c <= s.trig * 1.03) stage = 'PULLBACK_BUY_REVIEW';
    else if (prev === 'PULLBACK_WATCH' && q.c < s.trig * 0.985) stage = 'FAILED';
  } else {
    s.above = q.c > s.trig ? (s.above || 0) + 1 : 0;
    if (s.above >= 2 && q.c <= s.trig * (1 + CFG.CHASE) && change >= CFG.WATCH_LO) stage = 'BREAKOUT_CONFIRMATION';
    else if (s.above >= 1 && q.c > s.trig * (1 + CFG.CHASE)) stage = 'EXTENDED_WAIT_PULLBACK';
    else if (change >= CFG.WATCH_LO && change <= CFG.WATCH_HI && pos >= 0.5 && q.c >= s.trig * 0.97) stage = 'PRE_WAVE_WATCH';
    else stage = prev === 'DO_NOT_CHASE' ? prev : null;
  }
  if (stage && stage !== prev && !['FAILED', 'DO_NOT_CHASE', 'EXTENDED_WAIT_PULLBACK', 'PULLBACK_WATCH'].includes(stage)) {          // a stage worth looking at: check the news once
    if (!s.cat || s.cat.status === 'NOT_CHECKED') s.cat = await catalyst(q.sym);
    if (s.cat.status === 'BLOCKED') stage = 'BLOCKED';
  }
  if (REVIEW.has(stage) && stage !== prev) s.lv = levels(s, q);
  if (stage !== prev) { s.stage = stage; s.at = now; if (stage) changed.push({ q, s, stage, prev }); }
}

// ---- Cards and alerts. A message is sent only when a stock changes stage, each stage once per stock per day.
const tstamp = clock(now, 'Asia/Kuwait') + ' Kuwait / ' + clock(now, 'America/New_York') + ' New York';
const catLine = (c) => !c || c.status === 'NOT_CHECKED' ? 'not checked' : c.status === 'STRONG' ? 'VERIFIED HEADLINE, ' + c.kind + ': ' + c.headline : c.status === 'WEAK' ? 'none. Only commentary found: ' + c.headline : 'none found';
const liq = (q) => q.dv >= 2e7 ? 'good' : q.dv >= 5e6 ? 'acceptable' : 'CAUTION, thinly traded';
function card({ q, s, stage }) {
  const L = s.lv, head = q.sym + '  ' + money(q.c) + ' (' + pct(q.c / q.pc - 1) + ' today)' + (q.c < 5 ? '  UNDER 5 USD: penny rules, paper only' : '');
  if (stage === 'PRE_WAVE_WATCH') return [head, 'STAGE: PRE-WAVE WATCH. Not a buy. Waiting for confirmation', 'TRIGGER: two checks in a row above ' + money(s.trig) + ' (the high of the first 45 minutes)', 'INVALID if it falls under ' + money(Math.min(q.l, s.trig * 0.97)), 'CATALYST: ' + catLine(s.cat), 'LIQUIDITY: ' + liq(q) + ' | HALAL: not verified, check ZAD | DATA AGE: ' + (q.age === null ? 'unknown' : q.age + ' min')].join('\n  ');
  return [head, 'STAGE: ' + (stage === 'PULLBACK_BUY_REVIEW' ? 'PULLBACK BUY REVIEW' : 'BREAKOUT CONFIRMATION, BUY REVIEW') + ' — NEW RULE, PAPER ONLY',
    'BUY REVIEW RANGE: ' + money(L.lo) + ' to ' + money(L.hi), 'DO NOT ENTER ABOVE: ' + money(L.noEntryAbove), 'STOP / INVALIDATION: ' + money(L.stop) + ' (' + ((1 - L.stop / L.entry) * 100).toFixed(1) + '% risk)',
    'MARKER 1: ' + money(L.t1) + ' | MARKER 2: ' + money(L.t2) + ' | reward to risk at marker 1: 1.5 to 1',
    'WHY: ' + (stage === 'PULLBACK_BUY_REVIEW' ? 'it broke ' + money(s.trig) + ', came back to that level, held and turned up' : 'two checks in a row above ' + money(s.trig) + ', the high of the first 45 minutes'),
    'CATALYST: ' + catLine(s.cat), 'LIQUIDITY: ' + liq(q) + ' | HALAL: not verified, check ZAD | DATA AGE: ' + (q.age === null ? 'unknown' : q.age + ' min'),
    'CANCEL IF: it trades above ' + money(L.noEntryAbove) + ' before you act, the stop breaks, it is halted, or the news is contradicted'].join('\n  ');
}
const rank = (x) => (x.s.cat && x.s.cat.status === 'STRONG' ? 1e12 : 0) + x.q.dv;
const watchCards = [], reviewCards = [];
for (const x of changed.sort((a, b) => rank(b) - rank(a))) {
  if (REVIEW.has(x.stage)) {
    const kind = x.stage === 'PULLBACK_BUY_REVIEW' ? 'pullback' : 'breakout';
    if (DAY.paperToday < CFG.MAX_PAPER_PER_DAY && !PAPER.open.some(p => p.sym === x.q.sym)) { DAY.paperToday++; PAPER.open.push({ sym: x.q.sym, d: n.d, lastD: n.d, days: 1, at: new Date(now).toISOString(), kind, cat: x.s.cat && x.s.cat.status === 'STRONG' ? x.s.cat.kind : null, entry: x.s.lv.entry, stop: x.s.lv.stop, t1: x.s.lv.t1, assumedFill: true, fillBasis: 'single live quote; verify with bars before treating as fillable', chg0: x.s.ch0, chgIn: +(x.q.c / x.q.pc - 1).toFixed(4) }); }
    // Only a review backed by a real catalyst about that company is sent to the phone, three a day at most.
    // Every other review is still followed on paper and counted in the scorecard, without a message.
    if (x.s.cat && x.s.cat.status === 'STRONG' && DAY.reviewAlerts < CFG.MAX_REVIEW_ALERTS) { DAY.reviewAlerts++; reviewCards.push(card(x)); }
  } else if (x.stage === 'PRE_WAVE_WATCH' && !x.s.watchTold && x.s.cat && x.s.cat.status === 'STRONG' && DAY.watchAlerts < CFG.MAX_WATCH_ALERTS) { x.s.watchTold = 1; DAY.watchAlerts++; watchCards.push(card(x)); }
}
// the ledger's summary, split so that a breakout is never mixed with a pullback, nor a penny stock with the rest
function ledger() {
  const g = (name, f) => { const a = PAPER.done.filter(f); if (!a.length) return null; const w = a.filter(p => p.pct > 0), l = a.filter(p => p.pct <= 0), sum = (z) => z.reduce((t, p) => t + p.pct, 0);
    return name + ': ' + a.length + ' finished, ' + Math.round(w.length / a.length * 100) + '% won, average ' + pct(sum(a) / a.length) + ' after costs' + (l.length && sum(l) < 0 ? ', profit factor ' + (sum(w) / -sum(l)).toFixed(2) : ''); };
  const rows = [g('Breakout reviews', p => p.kind !== 'pullback' && p.entry >= 5), g('Pullback reviews', p => p.kind === 'pullback' && p.entry >= 5), g('With a verified catalyst', p => p.cat && p.entry >= 5), g('Under 5 USD (separate)', p => p.entry < 5)].filter(Boolean);
  return rows.length ? rows.join('\n') + (PAPER.done.length < 20 ? '\nUnder 20 finished trades: too few to judge.' : '') : 'No finished paper trade yet. ' + PAPER.open.length + ' open.';
}
const COVER = 'Coverage: ' + quotes.length + ' strong-trend stocks quoted live at ' + tstamp + '. Not the whole market.';
const NOTE = 'A manual decision, not an order. These rules are new and have no past test: paper only until the record below earns trust.';
if (marketOpen && reviewCards.length) await telegram('EARLY-WAVE RADAR: BUY REVIEW\n' + tstamp + '\n\n' + reviewCards.join('\n\n') + '\n\n' + NOTE + '\nPAPER RECORD\n' + ledger() + '\n' + COVER + '\nNot financial advice, not a halal ruling.');
if (marketOpen && watchCards.length) await telegram('EARLY-WAVE RADAR: PRE-WAVE WATCH (real catalyst, not yet a buy review)\n' + tstamp + '\n\n' + watchCards.join('\n\n') + '\n\nI will message again only if one of these confirms.\n' + COVER);
if (!marketOpen) await telegram('RADAR TEST RUN, MARKET CLOSED\nQuotes are from the last session, so no stage is worked out and nothing is recorded. ' + COVER + '\nThe radar starts by itself after the open (4:30 pm Kuwait).');

// ---- After-the-close scorecard: once, at the last runs of the session
const all = Object.entries(DAY.syms), cnt = (st) => all.filter(([, s]) => s.stage === st).length;
if (marketOpen && n.mins >= 930 && !DAY.scoreSent) {
  DAY.scoreSent = 1;
  const today = PAPER.done.filter(p => p.d === n.d), openToday = PAPER.open.filter(p => p.d === n.d);
  await telegram(['EARLY-WAVE SCORECARD, ' + n.d, 'Stocks followed live: ' + all.length, 'Pre-wave watch at the close: ' + cnt('PRE_WAVE_WATCH'), 'Buy reviews followed on paper today: ' + DAY.paperToday + ' (breakout confirmations and pullback reviews). Sent to you: ' + (DAY.reviewAlerts || 0) + ', only those with a real catalyst',
    'Of those, already finished today: ' + today.filter(p => p.why === 'marker 1').length + ' reached marker 1, ' + today.filter(p => p.why === 'stop').length + ' hit the stop. Still open: ' + openToday.length,
    'Failed after confirming: ' + cnt('FAILED') + '. Ran away without a fair entry: ' + cnt('EXTENDED_WAIT_PULLBACK') + '. Do not chase: ' + cnt('DO_NOT_CHASE') + '. Blocked by news: ' + cnt('BLOCKED'),
    'Seen too late (already up over 10% at first sight): ' + DAY.late, '', 'PAPER RECORD SO FAR (assumed quote fills; not execution-grade)', ledger(), '', COVER, 'New rules, paper only. Not financial advice.'].join('\n'));
}

// ---- Files for the page, the bot and tonight's scan
if (marketOpen) {
  write('data/radar-paper.json', PAPER); write('data/radar-day.json', DAY);
  const cands = all.filter(([, s]) => s.stage).map(([sym, s]) => ({ sym, stage: s.stage, verdict: REVIEW.has(s.stage) ? 'EARLY_WAVE_REVIEW' : s.stage, trigger: s.trig, levels: s.lv || null, catalyst: s.cat || null, at: new Date(s.at).toISOString() }))
    .sort((a, b) => (REVIEW.has(b.stage) ? 2 : b.stage === 'PRE_WAVE_WATCH' ? 1 : 0) - (REVIEW.has(a.stage) ? 2 : a.stage === 'PRE_WAVE_WATCH' ? 1 : 0)).slice(0, 60);
  const board = ['EARLY-WAVE RADAR, ' + n.d + ', as of ' + tstamp, COVER, ''];
  const sec = (title, st) => { const a = cands.filter(c => st.includes(c.stage)); if (a.length) board.push(title + ' (' + a.length + ')', ...a.slice(0, 10).map(c => c.sym + (c.levels ? ': review ' + money(c.levels.lo) + ' to ' + money(c.levels.hi) + ', stop ' + money(c.levels.stop) + ', marker ' + money(c.levels.t1) : ': trigger ' + money(c.trigger)) + (c.catalyst && c.catalyst.status === 'STRONG' ? ' | ' + c.catalyst.kind : '')), ''); };
  sec('BUY REVIEW — NEW RULE, PAPER ONLY', ['BREAKOUT_CONFIRMATION', 'PULLBACK_BUY_REVIEW']); sec('PRE-WAVE WATCH', ['PRE_WAVE_WATCH']); sec('WAIT FOR PULLBACK', ['EXTENDED_WAIT_PULLBACK', 'PULLBACK_WATCH']); sec('DO NOT CHASE', ['DO_NOT_CHASE']); sec('BLOCKED BY NEWS', ['BLOCKED']);
  if (board.length === 3) board.push('Nothing on the ladder yet today.', '');
  board.push('PAPER RECORD', ledger());
  write('data/intraday-radar.json', { generatedAt: new Date(now).toISOString(), session: n.d, status: 'OK', quoted: quotes.length, candidates: cands, text: board.join('\n'), note: 'New rules with no past test. Paper only. Entries are assumed quote observations until real bars verify fillability.' });
}
console.log(`radar: ${quotes.length} quoted, ${changed.length} stage changes, ${reviewCards.length} review alerts, ${watchCards.length} watch alerts, paper open ${PAPER.open.length}, done ${PAPER.done.length}`);
