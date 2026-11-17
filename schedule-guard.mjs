// SCHEDULE GUARD runner (decision in schedule-guard-core.mjs). Called every 5 minutes by the bot job (bot.yml), next to the watcher
// guard. Reads GitHub's recent run list with the job's own token, starts owner-facing jobs GitHub has not started, writes
// data/schedule-guard.json (the workflows' "slot" job reads its heartbeat to skip GitHub's late duplicates). Never places an order.
import fs from 'node:fs';
import { scheduleDecide, MANAGED } from './schedule-guard-core.mjs';
const env = process.env, REPO = env.GITHUB_REPOSITORY, TOKEN = env.GITHUB_TOKEN, API = (env.GH_API || 'https://api.github.com') + '/repos/' + REPO + '/actions';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
if (!REPO || !TOKEN) { console.log('schedule guard: no GITHUB_TOKEN / GITHUB_REPOSITORY (only runs inside GitHub Actions)'); process.exit(0); }
const H = { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
const runs = [];
for (const wf of MANAGED) {
  const r = await fetch(API + '/workflows/' + wf + '/runs?per_page=15', H).catch(e => ({ ok: false, status: e.message }));
  if (!r.ok) { console.log('schedule guard: run list for ' + wf + ' failed (' + r.status + '); nothing started'); process.exit(0); }
  for (const x of (await r.json()).workflow_runs || []) runs.push({ path: x.path, event: x.event, status: x.status, created_at: x.created_at, run_started_at: x.run_started_at });
}
const S0 = readJson('data/schedule-guard.json', {}), sig = readJson('data/signals.json', {}) || {};
const out = scheduleDecide(Date.now(), runs, sig.session || '', S0);
const log = [];
for (const d of out.dispatch) {
  const res = await fetch(API + '/workflows/' + d.wf + '/dispatches', { method: 'POST', ...H, body: JSON.stringify({ ref: 'main', inputs: d.inputs }) }).catch(e => ({ ok: false, status: e.message }));
  log.push((res.ok ? 'started ' : 'COULD NOT START ') + d.wf + ' (' + d.why + ')' + (res.ok ? '' : ' HTTP ' + res.status));
  if (!res.ok) { const k = 'fail:' + d.wf; if (!out.state[k]) { out.state[k] = 1; out.alerts.push('SCHEDULER could not start ' + d.wf + ' (GitHub answered ' + res.status + '). Send this to Claude.'); } }
}
for (const a of out.alerts) if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: a }) }).catch(() => {});
// heartbeat at most every 30 minutes (each write is a commit); a decision change is always written
const changed = JSON.stringify({ ...out.state, beat: 0 }) !== JSON.stringify({ ...S0, beat: 0 });
if (changed || !S0.beat || Date.now() - S0.beat >= 30 * 60000) fs.writeFileSync('data/schedule-guard.json', JSON.stringify(out.state));
console.log('schedule guard: ' + (log.length ? log.join('; ') : 'nothing to start'));
