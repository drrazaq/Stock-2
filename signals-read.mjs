// P0 Route A (development): the nightly scan splits its output in two. data/signals.json is PUBLIC and independent of the owner's private
// state; data/signals-private.json (listed in .github/private-files.txt) carries the owner-derived fields below, written first and paired
// to the same scan by session + generatedAt. Every reader that needs those fields goes through hydrateSignals/readSignals.
// - paired private record: its fields are merged in;
// - public copies of private fields (legacy or not) are stripped and never current; both pair clocks must be non-empty strings;
//   a malformed private field makes the whole record unavailable;
// - missing, unreadable or unpaired private record: posVerdictUnavailable=true and the private fields are ABSENT (never guessed, never
//   taken from an older record), so holding decisions report UNKNOWN and no buy is offered from a private-only list.
import fs from 'node:fs';
export const SIGNALS_PRIVATE_FILE = 'data/signals-private.json';
export const SIGNALS_PRIVATE_FIELDS = Object.freeze(['posVerdict', 'tipBoard', 'leaders', 'pead', 'evt', 'peadFunnel']);
const object = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const SIGNALS_PRIVATE_LIMITS = Object.freeze({ fileBytes: 8 * 1024 * 1024, listRows: 5000, reasonChars: 400, verdicts: 2000 });
const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/, SESSION = /^\d{4}-\d{2}-\d{2}$/, STAMP = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
// Exact calendar round-trip (Date.parse would normalise an impossible 2026-02-30 to March 2).
const validSession = (x) => typeof x === 'string' && SESSION.test(x) && (() => { const d = new Date(x + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === x; })();
// Current pairing needs a ZONED date-time; a date-only stamp can only ever be historical/unknown.
const ZONED = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const validZoned = (x) => typeof x === 'string' && ZONED.test(x) && validSession(x.slice(0, 10)) && Number.isFinite(Date.parse(x));
const validStamp = (x) => typeof x === 'string' && STAMP.test(x) && validSession(x.slice(0, 10)) && Number.isFinite(Date.parse(x));
const reason = (x, L) => typeof x === 'string' && x.trim().length > 0 && x.length <= L.reasonChars;
// posVerdict: { SYMBOL: non-empty bounded reason string }; a non-string value would otherwise become a fabricated '[object Object]' SELL.
const verdictMap = (m, L) => object(m) && Object.keys(m).length <= L.verdicts && Object.entries(m).every(([k, v]) => SYM.test(k) && reason(v, L));
const rows = (a, L) => Array.isArray(a) && a.length <= L.listRows && a.every(r => object(r) && typeof r.sym === 'string' && SYM.test(r.sym));
const FIELD_OK = { posVerdict: verdictMap, tipBoard: (x) => object(x), peadFunnel: (x) => object(x), leaders: rows, pead: rows, evt: rows };
const defaultReadPrivate = () => { const st = fs.statSync(SIGNALS_PRIVATE_FILE); if (!st.isFile() || st.size > SIGNALS_PRIVATE_LIMITS.fileBytes) throw Error('PRIVATE_RECORD_UNSAFE_SIZE'); return JSON.parse(fs.readFileSync(SIGNALS_PRIVATE_FILE, 'utf8')); };
// Two-pass scan: the private pass's full scan output is kept privately as data/private-signals.json. When it belongs to the same scan as
// the public file (same session + zoned generatedAt), owner readers use it as the base (it includes privately scanned names), never public.
export const SIGNALS_PRIVATE_FULL_FILE = 'data/private-signals.json';
const defaultReadFull = () => { const st = fs.statSync(SIGNALS_PRIVATE_FULL_FILE); if (!st.isFile() || st.size > 64 * 1024 * 1024) throw Error('PRIVATE_FULL_UNSAFE_SIZE'); return JSON.parse(fs.readFileSync(SIGNALS_PRIVATE_FULL_FILE, 'utf8')); };
export function hydrateSignals(sig, readPrivate = defaultReadPrivate, L = SIGNALS_PRIVATE_LIMITS, readFull = defaultReadFull) {
  if (!object(sig)) return sig;
  { let full = null; try { full = readFull(); } catch {}
    if (object(full) && validSession(sig.session) && validZoned(sig.generatedAt) && full.session === sig.session && full.generatedAt === sig.generatedAt) sig = full; }
  // Every private-only field is stripped from the public input first: a public copy (legacy or not) is never current private evidence.
  const base = { ...sig }; for (const k of SIGNALS_PRIVATE_FIELDS) delete base[k];
  let pv = null; try { pv = readPrivate(); } catch {}
  const paired = object(pv) && pv.v === 1 && validSession(sig.session) && validZoned(sig.generatedAt) && pv.session === sig.session && pv.generatedAt === sig.generatedAt;
  const valid = paired && verdictMap(pv.posVerdict, L) && SIGNALS_PRIVATE_FIELDS.every(k => pv[k] === undefined || FIELD_OK[k](pv[k], L));
  if (!valid) {
    const out = { ...base, posVerdictUnavailable: true };
    // A previously saved LEGACY public exit (written before the split) is kept only as HISTORICAL reconciliation evidence, separate from
    // posVerdict: it is never current, never a new instruction, and readers present it as "reconcile with your broker" text.
    if (object(sig.posVerdict)) {
      out.posVerdictSource = 'LEGACY_PUBLIC_NOT_CURRENT';
      const exits = {}; for (const [k, v] of Object.entries(sig.posVerdict).slice(0, L.verdicts)) if (SYM.test(k) && reason(v, L)) exits[k] = v;
      out.legacyExitHistory = { source: 'LEGACY_PUBLIC_SCAN', session: validSession(sig.session) ? sig.session : null, generatedAt: validStamp(sig.generatedAt) ? sig.generatedAt : null, exits };
    }
    return out;
  }
  for (const k of SIGNALS_PRIVATE_FIELDS) if (pv[k] !== undefined) base[k] = pv[k];
  if (!base.tipBoard) base.tipBoard = { sources: [], tips: [] };
  return base;
}
// The ONE pairing decision for owner context (scan.mjs reuses it; Codex 6852112825): the full private scan record belongs to the published
// scan only when both carry an exact calendar session and a zoned generatedAt and both are equal. Anything else (missing, malformed,
// calendar-invalid, unpaired) is not current full private evidence.
export function pairedFullPrivate(sig, readFull = defaultReadFull) {
  let full = null; try { full = readFull(); } catch { return false; }
  return object(sig) && object(full) && validSession(sig.session) && validZoned(sig.generatedAt) && full.session === sig.session && full.generatedAt === sig.generatedAt;
}
export function readSignals(file = 'data/signals.json') { try { return hydrateSignals(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return null; } }
export function privateSignalsRecord({ session, generatedAt, fields }) {
  const rec = { v: 1, session, generatedAt }; for (const k of SIGNALS_PRIVATE_FIELDS) if (fields[k] !== undefined) rec[k] = fields[k]; return rec;
}
