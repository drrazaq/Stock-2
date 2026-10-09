// Movers radar for the US stock signal board. Runs on GitHub Actions each night.
// It answers, with real numbers from the last 45 sessions of the WHOLE US market, the question behind every gainers list:
// "If I buy a stock the morning after it jumps 20% or more, what usually happens?"  It also lists the day's movers with the
// news behind them, and watches small stocks whose trading volume is building before any big move.
// Everything goes to your private Telegram. It gives evidence and watchlists, never buy signals.
import fs from 'node:fs';

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
const TEST = local(env.MASSIVE_BASE), FAST = Boolean(TEST), PX = TEST ? [TEST] : ['https://api.massive.com', 'https://api.polygon.io'];
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', TG = local(env.TG_BASE) || 'https://api.telegram.org';
for (const k of ['MASSIVE_KEY', 'TG_TOKEN', 'TG_CHAT']) if (!env[k]) { console.error('Missing secret ' + k); process.exit(1); }
const SESSIONS = Math.min(60, parseInt(env.SESSIONS || '45', 10) || 45), JUMP = 0.20, MIN_DV = 2e6;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const pc = (x, d = 1) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
fs.mkdirSync('data', { recursive: true });

let host = 0, calls = 0;
async function grouped(date) {
  for (let a = 0; a < 4; a++) {
    if (calls && !FAST) await sleep(13000);          // free plan: 5 calls a minute
    calls++;
    let r; try { r = await fetch(PX[host] + '/v2/aggs/grouped/locale/us/market/stocks/' + date + '?adjusted=true&apiKey=' + encodeURIComponent(env.MASSIVE_KEY)); } catch (e) { if (host + 1 < PX.length) { host++; continue; } await sleep(FAST ? 5 : 5000); continue; }
    if (r.status === 429) { await sleep(FAST ? 5 : 61000); continue; }
    if (r.status === 401) { console.error('The MASSIVE_KEY secret was rejected.'); process.exit(1); }
    if (r.status === 403) return [];
    if (r.status === 404 && host + 1 < PX.length) { host++; continue; }
    const j = await r.json().catch(() => ({})); return j.results || [];
  }
  return [];
}
async function telegram(text) {      // long messages are split between lines, never in the middle of one
  const parts = []; let cur = '';
  for (const ln of text.split('\n')) { if ((cur + '\n' + ln).length > 3800) { parts.push(cur); cur = ln; } else cur = cur ? cur + '\n' + ln : ln; }
  if (cur) parts.push(cur);
  for (const part of parts) { const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: part, disable_web_page_preview: true }) }); if (!r.ok) console.error('Telegram error', r.status); }
}

// ---- 1. Load the last 45 sessions of the whole market, oldest first
const S = [], D = [];
for (let k = 0, ms = Date.now(); S.length < SESSIONS && k < SESSIONS * 2; k++, ms -= 86400000) {
  const d = new Date(ms), wd = d.getUTCDay(); if (wd === 0 || wd === 6) continue;
  const rows = await grouped(iso(ms)); if (rows.length < 500) continue;
  const m = new Map(); for (const r of rows) if (/^[A-Z]{1,5}$/.test(r.T) && r.c > 0 && r.o > 0) m.set(r.T, r);
  S.unshift(m); D.unshift(iso(ms));
}
if (S.length < 12) { console.error('Too few sessions loaded (' + S.length + '). Check the MASSIVE_KEY secret.'); process.exit(1); }
const last = S.length - 1, prevDone = (() => { try { return JSON.parse(fs.readFileSync('data/movers-state.json', 'utf8')).session; } catch { return ''; } })();
console.log('sessions loaded:', S.length, 'from', D[0], 'to', D[last]);
if (prevDone === D[last] && !env.FORCE) { console.log('No new session since ' + D[last] + '. Nothing sent.'); process.exit(0); }

// ---- 2. Every 20%+ jump with real trading volume, and what followed from the NEXT open (the first moment you could act)
const cost = (price) => price < 5 ? 0.01 : 0.002;      // round trip: fees plus slippage, far higher for penny stocks
let SUB = false;
function jumpsOn(i) {
  const out = [];
  for (const [sym, c] of S[i]) {
    const p = S[i - 1].get(sym); if (!p || p.c < (SUB ? 0.1 : 1) || (SUB && p.c >= 1)) continue;
    const ret = c.c / p.c - 1; if (ret < JUMP || ret > 20 || c.c * c.v < MIN_DV) continue;
    let vs = 0, vn = 0; for (let k = Math.max(0, i - 5); k < i; k++) { const x = S[k].get(sym); if (x) { vs += x.v; vn++; } }
    out.push({ sym, i, ret, price: c.c, penny: c.c < 5, loc: c.h > c.l ? (c.c - c.l) / (c.h - c.l) : 0.5, volMult: vn >= 3 && vs > 0 ? c.v / (vs / vn) : null, dv: c.c * c.v });
  }
  return out;
}
function forward(j) {      // returns after 1, 3 and 5 sessions, bought at the next open, after costs
  const e = S[j.i + 1] && S[j.i + 1].get(j.sym); if (!e) return null;
  const f = {}; for (const h of [1, 3, 5]) { const x = S[j.i + h] && S[j.i + h].get(j.sym); if (x) f[h] = x.c / e.o - 1 - cost(e.o); }
  return f;
}
const all = []; for (let i = 1; i <= last; i++) all.push(...jumpsOn(i));
for (const j of all) j.f = forward(j);
const stat = (arr) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return { n: a.length, med: a[Math.floor(a.length / 2)], mean: a.reduce((x, y) => x + y, 0) / a.length, pos: a.filter(x => x > 0).length / a.length }; };
const GROUPS = [['All 20%+ jumps', () => true], ['Under 5 USD', j => j.penny], ['5 USD and over', j => !j.penny],
  ['Closed in the top quarter of the day\'s range', j => j.loc >= 0.75], ['Closed in the bottom half of the range', j => j.loc < 0.5],
  ['Volume 5x to 10x normal', j => j.volMult !== null && j.volMult >= 5 && j.volMult < 10], ['Volume 10x to 50x normal', j => j.volMult !== null && j.volMult >= 10 && j.volMult < 50], ['Volume over 50x normal', j => j.volMult !== null && j.volMult >= 50]];
const table = GROUPS.map(([name, fn]) => ({ name, fn, h: Object.fromEntries([1, 3, 5].map(h => [h, stat(all.filter(j => fn(j) && j.f && j.f[h] !== undefined).map(j => j.f[h]))])) }));
// ---- 2b. Testing the claims about HOW to enter and exit, on the same real jumps.
// Entry B: do not buy the next open. Buy only if, within 3 sessions, the price trades ABOVE the jump day's high (at that high, or at the open if it gaps over).
function breakoutEntry(j) { const H = S[j.i].get(j.sym).h; for (let k = j.i + 1; k <= Math.min(last, j.i + 3); k++) { const b = S[k].get(j.sym); if (!b) return null; if (b.h > H) return { k, price: Math.max(H, b.o) }; } return null; }
const after = (sym, k, price, h) => { const x = S[k + h] && S[k + h].get(sym); return x ? x.c / price - 1 - cost(price) : undefined; };
for (const j of all) { j.b = j.i + 3 <= last ? breakoutEntry(j) : undefined; if (j.b) j.bf = { 3: after(j.sym, j.b.k, j.b.price, 3), 5: after(j.sym, j.b.k, j.b.price, 5) }; }
const decided = all.filter(j => j.b !== undefined), trig = decided.filter(j => j.b);
const BEST = (j) => !j.penny && j.loc >= 0.75 && j.volMult !== null && j.volMult >= 5 && j.volMult < 50;     // the subset the claims point to
const bStat = (fn, h) => stat(trig.filter(j => fn(j) && j.bf && j.bf[h] !== undefined).map(j => j.bf[h]));
// Exits compared on the "best case" breakout entries: (A) first close under the 5 day average, (B) a trailing stop 3 ATR under the highest high.
// Both start with a stop 2 ATR under the entry and are closed after 10 sessions at the latest.
function atrAt(sym, i) { let s2 = 0, n = 0; for (let k = i - 13; k <= i; k++) { const a = S[k] && S[k].get(sym), b = S[k - 1] && S[k - 1].get(sym); if (!a || !b) return null; s2 += Math.max(a.h - a.l, Math.abs(a.h - b.c), Math.abs(a.l - b.c)); n++; } return n === 14 ? s2 / 14 : null; }
function exitSim(j, mode) {
  const k0 = j.b.k, p = j.b.price, a = atrAt(j.sym, k0 - 1); if (!a || k0 + 10 > last) return undefined;
  let hi = p, stop = p - 2 * a;
  for (let d = k0; d <= k0 + 10; d++) {
    const b = S[d].get(j.sym); if (!b) return undefined;
    if (d > k0 && b.o <= stop) return b.o / p - 1 - cost(p);
    if (b.l <= stop && d > k0) return stop / p - 1 - cost(p);
    if (b.h > hi) hi = b.h;
    if (mode === 'trail') stop = Math.max(stop, hi - 3 * a);
    else { let m = 0, n = 0; for (let q = d - 4; q <= d; q++) { const x = S[q].get(j.sym); if (x) { m += x.c; n++; } } if (n === 5 && b.c < m / 5 && d > k0) { const nx = S[d + 1] && S[d + 1].get(j.sym); return (nx ? nx.o : b.c) / p - 1 - cost(p); } }
  }
  return S[k0 + 10].get(j.sym).c / p - 1 - cost(p);
}
const exA = stat(trig.filter(BEST).map(j => exitSim(j, 'ma')).filter(x => x !== undefined)), exB = stat(trig.filter(BEST).map(j => exitSim(j, 'trail')).filter(x => x !== undefined));
// ---- 2c. FLAG STUDY. The claim: do not buy the jump; wait for a "flag". A jump on heavy volume (the pole), then at least three quiet
// days that stay under the jump day's high and above the middle of the jump, on volume that dries up, then a break above the
// flag's high. Settings are fixed in advance, not tuned to the result. Entry at the flag's high (or the open, if it opens above).
// Stop at the flag's low. Out after five sessions at the latest. Costs taken off.
const FLAG = { VOL: 5, MINDAYS: 3, WINDOW: 8, HOLD: 5, MAXGAP: 0.05 };
function flagOf(j, upto) {
  const pole = S[j.i].get(j.sym), prev = S[j.i - 1].get(j.sym), H0 = pole.h, floor = (prev.c + pole.c) / 2, end = Math.min(upto, j.i + FLAG.WINDOW);
  let fh = 0, fl = Infinity; const vols = [];
  for (let d = j.i + 1; d <= end; d++) {
    const b = S[d].get(j.sym); if (!b) return { state: 'gone' };
    if (d - j.i <= FLAG.MINDAYS) {
      if (b.h > H0 || b.l < floor) return { state: 'no flag' };
      fh = Math.max(fh, b.h); fl = Math.min(fl, b.l); vols.push(b.v);
      if (d - j.i === FLAG.MINDAYS && !(vols.reduce((x, y) => x + y, 0) / vols.length <= 0.5 * pole.v && vols[vols.length - 1] < vols[0])) return { state: 'no flag' };
    } else {
      if (b.o < floor) return { state: 'failed' };
      if (b.h > fh) { const price = Math.max(fh, b.o); return price > fh * (1 + FLAG.MAXGAP) ? { state: 'gapped away' } : { state: 'triggered', k: d, price, stop: fl, fh }; }
      if (b.l < floor) return { state: 'failed' };
      fl = Math.min(fl, b.l);
    }
  }
  const days = end - j.i;
  return days >= FLAG.WINDOW ? { state: 'expired' } : days >= FLAG.MINDAYS ? { state: 'in flag', fh, fl, days } : { state: 'forming' };
}
function flagTrade(sym, t) {       // result of one triggered flag, with its stop
  if (t.k + FLAG.HOLD > last) return undefined;
  for (let d = t.k; d <= t.k + FLAG.HOLD; d++) {
    const b = S[d].get(sym); if (!b) return undefined;
    if (d > t.k && b.o <= t.stop) return b.o / t.price - 1 - cost(t.price);
    if ((d > t.k && b.l <= t.stop) || (d === t.k && b.c < t.stop)) return t.stop / t.price - 1 - cost(t.price);
  }
  return S[t.k + FLAG.HOLD].get(sym).c / t.price - 1 - cost(t.price);
}
const poles = all.filter(j => j.volMult !== null && j.volMult >= FLAG.VOL);
for (const j of poles) { j.flag = flagOf(j, last); if (j.flag.state === 'triggered') j.flagRet = flagTrade(j.sym, j.flag); }
const judged = poles.filter(j => j.i + FLAG.WINDOW <= last), fCount = (st) => judged.filter(j => j.flag.state === st).length;
const flagRes = (fn) => stat(poles.filter(j => j.flagRet !== undefined && fn(j)).map(j => j.flagRet));
const flagAll = flagRes(() => true), flagBig = flagRes(j => !j.penny), flagPenny = flagRes(j => j.penny);
const flagGood = (s) => s && s.n >= 30 && s.mean > 0 && s.pos >= 0.5;
const flagsNow = poles.filter(j => j.flag.state === 'in flag').sort((a, b) => b.dv - a.dv).slice(0, 10);
// Flag pullback: after the break, buy only if within three sessions the price comes back to the flag's high and closes at or above it.
// Entry at that day's close. Same stop and holding time.
for (const j of poles) { const t = j.flag; if (t.state !== 'triggered') continue;
  for (let d = t.k + 1; d <= Math.min(last, t.k + 3); d++) { const b = S[d].get(j.sym); if (!b || b.l < t.stop) break; if (b.l <= t.fh * 1.01 && b.c >= t.fh) { j.pbRet = flagTrade(j.sym, { k: d, price: b.c, stop: t.stop }); break; } } }
const pbBig = stat(poles.filter(j => j.pbRet !== undefined && !j.penny).map(j => j.pbRet));
// ---- 2d. EXPANSION-DAY STUDY ("adaptive momentum trigger"). A day that closes up by at least 1.5 times the stock's normal daily
// range (14 day ATR) on at least twice its usual volume, measured at the close. Jumps of 20% or more are left to the flag study.
// Bought at the next open. Stop one ATR under the entry, target three ATR over it, out after ten sessions.
// If stop and target fall on the same day, the stop is counted: the order inside a day is unknown.
const AMT = { MOVE: 1.5, VOL: 2, HOLD: 10 }, amt = [];
for (let i = 16; i <= last - 1; i++) for (const [sym, c] of S[i]) {
  const p = S[i - 1].get(sym); if (!p || c.c < 1 || c.c * c.v < MIN_DV) continue;
  const up = c.c - p.c; if (up <= 0 || c.c / p.c - 1 >= JUMP) continue;
  let vs = 0, vn = 0; for (let k = i - 10; k < i; k++) { const x = S[k].get(sym); if (x) { vs += x.v; vn++; } }
  if (vn < 8 || c.v < AMT.VOL * vs / vn) continue;
  const a = atrAt(sym, i - 1); if (!a || up < AMT.MOVE * a) continue;
  const e = S[i + 1].get(sym); if (!e) continue;
  const r = { sym, i, penny: c.c < 5, atrs: up / a }; amt.push(r);
  if (i + 1 + AMT.HOLD > last) continue;                       // not finished yet
  const stop = e.o - a, tgt = e.o + 3 * a; let out = null;
  for (let d = i + 1; d <= i + 1 + AMT.HOLD && !out; d++) { const b = S[d].get(sym); if (!b) { out = { why: 'gone' }; break; }
    if (d > i + 1 && b.o <= stop) out = { why: 'stop', x: b.o }; else if (b.l <= stop) out = { why: 'stop', x: stop }; else if (b.h >= tgt) out = { why: 'target', x: Math.max(tgt, d > i + 1 ? b.o : tgt) }; }
  if (!out) { const b = S[i + 1 + AMT.HOLD].get(sym); out = b ? { why: 'time', x: b.c } : { why: 'gone' }; }
  if (out.x) { r.why = out.why; r.ret = out.x / e.o - 1 - cost(e.o); }
}
const amtDone = amt.filter(r => r.ret !== undefined), amtBig = amtDone.filter(r => !r.penny), amtStat = stat(amtBig.map(r => r.ret)), amtPenny = stat(amtDone.filter(r => r.penny).map(r => r.ret));
const amtWhy = (w) => amtBig.length ? Math.round(amtBig.filter(r => r.why === w).length / amtBig.length * 100) : 0;
const fline = (s) => s ? 'average ' + pc(s.mean) + ', typical ' + pc(s.med) + ', ' + Math.round(s.pos * 100) + '% ended higher (' + s.n + ' trades)' : 'too few cases';
const line = (s) => s ? 'typical ' + pc(s.med) + ', ' + Math.round(s.pos * 100) + '% ended higher (' + s.n + ' cases)' : 'too few cases';

// ---- 3. Build-up watch: small stocks whose volume has swelled for a week while the price has not yet run
function buildUps(i) {
  const out = []; if (i < 25) return out;
  for (const [sym, c] of S[i]) {
    if (c.c < 1 || c.c > 20) continue;
    let v5 = 0, v20 = 0, n5 = 0, n20 = 0, hi = 0, ok = true;
    for (let k = i - 24; k <= i; k++) { const x = S[k].get(sym); if (!x) { ok = false; break; } if (k > i - 5) { v5 += x.v; n5++; } else { v20 += x.v; n20++; } if (x.c > hi) hi = x.c; }
    if (!ok || !v20) continue;
    const ratio = (v5 / n5) / (v20 / n20), chg5 = c.c / S[i - 5].get(sym).c - 1;
    if (ratio >= 2.5 && (v5 / n5) * c.c >= 1e6 && chg5 > -0.05 && chg5 < 0.15 && c.c >= 0.95 * hi) out.push({ sym, i, ratio, price: c.c, chg5 });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}
const bigDayWithin = (sym, i) => { for (let k = i + 1; k <= i + 5 && k <= last; k++) { const a = S[k].get(sym), b = S[k - 1].get(sym); if (a && b && a.c / b.c - 1 >= JUMP) return true; } return false; };
let buN = 0, buHit = 0, baseN = 0, baseHit = 0; const buRet = [], seen = new Map();
for (let i = 25; i <= last - 5; i++) {
  for (const b of buildUps(i)) { if (seen.has(b.sym) && i - seen.get(b.sym) < 10) continue; seen.set(b.sym, i); buN++; if (bigDayWithin(b.sym, i)) buHit++; const e = S[i + 1].get(b.sym), x = S[i + 5].get(b.sym); if (e && x) buRet.push(x.c / e.o - 1 - cost(e.o)); }
  if ((i - 25) % 5 === 0) for (const [sym, c] of S[i]) { if (c.c < 1 || c.c > 20 || c.c * c.v < 1e6) continue; baseN++; if (bigDayWithin(sym, i)) baseHit++; }
}
const watch = buildUps(last).slice(0, 10), buStat = stat(buRet);
// Missed-mover review: of every 20%+ jump, was it on the build-up watch in the five sessions before? (An honest recall score.)
const flagged = new Map();     // session index -> set of symbols on the build-up watch that day
for (let i = 25; i <= last; i++) flagged.set(i, new Set(buildUps(i).map(b => b.sym)));
const wasFlagged = (sym, i) => { for (let k = i - 1; k >= Math.max(25, i - 5); k--) if (flagged.get(k) && flagged.get(k).has(sym)) return D[k]; return null; };
const reviewable = all.filter(j => j.i >= 30), caught = reviewable.filter(j => wasFlagged(j.sym, j.i)).length;
let QUALITY = new Set(); try { QUALITY = new Set((JSON.parse(fs.readFileSync('data/discovery.json', 'utf8')).candidates || []).map(c => c.sym)); } catch {}

// ---- 4. Today's movers, the news behind them, and a journal that learns which kinds of news keep going
const TAGS = [['FDA / trial', /\bFDA\b|PDUFA|phase (2|3|ii|iii)\b|trial|approval|clearance/i], ['Deal', /\bmerg|acqui|takeover|buyout|tender offer|to be bought/i], ['Earnings', /earnings|quarter|guidance|results|revenue/i], ['Contract', /\bcontract\b|partnership|awarded|order|agreement|collaborat/i], ['Offering', /offering|private placement|dilut|warrants|registered direct/i], ['Analyst', /upgrad|downgrad|price target|initiat/i]];
const today = jumpsOn(last).sort((a, b) => b.ret - a.ret).slice(0, 12);
SUB = true; const sub = jumpsOn(last).sort((a, b) => b.ret - a.ret).slice(0, 8); SUB = false;   // sub-dollar movers, shown apart, never studied as trades
if (env.FINNHUB_KEY) for (const j of today.slice(0, 8)) {
  try { const r = await fetch(FH + '/company-news?symbol=' + j.sym + '&from=' + iso(Date.parse(D[last]) - 2 * 86400000) + '&to=' + iso(Date.now()) + '&token=' + encodeURIComponent(env.FINNHUB_KEY));
    if (r.ok) { const items = await r.json(), roundup = /stocks? (mixed|moving|movers)|gap up and gap down|pre-market session|midday stories|top stories|market (wrap|update)|biggest (gainers|movers)/i;
      const heads = (Array.isArray(items) ? items : []).map(x => String(x.headline || '')).filter(h => h && !roundup.test(h)), own = heads.filter(h => new RegExp('\\b' + j.sym + '\\b').test(h)), tagged = (own.length ? own : heads).find(h => TAGS.some(([, re]) => re.test(h)));
      const pick = tagged || own[0];
      if (pick) { j.head = pick.slice(0, 110); j.tag = (TAGS.find(([, re]) => re.test(pick)) || ['Other company news'])[0]; } else j.tag = Array.isArray(items) && items.length ? 'No company-specific news' : 'No news found'; } } catch (e) {}
  try { const r2 = await fetch(FH + '/stock/metric?symbol=' + j.sym + '&metric=all&token=' + encodeURIComponent(env.FINNHUB_KEY));
    if (r2.ok) { const m = (await r2.json()).metric || {}, fk = Object.keys(m).find(k => /float/i.test(k)), sk = Object.keys(m).find(k => /sharesOutstanding|shareOutstanding/i.test(k));
      if (!globalThis.metricLogged) { globalThis.metricLogged = true; console.log('Finnhub metric offers: float field ' + (fk || 'none') + ', shares field ' + (sk || 'none')); }
      const mil = fk ? +m[fk] : sk ? +m[sk] : null; if (mil > 0) { j.shares = mil; j.sharesKind = fk ? 'float' : 'shares outstanding'; } } } catch (e) {}
  await sleep(FAST ? 0 : 1100);
}
const expect = (j) => { const g = all.filter(x => x.penny === j.penny && (x.loc >= 0.7) === (j.loc >= 0.7) && x.f && x.f[3] !== undefined).map(x => x.f[3]), s = stat(g); return s && s.n >= 15 ? 'stocks like this (' + (j.penny ? 'under 5 USD' : '5 USD and over') + ', ' + (j.loc >= 0.7 ? 'closed near the high' : 'gave back part of the jump') + ') were typically ' + pc(s.med) + ' three sessions later; ' + Math.round(s.pos * 100) + '% were higher' : 'too few similar cases to say'; };
// journal (tickers, dates, tags and results only) so results by kind of news accumulate week after week
const JF = 'data/movers-journal.jsonl', journal = fs.existsSync(JF) ? fs.readFileSync(JF, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
for (const j of today) if (j.tag && !journal.some(x => x.sym === j.sym && x.d === D[last])) { const e = { sym: j.sym, d: D[last], ret: +j.ret.toFixed(4), tag: j.tag, penny: j.penny }; journal.push(e); fs.appendFileSync(JF, JSON.stringify(e) + '\n'); }
const byTag = {};
for (const e of journal) { const i = D.indexOf(e.d); if (i < 1 || i + 3 > last) continue; const en = S[i + 1].get(e.sym), x = S[i + 3].get(e.sym); if (!en || !x) continue; (byTag[e.tag] = byTag[e.tag] || []).push(x.c / en.o - 1 - cost(en.o)); }

// ---- 5. The message
const A = table[0].h, verdict = !A[3] ? 'Too few cases yet to judge.' : A[3].med < 0 && A[3].pos < 0.5 ? 'On this evidence, buying the morning after a 20% jump lost money more often than it made it.' : A[3].med > 0 && A[3].pos > 0.55 ? 'On this evidence, buying the morning after a 20% jump made money more often than not in this period. One good month is not proof.' : 'On this evidence, buying the morning after a 20% jump was close to a coin flip, before the losses from the worst cases.';
const best = table.slice(1).filter(g => g.h[3] && g.h[3].n >= 30).sort((a, b) => b.h[3].med - a.h[3].med)[0];
const msg = ['Movers radar, ' + D[last], 'Evidence from ' + S.length + ' sessions of the whole US market (' + D[0] + ' to ' + D[last] + '). ' + all.length + ' jumps of 20% or more on real volume.', '',
  'IF YOU BUY THE MORNING AFTER A 20% JUMP', 'Bought at the next open, after costs.',
  ...table.map(g => g.name + '\n  next day: ' + line(g.h[1]) + '\n  3 sessions: ' + line(g.h[3]) + '\n  5 sessions: ' + line(g.h[5])), '', verdict,
  best && best.h[3].med > 0 ? 'The group that held up best: ' + best.name + ' (' + line(best.h[3]) + ' after 3 sessions).' : 'No group of movers was reliably profitable to chase in this period.', '',
  'DOES WAITING FOR A BREAK ABOVE THE JUMP DAY\'S HIGH HELP?',
  decided.length ? Math.round(trig.length / decided.length * 100) + '% of jumps went on to trade above their jump-day high within 3 sessions (' + trig.length + ' of ' + decided.length + '). The rest never triggered, so no trade and no loss.' : 'Too few cases.',
  'Entered on that break, all jumps: 3 sessions later ' + line(bStat(() => true, 3)) + '; 5 sessions later ' + line(bStat(() => true, 5)) + '.',
  'Compare with buying the next open: 3 sessions later ' + line(A[3]) + '.', '',
  'THE "BEST CASE" SUBSET: 5 USD and over, closed in the top quarter, volume 5x to 50x normal, entered on the break',
  '3 sessions later: ' + line(bStat(BEST, 3)), '5 sessions later: ' + line(bStat(BEST, 5)),
  'Exit by first close under the 5 day average: ' + line(exA), 'Exit by a trailing stop 3 ATR under the high: ' + line(exB),
  (() => { const b3 = bStat(BEST, 3); return !b3 || b3.n < 20 ? 'Too few cases in this subset to judge. It needs more weeks.' : b3.med > 0 && b3.pos > 0.55 ? 'This subset was profitable in this period. That is one sample of ' + b3.n + ', not proof. It is a candidate for a tested rule.' : 'Even this subset did not reliably make money in this period.'; })(), '',
  'FAST MOVERS REQUIRING INVESTIGATION, today (already moved, kept separate from quality candidates)'];
for (const j of today) msg.push(j.sym + ' ' + pc(j.ret, 0) + ' to ' + j.price.toFixed(2) + (QUALITY.has(j.sym) ? ' [also a quality candidate]' : '') + (wasFlagged(j.sym, last) ? ' [was on the build-up watch on ' + wasFlagged(j.sym, last) + ']' : ' [not seen beforehand]') + ', ' + (j.dv / 1e6).toFixed(0) + 'M USD traded' + (j.volMult ? ', ' + j.volMult.toFixed(0) + 'x normal volume' : '') + (j.tag ? '\n  news: ' + j.tag + (j.head ? ' \u2014 ' + j.head : '') : '') + (j.shares ? '\n  ' + j.sharesKind + ': about ' + (j.shares >= 1000 ? (j.shares / 1000).toFixed(1) + ' billion' : j.shares.toFixed(0) + ' million') + ' shares' + (j.shares < 10 ? '. VERY SMALL: easy to push around, a classic promotion target.' : '') : '') + '\n  ' + expect(j));
if (!today.length) msg.push('No stock rose 20% or more on real volume today.');
msg.push('', 'SUB-DOLLAR MOVERS, 0.10 to 0.99 USD (shown so nothing is hidden; extreme risk, no trade)');
if (sub.length) { for (const j of sub) msg.push(j.sym + ' ' + pc(j.ret, 0) + ' to ' + j.price.toFixed(2) + ', ' + (j.dv / 1e6).toFixed(1) + 'M USD traded' + (j.volMult ? ', ' + j.volMult.toFixed(0) + 'x normal volume' : '')); msg.push('Stocks under 1 USD can be halted, delisted, or diluted by an offering within days. The radar does not test or price them.'); }
else msg.push('None today.');
const tags = Object.entries(byTag).filter(([, a]) => a.length >= 5);
if (tags.length) { msg.push('', 'BY KIND OF NEWS, 3 sessions after the jump (from this radar\'s own journal)'); for (const [k, a] of tags) msg.push(k + ': ' + line(stat(a))); }
else msg.push('', 'BY KIND OF NEWS', 'Not enough history yet. The radar tags each mover\'s news and will show which kinds keep rising once a few weeks have built up.');
msg.push('', 'MISSED-MOVER REVIEW AND SCOREBOARD', reviewable.length >= 20 ? 'Of ' + reviewable.length + ' jumps of 20%+ in the reviewable period, the build-up watch had flagged ' + caught + ' beforehand (' + Math.round(caught / reviewable.length * 100) + '%). The rest gave no warning in price or volume: they moved on news alone.' : 'Too few sessions to score yet.', 'Today: ' + today.filter(j => wasFlagged(j.sym, last)).length + ' of ' + today.length + ' movers had been flagged.');
msg.push('', 'BUILD-UP WATCH (volume swelling, price not yet moved)');
if (watch.length) for (const b of watch) msg.push(b.sym + ' ' + b.price.toFixed(2) + ': volume ' + b.ratio.toFixed(1) + 'x its usual for a week, price ' + pc(b.chg5) + ' in 5 sessions');
else msg.push('None today.');
msg.push(buN >= 20 ? 'How this watch has done: ' + Math.round(buHit / buN * 100) + '% of ' + buN + ' past build-ups had a 20%+ day within a week, against ' + (baseN ? (baseHit / baseN * 100).toFixed(1) : '?') + '% for small stocks in general. Holding one for 5 sessions: ' + line(buStat) + '.' : 'Too few past build-ups to say how well this watch works.',
  '', 'This is evidence and a watchlist, not buy signals. Penny stocks can be halted and gap past any stop. Not financial advice, not a halal ruling.' + (env.PAGE_URL ? '\n' + env.PAGE_URL : ''));
await telegram(msg.join('\n'));
{ // the flag study goes out as its own short message, conclusion first
  const A3 = table[0].h[3], enough = flagBig && flagBig.n >= 30;
  const concl = !flagAll || flagAll.n < 15 ? 'Too few finished flag trades in these ' + S.length + ' sessions to judge. It needs more weeks.'
    : flagGood(flagBig) ? 'On stocks of 5 USD and over, waiting for the flag MADE money in this sample. One sample of ' + flagBig.n + ' trades is a lead, not proof.'
    : enough ? 'On stocks of 5 USD and over, waiting for the flag did NOT make money in this sample. Do not trade it.'
    : 'The flag has too few trades on stocks of 5 USD and over to judge (' + (flagBig ? flagBig.n : 0) + '). Watch only.';
  const f = ['HUNTING STUDIES, ' + D[last], 'Three ways to act on a big move, measured on ' + S.length + ' sessions of the whole US market. Costs taken off. Doing nothing scores 0%.', '', '1. FLAG STUDY', 'A jump of 20%+ on at least ' + FLAG.VOL + 'x normal volume, then ' + FLAG.MINDAYS + '+ quiet days on drying volume, then a break above the quiet range. Bought on the break, stop at the bottom of the range, out after ' + FLAG.HOLD + ' sessions.', '',
    'CONCLUSION: ' + concl, '',
    'What became of ' + judged.length + ' heavy-volume jumps: ' + (fCount('no flag') + fCount('gone')) + ' never formed a flag, ' + fCount('failed') + ' formed one and broke down, ' + fCount('expired') + ' went nowhere, ' + fCount('gapped away') + ' gapped away with no fair entry, ' + fCount('triggered') + ' broke out and gave an entry.',
    'All flag trades: ' + fline(flagAll), '5 USD and over: ' + fline(flagBig), 'Under 5 USD: ' + fline(flagPenny),
    'Compare, buying the morning after the jump: ' + (A3 ? 'typical ' + pc(A3.med) + ', ' + Math.round(A3.pos * 100) + '% ended higher (' + A3.n + ' cases)' : 'too few cases') + '.', '',
    '2. FLAG PULLBACK (after the break, wait for a return to the break level that holds)', '5 USD and over: ' + fline(pbBig), '',
    '3. EXPANSION DAY (up 1.5x its normal daily range or more on 2x volume or more; bought at the next open; stop 1x that range, target 3x, out after ' + AMT.HOLD + ' sessions)',
    '5 USD and over: ' + fline(amtStat) + (amtBig.length ? '. Of these, ' + amtWhy('target') + '% reached the target, ' + amtWhy('stop') + '% hit the stop, ' + amtWhy('time') + '% ran out of time.' : ''),
    'Under 5 USD: ' + fline(amtPenny),
    'CONCLUSION: ' + (!amtStat || amtStat.n < 30 ? 'too few finished cases to judge.' : amtStat.mean > 0 && amtStat.pos >= 0.5 ? 'the expansion day MADE money in this sample (' + amtStat.n + ' trades). A lead, not proof.' : amtStat.mean > 0 ? 'the expansion day made a little on average but lost more often than it won. Not usable as it stands.' : 'the expansion day did NOT make money in this sample. Do not trade it.'),
    'A target three times the stop is reached far less often than the stop. The numbers above are what that trade-off really paid.', '',
    'IN A FLAG NOW (' + flagsNow.length + ')' + (flagGood(flagBig) ? '' : ', watch only')];
  for (const j of flagsNow) f.push(j.sym + ' ' + S[last].get(j.sym).c.toFixed(2) + (j.penny ? ' (under 5 USD)' : '') + ': jumped ' + pc(j.ret, 0) + ' on ' + D[j.i] + ', quiet for ' + j.flag.days + ' days\n  break level ' + j.flag.fh.toFixed(2) + ', stop ' + j.flag.fl.toFixed(2) + ' (' + ((1 - j.flag.fl / j.flag.fh) * 100).toFixed(1) + '% risk)');
  if (!flagsNow.length) f.push('None today.');
  f.push('', 'Evidence, not buy signals. Under 5 USD the stop can be jumped over. Not financial advice, not a halal ruling.');
  await telegram(f.join('\n'));
  fs.writeFileSync('data/flags.json', JSON.stringify({ session: D[last], sessions: S.length, tradable: Boolean(flagGood(flagBig)), all: flagAll, big: flagBig, penny: flagPenny, pullback: pbBig, expansion: amtStat, expansionPenny: amtPenny, now: flagsNow.map(j => ({ sym: j.sym, pole: D[j.i], ret: +j.ret.toFixed(4), days: j.flag.days, trigger: +j.flag.fh.toFixed(4), stop: +j.flag.fl.toFixed(4), penny: j.penny })), text: f.join('\n') }, null, 1));
  console.log('flag study:', poles.length, 'poles,', fCount('triggered'), 'triggered,', flagsNow.length, 'in a flag now');
}
// ---- 6. WHY I DID NOT CATCH THEM, and more ways to act, every one measured on the same whole-market sessions.
// Each 20%+ mover is classified: a scheduled earnings report (the date was known in advance), an overnight jump (news before
// the open: no price clue could precede it), or a rise during the session (the only kind a live radar can see forming).
// Then new ideas are tested: holding through earnings, buying after a strong earnings reaction (post-earnings drift), and
// buying the bounce after a 20% fall. Each is compared with buying an ordinary stock the same way.
const hunt = { reasons: null, studies: {}, upcoming: [] };
{
  const DAY = 86400000, EARN = new Map(); let earnOk = false;
  if (env.FINNHUB_KEY) for (let t = Date.parse(D[0]); t <= Date.parse(D[last]) + 10 * DAY; t += 7 * DAY) {
    try { const r = await fetch(FH + '/calendar/earnings?from=' + iso(t) + '&to=' + iso(t + 6 * DAY) + '&token=' + encodeURIComponent(env.FINNHUB_KEY));
      if (r.ok) { const j = await r.json(); for (const e of (j.earningsCalendar || [])) { if (!e || !/^[A-Z]{1,5}$/.test(e.symbol || '') || !e.date) continue; if (!EARN.has(e.symbol)) EARN.set(e.symbol, []); EARN.get(e.symbol).push({ d: e.date, hour: e.hour || '', beat: e.epsActual != null && e.epsEstimate != null ? e.epsActual > e.epsEstimate : null }); earnOk = true; } } } catch (e) { }
    await sleep(FAST ? 0 : 1100);
  }
  const reactIdx = (e) => { let i = D.findIndex(d => d >= e.d); if (i < 0) return -1; if (D[i] === e.d && /amc/i.test(e.hour)) i++; return i <= last ? i : -1; };
  const eventAt = (sym, i) => (EARN.get(sym) || []).find(e => reactIdx(e) === i) || null;
  const avgC = (sym, i, n) => { let s2 = 0, k = 0; for (let t = i - n + 1; t <= i; t++) { const x = S[t] && S[t].get(sym); if (x) { s2 += x.c; k++; } } return k >= n * 0.8 ? s2 / k : null; };
  const reasonOf = (j) => { const p = S[j.i - 1].get(j.sym), c = S[j.i].get(j.sym); if (eventAt(j.sym, j.i)) return 'earnings'; return c.o / p.c - 1 >= 0.7 * j.ret ? 'overnight' : 'intraday'; };
  const pool = all.filter(j => j.i >= 21);
  const R = { earnings: 0, overnight: 0, intraday: 0 }, downBefore = pool.filter(j => { const a = avgC(j.sym, j.i - 1, 20), p = S[j.i - 1].get(j.sym); return a && p.c < a; }).length;
  for (const j of pool) R[j.why = reasonOf(j)]++;
  hunt.reasons = { n: pool.length, ...R, downBefore, earnOk };
  // the measuring stick: an ordinary liquid stock bought at the next open, held 3 sessions
  const baseArr = []; for (let i = 21; i + 3 <= last; i += 2) for (const [sym, c] of S[i]) { if (c.c < 5 || c.c * c.v < MIN_DV) continue; const e = S[i + 1].get(sym), x = S[i + 3].get(sym); if (e && x) baseArr.push(x.c / e.o - 1 - cost(e.o)); }
  const BASE = stat(baseArr);
  const study = (name, arr, how) => { const s3 = stat(arr); hunt.studies[name] = { ...s3, how, base: BASE && BASE.mean, candidate: Boolean(s3 && s3.n >= 30 && s3.mean > 0 && s3.pos >= 0.5 && BASE && s3.mean > BASE.mean + 0.005) }; };
  // A. hold through earnings: buy at the close before the report reaction, sell at the close of the reaction day / 3 sessions later
  const thru1 = [], thru3 = [], thruUp = [], drift5 = [], drift10 = [], driftAny5 = [], runup = [], runupUp = [];
  for (const [sym, evs] of EARN) for (const e of evs) {
    const i = reactIdx(e); if (i < 21 || i > last) continue;
    const b = S[i - 1].get(sym), r = S[i].get(sym); if (!b || !r || b.c < 5 || b.c * b.v < MIN_DV) continue;
    // D. run-up INTO the report: buy the open 3 sessions before the reaction day, sell at the last close BEFORE the report
    { const e3 = S[i - 3] && S[i - 3].get(sym); if (e3 && e3.o > 0) { const g = b.c / e3.o - 1 - cost(e3.o); runup.push(g); const a = avgC(sym, i - 4, 20), p4 = S[i - 4] && S[i - 4].get(sym); if (a && p4 && p4.c > a) runupUp.push(g); } }
    thru1.push(r.c / b.c - 1 - cost(b.c)); const r3 = S[i + 2] && S[i + 2].get(sym); if (r3) thru3.push(r3.c / b.c - 1 - cost(b.c));
    const a20 = avgC(sym, i - 1, 20); if (a20 && b.c > a20) thruUp.push(r.c / b.c - 1 - cost(b.c));
    // B. post-earnings drift: the report day gapped up 5%+ and held (closed in the top half); bought at the next open
    const gap = r.o / b.c - 1, loc = r.h > r.l ? (r.c - r.l) / (r.h - r.l) : 0.5, n1 = S[i + 1] && S[i + 1].get(sym);
    if (gap >= 0.05 && loc >= 0.5 && n1) { const x5 = S[i + 5] && S[i + 5].get(sym), x10 = S[i + 10] && S[i + 10].get(sym);
      if (x5) driftAny5.push(x5.c / n1.o - 1 - cost(n1.o));
      if (e.beat === true) { if (x5) drift5.push(x5.c / n1.o - 1 - cost(n1.o)); if (x10) drift10.push(x10.c / n1.o - 1 - cost(n1.o)); } }
  }
  study('Run-up before earnings, out before the report', runup, 'buy the open 3 sessions before the report, sell at the last close before it (never holds through the result)');
  study('Run-up before earnings, uptrend only', runupUp, 'same, only stocks above their 20 day average');
  study('Hold through earnings, 1 day', thru1, 'buy at the close before the report, sell at the close of the reaction day');
  study('Hold through earnings, 3 days', thru3, 'buy at the close before the report, sell 3 sessions later');
  study('Hold through earnings, uptrend only', thruUp, 'same, only stocks above their 20 day average');
  study('After a strong report, 5 days', driftAny5, 'report day gapped up 5%+ and held; buy the next open, sell 5 sessions later');
  study('After a beat and a strong reaction, 5 days', drift5, 'same, and earnings beat the estimate');
  study('After a beat and a strong reaction, 10 days', drift10, 'same, sell 10 sessions later');
  // C. the other side: buy the bounce after a 20% fall on real volume (5 USD and over)
  const drop3 = [], drop5 = [];
  for (let i = 21; i <= last; i++) for (const [sym, c] of S[i]) { const p = S[i - 1].get(sym); if (!p || p.c < 5 || c.c * c.v < MIN_DV || c.c / p.c - 1 > -0.2) continue; const e = S[i + 1] && S[i + 1].get(sym); if (!e) continue; const x3 = S[i + 3] && S[i + 3].get(sym), x5 = S[i + 5] && S[i + 5].get(sym); if (x3) drop3.push(x3.c / e.o - 1 - cost(e.o)); if (x5) drop5.push(x5.c / e.o - 1 - cost(e.o)); }
  study('Bounce after a 20% fall, 3 days', drop3, 'fell 20%+ on real volume; buy the next open, sell 3 sessions later');
  study('Bounce after a 20% fall, 5 days', drop5, 'same, sell 5 sessions later');
  // D. BEFORE THE MOVE: scheduled reports in the next 3 sessions, liquid stocks in an uptrend (the one kind of mover known in advance)
  const soon = iso(Date.parse(D[last]) + 5 * DAY);
  for (const [sym, evs] of EARN) for (const e of evs) { if (!(e.d > D[last] && e.d <= soon)) continue; const b = S[last].get(sym); if (!b || b.c < 5 || b.c * b.v < 2e7) continue; const a20 = avgC(sym, last, 20); if (!a20 || b.c <= a20) continue; hunt.upcoming.push({ sym, d: e.d, hour: e.hour, price: b.c, dv: b.c * b.v }); }
  hunt.upcoming.sort((a, b) => b.dv - a.dv); hunt.upcoming = hunt.upcoming.slice(0, 10);
  // today's movers, each with its reason
  const RD = (() => { try { return JSON.parse(fs.readFileSync('data/intraday-radar.json', 'utf8')); } catch { return null; } })(), RU = (() => { try { return new Set(JSON.parse(fs.readFileSync('data/radar-universe.json', 'utf8')).syms.map(x => x.sym)); } catch { return new Set(); } })();
  const radarSaw = (sym) => RD && RD.session === D[last] ? (RD.candidates || []).find(c => c.sym === sym) : null;
  const whyLine = (j) => { const w = j.why || reasonOf(j), seen = radarSaw(j.sym), a = avgC(j.sym, j.i - 1, 20), p = S[j.i - 1].get(j.sym);
    return j.sym + ' ' + pc(j.ret, 0) + ': ' + (w === 'earnings' ? 'earnings report (the date was known in advance)' : w === 'overnight' ? 'jumped at the open on overnight news: no price clue could come first' : 'rose during the session')
      + (j.penny ? '; under 5 USD, outside the tested rules' : '') + (a && p.c < a ? '; it was in a downtrend before, so no trend rule could pick it' : '')
      + (w === 'intraday' ? (seen ? '; the radar saw it (' + seen.stage.toLowerCase().replace(/_/g, ' ') + (seen.proven ? ', proven' : ', paper only') + ')' : RU.has(j.sym) ? '; on the radar list but no breakout stage before the run' : '; NOT on the radar list (not a strong-trend stock before the move)') : '') + '.'; };
  const st = (x) => !x || !x.n ? 'too few cases' : 'average ' + pc(x.mean) + ', typical ' + pc(x.med) + ', ' + Math.round(x.pos * 100) + '% ended higher (' + x.n + ')';
  const out = ['WHY I DID NOT CATCH THEM, AND MORE WAYS TESTED, ' + D[last], '',
    'THE ' + pool.length + ' JUMPS OF 20%+ IN THE LAST ' + (last - 20) + ' SESSIONS, BY CAUSE',
    '- Jumped at the open on overnight news: ' + R.overnight + ' (' + Math.round(R.overnight / Math.max(1, pool.length) * 100) + '%). No price or volume clue can come before news nobody has seen yet.',
    '- Scheduled earnings reports: ' + R.earnings + ' (' + Math.round(R.earnings / Math.max(1, pool.length) * 100) + '%)' + (earnOk ? '. These dates are public in advance: see BEFORE THE MOVE below.' : '. (Earnings calendar unavailable today.)'),
    '- Rose during the session: ' + R.intraday + ' (' + Math.round(R.intraday / Math.max(1, pool.length) * 100) + '%). The only kind a live radar can see forming.',
    '- Were in a downtrend before the jump: ' + downBefore + ' (' + Math.round(downBefore / Math.max(1, pool.length) * 100) + '%). Trend rules skip these on purpose.', '',
    'TODAY’S MOVERS, WHY EACH WAS NOT ON YOUR LIST', ...(today.length ? today.map(whyLine) : ['None.']), '',
    'MORE WAYS TO ACT, MEASURED (after costs; an ordinary liquid stock bought the same way for 3 sessions: ' + st(BASE) + ')',
    ...Object.entries(hunt.studies).map(([k, x]) => (x.candidate ? 'CANDIDATE ' : '') + k + ': ' + st(x) + '\n  ' + x.how),
    Object.values(hunt.studies).some(x => x.candidate) ? 'A CANDIDATE beat an ordinary stock clearly in this sample. It goes on paper; one period is a lead, not proof.' : 'No new way beat buying an ordinary stock clearly in this period. The tests repeat every night as the sessions roll forward.', '',
    'BEFORE THE MOVE: liquid stocks in an uptrend reporting earnings in the next few days (watch, not a buy)',
    ...(hunt.upcoming.length ? hunt.upcoming.map(u => u.sym + ' ' + u.price.toFixed(2) + ': reports ' + u.d + (/bmo/i.test(u.hour) ? ' before the open' : /amc/i.test(u.hour) ? ' after the close' : '')) : ['None found.']),
    (() => { const h = hunt.studies['Hold through earnings, uptrend only'], r = hunt.studies['Run-up before earnings, uptrend only']; return (r && r.n ? 'Buying stocks like these 3 days before the report and selling before it has paid ' + st(r) + (r.candidate ? ' (CANDIDATE: on paper first)' : '') + '. ' : '') + (h && h.n ? 'Holding them through the report has paid ' + st(h) + '; a report can gap the price far past any stop.' : ''); })(),
    'Evidence, not buy signals. Not financial advice, not a halal ruling.'].filter(x => x !== '' || true);
  await telegram(out.join('\n'));
  console.log('hunt:', JSON.stringify(hunt.reasons), Object.keys(hunt.studies).length, 'studies,', hunt.upcoming.length, 'upcoming');
}
fs.writeFileSync('data/movers-state.json', JSON.stringify({ session: D[last], sessions: S.length, cases: all.length, caught, reviewable: reviewable.length, hunt, penny: (() => { const P3 = table[1].h[3], P5 = table[1].h[5]; return P3 && P5 ? 'typically ' + pc(P3.med) + ' three sessions later and ' + pc(P5.med) + ' after five; only ' + Math.round(P5.pos * 100) + '% were higher after five (' + P3.n + ' cases).' : ''; })(), study: A[3] ? 'three sessions after the next open they were typically ' + pc(A[3].med) + ', and ' + Math.round(A[3].pos * 100) + '% were higher (' + A[3].n + ' cases).' : '' }));
console.log('movers radar sent:', all.length, 'cases,', today.length, 'movers today,', watch.length, 'build-ups');
