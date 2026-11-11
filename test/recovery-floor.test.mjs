// Required rollback floor. Synthetic records and loopback transport only.
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {loadScan,blocked} from './load-scan.mjs';
async function fixture(t,mode='ack'){
 let calls=0;const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{calls++;if(mode==='network'){res.destroy();return;}res.setHeader('content-type','application/json');if(mode==='refuse'){res.statusCode=403;res.end('refused');return;}res.end(JSON.stringify({ok:true,result:{message_id:calls}}));});});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const raw='{ \n "AAA" : {"stop":8,"entry":10}\n}\n',S=await loadScan({files:{'data/my-positions.json':raw},env:{TG_TOKEN:'synthetic',TG_CHAT:'synthetic',TG_BASE:base,TD_BASE:base}});
 return{S,raw,calls:()=>calls};
}
test('actual recovery scanner preserves no-op owner bytes and rejects corrupt original state',async t=>{
 const f=await fixture(t);f.S.fn('savePos')({AAA:{entry:10,stop:8}});assert.equal(f.S.read('data/my-positions.json'),f.raw);
 f.S.write('data/my-positions.json','{SYNTHETIC CORRUPT');assert.throws(()=>f.S.fn('loadPos')(),/POSITION_STATE_UNREADABLE/);assert.throws(()=>f.S.fn('savePos')({AAA:{entry:10}}),/POSITION_STATE_UNREADABLE/);assert.equal(f.S.read('data/my-positions.json'),'{SYNTHETIC CORRUPT');
});
test('actual recovery transport never blindly replays an ambiguous send or counts refusal as ACK',async t=>{
 for(const mode of ['network','refuse']){const f=await fixture(t,mode),r=await f.S.fn('telegram')('SYNTHETIC recovery');assert.equal(f.calls(),1);assert.equal(r.ok,false);assert.equal(r.deliveredParts,0);assert.equal(r.deliveryState,mode==='network'?'UNKNOWN':'REFUSED');}
});
test('actual recovery sender checks supplied evidence before every attempted part',async t=>{
 const f=await fixture(t),r=await f.S.fn('telegram')('SYNTHETIC guarded recovery',null,()=>false);assert.equal(f.calls(),0);assert.equal(r.localEvidenceRefusal,true);
});
test('recovery sell wording keeps next-open timing without attributing a15minute delay to evidence',async t=>{
 const f=await fixture(t);f.S.write('data/timing-study.json',{buy:'EITHER',sell:'EITHER'});const x=f.S.fn('timingNote')(),sell=x.slice(x.indexOf('; sell'));assert.match(sell,/next regular-session open/);assert.match(sell,/did not meet the preference threshold/);assert.doesNotMatch(sell,/after the first 15|tested: no difference/);
});
test('all recovery-floor requests stayed on loopback',()=>assert.deepEqual(blocked,[]));
