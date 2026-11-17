// SQUAD 30: HUNTER LAB (owner, 17 Nov 2026). Rules and verdict test: hunter-core.mjs (pre-registered there before any number).
// MODES (env MODE):
//   lab    build/refresh the cache (Massive grouped daily bars of every US stock from 2021-06-01, split-adjusted, dead stocks included;
//          Massive reference list of common stocks and ADRs, active and delisted), run every rule on the whole history, the news split,
//          and the information studies (market leaders -> next day; S&P 500 down 2%+ -> where money went); freeze the first verdicts.
//   today  after the close: refresh the cache with the newest session and list the signals for the next open (data/hunt-close.json).
//   pre    before the open: Massive full-market snapshot (15 minutes late on the Starter plan) -> the gappers, with news before the
//          open, labelled with their rule's verdict (data/hunt-pre.json); Telegram HUNT message.
// Never places an order. Halal is decided only by the owner's ZAD marks: every name is listed as CHECK ZAD unless data/halal.json
// has the owner's ok mark. Research only, not advice.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { RULES, sigOf, exitTrade, costOf, tierOf, stats, verdict } from './hunter-core.mjs';
import { nyToMs } from './schedule-guard-core.mjs';
import { nyParts, HOLIDAYS } from './watcher-guard-core.mjs';

const env = process.env, MODE = env.MODE || 'lab', CACHE = env.HUNT_CACHE || 'squad30-cache', OUT = 'data/squad30-lab.json';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const FROM = env.HUNT_FROM || '2021-06-01', SPLIT = '2024-03-01', NEWS_FROM_DAYS = 730, NEWS_CALLS = +(env.NEWS_CALLS || 12000);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const rgz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
const wgz = (f, x) => fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(x)));
fs.mkdirSync(CACHE + '/days', { recursive: true });

let calls = 0, refused = 0;
async function api(path) {
  if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) {
    if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 110); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); }
    catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(30000); continue; }
    if (r.status === 401 || r.status === 403) { refused++; return { refused: r.status }; }
    if (!r.ok) { await sleep(2000); continue; }
    try { return await r.json(); } catch (e) { return null; }
  }
  return null;
}
const iso = (t) => new Date(t).toISOString().slice(0, 10);
function weekdays(from, to) { const o = []; for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 864e5) { const w = new Date(t).getUTCDay(); if (w && w < 6) o.push(iso(t)); } return o; }
// the last session whose daily bars are complete (after 18:00 New York the day's grouped bars are final)
function lastComplete(now = Date.now()) { const n = nyParts(now); let t = n.min >= 1080 ? now : now - 864e5; for (;;) { const p = nyParts(t); const w = new Date(p.d + 'T12:00:00Z').getUTCDay(); if (w && w < 6 && !HOLIDAYS.includes(p.d)) return p.d; t -= 864e5; } }

// ---------- 1. cache: one file per day { s:[sym], o,h,l,c,v } (rows with a price >= 0.05 USD and volume > 0)
async function refreshDays(to) {
  let got = 0, empty = 0;
  for (const d of weekdays(FROM, to)) {
    const f = CACHE + '/days/' + d + '.json.gz'; if (fs.existsSync(f)) continue;
    const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true');
    if (!j || j.refused) { if (j && j.refused) { console.log('Error: Massive refused the grouped bars (HTTP ' + j.refused + ')'); return { got, empty, refused: true }; } continue; }
    const R = Array.isArray(j.results) ? j.results : [];
    if (!R.length) { if (Date.parse(d) < Date.now() - 3 * 864e5) { wgz(f, { holiday: true }); empty++; } continue; }
    const x = { s: [], o: [], h: [], l: [], c: [], v: [] };
    for (const r of R) { if (!(r.c >= 0.05) || !(r.v > 0) || !r.T) continue; x.s.push(r.T); x.o.push(r.o); x.h.push(r.h); x.l.push(r.l); x.c.push(r.c); x.v.push(Math.round(r.v)); }
    wgz(f, x); got++; if (got % 100 === 0) console.log('cache: ' + got + ' new days (' + d + ')');
  }
  return { got, empty };
}
// ---------- 2. which symbols are common stocks / ADRs (warrants, units, rights, ETFs, funds, preferreds excluded)
async function refreshRef() {
  const f = CACHE + '/ref.json', R = readJson(f, null);
  if (R && Date.now() - R.at < 7 * 864e5) return R;
  const common = new Set(), etf = new Set();
  for (const [type, active] of [['CS', true], ['ADRC', true], ['CS', false], ['ADRC', false], ['ETF', true]]) {
    let path = '/v3/reference/tickers?market=stocks&type=' + type + '&active=' + active + '&limit=1000', pages = 0;
    while (path && pages < 80) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) break;
      for (const t of j.results) (type === 'ETF' ? etf : common).add(t.ticker);
      path = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null; }
  }
  const out = { at: Date.now(), common: [...common], etf: [...etf] };
  if (common.size > 3000) fs.writeFileSync(f, JSON.stringify(out)); else if (R) return R;
  return out;
}
// ---------- 3. series per symbol
function loadSeries(keep) {
  const files = fs.readdirSync(CACHE + '/days').filter(f => f.endsWith('.json.gz')).sort(), days = [], S = new Map();
  for (const f of files) {
    const x = rgz(CACHE + '/days/' + f); if (!x || x.holiday || !x.s) continue; const di = days.length; days.push(f.slice(0, 10));
    for (let i = 0; i < x.s.length; i++) { const sym = x.s[i]; if (!keep(sym)) continue; let s = S.get(sym); if (!s) { s = { d: [], o: [], h: [], l: [], c: [], v: [] }; S.set(sym, s); }
      s.d.push(di); s.o.push(x.o[i]); s.h.push(x.h[i]); s.l.push(x.l[i]); s.c.push(x.c[i]); s.v.push(x.v[i]); }
  }
  return { days, S };
}
// ---------- 4. news before the open (Massive news API), cached per symbol-day
const NEWS = readJson(CACHE + '/news.json', {}); let newsCalls = 0, newsRefused = false;
async function hadNews(sym, prevDay, day) {
  const key = sym + '|' + day; if (key in NEWS) return NEWS[key];
  if (newsRefused || newsCalls >= NEWS_CALLS) return undefined;
  const a = new Date(nyToMs(prevDay, 960)).toISOString(), b = new Date(nyToMs(day, 565)).toISOString();
  newsCalls++; const j = await api('/v2/reference/news?ticker=' + encodeURIComponent(sym) + '&published_utc.gte=' + a + '&published_utc.lte=' + b + '&limit=3');
  if (j && j.refused) { newsRefused = true; return undefined; }
  if (!j || !Array.isArray(j.results)) return undefined;
  const v = j.results.length > 0; NEWS[key] = v; return v;
}

function half(trades, days, pred) { return stats(trades.filter(t => pred(days[t.di]))); }
async function runRules(days, S, common) {
  const res = {}, recent = {}, lastDi = days.length - 1, newsFromDi = days.findIndex(d => Date.parse(d) >= Date.now() - NEWS_FROM_DAYS * 864e5);
  const gapEvents = [];
  for (const [id, R] of Object.entries(RULES)) {
    const sig = sigOf(id), trades = [], trades15 = [], byTier = {};
    for (const [sym, s] of S) { if (!common.has(sym)) continue; let lastEntry = -99;
      for (let k = 1; k < s.d.length; k++) { const e = sig(s, k); if (e < 0) continue;
        if (s.d[e] - lastEntry < (R.hold || 1)) continue;   // one open trade per stock per rule
        if (R.news !== undefined) { if (s.d[e] < newsFromDi) continue; gapEvents.push({ id, sym, s, e }); lastEntry = s.d[e]; continue; }
        if (e >= s.d.length) { continue; }
        if (s.d[e] === lastDi || s.d[e] + (R.hold || 1) - 1 > lastDi) { (recent[id] = recent[id] || []).push({ sym, d: days[s.d[e]], px: s.o[e] }); lastEntry = s.d[e]; continue; }
        const x = exitTrade(s, e, R.hold, R.stop); if (!x) continue; lastEntry = s.d[e];
        const c = costOf(x.entry), t = { di: s.d[e], net: x.gross - c, gross: x.gross, px: x.entry, sym };
        trades.push(t); trades15.push({ ...t, net: x.gross - costOf(x.entry, 1.5) }); (byTier[tierOf(x.entry)] = byTier[tierOf(x.entry)] || []).push(t);
      } }
    if (R.news !== undefined) continue;
    res[id] = summarize(id, R, trades, trades15, byTier, days);
  }
  // signals on the LAST close (entry at the next open, which has no bar yet): add a placeholder next bar, ask the rule, remove it
  for (const [sym, s] of S) { if (!common.has(sym) || s.d[s.d.length - 1] !== lastDi) continue; const k = s.d.length - 1, L = s.c[k];
    s.d.push(lastDi + 1); s.o.push(L); s.h.push(L); s.l.push(L); s.c.push(L); s.v.push(s.v[k]);
    for (const [id, R] of Object.entries(RULES)) { if (R.news !== undefined) continue; if (sigOf(id)(s, k) === k + 1) (recent[id] = recent[id] || []).push({ sym, d: days[lastDi], px: L, signal: 'next open' }); }
    for (const a of ['d', 'o', 'h', 'l', 'c', 'v']) s[a].pop(); }
  // news split: one look-up per gap (NEWS-GAP1/2 and NEWS-GAP0 share it)
  const seen = new Map(); let looked = 0;
  for (const g of gapEvents) { const k = g.sym + '|' + g.s.d[g.e]; if (seen.has(k)) continue; const s = g.s, e = g.e; if (e < 1) continue;
    seen.set(k, await hadNews(g.sym, days[s.d[e - 1]] || days[s.d[e] - 1], days[s.d[e]])); looked++; if (looked % 1000 === 0) { console.log('news: ' + looked + ' gaps checked, ' + newsCalls + ' calls'); fs.writeFileSync(CACHE + '/news.json', JSON.stringify(NEWS)); } }
  fs.writeFileSync(CACHE + '/news.json', JSON.stringify(NEWS));
  for (const id of ['NEWS-GAP1', 'NEWS-GAP0', 'NEWS-GAP2']) { const R = RULES[id], trades = [], trades15 = [], byTier = {}; let unknown = 0;
    for (const g of gapEvents.filter(x => x.id === (R.same || id))) { const n = seen.get(g.sym + '|' + g.s.d[g.e]); if (n === undefined) { unknown++; continue; } if (n !== R.news) continue;
      if (g.s.d[g.e] + R.hold - 1 > lastDi) { (recent[id] = recent[id] || []).push({ sym: g.sym, d: days[g.s.d[g.e]], px: g.s.o[g.e] }); continue; }
      const x = exitTrade(g.s, g.e, R.hold, R.stop); if (!x) continue; const t = { di: g.s.d[g.e], net: x.gross - costOf(x.entry), gross: x.gross, px: x.entry, sym: g.sym };
      trades.push(t); trades15.push({ ...t, net: x.gross - costOf(x.entry, 1.5) }); (byTier[tierOf(x.entry)] = byTier[tierOf(x.entry)] || []).push(t); }
    res[id] = { ...summarize(id, R, trades, trades15, byTier, days), newsUnknown: unknown, window: 'last ' + NEWS_FROM_DAYS + ' days (news history)' }; }
  return { res, recent };
}
const fp = (x) => +x.toFixed(x < 1 ? 4 : 2);
const pct = (x) => x === null || x === undefined || !Number.isFinite(x) ? null : +(x * 100).toFixed(2);
function summarize(id, R, trades, trades15, byTier, days) {
  const all = stats(trades), older = half(trades, days, d => d < SPLIT), newer = half(trades, days, d => d >= SPLIT), at15 = stats(trades15), v = verdict(all, older, newer, at15, R);
  const fmt = (x) => x.n ? { n: x.n, days: x.days, avgNet: pct(x.avg), median: pct(x.median), win: pct(x.win), t: +(x.t || 0).toFixed(2), withoutBest2: pct(x.withoutBest2) } : { n: 0 };
  const tiers = {}; for (const [k, a] of Object.entries(byTier)) tiers[k] = fmt(stats(a));
  const best = [...trades].sort((a, b) => b.net - a.net).slice(0, 3).map(t => ({ sym: t.sym, d: days[t.di], net: pct(t.net) }));
  return { id, text: R.text, ...v, all: fmt(all), older: fmt(older), newer: fmt(newer), at15: fmt(at15), tiers, best, perDay: all.days ? +(all.n / all.days).toFixed(1) : 0 };
}
// ---------- 5. information studies (not buy rules)
function infoStudies(days, S, common) {
  const r1 = (s, di) => { const k = s.d.indexOf(di); if (k < 1 || s.d[k - 1] !== di - 1) return null; return s.c[k] / s.c[k - 1] - 1; };
  const idx = (sym) => { const s = S.get(sym); if (!s) return null; const m = new Map(); s.d.forEach((di, k) => m.set(di, k)); return { s, m }; };
  const ret = (I, di, h) => { if (!I) return null; const a = I.m.get(di), b = I.m.get(di + h); if (a === undefined || b === undefined) return null; return I.s.c[b] / I.s.c[a] - 1; };
  const SPY = idx('SPY'); if (!SPY) return { error: 'SPY missing' };
  // leaders = the 10 biggest common stocks by dollar volume over the previous 20 sessions (re-picked every month)
  const out = { leaders: [], riskOff: {} }, n = days.length;
  const lead = { up: [], down: [], all: [] };
  for (let di = 21; di < n - 1; di++) {
    if (di % 21 === 21 % 21 || !lead.pick) { const dv = []; for (const [sym, s] of S) { if (!common.has(sym)) continue; let sum = 0, cnt = 0; for (let k = s.d.length - 1; k >= 0; k--) { if (s.d[k] >= di) continue; if (s.d[k] < di - 20) break; sum += s.c[k] * s.v[k]; cnt++; } if (cnt >= 15) dv.push([sym, sum]); }
      dv.sort((a, b) => b[1] - a[1]); lead.pick = dv.slice(0, 10).map(x => idx(x[0])); }
    const rs = lead.pick.map(I => ret(I, di - 1, 1)).filter(x => x !== null); if (rs.length < 8) continue;
    const avg = rs.reduce((a, b) => a + b, 0) / rs.length, nx = ret(SPY, di, 1); if (nx === null) continue;
    lead.all.push(nx); if (avg >= 0.02) lead.up.push(nx); if (avg <= -0.02) lead.down.push(nx);
  }
  const m = (a) => a.length ? pct(a.reduce((x, y) => x + y, 0) / a.length) : null, pos = (a) => a.length ? pct(a.filter(x => x > 0).length / a.length) : null;
  out.leaders = { text: 'The 10 biggest stocks by money traded rose (fell) 2%+ on average today: what the S&P 500 (SPY) did the NEXT day', allDays: { n: lead.all.length, avg: m(lead.all), up: pos(lead.all) }, afterLeadersUp2: { n: lead.up.length, avg: m(lead.up), up: pos(lead.up) }, afterLeadersDown2: { n: lead.down.length, avg: m(lead.down), up: pos(lead.down) } };
  // risk-off: S&P 500 closed 2%+ down -> the next 1 and 5 sessions of the usual "safety" places vs SPY
  const SAFE = ['GLD', 'IAU', 'SLV', 'XLU', 'XLP', 'XLV', 'USMV', 'SPUS', 'HLAL', 'SPSK', 'UMMA', 'TLT', 'SHY'];
  const downDays = []; for (let di = 1; di < n - 5; di++) { const r = ret(SPY, di - 1, 1); if (r !== null && r <= -0.02) downDays.push(di); }
  out.riskOff.text = 'Days the S&P 500 (SPY) closed 2%+ down: the next 1 and 5 sessions, from that close, of the usual safety places vs SPY itself';
  out.riskOff.days = downDays.length;
  for (const sym of ['SPY', ...SAFE]) { const I = idx(sym); if (!I) continue; const a1 = [], a5 = [], b5 = [];
    for (const di of downDays) { const x = ret(I, di, 1), y = ret(I, di, 5), z = ret(SPY, di, 5); if (x !== null) a1.push(x); if (y !== null && z !== null) { a5.push(y); b5.push(y - z); } }
    out.riskOff[sym] = { n: a5.length, next1: m(a1), next5: m(a5), next5VsSpy: m(b5), beatSpy5: pos(b5) }; }
  return out;
}
async function telegram(text) { if (!env.TG_TOKEN || !env.TG_CHAT) return; await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {}); }
const halal = readJson('data/halal.json', {}) || {};
// the owner's ZAD marks (data/halal.json { SYM: { s: 'ok' | 'fail', d } }): fail = never listed; ok = listed as ZAD ok; none = CHECK ZAD
const zad = (sym) => { const h = halal[sym]; return h && h.s === 'ok' ? 'ZAD ok' : 'CHECK ZAD'; };
const notHalal = (sym) => { const h = halal[sym]; return !!(h && h.s === 'fail'); };
const label = (v) => v === 'TRY SMALL' ? 'TRY SMALL (passed its 5-year test)' : v === 'NOT PROVEN' ? 'WATCH (made money on history but missed a test)' : v === 'REJECTED' ? 'FAILED its 5-year test' : v || 'not tested yet';

// ---------- main
const prev = readJson(OUT, {});
if (MODE === 'lab' || MODE === 'today') {
  const to = lastComplete(); const c = await refreshDays(to); const ref = await refreshRef();
  const common = new Set(ref.common), etf = new Set(ref.etf);
  console.log('cache: ' + c.got + ' new days; ' + common.size + ' common stocks/ADRs, ' + etf.size + ' ETFs in the reference list; ' + calls + ' calls');
  if (common.size < 3000) { console.log('Error: the Massive reference list is incomplete (' + common.size + ' common stocks); no verdicts written'); process.exit(1); }
  const keep = (sym) => common.has(sym) || etf.has(sym) || sym === 'SPY';
  const { days, S } = loadSeries(keep); console.log('series: ' + S.size + ' symbols over ' + days.length + ' sessions (' + days[0] + ' to ' + days[days.length - 1] + ')');
  if (days.length < 500) { console.log('Error: only ' + days.length + ' sessions cached; need 500+'); process.exit(1); }
  const { res, recent } = await runRules(days, S, common);
  const info = MODE === 'lab' ? infoStudies(days, S, common) : prev.info;
  const firstRun = prev.firstRun || {}; for (const [id, r] of Object.entries(res)) if (!firstRun[id]) firstRun[id] = { at: new Date().toISOString(), verdict: r.verdict, why: r.why, all: r.all };
  const lastDay = days[days.length - 1], next = Object.fromEntries(Object.entries(recent).map(([id, a]) => [id, a.filter(x => x.signal === 'next open')]));
  const out = { generatedAt: new Date().toISOString(), preRegistered: '2026-11-17 (hunter-core.mjs)', window: [days[0], lastDay], sessions: days.length, split: SPLIT,
    costs: 'round trip on 1,000 USD: 0.6% fees + spread by entry price (under 0.50: 4%; 0.50-1: 3%; 1-3: 1.5%; 3-10: 0.6%; 10+: 0.3%); 1.5x costs also tested',
    caveat: 'Daily bars: the open and close are the only fill prices (no minute fills); the stop assumes the low came first. News = a Massive news story in the window (not judged good or bad); news history ' + NEWS_FROM_DAYS + ' days. Dead stocks included; reverse splits and data errors (a day over +400% or under -90%) never signal.',
    data: { calls, newsCalls, newsRefused, refused }, firstRun, results: res, info, nextOpen: next, lastDay };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  const lines = Object.values(res).map(r => r.id + ': ' + r.verdict + ' - ' + (r.all.n || 0) + ' trades, ' + (r.all.avgNet ?? '-') + '% a trade after costs (median ' + (r.all.median ?? '-') + '%, t ' + (r.all.t ?? '-') + ')');
  console.log(lines.join('\n'));
  if (MODE === 'today') {
    const msg = ['HUNT LIST FOR THE NEXT OPEN (' + lastDay + ' close; penny stocks included)', ''];
    for (const [id, a] of Object.entries(next)) { if (!a || !a.length || RULES[id].news !== undefined) continue; const r = res[id]; if (!r || r.verdict === 'REJECTED') continue;
      msg.push(id + ' ' + label(r.verdict) + ': ' + (r.all.avgNet ?? '-') + '% a trade after costs over ' + r.all.n + ' past trades');
      for (const x of a.filter(x => !notHalal(x.sym)).slice(0, 8)) msg.push('- ' + x.sym + ' (closed ' + fp(x.px) + ' USD) ' + zad(x.sym)); msg.push(''); }
    const rej = Object.values(res).filter(r => r.verdict === 'REJECTED').map(r => r.id);
    if (msg.length === 2) msg.push('No rule that made money on history has a signal for the next open.');
    if (rej.length) msg.push('Hidden because they lost money on 5 years of history: ' + rej.join(', ') + '.');
    msg.push('Buy only in ZAD, only names ZAD shows as halal, 1,000 USD at most. Research only, not advice.');
    await telegram(msg.join('\n'));
    // WEEKLY WATCHER CHECK (Fridays): did the live watcher run before the open every day this week? (the 16 Nov fix is judged here)
    if (new Date(lastDay + 'T12:00:00Z').getUTCDay() === 5) {
      const W = fs.existsSync('data/watcher-starts.jsonl') ? fs.readFileSync('data/watcher-starts.jsonl', 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
      const week = W.filter(x => x.d > iso(Date.parse(lastDay) - 7 * 864e5) && x.d <= lastDay), onTime = week.filter(x => x.started && x.started <= '09:30');
      const G = readJson('data/schedule-guard.json', {}), beat = G.beat ? Math.round((Date.now() - G.beat) / 60000) : null;
      await telegram(['WEEKLY WATCHER CHECK (week to ' + lastDay + ')', 'Watcher running by 09:30 New York: ' + onTime.length + ' of ' + week.length + ' days' + (week.length ? ' (' + week.map(x => x.d.slice(5) + ' ' + x.started).join(', ') + ')' : ''),
        'Schedule guard heartbeat: ' + (beat === null ? 'none yet' : beat + ' minutes ago'), onTime.length === week.length && week.length ? 'All days watched from the open.' : 'Some opens were missed: send this to Claude.'].join('\n'));
    }
    fs.writeFileSync('data/hunt-close.json', JSON.stringify({ at: new Date().toISOString(), lastDay, next }, null, 1));
  }
} else if (MODE === 'pre') {
  const lab = prev.results || {}, ref = readJson(CACHE + '/ref.json', null), common = ref ? new Set(ref.common) : null;
  const j = await api('/v2/snapshot/locale/us/markets/stocks/tickers');
  if (!j || j.refused || !Array.isArray(j.tickers)) { console.log('Error: Massive snapshot unavailable'); process.exit(1); }
  const g = [];
  for (const x of j.tickers) { const p = (x.lastTrade && x.lastTrade.p) || (x.min && x.min.c) || 0, pc = x.prevDay && x.prevDay.c, pv = x.prevDay && x.prevDay.v; if (!(p > 0 && pc >= 0.2)) continue;
    if (common ? !common.has(x.ticker) : /[.\-]|W$|WS$|U$|R$/.test(x.ticker)) continue; if (pc * (pv || 0) < 3e5 || p / pc >= 5) continue; const gap = p / pc - 1; if (gap >= 0.1 && !notHalal(x.ticker)) g.push({ sym: x.ticker, px: p, prevC: pc, gap }); }
  g.sort((a, b) => b.gap - a.gap); const top = g.slice(0, 15), today = nyParts(Date.now()).d;
  let pd = Date.now() - 864e5; while ([0, 6].includes(new Date(nyParts(pd).d + 'T12:00:00Z').getUTCDay()) || HOLIDAYS.includes(nyParts(pd).d)) pd -= 864e5;
  for (const x of top) { x.news = await hadNews(x.sym, nyParts(pd).d, today); }
  const pick = (x) => x.news ? 'NEWS-GAP1' : x.prevC < 3 && x.gap >= 0.2 ? (x.gap <= 0.6 ? 'PNY-GAP3' : 'PNY-GAP1') : 'NEWS-GAP0';
  const msg = ['HUNT BEFORE THE OPEN (' + today + ', prices about 15 minutes late; penny stocks included)', ''];
  for (const x of top) { const id = pick(x), r = lab[id]; msg.push('- ' + x.sym + ' +' + (x.gap * 100).toFixed(0) + '% at ' + fp(x.px) + ' USD (closed ' + fp(x.prevC) + ')' + (x.news ? ', news before the open' : x.news === false ? ', no news found' : '') + ' -> ' + id + ' ' + label(r && r.verdict) + (r && r.all && r.all.n ? ' (' + r.all.avgNet + '% a trade over ' + r.all.n + ')' : '') + ', ' + zad(x.sym)); }
  if (!top.length) msg.push('No common stock is 10%+ up before the open with 300k USD+ traded yesterday.');
  msg.push('', 'Only lines marked TRY SMALL passed the 5-year test. Buy only in ZAD, only names ZAD shows as halal, 1,000 USD at most. Research only, not advice.');
  fs.writeFileSync('data/hunt-pre.json', JSON.stringify({ at: new Date().toISOString(), top }, null, 1)); fs.writeFileSync(CACHE + '/news.json', JSON.stringify(NEWS));
  await telegram(msg.join('\n')); console.log(msg.join('\n'));
}
