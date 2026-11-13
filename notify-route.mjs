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
// - When routing is enabled, a QUIET message is withheld from Telegram and appended to the private report. If the report root is
//   missing, inside the public checkout, not owner-only, locked, full, unsafe or the write is incomplete, the message is NOT sent:
//   deliver() returns an explicit { ok:false, routed:'unretained', reason } with no retry (routine research never falls back to a push).
// - The report store is bounded (per-day rows/bytes, total bytes, file count), single-writer (exclusive lock directory, no waiting),
//   never written under the repository working directory, and only into a regular, current-owner, mode-0600, single-link file.
import fs from 'node:fs';
import path from 'node:path';

export const NOTIFY_CLASSES = Object.freeze(['ACTION', 'PROTECT', 'PLAN', 'CRITICAL', 'REPLY', 'QUIET']);
export const QUIET_LIMITS = Object.freeze({ rowsPerDay: 500, bytesPerDay: 2 * 1024 * 1024, textBytes: 16 * 1024, totalBytes: 64 * 1024 * 1024, maxFiles: 400 });
const SENDER_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

export function routeEnabled(env = process.env) { return env.NOTIFY_ROUTE === '1'; }

// The private report root: absolute, existing directory, owner-only (no group/other bits), and outside the repository checkout.
export function quietRoot(env = process.env, cwd = process.cwd()) {
  const raw = env.NOTIFY_REPORT_ROOT;
  if (typeof raw !== 'string' || !path.isAbsolute(raw)) return { root: null, reason: 'ROOT_UNSET_OR_RELATIVE' };
  let real, repo;
  try { real = fs.realpathSync(raw); repo = fs.realpathSync(cwd); } catch { return { root: null, reason: 'ROOT_MISSING' }; }
  const rel = path.relative(repo, real);
  const outside = rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);
  if (!outside) return { root: null, reason: 'ROOT_INSIDE_CHECKOUT' };
  let st; try { st = fs.statSync(real); } catch { return { root: null, reason: 'ROOT_MISSING' }; }
  if (!st.isDirectory()) return { root: null, reason: 'ROOT_NOT_DIRECTORY' };
  if ((st.mode & 0o077) !== 0) return { root: null, reason: 'ROOT_NOT_OWNER_ONLY' };
  return { root: real, reason: null };
}

function dayOf(now) { return new Date(now).toISOString().slice(0, 10); }

// Append one QUIET message to <root>/quiet-<UTC day>.jsonl. Returns {stored, reason}; stored is true only for a complete, durable line.
export function recordQuiet({ root, sender, text, now = Date.now(), limits = QUIET_LIMITS }) {
  if (!SENDER_ID.test(String(sender || ''))) return { stored: false, reason: 'BAD_SENDER_ID' };
  const t = String(text ?? ''), tb = Buffer.from(t);
  if (tb.length > limits.textBytes) return { stored: false, reason: 'TEXT_TOO_LARGE' };   // never truncated and called retained
  const lock = path.join(root, '.quiet.lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); } catch { return { stored: false, reason: 'STORE_LOCKED' }; }   // single writer; no waiting
  let fd, created = false;
  try {
    let total = 0, files = 0;
    for (const n of fs.readdirSync(root)) if (/^quiet-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)) { files++; try { total += fs.lstatSync(path.join(root, n)).size; } catch {} }
    const file = path.join(root, 'quiet-' + dayOf(now) + '.jsonl');
    const line = Buffer.from(JSON.stringify({ v: 1, at: new Date(now).toISOString(), sender, cls: 'QUIET', text: t }) + '\n');
    try { fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') return { stored: false, reason: 'STORE_UNREADABLE' }; created = true; }
    if (created && files + 1 > limits.maxFiles) return { stored: false, reason: 'STORE_FULL' };
    fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
    const st = fs.fstatSync(fd);
    if (!st.isFile() || (typeof process.getuid === 'function' && st.uid !== process.getuid()) || (st.mode & 0o777) !== 0o600 || st.nlink !== 1) return { stored: false, reason: 'STORE_UNSAFE_FILE' };
    if (st.size > limits.bytesPerDay) return { stored: false, reason: 'STORE_FULL' };
    const cur = Buffer.alloc(st.size); let off = 0; while (off < st.size) { const n = fs.readSync(fd, cur, off, st.size - off, off); if (!n) break; off += n; }
    if (off !== st.size) return { stored: false, reason: 'STORE_UNREADABLE' };
    if (st.size && cur[st.size - 1] !== 10) return { stored: false, reason: 'STORE_UNTERMINATED' };
    let rows = 0; for (const c of cur) if (c === 10) rows++;
    if (rows + 1 > limits.rowsPerDay || st.size + line.length > limits.bytesPerDay || total + line.length > limits.totalBytes) return { stored: false, reason: 'STORE_FULL' };
    let w = 0; while (w < line.length) { const n = fs.writeSync(fd, line, w, line.length - w); if (!(n > 0)) return { stored: false, reason: 'STORE_WRITE_PARTIAL' }; w += n; }
    fs.fsyncSync(fd);
    if (created) { const d = fs.openSync(root, 'r'); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } }   // the new directory entry is durable too
    return { stored: true, reason: null };
  } catch { return { stored: false, reason: 'STORE_WRITE_FAILED' }; }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} try { fs.rmdirSync(lock); } catch {} }
}

// deliver(): the single decision point used by every labelled caller.
// send: the caller's own existing sender (unchanged). Returns whatever send() returns, or
// { ok: true, routed: 'report', sender } when a QUIET message was durably stored instead.
export async function deliver({ cls, sender, text, send, ownerOptIn = false, env = process.env, now = Date.now(), cwd = process.cwd(), log = console.log }) {
  if (!NOTIFY_CLASSES.includes(cls)) throw Error('notify-route: unknown class ' + cls);
  if (typeof send !== 'function') throw Error('notify-route: send must be a function');
  if (cls !== 'QUIET' || ownerOptIn === true || !routeEnabled(env)) return send();
  const { root, reason } = quietRoot(env, cwd);
  if (!root) { log('notify-route: ' + sender + ' QUIET UNRETAINED, not sent (' + reason + ')'); return { ok: false, routed: 'unretained', sender, reason }; }
  const r = recordQuiet({ root, sender, text, now });
  if (!r.stored) { log('notify-route: ' + sender + ' QUIET UNRETAINED, not sent (' + r.reason + ')'); return { ok: false, routed: 'unretained', sender, reason: r.reason }; }
  log('notify-route: ' + sender + ' QUIET stored in the private report');
  return { ok: true, routed: 'report', sender };
}

// The owner's explicit 'quiet off' (settings.quiet === false) is an opt-in to research messages; a missing setting is not.
export function ownerQuietOff(file = 'data/settings.json') { try { return JSON.parse(fs.readFileSync(file, 'utf8')).quiet === false; } catch { return false; } }
