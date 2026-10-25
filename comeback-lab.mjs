// COMEBACK BOARD RUNNER (25 Oct 2026). The rule is comeback-core.mjs (header) = data/strategy-library.json COMEBACK-1, pre-registered
// before any forward result. Reads every lab's frozen verdicts (never written here) and forward paper ledger, plus SPY daily bars
// (Massive; key only from the MASSIVE_KEY secret, never printed; cached in data/comeback-spy.json), and writes data/comeback-board.json,
// data/comeback-lab.json, data/comeback-today.json. Never places an order; no Telegram (scan.mjs shows the board).
// Run: node comeback-lab.mjs   (GitHub Actions: .github/workflows/comeback.yml, weekday evenings after the labs' paper lanes + Sunday)
import fs from 'node:fs';
import { LABS, verdictFile, paperFile, todayPath, effectiveRuns, scanSets, buildBoard, labFile, todayOut, boardText, preRegister, PAPER_FROM } from './comeback-core.mjs';

const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const JL = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10), log = (...a) => console.log(...a);
const BOARD = 'data/comeback-board.json', LAB = 'data/comeback-lab.json', TODAY = 'data/comeback-today.json', SPYF = 'data/comeback-spy.json', LIB = 'data/strategy-library.json';

// 0. pre-registration in the library (idempotent; before anything is computed)
{ const LB = J(LIB, null); if (preRegister(LB)) { LB.updated = iso(Date.now()); fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: COMEBACK-1 pre-registered now'); } }

// 1. SPY daily bars from the first forward day (open of the buy session, close of the sell session)
const SPY = J(SPYF, { bars: {} });
if (env.MASSIVE_KEY || local(env.MASSIVE_BASE)) {
  try { const from = '2026-10-01', r = await fetch(PX + '/v2/aggs/ticker/SPY/range/1/day/' + from + '/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000&apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) });
    if (r.ok) { const j = await r.json(); let k = 0; for (const b of j.results || []) { const d = iso(b.t + 12 * 3600e3); if (b.o > 0 && b.c > 0) { SPY.bars[d] = { o: b.o, c: b.c }; k++; } } log('SPY: ' + k + ' daily bars from Massive'); }
    else log('SPY: Massive answered ' + r.status + '; the cached bars are used'); } catch (e) { log('SPY: fetch failed (' + e.message + '); the cached bars are used'); } }
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
fs.writeFileSync(TODAY, JSON.stringify(todayOut(board, todays), null, 1));
fs.writeFileSync(SPYF, JSON.stringify({ updated: new Date().toISOString(), from: PAPER_FROM, note: 'SPY daily open / close (Massive, split-adjusted) for the comeback board\'s per-year-of-capital comparison', bars: SPY.bars }));
log(board.text);
