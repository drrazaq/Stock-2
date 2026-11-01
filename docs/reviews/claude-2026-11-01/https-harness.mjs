// Independent real-path harness for the SIP diagnostic (reviewer: Claude). Runs the ACTUAL tools/run-sip-access-diagnostic.mjs with its
// real createSingleAttemptHttpsRequest (Node core https) and real TLS, against a local HTTPS server with a throwaway self-signed certificate
// for data.alpaca.markets. A preload only redirects the TCP destination of https.request to 127.0.0.1 (Host/SNI unchanged, our CA trusted)
// and runs a virtual clock. Synthetic placeholder credentials only; nothing leaves 127.0.0.1. No provider call.
// Usage: node https-harness.mjs <checkout> <scenario> ; prints one JSON line.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import https from 'node:https'; import { spawn, spawnSync, execFileSync } from 'node:child_process'; import { createHash } from 'node:crypto';
const [src, scenario] = process.argv.slice(2), hash = (b) => createHash('sha256').update(b).digest('hex');
const top = fs.mkdtempSync(path.join(os.tmpdir(), 'sip-https-')), root = path.join(top, 'code');
const files = ['sip-access-diagnostic.mjs', 'sip-access-result.mjs', 'sip-access-https.mjs', 'tools/run-sip-access-diagnostic.mjs', 'tools/validate-sip-access-result.mjs'];
for (const f of [...files, 'docs/validation/sip-access-plan.proposed.json']) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(src, f), path.join(root, f)); }
const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH } }).stdout.trim();
git('init', '-q'); git('add', '.'); git('-c', 'user.name=r', '-c', 'user.email=r@example.invalid', 'commit', '-qm', 'x'); const source = git('rev-parse', 'HEAD');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(top, 'k.pem'), '-out', path.join(top, 'c.pem'), '-days', '1', '-subj', '/CN=data.alpaca.markets', '-addext', 'subjectAltName=DNS:data.alpaca.markets'], { stdio: 'ignore' });
const plan = JSON.parse(fs.readFileSync(path.join(root, 'docs/validation/sip-access-plan.proposed.json'))), T = Date.parse(plan.t0), ts = new Date(T - 60000).toISOString();
let connections = 0, requests = 0; const seen = [];
const server = https.createServer({ key: fs.readFileSync(path.join(top, 'k.pem')), cert: fs.readFileSync(path.join(top, 'c.pem')) }, (req, res) => {
  requests++; const n = requests, u = new URL(req.url, 'https://data.alpaca.markets'); seen.push({ path: u.pathname.replace('/v2/stocks/', ''), feed: u.searchParams.get('feed'), host: req.headers.host, key: req.headers['apca-api-key-id'] === 'synthetic-key-XYZ' });
  const send = (body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json', 'x-ratelimit-limit': '10000', 'x-ratelimit-remaining': String(10000 - n) }); res.end(JSON.stringify(body)); };
  if (scenario === 'http403-at-1' && n === 1) return send({ message: 'subscription does not permit querying recent SIP data' }, 403);
  if (scenario === 'http429-at-2' && n === 2) return send({ message: 'too many requests' }, 429);
  if (scenario === 'redirect-at-1' && n === 1) { res.writeHead(302, { location: 'https://data.alpaca.markets/v2/stocks/snapshots?feed=iex&symbols=SPY,AAPL' }); return res.end(); }
  if (scenario === 'reset-at-1' && n === 1) return req.socket.destroy();
  if ((scenario === 'hang-headers-at-1' || scenario === 'sigterm-during-request') && n === 1) return;
  if (scenario === 'hang-body-at-3' && n === 3) { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"trades":'); return; }
  if (scenario === 'oversize-at-4' && n === 4) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"bars":{"SPY":[' + ('{"t":"' + ts + '","v":1},').repeat(5000) + '{"t":"' + ts + '","v":1}]}}'); }
  if (scenario === 'page-token-at-4' && n === 4) return send({ bars: { SPY: [{ t: ts, v: 1 }], AAPL: [] }, next_page_token: 'abc' });
  if (u.pathname === '/v2/stocks/snapshots') return send({ SPY: { latestQuote: { t: ts, bp: 501.11, ap: 501.21 } }, AAPL: { latestQuote: { t: ts, bp: 222.21, ap: 222.31 } } });
  if (u.pathname === '/v2/stocks/quotes/latest') return send({ quotes: { SPY: { t: ts, bp: 501.11, ap: 501.21 }, AAPL: { t: ts, bp: 222.21, ap: 222.31 } } });
  if (u.pathname === '/v2/stocks/trades/latest') return send({ trades: { SPY: { t: ts, p: 501.15 }, AAPL: { t: ts, p: 222.25 } } });
  if (u.pathname === '/v2/stocks/trades') return send({ trades: { AAPL: [{ t: ts, p: 222.25, s: 100 }] }, next_page_token: null });
  return send({ bars: { SPY: [{ t: ts, o: 501, h: 502, l: 500, c: 501.5, v: 1000, n: 10, vw: 501.2 }], AAPL: [{ t: ts, o: 222, h: 223, l: 221, c: 222.5, v: 900, n: 9, vw: 222.4 }] }, next_page_token: null });
});
server.on('secureConnection', () => connections++);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const start = { 'early-300s': T - 300000, 'early-601s': T - 601000, 'late-31s': T + 31000, 'sigterm-during-wait': T - 3000 }[scenario] ?? T;
const fastWait = scenario !== 'sigterm-during-wait';
const preload = path.join(top, 'preload.mjs');
fs.writeFileSync(preload, `import https from 'node:https';import fs from 'node:fs';
const ca=fs.readFileSync(${JSON.stringify(path.join(top, 'c.pem'))}),orig=https.request;
https.request=(u,o,cb)=>orig({hostname:'127.0.0.1',port:${server.address().port},path:u.pathname+u.search,method:o.method,headers:{...o.headers,host:'data.alpaca.markets'},agent:o.agent,signal:o.signal,ca,servername:'data.alpaca.markets'},cb);
const D=Date,P=performance.now.bind(performance);let off=${start}-D.now();
globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[D.now()+off]));}static now(){return D.now()+off;}};
performance.now=()=>P()+off;
const st=setTimeout;globalThis.setTimeout=(f,ms,...a)=>{if((${fastWait}&&ms>0&&ms<=1000)||(ms>10000&&ms<=95000)){off+=ms;return st(f,0,...a);}return st(f,ms,...a);};`);
const workflow = path.join(top, 'wf.yml'); fs.writeFileSync(workflow, '# reviewer synthetic installed workflow\n');
const approvalFile = path.join(top, 'approval.json'), out = path.join(top, 'out'); fs.mkdirSync(out);
fs.writeFileSync(approvalFile, JSON.stringify({ granted: true, scope: 'SIP_ACCESS_SAMPLE_V1', sourceSha: source, workflowSha256: hash(fs.readFileSync(workflow)), sourceHashes: Object.fromEntries(files.map(f => [f, hash(fs.readFileSync(path.join(root, f)))])), planSha256: hash(fs.readFileSync(path.join(root, 'docs/validation/sip-access-plan.proposed.json'))), approvedAt: new Date(T - 3600000).toISOString(), existingBindingsOnly: true, sampledResponsesOnly: true }));
if (scenario === 'existing-report') fs.writeFileSync(path.join(out, 'sip-access-report.json'), 'pre-existing');
const env = { PATH: process.env.PATH, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1', GITHUB_REF_NAME: 'main', GITHUB_WORKFLOW_REF: 'drrazaq/Stock-2/.github/workflows/sip-access-diagnostic.yml@refs/heads/main', SIP_APPROVED_SOURCE: source, RUNNER_TEMP: out };
if (scenario !== 'no-binding') Object.assign(env, { ALPACA_KEY: 'synthetic-key-XYZ', ALPACA_SECRET: 'synthetic-secret-XYZ' });
const began = Date.now();
const child = spawn(process.execPath, ['--import', preload, 'tools/run-sip-access-diagnostic.mjs', '--approval', approvalFile, workflow], { cwd: root, env });
let stdout = '', stderr = ''; child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
if (scenario.startsWith('sigterm')) setTimeout(() => child.kill('SIGTERM'), 1500);
const hard = setTimeout(() => child.kill('SIGKILL'), 60000);
const code = await new Promise(r => child.on('close', (c, s) => r(c ?? s))); clearTimeout(hard); server.closeAllConnections?.(); server.close();
const { normalizeSipResult } = await import(path.join(root, 'sip-access-result.mjs'));
const rp = path.join(out, 'sip-access-report.json'), raw = fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : null; let report = null; try { report = raw && raw !== 'pre-existing' ? JSON.parse(raw) : null; } catch {}
const leak = /synthetic-key|synthetic-secret|501\.1|222\.2|subscription does not permit|too many requests/.test((raw || '') + stdout + stderr);
console.log(JSON.stringify({ scenario, node: process.version, exit: code, stdout: stdout.trim(), stderrBytes: stderr.length, codeExitConsistent: normalizeSipResult(stdout, code).code === stdout.trim(), tlsConnections: connections, httpRequests: requests,
  feeds: [...new Set(seen.map(s => s.feed))], hosts: [...new Set(seen.map(s => s.host))], keyOnEvery: seen.every(s => s.key), paths: seen.map(s => s.path), wallMs: Date.now() - began,
  report: report ? { status: report.status, reason: report.reason, attempts: report.applicationAttempts, results: report.results.map(r => r.id + ':' + r.status + (r.reason ? '/' + r.reason : '')), bytes: Buffer.byteLength(raw) } : raw === 'pre-existing' ? 'PRE_EXISTING_UNCHANGED' : raw === null ? 'NO_FILE' : raw === '' ? 'EMPTY' : 'UNPARSEABLE',
  secretPriceOrProviderTextInOutput: leak }));
fs.rmSync(top, { recursive: true, force: true });
