// Synthetic actual-runner fixture. Native HTTP is redirected ONLY to the owned loopback service.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
export async function realFixture(t){
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'sip-realpath-'));const sockets=new Set();let active=null;const calls=[];
 const plan=JSON.parse(fs.readFileSync(new URL('../docs/validation/sip-access-plan.proposed.json',import.meta.url))),T=Date.parse(plan.t0),stamp=new Date(T-1000).toISOString();
 const server=http.createServer((req,res)=>{calls.push({url:req.url,method:req.method});if(active?.mode==='timeout'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{');return;}
  if(active?.mode==='transport'){res.destroy();return;}
  if(active?.status){res.statusCode=active.status;res.end('PRIVATE PROVIDER TEXT');return;}
  if(active?.mode==='bad-json'){res.end('PRIVATE malformed body');return;}
  const u=new URL(req.url,'http://localhost');let body;
  if(u.pathname.includes('/snapshots'))body={SPY:{latestQuote:{t:stamp}},AAPL:{latestQuote:{t:stamp}}};
  else if(u.pathname.includes('/quotes/latest'))body={quotes:{SPY:{t:stamp},AAPL:{t:stamp}}};
  else if(u.pathname.includes('/trades/latest'))body={trades:{SPY:{t:stamp},AAPL:{t:stamp}}};
  else if(u.pathname.endsWith('/trades'))body={trades:{AAPL:[{t:stamp}]}};
  else body={bars:{SPY:[{t:new Date(T-60000).toISOString(),v:1}],AAPL:[{t:new Date(T-60000).toISOString(),v:1}]}};
  res.setHeader('Content-Type','application/json');setTimeout(()=>res.end(JSON.stringify(body)),active?.mode==='slow'?20:0);
 });
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{for(const s of sockets)s.destroy();server.close();fs.rmSync(top,{recursive:true,force:true});});
 const root=path.join(top,'code');fs.mkdirSync(path.join(root,'tools'),{recursive:true});fs.mkdirSync(path.join(root,'docs/validation'),{recursive:true});
 const files=['sip-access-diagnostic.mjs','sip-access-result.mjs','sip-access-https.mjs','tools/run-sip-access-diagnostic.mjs','tools/validate-sip-access-result.mjs','docs/validation/sip-access-plan.proposed.json'];
 for(const f of files)fs.copyFileSync(new URL('../'+f,import.meta.url),path.join(root,f));
 const git=(...args)=>{const x=spawnSync('git',args,{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH}});if(x.status!==0)throw Error('SYNTHETIC_GIT');return x.stdout.trim();};
 git('init','-q');git('add','.');git('-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-qm','synthetic fixture');
 const source=git('rev-parse','HEAD'),hash=b=>createHash('sha256').update(b).digest('hex'),workflow=path.join(top,'workflow.yml');fs.writeFileSync(workflow,'# synthetic workflow');
 const approval={granted:true,scope:'SIP_ACCESS_SAMPLE_V1',sourceSha:source,workflowSha256:hash(fs.readFileSync(workflow)),sourceHashes:Object.fromEntries(files.slice(0,-1).map(f=>[f,hash(fs.readFileSync(path.join(root,f)))])),planSha256:hash(fs.readFileSync(path.join(root,files.at(-1)))),approvedAt:new Date(T-3600000).toISOString(),existingBindingsOnly:true,sampledResponsesOnly:true};
 const base='http://127.0.0.1:'+server.address().port;
 async function run(options={}){
  active=options;const before=calls.length,dir=fs.mkdtempSync(path.join(top,'run-')),approvalFile=path.join(dir,'approval.json'),events=path.join(dir,'events.jsonl'),preload=path.join(dir,'preload.mjs');
  fs.writeFileSync(approvalFile,JSON.stringify({...approval,...options.approval}));
  if(options.existing)fs.writeFileSync(path.join(dir,'sip-access-report.json'),'original partial');
  const opts={T,start:options.start??0,mode:options.mode||'normal',events,base};
  const script="import fs from 'node:fs';import https from 'node:https';import http from 'node:http';const o="+JSON.stringify(opts)+";const D=Date;let now=o.T+o.start;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};const timer=setTimeout;const log=x=>fs.appendFileSync(o.events,JSON.stringify(x)+'\\n');globalThis.setTimeout=(f,ms,...a)=>{const owner=(new Error().stack||'').split('\\n')[2]||'';if(o.mode==='interrupt')return timer(f,ms,...a);if(owner.includes('/tools/run-sip-access-diagnostic.mjs')&&ms<=90000){now+=o.mode==='deadline'&&ms>1000?181000:ms;return timer(f,0,...a);}if(o.mode==='timeout'&&owner.includes('/sip-access-diagnostic.mjs')&&ms===10000)return timer(()=>{now+=10000;f(...a);},20);return timer(f,ms,...a);};https.request=(url,p,callback)=>{if(new URL(url).origin!=='https://data.alpaca.markets')throw Error('NO_EXTERNAL_ACCESS');log({event:'request',at:now});return http.request(String(url).replace('https://data.alpaca.markets',o.base),p,r=>{if(o.mode==='clock')now-=1;if(o.mode==='slow')now+=2000;callback(r);});};globalThis.fetch=()=>{throw Error('NO_FETCH_OR_EXTERNAL_ACCESS');};log({event:'ready',at:now});";
  fs.writeFileSync(preload,script);
  const env={PATH:process.env.PATH,GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF_NAME:'main',GITHUB_WORKFLOW_REF:'drrazaq/Stock-2/.github/workflows/sip-access-diagnostic.yml@refs/heads/main',SIP_APPROVED_SOURCE:source,RUNNER_TEMP:dir,ALPACA_KEY:'synthetic-key',ALPACA_SECRET:'synthetic-secret',...options.env};
  const child=spawn(process.execPath,['--import',preload,'tools/run-sip-access-diagnostic.mjs','--approval',approvalFile,workflow],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);const timeout=setTimeout(()=>child.kill('SIGKILL'),15000);
  if(options.mode==='interrupt'){for(let n=0;n<200&&!fs.existsSync(events);n++)await new Promise(resolve=>setTimeout(resolve,5));await new Promise(resolve=>setTimeout(resolve,50));child.kill(options.signal||'SIGTERM');}
  const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timeout);
  const trace=fs.existsSync(events)?fs.readFileSync(events,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  return {...exit,stdout,stderr,dir,calls:calls.slice(before),trace,report:fs.existsSync(path.join(dir,'sip-access-report.json'))?fs.readFileSync(path.join(dir,'sip-access-report.json'),'utf8'):null};
 }
 return {run,T,root,source};
}
