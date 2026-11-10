// Seams: research-core.mjs IDEA 14 (daily researcher, 10 Nov 2026): Wikipedia attention. Wikidata SPARQL -> CIK map, Pageviews JSON ->
// daily series, append, month totals, the monthly score and floors, the cross-section percentile, the spike rule, the data rule, pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, ONE_OPEN, WIKI, WIKI_IDS, wikiMap, wikiSeries, wikiAppend, wikiEnd, wikiMonth, wikiScore, wikiRank, wikiSpikes, wikiDataRule, preRegister } from '../research-core.mjs';

const pv = (rows) => ({ items: rows.map(([d, v]) => ({ project: 'en.wikipedia', article: 'X', granularity: 'daily', timestamp: d.replace(/-/g, '') + '00', access: 'all-access', agent: 'user', views: v })) });
const flat = (d0, n, v) => ({ d0, v: new Array(n).fill(v) });

test('three wiki buy rules, holds fixed, one open trade per stock', () => {
  assert.deepEqual(WIKI_IDS, ['RQ-WIKI-M21', 'RQ-WIKI-M63', 'RQ-WIKI-SPIKE10']);
  assert.deepEqual(WIKI_IDS.map(id => RULES[id].hold), [21, 63, 10]);
  for (const id of WIKI_IDS) { assert.equal(RULES[id].kind, 'buy'); assert.ok(IDS.includes(id)); assert.ok(BUY_IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.equal(WIKI.minMonth, 1000); assert.equal(WIKI.top, 0.8); assert.equal(WIKI.spikeX, 3); assert.equal(WIKI.spikeBase, 100);
});
test('wikidata map: CIK without zeros, decoded title with underscores, first title for duplicates, bad rows skipped', () => {
  const j = { results: { bindings: [
    { cik: { value: '0001045810' }, article: { value: 'https://en.wikipedia.org/wiki/Nvidia' } },
    { cik: { value: '0000320193' }, article: { value: 'https://en.wikipedia.org/wiki/Apple_Inc.' } },
    { cik: { value: '320193' }, article: { value: 'https://en.wikipedia.org/wiki/Apple%20Computer' } },
    { cik: { value: '0000789019' }, article: { value: 'https://de.wikipedia.org/wiki/Microsoft' } },
    { cik: { value: 'abc' }, article: { value: 'https://en.wikipedia.org/wiki/X' } },
    { cik: { value: '12' }, article: { value: 'https://en.wikipedia.org/wiki/Proctor_%26_Gamble' } }] } };
  const r = wikiMap(j);
  assert.deepEqual(r.map, { '1045810': 'Nvidia', '320193': 'Apple_Computer', '12': 'Proctor_&_Gamble' });
  assert.equal(r.dupCiks, 1); assert.equal(r.items, 6);
  assert.deepEqual(wikiMap(null).map, {});
});
test('series: omitted days are 0, from-date pads the start; append lets newer data win', () => {
  const s = wikiSeries(pv([['2021-07-03', 5], ['2021-07-01', 2]]));
  assert.deepEqual(s, { d0: '2021-07-01', v: [2, 0, 5] });
  assert.deepEqual(wikiSeries(pv([['2021-07-03', 5]]), '2021-07-01'), { d0: '2021-07-01', v: [0, 0, 5] });
  assert.equal(wikiSeries({ items: [] }), null);
  const b = wikiSeries(pv([['2021-07-03', 9], ['2021-07-05', 1]]));
  assert.deepEqual(wikiAppend(s, b), { d0: '2021-07-01', v: [2, 0, 9, 0, 1] });
  assert.equal(wikiEnd(wikiAppend(s, b)), '2021-07-05'); assert.equal(wikiEnd(null), null);
});
test('month totals only for fully covered months', () => {
  const s = flat('2021-07-01', 62, 10);   // July + August 2021
  assert.equal(wikiMonth(s, '2021-07'), 310); assert.equal(wikiMonth(s, '2021-08'), 310); assert.equal(wikiMonth(s, '2021-09'), null);
  assert.equal(wikiMonth(flat('2021-07-02', 61, 10), '2021-07'), null);
});
test('score in month M = ln(M-1) - ln(M-2); both months 1,000+ views; year wrap', () => {
  const v = [...new Array(31).fill(40), ...new Array(31).fill(80)], s = { d0: '2021-12-01', v };   // Dec 2021 = 1240, Jan 2022 = 2480
  assert.ok(Math.abs(wikiScore(s, '2022-02') - Math.log(2)) < 1e-12);
  assert.equal(wikiScore(s, '2022-01'), null);   // needs Nov 2021
  assert.equal(wikiScore({ d0: '2021-12-01', v: [...new Array(31).fill(30), ...new Array(31).fill(80)] }, '2022-02'), null);   // Dec = 930 < 1,000
});
test('cross-section percentile: needs the minimum count; ties share the mid rank; top 20% = p >= 0.80', () => {
  const list = Array.from({ length: 11 }, (_, k) => ({ key: 'S' + k, s: k }));
  assert.equal(wikiRank(list, 300).size, 0);
  const r = wikiRank(list, 5); assert.equal(r.get('S0'), 0); assert.equal(r.get('S10'), 1); assert.equal(r.get('S8'), 0.8);
  const t = wikiRank([{ key: 'a', s: 1 }, { key: 'b', s: 1 }, { key: 'c', s: 2 }], 3); assert.equal(t.get('a'), 0.25); assert.equal(t.get('b'), 0.25); assert.equal(t.get('c'), 1);
  assert.equal(wikiRank([{ key: 'a', s: NaN }, { key: 'b', s: 1 }], 1).size, 1);
});
test('spike: 5-day mean 3x the median of d-60..d-5, base 100+, one per 91 days', () => {
  const v = new Array(200).fill(200); for (let k = 70; k < 75; k++) v[k] = 700; for (let k = 120; k < 125; k++) v[k] = 900; for (let k = 170; k < 175; k++) v[k] = 900;
  const sp = wikiSpikes({ d0: '2022-01-01', v });
  // day 70..74 mean reaches 3x (600) on the day with 5 x 700 = 700 >= 600 -> first crossing when mean >= 600: (700*k + 200*(5-k))/5 >= 600 -> k >= 4 -> day 73
  assert.equal(sp.length, 2); assert.equal(sp[0].d, '2022-03-15'); assert.equal(sp[0].base, 200);
  assert.equal(sp[1].d, '2022-06-22');   // the day-120 spike is within 91 days of day 73 -> skipped; day 170..174 -> day 172 (4 of 5 days at 900: 760 >= 600 -> k=3 -> day 172)
  assert.equal(wikiSpikes({ d0: '2022-01-01', v: new Array(200).fill(50).map((x, k) => k === 100 ? 5000 : x) }).length, 0);   // base under 100
  assert.equal(wikiSpikes({ d0: '2022-01-01', v }, '2022-04-01').length, 1);
  assert.deepEqual(wikiSpikes(null), []);
});
test('data rule', () => {
  assert.equal(wikiDataRule({ articles: 2000, answered: 1990, months: 55, spikes: 900 }).ok, true);
  const r = wikiDataRule({ articles: 1400, answered: 1000, months: 40, spikes: 100 }); assert.equal(r.ok, false);
  assert.match(r.why, /1,500 needed/); assert.match(r.why, /95% needed/); assert.match(r.why, /50 needed/); assert.match(r.why, /500 needed/);
});
test('pre-registration adds the three wiki entries once, before any result', () => {
  const LB = { strategies: [] }; preRegister(LB); const w = LB.strategies.filter(x => /^RQ-WIKI-/.test(x.id));
  assert.equal(w.length, 3); assert.ok(w.every(x => !x.result && /pre-registered 2026-11-10/.test(x.status)));
  assert.equal(preRegister(LB), 0);
});
