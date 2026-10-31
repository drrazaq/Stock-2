// Full production watcher, synthetic local SEC/market services; no credentials/messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import {spawn,execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),source=process.env.SEC_REQUEST_WATCHER_SRC||path.join(root,'ignition-watch.mjs');
const day='2026-10-30',epoch=Date.parse(day+'T13:30:00Z');
async function run(t,scenario){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sec-request-watcher-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const file of fs.readdirSync(root).filter(p=>p.endsWith('.mjs')))fs.copyFileSync(path.join(root,file),path.join(dir,file));fs.copyFileSync(source,path.join(dir,'ignition-watch.mjs'));fs.mkdirSync(path.join(dir,'data'));
 execFileSync('git',['init','-q'],{cwd:dir,stdio:'ignore'});execFileSync('git',['-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','--allow-empty','-qm','synthetic fixture'],{cwd:dir,stdio:'ignore'});
 const calls=[],sockets=new Set();const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');calls.push(u.pathname);res.setHeader('Content-Type','application/json');
  if(u.pathname.includes('/snapshot/'))return res.end(JSON.stringify({tickers:[{ticker:'ZZQ',lastTrade:{p:10,t:epoch*1e6},lastQuote:{p:9.99,P:10.01,t:epoch*1e6},prevDay:{c:10,v:1e6},min:{c:10,t:epoch,av:1e6},day:{c:10,o:10,v:1e6}}]}));
  if(u.pathname==='/files/company_tickers.json'){if(scenario==='map-timeout')return;if(scenario==='map-error'){res.statusCode=503;return res.end('{}');}if(scenario==='map-network'){res.destroy();return;}return res.end(JSON.stringify({one:{ticker:'ZZQ',cik_str:1}}));}
  if(u.pathname==='/submissions/CIK0000000001.json'){if(scenario==='sub-timeout')return;if(scenario==='sub-body-timeout'){res.writeHead(200);res.write('{');return;}if(scenario==='sub-error'){res.statusCode=429;return res.end('{}');}if(scenario==='sub-malformed')return res.end('{}');return res.end(JSON.stringify({cik:1,filings:{recent:{form:['8-K'],filingDate:[day],items:['1.01'],accessionNumber:['0000000001-26-000001'],acceptanceDateTime:[day+'T13:29:00Z'],primaryDocument:['synthetic.htm']}}}));}
  if(u.pathname==='/cgi-bin/browse-edgar'){if(scenario==='atom-timeout')return;if(scenario==='atom-error'){res.statusCode=503;return res.end('{}');}res.setHeader('Content-Type','application/atom+xml');return res.end('<feed><entry><title>8-K - SYNTHETIC (0000000001) (Filer)</title><summary>Item 1.01</summary><updated>'+day+'T13:29:00Z</updated><id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id></entry></feed>');}
  res.statusCode=404;res.end('{}');
 });server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{for(const s of sockets)s.destroy();server.close();});
 const base='http://127.0.0.1:'+server.address().port,preload=path.join(dir,'local-only.mjs');fs.writeFileSync(preload,`const D=Date,start=D.now(),at=${epoch};globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[at+D.now()-start]));}static now(){return at+D.now()-start;}};const f=fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith(${JSON.stringify(base+'/')}))throw Error('NO_EXTERNAL_ACCESS');return f(u,o);};`);
 const begin=Date.now(),child=spawn(process.execPath,['--import',preload,'ignition-watch.mjs'],{cwd:dir,env:{PATH:process.env.PATH,IG_DAY:day,IG_FAKE_MIN:'570',IG_FAKE_STEP:'400',IG_RUN_MIN:'1',IG_NO_RADAR:'1',MASSIVE_BASE:base,MASSIVE_KEY:'synthetic',SEC_BASE:base,SEC_UA:'synthetic fixture',GITHUB_RUN_ID:'synthetic-'+scenario,GITHUB_RUN_ATTEMPT:'1'},stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);const timer=setTimeout(()=>child.kill('SIGKILL'),35000);const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});clearTimeout(timer);assert.equal(code,0,output);
 const archive=JSON.parse(fs.readFileSync(path.join(dir,'data/ignition-live.json'))),names=fs.readdirSync(path.join(dir,'data/ignition-runs',day));assert.equal(archive.heartbeat.length,1);assert.ok(names.some(p=>p.endsWith('.shadow.jsonl.gz')));const shadow=zlib.gunzipSync(fs.readFileSync(path.join(dir,'data/ignition-runs',day,names.find(p=>p.endsWith('.shadow.jsonl.gz'))))).toString().trim().split('\n').filter(Boolean).map(JSON.parse);
 assert.equal(calls.some(p=>/sendMessage|orders/.test(p)),false);assert.equal(archive.alerts,0);
 return {calls,archive,shadow,ms:Date.now()-begin,output};
}
for(const scenario of ['success','map-error','map-network','sub-error','sub-malformed','map-timeout','sub-timeout','sub-body-timeout','atom-error','atom-timeout'])test('actual watcher SEC map/submissions/EDGAR: '+scenario,async t=>{
 const r=await run(t,scenario),count=p=>r.calls.filter(x=>x===p).length;
 assert.equal(count('/files/company_tickers.json'),1,'ticker lookup must reach the working local SEC service');
 if(scenario.startsWith('map-')){assert.equal(count('/cgi-bin/browse-edgar'),0);assert.equal(count('/submissions/CIK0000000001.json'),0);}
 else{assert.equal(count('/cgi-bin/browse-edgar'),2);if(!scenario.startsWith('atom-')){assert.equal(count('/submissions/CIK0000000001.json'),1);const f=r.shadow.find(x=>x.f);assert.ok(f,'actual frozen research filing retained');assert.equal(f.f.eligible,scenario==='success');}else assert.equal(count('/submissions/CIK0000000001.json'),0);}
 if(scenario.includes('timeout')){assert.ok(r.ms>=9000,'real production10second deadline exercised');assert.ok(r.ms<30000,'watcher must continue to final archive within bounded time');}
});
