// Independent harness for the passive contract observer (reviewer: Claude). Runs the ACTUAL ignition-watch.mjs of a given tree against
// synthetic local Massive + Alpaca services (external fetch refused, fixed clock), in one of these modes:
//   off           CONTRACT_OBSERVER unset
//   on            CONTRACT_OBSERVER=research
//   on-file       research, but <runId>.contracts already exists as a FILE (mkdir fails)
//   on-quar       research, contracts dir pre-marked QUARANTINED
//   on-conflict   research, a different valid-looking beat file already exists for the first minute
//   on-symlink    research, contracts path is a symlink
//   on-readonly   research, contracts dir exists but is read-only
// Prints one JSON line: provider request list, normalized persisted-data digest (observer dir excluded), observer files and health.
// Usage: node observer-harness.mjs <tree> <mode> [scenario: sip-ok|race]
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http'; import zlib from 'node:zlib'; import { spawn, execFileSync } from 'node:child_process'; import { createHash } from 'node:crypto';
const [rootSrc, mode, scenario = 'sip-ok'] = process.argv.slice(2);
const day = '2026-10-30', epoch = Date.parse(day + 'T13:40:00Z'), late = epoch - 20 * 60000, L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'observer-h-'));
for (const f of fs.readdirSync(rootSrc).filter(p => p.endsWith('.mjs'))) fs.copyFileSync(path.join(rootSrc, f), path.join(dir, f));
fs.mkdirSync(path.join(dir, 'data'));
execFileSync('git', ['init', '-q'], { cwd: dir }); execFileSync('git', ['-c', 'user.name=r', '-c', 'user.email=r@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'fixture', '--date', '2026-10-30T00:00:00Z'], { cwd: dir, env: { ...process.env, GIT_COMMITTER_DATE: '2026-10-30T00:00:00Z' } });
const SYMS = scenario === 'race' ? Array.from({ length: 250 }, (_, i) => 'Z' + L[Math.floor(i / 26) % 26] + L[i % 26]) : ['ZZQ', 'ZZR'];
const calls = [];
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://l'), feed = u.searchParams.get('feed'); calls.push(u.pathname + (feed ? '?feed=' + feed : '')); res.setHeader('Content-Type', 'application/json');
  if (u.pathname.includes('/v2/snapshot/locale')) return res.end(JSON.stringify({ tickers: SYMS.map(s => ({ ticker: s, lastTrade: { p: 10, t: late * 1e6 }, lastQuote: { p: 9.98, P: 10.02, s: 3, S: 4, t: late * 1e6 }, prevDay: { c: 9.5, v: 2e6 }, min: { c: 10, t: late, av: 1e5 }, day: { c: 10, o: 9.6, v: 1e5 } })) }));
  if (u.pathname === '/v2/stocks/snapshots') { const syms = (u.searchParams.get('symbols') || '').split(','), tt = new Date(epoch - 30000).toISOString();
    return res.end(JSON.stringify(Object.fromEntries(syms.map(s => [s, { latestTrade: { p: 11, t: tt }, latestQuote: { bp: 10.99, ap: 11.01, bs: 200, as: 300, t: tt }, minuteBar: { t: new Date(epoch - 60000).toISOString(), c: 11, v: 1000 }, dailyBar: { t: day + 'T04:00:00Z', o: 9.6, c: 11, v: 3e6 }, prevDailyBar: { c: 9.5, v: 2e6 } }])))); }
  res.statusCode = 404; res.end('{}'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
const preload = path.join(dir, 'local-only.mjs');
fs.writeFileSync(preload, `const D=Date,start=D.now(),at=${epoch};globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[at+D.now()-start]));}static now(){return at+D.now()-start;}};const f=fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith(${JSON.stringify(base + '/')}))throw Error('NO_EXTERNAL_ACCESS');return f(u,o);};`);
const runId = 'synthetic-observer-1', cdir = path.join(dir, 'data/ignition-runs', day, runId + '.contracts');
fs.mkdirSync(path.dirname(cdir), { recursive: true });
if (mode === 'on-file') fs.writeFileSync(cdir, 'not a directory');
if (mode === 'on-quar') { fs.mkdirSync(cdir); fs.writeFileSync(path.join(cdir, 'QUARANTINED'), 'x'); }
if (mode === 'on-conflict') { fs.mkdirSync(cdir); fs.writeFileSync(path.join(cdir, 'beat-0580.json'), '{"record":{"kind":"OTHER"},"sha256":"0"}\n'); }
if (mode === 'on-symlink') { const real = path.join(dir, 'elsewhere'); fs.mkdirSync(real); fs.symlinkSync(real, cdir); }
if (mode === 'on-readonly') { fs.mkdirSync(cdir); fs.chmodSync(cdir, 0o500); }
const env = { PATH: process.env.PATH, IG_DAY: day, IG_FAKE_MIN: '580', IG_FAKE_STEP: '1', IG_RUN_MIN: '0.15', IG_NO_RADAR: '1', MASSIVE_BASE: base, MASSIVE_KEY: 'synthetic', ALPACA_DATA: base, ALPACA_KEY: 'synthetic', ALPACA_SECRET: 'synthetic', SEC_BASE: base, SEC_UA: 'synthetic fixture', GITHUB_RUN_ID: 'synthetic-observer', GITHUB_RUN_ATTEMPT: '1' };
if (mode !== 'off') env.CONTRACT_OBSERVER = 'research';
const child = spawn(process.execPath, ['--import', preload, 'ignition-watch.mjs'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; child.stdout.on('data', x => out += x); child.stderr.on('data', x => out += x);
const timer = setTimeout(() => child.kill('SIGKILL'), 120000); const code = await new Promise(r => child.on('close', r)); clearTimeout(timer); server.close();
if (mode === 'on-readonly') fs.chmodSync(cdir, 0o700);
// Normalized digest of everything persisted under data/, excluding the observer directory and run-identity/clock-derived values.
const VOLATILE = /^(sourceSha|procStart|generatedAt|instrumentRecordedAt|recordedAt|observedAt|startedAt|finishedAt|updatedAt|at|ts|time|wallMs|ms|durationMs|elapsedMs|pid)$/;
const norm = (v) => Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, VOLATILE.test(k) ? '<v>' : norm(v[k])])) : (typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v) ? '<time>' : typeof v === 'string' && /^[a-f0-9]{40}$/.test(v) ? '<sha>' : v);
const files = {}; const walk = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n), rel = path.relative(dir, p); if (rel.includes('.contracts') || rel.includes('elsewhere')) continue; const st = fs.lstatSync(p); if (st.isDirectory()) { walk(p); continue; } let t = fs.readFileSync(p); if (n.endsWith('.gz')) t = zlib.gunzipSync(t); t = t.toString();
  let rows; try { rows = n.includes('.jsonl') ? t.trim().split('\n').filter(Boolean).map(JSON.parse) : [JSON.parse(t)]; files[rel] = createHash('sha256').update(JSON.stringify(rows.map(norm))).digest('hex').slice(0, 16); } catch { files[rel] = 'NON_JSON:' + createHash('sha256').update(t.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>')).digest('hex').slice(0, 16); } } };
walk(path.join(dir, 'data'));
let observer = null; const real = mode === 'on-symlink' ? path.join(dir, 'elsewhere') : cdir;
if (fs.existsSync(real) && fs.lstatSync(real).isDirectory()) { const names = fs.readdirSync(real).sort(); const sample = names.find(n => n.startsWith('beat-'));
  observer = { files: names, sample: sample ? (() => { const e = JSON.parse(fs.readFileSync(path.join(real, sample))); const shaOk = createHash('sha256').update(JSON.stringify(e.record)).digest('hex') === e.sha256; return { shaOk, keys: Object.keys(e.record), counts: e.record.counts, quoteProviders: e.record.quoteProviders, quoteFeeds: e.record.quoteFeeds, minute: e.record.minute, runId: e.record.runId, hasPrice: /"(bid|ask|price|p|c)":\s*\d/.test(JSON.stringify(e.record)) }; })() : null }; }
const health = (out.match(/contract observer: (\{.*\})/) || [])[1] || null;
console.log(JSON.stringify({ tree: path.basename(rootSrc), mode, scenario, exit: code, providerRequests: calls.filter(c => !c.startsWith('/files')).length, requestList: createHash('sha256').update(calls.join('|')).digest('hex').slice(0, 16), persisted: files, observer, health }));
fs.rmSync(dir, { recursive: true, force: true });
