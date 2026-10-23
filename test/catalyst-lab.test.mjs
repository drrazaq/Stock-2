// Seam: catalyst-lab.mjs end to end (the study as the workflow runs it), with EDGAR full-text search, the EDGAR documents, the EDGAR
// full index and Massive (the system boundaries) replaced by a local stub, and a small synthetic 2-year price cache.
// Checks the registered CAT-RUN1 trade dates and gates on known cases, and the upcoming-catalyst list the scan reads.
// Run: node test/catalyst-lab.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tradingSessions } from '../catalyst-core.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = tradingSessions('2023-01-03', '2024-12-31');
// companies: AAA a clean PDUFA run-up; BBB sells shares (424B5) 6 sessions before its buy day; DDD jumped 20% in a day before its
// buy day (lottery); CCC has a PDUFA date after the last cached day (the live list)
const CO = { AAA: 1001, BBB: 1002, CCC: 1003, DDD: 1004, EEE: 1005, FFF: 1006 };
// CAT-NEWS1: EEE gets 3 Fast Track 8-Ks (the third on Friday 1 March 2024) while rising; FFF the same plus a clinical hold 8-K
const NEWS = [...['2024-02-01', '2024-02-15', '2024-03-01'].flatMap(d => [{ sym: 'EEE', filed: d, q: '"Fast Track designation"' }, { sym: 'FFF', filed: d, q: '"Fast Track designation"' }]), { sym: 'FFF', filed: '2024-02-20', q: '"clinical hold"' }];
const FILINGS = [
  { sym: 'AAA', filed: '2024-03-01', text: 'The FDA set a PDUFA target action date of June 14, 2024 for the NDA.' },
  { sym: 'BBB', filed: '2024-06-03', text: 'The PDUFA goal date is September 16, 2024.' },
  { sym: 'DDD', filed: '2024-07-01', text: 'The Prescription Drug User Fee Act (PDUFA) date is October 15, 2024.' },
  { sym: 'CCC', filed: '2024-12-02', text: 'The FDA assigned a PDUFA target action date of March 14, 2025.' },
];
const price = (sym, d, k) => {
  if (sym === 'AAA') return d >= '2024-05-20' ? 12 : 10;              // bought at 10 on 2 May 2024, 12 at the 12 June sell
  if (sym === 'DDD') return S.indexOf(d) >= S.indexOf('2024-08-28') ? 12 : 10;   // +20% on 28 Aug 2024, inside the month before its buy day
  if (sym === 'SPY') return 400 + k * 0.1;
  if (sym === 'EEE' || sym === 'FFF') return 10 + k * 0.02;
  return 20 + 3 * Math.sin(k / 7 + sym.length + sym.charCodeAt(1));
};
function cache(dir) {
  const syms = ['SPY', 'AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', ...Array.from({ length: 70 }, (_, j) => 'F' + String.fromCharCode(65 + (j % 26)) + String.fromCharCode(65 + Math.floor(j / 26)))];
  const days = {}; S.forEach((d, k) => { const x = { T: [], o: [], h: [], l: [], c: [], v: [] }; for (const s of syms) { const p = price(s, d, k); x.T.push(s); x.o.push(p); x.h.push(p); x.l.push(p); x.c.push(p); x.v.push(500000); } days[d] = x; });
  fs.mkdirSync(path.join(dir, 'study-cache'), { recursive: true }); fs.writeFileSync(path.join(dir, 'study-cache/grouped.json.gz'), zlib.gzipSync(JSON.stringify({ days })));
}
let requests = 0;
const server = http.createServer((req, res) => { requests++; const u = new URL(req.url, 'http://x'); let body = '', type = 'application/json';
  if (u.pathname === '/LATEST/search-index') { const q = u.searchParams.get('q'), a = u.searchParams.get('startdt'), b = u.searchParams.get('enddt');
    const news = NEWS.filter(f => f.q === q && f.filed >= a && f.filed <= b && +u.searchParams.get('from') === 0).map((f, j) => ({ _id: '0000000' + CO[f.sym] + '-24-' + f.filed.replace(/-/g, '') + ':ex99.htm', _source: { ciks: ['000000' + CO[f.sym]], display_names: [f.sym + ' Inc  (' + f.sym + ')  (CIK 000000' + CO[f.sym] + ')'], file_date: f.filed, adsh: '0000000' + CO[f.sym] + '-24-' + f.filed.replace(/-/g, ''), sics: ['2834'], root_forms: ['8-K'] } }));
    const hits = news.length ? news : q === '"PDUFA"' ? FILINGS.filter(f => f.filed >= a && f.filed <= b && +u.searchParams.get('from') === 0).map((f, j) => ({ _id: '000000000' + CO[f.sym] + '-24-00000' + j + ':ex99-1.htm', _source: { ciks: ['000000' + CO[f.sym]], display_names: [f.sym + ' Inc  (' + f.sym + ')  (CIK 000000' + CO[f.sym] + ')'], file_date: f.filed, adsh: '000000000' + CO[f.sym] + '-24-00000' + j, sics: ['2834'], root_forms: ['8-K'] } })) : [];
    body = JSON.stringify({ hits: { total: { value: hits.length }, hits } }); }
  else if (/\/Archives\/edgar\/data\/\d+\/\d+\/ex99-1\.htm$/.test(u.pathname)) { const cik = +u.pathname.split('/')[4], f = FILINGS.find(x => CO[x.sym] === cik); type = 'text/html'; body = '<html><body><p>' + (f ? f.text : '') + '</p></body></html>'; }
  else if (/full-index\/(\d{4})\/QTR(\d)\/master\.gz$/.test(u.pathname)) { const [, y, q] = u.pathname.match(/full-index\/(\d{4})\/QTR(\d)/); let t = 'CIK|Company Name|Form Type|Date Filed|Filename\n--------------------------------------------------------------------------------\n';
    if (y === '2024' && q === '3') t += '1002|BBB INC|424B5|2024-07-25|edgar/data/1002/x.txt\n1001|AAA INC|S-8|2024-07-01|edgar/data/1001/y.txt\n';
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(zlib.gzipSync(t)); return; }
  else if (u.pathname === '/v3/reference/tickers') { const results = u.searchParams.get('type') === 'CS' && u.searchParams.get('active') === 'true' ? [...Object.entries(CO).map(([ticker, cik]) => ({ ticker, cik: '000000' + cik })), ...Array.from({ length: 1001 }, (_, j) => ({ ticker: 'Z' + [26 * 26, 26, 1].map(m => String.fromCharCode(65 + Math.floor(j / m) % 26)).join(''), cik: String(500000 + j) }))] : [];
    body = JSON.stringify({ results }); }
  else { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': type }); res.end(body); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalyst-lab-test-')); process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} });
cache(dir); fs.mkdirSync(path.join(dir, 'data')); fs.writeFileSync(path.join(dir, 'data/halal.json'), JSON.stringify({ CCC: { s: 'ok', d: '2026-10-20' } }));
const run = () => new Promise((resolve) => { const p = spawn(process.execPath, [path.join(REPO, 'catalyst-lab.mjs')], { cwd: dir, env: { PATH: process.env.PATH, EFTS_BASE: BASE, SEC_BASE: BASE, MASSIVE_BASE: BASE, MASSIVE_KEY: 'k', CAT_MINUTES: '10' } });
  let log = ''; p.stdout.on('data', c => log += c); p.stderr.on('data', c => log += c); p.on('close', (code) => resolve({ code, log })); });
const r = await run(); server.close();
const OUT = JSON.parse(fs.readFileSync(path.join(dir, 'data/catalyst-lab.json'), 'utf8')), TODAY = JSON.parse(fs.readFileSync(path.join(dir, 'data/catalyst-today.json'), 'utf8'));

test('the lab runs to the end on complete data', () => {
  assert.equal(r.code, 0, r.log);
  assert.equal(OUT.complete, true, JSON.stringify(OUT.data));
});

test('AAA: bought the open 30 sessions before the 14 June 2024 PDUFA date, sold the close 2 sessions before, after 0.8% costs', () => {
  const a = OUT.trades['CAT-RUN1'].filter(x => x.s === 'AAA');
  assert.equal(a.length, 1);
  assert.equal(a[0].buy, '2024-05-02');
  assert.equal(a[0].sell, '2024-06-12');
  assert.equal(a[0].net, 0.192);   // 10 -> 12 is +20%, minus 0.8%
});

test('BBB (424B5 6 sessions before its buy day) and DDD (+20% in one day the month before) are excluded', () => {
  const syms = OUT.trades['CAT-RUN1'].map(x => x.s);
  assert.ok(!syms.includes('BBB')); assert.ok(!syms.includes('DDD'));
  assert.equal(OUT.results['CAT-RUN1'].funnel.dilution, 1);
  assert.equal(OUT.results['CAT-RUN1'].funnel.lottery, 1);
});

test('one trade is no verdict: nothing is frozen and the library is not marked tested', () => {
  assert.match(OUT.results['CAT-RUN1'].verdict, /^NO VERDICT YET \(TOO FEW CASES/);
  assert.equal(OUT.firstRun, null);
});

test('CCC: the upcoming list carries the buy and sell dates on the NYSE calendar and the halal status', () => {
  const c = TODAY.upcoming.find(x => x.sym === 'CCC');
  assert.ok(c, JSON.stringify(TODAY.upcoming));
  assert.equal(c.buy, '2025-01-30'); assert.equal(c.sell, '2025-03-12'); assert.equal(c.entryPassed, false);
  assert.equal(c.halal, 'ok'); assert.equal(c.blocked, false);
  assert.equal(TODAY.rules['CAT-RUN1'], null);   // no rule qualified: the scan shows nothing in ACTIONS
});

test('CAT-NEWS1: the third positive 8-K (1 March 2024) with the price above its 50-day -> buy 4 March, sell the close 15 sessions later; a clinical hold in the window blocks FFF', () => {
  const e = OUT.trades['CAT-NEWS1'].filter(x => x.s === 'EEE');
  assert.equal(e[0].buy, '2024-03-04'); assert.equal(e[0].sell, '2024-03-22'); assert.equal(e[0].positives, 3);
  assert.ok(!OUT.trades['CAT-NEWS1'].some(x => x.s === 'FFF'));
});
