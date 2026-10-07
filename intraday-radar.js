// Intraday early-wave radar for Stock-2: live quotes on the stocks the morning whole-market sweep found in strong uptrends.
// Research-only: no broker access, no order execution, no guaranteed outcome.
// Writes data/intraday-radar.json and append-only paper/missed logs.
import fs from 'node:fs';

const env = process.env;
const MASSIVE = env.MASSIVE_BASE && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.MASSIVE_BASE) ? env.MASSIVE_BASE : 'https://api.massive.com';
const FH = env.FH_BASE && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.FH_BASE) ? env.FH_BASE : 'https://finnhub.io/api/v1';
const TG = env.TG_BASE && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.TG_BASE) ? env.TG_BASE : 'https://api.telegram.org';
if (!env.FINNHUB_KEY) { console.error('Missing FINNHUB_KEY'); process.exit(1); }
fs.mkdirSync('data', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const write = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 1));
const ny = ms => { const p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value); return { d: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute, weekend: p.weekday === 'Sat' || p.weekday === 'Sun' }; };
const now = Date.now(), n = ny(now), marketOpen = (!n.weekend && n.mins >= 570 && n.mins < 960) || (env.TEST_OPEN === '1' && FH.startsWith('http://'));   // the second part is a local test hook only
if (!marketOpen && !env.FORCE) { console.log('Market closed; radar skipped.'); process.exit(0); }
const num = x => Number.isFinite(+x) ? +x : null;
const money = x => Number.isFinite(x) ? x.toFixed(2) : 'n/a';
const pct = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (r.status === 429) { await sleep(5000 * (i + 1)); continue; } return { status: r.status, json: await r.json().catch(() => ({})) }; }
    catch (e) { if (i === 2) return { status: 0, json: {} }; await sleep(1500); }
  }
  return { status: 0, json: {} };
}
async function telegram(text) {
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  await fetch(`${TG}/bot${env.TG_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
}
// ---- Live prices. The provider's whole-market snapshot is a paid feature, so the radar watches a prepared list instead:
// every stock the morning sweep of the whole market found in a strong uptrend (about 300, liquid ones first), plus the leaders
// and discovery candidates. Finnhub's free live quote is asked for each one. It carries no volume, so liquidity comes from the
// sweep's own average daily dollar volume.
const uni = new Map();
for (const x of (read('data/radar-universe.json', {}).syms || [])) if (/^[A-Z]{1,5}$/.test(x.sym || '')) uni.set(x.sym, +x.dv || 0);
for (const x of (read('data/leaders-universe.json', {}).syms || [])) if (/^[A-Z]{1,5}$/.test(x.sym || '') && !uni.has(x.sym)) uni.set(x.sym, 2e7);
for (const x of (read('data/discovery.json', {}).candidates || [])) if (/^[A-Z]{1,5}$/.test(x.sym || '') && !uni.has(x.sym)) uni.set(x.sym, 2e6);
const MAXQ = Math.min(400, +(env.RADAR_MAX_QUOTES || 320)), tickers = [];
let asked = 0, failed = 0;
for (const [sym, dv] of [...uni].slice(0, MAXQ)) {
  const r = await get(`${FH}/quote?symbol=${sym}&token=${encodeURIComponent(env.FINNHUB_KEY)}`); asked++;
  if (r.status === 401 || r.status === 403) { console.error('Finnhub refused the live quote (HTTP ' + r.status + '). Check the FINNHUB_KEY secret.'); process.exit(1); }
  const q = r.json || {}, c = num(q.c), pc = num(q.pc);
  if (!(c > 0 && pc > 0) || (q.t && now / 1000 - q.t > 20 * 3600 && !env.FAST)) { failed++; }      // no quote, or a quote left over from an earlier day
  else tickers.push({ ticker: sym, day: { c, o: num(q.o), h: num(q.h), l: num(q.l), v: dv / c }, prevDay: { c: pc } });
  await sleep(env.FAST ? 0 : 1050);          // free plan: 60 calls a minute
}
console.log(`live quotes: ${tickers.length} of ${asked} (${failed} without a fresh quote), list of ${uni.size}`);
if (!tickers.length) { write('data/intraday-radar.json', { generatedAt: new Date(now).toISOString(), session: n.d, status: 'NO_DATA', candidates: [] }); console.log('NO_DATA: no live quotes'); process.exit(0); }
const hard = /\b(pric(es|ed|ing)|announc(es|ed|ing)|launch(es|ed|ing)?|propos(es|ed)|commenc(es|ed|ing)|clos(es|ed|ing)|files? for|plans?)\b[^.]{0,70}\b((public|follow-on|underwritten|registered direct|secondary) offering|offering of (common |ordinary )?(stock|shares|ADSs)|private placement|convertible (senior )?notes)|\bregistered direct\b|\bsecondary offering\b|at-the-market (offering|program|facility)|\bATM (offering|program|facility)\b|\b(share|stock|equity) offering\b|reverse (stock )?split|trading halt|\bhalted\b|bankruptcy|chapter 11|going[- ]concern|delist|\b(SEC|DOJ)\b[^.]{0,40}(investigat|probe|subpoena)|complete response letter|FDA (rejects|rejection|declines)|clinical hold/i;
// A real reason for a move, against commentary. Only a strong catalyst may raise an alert.
const STRONG = [
  ['earnings beat or raised guidance', /\b(beats?|tops?|crush\w*|surpass\w*|exceed\w*|smash\w*)\b[^.]{0,45}\b(estimates?|expectations|forecasts?|consensus|views)\b|\brecord (quarter(ly)?|revenue|sales|earnings|profit)|\b(raises?|raised|lifts?|lifted|boosts?|boosted|hikes?|hiked|increases?)\b[^.]{0,30}\b(guidance|outlook|forecast)\b|earnings (beat|surprise)/i],
  ['acquisition or buyout', /\bto be acquired\b|\bto acquire\b|\bacquisition of\b|\bbuyout\b|\btakeover (bid|offer)\b|\bmerger (agreement|with)\b|\bagrees? to (buy|be bought|merge|acquire)\b|\btender offer\b/i],
  ['drug or device approval', /\bFDA (approv\w*|clear\w*|grants?)\b|\b(receives?|wins?|gets?|secures?|granted)\b[^.]{0,30}\b(approval|clearance|breakthrough|fast track|orphan drug)\b|\b(meets?|met|achiev\w+)\b[^.]{0,30}\b(primary )?endpoints?\b|\bpositive (top-?line|phase [123i]+|pivotal)\b/i],
  ['government award', /\b(department of \w+|DoD|pentagon|army|navy|air force|space force|NASA|DARPA|government)\b[^.]{0,50}\b(contract|award|order)\b/i],
  ['major contract or order', /\b(wins?|won|awarded|secures?|secured|lands?|receives?|signs?|signed)\b[^.]{0,50}\b(contract|order|award|supply agreement|deal)\b|\$\s?\d[\d.,]*\s?(million|billion|[MB])\b[^.]{0,30}\b(contract|order|award)\b/i],
  ['strategic partnership', /\b(strategic )?(partnership|collaboration|alliance) with\b|\bpartners with\b|\bteams up with\b|\bjoint venture\b/i]];
const CHATTER = /cramer|should you (buy|sell)|stocks? to (buy|watch)|is it (a buy|time to)|\?\s*$|price target|upgrad|downgrad|analysts? (say|see|think)|why (is|are|did|shares|.{1,25} stock)|here'?s why/i;
const strongOf = (h) => { if (CHATTER.test(h)) return null; const t = STRONG.find(([, re]) => re.test(h)); return t ? t[0] : null; };
const candidates = [];
for (const t of tickers) {
  const sym = String(t.ticker || ''); if (!/^[A-Z]{1,5}$/.test(sym)) continue;
  const day = t.day || {}, prev = t.prevDay || {}, price = num(day.c) ?? num(t.lastTrade?.p), open = num(day.o), high = num(day.h), low = num(day.l), vol = num(day.v), prevClose = num(prev.c);
  if (!(price > 0 && prevClose > 0 && vol > 0)) continue;
  const change = price / prevClose - 1, dollarVol = price * vol, range = high && low ? Math.max(high - low, price * 0.005) : price * 0.01, pos = high && low ? (price - low) / Math.max(high - low, 1e-9) : 0.5;
  if (price < +(env.RADAR_MIN_PRICE || 0.50) || price > +(env.RADAR_MAX_PRICE || 250) || dollarVol < +(env.RADAR_MIN_DOLLAR_VOLUME || 1000000) || change < 0.02 || change > 0.35 || pos < 0.5) continue;      // must be holding the upper half of today's range
  const extended = change > 0.15;      // already up this much today: late, not early
  const score = Math.round(Math.min(100, 35 + Math.min(change * 100, 20) + Math.min(Math.log10(Math.max(dollarVol, 1)) - 6, 4) * 8 + pos * 20 - (extended ? 25 : 0)));
  candidates.push({ sym, price, open, high, low, volume: vol, dollarVolume: Math.round(dollarVol), change, range, rangePosition: pos, score, extended });
}
candidates.sort((a, b) => b.score - a.score);
const shortlist = candidates.slice(0, 30);
const verified = [];
for (const c of shortlist) {
  let catalyst = { status: 'NOT_CHECKED', headline: null, hardBlock: false };
  if (env.FINNHUB_KEY) {
    const from = new Date(now - 48 * 3600000).toISOString().slice(0, 10), to = n.d;
    const r = await get(`${FH}/company-news?symbol=${c.sym}&from=${from}&to=${to}&token=${encodeURIComponent(env.FINNHUB_KEY)}`);
    const hs = Array.isArray(r.json) ? r.json.map(x => String(x.headline || '')).filter(Boolean) : [];
    const hit = hs.find(h => hard.test(h));
    const strong = hit ? null : hs.map(h => [h, strongOf(h)]).find(x => x[1]);
    catalyst = { status: hit ? 'BLOCKED' : strong ? 'FOUND' : hs.length ? 'WEAK' : 'UNEXPLAINED', kind: strong ? strong[1] : null, headline: (hit || (strong && strong[0]) || hs[0] || null)?.slice(0, 180) || null, hardBlock: Boolean(hit) };
    await sleep(800);
  }
  const blocked = catalyst.hardBlock;
  const verdict = blocked ? 'BLOCKED' : c.extended ? 'EXTENDED_DO_NOT_CHASE' : catalyst.status === 'FOUND' ? 'EARLY_WAVE_REVIEW' : 'EARLY_WAVE_UNVERIFIED';
  const risk = +(c.range * 1.2).toFixed(2), entryLo = +(c.price - 0.25 * c.range).toFixed(2), entryHi = +(c.price + 0.10 * c.range).toFixed(2), stop = +(c.price - risk).toFixed(2), target1 = +(c.price + 1.5 * risk).toFixed(2), target2 = +(c.price + 2.5 * risk).toFixed(2);
  verified.push({ ...c, verdict, catalyst, entry: verdict.includes('EARLY_WAVE') ? { lo: Math.max(0.01, entryLo), hi: entryHi } : null, stop: verdict.includes('EARLY_WAVE') ? Math.max(0.01, stop) : null, targets: verdict.includes('EARLY_WAVE') ? [target1, target2] : [], generatedAt: new Date(now).toISOString() });
}
const prior = read('data/intraday-radar.json', {}), priorSyms = new Set((prior.candidates || []).map(x => x.sym));
const told = new Set(prior.session === n.d ? (prior.alerted || []) : []);      // one alert per stock per day
const fresh = verified.filter(x => !told.has(x.sym) && x.verdict === 'EARLY_WAVE_REVIEW');
for (const x of fresh) told.add(x.sym);
const missed = verified.filter(x => x.change >= 0.10 && !priorSyms.has(x.sym) && !told.has(x.sym)).map(x => ({ sym: x.sym, price: x.price, change: x.change, seenAt: new Date(now).toISOString(), reason: 'first seen after a large move' }));
for (const x of missed) fs.appendFileSync('data/intraday-missed.jsonl', JSON.stringify(x) + '\n');
// ---- Paper record: every alert is followed to its result, so the radar's worth is measured, not assumed.
// In at the alert price. Out at the stop, at the first marker, or after five sessions. If stop and marker fall in one day, the stop counts.
const PAPER = read('data/radar-paper.json', { open: [], done: [] }), COST = 0.004, qmap = new Map(tickers.map(t => [t.ticker, t]));
if (marketOpen) {
  for (const p of PAPER.open) {
    let t = qmap.get(p.sym);
    if (!t) { const r = await get(`${FH}/quote?symbol=${p.sym}&token=${encodeURIComponent(env.FINNHUB_KEY)}`), q = r.json || {}; if (num(q.c) > 0) t = { day: { c: num(q.c), o: num(q.o), h: num(q.h), l: num(q.l) } }; await sleep(env.FAST ? 0 : 1050); }
    if (!t) continue;
    const { c, o, h, l } = t.day, same = p.d === n.d, lo = same ? c : Math.min(l ?? c, c), hi = same ? c : Math.max(h ?? c, c);
    if (p.lastD !== n.d) { p.lastD = n.d; p.days = (p.days || 0) + 1; }
    let exit = null, why = '';
    if (lo <= p.stop) { exit = !same && o > 0 && o < p.stop ? o : p.stop; why = 'stop'; }
    else if (hi >= p.t1) { exit = !same && o > p.t1 ? o : p.t1; why = 'marker 1'; }
    else if (p.days > 5) { exit = c; why = 'five sessions'; }
    if (exit) { p.exit = +exit.toFixed(4); p.why = why; p.out = n.d; p.pct = +(exit / p.entry - 1 - COST).toFixed(5); }
  }
  PAPER.done.push(...PAPER.open.filter(p => p.exit)); PAPER.done = PAPER.done.slice(-400); PAPER.open = PAPER.open.filter(p => !p.exit);
  for (const x of fresh) if (!PAPER.open.some(p => p.sym === x.sym)) PAPER.open.push({ sym: x.sym, d: n.d, lastD: n.d, days: 1, entry: x.price, stop: x.stop, t1: x.targets[0], kind: x.catalyst.kind });
  write('data/radar-paper.json', PAPER);
}
const dn = PAPER.done, record = dn.length ? `Radar paper record: ${dn.length} finished, ${Math.round(dn.filter(p => p.pct > 0).length / dn.length * 100)}% won, average ${pct(dn.reduce((a, p) => a + p.pct, 0) / dn.length)} a trade after costs. ${PAPER.open.length} still open.` : `Radar paper record: no finished trade yet, ${PAPER.open.length} open.`;
const out = { generatedAt: new Date(now).toISOString(), session: n.d, status: 'OK', alerted: [...told], universe: tickers.length, scanned: candidates.length, candidates: verified.slice(0, 20), freshCount: fresh.length, missedCount: missed.length, note: 'Research radar only. A candidate is not a validated buy until the existing tested daily rule and manual risk checks agree.' };
write('data/intraday-radar.json', out);
const lines = fresh.slice(0, 5).map(x => `${x.sym} ${money(x.price)} (${pct(x.change)} ${marketOpen ? 'today' : 'last session'})\n  catalyst (${x.catalyst.kind}): ${x.catalyst.headline}\n  reference levels, NOT tested: range ${money(x.entry.lo)}-${money(x.entry.hi)}, stop ${money(x.stop)}, markers ${x.targets.map(money).join(' and ')}`);
if (lines.length) await telegram(`${marketOpen ? 'LIVE RADAR: strong-trend stocks moving now on real news' : 'RADAR TEST RUN, MARKET CLOSED: these are moves from the LAST SESSION, not live'}\n${lines.join('\n\n')}\n\nThese are stocks to look at, not buy signals. This rule has no past test yet; each one is followed on paper from this price. ${record}\nTonight\u2019s scan checks them with the tested rules. Not financial advice.`);
console.log(`intraday radar: ${tickers.length} universe, ${candidates.length} movers, ${fresh.length} fresh review candidates, ${missed.length} missed-mover records`);
