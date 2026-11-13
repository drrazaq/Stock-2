// WATCHER RESERVATION ROUTE (P0, Codex 6854715808 (2), development source preparation; nothing activated).
// Watcher message reservations (data/watcher-message-state/DAY/sha256(key).json) reveal which holdings received stop messages, so once the
// two-pass private mode is live (.github/private-data-mode) they are published ONLY to the EXISTING private data repository, through the
// unchanged compare-and-publish (watcher-message-publish.mjs: same keys, same CAS, same SENT/UNKNOWN/no-replay states), run inside the
// private clone that private-data.sh pulled and bound. Requirements, all checked at every publication:
//   - the clone's origin is exactly the declared private repository (no other remote, never the public one);
//   - this job holds the custody admission receipt written by watcher-custody.mjs admit (the private namespace already holds every
//     public reservation with no state regression, and the old public writer is quiescent), so a blank private namespace never replays a
//     delivered or uncertain message.
// Otherwise the result is { ok:false, reason:'PRIVATE_RESERVATION_UNAVAILABLE' }: the caller's existing semantics then withhold the send.
// There is NO public-write fallback in private mode. Before cutover (no mode file) the route is the existing public publisher, unchanged.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { publishWatcherReservation } from './watcher-message-publish.mjs';
import { PRIVATE_REPO_URL, privateCloneDir, custodyReceipt, privateGitEnv } from './private-repo-binding.mjs';
export { PRIVATE_REPO_URL, privateCloneDir, custodyReceipt, privateGitEnv };
export function reservationPersist({ env = process.env, root = process.cwd(), publish = publishWatcherReservation, git = execFileSync } = {}) {
  if (!fs.existsSync(path.join(root, '.github/private-data-mode'))) return (file, opts) => publish(file, opts);   // pre-cutover: unchanged
  const dir = privateCloneDir(env), url = PRIVATE_REPO_URL(env), auth = privateGitEnv(env);
  const authedGit = (cmd, args, o = {}) => git(cmd, args, { ...o, env: { ...(o.env || process.env), ...auth } });
  return (file, opts = {}) => {
    try {
      const r = JSON.parse(fs.readFileSync(custodyReceipt(env), 'utf8'));
      if (!r || r.status !== 'ADMITTED' || r.url !== url) return { ok: false, reason: 'PRIVATE_RESERVATION_UNAVAILABLE' };
      if (String(git('git', ['remote', 'get-url', 'origin'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim() !== url) return { ok: false, reason: 'PRIVATE_RESERVATION_UNAVAILABLE' };
    } catch { return { ok: false, reason: 'PRIVATE_RESERVATION_UNAVAILABLE' }; }
    return publish(file, { ...opts, cwd: dir, git: authedGit });
  };
}
