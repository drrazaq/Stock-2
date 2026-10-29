import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {paperMutationOnce,createPrivatePaperJournal} from '../paper-mutation-journal.mjs';
import {paperRequest} from '../paper-transport.mjs';
import {loadScan} from '../test/load-scan.mjs';
const id='12345678-1234-1234-1234-123456789abc',accountKey='public-fixture-account-identifier',buy={symbol:'AAA',qty:'1',side:'buy',type:'limit',limit_price:'10',time_in_force:'day',client_order_id:'fixture-buy',order_class:'oto',stop_loss:{stop_price:'9'}},sell={symbol:'AAA',qty:'1',side:'sell',type:'market',time_in_force:'day',client_order_id:'fixture-sell'};
const operations=[{method:'POST',path:'/v2/orders',body:buy},{method:'POST',path:'/v2/orders',body:sell},{method:'DELETE',path:'/v2/orders/'+id}];
const ack=o=>o.method==='DELETE'?{cancelled:true,id}:{id,symbol:o.body.symbol,side:o.body.side,client_order_id:o.body.client_order_id};
function backend(){const rows=new Map();let seq=0;return {rows,store:{read:async key=>rows.has(key)?{exists:true,...structuredClone(rows.get(key))}:{exists:false,sha:null,record:null},write:async(key,expected,record)=>{if((rows.get(key)?.sha??null)!==expected)throw Error('CAS_CONFLICT');const sha=(++seq).toString(16).padStart(40,'0');rows.set(key,{sha,record:structuredClone(record)});return {sha};}}};}
const options=(o,b,extra={})=>({enabled:true,accountKey,...o,store:b.store,send:async()=>ack(o),...extra});
test('all three mutation routes require literal opt-in and valid scope before any journal/network call',async()=>{
 for(const o of operations)for(const enabled of [undefined,false,'1',1,{}]){let calls=0;const r=await paperMutationOnce({enabled,accountKey,...o,store:{read:async()=>{calls++;}},send:async()=>{calls++;}});assert.equal(r.error,'ORDER_MUTATIONS_DISABLED');assert.equal(calls,0);}
 const b=backend();for(const o of [{...operations[0],path:'/v2/orders/'+id},{...operations[2],path:'/v2/orders/extra/'+id},{...operations[0],method:'PATCH'},{...operations[0],body:{...buy,limit_price:'Infinity'}}])assert.equal((await paperMutationOnce(options(o,b))).error,'PAPER_JOURNAL_SCOPE_INVALID');assert.equal(b.rows.size,0);
});
test('ACK and operation hashes survive separate actors without duplicate buy/sell/cancel',async()=>{
 for(const o of operations){const b=backend();let calls=0;const send=async()=>{calls++;return ack(o);};assert.deepEqual(await paperMutationOnce(options(o,b,{send})),ack(o));assert.equal((await paperMutationOnce(options(o,b,{send}))).error,'PAPER_OPERATION_ALREADY_RECORDED');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify([...b.rows]),/public-fixture-account|fixture-buy|fixture-sell|"AAA"/);}
});
test('failed/unconfirmed reservation blocks every route even if API committed before response loss',async()=>{
 for(const o of operations)for(const committed of [false,true]){const b=backend(),real=b.store;let calls=0;const store={read:real.read,write:async(...a)=>{if(committed)await real.write(...a);throw Error('lost API response');}};assert.equal((await paperMutationOnce(options(o,b,{store,send:async()=>{calls++;}}))).error,'PAPER_INTENT_NOT_REMOTELY_DURABLE');assert.equal(calls,0);if(committed)assert.equal((await paperMutationOnce(options(o,b))).error,'PAPER_OPERATION_QUARANTINED');}
});
test('unknown broker result and unconfirmed ACK state never trigger blind resumed retries',async()=>{
 for(const o of operations){for(const result of [null,{error:503},{error:429},{id:'not-a-valid-ack'}]){const b=backend();let calls=0;const send=async()=>{calls++;return result;};assert.ok((await paperMutationOnce(options(o,b,{send}))).error);assert.equal((await paperMutationOnce(options(o,b,{send}))).error,'PAPER_OPERATION_QUARANTINED');assert.equal(calls,1);}
  const b=backend(),real=b.store;let calls=0;const store={read:real.read,write:async(k,sha,record)=>{if(record.status==='ACK')throw Error('ACK API unavailable');return real.write(k,sha,record);}};assert.equal((await paperMutationOnce(options(o,b,{store,send:async()=>{calls++;return ack(o);}}))).error,'PAPER_ACK_NOT_REMOTELY_DURABLE');assert.equal((await paperMutationOnce(options(o,b))).error,'PAPER_OPERATION_QUARANTINED');assert.equal(calls,1);
 }
});
test('racing jobs execute once; same client identity cannot silently replace content',async()=>{
 for(const o of operations){const b=backend();let calls=0;const send=async()=>{calls++;return ack(o);};const results=await Promise.all([paperMutationOnce(options(o,b,{send})),paperMutationOnce(options(o,b,{send}))]);assert.equal(results.filter(x=>!x.error).length,1);assert.equal(calls,1);}
 const b=backend();await paperMutationOnce(options(operations[0],b));assert.equal((await paperMutationOnce(options({...operations[0],body:{...buy,qty:'2'}},b))).error,'PAPER_OPERATION_CONTENT_CONFLICT');
});
test('private GitHub CAS confirms each write by read-back, with no token in paths or records',async()=>{
 const rows=new Map(),calls=[];let seq=0;const token='fixture-private-token';const store=createPrivatePaperJournal({token,fetcher:async(url,o)=>{calls.push({url,method:o.method});assert.match(url,/^https:\/\/api.github.com\/repos\/drrazaq\/stock-2-private-data\/contents\/data\/broker-intents\/[a-f0-9]{64}\.json/);assert.equal(o.redirect,'error');assert.ok(o.signal);assert.equal(o.headers.Authorization,'Bearer '+token);const key=new URL(url).pathname;if(o.method==='GET')return rows.has(key)?new Response(JSON.stringify(rows.get(key))):new Response('{}',{status:404});const body=JSON.parse(o.body);assert.equal(body.branch,'main');assert.equal(body.sha,rows.get(key)?.sha);const sha=(++seq).toString(16).padStart(40,'0');rows.set(key,{sha,encoding:'base64',content:body.content});return new Response(JSON.stringify({content:{sha},commit:{sha}}),{status:201});}});
 assert.equal((await paperMutationOnce({...options(operations[0],{store}),store})).id,id);assert.equal(calls.length,5);assert.equal(calls.filter(x=>x.method==='PUT').length,2);assert.doesNotMatch(JSON.stringify([...rows]),/fixture-private-token|fixture-buy|"AAA"/);assert.throws(()=>createPrivatePaperJournal({token,base:'https://untrusted.example'}));
});
test('private-store transport refusal, malformed response and timeout cannot permit an order',async()=>{
 for(const fetcher of [async()=>new Response('{}',{status:302}),async()=>new Response('{}'),()=>new Promise(()=>{})]){let calls=0;const store=createPrivatePaperJournal({token:'fixture',fetcher,timeoutMs:10});const result=await paperMutationOnce(options(operations[0],{store},{send:async()=>{calls++;}}));assert.ok(result.error);assert.equal(calls,0);}
});
test('actual scanner wrapper cannot opt into mutation without private journal/runtime prerequisites',async()=>{
 const S=await loadScan({env:{ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture',STOCK2_ENABLE_PAPER_ORDERS:'1'}});for(const o of operations)assert.equal((await S.fn('alp')(o.method,o.path,o.body)).error,'PRIVATE_PAPER_JOURNAL_REQUIRED');
});
test('real adapter composition confirms remote intent first on every actual mutation route',async()=>{
 for(const o of operations){const b=backend();let calls=0;const send=()=>paperRequest({...o,base:'http://127.0.0.1:12345',key:'fixture',secret:'fixture',enableOrders:true,fetcher:async(u,args)=>{calls++;assert.equal([...b.rows.values()][0].record.status,'PENDING');assert.equal(args.method,o.method);assert.equal(args.redirect,'error');return o.method==='DELETE'?new Response(null,{status:204}):new Response(JSON.stringify(ack(o)));}});
  assert.deepEqual(await paperMutationOnce(options(o,b,{send})),ack(o));assert.equal((await paperMutationOnce(options(o,b,{send}))).error,'PAPER_OPERATION_ALREADY_RECORDED');assert.equal(calls,1);
 }
});
test('redirect/error/hung-body faults through the real adapter remain quarantined on resumed actors',async()=>{
 for(const o of operations)for(const fault of ['redirect','malformed','timeout']){const b=backend();let calls=0;const send=()=>paperRequest({...o,key:'fixture',secret:'fixture',enableOrders:true,timeoutMs:5,fetcher:async()=>{calls++;if(fault==='redirect')throw Error('redirect refused');if(fault==='malformed')return new Response('not-json');return new Response(new ReadableStream({pull:()=>new Promise(()=>{})}));}});
  assert.ok((await paperMutationOnce(options(o,b,{send}))).error);assert.equal((await paperMutationOnce(options(o,b,{send}))).error,'PAPER_OPERATION_QUARANTINED');assert.equal(calls,1);
 }
});
test('current runtime broker mutations have one guarded consumer and no workflow activation flag',()=>{
 const root=new URL('../',import.meta.url),paths=[...fs.readdirSync(root).filter(x=>x.endsWith('.mjs')),...fs.readdirSync(new URL('../tools/',import.meta.url)).filter(x=>x.endsWith('.mjs')).map(x=>'tools/'+x)],consumers=[];
 for(const path of paths){const s=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');if(/import\s*\{[^}]*\bpaperRequest\b[^}]*\}\s*from/.test(s))consumers.push(path);if(s.includes('/v2/orders'))assert.ok(['scan.mjs','paper-transport.mjs','paper-mutation-journal.mjs'].includes(path),path);}
 assert.deepEqual(consumers,['scan.mjs']);const source=fs.readFileSync(new URL('../scan.mjs',import.meta.url),'utf8');assert.match(source,/return paperMutationOnce\(/);
 for(const name of fs.readdirSync(new URL('../.github/workflows/',import.meta.url)).filter(x=>/\.ya?ml$/.test(x)))assert.doesNotMatch(fs.readFileSync(new URL('../.github/workflows/'+name,import.meta.url),'utf8'),/STOCK2_ENABLE_PAPER_ORDERS/,name);
});
