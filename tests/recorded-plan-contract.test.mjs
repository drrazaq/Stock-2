import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {loadScan} from '../test/load-scan.mjs';
const quick={sym:'AAA',key:'fixture',buyLo:10,stop:9,t1:12,maxHold:5,tgtNote:'fixed synthetic target',half:false};
async function fixture(t,{files={},quote='11'}={}){
 let queued=[],sent=[],answers=[],uid=100;
 const server=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{
  let result={ok:true,result:true};
  if(req.url.includes('/getUpdates')){result={ok:true,result:queued};queued=[];}
  else if(req.url.includes('/sendMessage')){sent.push(JSON.parse(body).text);result={ok:true,result:{message_id:++uid}};}
  else if(req.url.includes('/answerCallbackQuery'))answers.push(JSON.parse(body).text);
  else if(req.url.includes('/price?'))result={price:quote};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const s=await loadScan({files:{'data/my-positions.json':{},...files},env:{TG_TOKEN:'fixture',TG_CHAT:'42',TG_BASE:base,TD_BASE:base,FH_BASE:base,SEC_BASE:base,PRIVATE_KEY:'synthetic-test-key'}});
 const send=async(text,sig=null)=>{queued=[{update_id:++uid,message:{message_id:uid,chat:{id:42},text}}];sent=[];await s.fn('tgCommands')(sig);return sent.join('\n');};
 const callback=async(data)=>{queued=[{update_id:++uid,callback_query:{id:'fixture',data,message:{chat:{id:42}}}}];answers=[];await s.fn('tgCommands')(null);return answers;};
 return {s,send,callback,pos:()=>s.readJson('data/my-positions.json')};
}
test('actual owner recording keeps valid quick levels and ignores malformed unrelated siblings',async t=>{
 const f=await fixture(t),out=await f.send('bought AAA 11 2 shares',{quick:[null,quick],stocks:[{sym:'AAA',buyLo:null}]});const p=f.pos().AAA;assert.equal(p.entry,11);assert.equal(p.stop,10);assert.equal(p.t1,13.2);assert.equal(p.maxHold,5);assert.equal(p.kind,'quick');assert.doesNotMatch(out,/NaN|Infinity|No valid strategy plan/);
});
for(const bad of [{buyLo:0},{buyLo:'10'},{stop:null},{stop:11},{t1:Infinity},{maxHold:1.5},{half:'false'}]){
 test('actual owner recording preserves fill but qualifies invalid source plan '+JSON.stringify(bad),async t=>{
  const f=await fixture(t),out=await f.send('bought AAA 11',{quick:[{...quick,...bad}]});const p=f.pos().AAA;assert.equal(p.entry,11);assert.equal(p.kind,'manual');assert.equal(p.stop,null);assert.equal(p.t1,null);assert.equal(p.planStatus,'UNRESOLVED_SOURCE_PLAN');assert.match(out,/No valid strategy plan was attached/);assert.doesNotMatch(out,/target tested|NaN|Infinity/);
 });
}
for(const command of ['bought 0 shares of AAA at 10','اشتريت AAA بسعر 0','bought AAA -1','bought AAA Infinity','bought AAA NaN','bought AAA 1e309','bought AAA '+'9'.repeat(400),'bought AAA 0','bought AAA 11 '+'9'.repeat(400)+' shares','bought AAA 11 stop '+'9'.repeat(400)]){
 test('actual command rejects invalid explicit money without replacing an existing position '+command.slice(0,32),async t=>{
  const prior={entry:7,kind:'manual',stop:6,since:'2026-01-01'},f=await fixture(t,{files:{'data/my-positions.json':{AAA:prior}}});const out=await f.send(command,{quick:[quick]});assert.deepEqual(f.pos().AAA,prior);assert.match(out,/not recorded/i);
 });
}
test('nonfinite fallback quote cannot create a position',async t=>{const f=await fixture(t,{quote:'Infinity'}),out=await f.send('bought AAA');assert.equal(f.pos().AAA,undefined);assert.match(out,/could not get a price/);});
test('invalid confirmation callback cannot report a recorded fill',async t=>{const f=await fixture(t),answers=await f.callback('cb|AAA|2|'+'9'.repeat(400));assert.equal(f.pos().AAA,undefined);assert.ok(answers.some(x=>/^Not recorded/.test(x)));assert.ok(answers.every(x=>!/^Recorded/.test(x)));});
test('actual Horizons recording labels broker-stop timing separately from tested close/next-open exit',async t=>{
 const source=fs.readFileSync(new URL('../horizons.mjs',import.meta.url),'utf8');assert.match(source,/STOP = 0\.75/);assert.match(source,/c < e \* STOP.*O\[b \+ k \+ 1\]/);
 const f=await fixture(t,{files:{'data/horizons.json':{status:'OK',rules:{stopAt:.75,cost:.008},results:{one:{setup:'one',verdict:'PROMISING',hold:20}},today:{one:['AAA']}}}});
 const out=await f.send('bought AAA 100');const p=f.pos().AAA;assert.equal(p.stop,75);assert.equal(p.maxHold,20);assert.equal(p.planVariant,'BROKER_STOP_VS_TESTED_DAILY_CLOSE_NEXT_OPEN');assert.equal(p.orig.planVariant,p.planVariant);assert.match(out,/safety variant/);assert.match(out,/daily close.*next open/);assert.match(out,/returns do not validate an intraday stop/);
});
test('incompatible Horizons specification cannot silently attach a tested plan',async t=>{const f=await fixture(t,{files:{'data/horizons.json':{status:'OK',rules:{stopAt:.5},results:{one:{setup:'one',verdict:'PROMISING',hold:20}},today:{one:['AAA']}}}});await f.send('bought AAA 100');assert.equal(f.pos().AAA.planStatus,'UNRESOLVED_SOURCE_PLAN');assert.equal(f.pos().AAA.stop,null);});
test('actual half-sale acknowledgement qualifies price breakeven for costs and gaps',async t=>{const f=await fixture(t,{files:{'data/my-positions.json':{AAA:{entry:10,stop:9,kind:'quick',since:'2026-01-01'}}}});f.s.fn('privWrite')({buys:[],shares:{AAA:10}});const out=await f.send('sold half AAA 12');assert.match(out,/does not guarantee breakeven; fees, slippage or gaps can still cause a loss/);assert.doesNotMatch(out,/cannot turn into a loss/);});

test('valid original quick plan keeps its original levels and hold control',async t=>{const f=await fixture(t);await f.send('bought AAA 11 2 shares',{quick:[quick]});const p=f.pos().AAA;assert.equal(p.kind,'quick');assert.equal(p.stop,10);assert.equal(p.t1,13.2);assert.equal(p.maxHold,5);});
test('explicit valid manual fill/stop/target remains recordable',async t=>{const f=await fixture(t);await f.send('bought AAA 11 stop 8 target 15');const p=f.pos().AAA;assert.equal(p.entry,11);assert.equal(p.stop,8);assert.equal(p.t1,15);assert.equal(p.ownT,true);});

test('actual recorded opening-gap fill stays truthful but does not inherit a plan outside its source entry ceiling',async t=>{const f=await fixture(t);const out=await f.send('bought AAA 15',{quick:[{...quick,buyHi:10.5}]});const p=f.pos().AAA;assert.equal(p.entry,15);assert.equal(p.planStatus,'UNRESOLVED_SOURCE_PLAN');assert.equal(p.stop,null);assert.equal(p.t1,null);assert.match(out,/No valid strategy plan was attached/);});

// Synthetic owner-reported fills only; no real trade or strategy endorsement.
for(const lane of ['evt','pead']){
 test('actual '+lane+' gap fill retains absolute source stop and archived corrected contract',async t=>{const f=await fixture(t),row={sym:'AAA',live:true,buyLo:10,buyHi:10.3,stop:9,sma20:9.5,hold:40};const out=await f.send('bought AAA 10.2 2 shares',{[lane]:[row]});const p=f.pos().AAA;assert.equal(p.entry,10.2);assert.equal(p.stop,9);assert.equal(p.exitMA,20);assert.equal(p.maxHold,40);assert.equal(p.orig.stop,9);assert.equal(p.orig.planVariant,'UNSHIFTED_SOURCE_STOP');assert.equal(p.planSource,lane==='pead'?'earnings-study':'events-study');assert.match(out,/Original source stop retained/);assert.match(out,/strategy evidence remain unverified/);assert.doesNotMatch(out,/target tested/);});
 test('actual '+lane+' within entry ceiling but beyond frozen15percent stop risk remains unresolved',async t=>{const f=await fixture(t),row={sym:'AAA',live:true,buyLo:10,buyHi:10.3,stop:8.5,sma20:9,hold:40};const out=await f.send('bought AAA 10.2',{[lane]:[row]});const p=f.pos().AAA;assert.equal(p.entry,10.2);assert.equal(p.planStatus,'UNRESOLVED_SOURCE_PLAN');assert.equal(p.orig.planSource,lane==='pead'?'earnings-study':'events-study');assert.equal(p.orig.planVariant,'UNRESOLVED_DRIFT_ENTRY');assert.equal(p.stop,null);assert.equal(p.t1,null);assert.match(out,/No valid strategy plan was attached/);});
 test('actual '+lane+' source-close fill preserves original stop and existing holding rule',async t=>{const f=await fixture(t);await f.send('bought AAA 10',{[lane]:[{sym:'AAA',live:true,buyLo:10,buyHi:10.3,stop:9,sma20:9.5,hold:40}]});const p=f.pos().AAA;assert.equal(p.stop,9);assert.equal(p.maxHold,40);assert.equal(p.exitBelow,9.5);});
}
test('actual frozen earnings/event trade walkers prove shifted stop can create an exit absent from the registered path',()=>{
 const c=Array.from({length:40},(_,t)=>({t,o:10.2,l:9.1,c:11})),ma=Array(40).fill(null);
 for(const file of ['earnings-study.mjs','events-study.mjs']){const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),start=source.indexOf('function tradeMA('),end=source.indexOf('\n}',start)+2,body=source.slice(start,end),walker=Function(body+';return tradeMA;')();const run=stop=>file==='earnings-study.mjs'?walker(c,0,10.2,stop,ma,40):walker(c,0,stop,ma,40);assert.equal(run(9).j,39);assert.equal(run(9).exit,11);assert.equal(run(9.2).j,0);assert.equal(run(9.2).exit,9.2);assert.match(source,/stop = b.l \* 0.995/);}
});

for(const lane of ['evt','pead'])test('actual '+lane+' explicit owner stop is archived as an untested override',async t=>{const f=await fixture(t),out=await f.send('bought AAA 10.2 stop 9.5',{[lane]:[{sym:'AAA',live:true,buyLo:10,buyHi:10.3,stop:9,sma20:9.5,hold:40}]});const p=f.pos().AAA;assert.equal(p.stop,9.5);assert.equal(p.orig.stop,9.5);assert.equal(p.orig.planVariant,'OWNER_STOP_OVERRIDE');assert.match(out,/Your explicit stop overrides the source stop/);assert.match(out,/not validated by the registered drift result/);assert.doesNotMatch(out,/Original source stop retained/);});
