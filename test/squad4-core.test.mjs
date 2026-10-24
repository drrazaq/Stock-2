// Seams: squad4-core.mjs (SQUAD 4, 24 Oct 2026: big winners, themes and compounders). The position plans (35% disaster stop, trailing exit
// after +100%, one add at -15%, dead stock = loss), sustained multiples for the 10x study, split-artifact guard, point-in-time fundamentals
// (TTM growth, acceleration, margins, R&D, ROIC proxy, debt), insider ownership from Form 3/4/5 rows, the eight rule checks, payoff shape,
// look-alike buckets, precision, and the idempotent library pre-registration. Pure functions, no network, no files.
// Run: node test/squad4-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { series } from '../hold-core.mjs';
import { runPlan, PLAN_G, PLAN_T, INFO_PLANS, sustainedFwd, bestMultiple, firstSustained, artifactJumps, hasArtifact, fundamentals, revInfo, holdingsOf, commonTitle, insiderOwnAt,
  cikFromSpans, growLeadOk, rule40Ok, insiderOk, rdCompOk, qualDipOk, ipoLeadOk, profileOk, themeGrowPick, isTech, payoff, precision, profileKey, preRegister, IDS, RULES, planOf,
  highOf, smaOf, splitFix, sharesAt, rawSharesNear, monthStarts, halfOf, weighted, perYearOf, dedupeByCompany, boardStats, paperReady } from '../squad4-core.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e, flat = (px) => series(px, px);

test('plan G: holds 252 sessions and sells at that close when nothing triggers', () => {
  const c = [100, 100, 110, 90, 120, 130], r = runPlan(flat(c), 1, { ...PLAN_G, maxH: 5 });
  assert.equal(r.kind, 'max'); assert.equal(r.x, 5); assert.ok(near(r.g, 0.30)); assert.ok(near(r.worst, -0.10)); assert.ok(near(r.best, 0.30)); assert.equal(r.units.length, 1);
});

test('plan G: the 35% disaster stop sells at the NEXT open', () => {
  const c = [100, 100, 80, 64, 60, 70], o = [100, 100, 81, 70, 58, 69], r = runPlan(series(o, c), 1, { ...PLAN_G, maxH: 5 });
  assert.equal(r.kind, 'stop'); assert.equal(r.x, 4); assert.equal(r.at, 'o'); assert.ok(near(r.g, -0.42));
});

test('plan G: after +100% a close under the 50-session average exits; before +100% it does not', () => {
  // 60 sessions flat at 100, then a run to 230 and a slide; the close under the 50-day average after the doubling sells at the next open
  const c = [], o = []; for (let k = 0; k < 60; k++) c.push(100); for (let k = 1; k <= 40; k++) c.push(100 + k * 3.25); for (let k = 1; k <= 40; k++) c.push(230 - k * 4);
  for (const x of c) o.push(x); const s = series(o, c), te = 60, r = runPlan(s, te, { ...PLAN_G, maxH: 75 });
  assert.equal(r.kind, 'trail'); assert.ok(r.g > 0.5, 'kept most of the gain: ' + r.g);
  // the same slide without ever doubling (peak +60%): no trailing exit, held to the end
  const c2 = [], o2 = []; for (let k = 0; k < 60; k++) c2.push(100); for (let k = 1; k <= 40; k++) c2.push(100 + k * 1.5); for (let k = 1; k <= 40; k++) c2.push(160 - k * 1); for (const x of c2) o2.push(x);
  const r2 = runPlan(series(o2, c2), 60, { ...PLAN_G, maxH: 80 }); assert.equal(r2.kind, 'max');
});

test('plan T: adds 0.5 unit after the first close 15% under the first buy; stop on the TOTAL', () => {
  const c = [100, 100, 84, 80, 70, 90, 100, 100], o = [100, 100, 86, 82, 72, 88, 99, 100], r = runPlan(series(o, c), 1, { ...PLAN_T, maxH: 7 });
  assert.equal(r.units.length, 2); assert.equal(r.units[1].k, 3); assert.equal(r.units[1].px, 82); assert.equal(r.w, 1.5); assert.equal(r.kind, 'max');
  const v = 1 + 0.5 * 100 / 82; assert.ok(near(r.g, (v - 1.5) / 1.5));
});

test('plans: a dead stock loses everything left; a stock gone above 3 USD is paid its last close; too short a window is not judged', () => {
  const T = 20, c = new Array(T).fill(NaN), o = new Array(T).fill(NaN); for (let k = 0; k < 8; k++) { c[k] = 10 - k; o[k] = 10 - k; }   // last close 3 at k=7? 10-7=3 -> not under 3
  c[8] = 2; o[8] = 2.2; const r = runPlan(series(o, c, T), 1, { ...INFO_PLANS.FORGET, maxH: 15 }); assert.equal(r.kind, 'dead'); assert.ok(near(r.g, -1));
  const c2 = new Array(T).fill(NaN); for (let k = 0; k < 8; k++) c2[k] = 50 + k; const r2 = runPlan(series(c2, c2, T), 1, { ...INFO_PLANS.FORGET, maxH: 15 }); assert.equal(r2.kind, 'gone'); assert.ok(near(r2.g, 57 / 51 - 1));
  assert.equal(runPlan(flat([1, 2, 3]), 1, { ...PLAN_G, maxH: 5 }), null);
  const p = runPlan(flat([10, 10, 11, 12]), 1, { ...PLAN_G, maxH: 10, partial: true }); assert.equal(p.kind, 'open'); assert.ok(near(p.g, 0.2));
});

test('sustained multiples: a one-day spike does not count; holding 20 sessions does', () => {
  const c = [1, 1, 1, 12, 1, 1]; for (let k = 0; k < 30; k++) c.push(1); const m = sustainedFwd(c); const b = bestMultiple(c, m, 0); assert.ok(b.m < 2, 'spike ignored: ' + b.m);
  const d = [2, 2]; for (let k = 0; k < 10; k++) d.push(2 + k * 2); for (let k = 0; k < 25; k++) d.push(22); const m2 = sustainedFwd(d); const b2 = bestMultiple(d, m2, 0);
  assert.ok(near(b2.m, 11)); assert.equal(firstSustained(d, m2, 0, 10), 11); assert.equal(firstSustained(d, m2, 0, 20), -1); assert.equal(firstSustained(d, m2, 0, 5), 6);
  const lim = bestMultiple(d, m2, 0, 5); assert.ok(lim.m < 11);
});

test('split artifacts: near-whole 3x-50x one-day jumps are flagged; ordinary big moves are not', () => {
  assert.deepEqual(artifactJumps([10, 10, 100, 101, 102]), [2]);   // 10x: a reverse split not adjusted
  assert.deepEqual(artifactJumps([10, 10, 2.5, 2.6]), [2]);        // 1/4
  assert.deepEqual(artifactJumps([10, 10, 25, 26]), []);            // 2.5x: not whole
  assert.deepEqual(artifactJumps([10, 10, 19.8, 20]), []);          // 2x real moves are kept (under 3)
  assert.equal(hasArtifact([5], 2, 10), true); assert.equal(hasArtifact([5], 5, 10), false);
});

// ---- facts fixture: quarterly + annual revenue / gross profit / R&D / operating income, filed 40 / 60 days after period end ----
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
function facts(byYear) { const out = []; for (const [y, q] of Object.entries(byYear)) { const Q = [[y + '-01-01', y + '-03-31'], [y + '-04-01', y + '-06-30'], [y + '-07-01', y + '-09-30']];
    Q.forEach(([s, e], k) => out.push({ s, e, v: q[k], f: add(e, 40) })); out.push({ s: y + '-01-01', e: y + '-09-30', v: q[0] + q[1] + q[2], f: add(y + '-09-30', 40) });
    out.push({ s: y + '-01-01', e: y + '-12-31', v: q[0] + q[1] + q[2] + q[3], f: add(y + '-12-31', 60) }); } return out; }
const REV = facts({ 2021: [50, 50, 50, 50], 2022: [100, 100, 100, 100], 2023: [110, 120, 140, 180] });
const GP = facts({ 2021: [20, 20, 20, 20], 2022: [40, 40, 40, 40], 2023: [55, 60, 70, 90] });   // 40% -> 50%
const RD = facts({ 2022: [15, 15, 15, 15], 2023: [20, 20, 20, 20] });
const OP = facts({ 2022: [5, 5, 5, 5], 2023: [10, 12, 14, 20] });
const CO = { rev: { Revenues: REV }, gp: { GrossProfit: GP }, cogs: {}, rd: { ResearchAndDevelopmentExpense: RD }, op: { OperatingIncomeLoss: OP }, cfo: { X: facts({ 2022: [20, 20, 20, 20], 2023: [30, 30, 30, 30] }) }, capex: {},
  eq: { StockholdersEquity: [{ e: '2023-12-31', v: 200, f: '2024-02-29' }] }, debt: {}, cash: { C: [{ e: '2023-12-31', v: 50, f: '2024-02-29' }] } };

test('fundamentals point in time: TTM growth, acceleration, margin trend, R&D, operating margin, FCF, ROIC, debt', () => {
  const f = fundamentals(CO, '2024-03-15');
  assert.ok(near(f.revG, 550 / 400 - 1)); assert.equal(f.accel, true); assert.ok(near(f.gm, 275 / 550)); assert.ok(near(f.gmPrev, 0.4)); assert.equal(f.gmUp, true);
  assert.ok(near(f.rdInt, 80 / 550)); assert.ok(near(f.opM, 56 / 550)); assert.equal(f.opUp, true); assert.ok(near(f.fcfM, 120 / 550));   // never reported capex -> 0
  assert.equal(f.de, 0); assert.ok(near(f.roic, 56 * 0.79 / 150)); assert.ok(near(f.rev2y, 200));
  // on the day the 10-K is filed it is not yet known (filed BEFORE the day only): the Q3 TTM is used
  const g = fundamentals(CO, '2024-02-29'); assert.equal(g.revEnd, '2023-09-30'); assert.ok(near(g.revG, (110 + 120 + 140 + 100) / (50 + 100 + 100 + 100) - 1));
  // stale: nothing filed for 200+ days -> unknown
  assert.equal(fundamentals(CO, '2025-03-15').revG, null);
  assert.equal(revInfo({}, '2024-03-15'), null);
});

test('insiders: common-stock holdings per ownership line, officers/directors only, stale owners dropped', () => {
  assert.equal(commonTitle('Class A Common Stock'), true); assert.equal(commonTitle('Series B Preferred Stock'), false); assert.equal(commonTitle('Restricted Stock Units'), false);
  const h = holdingsOf([{ title: 'Common Stock', di: 'D', sh: 1000, date: '2024-01-02', seq: 1 }, { title: 'Common Stock', di: 'D', sh: 900, date: '2024-01-03', seq: 2 },
    { title: 'Common Stock', di: 'I', nature: 'By Trust', sh: 5000, date: '2024-01-02', seq: 3 }, { title: 'Warrants', di: 'D', sh: 99999, date: '2024-01-03', seq: 4 }]);
  assert.equal(h, 5900);
  const own = new Map([['a', [['2023-01-01', 0.08, true], ['2024-01-01', 0.06, true]]], ['b', [['2023-06-01', 0.30, false]]], ['c', [['2020-01-01', 0.5, true]]]]);
  assert.ok(near(insiderOwnAt(own, '2024-02-01'), 0.06)); assert.ok(near(insiderOwnAt(own, '2023-12-31'), 0.08)); assert.equal(insiderOwnAt(new Map(), '2024-01-01'), 0);
  assert.equal(cikFromSpans([[111, '2019-01-01', '2021-01-01', 5], [222, '2023-01-01', '2026-01-01', 40]], '2024-06-01'), '222');
  assert.equal(cikFromSpans([[111, '2019-01-01', '2021-01-01', 5]], '2024-06-01'), null);
});

test('rule checks as registered', () => {
  const f = { revG: 0.35, accel: true, gmUp: true, gm: 0.5, rdInt: 0.12, opUp: true, fcfM: 0.1, roic: 0.25, de: 0.2, rev: 300, rev2y: 140 };
  assert.equal(growLeadOk(f, 0.96), true); assert.equal(growLeadOk(f, 0.94), false); assert.equal(growLeadOk({ ...f, accel: false }, 1), false); assert.equal(growLeadOk({ ...f, gmUp: null }, 1), false);
  assert.equal(isTech('7372'), true); assert.equal(isTech('2834'), false); assert.equal(rule40Ok(f, '7372'), true); assert.equal(rule40Ok({ ...f, revG: 0.2, fcfM: 0.19 }, '7372'), false); assert.equal(rule40Ok(f, '2834'), false);
  assert.equal(insiderOk(f, 0.12, true), true); assert.equal(insiderOk(f, 0.09, true), false); assert.equal(insiderOk(f, 0.2, false), false);
  assert.equal(rdCompOk(f), true); assert.equal(rdCompOk({ ...f, opUp: false }), false);
  const px = { close: 80, prevClose: 81, hi: 100, prevHi: 100, maNow: 90, maThen: 85 };
  assert.equal(qualDipOk(f, px), true); assert.equal(qualDipOk(f, { ...px, prevClose: 79 }), false); assert.equal(qualDipOk(f, { ...px, maThen: 95 }), false); assert.equal(qualDipOk({ ...f, de: 0.6 }, px), false); assert.equal(qualDipOk({ ...f, roic: 0.1 }, px), false);
  assert.equal(ipoLeadOk(f, '2021-06-01', '2024-06-01', 0.97), true); assert.equal(ipoLeadOk(f, '2023-06-01', '2024-06-01', 0.97), false); assert.equal(ipoLeadOk({ ...f, rev2y: 200 }, '2021-06-01', '2024-06-01', 0.97), false);
  assert.equal(profileOk(f, 2e9, 0.1, 0.9), true); assert.equal(profileOk(f, 2e10, 0.1, 0.9), false); assert.equal(profileOk(f, 2e9, 0.3, 0.9), false); assert.equal(profileOk({ ...f, gm: 0.3 }, 2e9, 0.1, 0.9), false);
  const pick = themeGrowPick([{ ind: 'A', n: 6, nRet: 6, ret12: 0.5, members: [{ key: 1, revG: 0.1 }, { key: 2, revG: 0.9 }, { key: 3, revG: -0.2 }, { key: 4, revG: 0.3 }, { key: 5, revG: null }, { key: 6, revG: 0.2 }] },
    { ind: 'B', n: 4, nRet: 4, ret12: 2, members: [] }, { ind: 'C', n: 8, nRet: 8, ret12: 0.4, members: [] }]);
  assert.equal(pick.ind, 'A'); assert.deepEqual(pick.picks, [2, 4, 6]);
  assert.equal(themeGrowPick([]), null);
});

test('payoff: the share of profit from the top 5% and the shape', () => {
  const rows = []; for (let k = 0; k < 19; k++) rows.push({ g: 0.008 - 0.1, kind: 'stop' }); rows.push({ g: 3.008, kind: 'max' });
  const p = payoff(rows); assert.equal(p.n, 20); assert.equal(p.top5n, 1); assert.ok(near(p.allProfit, 3 - 1.9)); assert.ok(near(p.top5Share, 3 / 1.1, 1e-3)); assert.ok(near(p.withoutTop5, -0.1, 1e-3)); assert.ok(near(p.x4, 0.05));
  const q = payoff(rows.slice(0, 5)); assert.equal(q.top5Share, null);
});

test('look-alike buckets and precision', () => {
  assert.equal(profileKey({ revG: 0.5, rsPct: 0.1, cap: 1e9, gmUp: true }), 'g30-100|rsTop|small|gmUp'); assert.equal(profileKey({}), 'g?|rs?|cap?|gm?');
  const rows = [{ sym: 'A', m: 6, dead: false, ret: 4 }, { sym: 'B', m: 1.1, dead: true, ret: -1 }, { sym: 'C', m: 1.2, dead: false, ret: -0.85 }, { sym: 'D', m: 1, dead: false, ret: 0.1 }];
  const p = precision(rows, { x5: 0.1 }); assert.equal(p.x5n, 1); assert.ok(near(p.x5, 0.25)); assert.ok(near(p.lift5, 2.5)); assert.ok(near(p.crash80, 0.5)); assert.ok(near(p.failedPerWinner, 3)); assert.equal(p.deadN, 1);
});

test('helpers: highs, averages, shares, month starts, halves, weighting, per year, dedupe, board', () => {
  const c = []; for (let k = 0; k < 300; k++) c.push(100 + (k % 50)); assert.equal(highOf(c, 299, 252), 149); assert.equal(highOf(c, 100, 252), null); assert.ok(near(smaOf([1, 2, 3, 4], 3, 4), 2.5));
  assert.deepEqual(splitFix([['2020-01-01', 100], ['2020-06-01', 400]]), [['2020-01-01', 400], ['2020-06-01', 400]]);
  assert.equal(sharesAt([['2024-01-01', 10]], '2024-01-20'), null); assert.equal(sharesAt([['2024-01-01', 10]], '2024-02-05'), 10); assert.equal(rawSharesNear([['2023-01-01', 5], ['2024-01-01', 10]], '2024-03-01'), 10);
  assert.deepEqual(monthStarts(['2024-01-30', '2024-01-31', '2024-02-01', '2024-02-02', '2024-03-01']), [2, 4]);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
  assert.ok(near(weighted([{ k: 0, w: 1 }, { k: 1, w: 0.5 }], 5, 'c', (k) => k === 0 ? 0.1 : 0.4), 0.2)); assert.equal(weighted([{ k: 0, w: 1 }], 5, 'c', () => null), null);
  assert.ok(near(perYearOf([{ g: 0.208, w: 1, unitYears: 1 }, { g: 0.008, w: 1, unitYears: 1 }]), 0.1));
  assert.equal(dedupeByCompany([{ key: 1, cik: 'x', dv: 5 }, { key: 2, cik: 'x', dv: 9 }, { key: 3, dv: 1 }]).length, 2);
  const b = boardStats([{ d: 'a', sym: 'X', g: 0.108, c: 0.05 }, { d: 'b', sym: 'Y', g: -0.092, c: 0 }]); assert.ok(near(b.avg, 0)); assert.equal(paperReady(b), false);
});

test('pre-registration: eight rules, idempotent, marks B-100X1 with the exact spec; every rule has a plan', () => {
  assert.ok(IDS.length >= 8); for (const id of IDS) { assert.match(id, /^SQ4-/); assert.ok(RULES[id].rule.length > 50); assert.ok(planOf(id).maxH === 252); }
  const LB = { strategies: [{ id: 'B-100X1', status: 'queued (Agent B)' }] }; const n1 = preRegister(LB); assert.equal(n1, IDS.length + 1);
  assert.equal(preRegister(LB), 0); assert.match(LB.strategies[0].status, /Squad 4/); assert.ok(LB.strategies[0].squad4Spec.includes('20 sessions'));
  const e = LB.strategies.find(x => x.id === 'SQ4-GROWLEAD'); assert.match(e.explain, /35%/); assert.match(e.status, /pre-registered/);
});
