import test from 'node:test';
import assert from 'node:assert/strict';
import {telegramFetch,splitTelegramText,sendTelegramMessage} from '../telegram-delivery.mjs';
const url='http://localhost/botfixture/sendMessage',opts=text=>({body:JSON.stringify({chat_id:'fixture',text,reply_markup:{inline_keyboard:[]}})});
test('Unicode splitting preserves every character and bounds each Telegram part',()=>{
 const text='😀'.repeat(3000)+'\nTAIL';const parts=splitTelegramText(text);assert.equal(parts.join(''),text);assert.ok(parts.every(x=>x.length<=3900&&!/[\uD800-\uDBFF]$/.test(x)));
});
test('API-level refusal and boolean pseudo-ACK are never delivery proof',async()=>{
 for(const body of [{ok:false},{ok:true,result:true},{ok:true,result:{message_id:'12'}}])assert.equal((await sendTelegramMessage({token:'fixture',chat:1,text:'x',fetcher:async()=>({ok:true,json:async()=>body})})).ok,false);
});
test('only explicit short 429 is retried; timeouts are not blindly replayed',async()=>{
 let calls=0,waits=[];
 const r=await telegramFetch(url,opts('fixture'),{recordFailure:false,sleep:async x=>waits.push(x),fetcher:async()=>++calls===1?{ok:false,status:429,json:async()=>({parameters:{retry_after:2}})}:{ok:true,json:async()=>({ok:true,result:{message_id:1}})}});
 assert.equal(r.ok,true);assert.deepEqual(waits,[2000]);assert.equal(calls,2);
 calls=0;const unknown=await telegramFetch(url,opts('fixture'),{recordFailure:false,fetcher:async()=>{calls++;throw Error('timeout');}});assert.equal(unknown.ok,false);assert.equal(calls,1);
});
test('long rate-limit deferral and partial ACK never become whole-message success',async()=>{
 let calls=0;const r=await telegramFetch(url,opts('x'.repeat(5000)),{recordFailure:false,fetcher:async()=>++calls===1?{ok:true,json:async()=>({ok:true,result:{message_id:1}})}:{ok:false,status:429,json:async()=>({parameters:{retry_after:60}})}});
 assert.equal(r.ok,false);assert.equal(r.deliveredParts,1);assert.equal(calls,2);
});
test('research qualification and rich reply markup survive the send facade',async()=>{
 let body;const r=await telegramFetch(url,opts('Study result'),{recordFailure:false,research:true,fetcher:async(u,o)=>{body=JSON.parse(o.body);assert.ok(o.signal);return {ok:true,json:async()=>({ok:true,result:{message_id:4}})};}});
 assert.equal(r.ok,true);assert.match(body.text,/^RESEARCH REPORT — NOT AN APPROVED BUY/);assert.deepEqual(body.reply_markup,{inline_keyboard:[]});
});
