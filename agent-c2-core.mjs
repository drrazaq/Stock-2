// AGENT C CORE 2 (Crowd lane; the 5 Nov 2026 run, restarted 6 Nov 2026). Pure functions, no network, no files. Used by agent-c2-lab.mjs
// (one 5-year run per rule, first complete verdict frozen in data/agent-c2-lab.json firstRun) and test/agent-c2-core.test.mjs. Long only;
// never places an order; no Telegram; no paper lane until a rule passes (a pass goes to forward paper first, CLAUDE.md section 4.5).
//
// PRE-REGISTERED 6 Nov 2026 BEFORE ANY RESULT WAS SEEN (the same text goes into data/strategy-library.json before anything is computed).
// Nothing below may be changed after the first run; a genuine bug fix goes to correctedRun with a written reason.
//
// COMMON (agent-c-core.mjs conventions, unchanged): LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ on the session
//   BEFORE entry (SPY excluded). Sell the CLOSE `hold` sessions after entry (hold counts the entry session). One open trade per stock per
//   rule. A stock that stops trading is valued at its last close (incl. the cache's sub-3-USD rows). COSTS 0.8% a round trip (1.2% stress).
//   Every gross return, rule and yardstick, capped at +300% alike (AUD-1). Halves = signal date before / from 2024-01-01. JUDGED with
//   value-core.mjs judge (unchanged): in BOTH halves > 0 after 0.8% and 1.2%, better than the average liquid stock over the same sessions,
//   better than the same stock on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks, block t >= 2.5 -> TRADABLE SMALL
//   (tier 2); block t >= the league bar (about 4.1) -> PROVEN. EXTRA GATE (CLAUDE.md 4.4, C-CT1 library text "vs ... S&P 500"): in both
//   halves the average of (trade gross - SPY gross over the same sessions) after 0.8% cost must be > 0. The TRY SMALL bar is reported next
//   to it (trySmallBar), never instead of it.
//
// C-CT1a / C-CT1b  CONTRACT SIZE VS COMPANY SIZE (library C-CT1; exact rule pre-registered there 22 Oct 2026, operationalised here):
//   Event = a plain 8-K (main document, not an amendment, not an exhibit) listing item 1.01, from the EDGAR full-text search for
//   "Material Definitive Agreement" (squad 21's cached search, read only; missing months fetched here). Earnings-day 8-Ks are left out:
//   an 8-K that also lists item 2.02. Whole market (the 22 Oct text named the smaller scan-universe event cache; the whole market is used
//   because it has the dead stocks too). Stock = the filing CIK's point-in-time ticker (SEC Form 3/4/5 data sets; squad 4's map, read
//   only), then the search's tickers, then today's list; each only with prices near the date.
//   AMOUNT (from the primary 8-K document only): the item 1.01 SECTION = the text from the first "Item 1.01" to the next "Item N.NN"
//   heading that is not 1.01 (or the end of the document); no section -> no amount. FIGURES: '$X million', '$X billion' (also 'bn' / 'mm'),
//   or '$X,XXX,XXX' (no unit) of 1,000,000+; 'up to' figures count. A figure whose SENTENCE contains "credit facilit", "loan", "note",
//   "notes", "debt" or "lease" (any case, whole words for loan / note / notes / debt / lease, plural included) is financing and is NOT
//   counted. AMOUNT = the largest counted figure. STOP RULE (data, before any return): if under 40% of the item 1.01 filings read state
//   ANY figure (before the financing exclusion), the verdict is NEEDS DATA and no return is computed.
//   PARSER FIX v2 (6 Nov 2026, after DIAG 1, which computed NO return): DIAG 1 showed the largest "counted" figure was mostly NOT a
//   customer contract: equity offering proceeds, at-the-market sales agreements, credit agreements, securities purchase agreements and
//   merger consideration. The 22 Oct rule says financing figures are not counted ("those are financing, not customer contracts"); the
//   v1 word list read that too narrowly. v2 also excludes a figure whose sentence contains any of: credit agreement, facility, borrow,
//   offering, proceeds, underwrit, at-the-market / at the market, sales agent, securities, shares, stock, warrant, equity, investor,
//   convertible, preferred, principal, interest rate, covenant, indenture, bond, revolv, merger, acquisition, acquire. No threshold,
//   hold, gate or date changed; the stop rule still counts figures BEFORE any exclusion.
//   PARSER FIX v3 (6 Nov 2026, after DIAG 2, still NO return computed): DIAG 2 samples still counted corporate deals that are not customer
//   contracts (asset purchases / divestitures with a "purchase price", termination fees, settlements, escrow, equity-line put notices,
//   lender fees, property sale prices) and filer typos such as "$9,600,000 million". v3 also excludes sentences containing: purchase
//   price, asset purchase, purchased assets, divest, termination fee, settlement, escrow, put notice, lender, sales price. A figure written
//   with thousands commas AND a unit whose number is 100,000+ ("$9,600,000 million") is read as plain dollars (the unit is a typo).
//   REACTION SESSION R: the filing's EDGAR acceptance time (the .hdr.sgml ACCEPTANCE-DATETIME, EDGAR's Eastern clock): on a trading day
//   before 16:00 -> that day's session; 16:00 or later, or a non-trading day -> the next session. Header unreadable -> the first session
//   strictly after the filing date (the conservative choice). MARKET CAP = close of R x the SEC share count known 30 days before R
//   (data/shares.json.gz by CIK); no share count -> dropped (counted).
//   C-CT1a: AMOUNT >= 10% of the market cap. C-CT1b: C-CT1a AND the AMOUNT covers 4 quarters of operating cash burn: trailing-12-month
//   NetCashProvidedByUsedInOperatingActivities (value-core.mjs ttmAt, the last 10-Q/10-K filed before R - 30 days; SEC companyfacts,
//   value-lab's cache, read only): TTM >= 0 passes; TTM < 0 passes if AMOUNT >= -TTM; unknown -> fails (missing data never passes).
//   Trade: buy the OPEN of R+1 (LIQUID on R), hold 20 sessions, no stop; one event per stock per 60 sessions (counted from R; a later
//   event of the same stock inside 60 sessions is ignored even if no trade was taken).
//   INFORMATION ONLY (not gates): the deal type (squad21-core dealType: financing/corporate vs commercial) and merger wording counts.
//
// C-INS3-20 / C-INS3-60  OPPORTUNISTIC INSIDER BUYS, ROUTINE TRADERS REMOVED (library C-INS3; Cohen, Malloy and Pomorski 2012, Journal
//   of Finance, "Decoding Inside Information"). Data: SEC insider-transactions data sets (Forms 3/4/5), every quarter from 2018 Q1 (3
//   years of history before the first signal), non-derivative rows with code P (open-market purchase) or S (open-market sale), reporting
//   owner CIK, TRANS_DATE (trade date) and the filing date; downloaded here into this lab's own cache.
//   CLASSIFICATION (CMP, per reporting-owner CIK, fixed for each calendar year Y of the purchase's trade date): CLASSIFIED if the owner has
//   at least one P or S trade in each of Y-1, Y-2 and Y-3. ROUTINE if there is a calendar month with a P or S trade in that month in each
//   of Y-1, Y-2 and Y-3. OPPORTUNISTIC = classified and not routine. Unclassified owners are left out (the library note "needs 3+ years
//   of history per insider"; the 22 Oct library text "drop routine, keep the rest" is read with CMP's definition, the published source).
//   SIGNAL: Form 4 rows with code P, acquired, shares x price > 0, by an officer, director or "other" (a pure 10% owner is left out,
//   squad 1 convention) who is OPPORTUNISTIC; cluster = on filing day d, 2+ DIFFERENT opportunistic insiders have such purchases filed
//   in sessions s-4..s (agent-c-core insiderClusters, no dollar minimum). Buy the open of the first session strictly after d (LIQUID on
//   the session before); hold 20 (C-INS3-20) and 60 (C-INS3-60) sessions; no stop; one open trade per stock.
//   Data stop: every quarter from 2018 Q1 to the last complete quarter must load; else NOT RUN.
export const COST = 0.008, SPLIT = '2024-01-01', CAP = 3;
export const CT = { minShare: 0.10, hold: 20, gap: 60, minStated: 0.40, minFigure: 1e6, prefilter: 0.05 };
export const INS3 = { holds: [20, 60], window: 5, minPeople: 2, fromYear: 2018 };
export const RULE_IDS = ['C-CT1a', 'C-CT1b', 'C-INS3-20', 'C-INS3-60'];
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => isFinite(g) ? Math.min(g, CAP) : g;

// ---------------- C-CT1: the item 1.01 section and its amount ----------------
// text (html2text output) -> the item 1.01 section or null
export function item101Section(text) { const t = String(text || ''), a = /Item\s*1\.01\b/i.exec(t); if (!a) return null;
  const rest = t.slice(a.index + a[0].length), re = /Item\s*(\d)\.(\d\d)\b/gi; let m, end = rest.length;
  while ((m = re.exec(rest))) { if (m[1] + '.' + m[2] !== '1.01') { end = m.index; break; } }
  return rest.slice(0, end); }
export const PARSER_V = 3;
const FIN = /credit\s+facilit|\bloans?\b|\bnotes?\b|\bdebts?\b|\bleases?\b|credit\s+agreement|\bfacilit(y|ies)\b|\bborrow|\bofferings?\b|\bproceeds\b|underwrit|at[\s-]the[\s-]market|sales\s+agent|\bsecurities\b|\bshares?\b|\bstock\b|\bwarrants?\b|\bequity\b|\binvestors?\b|\bconvertible\b|\bpreferred\b|\bprincipal\b|interest\s+rate|\bcovenants?\b|\bindenture\b|\bbonds?\b|\brevolv|\bmergers?\b|\bacquisitions?\b|\bacquir|purchase\s+price|asset\s+purchase|purchased\s+assets|\bdivest|termination\s+fee|\bsettlement|\bescrow|put\s+notice|\blenders?\b|sales?\s+price/i;
const ABBR = /(?:^|\s)(?:Inc|Corp|Co|Ltd|L\.P|LP|LLC|N\.A|S\.A|N\.V|B\.V|U\.S|U\.K|Jr|Sr|Mr|Ms|Mrs|Dr|No|St|Nos|approx|e\.g|i\.e|[A-Z])\.$/;
// the sentence around position at (same rule as squad21-core sentenceAt; a decimal point inside a number is not a stop)
export function sentenceAt(t, at) { const isEnd = (i) => /[.;!?]/.test(t[i]) && /\s/.test(t[i + 1] || '') && /[A-Z0-9"“(]/.test(t[i + 2] || '') && !(t[i] === '.' && ABBR.test(t.slice(Math.max(0, i - 8), i + 1)));
  let a = at; while (a > 0 && at - a < 800 && !isEnd(a - 1)) a--; let b = at; while (b < t.length - 1 && b - at < 800 && !isEnd(b)) b++; return t.slice(a, b + 1).trim(); }
// section -> { figures (all qualifying figures before the financing exclusion), counted, amount (largest counted or null), snippet }
export function contractAmount(section) { const s = String(section || ''); let figures = 0, counted = 0, amount = null, snippet = null;
  for (const m of s.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(billion|million|bn|mm)\b)?/gi)) {
    const n = +m[1].replace(/,/g, ''), u = (m[2] || '').toLowerCase(); if (!isFinite(n)) continue;
    const typo = /,/.test(m[1]) && n >= 1e5, x = typo || !u ? n : u === 'billion' || u === 'bn' ? n * 1e9 : n * 1e6; if (!(x >= CT.minFigure)) continue; figures++;
    const sen = sentenceAt(s, m.index); if (FIN.test(sen)) continue; counted++; if (amount === null || x > amount) { amount = Math.round(x); snippet = sen.slice(0, 300); } }
  return { figures, counted, amount, snippet }; }
// EDGAR header ACCEPTANCE-DATETIME (YYYYMMDDHHMMSS, Eastern clock) -> { d, hm } or null
export function acceptance(hdr) { const m = /<ACCEPTANCE-DATETIME>\s*(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/.exec(String(hdr || '')); return m ? { d: m[1] + '-' + m[2] + '-' + m[3], hm: m[4] + ':' + m[5] } : null; }
// reaction session index. D = sorted session dates. acc = { d, hm } or null; filed = filing date.
export function reactionSession(D, acc, filed) { const onOrAfter = (d) => { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
  if (!acc) { const i = onOrAfter(filed); return i < D.length && D[i] === filed ? i + 1 : i; }
  const i = onOrAfter(acc.d); if (i < D.length && D[i] === acc.d && acc.hm < '16:00') return i; return i < D.length && D[i] === acc.d ? i + 1 : i; }
// CT1b cash-burn test: ttm = { val } or null
export const burnCovered = (amount, ttm) => !!ttm && isFinite(ttm.val) && (ttm.val >= 0 || amount >= -ttm.val);

// ---------------- C-INS3: CMP classification ----------------
// hist: Map ownerCik -> Set of 'YYYY-MM' (P or S trade months). -> 'routine' | 'opportunistic' | 'unclassified'
export function classify(hist, owner, year) { const s = hist.get(String(owner)); if (!s) return 'unclassified'; const ys = [year - 1, year - 2, year - 3];
  if (!ys.every(y => [...s].some(m => m.startsWith(y + '-')))) return 'unclassified';
  for (let mo = 1; mo <= 12; mo++) { const mm = String(mo).padStart(2, '0'); if (ys.every(y => s.has(y + '-' + mm))) return 'routine'; }
  return 'opportunistic'; }

// ---------------- the TRY SMALL bar (CLAUDE.md 4.5; reported next to the judge) ----------------
export function trySmallBar(R) { const H = ['older', 'newer'].map(k => R[k] || {}); return H.every(r => r.n >= 20 && r.blocks >= 3 && r.avgStress > 0 && r.edge > 0 && r.noTop2 > 0); }
// the extra S&P 500 gate: trades [{ g, spy, half }] -> reasons (empty = passed)
export function spyGate(tr) { const why = [];
  for (const h of ['older', 'newer']) { const v = tr.filter(z => z.half === h && isFinite(z.spy)).map(z => z.g - COST - z.spy); const m = mean(v);
    if (!(m > 0)) why.push('not better than the S&P 500 over the same sessions in the ' + h + ' half (' + (m === null ? 'n/a' : (m * 100).toFixed(1) + '%') + ')'); }
  return why; }

// ---------------- library pre-registration (before any computation; idempotent) ----------------
const SRC = { ct: ['https://efts.sec.gov/LATEST/search-index (EDGAR full-text search, 8-K item 1.01)', 'https://www.sec.gov/Archives/edgar/data/ (primary 8-K documents and .hdr.sgml acceptance times)', 'value-cache facts (SEC companyfacts)'],
  ins3: ['https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets', 'Cohen, Malloy and Pomorski 2012, Journal of Finance 67(3), Decoding Inside Information'] };
export const DATE = '2026-11-06';
export function preRegister(LB, date = DATE) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0; const by = (id) => LB.strategies.find(x => x.id === id);
  const set = (id, fields, base = {}) => { let e = by(id); if (!e) { e = { id, ...base }; LB.strategies.push(e); ch++; } if (e.preRegistered === date) return; Object.assign(e, fields, { preRegistered: date }); ch++; };
  const st = 'pre-registered ' + date + ' (agent-c2-core.mjs header, exact rule); built agent-c2-lab.mjs; one-shot pending';
  set('C-CT1a', { status: st, study: 'agent-c2-lab.mjs -> data/agent-c2-lab.json firstRun', sources: SRC.ct,
    rule: 'Plain 8-K listing item 1.01 (not 2.02); amount = largest $ figure (million/billion or 1M+) in the item 1.01 section of the primary document, figures in sentences naming credit facility/loan/note(s)/debt/lease excluded; amount >= 10% of market cap (close of the reaction session x share count known 30 days before); reaction session from the EDGAR acceptance time (before 16:00 ET that day, else next); buy the next open, liquid, hold 20, no stop; one event per stock per 60 sessions; stop rule: under 40% of filings with any figure -> NEEDS DATA. Gates + S&P 500 gate.' },
    { family: 'Events', agent: 'C', name: 'Contract size >= 10% of market cap (8-K 1.01), hold 20', explain: 'C-CT1 version a (agent-c2-core.mjs).' });
  set('C-CT1b', { status: st, study: 'agent-c2-lab.mjs -> data/agent-c2-lab.json firstRun', sources: SRC.ct,
    rule: 'C-CT1a AND the amount covers 4 quarters of operating cash burn (TTM operating cash flow known before R-30 days: >= 0 passes; < 0 passes if amount >= -TTM; unknown fails).' },
    { family: 'Events', agent: 'C', name: 'Contract size >= 10% of market cap and >= 4 quarters of cash burn, hold 20', explain: 'C-CT1 version b (agent-c2-core.mjs).' });
  { const e = by('C-CT1'); if (e && e.preRegistered !== date) { e.status = 'operationalised ' + date + ' as C-CT1a / C-CT1b (agent-c2-core.mjs, rule of 22 Oct unchanged); built agent-c2-lab.mjs; one-shot pending'; e.preRegistered = date; ch++; } }
  for (const H of INS3.holds) set('C-INS3-' + H, { status: st, study: 'agent-c2-lab.mjs -> data/agent-c2-lab.json firstRun', sources: SRC.ins3,
    rule: 'SEC Form 3/4/5 data sets from 2018 Q1. Owner classified for trade-year Y if P or S trades in each of Y-1..Y-3; routine if one calendar month has a trade in all three; opportunistic = classified, not routine. Cluster: 2+ different opportunistic officers/directors/other with Form 4 open-market purchases filed in 5 sessions; buy the next open after the filing date, liquid, hold ' + H + ', no stop, one open trade per stock. Gates + S&P 500 gate.' },
    { family: 'Insiders', agent: 'C', name: 'Opportunistic insider cluster (CMP 2012), hold ' + H, explain: 'C-INS3 version with a ' + H + '-session hold (agent-c2-core.mjs).' });
  { const e = by('C-INS3'); if (e && e.preRegistered !== date) { e.status = 'pre-registered ' + date + ' as C-INS3-20 / C-INS3-60 (agent-c2-core.mjs, CMP definition); built agent-c2-lab.mjs; one-shot pending'; e.preRegistered = date; ch++; } }
  if (ch) LB.updated = date; return ch; }
