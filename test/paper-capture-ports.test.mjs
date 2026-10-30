import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {providerPort,historyPort,eventFilePort,artifactPort} from '../paper-capture-ports.mjs';
import {FIXED_UNIVERSE} from '../paper-capture-wrapper.mjs';
import {sha} from '../prospective-paper-capture.mjs';
test('provider adapter binds only explicit synthetic credentials to fixed GET/SIP endpoint',async()=>{
 let calls=0;const p=providerPort({keyId:'synthetic-key',secret:'synthetic-secret',fetcher:async(url,o)=>{calls++;assert.equal(o.headers['APCA-API-KEY-ID'],'synthetic-key');assert.equal(o.headers['APCA-API-SECRET-KEY'],'synthetic-secret');return new Response('{}');}}),url='https://data.alpaca.markets/v2/stocks/snapshots?symbols='+FIXED_UNIVERSE.join(',')+'&feed=sip',options={method:'GET',redirect:'error',signal:new AbortController().signal};await p(url,options);for(const bad of [url.replace('data.alpaca.markets','evil.invalid'),url.replace('https://','https://x@'),url.replace('sip','iex'),url+'&extra=1'])assert.throws(()=>p(bad,options));assert.throws(()=>p(url,{...options,method:'POST'}));assert.equal(calls,1);assert.throws(()=>providerPort({}));
});
test('run-history adapter does one bounded read-only mocked request and rejects failure/oversize',async()=>{
 let calls=0;const h=historyPort({token:'synthetic-only',fetcher:async(url,o)=>{calls++;assert.match(url,/sec-paper-capture.yml\/runs\?per_page=100$/);assert.equal(o.method,'GET');return new Response('{"total_count":0,"workflow_runs":[]}');}});assert.equal((await h()).total_count,0);assert.equal(calls,1);
 await assert.rejects(historyPort({token:'x',fetcher:async()=>new Response('{}',{status:403})})());await assert.rejects(historyPort({token:'x',fetcher:async()=>new Response(' '.repeat(262145))})());
});
test('artifact client adapter sends only the exact encrypted file and strips arbitrary response fields',async()=>{
 const dir=fs.mkdtempSync('/tmp/capture-port-');try{const file=path.join(dir,'checkpoint-000.enc'),bytes=Buffer.from('synthetic ciphertext');fs.writeFileSync(file,bytes);let calls=0;const p=artifactPort({uploadArtifact:async(name,files,root,o)=>{calls++;assert.deepEqual(files,[file]);assert.equal(root,dir);assert.equal(o.retentionDays,3);return {id:1,size:bytes.length+100,digest:'a'.repeat(64),unexpectedSecret:'MUST_NOT_PERSIST'};}}),r=await p({file,name:path.basename(file),bytes,sha256:sha(bytes),sequence:0,retentionDays:3});assert.equal(calls,1);assert.equal(r.artifactId,1);assert.equal(JSON.stringify(r).includes('MUST_NOT_PERSIST'),false);assert.throws(()=>artifactPort({}));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('event adapter preserves exact existing bytes; missing files and symlinks never become empty events',async()=>{
 const dir=fs.mkdtempSync('/tmp/capture-event-');try{const file=path.join(dir,'events.json'),raw='{"events":[null]}\n';fs.writeFileSync(file,raw);assert.equal(await eventFilePort({file})(),raw);await assert.rejects(eventFilePort({file:path.join(dir,'missing')})());const link=path.join(dir,'link');fs.symlinkSync(file,link);await assert.rejects(eventFilePort({file:link})());}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
