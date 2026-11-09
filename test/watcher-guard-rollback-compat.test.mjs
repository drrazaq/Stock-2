// Standalone rev3 (Codex 6733778910, R-B): rollback compatibility of watcher-guard state. The pre-repair guard core from production
// main 6e72a8d0 is vendored byte-for-byte (sha256 pinned below) and run against the same data/watcher-guard.json as the repaired core,
// in both directions and in alternating cycles. Run: node --test test/watcher-guard-rollback-compat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { guardDecide as newDecide } from '../watcher-guard-core.mjs';
import { guardDecide as oldDecide } from './watcher-guard-core-pre-repair-6e72a8d0.fixture.mjs';

const at = (hm) => Date.parse('2026-11-10T' + hm + ':00Z');   // Tue 10 Nov 2026, New York = UTC-5
const nyMin = (hm) => { const [h, m] = hm.split(':').map(Number); return (h - 5) * 60 + m; };
const disk = (s) => JSON.parse(JSON.stringify(s));             // both CLIs persist JSON.stringify(out.state)
// The repaired CLI sets the reservation's transport status after guardDecide; `dispatched` is NOT touched there any more.
const newCli = (hm, runs, s, status = 'ACCEPTED', cfg = {}) => { const o = newDecide(at(hm), runs, s, undefined, cfg); if (o.dispatch) o.state.attempts.at(-1).status = status; return { ...o, state: disk(o.state) }; };
const oldCli = (hm, runs, s) => { const o = oldDecide(at(hm), runs, s); return { ...o, state: disk(o.state) }; };

test('vendored pre-repair core is byte-identical to production main 6e72a8d0', () => {
  const b = fs.readFileSync(new URL('./watcher-guard-core-pre-repair-6e72a8d0.fixture.mjs', import.meta.url));
  assert.equal(crypto.createHash('sha256').update(b).digest('hex'), '0ba5c9450661749d0e85d46f6af6206f1ee865219d0fdacc436b0d69f1c33527');
});

test('new -> old: every new reservation (ACCEPTED, REJECTED or UNKNOWN) is mirrored, so the old guard keeps 15-minute spacing', () => {
  for (const status of ['ACCEPTED', 'REJECTED', 'UNKNOWN']) {
    const a = newCli('14:12', [], {}, status);
    assert.equal(a.dispatch, true); assert.deepEqual(a.state.dispatched, [nyMin('14:12')]); assert.equal(a.state.attempts[0].status, status);
    assert.equal(oldCli('14:20', [], a.state).dispatch, false, status + ': old guard must wait 15 minutes');
    assert.equal(oldCli('14:27', [], a.state).dispatch, true, status + ': old guard may retry after 15 minutes');
  }
});

test('new -> old: the 3-attempt cap carries over; the old guard then sends its DOWN alert and never a fourth start', () => {
  let s = newCli('14:12', [], {}, 'REJECTED').state; s = newCli('14:27', [], s, 'UNKNOWN').state; s = newCli('14:42', [], s, 'ACCEPTED').state;
  assert.deepEqual(s.dispatched, [nyMin('14:12'), nyMin('14:27'), nyMin('14:42')]);
  const o = oldCli('14:58', [], s); assert.equal(o.dispatch, false); assert.match(o.alerts[0], /WATCHER DOWN/);
  assert.equal(oldCli('15:30', [], o.state).dispatch, false);
});

test('old -> new: a reservation the old guard added after a new one is reconciled as UNCONFIRMED_LEGACY, never as accepted', () => {
  const a = newCli('14:12', [], {}, 'REJECTED'); const b = oldCli('14:27', [], a.state);
  assert.equal(b.dispatch, true); assert.equal(b.state.version, 2); assert.equal(b.state.attempts.length, 1, 'old guard does not write attempts');
  const c = newCli('14:35', [], b.state);
  assert.equal(c.dispatch, false, 'spacing counts the old reservation');
  assert.deepEqual(c.state.attempts, [{ min: nyMin('14:12'), status: 'REJECTED' }, { min: nyMin('14:27'), status: 'UNCONFIRMED_LEGACY' }]);
  assert.deepEqual(c.state.dispatched, [nyMin('14:12'), nyMin('14:27')]);
  assert.equal(c.state.attempts.some(x => x.status === 'ACCEPTED'), false);
});

test('old -> new -> old -> new: alternating guards never exceed 3 starts, keep spacing, and never invent an acceptance', () => {
  const guards = [oldCli, newCli, oldCli, newCli, oldCli, newCli, oldCli, newCli];
  let s = {}, starts = [], last = null;
  for (let i = 0; i < 16; i++) {
    const t = 14 * 60 + 10 + i * 5, hm = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
    const g = guards[i % guards.length], o = g === newCli ? newCli(hm, [], s, 'UNKNOWN') : g(hm, [], s);
    if (o.dispatch) { const m = nyMin(hm); if (last !== null) assert.ok(m - last >= 15, 'spacing at ' + hm); starts.push(m); last = m; }
    s = o.state;
  }
  assert.equal(starts.length, 3);
  const fin = newCli('16:30', [], s).state;
  assert.deepEqual(fin.dispatched, starts); assert.deepEqual(fin.attempts.map(x => x.min), starts);
  assert.equal(fin.attempts.some(x => x.status === 'ACCEPTED'), false);
});

test('legacy-only state (no version) is read as UNCONFIRMED_LEGACY attempts, as before rev3', () => {
  const s = oldCli('14:12', [], {}).state; assert.equal(s.version, undefined);
  const o = newCli('14:20', [], s); assert.equal(o.dispatch, false);
  assert.deepEqual(o.state.attempts, [{ min: nyMin('14:12'), status: 'UNCONFIRMED_LEGACY' }]); assert.deepEqual(o.state.dispatched, [nyMin('14:12')]);
});

test('repeated new-guard reads are idempotent: no duplicate attempts from the mirror', () => {
  let s = newCli('14:12', [], {}, 'ACCEPTED').state;
  for (const hm of ['14:15', '14:20', '14:25']) s = newCli(hm, [{ status: 'queued', created_at: '2026-11-10T14:13:00Z' }], s).state;
  assert.deepEqual(s.attempts, [{ min: nyMin('14:12'), status: 'ACCEPTED' }]); assert.deepEqual(s.dispatched, [nyMin('14:12')]);
});

test('visible running, queued or history-UNKNOWN never dispatch under the new guard, whatever an old guard left behind', () => {
  const legacy = oldCli('14:12', [], {}).state;
  const running = [{ status: 'in_progress', created_at: '2026-11-10T14:28:00Z', jobEvidence: 'MEASURED', jobStartedAt: '2026-11-10T14:28:30Z' }];
  const unmeasured = [{ status: 'in_progress', created_at: '2026-11-10T14:28:00Z' }];
  const queued = [{ status: 'queued', created_at: '2026-11-10T14:28:00Z' }];
  for (const s of [{}, legacy]) {
    assert.equal(newCli('14:30', running, s).dispatch, false);
    assert.equal(newCli('14:30', unmeasured, s).dispatch, false);
    const q = newCli('14:30', queued, s); assert.equal(q.dispatch, false); assert.match(q.alerts[0], /WATCHER WAITING/);
    const h = newCli('14:30', [], s, 'ACCEPTED', { historyComplete: false }); assert.equal(h.dispatch, false); assert.match(h.alerts[0], /WATCHER HISTORY UNKNOWN/);
  }
});

test('no warning removed: NOT STARTED, DOWN, LATE and STOPPED EARLY still fire under the new guard after a rollback cycle', () => {
  let s = oldCli('14:12', [], {}).state; let o = newCli('14:27', [], s, 'UNKNOWN'); assert.match(o.alerts[0], /WATCHER NOT STARTED by 09:27.*attempt 2 of 3/);
  o = newCli('14:42', [], o.state, 'REJECTED'); assert.match(o.alerts[0], /attempt 3 of 3/);
  o = newCli('14:58', [], o.state); assert.match(o.alerts[0], /WATCHER DOWN/);
  const late = newCli('15:15', [{ status: 'in_progress', created_at: '2026-11-10T15:10:00Z', jobEvidence: 'MEASURED', jobStartedAt: '2026-11-10T15:10:10Z' }], s);
  assert.match(late.alerts.join('\n'), /WATCHER STARTED LATE/);
  const stop = newCli('16:30', [{ id: 7, status: 'completed', created_at: '2026-11-10T14:20:00Z', jobEvidence: 'MEASURED', jobStartedAt: '2026-11-10T14:20:10Z', jobCompletedAt: '2026-11-10T16:00:00Z' }], s);
  assert.match(stop.alerts.join('\n'), /WATCHER STOPPED EARLY/);
});

test('guardRequestAccepted (CLI) is computed from attempt statuses, not from the reservation mirror', () => {
  const src = fs.readFileSync(new URL('../watcher-guard.mjs', import.meta.url), 'utf8');
  assert.match(src, /guardRequestAccepted:out\.state\.attempts\.some\(a=>a\.status==='ACCEPTED'\)/);
  assert.doesNotMatch(src, /dispatched\.push/);
  const rej = newCli('14:12', [], {}, 'REJECTED').state; assert.equal(rej.dispatched.length, 1); assert.equal(rej.attempts.some(a => a.status === 'ACCEPTED'), false);
  const acc = newCli('14:12', [], {}, 'ACCEPTED').state; assert.equal(acc.attempts.some(a => a.status === 'ACCEPTED'), true);
});
