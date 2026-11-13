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
const FIELD_OK = { posVerdict: object, tipBoard: object, peadFunnel: object, leaders: Array.isArray, pead: Array.isArray, evt: Array.isArray };
const clock = (x) => typeof x === 'string' && x.length > 0;
export function hydrateSignals(sig, readPrivate = () => JSON.parse(fs.readFileSync(SIGNALS_PRIVATE_FILE, 'utf8'))) {
  if (!object(sig)) return sig;
  // Every private-only field is stripped from the public input first: a public copy (legacy or not) is never current private evidence.
  // An already-retained SELL survives through its original private record / recorded holding plan, never through public fields.
  const base = { ...sig }; for (const k of SIGNALS_PRIVATE_FIELDS) delete base[k];
  let pv = null; try { pv = readPrivate(); } catch {}
  const paired = object(pv) && pv.v === 1 && clock(sig.session) && clock(sig.generatedAt) && pv.session === sig.session && pv.generatedAt === sig.generatedAt;
  const valid = paired && object(pv.posVerdict) && SIGNALS_PRIVATE_FIELDS.every(k => pv[k] === undefined || FIELD_OK[k](pv[k]));
  if (!valid) return { ...base, posVerdictUnavailable: true, ...(object(sig.posVerdict) ? { posVerdictSource: 'LEGACY_PUBLIC_NOT_CURRENT' } : {}) };
  for (const k of SIGNALS_PRIVATE_FIELDS) if (pv[k] !== undefined) base[k] = pv[k];
  if (!base.tipBoard) base.tipBoard = { sources: [], tips: [] };
  return base;
}
export function readSignals(file = 'data/signals.json') { try { return hydrateSignals(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return null; } }
export function privateSignalsRecord({ session, generatedAt, fields }) {
  const rec = { v: 1, session, generatedAt }; for (const k of SIGNALS_PRIVATE_FIELDS) if (fields[k] !== undefined) rec[k] = fields[k]; return rec;
}
