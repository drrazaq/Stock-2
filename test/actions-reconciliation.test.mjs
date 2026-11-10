// Entirely synthetic. No owner message, holdings or private financial figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {loadScan,blocked} from './load-scan.mjs';
import {completedMarketSession} from '../market-session.mjs';
const root=process.env.ACTIONS_TREE;
async function setup(files={},good=true,command=null){
 const sent=[];
 const server=http.createServer((req,res)=>{
 if(req.url.includes('/getUpdates')){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:command?[{update_id:12,message:{message_id:10,chat:{id:42},text:command}}]:[]}));return;}
 if(req.url.includes('/sendMessage')){let body='';req.on('data',c=>body+=c);req.on('end',()=>{sent.push(JSON.parse(body).text);res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:{message_id:11}}));});return;}
 const end=Date.parse(completedMarketSession(Date.now())+'T12:00:00Z'),values=[];for(let i=0;i<290;i++)values.push({datetime:new Date(end-(289-i)*864e5).toISOString().slice(0,10),open:75,high:76,low:74,close:75,volume:1e6});res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url.includes('time_series')&&good?{values}:{}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const S=await loadScan({...(root?{root}:{}),files:{'data/settings.json':{focus:false},'data/halal.json':{ZZQ:{s:'ok',d:new Date(Date.now()).toISOString().slice(0,10)}},...files},env:{TD_BASE:base,FH_BASE:base,SEC_BASE:base,...(command?{TG_BASE:base,TG_TOKEN:'synthetic-token',TG_CHAT:'42'}:{})}});
 return {S,sent,close:()=>server.close(),sig:{session:completedMarketSession(Date.now()),generatedAt:new Date(Date.now()).toISOString(),market:{up:true,above50:true},stocks:[{sym:'ZZQ',last:75}]}};
}
const P=()=>({entry:70,stop:60,since:'2025-08-04',lastAct:{act:'SELL ALL',why:'earlier close below stop',since:'2025-09-05',d:'2025-09-05',px0:59}});
async function run(files,good,fn){const x=await setup(files,good);try{return await fn(x);}finally{x.close();}}
test('actual ACTIONS preserves earlier SELL context when a fresh assessment becomes HOLD; repeat/restart does not imply execution',()=>run({'data/sell-notices.jsonl':[{sym:'ZZQ',d:'2025-09-05',why:'earlier close below stop'}]},true,async({S,sig})=>{
 const pos={ZZQ:P()},t=await S.fn('actionsText')(sig,pos,null,'SYNTHETIC');
 assert.match(t,/PRIOR SELL NEEDS RECONCILIATION/);assert.match(t,/2025-09-05/);assert.match(t,/current assessment HOLD/);assert.match(t,/not proof.*fulfilled or withdrawn/);assert.equal(pos.ZZQ.lastAct.act,'HOLD');
 assert.equal(pos.ZZQ.entry,70);assert.equal(pos.ZZQ.stop,60);assert.equal(pos.ZZQ.exitFlag,undefined);
 const again=await S.fn('actionsText')(sig,pos,null,'SYNTHETIC');assert.match(again,/PRIOR SELL NEEDS RECONCILIATION/);
 const restarted=await setup({'data/sell-notices.jsonl':[{sym:'ZZQ',d:'2025-09-05',why:'earlier close below stop'}]});try{assert.match(await restarted.S.fn('actionsText')(sig,JSON.parse(JSON.stringify(pos)),null,'SYNTHETIC'),/PRIOR SELL NEEDS RECONCILIATION/);}finally{restarted.close();}
}));
test('notices before current recorded purchase do not attach to a new position; malformed neighbors do not erase valid evidence',()=>run({'data/sell-notices.jsonl':'bad row\n'+JSON.stringify({sym:'ZZQ',d:'2025-09-05',why:'old note'})+'\n'},true,async({S,sig})=>{
 const p={ZZQ:{...P(),since:'2025-10-01',lastAct:undefined}};assert.doesNotMatch(await S.fn('actionsText')(sig,p,null,'SYNTHETIC'),/PRIOR SELL NEEDS RECONCILIATION/);
 p.ZZQ.since='2025-08-04';assert.match(await S.fn('actionsText')(sig,p,null,'SYNTHETIC'),/PRIOR SELL NEEDS RECONCILIATION/);
}));
test('missing price history is UNKNOWN, preserves previous assessment and never produces a fresh HOLD',()=>run({},false,async({S,sig})=>{
 const pos={ZZQ:P()},before=JSON.stringify(pos);const t=await S.fn('actionsText')(sig,pos,null,'SYNTHETIC');assert.match(t,/ASSESSMENT UNKNOWN: price\/history too short or unavailable/);assert.doesNotMatch(t,/HOLD: ZZQ/);assert.equal(JSON.stringify(pos),before);
}));
test('missing leader-dip prices does not erase prior SELL; a persisted explicit exit still applies',()=>run({},false,async({S})=>{
 const p={ZZQ:{...P(),src:'leader dip',kind:'leader dip',target:84,ldHold:126}},before=JSON.stringify(p);
 const r=await S.fn('holdingsText')(null,p,null,true);assert.equal(r.acts.hold.length,0);assert.match(r.acts.unknown.join(),/ASSESSMENT UNKNOWN/);assert.equal(JSON.stringify(p),before);
 p.ZZQ.exitFlag={d:'2025-10-16',why:'TIME EXIT: SELL at the next open.'};const r2=await S.fn('holdingsText')(null,p,null,true);assert.match(r2.acts.sell.join(),/TIME EXIT/);
}));
test('same-day notice has unresolved order, never a new compulsory SELL or execution claim',()=>run({},true,async({S,sig})=>{
 const p={ZZQ:{...P(),since:'2025-09-05',lastAct:undefined}};S.write('data/sell-notices.jsonl',[{sym:'ZZQ',d:'2025-09-05',why:'synthetic notice'}]);
 const t=await S.fn('actionsText')(sig,p,null,'SYNTHETIC');assert.match(t,/same-day order unknown/);assert.doesNotMatch(t,/tested rule says sell/);
}));
test('pending ZAD signal and no permitted buy are distinct; assessment does not promote evidence',async()=>{
 const previousNow=Date.now;Date.now=()=>Date.parse('2026-11-04T13:00:00Z');
 try { await run({},true,async({S,sig})=>{
 const today=S.fn('ny')(Date.now()).d;let day=today;do{day=new Date(Date.parse(day)-864e5).toISOString().slice(0,10);}while(!S.fn('isSession')(day));
 S.write('data/halal.json',{});S.write('data/squad11-today.json',{generatedAt:new Date(Date.now()).toISOString(),lastClose:day,methods:{'SQ11-PB12':{newSignals:[{sym:'ZZR',close:75,d:day}]}}});
 const t=await S.fn('actionsText')({...sig,session:day}, {},null,'SYNTHETIC');assert.match(t,/LEADER DIP: no permitted buy; 1 signal waiting for your ZAD mark/);assert.match(t,/no late entries/);assert.match(t,/LEADER DIP[^\n]*NOT PROVEN/);assert.doesNotMatch(t,/- BUY ZZR/);
 }); } finally { Date.now=previousNow; }
});
test('frozen research verdict leads over optimistic subset/live labels',()=>run({'data/leaders-study.json':{verdict:'NOT PROVEN',liveVerdict:'PROVISIONALLY PROMISING'},'data/smart-money-study.json':{verdict:'NOT PROVEN',rising:{older:{n:40,avg:.01,spy:.02},newer:{n:40,avg:.03,spy:.04}}}},true,async({S,sig})=>{
 const t=await S.fn('actionsText')(sig,{},null,'SYNTHETIC');assert.match(t,/LEADERS[^;\n]*NOT PROVEN/);assert.doesNotMatch(t,/insider buying works|LEADERS provisionally promising/i);assert.match(t,/not prospective evidence/);
}));
test('focus OFF cannot turn an evidence-blocked engine candidate into an approved BUY',()=>run({},true,async({S,sig})=>{
 const signal={...sig,quick:[{sym:'ZZQ',n:60,avgPct:.03,win:.6,last:75,buyLo:74,buyHi:76,stop:65,maxHold:5}]};S.write('data/signals.json',signal);
 const candidates=S.fn('planCands')(signal,{});assert.ok(candidates.some(c=>c.sym==='ZZQ'));assert.equal(candidates.find(c=>c.sym==='ZZQ').ok,false);assert.ok(S.fn('gateVerdict')('ZZQ',signal));
 const t=await S.fn('actionsText')(signal,{},null,'SYNTHETIC');assert.doesNotMatch(t,/focus off shows them as buys/i);assert.doesNotMatch(t,/- BUY ZZQ|1\) ZZQ/);assert.match(t,/evidence and (?:ZAD|compliance) gates/);
}));
test('normalized journal and private cash goal label different populations and neither as account return',()=>run({'data/my-trades.jsonl':[{sym:'ZZA',out:'2025-09-01',pct:.20},{sym:'ZZB',out:'2025-09-02',pct:.02},{sym:'ZZC',out:'2025-09-03',pct:-.08}]},true,async({S,sig})=>{
 process.env.PRIVATE_KEY='synthetic-only-ephemeral-key';assert.equal(S.fn('privWrite')({realized:-60,closed:[{d:'2025-09-02',usd:20},{d:'2025-09-03',usd:-80}],goals:{start:'2025-09-01',base:0,hit:[]},buys:[],shares:{}}),true);
 const t=await S.fn('actionsText')(sig,{},null,'SYNTHETIC');assert.match(t,/3 sales[^\n]*\+14.0% summed normalized net return/);assert.match(t,/not account return or dollar P&L/);assert.match(t,/private cash accounting since 2025-09-01/);assert.match(t,/-60.00 USD from 2 sales/);assert.match(t,/separate population/);
}));
test('existing close-based sell timing uses the regular open; winter time conversion is explicit',()=>run({},true,async({S,sig})=>{
 assert.equal(S.fn('kwt')(570,'2026-11-02'),'5:30 pm');const t=await S.fn('actionsText')({...sig,posVerdict:{ZZQ:'synthetic registered exit'}},{ZZQ:{entry:70,stop:80,since:'2025-08-04'}},null,'SYNTHETIC');assert.match(t,/next regular-session open/);assert.match(t,/stop-reached lines: your broker stop applies/);assert.doesNotMatch(t,/at the open after the first 15 minutes/);
}));
test('actual Telegram command caller renders UNKNOWN and preserves position economics under missing history',async()=>{
 const x=await setup({'data/my-positions.json':{ZZQ:P()},'data/signals.json':{session:'2025-10-17',market:{up:true,above50:true},stocks:[{sym:'ZZQ',last:75}]}},false,'actions');
 try{await x.S.fn('tgCommands')(x.sig);assert.match(x.sent.join('\n'),/ASSESSMENT UNKNOWN/);assert.doesNotMatch(x.sent.join('\n'),/HOLD: ZZQ/);const p=x.S.readJson('data/my-positions.json').ZZQ;assert.equal(p.entry,70);assert.equal(p.stop,60);assert.equal(p.lastAct.act,'SELL ALL');}finally{x.close();}
});
test('dated historical health input is not evidence of current watcher observation',()=>run({'data/health.json':{at:'2025-10-18T12:00:00Z',problems:['Historical watcher coverage not established for 2025-10-17']}},true,async({S})=>{
 const t=S.fn('healthLine')();assert.match(t,/2025-10-17/);assert.doesNotMatch(t,/watcher coverage (?:COMPLETE|PASS)|today.*(?:watched|covered)/i);assert.doesNotMatch(t,/current.*coverage.*complete/i);
}));
test('all operations stayed synthetic and on loopback',()=>assert.deepEqual(blocked,[]));
