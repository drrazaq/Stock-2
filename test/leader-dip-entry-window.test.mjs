// Synthetic actual-caller controls; no original owner records, external feeds or delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScan,blocked} from './load-scan.mjs';
const CLOSE='2026-11-03',GEN='2026-11-03T22:00:00Z';
const fixture=(signals=[{sym:'ZZQ',close:100,d:CLOSE}],marked=true)=>({
 'data/halal.json':marked?{ZZQ:{s:'ok',d:CLOSE,by:'you'}}:{},
 'data/settings.json':{focus:false},'data/names.json':{ZZQ:'Synthetic'},
 'data/signals.json':{session:CLOSE,market:{up:true,above50:true},stocks:[]},
 'data/squad11-today.json':{generatedAt:GEN,lastClose:CLOSE,methods:{'SQ11-PB12':{newSignals:signals}}},
});
async function at(iso,fn){const real=Date.now;Date.now=()=>Date.parse(iso);try{return await fn();}finally{Date.now=real;}}

test('next-open expiry is an instant, not a five-session late-entry allowance',async()=>{
 const S=await loadScan({files:fixture()}),w=S.fn('ldipEntryWindow');
 for(const [time,state]of [['2026-11-04T14:29:59.999Z','IN_WINDOW'],['2026-11-04T14:30:00.000Z','IN_WINDOW'],['2026-11-04T14:30:00.001Z','EXPIRED'],['2026-11-05T13:00:00Z','EXPIRED']]){
  const r=w(CLOSE,GEN,CLOSE,Date.parse(time));assert.equal(r.state,state,time);assert.equal(r.entryDay,'2026-11-04');assert.equal(r.expiresAt,'2026-11-04T14:30:00.000Z');
 }
});
test('weekends, holiday and opposite sides of November DST retain the declared next open',async()=>{
 const S=await loadScan({files:fixture()}),w=S.fn('ldipEntryWindow');
 for(const [day,gen,now,expiry]of [
  ['2026-10-29','2026-10-29T22:00:00Z','2026-10-30T13:00:00Z','2026-10-30T13:30:00.000Z'],
  ['2026-10-30','2026-10-30T22:00:00Z','2026-11-02T14:00:00Z','2026-11-02T14:30:00.000Z'],
  ['2026-11-25','2026-11-25T22:00:00Z','2026-11-27T14:00:00Z','2026-11-27T14:30:00.000Z']])assert.deepEqual(w(day,gen,day,Date.parse(now)),{state:'IN_WINDOW',reason:null,entryDay:expiry.slice(0,10),expiresAt:expiry});
});
test('invalid/missing source clocks or dates never fabricate a signal session',async()=>{
 const S=await loadScan({files:fixture()}),w=S.fn('ldipEntryWindow'),now=Date.parse('2026-11-04T13:00:00Z');
 for(const [day,gen,session]of [[null,GEN,CLOSE],['2026-02-30',GEN,CLOSE],['2026-11-07',GEN,CLOSE],[CLOSE,null,CLOSE],[CLOSE,'invalid',CLOSE],[CLOSE,'2026-11-05T00:00:00Z',CLOSE],['2026-11-04',GEN,CLOSE],[CLOSE,GEN,'2026-11-04']])assert.equal(w(day,gen,session,now).state,'UNKNOWN',JSON.stringify([day,gen,session]));
});
test('actual expired caller blocks BUY and offer publication while preserving research bytes',async()=>at('2026-11-04T15:00:00Z',async()=>{
 const S=await loadScan({files:fixture()}),before=S.read('data/squad11-today.json');
 const t=S.fn('ldipLines')({}, {},null,CLOSE).join('\n');assert.match(t,/no qualifying trade.*entry expired/);assert.doesNotMatch(t,/- BUY|MARK HALAL FIRST/);
 assert.equal(S.read('data/squad11-today.json'),before);assert.throws(()=>S.read('data/leaderdip-ledger.jsonl'),/ENOENT/);
}));
test('a later owner ZAD confirmation cannot revive an expired entry',async()=>at('2026-11-04T15:00:00Z',async()=>{
 const S=await loadScan({files:fixture(undefined,false)});assert.match(S.fn('ldipLines')({}, {},null,CLOSE).join('\n'),/entry expired/);
 S.write('data/halal.json',{ZZQ:{s:'ok',d:'2026-11-04',by:'you'}});assert.doesNotMatch(S.fn('ldipLines')({}, {},null,CLOSE).join('\n'),/- BUY/);
}));
test('valid pre-open policy control preserves allocation, target overlay and no-stop wording',async()=>at('2026-11-04T13:00:00Z',async()=>{
 const S=await loadScan({files:fixture()}),t=S.fn('ldipLines')({}, {},null,CLOSE).join('\n');
 assert.match(t,/- BUY ZZQ 1,000 USD at the open/);assert.match(t,/buy price \+20%/);assert.match(t,/No stop/);assert.match(t,/126 sessions/);
 // This tests the inherited owner-lane display window only, not BBO/identity evidence or a genuine approved fill.
}));
test('actual ACTIONS identifies expired input instead of presenting a future BUY or only missing ZAD',async()=>at('2026-11-04T15:00:00Z',async()=>{
 const S=await loadScan({files:fixture(undefined,false)}),t=await S.fn('actionsText')(S.readJson('data/signals.json'),{},null,'SYNTHETIC');
 assert.match(t,/LEADER DIP: no qualifying trade.*entry expired/);assert.match(t,/NOT PROVEN/);assert.doesNotMatch(t,/- BUY ZZQ|signal waiting for your ZAD mark/);
}));
test('actual ACTIONS zero-signal lane states the specific no-trade reason',async()=>at('2026-11-04T15:00:00Z',async()=>{
 const S=await loadScan({files:fixture([])}),t=await S.fn('actionsText')(S.readJson('data/signals.json'),{},null,'SYNTHETIC');
 assert.match(t,/LEADER DIP: no qualifying trade — no new SQ11-PB12 signal for the 2026-11-03 close/);assert.doesNotMatch(t,/- BUY ZZQ/);
}));
test('all external requests stayed blocked',()=>assert.deepEqual(blocked,[]));
