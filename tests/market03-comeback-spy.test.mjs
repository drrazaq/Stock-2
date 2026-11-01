// MARKET-03 Massive SPY daily-bar ingress through the ACTUAL comeback-lab.mjs (Claude, 2 Nov 2026). Local fake provider only.
// Independent of discovery-runtime.mjs, so it also runs on production main with the comeback hunks applied.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {latestCompletedSession,nextSession} from '../source-contract.mjs';
const root=path.resolve(import.meta.dirname,'..');
const day=ms=>new Date(ms).toISOString().slice(0,10),now=Date.now();
const prevSession=d=>{let x=d;for(let i=0;i<10;i++){x=day(Date.parse(x+'T12:00:00Z')-864e5);if(nextSession(x,{inclusive:true})===x)return x;}return null;};
async function provider(t,route){const server=http.createServer(async(req,res)=>{const [status,body]=await route(new URL(req.url,'http://x'));res.statusCode=status;res.end(JSON.stringify(body));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());return {base:'http://127.0.0.1:'+server.address().port};}
function workdir(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'c03s-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return {dir,put:(f,v)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(v)),json:f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))};}
const run=(dir,script,env)=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[path.join(root,script)],{cwd:dir,env:{PATH:process.env.PATH,...env}});let out='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>out+=x);c.on('exit',code=>code===0?resolve(out):reject(Error(script+' exit '+code+': '+out.slice(-1500))));});

test('comeback SPY ingress: malformed bars rejected, today\'s unfinished bar excluded, a revised cached bar kept as the original', async t=>{
 const w=workdir(t),latest=latestCompletedSession(now),prior=prevSession(latest),barMs=d=>Date.parse(d+'T04:00:00Z');
 w.put('data/comeback-spy.json',{bars:{[prior]:{o:500,c:501}}});
 const p=await provider(t,async()=>[200,{ticker:'SPY',status:'OK',results:[{t:barMs(prior),o:500,c:999},{t:barMs(latest),o:510,c:511},{t:now+3600e3,o:1,c:1},{t:'bad',o:1,c:1},{t:barMs(day(now)),o:520,c:'x'}]}]);
 await run(w.dir,'comeback-lab.mjs',{MASSIVE_BASE:p.base});
 const spy=w.json('data/comeback-spy.json');assert.equal(spy.bars[prior].c,501,'the cached bar is not overwritten');assert.deepEqual(spy.conflicts[prior].reported,{o:500,c:999});
 assert.equal(spy.bars[latest].c,511);assert.equal(spy.status,'CONFLICT');
 const today=w.json('data/comeback-today.json');assert.equal(today.sourceStatus.SPY_BARS.status,'CONFLICT');assert.equal(today.sourceStatus.SPY_BARS.rejectedBars>=2,true);assert.equal(today.sourceStatus.LAB_TODAY_FILES.status,'EMPTY');
 const p2=await provider(t,async()=>[503,{}]);await run(w.dir,'comeback-lab.mjs',{MASSIVE_BASE:p2.base});
 assert.equal(w.json('data/comeback-today.json').sourceStatus.SPY_BARS.status,'UNAVAILABLE','a failed fetch is never shown as fresh bars');
});
