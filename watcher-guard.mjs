// WATCHER GUARD runner (decision in watcher-guard-core.mjs). Called every 5 minutes by the bot job (bot.yml). Reads GitHub's run list
// for ignition.yml with the job's own token, starts the watcher when it is missing, writes data/watcher-guard.json and appends each
// day's measured start to data/watcher-starts.jsonl. Read-only on the market; never places an order.
import fs from 'node:fs';
import { guardDecide, nyParts, fmt, watcherJobEvidence } from './watcher-guard-core.mjs';
import { dispatchGuard } from './guard-dispatch.mjs';
import { sendTelegramMessage } from './telegram-delivery.mjs';
import {marketSession} from './market-session.mjs';
import {heartbeatHealth} from './watcher-heartbeat.mjs';
const env=process.env,local=u=>u&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u)?u:null;
const REPO=env.GITHUB_REPOSITORY,TOKEN=env.GITHUB_TOKEN,API_BASE=local(env.GH_BASE)||'https://api.github.com';
const API=API_BASE+'/repos/'+REPO+'/actions/workflows/ignition.yml',TG=local(env.TG_BASE)||'https://api.telegram.org';
const now=()=>local(env.GH_BASE)&&env.GUARD_TEST_NOW?Date.parse(env.GUARD_TEST_NOW):Date.now();
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
if (!REPO || !TOKEN) { console.log('watcher guard: no GITHUB_TOKEN / GITHUB_REPOSITORY (only runs inside GitHub Actions)'); process.exit(0); }
if(env.GITHUB_ACTIONS&&env.GITHUB_REF_NAME!=='main'&&!local(env.GH_BASE)){console.log('branch guard: live I/O disabled');process.exit(0);}
const n = nyParts(now()); const session=marketSession(n.d); if (session.closed || n.min < 545 || n.min > session.close+5) process.exit(0);   // nothing to do outside 9:05-15:00 New York: no GitHub call
const H = { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
const r = await fetch(API + '/runs?per_page=10', {...H,signal:AbortSignal.timeout(10000)}).catch(e => ({ ok: false, status: e.message }));
if (!r.ok) { console.log('watcher guard: run list failed (' + r.status + ')'); process.exit(0); }
const rawRuns = (await r.json()).workflow_runs || [], runs = [];
for (const run of rawRuns) {
  // Read the current attempt's jobs. Never substitute queue/run creation time
  // when the jobs endpoint fails or the watch job has not actually started.
  let jobs=null;
  if (/^\d+$/.test(String(run.id)) && Number.isFinite(Date.parse(run.created_at)) && nyParts(Date.parse(run.created_at)).d===n.d) {
    try {
      const jr=await fetch(API_BASE+'/repos/'+REPO+'/actions/runs/'+run.id+'/jobs?filter=latest&per_page=100',{...H,signal:AbortSignal.timeout(10000)});
      if(jr.ok) jobs=(await jr.json()).jobs;
    }catch{}
  }
  runs.push(watcherJobEvidence(run,jobs,now()));
}
const S0 = readJson('data/watcher-guard.json', {}), out = guardDecide(now(), runs, S0);
const beats=[];
for(const run of rawRuns.filter(r=>r.status==='in_progress'&&/^\d+$/.test(String(r.id)))) {
 for(const segment of ['open','close','legacy']) {
  const id=String(run.id)+'-'+(run.run_attempt||1)+(segment==='legacy'?'':'-'+segment);
  try{
   const h=await fetch(API_BASE+'/repos/'+REPO+'/contents/data/watcher-heartbeats/'+n.d+'/'+id+'.json?ref=main',{...H,signal:AbortSignal.timeout(10000)});
   if(h.ok){const body=await h.json(),beat=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
    if(beat.runId===id&&beat.day===n.d&&Number.isFinite(Date.parse(beat.lastCompletedCycle))&&Date.parse(beat.lastCompletedCycle)<=now())beats.push(beat);}
  }catch{}
 }
}
const latest=beats.sort((a,b)=>Date.parse(b.lastCompletedCycle)-Date.parse(a.lastCompletedCycle))[0]||null;
const health=heartbeatHealth(latest,{day:n.d,now:now()});
out.state.health={...health,runId:latest?.runId||null,lastCompletedCycle:latest?.lastCompletedCycle||null,lastSuccessfulCycle:latest?.lastSuccessfulCycle||null,freshPct:latest?.freshPct??null,evaluated:latest?.evaluated??null,priceAgeP95Min:latest?.priceAgeP95Min??null,errorCount:latest?.errorCount??null};
if(n.min>=565&&health.status!==S0.health?.status)out.alerts.push('WATCHER HEARTBEAT '+health.status+': last completed '+(latest?.lastCompletedCycle||'unavailable')+'; fresh prices '+(latest?.freshPct??'unknown')+'% of evaluated symbols; source errors '+(latest?.errorCount??'unknown')+'. Job status alone is not scan proof.');
const persist = state => {fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/watcher-guard.json.tmp',JSON.stringify(state));fs.renameSync('data/watcher-guard.json.tmp','data/watcher-guard.json');};
// Notifications are durable before dispatch and consumed only on Telegram ACK.
out.state.notifications=[...new Set([...(S0.d===out.state.d?S0.notifications||[]:[]),...out.alerts])];
await dispatchGuard(out,{url:API+'/dispatches',headers:H.headers,persist});
out.state.notifications=[...new Set([...out.state.notifications,...out.alerts])];
persist(out.state);
for (const a of [...out.state.notifications]) {
 const result=await sendTelegramMessage({base:TG,token:env.TG_TOKEN,chat:env.TG_CHAT,text:a});
 if(result.ok) {out.state.notifications=out.state.notifications.filter(x=>x!==a);persist(out.state);}
 else console.log('[guard, delivery unconfirmed: '+result.reason+'] '+a);
}
if (out.state.started !== null && (S0.d !== out.state.d || S0.started === null || S0.started === undefined || S0.startedSource !== 'github_job'))
  fs.appendFileSync('data/watcher-starts.jsonl', JSON.stringify({ d: out.state.d, started: fmt(out.state.started), source:'github_job', marketCoverage:'UNVERIFIED', byGuard: out.state.dispatched.length > 0, dispatched: out.state.dispatched.map(fmt) }) + '\n');
persist(out.state);
console.log('watcher guard ' + fmt(n.min) + ' New York: ' + out.why + ' | heartbeat '+health.status + (out.dispatch ? ' -> start request '+out.state.attempts.at(-1).status+'; execution unconfirmed' : ''));
