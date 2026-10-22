// SEQUENCE STUDY: filing -> quiet days -> ignition, tested as ONE rule. Research only; never places an order.
// Question: after a company files news with the SEC (any 8-K / prospectus / FDA event the events engine stores), the stock stays
// quiet for 3+ days, then suddenly breaks out (up 8%+ on 3x its normal volume, closing near the high): is buying the next morning
// better than the SAME quiet-then-breakout pattern WITHOUT a filing? If the filing adds nothing, the "story" is decoration.
//
// FAIR TEST, fixed before seeing any result:
// - PRICES: each company's FULL daily history from Massive (one call per company, no minimum volume), cached in seq-cache/
//   (Actions cache). The big caches drop a stock on its quietest days; quiet days are exactly what this test needs.
//   A missing day stays missing (never treated as zero volume).
// - EVENT DAY: the SEC acceptance time decides. Before 9:30 New York -> that session; otherwise the next session.
// - QUIET: from the day after the event, each day volume under 1.5x the median of the 20 sessions BEFORE the event and a daily
//   move under 5%, for at least 3 days in a row.
// - IGNITION: the first day within 12 sessions of the event, after the quiet run, that closes 8%+ up on 3x+ that median volume,
//   in the top quarter of its range. Known only at the close, so the trade is bought at the NEXT open.
// - CONTROL: exactly the same quiet -> ignition pattern on the same stocks, with NO filing in the 15 sessions before.
// - EXITS: sell at the close 1, 3 or 5 sessions after the buy (3 versions, all counted against luck).
// - COSTS: the fast-mover costs (1.6-0.7% by price + 0.5% for buying into a move) and a 1.5x stress check. 1 USD+ stocks only.
// - PASS: 30+ trades; profitable AND better than the control in BOTH halves of the history; the gap over the control beyond luck
//   (t 2.4+, three versions tried); still positive without its 2 best trades; no stock over 25% of the profit.
//   A pass means PAPER first, never a buy.
import fs from 'node:fs';
import { belowLeague, BELOW } from './league-bar.mjs';   // a passing verdict must also clear the league luck bar (22 Oct 2026)
import zlib from 'node:zlib';
import { secNY } from './sec-time.mjs';   // SEC acceptance times are UTC: converted to the New York clock (fixed 22 Oct 2026)
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const MV = local(env.MASSIVE_BASE) || 'https://api.massive.com', TEST = Boolean(local(env.MASSIVE_BASE)), PAID = Boolean(env.MASSIVE_PAID);
const EVC = env.EV_CACHE || 'ev-cache/events-cache.json.gz', HDIR = env.SEQ_DIR || 'seq-cache', HFILE = HDIR + '/hist.json.gz', OUT = 'data/sequence-study.json';
const MAX_CALLS = +(env.MAX_CALLS || (PAID ? 1500 : 40)), MAXMS = +(env.SEQ_MIN || 40) * 60000, T0 = Date.now();
const sleep = (ms) => new Promise(r => setTimeout(r, TEST ? 0 : ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const costOf = (p) => (p < 5 ? 0.016 : p < 20 ? 0.009 : 0.007) + 0.005;
fs.mkdirSync(HDIR, { recursive: true }); fs.mkdirSync('data', { recursive: true });

let EV; try { EV = JSON.parse(zlib.gunzipSync(fs.readFileSync(EVC)).toString()); } catch (e) { EV = null; }
if (!EV || !EV.syms || !Object.keys(EV.syms).length) { console.log('sequence study: no event history yet (the weekday events job fills it)'); fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status: 'NO EVENTS', verdict: 'NOT RUN YET', why: 'event history not loaded yet' })); process.exit(0); }
let H = { syms: {} }; try { H = JSON.parse(zlib.gunzipSync(fs.readFileSync(HFILE)).toString()); } catch (e) { }
H.syms = H.syms || {};
const saveH = () => fs.writeFileSync(HFILE, zlib.gzipSync(JSON.stringify(H)));

// ---- 1. full daily history per company (incremental: only the days not held yet)
let calls = 0, fetched = 0, refused = false;
async function api(path) {
  for (let a = 0; a < 4; a++) {
    if (calls) await sleep(PAID ? 150 : 12500); calls++;
    let r; try { r = await fetch(MV + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || '')); } catch (e) { await sleep(5000); continue; }
    if (r.status === 429) { await sleep(61000); continue; }
    if (r.status === 401 || r.status === 403) { refused = true; return null; }
    if (!r.ok) { await sleep(3000); continue; }
    return await r.json().catch(() => null);
  }
  return null;
}
const lastWeekday = (() => { let d = new Date(); do { d = new Date(d - 864e5); } while ([0, 6].includes(d.getUTCDay())); return iso(+d); })();
const from5y = iso(Date.now() - 5 * 365 * 864e5);
const want = Object.keys(EV.syms).filter(s => /^[A-Z]{1,5}$/.test(s) && (EV.syms[s].ev || []).length).sort((a, b) => ((H.syms[a] || {}).t || '') < ((H.syms[b] || {}).t || '') ? -1 : 1);
if (env.MASSIVE_KEY) for (const s of want) {
  if (calls >= MAX_CALLS || Date.now() - T0 > MAXMS || refused) break;
  const h = H.syms[s] || (H.syms[s] = { t: null, d: [] }); if (h.t && h.t >= lastWeekday) continue;
  const start = h.t ? iso(Date.parse(h.t) + 864e5) : from5y;
  const j = await api(`/v2/aggs/ticker/${s}/range/1/day/${start}/${lastWeekday}?adjusted=true&sort=asc&limit=5000`); if (!j) continue;
  for (const b of j.results || []) { const d = iso(b.t); if (h.d.length && h.d[h.d.length - 1][0] >= d) continue; h.d.push([d, +(+b.o).toFixed(4), +(+b.h).toFixed(4), +(+b.l).toFixed(4), +(+b.c).toFixed(4), Math.round(b.v || 0)]); }
  h.t = lastWeekday; fetched++; if (fetched % 100 === 0) { saveH(); console.log('sequence study: histories ' + fetched + ' fetched'); }
}
saveH();
const haveHist = want.filter(s => H.syms[s] && H.syms[s].d.length >= 60).length;
console.log('sequence study: ' + want.length + ' companies with filings, ' + haveHist + ' with full history (' + fetched + ' fetched now, ' + calls + ' calls' + (refused ? ', price history refused by the plan' : '') + ')');

// ---- 2. find the patterns
const QUIET_VOL = 1.5, QUIET_MOVE = 0.05, MIN_QUIET = 3, IGN_UP = 0.08, IGN_VOL = 3, IGN_LOC = 0.75, WINDOW = 12, NOEVENT = 15, HOLDS = [1, 3, 5];
const median = (a) => { const s = a.filter(x => x > 0).sort((x, y) => x - y); return s.length >= 10 ? s[Math.floor(s.length / 2)] : null; };
const trades = { SEQ: [], CTRL: [] }; const fams = {};
let evUsed = 0, evNoHist = 0;
const isIgn = (b, k, med) => { const [, , hi, lo, c, v] = b[k], pc0 = b[k - 1][4]; return pc0 > 0 && c / pc0 - 1 >= IGN_UP && v >= IGN_VOL * med && hi > lo && (c - lo) / (hi - lo) >= IGN_LOC; };
const isQuiet = (b, k, med) => b[k][5] < QUIET_VOL * med && b[k - 1][4] > 0 && Math.abs(b[k][4] / b[k - 1][4] - 1) < QUIET_MOVE;
const outcome = (b, k) => { if (k + 1 >= b.length) return null; const e = b[k + 1][1]; if (!(e >= 1)) return null; const r = {}; for (const h of HOLDS) { const x = b[k + h]; if (!x) return null; r[h] = x[4] / e - 1; } return { e, r }; };
for (const s of want) { const h = H.syms[s]; if (!h || h.d.length < 60) { evNoHist += (EV.syms[s].ev || []).length; continue; } const b = h.d, idx = new Map(b.map((x, k) => [x[0], k]));
  // event reaction days (index into this company's bars)
  const evDays = []; for (const e of EV.syms[s].ev || []) { const ny = secNY(e.p); if (!ny) continue; const d = ny.d, hm = ny.hm ? ny.hm.replace(':', '') : '';   // New York clock (EDGAR times are UTC)
    const k = hm && hm < '0930' ? b.findIndex(x => x[0] >= d) : b.findIndex(x => x[0] > d);   // before the open -> that session, else the next
    if (k > 0) evDays.push({ k, f: String(e.f || '') }); }
  const evSet = new Set(evDays.map(e => e.k)); let nextFree = 0;
  // SEQ: event -> quiet -> ignition
  for (const { k: e, f } of evDays) { if (e < 21 || e < nextFree) continue; const med = median(b.slice(e - 20, e).map(x => x[5])); if (!med || med * b[e - 1][4] < 2e5) continue; evUsed++;
    let q = 0; for (let k = e + 1; k <= e + 7 && k < b.length; k++) { if (isQuiet(b, k, med)) q++; else break; }
    if (q < MIN_QUIET) continue;
    for (let k = e + q + 1; k <= e + WINDOW && k < b.length - 1; k++) { if (!isIgn(b, k, med)) continue; const o = outcome(b, k); if (o) { trades.SEQ.push({ s, d: b[k][0], ...o }); for (const ff of f.split(',').filter(Boolean)) (fams[ff] = fams[ff] || []).push(o.r[3] - costOf(o.e)); nextFree = k + 15; } break; } }
  // CTRL: the same quiet -> ignition without any filing in the 15 sessions before
  let free = 0; for (let k = 25; k < b.length - 1; k++) { if (k < free) continue; const med = median(b.slice(k - 25, k - 5).map(x => x[5])); if (!med || med * b[k - 1][4] < 2e5) continue;
    if (!isIgn(b, k, med)) continue; let q = 0; for (let j = k - 1; j >= k - 7 && j > 0; j--) { if (isQuiet(b, j, med)) q++; else break; } if (q < MIN_QUIET) continue;
    let ev = false; for (let j = k - NOEVENT; j <= k; j++) if (evSet.has(j)) { ev = true; break; } if (ev) continue;
    const o = outcome(b, k); if (o) { trades.CTRL.push({ s, d: b[k][0], ...o }); free = k + 15; } } }

// ---- 3. judge
const allD = [...trades.SEQ, ...trades.CTRL].map(t => t.d).sort(), split = allD.length ? allD[Math.floor(allD.length / 2)] : null;
const stat = (a, h, stress) => { if (!a.length) return { n: 0 }; const net = a.map(t => t.r[h] - (stress ? 1.5 : 1) * costOf(t.e)), byD = {}; a.forEach((t, i) => (byD[t.d] = byD[t.d] || []).push(net[i]));
  const v = Object.values(byD).map(mean), m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / Math.max(1, v.length - 1));
  const pos = {}; let P = 0; a.forEach((t, i) => { if (net[i] > 0) { pos[t.s] = (pos[t.s] || 0) + net[i]; P += net[i]; } });
  const srt = [...net].sort((x, y) => y - x);
  return { n: a.length, days: v.length, avg: +mean(net).toFixed(4), dayAvg: +m.toFixed(4), se: v.length > 1 ? +(sd / Math.sqrt(v.length)).toFixed(4) : null, win: +(net.filter(x => x > 0).length / net.length).toFixed(3), noTop2: srt.length > 2 ? +mean(srt.slice(2)).toFixed(4) : null, topShare: P > 0 ? +(Math.max(...Object.values(pos)) / P).toFixed(3) : null }; };
const results = {}; let anyPass = false;
for (const h of HOLDS) { const S = trades.SEQ, C = trades.CTRL, half = (a, newer) => a.filter(t => newer ? t.d >= split : t.d < split);
  const r = { hold: h, seq: stat(S, h), ctrl: stat(C, h), seqStress: stat(S, h, true), older: { seq: stat(half(S, false), h), ctrl: stat(half(C, false), h) }, newer: { seq: stat(half(S, true), h), ctrl: stat(half(C, true), h) } };
  const gap = r.seq.n && r.ctrl.n ? r.seq.dayAvg - r.ctrl.dayAvg : null, se = r.seq.se !== null && r.ctrl.se !== null ? Math.sqrt(r.seq.se ** 2 + r.ctrl.se ** 2) : null; r.gap = gap === null ? null : +gap.toFixed(4); r.t = gap !== null && se ? +(gap / se).toFixed(2) : null;
  const why = []; if (r.seq.n < 30) why.push('too few trades (' + r.seq.n + ')');
  else { for (const [nm, x] of [['older', r.older], ['newer', r.newer]]) { if (!(x.seq.n >= 10 && x.seq.avg > 0)) why.push('not profitable in the ' + nm + ' half (' + pc(x.seq.avg) + ', ' + x.seq.n + ' trades)'); if (!(x.ctrl.n && x.seq.avg > x.ctrl.avg)) why.push('not better than the no-filing control in the ' + nm + ' half'); }
    if (!(r.t >= 2.4)) why.push('gap over the control could be luck (t ' + (r.t === null ? 'n/a' : r.t) + ', 2.4 needed)'); if (!(r.seq.noTop2 > 0)) why.push('loses without its 2 best trades'); if (r.seq.topShare > 0.25) why.push('one stock made over 25% of the profit'); if (!(r.seqStress.avg > 0)) why.push('loses at 1.5x costs'); }
  r.verdict = why.length ? (r.seq.n < 30 ? 'TOO FEW TRADES' : 'NOT PROVEN') : 'PROMISING (paper first)'; r.why = why.join('; '); if (!why.length) { const lw = belowLeague([r.t], 2.4); if (lw) { r.verdict = BELOW; r.why = 'beat the no-filing control; ' + lw; } else anyPass = true; } results['h' + h] = r; }
const byFamily = Object.fromEntries(Object.entries(fams).filter(([, a]) => a.length >= 5).map(([k, a]) => [k, { n: a.length, avg3: +mean(a).toFixed(4) }]));
const best = Object.values(results).sort((a, b) => (b.gap ?? -9) - (a.gap ?? -9))[0];
const text = ['SEQUENCE STUDY (filing -> quiet days -> breakout), ' + iso(Date.now()), '',
  want.length + ' companies with SEC filings; full daily history for ' + haveHist + '. ' + evUsed + ' filings checked; ' + trades.SEQ.length + ' complete sequences; ' + trades.CTRL.length + ' look-alike breakouts with no filing (the control).', '',
  ...Object.values(results).map(r => 'Sold after ' + r.hold + ' session' + (r.hold > 1 ? 's' : '') + ': with filing ' + pc(r.seq.avg) + ' a trade (' + r.seq.n + '), without filing ' + pc(r.ctrl.avg) + ' (' + r.ctrl.n + ') -> ' + r.verdict + (r.why ? ': ' + r.why : '')), '',
  anyPass ? 'A version passed: it goes on paper first, never straight to a buy.' : 'RESULT: ' + (trades.SEQ.length < 30 ? 'not enough complete sequences yet; the histories fill week by week.' : 'the filing does not make the breakout better than the same breakout without news. Nothing to act on.'),
  'All costs included; daily prices only (a same-day version needs minute prices around each filing). Research, not an order.'].join('\n');
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status: 'OK', split, coverage: { companies: want.length, withHistory: haveHist, fetched, calls, refused, filingsChecked: evUsed, filingsNoHistory: evNoHist }, counts: { seq: trades.SEQ.length, ctrl: trades.CTRL.length }, results, byFamily, verdict: anyPass ? 'PROMISING' : trades.SEQ.length < 30 ? 'TOO FEW TRADES' : 'NOT PROVEN', why: best ? best.why : '', text }, null, 1));
console.log(text);
