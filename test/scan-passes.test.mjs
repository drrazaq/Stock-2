// P0 Route A acceptance for the two-pass nightly scan (scan-passes.mjs). Each world is a throw-away copy of the source tree with synthetic
// data only and a loopback price server. Varying the owner's private state (ZAD marks, holdings, private watch list that OVERLAPS a public
// source, tips, settings, and seeded PRIVATE-only cache entries) must leave every public data file (except the run clock) and the public
// stdout byte-identical, while the private pass still produces the owner's paired private record. No network, no Telegram.
import test from 'node:test'; import assert from 'node:assert/strict'; import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFile } from 'node:child_process'; import { promisify } from 'node:util';
const exec = promisify(execFile), ROOT = path.resolve(import.meta.dirname, '..');
const bars = []; let i = 0;
for (let d = new Date('2023-01-02T00:00:00Z'); d <= new Date('2026-11-10T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) if (![0, 6].includes(d.getUTCDay())) {
  const c = 10 * (1 + 0.0009 * i) * (1 + 0.04 * Math.sin(i / 7)); i++;
  bars.push({ datetime: d.toISOString().slice(0, 10), open: c.toFixed(4), high: (c * 1.01).toFixed(4), low: (c * 0.99).toFixed(4), close: c.toFixed(4), volume: '3000000' }); }
const PRIVATE_ONLY = /ZZQ|ZZR|ZZT|ZZX/;
async function world(p, script = 'scan-passes.mjs') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-passes-world-'));
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) { if (['.git', 'data', 'node_modules', 'test', 'tests', 'docs'].includes(e.name)) continue; fs.cpSync(path.join(ROOT, e.name), path.join(dir, e.name), { recursive: true }); }
  const w = (f, v) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), typeof v === 'string' ? v : JSON.stringify(v)); };
  w('watchlist.txt', 'SPY ZZP\n');
  w('data/discovery.json', { candidates: [{ sym: 'ZZD' }] });          // a PUBLIC source name that the owner may also watch privately
  w('data/models.json', p.legacyModels || { ZZP: 'public-seed' });   // legacy public cache written by the OLD single-pass scan (no manifest): quarantined
  w('data/smart-money.json', { picks: ['ZZX'] });                      // tainted producer output (reads holdings/tips): never a public seed
  w('data/settings.json', p.settings || {}); w('data/halal.json', p.marks || {}); w('data/my-positions.json', p.positions || {});
  w('data/watch-extra.json', p.extra || []); w('data/tips.jsonl', (p.tips || []).map(x => JSON.stringify(x)).join('\n'));
  for (const [f, v] of Object.entries(p.privateCache || {})) w('data/' + f, v);   // pre-existing PRIVATE-only cache entries
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); const u = new URL(req.url, 'http://local'); res.end(JSON.stringify(u.pathname === '/time_series' ? { status: 'ok', values: bars.slice(-900) } : {})); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const env = { PATH: process.env.PATH, HOME: os.tmpdir(), TD_BASE: base, FH_BASE: base, SEC_BASE: base, NO_CROWD: '1', RATE: '10000', FORCE: '1', NO_WIDE: '1', NO_QUICK_EXTRA: '1', WIDE_N: '0', TWELVE_KEY: 'synthetic' };
    const out = await exec(process.execPath, [script], { cwd: dir, env: { ...env, ...(script === 'scan.mjs' ? { MODE: 'daily' } : {}) }, maxBuffer: 64 << 20 });
    const files = {}; const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else files[r] = fs.readFileSync(path.join(d, e.name), 'utf8'); } };
    walk(path.join(dir, 'data'), '');
    return { dir, stdout: out.stdout, files };
  } finally { server.closeAllConnections(); server.close(); }
}
const PUBLIC_INPUTS = new Set(['discovery.json', 'smart-money.json']);
function publicView(wd) {   // every public data file the run produced or kept, with the run clock normalised
  const priv = new Set(fs.readFileSync(path.join(ROOT, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
  const v = {};
  for (const [f, body] of Object.entries(wd.files)) { const top = f.split('/')[0]; if (priv.has(top) || top.startsWith('private-')) continue;
    v[f] = body.replace(/"generatedAt":"[^"]*"/g, '"generatedAt":"<clock>"').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<ts>'); }
  return v;
}
const normOut = (s) => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<ts>').replace(/in \d+ ?s\b/g, 'in <n>s').replace(/\b\d+(\.\d+)? ?ms\b/g, '<ms>');
test('two-pass scan: public files and public stdout are invariant to every kind of private owner state', { timeout: 600000 }, async () => {
  const held = { entry: 30, stop: 25, src: 'try small', kind: 'manual', since: '2026-11-06', tryHold: 63 };
  const a = await world({});
  const b = await world({ marks: { ZZP: { s: 'fail' }, ZZD: { s: 'ok' }, ZZQ: { s: 'ok' }, ZZR: { s: 'ok' } }, positions: { ZZP: held, ZZR: { entry: 30, stop: 25, src: 'manual', kind: 'manual', since: '2026-11-01', own: true }, ZZD: { ...held } }, extra: ['ZZQ', 'ZZD'],
    tips: [{ sym: 'ZZX', d: '2026-11-03', src: 'synthetic source', px: 10 }], settings: { quiet: false, focus: true },
    legacyModels: { ZZT: 'legacy private-derived entry', ZZP: 'legacy' }, privateCache: { 'private-models.json': { ZZT: 'private-only seed', ZZP: 'private-model' }, 'private-outcomes.json': { ZZT: [{ r: 1 }] }, 'private-lessons.json': { rules: { ZZT: {} } } } });
  try {
    const A = publicView(a), B = publicView(b);
    assert.deepEqual(Object.keys(B).sort(), Object.keys(A).sort(), 'same public file set');
    for (const f of Object.keys(A)) { if (f === 'public-pass-manifest.json') { assert.deepEqual(Object.keys(JSON.parse(B[f]).files).sort(), Object.keys(JSON.parse(A[f]).files).sort(), 'manifest covers the same files (its hashes include the run clock)'); continue; } assert.equal(B[f], A[f], 'public file differs: ' + f); }
    for (const [f, body] of Object.entries(B)) if (!PUBLIC_INPUTS.has(f)) assert.doesNotMatch(body, PRIVATE_ONLY, 'private-only name in public file ' + f);
    assert.equal(normOut(b.stdout), normOut(a.stdout), 'public stdout invariant');
    const und = (b.stdout.match(/undeclared public-pass outputs were NOT installed: (.*)/) || [, ''])[1].split(' ').filter(Boolean);
    const priv0 = new Set(fs.readFileSync(path.join(ROOT, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
    assert.deepEqual(und.filter(f => !priv0.has(f)), [], 'every public-pass output is either declared public or private-listed (none silently dropped)');
    assert.doesNotMatch(b.stdout, /PRIVATE \d/, 'no private-file count in the public log');
    assert.doesNotMatch(B['signals.json'], /ZZX/, 'a tainted producer output (smart-money) is not used as a public seed');
    assert.ok(B['public-pass-manifest.json'] && JSON.parse(B['public-pass-manifest.json']).files['signals.json'], 'public pass writes its provenance manifest');
    assert.doesNotMatch(b.stdout, PRIVATE_ONLY);
    const priv = JSON.parse(b.files['signals-private.json']), pub = JSON.parse(b.files['signals.json']);
    assert.equal(priv.session, pub.session); assert.equal(priv.generatedAt, pub.generatedAt, 'private record pairs with the PUBLISHED signals.json');
    assert.ok(Object.keys(priv.posVerdict).length > 0, 'held positions get private exit verdicts');
    assert.equal(JSON.parse(b.files['private-signals.json']).generatedAt, pub.generatedAt, 'full private scan copy pairs too');
    // private-view COMPLETENESS (Codex 6853042440): the full private copy holds every privately scanned row, not the public projection
    const full = JSON.parse(b.files['private-signals.json']), fsyms = new Set(full.stocks.map(x => x.sym));
    assert.ok(priv.posVerdict.ZZR, 'the private-only holding was evaluated');
    for (const s of ['ZZR', 'ZZQ']) assert.ok(fsyms.has(s), 'private-signals.stocks has the privately scanned ' + s);
    for (const x of pub.stocks) assert.ok(fsyms.has(x.sym), 'every public row is in the private view too: ' + x.sym);
    assert.ok(full.scanned >= pub.scanned && full.tested >= pub.tested, 'private counts cover the full scan');
    assert.equal(full.diagnosticScope, 'ALL_LOADED_NAMES'); assert.equal(pub.diagnosticScope, 'PUBLIC_BASE_LOADED_NAMES');
    assert.ok(b.files['private-scan-stdout.log'] !== undefined, 'private pass stdout goes to the private sink');
    assert.match(b.files['private-models.json'], /ZZT/, 'the private cache keeps its private-only entries (full state preserved privately)');
  } finally { for (const w of [a, b]) fs.rmSync(w.dir, { recursive: true, force: true }); }
});

test('negative control: the old single-pass scan on the same private worlds DOES leak (so the differential above can detect it)', { timeout: 600000 }, async () => {
  const held = { entry: 30, stop: 25, src: 'try small', kind: 'manual', since: '2026-11-06', tryHold: 63 };
  const a = await world({}, 'scan.mjs'), b = await world({ marks: { ZZP: { s: 'fail' } }, positions: { ZZR: held }, extra: ['ZZQ', 'ZZD'] }, 'scan.mjs');
  try { const A = publicView(a), B = publicView(b); assert.ok(Object.keys(A).some(f => A[f] !== B[f]) || Object.keys(B).length !== Object.keys(A).length, 'single pass must differ'); }
  finally { for (const w of [a, b]) fs.rmSync(w.dir, { recursive: true, force: true }); }
});

test('positive public input map: every declared public seed is a scan input, not private, and has no runtime writer (drift check)', async () => {
  const { PUBLIC_SEEDS, SCAN_OUTPUTS } = await import('../scan-passes.mjs');
  const privList = new Set(fs.readFileSync(path.join(ROOT, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
  const mods = fs.readdirSync(ROOT).filter(f => /\.(mjs|js|cjs)$/.test(f)), scan = fs.readFileSync(path.join(ROOT, 'scan.mjs'), 'utf8');
  for (const [f, d] of Object.entries(PUBLIC_SEEDS)) {
    assert.ok(!privList.has(f) && !f.startsWith('private-') && !SCAN_OUTPUTS.includes(f), f + ' is neither private nor a scan output');
    assert.ok(scan.includes("'data/" + f + "'") || scan.includes("J('" + f + "')") || mods.some(m => fs.readFileSync(path.join(ROOT, m), 'utf8').includes("'data/" + f + "'")), f + ' is actually read');
    assert.ok(d.producer && d.basis && d.kind, f + ' declares producer and basis');
    if (d.kind === 'REFERENCE') { const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), w = new RegExp('(writeFileSync|appendFileSync|renameSync|copyFileSync|cpSync)\\([^;]{0,200}' + esc);
      assert.deepEqual(mods.filter(m => w.test(fs.readFileSync(path.join(ROOT, m), 'utf8'))), [], f + ': a REFERENCE seed must have no runtime writer (a new writer must be audited and declared as a producer)'); }
  }
});
