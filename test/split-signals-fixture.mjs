// Test helper (P0 Route A): split a legacy all-in-one signals fixture into the public file and its paired private record, so tests keep
// their original meaning under the split scan output. generatedAt defaults to the session date (an undated-looking stamp that still pairs).
const PRIVATE = ['posVerdict', 'tipBoard', 'leaders', 'pead', 'evt', 'peadFunnel'];
export function splitSignals(sig) {
  const pub = { ...sig }, priv = { v: 1, session: sig.session, generatedAt: sig.generatedAt || sig.session, posVerdict: {} };
  for (const k of PRIVATE) if (k in pub) { priv[k] = pub[k]; delete pub[k]; }
  pub.generatedAt = priv.generatedAt;
  return { 'data/signals.json': pub, 'data/signals-private.json': priv };
}
