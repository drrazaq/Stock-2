import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubDeliveryStore,deliverTelegramDurably} from '../telegram-delivery-ledger.mjs';
import {telegramFetch} from '../telegram-delivery.mjs';
function backend(){
 const records=new Map();let version=1,telegramCalls=0;const writes=[];
 const fetcher=async(url,options)=>{
  if(new URL(url).hostname==='api.telegram.org'){telegramCalls++;return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:89}})};}
  const key=new URL(url).pathname.split('/').pop(),existing=records.get(key);
  if(options.method==='GET')return existing?{ok:true,status:200,json:async()=>({type:'file',encoding:'base64',sha:existing.sha,content:Buffer.from(JSON.stringify(existing.record)).toString('base64')})}:{ok:false,status:404};
  assert.equal(options.redirect,'error');assert.ok(options.signal);const body=JSON.parse(options.body);writes.push(body);
  if(existing?body.sha!==existing.sha:body.sha!==undefined)return {ok:false,status:409};
  const next={record:JSON.parse(Buffer.from(body.content,'base64').toString()),sha:(version++).toString(16).padStart(40,'0')};records.set(key,next);
  return {ok:true,status:existing?200:201,json:async()=>({content:{sha:next.sha},commit:{sha:'a'.repeat(40)}})};
 };
 return {records,writes,fetcher,get telegramCalls(){return telegramCalls;},store:()=>createGitHubDeliveryStore({repository:'drrazaq/Stock-2',branch:'Stock2-safety-fixes',token:'fixture-not-real-token',fetcher})};
}
const options=(b,extra={})=>({store:b.store(),scope:'fixture-chat-scope',eventId:'fixture-event',message:'public-fixture-body',send:async()=>({ok:true,messageId:89}),...extra});
test('independent job instances suppress a previously acknowledged message through the shared facade',async()=>{
 const b=backend(),url='https://api.telegram.org/botfixture/sendMessage',body={body:JSON.stringify({chat_id:'fixture-chat',text:'public fixture'})};
 const first=await telegramFetch(url,body,{fetcher:b.fetcher,recordFailure:false,durability:{store:b.store(),scope:'daily-report',eventId:'2026-10-29'}});
 const second=await telegramFetch(url,body,{fetcher:b.fetcher,recordFailure:false,durability:{store:b.store(),scope:'daily-report',eventId:'2026-10-29'}});
 assert.equal(first.ok,true);assert.equal(second.ok,true);assert.equal(second.deduplicated,true);assert.equal(second.totalParts,1);assert.equal(b.telegramCalls,1);
 assert.equal([...b.records.values()][0].record.status,'ACK');
 for(const w of b.writes){const text=Buffer.from(w.content,'base64').toString();assert.doesNotMatch(text,/fixture-chat|public fixture|fixture-not-real-token/);}
});
test('competing reservations cannot both reach Telegram',async()=>{
 const b=backend();let calls=0;
 await Promise.all([deliverTelegramDurably(options(b,{send:async()=>{calls++;return {ok:true,messageId:1};}})),deliverTelegramDurably(options(b,{send:async()=>{calls++;return {ok:true,messageId:2};}}))]);
 assert.equal(calls,1);
});
test('ambiguous delivery and partial acknowledgments survive a job restart without replay',async()=>{
 for(const result of [null,{ok:false,reason:'HTTP_429',deliveredParts:1},{ok:false,reason:'HTTP_503'},{ok:true}]){
  const b=backend();let calls=0;const send=async()=>{calls++;if(result===null)throw Error('fixture timeout');return result;};
  assert.equal((await deliverTelegramDurably(options(b,{send}))).ok,false);
  assert.equal((await deliverTelegramDurably(options(b,{send}))).reason,'DELIVERY_OUTCOME_UNKNOWN');assert.equal(calls,1);
 }
});
test('unconfirmed reservation blocks Telegram; unconfirmed ACK never causes a blind replay',async()=>{
 const b=backend();let calls=0;
 const refused={read:async()=>({exists:false,record:null,sha:null}),write:async()=>{throw Error('fixture outage');}};
 assert.equal((await deliverTelegramDurably(options(b,{store:refused,send:async()=>{calls++;}}))).reason,'INTENT_NOT_REMOTELY_DURABLE');assert.equal(calls,0);
 const real=b.store(),broken={read:real.read,write:async(k,sha,record)=>{if(record.status==='ACK')throw Error('fixture ack timeout');return real.write(k,sha,record);}};
 const result=await deliverTelegramDurably(options(b,{store:broken,send:async()=>{calls++;return {ok:true,messageId:9};}}));
 assert.equal(result.reason,'ACK_STATE_NOT_REMOTELY_DURABLE');
 assert.equal((await deliverTelegramDurably(options(b,{send:async()=>{calls++;}}))).reason,'DELIVERY_OUTCOME_UNKNOWN');assert.equal(calls,1);
});
test('definite rejections permit at most three attempts; a changed message cannot reuse a delivery key',async()=>{
 const b=backend();let calls=0,send=async()=>{calls++;return {ok:false,reason:'HTTP_403'};};
 for(let i=0;i<3;i++)assert.equal((await deliverTelegramDurably(options(b,{send}))).reason,'HTTP_403');
 assert.equal((await deliverTelegramDurably(options(b,{send}))).reason,'DELIVERY_RETRY_LIMIT');assert.equal(calls,3);
 assert.equal((await deliverTelegramDurably(options(b,{message:'changed body',send}))).reason,'DELIVERY_KEY_CONTENT_CONFLICT');assert.equal(calls,3);
});
test('unreadable state and invalid journal scope fail before Telegram',async()=>{
 const b=backend();let calls=0;
 const r=await deliverTelegramDurably(options(b,{store:{read:async()=>({exists:true,sha:'a'.repeat(40),record:{}}),write:async()=>{}},send:async()=>{calls++;}}));assert.equal(r.reason,'DELIVERY_STATE_UNREADABLE');assert.equal(calls,0);
 assert.throws(()=>createGitHubDeliveryStore({repository:'other/repo',branch:'main',token:'fixture'}),/SCOPE/);
 assert.throws(()=>createGitHubDeliveryStore({repository:'drrazaq/Stock-2',branch:'main',token:'fixture',base:'https://untrusted.example'}),/BLOCKED/);
});
test('a lost API reservation response may have committed but must never permit a send',async()=>{
 const b=backend(),real=b.store();let calls=0;
 const ambiguous={read:real.read,write:async(k,sha,r)=>{await real.write(k,sha,r);throw Error('response lost after commit');}};
 assert.equal((await deliverTelegramDurably(options(b,{store:ambiguous,send:async()=>{calls++;}}))).reason,'INTENT_NOT_REMOTELY_DURABLE');
 assert.equal((await deliverTelegramDurably(options(b,{send:async()=>{calls++;}}))).reason,'DELIVERY_OUTCOME_UNKNOWN');assert.equal(calls,0);
});
