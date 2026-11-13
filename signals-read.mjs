// P0 Route A (development): the nightly scan splits its output in two. data/signals.json is PUBLIC and independent of the owner's private
// state; data/signals-private.json (listed in .github/private-files.txt) carries the owner-derived fields below, written first and paired
// to the same scan by session + generatedAt. Every reader that needs those fields goes through hydrateSignals/readSignals.
// - paired private record: its fields are merged in;
// - legacy signals.json that still carries posVerdict (written before the split): used as it is;
// - missing, unreadable or unpaired private record: posVerdictUnavailable=true and the private fields are ABSENT (never guessed, never
//   taken from an older record), so holding decisions report UNKNOWN and no buy is offered from a private-only list.
import fs from 'node:fs';
export const SIGNALS_PRIVATE_FILE = 'data/signals-private.json';
export const SIGNALS_PRIVATE_FIELDS = Object.freeze(['posVerdict', 'tipBoard', 'leaders', 'pead', 'evt', 'peadFunnel']);
const object = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export function hydrateSignals(sig, readPrivate = () => JSON.parse(fs.readFileSync(SIGNALS_PRIVATE_FILE, 'utf8'))) {
  if (!object(sig) || object(sig.posVerdict)) return sig;
  let pv = null; try { pv = readPrivate(); } catch {}
  if (object(pv) && pv.v === 1 && pv.session === sig.session && pv.generatedAt === sig.generatedAt && object(pv.posVerdict)) {
    const out = { ...sig }; for (const k of SIGNALS_PRIVATE_FIELDS) if (pv[k] !== undefined) out[k] = pv[k];
    if (!out.tipBoard) out.tipBoard = { sources: [], tips: [] };
    return out;
  }
  return { ...sig, posVerdictUnavailable: true };
}
export function readSignals(file = 'data/signals.json') { try { return hydrateSignals(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return null; } }
export function privateSignalsRecord({ session, generatedAt, fields }) {
  const rec = { v: 1, session, generatedAt }; for (const k of SIGNALS_PRIVATE_FIELDS) if (fields[k] !== undefined) rec[k] = fields[k]; return rec;
}
