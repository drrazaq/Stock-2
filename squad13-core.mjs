// SQUAD 13 CORE (24 Oct 2026; Stock-2): two follow-ups earlier squads named as the next tests. Pure functions, no network, no files.
// Used by squad13-lab.mjs (one 5-year run per rule, first complete verdict frozen in data/squad13-lab.json firstRun, then a forward PAPER
// lane from Monday 26 Oct 2026) and test/squad13-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// A) RUNNER PULLBACKS (squad 8's recommendation). Squad 8 showed that buying a 10-session runner (+15% to +100%) at once LOSES (every
//    SQ8-* rule rejected; the plain runner base -2.7% / -0.9% a trade after stress cost): short-term reversal. The flip side: the SAME
//    runners bought only AFTER they have pulled back part of the run while still holding the pre-run base and the 20-day average, with and
//    without squad 8's supply filters (share count not growing, buybacks, no reverse split in 3 years), and among the large caps only.
// B) INDUSTRY WAVES AMONG LARGE CAPS. (1) an industry whose breadth among the large caps snaps from under 40% to over 60% of members above
//    their 50-day average within a month (a Zweig-style breadth thrust at industry level): buy its 3 largest, or its 3 strongest, hold 63;
//    (2) "leader then followers": the industry's largest member makes a new 52-week closing high right after its results 8-K (or, without
//    results, its first 52-week high in 63 sessions): buy the next largest members that have NOT moved yet, hold 63.
//
// NOT REPEATED (checked in data/strategy-library.json 24 Oct 2026): ANOM-EIL20/60 (SIC 2-digit breadth +0.20 to 0.50+ over 20 sessions,
// ALL liquid members whose in-industry rank jumped, hold 20/60: rejected), ANOM-INDMOM / T21 / T22 / R4 / A-ROT1 (industry momentum on
// 6-12 month returns: rejected / failed), SQ4-THEMEGROW / TIP-THEME (best 12-month industry -> fastest growers / top 3 by value, 12-month
// hold), CHAIN-* (supply-chain layers, owner's chain map), N3 (sympathy move after a single-stock event, all stocks, short), N2 / C-PEER1
// (queued, earnings-surprise spillover to LATER reporters), M7 / T5 / SQ4-QUALDIP / DEC-PB (pullbacks of 6-month leaders / quality stocks,
// not of fresh 10-day runners), SQ8-* (runners bought at once). New here: a fresh breadth THRUST (<40% -> >60%) measured among the 1,000
// largest only, the group's LARGEST / STRONGEST 3 for a quarter; the leader's earnings high used as a signal for its own large peers; the
// runner bought on its first orderly 8-15% pullback.
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ13-*; the same text is written into
// data/strategy-library.json before the first computation). Thresholds are round numbers or come from the papers / squad 8 / the brief,
// never from this data. COMMON CONVENTIONS (the system's, unchanged):
//   DAILY BARS: the 5-year whole-market cache (dead stocks included). LIQUID = close 5 USD+ and 20-session average traded value 5M USD+.
//   LARGE CAPS: U_t = the 1,000 (B rules) / 500 (SQ13-RPB-LARGE) liquid stocks with the highest 63-session average traded value at t (the
//   squad 6 point-in-time, survivor-free size proxy: dead stocks keep their traded value). "Largest" inside a group = the same ranking.
//   INDUSTRY = SEC SIC 3-digit (first 3 digits of the company SIC: e.g. 367 electronic components, 283 drugs, 737 software / services).
//   Inside an industry one ticker per company (SEC CIK; the most traded class, e.g. GOOGL not also GOOG); a ticker without a CIK counts alone.
//   ENTRY / EXIT: signal at the CLOSE of t; buy the OPEN of t+1; sell the CLOSE of session t+hold (hold counts the entry session). A stock
//   that stops trading: its last close. One open trade per stock per rule. Trades whose path has a whole-ratio 3x-50x one-day jump (an
//   unadjusted split in the data) are left out, and such stocks are left out of the yardstick too (squad 6 convention).
//   POINT IN TIME: SEC share counts known 30 days after their date (squad 8 sharesKnownAt, split-repaired); a split is known on its
//   execution date; an 8-K is used only from the session AFTER the first session on / after its filing date.
//   COSTS 0.8% a round trip (1.2% stress). Every gross return, the rule's and the yardstick's, capped at +300% (AUD-1 capBoth).
//   JUDGED at the tier-2 standard (value-core judge via hold-core judgeHold, unchanged): halves = signal before / from 2024-01-01; in BOTH
//   halves > 0 after 0.8% and 1.2%, better than the average liquid stock over the same sessions, better than the same stock on its other
//   days, > 0 without its 2 best trades, 20+ trades and 3+ blocks (blocks = the hold), block t >= 2.5 -> TRADABLE SMALL (>= the proof bar
//   -> PROVEN), AND return per year of capital tied up (sum of net returns / sum of years held) above SPY's over the same days, both halves.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', CAP = 3, YEAR = 252;
export const TH = {
  pbFrom: 5, pbTo: 15, pbHi: 0.92, pbLo: 0.85, sma: 20,   // pullback: first close 8-15% under the post-run high, sessions t+5..t+15
  flat: 0.01, shrink: -0.02, rsDays: 1095,                 // supply: count up at most 1% a year / down 2%+ a year; no reverse split in 3 years
  bigN: 1000, largeN: 500, minMembers: 8,                  // B universe, RPB-LARGE universe, group size for breadth
  brLow: 0.40, brHigh: 0.60, brLook: 21, cool: 63,         // wave: breadth > 60% now, under 40% on a session of the last 21; 63 sessions between waves
  pick: 3, leadMin: 4, followRanks: [2, 3, 4], moved: 0.02, // leader rule: group 4+ members; followers = ranks 2-4 that rose under +2%
  reactFrom: 1, reactTo: 3, hiLook: 252, hiQuiet: 63, followLook: 10,
};
const P = (cite, url) => ({ cite, url });
const JEG = P('Jegadeesh (1990) Evidence of Predictable Behavior of Security Returns, Journal of Finance 45(3) (one-month reversal)', 'https://doi.org/10.1111/j.1540-6261.1990.tb05110.x');
const JT = P('Jegadeesh & Titman (1993) Returns to Buying Winners and Selling Losers, Journal of Finance 48(1)', 'https://doi.org/10.1111/j.1540-6261.1993.tb04702.x');
const ONEIL = P('O\'Neil, How to Make Money in Stocks (4th ed., 2009): buy a leader on its first orderly pullback, not extended (practitioner)', 'https://www.investors.com/how-to-invest/investors-corner/stock-pullbacks-offer-another-chance-to-buy/');
const PW = P('Pontiff & Woodgate (2008) Share Issuance and Cross-sectional Returns, Journal of Finance 63(2)', 'https://doi.org/10.1111/j.1540-6261.2008.01338.x');
const IKV = P('Ikenberry, Lakonishok & Vermaelen (1995) Market underreaction to open market share repurchases, Journal of Financial Economics 39(2-3)', 'https://doi.org/10.1016/0304-405X(95)00826-Z');
const MW = P('Martell & Webb (2008) The performance of stocks that are reverse split, Review of Quantitative Finance and Accounting 30', 'https://doi.org/10.1007/s11156-007-0076-y');
const MG = P('Moskowitz & Grinblatt (1999) Do Industries Explain Momentum? Journal of Finance 54(4)', 'https://doi.org/10.1111/0022-1082.00146');
const ZW = P('Zweig (1986) Winning on Wall Street: the breadth thrust (advancing share from under 40% to over 61.5% within 10 days) (practitioner)', 'https://www.investopedia.com/terms/b/breadth-thrust-indicator.asp');
const HOU = P('Hou (2007) Industry Information Diffusion and the Lead-lag Effect in Stock Returns, Review of Financial Studies 20(4) (big firms lead small firms of the same industry)', 'https://doi.org/10.1093/rfs/hhl026');
const TZ = P('Thomas & Zhang (2008) Overreaction to Intra-industry Information Transfers? Journal of Accounting Research 46(4) (early reporters\' news moves later peers)', 'https://doi.org/10.1111/j.1475-679X.2008.00297.x');
const RUNNER = 'RUNNER at the close of t (squad 8 base, unchanged: liquid; 10-session gain +15% to +100%; the first session it crosses +15%; complete data)';
const PULLBACK = 'PULLBACK: H_u = the highest close from t to u; the signal is the FIRST session u in t+5..t+15 with 0.85 x H_u <= close_u <= 0.92 x H_u (8-15% off the post-run high), close_u above the pre-run base (close of t-10) and above its 20-session average, liquid at u. The setup is void if before u any close (t+1..u-1) fell under 0.85 x H or under the pre-run base. Buy the open of u+1';
const WAVE = 'Daily at the close of t. Universe U_t = the 1,000 liquid stocks with the highest 63-session average traded value; industry = SIC 3-digit; breadth = share of the industry\'s U_t members (8+ needed, each with a 50-session average) closing above their 50-session average. WAVE at t: breadth > 60% at t AND under 40% on at least one session of t-21..t-1 (8+ members then too) AND no wave of that industry in the 63 sessions before t';
export const RULES = {
  'SQ13-RPB': { family: 'pullback', hold: 20, name: 'Runner pullback: a 10-day runner bought on its first 8-15% pullback within 5-15 sessions, above its base and 20-day average (hold 20)',
    papers: [JEG, JT, ONEIL], reported: 'one-month winners reverse (Jegadeesh 1990) while 3-12 month winners continue (Jegadeesh & Titman); practitioners buy a leader on its first orderly pullback rather than extended',
    rule: RUNNER + '. ' + PULLBACK + '; hold 20 sessions; one open trade per stock.',
    lib: 'SQ8-* (runners bought at once: rejected), M7 (6-month leader 12-25% under its 20-day high: failed), T5 (5-12% dip in a full uptrend: failed), DEC-PB (21-EMA pullback). A fresh 10-day runner bought on its first pullback was never run' },
  'SQ13-RPB-CLEAN': { family: 'pullback+supply', hold: 20, name: 'Runner pullback with clean supply: share count up at most 1% a year, no reverse split in 3 years (hold 20)',
    papers: [JEG, PW, MW], reported: 'issuers lag (Pontiff & Woodgate); reverse-split stocks keep underperforming (Martell & Webb)',
    rule: 'SQ13-RPB signal AND the SEC share count known at u (30 days late, split-repaired, dated within 200 days of its cut-off) is at most 1% above the count known 365 days earlier AND no reverse split (Massive split list, to < from) executed in the 1,095 days up to u. Buy the open of u+1; hold 20; one open trade per stock.',
    lib: 'SQ8-CLEAN (same filter on runners bought at once, count up to +3%: rejected). On the pullback entry never run' },
  'SQ13-RPB-BUYBACK': { family: 'pullback+supply', hold: 20, name: 'Runner pullback with buybacks: share count down 2%+ in a year, no reverse split in 3 years (hold 20)',
    papers: [IKV, PW, MW], reported: 'firms that buy back shares outperform for years (Ikenberry et al.); net issuance predicts returns with a negative sign (Pontiff & Woodgate)',
    rule: 'SQ13-RPB signal AND the SEC share count known at u is at least 2% below (and not below 60% of) the count known 365 days earlier AND no reverse split in the 1,095 days up to u. Buy the open of u+1; hold 20; one open trade per stock.',
    lib: 'SQ8-SHRINK (same count filter on runners bought at once: rejected), ANOM-NSI, SQ1-BBAUTH. On the pullback entry never run' },
  'SQ13-RPB-LARGE': { family: 'pullback', hold: 63, name: 'Large-cap runner pullback: the same pullback among the 500 largest, held a quarter (hold 63)',
    papers: [JT, ONEIL, HOU], reported: 'intermediate momentum holds among large caps; the system\'s own survivors are large-cap momentum held for months (SQ6-MTUM, SQ6-QMOM)',
    rule: RUNNER + ' AND the stock is among the 500 liquid stocks with the highest 63-session average traded value at t. ' + PULLBACK + '; hold 63 sessions; one open trade per stock.',
    lib: 'SQ6-MTUM / SQ6-QMOM (large-cap 6-12 month momentum, semi-annual / quarterly). A large-cap 10-day runner bought on its pullback was never run' },
  'SQ13-WAVE-BIG': { family: 'wave', hold: 63, name: 'Industry wave among large caps (breadth under 40% -> over 60% within a month): buy its 3 largest, hold 63',
    papers: [ZW, MG, HOU], reported: 'a breadth thrust from under 40% to over 60% in days has preceded strong market advances (Zweig); industry momentum explains much of stock momentum (Moskowitz & Grinblatt); big firms lead their industry (Hou)',
    rule: WAVE + '. Buy the open of t+1 the industry\'s 3 members of U_t with the highest 63-session average traded value; hold 63 sessions; one open trade per stock.',
    lib: 'ANOM-EIL20/60 (SIC 2-digit, all liquid stocks, breadth +0.20 to 0.50+, members whose in-industry rank jumped, hold 20/60: rejected), ANOM-INDMOM. A large-cap breadth THRUST buying the group\'s 3 largest was never run' },
  'SQ13-WAVE-STRONG': { family: 'wave', hold: 63, name: 'Industry wave among large caps: buy its 3 strongest members (63-session return), hold 63',
    papers: [ZW, MG, JT], reported: 'as SQ13-WAVE-BIG; within a rising industry the stocks with the best intermediate momentum lead (Moskowitz & Grinblatt: industry and stock momentum overlap)',
    rule: WAVE + '. Buy the open of t+1 the industry\'s 3 members of U_t with the highest 63-session return (close t / close t-63); hold 63 sessions; one open trade per stock.',
    lib: 'ANOM-EIL20/60, T22 (30%+ in 6 months inside a top-20% industry: failed). The breadth-thrust trigger with the 3 strongest large caps was never run' },
  'SQ13-LEADF': { family: 'leader', hold: 63, name: 'Leader then followers: the industry\'s largest member makes a new 52-week high right after its results 8-K; buy the next 2-4 largest that have not moved (hold 63)',
    papers: [HOU, TZ, P('Foster (1981) Intra-industry information transfers associated with earnings releases, Journal of Accounting and Economics 3(3)', 'https://doi.org/10.1016/0165-4101(81)90002-2')],
    reported: 'news of the industry leader diffuses slowly to its peers (Hou 2007: big-firm returns lead small-firm returns of the same industry); an early reporter\'s results move its peers (Foster; Thomas & Zhang)',
    rule: 'Industry (SIC 3-digit) with 4+ members in U_t (the 1,000 largest by 63-session traded value). LEADER = its member with the highest 63-session traded value at t. The leader files an 8-K with item 2.02 (results; SEC submissions, filing date F); r0 = the first session on or after F. Signal at the close of the FIRST t in r0+1..r0+3 (always after the filing, whatever its hour) where the leader is still the leader and closes above its PRE-RESULTS 52-week high (the highest close of the 252 sessions before r0, 240+ present). FOLLOWERS = the industry\'s members ranked 2, 3 and 4 by traded value at t whose return from the close of r0-1 to the close of t is under +2%. Buy them at the open of t+1; hold 63 sessions; one open trade per stock.',
    lib: 'N3 (sympathy after a single-stock event: not proven), N2 / C-PEER1 (queued: surprise spillover), CHAIN-READ1 (same chain layer after revenue + guidance: rejected). The industry leader\'s post-results 52-week high as a signal for its large peers was never run' },
  'SQ13-LEADH': { family: 'leader-price', hold: 63, name: 'Leader breakout then followers: the industry\'s largest member makes its first 52-week high in 63 sessions; buy the next 2-4 largest that have not moved (hold 63)',
    papers: [HOU, P('George & Hwang (2004) The 52-Week High and Momentum Investing, Journal of Finance 59(5)', 'https://doi.org/10.1111/j.1540-6261.2004.00695.x')],
    reported: 'big firms lead their industry (Hou); nearness to the 52-week high predicts returns (George & Hwang)',
    rule: 'Industry (SIC 3-digit) with 4+ members in U_t; LEADER = the member with the highest 63-session traded value at t. Signal at the close of t when the leader closes above the highest close of its previous 252 sessions (240+ present) and did NOT do so on any of the 63 sessions before t. FOLLOWERS = members ranked 2, 3 and 4 at t whose 10-session return (close t / close t-10) is under +2%. Buy them at the open of t+1; hold 63 sessions; one open trade per stock. (No results filing needed: the price-only twin of SQ13-LEADF.)',
    lib: 'ANOM-52WH (52-week-high deciles: rejected), CHAIN-MOM1. A leader\'s 52-week high used for its non-moving large peers was never run' },
};
export const IDS = Object.keys(RULES);

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
const pos = (x) => ok(x) && x > 0;
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
export const sic3 = (sic) => { const s = String(sic || '').replace(/\D/g, ''); if (!s || +s === 0) return null; return s.padStart(4, '0').slice(0, 3); };
// simple moving average of a series (NaN where any of the p values is missing)
export function smaArr(x, p) { const n = x.length, o = new Float64Array(n).fill(NaN); let s = 0, bad = 0; for (let i = 0; i < n; i++) { const a = x[i]; if (pos(a)) s += a; else bad++; if (i >= p) { const b = x[i - p]; if (pos(b)) s -= b; else bad--; } if (i >= p - 1 && bad === 0) o[i] = s / p; } return o; }

// ---------------- A. runner pullback ----------------
// c = closes, sma = the 20-session average (same index), t = the runner session, liqOk(u) = liquid at u (optional).
// Returns { u, H, base } for the first qualifying pullback session, or null (void / none in the window / missing data).
export function pullbackAfter(c, sma, t, liqOk = () => true, { from = TH.pbFrom, to = TH.pbTo, hi = TH.pbHi, lo = TH.pbLo } = {}) {
  if (t < 10 || !pos(c[t]) || !pos(c[t - 10])) return null; const base = c[t - 10]; let H = c[t];
  for (let u = t + 1; u <= t + to && u < c.length; u++) { const z = c[u]; if (!pos(z)) return null; if (z > H) H = z;
    if (z < base || z < lo * H) return null;                                      // void: broke the base or fell more than 15%
    if (u >= t + from && z <= hi * H && pos(sma[u]) && z > sma[u] && liqOk(u)) return { u, H, base }; }
  return null; }
// supply checks (shChg = share-count change over a year known at u, rs3 = a reverse split in 3 years); null = unknown
export function supplyPass(id, shChg, rs3) { if (!ok(shChg) || rs3 === null || rs3 === undefined) return null;
  if (id === 'SQ13-RPB-CLEAN') return shChg <= TH.flat && !rs3;
  if (id === 'SQ13-RPB-BUYBACK') return shChg <= TH.shrink && shChg >= -0.4 && !rs3;
  return true; }

// ---------------- B. industry breadth and waves ----------------
// members: [{ c50: close / 50-session average known }] -> share above (null under minMembers)
export function breadthOf(above, n, minN = TH.minMembers) { return n >= minN ? above / n : null; }
// br = one industry's breadth by session (NaN = not enough members). Wave at t: > high now, < low on some session of t-look..t-1.
export function waveAt(br, t, { low = TH.brLow, high = TH.brHigh, look = TH.brLook } = {}) { if (!(ok(br[t]) && br[t] > high)) return false;
  for (let s = Math.max(0, t - look); s < t; s++) if (ok(br[s]) && br[s] < low) return true; return false; }
// all wave sessions of one industry, at most one every `cool` sessions (a wave inside the cool-down of the previous one is skipped)
export function waveSessions(br, cool = TH.cool, opt) { const out = []; let last = -Infinity; for (let t = 0; t < br.length; t++) { if (t - last < cool) continue; if (waveAt(br, t, opt)) { out.push(t); last = t; } } return out; }
// rows [{ key, v }] -> the n keys with the highest v (finite only)
export const topBy = (rows, n) => rows.filter(x => ok(x.v)).sort((a, b) => b.v - a.v || a.key - b.key).slice(0, n).map(x => x.key);

// ---------------- B. leader rules ----------------
// close t above the highest close of the `look` sessions before t (at least minHave present)
export function newHigh(c, t, look = TH.hiLook, minHave = 240) { if (t < look || !pos(c[t])) return false; let m = -Infinity, have = 0; for (let k = t - look; k < t; k++) if (pos(c[k])) { have++; if (c[k] > m) m = c[k]; } return have >= minHave && c[t] > m; }
// the first 52-week high in `quiet` sessions
export function firstHighIn(c, t, quiet = TH.hiQuiet, look = TH.hiLook) { if (!newHigh(c, t, look)) return false; for (let k = Math.max(look, t - quiet); k < t; k++) if (newHigh(c, k, look)) return false; return true; }
// the first session index with date >= the filing date (r0), or null. The leader rule looks only at closes r0+1.. (after the filing,
// whatever its hour: no time-zone reading of EDGAR stamps needed).
export function reactionSession(D, filingDate) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < filingDate) lo = m + 1; else hi = m; } return lo < D.length ? lo : null; }
// close t above the highest close of the `look` sessions before r0 (the pre-results 52-week high; at least minHave present)
export function aboveHighBefore(c, r0, t, look = TH.hiLook, minHave = 240) { if (r0 < look || !pos(c[t])) return false; let m = -Infinity, have = 0; for (let k = r0 - look; k < r0; k++) if (pos(c[k])) { have++; if (c[k] > m) m = c[k]; } return have >= minHave && c[t] > m; }
// followers: ranked members [key...] (rank 1 first), ret(key) -> their return over the check window; returns keys of ranks 2-4 under `moved`
export function followers(ranked, ret, { ranks = TH.followRanks, moved = TH.moved } = {}) { const out = []; for (const r of ranks) { const k = ranked[r - 1]; if (k === undefined) continue; const g = ret(k); if (ok(g) && g < moved) out.push(k); } return out; }

// ---------------- results helpers ----------------
// return per year of capital tied up: sum(g - cost) / sum(days / 252) (rows { g, days }), and SPY's on the same rows (key 'spy', no cost)
export function perYear(rows, key = 'g', cost = COST) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
// calendar-year breakdown of net returns vs SPY on the same trades (information)
export function byYear(rows, yearOf) { const by = {}; for (const z of rows) { const y = yearOf(z); (by[y] = by[y] || []).push(z); }
  return Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y].map(z => z.g - COST))), spyAvg: r4(mean(by[y].filter(z => ok(z.spy)).map(z => z.spy))), perYear: r4(perYear(by[y])), spyPerYear: r4(perYear(by[y], 'spy', 0)) }])); }
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST), win = net.filter(x => x > 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;

// ---------------- library pre-registration (written before any run; idempotent, append only) ----------------
export function preRegister(LB, date = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, a] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Squad 13 (runner pullbacks and industry waves)', name: a.name, explain: a.rule + ' Paper(s): ' + a.papers.map(p => p.cite).join('; ') + '. Reported: ' + a.reported + '.',
      status: 'pre-registered ' + date + ' (squad 13 lab); 5-year one-shot pending', agent: 'squad13', kind: 'buy', hold: a.hold, libraryCheck: a.lib, sources: a.papers.map(p => p.url).filter(Boolean),
      note: 'Pre-registered ' + date + ' BEFORE any run (squad13-core.mjs RULES + TH = the exact rule; one version; hold ' + a.hold + ' sessions). 5-year one-shot by squad13-lab.mjs, first complete verdict frozen in data/squad13-lab.json; forward paper lane (data/squad13-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = date; return ch; }
