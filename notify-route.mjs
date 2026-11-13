// NOTIFICATION ROUTING (row 5 of the requirements ledger, development only, 13 Nov 2026).
// Owner policy: push only a qualified actionable BUY, an established SELL or meaningful holding change, a material change or
// expiry of an already delivered plan, a critical coverage failure, or a reply to the owner's own command. Routine research
// (leads, WAIT/NO BUY, boards, scores, study summaries, retrospective runners, engineering stories) goes to a private report.
//
// Contract:
// - Every routed call names its class explicitly at the caller. Nothing is classified from message text.
// - Default OFF: unless NOTIFY_ROUTE=1 and a private report root is configured, every message is sent exactly as before.
// - Only class QUIET is ever withheld from Telegram. ACTION, PROTECT, PLAN, CRITICAL and REPLY always go through the caller's own
//   sender, unchanged (its freshness/evidence checks and UNKNOWN handling stay with that sender; this module never retries).
// - The owner's explicit opt-in wins: a caller passes ownerOptIn=true when the owner himself asked for these messages (for example
//   'quiet off' or an explicit 'alerts all'); a default or missing setting is not an opt-in.
// - A QUIET message is withheld only after it is durably stored in the private report root. If the root is missing, inside the
//   public checkout, not owner-only, or full, the message is SENT instead (today's behaviour): nothing is silently dropped.
// - The report store is bounded (per-day row and byte caps) and never written under the repository working directory.
import fs from 'node:fs';
import path from 'node:path';

export const NOTIFY_CLASSES = Object.freeze(['ACTION', 'PROTECT', 'PLAN', 'CRITICAL', 'REPLY', 'QUIET']);
export const QUIET_LIMITS = Object.freeze({ rowsPerDay: 500, bytesPerDay: 2 * 1024 * 1024, textBytes: 16 * 1024 });
const SENDER_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

export function routeEnabled(env = process.env) { return env.NOTIFY_ROUTE === '1'; }

// The private report root: absolute, existing directory, owner-only (no group/other bits), and outside the repository checkout.
export function quietRoot(env = process.env, cwd = process.cwd()) {
  const raw = env.NOTIFY_REPORT_ROOT;
  if (typeof raw !== 'string' || !path.isAbsolute(raw)) return { root: null, reason: 'ROOT_UNSET_OR_RELATIVE' };
  let real, repo;
  try { real = fs.realpathSync(raw); repo = fs.realpathSync(cwd); } catch { return { root: null, reason: 'ROOT_MISSING' }; }
  const rel = path.relative(repo, real);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return { root: null, reason: 'ROOT_INSIDE_CHECKOUT' };
  let st; try { st = fs.statSync(real); } catch { return { root: null, reason: 'ROOT_MISSING' }; }
  if (!st.isDirectory()) return { root: null, reason: 'ROOT_NOT_DIRECTORY' };
  if ((st.mode & 0o077) !== 0) return { root: null, reason: 'ROOT_NOT_OWNER_ONLY' };
  return { root: real, reason: null };
}

function dayOf(now) { return new Date(now).toISOString().slice(0, 10); }

// Append one QUIET message to <root>/quiet-<UTC day>.jsonl (O_APPEND, 0600, fsync). Returns {stored, reason}.
export function recordQuiet({ root, sender, text, now = Date.now(), limits = QUIET_LIMITS }) {
  if (!SENDER_ID.test(String(sender || ''))) return { stored: false, reason: 'BAD_SENDER_ID' };
  const file = path.join(root, 'quiet-' + dayOf(now) + '.jsonl');
  let rows = 0, bytes = 0;
  try { const b = fs.readFileSync(file); bytes = b.length; for (const c of b) if (c === 10) rows++; } catch (e) { if (e.code !== 'ENOENT') return { stored: false, reason: 'STORE_UNREADABLE' }; }
  const t = String(text ?? ''), tb = Buffer.from(t);
  const kept = tb.length > limits.textBytes ? tb.subarray(0, limits.textBytes).toString('utf8') : t;
  const line = Buffer.from(JSON.stringify({ v: 1, at: new Date(now).toISOString(), sender, cls: 'QUIET', truncated: tb.length > limits.textBytes, text: kept }) + '\n');
  if (rows + 1 > limits.rowsPerDay || bytes + line.length > limits.bytesPerDay) return { stored: false, reason: 'STORE_FULL' };
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeSync(fd, line); fs.fsyncSync(fd);
  } catch { return { stored: false, reason: 'STORE_WRITE_FAILED' }; }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  return { stored: true, reason: null };
}

// deliver(): the single decision point used by every labelled caller.
// send: the caller's own existing sender (unchanged). Returns whatever send() returns, or
// { ok: true, routed: 'report', sender } when a QUIET message was durably stored instead.
export async function deliver({ cls, sender, text, send, ownerOptIn = false, env = process.env, now = Date.now(), cwd = process.cwd(), log = console.log }) {
  if (!NOTIFY_CLASSES.includes(cls)) throw Error('notify-route: unknown class ' + cls);
  if (typeof send !== 'function') throw Error('notify-route: send must be a function');
  if (cls !== 'QUIET' || ownerOptIn === true || !routeEnabled(env)) return send();
  const { root, reason } = quietRoot(env, cwd);
  if (!root) { log('notify-route: ' + sender + ' QUIET sent to Telegram (' + reason + ')'); return send(); }
  const r = recordQuiet({ root, sender, text, now });
  if (!r.stored) { log('notify-route: ' + sender + ' QUIET sent to Telegram (' + r.reason + ')'); return send(); }
  log('notify-route: ' + sender + ' QUIET stored in the private report');
  return { ok: true, routed: 'report', sender };
}

// The owner's explicit 'quiet off' (settings.quiet === false) is an opt-in to research messages; a missing setting is not.
export function ownerQuietOff(file = 'data/settings.json') { try { return JSON.parse(fs.readFileSync(file, 'utf8')).quiet === false; } catch { return false; } }
