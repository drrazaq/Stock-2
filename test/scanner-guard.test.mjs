// Scanner guard (development proposal 10 Nov): pure decisions and the actual CLI against a local GitHub/Telegram stub. No network.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { execFile } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { scannerGuardDecide, latestCompletedSession, reserveDispatch, finishDispatch, pruneState, LIMITS } from '../scanner-guard-core.mjs';
const T = (s) => Date.parse(s), run = (id, status, created) => ({ id, status, created_at: created });
const done = [run(42321580565, 'completed', '2026-11-07T01:00:15Z')];   // last main.yml run before 9 Nov (actual)

test('latest completed session: winter close+60, weekend, holiday, early close, summer, unknown year', () => {
  assert.equal(latestCompletedSession(T('2026-11-09T21:59:00Z')).day, '2026-11-06');   // 16:59 NY Mon: Mon bars not ready
  assert.equal(latestCompletedSession(T('2026-11-09T22:00:00Z')).day, '2026-11-09');
  assert.equal(latestCompletedSession(T('2026-11-08T12:00:00Z')).day, '2026-11-06');   // Sunday
  assert.equal(latestCompletedSession(T('2026-11-26T23:00:00Z')).day, '2026-11-25');   // Thanksgiving closed
  assert.equal(latestCompletedSession(T('2026-11-27T19:00:00Z')).day, '2026-11-27');   // early close 13:00 NY, +60
  assert.equal(latestCompletedSession(T('2026-07-14T21:00:00Z')).day, '2026-07-14');   // summer: 17:00 EDT
  assert.equal(latestCompletedSession(T('2028-01-05T22:00:00Z')).unknown, true);
});

test('9 Nov replay: no daily run by 22:15 UTC -> one daily dispatch; none before; none while a run is active', () => {
  const base = { mainRuns: done, botRuns: [], signalsSession: '2026-11-06', state: {} };
  assert.equal(scannerGuardDecide({ ...base, nowMs: T('2026-11-09T22:10:00Z') }).dispatches.length, 0);
  const o = scannerGuardDecide({ ...base, nowMs: T('2026-11-09T22:20:00Z') });
  assert.deepEqual(o.dispatches.map(d => [d.workflow, d.inputs.mode, d.key]), [['main.yml', 'daily', 'nightly:2026-11-09:1']]);
  // the actual late intraday event (42716422194, created 22:57 UTC) running: wait for it
  assert.equal(scannerGuardDecide({ ...base, mainRuns: [run(42716422194, 'in_progress', '2026-11-09T22:57:34Z'), ...done], nowMs: T('2026-11-09T22:58:00Z') }).dispatches.length, 0);
  // signals already at the session: nothing due
  assert.equal(scannerGuardDecide({ ...base, signalsSession: '2026-11-09', nowMs: T('2026-11-09T23:00:00Z') }).dispatches.length, 0);
});

test('nightly: RESERVED and UNCERTAIN count as attempts; 60-minute gap; two attempts then one alert; window closes 06:00 UTC with one alert', () => {
  const base = { mainRuns: done, botRuns: [], signalsSession: '2026-11-06' };
  let o = scannerGuardDecide({ ...base, state: {}, nowMs: T('2026-11-09T22:20:00Z') }); const d1 = o.dispatches[0];
  reserveDispatch(o.state, d1, T('2026-11-09T22:20:00Z'));   // crash before the outcome: entry stays RESERVED
  o = scannerGuardDecide({ ...base, state: o.state, nowMs: T('2026-11-09T22:40:00Z') });
  assert.equal(o.dispatches.length, 0, 'a RESERVED attempt blocks a second request inside the gap');
  o = scannerGuardDecide({ ...base, state: o.state, nowMs: T('2026-11-09T23:21:00Z') });
  assert.equal(o.dispatches[0].key, 'nightly:2026-11-09:2'); const d2 = o.dispatches[0];
  reserveDispatch(o.state, d2, T('2026-11-09T23:21:00Z')); assert.equal(finishDispatch(o.state, d2, NaN), 'UNCERTAIN');
  o = scannerGuardDecide({ ...base, state: o.state, nowMs: T('2026-11-10T01:00:00Z') });
  assert.equal(o.dispatches.length, 0); assert.equal(o.alerts.length, 1); assert.match(o.alerts[0], /NIGHTLY SCAN NOT DONE for the 2026-11-09 session after 2 guard starts/);
  o = scannerGuardDecide({ ...base, state: o.state, nowMs: T('2026-11-10T01:05:00Z') }); assert.equal(o.alerts.length, 0, 'alert once');
  const late = scannerGuardDecide({ ...base, state: {}, nowMs: T('2026-11-10T06:01:00Z') });
  assert.equal(late.dispatches.filter(d => d.kind === 'nightly').length, 0); assert.match(late.alerts[0], /NIGHTLY SCAN NOT DONE for the 2026-11-09 session \(last scan: 2026-11-06\)/);
  // the closed window keeps the 06:00-13:40 UTC band free of guard scanner starts (release Session A band)
  for (const h of ['07:00', '09:00', '10:30', '13:30']) assert.equal(scannerGuardDecide({ ...base, state: {}, nowMs: T('2026-11-10T' + h + ':00Z') }).dispatches.length, 0, h);
});

test('intraday: open+10..close-10 only, idle 40 min, 30-minute guard gap, 14 a day, early close, nightly first', () => {
  const base = { botRuns: [], signalsSession: '2026-11-06' };
  assert.equal(scannerGuardDecide({ ...base, mainRuns: done, state: {}, nowMs: T('2026-11-10T14:35:00Z') }).dispatches.length, 0, '09:35 NY');
  let o = scannerGuardDecide({ ...base, signalsSession: '2026-11-09', mainRuns: done, state: {}, nowMs: T('2026-11-10T14:41:00Z') });
  assert.deepEqual(o.dispatches.map(d => [d.inputs.mode, d.key]), [['intraday', 'intraday:2026-11-10:1']]);
  assert.equal(scannerGuardDecide({ ...base, signalsSession: '2026-11-09', mainRuns: [run(1, 'completed', '2026-11-10T14:20:00Z')], state: {}, nowMs: T('2026-11-10T14:55:00Z') }).dispatches.length, 0, 'recent scheduled run');
  reserveDispatch(o.state, o.dispatches[0], T('2026-11-10T14:41:00Z')); finishDispatch(o.state, o.dispatches[0], 204);
  assert.equal(scannerGuardDecide({ ...base, signalsSession: '2026-11-09', mainRuns: done, state: o.state, nowMs: T('2026-11-10T15:05:00Z') }).dispatches.length, 0, 'guard gap');
  assert.equal(scannerGuardDecide({ ...base, signalsSession: '2026-11-09', mainRuns: done, state: o.state, nowMs: T('2026-11-10T15:12:00Z') }).dispatches[0].key, 'intraday:2026-11-10:2');
  const full = { intraday: { '2026-11-10': { attempts: Array.from({ length: LIMITS.intradayMaxPerDay }, (_, i) => ({ at: T('2026-11-10T14:00:00Z'), key: 'k' + i, outcome: 'ACCEPTED' })) } } };
  assert.equal(scannerGuardDecide({ ...base, signalsSession: '2026-11-09', mainRuns: done, state: full, nowMs: T('2026-11-10T19:00:00Z') }).dispatches.length, 0, 'daily limit');
  assert.equal(scannerGuardDecide({ ...base, signalsSession: '2026-11-09', mainRuns: done, state: {}, nowMs: T('2026-11-10T20:55:00Z') }).dispatches.length, 0, '15:55 NY');
  assert.equal(scannerGuardDecide({ ...base, signalsSession: '2026-11-26', mainRuns: done, state: {}, nowMs: T('2026-11-27T17:55:00Z') }).dispatches.length, 0, 'early close 12:55 NY');
  assert.equal(scannerGuardDecide({ ...base, signalsSession: '2026-11-25', mainRuns: done, state: {}, nowMs: T('2026-11-26T16:00:00Z') }).dispatches.length, 0, 'holiday');
  assert.equal(scannerGuardDecide({ ...base, mainRuns: done, state: {}, nowMs: T('2028-03-01T16:00:00Z') }).dispatches.length, 0, 'unknown year fails closed');
});

test('bot successor: once per bot run, only near the loop end, not when one already waits', () => {
  const now = T('2026-11-10T03:00:00Z'), base = { mainRuns: done, signalsSession: '2026-11-09', botRunId: '77', nowMs: now };
  assert.equal(scannerGuardDecide({ ...base, botRuns: [], state: {}, loopEndMs: now + 90 * 60000 }).dispatches.length, 0);
  const o = scannerGuardDecide({ ...base, botRuns: [run(77, 'in_progress', '2026-11-09T22:00:00Z')], state: {}, loopEndMs: now + 30 * 60000 });
  assert.deepEqual(o.dispatches.map(d => [d.workflow, d.key]), [['bot.yml', 'successor:77']]);
  reserveDispatch(o.state, o.dispatches[0], now);
  assert.equal(scannerGuardDecide({ ...base, botRuns: [], state: o.state, loopEndMs: now + 25 * 60000 }).dispatches.length, 0, 'once per run');
  assert.equal(scannerGuardDecide({ ...base, botRuns: [run(78, 'queued', '2026-11-10T02:30:00Z')], state: {}, loopEndMs: now + 30 * 60000 }).dispatches.length, 0, 'already waiting');
});

test('outcomes and pruning', () => {
  const s = scannerGuardDecide({ nowMs: T('2026-11-09T22:20:00Z'), mainRuns: done, signalsSession: '2026-11-06', state: {} });
  const d = s.dispatches[0]; reserveDispatch(s.state, d, T('2026-11-09T22:20:00Z'));
  assert.equal(finishDispatch(s.state, d, 204), 'ACCEPTED'); assert.equal(s.state.nightly['2026-11-09'].attempts[0].http, 204);
  assert.equal(finishDispatch(s.state, d, 422), 'REFUSED', 'outcome mapping'); assert.equal(s.state.nightly['2026-11-09'].attempts[0].outcome, 'ACCEPTED', 'a finished entry is not rewritten');
  const p = pruneState(s.state, T('2026-11-30T00:00:00Z')); assert.deepEqual(p.nightly, {});
});

// ---------- actual CLI ----------
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))), CLI = path.join(ROOT, 'scanner-guard.mjs');
async function stub(t, { listStatus = 200, dispatchStatus = 204, dispatchHang = false, mainRuns = done, botRuns = [] } = {}) {
  const seen = { posts: [], tg: [] };
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
    if (req.url.startsWith('/bot')) { seen.tg.push(JSON.parse(b).text); res.end('{"ok":true}'); return; }
    if (req.method === 'GET') { res.statusCode = listStatus; res.end(JSON.stringify({ workflow_runs: req.url.includes('/main.yml/') ? mainRuns : botRuns })); return; }
    seen.posts.push({ url: req.url, body: JSON.parse(b) }); if (dispatchHang) return; res.statusCode = dispatchStatus; res.end(); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); t.after(() => srv.closeAllConnections() || srv.close());
  return { base: 'http://127.0.0.1:' + srv.address().port, seen };
}
function dir(signals = { session: '2026-11-06' }, state) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-')); fs.mkdirSync(d + '/data'); fs.writeFileSync(d + '/data/signals.json', JSON.stringify(signals)); if (state) fs.writeFileSync(d + '/data/scanner-guard.json', JSON.stringify(state)); return d; }
const cli = (cwd, base, now, extra = {}) => new Promise(r => execFile(process.execPath, [CLI], { cwd, timeout: 40000, env: { PATH: process.env.PATH, GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'x', GITHUB_API_BASE: base, TG_BASE: base, TG_TOKEN: 't', TG_CHAT: 'c', SG_FAKE_NOW: now, ...extra } }, (e, out) => r({ code: e ? e.code : 0, out })));
const st = (d) => JSON.parse(fs.readFileSync(d + '/data/scanner-guard.json', 'utf8'));

test('CLI: accepted nightly dispatch is recorded with its key; exact request body; repeat inside the gap makes no request', async (t) => {
  const s = await stub(t), d = dir();
  const r = await cli(d, s.base, '2026-11-09T22:20:00Z'); assert.equal(r.code, 0, r.out);
  assert.deepEqual(s.seen.posts.map(p => [p.url, p.body]), [['/repos/o/r/actions/workflows/main.yml/dispatches', { ref: 'main', inputs: { mode: 'daily', slot: 'nightly:2026-11-09:1' } }]]);
  assert.equal(st(d).nightly['2026-11-09'].attempts[0].outcome, 'ACCEPTED');
  await cli(d, s.base, '2026-11-09T22:40:00Z'); assert.equal(s.seen.posts.length, 1);
});

test('CLI: a hung dispatch is UNCERTAIN, counted, not retried in the gap; 403 gives one alert a day; failed run list changes nothing', async (t) => {
  const h = await stub(t, { dispatchHang: true }), d = dir();
  await cli(d, h.base, '2026-11-09T22:20:00Z'); assert.equal(st(d).nightly['2026-11-09'].attempts[0].outcome, 'UNCERTAIN');
  await cli(d, h.base, '2026-11-09T22:50:00Z'); assert.equal(h.seen.posts.length, 1);
  const f = await stub(t, { dispatchStatus: 403 }), d2 = dir();
  await cli(d2, f.base, '2026-11-09T22:20:00Z'); await cli(d2, f.base, '2026-11-09T23:21:00Z');
  assert.equal(f.seen.posts.length, 2); assert.equal(f.seen.tg.filter(x => /could not start main.yml \(GitHub answered 403\)/.test(x)).length, 1);
  const g = await stub(t, { listStatus: 500 }), d3 = dir();
  const r = await cli(d3, g.base, '2026-11-09T22:20:00Z'); assert.match(r.out, /run list failed/); assert.equal(g.seen.posts.length, 0); assert.equal(fs.existsSync(d3 + '/data/scanner-guard.json'), false);
});

test('CLI: the attempt is durably RESERVED before the dispatch request leaves (a crash mid-request cannot cause a second request)', async (t) => {
  const { spawn } = await import('node:child_process'); const d = dir(); let child;
  const seenState = await new Promise((resolve) => {
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
      if (req.method === 'GET') { res.end(JSON.stringify({ workflow_runs: req.url.includes('/main.yml/') ? done : [] })); return; }
      resolve(fs.existsSync(d + '/data/scanner-guard.json') ? st(d) : null); child.kill('SIGKILL'); }); });
    srv.listen(0, '127.0.0.1', () => { t.after(() => srv.closeAllConnections() || srv.close()); const base = 'http://127.0.0.1:' + srv.address().port;
      child = spawn(process.execPath, [CLI], { cwd: d, env: { PATH: process.env.PATH, GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'x', GITHUB_API_BASE: base, SG_FAKE_NOW: '2026-11-09T22:20:00Z' } }); }); });
  assert.ok(seenState, 'state file exists while the request is in flight');
  assert.deepEqual(seenState.nightly['2026-11-09'].attempts.map(a => [a.key, a.outcome]), [['nightly:2026-11-09:1', 'RESERVED']]);
  const after = scannerGuardDecide({ nowMs: T('2026-11-09T22:30:00Z'), mainRuns: done, signalsSession: '2026-11-06', state: st(d) });
  assert.equal(after.dispatches.length, 0, 'the killed attempt still blocks a repeat inside the gap');
});
