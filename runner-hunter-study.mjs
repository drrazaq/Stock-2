// Offline RH1 study. No network calls, no orders, no Telegram. Reads the fast-mover daily cache.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { buildRunnerRows, analyseRunnerRows, renderRunnerReport } from './runner-hunter-core.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const cachePath = arg('--cache', 'fm-cache/fm.json.gz');
const outJson = arg('--out-json', 'data/runner-hunter-rh1.json');
const outMd = arg('--out-md', 'data/runner-hunter-rh1.md');
if (!fs.existsSync(cachePath)) {
  console.error(`Runner Hunter: cache not found: ${cachePath}. Build/restore the fast-mover cache first; no network calls were made.`);
  process.exitCode = 2;
} else {
  let store;
  try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(cachePath)).toString('utf8')); }
  catch (e) { console.error(`Runner Hunter: could not decode gzip JSON cache: ${e.message}`); process.exit(2); }
  const rows = buildRunnerRows(store);
  const result = analyseRunnerRows(rows);
  result.cache = { path: cachePath, sessions: Object.keys(store.days || {}).length, symbolsInCache: store.cs?.length ?? null, minPxMetadata: store.minPx ?? null, rows: rows.length };
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(outMd, renderRunnerReport(result) + '\n');
  console.log(`Runner Hunter RH1: ${rows.length} signal rows; wrote ${outJson} and ${outMd}; status=${result.status}`);
  if (rows.length < 1000) console.warn('WARNING: fewer than 1,000 signal rows. Treat any feature rates as exploratory, not decision-grade.');
}
