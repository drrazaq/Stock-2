// AGENT LEAGUE REFEREE. Three research agents (data/agents.json) compete to find strategies that really work. This file is the
// referee: the agents must NOT edit it. It runs at the end of every study run (it needs the whole-market price cache) and:
//   1. FREEZES each agent's champion picks once a week into data/agent-shelf.jsonl (append-only): the stocks its champion strategy
//      picks today, ZAD not-halal removed, at most 10.
//   2. SCORES every frozen batch after 21 and 63 sessions: bought at the FIRST OPEN AFTER THE MOMENT OF THE FREEZE (row field
//      frozenAt, a UTC timestamp; New York clock: frozen before 09:30 on a trading day -> that day's open, otherwise the next
//      session's open), never at an open that had already happened. 0.8% costs, against the S&P 500
//      and the average stock over the SAME days. These prices did not exist when the picks were made, so no agent can fit them.
//   3. COUNTS strategies an agent got through the full test bench, but only if its t also clears the LEAGUE luck bar, which counts the
//      rules tried by ALL agents together (three agents searching = three times the chances of a lucky fluke).
// Points: +10 per strategy that passes the bench and the league luck bar; +25 per strategy WORKING in the live paper record
// (30+ trades over 10+ distinct days, positive); per scored batch +1 / -1 (1 month) and +2 / -2 (3 months) for beating / not
// beating the S&P 500 after costs. Ideas tested earn nothing: only results count. Writes data/agent-league.json. No Telegram.
import fs from 'node:fs'; import zlib from 'node:zlib';
const env = process.env, J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const AG = J('data/agents.json', { agents: [] }), LIB = J('data/strategy-library.json', { strategies: [] }), SHELF = env.SHELF || 'data/agent-shelf.jsonl', OUT = env.OUT || 'data/agent-league.json';
const COST = 0.008, HS = [21, 63], r4 = (x) => x === null || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4;
const halal = J('data/halal.json', {}), zadNot = new Set((J('data/zad-list.json', {}) || {}).notHalal || []), notHalal = (s) => (halal[s] && halal[s].s === 'fail') || zadNot.has(s);
// ---- league luck bar: every rule tried by anyone (autolab's ledger + the versions each study reports)
const erfc = (x) => { const z = Math.abs(x), t = 1 / (1 + z / 2), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; };
const zInv = (p) => { let lo = 0, hi = 10; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (0.5 * erfc(m / Math.SQRT2) > p) lo = m; else hi = m; } return (lo + hi) / 2; };
let trials = Object.keys((J('data/autolab.json', {}) || {}).tried || {}).length;
for (const f of fs.readdirSync('data').filter(f => f.endsWith('.json') && f !== 'autolab.json')) { const v = (J('data/' + f, {}) || {}).versions; if (typeof v === 'number' && v > 0 && v < 1000) trials += v; }
trials += (LIB.strategies || []).filter(e => e.agent && /^tested/i.test(e.status || '')).length;
const BAR = Math.max(2.5, zInv(0.05 / Math.max(1, trials)));
// ---- prices
let store = null; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { }
const D = store ? Object.keys(store.days || {}).sort() : [], T = D.length, dayMap = new Map();
const dm = (t) => { if (!dayMap.has(t)) { const x = store.days[D[t]], m = new Map(); x.T.forEach((s, j) => m.set(s, j)); dayMap.set(t, m); } return dayMap.get(t); };
const px = (t, s, f) => { const j = dm(t).get(s); return j === undefined ? null : store.days[D[t]][f][j]; };
// ei = index of the ENTRY session (bought at its open); held h sessions, sold at the close of session ei + h - 1.
function hold(s, ei, h) { const e = px(ei, s, 'o'); if (!(e > 0)) return null; let last = null; for (let k = ei; k <= ei + h - 1; k++) { const c = px(k, s, 'c'); if (c > 0) last = c; } return last ? last / e - 1 : null; }   // gone before the end: last price it traded
const avgCache = {};
function avgStock(ei, h) { const key = ei + ':' + h; if (key in avgCache) return avgCache[key]; const x = store.days[D[ei]], end = dm(ei + h - 1); let s = 0, n = 0;
  for (let j = 0; j < x.T.length; j++) { const o = x.o[j]; if (!(o >= 3 && o * x.v[j] >= 1e6) || x.T[j] === 'SPY') continue; const k = end.get(x.T[j]); if (k === undefined) continue; const r = store.days[D[ei + h - 1]].c[k] / o - 1; if (isFinite(r)) { s += Math.max(-1, Math.min(5, r)); n++; } }
  return (avgCache[key] = n ? s / n : null); }
// ---- New York clock for a UTC timestamp, and the entry session for a freeze moment
const NYF = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const nyOf = (iso) => { const p = Object.fromEntries(NYF.formatToParts(new Date(iso)).map(x => [x.type, x.value])); return { d: p.year + '-' + p.month + '-' + p.day, hm: p.hour + ':' + p.minute }; };
function entryIdx(frozenAt) { if (!frozenAt || !isFinite(Date.parse(frozenAt))) return -1; const ny = nyOf(frozenAt);   // first open strictly after the freeze
  for (let i = 0; i < T; i++) if (D[i] > ny.d || (D[i] === ny.d && ny.hm < '09:30')) return i; return -1; }   // -1: that session is not in the cache yet
// ---- 1. freeze this week's champion picks
// The shelf is append-only. A row {"correction": true, agent, strategy, date, frozenAt, why} never replaces a pick row: it adds the
// true freeze moment for a batch written before frozenAt existed (the 2026-10-16 batches were committed 2026-10-19 22:07:59 UTC,
// commit 5fc4b91), and scoring uses it.
const shelfAll = fs.existsSync(SHELF) ? fs.readFileSync(SHELF, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
const corrections = new Map(); for (const z of shelfAll) if (z.correction && z.frozenAt) corrections.set(z.agent + '|' + z.date + '|' + z.strategy, z.frozenAt);
const shelf = shelfAll.filter(z => !z.correction);
const frozenAtOf = (z) => corrections.get(z.agent + '|' + z.date + '|' + z.strategy) || z.frozenAt || null;   // no frozenAt and no correction: not scored
const asOf = T ? D[T - 1] : null, added = [];
function champPicks(c) { const src = J(c.file, null); let arr = src; for (const k of String(c.key || '').split('.').filter(Boolean)) arr = arr && arr[k]; if (!Array.isArray(arr)) return null;
  const cut = c.fresh && asOf ? new Date(Date.parse(asOf) - c.fresh * 864e5).toISOString().slice(0, 10) : null, out = [];
  for (const x of arr) { const s = typeof x === 'string' ? x : x && x.sym; if (!s || !/^[A-Z.]{1,6}$/.test(s) || notHalal(s) || out.includes(s)) continue;
    if (c.min && typeof x === 'object' && Object.entries(c.min).some(([k, v]) => !(x[k] >= v))) continue; if (cut && typeof x === 'object' && !(String(x[c.dateField || 'd'] || '') >= cut)) continue;
    out.push(s); if (out.length >= 10) break; }
  return out; }
if (asOf) for (const a of AG.agents || []) { const c = a.champion; if (!c || !c.file) continue;
  const prev = shelf.filter(z => z.agent === a.id).map(z => z.date).sort().pop(); if (prev && D.indexOf(prev) >= 0 && T - 1 - D.indexOf(prev) < 5) continue;   // once a week
  const syms = champPicks(c); if (!syms || !syms.length) { added.push({ agent: a.id, strategy: c.strategy, date: asOf, syms: [], note: 'champion picked nothing' }); continue; }
  // date = last day in the price cache (data as of); frozenAt = the real moment of the freeze, which decides the entry open
  const row = { agent: a.id, strategy: c.strategy, label: c.label, date: asOf, frozenAt: new Date().toISOString(), syms }; shelf.push(row); added.push(row); fs.appendFileSync(SHELF, JSON.stringify(row) + '\n'); }
// ---- 2. score every frozen batch whose holding period has ended
const prevOut = J(OUT, {}), scored = {}; for (const b of prevOut.batches || []) scored[b.agent + '|' + b.date + '|' + b.strategy] = b;
const batches = [];
for (const z of shelf) { const id = z.agent + '|' + z.date + '|' + z.strategy, fa = frozenAtOf(z), ei = T ? entryIdx(fa) : -1, entry = ei >= 0 ? D[ei] : null;
  let b = scored[id]; if (!b || (b.entry || null) !== entry) b = { agent: z.agent, strategy: z.strategy, date: z.date, frozenAt: fa, entry, n: z.syms.length, res: {} };   // a result scored from another entry day is dropped
  delete b.note; if (!fa) b.note = 'no freeze time recorded: not scored'; else if (ei < 0) b.note = 'entry session (first open after ' + fa + ') not in the price cache yet';
  if (ei >= 0) for (const h of HS) { if (b.res[h] || ei + h - 1 >= T || !z.syms.length) continue; const rs = z.syms.map(s => hold(s, ei, h)).filter(r => r !== null); if (!rs.length) continue;
    const pick = rs.reduce((p, q) => p + q, 0) / rs.length - COST, spy = hold('SPY', ei, h), avg = avgStock(ei, h);
    b.res[h] = { pick: r4(pick), spy: r4(spy), avg: r4(avg), vsSpy: r4(spy === null ? null : pick - spy), vsAvg: r4(avg === null ? null : pick - avg), n: rs.length, entry, until: D[ei + h - 1] }; }
  batches.push(b); }
// ---- 3. the table
const rows = (AG.agents || []).map(a => { const mine = (LIB.strategies || []).filter(e => e.agent === a.id), B = batches.filter(b => b.agent === a.id);
  const passed = mine.filter(e => /^(tested: (passed|in use)|proven)/i.test(e.status || '')), clears = passed.filter(e => e.result && e.result.t >= BAR), working = mine.filter(e => /live paper: working/i.test(e.status || ''));
  let fwd = 0; const ex = { 21: [], 63: [] }; for (const b of B) for (const h of HS) { const r = b.res[h]; if (!r || r.vsSpy === null) continue; ex[h].push(r.vsSpy); fwd += (r.vsSpy > 0 ? 1 : -1) * (h === 63 ? 2 : 1); }
  const mean = (v) => v.length ? r4(v.reduce((p, q) => p + q, 0) / v.length) : null;
  return { id: a.id, name: a.name, champion: a.champion ? a.champion.strategy + ' ' + (a.champion.label || '') : 'none', ideasTested: mine.filter(e => /^(tested|FAILED)/i.test(e.status || '')).length,
    passedBench: passed.length, clearsLeagueBar: clears.length, working: working.length, batchesFrozen: B.length,
    scored1m: ex[21].length, vsSpy1m: mean(ex[21]), beat1m: ex[21].filter(x => x > 0).length, scored3m: ex[63].length, vsSpy3m: mean(ex[63]), beat3m: ex[63].filter(x => x > 0).length,
    points: clears.length * 10 + working.length * 25 + fwd }; }).sort((p, q) => q.points - p.points || (q.vsSpy1m || -9) - (p.vsSpy1m || -9));
const pc = (x) => x === null || x === undefined ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const text = ['AGENT LEAGUE (since ' + (AG.started || '?') + '; luck bar for everyone t ' + BAR.toFixed(1) + ' after ' + trials + ' rules tried in total)', '',
  ...rows.map((r, k) => (k + 1) + '. ' + r.name + ': ' + r.points + ' points. Champion ' + r.champion + '. Proven ' + r.clearsLeagueBar + (r.passedBench > r.clearsLeagueBar ? ' (+' + (r.passedBench - r.clearsLeagueBar) + ' under the league luck bar)' : '') + ', working live ' + r.working + '. Forward picks: ' +
    (r.scored1m ? r.beat1m + ' of ' + r.scored1m + ' months beat the S&P 500 (average ' + pc(r.vsSpy1m) + ')' : r.batchesFrozen + ' weekly batches frozen, first score after 1 month') + (r.scored3m ? '; 3 months: ' + r.beat3m + ' of ' + r.scored3m + ' (' + pc(r.vsSpy3m) + ')' : '') + '. Ideas tested ' + r.ideasTested + '.'), '',
  'Only results count: a strategy that passes every test, picks that beat the S&P 500 on days nobody had seen, and live paper records. Nothing reaches your money without the live paper record.'].join('\n');
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), asOf, bar: +BAR.toFixed(2), trials, priced: !!T, added, rows, batches, text }, null, 1));
console.log(text); if (!T) console.log('league: no price cache here; picks not frozen or scored this time.');
