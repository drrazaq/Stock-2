// R1 cost projection (rev4). NOMINAL, not an enforceable bound: it projects git object bytes added per year from the public T1 files at
// the base, under stated assumptions; GitHub packing, billing, clone time and future data volumes are NOT established by it.
// Run from a checkout of the base (b0d76987) with the R1 sealed-store.mjs present:  node docs/r1-sealed-provider-data/cost-projection.mjs
// Assumptions (override with env): N weekdays/year=250; K_SEG same-day re-saves of a ledger segment (watcher runs/day)=2;
// OWNER_CMDS owner option commands/day=5; analyst archive rewritten once a weekday, growing through its month.
import fs from 'node:fs'; import zlib from 'node:zlib'; import { execFileSync } from 'node:child_process';
const S = await import(process.cwd() + '/sealed-store.mjs'), K = S.sealedKey('synthetic-cost-secret');
const N = +(process.env.N || 250), KSEG = +(process.env.K_SEG || 2), OWN = +(process.env.OWNER_CMDS || 5);
const ls = (re) => execFileSync('git', ['ls-files']).toString().split('\n').filter((f) => re.test(f));
const days = (f) => Math.max(1, new Set(execFileSync('git', ['log', '--format=%cs', '--', f]).toString().trim().split('\n')).size);
const sealedSize = (f) => S.seal(fs.readFileSync(f), K, f).length, gz = (f) => zlib.deflateSync(fs.readFileSync(f)).length;
const LEDGERS = ['data/opp-ledger.jsonl', 'data/premarket.jsonl', 'data/early-wave-obs.jsonl', 'data/ignition-missed-history.jsonl', 'data/movers-journal.jsonl'];
let g = 0, gPlain = 0, S0 = 0; for (const f of LEDGERS) { const n = days(f); g += sealedSize(f) / n; gPlain += gz(f) / n; S0 += sealedSize(f); }
const live = sealedSize('data/ignition-live.json'), movers = sealedSize('data/movers-state.json') + sealedSize('data/fastmover-live.json'), opt = sealedSize('data/options-shadow.json');
const dailyNew = (re) => { const fs_ = ls(re); const ds = new Set(fs_.map((f) => (f.match(/\d{4}-\d{2}-\d{2}/) || [''])[0])); return fs_.reduce((a, f) => a + sealedSize(f), 0) / Math.max(1, ds.size); };
const runsPerDay = dailyNew(/^data\/ignition-runs\//), shadowPerDay = dailyNew(/^data\/shadow\/.*\.jsonl\.gz$/);
const arch = ls(/^data\/analyst-archive-.*\.jsonl\.gz$/).map(sealedSize), archMonthEnd = Math.max(...arch, 1);
const survey = sealedSize('data/options-spread-survey.json') + sealedSize('data/options-spread-survey.md');
const rows = [
  ['append ledgers, daily segments (K_SEG re-saves/day)', N * KSEG * g, 'whole-file rewrite would be ' + MB(N * S0 + g * N * (N + 1) / 2)],
  ['ignition-live, rewritten once per watcher run', N * KSEG * live, ''],
  ['movers-state + fastmover-live, once a weekday', N * movers, 'unchanged content is skipped'],
  ['options record: nightly + OWNER_CMDS owner commands/day', N * (1 + OWN) * opt, 'owner commands are unbounded by schedule'],
  ['per-run archives (new files; same in plaintext today)', N * runsPerDay, 'already gzip: no saving from compression'],
  ['shadow day files (new files; same in plaintext today)', N * shadowPerDay, ''],
  ['analyst archive (monthly gz rewritten each weekday, growing)', 12 * 21 * archMonthEnd / 2, 'quadratic within a month, as today'],
  ['options survey (on dispatch only; per run)', survey, 'x number of dispatches'],
];
function MB(x) { return (x / 1e6).toFixed(1) + ' MB'; }
let total = 0; for (const [name, v, note] of rows) { total += v; console.log(name.padEnd(62), MB(v).padStart(10), note); }
console.log('NOMINAL TOTAL (git object bytes added per year)'.padEnd(62), MB(total).padStart(10));
console.log('plaintext-today comparison for the ledgers only (compressed daily delta):', MB(N * gPlain));
console.log('NOT established: GitHub pack sizes/deltas (ciphertext does not delta), billing, clone time, growth of daily data volumes, retries that add merge commits.');
