import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunnerRows, analyseRunnerRows, renderRunnerReport, RUNNER_HUNTER_VERSION } from '../runner-hunter-core.mjs';

function fixture() {
  const days = {};
  const dates = ['2026-01-02','2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09','2026-01-12','2026-01-13','2026-01-14','2026-01-15','2026-01-16','2026-01-20','2026-01-21','2026-01-22','2026-01-23','2026-01-26','2026-01-27','2026-01-28','2026-01-29','2026-01-30','2026-02-02','2026-02-03','2026-02-04'];
  for (let i = 0; i < dates.length; i++) {
    const c = 1.5 + i * 0.01;
    const event = i === 21;
    days[dates[i]] = { T: ['TEST'], o: [event ? c * 1.05 : c], h: [event ? c * 1.50 : c * 1.02], l: [event ? c * 0.95 : c * 0.99], c: [event ? c * 1.20 : c], v: [event ? 2_000_000 : 400_000] };
  }
  return { days };
}

test('labels a next-session 40% high without using future fields as signal features', () => {
  const rows = buildRunnerRows(fixture());
  const r = rows.find(x => x.eventDate === '2026-02-03');
  assert.ok(r);
  assert.equal(r.target40FromPriorClose, true);
  assert.equal(r.target40FromOpen, true); // the event high leaves more than 40% above the next open
  assert.equal(r.remaining25FromOpen, true);
  assert.equal(r.signalDate, '2026-02-02');
  assert.equal(r.signalPrice, 1.70);
});

test('excludes prices outside $0.10-$5 and low dollar-volume signal days', () => {
  const s = fixture();
  s.days['2026-02-02'].c[0] = 0.05;
  assert.equal(buildRunnerRows(s).some(x => x.signalDate === '2026-02-02'), false);
  const t = fixture();
  t.days['2026-02-02'].v[0] = 10;
  assert.equal(buildRunnerRows(t).some(x => x.signalDate === '2026-02-02'), false);
});

test('does not bridge a missing market session for a symbol', () => {
  const s = fixture();
  delete s.days['2026-02-02'];
  const rows = buildRunnerRows(s);
  assert.equal(rows.some(x => x.eventDate === '2026-02-03' && x.signalDate === '2026-01-30'), false);
});

test('analysis reports both halves and warns that it is not a trading rule', () => {
  const rows = buildRunnerRows(fixture());
  const out = analyseRunnerRows(rows);
  assert.equal(out.version, RUNNER_HUNTER_VERSION);
  assert.equal(out.status, 'RESEARCH_ONLY_NOT_A_TRADING_RULE');
  assert.equal(out.halves.length, 2);
  assert.match(renderRunnerReport(out), /Daily bars cannot reveal/);
});
