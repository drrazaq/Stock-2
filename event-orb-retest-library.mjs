// Writes the EVENT_ORB_RETEST_15D_V1 verdict into the A-EVR1 entry of data/strategy-library.json (research bookkeeping only).
// Reads data/event-orb-retest-15d-gates.json; every other library entry is left byte-for-byte as it was.
import fs from 'node:fs';
const LIB = 'data/strategy-library.json', GATES = process.env.EVENT_ORB_GATES || 'data/event-orb-retest-15d-gates.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const lib = J(LIB, null), g = J(GATES, null);
if (!lib || !Array.isArray(lib.strategies)) { console.log('evr-library: no library'); process.exit(0); }
const e = lib.strategies.find(x => x && x.id === 'A-EVR1');
if (!e) { console.log('evr-library: no A-EVR1 entry'); process.exit(0); }
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
if (!g) e.status = 'needs data: no gates output yet';
else if (g.status === 'needs data') e.status = 'needs data: ' + g.why;
else e.status = 'tested: ' + (g.status === 'PASS' ? 'PASS (research only; next step would be a prospective paper period)' : 'REJECTED');
const w = g && g.results && g.results.midpoint && g.results.midpoint.whole, s = g && g.results && g.results.worst && g.results.worst.whole;
if (w && w.n) {
  e.result = { asOf: g.asOf, n: w.n, netPct: pc(w.meanNet), netPctStress: s ? pc(s.meanNet) : 'n/a', winPct: pc(w.winRate), distinctDays: w.distinctDays, distinctStocks: w.distinctStocks, t: w.dayT, bar: g.bar, without2Best: pc(w.without2Best), medianDay: pc(w.medianDay), worstDay: pc(w.worstDay), vsSpySameMinutes: pc(w.vsSpySameMinutes && w.vsSpySameMinutes.meanExcess), vsSameStockNonEventDays: pc(w.vsSameStockControl && w.vsSameStockControl.meanExcess), older: g.results.midpoint.older && { n: g.results.midpoint.older.n, netPct: pc(g.results.midpoint.older.meanNet), t: g.results.midpoint.older.dayT }, newer: g.results.midpoint.newer && { n: g.results.midpoint.newer.n, netPct: pc(g.results.midpoint.newer.meanNet), t: g.results.midpoint.newer.dayT }, why: g.why, files: ['data/event-orb-retest-15d-gates.json', 'data/event-orb-retest-15d-study.json'] };
} else if (g) e.result = { asOf: g.asOf || null, n: 0, why: g.why, files: ['data/event-orb-retest-15d-gates.json'] };
fs.writeFileSync(LIB, JSON.stringify(lib, null, 1));
console.log('evr-library: A-EVR1 -> ' + e.status);
