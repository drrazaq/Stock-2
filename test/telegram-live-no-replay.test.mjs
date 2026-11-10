// Synthetic loopback only: exercise approved-scanner caller, not a replacement transport.
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {loadScan,blocked} from './load-scan.mjs';
async function run(t,mode){
 let calls=0;const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{
 calls++;if(mode==='network'||mode==='partial'&&calls===2){res.destroy();return;}
 res.setHeader('content-type','application/json');
 if(mode==='400'||mode==='503'){res.statusCode=+mode;res.end('refused');return;}
 if(mode==='invalid'){res.end('{}');return;}
 if(mode==='429'&&calls===1){res.statusCode=429;res.end(JSON.stringify({ok:false,parameters:{retry_after:1}}));return;}
 res.end(JSON.stringify({ok:true,result:{message_id:calls}}));
 });});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const S=await loadScan({env:{TG_TOKEN:'synthetic',TG_CHAT:'synthetic',TG_BASE:'http://127.0.0.1:'+server.address().port,TD_BASE:'http://127.0.0.1:'+server.address().port}});
 let renders=0;const sent=await S.fn('telegramLive')((now,acked)=>{renders++;if(mode==='partial')return acked.length===0?'first\n'+('x'.repeat(3800))+'\nsecond':acked.length===1?'second':null;return acked.length?null:'synthetic message';});
 return {calls,sent,renders};
}
test('actual telegramLive connection reset: one POST, UNKNOWN, zero acknowledged parts',async t=>{const r=await run(t,'network');assert.equal(r.calls,1);assert.equal(r.sent.length,0);assert.equal(r.sent.deliveryState,'UNKNOWN');});
test('actual refusal is not counted sent; 5xx and malformed200 remain UNKNOWN',async t=>{for(const mode of ['400','503','invalid']){const r=await run(t,mode);assert.equal(r.calls,1);assert.equal(r.sent.length,0);assert.equal(r.sent.deliveryState,mode==='400'?'REFUSED':'UNKNOWN');}});
test('actual partial delivery then lost reply: acknowledged prefix only, no replay',async t=>{const r=await run(t,'partial');assert.equal(r.calls,2);assert.equal(r.sent.length,1);assert.equal(r.sent.deliveryState,'UNKNOWN');});
test('explicit429 retry rerenders; only complete ACK counted',async t=>{const r=await run(t,'429');assert.equal(r.calls,2);assert.equal(r.sent.length,1);assert.ok(r.renders>=2);});
test('sell timing: threshold evidence is not equivalence or a15minute sell policy',async()=>{const S=await loadScan({files:{'data/timing-study.json':{buy:'EITHER',sell:'EITHER'}}});const x=S.fn('timingNote')();const sell=x.slice(x.indexOf('; sell'));assert.match(sell,/next regular-session open/);assert.match(sell,/did not meet the preference threshold/);assert.match(sell,/does not establish equivalence/);assert.doesNotMatch(sell,/after the first 15|tested: no difference/);});
test('all requests remained loopback',()=>assert.deepEqual(blocked,[]));
