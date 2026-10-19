// QUALITY COMPANIES, HELD FOR MONTHS: the long-investing lane. Instead of chart setups (which failed against the S&P 500), this buys
// companies by what their own SEC reports say, the way a long-term investor picks Intel or Nvidia, and tests it fairly.
// Four measures from the yearly 10-K reports (SEC XBRL "frames", free and official), fixed in advance from published research:
//   PROFIT   gross profit / total assets (high = a business that earns a lot on what it owns; Novy-Marx 2013)
//   NO_DILUTE  share count change over the year (low = the company is not printing new shares)
//   LEAN     total assets growth over the year (low = not buying growth at any price; Cooper, Gulen and Schill 2008)
//   CASH     (net income - operating cash flow) / assets (low = profits backed by real cash, not accounting; Sloan 1996)
// QUALITY = the average rank of the four (needs at least 3 of them). Also tested alone: PROFIT.
// VALUE (fair price, Fama-French / Lakonishok style): operating cash flow / market value (shares known at the year end x the price that
//   day). High = the stock is cheap for the cash its business makes. QUALITY+VALUE = the average of both ranks (good AND cheap).
// FAIR VALUE RANGE per stock (shown, not traded): the price at which its cash-flow yield would equal its OWN past yields (the 25th /
//   50th / 75th percentile of past years) -> optimistic / base / conservative value. A range, never one magic number, and only as good
//   as the VALUE test says: if VALUE fails, "cheap" has not paid on 5 years of history.
// Point in time: a company's yearly numbers are used only from 100 days after the year ends (10-Ks are due within 60-90 days),
// so no test sees a number before it was public. Every month the top 10% of liquid stocks (5 USD+, 5M USD+ a day) by the score are
// bought, held 6 and 12 months, and compared with an average liquid stock bought the same day and with the S&P 500, older and newer
// half, costs 0.8% a trade, 1.2% stress. 4 versions. Output: data/quality.json (verdicts + today's top quality companies).
// Added 19 Oct, two published fundamental strategies through the SAME machinery (thresholds fixed in advance, financials 6xxx left out):
//   MAGIC FORMULA (Greenblatt 2005): earnings yield = operating income / (market value + total liabilities - cash) and return on capital
//     = operating income / (total assets - current liabilities - cash) (a simple proxy for Greenblatt's net working capital + fixed
//     assets); combined = the average of the two percentile ranks; the top 10% (10+ stocks) are bought.
//   F-SCORE (Piotroski 2000): 9 yes/no checks from the 10-Ks (net income > 0, operating cash flow > 0, ROA up, cash flow > net income,
//     long-term debt / average assets down, current ratio up, no new shares, gross margin up, asset turnover up; ROA and turnover on
//     start-of-year assets as in the paper). Stocks scoring 8-9 are bought (if under 10 that month, the 10 best scores). F-SCORE CHEAP
//     = the same, only inside the cheapest 30% by book / market value (the paper's setting). A stock with any of the 9 inputs missing
//     is left out (missing is never read as zero).
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const DATA = local(env.SEC_BASE) || 'https://data.sec.gov', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const UA = env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com', OUT = 'data/quality.json', FC = env.FUND_CACHE || 'study-cache/fund.json.gz';
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(FC.split('/').slice(0, -1).join('/') || '.', { recursive: true });
let calls = 0, note = '';
async function sec(url) { if (note) return null; await sleep(local(env.SEC_BASE) ? 0 : 200); calls++;
  const go = () => fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }); let r; try { r = await go(); } catch (e) { return null; }
  for (let k = 0; k < 3 && (r.status === 403 || r.status === 429); k++) { await sleep(5000); try { r = await go(); } catch (e) { return null; } }
  if (r.status === 403 || r.status === 429) { note = 'SEC refused (HTTP ' + r.status + ')'; return null; } if (!r.ok) return null; return r.json().catch(() => null); }
// ---- 1. yearly fundamentals per company (cached; each finished year is read once)
let F; try { F = JSON.parse(zlib.gunzipSync(fs.readFileSync(FC)).toString()); } catch (e) { F = { got: {}, v: {} }; }
const TAGS = { gp: ['GrossProfit', 'USD', ''], ni: ['NetIncomeLoss', 'USD', ''], cfo: ['NetCashProvidedByUsedInOperatingActivities', 'USD', ''], assets: ['Assets', 'USD', 'Q4I'],
  oi: ['OperatingIncomeLoss', 'USD', ''], liab: ['Liabilities', 'USD', 'Q4I'], lcur: ['LiabilitiesCurrent', 'USD', 'Q4I'], acur: ['AssetsCurrent', 'USD', 'Q4I'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'USD', 'Q4I'], ltd: ['LongTermDebtNoncurrent', 'USD', 'Q4I'], rev: ['Revenues', 'USD', ''],
  rev2: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', ''], eq: ['StockholdersEquity', 'USD', 'Q4I'] };
const Y = new Date().getUTCFullYear();
for (let y = +(env.Q_FROM || 2017); y <= Y - 1; y++) for (const [k, [tag, u, sfx]] of Object.entries(TAGS)) { const key = k + y; if (F.got[key] && y < Y - 1) continue;
  const j = await sec(DATA + '/api/xbrl/frames/us-gaap/' + tag + '/' + u + '/CY' + y + sfx + '.json'); if (!j || !Array.isArray(j.data)) { if (note) break; continue; }
  for (const x of j.data) { if (!x || !x.cik || !isFinite(x.val)) continue; const c = F.v[x.cik] || (F.v[x.cik] = {}); (c[y] || (c[y] = {}))[k] = x.val; }
  F.got[key] = j.data.length; }
fs.writeFileSync(FC, zlib.gzipSync(JSON.stringify(F)));
let SH = null; try { SH = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/shares.json.gz')).toString()); } catch (e) {}
if (!SH || !SH.t) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no SEC ticker list yet (shares.mjs runs first)' })); console.log('quality: no ticker list'); process.exit(0); }
const sharesAtYearEnd = (cik, y) => { const a = SH.c[cik]; if (!a) return null; let v = null; for (const [e, n] of a) { if (e <= y + '-12-31' && e >= y + '-07-01') v = n; } return v; };
// the four measures for company cik, fiscal (calendar) year y
function measures(cik, y) { const c = F.v[cik]; if (!c || !c[y] || !c[y - 1]) return null; const a = c[y], b = c[y - 1]; if (!(a.assets > 0) || !(b.assets > 0)) return null;
  const s1 = sharesAtYearEnd(cik, y), s0 = sharesAtYearEnd(cik, y - 1);
  return { profit: isFinite(a.gp) ? a.gp / a.assets : null, dilute: s1 > 0 && s0 > 0 ? s1 / s0 - 1 : null, growth: a.assets / b.assets - 1, accr: isFinite(a.ni) && isFinite(a.cfo) ? (a.ni - a.cfo) / a.assets : null }; }
// Piotroski F-score (0-9) for company cik, fiscal year y; null when any input is missing (needs years y, y-1 and y-2 for start-of-year assets)
const num = (...v) => v.every(u => typeof u === 'number' && isFinite(u));
function fscore(cik, y) { const c = F.v[cik]; if (!c || !c[y] || !c[y - 1] || !c[y - 2]) return null; const a = c[y], b = c[y - 1], z = c[y - 2];
  if (!num(a.ni, b.ni, a.cfo, a.ltd, b.ltd, a.acur, b.acur, a.gp, b.gp) || !(a.assets > 0 && b.assets > 0 && z.assets > 0) || !(a.lcur > 0 && b.lcur > 0)) return null;
  const rk = num(a.rev, b.rev) ? 'rev' : num(a.rev2, b.rev2) ? 'rev2' : null; if (!rk || !(a[rk] > 0 && b[rk] > 0)) return null;   // the same revenue tag in both years
  const s1 = sharesAtYearEnd(cik, y), s0 = sharesAtYearEnd(cik, y - 1); if (!(s1 > 0 && s0 > 0)) return null;
  const chk = [a.ni > 0, a.cfo > 0, a.ni / b.assets > b.ni / z.assets, a.cfo > a.ni, a.ltd / ((a.assets + b.assets) / 2) < b.ltd / ((b.assets + z.assets) / 2),
    a.acur / a.lcur > b.acur / b.lcur, s1 <= s0, a.gp / a[rk] > b.gp / b[rk], a[rk] / b.assets > b[rk] / z.assets];
  return chk.filter(Boolean).length; }
// ---- 2. prices (the same 5-year whole-market cache as the other studies)
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + T + ' sessions' })); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; } }); const SIC = store.sic || {}; store = null;
// banks, lenders, insurers and REITs (SEC industry 6xxx): operating cash flow does not measure their business, so they are left out of the dip hunt
const finCo = (s) => { const x = SIC[s]; return !!(x && x.c && String(x.c)[0] === '6'); };
const spyI = SY.get('SPY'), GONE = -0.3, COST = 0.008, STRESS = 0.012, H = [126, 252];
const hi252 = (i, t) => { const b = i * T; let m = 0; for (let k = Math.max(2, t - 251); k <= t; k++) { const c = Math.min(C[b + k], C[b + k - 1], C[b + k - 2]); if (c > m) m = c; } return m; };   // highest 3-day floor: one bad price print cannot fake a high
const liquid = (i, t) => { const b = i * T, c = C[b + t]; if (!(c >= 5)) return false; let dv = 0; for (let k = t - 19; k <= t; k++) { if (k < 0 || !isFinite(C[b + k])) return false; dv += C[b + k] * V[b + k]; } return dv / 20 >= 5e6; };
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null, lk = t;
  for (let k = t + 1; k <= t + h; k++) if (isFinite(C[b + k])) { last = C[b + k]; lk = k; } if (last === null) return null; if (lk === t + h) return last / e - 1;
  let later = false; for (let k = t + h + 1; k < Math.min(T, t + h + 15); k++) if (isFinite(C[b + k])) { later = true; break; } if (later) return last / e - 1; if (t + h + 15 >= T) return null; return Math.max(-1, last / e - 1 + GONE); }
const known = (d) => { const y = +d.slice(0, 4), md = d.slice(5); return md >= '04-10' ? y - 1 : y - 2; };   // the latest year whose 10-K is public on day d (100 days after Dec 31)
const symCik = (s) => SH.t[s] || SH.t[s.replace(/\./g, '-')] || null;
const pct = (arr, key, lowGood) => { const v = arr.filter(x => x.m[key] !== null && isFinite(x.m[key])).sort((a, b) => a.m[key] - b.m[key]); v.forEach((x, n) => { x.r[key] = v.length > 1 ? (lowGood ? 1 - n / (v.length - 1) : n / (v.length - 1)) : 0.5; }); };
function scoreDay(t) { const y = known(D[t]), rows = [];
  for (let i = 0; i < NS; i++) { if (i === spyI || !liquid(i, t)) continue; const cik = symCik(SYMS[i]); if (!cik) continue; const m = measures(cik, y); if (!m) continue; rows.push({ i, m, r: {} }); }
  pct(rows, 'profit', false); pct(rows, 'dilute', true); pct(rows, 'growth', true); pct(rows, 'accr', true);
  for (const x of rows) { const cik = symCik(SYMS[x.i]), a = F.v[cik] && F.v[cik][y], sh = sharesAtYearEnd(cik, y), px = C[x.i * T + t]; x.m.cfy = a && isFinite(a.cfo) && sh > 0 && px > 0 ? a.cfo / (sh * px) : null; }
  pct(rows, 'cfy', false);
  // FAIR-PRICE DIP (added 18 Oct): down 40%+ from its 1-year high, yet still cheap for the cash its business makes (positive operating
  // cash flow) and not drowning in new shares (share count up under 10%). Ranked by cash-flow yield. Tested against the average stock
  // AND against ALL stocks down 40%+, so a pass means the cheapness paid, not just the bounce of any fallen stock.
  for (const x of rows) { const h = hi252(x.i, t), c = C[x.i * T + t]; x.m.dd = h > 0 && c > 0 ? 1 - c / h : null; x.down = x.m.dd !== null && x.m.dd >= 0.4;
    x.d = x.down && x.m.cfy > 0 && x.m.cfy < 0.4 && !finCo(SYMS[x.i]) && (x.m.dilute === null || x.m.dilute < 0.1) ? x.r.cfy : null; }   // a cash-flow yield of 40%+ is almost always a data error (units, share count), so it is skipped
  for (const x of rows) { const v = ['profit', 'dilute', 'growth', 'accr'].map(k => x.r[k]).filter(z => z !== undefined); x.q = v.length >= 3 ? mean(v) : null; x.p = x.r.profit !== undefined ? x.r.profit : null;
    x.v = x.r.cfy !== undefined ? x.r.cfy : null; x.qv = x.q !== null && x.v !== null ? (x.q + x.v) / 2 : null; }
  // MAGIC FORMULA and F-SCORE (added 19 Oct; financials 6xxx left out of both)
  for (const x of rows) { const cik = symCik(SYMS[x.i]), a = F.v[cik] && F.v[cik][y], sh = sharesAtYearEnd(cik, y), px = C[x.i * T + t], mv = sh > 0 && px > 0 ? sh * px : null, fin = finCo(SYMS[x.i]);
    const ev = a && mv && num(a.liab, a.cash) ? mv + a.liab - a.cash : null, cap = a && num(a.assets, a.lcur, a.cash) ? a.assets - a.lcur - a.cash : null;
    x.m.ey = !fin && a && num(a.oi) && ev > 0 ? a.oi / ev : null; x.m.roc = !fin && a && num(a.oi) && cap > 0 ? a.oi / cap : null;
    x.m.bm = !fin && a && num(a.eq) && a.eq > 0 && mv ? a.eq / mv : null; x.m.fs = fin ? null : fscore(cik, y); }
  const mfRows = rows.filter(x => x.m.ey !== null && x.m.roc !== null); pct(mfRows, 'ey', false); pct(mfRows, 'roc', false);
  for (const x of rows) x.mf = x.m.ey !== null && x.m.roc !== null ? (x.r.ey + x.r.roc) / 2 : null;
  const bmS = rows.filter(x => x.m.bm !== null).sort((a, b) => b.m.bm - a.m.bm), cheap = new Set(bmS.slice(0, Math.ceil(bmS.length * 0.3)));
  for (const x of rows) { x.fs = x.m.fs; x.fsc = cheap.has(x) ? x.m.fs : null; }
  return rows; }
// ---- 3. monthly portfolios
// third field 'f' = F-score rule: buy every stock scoring 8-9; if under 10 that month, the 10 best scores (others: top 10%, 10+ stocks)
const VERS = [['QUALITY', 'q'], ['PROFIT', 'p'], ['VALUE', 'v'], ['QUALITY+VALUE', 'qv'], ['FAIR-PRICE DIP', 'd'], ['MAGIC FORMULA', 'mf'], ['F-SCORE', 'fs', 'f'], ['F-SCORE CHEAP', 'fsc', 'f']], trades = {}; for (const [n] of VERS) for (const h of H) trades[n + '_' + h] = [];
let lastRows = null, months = 0;
for (let t = 21; t < T - 1; t += 21) { const rows = scoreDay(t); if (rows.length < 100) continue; months++; if (t + 21 >= T - 1) lastRows = rows;
  for (const h of H) { if (t + h >= T) continue; const all = rows.map(x => fwd(x.i, t, h)).filter(x => x !== null && isFinite(x)); if (all.length < 50) continue; const ctrl = mean(all);
    const downAll = rows.filter(x => x.down).map(x => fwd(x.i, t, h)).filter(x => x !== null && isFinite(x)), c2 = downAll.length >= 20 ? mean(downAll) : null;
    const sb = spyI !== undefined ? spyI * T : null, spy = sb !== null && O[sb + t + 1] > 0 && C[sb + t + h] > 0 ? C[sb + t + h] / O[sb + t + 1] - 1 : null;
    for (const [n, f, mode] of VERS) { const top = rows.filter(x => x[f] !== null).sort((a, b) => b[f] - a[f]), hi = mode === 'f' ? top.filter(x => x[f] >= 8) : null;
      const pick = mode === 'f' ? (hi.length >= 10 ? hi : top.slice(0, 10)) : top.slice(0, Math.max(10, Math.ceil(top.length * 0.1)));
      for (const x of pick) { const g = fwd(x.i, t, h); if (g !== null && isFinite(g)) trades[n + '_' + h].push({ t, s: SYMS[x.i], g, c: ctrl, c2, spy }); } } } }
if (!lastRows) lastRows = scoreDay(T - 1);
// ---- 4. verdicts (per formation month: stocks bought the same month share the same market)
const mid = (() => { const ts = [...new Set(Object.values(trades).flat().map(x => x.t))].sort((a, b) => a - b); return ts[Math.floor(ts.length / 2)] || T / 2; })();
const stat = (a, cost) => { if (!a.length) return { n: 0 }; const p = a.map(x => x.g - cost), sm = (z) => z.reduce((u, v) => u + v, 0), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), byS = {}; let pos = 0;
  for (let k = 0; k < a.length; k++) if (p[k] > 0) { byS[a[k].s] = (byS[a[k].s] || 0) + p[k]; pos += p[k]; } const srt = [...p].sort((u, v) => v - u);
  const byM = {}; for (let k = 0; k < a.length; k++) (byM[a[k].t] = byM[a[k].t] || []).push(p[k] - (a[k].c - cost)); const mv = Object.values(byM).map(mean), mm = mean(mv), sd = Math.sqrt(mv.reduce((u, v) => u + (v - mm) ** 2, 0) / Math.max(1, mv.length - 1));
  return { n: p.length, months: mv.length, avg: sm(p) / p.length, ctrl: mean(a.map(x => x.c - cost)), ctrlDown: (() => { const z = a.filter(x => x.c2 !== null && x.c2 !== undefined); return z.length ? mean(z.map(x => x.c2 - cost)) : null; })(), spy: mean(a.filter(x => x.spy !== null).map(x => x.spy)), win: w.length / p.length, pf: l.length && sm(l) < 0 ? sm(w) / -sm(l) : null,
    noTop2: srt.length > 2 ? sm(srt.slice(2)) / (srt.length - 2) : null, topStock: pos > 0 ? Math.max(...Object.values(byS)) / pos : null, edge: mm, t: sd > 0 ? mm / (sd / Math.sqrt(mv.length)) : null }; };
const RES = {}, NV = VERS.length * H.length;
for (const [n] of VERS) for (const h of H) { const a = trades[n + '_' + h], R = { older: stat(a.filter(x => x.t < mid), COST), newer: stat(a.filter(x => x.t >= mid), COST), stress: stat(a.filter(x => x.t >= mid), STRESS) }, why = [], need = h === 126 ? 0.015 : 0.03;
  let verdict = 'PROMISING';
  if (R.older.months < 12 || R.newer.months < 12) { verdict = 'NOT PROVEN'; why.push('too few months (' + (R.older.months || 0) + ' / ' + (R.newer.months || 0) + '; 12 each needed)'); }
  else { for (const k of ['older', 'newer']) { if (!(R[k].avg > R[k].ctrl + need)) why.push('not ' + pc(need) + '+ better than an average stock in the ' + k + ' half (' + pc(R[k].avg) + ' vs ' + pc(R[k].ctrl) + ')'); if (!(R[k].avg > (R[k].spy || 0) - COST)) why.push('did not beat holding the S&P 500 in the ' + k + ' half (' + pc(R[k].avg) + ' vs ' + pc(R[k].spy) + ')'); if (!(R[k].t >= 2)) why.push('the edge over an average stock could be luck in the ' + k + ' half (t ' + (R[k].t === null ? 'n/a' : R[k].t.toFixed(1)) + ')'); }
    if (n === 'FAIR-PRICE DIP') for (const k of ['older', 'newer']) if (!(R[k].avg > R[k].ctrlDown)) why.push('no better than any stock down 40%+ in the ' + k + ' half (' + pc(R[k].avg) + ' vs ' + pc(R[k].ctrlDown) + ')');
    if (!(R.stress.avg > 0)) why.push('loses at 1.2% cost'); if (!(R.newer.noTop2 > 0)) why.push('loses without its 2 best trades'); if (R.newer.topStock > 0.25) why.push('one stock made over 25% of the profit');
    if (why.length) verdict = R.older.avg > R.older.ctrl && R.newer.avg > R.newer.ctrl ? 'NOT PROVEN' : 'REJECTED'; }
  RES[n + '_' + h] = { name: { QUALITY: 'Quality companies (profit, no dilution, lean growth, cash-backed profit)', PROFIT: 'High gross profit on assets', VALUE: 'Cheap for its cash flow (fair-price lane)', 'QUALITY+VALUE': 'Good AND cheap (quality + cash-flow value)', 'FAIR-PRICE DIP': 'Fair-price dip (down 40%+ but cheap for its cash flow, little dilution)',
    'MAGIC FORMULA': 'Magic formula (Greenblatt: high earnings yield + high return on capital)', 'F-SCORE': 'Piotroski F-score 8-9 (improving finances)', 'F-SCORE CHEAP': 'Piotroski F-score 8-9 among the cheapest 30% by book value' }[n], months: Math.round(h / 21), verdict, why: why.join('; ') || 'beat an average stock and the S&P 500 in both halves, beyond luck, at stress cost', results: R }; }
const today = lastRows.filter(x => x.q !== null).sort((a, b) => b.q - a.q).slice(0, 25).map(x => ({ sym: SYMS[x.i], q: +x.q.toFixed(3), profit: x.m.profit === null ? null : +x.m.profit.toFixed(3), dilute: x.m.dilute === null ? null : +x.m.dilute.toFixed(3), growth: +x.m.growth.toFixed(3), accr: x.m.accr === null ? null : +x.m.accr.toFixed(3) }));
const rank = {}; { const q = lastRows.filter(x => x.q !== null).sort((a, b) => b.q - a.q); q.forEach((x, n) => { rank[SYMS[x.i]] = +(1 - n / Math.max(1, q.length - 1)).toFixed(3); }); }   // 1 = best quality now, 0 = worst
// fair value range per stock today, from its OWN past cash-flow yields (needs 3+ past years with positive cash flow)
const fair = {}; { const dayAt = (d) => { let lo = 0, hi = T - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
  for (const x of lastRows) { const s = SYMS[x.i], cik = symCik(s), c = F.v[cik]; if (!c) continue; const ys = [];
    for (let y = 2017; y <= known(D[T - 1]) - 1; y++) { const a = c[y], sh = sharesAtYearEnd(cik, y); if (!a || !(a.cfo > 0) || !(sh > 0)) continue; const t = dayAt((y + 1) + '-04-10'); if (t >= T - 1) continue; const px = C[x.i * T + t]; if (px > 0) ys.push(a.cfo / (sh * px)); }
    const yN = known(D[T - 1]), a = c[yN], sh = sharesAtYearEnd(cik, yN); if (ys.length < 3 || !a || !(a.cfo > 0) || !(sh > 0)) continue;
    ys.sort((u, v) => u - v); const q = (f) => ys[Math.min(ys.length - 1, Math.floor(f * (ys.length - 1) + 0.5))], cps = a.cfo / sh, px = C[x.i * T + T - 1];
    fair[s] = { cons: +(cps / q(0.75)).toFixed(2), base: +(cps / q(0.5)).toFixed(2), opt: +(cps / q(0.25)).toFixed(2), px: +px.toFixed(2), years: ys.length, cfy: +(cps / px).toFixed(4) }; } }
// today's fair-price dips: down 40%+, positive cash flow, little dilution, AND under the LOW end of its own fair-value range
const dipV = Object.entries(RES).filter(([k]) => k.startsWith('FAIR-PRICE DIP')).map(([, r]) => r.verdict), dipOk = dipV.includes('PROMISING');
const notHalal = new Set(); try { for (const t of JSON.parse(fs.readFileSync('data/zad-list.json', 'utf8')).notHalal || []) notHalal.add(t); } catch (e) {} try { for (const [t, v] of Object.entries(JSON.parse(fs.readFileSync('data/halal.json', 'utf8')))) if (v && v.s === 'fail') notHalal.add(t); } catch (e) {}
const dips = lastRows.filter(x => x.d !== null && !notHalal.has(SYMS[x.i]) && fair[SYMS[x.i]] && fair[SYMS[x.i]].cons > fair[SYMS[x.i]].px).sort((a, b) => b.m.cfy - a.m.cfy).slice(0, 20)
  .map(x => { const f = fair[SYMS[x.i]]; return { sym: SYMS[x.i], px: f.px, fairLow: f.cons, fairMid: f.base, fairHigh: f.opt, down: +x.m.dd.toFixed(3), cfy: +x.m.cfy.toFixed(3) }; });
const r3 = (v) => v === null || v === undefined || !isFinite(v) ? null : +v.toFixed(3), per = {};   // every liquid stock's own measures and percentile ranks (1 = best), for the stock map
for (const x of lastRows) per[SYMS[x.i]] = { q: r3(x.q), qr: r3(rank[SYMS[x.i]]), profit: r3(x.m.profit), pr: r3(x.r.profit), dilute: r3(x.m.dilute), growth: r3(x.m.growth), accr: r3(x.m.accr), cfy: r3(x.m.cfy), vr: r3(x.r.cfy) };
// today's picks of the two added strategies (research only; whether they count depends on their own verdicts above)
const magicToday = lastRows.filter(x => x.mf !== null).sort((a, b) => b.mf - a.mf).slice(0, 25).map(x => ({ sym: SYMS[x.i], mf: r3(x.mf), ey: r3(x.m.ey), roc: r3(x.m.roc) }));
const fscoreToday = lastRows.filter(x => x.fs !== null && x.fs >= 8).sort((a, b) => b.fs - a.fs).slice(0, 25).map(x => ({ sym: SYMS[x.i], fs: x.fs, cheap: x.fsc !== null }));
const out = { generatedAt: new Date().toISOString(), status: 'OK', fair, per, magicToday, fscoreToday, from: D[21], to: D[T - 1], months, versions: NV, secCalls: calls, note, results: RES, today, dips, dipVerdict: dipOk ? 'PROMISING' : (dipV.includes('NOT PROVEN') ? 'NOT PROVEN' : 'REJECTED'), rank, rules: { lagDays: 100, top: '10% of liquid stocks', cost: COST } };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const msg = ['QUALITY COMPANIES (long investing: chosen by their SEC reports, held 6 and 12 months; ' + out.from + ' to ' + out.to + ', ' + months + ' monthly portfolios)', ''];
for (const r of Object.values(RES)) { const n = r.results.newer; msg.push(r.name + ', ' + r.months + ' months: ' + r.verdict + (n.n ? ' | newer half ' + pc(n.avg) + ' vs average stock ' + pc(n.ctrl) + ', S&P 500 ' + pc(n.spy) + ', ' + Math.round(n.win * 100) + '% won' : '') + (r.verdict !== 'PROMISING' ? ' (' + r.why.split(';')[0] + ')' : '')); }
if (!Object.values(RES).some(r => r.verdict === 'PROMISING')) msg.push('', 'No list this week: no version beat the market, so the "top companies" would not be a buy list.'); else msg.push('', 'Top quality companies now (research list, check ZAD): ' + today.slice(0, 12).map(x => x.sym).join(', '), '', NV + ' versions. A pass goes to paper first. Research only.');
if (dips.length) msg.push('', 'FAIR-PRICE DIPS NOW (down 40%+ from the 1-year high, cash flow positive, under the LOW end of their own fair value; ' + (dipOk ? 'the test PASSED: research list, paper first, check ZAD' : 'the test has NOT passed yet: watch list only, not a buy list') + '):', ...dips.slice(0, 10).map(d => '- ' + d.sym + ' ' + d.px + ' (down ' + Math.round(d.down * 100) + '%, fair value ' + d.fairLow + ' to ' + d.fairHigh + ')'));
console.log(msg.join('\n'));
const QUIET_ = (() => { try { return JSON.parse(fs.readFileSync('data/settings.json', 'utf8')).quiet !== false; } catch (e) { return true; } })();   // quiet (default): study results stay in the files and reach you through ACTIONS and the weekly report
if (env.TG_TOKEN && env.TG_CHAT && !QUIET_) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
