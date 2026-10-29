// WATCHER GUARD runner (decision in watcher-guard-core.mjs). Called every 5 minutes by the bot job (bot.yml). Reads GitHub's run list
// for ignition.yml with the job's own token, starts the watcher when it is missing, writes data/watcher-guard.json and appends each
// day's measured start to data/watcher-starts.jsonl. Read-only on the market; never places an order.
import fs from 'node:fs';
import { guardDecide, nyParts, fmt, watcherJobEvidence } from './watcher-guard-core.mjs';
import { dispatchGuard } from './guard-dispatch.mjs';
import { sendTelegramMessage } from './telegram-delivery.mjs';
const env = process.env, REPO = env.GITHUB_REPOSITORY, TOKEN = env.GITHUB_TOKEN, API = 'https://api.github.com/repos/' + REPO + '/actions/workflows/ignition.yml';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
if (!REPO || !TOKEN) { console.log('watcher guard: no GITHUB_TOKEN / GITHUB_REPOSITORY (only runs inside GitHub Actions)'); process.exit(0); }
const n = nyParts(Date.now()); if (n.min < 545 || n.min > 900) process.exit(0);   // nothing to do outside 9:05-15:00 New York: no GitHub call
const H = { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
const r = await fetch(API + '/runs?per_page=10', H).catch(e => ({ ok: false, status: e.message }));
if (!r.ok) { console.log('watcher guard: run list failed (' + r.status + ')'); process.exit(0); }
const rawRuns = (await r.json()).workflow_runs || [], runs = [];
for (const run of rawRuns) {
  // Read the current attempt's jobs. Never substitute queue/run creation time
  // when the jobs endpoint fails or the watch job has not actually started.
  let jobs=null;
  if (/^\d+$/.test(String(run.id)) && Number.isFinite(Date.parse(run.created_at)) && nyParts(Date.parse(run.created_at)).d===n.d) {
    try {
      const jr=await fetch('https://api.github.com/repos/'+REPO+'/actions/runs/'+run.id+'/jobs?filter=latest&per_page=100',{...H,signal:AbortSignal.timeout(10000)});
      if(jr.ok) jobs=(await jr.json()).jobs;
    }catch{}
  }
  runs.push(watcherJobEvidence(run,jobs));
}
const S0 = readJson('data/watcher-guard.json', {}), out = guardDecide(Date.now(), runs, S0);
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
console.log('watcher guard ' + fmt(n.min) + ' New York: ' + out.why + (out.dispatch ? ' -> start request '+out.state.attempts.at(-1).status+'; execution unconfirmed' : ''));
