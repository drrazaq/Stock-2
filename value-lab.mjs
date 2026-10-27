// VALUE LAB (Agent B, run 23 Oct 2026 at the owner's request). Research + a weekly pick list; never places an order.
// Runs the pre-registered library entries ONCE AS WRITTEN (data/strategy-library.json; the first complete verdict of each is frozen in
// firstRun, later runs are monitoring only) and judges them at the owner's tier-2 standard (value-core.mjs judge): in BOTH halves
// positive after 0.8% and after 1.2% cost, better than the average stock, better than the same stocks on their other formation days,
// still positive without the 2 best, block t >= 2.5 (non-overlapping blocks of the hold length) = TRADABLE SMALL; block t >= 4.0
// (max of 2.5, the league bar, 4.0) = PROVEN; plus each rule's own registered extra gates.
//   B-FCF1  monthly basket: FCF yield > 5% (TTM operating cash flow - capex over market value), revenue +10% y/y (TTM), debt/equity < 0.5,
//           inventory days < 60 if it holds inventory, above its 200-day average; equal weight, 3 months. Reported vs V15 on the same dates.
//   B-BASK1 V15 as a monthly paper basket: the first session after the first Sunday of each month, the top 10 F-score >= 8 names above
//           their 200-day average (F-score high to low, then the larger 20-day traded value), held 1 and 3 months; vs SPUS / HLAL and
//           the average stock; one sample per month.
//   B-EM1   the 3rd (or later) consecutive positive EPS surprise AND y/y revenue growth rising 2 quarters running (SEC, as filed before
//           the entry day); buy the next open after the report, hold 60 sessions, exit at the next open after a close under the 50-day
//           average. Must beat the single-beat version (any positive surprise, same entry and exit) on the same reports, both halves.
//   B-SIF1  monthly basket: top 30% by 6-month return (T1), in an industry (SEC SIC 2-digit group, 5+ liquid members) in the top 30% by
//           its members' average 6-month return, AND F-score above last year's; 3 months. Must beat T1 alone and V15 alone on the same
//           dates in both halves and still beat the average stock in both halves with its biggest sector removed.
// The V15 sector-neutral / ex-tech entry named in the 23 Oct request did not exist in the library on 23 Oct: nothing was run for it then.
// ---- PRE-REGISTERED 27 Oct 2026 (Agent B, Tuesday session), written here and in the library BEFORE any run; each run ONCE as written,
// first complete verdict frozen. New rules use the corrected yardstick (AUD-1 'capBoth': rule and yardstick both capped at +300%). ----
//   V15-SN  V15 SECTOR-NEUTRAL. Each 21-session formation (t >= 199): V15's own picks that day (v15At below = quality.mjs F-SCORE
//           UPTREND: F-score 8-9 above the 200-day, else the 10 best scores). K = their number. Each SEC SIC 2-digit group (unknown SIC =
//           one group '?') keeps at most max(1, round(K x the group's share of that day's liquid stocks)) names, best F-score first, then
//           the larger 20-day traded value (value-core.mjs sectorCap). Buy the next open, sell the close 126 sessions later (V15's hold).
//           Extra gates, both halves: beat V15 itself on the same dates (average after cost) and beat SPY bought the same dates (SPY
//           gross, weighted like the trades). Generic construction (no sector is chosen or dropped); the ex-SIC-35/36/38 version is
//           V15-NO35 (squad 21, forward paper only, never backtested) and is NOT run here. Disclosed: the V15 deep check of 20 Oct had
//           already shown the 2021-23 shortfall sat in one sector group, so this is a new league trial, not a rescue of V15.
//   V15 at 12 months with the full value-lab gates is NOT built: 252-session blocks give at most 2 blocks per half on the 5-year cache
//           (the judge needs 3), so the full gate cannot be judged on this data, and V15 12 m already lost to the S&P 500 in 2021-23.
//   B-CR1   CASH RUNWAY (BUY side). Each 21-session formation; liquid stocks (5 USD+, 5M USD+ a day), financials (SIC 6xxx) left out.
//           TTM operating cash flow < 0 (a cash burner; ttmAt, period ended < 200 days before), cash = CashAndCashEquivalentsAtCarrying-
//           Value (else CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents) at that period end (within 5 days) + short-term
//           investments (ShortTermInvestments, else MarketableSecuritiesCurrent, else AvailableForSaleSecuritiesDebtSecuritiesCurrent)
//           of the same date; runway = cash / (-TTM operating cash flow / 4) >= 8 quarters; AND no Form 424B5 by the same CIK (EDGAR
//           quarterly master index) filed in the 90 calendar days up to the formation day. Buy the next open, sell the close 60 sessions
//           later. value-core judge (tier 2 at block t 2.5, PROVEN at the bar) plus: beat SPY bought the same dates, both halves.
//   B-CR1-AVOID  same data: a cash burner with runway < 4 quarters (no 424B5 condition). AVOID CONFIRMED only if in BOTH halves: 20+
//           cases and 3+ blocks of 60 sessions, gross excess over the average stock <= -3%, block t <= -2.5, and worse than the same
//           stocks on their other formation days (value-core avoidJudge = the squad 29 AVOID standard). An AVOID block is never a short.
//   Sources: Huang and Ritter, Corporate Cash Shortfalls and Financing Decisions (RFS 2021); DeAngelo, DeAngelo and Stulz, Seasoned
//           equity offerings, market timing, and the corporate lifecycle (JFE 2010, NBER w13285): firms short of cash issue equity.
// DATA: prices = the 5-year whole-market cache (study-cache/grouped.json.gz, READ ONLY; x rows value exits of stocks that fell under
// the cache filter). SEC: yearly F-score inputs from quality.mjs's cache (study-cache/fund.json.gz, READ ONLY, same fscore code);
// quarterly / TTM numbers point in time from SEC companyfacts (the bulk companyfacts.zip, else one request per company), kept compact
// in value-cache/ (its own Actions cache). Share counts: data/shares.json.gz (split-adjusted, known 30 days after their date).
// Earnings surprises: data/earnings-cache.json.gz (its stocks only: mostly large companies alive today, NOT the whole market).
// OUTPUTS: data/value-lab.json (verdicts, frozen first run, numbers), data/value-today.json (today's picks of every rule + each rule's
// tier from firstRun; the scan shows a buy only for a rule at TRADABLE SMALL or PROVEN), library entries B-FCF1 / B-BASK1 / B-EM1 / B-SIF1.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { growthRun, beatStreak, fcfCheck, halfStat, judge, r4, COST, TIER2_T, STALE_DAYS, runwayAt, avoidStat, avoidJudge, sectorCap } from './value-core.mjs';
import { tradeG, yardPush, yardMean, correctedEntry } from './yardstick.mjs';
const env = process.env, OUT = env.OUT || 'data/value-lab.json', TODAY_OUT = env.TODAY_OUT || 'data/value-today.json', VC = env.VALUE_CACHE || 'value-cache', DIAG = !!env.DIAG;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const DATA = local(env.SEC_BASE) || 'https://data.sec.gov', WWW = local(env.SEC_BASE) || 'https://www.sec.gov', UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(VC, { recursive: true });
const LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);

// ---- prices (read only) ----
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null); if (!store) { console.log('value-lab: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { console.log('value-lab: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN), CX = new Float32Array(NS * T).fill(NaN), OX = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) { CX[q * T + t] = x.x.c[j]; OX[q * T + t] = x.x.o[j]; } } });
const SIC = store.sic || {}; store = null;
const spyI = SY.get('SPY'), CC = (i, t) => { const z = C[i * T + t]; return isFinite(z) ? z : CX[i * T + t]; }, OO = (i, t) => { const z = O[i * T + t]; return isFinite(z) ? z : OX[i * T + t]; };
const liquid = (i, t) => { const b = i * T, c = C[b + t]; if (!(c >= 5)) return false; let dv = 0; for (let k = t - 19; k <= t; k++) { if (k < 0 || !isFinite(C[b + k])) return false; dv += C[b + k] * V[b + k]; } return dv / 20 >= 5e6; };
const dollarVol = (i, t) => { const b = i * T; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) if (k >= 0 && isFinite(C[b + k])) { dv += C[b + k] * V[b + k]; n++; } return n ? dv / n : 0; };
const above200 = (i, t) => { if (t < 199) return null; let s = 0; for (let k = t - 199; k <= t; k++) { const c = C[i * T + k]; if (!(c > 0)) return null; s += c; } return C[i * T + t] > s / 200; };
// buy the open of t+1, sell the close of t+h; a stock that left the cache keeps its real later price via the x rows, else its last close
let LIMIT = T - 1;   // engine audit: the last session a trade may use (the frozen run's last session for a corrected run)
function fwd(i, t, h) { if (t + h >= T || t + h > LIMIT) return null; const e = O[i * T + t + 1]; if (!(e > 0)) return null; for (let k = t + h; k > t; k--) { const z = CC(i, k); if (z > 0) return z / e - 1; } return null; }
const finCo = (s) => { const x = SIC[s]; return !!(x && x.c && String(x.c)[0] === '6'); };
const sic2 = (s) => { const x = SIC[s], c = x && x.c ? String(x.c).padStart(4, '0') : ''; return c ? c.slice(0, 2) : null; };

// ---- shares (point in time, split-adjusted) and F-score (quality.mjs's yearly cache and code, unchanged) ----
const SH = JZ('data/shares.json.gz', null); if (!SH || !SH.t) { console.log('value-lab: no SEC ticker list'); process.exit(0); }
const symCik = (s) => SH.t[s] || SH.t[s.replace(/\./g, '-')] || null;
const sharesKnown = (cik, d) => { const a = SH.c[cik]; if (!a) return null; const lim = new Date(Date.parse(d + 'T00:00:00Z') - 30 * 864e5).toISOString().slice(0, 10); let v = null; for (const [e, n] of a) if (e <= lim) v = n; return v; };
const F = JZ(env.FUND_CACHE || 'study-cache/fund.json.gz', { v: {} });
const sharesAtYearEnd = (cik, y) => { const a = SH.c[cik]; if (!a) return null; let v = null; for (const [e, n] of a) { if (e <= y + '-12-31' && e >= y + '-07-01') v = n; } return v; };
const num = (...v) => v.every(u => typeof u === 'number' && isFinite(u));
function fscore(cik, y) { const c = F.v[cik]; if (!c || !c[y] || !c[y - 1] || !c[y - 2]) return null; const a = c[y], b = c[y - 1], z = c[y - 2];
  if (!num(a.ni, b.ni, a.cfo, a.ltd, b.ltd, a.acur, b.acur, a.gp, b.gp) || !(a.assets > 0 && b.assets > 0 && z.assets > 0) || !(a.lcur > 0 && b.lcur > 0)) return null;
  const rk = num(a.rev, b.rev) ? 'rev' : num(a.rev2, b.rev2) ? 'rev2' : null; if (!rk || !(a[rk] > 0 && b[rk] > 0)) return null;
  const s1 = sharesAtYearEnd(cik, y), s0 = sharesAtYearEnd(cik, y - 1); if (!(s1 > 0 && s0 > 0)) return null;
  const chk = [a.ni > 0, a.cfo > 0, a.ni / b.assets > b.ni / z.assets, a.cfo > a.ni, a.ltd / ((a.assets + b.assets) / 2) < b.ltd / ((b.assets + z.assets) / 2),
    a.acur / a.lcur > b.acur / b.lcur, s1 <= s0, a.gp / a[rk] > b.gp / b[rk], a[rk] / b.assets > b[rk] / z.assets];
  return chk.filter(Boolean).length; }
const knownYear = (d) => { const y = +d.slice(0, 4), md = d.slice(5); return md >= '04-10' ? y - 1 : y - 2; };   // quality.mjs: a 10-K is public 100 days after Dec 31
const fsOf = (s, d) => { if (finCo(s)) return null; const cik = symCik(s); return cik ? fscore(cik, knownYear(d)) : null; };   // financials 6xxx have no F-score (quality.mjs)

// ---- formation days: every 21 sessions, as quality.mjs ----
const FORM = []; for (let t = 21; t < T - 1; t += 21) FORM.push(t);
const LIQ = new Map(), LIQS = new Map(); for (const t of FORM) { const a = []; for (let i = 0; i < NS; i++) if (i !== spyI && liquid(i, t)) a.push(i); LIQ.set(t, a); LIQS.set(t, new Set(a)); }

// ---- SEC companyfacts, compact and cached ----
const TAGS = { cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'],
  inv: ['InventoryNet'], eq: ['StockholdersEquity'], debt: ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], sti: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'] };
const TAGV = 2;   // 27 Oct 2026: cash and short-term investment tags added (B-CR1); a cache of an older tag set is read again in full
const ALLTAGS = [...new Set(Object.values(TAGS).flat())];
// compact: periods ending 2017 or later; the same figure filed again later (the prior-year column of a newer report) is kept once, at its
// FIRST filing date (a later filing of the same figure changes nothing point in time); a restated figure is a new row.
const compact = (j) => { const out = {}, g = j && j.facts && j.facts['us-gaap']; if (!g) return out;
  for (const tag of ALLTAGS) { const u = g[tag] && g[tag].units && g[tag].units.USD; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of [...u].sort((a, b) => a.filed < b.filed ? -1 : 1)) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2017-01-01') continue; const k = (x.start || '') + '|' + x.end + '|' + x.val; if (seen.has(k)) continue; seen.add(k); rows.push([x.start || '', x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; } return out; };
const FACTS_F = VC + '/facts.json.gz'; let FX = JZ(FACTS_F, { at: null, c: {} });
const needCiks = new Set(); for (const t of FORM) for (const i of LIQ.get(t)) { const c = symCik(SYMS[i]); if (c) needCiks.add(String(c)); }
const ES = JZ('data/earnings-cache.json.gz', { syms: {} }).syms || {}; for (const s of Object.keys(ES)) { const c = symCik(s); if (c) needCiks.add(String(c)); }
if (FX.tv !== TAGV) FX = { at: null, c: {}, tv: TAGV };
const fresh = FX.at && Date.now() - Date.parse(FX.at) < 6 * 864e5, todo = [...needCiks].filter(c => !fresh || !FX.c[c]);
let secNote = '', secReq = 0, secFail = 0;
if (todo.length) {
  const zip = VC + '/companyfacts.zip'; let zipOk = false;
  if (!local(env.SEC_BASE) && !env.NO_ZIP) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, WWW + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: 'inherit', timeout: 20 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { secNote = 'bulk companyfacts.zip not read (' + String(e.message).slice(0, 80) + '); per-company requests'; } }
  let got = 0;
  for (const c of todo) { const name = 'CIK' + String(c).padStart(10, '0') + '.json'; let j = null;
    if (zipOk) { try { j = JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch (e) { j = null; } }
    else { await sleep(local(env.SEC_BASE) ? 0 : 130); secReq++; try { const r = await fetch(DATA + '/api/xbrl/companyfacts/' + name, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); if (r.ok) j = await r.json(); else if (r.status !== 404) secFail++; } catch (e) { secFail++; } }
    if (j) { FX.c[c] = compact(j); got++; } }
  if (zipOk) try { fs.unlinkSync(zip); } catch (e) {}
  FX.at = new Date().toISOString(); FX.tv = TAGV; fs.writeFileSync(FACTS_F, zlib.gzipSync(JSON.stringify(FX)));
  console.log('value-lab: SEC companyfacts for ' + got + ' of ' + todo.length + ' companies (' + (zipOk ? 'bulk file' : secReq + ' requests, ' + secFail + ' failed') + ')' + (secNote ? '; ' + secNote : ''));
}
const factsOf = (cik) => { const c = FX.c[String(cik)]; if (!c) return null; const m = (tags) => { const o = {}; for (const t of tags) if (c[t]) o[t] = c[t].map(([s, e, v, f]) => ({ s, e, v, f })); return o; };
  return { cfo: m(TAGS.cfo), capex: m(TAGS.capex), rev: m(TAGS.rev), cogs: m(TAGS.cogs), inv: m(TAGS.inv), eq: m(TAGS.eq), debt: m(TAGS.debt), cash: m(TAGS.cash), sti: m(TAGS.sti) }; };
const coMemo = new Map(), coOf = (s) => { const cik = symCik(s); if (!cik) return null; if (!coMemo.has(cik)) coMemo.set(cik, factsOf(cik)); return coMemo.get(cik); };
const covered = [...needCiks].filter(c => FX.c[c] && Object.keys(FX.c[c]).length).length;

// ---- yardsticks per formation day: the average liquid stock, and each stock's own forward return (same-stock-other-days) ----
const liqAt = (t) => { if (!LIQ.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (i !== spyI && liquid(i, t)) a.push(i); LIQ.set(t, a); LIQS.set(t, new Set(a)); } return LIQ.get(t); };
// mode (engine audit AUD-1, yardstick.mjs): 'asFrozen' = the frozen runs (stocks of +300% or more dropped from the yardstick, trades
// uncapped); 'capBoth' = the correction (both capped at +300%); 'raw' = no cap (sensitivity)
const ctrlMemo = new Map(); const ctrl = (t, h, mode = 'asFrozen') => { const k = t + '_' + h + mode; if (ctrlMemo.has(k)) return ctrlMemo.get(k); const v = []; for (const i of liqAt(t)) yardPush(v, fwd(i, t, h), mode); const m = yardMean(v, 50); ctrlMemo.set(k, m); return m; };
const fwdMemo = new Map(); const fwdM = (i, t, h) => { const k = i * 1e7 + t * 10 + (h === 21 ? 1 : h === 63 ? 2 : 3); if (!fwdMemo.has(k)) fwdMemo.set(k, fwd(i, t, h)); return fwdMemo.get(k); };
// the same stock's average forward return on the OTHER formation days of the same half (days it was not picked by this rule)
function ownOf(i, t, h, days, picked, mid, mode = 'asFrozen') { const half = t < mid, v = []; for (const u of days) { if ((u < mid) !== half || picked.has(i + '_' + u)) continue; liqAt(u); if (!LIQS.get(u).has(i)) continue; yardPush(v, fwdM(i, u, h), mode); } return v.length >= 3 ? mean(v) : null; }
const midOf = (ts) => { const u = [...new Set(ts)].sort((a, b) => a - b); return u[Math.floor(u.length / 2)]; };
// build trades for a monthly-basket rule: picks = Map t -> [i]; returns trades with g, c, own
function basketTrades(picks, h, days, mode = 'asFrozen') { const mid = midOf([...picks.keys()].filter(t => (picks.get(t) || []).length)), picked = new Set(); for (const [t, a] of picks) for (const i of a) picked.add(i + '_' + t);
  const out = []; for (const [t, a] of picks) { const c = ctrl(t, h, mode); if (c === null) continue; for (const i of a) { const g = fwdM(i, t, h); if (g === null || !isFinite(g)) continue; out.push({ t, s: SYMS[i], i, g: tradeG(g, mode), c, own: ownOf(i, t, h, days, picked, mid, mode), h, half: t < mid ? 'older' : 'newer' }); } }
  return { trades: out, mid }; }
const halves = (tr, h) => ({ older: halfStat(tr.filter(z => z.half === 'older'), h), newer: halfStat(tr.filter(z => z.half === 'newer'), h), all: halfStat(tr, h) });
const avgNet = (tr) => tr.length ? mean(tr.map(z => z.g - COST)) : null;

// ---- V15 picks on a formation day (quality.mjs F-SCORE UPTREND: every stock scoring 8-9; if under 10, the 10 best scores) ----
const fsMemo = new Map(); const fsAt = (i, t) => { const k = i + '_' + t; if (!fsMemo.has(k)) fsMemo.set(k, fsOf(SYMS[i], D[t])); return fsMemo.get(k); };
function v15At(t) { const rows = []; for (const i of LIQ.get(t) || []) { if (above200(i, t) !== true) continue; const f = fsAt(i, t); if (f !== null) rows.push({ i, f }); }
  rows.sort((a, b) => b.f - a.f); const hi = rows.filter(x => x.f >= 8); return (hi.length >= 10 ? hi : rows.slice(0, 10)).map(x => x.i); }

const RES = {}, DIAGS = {}, PICKS_TODAY = {}; let FCF_PICKS = null, BASK_MONTHS = null, AVOID_TODAY = null; const NEW_TODAY = {};   // 27 Oct rules: written under research, never under rules (scan.mjs reads rules)
// ================= B-FCF1 =================
{ const picks = new Map(), why = {}; let checked = 0;
  for (const t of FORM) { if (t < 199) continue; const a = [];
    for (const i of LIQ.get(t)) { if (above200(i, t) !== true) continue; const co = coOf(SYMS[i]); if (!co) { why['no SEC facts'] = (why['no SEC facts'] || 0) + 1; continue; } const cik = symCik(SYMS[i]), sh = sharesKnown(cik, D[t]);
      if (!(sh > 0)) { why['no share count'] = (why['no share count'] || 0) + 1; continue; } checked++; const r = fcfCheck(co, D[t], C[i * T + t], sh); if (r.ok) a.push(i); else for (const w of (r.why || '').split(', ')) why[w] = (why[w] || 0) + 1; }
    picks.set(t, a); }
  const days = [...picks.keys()]; FCF_PICKS = picks; DIAGS['B-FCF1'] = { formations: days.length, checked, picksPerMonth: days.map(t => picks.get(t).length), notChosenBecause: why };
  if (!DIAG) { const { trades, mid } = basketTrades(picks, 63, days), R = halves(trades, 63);
    const v15 = new Map(); for (const t of days) if (picks.get(t).length) v15.set(t, v15At(t)); const vt = basketTrades(v15, 63, days).trades.map(z => ({ ...z, half: z.t < mid ? 'older' : 'newer' }));
    const vs = { older: { rule: avgNet(trades.filter(z => z.half === 'older')), v15: avgNet(vt.filter(z => z.half === 'older')) }, newer: { rule: avgNet(trades.filter(z => z.half === 'newer')), v15: avgNet(vt.filter(z => z.half === 'newer')) } };
    RES['B-FCF1'] = { ...judge(R, { bar: BAR }), results: R, vsV15: vs, hold: 63, split: D[mid], trades: trades.map(z => ({ s: z.s, d: D[z.t], net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null ? null : z.own - COST) })) }; }
  const tL = FORM[FORM.length - 1]; PICKS_TODAY['B-FCF1'] = { formed: D[tL], syms: (picks.get(tL) || []).map(i => SYMS[i]) }; }

// ================= B-BASK1 =================
{ const firstSundayNext = []; const seen = new Set();
  for (let t = 200; t < T; t++) { const d = D[t], ym = d.slice(0, 7); if (seen.has(ym)) continue; const dt = new Date(ym + '-01T00:00:00Z'); const sun = new Date(dt.getTime() + ((7 - dt.getUTCDay()) % 7) * 864e5).toISOString().slice(0, 10);
    if (d > sun) { seen.add(ym); firstSundayNext.push(t - 1); } }   // formation = the last session before the Sunday's next session; buy that session's open
  const top10 = (t) => { const rows = []; for (let i = 0; i < NS; i++) { if (i === spyI || !liquid(i, t) || above200(i, t) !== true) continue; const f = fsAt(i, t); if (f !== null && f >= 8) rows.push({ i, f, dv: dollarVol(i, t) }); }
    return rows.sort((a, b) => b.f - a.f || b.dv - a.dv).slice(0, 10).map(x => x.i); };
  const B = firstSundayNext.map(t => ({ t, syms: top10(t) })), ETF = ['SPUS', 'HLAL'].map(s => [s, SY.get(s)]);
  // SPUS / HLAL trade under the cache's 1M USD a day filter: their daily bars come from Massive (same source as the cache), by date
  const etfBars = {}; for (const [s, i] of ETF) { if (i !== undefined || !env.MASSIVE_KEY) continue; try { const r = await fetch((local(env.MASSIVE_BASE) || 'https://api.massive.com') + '/v2/aggs/ticker/' + s + '/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000&apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) });
    const j = r.ok ? await r.json() : null; if (j && Array.isArray(j.results)) { const m = {}; for (const b of j.results) m[new Date(b.t).toISOString().slice(0, 10)] = { o: b.o, c: b.c }; etfBars[s] = m; } } catch (e) {} }
  const etfFwd = (s, i, t, h) => { if (i !== undefined) return fwd(i, t, h); const m = etfBars[s]; if (!m || t + h >= T || t + h > LIMIT) return null; const a = m[D[t + 1]], b = m[D[t + h]]; return a && b && a.o > 0 && b.c > 0 ? b.c / a.o - 1 : null; };
  DIAGS['B-BASK1'] = { months: B.length, namesPerMonth: B.map(b => b.syms.length), etfsInCache: ETF.filter(([, i]) => i !== undefined).map(([s]) => s), etfsFromMassive: Object.entries(etfBars).map(([s, m]) => s + ' ' + Object.keys(m).length + ' days') };
  // one basket per month: g = the average gross return of its names; mode for the engine audit (AUD-1), run on the frozen window (LIMIT)
  BASK_MONTHS = (h, mode = 'asFrozen') => { const BB = B.filter(b => b.t < LIMIT), mid = midOf(BB.filter(b => b.syms.length).map(b => b.t)), months = [];
      // the same stocks on the other basket months of the same half (not picked that month)
      const pickedAt = new Set(); for (const b of BB) for (const i of b.syms) pickedAt.add(i + '_' + b.t);
      const own = (i, t) => { const half = t < mid, v = []; for (const b of BB) { if ((b.t < mid) !== half || pickedAt.has(i + '_' + b.t) || !liquid(i, b.t)) continue; yardPush(v, fwdM(i, b.t, h), mode); } return v.length >= 3 ? mean(v) : null; };
      for (const b of BB) { if (!b.syms.length) continue; const c = ctrl(b.t, h, mode); if (c === null) continue; const g = b.syms.map(i => fwdM(i, b.t, h)).filter(x => x !== null && isFinite(x)).map(x => tradeG(x, mode)); if (g.length < b.syms.length * 0.8) continue;
        const ow = b.syms.map(i => own(i, b.t)).filter(x => x !== null), etf = Object.fromEntries(ETF.map(([s, i]) => [s, r4(etfFwd(s, i, b.t, h))]));
        months.push({ t: b.t, s: 'basket ' + D[b.t + 1], g: mean(g), c, own: ow.length >= 5 ? mean(ow) : null, h, half: b.t < mid ? 'older' : 'newer', etf, names: b.syms.map(i => SYMS[i]) }); }
      return { months, mid }; };
  if (!DIAG) for (const h of [21, 63]) { const { months, mid } = BASK_MONTHS(h);
      const R = halves(months, h), net = months.map(m => m.g - COST), cmp = (k) => { const z = months.filter(m => m.half === k); const e = (s) => { const v = z.filter(m => m.etf[s] !== null); return v.length ? { months: v.length, basket: r4(mean(v.map(m => m.g - COST))), etf: r4(mean(v.map(m => m.etf[s]))), beaten: v.filter(m => m.g - COST > m.etf[s]).length } : null; }; return { SPUS: e('SPUS'), HLAL: e('HLAL') }; };
      RES['B-BASK1_' + (h === 21 ? '1m' : '3m')] = { ...judge(R, { bar: BAR }), results: R, hold: h, split: D[mid], distinctMonths: months.length, medianMonth: r4(median(net)), worstMonth: r4(Math.min(...net)), bestMonth: r4(Math.max(...net)),
        vsEtf: { older: cmp('older'), newer: cmp('newer') }, months: months.map(m => ({ buy: D[m.t + 1], net: r4(m.g - COST), avgStock: r4(m.c - COST), sameStocks: r4(m.own === null ? null : m.own - COST), ...m.etf, names: m.names })) }; }
  const bl = B[B.length - 1]; PICKS_TODAY['B-BASK1'] = { formed: bl ? D[bl.t] : null, syms: bl ? bl.syms.map(i => SYMS[i]) : [] }; }

// the first revenue tag with three known growth figures, from a quarter that ended under 200 days before the day (else stale)
const revRun = (co, asOf) => { for (const f of Object.values(co.rev)) { const g = growthRun(f, asOf); if (g && g.g.length === 3 && g.g.every(x => x !== null) && (Date.parse(asOf) - Date.parse(g.end)) / 864e5 <= STALE_DAYS) return g; } return null; };
// ================= B-EM1 =================
{ const HOLD = 60, ma50 = new Map(), trades = { em: [], single: [] }, diag = { stocks: 0, priced: 0, reports: 0, withRevenue: 0, streak3: 0, rising: 0, both: 0 }, ownS = new Map(), tOfD = new Map(D.map((d, t) => [d, t]));
  const firstOnOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
  const maOf = (i) => { if (ma50.has(i)) return ma50.get(i); const a = new Float32Array(T).fill(NaN); let s = 0, n = 0; const q = []; for (let t = 0; t < T; t++) { const c = CC(i, t); if (c > 0) { q.push(c); s += c; if (q.length > 50) s -= q.shift(); if (q.length === 50) a[t] = s / 50; } } ma50.set(i, a); return a; };
  // entry at the open of session te; exit: the next open after a close under the 50-day average, else the close of the 60th session
  const walk = (i, te) => { const e = OO(i, te); if (!(e > 0)) return null; const ma = maOf(i), last = te + HOLD - 1; if (last >= T) return null;
    for (let k = te; k <= last; k++) { const c = CC(i, k); if (c > 0 && ma[k] > 0 && c < ma[k]) { if (k === last) return { x: k, k: 'c', g: c / e - 1 }; const o = OO(i, k + 1); if (o > 0) return { x: k + 1, k: 'o', g: o / e - 1 }; } }
    for (let k = last; k >= te; k--) { const c = CC(i, k); if (c > 0) return { x: last, k: 'c', g: c / e - 1 }; } return null; };
  const mktMemo = new Map(), mkt = (te, x, k) => { const key = te + '_' + x + k; if (mktMemo.has(key)) return mktMemo.get(key); const v = [];
    for (let i = 0; i < NS; i += 2) { if (i === spyI || !liquid(i, te - 1)) continue; const e = O[i * T + te]; let y = k === 'o' ? OO(i, x) : CC(i, x); if (!(y > 0)) for (let q = x; q > te && !(y > 0); q--) y = CC(i, q); if (e > 0 && y > 0 && Math.abs(y / e - 1) < 3) v.push(y / e - 1); }
    const m = v.length >= 50 ? mean(v) : null; mktMemo.set(key, m); return m; };
  for (const [sym, reps0] of Object.entries(ES)) { const i = SY.get(sym); diag.stocks++; if (i === undefined) continue; diag.priced++; const reps = [...reps0].sort((a, b) => a.d < b.d ? -1 : 1), co = coOf(sym), near = new Set(); let freeEm = -1, freeS = -1;
    for (let r = 0; r < reps.length; r++) { const rp = reps[r]; if (!rp.d || rp.d < D[0]) continue; let te = rp.t === 'bmo' ? firstOnOrAfter(rp.d) : firstOnOrAfter(rp.d) + (D[firstOnOrAfter(rp.d)] === rp.d ? 1 : 0); if (te >= T || te < 51) continue;
      for (let k = te - 5; k <= te + 5; k++) near.add(k); diag.reports++;
      const p = te - 1; if (!(C[i * T + p] >= 5) || dollarVol(i, p) < 5e6 || !(O[i * T + te] > 0)) continue;
      const beat = isFinite(rp.a) && isFinite(rp.e) && rp.a > rp.e; if (!beat) continue;
      const res = walk(i, te); if (!res) continue; const c = mkt(te, res.x, res.k); if (c === null) continue;
      const tr = { t: te, s: sym, i, g: res.g, c, x: res.x, h: HOLD };
      if (te > freeS) { trades.single.push(tr); freeS = res.x; }
      const st = beatStreak(reps, r), gr = co ? revRun(co, D[te]) : null;
      if (gr) diag.withRevenue++; if (st >= 3) diag.streak3++; if (gr && gr.rising) diag.rising++;
      if (st >= 3 && gr && gr.rising) { diag.both++; if (te > freeEm) { trades.em.push({ ...tr, streak: st, growth: gr.g.map(r4) }); freeEm = res.x; } } }
    // the same stock on its non-report days: every 5th session at least 6 sessions from any report, same price gate and exits
    const L = []; for (let k = 55; k < T - HOLD; k += 5) { if (near.has(k)) continue; if (!(C[i * T + k - 1] >= 5) || dollarVol(i, k - 1) < 5e6) continue; const w = walk(i, k); if (w) L.push({ t: k, g: w.g }); } ownS.set(sym, L); }
  const mid = midOf(trades.single.map(z => z.t));
  const ownOfT = (z) => { const L = (ownS.get(z.s) || []).filter(q => (q.t < mid) === (z.t < mid)); return L.length >= 3 ? mean(L.map(q => q.g)) : null; };
  for (const k of ['em', 'single']) for (const z of trades[k]) { z.own = ownOfT(z); z.half = z.t < mid ? 'older' : 'newer'; }
  DIAGS['B-EM1'] = { ...diag, emTrades: trades.em.length, singleTrades: trades.single.length, note: 'earnings-cache stocks only (' + Object.keys(ES).length + ', mostly large companies alive today): NOT the whole market' };
  if (!DIAG) { const R = halves(trades.em, HOLD), RS = halves(trades.single, HOLD), extra = [];
    for (const k of ['older', 'newer']) if (!(R[k].n && RS[k].n && R[k].edge > RS[k].edge && R[k].avg > RS[k].avg)) extra.push('not better than the single-beat version on the same reports in the ' + k + ' half (' + pc(R[k].avg) + ' vs ' + pc(RS[k].avg) + ' after cost; edge ' + pc(R[k].edge) + ' vs ' + pc(RS[k].edge) + ')');
    RES['B-EM1'] = { ...judge(R, { bar: BAR, extra }), results: R, singleBeat: RS, hold: HOLD, split: D[mid], caveat: DIAGS['B-EM1'].note,
      trades: trades.em.map(z => ({ s: z.s, buy: D[z.t], sell: D[z.x], streak: z.streak, growth: z.growth, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null ? null : z.own - COST) })) }; }
  // today: reports in the last 5 sessions that qualify (for the live hook only)
  const recent = []; for (const [sym, reps0] of Object.entries(ES)) { const i = SY.get(sym); if (i === undefined) continue; const reps = [...reps0].sort((a, b) => a.d < b.d ? -1 : 1), r = reps.length - 1; if (r < 0 || reps[r].d < D[T - 6]) continue;
    const co = coOf(sym); const gr = co ? revRun(co, new Date(Date.now() + 864e5).toISOString().slice(0, 10)) : null;
    if (beatStreak(reps, r) >= 3 && gr && gr.rising) recent.push({ sym, report: reps[r].d, streak: beatStreak(reps, r), growth: gr.g.map(r4) }); }
  PICKS_TODAY['B-EM1'] = { formed: D[T - 1], syms: recent.map(x => x.sym), detail: recent }; }

// ================= B-SIF1 =================
{ const picks = new Map(), t1 = new Map(), v15 = new Map(), diag = { formations: 0, rsTop: [], industries: [], fUp: [], picks: [] };
  for (const t of FORM) { if (t < 126) continue; const rows = [];
    for (const i of LIQ.get(t)) { const a = C[i * T + t - 126], b = C[i * T + t]; if (a > 0 && b > 0) rows.push({ i, rs: b / a - 1, g2: sic2(SYMS[i]) }); }
    if (rows.length < 100) continue; diag.formations++;
    const srt = [...rows].sort((a, b) => b.rs - a.rs), top = new Set(srt.slice(0, Math.ceil(srt.length * 0.3)).map(x => x.i));
    const ind = {}; for (const x of rows) if (x.g2) (ind[x.g2] = ind[x.g2] || []).push(x.rs); const il = Object.entries(ind).filter(([, v]) => v.length >= 5).map(([k, v]) => [k, mean(v)]).sort((a, b) => b[1] - a[1]);
    const topInd = new Set(il.slice(0, Math.ceil(il.length * 0.3)).map(([k]) => k)), y = knownYear(D[t]);
    const p = []; let fUp = 0; for (const x of rows) { if (!top.has(x.i) || !topInd.has(x.g2)) continue; const s = SYMS[x.i]; if (finCo(s)) continue; const cik = symCik(s); if (!cik) continue; const f1 = fscore(cik, y), f0 = fscore(cik, y - 1); if (f1 !== null && f0 !== null && f1 > f0) { p.push(x.i); fUp++; } }
    picks.set(t, p); t1.set(t, [...top]); diag.rsTop.push(top.size); diag.industries.push(topInd.size + '/' + il.length); diag.fUp.push(fUp); diag.picks.push(p.length);
    if (p.length) v15.set(t, v15At(t)); }
  DIAGS['B-SIF1'] = { formations: diag.formations, picksPerMonth: diag.picks, topIndustries: diag.industries.slice(-3), t1Size: diag.rsTop.slice(-3) };
  if (!DIAG) { const days = [...picks.keys()], { trades, mid } = basketTrades(picks, 63, days), R = halves(trades, 63), extra = [];
    const same = new Map([...t1].filter(([t]) => (picks.get(t) || []).length)), T1 = basketTrades(same, 63, days).trades.map(z => ({ ...z, half: z.t < mid ? 'older' : 'newer' })), V = basketTrades(v15, 63, days).trades.map(z => ({ ...z, half: z.t < mid ? 'older' : 'newer' }));
    const cmp = {}; for (const k of ['older', 'newer']) { const a = avgNet(trades.filter(z => z.half === k)), b = avgNet(T1.filter(z => z.half === k)), c = avgNet(V.filter(z => z.half === k)); cmp[k] = { rule: r4(a), t1: r4(b), v15: r4(c) };
      if (!(a > b)) extra.push('not better than T1 (6-month leaders) alone on the same dates in the ' + k + ' half (' + pc(a) + ' vs ' + pc(b) + ')'); if (!(a > c)) extra.push('not better than V15 alone on the same dates in the ' + k + ' half (' + pc(a) + ' vs ' + pc(c) + ')'); }
    const bySec = {}; for (const z of trades) { const g = sic2(z.s) || '?'; bySec[g] = (bySec[g] || 0) + 1; } const topSec = Object.entries(bySec).sort((a, b) => b[1] - a[1])[0];
    const RX = topSec ? halves(trades.filter(z => (sic2(z.s) || '?') !== topSec[0]), 63) : null;
    if (RX) for (const k of ['older', 'newer']) if (!(RX[k].n && RX[k].edge > 0 && RX[k].avg > 0)) extra.push('depends on one sector: without SIC ' + topSec[0] + ' it does not beat the average stock in the ' + k + ' half (' + pc(RX[k].avg) + ', edge ' + pc(RX[k].edge) + ')');
    RES['B-SIF1'] = { ...judge(R, { bar: BAR, extra }), results: R, vsSameDates: cmp, topSector: topSec ? { sic2: topSec[0], trades: topSec[1], share: r4(topSec[1] / trades.length), without: RX } : null, hold: 63, split: D[mid],
      trades: trades.map(z => ({ s: z.s, d: D[z.t], sic2: sic2(z.s), net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null ? null : z.own - COST) })) }; }
  const tL = FORM[FORM.length - 1]; PICKS_TODAY['B-SIF1'] = { formed: D[tL], syms: (picks.get(tL) || []).map(i => SYMS[i]) }; }

// ================= 27 Oct 2026 pre-registered rules (header): V15-SN, B-CR1, B-CR1-AVOID. Yardstick mode capBoth (AUD-1 corrected) =====
const NEWMODE = 'capBoth';
const spyAvg = (tr, h) => { const v = tr.map(z => fwd(spyI, z.t, h)).filter(x => x !== null && isFinite(x)); return v.length ? mean(v) : null; };
const spyGate = (trades, h, extra) => { const out = {}; for (const k of ['older', 'newer']) { const z = trades.filter(q => q.half === k), a = avgNet(z), b = spyI === undefined ? null : spyAvg(z, h); out[k] = { rule: r4(a), spy: r4(b) };
  if (!(a !== null && b !== null && a > b)) extra.push('not better than SPY bought the same dates in the ' + k + ' half (' + pc(a) + ' after cost vs ' + pc(b) + ')'); } return out; };
const tradeRows = (trades) => trades.map(z => ({ s: z.s, d: D[z.t], net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null ? null : z.own - COST) }));
// ---- V15-SN ----
{ const picks = new Map(), base = new Map(), diag = { formations: 0, v15PerMonth: [], snPerMonth: [] };
  for (const t of FORM) { if (t < 199) continue; const v = v15At(t); if (!v.length) continue; const liq = LIQ.get(t), cnt = {}; for (const i of liq) { const g = sic2(SYMS[i]) || '?'; cnt[g] = (cnt[g] || 0) + 1; }
    const share = Object.fromEntries(Object.entries(cnt).map(([g, n]) => [g, n / liq.length]));
    const sn = sectorCap(v.map(i => ({ i, f: fsAt(i, t), dv: dollarVol(i, t), g: sic2(SYMS[i]) })), share).map(x => x.i);
    picks.set(t, sn); base.set(t, v); diag.formations++; diag.v15PerMonth.push(v.length); diag.snPerMonth.push(sn.length); }
  DIAGS['V15-SN'] = diag;
  if (!DIAG) { const days = [...picks.keys()], { trades, mid } = basketTrades(picks, 126, days, NEWMODE), R = halves(trades, 126), extra = [];
    const vt = basketTrades(base, 126, days, NEWMODE).trades.map(z => ({ ...z, half: z.t < mid ? 'older' : 'newer' })), vs = {};
    for (const k of ['older', 'newer']) { const a = avgNet(trades.filter(z => z.half === k)), b = avgNet(vt.filter(z => z.half === k)); vs[k] = { rule: r4(a), v15: r4(b) }; if (!(a > b)) extra.push('not better than V15 itself on the same dates in the ' + k + ' half (' + pc(a) + ' vs ' + pc(b) + ')'); }
    const sp = spyGate(trades, 126, extra);
    RES['V15-SN'] = { ...judge(R, { bar: BAR, extra }), results: R, vsV15: vs, vsSpy: sp, hold: 126, split: D[mid], mode: NEWMODE, trades: tradeRows(trades) }; }
  const tL = [...picks.keys()].pop(); NEW_TODAY['V15-SN'] = { formed: tL !== undefined ? D[tL] : null, syms: tL !== undefined ? picks.get(tL).map(i => SYMS[i]) : [] }; }

// ---- EDGAR quarterly master index: Form 424B5 by CIK (B-CR1), cached per quarter in the value cache (a past quarter never changes) ----
const F424 = new Map(); let masterOk = false;
{ const SEC = local(env.SEC_BASE) || 'https://www.sec.gov', MD = VC + '/master'; fs.mkdirSync(MD, { recursive: true }); const qs = [], now = new Date(), fail = []; let got = 0, rows = 0;
  for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { if (Date.UTC(y, (q - 1) * 3, 1) <= now.getTime() && (y > 2021 || q >= 3)) qs.push([y, q]); }
  for (const [y, q] of qs) { const cf = MD + '/' + y + 'q' + q + '.json', cur = Date.now() < Date.UTC(y, q * 3, 1) + 5 * 864e5; let x = cur ? null : J(cf, null);
    if (!x) { const gz = MD + '/master.gz'; let txt = null;
      try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', gz, SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 10 * 60e3 }); txt = zlib.gunzipSync(fs.readFileSync(gz)).toString('latin1'); } catch (e) { txt = null; }
      try { fs.unlinkSync(gz); } catch (e) {}
      if (txt) { x = []; for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length !== 5 || !/^\d+$/.test(p[0].trim())) continue; if (p[2].trim() === '424B5') x.push([String(+p[0]), p[3].trim()]); }
        if (x.length > 100 || local(env.SEC_BASE)) { fs.writeFileSync(cf, JSON.stringify(x)); got++; } else x = null; }
      if (!local(env.SEC_BASE)) await sleep(200); }
    if (!x) { fail.push(y + 'q' + q); continue; } for (const [c, d] of x) { (F424.get(c) || F424.set(c, []).get(c)).push(d); rows++; } }
  for (const a of F424.values()) a.sort(); masterOk = !fail.length;
  DIAGS.master424B5 = { quarters: qs.length, downloadedNow: got, rows, missing: fail };
  console.log('value-lab: EDGAR master index ' + rows + ' Form 424B5 filings, ' + qs.length + ' quarters' + (fail.length ? ', MISSING ' + fail.join(' ') : '')); }
const had424 = (s, d) => { const cik = symCik(s), a = cik && F424.get(String(+cik)); if (!a) return false; const lo = new Date(Date.parse(d + 'T00:00:00Z') - 90 * 864e5).toISOString().slice(0, 10); return a.some(x => x >= lo && x <= d); };
// ---- B-CR1 and B-CR1-AVOID ----
{ const buy = new Map(), avoid = new Map(), diag = { formations: 0, checked: 0, withRunway: 0, burners: 0, runway8: 0, runway8no424: 0, under4: 0 };
  const rwAt = (s, d) => { const co = coOf(s); return co ? runwayAt(co, d) : null; };
  for (const t of FORM) { const b = [], a = []; diag.formations++;
    for (const i of LIQ.get(t)) { const s = SYMS[i]; if (finCo(s)) continue; diag.checked++; const r = rwAt(s, D[t]); if (!r) continue; diag.withRunway++; if (!r.burner) continue; diag.burners++;
      if (r.runway >= 8) { diag.runway8++; if (!had424(s, D[t])) { diag.runway8no424++; b.push(i); } } else if (r.runway < 4) { diag.under4++; a.push(i); } }
    buy.set(t, b); avoid.set(t, a); }
  DIAGS['B-CR1'] = diag;
  if (!DIAG) { const days = [...buy.keys()];
    { const { trades, mid } = basketTrades(buy, 60, days, NEWMODE), R = halves(trades, 60), extra = [], sp = spyGate(trades, 60, extra);
      RES['B-CR1'] = { ...judge(R, { bar: BAR, extra }), needsMaster: true, results: R, vsSpy: sp, hold: 60, split: D[mid], mode: NEWMODE, trades: tradeRows(trades) }; }
    { const { trades, mid } = basketTrades(avoid, 60, days, NEWMODE), R = { older: avoidStat(trades.filter(z => z.half === 'older'), 60), newer: avoidStat(trades.filter(z => z.half === 'newer'), 60), all: avoidStat(trades, 60) };
      RES['B-CR1-AVOID'] = { ...avoidJudge(R), kind: 'avoid', needsMaster: false, results: R, hold: 60, split: D[mid], mode: NEWMODE, trades: trades.map(z => ({ s: z.s, d: D[z.t], gross: r4(z.g), avgStock: r4(z.c), sameStock: r4(z.own) })) }; } }
  const tL = FORM[FORM.length - 1]; NEW_TODAY['B-CR1'] = { formed: D[tL], syms: (buy.get(tL) || []).map(i => SYMS[i]) };
  // today's AVOID flags (information until AVOID CONFIRMED): liquid non-financial cash burners under 4 quarters of runway at the last close
  const lastT = T - 1, asOf = new Date(Date.parse(D[lastT] + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10), flags = [];
  for (let i = 0; i < NS; i++) { if (i === spyI || !liquid(i, lastT)) continue; const s = SYMS[i]; if (finCo(s)) continue; const r = rwAt(s, asOf); if (r && r.burner && r.runway < 4) flags.push({ sym: s, runwayQuarters: r4(r.runway), cash: Math.round(r.cash), ttmOperatingCash: Math.round(r.cfo), periodEnd: r.end, recent424B5: had424(s, D[lastT]) }); }
  AVOID_TODAY = { asOf: D[lastT], flags: flags.sort((x, y) => x.runwayQuarters - y.runwayQuarters) }; }

// ---- output ----
const cover = { companiesNeeded: needCiks.size, withSecFacts: covered, factsAt: FX.at, secNote };
if (DIAG) { console.log('VALUE LAB DIAGNOSTICS (coverage only, no returns computed) ' + D[0] + ' to ' + D[T - 1]); console.log(JSON.stringify({ cover, ...DIAGS }, null, 1).slice(0, 12000)); process.exit(0); }
const PREV = J(OUT, {}), complete = covered >= needCiks.size * 0.8, isJudged = (r) => complete && r && r.verdict !== 'TOO FEW CASES' && (!r.needsMaster || masterOk);
const strip = (r) => { const { trades, months, ...rest } = r; return rest; };
const firstRun = freezeEach(PREV.firstRun, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), to: D[T - 1], bar: BAR, ...strip(r) }])), isJudged);
// ---- ENGINE AUDIT (24 Oct 2026, bug AUD-1, yardstick.mjs): each rule that reached TRY SMALL is re-run ONCE on its frozen window with the
// yardstick fixed; written to correctedRun next to firstRun (never over it). Three modes: asFrozen (must reproduce the frozen numbers),
// capBoth (the corrected verdict), raw (sensitivity). Nothing else changes: same picks, entries, exits, costs, halves and judge.
const correctedRun = { ...(PREV.correctedRun || {}) };
if (complete) for (const id of ['B-FCF1', 'B-BASK1_1m', 'B-BASK1_3m']) { const fr = firstRun[id]; if (!fr || correctedRun[id]) continue; const end = D.indexOf(String(fr.to)); if (end < 0) { console.log('audit: ' + id + ' frozen window end ' + fr.to + ' not in the cache; not corrected'); continue; }
  LIMIT = end; fwdMemo.clear(); ctrlMemo.clear();
  const run = (mode) => { let R; if (id === 'B-FCF1') { const p = new Map([...FCF_PICKS].filter(([t]) => t < LIMIT)); R = halves(basketTrades(p, 63, [...p.keys()], mode).trades, 63); }
    else { const h = id.endsWith('_1m') ? 21 : 63; R = halves(BASK_MONTHS(h, mode).months, h); } return { ...judge(R, { bar: fr.bar }), R }; };
  correctedRun[id] = correctedEntry({ frozen: fr, fixed: run('capBoth'), asFrozen: run('asFrozen'), raw: run('raw'), bugs: ['AUD-1'], window: [D[0], D[end]], extra: { hold: fr.hold } });
  const c = correctedRun[id]; console.log('AUDIT ' + id + ': frozen ' + fr.verdict + ' -> corrected ' + c.verdict + ' (reproduced: ' + c.reproduced.matchesFrozen + ') | older edge ' + pc(fr.results.older.edge) + ' -> ' + pc(c.results.older.edge) + ' | newer edge ' + pc(fr.results.newer.edge) + ' -> ' + pc(c.results.newer.edge)); }
LIMIT = T - 1;
const tierOf = (id) => { const ks = Object.keys(firstRun).filter(k => k === id || k.startsWith(id + '_')), v = ks.map(k => firstRun[k].verdict); return v.includes('PROVEN') ? 'PROVEN' : v.includes('TRADABLE SMALL') ? 'TRADABLE SMALL' : null; };
// today's picks with the live gates (halal, lottery 15%+ one-day jump in the last 21 sessions, share count up 10%+ in a year = dilution)
const HAL = J('data/halal.json', {}), zbad = new Set((J('data/zad-list.json', {}).notHalal) || []);
const lottery = (i) => { for (let k = T - 21; k < T; k++) { const a = CC(i, k - 1), b = CC(i, k); if (a > 0 && b > 0 && b / a - 1 >= 0.15) return r4(b / a - 1); } return null; };
const dilution = (s) => { const cik = symCik(s), a = cik && SH.c[cik]; if (!a || a.length < 2) return null; const last = a[a.length - 1], yr = a.filter(p => p[0] <= new Date(Date.parse(last[0]) - 330 * 864e5).toISOString().slice(0, 10)).pop(); return yr && yr[1] > 0 && last[1] / yr[1] - 1 >= 0.10 ? r4(last[1] / yr[1] - 1) : null; };
const todayRules = {}, research = {}; for (const [id, p] of [...Object.entries(PICKS_TODAY), ...Object.entries(NEW_TODAY)]) (NEW_TODAY[id] ? research : todayRules)[id] = { tier: tierOf(id), formed: p.formed, picks: p.syms.map(s => { const i = SY.get(s), why = [], hal = zbad.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
  const lt = i !== undefined ? lottery(i) : null, dl = dilution(s); if (hal === 'fail') why.push('not halal (ZAD)'); if (lt !== null) why.push('lottery-like jump ' + pc(lt)); if (dl !== null) why.push('share count up ' + pc(dl) + ' in a year');
  return { sym: s, lastClose: i !== undefined ? r4(CC(i, T - 1)) : null, halal: hal, blocked: why.length > 0, why, ...(p.detail ? { detail: p.detail.find(x => x.sym === s) } : {}) }; }) };
fs.writeFileSync(TODAY_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], holdSessions: { 'B-FCF1': 63, 'B-BASK1': 63, 'B-EM1': 60, 'B-SIF1': 63, 'V15-SN': 126, 'B-CR1': 60 }, stopPct: 0.15, buyUpToPct: 0.03,
  avoid: { 'B-CR1-AVOID': { verdict: firstRun['B-CR1-AVOID'] ? firstRun['B-CR1-AVOID'].verdict : null, confirmed: !!(firstRun['B-CR1-AVOID'] && firstRun['B-CR1-AVOID'].verdict === 'AVOID CONFIRMED'), rule: 'cash burner (TTM operating cash flow < 0) with cash + short-term investments under 4 quarters of burn', note: 'information only unless confirmed is true; an AVOID block is never a short', ...(AVOID_TODAY || {}) } },
  note: 'Agent B value rules. A rule shows buys in ACTIONS only when its frozen first verdict is TRADABLE SMALL or PROVEN; otherwise this file is information only. research = rules first run on 27 Oct 2026 (V15-SN, B-CR1): never offered as buys from this file (a new study never goes straight into buys); the main session decides.', rules: todayRules, research }, null, 1));
const out = { generatedAt: new Date().toISOString(), versions: Object.keys(RES).length, preRegistered: 'data/strategy-library.json (B-FCF1 23 Oct; B-BASK1 21 Oct; B-EM1 and B-SIF1 22 Oct; V15-SN, B-CR1 and B-CR1-AVOID 27 Oct, value-lab.mjs header)', window: [D[0], D[T - 1]], bar: BAR, leagueBar: LEAGUE.bar || null, complete, cover, diagnostics: DIAGS,
  notBuilt: { 'V15 ex-tech (SIC 35/36/38)': 'V15-NO35, squad 21 forward paper only (never backtested, by design)', 'V15 12 months, full gates': '252-session blocks: at most 2 per half on the 5-year cache (3 needed); and V15 12 m already lost to the S&P 500 in 2021-23 (quality.json v15)' },
  standard: 'both halves: > 0 after 0.8% and 1.2% cost, edge over the average stock > 0, better than the same stocks on their other formation days, > 0 without the 2 best, block t >= ' + TIER2_T + ' (blocks = the hold length) -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN; plus each rule\'s own gates',
  firstRun, correctedRun, latest: latestBlock({ at: new Date().toISOString(), to: D[T - 1], results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }), trades: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r.trades || r.months || []])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('VALUE LAB ' + D[0] + ' to ' + D[T - 1] + ' | proof bar ' + BAR + ' | SEC facts ' + covered + '/' + needCiks.size + (complete ? '' : ' (INCOMPLETE: nothing frozen)'));
for (const [k, r] of Object.entries(RES)) { if (r.kind === 'avoid') { const g = (h) => h.n + ' (' + h.days + ' days, ' + h.stocks + ' stocks) excess ' + pc(h.excess) + ' median ' + pc(h.medianExcess) + ' own ' + pc(h.vsOwn) + ' tBlock ' + h.tBlock + ' (' + h.blocks + ')'; console.log('- ' + k + ': ' + r.verdict + ' | older ' + g(r.results.older) + ' | newer ' + g(r.results.newer) + ' | ' + r.why); continue; }
  const o = r.results.older, n = r.results.newer, f = (h) => h.n + ' (' + h.days + ' days) avg ' + pc(h.avg) + ' med ' + pc(h.median) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' (' + h.blocks + ')';
  console.log('- ' + k + ': ' + r.verdict + ' | older ' + f(o) + ' | newer ' + f(n) + ' | ' + r.why); }
// library: from firstRun only
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of ['B-FCF1', 'B-BASK1', 'B-EM1', 'B-SIF1', 'V15-SN', 'B-CR1']) { const e = LB && LB.strategies.find(x => x.id === id), ks = Object.keys(firstRun).filter(k => k === id || k.startsWith(id + '_')); if (!e || !ks.length || /^tested/.test(e.status || '')) continue;
    const res = Object.fromEntries(ks.map(k => { const r = firstRun[k], R = r.results; return [k, { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], median: [R.older.median, R.newer.median], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], stress: [R.older.avgStress, R.newer.avgStress], tBlock: [R.older.tBlock, R.newer.tBlock], why: r.why }]; }));
    const best = tierOf(id), v = ks.map(k => firstRun[k].verdict);
    e.status = 'tested: ' + (best ? best.toLowerCase() : v.includes('NOT PROVEN') ? 'not proven' : v.every(x => x === 'TOO FEW CASES') ? 'too few cases' : 'rejected') + (best === 'TRADABLE SMALL' ? ' (tier 2)' : '');
    e.tested = firstRun[ks[0]].to; e.study = 'value-lab.mjs -> data/value-lab.json (run once as written, first complete run frozen)'; e.result = ks.length === 1 ? res[ks[0]] : res; ch = true; }
  { const e = LB && LB.strategies.find(x => x.id === 'B-CR1-AVOID'), r = firstRun['B-CR1-AVOID'];
    if (e && r && !/^tested/.test(e.status || '')) { const R = r.results, b = (k) => ({ n: R[k].n, days: R[k].days, stocks: R[k].stocks, excess: R[k].excess, medianExcess: R[k].medianExcess, vsOwn: R[k].vsOwn, tBlock: R[k].tBlock, blocks: R[k].blocks, worst: R[k].worst });
      e.status = r.verdict === 'AVOID CONFIRMED' ? 'tested: passed (AVOID block)' : r.verdict === 'TOO FEW CASES' ? 'tested: too few cases' : 'tested: rejected (no AVOID)';
      e.tested = r.to; e.study = 'value-lab.mjs -> data/value-lab.json (run once as written, first complete run frozen)'; e.result = { verdict: r.verdict, older: b('older'), newer: b('newer'), why: r.why }; ch = true; } }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('value-lab: library not updated: ' + e.message); }
