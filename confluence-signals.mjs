// CONFLUENCE LAB, step 1 (GitHub Actions only; once): the FULL 5-year signal lists of the input rules whose lab stored only the newest
// trades (anomaly-lab keeps the last 300 per rule, decoded-lab the last 1500). The labs are NOT edited: each is copied to a temporary
// folder, two lines of the COPY are changed (which rules to recompute; keep every trade instead of the newest N), the copy is run with the
// same data and caches its own workflow uses (restored read only), and the full trade list is read from the copy's output. The recomputed
// lists are checked against the frozen first-run counts per half; data/confluence-signals.json.gz = { rule: [[sym, signal date], ...] }.
// Usage (repo root): node confluence-signals.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
const ROOT = process.cwd(), OUT = 'data/confluence-signals.json.gz', TMP = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'conf-src');
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const JOBS = [
  { lab: 'anomaly-lab.mjs', out: 'data/anomaly-lab.json', rules: ['ANOM-52WH', 'ANOM-RESMOM', 'ANOM-SUESURGE'], env: { ANOM_MINUTES: '150' },
    patch: [['const need = IDS.filter(id => !FROZEN[id]);', "const need = (process.env.CONF_ONLY || '').split(',').filter(Boolean);"],
            ['r.trades.slice(-300)', 'r.trades']] },
  { lab: 'decoded-lab.mjs', out: 'data/decoded-history.json', rules: ['DEC2-TPS', 'DEC2-MINTT'], env: {},
    patch: [['const need = IDS.filter(m => !(HISTF.firstRun || {})[m]),', "const need = (process.env.CONF_ONLY || '').split(',').filter(Boolean),"],
            ['r.trades.slice(-(M2(k) && M2(k).family ? 300 : 1500))', 'r.trades']] },
];
const CACHES = ['study-cache', 'a-cache', 'anomaly-cache', 'ev-cache', 'value-cache'];
const prev = (() => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(OUT)).toString()); } catch (e) { return { signals: {}, check: {} }; } })();
const result = { generatedAt: new Date().toISOString(), note: 'Full 5-year signal lists recomputed from patched temporary copies of the labs (the repository files are unchanged); [sym, signal session date].', signals: { ...prev.signals }, check: { ...prev.check } };
for (const job of JOBS) { const todo = job.rules.filter(r => !result.signals[r] || process.env.CONF_SIGNALS_FORCE); if (!todo.length) { console.log(job.lab + ': lists already stored'); continue; }
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
  for (const f of fs.readdirSync(ROOT)) { if (f === '.git' || f === 'node_modules' || CACHES.includes(f)) continue; fs.cpSync(path.join(ROOT, f), path.join(TMP, f), { recursive: true }); }
  for (const c of CACHES) if (fs.existsSync(path.join(ROOT, c))) fs.symlinkSync(path.join(ROOT, c), path.join(TMP, c));
  let src = fs.readFileSync(path.join(TMP, job.lab), 'utf8');
  for (const [a, b] of job.patch) { const n = src.split(a).length - 1; if (n !== 1) throw new Error(job.lab + ': patch point found ' + n + ' times (expected 1): ' + a); src = src.replace(a, b); }
  fs.writeFileSync(path.join(TMP, job.lab), src);
  console.log('running a patched copy of ' + job.lab + ' for ' + todo.join(', '));
  try { execFileSync('node', [job.lab], { cwd: TMP, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...job.env, CONF_ONLY: todo.join(','), HISTORY: '' }, timeout: 200 * 60e3 }); }
  catch (e) { console.log('Error: the patched ' + job.lab + ' failed: ' + e.message.slice(0, 300)); continue; }
  const o = J(path.join(TMP, job.out), {}), frozen = J(path.join(ROOT, job.out), {}).firstRun || {}, end = (J(path.join(ROOT, job.out), {}).window || [])[1];
  for (const r of todo) { const tr = (o.trades || {})[r]; if (!Array.isArray(tr) || !tr.length) { console.log('Error: no trades for ' + r); continue; }
    const fr = frozen[r] && frozen[r].results, inWin = tr.filter(z => !end || z.sell <= end), cnt = (h) => inWin.filter(z => (z.sig < '2024-01-01') === (h === 'older')).length;
    const chk = { recomputed: { older: cnt('older'), newer: cnt('newer'), all: tr.length }, frozen: fr ? { older: fr.older.n, newer: fr.newer.n } : null, frozenWindowEnd: end || null };
    chk.match = !!fr && ['older', 'newer'].every(h => Math.abs(chk.recomputed[h] - chk.frozen[h]) <= Math.max(2, chk.frozen[h] * 0.01));
    result.check[r] = chk; result.signals[r] = tr.map(z => [z.s, z.sig]); console.log(r + ': ' + tr.length + ' trades; ' + JSON.stringify(chk)); } }
fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify(result)));
console.log('wrote ' + OUT + ': ' + Object.entries(result.signals).map(([k, v]) => k + ' ' + v.length).join(', '));
