// Seams: squad25-core.mjs (SQUAD 25, 27 Oct 2026: SQ25-GIANTSTAKE / SQ25-GIANTWIDE). EDGAR master rows, filing headers (FILED BY /
// SUBJECT COMPANY / acceptance), 13F information tables and first appearances, 13D/13G events, CUSIP -> symbol, sessions A and B,
// the universe, the exit, slippage, giants point in time, pre-registration. Run: node --test test/squad25-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { nyParts } from '../sec-time.mjs';
import { IDS, RULES, TH, GIANTS_SHA, masterRow, adshOf, parseHeader, parseInfoTable, equityIssuers, firstAppearances, coverCusip, dgEvents, ftdSym, etToIso, sessionsOf, isExtHm,
  fillBar, bSession, sharesKnown, universeFail, exitFrom, grossSlip, giantIndex, giantOn, preRegister, isDG, is13F } from '../squad25-core.mjs';

test('registry and pre-registration', () => {
  assert.equal(Object.keys(RULES).length, 4); for (const id of Object.values(IDS)) { assert.equal(RULES[id].hold, 10); assert.equal(RULES[id].block, 10); }
  assert.equal(typeof GIANTS_SHA, 'string');
  const LB = { strategies: [] }; assert.equal(preRegister(LB), 4); assert.equal(preRegister(LB), 0, 'idempotent'); assert.deepEqual(LB.strategies.map(x => x.id).sort(), Object.values(IDS).sort());
});

test('EDGAR master rows: only 13F / 13D / 13G forms', () => {
  assert.deepEqual(masterRow('1045810|NVIDIA CORP|13F-HR|2024-02-14|edgar/data/1045810/0001045810-24-000021.txt'), ['1045810', 'NVIDIA CORP', '13F-HR', '2024-02-14', 'edgar/data/1045810/0001045810-24-000021.txt']);
  assert.equal(masterRow('1045810|NVIDIA CORP|10-K|2024-02-21|edgar/data/1045810/x.txt'), null);
  assert.equal(masterRow('CIK|Company Name|Form Type|Date Filed|Filename'), null);
  assert.equal(masterRow('1652044|Alphabet Inc.|SCHEDULE 13G|20250110|edgar/data/1652044/0001193125-25-001234.txt')[3], '2025-01-10');
  assert.equal(adshOf('edgar/data/1045810/0001045810-24-000021.txt'), '0001045810-24-000021');
  assert.ok(isDG('SC 13G/A') && isDG('SCHEDULE 13D') && !isDG('13F-HR') && is13F('13F-HR/A'));
});

const HDR13G = `<SEC-HEADER>0000950170-24-001234.hdr.sgml : 20240110
<ACCEPTANCE-DATETIME>20240110161530
ACCESSION NUMBER:		0000950170-24-001234
CONFORMED SUBMISSION TYPE:	SC 13G
PUBLIC DOCUMENT COUNT:		1
FILED AS OF DATE:		20240110

SUBJECT COMPANY:

	COMPANY DATA:
		COMPANY CONFORMED NAME:			SMALLCO INC
		CENTRAL INDEX KEY:			0001111111

FILED BY:

	COMPANY DATA:
		COMPANY CONFORMED NAME:			NVIDIA CORP
		CENTRAL INDEX KEY:			0001045810
</SEC-HEADER>
<DOCUMENT>
<TYPE>SC 13G
<TEXT>
CUSIP No. 83600C 10 3
</TEXT></DOCUMENT>`;
test('filing header: acceptance, form, FILED BY vs SUBJECT COMPANY; cover CUSIP', () => {
  const h = parseHeader(HDR13G); assert.equal(h.accept, '20240110161530'); assert.equal(h.form, 'SC 13G'); assert.deepEqual(h.subject, ['1111111']); assert.deepEqual(h.filedBy, ['1045810']); assert.equal(h.names['1045810'], 'NVIDIA CORP');
  const f = parseHeader('ACCEPTANCE-DATETIME: 20240214161245\nCONFORMED SUBMISSION TYPE: 13F-HR\nCONFORMED PERIOD OF REPORT: 20231231\nFILER:\n\tCOMPANY DATA:\n\t\tCOMPANY CONFORMED NAME: NVIDIA CORP\n\t\tCENTRAL INDEX KEY: 0001045810\n');
  assert.equal(f.period, '2023-12-31'); assert.deepEqual(f.filer, ['1045810']); assert.deepEqual(f.subject, []);
  assert.equal(coverCusip(HDR13G), '83600C103');
  assert.equal(coverCusip('<issuerCusip>83600C103</issuerCusip>'), '83600C103');
  assert.equal(coverCusip('no number here'), null);
});

const INFO = `<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
<infoTable><nameOfIssuer>ARM HOLDINGS PLC</nameOfIssuer><titleOfClass>SPONSORED ADS</titleOfClass><cusip>042068205</cusip><value>147340</value><shrsOrPrnAmt><sshPrnamt>1960978</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
<infoTable><nameOfIssuer>SOUNDHOUND AI INC</nameOfIssuer><titleOfClass>CL A</titleOfClass><cusip>836100107</cusip><value>3698</value><shrsOrPrnAmt><sshPrnamt>1730770</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
<ns1:infoTable><ns1:nameOfIssuer>SOME CO</ns1:nameOfIssuer><ns1:cusip>123456AB1</ns1:cusip><ns1:shrsOrPrnAmt><ns1:sshPrnamt>5</ns1:sshPrnamt><ns1:sshPrnamtType>PRN</ns1:sshPrnamtType></ns1:shrsOrPrnAmt></ns1:infoTable>
<infoTable><nameOfIssuer>OPT CO</nameOfIssuer><cusip>999999109</cusip><shrsOrPrnAmt><sshPrnamt>5</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>Call</putCall></infoTable>
</informationTable>`;
test('13F information table: equity rows only; first appearances vs the previous period', () => {
  const rows = parseInfoTable(INFO); assert.equal(rows.length, 4); assert.equal(rows[2].type, 'PRN');
  const iss = equityIssuers(rows); assert.deepEqual([...iss.keys()], ['042068', '836100']);
  const mk = (adsh, form, accept, period, keys) => ({ adsh, form, accept, period, issuers: new Map(keys.map(k => [k, { cusip: k + '109', name: k }])) });
  // first-ever filing: every issuer is new
  let ev = firstAppearances([mk('a1', '13F-HR', '20240214161245', '2023-12-31', ['042068', '836100'])]); assert.equal(ev.length, 2); assert.ok(ev.every(e => e.firstEver));
  // later filing: only issuers not in the previous period; an amendment accepted before adds to the previous period
  ev = firstAppearances([mk('a1', '13F-HR', '20240214161245', '2023-12-31', ['042068']), mk('a1b', '13F-HR/A', '20240301100000', '2023-12-31', ['111111']),
    mk('a2', '13F-HR', '20240515170000', '2024-03-31', ['042068', '111111', '222222'])]);
  assert.deepEqual(ev.filter(e => e.adsh === 'a2').map(e => e.cusip6), ['222222']);
  // an amendment is never itself an event; an issuer that left and came back two periods later is new again
  ev = firstAppearances([mk('b1', '13F-HR', '20230101', '2022-12-31', ['333333']), mk('b2', '13F-HR', '20230501', '2023-03-31', []), mk('b3', '13F-HR', '20230801', '2023-06-30', ['333333'])]);
  assert.deepEqual(ev.filter(e => !e.firstEver).map(e => e.adsh + ':' + e.cusip6), ['b3:333333']);
});

test('13D / 13G events: originals always, an amendment only as the first filing on the subject', () => {
  const ev = dgEvents([{ adsh: 'x1', form: 'SC 13G/A', accept: '20220101', subject: '1' }, { adsh: 'x2', form: 'SC 13G', accept: '20220201', subject: '2' }, { adsh: 'x3', form: 'SC 13G/A', accept: '20230201', subject: '2' },
    { adsh: 'x4', form: 'SCHEDULE 13D', accept: '20250201', subject: '1' }, { adsh: 'x2', form: 'SC 13G', accept: '20220201', subject: '2' }]);
  assert.deepEqual(ev.map(e => e.adsh), ['x1', 'x2', 'x4']); assert.equal(ev[0].firstOnSubject, true); assert.equal(ev[2].firstOnSubject, false);
});

test('CUSIP -> symbol, point in time (fails-to-deliver records)', () => {
  const M = new Map([['836100107', [['2022-05-01', 'SOUN'], ['2023-06-01', 'SOUN']]], ['12345678', [['2021-01-01', 'OLD'], ['2022-06-01', 'NEW']]]]);
  assert.equal(ftdSym(M, '836100107', '2024-02-14'), 'SOUN', 'latest record within 400 days');
  assert.equal(ftdSym(M, '836100107', '2022-04-01'), 'SOUN', 'first record within 90 days after');
  assert.equal(ftdSym(M, '836100107', '2021-01-01'), null);
  assert.equal(ftdSym(M, '123456789', '2022-01-01'), 'OLD', 'eight-character key; the symbol of that date');
  assert.equal(ftdSym(M, '123456789', '2022-07-01'), 'NEW');
});

const D = ['2024-02-12', '2024-02-13', '2024-02-14', '2024-02-15', '2024-02-16', '2024-02-20'];
test('acceptance -> last close before (p) and the A entry session; B fill bar and session 1', () => {
  const iso = etToIso('20240214161245', nyParts); assert.equal(iso, '2024-02-14T21:12:45.000Z');
  assert.deepEqual(sessionsOf(D, { d: '2024-02-14', hm: '16:12' }), { p: 2, kA: 3, phase: 'after' });
  assert.deepEqual(sessionsOf(D, { d: '2024-02-14', hm: '08:00' }), { p: 1, kA: 2, phase: 'before' });
  assert.deepEqual(sessionsOf(D, { d: '2024-02-14', hm: '11:00' }), { p: 1, kA: 3, phase: 'during' });
  assert.deepEqual(sessionsOf(D, { d: '2024-02-17', hm: '11:00' }), { p: 4, kA: 5, phase: 'closed-day' });
  const acc = Date.parse(iso), M = [{ ms: acc - 30000, o: 2.27, ny: { d: '2024-02-14', hm: '16:12' } }, { ms: acc + 15000, o: 2.28, ny: { d: '2024-02-14', hm: '16:13' } }, { ms: acc + 75000, o: 2.2795, ny: { d: '2024-02-14', hm: '16:14' } }];
  assert.equal(fillBar(M, acc).o, 2.2795, 'the first bar starting 60+ seconds after acceptance');
  assert.ok(isExtHm('16:14') && isExtHm('09:29') && !isExtHm('09:30') && !isExtHm('15:59'));
  assert.deepEqual(bSession(D, { d: '2024-02-14', hm: '16:14' }), { s1: 3, preOpen: true });
  assert.deepEqual(bSession(D, { d: '2024-02-14', hm: '10:00' }), { s1: 2, preOpen: false });
  assert.deepEqual(bSession(D, { d: '2024-02-14', hm: '07:00' }), { s1: 2, preOpen: true });
});

test('universe and share counts', () => {
  assert.equal(universeFail(2.25, 23e6, 7e8), null); assert.equal(universeFail(0.9, 23e6, 7e8), 'price under 1'); assert.equal(universeFail(5, 1e5, 7e8), 'traded value');
  assert.equal(universeFail(50, 1e8, 12e9), 'market value 10B+'); assert.equal(universeFail(50, 1e8, null), 'no market value');
  assert.equal(sharesKnown([['2023-09-30', 100], ['2024-01-31', 200]], '2024-02-14'), 100, '30 days late');
});

test('exit: stop, open gap, time; B on session 1; slippage', () => {
  const S = { o: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], h: Array(13).fill(11), l: Array(13).fill(9), c: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 12, 10, 10], v: Array(13).fill(1) };
  assert.deepEqual(exitFrom(S, 1, 10, false), { x: 10, px: 12, kind: 'time', held: 10, lastClose: 10 });
  const S2 = { ...S, l: [...S.l] }; S2.l[3] = 7; assert.deepEqual(exitFrom(S2, 1, 10, false), { x: 3, px: 7.5, kind: 'stop', held: 3, lastClose: 3 });
  const S3 = { ...S, o: [...S.o] }; S3.o[1] = 7; assert.equal(exitFrom(S3, 1, 10, false).kind, 'time', 'session-1 open is not checked for an A entry (it is the entry)');
  assert.deepEqual(exitFrom(S3, 1, 10, true), { x: 1, px: 7, kind: 'stop', held: 1, lastClose: 1 }, 'a B fill before the open: the session-1 open counts');
  assert.equal(exitFrom(S, 8, 10, false, 13).open, true);
  assert.ok(Math.abs(grossSlip(10, 12, 0) - 0.2) < 1e-9); assert.ok(Math.abs(grossSlip(10, 12, 0.02) - (11.76 / 10.2 - 1)) < 1e-9);
});

test('giants: groups and point in time', () => {
  const G = { giants: [{ id: 'NVDA', group: 'base', ciks: ['1045810'] }, { id: 'PFE', group: 'wide', ciks: ['78003'], pitQuarters: ['2021-10-01', '2022-01-01'] }] }, I = giantIndex(G);
  assert.equal(I.get('1045810').id, 'NVDA'); assert.equal(giantOn(I.get('1045810'), 'base', '2024-02-14'), true); assert.equal(giantOn(I.get('1045810'), 'wide', '2024-02-14'), true);
  assert.equal(giantOn(I.get('78003'), 'base', '2022-02-01'), false, 'wide giants are not in the base rule');
  assert.equal(giantOn(I.get('78003'), 'wide', '2022-02-01'), true); assert.equal(giantOn(I.get('78003'), 'wide', '2021-05-01'), true, 'before the first list: the first list');
  assert.equal(giantOn(I.get('78003'), 'wide', '2024-02-01'), false, 'off the list that quarter');
});
