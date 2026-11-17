// WHO IS BUYING core (squad 31; owner, 17 Nov 2026: "make the system read what they are buying and analyze why they do so", after an
// Instagram reel on copying US Congress trades). Pure functions only (tested in test/insider-core.test.mjs); squad31-buyers.mjs does the data.
// Research and paper only: never an order. Halal = the owner's ZAD marks only.
//
// TWO KINDS OF BUYER
//   insiders  = directors, officers and 10% owners buying their OWN company's stock on the open market (SEC Form 4, transaction code P,
//               filed within 2 business days). Source: SEC quarterly insider data sets (history) and the EDGAR daily index (live).
//   Congress  = House members' Periodic Transaction Reports (STOCK Act; filed up to 45 days after the trade). Source: the House Clerk's
//               yearly index + the electronic PTR PDFs (scanned paper filings cannot be read and are counted, not guessed).
// Outside evidence before this test (17 Nov 2026): copying Congress after disclosure trailed the S&P 500 in several large studies
// (Yield Theory 4,967 buys; Equibles 17,859; Zenodo pre-registered 3,942: alpha -1.6%/yr, t -0.66). Insider buys in microcaps after a
// 10%+ rise did best in arXiv 2602.06198. Cluster buys did no better than single buys (Form4API). So nothing is assumed: every rule below is
// PRE-REGISTERED here (17 Nov 2026) before any number of this lab was seen, and judged with the hunter verdict (hunter-core.mjs).

import { costOf, stats, verdict } from './hunter-core.mjs';
export { stats, verdict };

// ---------- parsing
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
// '31-JUL-2025' -> '2025-07-31'; '7/13/2026' or '07/13/2026' -> '2026-07-13'
export function isoDate(x) {
  if (!x) return null; let m = /^(\d{1,2})-([A-Z]{3})-(\d{4})$/.exec(x.trim().toUpperCase());
  if (m && MON[m[2]]) return m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0');
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(x.trim()); if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  m = /^(\d{4}-\d{2}-\d{2})/.exec(x.trim()); return m ? m[1] : null;
}
export const cleanSym = (s) => { const x = String(s || '').trim().toUpperCase().replace(/^\$/, ''); return /^[A-Z][A-Z.\-]{0,6}$/.test(x) && !/^(NONE|N\/A|NA)$/.test(x) ? x.replace('-', '.') : null; };
export function roleOf(rel, title) {
  const r = String(rel || '').toLowerCase(), t = String(title || '');
  const top = /\b(CEO|C\.E\.O|Chief Executive|CFO|Chief Financial|President|Chair(man|woman|person)?)\b/i.test(t);
  return { director: r.includes('director'), officer: r.includes('officer'), ten: r.includes('ten') || r.includes('10%'), top, title: t.slice(0, 40) };
}

// One Form 4 XML document (live EDGAR). Returns { sym, issuer, owners:[{name, role}], buys:[{date, sh, px}] } or null.
export function parseForm4Xml(xml) {
  if (!xml || !/<ownershipDocument/i.test(xml)) return null;
  const tag = (s, t) => { const m = new RegExp('<' + t + '>\\s*(?:<value>)?\\s*([^<]*)', 'i').exec(s); return m ? m[1].trim() : ''; };
  const docType = tag(xml, 'documentType'); if (docType && docType !== '4') return null;
  const sym = cleanSym(tag(xml, 'issuerTradingSymbol')), issuer = tag(xml, 'issuerName');
  const owners = [...xml.matchAll(/<reportingOwner>([\s\S]*?)<\/reportingOwner>/gi)].map(m => { const s = m[1];
    const on = (t) => /^(1|true)$/i.test(tag(s, t)); const rel = [on('isDirector') && 'Director', on('isOfficer') && 'Officer', on('isTenPercentOwner') && 'TenPercentOwner'].filter(Boolean).join(',');
    return { name: tag(s, 'rptOwnerName'), role: roleOf(rel, tag(s, 'officerTitle')) }; });
  const buys = [];
  for (const m of xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)) { const s = m[1];
    const code = /<transactionCode>\s*([A-Z])\s*</i.exec(s), ad = tag(s, 'transactionAcquiredDisposedCode');
    if (!code || code[1].toUpperCase() !== 'P' || ad.toUpperCase() !== 'A') continue;
    const sh = +tag(s, 'transactionShares'), px = +tag(s, 'transactionPricePerShare'), date = isoDate(tag(s, 'transactionDate'));
    if (sh > 0 && px > 0) buys.push({ date, sh, px }); }
  return { sym, issuer, owners, buys };
}

// One electronic House PTR (pdftotext -layout). Returns [{ sym, type: 'P'|'S'|'E', tdate, ndate, lo, hi, owner }] (stocks only).
export function parseHousePtr(text) {
  const out = []; if (!text) return out;
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const flat = b.replace(/\s+/g, ' ');
    const st = flat.search(/\[(ST|AB)\]/); if (st < 0) continue;   // the ticker is the last (UPPERCASE) before the [ST] tag (columns can sit between)
    const tks = [...flat.slice(0, st).matchAll(/\(([A-Z][A-Z.\-]{0,6})\)/g)], tk = tks[tks.length - 1]; if (!tk) continue;
    const tx = /\s(P|S \(partial\)|S|E)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+\$([\d,]+)(?:\s*-\s*\$([\d,]+))?/.exec(flat); if (!tx) continue;
    const own = /^\s*(SP|JT|DC)\s/.exec(b.split('\n').find(l => l.trim()) || '');
    out.push({ sym: cleanSym(tk[1]), type: tx[1][0], tdate: isoDate(tx[2]), ndate: isoDate(tx[3]), lo: +tx[4].replace(/,/g, ''), hi: tx[5] ? +tx[5].replace(/,/g, '') : null, owner: own ? own[1] : 'self' });
  }
  return out.filter(x => x.sym && x.tdate);
}

// ---------- events: all open-market buys of one company filed on one day become one event
// rows: [{ sym, filed, name, role, sh, px }] -> [{ sym, filed, usd, n (distinct buyers), top, director, officer, ten, avgPx, names }]
export function insiderEvents(rows) {
  const M = new Map();
  for (const r of rows) { if (!r.sym || !r.filed || !(r.sh > 0) || !(r.px > 0)) continue; const k = r.sym + '|' + r.filed;
    let e = M.get(k); if (!e) { e = { sym: r.sym, filed: r.filed, usd: 0, sh: 0, who: new Map() }; M.set(k, e); }
    e.usd += r.sh * r.px; e.sh += r.sh; const w = e.who.get(r.name) || { name: r.name, role: r.role, usd: 0 }; w.usd += r.sh * r.px; e.who.set(r.name, w); }
  return [...M.values()].map(e => { const w = [...e.who.values()];
    return { sym: e.sym, filed: e.filed, usd: Math.round(e.usd), avgPx: e.usd / e.sh, n: w.length, top: w.some(x => x.role.top), officer: w.some(x => x.role.officer), director: w.some(x => x.role.director),
      ten: w.length > 0 && w.every(x => x.role.ten && !x.role.officer && !x.role.director), names: w.sort((a, b) => b.usd - a.usd).slice(0, 3).map(x => ({ name: x.name, title: x.role.title || (x.role.director ? 'Director' : x.role.ten ? '10% owner' : ''), usd: Math.round(x.usd) })) }; })
    .sort((a, b) => a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : 0);
}
// distinct insiders of the same company with an event in the 10 calendar days up to (and including) this filing
export function addClusters(events) {
  const by = new Map(); for (const e of events) { const a = by.get(e.sym) || []; a.push(e); by.set(e.sym, a); }
  for (const a of by.values()) for (const e of a) { const t = Date.parse(e.filed), names = new Set();
    for (const x of a) { const dt = (t - Date.parse(x.filed)) / 864e5; if (dt >= 0 && dt <= 10) for (const n of x.names) names.add(n.name); }
    e.cluster = Math.max(e.n, names.size); }
  return events;
}

// ---------- PRE-REGISTERED RULES (17 Nov 2026). Entry = the OPEN of the first market day AFTER the filing / report date (the first moment
// a reader could act; filings arrive until 22:00 New York). Score = the stock's return MINUS the S&P 500 (SPY) over the same open-to-close
// window, MINUS penny-size costs (costOf). So a rule passes only if it beats simply holding the market.
// ctx at entry: { px (entry open), pre20 (stock return over the 20 sessions before entry), dollar20 (median daily dollar volume, 20 days) }
const small = (c) => c.dollar20 !== null && c.dollar20 >= 1e5 && c.dollar20 <= 5e6;
export const RULES = {
  'INS-ANY': { kind: 'ins', hold: 20, text: 'Any insider open-market buy of 25k USD+ (entry price 1 USD+); hold 20 market days', test: (e, c) => e.usd >= 25e3 && c.px >= 1 },
  'INS-CEO': { kind: 'ins', hold: 20, text: 'The CEO, CFO, president or chair bought 50k USD+ (1 USD+); hold 20 days', test: (e, c) => e.top && e.usd >= 5e4 && c.px >= 1 },
  'INS-CLUSTER': { kind: 'ins', hold: 20, text: '2+ different insiders of the same company bought within 10 days (25k USD+, 1 USD+); hold 20 days', test: (e, c) => e.cluster >= 2 && e.usd >= 25e3 && c.px >= 1 },
  'INS-BIG': { kind: 'ins', hold: 20, text: 'Insiders bought 500k USD+ in one filing day (not only 10% owner funds; 1 USD+); hold 20 days', test: (e, c) => e.usd >= 5e5 && !e.ten && c.px >= 1 },
  'INS-PENNY': { kind: 'ins', hold: 20, text: 'Penny insider buy: entry price 0.20-3 USD, 10k USD+, 100k USD+ traded a day; hold 20 days', test: (e, c) => e.usd >= 1e4 && c.px >= 0.2 && c.px < 3 && c.dollar20 >= 1e5 },
  'INS-MOM': { kind: 'ins', hold: 20, text: 'Small company (100k-5M USD traded a day), insider bought 25k USD+ AFTER the stock rose 10%+ in 20 days (arXiv 2602.06198); hold 20 days', test: (e, c) => e.usd >= 25e3 && small(c) && c.pre20 >= 0.10 && c.px >= 0.2 },
  'INS-5D': { kind: 'ins', hold: 5, text: 'INS-ANY held only 5 market days', same: 'INS-ANY' },
  'INS-60D': { kind: 'ins', hold: 60, text: 'INS-ANY held 60 market days (about 3 months)', same: 'INS-ANY' },
  'CONG-BUY': { kind: 'cong', hold: 20, text: 'A House member reported buying a stock (any amount); buy the next open after the report; hold 20 days', test: (e, c) => c.px >= 1 },
  'CONG-60D': { kind: 'cong', hold: 60, text: 'CONG-BUY held 60 days', same: 'CONG-BUY' },
  'CONG-BIG': { kind: 'cong', hold: 60, text: 'A House member reported buying 50k USD+ of one stock; hold 60 days', test: (e, c) => e.lo >= 50001 && c.px >= 1 },
  'CONG-FAST': { kind: 'cong', hold: 20, text: 'A House member reported a buy within 15 days of making it (FinzData lead); hold 20 days', test: (e, c) => e.lag <= 15 && c.px >= 1 },
};
export const testOf = (id) => RULES[id].test || RULES[RULES[id].same].test;

// Exit after `hold` market days at that day's close. A thin stock that did not trade on that day uses its last close before it; a stock that
// never trades again (delisted, halted) uses its last close minus 20%. No stop (insider and Congress rules are slow holds).
export function holdExit(s, k, hold, lastDi) {
  if (!(s.o[k] > 0)) return null; const target = s.d[k] + hold - 1; if (target > lastDi) return null;
  let j = k; while (j + 1 < s.d.length && s.d[j + 1] <= target) j++;
  const gone = j === s.d.length - 1 && s.d[j] < target && lastDi - s.d[j] > 5;
  const px = gone ? s.c[j] * 0.8 : s.c[j];
  return { entry: s.o[k], exit: px, gross: px / s.o[k] - 1, endDi: target, how: gone ? 'stopped trading' : s.d[j] === target ? 'time' : 'last trade before' };
}
// One scored trade. s = stock series, spy = SPY series (hunter-core format), k = stock bar index of the entry day.
export function scoreTrade(s, k, spy, hold, lastDi, mult = 1) {
  const x = holdExit(s, k, hold, lastDi); if (!x) return null;
  const sk = spy.d.indexOf(s.d[k]), ek = spy.d.indexOf(x.endDi); if (sk < 0 || ek < 0 || !(spy.o[sk] > 0)) return null;
  const mkt = spy.c[ek] / spy.o[sk] - 1;
  return { gross: x.gross, mkt, net: x.gross - mkt - costOf(x.entry, mult), px: x.entry, how: x.how };
}
// context at entry from the stock series
export function entryCtx(s, k) {
  const px = s.o[k], pre = k >= 20 && s.d[k] - s.d[k - 20] <= 30 ? s.c[k - 1] / s.c[k - 20] - 1 : null;
  const a = []; for (let j = Math.max(0, k - 20); j < k; j++) if (s.c[j] > 0 && s.v[j] > 0) a.push(s.c[j] * s.v[j]); a.sort((x, y) => x - y);
  return { px, pre20: pre, dollar20: a.length >= 10 ? a[a.length >> 1] : null };
}
// label shown to the owner for a name matched by these rules (verdicts from data/squad31-buyers.json)
export function labelOf(ids, verdicts) {
  const v = ids.map(id => (verdicts[id] || {}).verdict || 'NOT TESTED');
  if (v.includes('TRY SMALL')) return 'TRY SMALL';
  if (v.length && v.every(x => x === 'REJECTED')) return 'INFO (rule failed the test)';
  return 'WATCH';
}
