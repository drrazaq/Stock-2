// MISSED-RUNNER AUTOPSY (library A-MISS1, Agent A - Timing). Research only; never places an order; no Telegram.
// QUESTION: when a stock ran 15%+ and Stock-2 did not trade it, WHY? Four-way diagnosis for every runner: COVERAGE (the system
// never saw it), TIMING (it saw it too late: delayed feed, move before the open, after the 11:00 cut-off), ELIGIBILITY (a block:
// under 1 USD, thin, SEC, halal, lottery, paper gate) or PREDICTION (visible, eligible, and no validated rule fired). Then the
// DECISION TREE written in the library entry BEFORE these numbers existed is applied mechanically:
//   1. late data is 40%+ of the misses            -> FEED_TRIAL: trial a real-time feed for one month, compare live vs delayed fills
//   2. else "rule did not fire" is the biggest    -> NO_NEW_RULE: no new rule; check whether ORB fires on 10%+ of them
//   3. else "blocked" is the biggest              -> KEEP_BLOCKS: keep the blocks; check whether blocked runners faded within 5 days (55%+ = right)
//   4. independently, 20%+ were caught in time    -> SCORE_THEM: score those and size the engine only if positive after costs
// No new buy rule comes out of this study.
// SAMPLES: (a) the live watcher's own ledger (data/ignition-missed-history.jsonl: one line per 15%+ intraday mover per watched day,
// merged from data/ignition-live.json on every run; the daily tallies in data/ignition-days.jsonl cover EVERY mover, the per-stock
// lines the 150 biggest of each day); (b) every stock run of 15%+ in 3 sessions over the last 90 sessions from the daily price cache
// (fm-cache, 0.10 USD+), plus the named runners TGL, NIVF, GRML, TCRT, PFAI; (c) a matched control group: same start day, same price
// band, 20-day traded value within 0.5-2x, no run (within +/-5% over the same 3 sessions, never +10% intraday).
// KNOWABLE BEFORE THE MOVE (runners vs controls): SEC filings in the 10 days before (ev-cache, if present), insider buys in the 30
// days before (study-cache/insider), share-count change over 90 days (data/shares.json.gz), day-before volume vs 20-day average,
// 5-day change, gap at the open of the first run day.
// LATENCY TABLE (Massive minute bars, budget MR_CALLS stock-days, results cached in fm-cache/mr-min.json.gz, resumes across runs):
//   (A) UNBIASED: the watcher's own IG8 alerts (data/ignition-paper.jsonl, every signal, random order), the IG8 exit rule (stop 8%,
//       sell at the close), fill at the next minute's open delayed 0 / 1 / 5 / 15 / 30 minutes, after the ignition costs. This is the
//       table that feeds the A-RT1 break-even (live vs the 15-minute delayed feed, 1,000 USD a trade, observed alerts a month, vs
//       about 99 USD a month for the feed).
//   (B) HINDSIGHT (information only, biased upward because only stocks that DID run are in it): the 15%+ movers from the signal
//       minute (alert minute, else the minute it crossed +10% with a live price, else the minute it was first live at +5%) to the
//       close, same delays, plus the next open.
// Output: data/missed-runners.json (also the line ACTIONS should show, in "actionsLine"; scan.mjs is not edited by this study).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { secNY } from './sec-time.mjs';   // SEC acceptance times are UTC: dated on the New York calendar (fixed 22 Oct 2026)
import { LIVE_RULES, IG_RULES, EXITS, simulate, toBars, costOf } from './ignition-core.mjs';
import { blockedRunnerPolicy } from './blocked-runner-policy.mjs';   // (24 Oct, outside patch) KEEP / REVIEW / UNRESOLVED by a 30-case, 55% rule
const env = process.env, OUT = env.OUT || 'data/missed-runners.json', CDIR = env.FM_CACHE_DIR || 'fm-cache', HIST = 'data/ignition-missed-history.jsonl', DAYS = 'data/ignition-days.jsonl';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TEST = local(env.MASSIVE_BASE), PX = TEST || 'https://api.massive.com';
const sleep = (ms) => new Promise(r => setTimeout(r, TEST ? 0 : ms)), J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const JL = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const minOf = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : null; };
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(CDIR, { recursive: true });

// ---- 1. ledger: merge today's per-stock audit (data/ignition-live.json) into the durable history, one line per mover per day
let hist = JL(HIST); { const live = J('data/ignition-live.json', null), have = new Set(hist.map(x => x.d + '|' + x.sym));
  if (live && live.day && Array.isArray(live.missed)) { const add = live.missed.filter(x => !have.has(live.day + '|' + x.sym)).map(x => ({ d: live.day, mode: live.mode, ...x }));
    if (add.length) { fs.appendFileSync(HIST, add.map(x => JSON.stringify(x) + '\n').join('')); hist = hist.concat(add); console.log('missed-runner ledger: +' + add.length + ' movers from ' + live.day); } } }
if (env.MR_LEDGER_ONLY) process.exit(0);
const dayRows = JL(DAYS), watched = new Set(dayRows.map(x => x.day));
const byKey = new Map(hist.map(x => [x.d + '|' + x.sym, x]));

// ---- 2. codes -> diagnosis and decision-tree groups (fixed before the numbers)
const DIAG = { NOT_VISIBLE_LIVE: 'coverage', NO_LIVE_PRICE_AT_SIGNAL: 'coverage', DAY_NOT_WATCHED: 'coverage', MULTI_DAY_RUN_NO_15PCT_DAY: 'coverage', WATCHED_NOT_IN_TOP150: 'coverage',
  VOLUME_FIGURE_LATE: 'timing', VISIBLE_TOO_LATE: 'timing', GAPPED_AT_OPEN: 'timing', AFTER_11_00: 'timing',
  UNDER_1_USD: 'eligibility', LOW_VOLUME: 'eligibility', NO_VOLUME_HISTORY: 'eligibility', NOT_HALAL: 'eligibility', LOTTERY_AVOID: 'eligibility', SEC_BLOCKED: 'eligibility', SEC_CHECK_UNAVAILABLE: 'eligibility', ALERT_CAP_REACHED: 'eligibility', CAUGHT_PAPER_GATE_NOT_MET: 'eligibility',
  CAUGHT_RULE_NOT_PASSED: 'prediction', NO_RULE_FIT: 'prediction', ALERTED: 'caught' };
const GROUP = { NOT_VISIBLE_LIVE: 'lateData', NO_LIVE_PRICE_AT_SIGNAL: 'lateData', VISIBLE_TOO_LATE: 'lateData', VOLUME_FIGURE_LATE: 'lateData',
  CAUGHT_RULE_NOT_PASSED: 'ruleNotFired', CAUGHT_PAPER_GATE_NOT_MET: 'ruleNotFired', NO_RULE_FIT: 'ruleNotFired', AFTER_11_00: 'ruleNotFired',
  UNDER_1_USD: 'blocked', LOW_VOLUME: 'blocked', NO_VOLUME_HISTORY: 'blocked', NOT_HALAL: 'blocked', LOTTERY_AVOID: 'blocked', SEC_BLOCKED: 'blocked', SEC_CHECK_UNAVAILABLE: 'blocked', ALERT_CAP_REACHED: 'blocked',
  GAPPED_AT_OPEN: 'moveBeforeOpen', ALERTED: 'alerted' };

// ---- 3. the complete ledger (every 15%+ intraday mover on every watched day, from the daily tallies)
const tally = {}; let movers = 0, alerts = 0, feedFix = 0, feedGapLike = 0;
for (const r of dayRows) { movers += r.movers || 0; alerts += r.alerts || 0; feedFix += r.feedFix || 0; feedGapLike += r.feedGapLike || 0; for (const [k, v] of Object.entries(r.tally || {})) tally[k] = (tally[k] || 0) + v; }
const groups = {}; for (const [k, v] of Object.entries(tally)) { const g = GROUP[k] || 'other'; groups[g] = (groups[g] || 0) + v; }
// late data that a real-time feed could really have fixed: the watcher already separates gap-like moves (before the open) from fixable ones
const lateFixable = feedFix, misses = movers - (tally.ALERTED || 0);
const diag = {}; for (const [k, v] of Object.entries(tally)) { const g = DIAG[k] || 'other'; diag[g] = (diag[g] || 0) + v; }
// per-stock rows (the 150 biggest movers a day): caught in time = alerted, or caught by a rule while the price was live
const caughtInTimeRows = hist.filter(x => x.code === 'ALERTED' || (/^caught/.test(x.result || '') && /\(live\)/.test(x.crossed10 || ''))), orbRows = hist.filter(x => /caught by IG[57]\b/.test(x.why || ''));
const rowsPerDay = {}; for (const x of hist) rowsPerDay[x.d] = (rowsPerDay[x.d] || 0) + 1;

// ---- 4. daily price cache: runs of 15%+ in 3 sessions over the last 90 sessions, the named runners, matched controls
let store = null; for (const f of [CDIR + '/fm.json.gz', env.CACHE || 'study-cache/grouped.json.gz']) { try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); console.log('autopsy: daily prices from ' + f); break; } catch (e) {} }
const NAMED = ['TGL', 'NIVF', 'GRML', 'TCRT', 'PFAI'], runners = [], controls = [], named = {};
let D = [], T = 0, bars = new Map(), tOf = new Map();
if (store && store.days) { D = Object.keys(store.days).sort(); T = D.length; D.forEach((d, t) => tOf.set(d, t));
  const from = Math.max(0, T - 90 - 30); for (let t = from; t < T; t++) { const x = store.days[D[t]]; for (let j = 0; j < x.T.length; j++) { let a = bars.get(x.T[j]); if (!a) bars.set(x.T[j], a = []); a.push({ t, o: x.o[j], h: x.h ? x.h[j] : x.c[j], l: x.l ? x.l[j] : x.c[j], c: x.c[j], v: x.v[j] }); } } }
const W0 = Math.max(3, T - 90), cons = (c, i, k) => i - k >= 0 && c[i].t === c[i - k].t + k;
const band = (p) => p < 1 ? '<1' : p < 3 ? '1-3' : p < 10 ? '3-10' : p < 50 ? '10-50' : '50+';
const dv20 = (c, i) => { let s = 0, n = 0; for (let k = i - 20; k < i; k++) if (k >= 0) { s += c[k].c * c[k].v; n++; } return n >= 10 ? s / n : null; };
const feat = (c, i) => { if (i < 21 || !cons(c, i, 6)) return null; let sv = 0; for (let k = i - 21; k < i - 1; k++) sv += c[k].v; const av = sv / 20;
  return { px: c[i - 1].c, band: band(c[i - 1].c), dv20: dv20(c, i), volRatioDayBefore: av > 0 ? c[i - 1].v / av : null, chg5Before: c[i - 1].c / c[i - 6].c - 1, gapAtStart: c[i].o / c[i - 1].c - 1 }; };
const lastOf = (c, i) => c[i].c;
if (T) { const byDay = {};
  for (const [sym, c] of bars) { if (sym === 'SPY') continue; let skip = -1;
    for (let i = 3; i < c.length; i++) { if (c[i].t < W0 || c[i].t <= skip || !cons(c, i, 3)) continue; if (!(c[i].c / c[i - 3].c - 1 >= 0.15)) continue;
      let s = i - 2; for (let j = i - 2; j <= i; j++) if (c[j].c / c[j - 1].c - 1 >= 0.05 || c[j].h / c[j - 1].c - 1 >= 0.10) { s = j; break; }
      const f = feat(c, s); if (!f) continue; let mx = 0; for (let j = s; j <= i; j++) mx = Math.max(mx, c[j].h / c[s - 1].c - 1);
      const fade5 = c[i + 5] && c[i + 5].t === c[i].t + 5 ? c[i + 5].c / c[i].c - 1 : null, dayUp = c[s].h / c[s - 1].c - 1;
      runners.push({ sym, start: D[c[s].t], end: D[c[i].t], gain3: r4(c[i].c / c[i - 3].c - 1), maxUp: r4(mx), startDayHighUp: r4(dayUp), fade5: r4(fade5), ...f, dv20: f.dv20 === null ? null : Math.round(f.dv20) }); skip = c[i].t + 2; (byDay[c[s].t] = byDay[c[s].t] || []).push(runners[runners.length - 1]); } }
  for (const s of NAMED) { const c = bars.get(s); if (!c) { named[s] = { inCache: false, note: 'not in the daily cache (under 0.10 USD, under 300K USD traded, not a common stock, or renamed)' }; continue; }
    let best = null; for (let i = 3; i < c.length; i++) { if (!cons(c, i, 3)) continue; const g = c[i].c / c[i - 3].c - 1; if (!best || g > best.g) best = { g, i }; }
    const r = runners.find(x => x.sym === s); named[s] = { inCache: true, inRunnerSample: !!r, biggest3SessionGain: best ? r4(best.g) : null, on: best ? D[c[best.i].t] : null, lastClose: c[c.length - 1].c, lastDay: D[c[c.length - 1].t] }; }
  // controls: same start day, same price band, traded value 0.5-2x, no run
  const used = new Set();
  for (const [t0, L] of Object.entries(byDay)) { const t = +t0, pool = [];
    for (const [sym, c] of bars) { if (sym === 'SPY') continue; const i = c.findIndex(b => b.t === t); if (i < 21 || i + 2 >= c.length || !cons(c, i + 2, 5)) continue; const g = c[i + 2].c / c[i - 1].c - 1; if (Math.abs(g) > 0.05) continue;
      let mx = 0; for (let j = i; j <= i + 2; j++) mx = Math.max(mx, c[j].h / c[i - 1].c - 1); if (mx >= 0.10) continue; const f = feat(c, i); if (!f || f.dv20 === null) continue; pool.push({ sym, i, f, g }); }
    for (const r of L) { if (r.dv20 === null) continue; const cands = pool.filter(p => p.f.band === r.band && p.f.dv20 >= r.dv20 * 0.5 && p.f.dv20 <= r.dv20 * 2 && !used.has(p.sym + '|' + t)).sort((a, b) => Math.abs(Math.log(a.f.dv20 / r.dv20)) - Math.abs(Math.log(b.f.dv20 / r.dv20)));
      if (!cands.length) continue; const p = cands[0]; used.add(p.sym + '|' + t); controls.push({ sym: p.sym, start: D[t], forRunner: r.sym, gain3: r4(p.g), ...p.f, dv20: Math.round(p.f.dv20) }); } } }
console.log('autopsy: ' + runners.length + ' runs of 15%+ in 3 sessions over the last ' + Math.min(90, T) + ' sessions, ' + controls.length + ' matched controls');

// ---- 5. what was knowable before the move: SEC events, insider buys, share counts (where the caches exist on this runner)
let EV = null; try { EV = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.EV_CACHE || 'ev-cache/events-cache.json.gz')).toString()).syms || null; } catch (e) {}
const INS = (() => { const dir = (env.CACHE_DIR || 'study-cache') + '/insider', m = new Map(); try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) for (const b of JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'))) { let a = m.get(b[0]); if (!a) m.set(b[0], a = []); a.push(b[1]); } } catch (e) { return null; } return m; })();
let SHR = null; try { SHR = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/shares.json.gz')).toString()); } catch (e) {}
const dMinus = (d, n) => new Date(Date.parse(d) - n * 864e5).toISOString().slice(0, 10);
const nyDay = (p) => { const x = secNY(p); return x ? x.d : String(p).slice(0, 10); };
const secBefore = (sym, d) => { if (!EV) return null; const S = EV[sym]; if (!S || !S.ev) return 0; const from = dMinus(d, 10); return S.ev.filter(e => nyDay(e.p) >= from && nyDay(e.p) < d).length; };
const secFams = (sym, d) => { if (!EV) return null; const S = EV[sym]; if (!S || !S.ev) return ''; const from = dMinus(d, 10); return [...new Set(S.ev.filter(e => nyDay(e.p) >= from && nyDay(e.p) < d).flatMap(e => e.f.split(',')))].join(','); };
const insBefore = (sym, d) => { if (!INS) return null; const a = INS.get(sym); if (!a) return 0; const from = dMinus(d, 30); return a.filter(x => x >= from && x < d).length; };
const sharesChg = (sym, d) => { if (!SHR) return null; const a = SHR.c[SHR.t[sym]]; if (!a) return null; const lim = dMinus(d, SHR.lagDays || 30), old = dMinus(d, 90 + (SHR.lagDays || 30)); let now = null, then = null; for (const [e, n] of a) { if (e <= lim) now = n; if (e <= old) then = n; } return now && then ? now / then - 1 : null; };
for (const L of [runners, controls]) for (const r of L) { r.secFilings10d = secBefore(r.sym, r.start); r.secFamilies = secFams(r.sym, r.start); r.insiderBuys30d = insBefore(r.sym, r.start); r.sharesChg90d = r4(sharesChg(r.sym, r.start)); }
const summ = (L) => { const f = (k, fn) => { const v = L.map(x => x[k]).filter(x => typeof x === 'number' && isFinite(x)); return v.length ? { n: v.length, [fn.name]: r4(fn(v)) } : { n: 0 }; }, share = (k, pred) => { const v = L.filter(x => x[k] !== null && x[k] !== undefined); return v.length ? { n: v.length, share: r4(v.filter(pred).length / v.length) } : { n: 0 }; };
  return { n: L.length, anySecFiling10d: share('secFilings10d', x => x.secFilings10d > 0), anyInsiderBuy30d: share('insiderBuys30d', x => x.insiderBuys30d > 0), sharesUp5pctIn90d: share('sharesChg90d', x => x.sharesChg90d > 0.05), volRatioDayBefore: { ...f('volRatioDayBefore', med), over2x: share('volRatioDayBefore', x => x.volRatioDayBefore >= 2).share }, chg5Before: f('chg5Before', med), gapAtStart: { ...f('gapAtStart', med), over10pct: share('gapAtStart', x => x.gapAtStart >= 0.10).share }, priceBands: Object.fromEntries(['<1', '1-3', '3-10', '10-50', '50+'].map(b => [b, L.filter(x => x.band === b).length])) }; };
const knowable = { runners: summ(runners), controls: summ(controls), sources: { secEvents: EV ? 'ev-cache' : 'ev-cache not on this runner', insider: INS ? 'study-cache/insider' : 'not on this runner', shares: SHR ? 'data/shares.json.gz' : 'missing' } };

// ---- 6. join the runners to the watcher's ledger; code and diagnosis for every runner
for (const r of runners) { const days = []; for (let t = tOf.get(r.start); t <= tOf.get(r.end); t++) days.push(D[t]);
  let row = null; for (const d of days) { const x = byKey.get(d + '|' + r.sym); if (x && (!row || x.code === 'ALERTED')) row = x; }
  if (row) { r.code = row.code; r.ledger = { d: row.d, firstSeen: row.firstSeen, firstSeenUp: row.firstSeenUp, firstLive: row.firstLive, firstLiveUp: row.firstLiveUp, crossed10: row.crossed10, result: row.result, openGap: row.openGap === undefined ? null : row.openGap }; }
  else if (!days.some(d => watched.has(d))) r.code = 'DAY_NOT_WATCHED'; else if (r.startDayHighUp !== null && r.startDayHighUp < 0.15 && !days.some(d => { const t = tOf.get(d), c = bars.get(r.sym), i = c.findIndex(b => b.t === t); return i > 0 && c[i].h / c[i - 1].c - 1 >= 0.15; })) r.code = 'MULTI_DAY_RUN_NO_15PCT_DAY'; else r.code = 'WATCHED_NOT_IN_TOP150';
  r.diagnosis = DIAG[r.code] || 'other'; r.group = GROUP[r.code] || (r.code === 'DAY_NOT_WATCHED' || r.code === 'WATCHED_NOT_IN_TOP150' ? 'notObserved' : r.code === 'MULTI_DAY_RUN_NO_15PCT_DAY' ? 'multiDay' : 'other'); }
const count = (L, k) => { const o = {}; for (const x of L) o[x[k]] = (o[x[k]] || 0) + 1; return o; };
// Counterfactual check: only daily-price rows with an actual +5-session close are valid fade outcomes.
// The intraday ledger's afterFirstSeen.last is same-session performance, NOT a 5-session outcome; report it descriptively only.
const blockedRuns = runners.filter(r => r.group === 'blocked' && Number.isFinite(r.fade5)), fadeShare = blockedRuns.length ? r4(blockedRuns.filter(r => r.fade5 < 0).length / blockedRuns.length) : null;
const blockedLedger = hist.filter(x => GROUP[x.code] === 'blocked'), ledgerSameSessionNegative = blockedLedger.length ? r4(blockedLedger.filter(x => x.afterFirstSeen && x.afterFirstSeen.last < 0).length / blockedLedger.length) : null;

// ---- 7. latency tables on minute bars (budget), cached per stock-day with the results only
const MC = CDIR + '/mr-min.json.gz'; let mc = {}; try { mc = JSON.parse(zlib.gunzipSync(fs.readFileSync(MC)).toString()); } catch (e) {}
const BUDGET = +(env.MR_CALLS || 300), MAXMS = +(env.MR_MINUTES || 25) * 60000, t0 = Date.now(), DEL = [0, 1, 5, 15, 30]; let calls = 0, refused = null;
async function minuteBars(sym, d) { if (!env.MASSIVE_KEY) return null; for (let a = 0; a < 3; a++) { if (calls) await sleep(150); calls++;
  let r; try { r = await fetch(PX + `/v2/aggs/ticker/${sym}/range/1/minute/${d}/${d}?adjusted=true&sort=asc&limit=50000&apiKey=` + encodeURIComponent(env.MASSIVE_KEY)); } catch (e) { await sleep(3000); continue; }
  if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401 || r.status === 403) { refused = 'HTTP ' + r.status; return null; } if (!r.ok) { await sleep(3000); continue; } const j = await r.json().catch(() => null); return j ? toBars(j.results, d) : null; } return null; }
const hsh = (q) => { let h = 2166136261; for (let k = 0; k < q.length; k++) { h ^= q.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };
const IG8 = LIVE_RULES.find(r => r.id === 'IG8'), XC = EXITS.find(x => x.id === 'close');
// (A) IG8 alerts: every logged IG8 signal (paper ledger), random order, the real exit, fills delayed
const paper = JL('data/ignition-paper.jsonl').filter(t => t.rule === 'IG8' && t.d < new Date().toISOString().slice(0, 10)), utc = new Date().toISOString().slice(0, 10);
const todoA = paper.filter(t => !mc['A|' + t.d + '|' + t.sym]).sort((a, b) => hsh(a.d + a.sym) - hsh(b.d + b.sym));
const dayOpenNext = (sym, d) => { const c = bars.get(sym), t = tOf.get(d); if (!c || t === undefined) return null; const i = c.findIndex(b => b.t === t + 1); return i >= 0 ? c[i].o : null; };
for (const t of todoA) { if (calls >= Math.floor(BUDGET * 2 / 3) || Date.now() - t0 > MAXMS || refused) break; const b = await minuteBars(t.sym, t.d); if (!b) continue;
  const k0 = b.findIndex(x => x[0] >= t.m && x[0] >= 570), rec = { m: t.m }; if (k0 < 0) { mc['A|' + t.d + '|' + t.sym] = rec; continue; }
  for (const dl of DEL) { const o = simulate(b, t.prevC, { k: k0 + dl }, IG8, XC); rec['d' + dl] = o && isFinite(o.g) && Math.abs(o.g) < 3 ? [+o.e.toPrecision(6), +(o.g - costOf(o.e)).toFixed(4)] : null; }
  mc['A|' + t.d + '|' + t.sym] = rec; }
// (B) the movers: from the signal minute to the close, delays, no stop (hindsight sample)
const sigMin = (x) => x.code === 'ALERTED' ? (paper.find(t => t.d === x.d && t.sym === x.sym) || {}).m || minOf(x.firstLive) : /\(live\)/.test(x.crossed10 || '') ? minOf(x.crossed10) : x.liveAt5pct ? minOf(x.liveAt5pct) : null;
const pri = (x) => x.code === 'ALERTED' ? 0 : /^caught/.test(x.result || '') && /\(live\)/.test(x.crossed10 || '') ? 1 : 2;
const todoB = hist.filter(x => sigMin(x) !== null && x.d < utc && !mc['B|' + x.d + '|' + x.sym]).sort((a, b) => pri(a) - pri(b) || hsh(a.d + a.sym) - hsh(b.d + b.sym));
for (const x of todoB) { if (calls >= BUDGET || Date.now() - t0 > MAXMS || refused) break; const b = await minuteBars(x.sym, x.d); if (!b) continue; const m = sigMin(x), k0 = b.findIndex(z => z[0] >= m && z[0] >= 570), rec = { m, pri: pri(x) };
  const reg = b.filter(z => z[0] >= 570 && z[0] <= 959), last = reg[reg.length - 1]; if (k0 >= 0 && last) { for (const dl of DEL) { const e = b[k0 + 1 + dl]; rec['d' + dl] = e && e[0] <= 959 ? [+e[1].toPrecision(6), +(last[4] / e[1] - 1).toFixed(4)] : null; } const no = dayOpenNext(x.sym, x.d), e0 = b[k0 + 1]; rec.nextOpen = no && e0 ? +(no / e0[1] - 1).toFixed(4) : null; }
  mc['B|' + x.d + '|' + x.sym] = rec; }
fs.writeFileSync(MC, zlib.gzipSync(JSON.stringify(mc)));
const table = (pref, cost) => { const rows = Object.entries(mc).filter(([k]) => k.startsWith(pref)).map(([, v]) => v), out = { n: rows.length, delays: {} };
  for (const dl of DEL) { const v = rows.map(r => r['d' + dl]).filter(Boolean), g = v.map(z => cost ? z[1] - costOf(z[0]) : z[1]); out.delays[dl + 'min'] = { n: g.length, mean: r4(mean(g)), median: r4(med(g)), win: g.length ? r4(g.filter(z => z > 0).length / g.length) : null }; }
  if (pref === 'B|') { const no = rows.map(r => r.nextOpen).filter(z => typeof z === 'number'); out.nextOpen = { n: no.length, mean: r4(mean(no)), median: r4(med(no)) }; }
  return out; };
const latA = table('A|', false), latB = table('B|', true);
// ---- 8. break-even (A-RT1): incremental net profit of live fills over 15-minute delayed fills, 1,000 USD a trade, observed alerts a month
const perMonth = dayRows.length ? alerts / dayRows.length * 21 : null, inc = latA.delays['0min'].n >= 20 && latA.delays['15min'].n >= 20 ? latA.delays['0min'].mean - latA.delays['15min'].mean : null;
// the watcher already fires IG8 with live Alpaca prices; the feed question is about the stocks it cannot see live (NOT_VISIBLE_LIVE / VOLUME_FIGURE_LATE).
// So the alert count that a feed would ADD is the feed-fixable misses a month, valued at the IG8 delayed-vs-live difference (the only live record there is).
const fixPerMonth = dayRows.length ? feedFix / dayRows.length * 21 : null;
const breakEven = { feedUsdPerMonth: 99, tradeUsd: 1000, alertsPerMonthObserved: perMonth === null ? null : +perMonth.toFixed(1), feedFixableMissesPerMonth: fixPerMonth === null ? null : +fixPerMonth.toFixed(1),
  liveMinus15minPerTrade: r4(inc), incrementalUsdPerMonthOnAlerts: inc === null || perMonth === null ? null : +(inc * 1000 * perMonth).toFixed(0),
  note: inc === null ? 'too few IG8 stock-days with minute bars yet (needs 20+ at both delays); the budget grows every run' : 'live minus 15-minute-delayed fill on the IG8 signals, after costs, times 1,000 USD, times the observed alerts a month; the feed-fixable misses are listed separately because nobody knows what a rule would have earned on stocks it never saw live',
  verdict: inc === null ? 'NOT DECIDABLE YET' : inc * 1000 * perMonth > 99 ? 'FEED PAYS ON THE OBSERVED ALERTS' : 'FEED DOES NOT PAY ON THE OBSERVED ALERTS' };
// ---- 9. catchable with live prices: in-session moves of 1 USD+ stocks that were (or could have been) seen live before +10%
const over1 = hist.filter(x => x.code !== 'UNDER_1_USD'), inSession = over1.filter(x => !(x.openGap >= 0.10) && !(/^0?9:[34]/.test(String(x.firstSeen)) && x.firstSeenUp >= 0.10)), seenLiveEarly = inSession.filter(x => (x.firstLiveUp !== null && x.firstLiveUp !== undefined && x.firstLiveUp < 0.10) || /\(live\)/.test(x.crossed10 || ''));
const catchable = { perStockRows: hist.length, over1usd: over1.length, inSessionMove: inSession.length, seenLiveBeforePlus10: seenLiveEarly.length, feedFixableNotSeen: feedFix, shareSeenLiveEarly: hist.length ? r4(seenLiveEarly.length / hist.length) : null,
  shareCatchableWithLivePrices: movers ? r4(Math.min(1, (seenLiveEarly.length / Math.max(1, hist.length)) + feedFix / movers)) : null, note: 'catchable = seen live before +10% (per-stock rows, top 150 a day) plus the feed-fixable data misses (all movers); gap-ups and sub-1-USD stocks are not catchable by any feed' };
// ---- 10. the decision tree, mechanically
const share = (k) => misses ? (groups[k] || 0) / misses : 0, lateShare = misses ? lateFixable / misses : 0, lateAllShare = share('lateData');
const big = ['lateData', 'ruleNotFired', 'blocked'].map(k => [k, k === 'lateData' ? lateFixable : groups[k] || 0]).sort((a, b) => b[1] - a[1])[0];
const caughtShare = hist.length ? caughtInTimeRows.length / hist.length : 0, orbShare = hist.length ? orbRows.length / hist.length : 0;
let branch, why; if (!misses) { branch = 'NO DATA'; why = 'no watched days'; }
else if (lateShare >= 0.40) { branch = 'FEED_TRIAL'; why = 'feed-fixable late data = ' + lateFixable + ' of ' + misses + ' misses (' + pc(lateShare) + ', 40% needed)'; }
else if (big[0] === 'ruleNotFired') { branch = 'NO_NEW_RULE'; why = 'rule did not fire (or fired without a validated record) is the biggest cause: ' + big[1] + ' of ' + misses + ' (' + pc(big[1] / misses) + '); late data ' + pc(lateShare) + ' (' + pc(lateAllShare) + ' counting gap-like), blocked ' + pc(share('blocked')) + '. ORB (IG5/IG7) fired on ' + pc(orbShare) + ' of the audited movers (10% asked)'; }
else if (big[0] === 'blocked') { const policy = blockedRunnerPolicy({ blockedIsLargest: true, sampleN: blockedRuns.length, fadeShare }); branch = policy.branch; why = 'blocked is the biggest cause: ' + big[1] + ' of ' + misses + ' (' + pc(big[1] / misses) + '); ' + policy.reason; }
else { branch = 'FEED_TRIAL'; why = 'late data is the biggest cause (' + pc(lateShare) + ') though under 40%'; }
const decision = { branch, why, caughtInTime: { rows: caughtInTimeRows.length, share: r4(caughtShare), branch4: caughtShare >= 0.20 ? 'SCORE_THEM: 20%+ caught in time; size the engine only if its paper record is positive after costs' : 'under 20% caught in time: no sizing' },
  groupsOfMisses: { lateDataFeedFixable: lateFixable, lateDataAll: groups.lateData || 0, ruleNotFired: groups.ruleNotFired || 0, blocked: groups.blocked || 0, moveBeforeOpen: (groups.moveBeforeOpen || 0) + feedGapLike, misses, movers, alerted: tally.ALERTED || 0 },
  orbFiredShare: r4(orbShare), blockedFade5: { dailySample: fadeShare, n: blockedRuns.length, minimumN: 30, fadeBar: 0.55, ledgerSameSessionNegative, nLedger: blockedLedger.length, note: 'Only dailySample is a 5-session outcome. ledgerSameSessionNegative is same-session and must not be interpreted as a 5-session fade.' } };
const ig8 = ((J('data/ignition-results.json', {}) || {}).record || {})['IG8/close'] || null;
const actionsLine = 'Missed runners (' + dayRows.length + ' watched days, ' + movers + ' movers of 15%+): ' + Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + v).join(', ') + '. Decision: ' + branch + '.';
const asOfDay = dayRows.length ? dayRows.map(x => x.day).sort().slice(-1)[0] : null;   // (outside review, 23 Oct) readers compare this with the newest watcher day; older = stale
const out = { generatedAt: new Date().toISOString(), asOfDay, staleRule: 'stale if data/ignition-days.jsonl has a later day than asOfDay; re-run before using the decision', agent: 'A', library: 'A-MISS1', preRegistered: '2026-10-21 (decision tree written before the numbers)', window: { watchedDays: dayRows.length, days: dayRows.map(x => x.day), dailyCache: T ? D[W0] + ' to ' + D[T - 1] : 'none' },
  ledger: { movers, alerted: tally.ALERTED || 0, misses, tally, feedFix, feedGapLike, perStockRows: hist.length, rowsPerDay, note: 'tallies cover every 15%+ intraday mover; per-stock rows the 150 biggest a day' },
  diagnosis: { allMovers: diag, runnerSample: count(runners, 'diagnosis') }, groups, runners: { n: runners.length, codes: count(runners, 'code'), groups: count(runners, 'group'), named, list: runners.slice(0, 400) }, controls: { n: controls.length, list: controls.slice(0, 400) }, knowable,
  latency: { ig8Unbiased: { ...latA, note: 'IG8 signals from the paper ledger, every signal, stop 8% then the close, fills delayed by minutes, after costs' }, moversHindsight: { ...latB, note: 'ONLY stocks that ran 15%+ (hindsight): from the signal minute to the close, no stop, after costs; not a forecast' }, calls, refused, budget: BUDGET, cached: Object.keys(mc).length },
  breakEven, catchable, decision, ig8PaperRecord: ig8, actionsLine, noNewBuyRule: true };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('MISSED-RUNNER AUTOPSY: ' + movers + ' movers on ' + dayRows.length + ' watched days; tally ' + JSON.stringify(tally));
console.log('groups of misses: ' + JSON.stringify(decision.groupsOfMisses) + ' | diagnosis ' + JSON.stringify(diag));
console.log('decision tree -> ' + branch + ': ' + why + ' | caught in time ' + pc(caughtShare) + ' -> ' + decision.caughtInTime.branch4);
console.log('latency IG8 (' + latA.n + ' stock-days): ' + DEL.map(d => d + 'min ' + pc(latA.delays[d + 'min'].mean)).join(', ') + ' | movers hindsight (' + latB.n + '): ' + DEL.map(d => d + 'min ' + pc(latB.delays[d + 'min'].mean)).join(', '));
console.log('break-even: ' + JSON.stringify(breakEven) + (refused ? ' | minute bars refused: ' + refused : ''));
