// Seam: gateVerdict(sym, sig) in scan.mjs (the one gate behind check, logged tips, sector, penny and source replies).
// Guards review S-5 (22 Oct): several plan blocks set ok = false without an avoid text (threat headline, macro, early evidence, bad-news
// filing, falling market). gateVerdict fell through to the FOCUS check, and with  focus off  it returned null: a BUY line was printed
// for a stock the plan had blocked. The dilution / trial-risk block (BIOBLOCK) was not checked, and any error meant "allowed".
// Now every block gives a reason, and an error means blocked.
// Run: node test/gate-verdict.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const quick = (sym, o = {}) => ({ sym, n: 60, avgPct: 0.02, win: 0.6, last: 50, buyLo: 49, buyHi: 51, stop: 45, maxHold: 5, ...o });
const sig = (extra = {}) => ({ session: '2026-10-21', market: { above50: true, up: true }, quick: [quick('AAA')], ...extra });
const gv = async (s, files = {}) => (await loadScan({ files: { 'data/settings.json': { focus: false }, 'data/signals.json': s, 'data/halal.json':{AAA:{s:'ok',d:new Date().toISOString().slice(0,10)}}, ...files } })).fn('gateVerdict')('AAA', s);

test('control: focus off, a proven quick trade with no block passes the gate', async () => {
  assert.equal(await gv(sig()), null);
});

test('a threat headline in the last 24 hours blocks it, with the reason', async () => {
  assert.match(await gv(sig(), { 'data/news-log.jsonl': [{ sym: 'AAA', th: true, at: new Date().toISOString(), t: 'FDA rejects drug' }] }), /threat headline/);
});

test('early evidence (20 unseen trades, +3% gross a trade) is watch only, not a buy', async () => {
  assert.match(await gv(sig({ quick: [quick('AAA', { n: 20, avgPct: 0.03 })] })), /early evidence/);
});

test('a falling market blocks a quick trade without its own falling-market record', async () => {
  assert.match(await gv(sig({ market: { above50: false, up: false } })), /falling market/);
});

test('the dilution / trial-risk block (discovery) blocks it', async () => {
  assert.match(await gv(sig(), { 'data/discovery.json': { candidates: [{ sym: 'AAA', hardBlock: 'ATM offering of 40% of the shares' }] } }), /dilution/);
});

test('an error inside the gate means blocked, not allowed', async () => {
  const s = sig(); Object.defineProperty(s, 'quick', { get() { throw new Error('broken signals'); }, enumerable: true });
  const S = await loadScan({ files: { 'data/settings.json': { focus: false } } });
  assert.match(S.fn('gateVerdict')('AAA', s), /gate check failed/);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
