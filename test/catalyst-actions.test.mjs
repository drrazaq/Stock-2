import fs from 'node:fs';
import path from 'node:path';
// Seam: catalystLines(sig, pos) in scan.mjs, the CATALYST RUN-UP section of ACTIONS. It reads data/catalyst-today.json (written weekly by
// catalyst-lab.mjs). The owner's rule (23 Oct 2026): a buy appears ONLY when the rule's frozen verdict is TRADABLE SMALL (with the tier2
// switch on and its own ledger not negative) or PROVEN; then buy range = next open up to +3%, stop 15%, SELL date = 2 sessions before
// the event, and each shown call is logged once in data/tier2-ledger.jsonl with kind 'catalyst'. Otherwise ACTIONS shows nothing new.
// Run: node test/catalyst-actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const sig = { session: '2026-10-23', stocks: [{ sym: 'ABCD', last: 10 }, { sym: 'EFGH', last: 20 }], lottery: {} };
const item = (o = {}) => ({ sym: 'ABCD', event: '2026-12-10', eventSession: '2026-12-10', kinds: ['PDUFA'], precision: 'day', buy: '2026-10-26', sell: '2026-12-08', entryPassed: false, firstStated: '2026-09-01', lastClose: 9.9, halal: 'ok', blocked: false, why: [], ...o });
const today = (rule, ups = [item()]) => ({ generatedAt: new Date().toISOString(), lastClose: '2026-10-23', rules: { 'CAT-RUN1': rule, 'CAT-NEWS1': null }, sessions: ['2026-10-26', '2026-10-27', '2026-10-28'], upcoming: ups, news: [] });
const files = (rule, extra = {}, ups) => ({ 'data/settings.json': { tier2: true }, 'data/catalyst-today.json': today(rule, ups), 'data/halal.json': { ABCD: { s: 'ok', d: new Date().toISOString().slice(0, 10) } }, ...extra });

test('no rule qualified -> ACTIONS shows nothing new, nothing is logged', async () => {
  const S = await loadScan({ files: files(null) });
  assert.deepEqual(S.fn('catalystLines')(sig, {}), []);
  assert.throws(() => S.read('data/tier2-ledger.jsonl'));
});

test('TRADABLE SMALL -> BUY at the next open up to +3%, stop 15%, SELL on the date 2 sessions before the event; logged as catalyst', async () => {
  const S = await loadScan({ files: files('TRADABLE SMALL') });
  const out = S.fn('catalystLines')(sig, {}).join('\n');
  assert.match(out, /CATALYST RUN-UP \(tier 2/);
  assert.match(out, /BUY ABCD at the open on 2026-10-26, up to 10\.30 /);
  assert.match(out, /STOP 15% under your buy/);
  assert.match(out, /SELL at the close on 2026-12-08/);
  assert.match(out, /PDUFA date 2026-12-10/);
  const L = S.read('data/tier2-ledger.jsonl').trim().split('\n').map(x => JSON.parse(x));
  assert.equal(L.length, 1); assert.equal(L[0].sym, 'ABCD'); assert.equal(L[0].kind, 'catalyst'); assert.equal(L[0].px, 10);
});

test('tier2 switched off -> nothing (proven-only, as before)', async () => {
  const S = await loadScan({ files: { ...files('TRADABLE SMALL'), 'data/settings.json': { tier2: false } } });
  assert.deepEqual(S.fn('catalystLines')(sig, {}), []);
});

test('PROVEN is shown even with tier2 off', async () => {
  const S = await loadScan({ files: { ...files('PROVEN'), 'data/settings.json': { tier2: false } } });
  assert.match(S.fn('catalystLines')(sig, {}).join('\n'), /CATALYST RUN-UP \(PROVEN/);
});

test('its own ledger turned negative (20+ finished catalyst calls) -> off', async () => {
  const L = Array.from({ length: 20 }, (_, i) => ({ d: '2026-08-01', sym: 'S' + i, kind: 'catalyst', px: 10, out: '2026-09-01', px1: 9, pct: -0.108 }));
  const S = await loadScan({ files: files('TRADABLE SMALL', { 'data/tier2-ledger.jsonl': L }) });
  assert.deepEqual(S.fn('catalystLines')(sig, {}), []);
});

test('not halal, blocked by a gate, already held, lottery-like, or a buy day other than the next session -> not shown', async () => {
  const ups = [item({ sym: 'NOTH', halal: 'fail' }), item({ sym: 'DILU', blocked: true, why: ['dilution filing 424B5 2026-10-20'] }), item({ sym: 'HELD' }), item({ sym: 'LOTT' }), item({ sym: 'LATE', buy: '2026-10-27' }), item({ sym: 'PAST', entryPassed: true })];
  const S = await loadScan({ files: files('TRADABLE SMALL', {}, ups) });
  assert.deepEqual(S.fn('catalystLines')({ ...sig, lottery: { LOTT: 0.2 } }, { HELD: { entry: 5 } }), []);
});

test('the  catalysts  command shows the calendar as information only when no rule qualified', async () => {
  const S = await loadScan({ files: files(null) });
  const t = S.fn('catalystCalendarText')();
  assert.match(t, /INFORMATION ONLY/);
  assert.match(t, /- ABCD: PDUFA 2026-12-10; buy day 2026-10-26, sell day 2026-12-08/);
});

test('no network was used', () => { assert.deepEqual(blocked, []); });

test('catalyst BUY requires current affirmative owner ZAD, never stale/generated third-party halal',async()=>{
 for(const marks of [{},{ABCD:{s:'ok',d:'2020-01-01'}},{ABCD:{s:'ok',d:'2099-01-01'}},{ABCD:{s:'fail',d:new Date().toISOString().slice(0,10)}},{ABCD:{s:'ok',d:new Date().toISOString().slice(0,10),by:'Zoya'}}]){
  const S=await loadScan({files:files('PROVEN',{'data/halal.json':marks})});
  assert.deepEqual(S.fn('catalystLines')(sig,{}),[]);
  assert.doesNotMatch(S.fn('catalystCalendarText')(),/halal per ZAD|current owner ZAD mark/);
 }
 const S=await loadScan({files:files('PROVEN',{'data/zad-list.json':{notHalal:[]},'data/halal.json':'{broken'})});assert.deepEqual(S.fn('catalystLines')(sig,{}),[]);
 const missing=await loadScan({files:files('PROVEN')});fs.unlinkSync(path.join(missing.dir,'data/zad-list.json'));assert.deepEqual(missing.fn('catalystLines')(sig,{}),[]);
});
