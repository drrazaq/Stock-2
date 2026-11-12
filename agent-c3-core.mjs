// AGENT C CORE 3 (Crowd lane; the Thu 12 Nov 2026 run). Pure functions, no network, no files. Used by agent-c3-lab.mjs (one 5-year
// run per rule, first complete verdict frozen in data/agent-c3-lab.json firstRun) and test/agent-c3-core.test.mjs. Long only; never
// places an order; no Telegram; no paper lane until a rule passes (a pass goes to forward paper first, CLAUDE.md section 4.5).
//
// PRE-REGISTERED 12 Nov 2026 BEFORE ANY RESULT WAS SEEN (the same text goes into data/strategy-library.json before anything is computed).
// Nothing below may be changed after the first run; a genuine bug fix goes to correctedRun with a written reason. A DIAG run (coverage,
// counts and samples only; NO return computed) may come first; a data-reading fix found there is written here with its reason.
//
// COMMON (agent-c2-core.mjs conventions, unchanged): LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ on the session
//   BEFORE entry (SPY excluded). Sell the CLOSE `hold` sessions after entry (hold counts the entry session). One open trade per stock per
//   rule. A stock that stops trading is valued at its last close (incl. the cache's sub-3-USD rows). Every gross return, rule and
//   yardstick, capped at +300% alike (AUD-1). Halves = signal date before / from 2024-01-01. Prices: the whole-market 5-year cache
//   (dead stocks included) plus Massive sessions since.
//
// C-IC1  INSIDER CLUSTER + MATERIAL CONTRACT (library C-IC1, outside review 20 Oct: "2+ insiders buying and an 8-K 1.01 within the same
//   10 days; hold 20 days"). Operationalised:
//   INSIDER CLUSTER = the C-INS3 cluster definition WITHOUT the opportunistic filter: SEC Form 4 rows (insider-transactions data sets,
//   2018 Q1 on, the agent-c2 cache), code P, acquired, shares x price > 0, by an officer, director or "other" (a pure 10% owner is left
//   out); on filing day d, 2+ DIFFERENT such insiders have purchases filed in sessions s-4..s (agent-c-core insiderClusters, no dollar
//   minimum). Cluster session Sc = the first session on or after d; the cluster is public for trading from Kc = the first session
//   strictly after d.
//   CONTRACT = a plain 8-K main document listing item 1.01 and not item 2.02 (the C-CT1 event list, any amount, no size test). Its
//   reaction session R comes from the EDGAR acceptance time (agent-c2-core reactionSession: before 16:00 ET on a trading day -> that day,
//   else the next session; header unreadable -> the first session strictly after the filing date). Public for trading from K8 = R + 1.
//   MATCH: same stock (point-in-time ticker), |Sc - R| <= 9 sessions (both inside one 10-session window). ENTRY = the OPEN of
//   max(Kc, K8) (the first open after BOTH are public), LIQUID on the session before; hold 20 sessions; no stop; one signal per stock per
//   60 sessions (counted from the entry; a later match inside 60 sessions is ignored even if no trade was taken).
//   Only cluster filing dates up to the end of the last complete insider-data quarter are used (later Form 4s are not in the data set).
//   GATES (as C-CT1 / C-INS3): value-core judge (both halves > 0 after 0.8% and 1.2%, better than the average liquid stock over the same
//   sessions, better than the same stock on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks, block t >= 2.5 -> tier 2;
//   block t >= the league bar -> PROVEN) plus the S&P 500 gate (both halves, trade - SPY over the same sessions after 0.8% > 0). The TRY
//   SMALL bar is reported next to it. Fewer than 20 trades in a half -> TOO FEW CASES (no verdict on the idea).
//
// C-SI1 / C-SI1-DTC  HIGH SHORT INTEREST AND HIGH DAYS-TO-COVER (AVOID BLOCKS; library C-SI1; Boehmer, Jones and Zhang 2008 JF; Boehmer,
//   Huszar and Jordan 2010 JFE; days-to-cover: Hong, Li, Ni, Scheinkman and Yan 2015, NBER w21166, "DTC is a better predictor of poor
//   stock returns than short ratio; a long-short strategy using DTC generates a 1.2% monthly return").
//   DATA (official, free): FINRA equity short-interest files https://cdn.finra.org/equity/otcmarket/biweekly/shrtYYYYMMDD.csv (pipe-
//   separated; the file date is the settlement date; exchange-listed and OTC rows since 2021), every settlement date from Nov 2021.
//   Columns used: symbolCode, marketClassCode, currentShortPositionQuantity, stockSplitFlag, averageDailyVolumeQuantity,
//   daysToCoverQuantity, settlementDate. Only exchange-listed rows (marketClassCode not OTC). A row with a stock-split flag is dropped.
//   POINT IN TIME: FINRA publishes about 7 business days after settlement, after the close. ENTRY = the OPEN of session S + 9 (S = the
//   first session on or after the settlement date; one session of slack for holidays), LIQUID on S + 8. Hold 20 sessions.
//   C-SI1: short ratio = currentShortPositionQuantity / the SEC cover share count known 30 days before the entry session (data/shares.
//   json.gz by CIK; CIK from the point-in-time Form 3/4/5 ticker map, then today's list); flagged when the ratio > 20%. A ratio > 100%
//   is treated as a data error (count reported) and dropped. No share count -> dropped (counted).
//   C-SI1-DTC: FINRA daysToCoverQuantity (short position / average daily volume = the paper's short ratio / turnover); flagged when it is
//   in the top 10% of the LIQUID exchange-listed stocks of the same file (ties included; needs 200+ liquid rows in the file, else that
//   file is skipped and counted).
//   One open flag per stock per rule (a stock flagged again while its 20 sessions run is not counted twice).
//   AVOID TEST (the C-S8 / share-supply.mjs gates, unchanged): edge = the flagged stock's return minus the average liquid stock bought
//   the same session for the same sessions; both pay the same costs, so costs cancel and are not applied. Also vs the S&P 500 and vs the
//   same stock on its other days (squad1-core ownAverage, same half). t = the WEAKER (closer to zero) of the date-clustered t (one value
//   per entry session) and the 20-session block t, because the flag windows of consecutive files overlap.
//   PROVEN AVOID: in BOTH halves edge < 0 with t <= -max(2.5, league bar, 4.0), worse than the S&P 500, worse than the same stock on its
//     other days (t <= -2 by day), and still negative without its 2 WORST cases.
//   TRADABLE SMALL (tier 2) AVOID: in BOTH halves edge < 0, t <= -2.5, still negative without its 2 worst cases.
//   NOT PROVEN = negative edge in both halves but weaker; REJECTED = not worse than the average stock in a half. 20+ cases per half.
//   DATA STOP: fewer than 95% of the expected settlement files (2 a month, Nov 2021 to the last one found) or no exchange-listed rows in
//   the first file -> NEEDS DATA, no return computed.
//   A pass is an AVOID / SELL-warning candidate for forward paper only, never a short and never a buy.
//   DATA-READING FIX (12 Nov 2026, after DIAG 1, which computed NO return): FINRA files from Sep 2026 put every field in double quotes,
//   so the v1 parser read no header and those files were missing; the coverage check counted expected files only up to the last file
//   read, which hid the gap. v2 strips the quotes, and the expected files now run to the last settlement group that ended 12+ days
//   before the run. No threshold, lag, hold, gate or date changed.
export const COST = 0.008, SPLIT = '2024-01-01', CAP = 3;
export const IC = { window: 5, minPeople: 2, matchGap: 9, hold: 20, gap: 60, fromDate: '2021-06-01' };
export const FINRA_PARSER = 2;
export const SI = { minRatio: 0.20, maxRatio: 1.0, pubLag: 9, hold: 20, dtcTop: 0.10, minRows: 200, minFiles: 0.95, from: '2021-11-01' };
export const RULE_IDS = ['C-IC1', 'C-SI1', 'C-SI1-DTC'];
export const AVOID_IDS = ['C-SI1', 'C-SI1-DTC'];
export const TIER2_T = 2.5, LEAGUE_FLOOR = 4.0;
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => isFinite(g) ? Math.min(g, CAP) : g;
export const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };

// ---------------- C-IC1: match insider clusters with item 1.01 8-Ks ----------------
// clusters: [{ i, Sc, Kc, d }], contracts: [{ i, R, d }] (session indexes). -> [{ i, k, d, Sc, R }] sorted by k, one per stock per IC.gap
export function icSignals(clusters, contracts, { matchGap = IC.matchGap, gap = IC.gap } = {}) {
  const byI = new Map(); for (const c of contracts) (byI.get(c.i) || byI.set(c.i, []).get(c.i)).push(c);
  const cand = [];
  for (const q of clusters) { const list = byI.get(q.i); if (!list) continue; let best = null;
    for (const c of list) { if (Math.abs(q.Sc - c.R) > matchGap) continue; const k = Math.max(q.Kc, c.R + 1); if (!best || k < best.k) best = { i: q.i, k, d: q.d > c.d ? q.d : c.d, Sc: q.Sc, R: c.R, d8: c.d, dc: q.d }; }
    if (best) cand.push(best); }
  cand.sort((a, b) => a.k - b.k || a.i - b.i); const last = new Map(), out = [];
  for (const z of cand) { if (last.has(z.i) && z.k < last.get(z.i) + gap) continue; last.set(z.i, z.k); out.push(z); }
  return out; }

// ---------------- C-SI1: FINRA file ----------------
// text of one shrtYYYYMMDD.csv -> { rows: [{ sym, settle, short, split, adv, dtc, mkt }], header: bool }
const unq = (x) => String(x).replace(/^\s*"(.*)"\s*$/, '$1');
export function parseFinra(text) { const L = String(text || '').split(/\r?\n/).filter(Boolean); if (!L.length) return { rows: [], header: false };
  const H = L[0].split('|').map(unq), ix = (k) => H.indexOf(k), need = ['symbolCode', 'marketClassCode', 'currentShortPositionQuantity', 'settlementDate'];
  if (!need.every(k => ix(k) >= 0)) return { rows: [], header: false };
  const [a, b, c, s, sp, adv, dtc] = ['symbolCode', 'marketClassCode', 'currentShortPositionQuantity', 'settlementDate', 'stockSplitFlag', 'averageDailyVolumeQuantity', 'daysToCoverQuantity'].map(ix), rows = [];
  for (const l of L.slice(1)) { const r = l.split('|').map(unq); const sym = String(r[a] || '').trim().toUpperCase(); if (!sym) continue;
    rows.push({ sym, mkt: String(r[b] || '').trim().toUpperCase(), short: +r[c], settle: String(r[s] || '').trim().slice(0, 10), split: sp >= 0 ? String(r[sp] || '').trim() : '', adv: adv >= 0 ? +r[adv] : NaN, dtc: dtc >= 0 ? +r[dtc] : NaN }); }
  return { rows, header: true }; }
export const isListed = (mkt) => !!mkt && mkt !== 'OTC' && mkt !== 'OTCBB' && mkt !== 'OTHER' && mkt !== 'U';
// short ratio check: -> { flag, ratio, why }
export function siCheck(short, shares) { if (!(shares > 0)) return { flag: false, ratio: null, why: 'noShares' }; if (!(short >= 0)) return { flag: false, ratio: null, why: 'noShort' };
  const ratio = short / shares; if (ratio > SI.maxRatio) return { flag: false, ratio, why: 'dataError' }; return { flag: ratio > SI.minRatio, ratio, why: null }; }
// the top-10% DTC cut of one file's liquid rows (values > 0 and finite); null when fewer than SI.minRows
export function dtcCut(values, top = SI.dtcTop, minRows = SI.minRows) { const v = values.filter(x => isFinite(x) && x >= 0).sort((a, b) => b - a); if (v.length < minRows) return null; return v[Math.max(0, Math.ceil(v.length * top) - 1)]; }
// candidate settlement dates of a month (YYYY-MM): the 15th and the last day, each walked back up to 6 days (most recent first)
export function settleCandidates(month) { const y = +month.slice(0, 4), m = +month.slice(5, 7), last = new Date(Date.UTC(y, m, 0)).getUTCDate(), out = [];
  for (const end of [15, last]) { const a = []; for (let d = end; d > end - 7 && d >= 1; d--) a.push(month + '-' + String(d).padStart(2, '0')); out.push(a); } return out; }

// ---------------- the avoid test (C-S8 gates) ----------------
// trades: [{ t (entry session), g, c, sp (SPY or null), ob (own or null) }]; hold for the block t
export function avoidStat(a, hold) { if (a.length < 20) return { n: a.length };
  const byDay = (f) => { const o = new Map(); for (const z of a) { const x = f(z); if (x === null || x === undefined || !isFinite(x)) continue; (o.get(z.t) || o.set(z.t, []).get(z.t)).push(x); } return o; };
  const ed = byDay(z => z.g - z.c), v = [...ed.values()].map(mean), ov = [...byDay(z => typeof z.ob === 'number' ? z.g - z.ob : null).values()].map(mean), sv = [...byDay(z => typeof z.sp === 'number' && isFinite(z.sp) ? z.g - z.sp : null).values()].map(mean);
  const blk = new Map(); for (const [t, x] of ed) { const k = Math.floor(t / hold); (blk.get(k) || blk.set(k, []).get(k)).push(mean(x)); } const bv = [...blk.values()].map(mean);
  const tDay = tOf(v), tBlock = bv.length >= 3 ? tOf(bv) : null, ex = a.map(z => z.g - z.c).sort((x, y) => x - y);
  const t = tDay === null || tBlock === null ? null : (Math.abs(tDay) <= Math.abs(tBlock) ? tDay : tBlock);
  return { n: a.length, days: ed.size, blocks: bv.length, stocks: new Set(a.map(z => z.s)).size, avg: r4(mean(a.map(z => z.g))), ctrl: r4(mean(a.map(z => z.c))), edge: r4(mean(v)), tDay, tBlock, t,
    vsSpy: sv.length ? r4(mean(sv)) : null, tSpy: tOf(sv), vsOwn: ov.length ? r4(mean(ov)) : null, tOwn: tOf(ov), lagged: r4(ex.filter(x => x < 0).length / ex.length), noWorst2: r4(mean(ex.slice(2))),
    median: r4(ex[ex.length >> 1]), worst: r4(ex[0]) }; }
export function avoidJudge(R, bar) { const why = [], why2 = [], B = Math.max(TIER2_T, bar || 0, LEAGUE_FLOOR);
  for (const hf of ['older', 'newer']) { const r = R[hf] || {}; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); why2.push('too few cases'); continue; }
    if (!(r.edge < 0)) why.push('not worse than an average stock in the ' + hf + ' half');
    if (!(r.t <= -B)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', -' + B.toFixed(2) + ' needed)');
    if (!(r.vsSpy < 0)) why.push('not worse than the S&P 500 in the ' + hf + ' half');
    if (!(r.vsOwn < 0 && r.tOwn <= -2)) why.push('not clearly worse than the same stock on its other days in the ' + hf + ' half (t ' + r.tOwn + ')');
    if (!(r.noWorst2 < 0)) why.push('not worse without its 2 worst cases in the ' + hf + ' half');
    if (!(r.edge < 0)) why2.push(hf + ': not worse than the average stock'); if (!(r.t <= -TIER2_T)) why2.push(hf + ': t ' + r.t + ' not at or below -2.5'); if (!(r.noWorst2 < 0)) why2.push(hf + ': not worse without its 2 worst cases'); }
  const few = !((R.older || {}).n >= 20 && (R.newer || {}).n >= 20);
  const verdict = few ? 'TOO FEW CASES' : !why.length ? 'PROVEN AVOID' : R.older.edge < 0 && R.newer.edge < 0 ? 'NOT PROVEN' : 'REJECTED';
  const level = verdict === 'PROVEN AVOID' ? 'PROVEN' : !few && !why2.length ? 'TRADABLE SMALL (tier 2) avoid' : 'NONE';
  return { verdict, level, why: why.join('; ') || 'every gate passed', whyTier2: why2.join('; ') || 'tier-2 test passed', bar: B }; }

// ---------------- the TRY SMALL bar and the S&P 500 gate for C-IC1 (agent-c2-core, same text) ----------------
export function trySmallBar(R) { const H = ['older', 'newer'].map(k => R[k] || {}); return H.every(r => r.n >= 20 && r.blocks >= 3 && r.avgStress > 0 && r.edge > 0 && r.noTop2 > 0); }
export function spyGate(tr) { const why = [];
  for (const h of ['older', 'newer']) { const v = tr.filter(z => z.half === h && isFinite(z.spy)).map(z => z.g - COST - z.spy); const m = mean(v);
    if (!(m > 0)) why.push('not better than the S&P 500 over the same sessions in the ' + h + ' half (' + (m === null ? 'n/a' : (m * 100).toFixed(1) + '%') + ')'); }
  return why; }

// ---------------- library pre-registration (before any computation; idempotent) ----------------
export const DATE = '2026-11-12';
const SRC = { ic: ['https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets', 'https://efts.sec.gov/LATEST/search-index (EDGAR full-text search, 8-K item 1.01)'],
  si: ['https://www.finra.org/finra-data/browse-catalog/equity-short-interest/files', 'Boehmer, Jones and Zhang 2008, Journal of Finance 63(2), Which Shorts Are Informed?', 'Boehmer, Huszar and Jordan 2010, Journal of Financial Economics 96(1), The good news in short interest'],
  dtc: ['https://www.nber.org/papers/w21166', 'https://www.finra.org/finra-data/browse-catalog/equity-short-interest/files'] };
export function preRegister(LB, date = DATE) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0; const by = (id) => LB.strategies.find(x => x.id === id);
  const set = (id, fields, base = {}) => { let e = by(id); if (!e) { e = { id, ...base }; LB.strategies.push(e); ch++; } if (e.preRegistered === date) return; Object.assign(e, fields, { preRegistered: date }); ch++; };
  const st = 'pre-registered ' + date + ' (agent-c3-core.mjs header, exact rule); built agent-c3-lab.mjs; one-shot pending';
  set('C-IC1', { status: st, study: 'agent-c3-lab.mjs -> data/agent-c3-lab.json firstRun', sources: SRC.ic,
    rule: 'Insider cluster (2+ different officers/directors/other with Form 4 open-market purchases filed in 5 sessions, no opportunistic filter) and a plain 8-K item 1.01 (not 2.02) of the same stock with |cluster session - 8-K reaction session| <= 9; buy the open after both are public (max of the session after the cluster filing date and the 8-K reaction session + 1), liquid, hold 20, no stop, one signal per stock per 60 sessions. Gates + S&P 500 gate; TRY SMALL bar reported.' });
  set('C-SI1', { status: st, study: 'agent-c3-lab.mjs -> data/agent-c3-lab.json firstRun', sources: SRC.si,
    rule: 'FINRA settlement file (exchange-listed rows, no split flag): short position / SEC share count known 30 days before entry > 20% (over 100% = data error, dropped); entry the open of settlement session + 9 (publication lag), liquid; flagged stock vs the average liquid stock over 20 sessions (avoid test, costs cancel); C-S8 avoid gates with t = the weaker of day t and 20-session block t; data stop: 95% of expected files.' });
  set('C-SI1-DTC', { status: st, study: 'agent-c3-lab.mjs -> data/agent-c3-lab.json firstRun', sources: SRC.dtc,
    rule: 'Same files and timing as C-SI1; flag = FINRA days-to-cover in the top 10% of the liquid exchange-listed stocks of that file (200+ rows needed); avoid 20 sessions; same avoid gates.' },
    { family: 'Share supply', agent: 'C', name: 'High days-to-cover (avoid)', explain: 'Hong, Li, Ni, Scheinkman and Yan 2015 (NBER w21166): days-to-cover predicts poor returns better than the short ratio. Version of C-SI1 (agent-c3-core.mjs).' });
  if (ch) LB.updated = date; return ch; }
