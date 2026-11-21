import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {realFixture} from './sip-access-real-fixture.mjs';import {RESULT_EXITS,normalizeSipResult} from '../sip-access-result.mjs';
test('result allowlist and exit status are inseparable, including timeout/interruption and malformed output',()=>{
 for(const [code,rc]of Object.entries(RESULT_EXITS)){assert.deepEqual(normalizeSipResult(code+'\n',rc),{code,exitCode:rc});for(const wrong of [0,1,2,124,137,143].filter(x=>x!==rc))assert.deepEqual(normalizeSipResult(code+'\n',wrong),{code:'ERROR',exitCode:1});}
 for(const text of ['PASS\nPASS\n','PASS private',' PASS','UNKNOWN\n','PASS\n\n','PASS\r\n','PASS\0'])assert.deepEqual(normalizeSipResult(text,0),{code:'ERROR',exitCode:1});
});
test('actual validator/finalizer rejects mismatches twice and preserves valid controls',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sip-result-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const raw=path.join(dir,'raw'),canonical=path.join(dir,'canonical');
 for(const rc of [1,2,124,137,143]){fs.writeFileSync(raw,'PASS\n');const x=spawnSync(process.execPath,['tools/validate-sip-access-result.mjs',raw,String(rc)],{encoding:'utf8'});assert.equal(x.status,1);assert.equal(x.stdout,'ERROR\n');fs.writeFileSync(canonical,x.stdout);const y=spawnSync(process.execPath,['tools/validate-sip-access-result.mjs',canonical,String(x.status)],{encoding:'utf8'});assert.equal(y.status,1);assert.equal(y.stdout,'ERROR\n');}
 for(const [code,rc]of Object.entries(RESULT_EXITS)){fs.writeFileSync(raw,code+'\n');const x=spawnSync(process.execPath,['tools/validate-sip-access-result.mjs',raw,String(rc)],{encoding:'utf8'});assert.equal(x.status,rc);assert.equal(x.stdout,code+'\n');}
});
test('actual runner/client with local services: earliest/start/late and slow responses preserve full declared clocks',async t=>{
 const f=await realFixture(t);
 for(const options of [{start:-600000},{start:-60000},{start:0},{start:15000},{start:-30000,mode:'slow'}]){
  const r=await f.run(options);assert.equal(r.code,0,r.stderr+r.stdout);assert.equal(r.stdout,'PASS\n');assert.equal(r.calls.length,7);assert.ok(r.trace.filter(x=>x.event==='request').every(x=>x.at>=f.T&&x.at<=f.T+180000));assert.equal(r.trace.filter(x=>x.event==='request')[4].at>=f.T+90000,true);assert.equal(JSON.parse(r.report).applicationAttempts,7);
 }
});
test('all guard-refusal categories have actual-runner controls and no local service requests',async t=>{
 const f=await realFixture(t);
 const cases=[
  [{env:{GITHUB_RUN_ATTEMPT:'2'}},'BLOCKED_CONTEXT'],
  [{env:{SIP_APPROVED_SOURCE:'0'.repeat(40)}},'BLOCKED_SOURCE'],
  [{approval:{granted:false}},'BLOCKED_APPROVAL'],
  [{approval:{planSha256:'0'.repeat(64)}},'BLOCKED_INPUT'],
  [{start:-600001,env:{ALPACA_KEY:'',ALPACA_SECRET:''}},'BLOCKED_START_TOO_EARLY'],
  [{start:30001,env:{ALPACA_KEY:'',ALPACA_SECRET:''}},'BLOCKED_START_TOO_LATE'],
  [{env:{ALPACA_KEY:'',ALPACA_SECRET:''}},'BLOCKED_BINDING'],
  [{existing:true},'BLOCKED_EXISTING_REPORT']
 ];
 for(const [options,code]of cases){const r=await f.run(options);assert.equal(r.code,2,r.stderr+r.stdout);assert.equal(r.stdout,code+'\n');assert.equal(r.calls.length,0);assert.doesNotMatch(r.stdout+r.stderr,/synthetic-|PRIVATE/);}
 const source=fs.readFileSync(new URL('../tools/run-sip-access-diagnostic.mjs',import.meta.url),'utf8');assert.ok(source.indexOf('await waitDiagnosticStart')<source.indexOf('if(!env.ALPACA_KEY'),'window gate precedes credential-property reads');
});
test('actual runner/client: HTTP refusals, parser, clock, request timeout and absolute deadline stop without retry',async t=>{
 const f=await realFixture(t);
 for(const [options,code]of [
  [{status:401},'ERROR_HTTP_401'],[{status:403},'ERROR_HTTP_403'],[{status:429},'ERROR_HTTP_429'],[{status:500},'ERROR_HTTP_OTHER'],
  [{mode:'bad-json'},'ERROR_RESPONSE'],[{mode:'clock'},'ERROR_CLOCK'],[{mode:'timeout'},'ERROR_TIMEOUT'],[{mode:'deadline'},'ERROR_DEADLINE'],[{mode:'transport'},'ERROR']
 ]){
  const r=await f.run(options);assert.equal(r.code,1,r.stderr+r.stdout);assert.equal(r.stdout,code+'\n');assert.ok(r.calls.length<=7);assert.equal(r.calls.length,options.mode==='deadline'?4:1);assert.doesNotMatch(r.stdout+r.stderr,/PRIVATE|synthetic-key|synthetic-secret/);
 }
});
test('actual runner: SIGTERM/SIGINT during early wait clean up without opening report or credentials',async t=>{
 const f=await realFixture(t);
 for(const signal of ['SIGTERM','SIGINT']){const r=await f.run({start:-60000,mode:'interrupt',signal});assert.equal(r.code,1,r.stderr+r.stdout);assert.equal(r.stdout,'ERROR_INTERRUPTED\n');assert.equal(r.calls.length,0);assert.equal(r.report,null);assert.equal(r.signal,null);}
});
