import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {loadScan,blocked} from './load-scan.mjs';
async function fixture(t){
 const state={age:30,status:200,sends:[],unknown:false};
 const server=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;let body={};
  if(req.url.includes('/quote'))body={c:8,t:state.age===null?undefined:Math.floor(Date.now()/1000)-state.age};
  else if(req.url.includes('/sendMessage')){state.sends.push(JSON.parse(raw).text);if(state.unknown){res.destroy();return;}res.statusCode=state.status;body=state.status===200?{ok:true,result:{message_id:state.sends.length}}:{ok:false};}
  else if(req.url.includes('/price'))body={price:'8'};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const S=await loadScan({env:{FINNHUB_KEY:'fixture',FH_BASE:base,TD_BASE:base,TG_BASE:base,TG_TOKEN:'fixture',TG_CHAT:'fixture',FORCE:'1',BOT_ONLY:'',MODE:'intraday'},files:{'data/my-positions.json':{AAA:{entry:10,stop:9}},'data/signals.json':{stocks:[],quick:[],leaders:[],market:{}}}});
 // Isolate the intraday feed/state/transport chain from command polling and the
 // separate morning report, both of which have their own integration suites.
 S.value('(tgCommands=async()=>{})');S.value('(preMarket=async()=>{})');
 return {S,state,run:()=>S.fn('intraday')()};
}
test('stale and unknown-clock holding quotes never produce current-price SELL or healthy open check',async t=>{
 const f=await fixture(t);for(const age of [900,null]){f.state.age=age;f.S.write('data/alert-state.json',{day:'',sent:{}});f.state.sends=[];await f.run();assert.match(f.state.sends.join('\n'),/PRICE UNVERIFIED/);assert.doesNotMatch(f.state.sends.join('\n'),/STOP LOSS REACHED|MARKET OPEN CHECK/);}
 assert.deepEqual(blocked,[]);
});
test('failed intraday sends never consume keys; ACK is durable and duplicate cycles do not resend',async t=>{
 const f=await fixture(t);f.state.status=403;await f.run();assert.deepEqual(f.S.readJson('data/alert-state.json').sent,{});
 f.state.status=200;await f.run();assert.equal(f.S.readJson('data/alert-state.json').sent.AAAmyst,1);const n=f.state.sends.length;await f.run();assert.equal(f.state.sends.length,n);
});
test('ambiguous intraday sends stay unknown across reloaded state and are never called ACK',async t=>{
 const f=await fixture(t);f.state.unknown=true;await f.run();let b=f.S.readJson('data/alert-state.json');assert.equal(b.sent.AAAmyst,undefined);assert.equal(b.delivery.AAAmyst.status,'UNKNOWN');
 f.state.unknown=false;const n=f.state.sends.length;await f.run();assert.equal(f.state.sends.length,n);assert.match(f.S.fn('healthLine')(),/unknown outcomes/);
});
