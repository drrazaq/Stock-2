import test from 'node:test';
import assert from 'node:assert/strict';
import {sendTelegramMessage} from '../telegram-delivery.mjs';
const args={token:'test',chat:'123',text:'PAPER WATCH ABCD'};
test('acknowledged Telegram send counts as delivered',async()=>{
 const x=await sendTelegramMessage({...args,fetcher:async()=>({ok:true,json:async()=>({ok:true,result:{message_id:12}})})});
 assert.deepEqual(x,{ok:true,messageId:12});
});
test('HTTP failure does not count as delivered',async()=>{
 const x=await sendTelegramMessage({...args,fetcher:async()=>({ok:false,status:429})});
 assert.equal(x.ok,false);
});
test('Telegram-level failure does not count as delivered',async()=>{
 const x=await sendTelegramMessage({...args,fetcher:async()=>({ok:true,json:async()=>({ok:false})})});
 assert.equal(x.ok,false);
});
test('network failure and missing credentials fail closed',async()=>{
 assert.equal((await sendTelegramMessage({...args,fetcher:async()=>{throw Error('down');}})).ok,false);
 assert.equal((await sendTelegramMessage({...args,token:''})).ok,false);
});
