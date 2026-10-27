// SQUAD 26 LABEL INPUT (27 Oct 2026; INFORMATION ONLY, requested by the lead after the Squad 24 label-contamination finding). Changes
// NOTHING in SQ26-FIRSTMIN or its firstRun. For every event that traded in any frozen version (data/squad26-lab.json cases + events801)
// it writes data/squad26-label-input.json with the TEXT ONLY (no prices, no returns): the matched sentence, 700 characters around the
// match, the Item 1.01 / press-release opening, the largest stated dollar value and its ratio to the market value (shares known 30 days
// earlier x the raw prior close); a ratio above 50x is flagged as a likely extraction error. The labels (giant is a party to the agreement
// described: yes / no / unclear) are written by hand from this file, blind to returns, into data/squad26-labels.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { html2text } from './squad21-core.mjs';
import { largestUsd } from './squad24-core.mjs';
import { contextMatch, listOn } from './squad26-core.mjs';
const env = process.env, SEC = 'https://www.sec.gov', UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ26_CACHE || 'squad26-cache';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let last = 0;
async function get(url) { for (let a = 0; a < 4; a++) { const w = 150 - (Date.now() - last); if (w > 0) await sleep(w); last = Date.now();
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(60000) }); if (r.status === 404) return null; if (!r.ok) { await sleep(2000 * (a + 1)); continue; }
      return Buffer.from(await r.arrayBuffer()).subarray(0, 15e6).toString('latin1'); } catch (e) { await sleep(2000); } } return null; }
const LAB = J('data/squad26-lab.json', {}), MC = J('data/squad24-megacaps.json', {}), SH = JZ('data/shares.json.gz', { c: {} });
const COS = (cik) => ({ cik, aliases: (MC.companies[cik] || {}).aliases || [] });
const evs = new Map(); for (const z of [...(LAB.cases || []), ...(LAB.events801 || [])]) if (!evs.has(z.adsh)) evs.set(z.adsh, { adsh: z.adsh, sym: z.sym, set: z.set, accepted: z.accepted, counterparty: z.counterparty, alias: z.alias, doc: z.doc, priorClose: z.priorClose });
// adsh -> filer CIK from the lab's own EDGAR hit cache
const CIK = new Map(); const walk = (d) => { for (const f of (() => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return []; } })()) { const p = d + '/' + f.name; if (f.isDirectory()) walk(p); else for (const z of J(p, [])) if (z[1] && evs.has(z[1])) CIK.set(z[1], String(+z[2])); } };
walk(SC + '/efts');
const out = [];
for (const e of evs.values()) { const cik = CIK.get(e.adsh), row = { ...e, cik: cik || null }; delete row.priorClose;
  const txt = cik ? await get(SEC + '/Archives/edgar/data/' + cik + '/' + e.adsh.replace(/-/g, '') + '/' + e.adsh + '.txt') : null;
  if (!txt) { row.error = 'not read'; out.push(row); continue; }
  const docs = []; const re = /<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi; let m;
  while ((m = re.exec(txt)) !== null) { const b = m[1], type = ((/<TYPE>([^\n<]+)/i.exec(b) || [])[1] || '').trim().toUpperCase(), file = ((/<FILENAME>([^\n<]+)/i.exec(b) || [])[1] || '').trim();
    if (!(type === '8-K' || /^EX-99/.test(type) || /^EX-10/.test(type)) || /\.(pdf|jpg|jpeg|png|gif|xlsx?|zip)$/i.test(file)) continue; docs.push({ type, text: html2text(b.slice(0, 3e6)) }); }
  const cos = listOn(MC, e.accepted.slice(0, 10)).map(String).map(COS);
  for (const d of docs) { const x = contextMatch(d.text, cos, d.type); if (x) { row.matchDoc = d.type; row.sentence = x.sentence.slice(0, 500); row.window = d.text.slice(Math.max(0, x.at - 700), x.at + 700); break; } }
  const main = docs.find(d => d.type === '8-K'), t = main ? main.text : '', i101 = t.search(/Item\s*1\.01/i), i801 = t.search(/Item\s*8\.01/i), pr = docs.find(d => d.type === 'EX-99.1');
  row.itemText = e.set === '101' ? (i101 >= 0 ? t.slice(i101, i101 + 1500) : t.slice(0, 1500)) : (pr ? pr.text.slice(0, 1500) : (i801 >= 0 ? t.slice(i801, i801 + 1500) : ''));
  const lu = docs.map(d => largestUsd(d.text)).filter(Boolean).sort((a, b) => b.usd - a.usd)[0], d30 = new Date(Date.parse(e.accepted.slice(0, 10)) - 30 * 864e5).toISOString().slice(0, 10);
  let sh = null; for (const [dd, n] of (cik && SH.c[cik]) || []) if (dd <= d30 && n > 0) sh = n; const cap = sh && e.priorClose ? sh * e.priorClose : null;
  row.largestUsd = lu ? lu.usd : null; row.usdText = lu ? lu.snippet.slice(0, 240) : null; row.marketCap = cap ? Math.round(cap) : null; row.ratio = lu && cap ? +(lu.usd / cap).toFixed(3) : null; row.flag50x = !!(row.ratio > 50);
  out.push(row); }
fs.writeFileSync('data/squad26-label-input.json', JSON.stringify({ generatedAt: new Date().toISOString(), note: 'INFORMATION ONLY, TEXT ONLY (no prices or returns), for blind party labels. Frozen SQ26-FIRSTMIN unchanged.', n: out.length, events: out }, null, 1));
console.log('label input: ' + out.length + ' events, not read ' + out.filter(x => x.error).length + ', flagged > 50x ' + out.filter(x => x.flag50x).length);
