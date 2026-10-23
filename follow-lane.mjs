// FOLLOW LANE (owner's request, 23 Oct 2026: "go look for successful daily and mid-term traders on YouTube, X, Reddit, Discord, TikTok,
// study their trades and let the system do it too"). Research and tier-2 instructions only; no orders.
// Copying the traders you HEAR about is survivorship (you only see the winners). The honest version: find public traders whose WHOLE
// dated call history wins, judged on every call they made, and only then forward their NEW calls.
//
// SOURCES (official, no login, no scraping):
//   YouTube Data API v3 (YT_KEY): search.list discovers stock-trading channels; channels.list gives each channel's uploads playlist;
//     playlistItems.list (1 unit per 50 videos) gives up to 2 years of video titles, descriptions and publish times. A video that names a
//     stock (in its title or description) without bearish framing is a dated buy call made at its publish time.
//   StockTwits public API (no key): a user's messages that carry a $TICKER and the Bullish sentiment tag are dated buy calls.
//   Reddit, X, Discord, TikTok: no free official read access for this use (see data/follow-board.json "unreached").
//
// PRE-REGISTERED 23 Oct 2026, before any trader's number was seen. The rule is fixed; only the data grows.
//   ENTRY: the first regular-session OPEN after the call was public (New York time): before 9:30 on a session day -> that day's open;
//     during the session, after 16:00, on a weekend or holiday -> the next session's open.
//   HELD 1, 5, 20 and 60 sessions (sold at the close of the last one); net = gross - 0.8% round-trip cost (stress 1.2%). A stock that stops
//     trading is valued at its last trade. Yardsticks over the SAME sessions: SPY, and the average tradable stock (close 3 USD+, 1M USD+
//     traded a day over the 20 sessions before entry). With the trader's own stated stop / target (only when the call names one stock)
//     the call is also scored with those exits (stop checked before target inside a day).
//   One call per (trader, stock) per 5 calendar days: repeating a stock in the next videos is not a new call.
//   ONE HYPOTHESIS PER TRADER, at ONE horizon H fixed in advance from the trader's own words (channel name and description, frozen the
//     first time the channel is seen): day trading / intraday / scalping -> 1 session; long-term / investing / dividends -> 60; else 20.
//     "Following this trader's buy calls beats the average stock at H sessions."
//   LEVELS at H (tier 2, the owner's 22 Oct bar):
//     FOLLOW: 30+ finished calls on 10+ distinct days; in BOTH halves of his call days (older / newer): average net after 0.8% > 0,
//       after 1.2% > 0, and beats the average stock (date-clustered, after 0.8%); over all calls still positive (after 0.8%) without his
//       2 best calls; date-clustered t vs the average stock >= 2.5.
//     FADE: the same counts; worse than the average stock in both halves (gross, costs cancel), t <= -2.5, still worse without his 2 worst.
//     NO EDGE: judged, neither.   WATCH: too few calls or days yet.
//   LUCK BAR: with N traders judged, about N x P(t >= 2.5) = N x 0.62% pass FOLLOW by luck alone; reported next to the count.
// LIVE: FOLLOW traders' NEW buy calls (entry session not yet in the data) go to data/follow-today.json; scan.mjs shows them in ACTIONS as
//   FOLLOWING (tier 2, 1,000 USD, stop 15% unless the trader gave one), after its own halal / lottery / filing gates, and logs each to
//   data/tier2-ledger.jsonl as 'follow:<trader>' so the tier-2 auto-off applies.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

export const COST = 0.008, STRESS = 0.012, HOLDS = [1, 5, 20, 60], MIN_CALLS = 30, MIN_DAYS = 10, T_BAR = 2.5, REPEAT_DAYS = 5;

// ---------- 1. tickers in a video ----------
// words that are tickers on some exchange but are almost always plain English (or finance words) in a title
export const NOT_BARE = new Set(('A I AN AS AT BE BY DO GO IF IN IS IT ME MY NO OF ON OR SO TO UP US WE ' +
  'THE AND FOR NOW NEW BIG TOP ALL ARE YOU ANY CAN HAS OUT ONE TWO WHY HOW WHO GET GOT SEE BUY PUT RUN WIN WOW OMG LOL IMO EOD ATH ' +
  'THIS HUGE BEST WILL NEXT SELL HOLD CALL REAL LIVE FAST EVER LOW HIGH KEY OPEN PLAY MOVE WHAT WHEN HERE JUST MUST DONT CANT WONT BEAT ' +
  'MISS RISK SAFE DEAL NEWS INFO DATA CASH GAIN LOSS PLAN RICH FREE LINK LIST PICK DAY WEEK YEAR SOON LATE GREEN RED BULL BEAR LONG ' +
  'SHORT PUMP DUMP DIP RIP BOOM BANG WINS LOSE LAST MORE LESS MOST VERY GOOD BAD CHEAP CAP MEGA MAX MIN PRO PLUS ONLY ALSO THAN THEN ' +
  'THEY THEM YOUR OUR HIS HER WAS HAD NOT BUT WITH FROM INTO OVER EARN STOCK WATCH VIDEO TRADE SWING RALLY CRASH ALERT FINAL FIRST ' +
  'PENNY SMALL TODAY MONTH EARLY PICKS MOON YOLO FOMO FUD HODL WSB DD TV UK EU CA NY USD USA ETF FDA CEO CFO CTO IPO SEC FED CPI GDP ' +
  'EPS OTC DOW SP NFT BTC ETH NYSE AMEX LLC INC CORP LTD PM AM EST ET PT TP SL GPU CPU API APP PC VS AI EV EVS KWD KD GTC PE TIP TIPS ' +
  'LOG SPAC CHAT GPT OK ZERO HALF SAVE HOT COOL FUN LOVE LIFE TECH CEOS MAKE EASY HARD RUNS CARE NICE FIVE TEN WOLF GOLD CORE TRUE ' +
  'SURE FUND MEME').split(/\s+/).filter(Boolean));
// index and sector funds are market talk, not a stock call (same list as scan.mjs FUNDS)
export const FUND_SYMS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'VXX', 'VIX', 'SPX', 'NDX', 'DJI', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'USO', 'TLT', 'IBIT', 'SMH', 'ARKK']);
const BEAR = /\b(sell(ing)?|sold|short(ing|ed)?|puts?|crash(ing|ed)?|bearish|avoid|overvalued|dump(ing)?|collaps\w*|bubble|bankrupt\w*|going to zero|stay away|red flag|downgrade\w*|plunge\w*|tank(ing|ed)?|scam)\b/gi;
const BULL = /\b(buy(ing)?|bought|bullish|calls?|long|moon\w*|explod\w*|soar\w*|rocket\w*|breakout|break ?out|squeeze|undervalued|upside|rall(y|ies|ying)|runners?|picks?|watch ?list|price target|accumulat\w*|load(ing)? up|to buy|next \d+x|\d+x|skyrocket\w*|surg\w*|rip(ping)?|gap(ping)? up)\b/gi;
const num = (re, s) => { const m = s.match(re); return m ? +m[1] : null; };
export function parseVideo(v, universe) {
  const title = String((v && v.title) || ''), desc = String((v && v.desc) || '').slice(0, 1500), text = title + '\n' + desc;
  const nb = (text.match(BEAR) || []).length, nu = (text.match(BULL) || []).length, bearish = nb > nu;
  const ok = (s) => s && s.length >= 1 && (!universe || universe.has(s)) && !FUND_SYMS.has(s);
  const found = [];   // [index, sym]; title first (index), then description (offset)
  const scan = (s, off) => {
    for (const m of s.matchAll(/\$([A-Z]{1,5})\b/g)) if (ok(m[1])) found.push([off + m.index, m[1]]);
    for (const m of s.matchAll(/\b(?:NASDAQ|NYSE|AMEX)\s*:\s*([A-Z]{1,5})\b/g)) if (ok(m[1])) found.push([off + m.index, m[1]]);
    for (const m of s.matchAll(/\(([A-Z]{2,5})\)/g)) if (ok(m[1]) && !NOT_BARE.has(m[1])) found.push([off + m.index, m[1]]);
    // bare tickers: only a listed symbol that is not a plain word, and only on a line that is not shouting (under half its words in capitals)
    for (const line of s.split('\n')) { const words = line.match(/\b[A-Za-z]{3,}\b/g) || [], caps = words.filter(w => w === w.toUpperCase()).length;
      if (!words.length || caps / words.length >= 0.5) continue; const lo = s.indexOf(line);
      for (const m of line.matchAll(/(?<![$\w])([A-Z]{2,5})(?![\w])/g)) if (ok(m[1]) && !NOT_BARE.has(m[1])) found.push([off + lo + m.index, m[1]]); } };
  scan(title, 0); scan(desc, 100000);
  const syms = []; for (const [, s] of found.sort((a, b) => a[0] - b[0])) if (!syms.includes(s)) syms.push(s);
  if (bearish) return { bearish: true, calls: [] };
  const top = syms.slice(0, 5), one = top.length === 1, money = '\\$?\\s?(\\d+(?:\\.\\d+)?)';
  const lv = one ? { en: num(new RegExp('(?:entry|buy (?:under|below|at|around)|buy zone|entry zone)\\s*(?:at|:|of|is)?\\s*' + money, 'i'), text),
    tg: num(new RegExp('(?:price target|target|\\bPT\\b)\\s*(?:at|:|of|is)?\\s*' + money, 'i'), text), st: num(new RegExp('(?:stop[ -]?loss|\\bstop\\b|\\bSL\\b)\\s*(?:at|:|of|is)?\\s*' + money, 'i'), text) } : { en: null, tg: null, st: null };
  return { bearish: false, calls: top.map(sym => ({ sym, bull: nu > 0, ...lv })) };
}

// ---------- 2. the entry session ----------
export function nyParts(ms) { const o = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).forEach(p => o[p.type] = p.value);
  return { d: o.year + '-' + o.month + '-' + o.day, mins: +o.hour * 60 + +o.minute }; }
// index into the sorted session dates of the session whose OPEN is the first after publishMs; -1 if that session is not in the data yet
export function entrySession(publishMs, sessions) { const n = nyParts(publishMs);
  let lo = 0, hi = sessions.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sessions[m] < n.d) lo = m + 1; else hi = m; }
  if (lo < sessions.length && sessions[lo] === n.d && n.mins >= 570) lo++;   // 9:30 New York or later on a session day: that open has passed
  return lo < sessions.length ? lo : -1; }

// ---------- 3. one call's return ----------
// bars = { o, h, l, c } indexed by session (NaN where the stock did not trade); bought at o[e], held h sessions (sold at the close of e+h-1)
export function callReturn(bars, e, h, lv) { const T = bars.c.length, x = e + h - 1, en = bars.o[e]; if (!(en > 0) || x >= T) return null;
  const st = lv && lv.st >= en * 0.5 && lv.st < en ? lv.st : null, tg = lv && lv.tg > en && lv.tg <= en * 4 ? lv.tg : null;   // a level far from the entry price is a misread, not a plan
  if (st || tg) for (let k = e; k <= x; k++) { const o = bars.o[k], hi = bars.h[k], lo = bars.l[k]; if (!isFinite(lo) || !isFinite(hi)) continue;
    if (st && lo <= st) return (k > e && isFinite(o) && o < st ? o : st) / en - 1;
    if (tg && hi >= tg) return (k > e && isFinite(o) && o > tg ? o : tg) / en - 1; }
  for (let k = x; k >= e; k--) if (isFinite(bars.c[k]) && bars.c[k] > 0) return bars.c[k] / en - 1;
  return null; }

// ---------- 4. a trader's record ----------
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const tStat = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = new Map(); for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; if (!o.has(z.e)) o.set(z.e, []); o.get(z.e).push(x); } return [...o.values()].map(mean); };
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
// rows: { e, sym, r<H>, c<H>, s<H> } (gross return, average stock, SPY); returns the record at horizon H and the level
export function horizonStats(rows, H) { const f = rows.filter(z => typeof z['r' + H] === 'number' && typeof z['c' + H] === 'number'); if (!f.length) return { n: 0, days: 0 };
  const net = f.map(z => z['r' + H] - COST), srt = [...net].sort((a, b) => b - a), sp = f.filter(z => typeof z['s' + H] === 'number');
  return { n: f.length, days: new Set(f.map(z => z.e)).size, stocks: new Set(f.map(z => z.sym)).size, win: r4(net.filter(x => x > 0).length / net.length), avg: r4(mean(net)), median: r4(median(net)),
    avgStock: r4(mean(f.map(z => z['c' + H]))), vsAvgStock: r4(mean(byDay(f, z => z['r' + H] - COST - z['c' + H]))), spy: sp.length ? r4(mean(sp.map(z => z['s' + H]))) : null,
    vsSpy: sp.length ? r4(mean(byDay(sp, z => z['r' + H] - COST - z['s' + H]))) : null, noBest2: r4(srt.length > 2 ? mean(srt.slice(2)) : null), worst: r4(srt[srt.length - 1]), best: r4(srt[0]),
    t: tStat(byDay(f, z => z['r' + H] - COST - z['c' + H])) }; }
export function judge(rows, H) { const f = rows.filter(z => typeof z['r' + H] === 'number' && typeof z['c' + H] === 'number'), s = horizonStats(f, H);
  if (s.n < MIN_CALLS || s.days < MIN_DAYS) return { ...s, H, level: 'WATCH', why: s.n + ' finished calls on ' + s.days + ' days (needs ' + MIN_CALLS + ' on ' + MIN_DAYS + ')' };
  const days = [...new Set(f.map(z => z.e))].sort((a, b) => a - b), cut = days[Math.floor(days.length / 2)], half = {};
  for (const [k, g] of [['older', f.filter(z => z.e < cut)], ['newer', f.filter(z => z.e >= cut)]]) half[k] = { n: g.length, days: new Set(g.map(z => z.e)).size,
    net: r4(mean(g.map(z => z['r' + H] - COST))), netStress: r4(mean(g.map(z => z['r' + H] - STRESS))), edge: r4(mean(byDay(g, z => z['r' + H] - COST - z['c' + H]))), gross: r4(mean(byDay(g, z => z['r' + H] - z['c' + H]))), t: tStat(byDay(g, z => z['r' + H] - COST - z['c' + H])) };
  const both = (fn) => fn(half.older) && fn(half.newer), ex = f.map(z => z['r' + H] - z['c' + H]).sort((a, b) => a - b), noWorst2 = ex.length > 2 ? mean(ex.slice(2)) : null, tGross = tStat(byDay(f, z => z['r' + H] - z['c' + H]));
  const follow = both(h => h.net > 0 && h.netStress > 0 && h.edge > 0) && s.noBest2 > 0 && s.t >= T_BAR, fade = both(h => h.gross < 0) && tGross <= -T_BAR && noWorst2 < 0;
  const why = follow ? 'passed every check' : fade ? 'worse than the average stock in both halves, t ' + tGross : [!both(h => h.net > 0) ? 'loses money after 0.8% in a half' : !both(h => h.netStress > 0) ? 'loses money after the 1.2% stress cost in a half' : null, !both(h => h.edge > 0) ? 'does not beat the average stock in both halves' : null, !(s.noBest2 > 0) ? 'negative without its 2 best calls' : null, !(s.t >= T_BAR) ? 't ' + s.t + ' under ' + T_BAR : null].filter(Boolean).join('; ');
  return { ...s, H, half, tGross, noWorst2: r4(noWorst2), level: follow ? 'FOLLOW' : fade ? 'FADE' : 'NO EDGE', why }; }
// upper tail of the normal: how many of n judged traders reach t by luck alone (the other checks make it fewer; this is the ceiling)
export function luckExpected(n, t) { const z = Math.abs(t), k = 1 / (1 + 0.2316419 * z), d = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const p = d * k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429)))); return n * p; }
export function horizonFor(text) { const s = String(text || '');
  if (/\bday[- ]?trad\w*|\bintraday\b|\bscalp\w*/i.test(s) && !/\bswing\b|\blong[- ]term\b/i.test(s)) return 1;
  if (/\blong[- ]term\b|\binvest(ing|or|ors|ment)?\b|\bdividends?\b|buy and hold|retire\w*/i.test(s) && !/\bswing\b|\bday[- ]?trad/i.test(s)) return 60;
  return 20; }
// one call per (trader, stock) per REPEAT_DAYS calendar days, earliest kept
export function dedupeCalls(calls) { const last = new Map(), out = [];
  for (const c of [...calls].sort((a, b) => Date.parse(a.pub) - Date.parse(b.pub))) { const k = c.tr + '|' + c.sym, p = Date.parse(c.pub), was = last.get(k);
    if (was !== undefined && p - was < REPEAT_DAYS * 864e5) continue; last.set(k, p); out.push(c); }
  return out; }

// ---------- 5. the run (only when executed directly) ----------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();

async function main() {
  const env = process.env, MODE = env.MODE || (new Date().getUTCDay() === 0 ? 'full' : 'daily'), now = Date.now(), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms)), J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
  const gz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
  const CALLS = 'data/follow-calls.jsonl', CH = 'data/follow-channels.json', BOARD = 'data/follow-board.json', TODAY = 'data/follow-today.json', FC = env.FOLLOW_CACHE || 'follow-cache';
  fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(FC, { recursive: true });
  const log = (...a) => console.log('follow-lane:', ...a);
  const state = J(CH, {}) || {}; state.channels = state.channels || {}; state.st = state.st || { users: {} }; state.sources = state.sources || {};
  // ---- prices: the study cache (2 years, whole market, dead stocks in x rows, splits repaired) + recent days from Massive ----
  const PX = (env.MASSIVE_BASE || 'https://api.massive.com').replace(/\/$/, ''); let mvCalls = 0;
  async function mv(path) { if (!env.MASSIVE_KEY) return null; for (let a = 0; a < 4; a++) { if (mvCalls++) await sleep(150);
    let r; try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY)); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(30000); continue; } if (r.status === 401 || r.status === 403) return { refused: true }; if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
  let store = gz(env.CACHE || 'study-cache/grouped.json.gz'); const fromStudy = !!(store && store.days && Object.keys(store.days).length >= 250);
  const own = gz(FC + '/days.json.gz') || { days: {}, gone: [] }; own.days = own.days || {}; own.gone = own.gone || [];
  if (!fromStudy) { log('no study cache: building its own 2-year price cache from Massive'); store = { days: {}, ref: own.ref || null }; }
  const CS = new Set((store.ref && store.ref.syms) || own.ref || []); if (!own.ref && CS.size) own.ref = [...CS];
  const qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6, pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => +x.o.toFixed(4)), h: rows.map(x => +x.h.toFixed(4)), l: rows.map(x => +x.l.toFixed(4)), c: rows.map(x => +x.c.toFixed(4)), v: rows.map(x => Math.round(x.v)) });
  { const want = fromStudy ? 15 : 540, have = new Set([...Object.keys(store.days), ...Object.keys(own.days)]); let added = 0, refused = false;
    for (let k = 0; k < want * 1.6 && !refused; k++) { const ms = now - k * 864e5, d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6 || have.has(d) || own.gone.includes(d)) continue;
      if (k === 0 && (nyParts(now).d !== d || nyParts(now).mins < 16 * 60 + 30)) continue;   // today only once its day is complete (no partial day)
      if (fromStudy && d < Object.keys(store.days).sort().slice(-1)[0]) break;
      const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (j && j.refused) { refused = true; break; } if (!j || !Array.isArray(j.results)) continue;
      const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && x.c > 0 && x.o > 0 && (!CS.size || CS.has(x.T) || x.T === 'SPY'));
      if (all.length < 500) { if (k > 1 && !all.length) own.gone.push(d); continue; }
      own.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; added++; }
    const keep = Object.keys(own.days).sort(), lim = fromStudy ? 30 : 560; for (const d of keep.slice(0, Math.max(0, keep.length - lim))) delete own.days[d];
    if (added) { fs.writeFileSync(FC + '/days.json.gz', zlib.gzipSync(JSON.stringify(own))); log('price days added from Massive:', added); } }
  for (const [d, x] of Object.entries(own.days)) if (!store.days[d]) store.days[d] = x;
  const D = Object.keys(store.days).sort(), T = D.length; if (T < 60) { log('too few sessions of prices (' + T + '); nothing scored'); }
  const SY = new Map(); for (const d of D) { const x = store.days[d]; for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); if (x.x) for (const s of x.x.T) if (!SY.has(s)) SY.set(s, SY.size); }
  const NS = SY.size, O = new Float32Array(NS * T).fill(NaN), Hh = new Float32Array(NS * T).fill(NaN), Ll = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN), M = new Uint8Array(NS * T);
  D.forEach((d, t) => { const x = store.days[d]; for (const [rows, main] of [[x, 1], [x.x, 0]]) { if (!rows || !rows.T) continue; for (let j = 0; j < rows.T.length; j++) { const k = SY.get(rows.T[j]) * T + t; if (!main && M[k]) continue;
    O[k] = rows.o[j]; Hh[k] = rows.h ? rows.h[j] : NaN; Ll[k] = rows.l ? rows.l[j] : NaN; C[k] = rows.c[j]; V[k] = rows.v ? rows.v[j] : NaN; M[k] = main; } } });
  const refSyms = store.ref && store.ref.syms; store = null;
  const UNI = new Set([...SY.keys(), ...(refSyms || []), ...Object.keys(J('data/sec-ciks.json', {}) || {})]);
  // splits in the days added after the study cache's last repair (same jump test as leaders-study.mjs, per needed symbol)
  const SPL = ((J('data/splits.json', {}) || {}).splits || []).filter(s => s.d > D[0] && s.d <= D[T - 1]);
  const repaired = new Set(); function barsOf(sym) { const i = SY.get(sym); if (i === undefined) return null; const b = i * T, sl = (A) => Array.from(A.subarray(b, b + T));
    const bars = { o: sl(O), h: sl(Hh), l: sl(Ll), c: sl(C) };
    if (!repaired.has(sym)) { repaired.add(sym); for (const sp of SPL.filter(s => s.s === sym)) { const iA = D.findIndex(d => d >= sp.d); if (iA <= 0) continue; let pre = null, post = null;
      for (let k = iA - 1; k >= Math.max(0, iA - 10) && pre === null; k--) if (bars.c[k] > 0) pre = bars.c[k]; for (let k = iA; k < Math.min(T, iA + 10) && post === null; k++) if (bars.c[k] > 0) post = bars.c[k];
      if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post), w = Math.log(sp.r); if (!(Math.abs(jump - w) < Math.abs(jump))) continue;
      for (let k = 0; k < iA; k++) for (const f of ['o', 'h', 'l', 'c']) { bars[f][k] /= sp.r; const A = { o: O, h: Hh, l: Ll, c: C }[f]; A[b + k] = bars[f][k]; } } }
    return bars; }
  // the average tradable stock bought at the open of session e and held h sessions (main rows: 3 USD+, 1M USD+ a day over the 20 sessions before e)
  const dvOK = new Uint8Array(NS * T); for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0; for (let t = 0; t < T; t++) { const z = M[b + t] && isFinite(C[b + t]) && isFinite(V[b + t]) ? C[b + t] * V[b + t] : null; if (z !== null) { s += z; n++; }
    if (t >= 20) { const k = b + t - 20, z0 = M[k] && isFinite(C[k]) && isFinite(V[k]) ? C[k] * V[k] : null; if (z0 !== null) { s -= z0; n--; } } dvOK[b + t] = n >= 15 && s / n >= 1e6 && C[b + t] >= 3 ? 1 : 0; } }
  const spyBars = barsOf('SPY'), ctrlM = new Map();
  const ctrl = (e, h) => { const key = e * 100 + h; if (ctrlM.has(key)) return ctrlM.get(key); let s = 0, n = 0; if (e >= 1 && e + h - 1 < T) for (let i = 0; i < NS; i++) { const b = i * T; if (!dvOK[b + e - 1]) continue; const en = O[b + e]; if (!(en > 0)) continue;
      let last = null; for (let k = e + h - 1; k >= e; k--) if (C[b + k] > 0) { last = C[b + k]; break; } if (last === null) continue; const g = last / en - 1; if (Math.abs(g) < 3) { s += g; n++; } }
    const v = n >= 30 ? s / n : null; ctrlM.set(key, v); return v; };

  // ---- YouTube ----
  const YTAPI = (env.YTAPI_BASE || 'https://www.googleapis.com').replace(/\/$/, ''), BUDGET = +(env.YT_BUDGET || 8000); let units = 0; const yt = { status: env.YT_KEY ? 'not called' : 'needs data: no YT_KEY secret', errors: {} };
  async function ytGet(path, cost) { if (!env.YT_KEY || units + cost > BUDGET) return null; units += cost;
    try { const r = await fetch(YTAPI + '/youtube/v3/' + path + '&key=' + encodeURIComponent(env.YT_KEY)); yt.status = 'HTTP ' + r.status; if (!r.ok) { yt.errors[r.status] = (yt.errors[r.status] || 0) + 1; if (r.status === 403) { const b = await r.text().catch(() => ''); if (/quota/i.test(b)) { units = BUDGET; yt.status = 'quota used up'; } } return null; } return await r.json(); } catch (e) { yt.status = 'error ' + (e.message || e); return null; } }
  const old = fs.existsSync(CALLS) ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
  const have = new Set(old.map(c => c.tr + '|' + c.sym + '|' + c.vid)), add = [];
  const addVideo = (tr, name, it) => { const sn = it.snippet || {}, cd = it.contentDetails || {}, vid = cd.videoId || (sn.resourceId && sn.resourceId.videoId) || ''; const pub = cd.videoPublishedAt || sn.publishedAt; if (!pub || /^(Private|Deleted) video$/.test(sn.title || '')) return;
    const p = parseVideo({ title: sn.title, desc: sn.description }, UNI); for (const c of p.calls) { const k = tr + '|' + c.sym + '|' + vid; if (have.has(k)) continue; have.add(k);
      add.push({ tr, n: name, src: 'yt', sym: c.sym, pub, vid, bull: c.bull ? 1 : 0, ...(c.en ? { en: c.en } : {}), ...(c.tg ? { tg: c.tg } : {}), ...(c.st ? { st: c.st } : {}), tt: String(sn.title || '').slice(0, 90) }); } };
  const QUERIES = ['stock to buy now', 'penny stock', 'small cap runner', 'swing trade', 'day trading watchlist', 'biotech catalyst', 'stock picks this week', 'stocks to watch tomorrow', 'top stocks to buy', 'momentum stocks', 'growth stock to buy', 'premarket movers'];
  const since2y = now - 730 * 864e5;
  if (env.YT_KEY) {
    if (MODE === 'full') {   // discovery: video search (100 units a page), channels that post stock calls
      const hits = {}, after = new Date(now - 365 * 864e5).toISOString(), pages = +(env.YT_PAGES || 2);
      for (const q of QUERIES) { let tok = ''; for (let p = 0; p < pages; p++) { const j = await ytGet('search?part=snippet&type=video&maxResults=50&relevanceLanguage=en&regionCode=US&order=relevance&publishedAfter=' + after + '&q=' + encodeURIComponent(q) + (tok ? '&pageToken=' + tok : ''), 100); if (!j) break;
        for (const it of j.items || []) { const id = it.snippet && it.snippet.channelId; if (id) hits[id] = (hits[id] || 0) + 1; } tok = j.nextPageToken; if (!tok) break; } }
      for (const c of [...((J('data/channels.json', []) || []))]) if (c && /^UC/.test(c.id || '')) hits[c.id] = (hits[c.id] || 0) + 100;   // the owner's followed channels always
      const fresh = Object.keys(hits).filter(id => !state.channels[id]);
      for (let k = 0; k < fresh.length; k += 50) { const j = await ytGet('channels?part=snippet,statistics,contentDetails&maxResults=50&id=' + fresh.slice(k, k + 50).join(','), 1); for (const it of (j && j.items) || []) { const sn = it.snippet || {}, txt = (sn.title || '') + ' ' + (sn.description || '');
        state.channels[it.id] = { name: String(sn.title || it.id).slice(0, 60), H: horizonFor(txt), hFrom: 'channel name and description, frozen ' + iso(now), subs: +((it.statistics || {}).subscriberCount || 0), videos: +((it.statistics || {}).videoCount || 0), uploads: (it.contentDetails && it.contentDetails.relatedPlaylists && it.contentDetails.relatedPlaylists.uploads) || 'UU' + it.id.slice(2), found: iso(now), hits: hits[it.id] }; } }
      for (const [id, c] of Object.entries(state.channels)) if (hits[id]) c.hits = Math.max(c.hits || 0, hits[id]);
      log('YouTube discovery: ' + Object.keys(hits).length + ' channels in search results, ' + fresh.length + ' new; units used ' + units);
    }
    {
      // backfill: up to 2 years of uploads, channels with the most search hits first, until the budget is used (the rest next Sunday)
      const todo = Object.entries(state.channels).filter(([, c]) => !c.backfilled).sort((a, b) => (b[1].hits || 0) - (a[1].hits || 0));
      const reserve = Object.values(state.channels).filter(c => c.backfilled && !c.gone).length + 20;   // keep units for the new-upload check below
      for (const [id, c] of todo) { if (units + 2 > BUDGET - reserve) break; let tok = '', pages = 0, failed = false;
        while (pages < 40) { const j = await ytGet('playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=' + c.uploads + (tok ? '&pageToken=' + tok : ''), 1); pages++;
          if (!j) { if (yt.status === 'HTTP 404') c.gone = true; else failed = true; break; }
          let older = false; for (const it of j.items || []) { const pub = Date.parse((it.contentDetails || {}).videoPublishedAt || (it.snippet || {}).publishedAt || ''); if (pub < since2y) { older = true; continue; } addVideo('yt:' + id, c.name, it); }
          tok = j.nextPageToken; if (!tok || older) break; }
        if (!failed) c.backfilled = iso(now); c.lastFetch = iso(now); }
    }
    // new uploads: every channel on Sunday, the FOLLOW / WATCH ones on other days (1 unit each)
    const prevBoard = J(BOARD, {}) || {}, lvl = Object.fromEntries(((prevBoard.traders) || []).map(t => [t.tr, t.level]));
    for (const [id, c] of Object.entries(state.channels)) { if (c.gone || !c.backfilled || c.lastFetch === iso(now) && MODE === 'full') continue; if (MODE !== 'full' && !['FOLLOW', 'WATCH'].includes(lvl['yt:' + id] || 'WATCH')) continue;
      const j = await ytGet('playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=' + c.uploads, 1); if (!j) { if (units >= BUDGET) break; continue; } for (const it of j.items || []) addVideo('yt:' + id, c.name, it); c.lastFetch = iso(now); }
    log('YouTube: ' + Object.keys(state.channels).length + ' channels known, ' + Object.values(state.channels).filter(c => c.backfilled).length + ' backfilled; ' + units + ' of ' + BUDGET + ' units used; last answer ' + yt.status);
  }
  yt.units = units;
  // ---- StockTwits (public API, no key; about 200 calls an hour) ----
  const STB = (env.ST_BASE || 'https://api.stocktwits.com/api/2').replace(/\/$/, ''), ST_MAX = +(env.ST_CALLS || 150); let stCalls = 0; const st = { status: 'not called' };
  async function stGet(path) { if (stCalls >= ST_MAX) return null; stCalls++; await sleep(1200);
    try { const r = await fetch(STB + path, { headers: { 'Accept': 'application/json', 'User-Agent': 'Stock-2 personal research (follow lane)' } }); st.status = 'HTTP ' + r.status; if (!r.ok) return null; return await r.json(); } catch (e) { st.status = 'error ' + (e.message || e); return null; } }
  const addSt = (m) => { const u = m.user || {}, name = u.username; if (!name || !(m.entities && m.entities.sentiment && m.entities.sentiment.basic === 'Bullish')) return;
    for (const s of (m.symbols || []).slice(0, 3)) { const sym = String(s.symbol || '').toUpperCase(); if (!/^[A-Z]{1,5}$/.test(sym) || !UNI.has(sym) || FUND_SYMS.has(sym)) continue; const k = 'st:' + name + '|' + sym + '|' + m.id; if (have.has(k)) continue; have.add(k);
      add.push({ tr: 'st:' + name, n: 'StockTwits ' + name, src: 'st', sym, pub: new Date(Date.parse(m.created_at)).toISOString(), vid: String(m.id), bull: 1, tt: String(m.body || '').slice(0, 90) }); } };
  if (MODE === 'full') { const cand = {}; const tr = await stGet('/trending/symbols.json'); const seeds = [...new Set([...(((tr && tr.symbols) || []).map(s => s.symbol)), 'NVDA', 'TSLA', 'PLTR', 'SOFI', 'AMD', 'HOOD', 'IONQ', 'RKLB', 'MARA', 'SMCI'])].slice(0, 20);
    for (const s of seeds) { const j = await stGet('/streams/symbol/' + encodeURIComponent(s) + '.json'); if (!j) { if (/HTTP 4/.test(st.status) && stCalls <= 2) break; continue; }
      for (const m of j.messages || []) { addSt(m); const u = m.user || {}; if (u.username && m.entities && m.entities.sentiment && m.entities.sentiment.basic === 'Bullish') cand[u.username] = Math.max(cand[u.username] || 0, +u.followers || 0); } }
    for (const [u, f] of Object.entries(cand)) state.st.users[u] = state.st.users[u] || { followers: f, found: iso(now) }; }
  { const users = Object.entries(state.st.users).sort((a, b) => (b[1].followers || 0) - (a[1].followers || 0));
    for (const [u, info] of users) { if (stCalls >= ST_MAX) break; let max = '', pages = 0; const deep = !info.backfilled;
      while (pages < (deep ? 4 : 1)) { const j = await stGet('/streams/user/' + encodeURIComponent(u) + '.json' + (max ? '?max=' + max : '')); pages++; if (!j) break; const ms = j.messages || []; for (const m of ms) addSt(m);
        if (!ms.length || !(j.cursor && j.cursor.more)) break; max = j.cursor.max; }
      if (deep && pages >= 1) info.backfilled = iso(now); } }
  st.calls = stCalls; log('StockTwits: ' + stCalls + ' calls, ' + Object.keys(state.st.users).length + ' users known; last answer ' + st.status);
  if (add.length) fs.appendFileSync(CALLS, add.map(c => JSON.stringify(c)).join('\n') + '\n');
  log(add.length + ' new calls logged (' + (old.length + add.length) + ' in total)');
  // ---- score every call ----
  const all = dedupeCalls([...old, ...add].filter(c => c.tr && c.sym && c.pub)), meta = {};
  for (const [id, c] of Object.entries(state.channels)) meta['yt:' + id] = { name: c.name, H: c.H, hFrom: c.hFrom, src: 'YouTube', subs: c.subs, url: 'https://www.youtube.com/channel/' + id };
  for (const [u, c] of Object.entries(state.st.users)) meta['st:' + u] = { name: 'StockTwits ' + u, H: 20, hFrom: 'default (StockTwits states no hold)', src: 'StockTwits', followers: c.followers, url: 'https://stocktwits.com/' + u };
  const rowsBy = {}, pending = []; let scored = 0, noPrice = 0;
  for (const c of all) { const e = T ? entrySession(Date.parse(c.pub), D) : -1; if (e === -1) { pending.push(c); continue; } if (e < 1) { noPrice++; continue; }
    const b = barsOf(c.sym); if (!b || !(b.o[e] > 0)) { noPrice++; continue; } const H = (meta[c.tr] || {}).H || 20, row = { e, sym: c.sym, d: D[e], bull: c.bull };
    for (const h of HOLDS) { const r = callReturn(b, e, h); row['r' + h] = r === null ? null : r; row['c' + h] = r === null ? null : ctrl(e, h); row['s' + h] = r === null || !spyBars ? null : callReturn(spyBars, e, h); }
    if (c.st || c.tg) { const rx = callReturn(b, e, H, { st: c.st, tg: c.tg }); if (rx !== null) row.rx = rx; }
    (rowsBy[c.tr] = rowsBy[c.tr] || []).push(row); scored++; }
  const traders = Object.entries(rowsBy).map(([tr, rows]) => { const m = meta[tr] || { name: tr, H: 20 }, H = m.H || 20, j = judge(rows, H), hz = {};
    for (const h of HOLDS) hz['h' + h] = horizonStats(rows, h);
    const lv = rows.filter(r => typeof r.rx === 'number'), withExits = lv.length ? { n: lv.length, avg: r4(mean(lv.map(r => r.rx - COST))), sameCallsNoExits: r4(mean(lv.filter(r => typeof r['r' + H] === 'number').map(r => r['r' + H] - COST))) } : null;
    const ds = rows.map(r => r.d).sort();
    return { tr, name: m.name, src: m.src || (tr.startsWith('st:') ? 'StockTwits' : 'YouTube'), url: m.url, subs: m.subs, H, hFrom: m.hFrom, calls: rows.length, first: ds[0], last: ds[ds.length - 1], level: j.level, why: j.why, atH: j, horizons: hz, withExits }; });
  const rank = { FOLLOW: 0, FADE: 1, 'NO EDGE': 2, WATCH: 3 };
  traders.sort((a, b) => rank[a.level] - rank[b.level] || (b.atH.t ?? -99) - (a.atH.t ?? -99) || b.calls - a.calls);
  const judged = traders.filter(t => t.level !== 'WATCH').length, count = (l) => traders.filter(t => t.level === l).length;
  const pc = (x) => x === null || x === undefined ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  const recordLine = (t) => { const a = t.atH; return a.n + ' calls on ' + a.days + ' days (' + (t.first || '?') + ' to ' + (t.last || '?') + '), at ' + t.H + ' session' + (t.H > 1 ? 's' : '') + ': ' + pc(a.avg) + ' a call after costs (median ' + pc(a.median) + '), ' + Math.round((a.win || 0) * 100) + '% won, vs the average stock ' + pc(a.vsAvgStock) + ' (t ' + (a.t ?? 'n/a') + '), vs S&P ' + pc(a.vsSpy) + ', without his 2 best ' + pc(a.noBest2) + ', worst ' + pc(a.worst); };
  for (const t of traders) t.record = recordLine(t);
  // ---- new calls of FOLLOW traders (entry session not in the data yet) ----
  const follow = new Set(traders.filter(t => t.level === 'FOLLOW').map(t => t.tr)), lastClose = (sym) => { const b = barsOf(sym); if (!b) return null; for (let k = T - 1; k >= Math.max(0, T - 5); k--) if (b.c[k] > 0) return +b.c[k].toFixed(4); return null; };
  const HAL = J('data/halal.json', {}) || {}, todayCalls = pending.filter(c => follow.has(c.tr) && now - Date.parse(c.pub) < 4 * 864e5).map(c => { const t = traders.find(x => x.tr === c.tr); return { trader: t.name, tr: c.tr, sym: c.sym, pub: c.pub, title: c.tt, H: t.H, st: c.st || null, tg: c.tg || null, last: lastClose(c.sym), halal: (HAL[c.sym] && HAL[c.sym].s) || 'unknown', record: t.record }; });
  fs.writeFileSync(TODAY, JSON.stringify({ at: new Date(now).toISOString(), asOf: D[T - 1] || null, rule: 'new buy calls of FOLLOW traders (tier 2); scan.mjs gates them (halal, lottery, filings) before ACTIONS', calls: todayCalls }, null, 1));
  const ytCalls = all.filter(c => c.src === 'yt').length, stCallsN = all.filter(c => c.src === 'st').length;
  const out = { generatedAt: new Date(now).toISOString(), mode: MODE, preRegistered: '2026-10-23', asOf: D[T - 1] || null, pricesFrom: D[0] || null, priceSource: fromStudy ? 'study cache (whole market, dead stocks kept) + recent Massive days' : 'Massive grouped daily (own cache)',
    rule: 'Each trader is ONE hypothesis at ONE horizon H fixed in advance (1 day trader, 60 long-term, else 20 sessions). Entry: the first regular-session open after the call was public (New York). FOLLOW: 30+ finished calls on 10+ days; both halves positive after 0.8% and 1.2% and beating the average stock; positive without his 2 best; date-clustered t vs the average stock >= 2.5. FADE: same counts, worse in both halves, t <= -2.5, still worse without his 2 worst. WATCH: too few.',
    sources: { youtube: { ...yt, channels: Object.keys(state.channels).length, backfilled: Object.values(state.channels).filter(c => c.backfilled).length, calls: ytCalls }, stocktwits: { ...st, users: Object.keys(state.st.users).length, calls: stCallsN } },
    unreached: { X: 'needs data: X API read access is paid (Basic tier, about 200 USD a month); with a bearer token in an X_BEARER secret, the users/:id/tweets endpoint gives the same dated calls.', Reddit: 'needs data: the Reddit API needs an app the owner registers (reddit.com/prefs/apps, script type, free for personal non-commercial use); with REDDIT_ID / REDDIT_SECRET secrets, /user/<name>/submitted gives dated posts.', Discord: 'needs data: Discord has no public read API; a bot can read only servers that invite it (the owner would need admin consent in each trading server).', TikTok: 'needs data: TikTok’s Research API is for approved academic researchers only; no other official read access to videos.' },
    screened: traders.length, judged, counts: { FOLLOW: count('FOLLOW'), FADE: count('FADE'), 'NO EDGE': count('NO EDGE'), WATCH: count('WATCH') },
    luck: { judged, tBar: T_BAR, followByLuckAtMost: +luckExpected(judged, T_BAR).toFixed(2), fadeByLuckAtMost: +luckExpected(judged, T_BAR).toFixed(2), note: 'with ' + judged + ' traders judged, about ' + luckExpected(judged, T_BAR).toFixed(1) + ' would reach t 2.5 by luck alone (the half and cost checks make it fewer)' },
    calls: { total: all.length, scored, pending: pending.length, noPrice },
    traders: traders.map(t => ({ ...t, horizons: Object.fromEntries(Object.entries(t.horizons).map(([k, v]) => [k, { n: v.n, days: v.days, avg: v.avg, median: v.median, win: v.win, vsAvgStock: v.vsAvgStock, vsSpy: v.vsSpy, t: v.t }])) })) };
  fs.writeFileSync(BOARD, JSON.stringify(out));
  fs.writeFileSync(CH, JSON.stringify(state));
  const top = traders.filter(t => t.level !== 'WATCH').slice(0, 10);
  log('screened ' + traders.length + ' traders (' + judged + ' judged): FOLLOW ' + out.counts.FOLLOW + ', FADE ' + out.counts.FADE + ', NO EDGE ' + out.counts['NO EDGE'] + ', WATCH ' + out.counts.WATCH + '; ' + out.luck.note);
  for (const t of top) log(t.level + ' | ' + t.name + ' | ' + t.record);
  log('new FOLLOW calls for the next session: ' + todayCalls.length);
}
