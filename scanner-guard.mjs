// SCANNER GUARD runner (decision in scanner-guard-core.mjs). Called every 5 minutes by the bot loop (bot.yml) after watcher-guard.mjs.
// Reads GitHub's run lists for main.yml and bot.yml with the job's own token, decides, records each dispatch in data/scanner-guard.json
// BEFORE making the request, and sends at most the alerts the decision returns. Read-only on the market; never places an order.
import fs from 'node:fs';
import { scannerGuardDecide, reserveDispatch, finishDispatch, pruneState } from './scanner-guard-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const REPO = env.GITHUB_REPOSITORY, TOKEN = env.GITHUB_TOKEN, GH = local(env.GITHUB_API_BASE) || 'https://api.github.com', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const STATE = 'data/scanner-guard.json', now = env.SG_FAKE_NOW ? Date.parse(env.SG_FAKE_NOW) : Date.now();
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
if (!REPO || !TOKEN) { console.log('scanner guard: no GITHUB_TOKEN / GITHUB_REPOSITORY (only runs inside GitHub Actions)'); process.exit(0); }
const H = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const wf = (f) => GH + '/repos/' + REPO + '/actions/workflows/' + f;
const list = async (f) => { const r = await fetch(wf(f) + '/runs?per_page=10', { headers: H, signal: AbortSignal.timeout(15000) }).catch(e => ({ ok: false, status: e.message }));
  if (!r.ok) throw Error(f + ' run list failed (' + r.status + ')'); return ((await r.json()).workflow_runs || []).map(x => ({ id: x.id, status: x.status, created_at: x.created_at, event: x.event })); };
let mainRuns, botRuns;
try { [mainRuns, botRuns] = await Promise.all([list('main.yml'), list('bot.yml')]); } catch (e) { console.log('scanner guard: ' + e.message + '; no decision'); process.exit(0); }
const S0 = readJson(STATE, {}), signals = readJson('data/signals.json', null), loopEndMs = env.BOT_LOOP_END ? +env.BOT_LOOP_END * 1000 : null;
const out = scannerGuardDecide({ nowMs: now, mainRuns, botRuns, signalsSession: signals && signals.session || null, state: S0, botRunId: env.GITHUB_RUN_ID || null, loopEndMs });
const save = (s) => { fs.writeFileSync(STATE + '.tmp', JSON.stringify(s)); fs.renameSync(STATE + '.tmp', STATE); };
for (const d of out.dispatches) {
  reserveDispatch(out.state, d, now); save(out.state);
  let http = NaN;
  try { const r = await fetch(wf(d.workflow) + '/dispatches', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ ref: 'main', inputs: d.inputs }) }); http = r.status; } catch (e) { http = NaN; }
  const outcome = finishDispatch(out.state, d, http); save(out.state);
  console.log('scanner guard: ' + d.key + ' -> ' + outcome + (Number.isFinite(http) ? ' (HTTP ' + http + ')' : ''));
  const rk = 'refused:' + d.workflow + ':' + new Date(now).toISOString().slice(0, 10);
  if (outcome === 'REFUSED' && !out.state.alerted[rk]) { out.state.alerted[rk] = now; out.alerts.push('SCANNER GUARD could not start ' + d.workflow + ' (GitHub answered ' + http + '). Send this to Claude.'); }
}
save(pruneState(out.state, now));
for (const a of out.alerts) if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ chat_id: env.TG_CHAT, text: a }) }).catch(() => {}); else console.log('[scanner guard] ' + a);
console.log('scanner guard: ' + out.why.join('; '));
