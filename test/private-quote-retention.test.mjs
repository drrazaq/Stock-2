import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath}from'node:url';
import {createPrivateQuoteRetention,readPrivateAssessmentQuote,exportQuoteRecovery,restoreQuoteRecovery,quoteHash}from'../private-quote-retention.mjs';
import {snapshots,resetFeed,feedEvidence}from'../alpaca-feed.mjs';
import {loadScan,blocked}from'./load-scan.mjs';
const checkout=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),now=Date.parse('2026-11-11T20:30:00Z'),at=s=>new Date(now+s*1000).toISOString(),sourceSha='a'.repeat(40),review={status:'INDEPENDENT_PROVENANCE_REVIEWED',at:at(-600),comment:'https://github.com/drrazaq/Stock-2/pull/1#issuecomment-1'};
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'private-retention-'));fs.chmodSync(root,0o700);
 const ids=Buffer.from(JSON.stringify({records:[{symbol:'ZZQ',securityId:'SYNTHETIC-CS',issuerCik:'123',securityType:'CS',status:'INDEPENDENT_ISSUER_REVIEWED',knownAt:at(-600),validFrom:at(-600),validTo:null,review,source:'https://www.sec.gov/Archives/fixture'}]}));
 fs.writeFileSync(path.join(root,'identities.json'),ids,{mode:0o600});
 const policy=Buffer.from(JSON.stringify({kind:'PRIVATE_QUOTE_RETENTION_POLICY_V1',review,reviewedProducerShas:[sourceSha],identity:{path:'identities.json',sha256:quoteHash(ids)}}));fs.writeFileSync(path.join(root,'policy.json'),policy,{mode:0o600});
 const options={root,checkout,policySha256:quoteHash(policy),sourceSha,runId:'SYNTHETIC-run-1',now:()=>now};
 const writer=createPrivateQuoteRetention(options),event=()=>({provider:'ALPACA',feed:'sip',requestStartedAt:at(-6),receivedAt:at(-5),outcome:'SUCCESS',httpStatus:200,payload:{ZZQ:{latestQuote:{t:at(-10),bp:19.9,ap:20.1,bs:2,as:3,c:['R']}}}});
 return{root,options,writer,event,read:(n=now)=>readPrivateAssessmentQuote('ZZQ',{...options,now:n}),clean(){writer.close();fs.rmSync(root,{recursive:true,force:true});}};
}
test('actual snapshot ingestion -> private publication -> actual assessment caller; quote sizes are displayed shares, no trade substitution',async()=>{
 const f=fixture(),old=Date.now;Date.now=()=>now;resetFeed();delete process.env.ALPACA_FEED;
 try{
  let requests=0;const input=f.event().payload;
  const payload=await snapshots('https://data.alpaca.markets',['ZZQ'],{},async()=>{requests++;return {ok:true,status:200,headers:{get:()=>null},json:async()=>input};},f.writer.capture);
  assert.equal(requests,1);assert.deepEqual(payload,input);assert.equal(f.read().status,'FRESH_REVIEWED_BBO_CONTEXT');assert.equal(f.read().bidSizeShares,2);assert.equal(f.read().askSizeShares,3);assert.equal(f.read().receiptAt,at(0));assert.equal(f.read().quoteAsOf,at(-10));
  const s=await loadScan({env:{ASSESSMENT_PRIVATE_QUOTE_ROOT:f.root,ASSESSMENT_PRIVATE_QUOTE_POLICY_SHA256:f.options.policySha256},files:{'data/signals.json':{session:'2026-11-10',stocks:[{sym:'ZZQ',last:5,trigger:10,rule:'retained daily-close rule',proven:false}]}}});
  const before=s.read('data/signals.json'),text=s.fn('assessmentContext')('ZZQ',s.readJson('data/signals.json'),{},'WAIT');
  assert.match(text,/FRESH_REVIEWED_BBO_CONTEXT/);assert.match(text,/displayed shares 2\/3/);assert.match(text,/not fill capacity/);assert.match(text,/rule NOT PROVEN/);assert.equal(s.read('data/signals.json'),before);assert.equal(blocked.length,0);
 }finally{Date.now=old;delete process.env.ASSESSMENT_PRIVATE_QUOTE_ROOT;delete process.env.ASSESSMENT_PRIVATE_QUOTE_POLICY_SHA256;f.clean();}
});
for(const [name,change,reason]of[
 ['future provider',e=>e.payload.ZZQ.latestQuote.t=at(1),'FUTURE'],
 ['missing provider',e=>delete e.payload.ZZQ.latestQuote.t,'CLOCK_MISSING'],
 ['stale provider',e=>e.payload.ZZQ.latestQuote.t=at(-121),'STALE'],
 ['prior session',e=>e.payload.ZZQ.latestQuote.t='2026-11-10T20:29:50Z','CROSS_SESSION'],
 ['missing quote',e=>e.payload.ZZQ={latestTrade:{p:20,t:at(-2)}},'CLOCK_MISSING'],
 ['unknown instrument',e=>{e.payload.UNKNOWN=e.payload.ZZQ;delete e.payload.ZZQ;},'NO_RETAINED'],
])test('retained adverse observation: '+name,()=>{const f=fixture();try{const e=f.event();change(e);f.writer.capture(e);assert.match(f.read().reason,new RegExp(reason));assert.equal(f.read().entryApproval,false);}finally{f.clean();}});
test('latest observation publishes atomically; old pin remains immutable; missing fields stay partial; old attempts retained',()=>{
 const f=fixture();try{const e=f.event();f.writer.capture(e);const old=fs.readFileSync(path.join(f.root,'join-1.json'));e.receivedAt=at(-1);delete e.payload.ZZQ.latestQuote.bs;delete e.payload.ZZQ.latestQuote.c;f.writer.capture(e);
 assert.equal(f.read().status,'FRESH_REVIEWED_BBO_PARTIAL');assert.equal(f.read().bidSizeShares,null);assert.equal(f.read().conditions,null);assert.deepEqual(fs.readFileSync(path.join(f.root,'join-1.json')),old);
 const book=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(f.root,'quotes-2.json.gz'))));assert.equal(book.observations.length,2);assert.equal(book.attempts.length,2);assert.equal(book.quotes.length,1);assert.equal(book.observations[0].bidSizeNative,2);
 assert.match(f.read(now+121000).reason,/EXPIRED/);
 }finally{f.clean();}
});
test('SIP403/IEX fallback records both actual attempts without extra requests; observer cannot mutate trading payload',async()=>{
 const f=fixture(),old=Date.now;Date.now=()=>now;resetFeed();delete process.env.ALPACA_FEED;
 try{let n=0;const out=await snapshots('https://data.alpaca.markets',['ZZQ'],{},async()=>++n===1?{ok:false,status:403,headers:{get:()=>null}}:{ok:true,status:200,headers:{get:()=>null},json:async()=>f.event().payload},e=>{f.writer.capture(e);if(e.payload)e.payload.ZZQ.latestQuote.bp=999;});assert.equal(n,2);assert.equal(out.ZZQ.latestQuote.bp,19.9);assert.equal(f.read().feed,'iex');const b=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(f.root,'quotes-2.json.gz'))));assert.deepEqual(b.attempts.map(x=>x.outcome),['HTTP_FAILURE','SUCCESS']);
 }finally{Date.now=old;f.clean();}
});
test('failed transport invalidates current pointer, does not infer delivery or replay',async()=>{
 const f=fixture(),old=Date.now;Date.now=()=>now;resetFeed();try{f.writer.capture(f.event());let calls=0;assert.equal(await snapshots('https://data.alpaca.markets',['ZZQ'],{},async()=>{calls++;throw Error('SYNTHETIC failure');},f.writer.capture),null);assert.equal(calls,1);assert.equal(f.read().reason,'PRIVATE_POINTER_UNAVAILABLE');}finally{Date.now=old;f.clean();}
});
test('one writer, row/generation caps and failure invalidate pointer without changing trading ingestion',async()=>{
 const f=fixture(),old=Date.now;Date.now=()=>now;resetFeed();try{assert.throws(()=>createPrivateQuoteRetention(f.options));for(let i=0;i<8;i++)f.writer.capture(f.event());assert.throws(()=>f.writer.capture(f.event()),/CAP/);assert.equal(f.read().reason,'PRIVATE_POINTER_UNAVAILABLE');const r=await snapshots('https://data.alpaca.markets',['ZZQ'],{},async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>f.event().payload}),f.writer.capture);assert.ok(r.ZZQ);assert.equal(feedEvidence().retentionFailure,'PRIVATE_RETENTION_FAILED');}finally{Date.now=old;f.clean();}
});
test('offline outside-original-directory recovery preserves exact bytes and expiry; tamper refuses; no writer resume or clock refresh',()=>{
 const f=fixture(),target=fs.mkdtempSync(path.join(os.tmpdir(),'recovered-private-'));fs.chmodSync(target,0o700);
 try{f.writer.capture(f.event());assert.throws(()=>exportQuoteRecovery(f.root),/WRITER_ACTIVE/);f.writer.close();const bundle=exportQuoteRecovery(f.root);assert.throws(()=>restoreQuoteRecovery({bundle:Buffer.concat([bundle.bytes,Buffer.from('x')]),pinnedSha256:bundle.sha256,root:target,checkout}),/PIN/);
 restoreQuoteRecovery({bundle:bundle.bytes,pinnedSha256:bundle.sha256,root:target,checkout});assert.equal(readPrivateAssessmentQuote('ZZQ',{...f.options,root:target,now}).quoteAsOf,at(-10));assert.match(readPrivateAssessmentQuote('ZZQ',{...f.options,root:target,now:now+121000}).reason,/EXPIRED/);assert.throws(()=>createPrivateQuoteRetention({...f.options,root:target}),/FRESH_RUN/);
 for(const name of fs.readdirSync(f.root))assert.deepEqual(fs.readFileSync(path.join(target,name)),fs.readFileSync(path.join(f.root,name)));
 }finally{f.clean();fs.rmSync(target,{recursive:true,force:true});}
});
test('private path, permissions, identity pin and pointer tamper fail closed',()=>{
 const f=fixture();try{f.writer.capture(f.event());assert.throws(()=>createPrivateQuoteRetention({...f.options,root:checkout}));fs.writeFileSync(path.join(f.root,'current.json'),'{}');assert.equal(f.read().currentBbo,false);fs.appendFileSync(path.join(f.root,'identities.json'),' ');assert.equal(f.read().currentBbo,false);}finally{f.clean();}
});
