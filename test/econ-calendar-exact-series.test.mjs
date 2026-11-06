// Economic calendar exact series (6 Nov 2026 repair). Synthetic fixtures only: local stand-ins for the BLS/Fed schedule pages and a
// provider calendar; no credentials, provider requests or real messages. The actual calendar.mjs job writes the encrypted calendar,
// then the actual Telegram formatters (ACTIONS and the "calendar" command) read it.
// 6 Nov defects reproduced: continuing-claims numbers shown under an initial-claims 4-week-average label; productivity shown as a
// "Jobs report"; a private-payrolls row with no unit replacing the jobs-report headline.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadScan, blocked } from './load-scan.mjs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { mergeEconRows, seriesOf, verifyValue } from '../econ-series.mjs';
import { watcherReport } from '../watcher-reporting.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), KEY = 'synthetic-private-key-for-tests';
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const MON = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'], FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const blsDate = (d) => MON[+d.slice(5, 7) - 1] + ' ' + d.slice(8, 10) + ', ' + d.slice(0, 4), refOf = (d) => FULL[(+d.slice(5, 7) + 10) % 12] + ' ' + (d.slice(5, 7) === '01' ? +d.slice(0, 4) - 1 : d.slice(0, 4));
const D1 = day(1), D2 = day(2), D3 = day(3);
const table = (rows) => '<html><body><table><tr><th>Reference Month</th><th>Release Date</th><th>Release Time</th></tr>' + rows.map(([r, d]) => '<tr><td>' + r + '</td><td>' + blsDate(d) + '</td><td>08:30 AM</td></tr>').join('') + '</table></body></html>';
// provider rows (synthetic): the exact 6 Nov shapes, plus a correct headline row and an unmapped small event
function providerRows({ headline = true } = {}) {
  return [
    { event: 'Jobless Claims 4-Week Average', date: D1 + 'T13:30:00Z', forecast: '1710K', previous: '1701K', country: 'US' },
    { event: 'Initial Jobless Claims', date: D1 + 'T13:30:00Z', forecast: '195K', previous: '195K', country: 'US' },
    { event: 'Nonfarm Productivity QoQ', date: D1 + 'T13:30:00Z', forecast: '2.5%', previous: '1.4%', country: 'US' },
    { event: 'Nonfarm Payrolls Private', date: D2 + 'T13:30:00Z', forecast: '5', previous: '9', country: 'US' },
    ...(headline ? [{ event: 'Nonfarm Payrolls', date: D2 + 'T13:30:00Z', forecast: '40K', previous: '29K', country: 'US' }] : []),
    { event: 'CPI MoM', date: D3 + 'T13:30:00Z', forecast: '0.3%', previous: '0.2%', country: 'US' },
    { event: 'EIA Crude Oil Stocks Change', date: D1 + 'T15:30:00Z', forecast: '1.2M', previous: '-0.4M', country: 'US' }
  ];
}
async function servers(opts) {
  const rows = opts.rows || providerRows(opts);
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/query')) { const q = new URL(req.url, 'http://synthetic'); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify((opts.avReply || {})[q.searchParams.get('function')] || { Information: 'synthetic unavailable' })); return; }
    if (req.url.startsWith('/schedule/news_release/')) { const pg = req.url.split('/').pop().replace('.htm', ''); const map = { empsit: [[refOf(D2), D2]], prod2: [['Third Quarter 2026 (P)', D1]], cpi: [[refOf(D3), D3]], ppi: [], realer: [] }; res.end(table(map[pg] || [])); return; }
    if (req.url.startsWith('/monetarypolicy/')) { res.end('<html>2026 FOMC Meetings</html>'); return; }
    if (req.url.startsWith('/mcp/')) { let b = ''; req.on('data', c => b += c); req.on('end', () => { const j = JSON.parse(b); res.setHeader('content-type', 'application/json');
      if (!('id' in j)) { res.end(''); return; }
      const result = j.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: {} } : j.method === 'tools/list' ? { tools: [{ name: 'get_economic_calendar', inputSchema: { properties: { fromDate: { type: 'string' }, toDate: { type: 'string' } } } }] }
        : { structuredContent: { events: j.params.arguments.toDate >= day(0) ? rows : [] } };
      res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result })); }); return; }
    res.statusCode = 404; res.end('');
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); return { base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() };
}
// run the ACTUAL calendar.mjs fetch job in a scratch folder; returns the encrypted file and the public status
async function runCalendar(opts = {}) {
  const s = await servers(opts), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-test-'));
  if (opts.seed) { fs.mkdirSync(path.join(dir, 'data'), { recursive: true }); fs.writeFileSync(path.join(dir, 'data/calendar.enc'), seal(opts.seed)); }
  try { const r = await new Promise((resolve, reject) => { const c = spawn(process.execPath, [path.join(REPO, 'calendar.mjs')], { cwd: dir, env: { PATH: process.env.PATH, MODE: 'fetch', PRIVATE_KEY: KEY, TIPRANKS_KEY: 'synthetic', ...(opts.avReply ? { ALPHAVANTAGE_KEY: 'synthetic', AV_BASE: s.base } : {}), TR_BASE: s.base, BLS_BASE: s.base, FED_BASE: s.base } });
      let out = '', err = ''; const timer = setTimeout(() => { c.kill('SIGKILL'); reject(new Error('calendar job timeout')); }, 60000);
      c.stdout.on('data', b => out += b); c.stderr.on('data', b => err += b); c.on('close', status => { clearTimeout(timer); resolve({ status, stdout: out, stderr: err }); }); });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    return { enc: fs.readFileSync(path.join(dir, 'data/calendar.enc'), 'utf8'), status: JSON.parse(fs.readFileSync(path.join(dir, 'data/calendar-status.json'), 'utf8')) };
  } finally { s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
function seal(value) { const k = crypto.createHash('sha256').update(KEY).digest(), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv), b = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(value))), c.final()]); return Buffer.concat([iv, c.getAuthTag(), b]).toString('base64'); }
const unseal = (enc) => { const b = Buffer.from(enc, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(KEY).digest(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(b.subarray(28)), d.final()]))); };
const scanWith = (enc) => loadScan({ files: { 'data/calendar.enc': enc, 'data/settings.json': { focus: false } }, env: { PRIVATE_KEY: KEY } });

test('pure mapping: exact names only; units and plausible bands checked; unmapped names are UNKNOWN', () => {
  assert.equal(seriesOf('Jobless Claims 4-Week Average'), 'CLAIMS_INITIAL_4WK'); assert.equal(seriesOf('Continuing Jobless Claims'), 'CLAIMS_CONTINUED');
  assert.equal(seriesOf('Nonfarm Payrolls Private'), 'PAYROLLS_PRIVATE'); assert.equal(seriesOf('Nonfarm Payrolls'), 'PAYROLLS_TOTAL'); assert.equal(seriesOf('Nonfarm Productivity QoQ'), 'PRODUCTIVITY');
  assert.equal(seriesOf('CPI MoM (Oct)'), 'CPI_MOM'); assert.equal(seriesOf('Fed Funds Rate'), null); assert.equal(seriesOf('Fed Interest Rate Decision'), 'FED_RATE'); assert.equal(seriesOf('Consumer Price Index (CPI)'), null); assert.equal(seriesOf('Redbook YoY'), null);
  assert.match(verifyValue('CLAIMS_INITIAL_4WK', '1710K').unknown, /outside the plausible range/);
  assert.match(verifyValue('PAYROLLS_PRIVATE', '5').unknown, /unit not stated/); assert.equal(verifyValue('PAYROLLS_PRIVATE', '46K').v, 46);
  assert.equal(verifyValue('CLAIMS_CONTINUED', '1.71M').v, 1710); assert.match(verifyValue('PRODUCTIVITY', '2.5').unknown, /unit/);
});

test('pure merge: a subsidiary series never renames or replaces the official headline; conflicting duplicates are UNKNOWN', () => {
  const off = [{ t: D2 + 'T13:30', release: 'empsit', name: 'Employment Situation', src: 'BLS', ref: 'October 2026', retrievedAt: 'R' }];
  const [r] = mergeEconRows(off, [{ t: D2 + 'T13:30:00', name: 'Nonfarm Payrolls Private', fcRaw: '5K', prevRaw: '46K' }], { providerAt: 'P' });
  assert.equal(r.title, 'Jobs report'); assert.equal(r.fc, null); assert.equal(r.prev, null);   // no headline -> no headline figures
  assert.equal(r.series[0].id, 'PAYROLLS_PRIVATE'); assert.equal(r.series[0].headline, false); assert.equal(r.series[0].previous.vintage, 'PROVIDER_PREVIOUS_AS_RETRIEVED');
  const [c] = mergeEconRows(off, [{ t: D2 + 'T13:30:00', name: 'Nonfarm Payrolls', fcRaw: '40K' }, { t: D2 + 'T13:30:00', name: 'Nonfarm Payrolls', fcRaw: '60K' }], { providerAt: 'P' });
  assert.equal(c.series.length, 1); assert.equal(c.series[0].consensus.status, 'UNKNOWN'); assert.match(c.series[0].consensus.why, /conflicting/); assert.equal(c.fc, null);
});

test('actual job + actual ACTIONS: headline series with units, reference periods and source; no misplaced 1710K / private-payroll headline', async () => {
  const { enc, status } = await runCalendar(), S = await scanWith(enc);
  const text = await S.fn('actionsText')({ session: day(0) }, {}, null, 'SYNTHETIC');
  const wk = text.split('\n').find(l => l.startsWith('THIS WEEK: ')); assert.ok(wk, text);
  assert.match(wk, /Jobless claims: Initial jobless claims, week ending \d{4}-\d\d-\d\d: consensus 195K, previous 195K/);
  assert.match(wk, /Productivity and costs: Nonfarm productivity \(quarter, annual rate\), Third Quarter 2026 \(P\): consensus 2\.5%, previous 1\.4%/);
  assert.match(wk, new RegExp('Jobs report: Nonfarm payrolls \\(monthly change\\), ' + refOf(D2) + ': consensus 40K, previous 29K'));
  assert.match(wk, new RegExp('Inflation \\(CPI\\): CPI \\(month on month\\), ' + refOf(D3) + ': consensus 0\\.3%, previous 0\\.2%'));
  assert.doesNotMatch(wk, /1710|1701|Private|Jobs report \(Nonfarm Productivity|forecast 5, previous 9/);
  assert.match(text, /Consensus and previous figures: TipRanks, as retrieved \d{4}-\d\d-\d\d; a previous figure can differ from the one finally published and may be revised in the release\./);
  // public status: official source references only; no provider values
  assert.ok(status.officialSources.some(x => x.release === 'empsit' && x.url === 'https://www.bls.gov/schedule/news_release/empsit.htm' && x.retrievedAt));
  assert.doesNotMatch(JSON.stringify(status), /1710|195K|40K/);
});

test('actual "calendar" command: subsidiary series listed separately with UNKNOWN reasons, vintage and source', async () => {
  const { enc } = await runCalendar(), S = await scanWith(enc), full = S.fn('calendarText')(false);
  assert.match(full, /Initial claims, 4-week average, week ending [\d-]+: consensus UNKNOWN, previous UNKNOWN \[consensus UNKNOWN: value outside the plausible range for this series \(source mapping not verified\)/);
  assert.match(full, /Private payrolls \(monthly change\), [A-Za-z]+ \d{4}: consensus UNKNOWN, previous UNKNOWN \[consensus UNKNOWN: unit not stated or not thousands/);
  assert.match(full, /Nonfarm payrolls \(monthly change\)[^\n]*\[consensus TipRanks \d{4}-\d\d-\d\d, retrieved before the release; previous TipRanks \d{4}-\d\d-\d\d, retrieved before the release\]/);
  assert.match(full, /EIA Crude Oil Stocks Change[^\n]*\n\s+EIA Crude Oil Stocks Change: figures UNKNOWN \(series not verified\)/);
  assert.match(full, /Jobs report \([A-Za-z]+ \d{4}\) \[date: BLS schedule\]/);
});

test('provider sends only the private-payrolls row: the jobs report headline is UNKNOWN, never filled by the subsidiary', async () => {
  const { enc } = await runCalendar({ headline: false }), S = await scanWith(enc), short = S.fn('calendarText')(true);
  assert.match(short, /Jobs report: figures UNKNOWN \(headline not provided or not verified\)/); assert.doesNotMatch(short, /Private payrolls|forecast 5/);
});

test('a calendar saved before the repair is never re-shown with merged figures', async () => {
  const crypto = await import('node:crypto'), zlib = await import('node:zlib');
  const old = { updated: new Date().toISOString(), econ: [{ t: D2 + 'T13:30', name: 'Nonfarm Payrolls Private', key: 'nonfarm payrolls private', kind: 'JOBS', fc: 5, prev: 9, act: null, unit: '', src: 'BLS' }], hist: [], holidays: [], div: {} };
  const k = crypto.createHash('sha256').update(KEY).digest(), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv), e = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(old))), c.final()]);
  const S = await scanWith(Buffer.concat([iv, c.getAuthTag(), e]).toString('base64')), short = S.fn('calendarText')(true);
  assert.match(short, /Jobs report: figures UNKNOWN \(saved before the exact-series check; the next calendar run refreshes them\)/); assert.doesNotMatch(short, /forecast 5|previous 9/);
});


// ---- r2: Codex review 046877af counterexamples (R1-R6, R4b), reproduced through the actual job and the actual Telegram callers
const show = async (opts) => { const r = await runCalendar(opts), C = unseal(r.enc), S = await scanWith(r.enc); return { C, S, text: S.fn('calendarText')(false) }; };
const prow = (name, forecast, unit, extra = {}) => ({ event: name, date: D2 + 'T13:30:00Z', forecast, ...(unit ? { unit } : {}), country: 'US', ...extra });
const prevMonth = (ref) => FULL[(FULL.indexOf(ref.split(' ')[0]) + 11) % 12].slice(0, 3);
test('R1: a provider period that disagrees with the official reference is UNKNOWN, never relabelled; agreeing and no-hint controls stay valid', async () => {
  const bad = await show({ rows: [prow('Nonfarm Payrolls (' + prevMonth(refOf(D2)) + ')', '40K')] }), v = bad.C.econ.find(x => x.release === 'empsit').series.find(x => x.id === 'PAYROLLS_TOTAL');
  assert.equal(v.consensus.status, 'UNKNOWN'); assert.match(v.consensus.why, /does not match the official reference/); assert.doesNotMatch(bad.text, new RegExp(refOf(D2) + ': consensus 40K'));
  const good = await show({ rows: [prow('Nonfarm Payrolls (' + refOf(D2).slice(0, 3) + ')', '40K'), prow('CPI MoM', '0.3%', null, { date: D3 + 'T13:30:00Z' })] });
  assert.equal(good.C.econ.find(x => x.release === 'empsit').fc, 40); assert.equal(good.C.econ.find(x => x.release === 'cpi').fc, 0.3);
});
test('R2: duplicate rows that differ only in unit are UNKNOWN in either order', async () => {
  for (const rows of [[prow('Nonfarm Payrolls', '40', 'K'), prow('Nonfarm Payrolls', '40', 'M')], [prow('Nonfarm Payrolls', '40', 'M'), prow('Nonfarm Payrolls', '40', 'K')]]) {
    const { C, S } = await show({ rows }), e = C.econ.find(x => x.release === 'empsit'); assert.equal(e.series[0].consensus.status, 'UNKNOWN'); assert.equal(e.fc, null);
    assert.match(S.fn('calendarText')(true), /Jobs report: Nonfarm payrolls[^|]*consensus UNKNOWN/); }
  const same = await show({ rows: [prow('Nonfarm Payrolls', '40', 'K'), prow('Nonfarm Payrolls', '0.04', 'M')] }); assert.equal(same.C.econ.find(x => x.release === 'empsit').fc, 40);   // deliberate equivalent-unit normalization
});
test('R3: a null/zero cached CPI index never becomes a released value (no -100%); a valid zero payroll CHANGE stays', async () => {
  const [y, mo] = [refOf(D3).split(' ')[1], FULL.indexOf(refOf(D3).split(' ')[0])], cur = y + '-' + String(mo + 1).padStart(2, '0') + '-01', prior = new Date(Date.UTC(+y, mo - 1, 1)).toISOString().slice(0, 10);
  const { C, text } = await show({ rows: [], seed: { hist: [], holidays: [], div: {}, av: { CPI: [[cur, null], [prior, 300]] }, avAt: new Date().toISOString() } }), e = C.econ.find(x => x.release === 'cpi');
  assert.ok(e.act === null || e.act === undefined); assert.doesNotMatch(text, /-100/);
  const [y2, mo2] = [refOf(D2).split(' ')[1], FULL.indexOf(refOf(D2).split(' ')[0])], c2 = y2 + '-' + String(mo2 + 1).padStart(2, '0') + '-01', p2 = new Date(Date.UTC(+y2, mo2 - 1, 1)).toISOString().slice(0, 10);
  const z = await show({ rows: [], seed: { hist: [], holidays: [], div: {}, av: { NFP: [[c2, 150000], [p2, 150000]] }, avAt: new Date().toISOString() } });
  assert.equal(z.C.econ.find(x => x.release === 'empsit').act, 0);
});
test('R4: a provider previous retrieved after the release is labelled as such, never as a pre-release vintage', async () => {
  const { C, text } = await show({ rows: [{ event: 'Nonfarm Payrolls', date: day(-1) + 'T13:30:00Z', previous: '46K', country: 'US' }] }), r = C.econ.find(x => x.day === day(-1) && x.release === 'empsit');
  assert.equal(r.series[0].previous.vintage, 'PROVIDER_PREVIOUS_AS_RETRIEVED'); assert.equal(r.series[0].previous.timing, 'RETRIEVED_AFTER_RELEASE');
  assert.match(text, /previous TipRanks \d{4}-\d\d-\d\d, retrieved after the release \(may already be revised\)/); assert.doesNotMatch(text, /published before the release/);
});
test('R4b: a partial Alpha Vantage refresh does not freshen the unchanged payroll series clock', async () => {
  const [y, mo] = [refOf(D2).split(' ')[1], FULL.indexOf(refOf(D2).split(' ')[0])], cur = y + '-' + String(mo + 1).padStart(2, '0') + '-01', prior = new Date(Date.UTC(+y, mo - 1, 1)).toISOString().slice(0, 10), oldAt = new Date(Date.now() - 7 * 864e5).toISOString();
  const { C } = await show({ rows: [], seed: { hist: [], holidays: [], div: {}, av: { NFP: [[cur, 150050], [prior, 150000]] }, avAt: oldAt }, avReply: { CPI: { data: [{ date: cur, value: '310' }, { date: prior, value: '300' }] } } });
  const a = C.econ.find(x => x.release === 'empsit').series.find(x => x.id === 'PAYROLLS_TOTAL').actual; assert.equal(a.v, 50); assert.equal(a.retrievedAt, oldAt);
});
test('R5: claims numerically below consensus read BELOW, with the job-market meaning stated separately', async () => {
  const rows = mergeEconRows([], [{ t: D1 + 'T13:30:00Z', name: 'Initial Jobless Claims', fcRaw: '195K', actRaw: '189K' }], { providerAt: new Date().toISOString() }), S = await scanWith(seal({ updated: new Date().toISOString(), econ: rows, hist: [], holidays: [], div: {} }));
  const text = S.fn('calendarText')(false); assert.match(text, /came in 189K vs consensus 195K = BELOW \(lower: a stronger job market\)/); assert.doesNotMatch(text, /= ABOVE/);
});
test('R6 (health): an actionable delivery failure with complete configured coverage keeps its message-recovery counts', async () => {
  const beats = Array.from({ length: 331 }, (_, i) => ({ m: 570 + i, received: 5, evaluated: 5 })), delivery = { generatedAt: 1, unhealthy: true, retryWaiting: 0, retryExhausted: 2, pendingFinalizations: 1, uncertainStates: 1 };
  const r = watcherReport([{ day: '2026-11-05', minutes: 331, firstMinute: '09:30' }], [{ day: '2026-11-05', configuredWindow: { open: 570, endExclusive: 901 }, heartbeat: beats, messageDelivery: delivery }]); assert.equal(r.actionable, true);
  const S = await loadScan({ files: { 'data/health.json': { at: '2026-11-06T01:00:00Z', watcher: r, problems: [r.text] }, 'data/signals.json': { session: '2026-11-05' }, 'data/discovery.json': { session: '2026-11-05', candidates: [] }, 'data/movers-state.json': { session: '2026-11-05' } } });
  const h = S.fn('healthLine')(Date.parse('2026-11-06T09:00:00Z')); assert.match(h, /331\/331 minutes/); assert.match(h, /MESSAGE DELIVERY PROBLEM; message recovery: [^;]*2 exhausted/);
});
test('production reader macroNow: a headline surprise keeps its exact study key; a subsidiary series never triggers a reaction', async () => {
  const ind = { 'nonfarm payrolls_HOT': { up: [{ name: 'SYNTHETIC INDUSTRY', g: '999', newer: { ex: 0.02 } }], down: [] } }, now = new Date(Date.now() - 3600e3).toISOString();
  const off = [{ t: now.slice(0, 16), release: 'empsit', name: 'Employment Situation', key: 'employment situation', src: 'BLS', ref: null }];
  const head = mergeEconRows(off, [{ t: now.slice(0, 19), name: 'Nonfarm Payrolls', key: 'nonfarm payrolls', fcRaw: '40K', actRaw: '90K' }], { providerAt: now });
  const sub = mergeEconRows(off, [{ t: now.slice(0, 19), name: 'Nonfarm Payrolls Private', key: 'nonfarm payrolls private', fcRaw: '40K', actRaw: '90K' }], { providerAt: now });
  for (const [rows, want] of [[head, 1], [sub, 0]]) { const S = await scanWith(seal({ updated: now, econ: rows, hist: [], holidays: [], div: {}, study: { industry: ind, labels: {} } }));
    const M = S.fn('macroNow')(); assert.equal(M.filter(m => /nonfarm payrolls/.test(m.key)).length, want, JSON.stringify(M)); }
});

test('all requests stayed synthetic and offline', () => assert.deepEqual(blocked, []));
