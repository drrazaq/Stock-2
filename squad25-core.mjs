// SQUAD 25 CORE (27 Oct 2026; Stock-2): "a giant newly owns a small company". Pure functions, no network, no files. Used by squad25-lab.mjs
// and test/squad25-core.test.mjs. Long only; no leverage; no shorting; never places an order; never gives a halal ruling.
//
// WHY: the owner's +93% one-day call was probably SoundHound (SOUN) on 15 Feb 2024: NVIDIA's first 13F-HR (accepted 14 Feb 2024 16:12 New
// York) showed a SOUN stake for the first time; SOUN closed +67% the next session. Squad 24 (SQ24-MEGADEAL: a small company's own 8-K naming a
// top-100 company, bought after the reaction) was REJECTED. NEW HERE: the event is a filing BY the giant (13F-HR first appearance, or a
// Schedule 13D / 13G), bought at the first realistic moment after the SEC acceptance second, not after the reaction.
//
// ================= RULES (PRE-REGISTERED 27 Oct 2026 BEFORE ANY RESULT; written before the BUILD run; run ONCE under the full standard) ====
// GIANTS (frozen BEFORE the run): data/squad25-giants.json, SHA-256 = GIANTS_SHA below (the lab refuses any other file). Built from EDGAR
//   filer CIKs (the BUILD run: EDGAR quarterly full-index master files 2013Q1.. for forms 13F-HR, 13F-HR/A, SC 13D, SC 13D/A, SC 13G,
//   SC 13G/A, SCHEDULE 13D, SCHEDULE 13D/A, SCHEDULE 13G, SCHEDULE 13G/A, and each company's submissions JSON for its SIC code), curated by
//   hand BEFORE any return is computed. Operating companies only: no bank, broker, asset manager, insurer, fund or SoftBank-type investment
//   holding company. Each giant = one group of CIKs (the parent plus venture arms that file under their own CIK, e.g. GV / CapitalG for
//   Alphabet, Intel Capital, Salesforce Ventures, NVentures). The file records which giants actually file 13F-HR.
//   BASE group (SQ25-GIANTSTAKE): the owner's named giants: NVIDIA, Alphabet (+ Google, GV, CapitalG), Amazon, Microsoft, Apple, Meta,
//     Intel (+ Intel Capital), Qualcomm (+ Qualcomm Ventures), Salesforce (+ Salesforce Ventures), Cisco, Oracle, Samsung, Sony, Toyota.
//     Giants at every date in the window.
//   WIDE group (the ONE pre-registered fallback, SQ25-GIANTWIDE): BASE + every NON-FINANCIAL company (SIC outside 6000-6799) on Squad 24's
//     frozen top-100 US-listed list (data/squad24-megacaps.json, sha 5530f820...), POINT IN TIME: a filing counts only if the company is on
//     the list of the latest quarter start on or before the acceptance date (the 2021-10-01 list for earlier dates), + its own-CIK venture
//     arms found in the BUILD. Still giants only: no fund of any size is ever added.
//     The fallback is JUDGED (frozen verdict, can qualify) ONLY for an entry version whose BASE rule is TOO FEW CASES; otherwise it is
//     reported as information only and never enters firstRun.
// EVENTS (EDGAR acceptance second = the ACCEPTANCE-DATETIME of the filing's own header, New York clock):
//   (1) 13F-HR FIRST APPEARANCE: an original 13F-HR (not /A) filed by a giant CIK lists an issuer (CUSIP first 6 characters; rows with a
//       put / call or a PRN amount ignored) that was NOT in the same CIK's previous 13F-HR (the latest earlier report period: its original
//       plus every 13F-HR/A accepted before this filing, union). A CIK's first-ever 13F-HR: every issuer is new (NVIDIA Feb 2024). Not an
//       event if the same giant group filed any Schedule 13D / 13G on that issuer before this acceptance (the stake was already public).
//   (2) SCHEDULE 13D / 13G: an original SC 13D / SC 13G / SCHEDULE 13D / SCHEDULE 13G whose header lists a giant CIK under FILED BY and a
//       different SUBJECT COMPANY; or an amendment (/A) when it is the giant group's FIRST filing of any 13D / 13G on that subject in EDGAR
//       (2013 on). One event per accession.
//   ISSUER -> STOCK, point in time, never today's ticker list alone: 13F CUSIP -> the SEC fails-to-deliver files (official, twice a month,
//     CUSIP + symbol): the latest record dated on or before the acceptance date within 400 days, else the first within 90 days after; else
//     Massive ticker search by CUSIP on that date. 13D / 13G subject CIK -> Squad 4's Form 3/4/5 ticker spans (point in time), then the
//     CUSIP on the cover page via the fails-to-deliver files. The issuer must not be a giant itself (any group) and not an ETF / fund.
// UNIVERSE at the LAST CLOSE BEFORE ACCEPTANCE (session p: the acceptance day if accepted at/after 16:00, else the previous session):
//   close >= 1 USD; market value < 10 B USD (close x the SEC share count of the issuer CIK known 30 days earlier, not older than 400 days;
//   else Massive weighted shares on that date - 30 days; none = out); 20-session average traded value >= 0.5 M USD (dead stocks included).
//   Sub-split reported (information): market value < 2 B USD.
// ENTRY, two pre-registered versions (each its own rule id):
//   (A) SQ25-GIANTSTAKE-A: BUY the next regular-session OPEN after acceptance (accepted before 09:30 on a session day = that day's open;
//       09:30 or later = the next session's open; non-session day = the next session's open). Session 1 = that session.
//   (B) SQ25-GIANTSTAKE-B: BUY the OPEN of the first Alpaca SIP 1-minute bar (extended hours 04:00-20:00 New York included, raw prices) that
//       starts at least 60 seconds after the acceptance second (none before the next regular open: that open). EXTRA SLIPPAGE when that bar
//       is outside 09:30-15:59: the buy is filled 2% higher AND the sale 2% lower (2% each way). Session 1 = the session whose regular hours
//       contain the fill, else the next session. Price scale: Alpaca raw -> the price cache by the ratio of the two opens of session 1.
//       An event with no minute bars from Alpaca: no B trade (counted).
// EXIT (both): STOP 25% under the fill price (before slippage): a session that OPENS at or under the stop sells at that open (for B on its
//   session 1 only when the fill was before that open), else a session whose LOW reaches the stop sells at the stop (for B on session 1 the
//   whole day's low counts: conservative). Else SELL at the close of session 10. A stock that stops trading: its last close. One open trade
//   per stock and version. A trade whose path holds a whole-ratio 3x-50x one-day jump (unadjusted split) is left out (squad 4/6/21/24).
// COSTS: 0.8% a round trip (1.2% stress) AND a 2%-each-way stress version (fill x 1.02, sale x 0.98, then 0.8%) that is an EXTRA GATE
//   (for B on top of its own extended-hours slippage).
// JUDGED (the system's standard, never lowered): whole market 5 years incl. dead stocks; halves = acceptance session before / from
//   2024-01-01; value-core judge via hold-core judgeHold, blocks of 10 sessions: in BOTH halves > 0 after 0.8% and 1.2%, better than THE
//   AVERAGE STOCK (close >= 1 USD, 20-day traded value >= 0.5 M USD at session p; bought at the open of session 1, sold at the close of the
//   trade's last session; +300% cap on both: AUD-1), better than the same stock on its other days, > 0 without its 2 best trades, 20+
//   trades and 3+ blocks a half, block t >= 2.5, return per year of capital tied up above SPY on the same days; EXTRA GATE: the 2%-each-way
//   version > 0 in both halves.
// REPORT: case counts per half FIRST; under 20 a half = TOO FEW CASES, said plainly, every case listed. The SOUN Feb 2024 case explicitly.
// PAPER LANE (from PAPER_START, weekdays after the close): new giant 13F-HR / 13D / 13G filings (EDGAR daily-index + quarterly full-index)
//   through the same rule -> data/squad25-paper.jsonl and data/squad25-today.json. RECORD ONLY: no Telegram, no buy message from this lab.
export const COST = 0.008, STRESS = 0.012, SLIP = 0.02, EXT_SLIP = 0.02, SPLIT = '2024-01-01', PAPER_START = '2026-10-28', CAP = 3, YEAR = 252;
// SHA-256 of data/squad25-giants.json (written after the BUILD run, which computes no returns; before the rule run)
export const GIANTS_SHA = '';
export const TH = { minClose: 1, maxCap: 10e9, smallCap: 2e9, minDv: 5e5, dvSess: 20, hold: 10, stop: 0.25, block: 10, shareLag: 30, shareMaxAge: 400,
  delayMs: 60000, ftdBack: 400, ftdFwd: 90 };
export const IDS = { A: 'SQ25-GIANTSTAKE-A', B: 'SQ25-GIANTSTAKE-B', WA: 'SQ25-GIANTWIDE-A', WB: 'SQ25-GIANTWIDE-B' };
export const FALLBACK_OF = { [IDS.WA]: IDS.A, [IDS.WB]: IDS.B };
const NAME = { A: 'next regular open after acceptance', B: 'first minute after acceptance (extended hours, +2% each way when outside 09:30-16:00)' };
export const RULES = {
  [IDS.A]: { kind: 'buy', family: 'event', hold: TH.hold, block: TH.block, group: 'base', entry: 'A', name: 'A named giant (NVIDIA, Alphabet/GV, Amazon, Microsoft, Apple, Meta, Intel, Qualcomm, Salesforce, Cisco, Oracle, Samsung, Sony, Toyota) newly shows a stake (13F-HR first appearance or 13D/13G) in a 1 USD+, under-10B company; buy the ' + NAME.A + ', hold 10, 25% stop' },
  [IDS.B]: { kind: 'buy', family: 'event', hold: TH.hold, block: TH.block, group: 'base', entry: 'B', name: 'A named giant newly shows a stake (13F-HR first appearance or 13D/13G) in a 1 USD+, under-10B company; buy the ' + NAME.B + ', hold 10, 25% stop' },
  [IDS.WA]: { kind: 'buy', family: 'event', hold: TH.hold, block: TH.block, group: 'wide', entry: 'A', name: 'FALLBACK: a giant (named giants + non-financial top-100 US-listed, point in time) newly shows a stake in a 1 USD+, under-10B company; buy the ' + NAME.A + ', hold 10, 25% stop' },
  [IDS.WB]: { kind: 'buy', family: 'event', hold: TH.hold, block: TH.block, group: 'wide', entry: 'B', name: 'FALLBACK: a giant (named giants + non-financial top-100 US-listed, point in time) newly shows a stake in a 1 USD+, under-10B company; buy the ' + NAME.B + ', hold 10, 25% stop' } };
export const F13 = ['13F-HR', '13F-HR/A'], FDG = ['SC 13D', 'SC 13D/A', 'SC 13G', 'SC 13G/A', 'SCHEDULE 13D', 'SCHEDULE 13D/A', 'SCHEDULE 13G', 'SCHEDULE 13G/A'];
export const FORMS = new Set([...F13, ...FDG]);
export const is13F = (f) => f === '13F-HR' || f === '13F-HR/A', isDG = (f) => FDG.includes(f), isAmend = (f) => /\/A$/.test(String(f || ''));

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoMs = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoMs(ms(d) + n * DAY);
export function firstOnOrAfter(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; }
export const quarterOf = (d) => d.slice(0, 5) + String(Math.floor((+d.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0') + '-01';

// ---------------- EDGAR master index line -> row ----------------
// 'CIK|Company Name|Form Type|Date Filed|Filename' -> [cik, name, form, date, file] or null
export function masterRow(line) { const p = String(line || '').split('|'); if (p.length !== 5 || !/^\d+$/.test(p[0].trim())) return null; const form = p[2].trim(); if (!FORMS.has(form)) return null;
  const d = p[3].trim(); return [String(+p[0]), p[1].trim(), form, /^\d{8}$/.test(d) ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6) : d, p[4].trim()]; }
export const adshOf = (file) => { const m = /(\d{10}-\d{2}-\d{6})/.exec(String(file || '')); return m ? m[1] : null; };

// ---------------- the filing header ----------------
// the EDGAR .txt submission -> { accept: 'YYYYMMDDHHMMSS' Eastern, form, period, filedBy: [cik], subject: [cik], filer: [cik], names: {cik: name} }
export function parseHeader(txt) { const s = String(txt || ''), end = s.search(/<\/SEC-HEADER>|<DOCUMENT>/i), hdr = end > 0 ? s.slice(0, end) : s.slice(0, 30000);
  const acc = /<ACCEPTANCE-DATETIME>\s*(\d{14})/i.exec(hdr) || /ACCEPTANCE-DATETIME:\s*(\d{14})/i.exec(hdr), form = /CONFORMED SUBMISSION TYPE:\s*([^\n\r]+)/i.exec(hdr), per = /CONFORMED PERIOD OF REPORT:\s*(\d{8})/i.exec(hdr);
  const out = { accept: acc ? acc[1] : null, form: form ? form[1].trim() : null, period: per ? per[1].slice(0, 4) + '-' + per[1].slice(4, 6) + '-' + per[1].slice(6) : null, filedBy: [], subject: [], filer: [], names: {} };
  const re = /^[ \t]*(SUBJECT COMPANY|FILED BY|FILER|REPORTING-OWNER|ISSUER):/gim, marks = []; let m; while ((m = re.exec(hdr))) marks.push([m.index, m[1].toUpperCase()]);
  marks.forEach(([at, kind], j) => { const seg = hdr.slice(at, j + 1 < marks.length ? marks[j + 1][0] : hdr.length), ck = /CENTRAL INDEX KEY:\s*(\d+)/i.exec(seg), nm = /COMPANY CONFORMED NAME:\s*([^\n\r]+)/i.exec(seg); if (!ck) return;
    const c = String(+ck[1]); if (nm) out.names[c] = nm[1].trim(); const k = kind === 'SUBJECT COMPANY' ? 'subject' : kind === 'FILED BY' ? 'filedBy' : kind === 'FILER' ? 'filer' : null; if (k && !out[k].includes(c)) out[k].push(c); });
  return out; }

// ---------------- the 13F information table ----------------
const tag = (blk, t) => { const m = new RegExp('<(?:\\w+:)?' + t + '>\\s*([^<]*?)\\s*</(?:\\w+:)?' + t + '>', 'i').exec(blk); return m ? m[1].trim() : null; };
// the information-table XML (or a whole .txt holding it) -> [{ name, cusip, value, shares, type, putCall }]
export function parseInfoTable(xml) { const s = String(xml || ''), out = [], re = /<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/gi; let m;
  while ((m = re.exec(s))) { const b = m[1], cusip = (tag(b, 'cusip') || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); if (cusip.length < 6) continue;
    out.push({ name: tag(b, 'nameOfIssuer'), cusip, value: +(tag(b, 'value') || NaN), shares: +(tag(b, 'sshPrnamt') || NaN), type: (tag(b, 'sshPrnamtType') || '').toUpperCase(), putCall: tag(b, 'putCall') || null }); }
  return out; }
// equity rows only (no options, no principal amounts) -> Map cusip6 -> { cusip, name }
export function equityIssuers(rows) { const o = new Map(); for (const r of rows || []) { if (r.putCall) continue; if (r.type && r.type !== 'SH') continue; const k = r.cusip.slice(0, 6); if (!o.has(k)) o.set(k, { cusip: r.cusip, name: r.name }); } return o; }
// filings of ONE CIK: [{ adsh, form, accept (sortable 'YYYYMMDDHHMMSS'), period, issuers: Map }] -> events [{ adsh, cusip6, cusip, name, firstEver }]
// for each original 13F-HR: issuers not held in the latest earlier period (its original + amendments accepted before this filing, union)
export function firstAppearances(filings) { const fs = [...filings].filter(f => f && f.accept && f.issuers).sort((a, b) => a.accept < b.accept ? -1 : a.accept > b.accept ? 1 : 0), out = [];
  for (const f of fs) { if (f.form !== '13F-HR') continue; const earlier = fs.filter(g => g.accept < f.accept && g.period && f.period && g.period < f.period);
    if (!earlier.length) { for (const [k, v] of f.issuers) out.push({ adsh: f.adsh, cusip6: k, cusip: v.cusip, name: v.name, firstEver: true }); continue; }
    const pp = earlier.map(g => g.period).sort().pop(), prev = new Set(); for (const g of earlier) if (g.period === pp) for (const k of g.issuers.keys()) prev.add(k);
    for (const [k, v] of f.issuers) if (!prev.has(k)) out.push({ adsh: f.adsh, cusip6: k, cusip: v.cusip, name: v.name, firstEver: false }); }
  return out; }

// ---------------- 13D / 13G ----------------
// the CUSIP on a Schedule 13D / 13G (structured XML from Dec 2024, or the cover page text) -> 9 (or 8) characters or null
export function coverCusip(txt) { const s = String(txt || ''); let m = /<(?:\w+:)?(?:issuerCusip|cusipNumber|issuerCUSIP)>\s*([0-9A-Za-z]{6}[0-9A-Za-z\s]{2,4})\s*</i.exec(s);
  if (!m) m = /CUSIP\s*(?:No\.?|Number|#)?\s*(?:\(s\))?\s*[:.\-]?\s*([0-9][0-9A-Z]{5}\s?[0-9A-Z]{2}\s?[0-9A-Z]?)\b/i.exec(s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').slice(0, 400000));
  if (!m) return null; const c = m[1].toUpperCase().replace(/[^0-9A-Z]/g, ''); return c.length >= 8 ? c.slice(0, 9) : null; }
// group filings [{ adsh, form, accept, subject }] (one giant group, all CIKs) -> events: originals always; an amendment only when it is the
// group's first filing on that subject
export function dgEvents(filings) { const fs = [...filings].filter(f => f && f.accept && f.subject).sort((a, b) => a.accept < b.accept ? -1 : a.accept > b.accept ? 1 : 0), seen = new Set(), done = new Set(), out = [];
  for (const f of fs) { if (done.has(f.adsh)) continue; done.add(f.adsh); const first = !seen.has(f.subject); seen.add(f.subject); if (!isAmend(f.form) || first) out.push({ ...f, firstOnSubject: first }); }
  return out; }

// ---------------- CUSIP -> symbol (fails-to-deliver files) ----------------
// map: cusip9 -> [[date, sym], ...] sorted by date. -> sym or null
export function ftdSym(map, cusip, d) { const c = String(cusip || '').toUpperCase(); let a = map.get(c); if (!a && c.length >= 8) { a = map.get(c.slice(0, 8)); }
  if (!a || !a.length) return null; let best = null; for (const [x, s] of a) { if (x <= d && x >= addDays(d, -TH.ftdBack)) best = s; } if (best) return best;
  for (const [x, s] of a) if (x > d && x <= addDays(d, TH.ftdFwd)) return s; return null; }

// ---------------- SEC acceptance time -> sessions ----------------
// 'YYYYMMDDHHMMSS' (Eastern clock, as in the EDGAR header) -> ISO UTC string, using the New York offset of that day
export function etToIso(s, nyParts) { const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?$/.exec(String(s || '').trim()); if (!m) return null; const d = m[1] + '-' + m[2] + '-' + m[3], hm = m[4] + ':' + m[5];
  for (const off of [4, 5]) { const x = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + off, +m[5], +(m[6] || 0)), p = nyParts(x); if (p.d === d && p.hm === hm) return new Date(x).toISOString(); }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 5, +m[5], +(m[6] || 0))).toISOString(); }
// x = { d, hm } New York. -> { p: last session whose close is at/before acceptance, kA: the session of the next regular open, phase }
export function sessionsOf(D, x) { const i = firstOnOrAfter(D, x.d), isSess = i < D.length && D[i] === x.d, ph = x.hm < '09:30' ? 'before' : x.hm < '16:00' ? 'during' : 'after';
  if (!isSess) return { p: i - 1, kA: i, phase: 'closed-day' };
  if (ph === 'before') return { p: i - 1, kA: i, phase: ph }; if (ph === 'during') return { p: i - 1, kA: i + 1, phase: ph }; return { p: i, kA: i + 1, phase: ph }; }
export const isExtHm = (hm) => hm < '09:30' || hm >= '16:00';
// B: minute bars [{ ms, o, ny: { d, hm } }] sorted, acceptance ms -> the fill bar (start >= acceptance + 60 s, 04:00-19:59 New York) or null
export function fillBar(M, accMs) { for (const b of M || []) { if (b.ms < accMs + TH.delayMs) continue; if (!b.ny || b.ny.hm < '04:00' || b.ny.hm >= '20:00') continue; if (b.o > 0) return b; } return null; }
// the session 1 of a B fill on New York { d, hm }: the session containing the fill in regular hours, else the next session
export function bSession(D, ny) { const i = firstOnOrAfter(D, ny.d); if (i >= D.length) return { s1: D.length, preOpen: true }; if (D[i] !== ny.d) return { s1: i, preOpen: true };
  if (ny.hm < '09:30') return { s1: i, preOpen: true }; if (ny.hm < '16:00') return { s1: i, preOpen: false }; return { s1: i + 1, preOpen: true }; }

// ---------------- the universe ----------------
export function sharesKnown(series, d, lag = TH.shareLag, maxAge = TH.shareMaxAge) { const lim = addDays(d, -lag), old = addDays(d, -maxAge); let v = null;
  for (const [e, n] of series || []) if (e <= lim && e >= old && n > 0) v = n; return v; }
// -> null if it passes, else the reason
export function universeFail(close, dv20, cap) { if (!(close >= TH.minClose)) return 'price under 1'; if (!(dv20 >= TH.minDv)) return 'traded value'; if (!(cap > 0)) return 'no market value'; if (!(cap < TH.maxCap)) return 'market value 10B+'; return null; }

// ---------------- the trade ----------------
// buy at price e (cache scale) in session s1; openCheck1 = the session-1 open may trigger the stop (fill before that open).
// -> { x, px, kind: stop|time|gone, held, lastClose } or { open: true, mark } or null
export function exitFrom(S, s1, e, openCheck1, T = S.c.length, hold = TH.hold, stopPct = TH.stop) { const { o, l, c } = S; if (!(e > 0) || s1 >= T + 1) return null; const stop = e * (1 - stopPct);
  let last = -1; for (let q = T - 1; q >= 0; q--) if (c[q] > 0) { last = q; break; } const gone = last < T - 6; let lastQ = s1;
  for (let q = s1; q <= s1 + hold - 1; q++) { if (q >= T) return { open: true, mark: c[lastQ] > 0 ? c[lastQ] / e - 1 : null };
    if (gone && q > last) return { x: last, px: c[last], kind: 'gone', held: Math.max(1, last - s1 + 1), lastClose: last };
    if ((q > s1 || openCheck1) && o[q] > 0 && o[q] <= stop) return { x: q, px: o[q], kind: 'stop', held: q - s1 + 1, lastClose: q };
    if (l[q] > 0 && l[q] <= stop) return { x: q, px: stop, kind: 'stop', held: q - s1 + 1, lastClose: q };
    if (c[q] > 0) lastQ = q;
    if (q === s1 + hold - 1) return c[q] > 0 ? { x: q, px: c[q], kind: 'time', held: hold, lastClose: q } : { x: lastQ, px: c[lastQ], kind: 'time', held: hold, lastClose: lastQ }; }
  return null; }
// gross return with a fill slippage s each way (s = 0: none)
export const grossSlip = (entry, exit, s) => (exit * (1 - s)) / (entry * (1 + s)) - 1;

// ---------------- reporting ----------------
export function perYear(rows, key = 'g', cost = COST) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
export function shapeOf(tr) { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), kinds = {};
  for (const z of tr) kinds[z.kind] = (kinds[z.kind] || 0) + 1;
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null, exits: kinds }; }
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST);
  return { n: rows.length, win: rows.length ? r4(net.filter(x => x > 0).length / rows.length) : null, avg: rows.length ? r4(mean(net)) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null }; }

// ---------------- giants (the frozen file) ----------------
// G = { giants: [{ id, name, group: 'base'|'wide', ciks: [..], pitQuarters: [..] | null }] } -> Map cik -> giant
export function giantIndex(G) { const m = new Map(); for (const g of (G && G.giants) || []) for (const c of g.ciks || []) m.set(String(+c), g); return m; }
// is giant g a giant of group grp on date d? base: always (base giants are in both groups); wide-only: point in time by quarter list
export function giantOn(g, grp, d) { if (!g) return false; if (g.group === 'base') return true; if (grp !== 'wide') return false; const q = g.pitQuarters; if (!q) return true;
  const qs = [...q].sort(); const cur = quarterOf(d), first = qs[0]; return qs.includes(cur < first ? first : cur); }

// ---------------- library (before any run; idempotent, append only) ----------------
export function preRegister(LB, date = '2026-10-27') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of Object.values(IDS)) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Squad 25 (a giant newly owns a small company)', name: R.name, agent: 'squad25', kind: 'buy', hold: TH.hold,
      explain: 'RULE (squad25-core.mjs header, exact): a giant on the frozen list data/squad25-giants.json (' + (R.group === 'base' ? 'the owner\'s named giants' : 'FALLBACK wide list: named giants + non-financial top-100 US-listed companies, point in time; judged only if the base rule of the same entry version is TOO FEW CASES') + ') files an original 13F-HR whose holdings show an issuer that was not in its previous 13F (first appearance; first-ever 13F: all), or a Schedule 13D/13G on an issuer (an amendment only if it is the giant\'s first filing on it). Issuer mapped point in time (CUSIP via SEC fails-to-deliver files; subject CIK via Form 3/4/5 spans). At the last close before the SEC acceptance second: close >= 1 USD, market value < 10B USD, 20-day traded value >= 0.5M USD. Entry ' + (R.entry === 'A' ? 'A: the next regular-session open after acceptance.' : 'B: the first Alpaca SIP minute bar starting 60+ seconds after acceptance (extended hours included), +2% worse fill and -2% sale when that bar is outside 09:30-16:00.') + ' Sell at the close of session 10 or at a 25% stop. Costs 0.8% / 1.2% and a 2%-each-way stress version (extra gate). Yardsticks: the average stock (1 USD+, 0.5M USD+ a day) on the same sessions; the same stock on other days; per year vs SPY.',
      status: 'pre-registered ' + date + ' (squad 25 lab); 5-year one-shot pending', sources: ['https://www.sec.gov/Archives/edgar/full-index/', 'https://www.sec.gov/Archives/edgar/daily-index/', 'https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data'],
      libraryCheck: 'SQ24-MEGADEAL (the small company\'s own 8-K naming a top-100 company, bought after the reaction: rejected), SQ21-CONTRACT10D, squad 1 information-edge filings (insiders, 13D activists by funds). New: the filer is the GIANT itself (13F first appearance / 13D / 13G), entry at the first realistic moment after the acceptance second.',
      note: 'The owner\'s +93% day was probably SOUN after NVIDIA\'s first 13F-HR (accepted 14 Feb 2024 16:12 New York). Pre-registered BEFORE any run; run ONCE by squad25-lab.mjs, first complete verdict frozen in data/squad25-lab.json firstRun; forward paper lane from ' + PAPER_START + ' (record only).' }); ch++; }
  if (ch) LB.updated = date; return ch; }
