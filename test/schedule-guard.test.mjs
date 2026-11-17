// Schedule guard (17 Nov 2026): pure decisions, no network.
import assert from 'node:assert/strict';
import { scheduleDecide, expectedSession, nyToMs, SLOTS } from '../schedule-guard-core.mjs';
import { nyParts } from '../watcher-guard-core.mjs';
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const at = (d, hm) => { const [h, m] = hm.split(':').map(Number); return nyToMs(d, h * 60 + m); };

t('nyToMs round-trips in winter and summer time', () => {
  for (const [d, m] of [['2026-11-16', 600], ['2026-07-15', 575], ['2026-11-01', 120]]) { const p = nyParts(nyToMs(d, m)); assert.equal(p.d, d); assert.equal(p.min, m); }
});
t('expected session: Monday evening wants Monday, Tuesday morning wants Monday, weekend wants Friday, holiday skipped', () => {
  assert.equal(expectedSession(at('2026-11-16', '17:00')), '2026-11-16');
  assert.equal(expectedSession(at('2026-11-17', '09:00')), '2026-11-16');
  assert.equal(expectedSession(at('2026-11-16', '15:00')), '2026-11-13');
  assert.equal(expectedSession(at('2026-11-15', '12:00')), '2026-11-13');
  assert.equal(expectedSession(at('2026-11-27', '10:00')), '2026-11-25');   // 26 Nov Thanksgiving
});
t('16 Nov replay: closing scan missing at 17:50 New York -> started once with mode=daily and one Telegram line', () => {
  const now = at('2026-11-16', '17:50');
  const o = scheduleDecide(now, [{ path: '.github/workflows/main.yml', status: 'completed', created_at: '2026-11-14T01:32:04Z' }], '2026-11-13', {});
  const d = o.dispatch.filter(x => x.wf === 'main.yml');
  assert.equal(d.length, 1); assert.deepEqual(d[0].inputs, { mode: 'daily' }); assert.equal(o.alerts.length, 1); assert.match(o.alerts[0], /2026-11-16/);
  const o2 = scheduleDecide(now + 10 * 60000, [], '2026-11-13', o.state);
  assert.equal(o2.dispatch.filter(x => x.wf === 'main.yml').length, 0, 'not again within 45 minutes');
  const o3 = scheduleDecide(now + 50 * 60000, [], '2026-11-13', o2.state);
  assert.equal(o3.dispatch.filter(x => x.wf === 'main.yml').length, 1); assert.equal(o3.alerts.length, 0, 'one line per close, not per try');
});
t('closing scan already done or a scanner run busy -> nothing started', () => {
  const now = at('2026-11-16', '18:00');
  const mainOnly = (o) => o.dispatch.filter(x => x.wf === 'main.yml').length;
  assert.equal(mainOnly(scheduleDecide(now, [], '2026-11-16', {})), 0);
  assert.equal(mainOnly(scheduleDecide(now, [{ path: '.github/workflows/main.yml', status: 'in_progress', created_at: new Date(now - 6e5).toISOString() }], '2026-11-13', {})), 0);
});
t('gives up after 6 tries with one message', () => {
  let s = {}, now = at('2026-11-16', '16:30'), msgs = [], starts = 0;
  for (let i = 0; i < 12; i++) { const o = scheduleDecide(now, [], '2026-11-13', s); s = o.state; starts += o.dispatch.filter(x => x.wf === 'main.yml').length; msgs.push(...o.alerts); now += 46 * 60000; }
  assert.equal(starts, 6); assert.equal(msgs.filter(m => /still has not completed/.test(m)).length, 1);
});
t('pre-market at 08:41 with no run -> started; with a GitHub run since 08:37 -> left alone', () => {
  const now = at('2026-11-16', '08:41');
  assert.ok(scheduleDecide(now, [], '2026-11-13', {}).dispatch.some(x => x.wf === 'premarket.yml'));
  const r = [{ path: '.github/workflows/premarket.yml', status: 'completed', created_at: new Date(at('2026-11-16', '08:39')).toISOString() }];
  assert.ok(!scheduleDecide(now, r, '2026-11-13', {}).dispatch.some(x => x.wf === 'premarket.yml'));
});
t('intraday scanner slot uses mode=intraday, only the newest due slot, once', () => {
  const now = at('2026-11-16', '10:16');
  const o = scheduleDecide(now, [], '2026-11-13', {});
  const m = o.dispatch.filter(x => x.wf === 'main.yml');
  assert.ok(m.some(x => x.inputs.mode === 'intraday'));
  assert.equal(o.dispatch.filter(x => x.wf === 'news.yml').length, 1);
  const o2 = scheduleDecide(now + 3 * 60000, [], '2026-11-13', o.state);
  assert.ok(!o2.dispatch.some(x => x.inputs.mode === 'intraday'), 'same slot not started twice');
});
t('weekend and holiday: no slot starts', () => {
  assert.equal(scheduleDecide(at('2026-11-15', '10:10'), [], '2026-11-13', {}).dispatch.length, 0);
  assert.equal(scheduleDecide(at('2026-11-26', '10:10'), [], '2026-11-25', {}).dispatch.length, 0);
});
t('radar start passes scheduled=true so its FORCE switch stays off', () => {
  assert.deepEqual(SLOTS.find(s => s.wf === 'intraday-radar.yml').inputs, { scheduled: 'true' });
});
t('a queued run is not stacked', () => {
  const now = at('2026-11-16', '10:21');
  const r = [{ path: '.github/workflows/intraday-radar.yml', status: 'queued', created_at: new Date(at('2026-11-16', '10:00')).toISOString() }];
  assert.ok(!scheduleDecide(now, r, '2026-11-16', {}).dispatch.some(x => x.wf === 'intraday-radar.yml'));
});
t('a skipped cron copy does not count as started; a dispatched run does', () => {
  const now = at('2026-11-16', '08:45');
  const cron = [{ path: '.github/workflows/premarket.yml', event: 'schedule', status: 'completed', created_at: new Date(at('2026-11-16', '08:41')).toISOString() }];
  assert.ok(scheduleDecide(now, cron, '2026-11-13', {}).dispatch.some(x => x.wf === 'premarket.yml'));
  const disp = [{ ...cron[0], event: 'workflow_dispatch' }];
  assert.ok(!scheduleDecide(now, disp, '2026-11-13', {}).dispatch.some(x => x.wf === 'premarket.yml'));
});
t('busy does not burn the slot: started once the queue clears inside the window', () => {
  const now = at('2026-11-16', '10:21');
  const q = [{ path: '.github/workflows/intraday-radar.yml', event: 'workflow_dispatch', status: 'queued', created_at: new Date(at('2026-11-16', '10:00')).toISOString() }];
  const o = scheduleDecide(now, q, '2026-11-16', {});
  const o2 = scheduleDecide(now + 4 * 60000, [{ ...q[0], status: 'completed' }], '2026-11-16', o.state);
  assert.ok(o2.dispatch.some(x => x.wf === 'intraday-radar.yml'));
});
t('overnight movers and discovery: Tuesday 00:15 New York starts movers for Monday; Saturday 01:00 starts both for Friday; Sunday nothing', () => {
  const tue = scheduleDecide(at('2026-11-17', '00:15'), [], '2026-11-16', {}).dispatch.map(x => x.wf);
  assert.ok(tue.includes('movers.yml')); assert.ok(!tue.includes('discover.yml'));
  const sat = scheduleDecide(at('2026-11-14', '01:00'), [], '2026-11-13', {}).dispatch.map(x => x.wf);
  assert.ok(sat.includes('movers.yml') && sat.includes('discover.yml'));
  assert.equal(scheduleDecide(at('2026-11-15', '01:00'), [], '2026-11-13', {}).dispatch.length, 0);
});
t('hunter lab: pre at 09:15 and the next-open list at 18:00 New York', () => {
  assert.ok(scheduleDecide(at('2026-11-17', '09:16'), [], '2026-11-16', {}).dispatch.some(x => x.wf === 'squad30-lab.yml' && x.inputs.mode === 'pre'));
  assert.ok(scheduleDecide(at('2026-11-17', '18:05'), [], '2026-11-17', {}).dispatch.some(x => x.wf === 'squad30-lab.yml' && x.inputs.mode === 'today'));
});
console.log(n + ' schedule guard tests passed');
