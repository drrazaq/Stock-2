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
  try { const r = await new Promise((resolve, reject) => { const c = spawn(process.execPath, [path.join(REPO, 'calendar.mjs')], { cwd: dir, env: { PATH: process.env.PATH, MODE: 'fetch', PRIVATE_KEY: KEY, TIPRANKS_KEY: 'synthetic', ...(opts.avReply?{ALPHAVANTAGE_KEY:'synthetic',AV_BASE:s.base}:{}), TR_BASE: s.base, BLS_BASE: s.base, FED_BASE: s.base } });
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
test('R1 actual calendar must not relabel September provider payrolls as official October',async()=>{
 const {C,text}=await show({rows:[row('Nonfarm Payrolls ('+FULL[(FULL.indexOf(refOf(D2).split(' ')[0])+11)%12].slice(0,3)+')','40K')]});const e=C.econ.find(x=>x.release==='empsit'),v=e.series.find(x=>x.id==='PAYROLLS_TOTAL');assert.equal(v.consensus.status,'UNKNOWN',text);
});
test('R2 actual calendar conflicting duplicate units cannot retain the first valid-looking number',async()=>{
 const {C,text}=await show({rows:[row('Nonfarm Payrolls','40','K'),row('Nonfarm Payrolls','40','M')]});const e=C.econ.find(x=>x.release==='empsit');assert.equal(e.series[0].consensus.status,'UNKNOWN',text);
});
test('R3 actual calendar missing cached CPI value must not become minus100percent actual',async()=>{
 const y=refOf(D3).split(' '),months=FULL.indexOf(y[0]),current=y[1]+'-'+String(months+1).padStart(2,'0')+'-01',prior=new Date(Date.UTC(+y[1],months-1,1)).toISOString().slice(0,10),seed={hist:[],holidays:[],div:{},av:{CPI:[[current,null],[prior,300]]},avAt:new Date().toISOString()};
 const {C,text}=await show({rows:[],seed}),e=C.econ.find(x=>x.release==='cpi');assert.ok(e.act===null||e.act===undefined,text);
});
test('R4 actual post-release provider previous must not be certified as a pre-release vintage',async()=>{
 const {C,text}=await show({rows:[{event:'Nonfarm Payrolls',date:day(-1)+'T13:30:00Z',previous:'46K',country:'US'}]}),r=C.econ.find(x=>x.day===day(-1)&&x.release==='empsit');assert.ok(Date.parse(r.series[0].previous.retrievedAt)>Date.parse(r.t+'Z'));assert.notEqual(r.series[0].previous.vintage,'PUBLISHED_BEFORE_THIS_RELEASE_MAY_BE_REVISED',text);
});
test('R5 actual Telegram claims numerically below consensus must not be labelled ABOVE',async()=>{
 const rows=mergeEconRows([],[{t:D1+'T13:30:00Z',name:'Initial Jobless Claims',fcRaw:'195K',actRaw:'189K'}],{providerAt:new Date().toISOString()}),S=await scanWith(seal({updated:new Date().toISOString(),econ:rows,hist:[],holidays:[],div:{}})),text=S.fn('calendarText')(false);assert.doesNotMatch(text,/189K vs consensus 195K = ABOVE/,text);
});
test('R6 actual health line must preserve an actionable delivery failure with complete configured coverage',async()=>{
 const beats=Array.from({length:331},(_,i)=>({m:570+i,received:5,evaluated:5})),delivery={generatedAt:1,unhealthy:true,retryWaiting:0,retryExhausted:2,pendingFinalizations:1,uncertainStates:1},r=watcherReport([{day:'2026-11-05',minutes:331,firstMinute:'09:30'}],[{day:'2026-11-05',configuredWindow:{open:570,endExclusive:901},heartbeat:beats,messageDelivery:delivery}]);assert.equal(r.actionable,true);
 const S=await loadScan({files:{'data/health.json':{at:'2026-11-06T01:00:00Z',watcher:r,problems:[r.text]},'data/signals.json':{session:'2026-11-05'},'data/discovery.json':{session:'2026-11-05',candidates:[]},'data/movers-state.json':{session:'2026-11-05'}}});const text=S.fn('healthLine')(Date.parse('2026-11-06T09:00:00Z'));assert.match(text,/exhausted|unpublished|uncertain|message recovery/,text);
});
test('valid exact-period/unit controls and zero remain intact',()=>{const r=mergeEconRows([{t:D2+'T13:30',release:'empsit',ref:refOf(D2),src:'BLS'}],[{t:D2+'T13:30',name:'Nonfarm Payrolls',fcRaw:'0K',prevRaw:'46K'}],{providerAt:new Date().toISOString()})[0];assert.equal(r.fc,0);assert.equal(r.prev,46);assert.equal(r.series[0].ref.period,refOf(D2));});

test('R4b partial AV refresh must not freshen the unchanged payroll source clock',async()=>{
 const y=refOf(D2).split(' '),mo=FULL.indexOf(y[0]),current=y[1]+'-'+String(mo+1).padStart(2,'0')+'-01',prior=new Date(Date.UTC(+y[1],mo-1,1)).toISOString().slice(0,10),oldAt=new Date(Date.now()-7*864e5).toISOString(),seed={hist:[],holidays:[],div:{},av:{NFP:[[current,150050],[prior,150000]]},avAt:oldAt};
 const {C,text}=await show({rows:[],seed,avReply:{CPI:{data:[{date:current,value:'310'},{date:prior,value:'300'}]}}}),r=C.econ.find(x=>x.release==='empsit'),a=r.series.find(x=>x.id==='PAYROLLS_TOTAL').actual;assert.equal(a.retrievedAt,oldAt,text);
});
