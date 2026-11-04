// Health-line freshness (4 Nov 2026). Synthetic fixtures only: no owner records, credentials, provider requests or real messages.
// The SYSTEM HEALTH line must show when its saved snapshot was taken, the expected close it judges sources against, and every source that
// is LATE or UNKNOWN, so a stale source can never sit next to an unqualified "checks OK". The watchdog keeps its exact warning rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

const SNAP = { at: '2026-11-03T21:24:52.049Z', problems: [] };   // 00:24 Kuwait on 4 Nov
const T = (iso) => Date.parse(iso);
const files = ({ health = SNAP, scan = '2026-11-03', disc = '2026-11-02', movers = '2026-11-03' } = {}) => {
  const f = {};
  if (health !== null) f['data/health.json'] = health;
  if (scan !== null) f['data/signals.json'] = { session: scan };
  if (disc !== null) f['data/discovery.json'] = { session: disc, candidates: [] };
  if (movers !== null) f['data/movers-state.json'] = { session: movers };
  return f;
};
const line = async (opts, nowIso) => { const S = await loadScan({ files: files(opts) }); return S.fn('healthLine')(T(nowIso)); };

test('4 Nov incident: stale discovery is shown as NOT CURRENT with the snapshot time and expected close; no unqualified checks OK', async () => {
  const h = await line({}, '2026-11-04T07:36:00Z');   // 02:36 New York, discovery due since 02:30
  assert.match(h, /NOT CURRENT: discovery engine LATE/);
  assert.match(h, /saved check 00:24 Kuwait 2026-11-04/);
  assert.match(h, /sources for the 2026-11-03 close: nightly scan current, discovery engine LATE \(latest 2026-11-02\), movers radar current/);
  assert.doesNotMatch(h, /checks OK/);
});

test('resolved: once discovery saves the expected close the line returns to checks OK, still with its snapshot time', async () => {
  const h = await line({ disc: '2026-11-03' }, '2026-11-04T09:00:00Z');
  assert.match(h, /^SYSTEM HEALTH: checks OK \(saved check 00:24 Kuwait 2026-11-04\); sources for the 2026-11-03 close: nightly scan current, discovery engine current, movers radar current/);
});

test('late schedule before the due time is PENDING (not due yet), not LATE and not hidden', async () => {
  const h = await line({}, '2026-11-04T06:00:00Z');   // 01:00 New York, before 02:30
  assert.match(h, /checks OK \(saved check 00:24 Kuwait 2026-11-04\)/);
  assert.match(h, /discovery engine not due yet \(due 2:30 am New York\)/);
  assert.doesNotMatch(h, /LATE/);
});

test('unknown states are never OK: missing snapshot, missing source file and a malformed session', async () => {
  const a = await line({ health: null }, '2026-11-04T09:00:00Z');
  assert.match(a, /saved check UNKNOWN \(no readable health snapshot\)/); assert.match(a, /NOT CURRENT: discovery engine LATE/); assert.doesNotMatch(a, /checks OK/);
  const b = await line({ disc: null }, '2026-11-04T09:00:00Z');
  assert.match(b, /NOT CURRENT: discovery engine UNKNOWN/); assert.match(b, /discovery engine UNKNOWN \(no valid session date\)/); assert.doesNotMatch(b, /checks OK/);
  const c = await line({ movers: 'yesterday' }, '2026-11-04T09:00:00Z');
  assert.match(c, /movers radar UNKNOWN/); assert.doesNotMatch(c, /checks OK/);
  const d = await line({ health: { problems: [] } }, '2026-11-04T09:00:00Z');
  assert.match(d, /saved check time unknown/);
  const e = await line({ health: '{not json' }, '2026-11-04T09:00:00Z');
  assert.match(e, /saved check UNKNOWN/); assert.doesNotMatch(e, /checks OK/);
});

test('saved problems and a live stale source are both shown', async () => {
  const h = await line({ health: { at: SNAP.at, problems: ['SEC company filings: last update 2 days old'] } }, '2026-11-04T09:00:00Z');
  assert.match(h, /1 problem \(saved check 00:24 Kuwait 2026-11-04\): SEC company filings/);
  assert.match(h, /also NOT CURRENT now: discovery engine LATE/);
});

test('weekends: Saturday and Sunday judge sources against Friday', async () => {
  for (const now of ['2026-11-07T15:00:00Z', '2026-11-08T15:00:00Z']) {
    const h = await line({ scan: '2026-11-06', disc: '2026-11-06', movers: '2026-11-06', health: { at: '2026-11-06T21:30:00Z', problems: [] } }, now);
    assert.match(h, /checks OK \(saved check 00:30 Kuwait 2026-11-07\); sources for the 2026-11-06 close: nightly scan current, discovery engine current, movers radar current/);
  }
  const late = await line({ scan: '2026-11-06', disc: '2026-11-05', movers: '2026-11-06' }, '2026-11-08T15:00:00Z');
  assert.match(late, /discovery engine LATE \(latest 2026-11-05\)/);
});

test('market holiday: the day after Thanksgiving judges sources against the Wednesday before it', async () => {
  const S = await loadScan({ files: files() });
  assert.equal(S.fn('isHoliday')('2026-11-26'), true);
  const h = await line({ scan: '2026-11-25', disc: '2026-11-25', movers: '2026-11-25', health: { at: '2026-11-26T03:00:00Z', problems: [] } }, '2026-11-27T12:00:00Z');
  assert.match(h, /sources for the 2026-11-25 close: nightly scan current, discovery engine current, movers radar current/);
  assert.doesNotMatch(h, /NOT CURRENT/);
});

test('an old watchdog alert does not keep the line stale after the source recovers (live state, not the warned flag)', async () => {
  const S = await loadScan({ files: { ...files({ disc: '2026-11-03' }), 'data/tg-state.json': { offset: 7, warned: { disc: '2026-11-03' } } } });
  const h = S.fn('healthLine')(T('2026-11-04T09:00:00Z'));
  assert.match(h, /checks OK/); assert.doesNotMatch(h, /LATE/);
});

test('watchdog rule is unchanged: sourceFreshness warns exactly where the original late() did, hourly across November 2026', async () => {
  const S = await loadScan({ files: files() }), sf = S.fn('sourceFreshness'), ny = S.fn('ny'), isHoliday = S.fn('isHoliday');
  const original = (now, haves) => {   // verbatim decision logic of the pre-change watchdog
    const n = ny(now); let expected = ''; for (let k = 0; k < 10; k++) { const x = ny(now - k * 86400000); if (x.weekend || isHoliday(x.d) || (k === 0 && x.mins < 970)) continue; expected = x.d; break; }
    if (!expected) return { expected, warn: [] };
    const later = n.d > expected, warn = [];
    const late = (key, have, due) => { if (due && (have || '') < expected) warn.push(key); };
    late('scan', haves.scan, later || n.mins >= 1230); late('disc', haves.disc, later && n.mins >= 150); late('movers', haves.movers, later && n.mins >= 210);
    return { expected, warn };
  };
  // valid trading-session evidence: identical warnings to the old rule; evidence after the expected close is UNKNOWN (and warned when due)
  const cases = [{}, { scan: '2026-10-30' }, { disc: '2026-10-30', movers: null }, { scan: '2026-11-25', disc: '2026-11-25', movers: '2026-11-25' }, { scan: '2026-12-31', disc: '2026-12-31', movers: '2026-12-31' }];
  let n = 0, future = 0;
  for (let t = T('2026-10-31T00:00:00Z'); t < T('2026-12-02T00:00:00Z'); t += 3600e3) for (const h of cases) {
    const o = original(t, h), F = sf(t, h);
    assert.equal(F.expected, o.expected, new Date(t).toISOString());
    for (const r of F.rows) { const have = h[r.key];
      if (have && have > F.expected) { assert.equal(r.state, 'UNKNOWN', new Date(t).toISOString() + ' ' + r.key + ' ' + have); future++; continue; }
      assert.equal(r.due && r.state !== 'CURRENT', o.warn.includes(r.key), new Date(t).toISOString() + ' ' + JSON.stringify(h) + ' ' + r.key); n++; }
  }
  assert.ok(n > 7000 && future > 1000);
});

test('session evidence must be a real trading-session date no later than the expected close; otherwise UNKNOWN', async () => {
  const S = await loadScan({ files: files() }), sf = S.fn('sourceFreshness'), now = T('2026-11-04T09:00:00Z');   // expected close 2026-11-03
  const st = (v) => sf(now, { scan: '2026-11-03', disc: v, movers: '2026-11-03' }).rows.find(r => r.key === 'disc').state;
  for (const bad of ['2026-99-99', '2026-02-30', '2026-02-29', '2026-13-01', '2026-11-31', '2026-00-10', '2026-11-04', '2026-11-05', '2027-01-04', '2026-11-01', '2026-10-31', '2026-11-26', '20261103', ' 2026-11-03', 123, null, {}])
    assert.equal(st(bad), 'UNKNOWN', JSON.stringify(bad));
  assert.equal(st('2026-11-03'), 'CURRENT');
  assert.equal(st('2026-11-02'), 'LATE');
  assert.equal(st('2025-12-31'), 'LATE');   // valid older session
  assert.equal(sf(T('2026-11-04T06:00:00Z'), { disc: '2026-11-02' }).rows.find(r => r.key === 'disc').state, 'PENDING');   // not yet due
  assert.equal(sf(T('2028-03-01T15:00:00Z'), { disc: '2028-02-29' }).rows.find(r => r.key === 'disc').state, 'CURRENT');   // real leap day
});

test('actual ACTIONS health line shows invalid, impossible and future sessions as UNKNOWN, never checks OK', async () => {
  for (const disc of ['2026-99-99', '2026-02-30', '2026-11-05']) {
    const h = await line({ disc }, '2026-11-04T09:00:00Z');
    assert.match(h, /NOT CURRENT: discovery engine UNKNOWN/, disc); assert.match(h, /discovery engine UNKNOWN \(no valid session date\)/, disc);
    assert.doesNotMatch(h, /checks OK/, disc); assert.doesNotMatch(h, new RegExp(disc), disc);
  }
  const ok = await line({ disc: '2026-11-03' }, '2026-11-04T09:00:00Z'); assert.match(ok, /checks OK/);
  const old = await line({ disc: '2026-10-30' }, '2026-11-04T09:00:00Z'); assert.match(old, /discovery engine LATE \(latest 2026-10-30\)/);
  const pend = await line({ disc: '2026-11-02' }, '2026-11-04T06:00:00Z'); assert.match(pend, /discovery engine not due yet/);
});

test('actual watchdog warns once for invalid or future session evidence and stays silent for current evidence', async () => {
  const run = async (disc, warned) => {
    const msgs = []; const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
      if (req.url.includes('/sendMessage')) { msgs.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } })); } res.end(JSON.stringify({ ok: true, result: [] })); }); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try { const S = await loadScan({ files: { ...files({ disc }), 'data/tg-state.json': { offset: 9, warned: warned || {} } }, env: { TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: 'http://127.0.0.1:' + server.address().port } });
      const real = Date.now; Date.now = () => T('2026-11-04T09:00:00Z');
      try { await S.fn('watchdog')({ session: '2026-11-03' }); } finally { Date.now = real; }
      return { msgs, state: S.readJson('data/tg-state.json') };
    } finally { await new Promise(r => server.close(r)); }
  };
  for (const disc of ['2026-99-99', '2026-02-30', '2026-11-05']) {
    const r = await run(disc);
    assert.equal(r.msgs.length, 1, disc); assert.match(r.msgs[0], /The discovery engine for the 2026-11-03 close has not completed\./, disc);
    assert.doesNotMatch(r.msgs[0], new RegExp(disc), disc); assert.equal(r.state.warned.disc, '2026-11-03'); assert.equal(r.state.offset, 9);
    const again = await run(disc, { disc: '2026-11-03' }); assert.equal(again.msgs.length, 0, 'once per session ' + disc);
  }
  assert.equal((await run('2026-11-03')).msgs.length, 0);
  const late = await run('2026-11-02'); assert.match(late.msgs[0], /its last result is from 2026-11-02/);
});

test('actual ACTIONS caller carries the qualified health line', async () => {
  const S = await loadScan({ files: { ...files(), 'data/settings.json': { focus: false } } });
  const real = Date.now; Date.now = () => T('2026-11-04T07:36:00Z');
  try { const text = await S.fn('actionsText')({ session: '2026-11-03' }, {}, null, 'SYNTHETIC');
    assert.match(text, /SYSTEM HEALTH: NOT CURRENT: discovery engine LATE/); assert.doesNotMatch(text, /SYSTEM HEALTH: checks OK/);
  } finally { Date.now = real; }
});

test('all requests stayed synthetic and offline', () => assert.deepEqual(blocked, []));
