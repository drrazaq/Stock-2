// R1 rev3 cost projection from the public T1 files at b0d76987 (aggregate sizes only; synthetic key). One year = 250 weekday runs.
import fs from 'node:fs'; import zlib from 'node:zlib'; import { execFileSync } from 'node:child_process';
const S = await import(process.cwd() + '/sealed-store.mjs'), K = S.sealedKey('synthetic-cost-secret');
const days = (f) => Math.max(1, new Set(execFileSync('git', ['log', '--format=%cs', '--', f]).toString().trim().split('\n')).size);
const LEDGERS = ['data/opp-ledger.jsonl', 'data/premarket.jsonl', 'data/early-wave-obs.jsonl', 'data/ignition-missed-history.jsonl', 'data/movers-journal.jsonl'];
const STATE = { 'data/ignition-live.json': 1, 'data/movers-state.json': 1, 'data/fastmover-live.json': 1, 'data/options-shadow.json': 1 };   // rewrites per weekday (upper bound)
let S0 = 0, g = 0, gPlain = 0;
for (const f of LEDGERS) { const b = fs.readFileSync(f), sz = S.seal(b, K, f).length, n = days(f); S0 += sz; g += sz / n; gPlain += zlib.deflateSync(b).length / n; }
let st = 0; for (const [f, k] of Object.entries(STATE)) st += k * S.seal(fs.readFileSync(f), K, f).length;
const N = 250, whole = N * (S0 + st) + g * N * (N + 1) / 2, seg = N * (g + 64 * LEDGERS.length + st), today = N * (gPlain + st);
const MB = (x) => (x / 1e6).toFixed(1);
console.log(JSON.stringify({ ledgerSealedNowMB: MB(S0), ledgerGrowthPerDayKB: (g / 1e3).toFixed(1), stateRewritePerDayKB: (st / 1e3).toFixed(1),
  oneYearWholeFileRewriteMB: MB(whole), oneYearSegmentedMB: MB(seg), oneYearPlaintextTodayApproxMB: MB(today) }));
