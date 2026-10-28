// WATCHER GUARD runner (decision in watcher-guard-core.mjs). Called every 5 minutes by the bot job (bot.yml). Reads GitHub's run list
// for ignition.yml with the job's own token, starts the watcher when it is missing, writes data/watcher-guard.json and appends each
// day's measured start to data/watcher-starts.jsonl. Read-only on the market; never places an order.
import fs from 'node:fs';
import { guardDecide, nyParts, fmt } from './watcher-guard-core.mjs';
const env = process.env, REPO = env.GITHUB_REPOSITORY, TOKEN = env.GITHUB_TOKEN, API = 'https://api.github.com/repos/' + REPO + '/actions/workflows/ignition.yml';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
if (!REPO || !TOKEN) { console.log('watcher guard: no GITHUB_TOKEN / GITHUB_REPOSITORY (only runs inside GitHub Actions)'); process.exit(0); }
const n = nyParts(Date.now()); if (n.min < 545 || n.min > 900) process.exit(0);   // nothing to do outside 9:05-15:00 New York: no GitHub call
const H = { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
const r = await fetch(API + '/runs?per_page=10', H).catch(e => ({ ok: false, status: e.message }));
if (!r.ok) { console.log('watcher guard: run list failed (' + r.status + ')'); process.exit(0); }
const runs = (await r.json()).workflow_runs || [], S0 = readJson('data/watcher-guard.json', {}), out = guardDecide(Date.now(), runs, S0);
if (out.dispatch) { const d = await fetch(API + '/dispatches', { method: 'POST', ...H, body: JSON.stringify({ ref: 'main' }) }).catch(e => ({ ok: false, status: e.message }));
  if (!d.ok) out.alerts.push('WATCHER GUARD could not start the watcher (GitHub answered ' + d.status + '). The bot job may lack the actions: write permission. Send this to Claude.'); }
for (const a of out.alerts) if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: a }) }).catch(() => {}); else console.log('[guard] ' + a);
if (out.state.started !== null && (S0.d !== out.state.d || S0.started === null || S0.started === undefined))   // first sighting of today's run: one line a day
  fs.appendFileSync('data/watcher-starts.jsonl', JSON.stringify({ d: out.state.d, started: fmt(out.state.started), byGuard: out.state.dispatched.length > 0, dispatched: out.state.dispatched.map(fmt) }) + '\n');
fs.writeFileSync('data/watcher-guard.json', JSON.stringify(out.state));
console.log('watcher guard ' + fmt(n.min) + ' New York: ' + out.why + (out.dispatch ? ' -> started the watcher' : ''));
