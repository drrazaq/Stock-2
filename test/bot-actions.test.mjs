// Seam: actionsText (the ACTIONS message) after the owner's bot repair, 28 Oct 2026. Integration tests: the real scan.mjs loaded with
// fixture files (no network). Invariants: ONE policy (focus pauses engine buys only; the owner's lanes stay actions and say so); no
// sentence anywhere says "no new trading buys" while a BUY is listed; every BUY line sits under TODAY'S ACTIONS in a lane whose header
// states its approval status; a stock without the owner's ZAD 'yes' is never a BUY (NOT ACTIONABLE, with the exact command); sections in
// order of importance; long-term advice out of ACTIONS; Kuwait times follow the New York calendar (daylight saving, holidays).
// Run: node --test test/bot-actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const now = () => new Date().toISOString();
// the real 28 Oct LONGER HOLDS inputs (data/quality.json, trimmed): tier 2 TRADABLE SMALL
const quality = (picks) => ({ generatedAt: now(), fscoreUpToday: picks,
  v15: { monthly: { '6m': { older: { months: 17, beatAvgStock: 16 }, newer: { months: 27, beatAvgStock: 22 }, t: { older: 5.469, newer: 2.659, clearsLeagueBar: false } } } },
  results: { 'F-SCORE UPTREND_126': { results: { older: { noTop2: 0.03 }, newer: { noTop2: 0.05 }, stress: { avg: 0.04 } } } } });
const sig = (extra = {}) => ({ session: '2026-10-27', market: { above50: true, up: true }, stocks: [{ sym: 'WST', last: 398.29 }, { sym: 'HQY', last: 100.88 }, { sym: 'MMSI', last: 93.53 }], ...extra });
const ok = { s: 'ok', d: new Date().toISOString().slice(0, 10) };
const PICKS = [{ sym: 'WST', fs: 9 }, { sym: 'HQY', fs: 9 }, { sym: 'MMSI', fs: 8 }];
async function render(files, s = sig()) { const S = await loadScan({ files: { 'data/settings.json': { focus: true, tier2: true }, 'data/signals.json': s, ...files }, env: { TD_BASE: 'http://127.0.0.1:9', FH_BASE: 'http://127.0.0.1:9', SEC_BASE: 'http://127.0.0.1:9' } }); return { S, t: await S.fn('actionsText')(s, S.fn('loadPos')(), null, 'ACTIONS TEST') }; }
const section = (t, name) => { const i = t.indexOf('\n' + name); if (i < 0) return ''; const rest = t.slice(i + 1), j = rest.slice(1).search(/\n\n[A-Z][A-Z' -]{3,}(\(|\n|:)/); return j < 0 ? rest : rest.slice(0, j + 1); };

test('28 Oct contradiction fixed: focus on + LONGER HOLDS buys (marked halal) -> buys under TODAY\'S ACTIONS with their status; the policy says engine buys only are paused', async () => {
  const { t } = await render({ 'data/quality.json': quality(PICKS), 'data/halal.json': { WST: ok, HQY: ok, MMSI: ok }, 'data/names.json': { WST: 'WEST PHARMACEUTICAL SERVICES INC' } });
  assert.doesNotMatch(t, /no new trading buys/i); assert.match(t, /- BUY WST \(WEST PHARMACEUTICAL SERVICES INC\) up to/);
  assert.match(t, /^ACTIONS TEST\nPOLICY TODAY: focus ON: engine buys PAUSED; your own lanes \(LEADER DIP, LONGER HOLDS, EARNINGS DRIFT\) active\./);
  const acts = section(t, "TODAY'S ACTIONS"); assert.ok(acts, 'actions section');
  for (const sy of ['WST', 'HQY', 'MMSI']) assert.match(acts, new RegExp('- BUY ' + sy + ' (\\([^)]*\\) )?up to'));
  assert.match(acts, /LONGER HOLDS \| horizon: hold up to 6 months \| YOUR LABELLED CHOICE \(20 Oct\), tier 2 TRADABLE SMALL.*NOT PROVEN \| permitted today: yes/);
  assert.match(acts, /\+2% net on 1,000 USD needs about \+2\.9% gross at an assumed 0\.3% spread/);
  const outside = t.replace(acts, ''); assert.doesNotMatch(outside, /- BUY /);   // no BUY line anywhere else
  assert.deepEqual(blocked, []);
});
test('a pick without the owner\'s ZAD mark is never a BUY: NOT ACTIONABLE with the exact command per stock', async () => {
  const { t } = await render({ 'data/quality.json': quality(PICKS), 'data/halal.json': { WST: ok } });
  assert.match(section(t, "TODAY'S ACTIONS"), /- BUY WST/); assert.doesNotMatch(t, /- BUY (HQY|MMSI)/);
  const na = section(t, 'NOT ACTIONABLE TODAY'); assert.match(na, /MARK HALAL FIRST \(rule picks with no ZAD mark of yours: not a buy until you mark them\): HQY, MMSI/);
  assert.match(na, /\nhalal HQY yes   or   halal HQY no\nhalal MMSI yes   or   halal MMSI no/); assert.doesNotMatch(t, /halal SYM/);
  assert.match(t, /LONGER HOLDS: 1 buy above; 2 picks need your ZAD mark first/);
});
test('a NOT HALAL mark drops the pick entirely (never offered, not even as MARK HALAL)', async () => {
  const { t } = await render({ 'data/quality.json': quality(PICKS), 'data/halal.json': { WST: ok, HQY: { s: 'fail', d: ok.d }, MMSI: ok } });
  assert.doesNotMatch(t, /HQY/);
});
test('a quiet day: TODAY\'S ACTIONS says None; nothing long-term in the message, one pointer to  longterm ', async () => {
  const { t } = await render({}, { session: '2026-10-27', market: { above50: true, up: true }, stocks: [] });
  assert.match(t, /TODAY'S ACTIONS\nNone: no sell or permitted buy today\./);
  assert.doesNotMatch(t, /index fund|hold cash|BEST USE/i); assert.match(t, /LONGER-TERM: kept separate \(send  longterm \)/);
});
test('sections come in order of importance; CRITICAL (a holding leaving the ZAD list) comes first', async () => {
  const { t } = await render({ 'data/quality.json': quality(PICKS), 'data/halal.json': { WST: ok, HQY: ok, MMSI: ok, CCJ: ok }, 'data/zad-list.json': { effective: '2026-11-15', received: '2026-10-22', notHalal: ['CCJ'] },
    'data/my-positions.json': { CCJ: { entry: 50, stop: 45, since: '2026-10-01', shares: 1 } } });
  const order = ['POLICY TODAY', 'CRITICAL', "TODAY'S ACTIONS", 'APPROVED LANES', 'SHORT-TERM OPPORTUNITIES', 'CURRENT HOLDINGS', 'RECORDS', 'LONGER-TERM: kept separate'].map(k => t.indexOf(k));
  assert.ok(order.every(i => i > 0), JSON.stringify(order)); assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(section(t, 'CRITICAL'), /NOT HALAL \(ZAD list\): CCJ stops being Sharia compliant on 2026-11-15\. SELL before then/);
});
test('records are kept apart and labelled: the practice account is fake money, the paper record is not your trades', async () => {
  const { t } = await render({ 'data/alpaca-paper.json': { start: { d: '2026-10-12', equity: 100000 }, equity: { equity: 99797.62 }, closed: [{ net: 0.02 }, { net: -0.05 }], plans: {} } });
  const r = section(t, 'RECORDS'); assert.match(r, /YOUR REAL TRADES \(what you reported\)/); assert.match(r, /PRACTICE ACCOUNT \(Alpaca, fake money, unproven engines: NOT buys for you\)/);
});
test('Kuwait times follow the New York calendar: 4:30 pm in summer, 5:30 pm from 2 Nov 2026; holidays and weekends roll to the next session', async () => {
  const { S } = await render({});
  const kwt = S.fn('kwt'), sessDay = S.fn('sessDay');
  assert.equal(kwt(570, '2026-10-30'), '4:30 pm'); assert.equal(kwt(570, '2026-11-02'), '5:30 pm'); assert.equal(kwt(585, '2026-11-02'), '5:45 pm'); assert.equal(kwt(960, '2026-10-30'), '11 pm');
  assert.equal(kwt(570, '2027-03-12'), '5:30 pm'); assert.equal(kwt(570, '2027-03-15'), '4:30 pm');
  assert.equal(sessDay(Date.parse('2026-11-26T15:00:00Z')), '2026-11-27');   // Thanksgiving -> Friday
  assert.equal(sessDay(Date.parse('2026-10-31T15:00:00Z')), '2026-11-02');   // Saturday -> Monday
  assert.equal(sessDay(Date.parse('2026-10-30T21:30:00Z')), '2026-11-02');   // Friday after the close -> Monday
  assert.equal(sessDay(Date.parse('2026-10-30T14:00:00Z')), '2026-10-30');
});

test('a stock picked by two lanes (LONGER HOLDS and LEADER DIP) is ONE buy, under the first lane, never twice', async () => {
  const S0 = await loadScan({}); const isS = S0.fn('isSession'); let x = S0.fn('ny')(Date.now()).d; do { x = new Date(Date.parse(x) - 864e5).toISOString().slice(0, 10); } while (!isS(x));
  const { t } = await render({ 'data/quality.json': quality([{ sym: 'WST', fs: 9 }]), 'data/halal.json': { WST: ok },
    'data/squad11-today.json': { generatedAt: now(), lastClose: x, methods: { 'SQ11-PB12': { hold: 126, newSignals: [{ sym: 'WST', close: 400, halal: 'ok', d: x }] } } } });
  assert.equal((t.match(/- BUY WST/g) || []).length, 1, t);
  assert.match(section(t, "TODAY'S ACTIONS"), /LONGER HOLDS[\s\S]*- BUY WST/);
});
