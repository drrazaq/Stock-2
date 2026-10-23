// Seam: chain-decoder.mjs end to end (the study as the workflow runs it), with SEC full-text search, EDGAR documents, EDGAR submissions,
// SEC XBRL, the SEC ticker list and the EDGAR full index (the system boundaries) replaced by a local stub, a small chain-defs.json and a
// synthetic 2-year price cache. Checks the point-in-time graph (membership dates, today-only exclusions, verified customer links,
// material agreements with materiality) and the registered CHAIN-DEMAND1 / CHAIN-READ1 trades on known cases.
// Run: node test/chain-decoder.test.mjs
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
const S = tradingSessions('2023-01-03', '2024-12-31'), at = (d) => S.indexOf(d);
// CIKs. CCC has no filing with its layer keyword (today-only); ZZZ has no CIK at all (today-only)
const CO = { AAA: 2001, BBB: 2002, CCC: 2003, DDD: 2004, EEE: 2005, FFF: 2006, KKK: 2011, LLL: 2012, GGG: 2021, HHH: 2022, III: 2023 };
const DEFS = { defined: '2026-10-23', chains: {
  AI: { source: 'https://example.org/ai', layers: [
    { layer: 'Chips', keywords: ['chips'], syms: ['AAA', 'BBB', 'CCC', 'ZZZ'], source: 'https://example.org/chips' },
    { layer: 'Cloud', keywords: ['cloud'], syms: ['DDD', 'EEE', 'FFF'], source: 'https://example.org/cloud' } ] },
  Gold: { source: 'https://example.org/gold', layers: [{ layer: 'Miners', keywords: ['gold'], syms: ['GGG', 'HHH', 'III'], source: 'https://example.org/gold' }] } },
  demandNodes: [{ sym: 'DDD', aliases: ['Dodo Cloud'] }], tickerAliases: {} };
// DDD's earnings 8-K, accepted 25 Apr 2024 after the close (16:05 New York) -> signal session 26 Apr, buy the open of 29 Apr
const ENTRY = at('2024-04-29');
const price = (sym, k) => {
  if (sym === 'SPY') return { o: 400 + k * 0.1, l: 400 + k * 0.1, c: 400 + k * 0.1 };
  if (sym === 'BBB' && k >= at('2024-04-26')) return { o: 10.6, l: 10.6, c: 10.6 };            // +6% on the signal day: already moved
  if (sym === 'KKK' && k === ENTRY + 10) return { o: 10, l: 7.5, c: 10 };                       // a 25% intraday drop: the 20% stop
  if (sym === 'FFF' && k > at('2024-06-04')) return { o: 11, l: 11, c: 11 };                    // the read-through peer rises after
  if (['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'KKK', 'LLL', 'GGG', 'HHH', 'III'].includes(sym)) return { o: 10, l: 10, c: 10 };
  const p = 20 + 3 * Math.sin(k / 7 + sym.charCodeAt(1)); return { o: p, l: p, c: p };
};
function cache(dir) {
  const syms = ['SPY', ...Object.keys(CO), ...Array.from({ length: 70 }, (_, j) => 'F' + String.fromCharCode(65 + (j % 26)) + String.fromCharCode(65 + Math.floor(j / 26)))];
  const days = {}; S.forEach((d, k) => { const x = { T: [], o: [], h: [], l: [], c: [], v: [] }; for (const s of syms) { const p = price(s, k); x.T.push(s); x.o.push(p.o); x.h.push(Math.max(p.o, p.c)); x.l.push(p.l); x.c.push(p.c); x.v.push(500000); } days[d] = x; });
  fs.mkdirSync(path.join(dir, 'study-cache'), { recursive: true }); fs.writeFileSync(path.join(dir, 'study-cache/grouped.json.gz'), zlib.gzipSync(JSON.stringify({ days, sic: { AAA: { c: '3674', n: 'SEMICONDUCTORS' } } })));
}
const hit = (sym, date, file, items = [], form = '10-K') => ({ _id: 'acc-' + sym + '-' + date + ':' + file, _source: { ciks: [String(CO[sym]).padStart(10, '0')], display_names: [sym + ' Inc  (' + sym + ')  (CIK ' + String(CO[sym]).padStart(10, '0') + ')'], file_date: date, adsh: 'acc-' + sym + '-' + date, sics: ['3674'], items, form, root_forms: [form] } });
const DOCS = {
  'kkk10k.htm': '<p>Dodo Cloud accounted for 30% of our total revenue in 2022.</p>',
  'lll8k.htm': '<p>On February 1, 2024, LLL entered into a multi-year supply agreement with Dodo Cloud with a total value of $50 million.</p>',
  'eee99.htm': '<p>Revenue was $120 million, up 25% year-over-year. EEE raised its full-year guidance.</p>',
  'q1release.htm': '<p>We now expect capital expenditures to be significantly higher next year as we expand capacity.</p>',
};
let requests = 0;
const server = http.createServer((req, res) => { requests++; const u = new URL(req.url, 'http://x'); let body = '', type = 'application/json';
  const send = (o) => { res.writeHead(200, { 'Content-Type': type }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
  if (u.pathname === '/files/company_tickers.json') { const o = {}; let n = 0; for (const [t, c] of Object.entries(CO)) o[n++] = { cik_str: c, ticker: t, title: t }; for (let j = 0; j < 1001; j++) o[n++] = { cik_str: 900000 + j, ticker: 'P' + j, title: 'pad' }; return send(o); }
  if (u.pathname === '/LATEST/search-index') { const q = u.searchParams.get('q'), a = u.searchParams.get('startdt'), b = u.searchParams.get('enddt'), ck = +u.searchParams.get('ciks'), forms = u.searchParams.get('forms'), from = +u.searchParams.get('from'); let hits = [];
    const inR = (d) => d >= a && d <= b && from === 0;
    if (ck) { const sym = Object.keys(CO).find(s => CO[s] === ck); const first = sym === 'CCC' ? null : sym === 'BBB' ? '2024-03-01' : '2015-03-01'; if (first && inR(first)) hits = [hit(sym, first, 'm.htm')]; }
    else if (/Dodo Cloud accounted for/.test(q) && /10-K/.test(forms)) hits = ['2023-02-15', '2024-02-14'].filter(inR).map(d => hit('KKK', d, 'kkk10k.htm'));
    else if (/agreement with Dodo Cloud/.test(q) && forms === '8-K') hits = ['2024-02-01'].filter(inR).map(d => hit('LLL', d, 'lll8k.htm', ['1.01', '9.01'], '8-K'));
    else if (/raised full-year/.test(q)) hits = ['2024-06-03'].filter(inR).map(d => hit('EEE', d, 'eee99.htm', ['2.02', '9.01'], '8-K'));
    return send({ hits: { total: { value: hits.length }, hits } }); }
  if (/-index\.htm$/.test(u.pathname)) { type = 'text/html'; return send('<table><tr><td>1</td><td><a href="/Archives/edgar/data/2004/000000200424000010/ddd8k.htm">ddd8k.htm</a></td><td>8-K</td></tr><tr><td>2</td><td><a href="/Archives/edgar/data/2004/000000200424000010/q1release.htm">q1release.htm</a></td><td>EX-99.1</td></tr></table>'); }
  if (/\/Archives\/edgar\/data\//.test(u.pathname)) { const f = u.pathname.split('/').pop(); type = 'text/html'; return send('<html><body>' + (DOCS[f] || '<p>Nothing here.</p>') + '</body></html>'); }
  if (u.pathname === '/submissions/CIK' + String(CO.DDD).padStart(10, '0') + '.json') return send({ filings: { recent: { form: ['8-K', '10-Q'], items: ['2.02,9.01', ''], accessionNumber: ['0000002004-24-000010', '0000002004-24-000011'], filingDate: ['2024-04-25', '2024-04-26'], acceptanceDateTime: ['2024-04-25T20:05:00.000Z', '2024-04-26T12:00:00.000Z'], primaryDocument: ['ddd8k.htm', 'q.htm'] }, files: [] } });
  if (/\/api\/xbrl\/companyconcept\/CIK0000002012\/us-gaap\/Revenues\.json$/.test(u.pathname)) return send({ units: { USD: [{ fp: 'FY', form: '10-K', filed: '2023-03-01', end: '2022-12-31', val: 5e8 }] } });
  if (/full-index\/(\d{4})\/QTR(\d)\/master\.gz$/.test(u.pathname)) { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(zlib.gzipSync('CIK|Company Name|Form Type|Date Filed|Filename\n')); return; }
  res.writeHead(404); res.end(); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-decoder-test-')); process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} });
cache(dir); fs.mkdirSync(path.join(dir, 'data')); fs.writeFileSync(path.join(dir, 'data/chain-defs.json'), JSON.stringify(DEFS)); fs.writeFileSync(path.join(dir, 'data/halal.json'), JSON.stringify({}));
const run = () => new Promise((resolve) => { const p = spawn(process.execPath, [path.join(REPO, 'chain-decoder.mjs')], { cwd: dir, env: { PATH: process.env.PATH, EFTS_BASE: BASE, SEC_BASE: BASE, DATA_BASE: BASE, CHAIN_MINUTES: '10' } });
  let log = ''; p.stdout.on('data', c => log += c); p.stderr.on('data', c => log += c); p.on('close', (code) => resolve({ code, log })); });
const r = await run(); server.close(); if (process.env.SHOWLOG) console.log(r.log);
const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const OUT = rd('data/chain-decoder.json'), G = rd('data/chain-graph.json'), TODAY = rd('data/chain-today.json');

test('the decoder runs to the end on complete data', () => {
  assert.equal(r.code, 0, r.log);
  assert.equal(OUT.complete, true, JSON.stringify(OUT.data));
});

test('membership is point in time; members with no CIK or no keyword filing are today-only and counted', () => {
  const chips = G.chains.AI.layers[0].members, by = (s) => chips.find(m => m.sym === s);
  assert.equal(by('AAA').status, 'point-in-time'); assert.equal(by('AAA').since, '2015-03-01');
  assert.equal(by('BBB').since, '2024-03-01');
  assert.equal(by('CCC').status, 'today-only'); assert.equal(by('ZZZ').status, 'today-only');
  assert.equal(G.counts.todayOnly, 2); assert.equal(G.counts.pointInTime, 8);
  assert.match(by('AAA').evidence.url, /\/Archives\/edgar\/data\/2001\//);
});

test('a major-customer link is verified on the filing text and dated by its first filing', () => {
  const l = G.links.find(x => x.type === 'customer');
  assert.equal(l.supplier, 'KKK'); assert.equal(l.customer, 'DDD'); assert.equal(l.first_public_at, '2023-02-15');
  assert.deepEqual(l.filings, ['2023-02-15', '2024-02-14']); assert.match(l.evidence, /Dodo Cloud accounted for 30%/);
});

test('a material agreement (8-K item 1.01) is stored with first_public_at, source_url, excerpt and materiality', () => {
  const e = G.links.find(x => x.type === 'agreement');
  assert.equal(e.supplier, 'LLL'); assert.equal(e.first_public_at, '2024-02-01'); assert.equal(e.value, 5e7); assert.equal(e.materiality, 0.1);
  assert.match(e.source_url, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/2012\//); assert.match(e.evidence, /supply agreement with Dodo Cloud/);
});

test('CHAIN-DEMAND1: after DDD raised capital spending (after the close of 25 Apr 2024) its suppliers that had not moved are bought at the 29 Apr open', () => {
  const t = OUT.trades['CHAIN-DEMAND1'], k = t.find(x => x.s === 'KKK'), a = t.find(x => x.s === 'AAA');
  assert.equal(k.buy, '2024-04-29'); assert.equal(k.via, 'customer disclosure'); assert.equal(k.exit, 'stop'); assert.equal(k.net, -0.208);   // stop 20% + 0.8% costs
  assert.equal(a.buy, '2024-04-29'); assert.match(a.via, /^upstream layer: AI\|Chips/);
  assert.ok(!t.some(x => x.s === 'BBB'));   // rose 6% on the signal day
  assert.ok(!t.some(x => x.s === 'CCC'));   // today-only: never in a history test
  assert.match(OUT.results['CHAIN-DEMAND1'].verdict, /TOO FEW CASES/);   // 2 trades: never judged, never frozen
  assert.equal((OUT.firstRun.results || {})['CHAIN-DEMAND1'], undefined);
});

test('CHAIN-READ1: EEE reported revenue +25% and raised guidance (8-K of 3 Jun 2024); its same-layer peer FFF is bought at the next open', () => {
  const f = OUT.trades['CHAIN-READ1'].find(x => x.s === 'FFF');
  assert.equal(f.buy, '2024-06-04'); assert.equal(f.by, 'EEE'); assert.equal(f.growth, 0.25); assert.equal(f.net, 0.092);   // 10 -> 11 minus 0.8%
});

test('the live file holds hot layers and the chain of each member, and no buys while no rule qualified', () => {
  assert.ok(Array.isArray(TODAY.hot) && TODAY.hot.length >= 1);
  assert.deepEqual(TODAY.buys, []);
  assert.equal(TODAY.members.AAA[0].chain, 'AI'); assert.equal(TODAY.members.AAA[0].layer, 'Chips');
});
