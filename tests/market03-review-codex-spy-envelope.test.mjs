// Desired behavior review; synthetic local service only. No real data or credentials.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.REVIEW_TREE||process.cwd());
const {latestCompletedSession}=await import(pathToFileURL(path.join(root,'source-contract.mjs')));
const bar={t:Date.parse(latestCompletedSession(Date.now())+'T20:00:00Z'),o:500,c:501};
const cases=[
 ['conflicting explicit empty counts',{status:'OK',ticker:'SPY',queryCount:0,resultsCount:1},'MALFORMED'],
 ['noninteger returned count',{status:'OK',ticker:'SPY',resultsCount:0.5,results:[bar]},'MALFORMED'],
 ['negative returned count',{status:'OK',ticker:'SPY',resultsCount:-1,results:[bar]},'MALFORMED'],
 ['nonnumeric returned count',{status:'OK',ticker:'SPY',resultsCount:'invalid',results:[bar]},'MALFORMED'],
 ['valid explicit empty',{status:'OK',ticker:'SPY',queryCount:0,resultsCount:0},'EMPTY'],
 ['valid one-bar result',{status:'OK',ticker:'SPY',adjusted:true,queryCount:1,resultsCount:1,results:[bar]},'OBSERVED']
];
for(const [name,body,expected]of cases)test(name,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spy-count-review-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let calls=0;
 const server=http.createServer((q,s)=>{calls++;s.setHeader('content-type','application/json');s.end(JSON.stringify(body));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const child=spawn(process.execPath,[path.join(root,'comeback-lab.mjs')],{cwd:dir,env:{PATH:process.env.PATH,MASSIVE_KEY:'synthetic',MASSIVE_BASE:'http://127.0.0.1:'+server.address().port},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);const timer=setTimeout(()=>child.kill('SIGKILL'),5000);const code=await new Promise((r,j)=>{child.on('error',j);child.on('close',r);});clearTimeout(timer);assert.equal(code,0,log);assert.equal(calls,1);const out=JSON.parse(fs.readFileSync(path.join(dir,'data/comeback-today.json')));assert.equal(out.sourceStatus.SPY_BARS.response,expected);assert.equal(out.sourceStatus.SPY_BARS.status,expected);
});
