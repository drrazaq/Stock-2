// Scanner guard revision 3 (development proposal): Codex review 6758807819 G1-G6 and 6761146322 (shared slots, one-day pilot, no successor). Pure decisions plus the actual CLI with real git
// (a local bare "remote", two clones) and a loopback GitHub/Telegram stub. No network, no live dispatch.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { approvalCurrent, scannerGuardDecide, latestCompletedSession, validateRuns, validateSignals, validateState, reserveAttempt, finishAttempt, reserveAlert, alertOutcome, finishAlert, pendingRetries, classifySlots, SLOTS, LIMITS } from '../scanner-guard-core.mjs';

const T = (s) => Date.parse(s);
const APPROVAL = { pilotDay: '2026-11-09' }, PILOT10 = { pilotDay: '2026-11-10' };
const runs = (list) => ({ total_count: list.length, workflow_runs: list });
const run = (id, status, created, title = 'Stock scanner') => ({ id, status, created_at: created, display_title: title, event: 'schedule' });
const DONE = [run(42321580565, 'completed', '2026-11-07T01:00:15Z')];
const SIG6 = { session: '2026-11-06', generatedAt: '2026-11-07T01:00:20Z' };
const base = (over = {}) => ({ approval: APPROVAL, runs: { main: runs(DONE), bot: runs([]) }, signals: SIG6, state: null, ...over });
const decide = (nowIso, over) => scannerGuardDecide({ nowMs: T(nowIso), ...base(over) });

test('G2: an UNCERTAIN, RESERVED or unmatched ACCEPTED attempt quarantines; no new key after 61 min or later', () => {
  for (const http of [null, 500, 204]) {
    let o = decide('2026-11-09T22:20:00Z'); const d = o.dispatches[0]; assert.equal(d.key, 'nightly:2026-11-09:1');
    reserveAttempt(o.state, d, T('2026-11-09T22:20:00Z')); if (http !== 'reserved') finishAttempt(o.state, d.key, http, T('2026-11-09T22:20:01Z'));
    for (const t of ['2026-11-09T23:21:00Z', '2026-11-10T00:30:00Z']) {
      const n = decide(t, { state: o.state });
      assert.equal(n.dispatches.filter(x => x.kind === 'nightly').length, 0, 'http ' + http + ' at ' + t);
      assert.ok(n.why.some(w => /QUARANTINED/.test(w)));
    }
    const late = decide('2026-11-09T22:55:00Z', { state: o.state });
    assert.ok(late.alerts.some(a => a.key === 'unresolved:nightly:2026-11-09:1'), 'one visible unresolved alert after 30 min');
  }
  // a crash right after the reservation leaves RESERVED: same quarantine
  const o = decide('2026-11-09T22:20:00Z'); reserveAttempt(o.state, o.dispatches[0], T('2026-11-09T22:20:00Z'));
  assert.equal(decide('2026-11-09T23:30:00Z', { state: o.state }).dispatches.length, 0);
});

test('G2: only an exact run-name match resolves an attempt; a definite refusal releases it; time proximity never does', () => {
  const o = decide('2026-11-09T22:20:00Z'); const d = o.dispatches[0];
  reserveAttempt(o.state, d, T('2026-11-09T22:20:00Z')); finishAttempt(o.state, d.key, 204, T('2026-11-09T22:20:01Z'));
  // an unrelated run created one second later (no matching name) does not resolve it
  const near = runs([run(9, 'completed', '2026-11-09T22:20:02Z'), ...DONE]);
  assert.equal(decide('2026-11-09T23:25:00Z', { state: o.state, runs: { main: near, bot: runs([]) } }).dispatches.length, 0);
  const matched = runs([run(10, 'completed', '2026-11-09T22:21:00Z', 'Stock scanner guard nightly:2026-11-09:1'), ...DONE]);
  const m = decide('2026-11-09T23:25:00Z', { state: o.state, runs: { main: matched, bot: runs([]) } });
  assert.equal(m.state.attempts[0].runId, 10); assert.equal(m.dispatches.length, 0, 'executed but signals still stale: no second nightly (max 1); alert instead');
  assert.ok(m.alerts.some(a => a.key === 'nightly-limit:2026-11-09'));
  const r = decide('2026-11-09T22:20:00Z'); reserveAttempt(r.state, r.dispatches[0], T('2026-11-09T22:20:00Z')); finishAttempt(r.state, r.dispatches[0].key, 422, T('2026-11-09T22:20:01Z'));
  assert.equal(decide('2026-11-09T23:21:00Z', { state: r.state }).dispatches[0].key, 'nightly:2026-11-09:2', 'definite refusal is not an execution');
  // intraday: same quarantine inside the day
  const S9 = { approval: PILOT10, signals: { session: '2026-11-09', generatedAt: '2026-11-10T03:41:07Z' } };
  const i = decide('2026-11-10T15:01:00Z', S9);
  assert.equal(i.dispatches[0].key, 'intraday:2026-11-10:1440'); reserveAttempt(i.state, i.dispatches[0], T('2026-11-10T15:01:00Z'));
  assert.equal(decide('2026-11-10T16:01:00Z', { ...S9, state: i.state }).dispatches.length, 0, 'later slots quarantined');
});

test('G3: corrupt state, malformed/incomplete/future run lists and invalid or future saved sessions fail closed', () => {
  for (const bad of [{}, { version: 2 }, { version: 2, attempts: [{ key: 'x' }], alerts: {}, log: [] }, { version: 1, attempts: [], alerts: {}, log: [] },
    { version: 2, attempts: [{ key: 'k', kind: 'nightly', scope: 'd', at: T('2027-01-01T00:00:00Z'), outcome: 'ACCEPTED', http: 204, runId: null }], alerts: {}, log: [] }]) {
    const o = decide('2026-11-09T22:20:00Z', { state: bad }); assert.equal(o.ok, false); assert.equal(o.dispatches.length, 0); assert.match(o.why[0], /corrupt/);
  }
  assert.equal(validateState(null, T('2026-11-09T22:20:00Z')).initial, true, 'missing (no branch) differs from corrupt');
  for (const bad of [{}, { workflow_runs: [] }, { total_count: 0 }, { total_count: 0, workflow_runs: [run(1, 'completed', '2026-11-09T22:00:00Z')] },
    runs([{ ...run(1, 'completed', '2026-11-09T22:00:00Z'), status: 'weird' }]), runs([run(1, 'completed', '2027-01-01T00:00:00Z')]), runs([{ ...run(1, 'queued', 'yesterday') }]), null]) {
    const o = decide('2026-11-09T22:20:00Z', { runs: { main: bad, bot: runs([]) } }); assert.equal(o.ok, false); assert.equal(o.dispatches.length, 0);
  }
  const L = '2026-11-09', now = T('2026-11-09T22:20:00Z');
  assert.match(validateSignals({ session: '2099-01-01', generatedAt: '2026-11-09T22:00:00Z' }, now, L).why, /reviewed open session|after the latest/);
  assert.match(validateSignals({ session: '2026-11-10', generatedAt: '2026-11-09T22:00:00Z' }, now, L).why, /after the latest completed/);
  assert.match(validateSignals({ session: '2026-11-09', generatedAt: '2026-11-09T18:00:00Z' }, now, L).why, /before its session completed/);
  assert.match(validateSignals({ session: '2026-11-07', generatedAt: '2026-11-09T22:00:00Z' }, now, L).why, /reviewed open session/);
  for (const sig of [{ session: '2099-01-01', generatedAt: '2026-11-09T22:00:00Z' }, null, { session: '2026-11-06' }]) {
    const o = decide('2026-11-09T22:20:00Z', { signals: sig });
    assert.equal(o.dispatches.filter(d => d.kind === 'nightly').length, 0, JSON.stringify(sig)); assert.ok(o.alerts.some(a => /^signals:/.test(a.key)));
  }
});

test('G6: no approval -> nothing; one pilot day only; ONE conditional nightly; start cutoff 01:00 UTC so completion <= 06:00 UTC', () => {
  assert.equal(LIMITS.nightlyStartCutoffUtcMin + LIMITS.mainTimeoutMin, LIMITS.nightlyCompletionBoundUtcMin, 'start cutoff + timeout = completion bound');
  assert.equal(LIMITS.maxDispatches, 17); assert.equal(SLOTS.length, 16); assert.equal(LIMITS.nightlyMaxAttempts, 1);
  for (const approval of [null, {}, { pilotDay: '2026-11-08' }, { pilotDay: '2026-11-26' }, { pilotDay: '2099-01-05' }, { pilotDay: '2026-11-10' }])
    assert.equal(decide('2026-11-09T22:20:00Z', { approval }).dispatches.length, 0, JSON.stringify(approval));
  assert.equal(decide('2026-11-10T00:59:00Z').dispatches[0].kind, 'nightly');
  const late = decide('2026-11-10T01:00:00Z'); assert.equal(late.dispatches.length, 0); assert.ok(late.alerts.some(a => a.key === 'nightly-missed:2026-11-09'));
  for (const h of ['06:00', '09:00', '10:30', '13:30']) assert.equal(decide('2026-11-10T' + h + ':00Z').dispatches.length, 0, h);
  // one nightly only: an executed (matched) attempt that left signals stale gives an alert, not a second start
  const o = decide('2026-11-09T22:20:00Z'); reserveAttempt(o.state, o.dispatches[0], T('2026-11-09T22:20:00Z')); finishAttempt(o.state, o.dispatches[0].key, 204, T('2026-11-09T22:20:01Z'));
  const m = decide('2026-11-09T23:40:00Z', { state: o.state, runs: { main: runs([run(10, 'completed', '2026-11-09T22:21:00Z', 'Stock scanner guard nightly:2026-11-09:1'), ...DONE]) } });
  assert.equal(m.dispatches.length, 0); assert.ok(m.alerts.some(a => a.key === 'nightly-limit:2026-11-09'));
});

test('shared slots: the schedule keeps each slot for 20 min; one assisted start per slot; natural late events counted where they arrive', () => {
  const S = { approval: PILOT10, signals: { session: '2026-11-09', generatedAt: '2026-11-10T03:41:07Z' } };
  assert.equal(decide('2026-11-10T13:25:00Z', S).dispatches.length, 0, 'inside the natural grace');
  assert.equal(decide('2026-11-10T13:30:00Z', S).dispatches[0].key, 'intraday:2026-11-10:1310', 'assist at slot+20');
  const nat = runs([run(5, 'completed', '2026-11-10T13:12:00Z'), ...DONE]);
  assert.equal(decide('2026-11-10T13:31:00Z', { ...S, runs: { main: nat } }).dispatches.length, 0, 'natural run covered the slot');
  const o = decide('2026-11-10T13:30:00Z', S); reserveAttempt(o.state, o.dispatches[0], T('2026-11-10T13:30:00Z')); finishAttempt(o.state, o.dispatches[0].key, 204, T('2026-11-10T13:30:01Z'));
  const done = runs([run(6, 'completed', '2026-11-10T13:31:00Z', 'Stock scanner guard intraday:2026-11-10:1310'), ...DONE]);
  const n2 = decide('2026-11-10T13:35:00Z', { ...S, state: o.state, runs: { main: done } }); assert.equal(n2.dispatches.length, 0, 'one per slot');
  assert.equal(decide('2026-11-10T14:00:00Z', { ...S, state: n2.state, runs: { main: done } }).dispatches[0].key, 'intraday:2026-11-10:1340', 'next slot is its own');
  // classification for review: natural, assisted, unknown, missed, open
  const st = validateState(null, 0).state; st.attempts.push({ key: 'intraday:2026-11-10:1340', kind: 'intraday', scope: '2026-11-10', at: T('2026-11-10T14:00:00Z'), outcome: 'UNCERTAIN', http: null, runId: null });
  st.attempts.push({ key: 'intraday:2026-11-10:1310', kind: 'intraday', scope: '2026-11-10', at: T('2026-11-10T13:30:00Z'), outcome: 'ACCEPTED', http: 204, runId: 6 });
  const late = validateRuns(runs([run(7, 'completed', '2026-11-10T14:15:00Z'), run(6, 'completed', '2026-11-10T13:31:00Z', 'Stock scanner guard intraday:2026-11-10:1310')]), T('2026-11-10T16:00:00Z')).runs;
  const c = classifySlots('2026-11-10', late, st, T('2026-11-10T16:00:00Z'));
  assert.deepEqual(c.slice(0, 6).map(x => x.slot + ' ' + x.status), ['1310 ASSISTED', '1340 UNKNOWN', '1410 NATURAL', '1440 MISSED', '1510 MISSED', '1540 OPEN']);
  assert.equal(decide('2026-11-11T15:01:00Z', S).dispatches.length, 0, 'not the pilot day');
});

test('G5: alert records: ACK needs an explicit Telegram acknowledgement; RETRY bounded; PENDING and UNKNOWN are never resent', () => {
  assert.equal(alertOutcome(200, { ok: true, result: { message_id: 5 } }), 'ACK');
  for (const [h, b] of [[200, { ok: true }], [200, { ok: false }], [200, null], [500, null], [null, null], [502, {}]]) assert.equal(alertOutcome(h, b), 'UNKNOWN');
  for (const h of [400, 403, 429]) assert.equal(alertOutcome(h, {}), 'RETRY');
  const st = validateState(null, 0).state, a = { key: 'k', text: 'x' };
  assert.equal(reserveAlert(st, a, 1), true); assert.equal(reserveAlert(st, a, 2), false, 'PENDING (crash) is never resent');
  finishAlert(st, 'k', 'UNKNOWN', 3); assert.equal(reserveAlert(st, a, 4), false); assert.deepEqual(pendingRetries(st), []);
  const r = validateState(null, 0).state;
  for (let i = 1; i <= LIMITS.alertMaxAttempts; i++) { assert.equal(reserveAlert(r, a, i), true); finishAlert(r, 'k', 'RETRY', i); }
  assert.equal(r.alerts.k.status, 'REFUSED'); assert.equal(reserveAlert(r, a, 9), false); assert.deepEqual(pendingRetries(r), []);
});

test('G4: operative main.yml expressions and admission: only empty (legacy forced daily), daily, intraday; typos refused before data', () => {
  const y = fs.readFileSync(new URL('../.github/workflows/main.yml', import.meta.url), 'utf8');
  const expr = (name) => y.match(new RegExp('^\\s+' + name + ': \\$\\{\\{ (.*) \\}\\}$', 'm'))[1];
  const admission = y.slice(y.indexOf('ok=0'), y.indexOf('echo "scanner start: '));
  for (const [mode, slot, wantMode, wantForce, admitted] of [
    ['', '', 'daily', '1', true], ['daily', '', 'daily', '', true], ['intraday', '', 'intraday', '', true],
    ['daily', 'nightly:2026-11-09:1', 'daily', '', true], ['intraday', 'intraday:2026-11-10:3', 'intraday', '', true],
    ['dayly', '', 'daily', '', false], ['DAILY', '', 'DAILY', '', false], [' daily', '', 'daily', '', false], ['intraday', 'nightly:2026-11-09:1', 'intraday', '', false],
    ['', 'nightly:2026-11-09:1', 'daily', '1', false], ['daily', 'nightly:2026-11-09:1;rm', 'daily', '', false]]) {
    const ctx = { 'github.event_name': 'workflow_dispatch', 'github.event.schedule': '', 'inputs.mode': mode, 'inputs.slot': slot };
    assert.equal(ghEval(expr('FORCE'), ctx), wantForce, 'FORCE ' + JSON.stringify(mode));
    const m = ghEval(expr('MODE'), ctx); if (admitted) assert.equal(m, wantMode, 'MODE ' + JSON.stringify(mode));
    const res = spawnSync('bash', ['-c', admission + '\necho ADMITTED'], { MODE_INPUT: ghEval(expr('MODE_INPUT'), ctx), GUARD_SLOT: ghEval(expr('GUARD_SLOT'), ctx) });
    assert.equal(/ADMITTED/.test(res), admitted, JSON.stringify([mode, slot]) + ' ' + res);
  }
  const sched = { 'github.event_name': 'schedule', 'github.event.schedule': '30 21 * * 1-5', 'inputs.mode': '', 'inputs.slot': '' };
  assert.equal(ghEval(expr('MODE'), sched), 'daily'); assert.equal(ghEval(expr('FORCE'), sched), '');
  assert.equal(ghEval(expr('MODE'), { ...sched, 'github.event.schedule': '10,40 13-20 * * 1-5' }), 'intraday');
  assert.match(y, /run-name: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.slot != '' && format\('Stock scanner guard \{0\}', inputs\.slot\) \|\| 'Stock scanner' \}\}/);
});
function spawnSync(cmd, args, env) { try { return execFileSync(cmd, args, { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } }); } catch (e) { return String(e.stdout || '') + 'EXIT' + e.status; } }
// Minimal GitHub Actions expression evaluator for the operators used here: literals, context paths, ==, != (case-insensitive strings,
// as GitHub compares), &&/|| returning operands, parentheses, format(). Unknown syntax throws.
function ghEval(src, ctx) {
  const toks = src.match(/'(?:[^']|'')*'|&&|\|\||==|!=|[()]|,|[A-Za-z_][\w.]*/g); let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const truthy = (v) => v !== '' && v !== null && v !== false && v !== 0;
  const prim = () => { const t = next();
    if (t === '(') { const v = or(); if (next() !== ')') throw Error('paren'); return v; }
    if (t[0] === "'") return t.slice(1, -1).replace(/''/g, "'");
    if (t === 'format') { next(); const fmt = or(); const args = []; while (peek() === ',') { next(); args.push(or()); } next(); return fmt.replace(/\{(\d)\}/g, (_, k) => args[k]); }
    if (!(t in ctx)) throw Error('unknown ' + t); return ctx[t]; };
  const cmp = () => { let l = prim(); while (peek() === '==' || peek() === '!=') { const op = next(), r = prim(), eq = String(l).toLowerCase() === String(r).toLowerCase(); l = op === '==' ? eq : !eq; } return l; };
  const and = () => { let l = cmp(); while (peek() === '&&') { next(); const r = cmp(); l = truthy(l) ? r : l; } return l; };
  const or = () => { let l = and(); while (peek() === '||') { next(); const r = and(); l = truthy(l) ? l : r; } return l; };
  const v = or(); if (i !== toks.length) throw Error('trailing'); return v === false ? '' : v;
}


test('pilot-day window and guard-run identity are pinned directly', () => {
  const A = { pilotDay: '2026-11-10' };
  assert.equal(approvalCurrent(A, T('2026-11-10T13:09:59Z')).ok, false, 'before the first slot');
  assert.equal(approvalCurrent(A, T('2026-11-10T13:10:00Z')).ok, true);
  assert.equal(approvalCurrent(A, T('2026-11-11T00:59:59Z')).ok, true, 'conditional nightly window');
  assert.equal(approvalCurrent(A, T('2026-11-11T01:00:00Z')).ok, false, 'pilot ends at the nightly start cutoff');
  // a LATE guard run for slot 13:40 arriving inside the 14:10 window must not make 14:10 look naturally covered
  const st = validateState(null, 0).state;
  st.attempts.push({ key: 'intraday:2026-11-10:1340', kind: 'intraday', scope: '2026-11-10', at: T('2026-11-10T14:00:00Z'), outcome: 'ACCEPTED', http: 204, runId: null });
  const r = validateRuns(runs([run(8, 'completed', '2026-11-10T14:12:00Z', 'Stock scanner guard intraday:2026-11-10:1340')]), T('2026-11-10T14:35:00Z')).runs;
  const c = classifySlots('2026-11-10', r, structuredClone(st), T('2026-11-10T14:35:00Z'));
  assert.equal(c[1].status, 'UNKNOWN', 'not yet reconciled in this pure call'); assert.equal(c[2].status, 'OPEN', '14:10 is not natural');
  const d = scannerGuardDecide({ nowMs: T('2026-11-10T14:35:00Z'), approval: A, runs: { main: runs([run(8, 'completed', '2026-11-10T14:12:00Z', 'Stock scanner guard intraday:2026-11-10:1340')]) }, signals: { session: '2026-11-09', generatedAt: '2026-11-10T03:41:07Z' }, state: st });
  assert.equal(d.state.attempts[0].runId, 8, 'reconciled to its own slot');
  assert.deepEqual(d.dispatches.map(x => x.key), ['intraday:2026-11-10:1410'], 'the 14:10 slot is still assisted');
});

// ---------- G1: actual CLI with real git remote state ----------
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
function world(t, { signals = SIG6 } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sg2-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const bare = path.join(d, 'remote.git'); g(d, 'init', '-q', '--bare', bare);
  const clone = (name) => { const c = path.join(d, name); fs.mkdirSync(c); g(c, 'init', '-q'); g(c, 'remote', 'add', 'origin', bare);
    for (const f of ['scanner-guard.mjs', 'scanner-guard-core.mjs', 'market-session.mjs']) fs.copyFileSync(path.join(ROOT, f), path.join(c, f));
    fs.mkdirSync(path.join(c, 'data')); fs.writeFileSync(path.join(c, 'data/signals.json'), JSON.stringify(signals)); fs.writeFileSync(path.join(c, 'scanner-guard-approval.json'), JSON.stringify(APPROVAL)); return c; };
  const remoteState = () => { try { return JSON.parse(g(d, '--git-dir', bare, 'show', 'scanner-guard-state:scanner-guard.json')); } catch { return null; } };
  return { d, bare, clone, remoteState };
}
async function stub(t, w, { onList, onPost, post = 204, hang = false, mainRuns = DONE } = {}) {
  const seen = { posts: [], tg: [], reservedAtPost: [] };
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
    if (q.url.startsWith('/bot')) { seen.tg.push(JSON.parse(b).text); r.setHeader('Content-Type', 'application/json'); return r.end(JSON.stringify({ ok: true, result: { message_id: seen.tg.length } })); }
    if (q.method === 'GET') { if (onList) onList(q.url); return r.end(JSON.stringify(runs(q.url.includes('/main.yml/') ? mainRuns : []))); }
    const body = JSON.parse(b); seen.posts.push(body); const rs = w.remoteState();
    seen.reservedAtPost.push(!!rs && rs.attempts.some(a => a.key === body.inputs.slot && a.outcome === 'RESERVED') || body.inputs.slot === undefined);
    if (onPost) onPost(body); if (hang) return; r.statusCode = post; r.end(); }); });
  await new Promise(res => srv.listen(0, '127.0.0.1', res)); t.after(() => { srv.closeAllConnections(); srv.close(); });
  return { url: 'http://127.0.0.1:' + srv.address().port, seen };
}
const ENV = (url, now, extra = {}) => ({ PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'x', GITHUB_API_BASE: url, TG_BASE: url, TG_TOKEN: 't', TG_CHAT: 'c', SG_FAKE_NOW: now, ...extra });
const cli = (cwd, env) => new Promise(res => { const c = spawn(process.execPath, ['scanner-guard.mjs'], { cwd, env }); let o = ''; c.stdout.on('data', x => o += x); c.stderr.on('data', x => o += x); c.on('close', code => res({ code, o })); });

test('G1: the RESERVED record is on the remote BEFORE the request; outcome published after; a no-op cycle writes no commit', async (t) => {
  const w = world(t), c = w.clone('a'), s = await stub(t, w);
  const r = await cli(c, ENV(s.url, '2026-11-09T22:20:00Z')); assert.equal(r.code, 0, r.o);
  assert.deepEqual(s.seen.posts, [{ ref: 'main', inputs: { mode: 'daily', slot: 'nightly:2026-11-09:1' } }]); assert.deepEqual(s.seen.reservedAtPost, [true]);
  assert.equal(w.remoteState().attempts[0].outcome, 'ACCEPTED');
  const before = g(w.d, '--git-dir', w.bare, 'rev-parse', 'scanner-guard-state');
  await cli(c, ENV(s.url, '2026-11-09T22:21:00Z')); assert.equal(s.seen.posts.length, 1);
  assert.equal(g(w.d, '--git-dir', w.bare, 'rev-parse', 'scanner-guard-state'), before, 'no commit without a change');
});

test('G1: a second writer that publishes between read and reservation wins; the loser makes NO request', async (t) => {
  const w = world(t), a = w.clone('a'), b = w.clone('b');
  const s0 = await stub(t, w); await cli(b, ENV(s0.url, '2026-11-09T21:15:00Z'));   // creates the state branch (no dispatch due yet)
  assert.equal(s0.seen.posts.length, 0); assert.ok(w.remoteState());
  let raced = false;
  const s = await stub(t, w, { onList: () => { if (raced) return; raced = true;   // b's change lands after a read the remote
    const tip = g(b, 'ls-remote', 'origin', 'refs/heads/scanner-guard-state').split(/\s/)[0]; g(b, 'fetch', '-q', 'origin', tip);
    const st = JSON.parse(g(b, 'show', tip + ':scanner-guard.json')); st.alerts['race:x'] = { status: 'ACK', tries: 1, text: 'x', at: T('2026-11-09T22:19:00Z') };
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: b, input: JSON.stringify(st) }).toString().trim();
    const tree = execFileSync('git', ['mktree'], { cwd: b, input: '100644 blob ' + blob + '\tscanner-guard.json\n' }).toString().trim();
    const cm = execFileSync('git', ['-c', 'user.name=x', '-c', 'user.email=x@x', 'commit-tree', tree, '-p', tip, '-m', 'other writer'], { cwd: b }).toString().trim();
    g(b, 'push', '-q', 'origin', cm + ':refs/heads/scanner-guard-state'); } });
  const r = await cli(a, ENV(s.url, '2026-11-09T22:20:00Z'));
  assert.equal(s.seen.posts.length, 0, r.o); assert.match(r.o, /CONFLICT|no dispatch/);
  assert.ok(w.remoteState().alerts['race:x'], 'the other writer’s record is preserved');
});

test('G1: unreadable remote state, or corrupt remote bytes, means no request and the original bytes stay untouched', async (t) => {
  const w = world(t), c = w.clone('a'), s = await stub(t, w);
  const r1 = await cli(c, ENV(s.url, '2026-11-09T22:20:00Z', { GUARD_STATE_REMOTE: path.join(w.d, 'missing.git') }));
  assert.equal(s.seen.posts.length, 0); assert.match(r1.o, /unreadable/);
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: c, input: '{not json' }).toString().trim();
  const tree = execFileSync('git', ['mktree'], { cwd: c, input: '100644 blob ' + blob + '\tscanner-guard.json\n' }).toString().trim();
  const cm = execFileSync('git', ['-c', 'user.name=x', '-c', 'user.email=x@x', 'commit-tree', tree, '-m', 'corrupt'], { cwd: c }).toString().trim();
  g(c, 'push', '-q', 'origin', cm + ':refs/heads/scanner-guard-state');
  const r2 = await cli(c, ENV(s.url, '2026-11-09T22:20:00Z')); assert.equal(s.seen.posts.length, 0); assert.match(r2.o, /corrupt/);
  assert.equal(g(w.d, '--git-dir', w.bare, 'rev-parse', 'scanner-guard-state'), cm, 'corrupt original commit preserved, not replaced');
});

test('G1+G2: runner lost after the request leaves RESERVED on the remote; later cycles never request again and alert once', async (t) => {
  const w = world(t), c = w.clone('a'); let child;
  const s = await stub(t, w, { hang: true, onPost: () => setTimeout(() => child.kill('SIGKILL'), 50) });
  await new Promise(res => { child = spawn(process.execPath, ['scanner-guard.mjs'], { cwd: c, env: ENV(s.url, '2026-11-09T22:20:00Z') }); child.on('close', res); });
  assert.equal(s.seen.posts.length, 1); assert.deepEqual(s.seen.reservedAtPost, [true]); assert.equal(w.remoteState().attempts[0].outcome, 'RESERVED');
  const s2 = await stub(t, w);
  for (const tm of ['2026-11-09T23:21:00Z', '2026-11-09T23:30:00Z', '2026-11-10T00:30:00Z']) await cli(c, ENV(s2.url, tm));
  assert.equal(s2.seen.posts.length, 0, 'quarantined: no second request');
  assert.equal(s2.seen.tg.filter(x => /no matching run/.test(x)).length, 1, 'unresolved attempt alerted exactly once');
  const al = w.remoteState().alerts['unresolved:nightly:2026-11-09:1']; assert.equal(al.status, 'ACK');
});

test('G1: a hung dispatch answer is UNCERTAIN on the remote and quarantines', async (t) => {
  const w = world(t), c = w.clone('a'), s = await stub(t, w, { hang: true });
  const r = await cli(c, ENV(s.url, '2026-11-09T22:20:00Z')); assert.equal(r.code, 0, r.o);
  assert.equal(w.remoteState().attempts[0].outcome, 'UNCERTAIN');
  const s2 = await stub(t, w); await cli(c, ENV(s2.url, '2026-11-09T23:25:00Z')); assert.equal(s2.seen.posts.length, 0);
});
