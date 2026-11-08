// Guard observations use actual jobs, not workflow creation. No market/provider calls.
import fs from 'node:fs';
import {guardDecide,nyParts,fmt} from './watcher-guard-core.mjs';
import {readGuardHistory} from './watcher-guard-history.mjs';
const env=process.env,local=u=>u&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u)?u:null;
const base=local(env.GH_BASE)||'https://api.github.com',REPO=env.GITHUB_REPOSITORY,TOKEN=env.GITHUB_TOKEN,TG=local(env.TG_BASE)||'https://api.telegram.org';
const now=()=>local(env.GH_BASE)&&env.GUARD_TEST_NOW?Date.parse(env.GUARD_TEST_NOW):Date.now();
const read=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return d;}};
if(!REPO||!TOKEN){console.log('watcher guard: no GitHub binding');process.exit(0);}
if(env.GITHUB_ACTIONS&&env.GITHUB_REF_NAME!=='main'&&!local(env.GH_BASE)){console.log('branch guard: live I/O disabled');process.exit(0);}
const n=nyParts(now());if(n.min<545||n.min>905)process.exit(0);
const headers={Authorization:'Bearer '+TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const history=await readGuardHistory({base:base+'/repos/'+REPO,headers,day:n.d,nowMs:now()});
const old=read('data/watcher-guard.json',{}),out=guardDecide(now(),history.runs,old,undefined,{historyComplete:history.complete});
out.state.history={complete:history.complete,errorCode:history.errorCode,reads:history.reads};
const persist=()=>{fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/watcher-guard.json.tmp',JSON.stringify(out.state));fs.renameSync('data/watcher-guard.json.tmp','data/watcher-guard.json');};
if(out.dispatch){persist();const attempt=out.state.attempts.at(-1);try{const r=await fetch(base+'/repos/'+REPO+'/actions/workflows/ignition.yml/dispatches',{method:'POST',headers,signal:AbortSignal.timeout(10000),body:JSON.stringify({ref:'main'})});attempt.status=r.ok?'ACCEPTED':'REJECTED';if(r.ok)out.state.dispatched.push(attempt.min);else out.alerts.push('WATCHER START REQUEST REJECTED: HTTP '+r.status+'; execution unconfirmed.');}catch{attempt.status='UNKNOWN';out.alerts.push('WATCHER START REQUEST UNKNOWN: transport outcome unavailable; execution unconfirmed.');}}
for(const text of out.alerts){console.log('[guard] '+text);if(env.TG_TOKEN&&env.TG_CHAT)try{const r=await fetch(TG+'/bot'+env.TG_TOKEN+'/sendMessage',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TG_CHAT,text})});if(!r.ok)console.log('guard notification delivery unconfirmed');}catch{console.log('guard notification delivery unconfirmed');}}
if(out.state.started!==null&&(old.d!==out.state.d||old.started===null||old.started===undefined||old.startedSource!=='github_job'||old.started!==out.state.started))fs.appendFileSync('data/watcher-starts.jsonl',JSON.stringify({d:out.state.d,started:fmt(out.state.started),runId:out.state.startedRunId,source:'github_job',marketCoverage:'UNVERIFIED',byGuard:null,guardRequestAccepted:out.state.dispatched.length>0,restartCausality:'UNVERIFIED'})+'\n');
persist();console.log('watcher guard '+fmt(n.min)+' New York: '+out.why);
