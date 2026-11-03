// Synthetic release controls: no owner records, real credentials, provider requests or real messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {loadScan,blocked} from './load-scan.mjs';
const root=process.env.ACTIONS_TREE;
const leaders=[{sym:'ZZQ',last:75,buyLo:74,buyHi:76,stop:65,e50:67,mom:.5},{sym:'ZZR',last:75,buyLo:74,buyHi:76,stop:65,e50:67,mom:.5}];
const signal=()=>({session:'2026-10-30',market:{up:true,above50:true},leaders,leadFair:{state:'PROVISIONALLY PROMISING'},quickHeld:[{sym:'ZZR',why:'too few historical cases'}],quick:[{sym:'ZZR',last:75,buyLo:74,buyHi:76,stop:65,n:20,avgPct:.03,win:.6,maxHold:5}]});
async function fixture(t,{focus=false,command=null}={}){
 const messages=[];const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{
  res.setHeader('content-type','application/json');
  if(req.url.includes('/getUpdates'))return res.end(JSON.stringify({ok:true,result:[{update_id:15,message:{message_id:16,chat:{id:42},text:command}}]}));
  if(req.url.includes('/sendMessage')){messages.push(JSON.parse(body).text);return res.end(JSON.stringify({ok:true,result:{message_id:17}}));}
  res.statusCode=500;res.end('{}');
 });});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,sig=signal();
 const S=await loadScan({...(root?{root}:{}),files:{'data/settings.json':{focus},'data/signals.json':sig,'data/halal.json':{ZZQ:{s:'ok',d:'2026-10-30'}},'data/intraday-radar.json':{session:'2026-10-30',candidates:[{sym:'ZZR',verdict:'WATCH',stage:'early_breakout',levels:{lo:74,hi:76,stop:65}}]}},env:{TD_BASE:base,FH_BASE:base,SEC_BASE:base,...(command?{TG_BASE:base,TG_TOKEN:'synthetic-only',TG_CHAT:'42'}:{})}});
 return {S,sig,messages};
}
for(const focus of [false,true])test('ACTIONS never embeds the research entry-range board, focus '+focus,async t=>{
 const {S,sig}=await fixture(t,{focus});const text=await S.fn('actionsText')(sig,{},null,'SYNTHETIC');
 assert.doesNotMatch(text,/LEADERS \[EARLY\]|QUICK SETUPS \[EARLY\]|EARLY-WAVE RADAR \[PAPER\]|buy 74-76|entry 74-76|provisionally promising on 5 years/);
 assert.match(text,/Other ideas \((?:information|research) only/);assert.equal(S.fn('myHalal')('ZZR'),'unknown');
});
test('research board retains marked and unknown leads without entry instructions or proof promotion',async t=>{
 const {S,sig}=await fixture(t);const text=S.fn('opportunitiesText')(sig,false);
 assert.match(text,/RESEARCH WATCHLIST/);assert.match(text,/ZZQ: research only; recorded owner ZAD mark: ok/);assert.match(text,/ZZR: research only; recorded owner ZAD mark: unknown/);
 assert.match(text,/NOT PROVEN/);assert.match(text,/not admitted prospective cases/);assert.doesNotMatch(text,/buy 74-76|entry 74-76|stop 65|for its range|being proven live|provisionally promising/);
 assert.equal(S.fn('planCands')(sig,{}).find(x=>x.sym==='ZZR'&&x.kind==='trend trade').ok,false);
});
test('leader plan card qualifies the newer-half result while its evidence gate remains closed',async t=>{
 const {S,sig}=await fixture(t);const c=S.fn('planCands')(sig,{}).find(x=>x.kind==='trend trade');
 assert.ok(c);assert.match(c.expect,/newer-half pass only.*NOT PROVEN/);assert.doesNotMatch(c.expect,/^passed the whole-market fair test/);assert.equal(c.ok,false);
});
for(const command of ['actions','opportunities'])test('actual Telegram '+command+' caller does not promote research ranges',async t=>{
 const {S,sig,messages}=await fixture(t,{command});await S.fn('tgCommands')(sig);const text=messages.join('\n');assert.ok(text.length>20);
 assert.doesNotMatch(text,/buy 74-76|entry 74-76|stop 65|focus off shows them as buys|provisionally promising on 5 years/);
 if(command==='opportunities'){assert.match(text,/RESEARCH WATCHLIST/);assert.match(text,/ZZR.*unknown/);}
});
test('all requests stayed on synthetic loopback services',()=>assert.deepEqual(blocked,[]));
