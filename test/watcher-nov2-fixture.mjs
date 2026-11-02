// Synthetic clock and loopback services. Official URLs are intercepted before any network call.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
export const defaultRoot=path.resolve(new URL('..',import.meta.url).pathname);
export async function nov2Fixture(root=process.env.NOV2_TREE||defaultRoot) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'watcher-nov2-'));
 fs.mkdirSync(path.join(dir,'data'));spawnSync('git',['init','-q'],{cwd:dir});spawnSync('git',['-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','--allow-empty','-qm','synthetic'],{cwd:dir});
 const copied=new Set();
 function copy(file){if(copied.has(file))return;copied.add(file);const source=path.join(root,file),target=path.join(dir,file),body=fs.readFileSync(source,'utf8');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);for(const m of body.matchAll(/^import(?:\s+.+?\s+from)?\s*['"](\.[^'"]+\.mjs)['"]/gm))copy(path.normalize(path.join(path.dirname(file),m[1])));}
 for(const f of ['ignition-watch.mjs','watcher-guard.mjs','opportunity-radar.mjs'])copy(f);
 for(const f of ['index.html','market-session.mjs'])if(fs.existsSync(path.join(root,f)))fs.copyFileSync(path.join(root,f),path.join(dir,f));
 const state={providerRequests:0,requests:[],messages:[],runs:[],jobs:{},dispatches:0,slowMs:0,failHistory:false};
 const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{
  const u=new URL(req.url,'http://local'),at=Number(req.headers['x-synthetic-now']),now=Number.isFinite(at)?at:Date.now();state.requests.push({path:u.pathname,at:now});res.setHeader('content-type','application/json');let out={};
  if(u.pathname.includes('/actions/workflows/ignition.yml/runs')){if(state.failHistory){res.statusCode=503;out={};}else out={total_count:state.runs.length,workflow_runs:state.runs};}
  else if(/\/actions\/runs\/\d+\/jobs$/.test(u.pathname)){const id=u.pathname.split('/').at(-2);out={total_count:(state.jobs[id]||[]).length,jobs:state.jobs[id]||[]};}
  else if(u.pathname.endsWith('/dispatches')){state.dispatches++;res.statusCode=204;res.end();return;}
  else if(u.pathname.includes('/sendMessage')){state.messages.push(JSON.parse(body).text);out={ok:true,result:{message_id:state.messages.length}};}
  else if(u.pathname.includes('/snapshot/locale/')){state.providerRequests++;res.setHeader('x-synthetic-delay',String(state.slowMs));out={tickers:[{ticker:'ZZQ',lastTrade:{p:10,t:now*1e6},prevDay:{c:10,v:1e6},min:{av:1e6,t:now},day:{o:10,c:10,v:1e6}}]};}
  else if(u.pathname.includes('/v2/stocks/snapshots')){state.providerRequests++;out={ZZQ:{latestTrade:{p:10,t:new Date(now).toISOString()},latestQuote:{bp:9.99,ap:10.01,t:new Date(now).toISOString()},prevDailyBar:{c:10,v:1e6},dailyBar:{o:10,c:10,v:1e6,t:new Date(now).toISOString()},minuteBar:{c:10,v:100,t:new Date(now).toISOString()}}};}
  else if(u.pathname.includes('/cgi-bin/browse-edgar')){state.providerRequests++;res.setHeader('content-type','application/atom+xml');res.end('<feed xmlns="http://www.w3.org/2005/Atom"></feed>');return;}
  else if(u.pathname.includes('/company_tickers.json')){state.providerRequests++;out={};}
  else if(u.pathname.includes('/screener/')){state.providerRequests++;out={gainers:[]};}
  else if(u.pathname.includes('/v2/aggs/')){state.providerRequests++;out={results:[]};}
  else {state.providerRequests++;out={};}
  res.end(JSON.stringify(out));
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const preload=path.join(dir,'synthetic-clock.mjs');
 fs.writeFileSync(preload,`import fs from 'node:fs';const D=Date,realSetTimeout=setTimeout;let at=Date.parse(process.env.SYNTHETIC_START);const began=at,waits=[];globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[at]));}static now(){return at;}};globalThis.setTimeout=(fn,ms,...a)=>{const stack=new Error().stack||'';if(stack.includes('ignition-watch.mjs')&&(stack.includes('at sleep')||ms===20000)){waits.push({at,ms});at+=ms;return realSetTimeout(fn,0,...a);}return realSetTimeout(fn,ms,...a);};const originalFetch=fetch;globalThis.fetch=async(u,o={})=>{const url=new URL(String(u)),allowed=['api.massive.com','data.alpaca.markets','www.sec.gov','data.sec.gov','api.telegram.org','api.github.com','finnhub.io'];if(!allowed.includes(url.hostname))throw Error('SYNTHETIC_EXTERNAL_REQUEST_BLOCKED');const r=await originalFetch(${JSON.stringify(base)}+url.pathname+url.search,{...o,headers:{...Object.fromEntries(new Headers(o.headers).entries()),'x-synthetic-now':String(at)}});at+=Number(r.headers.get('x-synthetic-delay')||0);return r;};process.on('exit',()=>fs.writeFileSync(process.env.SYNTHETIC_TRACE,JSON.stringify({began,ended:at,waits})));`);
 async function run(script,{start='2026-11-02T14:10:00Z',id='101',event='workflow_dispatch',schedule='',...extra}={}){
  const trace=path.join(dir,'trace-'+id+'.json');
  const child=spawn(process.execPath,['--import',preload,path.join(dir,script)],{cwd:dir,env:{PATH:process.env.PATH,NODE_OPTIONS:'',SYNTHETIC_START:start,SYNTHETIC_TRACE:trace,GITHUB_EVENT_NAME:event,IG_SCHEDULE:schedule,GITHUB_RUN_ID:id,GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'synthetic-source',GITHUB_REPOSITORY:'synthetic/repository',GITHUB_TOKEN:'synthetic-token',GITHUB_REF_NAME:'main',MASSIVE_KEY:'synthetic-key',ALPACA_KEY:'synthetic-key',ALPACA_SECRET:'synthetic-key',IG_NO_RADAR:'1',IG_WINDOW_END:'900',TG_TOKEN:'synthetic-token',TG_CHAT:'42',...extra},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);const timer=setTimeout(()=>child.kill('SIGKILL'),30000);let code;try{[code]=await once(child,'close');}finally{clearTimeout(timer);}return {code,output,trace:fs.existsSync(trace)?JSON.parse(fs.readFileSync(trace)):null};
 }
 async function workflow(options={}){
  const jobStart=options.start||'2026-11-02T14:10:00Z';const cacheMinutes=options.cacheMinutes||0;options={...options,start:new Date(Date.parse(jobStart)+(options.setupMinutes||0)*60000).toISOString()};
  const yaml=fs.readFileSync(path.join(root,'.github/workflows/ignition.yml'),'utf8');
  if(['CURRENT_CRON','OPPOSITE_CRON'].includes(options.schedule)){const pair=[...yaml.matchAll(/cron: '([^']+)'/g)].map(x=>x[1]);const offset=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(Date.parse(options.start)).find(x=>x.type==='timeZoneName').value;const i=offset==='GMT-4'?0:1;options={...options,schedule:pair[options.schedule==='CURRENT_CRON'?i:1-i]};}
  const output=path.join(dir,'admission-'+(options.id||'101')+'.txt');
  if(yaml.includes('run: node watcher-schedule.mjs')){copy('watcher-schedule.mjs');const gate=await run('watcher-schedule.mjs',{...options,GITHUB_OUTPUT:output});if(gate.code!==0||!fs.readFileSync(output,'utf8').includes('run=true'))return {...gate,skipped:true,skippedAt:'initial-admission'};}
  if(yaml.includes('name: Ignore opposite DST schedule')) {
   const at=Date.parse(options.start||'2026-11-02T14:10:00Z'),parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(at),offset=parts.find(x=>x.type==='timeZoneName').value==='GMT-4'?'-0400':'-0500';
   const bin=path.join(dir,'clock-bin');fs.mkdirSync(bin,{recursive:true});fs.writeFileSync(path.join(bin,'date'),'#!/bin/sh\necho '+offset+'\n',{mode:0o755});
   const block=yaml.slice(yaml.indexOf('name: Ignore opposite DST schedule')).match(/run: \|\n((?:          .*\n)+)/)?.[1];if(!block)throw Error('actual season step unavailable');
   const result=spawnSync('bash',['-c',block.split('\n').map(l=>l.replace(/^          /,'')).join('\n')],{cwd:dir,env:{PATH:bin+path.delimiter+process.env.PATH,GITHUB_EVENT_NAME:options.event||'workflow_dispatch',SCHEDULE:options.schedule||'',GITHUB_OUTPUT:output},encoding:'utf8'});
   if(result.status!==0)throw Error(result.stderr);if(!fs.readFileSync(output,'utf8').includes('run=true'))return {code:0,output:result.stdout+'OPPOSITE_DST_CRON',skipped:true};
  }
  const afterCache={...options,start:new Date(Date.parse(options.start)+cacheMinutes*60000).toISOString()};
  if(yaml.includes('name: Recheck watcher admission after cache')) {
   const tail=yaml.slice(yaml.indexOf('name: Observe configured session'));
   if(!tail.includes("if: steps.ready.outputs.run == 'true'")||tail.includes("steps.admission.outputs.run"))throw Error('POST_CACHE_ADMISSION_NOT_ENFORCED');
   const latest=path.join(dir,'ready-'+(options.id||'101')+'.txt'),gate=await run('watcher-schedule.mjs',{...afterCache,GITHUB_OUTPUT:latest});
   if(gate.code!==0||!fs.readFileSync(latest,'utf8').includes('run=true'))return {...gate,skipped:true,skippedAt:'post-cache-admission'};
  }
  const result=await run('ignition-watch.mjs',afterCache);return {...result,skipped:/watcher admission: (?:OPPOSITE_DST_CRON|TOO_EARLY_FOR_BOUNDED_JOB|CONFIGURED_WINDOW_ENDED)/.test(result.output)};
 }
 const expectedLastMinute=fs.readFileSync(path.join(root,'ignition-watch.mjs'),'utf8').includes('m===SEGMENT_END && SEGMENT_END<SESSION.close')?899:900;
 return {dir,root,state,run,workflow,expectedLastMinute,read:file=>JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')),write:(file,data)=>{const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(data));},close:()=>{server.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
