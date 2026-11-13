// Watcher reservations move to the EXISTING private data repository (Codex 6854715808 (2)). Local bare repositories only, synthetic records.
// Custody admission (prepare offline; admit = bound clone + custody record + public quiescence + no state regression) and the route
// (private mode: custody-admitted private clone only, never a public fallback; pre-cutover: the existing public publisher, unchanged).
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execSync } from 'node:child_process'; import { createHash } from 'node:crypto';
import { admit, prepare } from '../watcher-custody.mjs'; import { reservationPersist, reservationRouteStatus } from '../watcher-reservation-route.mjs';
const ENV0 = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
const sh = (c, cwd) => execSync(c, { cwd, env: ENV0, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const W = (d, f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const DAY = '2026-11-12', key = (k) => createHash('sha256').update(k).digest('hex');
const rec = (k, state, extra = {}) => JSON.stringify({ version: 2, day: DAY, keySha256: key(k), owner: 'o1', state, at: '2026-11-12T15:00:00.000Z', attempts: 1, ...extra });
const NS = 'data/watcher-message-state/' + DAY + '/';
function world({ mode = true } = {}) {
  const top = tmp('wc-'), pubBare = path.join(top, 'pub.git'), privBare = path.join(top, 'priv.git'), pub = path.join(top, 'pub'), run = path.join(top, 'run'), dir = path.join(run, 'private-data');
  sh('git init -q --bare -b main ' + pubBare + ' && git init -q --bare -b main ' + privBare, top); fs.mkdirSync(run);
  sh('git clone -q ' + pubBare + ' pub', top);
  W(pub, NS + key('stop:ZZA:stop') + '.json', rec('stop:ZZA:stop', 'ACKNOWLEDGED')); W(pub, NS + key('stop:ZZB:stop') + '.json', rec('stop:ZZB:stop', 'RESERVED'));
  W(pub, 'data/public.json', '{}'); if (mode) W(pub, '.github/private-data-mode', '');
  sh('git add -A && git commit -qm base && git push -q -u origin main', pub);
  const seed = path.join(top, 'seed'); sh('git clone -q ' + privBare + ' seed', top); W(seed, 'data/my-positions.json', '{}'); sh('git add -A && git commit -qm s && git push -q -u origin main', seed);
  sh('git clone -q ' + privBare + ' ' + dir, top);
  const env = { ...ENV0, PRIVATE_DATA_URL: privBare, PRIVATE_DATA_DIR: dir, RUNNER_TEMP: run };
  const importCustody = (mutate, { drain = true } = {}) => { const out = path.join(top, 'import-' + Math.random().toString(36).slice(2)); prepare(out, { root: pub });
    if (drain) { const cf = path.join(out, 'data/watcher-message-state/CUSTODY.json'), c = JSON.parse(fs.readFileSync(cf, 'utf8')); c.oldWriterDrain = { method: 'synthetic fixture', evidence: 'synthetic: legacy writer excluded', at: '2026-11-13T00:00:00Z' }; fs.writeFileSync(cf, JSON.stringify(c)); }
    if (mutate) mutate(out); sh('cp -r ' + out + '/data/. data/ && git add -A && git commit -qm custody && git push -q', seed); };
  const files = (bare) => sh('git --git-dir=' + bare + ' ls-tree -r --name-only main', top).split('\n').filter(Boolean);
  return { top, pub, pubBare, privBare, dir, run, env, seed, importCustody, files };
}
test('prepare is offline: the custody import lists every public reservation with its blob id; neither repository changes', () => {
  const w = world(), before = [w.files(w.pubBare), w.files(w.privBare)], out = path.join(w.top, 'imp'); const r = prepare(out, { root: w.pub });
  assert.equal(r.files, 2); const c = JSON.parse(fs.readFileSync(path.join(out, 'data/watcher-message-state/CUSTODY.json'), 'utf8'));
  assert.equal(c.version, 1); assert.equal(Object.keys(c.files).length, 2); assert.match(c.publicCommit, /^[0-9a-f]{40}$/);
  assert.deepEqual([w.files(w.pubBare), w.files(w.privBare)], before);
});
test('a blank private namespace is NOT admitted: no install, no receipt (no replay of delivered or uncertain messages)', () => {
  const w = world(); const r = admit({ root: w.pub, env: w.env }); assert.deepEqual(r, { status: 'NOT_ADMITTED', reason: 'NO_CUSTODY_RECORD' });
  assert.ok(!fs.existsSync(path.join(w.run, 'watcher-custody-admitted.json')));
});
test('custody imported exactly: ADMITTED, the private namespace is installed for readers, the receipt binds the private commit', () => {
  const w = world(); w.importCustody(); const r = admit({ root: w.pub, env: w.env }); assert.equal(r.status, 'ADMITTED', JSON.stringify(r));
  assert.ok(JSON.parse(fs.readFileSync(path.join(w.run, 'watcher-custody-admitted.json'), 'utf8')).privateCommit);
});
test('snapshot equality (NOT a quiescence proof): a public reservation written after the snapshot blocks admission', () => {
  const w = world(); w.importCustody(); W(w.pub, NS + key('stop:ZZC:stop') + '.json', rec('stop:ZZC:stop', 'RESERVED')); sh('git add -A && git commit -qm late', w.pub);
  assert.deepEqual(admit({ root: w.pub, env: w.env }), { status: 'NOT_ADMITTED', reason: 'PUBLIC_NAMESPACE_CHANGED_SINCE_SNAPSHOT' });
});
test('state regression or a missing reservation blocks admission; a valid later private state is accepted', () => {
  let w = world(); w.importCustody((out) => fs.writeFileSync(path.join(out, NS + key('stop:ZZA:stop') + '.json'), rec('stop:ZZA:stop', 'UNSENT')));
  assert.deepEqual(admit({ root: w.pub, env: w.env }), { status: 'NOT_ADMITTED', reason: 'STATE_REGRESSION' });
  w = world(); w.importCustody((out) => fs.writeFileSync(path.join(out, NS + key('stop:ZZA:stop') + '.json'), rec('stop:ZZA:stop', 'UNCERTAIN')));
  assert.deepEqual(admit({ root: w.pub, env: w.env }), { status: 'NOT_ADMITTED', reason: 'STATE_REGRESSION' }, 'a terminal public state must stay exactly that state');
  w = world(); w.importCustody((out) => fs.rmSync(path.join(out, NS + key('stop:ZZB:stop') + '.json')));
  assert.deepEqual(admit({ root: w.pub, env: w.env }), { status: 'NOT_ADMITTED', reason: 'CUSTODY_INCOMPLETE' });
  w = world(); w.importCustody((out) => fs.writeFileSync(path.join(out, NS + key('stop:ZZB:stop') + '.json'), rec('stop:ZZB:stop', 'ACKNOWLEDGED')));
  assert.equal(admit({ root: w.pub, env: w.env }).status, 'ADMITTED', 'RESERVED -> ACKNOWLEDGED is a later state');
});
const reservation = (k) => ({ file: NS + key(k) + '.json', record: { version: 2, day: DAY, keySha256: key(k), owner: 'o2', state: 'RESERVED', at: '2026-11-12T15:01:00.000Z', attempts: 1 } });
test('private mode without custody admission: PRIVATE_RESERVATION_UNAVAILABLE and nothing is written to EITHER repository (no public fallback)', () => {
  const w = world(), before = [w.files(w.pubBare), w.files(w.privBare)], r0 = reservation('stop:ZZD:stop');
  const r = reservationPersist({ env: w.env, root: w.pub })(r0.file, { record: r0.record, phase: 'reserve', cwd: w.pub });
  assert.deepEqual(r, { ok: false, reason: 'PRIVATE_RESERVATION_UNAVAILABLE' }); assert.deepEqual([w.files(w.pubBare), w.files(w.privBare)], before);
});
test('private mode, custody admitted: the reservation is published by the unchanged CAS publisher to the PRIVATE repository only', () => {
  const w = world(); w.importCustody(); assert.equal(admit({ root: w.pub, env: w.env }).status, 'ADMITTED');
  const pubBefore = w.files(w.pubBare), r0 = reservation('stop:ZZD:stop');
  const r = reservationPersist({ env: w.env, root: w.pub })(r0.file, { record: r0.record, phase: 'reserve', cwd: w.pub }); assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(w.files(w.privBare).includes(r0.file)); assert.deepEqual(w.files(w.pubBare), pubBefore, 'public repository untouched');
  const again = reservationPersist({ env: w.env, root: w.pub })(r0.file, { record: { ...r0.record, owner: 'o3' }, phase: 'reserve', cwd: w.pub });
  assert.equal(again.reason, 'EXISTING_RESERVATION', 'existing CAS/no-replay semantics hold on the private namespace');
});
test('without independent old-writer drain/exclusion evidence in CUSTODY.json the exact snapshot is still NOT admitted', () => {
  const w = world(); w.importCustody(null, { drain: false }); assert.deepEqual(admit({ root: w.pub, env: w.env }), { status: 'NOT_ADMITTED', reason: 'NO_OLD_WRITER_DRAIN_EVIDENCE' });
  assert.ok(!fs.existsSync(path.join(w.run, 'watcher-custody-admitted.json')));
});
test('a clone bound to another remote is refused even with a receipt; pre-cutover there is NO public path (unavailable, nothing written) and the status says so', () => {
  const w = world(); w.importCustody(); admit({ root: w.pub, env: w.env }); assert.deepEqual(reservationRouteStatus({ env: w.env, root: w.pub }), { liveSends: 'PRIVATE', reason: null });
  sh('git remote set-url origin ' + w.pubBare, w.dir); assert.deepEqual(reservationRouteStatus({ env: w.env, root: w.pub }), { liveSends: 'UNAVAILABLE', reason: 'CLONE_NOT_BOUND' });
  const r0 = reservation('stop:ZZE:stop'); assert.deepEqual(reservationPersist({ env: w.env, root: w.pub })(r0.file, { record: r0.record, phase: 'reserve' }), { ok: false, reason: 'PRIVATE_RESERVATION_UNAVAILABLE' });
  const v = world({ mode: false }), r1 = reservation('stop:ZZF:stop'), before = [v.files(v.pubBare), v.files(v.privBare)];
  assert.deepEqual(reservationPersist({ env: v.env, root: v.pub })(r1.file, { record: r1.record, phase: 'reserve', cwd: v.pub }), { ok: false, reason: 'PRIVATE_RESERVATION_UNAVAILABLE' });
  assert.deepEqual([v.files(v.pubBare), v.files(v.privBare)], before, 'no public publication path; nothing written anywhere');
  assert.deepEqual(reservationRouteStatus({ env: v.env, root: v.pub }), { liveSends: 'UNAVAILABLE', reason: 'PRIVATE_ROUTE_NOT_ADOPTED' });
});

// Codex 6855604445 (verbatim): a rejected readmission revokes the earlier receipt.
test('rejected readmission revokes prior receipt',()=>{const w=world();w.importCustody();assert.equal(admit({root:w.pub,env:w.env}).status,'ADMITTED');W(w.pub,NS+key('stop:ZZL:stop')+'.json',rec('stop:ZZL:stop','RESERVED'));sh('git add -A && git commit -qm late',w.pub);assert.equal(admit({root:w.pub,env:w.env}).status,'NOT_ADMITTED');let called=false;const r=reservationPersist({root:w.pub,env:w.env,publish:()=>{called=true;return {ok:true};}})('data/unused.json',{});assert.equal(called,false);assert.equal(r.ok,false);});
