// HISTORY-03 batch 2 renderer (reviewer: Claude): OPPORTUNITY RADAR panels and EARLY WATCH alerts.
// (1) Calls the ACTUAL exported builders (radar-v3-core.mjs buildMidday / buildClose, early-alerts.mjs createEarlyAlerts / scorecardText)
//     on the repository's OWN test fixtures (lifted verbatim from test/radar-v3-core.test.mjs and test/early-alerts.test.mjs).
// (2) Runs the ACTUAL runner `opportunity-radar.mjs close` in a throwaway copy of the repository with the committed data, Telegram on a
//     local fake server and every other fetch refused (its Alpaca bar request therefore fails closed).
// Output (local only; the runner path reads committed data): JSON {name: text}.  Usage: node render-radar-alerts.mjs <tree> <work dir>
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {spawn,execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const [tree,work]=process.argv.slice(2).map(p=>path.resolve(p));const out={};
// Fixture module: the test files' definitions before their first test(), with imports rewritten to the tree.
function fixtureModule(testFile,exportsList){const src=fs.readFileSync(path.join(tree,testFile),'utf8');const head=src.slice(0,src.indexOf('\ntest('));
 const body=head.split('\n').filter(l=>!/^import (test|assert)/.test(l)).join('\n').replace(/from '\.\.\/([^']+)'/g,(_,f)=>"from "+JSON.stringify(pathToFileURL(path.join(tree,f)).href));
 const f=path.join(work,'fx-'+path.basename(testFile));fs.mkdirSync(work,{recursive:true});fs.writeFileSync(f,body+'\nexport {'+exportsList.join(',')+'};\n');return import(pathToFileURL(f).href);}
const RC=await import(pathToFileURL(path.join(tree,'radar-v3-core.mjs')).href);
const R1=await fixtureModule('test/radar-v3-core.test.mjs',['ctx','snap']);
out['radar midday (test fixture)']=RC.buildMidday(R1.snap(),R1.ctx).text;
out['radar midday, 2 tested alerts (test fixture)']=RC.buildMidday(R1.snap({alerts:2}),R1.ctx).text;
out['radar midday, no market data (test fixture)']=RC.buildMidday(R1.snap({scanned:0,mode:'NO_USABLE_MARKET_DATA',hits:[],early:[]}),{}).text;
{const L=[{type:'list',d:'2026-10-28',panel:'A',sym:'X',px:10},{type:'close',d:'2026-10-28',sym:'X',px:11,mkt:0.01},{type:'list',d:'2026-10-28',panel:'B',sym:'Y',px:4},{type:'close',d:'2026-10-28',sym:'Y',px:3.8,mkt:0.01},{type:'s5',d:'2026-10-28',sym:'X',panel:'A',px5:12,net:0.191,spy:0.01}];
 const live={day:'2026-10-28',alerts:0,coverage:{firstMinute:'09:26'},tally:{UNDER_1_USD:4},missed:[{sym:'OPENZ',code:'UNDER_1_USD',maxUp:0.73,firstSeen:'09:49',firstSeenUp:0.56,afterFirstSeen:{last:-0.12}},{sym:'BRAI',code:'CAUGHT_RULE_NOT_PASSED',maxUp:0.95,firstSeen:'09:49',firstSeenUp:0.47,afterFirstSeen:{last:0.28}}]};
 out['radar close (test fixture)']=RC.buildClose('2026-10-28',live,L,{});}
const EAm=await import(pathToFileURL(path.join(tree,'early-alerts.mjs')).href);const E1=await fixtureModule('test/early-alerts.test.mjs',['lead','make']);
{const {EA,sent}=E1.make();for(const s of ['GOOD','BAD','DIL','JUMP','NOSEC'])EA.noteLead(E1.lead(s));for(let i=0;i<6;i++)EA.noteLead(E1.lead('S'+i));EA.notePaper({sym:'GOOD',rule:'IG1',m:590,price:3.1},0.12);await EA.process();
 sent.forEach((t,i)=>out['early alert '+(i+1)+' (test fixture)']=t);const {summary}=EA.finish({S0:12.6,S1:11.5,S2:12,S3:12,S4:12,S5:13,BAD:15,GOOD:3.0},null,0);out['early-alert delivery scorecard (test fixture)']=EAm.scorecardText({...summary,approved:0});}
// (2) actual runner on committed data, offline
fs.rmSync(path.join(work,'repo'),{recursive:true,force:true});fs.mkdirSync(path.join(work,'repo'),{recursive:true});execFileSync('bash',['-c',`cd "${tree}" && tar --exclude=.git -cf - . | tar -C "${path.join(work,'repo')}" -xf -`]);
const sent=[];const server=http.createServer((q,s)=>{let b='';q.on('data',x=>b+=x);q.on('end',()=>{if(/sendMessage/.test(q.url)){try{sent.push(JSON.parse(b).text);}catch{}}s.setHeader('content-type','application/json');s.end('{"ok":true,"result":{"message_id":1}}');});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const pre=path.join(work,'repo/.offline.mjs');
fs.writeFileSync(pre,`const f=globalThis.fetch;globalThis.blocked=[];globalThis.fetch=(u,o)=>{const s=String(u&&u.url?u.url:u);if(!s.startsWith(${JSON.stringify(base)})){console.error('OFFLINE_BLOCKED '+s.slice(0,60));return Promise.reject(new TypeError('OFFLINE_BLOCKED'));}return f(u,o);};`);
for(const mode of ['close']){sent.length=0;const c=spawn(process.execPath,['--import',pre,'opportunity-radar.mjs',mode],{cwd:path.join(work,'repo'),env:{PATH:process.env.PATH,TG_TOKEN:'synthetic',TG_CHAT:'42',TG_BASE:base,ALPACA_KEY:'synthetic',ALPACA_SECRET:'synthetic'},stdio:['ignore','pipe','pipe']});let log='';c.stdout.on('data',x=>log+=x);c.stderr.on('data',x=>log+=x);
 const code=await new Promise(r=>c.on('close',r));out['opportunity-radar.mjs '+mode+' (committed data, offline)']=sent.join('\n-----\n')||('(no message) exit '+code+': '+log.slice(-600));out['_runner '+mode]={exit:code,blocked:(log.match(/OFFLINE_BLOCKED \S+/g)||[]).length};}
console.log(JSON.stringify(out));server.closeAllConnections();server.close();
