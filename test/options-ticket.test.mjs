// Seam: optionsText() in scan.mjs (the  options  command and the Friday options message).
// Guards audit E1 (22 Oct): it printed "TICKET ... BUY TO OPEN" lines without the halal-ok and max-2-open checks of the nightly
// ticket; on 22 Oct that included a TEVA call although the owner had marked TEVA NOT HALAL in ZAD.
// Run: node test/options-ticket.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const today = new Date().toISOString().slice(0, 10);
const call = (sym, ask) => ({ sym, exp: '2026-11-20', strike: 20, ask, bid: ask - 0.1, d: '2026-10-22' });
const halal = { TEVA: { s: 'fail', d: today, by: 'ZAD (you)' }, HQY: { s: 'ok', d: today, by: 'ZAD (you)' } };
const tickets = (text) => text.split('\n').filter(l => /^TICKET/.test(l));

test('a ticket is shown only for a stock marked halal (ok) in ZAD: not for NOT HALAL, not for never checked', async () => {
  // TEVA: marked NOT halal; HQY: marked halal; ZZZ: never checked. All three cost under 300 USD.
  const S = await loadScan({ files: { 'data/halal.json': halal, 'data/options-shadow.json': { open: [call('TEVA', 1.99), call('HQY', 2.40), call('ZZZ', 1.50)], real: [] } } });
  const t = tickets(S.fn('optionsText')());
  assert.equal(t.length, 1);
  assert.match(t[0], /BUY TO OPEN 1 x HQY /);
});

test('no ticket at all while 2 real contracts are open', async () => {
  const real = [{ sym: 'AAA', exp: '2026-11-20', strike: 10, paid: 1.2, d: '2026-10-20' }, { sym: 'BBB', exp: '2026-11-20', strike: 15, paid: 1.5, d: '2026-10-21' }];
  const S = await loadScan({ files: { 'data/halal.json': halal, 'data/options-shadow.json': { open: [call('HQY', 2.40)], real } } });
  assert.deepEqual(tickets(S.fn('optionsText')()), []);
});

test('control: one real contract open still leaves room for one ticket', async () => {
  const real = [{ sym: 'AAA', exp: '2026-11-20', strike: 10, paid: 1.2, d: '2026-10-20' }];
  const S = await loadScan({ files: { 'data/halal.json': halal, 'data/options-shadow.json': { open: [call('HQY', 2.40)], real } } });
  assert.equal(tickets(S.fn('optionsText')()).length, 1);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
