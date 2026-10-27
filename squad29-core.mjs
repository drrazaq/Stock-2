// SQUAD 29 CORE (27 Oct 2026; Stock-2): RED-FLAG SEC FILINGS AS SELL WARNINGS. Pure functions, no network, no files. Used by squad29-lab.mjs
// and test/squad29-core.test.mjs. PURPOSE: protect money, not find buys. The owner is long-only (no shorting) and holds ~12 stocks; a flag
// that is followed by clear underperformance becomes a SELL WARNING for a held stock and a BLOCK on a new buy. Never places an order.
//
// WHAT WAS ALREADY THERE (read before writing this; not repeated): events-study.mjs tags 8-K items 3.01 (DELIST), 4.01 (AUDITOR) and 4.02
// (RESTATE) as WARNING families but only on ~2,400 stocks after a same-day price jump, with n = 0-15 per half and no verdict (sign -1 = not
// tested as a buy). MGMT (any 5.02, as a buy) REJECTED. news-watch.mjs flags 'going concern' words in headlines (no test). Library risk rules
// E12, S4 (reverse split aftermath), S2 / C-NSI1 (dilution avoid) cover other risks. NOTHING in data/strategy-library.json tests 4.02, a
// RESIGNED auditor, an abrupt CEO/CFO exit without successor, NT 10-K/10-Q, first-time going-concern language or 3.01 on the whole market
// as a warning for holders. New here: whole market incl. dead stocks, the EDGAR acceptance time, a stock that stops trading = -100%.
//
// ================= PRE-REGISTERED 27 Oct 2026, BEFORE ANY RESULT. Each family is tested ONCE, separately; the bar is never lowered. ============
// SOURCE (official only, SEC_UA, cached): SEC EDGAR submissions (data.sec.gov/submissions/CIK##########.json and its older pages) of every
// company whose CIK maps to a stock in the price cache: form, items, acceptanceDateTime (UTC, sec-time.mjs), primary document. Going-concern
// language: EDGAR full-text search (efts.sec.gov) of 10-K / 10-Q. Documents are read from www.sec.gov/Archives. Daily lane: EDGAR daily
// master index -> re-read the submissions of companies that filed.
// FAMILIES (form exactly as named; amendments such as 8-K/A, NT 10-K/A, 10-K/A are left out):
//   F1 RESTATE      8-K whose items include 4.02 (non-reliance on previously issued financial statements).
//   F2 AUDRESIGN    8-K whose items include 4.01 AND whose primary document passes auditorResigned(): a sentence with a resignation word
//                   (resign / resigned / resigns / resignation) or a decline-to-stand phrase (declined / declines / decline / elected not / will
//                   not / not) to stand for re-election / re-appointment / reappointment, IN THE SAME SENTENCE as an auditor word (accountant,
//                   auditor, accounting firm, LLP, independent registered); the sentence must not contain 'did not resign' / 'has not resigned'
//                   / 'not resign'; and NOT a firm combination: no word merger / merged / combination / combined / acquired / acquisition /
//                   acquire / joined / attest business within 400 characters either side of the matched sentence. A routine DISMISSAL is
//                   not F2.
//   F3 EXECGONE     8-K whose items include 5.02 AND whose primary document passes execDeparture(text, filing date):
//                   (a) a sentence with a departure word (resign*, retire*, terminat*, depart*, step(s/ped/ping) down, will leave, left the
//                       Company, separat*, removed, ceased to serve / cease to serve) AND an office term: Chief Executive Officer, CEO,
//                       Principal Executive Officer (office CEO) or Chief Financial Officer, CFO, Principal Financial Officer (office CFO);
//                   (b) effective within 30 days: the sentence does NOT contain an orderly-transition phrase (upon the appointment of,
//                       until a successor / his successor / her successor / their successor, until such time, transition period, continue
//                       to serve until, remain ... until) and the first full date in it (Month D, YYYY) is not later than the filing date
//                       + 30 calendar days (no date stated = effective now);
//                   (c) no successor named: NO sentence in the document holds an appointment word (appoint*, named, elect*, promot*, hired,
//                       will serve as, to serve as, will assume, has assumed, will succeed, succeeds, succeeded) together with the SAME office
//                       term, unless that sentence also holds search / until a successor / until such time / identif* / will be named /
//                       to be named. An INTERIM appointment counts as a successor named.
//                   A departing office (CEO or CFO) that passes (a)-(c) makes the filing F3.
//   F4 LATEFILE     form NT 10-K or NT 10-Q (notification of late filing).
//   F5 GOINGCONCERN form 10-K or 10-Q that the full-text search finds with BOTH phrases "substantial doubt" and "ability to continue as a going
//                   concern" (any document of the filing), whose PREVIOUS periodic filing of the same CIK (10-K or 10-Q, the latest filed before
//                   it, within 400 days, filed 2020-09-01 or later so the search covered it) is NOT found by the same search, AND whose primary
//                   document holds an AFFIRMATIVE sentence (goingConcernAffirmative): 'substantial doubt' and 'going concern' in one sentence,
//                   an assertion word right before 'substantial doubt' (raise(s/d) / raising / create(s/d) / indicate(s/d) / there is / there
//                   exists / gave or give rise to / result(s/ed) in / cast(s) / has / have, up to 3 words between) or 'substantial doubt'
//                   followed within 3 words by exists / existed / remains, with NO could / may / might / would / can / not / no / did not /
//                   does not / do not / eliminat* in the 6 words before 'substantial doubt', and no 'alleviat*' anywhere in the sentence.
//                   No previous periodic filing found -> not F5 (a new registrant cannot be 'first time').
//   F6 DELISTNOTICE 8-K whose items include 3.01 (notice of delisting or failure to satisfy a listing rule or standard).
// COMPANY -> STOCK: the filing's CIK -> the point-in-time ticker (SEC Form 3/4/5 issuer-ticker spans of that CIK covering the date, squad 4's
//   cache, then today's SEC list) with prices near the date; never today's list alone. A renamed ticker of the same CIK that starts trading
//   within 5 sessions after the old one stops is followed (not a stop).
// TIMING: acceptance time (UTC) -> New York clock. Accepted before 09:30 on a session day -> entry at that session's open; otherwise the open
//   of the next session (sec-time.mjs rule). k = the entry session.
// UNIVERSE (main view): on session k-1 close >= 3 USD and 20-session average traded value (close x volume, all rows) >= 2M USD. Also reported
//   (information only, never the verdict): the 1 USD view (close >= 1 USD, same 2M USD). Whole market incl. dead stocks. One event per stock
//   per family per 60 sessions (a repeat within 60 sessions of a counted event of the same family is skipped). Events with k from the 21st
//   session of the price cache to the latest session with a complete window. Windows holding a split artifact (whole-ratio 3x-50x one-day
//   jump, squad 4 convention) are left out, for the event and for every yardstick stock alike.
// MEASURE: horizons H = 5, 20, 60 sessions. Return = (close of session x = k + H - 1) / (open of session k), minus 1 (if the stock has no open
//   on k: the first later open; x = max(x, that session)). A stock that STOPS TRADING (its last close, after following a rename, is before x while the
//   cache reaches x) = -100% (a delisted stock is a real loss), for the event AND the yardstick alike. Every gross return capped at +300%
//   (AUD-1) for the event and the yardstick alike. The AVERAGE STOCK = the equal-weight mean over every stock of the same universe on k-1
//   (same view), the same sessions k..x, same rules. EXCESS = event return - average stock. The stock's OWN OTHER DAYS = the mean of the same
//   stock's H-session windows starting every 10 sessions (in the same universe the day before), none overlapping any of its own flag events
//   (any family) +-H sessions; 3+ windows needed; reported as information.
// REPORTED per family x view x horizon x half (before / from 2024-01-01 by the acceptance date): n, mean, median, mean of the average stock,
//   mean excess, median excess, % that underperformed (excess < 0), block t of the excess (blocks: entry session in blocks of 21 sessions
//   for H = 5 and 20, 63 sessions for H = 60; 3+ blocks needed; t = mean of block means / (sd / sqrt(blocks))), share that stopped trading,
//   mean vs own other days.
// DECISION RULE: a family becomes a SELL WARNING if, for H = 20 OR H = 60 (the same horizon in both halves), in BOTH halves of the 3 USD view:
//   n >= 20, mean excess <= -3% and block t <= -2.5. Otherwise INFORMATION ONLY. First complete verdict frozen (first-run.mjs freezeEach).
// LIVE OUTPUT: data/squad29-flags-today.json = every flag accepted in the last 5 sessions on any stock with a ticker (universe noted), with its
//   frozen verdict; the lead wires it into SELL / HOLD text later. Holdings (data/my-positions.json, READ ONLY) checked for flags in the last
//   90 days. Record only: no Telegram, no orders.
export const SPLIT = '2024-01-01', CAP = 3, HS = [5, 20, 60], BLOCK = { 5: 21, 20: 21, 60: 63 }, GAP = 60, OWN_STEP = 10, OWN_MIN = 3, RENAME_SESS = 5;
export const VIEWS = { v3: { minClose: 3, minDv: 2e6 }, v1: { minClose: 1, minDv: 2e6 } };
export const BAR = { under: -0.03, t: -2.5, n: 20, horizons: [20, 60] };
export const GC_FROM = '2020-09-01', PREV_DAYS = 400, TODAY_SESS = 5, HOLD_DAYS = 90;
export const FAMILIES = {
  F1: { id: 'SQ29-F1-RESTATE', name: '8-K Item 4.02: past financial statements can no longer be relied on (a restatement)' },
  F2: { id: 'SQ29-F2-AUDRESIGN', name: '8-K Item 4.01: the auditor RESIGNED or declined to stand (not a routine dismissal)' },
  F3: { id: 'SQ29-F3-EXECGONE', name: '8-K Item 5.02: the CEO or CFO leaves within 30 days with no successor named' },
  F4: { id: 'SQ29-F4-LATEFILE', name: 'NT 10-K / NT 10-Q: the company says its annual or quarterly report will be late' },
  F5: { id: 'SQ29-F5-GOINGCONCERN', name: 'First-time going-concern doubt in a 10-K / 10-Q (not in the previous report)' },
  F6: { id: 'SQ29-F6-DELISTNOTICE', name: '8-K Item 3.01: notice of delisting or failure to meet a listing standard' },
};
export const FAM_KEYS = Object.keys(FAMILIES);

// ---------------- small helpers ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
export const halfOf = (d) => String(d) < SPLIT ? 'older' : 'newer';
const DAY = 864e5;
export const addDays = (d, n) => new Date(Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
export function firstOnOrAfter(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; }
export const parseItems = (s) => String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);

// ---------------- filing -> candidate family (before any text test) ----------------
// row = { form, items } ; returns the families this filing is a CANDIDATE for: F1, F4, F6 are final; F2, F3 need the text test; 'P' = periodic
export function candidateFams(row) { const f = String(row.form || '').toUpperCase().trim(), it = new Set(parseItems(row.items)), out = [];
  if (f === '8-K') { if (it.has('4.02')) out.push('F1'); if (it.has('4.01')) out.push('F2'); if (it.has('5.02')) out.push('F3'); if (it.has('3.01')) out.push('F6'); }
  if (f === 'NT 10-K' || f === 'NT 10-Q') out.push('F4');
  if (f === '10-K' || f === '10-Q') out.push('P');
  return out; }
export const isPeriodic = (form) => form === '10-K' || form === '10-Q';

// ---------------- text ----------------
export function html2text(h) { return String(h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '. ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&#8217;|&rsquo;|&#x2019;/gi, '\'').replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&#x201[cd];/gi, '"').replace(/&#821[12];|&ndash;|&mdash;/gi, '-')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/(\.\s*){2,}/g, '. ').trim(); }
const ABBR = /\b(Mr|Ms|Mrs|Dr|Inc|Corp|Co|Ltd|Jr|Sr|St|No|Nos|L\.L\.P|L\.L\.C|P\.C|P\.A|U\.S|N\.A|S\.A|vs|approx)\./g;
export function sentences(text) { return String(text || '').replace(ABBR, '$1').split(/(?<=[.!?])\s+(?=[A-Z0-9"(“])/).map(s => s.trim()).filter(Boolean); }

// F2: the auditor resigned / declined to stand; not a dismissal, not a firm combination
const RESIGN = /\b(resign(?:ed|s|ation)?|(?:declin(?:ed|es|e)|elected not|will not|not)\s+to\s+stand\s+for\s+(?:re-?election|re-?appointment|reappointment)|(?:will not|not|declined to|declines to)\s+stand\s+for\s+(?:re-?election|re-?appointment|reappointment))\b/i;
const AUDWORD = /\b(accountants?|auditors?|accounting firm|LLP|independent registered)\b/i;
const NOTRESIGN = /\b(did not resign|has not resigned|not resign)\b/i;
const COMBINE = /\b(merger|merged|combination|combined|acquired|acquisition|acquire|joined|attest business)\b/i;
export function auditorResigned(text) { const t = String(text || ''), S = sentences(t); let pos = 0;
  for (const s of S) { const at = t.indexOf(s.slice(0, 60), pos); if (at >= 0) pos = at;
    if (!RESIGN.test(s) || !AUDWORD.test(s) || NOTRESIGN.test(s)) continue;
    const a = Math.max(0, (at >= 0 ? at : 0) - 400), win = t.slice(a, (at >= 0 ? at : 0) + s.length + 400);
    if (COMBINE.test(win) || COMBINE.test(s)) continue; return { sentence: s.slice(0, 400) }; }
  return null; }

// F3: CEO / CFO departure, effective within 30 days, no successor named
const DEPART = /\b(resign\w*|retire\w*|terminat\w*|depart\w*|step(?:s|ped|ping)? down|will leave|left the company|separat\w*|removed|ceased to serve|cease to serve)\b/i;
const OFFICE = { CEO: /\b(chief executive officer|CEO|principal executive officer)\b/i, CFO: /\b(chief financial officer|CFO|principal financial officer)\b/i };
const ORDERLY = /\b(upon the appointment of|until (?:a|his|her|their) successor|until such time|transition period|continue to serve (?:\w+\s+){0,6}until|remain (?:\w+\s+){0,8}until)\b/i;
const APPOINT = /\b(appoint\w*|named|elect\w*|promot\w*|hired|will serve as|to serve as|will assume|has assumed|will succeed|succeeds|succeeded)\b/i;
const SEARCHING = /\b(search|until a successor|until such time|identif\w*|will be named|to be named)\b/i;
const MON = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
export function firstDate(s) { const m = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(String(s || ''));
  return m ? m[3] + '-' + String(MON[m[1].toLowerCase()]).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0') : null; }
export function execDeparture(text, filed) { const S = sentences(text), out = [];
  for (const office of ['CEO', 'CFO']) { const re = OFFICE[office];
    const dep = S.find(s => DEPART.test(s) && re.test(s) && !ORDERLY.test(s) && (() => { const d = firstDate(s); return !d || !filed || d <= addDays(filed, 30); })());
    if (!dep) continue;
    const succ = S.some(s => APPOINT.test(s) && re.test(s) && !SEARCHING.test(s));
    if (!succ) out.push({ office, sentence: dep.slice(0, 400) }); }
  return out.length ? out : null; }

// F5: an affirmative going-concern sentence
const GC_ASSERT = /\b(raise[sd]?|raising|create[sd]?|indicate[sd]?|there is|there exists|gave rise to|give rise to|gives rise to|result(?:s|ed)? in|casts?|has|have)\s+(?:[\w'’,-]+\s+){0,3}substantial doubt/i;
const GC_EXISTS = /substantial doubt\s+(?:[\w'’,-]+\s+){0,3}(exists|existed|remains)\b/i;
const GC_NEG = /\b(could|may|might|would|can|not|no|did not|does not|do not|eliminat\w*)\b/i;
export function goingConcernAffirmative(text) { for (const s of sentences(text)) { if (!/substantial doubt/i.test(s) || !/going concern/i.test(s) || /alleviat/i.test(s)) continue;
    const i = s.search(/substantial doubt/i), before = s.slice(0, i).trim().split(/\s+/).slice(-6).join(' ');
    if (GC_NEG.test(before)) continue; if (GC_ASSERT.test(s) || GC_EXISTS.test(s)) return { sentence: s.slice(0, 400) }; }
  return null; }

// previous periodic filing of the same company (rows sorted by filing date, each { form, fd, adsh })
export function previousPeriodic(rows, adsh) { const i = rows.findIndex(r => r.adsh === adsh); if (i < 0) return null; const me = rows[i];
  for (let j = i - 1; j >= 0; j--) { const r = rows[j]; if (!isPeriodic(r.form) || r.fd > me.fd || r.adsh === adsh) continue; return r.fd >= addDays(me.fd, -PREV_DAYS) ? r : null; }
  return null; }

// ---------------- timing ----------------
// entry session from the New York date / time of the acceptance (secNY output { d, hm }); D sorted session dates; returns index (may be D.length)
export function entryIdx(D, ny) { if (!ny || !ny.d) return -1; const i = firstOnOrAfter(D, ny.d);
  if (i < D.length && D[i] === ny.d && ny.hm && ny.hm < '09:30') return i; return D[i] === ny.d ? i + 1 : i; }

// one event per stock per family per GAP sessions (events sorted by k)
export function dedupe(events, gap = GAP) { const last = new Map(), out = []; for (const e of [...events].sort((a, b) => a.k - b.k || String(a.adsh).localeCompare(String(b.adsh)))) {
    const key = e.fam + '|' + e.i, l = last.get(key); if (l !== undefined && e.k < l + gap) continue; last.set(key, e.k); out.push(e); } return out; }

// ---------------- returns ----------------
// px = { o, c } Float32 arrays of one symbol, first / last = its first and last session with a close, T sessions; next = the rename successor
// ({ px, first, last, next }) or null. Gross return from the open of session k (or the first later open) to the close of x; -1 if the stock
// stopped trading before x (and the cache reaches x); null if not measurable (window beyond the cache, no entry price).
export function windowRet(S, k, x, T) { if (x > T - 1) return null; let s = S, guard = 0;
  while (s && k > s.last && guard++ < 5) s = s.next && s.next.first > s.last && s.next.first <= s.last + RENAME_SESS ? s.next : null;
  if (!s) return -1;
  let q = k; while (q <= s.last && !(s.px.o[q] > 0)) q++; if (q > s.last) return -1; const e = s.px.o[q]; if (q > x) x = q;
  const closeAt = (P, a, b) => { for (let z = b; z >= a; z--) if (P.c[z] > 0) return P.c[z]; return null; };
  let g = 1, from = q, cur = s, entry = e;
  for (let n = 0; n < 6; n++) { if (x <= cur.last) { const y = closeAt(cur.px, from, x); return y > 0 ? g * (y / entry) - 1 : null; }
    const yl = closeAt(cur.px, from, cur.last); if (!(yl > 0)) return null; g *= yl / entry;
    const nx = cur.next; if (!nx || !(nx.first > cur.last && nx.first <= cur.last + RENAME_SESS)) return -1;
    cur = nx; from = nx.first; entry = nx.px.c[nx.first]; if (!(entry > 0)) return -1; }
  return null; }

// ---------------- statistics ----------------
export function blockT(rows, block) { const by = new Map(); for (const r of rows) { const b = Math.floor(r.k / block); (by.get(b) || by.set(b, []).get(b)).push(r.ex); }
  const m = [...by.values()].map(mean); if (m.length < 3) return { t: null, blocks: m.length }; const mu = mean(m), sd = Math.sqrt(m.reduce((u, w) => u + (w - mu) ** 2, 0) / (m.length - 1));
  return { t: sd > 0 ? r4(mu / (sd / Math.sqrt(m.length))) : null, blocks: m.length }; }
// rows: { k, g (capped gross), y (average stock), own (or null) }
export function halfStats(rows, H) { const ex = rows.map(r => r.g - r.y), bt = blockT(rows.map(r => ({ k: r.k, ex: r.g - r.y })), BLOCK[H]), own = rows.filter(r => ok(r.own));
  return { n: rows.length, mean: r4(mean(rows.map(r => r.g))), median: r4(median(rows.map(r => r.g))), avgStock: r4(mean(rows.map(r => r.y))), excess: r4(mean(ex)), medianExcess: r4(median(ex)),
    pctUnder: rows.length ? r4(ex.filter(x => x < 0).length / rows.length) : null, blockT: bt.t, blocks: bt.blocks, stopped: rows.length ? r4(rows.filter(r => r.g === -1).length / rows.length) : null,
    vsOwn: own.length ? r4(mean(own.map(r => r.g - r.own))) : null, nOwn: own.length }; }
// the pre-registered decision on the 3 USD view results { [H]: { older, newer } }
export function decide(res) { const pass = [], why = [];
  for (const H of BAR.horizons) { const o = res && res[H] && res[H].older, n = res && res[H] && res[H].newer; if (!o || !n) { why.push(H + ' sessions: no result'); continue; }
    const fails = []; for (const [k, h] of [['older', o], ['newer', n]]) { if (!(h.n >= BAR.n)) fails.push(k + ' n ' + h.n + ' < ' + BAR.n); if (!(ok(h.excess) && h.excess <= BAR.under)) fails.push(k + ' excess ' + (ok(h.excess) ? (h.excess * 100).toFixed(1) + '%' : 'n/a') + ' not <= -3%');
      if (!(ok(h.blockT) && h.blockT <= BAR.t)) fails.push(k + ' block t ' + (ok(h.blockT) ? h.blockT : 'n/a') + ' not <= -2.5'); }
    if (!fails.length) pass.push(H); else why.push(H + ' sessions: ' + fails.join('; ')); }
  return pass.length ? { verdict: 'SELL-WARNING', horizons: pass, why: 'underperformed the average stock by 3%+ with block t <= -2.5 and n >= 20 in both halves over ' + pass.join(' and ') + ' sessions' }
    : { verdict: 'INFO', horizons: [], why: why.join(' | ') }; }

// ---------------- library (idempotent pre-registration; append only) ----------------
export function preRegister(LB, date = '2026-10-27') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  const base = { family: 'Squad 29 (red-flag SEC filings as SELL warnings)', agent: 'squad29', kind: 'risk', status: 'pre-registered ' + date + ' (squad 29 lab); one-shot pending',
    sources: ['https://data.sec.gov/submissions/ (EDGAR submissions: form, items, acceptanceDateTime)', 'https://efts.sec.gov/LATEST/search-index (EDGAR full-text search)', 'https://www.sec.gov/Archives/edgar/'],
    libraryCheck: 'events-study RESTATE / AUDITOR / DELIST (8-K 4.02 / 4.01 / 3.01 after a same-day jump on ~2,400 stocks: n 0-15 per half, no verdict), MGMT (any 5.02 as a buy: rejected), news-watch going-concern headline words (untested), risk rules E12, S4, S2 / C-NSI1. New: whole market incl. dead stocks, acceptance time, -100% for a stock that stops trading, text rules for a RESIGNED auditor and an abrupt CEO/CFO exit without successor, FIRST-time going-concern language, judged as a SELL warning for holders.',
    explain: 'RULE (squad29-core.mjs header, exact): entry the next open after the EDGAR acceptance; returns over 5 / 20 / 60 sessions vs the equal-weight average stock of the same universe (close 3+ USD, 20-day traded value 2M+ USD, whole market incl. dead stocks) on the same sessions; a stock that stops trading = -100% (event and yardstick alike); +300% cap both sides; one event per stock per family per 60 sessions. SELL WARNING if over 20 or 60 sessions (same horizon) BOTH halves (before / from 2024) have n >= 20, mean underperformance <= -3% and block t <= -2.5; else information only.' };
  for (const [k, f] of Object.entries(FAMILIES)) { if (LB.strategies.some(x => x.id === f.id)) continue; LB.strategies.push({ ...base, id: f.id, flag: k, hold: 60, name: 'RED FLAG ' + k + ': ' + f.name }); ch++; }
  if (ch) LB.updated = date; return ch; }
