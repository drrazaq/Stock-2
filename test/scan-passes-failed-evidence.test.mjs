// A private nightly pass that FAILS AFTER an owner-facing side effect (Codex 6851335617). daily() may already have sent a nightly
// message with a SELL line or recorded an owner event before it dies; deleting the temp copy would erase that evidence. Required:
// the failed pass's changed files are retained as bounded PRIVATE quarantine (data/private-failed-pass-*), never as current state
// (owner files untouched, never restored as caches, never at a public name), nothing re-sent or replayed; and the isolated passes
// never consume owner commands (the bot is the one consumer). Stub scan.mjs, synthetic data only, no network, no Telegram.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { retainFailedPrivate, FAILED_PREFIX, NOT_STATE, privateAdmission, isCritical } from '../scan-passes.mjs';
const ROOT = path.resolve(import.meta.dirname, '..');
const STUB = `import fs from 'node:fs';
const mode = (() => { try { return fs.readFileSync('data/stub-mode.txt', 'utf8'); } catch { return ''; } })();
fs.writeFileSync('data/box-list.json', JSON.stringify(fs.readdirSync('data').sort()));
if (process.env.SCAN_PASS === 'public') { fs.writeFileSync('data/signals.json', JSON.stringify({ session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000Z', who: 'public' })); process.exit(0); }
fs.writeFileSync('data/sell-notices.jsonl', '{"sym":"ZZP","sent":"SELL PRIVATE_SECRET"}\\n');   // the SELL line was already sent
fs.writeFileSync('data/my-positions.json', JSON.stringify({ ZZP: { entry: 1, note: 'PRIVATE_SECRET event' } }));
fs.writeFileSync('data/nightly-sent.json', JSON.stringify({ text: 'ACTIONS PRIVATE_SECRET' }));
if (mode.includes('big')) fs.writeFileSync('data/big.bin', Buffer.alloc(5 << 20, 1));
if (mode.includes('bigcritical')) fs.writeFileSync('data/my-trades.jsonl', Buffer.alloc(5 << 20, 2));
if (mode.includes('kill')) process.kill(process.pid, 'SIGKILL');
if (mode.includes('fail')) process.exit(9);`;
const OWNER0 = '{"ZZP":{"entry":1,"note":"original"}}';
function world() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-passes-evidence-'));
  fs.mkdirSync(path.join(dir, '.github')); fs.copyFileSync(path.join(ROOT, '.github/private-files.txt'), path.join(dir, '.github/private-files.txt'));
  fs.copyFileSync(path.join(ROOT, 'scan-passes.mjs'), path.join(dir, 'scan-passes.mjs')); fs.writeFileSync(path.join(dir, 'scan.mjs'), STUB);
  fs.mkdirSync(path.join(dir, 'data')); fs.writeFileSync(path.join(dir, 'data/signals.json'), '{"orig":true}'); fs.writeFileSync(path.join(dir, 'data/my-positions.json'), OWNER0);
  return dir; }
function run(dir, mode) { fs.writeFileSync(path.join(dir, 'data/stub-mode.txt'), mode);
  return spawnSync(process.execPath, ['scan-passes.mjs'], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, TG_TOKEN: 'synthetic', TG_CHAT: '1' } }); }
const ls = (dir) => fs.readdirSync(path.join(dir, 'data')).sort();
const rd = (dir, f) => fs.readFileSync(path.join(dir, 'data', f), 'utf8');
const privList = new Set(fs.readFileSync(path.join(ROOT, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
const publicNames = (dir) => ls(dir).filter(f => !f.startsWith('private-') && !privList.has(f));
for (const mode of ['fail', 'kill']) test('private pass ' + (mode === 'kill' ? 'SIGKILLed' : 'exits 9') + ' after a SELL was sent: evidence kept as private quarantine, not current state, nothing public', () => {
  const dir = world(); try {
    const r = run(dir, mode); assert.notEqual(r.status, 0, 'the run fails visibly');
    assert.equal(rd(dir, 'my-positions.json'), OWNER0, 'owner file is NOT replaced by a failed pass');
    const idx = ls(dir).filter(f => f.startsWith(FAILED_PREFIX) && f.endsWith('.json') && !f.includes('__')); assert.equal(idx.length, 1, 'one quarantine index');
    const meta = JSON.parse(rd(dir, idx[0])); assert.match(meta.kind, /^QUARANTINE/); assert.match(meta.kind, /never replayed or re-sent/);
    assert.equal(meta.signal, mode === 'kill' ? 'SIGKILL' : null); if (mode === 'fail') assert.equal(meta.exit, 9);
    for (const f of ['sell-notices.jsonl', 'my-positions.json', 'nightly-sent.json']) assert.ok(meta.retained.includes(f), 'retained ' + f);
    const stamp = idx[0].slice(0, -'.json'.length);
    assert.match(rd(dir, stamp + '__sell-notices.jsonl'), /SELL PRIVATE_SECRET/, 'sent-SELL evidence retained byte-exact');
    assert.match(rd(dir, stamp + '__my-positions.json'), /PRIVATE_SECRET event/, 'owner event retained in quarantine only');
    for (const f of publicNames(dir)) assert.doesNotMatch(rd(dir, f), /PRIVATE_SECRET|failed-pass/, 'public path ' + f);
    assert.doesNotMatch(r.stdout, /PRIVATE_SECRET/, 'orchestrator stdout carries no private payload');
    assert.match(r.stdout, /evidence was retained privately as UNRESOLVED quarantine \(details in the private log\)/); assert.doesNotMatch(r.stdout, /private-failed-pass-|critical\)|sell-notices/, "no owner-derived diagnostics in the public log"); assert.match(rd(dir, "private-scan-stdout.log"), /kept privately as UNRESOLVED quarantine evidence/); assert.ok(meta.critical.includes("sell-notices.jsonl"), "the sent SELL record is critical");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test('quarantine is never restored as state: a later pass sees no failed-pass or conflict file, and owner state comes only from a completed pass', () => {
  const dir = world(); try {
    run(dir, 'fail'); fs.writeFileSync(path.join(dir, 'data/private-conflict-my-positions.json'), '{"x":1}');
    const r = run(dir, ''); assert.equal(r.status, 0);
    const box = JSON.parse(rd(dir, 'private-box-list.json'));   // the completed private pass's view of its data directory
    assert.ok(!box.some(n => /failed-pass|conflict/.test(n)), 'private pass box holds no quarantine/conflict-derived file: ' + box.filter(n => /failed|conflict/.test(n)));
    assert.match(rd(dir, 'my-positions.json'), /PRIVATE_SECRET event/, 'only the completed pass installs owner state');
    assert.ok(ls(dir).some(f => f.startsWith(FAILED_PREFIX)), 'earlier quarantine is kept, not consumed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test('size bounds apply to OPTIONAL files only: a large critical owner/SELL record is kept, a large model/cache file is skipped by name', () => {
  const dir = world(); try {
    const r = run(dir, 'fail big bigcritical'); assert.match(rd(dir, 'private-scan-stdout.log'), /optional files over the size bound NOT kept: big\.bin/); assert.doesNotMatch(r.stdout, /big\.bin/);
    const idx = ls(dir).find(f => f.startsWith(FAILED_PREFIX) && f.endsWith('.json') && !f.includes('__')), meta = JSON.parse(rd(dir, idx));
    assert.deepEqual(meta.skipped.map(s => s.r), ['big.bin']); assert.ok(meta.critical.includes('sell-notices.jsonl') && meta.critical.includes('my-trades.jsonl'));
    assert.equal(fs.statSync(path.join(dir, 'data', idx.slice(0, -5) + '__my-trades.jsonl')).size, 5 << 20, 'a 5 MiB critical owner record is retained whole');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test('capacity full: nothing unresolved is pruned; the next night does NOT run the private pass and says what coverage is lost', () => {
  const dir = world(); try {
    for (let i = 0; i < 3; i++) assert.notEqual(run(dir, 'fail').status, 0);
    const sets0 = ls(dir).filter(f => f.startsWith(FAILED_PREFIX)), before = rd(dir, 'my-positions.json');
    const r = run(dir, '');   // a night that WOULD succeed and change owner state
    assert.equal(r.status, 6, 'explicit admission refusal status'); assert.match(r.stdout, /PRIVATE PASS NOT RUN: retained private evidence is at capacity/); assert.doesNotMatch(r.stdout, /3 unresolved/); assert.match(rd(dir, 'private-scan-stdout.log'), /PRIVATE PASS NOT RUN: 3 unresolved failed-pass evidence sets/);
    assert.match(r.stdout, /Not produced tonight: the owner nightly/); assert.match(r.stdout, /Separate protective paths .* are not affected/);
    assert.equal(rd(dir, 'my-positions.json'), before, 'no private computation ran'); assert.ok(!ls(dir).includes('private-box-list.json'));
    assert.deepEqual(ls(dir).filter(f => f.startsWith(FAILED_PREFIX)), sets0, 'every earlier set is kept byte for byte (no pruning)');
    assert.match(rd(dir, 'signals.json'), /"who":"public"/, 'the public pass still installs its public output');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test('only a reviewed disposition record releases capacity, and it deletes nothing', () => {
  const dir = world(); try {
    for (let i = 0; i < 3; i++) run(dir, 'fail');
    const first = ls(dir).find(f => f.startsWith(FAILED_PREFIX) && f.endsWith('.json') && !f.includes('__')), sets0 = ls(dir).filter(f => f.startsWith(FAILED_PREFIX));
    fs.writeFileSync(path.join(dir, 'data', first.replace(/\.json$/, '.disposition.json')), JSON.stringify({ resolved: false }));
    assert.equal(run(dir, '').status, 6, 'an unresolved disposition does not release');
    fs.writeFileSync(path.join(dir, 'data', first.replace(/\.json$/, '.disposition.json')), JSON.stringify({ resolved: true, reviewedBy: 'synthetic', note: 'synthetic' }));
    assert.equal(run(dir, '').status, 0, 'resolved set releases one slot');
    for (const f of sets0) assert.ok(ls(dir).includes(f), 'still kept: ' + f);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test('admission also refuses when the unresolved bytes leave no room for tonight\'s critical records', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-')); try {
    fs.writeFileSync(path.join(d, FAILED_PREFIX + '2026-11-10T21-50-00-000Z.json'), '{}'); fs.writeFileSync(path.join(d, FAILED_PREFIX + '2026-11-10T21-50-00-000Z__x.json'), Buffer.alloc(3000));
    fs.writeFileSync(path.join(d, 'my-positions.json'), Buffer.alloc(1000));
    assert.equal(privateAdmission(d, { unresolvedSets: 3, unresolvedBytes: 1 << 30 }).ok, true);
    const a = privateAdmission(d, { unresolvedSets: 3, unresolvedBytes: (1 << 20) + 4000 }); assert.equal(a.ok, false); assert.match(a.reason, /room for tonight's critical records/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); } });
test('unit: critical classification and optional caps', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'retain-unit-')); try {
    const box = path.join(d, 'box'), data = path.join(d, 'data'); fs.mkdirSync(path.join(box, 'data/sub'), { recursive: true }); fs.mkdirSync(data);
    fs.writeFileSync(path.join(box, 'data/a.json'), '12345678'); fs.writeFileSync(path.join(box, 'data/sub/b.json'), '12345678'); fs.writeFileSync(path.join(box, 'data/sell-notices.jsonl'), '1'.repeat(50));
    const q = retainFailedPrivate(box, new Map(), { exit: 1 }, { data, now: Date.parse('2026-11-12T21:50:00Z'), limits: { fileBytes: 10, optionalBytes: 12 } });
    assert.deepEqual(q.critical, ['sell-notices.jsonl'], 'critical kept although over every bound'); assert.equal(q.kept.length, 2); assert.equal(q.skipped.length, 1);
    for (const n of fs.readdirSync(data)) assert.ok(n.startsWith('private-') && NOT_STATE.test(n), n);
    for (const r of ['my-positions.json', 'tg-state.json', 'alert-state.json', 'watcher-message-state/2026-11-12/x.json', 'sell-notices.jsonl']) assert.ok(isCritical(r), r);
    for (const r of ['models.json', 'big.bin', 'private-models.json']) assert.ok(!isCritical(r), r);
  } finally { fs.rmSync(d, { recursive: true, force: true }); } });
test('the isolated nightly passes never consume owner Telegram commands (the bot is the one consumer)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scan.mjs'), 'utf8'), at = src.indexOf('async function tgCommands(');
  const body = src.slice(at, src.indexOf('getUpdates', at)); assert.match(body, /if \(env\.SCAN_PASS\) return;/, 'SCAN_PASS guard precedes getUpdates');
  const sp = fs.readFileSync(path.join(ROOT, 'scan-passes.mjs'), 'utf8'); assert.equal((sp.match(/SCAN_PASS: '(public|private)'/g) || []).length, 2, 'both passes set SCAN_PASS');
});
test('main.yml: after a failed scan the evidence goes only through the private route, or the job says plainly it was not stored', () => {
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/main.yml'), 'utf8'), at = y.indexOf('      - if: failure()\n');
  assert.ok(at > y.indexOf('node scan-passes.mjs') && at < y.indexOf('bash .github/save-data.sh'), 'failure-only step sits between the scan and the save');
  const block = y.slice(at, y.indexOf('\n      - ', at + 5)), script = block.slice(block.indexOf('run: |') + 7).split('\n').map(l => l.slice(10)).join('\n');
  assert.doesNotMatch(block, /save-data\.sh|git push|git add/, 'nothing public is saved after a failure');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'failed-step-')); try {
    fs.mkdirSync(path.join(d, 'data')); fs.mkdirSync(path.join(d, '.github'));
    const sh = () => spawnSync('bash', ['-e', '-c', script], { cwd: d, encoding: 'utf8', env: { PATH: process.env.PATH, RUNNER_TEMP: d } });
    let r = sh(); assert.equal(r.status, 0); assert.match(r.stdout, /no failed private pass evidence/);
    fs.writeFileSync(path.join(d, 'data/private-failed-pass-2026-11-12T21-50-00-000Z.json'), '{}');
    r = sh(); assert.equal(r.status, 1, 'private mode off: not stored, fails visibly'); assert.match(r.stdout, /NOT stored privately/);
    fs.writeFileSync(path.join(d, '.github/private-data-mode'), '');
    r = sh(); assert.equal(r.status, 1, 'private mode but this job\'s pull did not succeed: nothing pushed'); assert.match(r.stdout, /private pull did not succeed in this job: nothing pushed/);
    fs.writeFileSync(path.join(d, 'private-pulled-ok'), '');   // the pull step's marker
    fs.writeFileSync(path.join(d, '.github/private-data.sh'), 'echo "$PRIVATE_DATA_TOKEN-stub $1" > pushed.txt\n');
    r = sh(); assert.equal(r.status, 0); assert.match(r.stdout, /stored in the private repository/); assert.match(fs.readFileSync(path.join(d, 'pushed.txt'), 'utf8'), /push/);
    fs.writeFileSync(path.join(d, '.github/private-data.sh'), 'exit 1\n'); r = sh(); assert.equal(r.status, 1, 'private save failed: fails visibly'); assert.match(r.stdout, /NOT stored privately/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('admission also counts ALL retained evidence (resolved sets included): a total ceiling, never pruning', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-total-')); try {
    const st = '2026-11-10T21-50-00-000Z'; fs.writeFileSync(path.join(d, FAILED_PREFIX + st + '.json'), '{}'); fs.writeFileSync(path.join(d, FAILED_PREFIX + st + '__x.json'), Buffer.alloc(5000));
    fs.writeFileSync(path.join(d, FAILED_PREFIX + st + '.disposition.json'), JSON.stringify({ resolved: true }));
    const lim = { unresolvedSets: 3, unresolvedBytes: 1 << 30, retainedBytes: (1 << 20) + 3000 };
    const a = privateAdmission(d, lim); assert.equal(a.ok, false); assert.match(a.reason, /all retained failed-pass evidence \(resolved included\)/);
    assert.ok(fs.existsSync(path.join(d, FAILED_PREFIX + st + '__x.json')), 'nothing deleted');
  } finally { fs.rmSync(d, { recursive: true, force: true }); } });
test('owner event ledgers (TRY SMALL, options shadow, owner skips) are critical, never size-skipped', () => {
  for (const r of ['tier2-ledger.jsonl', 'options-shadow.json', 'skipped.jsonl']) assert.ok(isCritical(r), r);
});
