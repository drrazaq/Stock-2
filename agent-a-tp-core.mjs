// AGENT A TIMING OVERLAYS (Agent A league run of Sun 8 Nov 2026, restarted Tue 10 Nov 2026). PRE-REGISTERED 10 Nov 2026 BEFORE ANY RUN.
// Two queued Agent A library entries, built exactly as registered, with the judging written here before the first run. Research only:
// never a buy line, never an order, no Telegram, never edits scan.mjs or another lab. Run ONCE by agent-a-tp-lab.mjs (one-shot workflow
// agent-a-tp-lab.yml); the first complete result is frozen per rule in data/agent-a-tp-lab.json firstRun (first-run.mjs freezeEach).
//
// A-TP1  MOMENTUM TURNING POINTS (Garg, Goulding, Harvey & Mazzoleni 2021, JFE; registered 1 Nov 2026):
//   At each month end (the last session of a calendar month, close) t: slow = sign(SPY 252-session return - T-bill over the same sessions),
//   fast = sign(SPY 21-session return - T-bill over the same sessions); blend = 0.5 slow + 0.5 fast. Long-only: hold SPY for the next month
//   when blend >= 0, else cash earning the T-bill. Trades at the NEXT OPEN after the month-end close (k0 = t + 1) and is held to the next
//   month's switch open (k1); SPY return of a month = open(k1) / open(k0) - 1 (no look-ahead: the signal uses closes up to t only).
//   T-bill = FRED DTB3 (3-month bill, public CSV), accrued per session at DTB3 / 100 / 252 using the last value on or before the session;
//   if FRED is unreachable the cash rate is 0% (stated in the output; it only makes cash look worse).
//   Costs: each switch in or out of SPY pays HALF a round trip. Judged at the system cost 0.8% a round trip and the 1.2% stress cost
//   (both stricter than the 0.1% a switch in the 1 Nov entry, which is reported as information). Yardstick: buy-and-hold SPY on the
//   same months, paying half a round trip once at the start.
//   Halves by the month-end signal date: older before 2024-01-01, newer from 2024-01-01. Per half: months, return per year
//   (compounded monthly, ^(12/n)), max drawdown on month-end equity, worst month, Sharpe (monthly excess over the T-bill x sqrt 12),
//   months out of the market, switches; and the monthly difference (rule minus holding) with its t (mean / sd x sqrt n).
//   VERDICT (frozen once):
//     USEFUL = in BOTH halves, at BOTH 0.8% and 1.2%: return per year >= holding's AND max drawdown no deeper than holding's.
//     TIER 2 = USEFUL AND 20+ months in each half AND the monthly-difference t >= 2.5 in each half (at 1.2%).
//     PROVEN = TIER 2 AND that t >= the league luck bar (data/agent-league.json bar) in each half.
//     Otherwise: USEFUL -> "USEFUL, NOT PROVEN (information only)"; not USEFUL -> "REJECTED (does not beat holding)".
//   A longer SPY history (Massive daily bars from 2005, if the plan returns them) is reported as INFORMATION ONLY and never changes
//   the verdict. The owner's monthly core (SPUS 54% + IAUM 46%) is his decision; a pass here would only be shown as information.
//
// A-RMOM1  RISK-MANAGED MOMENTUM (Barroso & Santa-Clara 2015; registered 25 Oct 2026):
//   The SQ6-MTUM book rebuilt exactly as squad 18 / squad 20 / agent-a-tgt-lab rebuilt it (squad6-core mtumPick, May and November month
//   ends, the top 20% of the 600 most-traded liquid stocks, risk-adjusted 6 and 12-month momentum), bought equally at the next open after
//   the formation (k) and held to the close of session 126 (x = k + 125): equal money per stock at the open, values drift (buy-and-hold);
//   a stock that stops trading keeps its last close (its fall up to then counts). A pick with a split artifact inside its hold is dropped
//   (system convention). Cost: the book pays 0.8% a round trip (1.2% stress) on the money in it: half on the first session, half on the last.
//   Scaled book: at each formation put w = min(1, 0.12 / sigma) of the money in the book and the rest in cash at 0%, where sigma = the
//   annualised standard deviation (x sqrt 252) of the daily returns of the PREVIOUS formation's picks held equally over the 126 sessions
//   ending at the formation close; no previous formation (or under 126 sessions): w = 1.
//   Halves by formation date (before / from 2024-01-01); only finished books (x inside the price window) count.
//   Per half, scaled and unscaled: books, return per year (daily compounding, ^(252 / sessions)), max drawdown on daily equity, worst
//   book, Sharpe (daily, cash 0%, x sqrt 252); yardsticks on the same sessions: SPY (open k to close x) and the average liquid stock.
//   VERDICT (frozen once): ADOPT (sizing) = 3+ finished books in each half AND, in BOTH halves at BOTH costs, the scaled Sharpe is higher
//   than the unscaled AND the scaled max drawdown is shallower. Otherwise NOT ADOPTED. A sizing rule on a NOT PROVEN base cannot itself
//   be PROVEN or tier 2: its level is reported as "sizing overlay; base SQ6-MTUM stays NOT PROVEN".
//
// Library check (10 Nov 2026): ANOM-TSMOM (single-stock 12-month time-series momentum: rejected), A-RG1 (regime gate on stock rules:
// not proven), SQ3-REGIME (SPY 200-day + breadth exposure on rule trades: rejected), SQ3-VOLRISK (volatility-sized trades: rejected,
// per-trade size, not book-level vol targeting), MACRO-ROT (sector rotation): none is a 12-month + 1-month SPY blend or a book-level
// volatility target on SQ6-MTUM.
export const REGISTERED = '2026-11-10', SPLIT = '2024-01-01', COST = 0.008, STRESS = 0.012, REG_SWITCH = 0.001, YEAR = 252;
export const TARGET_VOL = 0.12, VOL_LB = 126, HOLD = 126, MIN_MONTHS = 20, MIN_BOOKS = 3, T2 = 2.5, SLOW = 252, FAST = 21;
export const IDS = ['A-TP1', 'A-RMOM1'];
export const r4 = (x) => typeof x === 'number' && isFinite(x) ? Math.round(x * 1e4) / 1e4 : null;
export const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
export const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const sign = (x) => x > 0 ? 1 : x < 0 ? -1 : 0;
export const tStat = (a) => { if (a.length < 2) return null; const s = sd(a); return s > 0 ? mean(a) / s * Math.sqrt(a.length) : null; };

// ---- A-TP1 ----
export function tpBlend(r12, tb12, r1, tb1) { const slow = sign(r12 - tb12), fast = sign(r1 - tb1), blend = 0.5 * slow + 0.5 * fast; return { slow, fast, blend, inMarket: blend >= 0 }; }
// months: [{ d, inMarket, spy, cash }] in date order. Returns rows with r (rule, net), b (holding, net) and sw (1 = a switch at this month's open).
export function tpRun(months, cost) { let prev = false; const rows = [];
  months.forEach((m, j) => { const sw = m.inMarket !== prev ? 1 : 0; let r = m.inMarket ? m.spy : m.cash; if (sw) r = (1 + r) * (1 - cost / 2) - 1;
    let b = m.spy; if (j === 0) b = (1 + b) * (1 - cost / 2) - 1; prev = m.inMarket; rows.push({ ...m, sw, r, b }); });
  return rows; }
export function monthStats(rows, key) { const n = rows.length; if (!n) return null; let e = 1, pk = 1, dd = 0, worst = Infinity;
  for (const z of rows) { e *= 1 + z[key]; pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); worst = Math.min(worst, z[key]); }
  const ex = rows.map(z => z[key] - z.cash), s = sd(ex);
  return { n, total: r4(e - 1), perYear: r4(Math.pow(e, 12 / n) - 1), maxDD: r4(dd), worstMonth: r4(worst), sharpe: s > 0 ? r4(mean(ex) / s * Math.sqrt(12)) : null }; }
export function tpHalf(rows) { if (!rows.length) return null; const diff = rows.map(z => z.r - z.b);
  return { months: rows.length, from: rows[0].d, to: rows[rows.length - 1].d, out: rows.filter(z => !z.inMarket).length, switches: rows.reduce((s, z) => s + z.sw, 0),
    rule: monthStats(rows, 'r'), hold: monthStats(rows, 'b'), diffAvg: r4(mean(diff)), diffT: r4(tStat(diff)) }; }
export function judgeTp(byCost, luckBar) { const H = ['older', 'newer'];
  const better = (c) => H.every(h => { const x = byCost[c] && byCost[c][h]; return !!x && x.rule.perYear >= x.hold.perYear && x.rule.maxDD >= x.hold.maxDD; });
  const useful = better('base') && better('stress'), enough = H.every(h => byCost.stress[h] && byCost.stress[h].months >= MIN_MONTHS);
  const tAt = (bar) => H.every(h => byCost.stress[h] && typeof byCost.stress[h].diffT === 'number' && byCost.stress[h].diffT >= bar);
  const tier2 = useful && enough && tAt(T2), proven = tier2 && tAt(luckBar);
  const why = []; if (!better('base')) why.push('does not beat holding (return per year and drawdown) in both halves at 0.8%'); if (!better('stress')) why.push('does not beat holding in both halves at 1.2%');
  if (!enough) why.push('under ' + MIN_MONTHS + ' months in a half'); if (!tAt(T2)) why.push('monthly-difference t under ' + T2 + ' in a half');
  return { verdict: proven ? 'PROVEN' : tier2 ? 'TIER 2' : useful ? 'USEFUL, NOT PROVEN (information only)' : 'REJECTED (does not beat holding)', level: proven ? 'PROVEN' : tier2 ? 'tier 2' : 'none', useful, why }; }

// ---- A-RMOM1 ----
export const rmomWeight = (sigma) => sigma > 0 && isFinite(sigma) ? Math.min(1, TARGET_VOL / sigma) : 1;
// paths: one array per stock, p[0] = the entry price, p[q] = the price at step q (NaN / <= 0 = no price: the last price is kept).
// Returns the equal-money buy-and-hold book value V[0..L] (V[0] = 1).
export function bookPath(paths) { const L = Math.max(0, ...paths.map(p => p.length - 1)), V = new Array(L + 1).fill(0), ok = paths.filter(p => p[0] > 0);
  if (!ok.length) return null;
  for (const p of ok) { let last = p[0]; for (let q = 0; q <= L; q++) { const x = q < p.length ? p[q] : NaN; if (x > 0) last = x; V[q] += last / p[0] / ok.length; } }
  return V; }
export const pathRets = (V) => { const r = []; for (let q = 1; q < V.length; q++) r.push(V[q] / V[q - 1] - 1); return r; };
export const annVol = (rets) => { const s = sd(rets); return s === null ? null : s * Math.sqrt(YEAR); };
// one book's daily returns with the cost charged half on the first and half on the last session, scaled by w (rest in cash at 0%)
export function bookDaily(rets, w, cost) { return rets.map((r, j) => { let x = r; if (j === 0) x = (1 + x) * (1 - cost / 2) - 1; if (j === rets.length - 1) x = (1 + x) * (1 - cost / 2) - 1; return w * x; }); }
export function dailyStats(rets) { const n = rets.length; if (!n) return null; let e = 1, pk = 1, dd = 0; for (const r of rets) { e *= 1 + r; pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); }
  const s = sd(rets); return { sessions: n, total: r4(e - 1), perYear: r4(Math.pow(e, YEAR / n) - 1), maxDD: r4(dd), sharpe: s > 0 ? r4(mean(rets) / s * Math.sqrt(YEAR)) : null }; }
export function judgeRmom(byCost) { const H = ['older', 'newer'];
  const ok = (c) => H.every(h => { const x = byCost[c] && byCost[c][h]; return !!x && x.books >= MIN_BOOKS && x.scaled.sharpe !== null && x.unscaled.sharpe !== null && x.scaled.sharpe > x.unscaled.sharpe && x.scaled.maxDD > x.unscaled.maxDD; });
  const enough = H.every(h => byCost.base[h] && byCost.base[h].books >= MIN_BOOKS), adopt = enough && ok('base') && ok('stress');
  const why = []; if (!enough) why.push('under ' + MIN_BOOKS + ' finished books in a half'); if (!ok('base')) why.push('scaled book not both higher Sharpe and shallower drawdown in both halves at 0.8%'); if (!ok('stress')) why.push('same test fails at 1.2%');
  return { verdict: adopt ? 'ADOPT (sizing)' : 'NOT ADOPTED', level: 'sizing overlay; base SQ6-MTUM stays NOT PROVEN', adopt, why }; }

// ---- library: the two entries get the judging text (idempotent; before the run), then their result (after) ----
export const JUDGING = {
  'A-TP1': 'JUDGING (agent-a-tp-core.mjs header, written 10 Nov 2026 before any run): signal at the month-end close, trade at the next open; T-bill = FRED DTB3; each switch pays half a round trip at 0.8% (and 1.2% stress); halves by signal date before / from 2024-01-01; USEFUL = beats buy-and-hold SPY on return per year AND drawdown in both halves at both costs; TIER 2 = USEFUL + 20+ months a half + monthly-difference t >= 2.5 a half; PROVEN = also t >= the league luck bar. Longer SPY history = information only.',
  'A-RMOM1': 'JUDGING (agent-a-tp-core.mjs header, written 10 Nov 2026 before any run): MTUM book bought equally at the next open, held to the close of session 126, cost 0.8% (1.2%) half in / half out; w = min(1, 0.12 / sigma) from the previous book\'s last 126 daily returns; halves by formation date; ADOPT (sizing) = 3+ finished books a half and, in both halves at both costs, higher Sharpe AND shallower drawdown than the unscaled book.' };
export function preRegister(LB, today = REGISTERED) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of IDS) { const e = LB.strategies.find(x => x.id === id); if (!e || e.judging) continue; e.judging = JUDGING[id]; e.status = 'pre-registered ' + today + ' (Agent A); 5-year one-shot pending (agent-a-tp-lab.mjs)'; ch++; }
  if (ch) LB.updated = today; return ch; }
export function recordResults(LB, first) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of IDS) { const e = LB.strategies.find(x => x.id === id), r = first && first[id]; if (!e || !r || !r.judged) continue; if (e.result && e.result.frozenAt === r.frozenAt) continue;
    const v = r.judged.verdict; e.status = id === 'A-TP1' ? (v === 'PROVEN' || v === 'TIER 2' ? 'tested: ' + v.toLowerCase() + ' (overlay; information only, owner decides the core)' : v.startsWith('USEFUL') ? 'tested: not proven (useful as information only)' : 'tested: rejected')
      : (r.judged.adopt ? 'tested: ADOPT as sizing (on paper; base not proven)' : 'tested: not adopted (sizing)');
    e.result = { verdict: v, level: r.judged.level, why: r.judged.why, frozenAt: r.frozenAt, summary: r.summary }; ch++; }
  return ch; }
