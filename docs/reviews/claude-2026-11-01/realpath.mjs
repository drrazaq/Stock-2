// Independent real-path harness (reviewer). Runs the ACTUAL tools/run-sip-access-diagnostic.mjs + createBoundedSipRequest + Node's real
// fetch (undici) over real HTTP to a local server. Only the origin is rewritten in a preload (https://data.alpaca.markets -> local);
// the clock is frozen at T0 and the 90 s repeat wait is fast-forwarded. No provider, credential or network beyond 127.0.0.1.
// argv: <checkout root> <scenario>
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http'; import { spawn, spawnSync } from 'node:child_process'; import { createHash } from 'node:crypto';
const [src, scenario] = process.argv.slice(2), hash = (b) => createHash('sha256').update(b).digest('hex');
const plan = JSON.parse(fs.readFileSync(path.join(src, 'docs/validation/sip-access-plan.proposed.json'))), T = Date.parse(plan.t0);
const top = fs.mkdtempSync(path.join(os.tmpdir(), 'sip-real-')), root = path.join(top, 'code');
for (const f of ['sip-access-diagnostic.mjs', 'tools/run-sip-access-diagnostic.mjs', 'docs/validation/sip-access-plan.proposed.json']) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(src, f), path.join(root, f)); }
const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH } }).stdout.trim();
git('init', '-q'); git('add', '.'); git('-c', 'user.name=r', '-c', 'user.email=r@example.invalid', 'commit', '-qm', 'x'); const source = git('rev-parse', 'HEAD');
const workflow = path.join(top, 'wf.yml'); fs.writeFileSync(workflow, '# reviewer synthetic installed workflow\n');
const ts = new Date(T - 60000).toISOString(), log = [];
let n = 0;
const server = http.createServer((req, res) => {
  n++; const u = new URL(req.url, 'http://x'); log.push({ n, path: u.pathname, feed: u.searchParams.get('feed'), key: req.headers['apca-api-key-id'] ? 'present' : 'absent' });
  const send = (body, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('x-ratelimit-limit', '10000'); res.setHeader('x-ratelimit-remaining', String(10000 - n)); res.end(JSON.stringify(body)); };
  if (scenario === 'http429-at-2' && n === 2) return send({ message: 'rate limit' }, 429);
  if (scenario === 'http403-at-1' && n === 1) return send({ message: 'subscription does not permit querying recent SIP data' }, 403);
  if (scenario === 'redirect-at-1' && n === 1) { res.statusCode = 302; res.setHeader('location', 'http://127.0.0.1:1/elsewhere'); return res.end(); }
  if (scenario === 'hang-headers-at-1' && n === 1) return;                                   // never responds
  if (scenario === 'hang-body-at-3' && n === 3) { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"trades":'); return; }   // body never finishes
  if (scenario === 'oversize-at-4' && n === 4) { res.writeHead(200); return res.end('{"bars":{"SPY":[' + ('{"t":"' + ts + '","v":1},').repeat(5000) + '{"t":"' + ts + '","v":1}]}}'); }   // ~195 KB valid JSON (> 128 KiB)
  if (scenario === 'page-token-at-4' && n === 4) return send({ bars: { SPY: [{ t: ts, v: 1 }], AAPL: [] }, next_page_token: 'abc' });
  if (u.pathname === '/v2/stocks/snapshots') return send({ SPY: { latestQuote: { t: ts, bp: 501.1, ap: 501.2 }, latestTrade: { p: 501.15, t: ts } }, AAPL: { latestQuote: { t: ts, bp: 222.2, ap: 222.3 } } });
  if (u.pathname === '/v2/stocks/quotes/latest') return send({ quotes: { SPY: { t: ts, bp: 501.1, ap: 501.2 }, AAPL: { t: ts, bp: 222.2, ap: 222.3 } } });
  if (u.pathname === '/v2/stocks/trades/latest') return send({ trades: { SPY: { t: ts, p: 501.15 }, AAPL: { t: ts, p: 222.25 } } });
  if (u.pathname === '/v2/stocks/trades') return send({ trades: { AAPL: [{ t: ts, p: 222.25, s: 100 }] }, next_page_token: null });
  return send({ bars: { SPY: [{ t: ts, o: 501, h: 502, l: 500, c: 501.5, v: 1000, n: 10, vw: 501.2 }], AAPL: [{ t: ts, o: 222, h: 223, l: 221, c: 222.5, v: 900, n: 9, vw: 222.4 }] }, next_page_token: null });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port, preload = path.join(top, 'p.mjs');
const startAt = scenario === 'start-5s-early' ? T - 5000 : scenario === 'start-31s-late' ? T + 31000 : T;
fs.writeFileSync(preload, `const D=Date;let off=${startAt}-D.now();globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[D.now()+off]));}static now(){return D.now()+off;}};
const st=setTimeout;globalThis.setTimeout=(f,ms,...a)=>{if(ms===90000||(ms>60000&&ms<=90000)){off+=ms;return st(f,0,...a);}return st(f,ms,...a);};
const rf=fetch;globalThis.fetch=(u,o)=>rf(String(u).replace('https://data.alpaca.markets',${JSON.stringify(base)}),o);`);
const approval = path.join(top, 'approval.json'), dir = path.join(top, 'out'); fs.mkdirSync(dir);
fs.writeFileSync(approval, JSON.stringify({ granted: true, scope: 'SIP_ACCESS_SAMPLE_V1', sourceSha: source, workflowSha256: hash(fs.readFileSync(workflow)), sourceHashes: Object.fromEntries(['sip-access-diagnostic.mjs', 'tools/run-sip-access-diagnostic.mjs'].map(f => [f, hash(fs.readFileSync(path.join(root, f)))])), planSha256: hash(fs.readFileSync(path.join(root, 'docs/validation/sip-access-plan.proposed.json'))), approvedAt: new Date(T - 3600000).toISOString(), existingBindingsOnly: true, sampledResponsesOnly: true }));
const began = Date.now();
const child = spawn(process.execPath, ['--import', preload, 'tools/run-sip-access-diagnostic.mjs', '--approval', approval, workflow], { cwd: root, env: { PATH: process.env.PATH, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1', GITHUB_REF_NAME: 'main', GITHUB_WORKFLOW_REF: 'drrazaq/Stock-2/.github/workflows/sip-access-diagnostic.yml@refs/heads/main', SIP_APPROVED_SOURCE: source, RUNNER_TEMP: dir, ALPACA_KEY: 'synthetic-key-XYZ', ALPACA_SECRET: 'synthetic-secret-XYZ' } });
let out = ''; child.stdout.on('data', x => out += x); child.stderr.on('data', x => out += x);
const killer = setTimeout(() => child.kill('SIGKILL'), 60000);
const code = await new Promise(r => child.on('close', r)); clearTimeout(killer); server.closeAllConnections?.(); server.close();
const reportPath = path.join(dir, 'sip-access-report.json'), raw = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
let report = null; try { report = raw ? JSON.parse(raw) : null; } catch {}
const leak = /synthetic-key|synthetic-secret|501\.1|222\.2|subscription does not permit|rate limit/.test((raw || '') + out);
console.log(JSON.stringify({ scenario, exit: code, stdout: out.trim(), serverRequests: n, keyHeaderOnAll: log.every(l => l.key === 'present'), feeds: [...new Set(log.map(l => l.feed))], paths: log.map(l => l.path.replace('/v2/stocks/', '')), wallMs: Date.now() - began,
  report: report ? { status: report.status, reason: report.reason, attempts: report.applicationAttempts, bytes: report.responseBytes, results: report.results.map(r => r.id + ':' + r.status + (r.reason ? '/' + r.reason : '') + (r.changedMinutes !== undefined ? '/rev=' + r.changedMinutes : '')), sizeBytes: Buffer.byteLength(raw) } : (raw === '' ? 'EMPTY_FILE' : raw === null ? 'NO_FILE' : 'UNPARSEABLE'),
  secretOrPriceOrProviderTextInOutput: leak }));
fs.rmSync(top, { recursive: true, force: true });
