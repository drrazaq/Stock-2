// SQUAD 1 CORE (INFORMATION EDGE; 24 Oct 2026, the owner's 4-squad competition). Pure functions, no network, no files. Used by
// squad1-lab.mjs (one 5-year run per rule, first complete verdict frozen in data/squad1-lab.json firstRun, then a forward PAPER lane from
// Monday 26 Oct 2026) and test/squad1-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// PHILOSOPHY: winners trade on INFORMATION the market has not priced yet, read from official filings and data (SEC Form 4, SEC 8-K text,
// SEC 10-K customer disclosures, FINRA short interest, dividend declarations, analyst consensus), not on chart shapes.
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ1-*; the same text is written into
// data/strategy-library.json before the first computation). Common conventions (copied from the anomaly / value labs):
//   LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ on the signal session (SPY excluded).
//   EVENT rules: the event is public on its SEC filing date (or the declaration date); buy the OPEN of the first session strictly AFTER
//   that date (an evening filing is bought the next morning; a morning filing one day late: conservative); sell the CLOSE `hold` sessions
//   later (hold counts the entry session). One open trade per stock per rule. Stock must be liquid on the session before entry.
//   MONTHLY rules form on the close of the FIRST session of each month and buy the next open.
//   POINT IN TIME: Form 4 by filing date; 8-K by filing date; 10-K customer links from the filing date of the 10-K that shows them (active
//   400 days after the latest such filing); short interest 14 calendar days after its settlement date; share counts 30 days late;
//   analyst consensus snapshots only from months BEFORE the formation month; dividends by declaration date.
//   COSTS 0.8% a round trip (1.2% stress). Every gross return, the rule's and the yardstick's, is capped at +300% alike (engine audit
//   AUD-1, 24 Oct 2026: the corrected rule; nothing is dropped).
//   JUDGED at the system's tier-2 standard (value-core.mjs judge, unchanged): halves = signal before / from 2024-01-01; in BOTH halves
//   > 0 after 0.8% and 1.2%, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its
//   other days, > 0 without its 2 best trades, 20+ trades and 3+ blocks, block t >= 2.5 (blocks = the hold length) -> TRADABLE SMALL;
//   block t >= the proof bar -> PROVEN. Nothing is lowered. TRY SMALL (scan.mjs) reads firstRun with its own (softer) check.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', CAP = 3, LINK_DAYS = 400;
const P = (cite, url) => ({ cite, url });
const CMP = P('Cohen, Malloy & Pomorski (2012) Decoding Inside Information, Journal of Finance 67(3)', 'https://www.nber.org/papers/w16454');
export const RULES = {
  'SQ1-INSCLU': { family: 'insider', kind: 'buy', hold: 63, name: 'Insider cluster with a size floor and an officer (3+ insiders, 300k USD+, 30 days)',
    papers: [P('Alldredge & Blank (2019) Do Insiders Cluster Trades With Colleagues? Evidence From Daily Insider Trading, Journal of Financial Research 42(2)', 'https://ideas.repec.org/a/bla/jfnres/v42y2019i2p331-360.html'), CMP],
    reported: 'clustered insider purchases are followed by abnormal returns of over 2% in the next month (Alldredge & Blank 2019)',
    rule: 'SEC Form 4 open-market purchases (code P, acquired, price > 0) by officers, directors or "other" insiders (a reporting owner that is ONLY a 10% owner, usually a fund, is left out). A cluster fires on the filing date d when, in the 30 calendar days ending d, 3+ different such insiders bought, together 300,000 USD+, and at least one of them is an OFFICER. Buy the next open after d; hold 63 sessions; one open trade per stock; after a cluster fires, the same stock cannot fire again for 30 days.',
    lib: 'E3 (insider cluster, no size floor: not proven), C-INS2 (2+ insiders then quiet days: rejected), DEC2-INSQ (2+ insiders 200k+ in a B-FCF1 company: too few cases), ANOM-INSIDER (single opportunistic buys: rejected), EXP-INS1 (top-ranked insiders: rejected). New here: 3+ people, 300k USD floor, an officer required, funds (10%-only owners) removed, 63-session hold' },
  'SQ1-CEODIP': { family: 'insider', kind: 'buy', hold: 63, name: 'CEO or CFO buys 100k USD+ after the stock fell 25%+ in 6 months',
    papers: [P('Lakonishok & Lee (2001) Are Insider Trades Informative? Review of Financial Studies 14(1)', 'https://doi.org/10.1093/rfs/14.1.79'), P('Wang, Shin & Francis (2012) Are CFOs\' Trades More Informative Than CEOs\' Trades? Journal of Financial and Quantitative Analysis 47(4)', 'https://doi.org/10.1017/S0022109012000233'), P('Jenter (2005) Market Timing and Managerial Portfolio Decisions, Journal of Finance 60(4)', 'https://doi.org/10.1111/j.1540-6261.2005.00785.x')],
    reported: 'insiders are contrarian; purchases predict returns, most in smaller firms; CFO and CEO purchases carry the most information',
    rule: 'SEC Form 4 open-market purchases (code P) whose reporting owner is an officer with a title containing CEO / Chief Executive / CFO / Chief Financial, 100,000 USD+ in one filing; the stock closed 25%+ lower on the session before entry than 126 sessions earlier. Buy the next open after the filing date; hold 63; one open trade per stock.',
    lib: 'EXP-INS1 ranks insiders by past record (rejected); ANOM-INSIDER (any opportunistic buy: rejected). The contrarian top-officer version was never run' },
  'SQ1-INSLOWSI': { family: 'insider+si', kind: 'buy', hold: 63, name: 'Insiders buy while short sellers stay away (2+ insiders 100k USD+, short interest under 3% and not rising)',
    papers: [P('Chung, Sul & Wang (2019) Insider trading and short selling: combining the signals of informed traders, Journal of Portfolio Management (summary: Alpha Architect)', 'https://alphaarchitect.com/short-selling-insider-selling-bad-news-part-2/'), P('Boehmer, Jones & Zhang (2008) Which Shorts Are Informed? Journal of Finance 63(2)', 'https://doi.org/10.1111/j.1540-6261.2008.01324.x')],
    reported: 'combining insider demand and short-selling signals earned 1.27% in the next month and 2.03% in the next year (1977-2014); heavily shorted stocks underperform',
    rule: 'SEC Form 4 open-market purchases (code P) by officers / directors / other insiders (10%-only owners left out): 2+ different insiders in the 30 calendar days ending the filing date d, together 100,000 USD+. AND the FINRA short interest known on d (published ~14 days after settlement) is under 3% of the share count known (30 days late) AND not higher than the report about a month earlier (2 reports back). Buy the next open after d; hold 63; one open trade per stock; 30-day cooldown per stock. Short interest is used as the AVOID filter the research queue asked for.',
    lib: 'C-SI1 (high short interest avoid: queued), ANOM-SILOW (low SI alone: rejected), E3 / C-INS2 (clusters alone). The combination was never run' },
  'SQ1-BBAUTH': { family: 'buyback', kind: 'buy', hold: 63, name: 'Buyback authorization of 5%+ of the company (8-K text)',
    papers: [P('Ikenberry, Lakonishok & Vermaelen (1995) Market underreaction to open market share repurchases, Journal of Financial Economics 39(2-3)', 'https://doi.org/10.1016/0304-405X(95)00826-Z'), P('Peyer & Vermaelen (2009) The Nature and Persistence of Buyback Anomalies, Review of Financial Studies 22(4)', 'https://ideas.repec.org/a/oup/rfinst/v22y2009i4p1693-1745.html')],
    reported: 'about +12% abnormal over 4 years after open-market buyback announcements (1980-90); Peyer & Vermaelen reject that the anomaly disappeared',
    rule: 'SEC EDGAR full-text search of 8-Ks (incl. exhibits) for board buyback-authorization phrases (BUYBACK_PHRASES); the matching document is read and the authorized size taken from sentences that name a repurchase / buyback AND an authorization / approval: the largest dollar amount ($ N million / billion) and the largest "up to N shares"; size = max(dollars / (share count known x close before entry), shares / share count known). Size 5%+ (40%+ = a parsing error, left out). First such filing per company in 180 days. Buy the next open after the filing date; hold 63; one open trade per stock.',
    lib: 'E8 (buyback announcements: queued), ANOM-BBANN (needs data: dates were not structured), ANOM-BBY (money actually spent: rejected), V17 (queued). First run of the announcement itself' },
  'SQ1-BBDIP': { family: 'buyback', kind: 'buy', hold: 126, name: 'Buyback authorization of 3%+ after the stock fell 15%+ in 3 months (8-K text)',
    papers: [P('Peyer & Vermaelen (2009) The Nature and Persistence of Buyback Anomalies, Review of Financial Studies 22(4)', 'https://ideas.repec.org/a/oup/rfinst/v22y2009i4p1693-1745.html'), P('Ikenberry, Lakonishok & Vermaelen (1995) JFE 39(2-3)', 'https://doi.org/10.1016/0304-405X(95)00826-Z')],
    reported: 'buybacks answer an overreaction to bad news; the drift is largest after prior price falls (Peyer & Vermaelen) and for value stocks (Ikenberry et al.: +45% over 4 years for the highest book-to-market)',
    rule: 'The SQ1-BBAUTH event with size 3%+ (instead of 5%+) AND the close on the session before entry 15%+ below the close 63 sessions earlier. Buy the next open after the filing date; hold 126; one open trade per stock.',
    lib: 'as SQ1-BBAUTH' },
  'SQ1-CUSTMOM': { family: 'customer', kind: 'buy', hold: 21, name: 'Customer momentum from 10-K major-customer disclosures',
    papers: [P('Cohen & Frazzini (2008) Economic Links and Predictable Returns, Journal of Finance 63(4)', 'https://ideas.repec.org/a/bla/jfinan/v63y2008i4p1977-2011.html')],
    reported: 'buying suppliers whose major customers rose most last month and selling those whose customers fell earned ~1.5% a month (1981-2004); the supplier reacts late to its customer\'s news',
    rule: 'Monthly (first session of the month): suppliers with an ACTIVE major-customer link in data/chain-graph.json (type customer: the supplier\'s own 10-K / 10-Q text naming the customer next to a concentration word; active from the first session after the first filing showing it until 400 days after the latest such filing on or before the day). Customer return = average return of the linked customers over the last 21 sessions. Liquid suppliers ranked by customer return; buy the top 20% (at least 10 ranked suppliers that month, else the month is skipped) at the next open; hold 21.',
    lib: 'N4 (customer momentum with value-chain layers as the map: not proven), C-CUST1 (the 10-K version: needs data). First run with the 10-K customer map. Note: the customers are the 47 large demand nodes of chain-defs.json (today\'s choice of big buyers, a mild hindsight risk)' },
  'SQ1-GUIDEUP': { family: 'guidance', kind: 'buy', hold: 63, name: 'Company raises its own full-year guidance (8-K text)',
    papers: [P('Ng, Tuna & Verdi (2013) Management forecast credibility and underreaction to news, Review of Accounting Studies 18(4)', 'https://ideas.repec.org/a/spr/reaccs/v18y2013i4d10.1007_s11142-012-9217-4.html'), P('Bernard & Thomas (1989) Post-Earnings-Announcement Drift, Journal of Accounting Research 27', 'https://doi.org/10.2307/2491062')],
    reported: 'prices underreact to management forecast news: returns drift after the forecast, like post-earnings drift',
    rule: 'SEC EDGAR full-text search of 8-Ks (incl. exhibits) for guidance-raise phrases (GUIDE_PHRASES, e.g. "raises full year", "raised its guidance", "raising outlook"); the filer\'s own stock. First such filing per company in 60 days. Buy the next open after the filing date; hold 63; one open trade per stock.',
    lib: 'CHAIN-READ1 / CHAIN-DEMAND1 bought OTHER chain members after a raise (rejected); ANOM-SUE (analyst surprise drift: not proven). The company\'s own raise across the whole market was never run' },
  'SQ1-RECUP': { family: 'analyst', kind: 'buy', hold: 63, name: 'Analyst consensus turns more bullish (buy share up 15+ points in 3 months)',
    papers: [P('Jegadeesh, Kim, Krische & Lee (2004) Analyzing the Analysts: When Do Recommendations Add Value? Journal of Finance 59(3)', 'https://doi.org/10.1111/j.1540-6261.2004.00665.x'), P('Womack (1996) Do Brokerage Analysts\' Recommendations Have Investment Value? Journal of Finance 51(1)', 'https://doi.org/10.1111/j.1540-6261.1996.tb05205.x')],
    reported: 'the CHANGE in the consensus recommendation predicts returns better than its level (Jegadeesh et al. 2004)',
    rule: 'Monthly (first session of month m): Finnhub recommendation trends (monthly counts of strong buy / buy / hold / sell / strong sell). Using only the snapshots of months BEFORE m: now = the snapshot of month m-1, before = month m-4. Bullish share = (strong buy + buy) / all; 5+ analysts in both; bullish share up 0.15+; liquid. Buy the next open; hold 63; one open trade per stock. Not run if the source has under 4 years of history.',
    lib: 'E5 (analyst upgrades: collecting data), EXP-AN1 / EXP-AN2 (single firm grades: collecting data), ANOM-REVISION (needs data), C-REV1 (queued). First consensus-change run' },
  'SQ1-DIVHIKE': { family: 'divs', kind: 'buy', hold: 63, name: 'Large regular dividend increase (25%+)',
    papers: [P('Michaely, Thaler & Womack (1995) Price Reactions to Dividend Initiations and Omissions: Overreaction or Drift? Journal of Finance 50(2)', 'https://doi.org/10.1111/j.1540-6261.1995.tb04793.x'), P('Grullon, Michaely & Swaminathan (2002) Are Dividend Changes a Sign of Firm Maturity? Journal of Business 75(3)', 'https://doi.org/10.1086/339903')],
    reported: 'dividend changes are followed by drift in the same direction (MTW); Grullon et al. find a positive announcement reaction but question later abnormal returns: mixed evidence',
    rule: 'Massive dividend declarations: a regular cash dividend (type CD, frequency 1, 2, 4 or 12) whose amount is 1.25x to 3x the previous regular cash dividend of the same frequency, declared 20 to 400 days earlier. Buy the next open after the declaration date; hold 63; one open trade per stock.',
    lib: 'ANOM-DIVINIT (initiations: rejected), V7 (dividend growth: needs data). First run of large increases' },
  'SQ1-SIAVOID': { family: 'si', kind: 'avoid', hold: 21, name: 'AVOID heavily shorted stocks (15%+ of shares sold short)',
    papers: [P('Asquith, Pathak & Ritter (2005) Short interest, institutional ownership, and stock returns, Journal of Financial Economics 78(2)', 'https://doi.org/10.1016/j.jfineco.2004.06.005'), P('Boehmer, Jones & Zhang (2008) Which Shorts Are Informed? Journal of Finance 63(2)', 'https://doi.org/10.1111/j.1540-6261.2008.01324.x')],
    reported: 'heavily shorted stocks underperform, most when institutional ownership is low',
    rule: 'AVOID TEST, never a buy. Monthly: liquid stocks whose FINRA short interest known that day (14 days after settlement) is 15%+ of the share count known; their next-21-session return (next open to close) vs the average liquid stock. The avoid filter works if they LAG the average stock in both halves (edge < 0) with block t <= -2.5 (AVOID CONFIRMED); edge < 0 in both halves without that t = AVOID WEAK; else AVOID NOT SUPPORTED. Every verdict carries "REJECTED AS A BUY" so TRY SMALL can never buy it.',
    lib: 'C-SI1 (the same avoid at 20%: queued), ANOM-SILOW / ANOM-DTCLOW / ANOM-SIDROP (long side: rejected)' },
};
export const IDS = Object.keys(RULES), BUY_IDS = IDS.filter(id => RULES[id].kind === 'buy');
export const ONE_OPEN = new Set(IDS.filter(id => !['SQ1-CUSTMOM', 'SQ1-SIAVOID'].includes(id)));

// ---------------- phrases (EDGAR full-text search, exact phrases, forms 8-K incl. exhibits) ----------------
export const BUYBACK_PHRASES = ['authorized a new share repurchase', 'approved a new share repurchase', 'authorized a share repurchase program', 'approved a share repurchase program',
  'authorized a new stock repurchase', 'approved a new stock repurchase', 'authorized a stock repurchase program', 'approved a stock repurchase program', 'authorized the repurchase of up to',
  'approved the repurchase of up to', 'new share repurchase program', 'new stock repurchase program', 'new repurchase authorization', 'increase to its share repurchase', 'increase in its share repurchase',
  'authorized a new buyback', 'new buyback program'];
export const GUIDE_PHRASES = ['raises full year', 'raised full year', 'raising full year', 'raises its full year', 'raised its full year', 'raising its full year', 'raises fiscal year', 'raised fiscal year',
  'raising fiscal year', 'increases full year', 'increased full year', 'increasing full year', 'raises guidance', 'raised guidance', 'raising guidance', 'raises its guidance', 'raised its guidance',
  'raises outlook', 'raised outlook', 'raising outlook', 'raises its outlook', 'raised its outlook'];

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoMs = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoMs(ms(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
// top (or bottom) `frac` of rows [{ key, v }] with a finite v; fewer than minRows -> []
export function pickFrac(rows, frac, dir = 'top', minRows = 10) { const a = rows.filter(r => ok(r.v)); if (a.length < minRows) return [];
  a.sort((x, y) => dir === 'top' ? y.v - x.v : x.v - y.v); return a.slice(0, Math.max(1, Math.ceil(a.length * frac))).map(r => r.key); }
const ym = (d) => d.slice(0, 7);
export const monthStarts = (D) => { const o = []; for (let t = 1; t < D.length; t++) if (ym(D[t]) !== ym(D[t - 1])) o.push(t); return o; };
// first index of D (sorted dates) strictly after date d (D.length if none)
export function firstAfter(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; }
export const NYSE_HOLIDAYS = new Set(['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
const nextWeekday = (d) => { let x = ms(d) + DAY; while ([0, 6].includes(new Date(x).getUTCDay())) x += DAY; return isoMs(x); };
export function nextSession(d, hol = NYSE_HOLIDAYS) { let x = nextWeekday(d); while (hol.has(x)) x = nextWeekday(x); return x; }
// the same stock on its other days (capped like the trades): windows of `len` sessions from `from` to `to` every `step`, okAt(u) true, not
// overlapping `busy`; 3+ windows needed
export function ownAverage({ from, to, len, step = 10, okAt, busy = [], ret }) { const v = []; for (let u = from; u + len - 1 <= to; u += step) { if (!okAt(u)) continue; const x = u + len - 1; if (busy.some(([a, b]) => u <= b && x >= a)) continue; const g = ret(u, x); if (ok(g)) v.push(capG(g)); } return v.length >= 3 ? mean(v) : null; }

// ---------------- insiders (SEC Form 3/4/5 data sets; REPORTINGOWNER.RPTOWNER_RELATIONSHIP = OFFICER, DIRECTOR, TENPERCENTOWNER, OTHER) ----------------
export function relFlags(rel) { const s = String(rel || '').toUpperCase(); return { officer: /OFFICER/.test(s), director: /DIRECTOR/.test(s), ten: /TENPERCENT|10%/.test(s), other: /OTHER/.test(s) }; }
// an insider for the cluster rules: officer, director or "other"; a 10%-only owner (usually a fund) is not
export const isInsider = (f) => !!(f && (f.officer || f.director || f.other));
export const isTopOfficer = (title) => /\b(CEO|C\.E\.O\.?|CFO|C\.F\.O\.?)\b|chief\s+(executive|financial)\s+officer/i.test(String(title || ''));
// buys: [{ sym, d (filing date), who, usd, officer (bool), insider (bool) }]. Cluster fires on the first filing date d at which, in the `days`
// calendar days ending d, minPeople+ distinct insiders bought for minUsd+ together (and an officer among them if needOfficer). After a fire the
// same stock cannot fire again until `cooldown` days after it. -> [{ sym, d, people, usd }]
export function clusterEvents(buys, { minPeople = 3, minUsd = 300000, needOfficer = true, days = 30, cooldown = 30 } = {}) {
  const by = new Map(); for (const b of buys) { if (!b || !b.insider || !b.sym || !b.d || !(b.usd > 0)) continue; (by.get(b.sym) || by.set(b.sym, []).get(b.sym)).push(b); }
  const out = [];
  for (const [sym, a] of by) { a.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0); let block = '';
    const dates = [...new Set(a.map(x => x.d))];
    for (const d of dates) { if (d < block) continue; const lo = addDays(d, -(days - 1)), win = a.filter(x => x.d >= lo && x.d <= d), people = new Set(win.map(x => x.who)), usd = win.reduce((s, x) => s + x.usd, 0);
      if (people.size >= minPeople && usd >= minUsd && (!needOfficer || win.some(x => x.officer))) { const ck = (win.filter(x => x.cik).pop() || {}).cik; out.push({ sym, d, people: people.size, usd: Math.round(usd), ...(ck ? { cik: ck } : {}) }); block = addDays(d, cooldown); } } }
  return out.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0);
}
// top-officer purchases: rows summed per (sym, filing date, who); kept if a CEO/CFO title and minUsd+ -> [{ sym, d, who, usd }]
export function topOfficerBuys(buys, minUsd = 100000) { const m = new Map();
  for (const b of buys) { if (!b || !b.top || !(b.usd > 0)) continue; const k = b.sym + '|' + b.d + '|' + b.who; const x = m.get(k) || m.set(k, { sym: b.sym, d: b.d, who: b.who, usd: 0 }).get(k); x.usd += b.usd; }
  return [...m.values()].filter(x => x.usd >= minUsd).sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0); }
// a Form 4 primary document (XML, or the full .txt submission holding it) -> { sym, issuerCik, owners: [{ cik, officer, director, ten, other, title }], buys: [{ shares, px, usd, date }] }
export function parseForm4(xml) { const s = String(xml || ''), tag = (src, t) => { const m = new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>', 'i').exec(src); if (!m) return null; const v = /<value>([\s\S]*?)<\/value>/i.exec(m[1]); return (v ? v[1] : m[1].replace(/<[^>]*>/g, '')).trim(); };
  if (!/<ownershipDocument>/i.test(s)) return null; const doc = s.slice(s.search(/<ownershipDocument>/i));
  const yes = (v) => /^(1|true)$/i.test(String(v || ''));
  const owners = []; for (const m of doc.matchAll(/<reportingOwner>([\s\S]*?)<\/reportingOwner>/gi)) { const o = m[1]; owners.push({ cik: tag(o, 'rptOwnerCik'), officer: yes(tag(o, 'isOfficer')), director: yes(tag(o, 'isDirector')), ten: yes(tag(o, 'isTenPercentOwner')), other: yes(tag(o, 'isOther')), title: tag(o, 'officerTitle') || '' }); }
  const buys = []; for (const m of doc.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)) { const t = m[1], code = tag(t, 'transactionCode'), ad = tag(t, 'transactionAcquiredDisposedCode'), sh = +tag(t, 'transactionShares'), px = +tag(t, 'transactionPricePerShare');
    if (code === 'P' && ad === 'A' && sh > 0 && px > 0) buys.push({ shares: sh, px, usd: sh * px, date: tag(t, 'transactionDate') }); }
  return { sym: String(tag(doc, 'issuerTradingSymbol') || '').toUpperCase().replace(/-/g, '.'), issuerCik: tag(doc, 'issuerCik'), owners, buys }; }
// EDGAR daily index (form.YYYYMMDD.idx or master.YYYYMMDD.idx) -> [{ form, cik, date, file }] for the forms wanted (exact names)
// keep(row): rows to consider (e.g. the issuer CIK is in the universe; the same file is listed once per issuer and once per owner)
export function parseDailyIdx(text, forms, keep = () => true) { const out = [], seen = new Set();
  for (const line of String(text || '').split('\n')) { let form, cik, date, file; const p = line.split('|');
    if (p.length === 5 && /^\d+$/.test(p[0].trim())) { [cik, , form, date, file] = p.map(x => x.trim()); }
    else { const m = /^(\S+(?: \S+)?)\s{2,}.*?\s{2,}(\d+)\s{2,}(\d{8}|\d{4}-\d\d-\d\d)\s{2,}(\S+)\s*$/.exec(line); if (!m) continue; [, form, cik, date, file] = m; }
    if (!forms.has(form) || seen.has(file)) continue; if (/^\d{8}$/.test(date)) date = date.slice(0, 4) + '-' + date.slice(4, 6) + '-' + date.slice(6);
    const row = { form, cik: String(+cik), date, file }; if (!keep(row)) continue; seen.add(file); out.push(row); }
  return out; }

// ---------------- point-in-time company identity (fix of 24 Oct 2026: never TODAY's ticker list alone) ----------------
// evs = [[date, value], ...] evidence that `value` (a CIK, or a ticker) was right on `date` (from Form 4 submissions, EDGAR hits). The value
// of the latest evidence on or before d; else the earliest evidence after d within maxAfter days; else null.
export function pitPick(evs, d, maxAfter = 400) { if (!evs || !evs.length) return null; let best = null, bd = '', next = null, nd = '';
  for (const [x, v] of evs) { if (x <= d) { if (x >= bd) { bd = x; best = v; } } else if (!nd || x < nd) { nd = x; next = v; } }
  if (best !== null) return best; return next !== null && daysBetween(d, nd) <= maxAfter ? next : null; }
// the share count known on d (30 days late) for a company: the filing's own CIK first, then the point-in-time CIK of the ticker, then the
// CIK of today's ticker list; the first of these with a known count wins. series(cik, d) -> count or null.
export function sharesAt({ sym, d, filingCik, evidence, todayCik, series }) {
  for (const c of [filingCik, pitPick(evidence && evidence.get(sym), d), todayCik ? todayCik(sym) : null]) { if (!c) continue; const n = series(String(+c), d); if (n > 0) return n; }
  return null; }

// ---------------- buybacks (8-K text) ----------------
export function html2text(h) { return String(h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
  .replace(/&#8217;|&rsquo;/gi, '\'').replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"').replace(/&#821[12];|&ndash;|&mdash;/gi, '-').replace(/&#36;/g, '$').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
const sentences = (t) => String(t || '').split(/(?<=[.;!?])\s+(?=[A-Z(""])/);
// the authorized size named in an 8-K: the largest dollar amount and the largest "up to N shares" in sentences that name a repurchase /
// buyback AND an authorization / approval. -> { usd, shares } (null each when none)
export function buybackAmount(text) { let usd = null, shares = null;
  for (const s of sentences(text)) { if (!/repurchas|buy-?back|buy back/i.test(s) || !/authori[sz]|approv/i.test(s)) continue;
    for (const m of s.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(billion|million|bn|mm|m)?\b/gi)) { const n = +m[1].replace(/,/g, ''), u = (m[2] || '').toLowerCase(); const v = u === 'billion' || u === 'bn' ? n * 1e9 : u === 'million' || u === 'mm' || u === 'm' ? n * 1e6 : n; if (v >= 1e5 && (usd === null || v > usd)) usd = v; }
    for (const m of s.matchAll(/up to (?:an aggregate of |a total of )?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(million )?(?:shares|of (?:its|the company's|our) (?:outstanding )?(?:common )?shares)/gi)) { const v = +m[1].replace(/,/g, '') * (m[2] ? 1e6 : 1); if (v >= 1000 && (shares === null || v > shares)) shares = v; } }
  return { usd, shares }; }
// size of an authorization as a fraction of the company: max(usd / market value, shares / share count); null when nothing is known
export function buybackSize({ usd, shares }, sharesOut, px) { const a = usd > 0 && sharesOut > 0 && px > 0 ? usd / (sharesOut * px) : null, b = shares > 0 && sharesOut > 0 ? shares / sharesOut : null;
  return a === null && b === null ? null : Math.max(a ?? -Infinity, b ?? -Infinity); }
// keep the first event per symbol in every `gapDays` window -> events sorted by date (input [{ sym, d, ... }])
export function firstPerCompany(events, gapDays) { const last = new Map(), out = [];
  for (const e of [...events].sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0)) { const p = last.get(e.sym); if (p && daysBetween(p, e.d) < gapDays) continue; last.set(e.sym, e.d); out.push(e); }
  return out; }
// EDGAR full-text search answer -> compact hits [id, adsh, cik, fileDate, sic, tickers]
export function eftsHits(j) { const out = []; for (const h of (j && j.hits && j.hits.hits) || []) { const s = h._source || {}, tk = [];
    for (const dn of s.display_names || []) { const m = String(dn).match(/\(([A-Z0-9.,\s-]+)\)\s+\(CIK/); if (m) tk.push(...m[1].split(',').map(x => x.trim()).filter(Boolean)); }
    out.push([h._id, s.adsh, +((s.ciks || [])[0] || 0), s.file_date, (s.sics || [])[0] || '', tk]); } return out; }

// ---------------- customer links (data/chain-graph.json, type customer) ----------------
// active on date d: first filing strictly before d, and d within LINK_DAYS days of the latest filing strictly before d
export function linkActive(link, d, linkDays = LINK_DAYS) { const f = (link.filings && link.filings.length ? link.filings : [link.first_public_at]).filter(x => x && x < d).sort(); if (!f.length) return false; return daysBetween(f[f.length - 1], d) <= linkDays; }

// ---------------- analyst consensus (Finnhub recommendation trends) ----------------
// rows [{ period 'YYYY-MM-DD', strongBuy, buy, hold, sell, strongSell }]; formation date fd. now = month m-1, before = month m-4 (exact months).
// -> { now, before, nNow, nBefore, change } or null
const monthAdd = (m, k) => { let y = +m.slice(0, 4), mo = +m.slice(5, 7) + k; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return y + '-' + String(mo).padStart(2, '0'); };
export function recChange(rows, fd) { const m = fd.slice(0, 7), at = (mm) => (rows || []).find(r => String(r.period || '').slice(0, 7) === mm);
  const a = at(monthAdd(m, -1)), b = at(monthAdd(m, -4)); if (!a || !b) return null;
  const n = (r) => ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].reduce((s, k) => s + (+r[k] || 0), 0), bull = (r) => (+r.strongBuy || 0) + (+r.buy || 0);
  const nA = n(a), nB = n(b); if (!(nA > 0) || !(nB > 0)) return null; const now = bull(a) / nA, before = bull(b) / nB; return { now, before, nNow: nA, nBefore: nB, change: now - before }; }
export const recUp = (x) => !!x && x.nNow >= 5 && x.nBefore >= 5 && x.change >= 0.15;

// ---------------- dividends (Massive: { sym, decl, type, freq, amt }) ----------------
export function divHikes(rows, { min = 1.25, max = 3, minGap = 20, maxGap = 400, from = '0000' } = {}) { const by = new Map();
  for (const r of rows) if (r && r.sym && r.decl && r.type === 'CD' && [1, 2, 4, 12].includes(+r.freq) && r.amt > 0) (by.get(r.sym) || by.set(r.sym, []).get(r.sym)).push(r);
  const out = []; for (const [sym, a] of by) { a.sort((x, y) => x.decl < y.decl ? -1 : x.decl > y.decl ? 1 : 0);
    for (let i = 1; i < a.length; i++) { const r = a[i]; if (r.decl < from) continue; let p = null; for (let j = i - 1; j >= 0; j--) if (+a[j].freq === +r.freq && a[j].decl < r.decl) { p = a[j]; break; }
      if (!p) continue; const g = daysBetween(p.decl, r.decl); if (g < minGap || g > maxGap) continue; const ratio = r.amt / p.amt; if (ratio >= min && ratio <= max) out.push({ sym, d: r.decl, ratio: r4(ratio), prev: p.amt, amt: r.amt }); } }
  return out.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0); }

// ---------------- short interest (FINRA) ----------------
// arr sorted [[settlementDate, shares, daysToCover]]; the report known on d (published ~14 calendar days after settlement); back = how many
// reports earlier -> { d, q, dtc } or null
export function siKnown(arr, d, back = 0) { if (!arr) return null; const lim = addDays(d, -14); let k = -1; for (let j = 0; j < arr.length; j++) if (arr[j][0] <= lim) k = j; k -= back; return k >= 0 ? { d: arr[k][0], q: arr[k][1], dtc: arr[k][2] } : null; }
export const lowShort = (now, prev, sharesOut) => !!now && sharesOut > 0 && now.q / sharesOut < 0.03 && (!prev || now.q <= prev.q);
// avoid-rule verdict on halves R = { older, newer } (halfStat): never a buy
export function avoidVerdict(R, minN = 20) { const H = ['older', 'newer'].map(k => R[k] || {});
  if (!H.every(r => r.n >= minN && r.blocks >= 3)) return { verdict: 'TOO FEW CASES (REJECTED AS A BUY)', why: 'avoid test: fewer than ' + minN + ' cases or 3 blocks in a half' };
  if (H.every(r => r.edge < 0 && r.tBlock !== null && r.tBlock <= -2.5)) return { verdict: 'AVOID CONFIRMED (REJECTED AS A BUY)', why: 'these stocks lagged the average stock in both halves with block t <= -2.5: a valid AVOID filter, never a buy' };
  if (H.every(r => r.edge < 0)) return { verdict: 'AVOID WEAK (REJECTED AS A BUY)', why: 'these stocks lagged the average stock in both halves, but block t did not reach -2.5 in both: a weak AVOID filter, never a buy' };
  return { verdict: 'AVOID NOT SUPPORTED (REJECTED AS A BUY)', why: 'these stocks did not lag the average stock in both halves: no evidence for this AVOID filter; never a buy' }; }

// ---------------- paper board ----------------
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
// trade-list shape (information)
export function shapeOf(tr, yearOf) { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), by = {};
  tr.forEach((z, i) => { const y = yearOf(z); (by[y] = by[y] || []).push(net[i]); });
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null,
    byYear: Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y])), win: r4(by[y].filter(x => x > 0).length / by[y].length) }])) }; }

// ---------------- library pre-registration (before any run; idempotent) ----------------
export function preRegister(LB, date = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, a] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Squad 1 (information edge)', name: a.name, explain: a.rule + ' Paper(s): ' + a.papers.map(p => p.cite).join('; ') + '. Reported: ' + a.reported + '.',
      status: 'pre-registered ' + date + ' (squad 1 lab); 5-year one-shot pending', agent: 'squad1', kind: a.kind, hold: a.hold, libraryCheck: a.lib, sources: a.papers.map(p => p.url).filter(Boolean),
      note: 'Pre-registered ' + date + ' BEFORE any run (squad1-core.mjs RULES = the exact rule; one version; hold ' + a.hold + ' sessions). 5-year one-shot by squad1-lab.mjs, first complete verdict frozen in data/squad1-lab.json; forward paper lane (data/squad1-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = date; return ch; }
