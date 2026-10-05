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
function jumpsOn(i) {
  const out = [];
  for (const [sym, c] of S[i]) {
    const p = S[i - 1].get(sym); if (!p || p.c < 1) continue;
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
const GROUPS = [['All 20%+ jumps', () => true], ['Under 5 USD', j => j.penny], ['5 USD and over', j => !j.penny], ['Closed near the day\'s high', j => j.loc >= 0.7], ['Faded from the high', j => j.loc < 0.4], ['Volume 5x normal or more', j => j.volMult !== null && j.volMult >= 5]];
const table = GROUPS.map(([name, fn]) => ({ name, fn, h: Object.fromEntries([1, 3, 5].map(h => [h, stat(all.filter(j => fn(j) && j.f && j.f[h] !== undefined).map(j => j.f[h]))])) }));
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
if (env.FINNHUB_KEY) for (const j of today.slice(0, 8)) {
  try { const r = await fetch(FH + '/company-news?symbol=' + j.sym + '&from=' + iso(Date.parse(D[last]) - 2 * 86400000) + '&to=' + iso(Date.now()) + '&token=' + encodeURIComponent(env.FINNHUB_KEY));
    if (r.ok) { const items = await r.json(), roundup = /stocks? (mixed|moving|movers)|gap up and gap down|pre-market session|midday stories|top stories|market (wrap|update)|biggest (gainers|movers)/i;
      const heads = (Array.isArray(items) ? items : []).map(x => String(x.headline || '')).filter(h => h && !roundup.test(h)), own = heads.filter(h => new RegExp('\\b' + j.sym + '\\b').test(h)), tagged = (own.length ? own : heads).find(h => TAGS.some(([, re]) => re.test(h)));
      const pick = tagged || own[0];
      if (pick) { j.head = pick.slice(0, 110); j.tag = (TAGS.find(([, re]) => re.test(pick)) || ['Other company news'])[0]; } else j.tag = Array.isArray(items) && items.length ? 'No company-specific news' : 'No news found'; } } catch (e) {}
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
  'FAST MOVERS REQUIRING INVESTIGATION, today (already moved, kept separate from quality candidates)'];
for (const j of today) msg.push(j.sym + ' ' + pc(j.ret, 0) + ' to ' + j.price.toFixed(2) + (QUALITY.has(j.sym) ? ' [also a quality candidate]' : '') + (wasFlagged(j.sym, last) ? ' [was on the build-up watch on ' + wasFlagged(j.sym, last) + ']' : ' [not seen beforehand]') + ', ' + (j.dv / 1e6).toFixed(0) + 'M USD traded' + (j.volMult ? ', ' + j.volMult.toFixed(0) + 'x normal volume' : '') + (j.tag ? '\n  news: ' + j.tag + (j.head ? ' \u2014 ' + j.head : '') : '') + '\n  ' + expect(j));
if (!today.length) msg.push('No stock rose 20% or more on real volume today.');
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
fs.writeFileSync('data/movers-state.json', JSON.stringify({ session: D[last], sessions: S.length, cases: all.length, caught, reviewable: reviewable.length, study: A[3] ? 'three sessions after the next open they were typically ' + pc(A[3].med) + ', and ' + Math.round(A[3].pos * 100) + '% were higher (' + A[3].n + ' cases).' : '' }));
console.log('movers radar sent:', all.length, 'cases,', today.length, 'movers today,', watch.length, 'build-ups');
