// SCANNER GUARD runner, revision 2 (decisions in scanner-guard-core.mjs). Called every 5 minutes by the bot loop (bot.yml).
// G1: state is NOT a local file saved later by the bot. It lives on its own branch (scanner-guard-state, one file scanner-guard.json)
// and every change is published by a plain (non-force) push of a child commit of the tip just read: GitHub accepts it only if the tip
// is unchanged, so the push is a compare-and-publish. A dispatch request is made only AFTER its RESERVED record is confirmed on the
// remote. If the push answer is ambiguous, the remote tip is read back: ours -> published; parent -> not published; anything else or an
// unreadable remote -> no request. A runner lost after the request leaves RESERVED on the remote, which quarantines (core G2).
// Read-only on the market; never places an order; never touches data/, owner files or Telegram offsets.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { scannerGuardDecide, reserveAttempt, finishAttempt, reserveAlert, alertOutcome, finishAlert, pendingRetries, pruneState } from './scanner-guard-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const REPO = env.GITHUB_REPOSITORY, TOKEN = env.GITHUB_TOKEN, GH = local(env.GITHUB_API_BASE) || 'https://api.github.com', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const REMOTE = env.GUARD_STATE_REMOTE || 'origin', BRANCH = 'scanner-guard-state', FILE = 'scanner-guard.json';
const clock = () => env.SG_FAKE_NOW ? Date.parse(env.SG_FAKE_NOW) : Date.now();
const log = (m) => console.log('scanner guard: ' + m);
if (!REPO || !TOKEN) { log('no GITHUB_TOKEN / GITHUB_REPOSITORY (only runs inside GitHub Actions)'); process.exit(0); }
const git = (args, input) => execFileSync('git', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_NAME: 'scanner guard', GIT_AUTHOR_EMAIL: 'scanner@users.noreply.github.com', GIT_COMMITTER_NAME: 'scanner guard', GIT_COMMITTER_EMAIL: 'scanner@users.noreply.github.com' } });

// Remote tip of the state branch: { ok, tip:null|sha } or { ok:false } when the remote cannot be read.
function remoteTip() {
  try { const out = git(['ls-remote', '--heads', REMOTE, 'refs/heads/' + BRANCH]).trim(); if (!out) return { ok: true, tip: null };
    const sha = out.split(/\s+/)[0]; return /^[0-9a-f]{40}$/.test(sha) ? { ok: true, tip: sha } : { ok: false }; } catch { return { ok: false }; }
}
function readRemote() {
  const t = remoteTip(); if (!t.ok) return { ok: false, why: 'state branch unreadable' };
  if (t.tip === null) return { ok: true, tip: null, state: null };
  try { git(['fetch', '-q', '--no-tags', REMOTE, t.tip]); const raw = git(['show', t.tip + ':' + FILE]);
    let state; try { state = JSON.parse(raw); } catch { return { ok: false, why: 'state corrupt: not JSON (original commit ' + t.tip + ' preserved)' }; }
    return { ok: true, tip: t.tip, state }; } catch { return { ok: false, why: 'state commit unreadable' }; }
}
// Compare-and-publish. Returns 'PUBLISHED' | 'CONFLICT' (definitely not ours) | 'UNKNOWN'.
function publish(state, parent, message) {
  let commit;
  try { const blob = git(['hash-object', '-w', '--stdin'], JSON.stringify(state, null, 1) + '\n').trim();
    const tree = git(['mktree'], '100644 blob ' + blob + '\t' + FILE + '\n').trim();
    commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]).trim(); } catch { return 'UNKNOWN'; }
  try { git(['push', '-q', REMOTE, commit + ':refs/heads/' + BRANCH]); } catch { /* answer lost or rejected: read back below */ }
  const t = remoteTip(); if (!t.ok) return 'UNKNOWN';
  return t.tip === commit ? 'PUBLISHED' : 'CONFLICT';
}

const H = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const wf = (f) => GH + '/repos/' + REPO + '/actions/workflows/' + f;
const runList = async (f) => { try { const r = await fetch(wf(f) + '/runs?per_page=30', { headers: H, signal: AbortSignal.timeout(15000) }); return r.status === 200 ? await r.json() : null; } catch { return null; } };
const readJsonOrNull = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

const R = readRemote();
if (!R.ok) { log(R.why + '; no decision'); process.exit(0); }
const [mainBody, botBody] = await Promise.all([runList('main.yml'), runList('bot.yml')]);
const now = clock();
const out = scannerGuardDecide({ nowMs: now, approval: readJsonOrNull('scanner-guard-approval.json'), runs: { main: mainBody, bot: botBody }, signals: readJsonOrNull('data/signals.json'),
  state: R.state, botRunId: env.GITHUB_RUN_ID || null, loopEndMs: env.BOT_LOOP_END ? +env.BOT_LOOP_END * 1000 : null });
if (!out.ok) { log(out.why.join('; ') + '; no decision'); if (!out.state) process.exit(0); }
let state = out.state, tip = R.tip, lastBody = R.state === null ? null : JSON.stringify(R.state);
// Publish only a real change (bounded commits); a no-op cycle writes nothing.
const step = (msg) => { const next = pruneState(state, clock()); if (JSON.stringify(next) === lastBody) return 'PUBLISHED';
  const r = publish(next, tip, msg); if (r === 'PUBLISHED') { tip = remoteTip().tip; lastBody = JSON.stringify(next); } return r; };

// reconciliation results (run ids) are published before anything else
if (out.state) { const r = step('scanner guard reconcile'); if (r !== 'PUBLISHED') { log('state publish ' + r + '; no dispatch or alert this cycle'); process.exit(0); } }
for (const d of (out.ok ? out.dispatches : [])) {
  reserveAttempt(state, d, clock());
  const r = step('scanner guard reserve ' + d.key);
  if (r !== 'PUBLISHED') { log('reservation ' + d.key + ' ' + r + '; NO request made'); process.exit(0); }
  let http = null;
  try { const res = await fetch(wf(d.workflow) + '/dispatches', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ ref: 'main', inputs: d.inputs }) }); http = res.status; } catch { http = null; }
  const outcome = finishAttempt(state, d.key, http, clock());
  log(d.key + ' -> ' + outcome + (http !== null ? ' (HTTP ' + http + ')' : ''));
  const p = step('scanner guard ' + outcome + ' ' + d.key);
  if (p !== 'PUBLISHED') { log('outcome not published (' + p + '); the remote keeps RESERVED, which stays quarantined'); process.exit(0); }
  if (outcome === 'REFUSED') out.alerts.push({ key: 'refused:' + d.workflow + ':' + new Date(clock()).toISOString().slice(0, 10), text: 'SCANNER GUARD could not start ' + d.workflow + ' (GitHub answered ' + http + '). Send this to Claude.' });
}
// G5: alerts are delivery records; PENDING is published before the send; UNKNOWN is never resent
for (const a of [...out.alerts, ...pendingRetries(state)]) {
  if (!(env.TG_TOKEN && env.TG_CHAT)) { log('[alert, no Telegram secrets] ' + a.text); continue; }
  if (!reserveAlert(state, a, clock())) continue;
  if (step('scanner guard alert pending ' + a.key) !== 'PUBLISHED') { log('alert intent not published; not sent'); process.exit(0); }
  let http = null, body = null;
  try { const res = await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ chat_id: env.TG_CHAT, text: a.text }) });
    http = res.status; try { body = await res.json(); } catch { body = null; } } catch { http = null; }
  finishAlert(state, a.key, alertOutcome(http, body), clock());
  if (step('scanner guard alert ' + state.alerts[a.key].status + ' ' + a.key) !== 'PUBLISHED') { log('alert outcome not published; remote keeps PENDING (never resent)'); process.exit(0); }
}
log((out.ok ? out.why : ['no dispatch decision']).join('; '));
