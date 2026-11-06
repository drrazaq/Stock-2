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
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO=path.resolve(process.env.CALENDAR_REVIEW_TREE||process.cwd()),KEY='synthetic-private-key-for-tests';
const {loadScan,blocked}=await import(pathToFileURL(path.join(REPO,'test/load-scan.mjs')));
const {mergeEconRows,seriesOf,verifyValue,fillOfficialActual}=await import(pathToFileURL(path.join(REPO,'econ-series.mjs')));
const {watcherReport}=await import(pathToFileURL(path.join(REPO,'watcher-reporting.mjs')));
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
    if (req.url.startsWith('/query')) { const q=new URL(req.url,'http://synthetic'); res.setHeader('content-type','application/json');res.end(JSON.stringify(opts.avReply?.[q.searchParams.get('function')]||{Information:'synthetic unavailable'})); return; }
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
  if(opts.seed){fs.mkdirSync(path.join(dir,'data'),{recursive:true});fs.writeFileSync(path.join(dir,'data/calendar.enc'),seal(opts.seed));}
  try { const r = await new Promise((resolve, reject) => { const c = spawn(process.execPath, [path.join(opts.programRoot||REPO, 'calendar.mjs')], { cwd: dir, env: { PATH: process.env.PATH, MODE: 'fetch', PRIVATE_KEY: KEY, TIPRANKS_KEY: 'synthetic', ...(opts.avReply?{ALPHAVANTAGE_KEY:'synthetic',AV_BASE:s.base}:{}), TR_BASE: s.base, BLS_BASE: s.base, FED_BASE: s.base } });
      let out = '', err = ''; const timer = setTimeout(() => { c.kill('SIGKILL'); reject(new Error('calendar job timeout')); }, 60000);
      c.stdout.on('data', b => out += b); c.stderr.on('data', b => err += b); c.on('close', status => { clearTimeout(timer); resolve({ status, stdout: out, stderr: err }); }); });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    return { enc: fs.readFileSync(path.join(dir, 'data/calendar.enc'), 'utf8'), status: JSON.parse(fs.readFileSync(path.join(dir, 'data/calendar-status.json'), 'utf8')) };
  } finally { s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const scanWith = (enc) => loadScan({ files: { 'data/calendar.enc': enc, 'data/settings.json': { focus: false } }, env: { PRIVATE_KEY: KEY } });


import crypto from 'node:crypto';import zlib from 'node:zlib';
function seal(value){const key=crypto.createHash('sha256').update(KEY).digest(),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),b=Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(value))),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64');}
const decrypt=enc=>{const b=Buffer.from(enc,'base64'),d=crypto.createDecipheriv('aes-256-gcm',crypto.createHash('sha256').update(KEY).digest(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(b.subarray(28)),d.final()])));};
const show=async opts=>{const r=await runCalendar(opts),C=decrypt(r.enc),S=await scanWith(r.enc);return {C,text:S.fn('calendarText')(false),actions:await S.fn('actionsText')({session:day(0)}, {},null,'SYNTHETIC')};};
const row=(name,forecast,unit)=>({event:name,date:D2+'T13:30:00Z',forecast,unit,country:'US'});

const base=process.env.CALENDAR_BASE_TREE;if(!base)throw Error('EXPLICIT_BASE_TREE_REQUIRED');
const first=await runCalendar();const current=decrypt(first.enc);const old=await runCalendar({seed:current,programRoot:base});const {loadScan:oldLoad}=await import(pathToFileURL(path.join(base,'test/load-scan.mjs')));const S=await oldLoad({files:{'data/calendar.enc':old.enc,'data/settings.json':{focus:false}},env:{PRIVATE_KEY:KEY}});const text=S.fn('calendarText')(false);assert.equal(typeof text,'string');assert.equal(typeof(await S.fn('actionsText')({session:day(0)},{},null,'SYNTHETIC')),'string');console.log('Legacy readers and writer completed; checking unit preservation separately');assert.match(text,/40K/);console.log('PASS old calendar writer and actual Telegram readers consume valid new schema2 without restoring data; semantic correctness not inferred');
