// COMEBACK BOARD RUNNER (25 Oct 2026). The rule is comeback-core.mjs (header) = data/strategy-library.json COMEBACK-1, pre-registered
// before any forward result. Reads every lab's frozen verdicts (never written here) and forward paper ledger, plus SPY daily bars
// (Massive; key only from the MASSIVE_KEY secret, never printed; cached in data/comeback-spy.json), and writes data/comeback-board.json,
// data/comeback-lab.json, data/comeback-today.json. Never places an order; no Telegram (scan.mjs shows the board).
// Run: node comeback-lab.mjs   (GitHub Actions: .github/workflows/comeback.yml, weekday evenings after the labs' paper lanes + Sunday)
import fs from 'node:fs';
import { readJsonSource, parseSourceTime, strictNumber, latestCompletedSession, adjustmentBasis } from './source-contract.mjs';
import { withComebackProvenance } from './comeback-provenance.mjs';
import { LABS, verdictFile, paperFile, todayPath, effectiveRuns, scanSets, buildBoard, labFile, todayOut, boardText, preRegister, PAPER_FROM } from './comeback-core.mjs';

const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const JL = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10), log = (...a) => console.log(...a);
const BOARD = 'data/comeback-board.json', LAB = 'data/comeback-lab.json', TODAY = 'data/comeback-today.json', SPYF = 'data/comeback-spy.json', LIB = 'data/strategy-library.json';

// 0. pre-registration in the library (idempotent; before anything is computed)
{ const LB = J(LIB, null); if (preRegister(LB)) { LB.updated = iso(Date.now()); fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: COMEBACK-1 pre-registered now'); } }

// 1. SPY daily bars from the first forward day (open of the buy session, close of the sell session)
const SPY = J(SPYF, { bars: {} }); SPY.bars ||= {}; SPY.conflicts ||= {};
// SPY ingress contract (MARKET-03, 2 Nov 2026): bounded read, Massive envelope checked, bar day from the New York calendar,
// today's unfinished bar excluded, and a cached bar that a later answer revises is KEPT and recorded as a conflict (never
// silently overwritten). Status is explicit so a failed fetch is never presented as fresh bars.
const spyStatus = { status: 'NOT_FETCHED', basis: adjustmentBasis({ provider: 'MASSIVE', adjusted: true }), added: 0, revised: 0, rejectedBars: 0, transport: null };
if (env.MASSIVE_KEY || local(env.MASSIVE_BASE)) {
  const from = '2026-10-01', res = await readJsonSource(fetch, PX + '/v2/aggs/ticker/SPY/range/1/day/' + from + '/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000&apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { timeoutMs: 60000 });
  spyStatus.transport = res.status; const j = res.body, done = latestCompletedSession(Date.now()), at = new Date().toISOString();
  if (res.status !== 'OK') { spyStatus.status = res.status === 'REFUSED' || res.status === 'RATE_LIMITED' ? res.status : 'UNAVAILABLE'; log('SPY: Massive ' + res.status + (res.httpStatus ? ' (HTTP ' + res.httpStatus + ')' : '') + '; the cached bars are used'); }
  else if (!j || typeof j !== 'object' || Array.isArray(j) || j.status === 'ERROR' || j.ticker !== undefined && j.ticker !== 'SPY' || j.results !== undefined && !Array.isArray(j.results)) { spyStatus.status = 'MALFORMED'; log('SPY: malformed Massive answer; the cached bars are used'); }
  else { for (const b of j.results || []) { const t = b && parseSourceTime(b.t, { kind: 'epoch_ms', at: Date.now() }), o = strictNumber(b && b.o, { min: 1e-9 }), c = strictNumber(b && b.c, { min: 1e-9 });
      if (!t || t.status !== 'OK' || o.status !== 'OK' || c.status !== 'OK') { spyStatus.rejectedBars++; continue; }
      const d = t.nyDay; if (!done || d > done) continue;                                         // the session has not closed yet
      const old = SPY.bars[d], bar = { o: o.value, c: c.value };
      if (old && (old.o !== bar.o || old.c !== bar.c)) { SPY.conflicts[d] ||= { firstObservedAt: at, original: old, reported: bar }; spyStatus.revised++; continue; }
      if (!old) { SPY.bars[d] = bar; spyStatus.added++; } }
    spyStatus.status = spyStatus.revised ? 'CONFLICT' : spyStatus.rejectedBars ? 'PARTIAL' : 'OBSERVED';
    log('SPY: ' + spyStatus.added + ' new daily bars from Massive (' + spyStatus.status + (spyStatus.revised ? ', ' + spyStatus.revised + ' revised bars kept as original' : '') + ')'); } }
else log('SPY: no MASSIVE_KEY; the cached bars and the labs\' own SPY figures are used');
const spyOf = (buy, sell) => { const a = SPY.bars[buy], b = SPY.bars[sell]; return a && b && a.o > 0 ? b.c / a.o - 1 : null; };

// 2. every lab: effective frozen runs (read only), forward ledger, today file
const labs = [], todays = {};
for (const lab of LABS) { const V = J(verdictFile(lab), null); if (!V || !V.firstRun) { log(lab + ': no frozen verdicts yet'); continue; }
  const runs = effectiveRuns(V), lines = JL(paperFile(lab)); todays[lab] = J(todayPath(lab), null);
  labs.push({ lab, runs, lines }); log(lab + ': ' + Object.keys(runs).length + ' frozen rules, ' + lines.filter(l => l.type === 'result').length + ' paper results'); }
const LB = J(LIB, { strategies: [] }), names = Object.fromEntries((LB.strategies || []).map(e => [e.id, e.name]));
let scanSrc = ''; try { scanSrc = fs.readFileSync('scan.mjs', 'utf8'); } catch (e) {}
const sets = scanSets(scanSrc); log('scan.mjs sets: ' + sets.duplicate.size + ' near-copies, ' + sets.paused.size + ' paused, ' + sets.basket.size + ' baskets');

// 3. the board, the comeback lab record, today's signals
const board = buildBoard(labs, { sets, names, spyOf }); board.text = boardText(board);
fs.writeFileSync(BOARD, JSON.stringify(board));
fs.writeFileSync(LAB, JSON.stringify(labFile(board), null, 1));
// Today-file provenance (CATALYST-03): see comeback-provenance.mjs.
const todayDoc = withComebackProvenance(todayOut(board, todays), todays, { spyStatus });
fs.writeFileSync(TODAY, JSON.stringify(todayDoc, null, 1));
fs.writeFileSync(SPYF, JSON.stringify({ updated: new Date().toISOString(), from: PAPER_FROM, conflicts: SPY.conflicts, status: spyStatus.status, note: 'SPY daily open / close (Massive, split-adjusted) for the comeback board\'s per-year-of-capital comparison', bars: SPY.bars }));
log(board.text);
