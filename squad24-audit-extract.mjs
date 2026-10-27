// SQUAD 24 AUDIT EXTRACT (27 Oct 2026; Stock-2 label audit). EVIDENCE ONLY: no prices, no returns, no trade results are read or computed.
// Reads data/squad24-audit-ids.json (an identity projection of the 272 frozen SQ24-MEGADEAL events, trade fields dropped) and the frozen
// mega-cap list, re-reads every filing's EDGAR full submission text (SEC_UA, 8 requests a second at most, cached in squad24-audit-cache),
// runs the fixed extractor (squad24-audit-core.mjs auditFiling) and writes data/squad24-audit-evidence.json for the blind hand review.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { MEGACAP_SHA, listOn } from './squad24-core.mjs';
import { auditFiling, submissionDocs, sizeOk, COUNTED } from './squad24-audit-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, SEC = local(env.SEC_BASE) || 'https://www.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ24A_CACHE || 'squad24-audit-cache', OUT = env.OUT || 'data/squad24-audit-evidence.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, sleep = (ms) => new Promise(r => setTimeout(r, ms));
let last = 0, req = 0, fail = 0;
async function secText(url) { for (let a = 0; a < 4; a++) { const w = (local(env.SEC_BASE) ? 0 : 130) - (Date.now() - last); if (w > 0) await sleep(w); last = Date.now(); req++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(90000) }); if (r.status === 404 || r.status === 410) return '';
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) { fail++; return null; } return Buffer.from(await r.arrayBuffer()).subarray(0, 15e6).toString('latin1'); } catch (e) { await sleep(1000 * (a + 1)); } }
  fail++; return null; }
const subUrl = (cik, adsh) => SEC + '/Archives/edgar/data/' + (+cik) + '/' + adsh.replace(/-/g, '') + '/' + adsh + '.txt';
const idxUrl = (cik, adsh) => 'https://www.sec.gov/Archives/edgar/data/' + (+cik) + '/' + adsh.replace(/-/g, '') + '/' + adsh + '-index.html';
const MCRAW = fs.readFileSync('data/squad24-megacaps.json'), sha = crypto.createHash('sha256').update(MCRAW).digest('hex');
if (sha !== MEGACAP_SHA) { console.log('mega-cap list is not the frozen one: nothing done'); process.exit(1); }
const MC = JSON.parse(MCRAW.toString()), IDS = J('data/squad24-audit-ids.json', null); if (!IDS) { console.log('no ids file'); process.exit(1); }
fs.mkdirSync(SC + '/sub', { recursive: true });
const cut = (s, n) => String(s || '').slice(0, n), out = [];
for (const e of IDS.events) { const f = SC + '/sub/' + e.adsh + '.txt.gz'; let txt = null;
  try { txt = zlib.gunzipSync(fs.readFileSync(f)).toString('latin1'); } catch (er) { txt = await secText(subUrl(e.cik, e.adsh)); if (txt) fs.writeFileSync(f, zlib.gzipSync(Buffer.from(txt, 'latin1'))); }
  if (!txt) { out.push({ sym: e.sym, adsh: e.adsh, error: 'submission not read' }); continue; }
  const p = submissionDocs(txt), d = String(e.accepted || '').slice(0, 10), cos = listOn(MC, d).map(String).map(c => ({ cik: c, name: (MC.companies[c] || {}).name, aliases: (MC.companies[c] || {}).aliases || [] }));
  const r = auditFiling(p.docs, cos, e.marketCap), b = r.best;
  out.push({ sym: e.sym, cik: e.cik, adsh: e.adsh, accepted: e.accepted, filingSession: e.filingSession, marketCap: e.marketCap, edgar: idxUrl(e.cik, e.adsh), docs: p.docs.map(x => x.type + ' ' + x.file),
    old: { counterparty: e.old.counterparty, alias: e.old.alias, usd: e.old.usd, size: e.old.size },
    extractor: { accepted: !!b, keep: !!b && sizeOk(b.gate), counted: !!b && sizeOk(b.gate) && COUNTED.includes(b.family), family: b ? b.family : null, counterparty: b ? b.name : null, cpCik: b ? b.cik : null,
      gate: b && b.gate ? { usd: b.gate.usd, cls: b.gate.cls, raw: b.gate.raw, ratio: +(+b.gate.ratio).toFixed(4) } : null },
    best: b ? { alias: b.alias, doc: b.doc, pattern: b.pattern, sentence: cut(b.sentence, 700), passage: cut(b.passage, 1500), amounts: b.amounts.map(a => ({ usd: a.usd, raw: a.raw, cls: a.cls, text: cut(a.text, 220) })) } : null,
    otherParties: r.accepted.filter(x => x !== b).slice(0, 4).map(x => ({ alias: x.alias, doc: x.doc, family: x.family, gate: x.gate ? x.gate.usd : null, sentence: cut(x.sentence, 300) })),
    dropped: r.hits.filter(h => h.status === 'drop').slice(0, 12).map(h => ({ alias: h.alias, doc: h.doc, why: h.why, sentence: cut(h.sentence, 200) })), dropCounts: r.hits.reduce((a, h) => (a[h.why || h.status] = (a[h.why || h.status] || 0) + 1, a), {}) }); }
const sum = { events: out.length, notRead: out.filter(x => x.error).length, extractorAccepted: out.filter(x => x.extractor && x.extractor.accepted).length, sizeOk: out.filter(x => x.extractor && x.extractor.keep).length,
  countedFamilyAndSize: out.filter(x => x.extractor && x.extractor.counted).length, families: out.reduce((a, x) => { const k = x.extractor && x.extractor.accepted ? x.extractor.family : 'NO PARTY HIT'; a[k] = (a[k] || 0) + 1; return a; }, {}) };
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), note: 'EVIDENCE ONLY for the blind hand review (squad24-audit-core.mjs header). No prices, no returns. Old = the frozen first-run match.', summary: sum, sec: { requests: req, failed: fail }, cases: out }, null, 1));
console.log('squad 24 audit extract: ' + JSON.stringify(sum) + ' | SEC requests ' + req + ', failed ' + fail);
