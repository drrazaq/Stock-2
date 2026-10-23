// EXPERT LAB CORE (23 Oct 2026; expert-lab.mjs uses it). Pure functions, no network, no files.
// Owner's request: "TipRanks, Investing.com, Yahoo Finance and more have analyst profiles and portfolios showing their trades: find out
// how they won their trades and make the system smarter." The ranked platforms show who won IN THE PAST (survivorship: a ranking is a
// list of past winners). To follow an expert without that hindsight, the lab ranks every expert ITSELF, POINT IN TIME: on a signal day
// only calls whose holding window had already ENDED before that day count (PITRanker). Long only. Never places an order.
//
// PRE-REGISTERED RULES (23 Oct 2026, BEFORE any run; one version each; library entries EXP-*). Common to all: buy the OPEN of the first
// session after the public date (rating date, 13F / Form 4 FILING date, Congress DISCLOSURE date; never the trade or quarter date); the
// stock must be liquid the session before (close >= 5 USD, 20-day average traded value >= 5M USD); sell the close of the hold's last
// session, or the next open after a close 35% under the buy (the system's disaster stop); one open trade per stock per rule. Ranking =
// the expert's resolved calls (minimum shown), success rate (share beating the average liquid stock over the same sessions) and average
// excess return over the average stock; each turned into a percentile among the eligible experts that day, averaged; TOP 10% (at least
// 30 eligible experts that day, else no signal). Judged at the system's tier-2 standard (value-core.mjs judge: both halves split at the
// median signal session, > 0 after 0.8% and 1.2% cost, edge over the average liquid stock bought and sold on the same sessions > 0,
// better than the same stock on its other days, > 0 without the 2 best, block t >= 2.5 = TRADABLE SMALL; proof bar = PROVEN) PLUS the
// SKILL gate: better (average after cost AND edge) than the same rule WITHOUT the ranking (every expert's calls) in both halves.
//   EXP-AN1   analyst FIRM upgrades a stock INTO buy, or initiates at buy (FMP grades history; firm level, the only history licensed on
//             the current plans); firm = top 10% by its earlier buy calls (63-session excess, min 20 resolved, last 3 years); hold 63.
//   EXP-AN2   2+ different top-10% firms with such a call on the same stock within 10 sessions; buy after the completing call; hold 63.
//   EXP-13F1  a manager whose 13F has 10-150 positions and 100M USD+ files a NEW position or a LARGE ADD (value growth / split-adjusted
//             price growth >= 1.5x since its previous 13F) worth >= 1% of its book; manager = top 10% by the follow return of its earlier
//             13Fs (value-weighted 20 largest positions, bought after the filing day, 63 sessions, vs the average stock; last 8
//             resolved filings, min 4); hold 126 (the 13F horizon: one quarter of lag + one quarter of drift).
//   EXP-13F2  2+ different top-10% managers make such a move in the same stock with filing dates within 45 days; buy after the 2nd; 126.
//   EXP-INS1  an open-market purchase (Form 4 code P, 10,000 USD+) by an insider whose earlier purchases rank top 10% (126-session
//             excess after each filing, min 2 resolved purchase days); hold 126.
//   EXP-CONG1 a Congress member's stock purchase, bought after its DISCLOSURE date; member = top 10% by earlier disclosed purchases
//             (126 sessions, min 5 resolved); hold 126. NEEDS DATA on the current plans (see expert-lab.mjs).
//   EXP-ETORO1 a NEW unleveraged long position in a US stock opened by an eToro Popular Investor ranked by eToro's own public API (2-year
//             gain, risk score <= 5, 50+ copiers); forward paper only (no history exists in the API); hold 63. Needs the owner's keys.
export const COST = 0.008, STOP = 0.35;
export const RULES = {
  'EXP-AN1': { name: 'Top-10% analyst firm: upgrade into buy or initiation at buy', hold: 63, stop: STOP, rank: { horizon: 63, minCalls: 20, frac: 0.1, minExperts: 30, years: 3 }, data: 'FMP grades (firm level)' },
  'EXP-AN2': { name: '2+ top-10% analyst firms turn buy within 10 sessions', hold: 63, stop: STOP, cluster: { window: 10, min: 2 }, data: 'FMP grades (firm level)' },
  'EXP-13F1': { name: 'Top-10% 13F manager: new position or large add (1%+ of book)', hold: 126, stop: STOP, rank: { horizon: 63, minCalls: 4, lastN: 8, frac: 0.1, minExperts: 30 }, data: 'SEC Form 13F data sets' },
  'EXP-13F2': { name: '2+ top-10% 13F managers buy the same stock within 45 days', hold: 126, stop: STOP, cluster: { days: 45, min: 2 }, data: 'SEC Form 13F data sets' },
  'EXP-INS1': { name: 'Purchase by a top-10% insider (by earlier purchases)', hold: 126, stop: STOP, rank: { horizon: 126, minCalls: 2, frac: 0.1, minExperts: 30 }, minUsd: 10000, data: 'SEC Form 4 data sets' },
  'EXP-CONG1': { name: 'Purchase by a top-10% Congress member (by earlier disclosed purchases)', hold: 126, stop: STOP, rank: { horizon: 126, minCalls: 5, frac: 0.1, minExperts: 30 }, data: 'needs data' },
  'EXP-ETORO1': { name: 'New long by a top eToro Popular Investor (eToro ranking)', hold: 63, stop: STOP, forwardOnly: true, data: 'eToro public API (owner keys)' },
};
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);

// ---- analyst grades ----
const BUY = /^(strong[ -]?buy|buy|outperform|overweight|market outperform|sector outperform|positive|accumulate|add|top pick|conviction buy|long[- ]term buy|moderate buy|speculative buy|outperformer|buy\/outperform)$/i;
const HOLD = /^(hold|neutral|equal[- ]?weight|market perform|sector perform|peer perform|in[- ]line|sector weight|perform|mixed|market weight|fair value|moderate)$/i;
const SELL = /^(sell|strong[ -]?sell|underperform|underweight|reduce|negative|moderate sell|sector underperform|market underperform)$/i;
export function gradeClass(g) { const s = String(g || '').trim(); if (!s) return null; return BUY.test(s) ? 'buy' : HOLD.test(s) ? 'hold' : SELL.test(s) ? 'sell' : null; }
// a NEW buy call: an upgrade from a non-buy grade into buy, or an initiation at buy
export function analystEvent(row) { if (!row) return null; const a = String(row.action || '').toLowerCase(), n = gradeClass(row.newGrade);
  if (n !== 'buy') return null; if (/^init/.test(a)) return 'init'; if (a === 'upgrade' && gradeClass(row.previousGrade) !== 'buy') return 'upgrade'; return null; }

// ---- the hold walk: buy the open of session k; sell the close of k+hold-1, or the next open after a close under buy x (1-stop).
// Returns null if the buy-day open is missing or the hold has not ended yet (still open). Gaps: the last known close is used.
export function walkHold(O, C, k, hold, stop) { const e = O[k], T = C.length; if (!(e > 0)) return null; const last = k + hold - 1; if (last >= T) return null;
  for (let q = k; q <= last; q++) { const c = C[q]; if (c > 0 && c < e * (1 - stop)) { if (q === last) return { x: q, g: c / e - 1, kind: 'stop' }; const o = O[q + 1]; if (o > 0) return { x: q + 1, g: o / e - 1, kind: 'stop' }; } }
  for (let q = last; q >= k; q--) { const c = C[q]; if (c > 0) return { x: last, g: c / e - 1, kind: 'time' }; } return null; }
// the open walk of a trade still running (paper lane): mark at the last close
export function markOpen(O, C, k, stop) { const e = O[k]; if (!(e > 0)) return null; let last = null; for (let q = k; q < C.length; q++) { const c = C[q]; if (c > 0) { last = c; if (c < e * (1 - stop)) return { stopHit: q }; } } return last ? { g: last / e - 1 } : null; }

// ---- POINT-IN-TIME RANKER. add(expert, tRes, excess): a call whose window ENDS at session tRes. topAt(t): the top set using only calls
// with tRes < t. Queries must not go back in time. Success = excess > 0. Composite = mean of the percentile ranks (ties averaged) of
// success rate and average excess among experts with >= minCalls counted calls; top = the ceil(frac x n) best (ties: higher average).
export class PITRanker {
  constructor({ minCalls = 2, frac = 0.1, minExperts = 30, lastN = 0, maxAge = 0 } = {}) { Object.assign(this, { minCalls, frac, minExperts, lastN, maxAge }); this.pending = []; this.sorted = true; this.calls = new Map(); this.lastT = -Infinity; this.memo = null; }
  add(expert, tRes, excess) { if (!isFinite(excess) || !isFinite(tRes)) return; if (tRes < this.lastT) throw new Error('PITRanker: a call resolving before the last query cannot be added'); this.pending.push([tRes, expert, excess]); this.sorted = false; }
  topAt(t) { if (t < this.lastT) throw new Error('PITRanker: queries must move forward in time'); if (this.memo && this.memo.t === t) return this.memo.r;
    if (!this.sorted) { this.pending.sort((a, b) => b[0] - a[0]); this.sorted = true; }   // descending: pop the earliest
    let moved = false; while (this.pending.length && this.pending[this.pending.length - 1][0] < t) { const [tr, ex, x] = this.pending.pop(); (this.calls.get(ex) || this.calls.set(ex, []).get(ex)).push([tr, x]); moved = true; }
    this.lastT = t; if (!moved && this.memo && !this.maxAge) { this.memo = { t, r: this.memo.r }; return this.memo.r; }
    const stats = new Map(); for (const [ex, a0] of this.calls) { let a = this.maxAge ? a0.filter(z => z[0] >= t - this.maxAge) : a0; if (this.lastN) a = a.slice(-this.lastN); if (a.length < this.minCalls) continue;
      const n = a.length, s = a.reduce((u, z) => u + z[1], 0), w = a.filter(z => z[1] > 0).length; stats.set(ex, { n, avg: s / n, win: w / n }); }
    const ids = [...stats.keys()], n = ids.length, top = new Set();
    if (n >= this.minExperts) { const pr = (key) => { const srt = ids.map(id => [id, stats.get(id)[key]]).sort((a, b) => a[1] - b[1]), out = new Map(); let i = 0; while (i < n) { let j = i; while (j + 1 < n && srt[j + 1][1] === srt[i][1]) j++; const p = n > 1 ? ((i + j) / 2) / (n - 1) : 1; for (let q = i; q <= j; q++) out.set(srt[q][0], p); i = j + 1; } return out; };
      const a = pr('win'), b = pr('avg'), comp = ids.map(id => [id, (a.get(id) + b.get(id)) / 2, stats.get(id).avg]).sort((x, y) => y[1] - x[1] || y[2] - x[2]);
      for (const [id] of comp.slice(0, Math.ceil(n * this.frac))) top.add(id); }
    const r = { top, eligible: n, stats }; this.memo = { t, r }; return r; }
}

// ---- clusters: events [{sym, t, who}] (t = session, or a day number); fires at the event that brings min DIFFERENT experts inside the
// trailing window (inclusive); after a fire, the same stock fires again only when t > fire + window.
export function clusterSignals(events, window, min) { const by = new Map(), out = []; for (const e of events) (by.get(e.sym) || by.set(e.sym, []).get(e.sym)).push(e);
  for (const [sym, a] of by) { a.sort((x, y) => x.t - y.t); let lastFire = -Infinity;
    for (let k = 0; k < a.length; k++) { const e = a[k]; if (e.t <= lastFire + window) continue; const who = new Set(); for (let j = k; j >= 0 && a[j].t >= e.t - window; j--) who.add(a[j].who);
      if (who.size >= min) { out.push({ sym, t: e.t, who: [...who] }); lastFire = e.t; } } }
  return out.sort((x, y) => x.t - y.t); }

// ---- 13F helpers ----
export const normName = (x) => String(x || '').toUpperCase().replace(/[.,&/'()"-]/g, ' ').replace(/\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|HLDGS?|HOLDINGS?|GROUP|GRP|CL(ASS)?|COM|COMMON|STOCK|SHS|NEW|THE|SA|NV|AG|LP|LLC|DEL|ORD|SPON(SORED)?|ADR|ADS|REIT|TR|TRUST|[A-C])\b/g, ' ').replace(/\s+/g, ' ').trim();
// 13F value: thousands of USD for filings before 3 Jan 2023, USD after (SEC Form 13F instructions, amended 2022)
export const valueDollars = (v, filed) => (filed < '2023-01-03' ? v * 1000 : v);
// prev / cur: Map id -> { v: USD value, px: the stock's split-adjusted close at that period end }. New = absent before; add = value growth
// over price growth >= 1.5 (= split-adjusted share count x1.5). Weight = value / the filing's total (all positions in cur).
export function holdingChanges(prev, cur, minW) { if (!prev || !cur) return []; let tot = 0; for (const h of cur.values()) tot += h.v > 0 ? h.v : 0; if (!(tot > 0)) return []; const out = [];
  for (const [id, h] of cur) { const w = h.v / tot; if (!(w >= minW)) continue; const p = prev.get(id);
    if (!p || !(p.v > 0)) { out.push({ id, kind: 'new', w }); continue; } if (h.px > 0 && p.px > 0 && (h.v / p.v) / (h.px / p.px) >= 1.5) out.push({ id, kind: 'add', w }); }
  return out; }
export function topWeights(rows, n) { const a = rows.filter(r => r.v > 0).sort((x, y) => y.v - x.v).slice(0, n), s = a.reduce((u, r) => u + r.v, 0); return s > 0 ? a.map(r => ({ sym: r.sym, w: r.v / s })) : []; }

// ---- SEC XML readers (namespace prefixes tolerated) ----
const tag = (x, t) => { const m = new RegExp('<(?:\\w+:)?' + t + '\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?' + t + '>', 'i').exec(x); return m ? m[1].trim() : ''; };
const blocks = (x, t) => [...x.matchAll(new RegExp('<(?:\\w+:)?' + t + '\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?' + t + '>', 'gi'))].map(m => m[1]);
const valOf = (x, t) => { const b = tag(x, t); const v = tag(b, 'value'); return v || b; };
export function parse13FXml(xml) { return blocks(String(xml || ''), 'infoTable').map(b => ({ name: tag(b, 'nameOfIssuer'), cusip: tag(b, 'cusip').toUpperCase(), value: +tag(b, 'value') || 0, shares: +tag(b, 'sshPrnamt') || 0, type: tag(b, 'sshPrnamtType'), putCall: tag(b, 'putCall') })); }
export function parseForm4Xml(xml) { const x = String(xml || ''), buys = [];
  for (const b of blocks(x, 'nonDerivativeTransaction')) { const code = tag(tag(b, 'transactionCoding'), 'transactionCode'), ad = valOf(b, 'transactionAcquiredDisposedCode'), sh = +valOf(b, 'transactionShares'), px = +valOf(b, 'transactionPricePerShare');
    if (code === 'P' && ad === 'A' && sh > 0 && px > 0) buys.push({ shares: sh, price: px, usd: Math.round(sh * px) }); }
  return { sym: tag(x, 'issuerTradingSymbol').toUpperCase(), owner: String(+tag(x, 'rptOwnerCik') || ''), buys }; }

// ---- eToro: positions opened since the previous snapshot (long, leverage 1); the first snapshot sets the baseline only
export function etoroNewLongs(prev, cur) { if (!prev) return []; const had = new Set(prev.map(p => p.positionId)); return (cur || []).filter(p => !had.has(p.positionId) && p.isBuy === true && (+p.leverage || 1) === 1); }

// ---- halves and the paper board ----
export function midSplit(ts) { const u = [...new Set(ts)].sort((a, b) => a - b); return u.length ? u[Math.floor(u.length / 2)] : null; }
export function boardStats(rows) { const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    avgWin: win.length ? r4(sum(win) / win.length) : null, avgLoss: loss.length ? r4(sum(loss) / loss.length) : null, pf: loss.length && sum(loss) < 0 ? r4(sum(win) / -sum(loss)) : null }; }
// TRY SMALL readiness of the paper record (same as the decoded lane): 30+ resolved paper trades on 10+ signal days, average > 0 after 0.8%
export const trySmallReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
