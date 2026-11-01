// AGENT C CORE (Crowd lane; 1 Nov 2026, the run due Thu 29 Oct). Pure functions, no network, no files. Used by agent-c-lab.mjs (one
// 5-year run per rule, first complete verdict frozen in data/agent-c-lab.json firstRun) and test/agent-c-core.test.mjs. Long only; never
// places an order; no Telegram; no paper lane until a rule passes (a pass goes to forward paper first, CLAUDE.md section 4.5).
//
// PRE-REGISTERED 1 Nov 2026 BEFORE ANY RESULT WAS SEEN (one version each unless stated; the same text is written into
// data/strategy-library.json by the lab before it computes anything). Nothing below may be changed after the first run.
//
// COMMON (squad 1 conventions, copied): LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ on the session BEFORE entry (SPY
//   excluded). EVENT rules: the event is public on its FILING date (no time known -> conservative): buy the OPEN of the first session
//   strictly AFTER that date; sell the CLOSE `hold` sessions later (hold counts the entry session). One open trade per stock per rule.
//   A stock that stops trading is valued at its last close (incl. the cache's sub-3-USD rows). COSTS 0.8% a round trip (1.2% stress).
//   Every gross return, rule and yardstick, capped at +300% alike (AUD-1). JUDGED with value-core.mjs judge (unchanged): halves = signal
//   before / from 2024-01-01; in BOTH halves > 0 after 0.8% and 1.2%, better than the average liquid stock over the same sessions, better
//   than the same stock on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks, block t >= 2.5 -> TRADABLE SMALL (tier 2);
//   block t >= the league bar (about 4.1) -> PROVEN. The TRY SMALL bar (CLAUDE.md 4.5) is reported next to it (trySmallBar).
//
// C-INSQ1  INSIDER CLUSTER + CASH-RICH QUALITY (owner's outside reviewer, 25 Oct 2026; library C-INSQ1).
//   Data: SEC Form 3/4/5 quarterly data sets (2021 on; squad 1's parsed cache, read only; missing quarters downloaded): Form 4 rows with
//   code P (open-market purchase), acquired, shares x price > 0, by a reporting owner who is an officer, director or "other" (an owner that
//   is ONLY a 10% owner, usually a fund, is left out: squad 1 convention). Event day d = the Form 4 FILING date.
//   Cluster: on filing day d (session s = first session on or after d), 2+ DIFFERENT such insiders (reporting-owner CIK) have purchases
//   filed in sessions s-4..s (5 sessions), together 200,000 USD+. The cluster fires on the first such d; the same stock cannot fire again
//   until the session after its trade's exit (one open trade per stock).
//   Company check on the session before entry (t0 = s, the last session on or before d): B-FCF1 (value-core.mjs fcfCheck, unchanged:
//   trailing 4Q FCF yield > 5% on the share count known 30 days earlier x close, revenue growth >= 10% YoY, debt/equity < 0.5, days of
//   inventory < 60 where inventory exists, filings not stale) on the ISSUER CIK of the Form 4 (no ticker lookup), AND close above its
//   200-session average (190+ closes), AND LIQUID.
//   Trade: buy the next open; hold 63; STOP 15%: the first session whose low (close when no low) is at or under 85% of the fill exits at
//   min(that session's open, 85% of the fill) (the open on the entry day is the fill itself). Yardsticks: the average liquid stock over the
//   same sessions (no stop); the same stock on its other days. V15-on-the-same-dates (library text) is NOT computed: this lab has no
//   point-in-time V15 list; recorded as "not computed", it is not a gate.
//   COUNT FIRST (library note): if fewer than 20 signals with a complete hold in either half, the verdict is TOO FEW CASES and no return
//   is computed. Data stop: every insider quarter before the latest must load, and the facts cache must cover 500+ companies; else no verdict.
//
// C-CONG1  US HOUSE MEMBERS' STOCK PURCHASES (STOCK Act periodic transaction reports; library C-CONG1). Two versions: C-CONG1-20, C-CONG1-60.
//   Data (official, public, no login): the House Clerk yearly index https://disclosures-clerk.house.gov/public_disc/financial-pdfs/<YEAR>FD.zip
//   (XML: member, FilingType, FilingDate, DocID) for 2021..this year; every FilingType "P" (PTR) PDF at /public_disc/ptr-pdfs/<YEAR>/<DocID>.pdf,
//   read with pdftotext -layout. Row parser: see parsePtrText (adapted in spirit from trader-skill's trader-pelosi/ptr.py, MIT,
//   github.com/Jakeschincariol/trader-skill; rewritten in JavaScript, no code copied). Senate: no bulk route, left out (House only).
//   Event: every row with transaction type P (purchase), asset type [ST] (stock), a ticker in parentheses, any amount; signal day = the
//   PTR FILING date from the index (never the trade date). The ticker must have prices within 5 sessions of the entry. Several members /
//   rows in the same stock: one open trade per stock. Hold 20 (C-CONG1-20) and 60 (C-CONG1-60) sessions; no stop.
//   Data stop (no verdict, NEEDS DATA): any yearly index missing; under 98% of text PTRs downloaded; scanned (image) PTRs over 25% of all
//   PTRs; or under 90% of [ST] rows with a ticker. Scanned PTRs cannot be read without OCR and are left out (reported; Dong, Xu & Yu
//   2026 find unreadable filings are the MORE profitable ones, so leaving them out biases this test against an edge).
//
// EXP-CONG1  (pre-registered 23 Oct 2026 in expert-core.mjs; run here with its exact rule and expert-core's own functions): a purchase by a
//   House member ranked top 10% by his/her earlier disclosed purchases (PITRanker: 126-session excess over the average stock, min 5
//   resolved, at least 30 eligible members that day, success rate and average excess percentiles); one call per member and stock per
//   30 days; buy the next open after the FILING date; liquid; hold 126; disaster stop = the next open after a close 35% under the buy
//   (walkHold); one open trade per stock; halves split at the median signal session (expert convention); judge + SKILL gate: better
//   (average after cost AND edge) than the same rule using every member (no ranking) in both halves.
export const COST = 0.008, SPLIT = '2024-01-01', CAP = 3;
export const INSQ = { window: 5, minPeople: 2, minUsd: 200000, hold: 63, stop: 0.15, minCount: 20 };
export const CONG = { holds: [20, 60], minIdx: 1.0, minPdf: 0.98, maxScanned: 0.25, minTicker: 0.90, fromYear: 2021 };
export const RULE_IDS = ['C-INSQ1', 'C-CONG1-20', 'C-CONG1-60', 'EXP-CONG1'];
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => isFinite(g) ? Math.min(g, CAP) : g;

// ---------------- C-INSQ1: clusters ----------------
// rows: [{ sym, cik, d, who, usd, insider }] (insider = officer / director / other). sessOf(d) = index of the first session on or after d.
// Returns the firing events [{ sym, cik, d, s, people, usd }] in date order; a stock fires once per date at most; the caller applies
// the one-open-trade rule (a fire while a trade is open is skipped).
export function insiderClusters(rows, sessOf, { window = INSQ.window, minPeople = INSQ.minPeople, minUsd = INSQ.minUsd } = {}) {
  const by = new Map(); for (const r of rows) { if (!r.insider || !(r.usd > 0) || !r.sym || !r.d) continue; (by.get(r.sym) || by.set(r.sym, []).get(r.sym)).push({ ...r, s: sessOf(r.d) }); }
  const out = [];
  for (const [sym, a] of by) { a.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0); const days = [...new Set(a.map(z => z.d))];
    for (const d of days) { const s = sessOf(d), w = a.filter(z => z.s >= s - window + 1 && z.s <= s && z.d <= d), who = new Set(w.map(z => z.who)), usd = w.reduce((u, z) => u + z.usd, 0);
      if (who.size >= minPeople && usd >= minUsd) out.push({ sym, cik: (a.find(z => z.d === d) || {}).cik || null, d, s, people: who.size, usd: Math.round(usd) }); } }
  return out.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : x.sym < y.sym ? -1 : 1); }

// 15% stop walk: O/L/C arrays of one stock; buy the open of k; returns { x, g, kind } or null (no fill / hold not complete).
// low at or under 85% of the fill -> exit min(open that session, 85% of fill) (entry session: 85% of fill); else the close of k+hold-1
// (the last close available when the stock stopped trading).
export function stopWalk(O, L, C, k, hold, stop = INSQ.stop) { const e = O[k]; if (!(e > 0)) return null; const last = k + hold - 1; if (last >= C.length) return null; const lvl = e * (1 - stop);
  for (let q = k; q <= last; q++) { const lo = L[q] > 0 ? L[q] : C[q]; if (lo > 0 && lo <= lvl) { const o = q > k && O[q] > 0 ? Math.min(O[q], lvl) : lvl; return { x: q, g: o / e - 1, kind: 'stop' }; } }
  for (let q = last; q >= k; q--) if (C[q] > 0) return { x: last, g: C[q] / e - 1, kind: 'time' }; return null; }

// rolling 200-session average with 190+ valid closes (NaN when not enough)
export function sma200(C) { const out = new Float64Array(C.length).fill(NaN); let s = 0, n = 0;
  for (let t = 0; t < C.length; t++) { if (C[t] > 0) { s += C[t]; n++; } if (t >= 200 && C[t - 200] > 0) { s -= C[t - 200]; n--; } if (t >= 199 && n >= 190) out[t] = s / n; } return out; }

// ---------------- C-CONG1: House Clerk index and PTR text ----------------
const usDate = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : null; };
const tagOf = (b, t) => { const m = new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>').exec(b); return m ? m[1].trim() : ''; };
// <YEAR>FD.xml -> [{ docId, type, filed, last, first, state, year }]
export function parseFdIndex(xml) { const out = []; for (const m of String(xml || '').matchAll(/<Member>([\s\S]*?)<\/Member>/g)) { const b = m[1];
    out.push({ docId: tagOf(b, 'DocID'), type: tagOf(b, 'FilingType'), filed: usDate(tagOf(b, 'FilingDate')), last: tagOf(b, 'Last'), first: tagOf(b, 'First'), state: tagOf(b, 'StateDst'), year: tagOf(b, 'Year') }); }
  return out; }
// a transaction row anchor in pdftotext -layout output: type, transaction date, notification date, amount (lower bound)
const ANCHOR = /(?:^|\s)(P|S|S \(partial\)|E)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(?:\$([\d,]+)|(Spouse\/DC Over \$1,000,000|Over \$[\d,]+))/;
const TICK = /\(([A-Z][A-Z0-9.\-]{0,7})\)\s*(?:-\s*)?(?:\$[\d,]+\s*)?\[([A-Z]{2,3})\]/;
const TAGONLY = /\[([A-Z]{2,3})\]/;
// -> { rows: [{ type, trade, notified, lo, hi, ticker, asset }], anchors, st, stTicker, text: chars }
export function parsePtrText(txt) { const lines = String(txt || '').replace(/\f/g, '\n').split(/\r?\n/), A = [];
  lines.forEach((l, j) => { const m = ANCHOR.exec(l); if (m) A.push({ j, m }); });
  const rows = []; let st = 0, stTicker = 0;
  A.forEach(({ j, m }, n) => { const end = n + 1 < A.length ? A[n + 1].j : Math.min(lines.length, j + 8), prevEnd = n ? A[n - 1].j + 1 : Math.max(0, j - 3);
    const after = lines.slice(j, end).map(l => l.replace(ANCHOR, ' ')).join(' ').replace(/\s+/g, ' '), before = lines.slice(Math.max(prevEnd, j - 2), j).join(' ').replace(/\s+/g, ' ');
    let tk = TICK.exec(after), tg = TAGONLY.exec(after); if (!tk && !tg) { tk = TICK.exec(before); tg = TAGONLY.exec(before); }
    const asset = tk ? tk[2] : tg ? tg[1] : null; const tail = lines[j].slice(m.index + m[0].length - 1), hiM = /-\s*\$([\d,]+)/.exec(tail) || (/-\s*$/.test(tail) ? /\$([\d,]+)/.exec(lines.slice(j + 1, end).join(' ')) : null);
    const lo = m[4] ? +m[4].replace(/,/g, '') : 1000001, hi = hiM ? +hiM[1].replace(/,/g, '') : null;
    if (asset === 'ST') { st++; if (tk) stTicker++; }
    rows.push({ type: m[1] === 'S (partial)' ? 'S' : m[1], trade: usDate(m[2]), notified: usDate(m[3]), lo, hi: hi && hi > lo ? hi : null, ticker: tk ? tk[1].replace(/-/g, '.') : null, asset }); });
  return { rows, anchors: A.length, st, stTicker, chars: String(txt || '').replace(/\s/g, '').length }; }
// a PTR whose text layer is (nearly) empty is a scanned / handwritten filing
export const isScanned = (p) => p.chars < 400 && p.anchors === 0;
// the purchase events of one parsed PTR (stock rows with a ticker)
export const purchases = (p) => p.rows.filter(r => r.type === 'P' && r.asset === 'ST' && r.ticker);
// data stop for C-CONG1 -> { ok, why[] }
export function congDataOk({ years, yearsOk, ptrs, downloaded, scanned, st, stTicker }) { const why = [];
  if (yearsOk < years) why.push('yearly index missing (' + yearsOk + '/' + years + ')');
  const text = ptrs - scanned; if (!(ptrs > 0) || downloaded < (ptrs) * CONG.minPdf) why.push('PTR PDFs downloaded ' + downloaded + '/' + ptrs + ' (98% needed)');
  if (ptrs > 0 && scanned / ptrs > CONG.maxScanned) why.push('scanned PTRs ' + (100 * scanned / ptrs).toFixed(0) + '% (25% max)');
  if (!(st > 0) || stTicker / st < CONG.minTicker) why.push('stock rows with a ticker ' + stTicker + '/' + st + ' (90% needed)');
  if (text <= 0) why.push('no text PTRs');
  return { ok: !why.length, why }; }

// ---------------- the TRY SMALL bar (CLAUDE.md 4.5; reported next to the judge, never instead of it) ----------------
export function trySmallBar(R) { const H = ['older', 'newer'].map(k => R[k] || {});
  return H.every(r => r.n >= 20 && r.blocks >= 3 && r.avgStress > 0 && r.edge > 0 && r.noTop2 > 0); }

// ---------------- library pre-registration (append / update own entries before any computation; idempotent) ----------------
const SRC = { cong: ['https://disclosures-clerk.house.gov/public_disc/financial-pdfs/', 'https://github.com/Jakeschincariol/trader-skill (MIT; trader-pelosi/ptr.py, idea of the parser)', 'https://www.nber.org/papers/w35041'],
  insq: ['https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets', 'value-core.mjs fcfCheck (B-FCF1)'] };
export function preRegister(LB, date = '2026-11-01') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0; const by = (id) => LB.strategies.find(x => x.id === id);
  const set = (id, fields, base = {}) => { let e = by(id); if (!e) { e = { id, ...base }; LB.strategies.push(e); ch++; } if (e.preRegistered === date) return; Object.assign(e, fields, { preRegistered: date }); ch++; };
  set('C-INSQ1', { status: 'pre-registered ' + date + ' (agent-c-core.mjs header, exact rule); built agent-c-lab.mjs; one-shot pending', study: 'agent-c-lab.mjs -> data/agent-c-lab.json firstRun', sources: SRC.insq,
    rule: '2+ different insiders (officer/director/other; 10%-only owners out) with Form 4 open-market purchases filed in 5 sessions, together 200k USD+, fires on the filing date; issuer passes B-FCF1 (fcfCheck by issuer CIK), close above 200-day, liquid (5 USD+, 5M USD/day) on the session before entry; buy next open, hold 63, stop 15% (intraday low); one open trade per stock; count first (20 per half or TOO FEW, no returns). V15 same-date yardstick not computed (no point-in-time V15 list).' });
  for (const H of CONG.holds) set('C-CONG1-' + H, { status: 'pre-registered ' + date + ' (agent-c-core.mjs header); built agent-c-lab.mjs; one-shot pending', study: 'agent-c-lab.mjs -> data/agent-c-lab.json firstRun', sources: SRC.cong,
    rule: 'Every House PTR row: type P, asset [ST], ticker given; signal = the PTR FILING date (House Clerk yearly index); buy the open of the first session after it; liquid the session before; hold ' + H + ' sessions; no stop; one open trade per stock. House only (no bulk Senate route). Scanned PTRs left out (no OCR). Data stop: index complete, 98% of PDFs read, scanned <= 25%, 90% of stock rows with a ticker.' },
    { family: 'Crowd', agent: 'C', name: 'US House members\' stock purchases, filing date, hold ' + H, explain: 'C-CONG1 version with a ' + H + '-session hold (agent-c-core.mjs).' });
  { const e = by('C-CONG1'); if (e && e.preRegistered !== date) { e.status = 'pre-registered ' + date + ' as C-CONG1-20 / C-CONG1-60 (agent-c-core.mjs); built agent-c-lab.mjs; one-shot pending'; e.preRegistered = date; ch++; } }
  { const e = by('EXP-CONG1'); if (e && e.builtBy !== 'C') { e.status = 'built ' + date + ' by Agent C in agent-c-lab.mjs with the expert-core.mjs rule (pre-registered 23 Oct 2026, unchanged) on House Clerk PTR data; one-shot pending'; e.builtBy = 'C'; e.data = 'House Clerk yearly index + PTR PDFs (official, public); House only'; ch++; } }
  if (ch) LB.updated = date; return ch; }
