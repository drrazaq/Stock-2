// Health text (6 Nov 2026 repair). Synthetic fixtures only: no owner records, credentials, provider requests or real messages.
// The 6 Nov ACTIONS health line cut the watcher problem at 170 characters ("... full cash session 315/390 usable r"), removing the
// qualification that 15:01-15:59 lies OUTSIDE the configured window (a known limit, not a daily fault). The fix keeps missing minutes
// inside the configured window separate from time outside it, through the actual health and ACTIONS formatters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';
import { watcherReport } from '../watcher-reporting.mjs';

// the 5 Nov shape: opening observed; 11 single missing minutes plus 14:56-15:00 inside 09:30-15:00; nothing after 15:00
const hm = (s) => +s.slice(0, 2) * 60 + +s.slice(3);
const MISSING = ['09:47', '10:12', '10:37', '11:02', '11:29', '11:56', '12:24', '12:55', '13:27', '13:58', '14:27', '14:56', '14:57', '14:58', '14:59', '15:00'].map(hm);
const beats = []; for (let m = hm('09:28'); m <= hm('14:55'); m++) if (!MISSING.includes(m)) beats.push({ m, received: 5000, evaluated: 4000 });
const REPORT = watcherReport([{ day: '2026-11-05', minutes: 315, firstMinute: '09:28' }], [{ day: '2026-11-05', heartbeat: beats, configuredWindow: { open: 570, endExclusive: 901 } }]);
const SNAP = { at: '2026-11-06T01:08:26.560Z', ok: 40, watcher: REPORT, problems: [REPORT.text] };
const files = (health = SNAP) => ({ 'data/health.json': health, 'data/signals.json': { session: '2026-11-05' }, 'data/discovery.json': { session: '2026-11-05', candidates: [] }, 'data/movers-state.json': { session: '2026-11-05' }, 'data/settings.json': { focus: false } });
const NOW = Date.parse('2026-11-06T09:00:00Z');

test('fixture reproduces the saved 5 Nov evidence exactly (16 missing configured minutes, longest 5, 315/390)', () => {
  assert.equal(REPORT.configuredMinutes, 315); assert.equal(REPORT.configuredExpected, 331); assert.equal(REPORT.configuredMissing.length, 16);
  assert.equal(REPORT.longestGap, 5); assert.equal(REPORT.regularMinutes, 315); assert.equal(REPORT.expected, 390); assert.equal(REPORT.outside, 0); assert.equal(REPORT.outsideExpected, 59);
  assert.ok(REPORT.actionable); assert.ok(REPORT.text.length > 170, 'the real text is longer than the old 170-character cut');
});

test('health line keeps the outside-window qualification and separates missing minutes from outside time', async () => {
  const S = await loadScan({ files: files() }), h = S.fn('healthLine')(NOW);
  assert.match(h, /watcher on 2026-11-05: opening minute OBSERVED; watched window 09:30–15:00: 315\/331 minutes \(16 missing in 12 gaps, longest 5 min\)/);
  assert.match(h, /15:01–15:59 is outside the watched window \(0\/59 observed: a known limit, not a fault\)/);
  assert.match(h, /full session 315\/390 minutes/);
  assert.doesNotMatch(h, /usable r(;|\.|$)/); assert.doesNotMatch(h, /\busable r\b/);
});

test('the same line reaches the actual ACTIONS message unchanged', async () => {
  const S = await loadScan({ files: files() }), real = Date.now; Date.now = () => NOW;
  try { const text = await S.fn('actionsText')({ session: '2026-11-05' }, {}, null, 'SYNTHETIC');
    assert.match(text, /SYSTEM HEALTH: 1 problem \(saved check 04:08 Kuwait 2026-11-06\): watcher on 2026-11-05/);
    assert.match(text, /is outside the watched window \(0\/59 observed: a known limit, not a fault\)/);
    assert.doesNotMatch(text, /usable r\b/);
  } finally { Date.now = real; }
});

test('the full health command still shows the complete original watcher text', async () => {
  const S = await loadScan({ files: files() }); const out = [];
  // the health command reads the same snapshot and lists every problem in full
  const H = S.readJson('data/health.json'); out.push(...H.problems);
  assert.equal(out[0], REPORT.text); assert.match(out[0], /usable retained regular-session minutes; 15:01–15:59 outside configured window: 0\/59 observed \(known coverage limit, not a daily fault\)/);
});

test('a snapshot whose watcher text and structured report disagree is shown in full, never shortened from mismatched numbers', async () => {
  const bad = { ...SNAP, watcher: { ...REPORT, text: 'something else' } }, S = await loadScan({ files: files(bad) }), h = S.fn('healthLine')(NOW);
  assert.ok(h.includes(REPORT.text), 'full text kept'); assert.doesNotMatch(h, /watched window/);
});

test('other long problems end at a clause boundary with a pointer to the full text, never mid-word', async () => {
  const long = 'opportunity radar: last result 2026-11-04 21:10 UTC; it should update every weekday after the close; the after-close ledger has 3 unresolved rows; its source list was not read; see the workflow log for the exact reason it stopped';
  const S = await loadScan({ files: files({ ...SNAP, watcher: null, problems: [long] }) }), h = S.fn('healthLine')(NOW);
  assert.match(h, /opportunity radar: last result 2026-11-04 21:10 UTC; it should update every weekday after the close; the after-close ledger has 3 unresolved rows … \(send {2}health {2}for the full text\)/);
});

test('all requests stayed synthetic and offline', () => assert.deepEqual(blocked, []));
