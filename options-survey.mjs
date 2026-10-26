// OPTIONS SPREAD SURVEY (one-off, 27 Oct 2026; .github/workflows/options-survey.yml). INFORMATION ONLY: no rule, no verdict, no order.
// Universe: the US stocks the owner marked halal "ok" in data/halal.json (ZAD (you) or ZAD list), minus data/zad-list.json notHalal.
// The 30 most liquid by 20-session average traded value (SIP close x volume); the 19 named giants (NVDA AAPL MSFT GOOGL AMZN META AVGO
// TSLA AMD MU LLY WMT XOM JNJ KO MA ABBV CSCO INTC) are always included when marked ok, the rest of the 30 filled by traded value.
// Per stock: the OPRA snapshot chain of calls 45-180 calendar days to expiry (today's latest quotes and greeks), and
//   (a) ATM call: the standard monthly expiry nearest 90 days in the window, strike nearest the last price; its cost (ask x 100) and
//       half-spread % of mid = (ask - bid) / 2 / mid. Also the median ATM half-spread over every expiry in the window.
//   (b) the CHEAPEST call with ask x 100 <= 300 USD, OPRA delta >= 0.30 and a two-sided quote (bid > 0, ask >= bid).
//   (c) whether ANY such call exists (count), and the highest-delta one of them.
// Writes data/options-spread-survey.json and data/options-spread-survey.md. Keys only from env (GitHub secrets), never printed.
import fs from 'node:fs';
const env = process.env, AD = 'https://data.alpaca.markets', AH = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' } };
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), TODAY = new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
const isMonthly = (e) => { const d = +e.slice(8, 10), w = new Date(e + 'T12:00:00Z').getUTCDay(); return d >= 15 && d <= 21 && (w === 5 || w === 4); };
export const LO = 45, HI = 180, CAP = 300, MIN_DELTA = 0.30, FEE = 5;
export const GIANTS = 'NVDA AAPL MSFT GOOGL AMZN META AVGO TSLA AMD MU LLY WMT XOM JNJ KO MA ABBV CSCO INTC'.split(' ');
let req = 0; const errs = {};
async function alp(url) { for (let a = 0; a < 5; a++) { await sleep(40); req++; let r;
  try { r = await fetch(url, { ...AH, signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(2000); continue; }
  if (r.status === 429) { await sleep(10000); continue; } if (!r.ok) { if (r.status >= 500) { await sleep(2000); continue; } errs['HTTP ' + r.status] = (errs['HTTP ' + r.status] || 0) + 1; return null; }
  return await r.json().catch(() => null); } return null; }
async function pages(url, key) { const out = {}; let tok = null, n = 0;
  do { const j = await alp(url + (tok ? '&page_token=' + encodeURIComponent(tok) : '')); if (!j) break; for (const [k, v] of Object.entries(j[key] || {})) out[k] = Array.isArray(v) ? [...(out[k] || []), ...v] : v; tok = j.next_page_token; n++; } while (tok && n < 50);
  return out; }
const halfSp = (r) => (r.ap - r.bp) / 2 / ((r.ap + r.bp) / 2);
const twoSided = (r) => r.bp > 0 && r.ap > 0 && r.ap >= r.bp;
const view = (r, spot) => r && { occ: r.occ, strike: r.k, expiry: r.exp, days: r.days, delta: r4(r.delta), bid: r.bp, ask: r.ap, costUSD: r4(100 * r.ap), costWithFeeUSD: r4(100 * r.ap + FEE), halfSpreadPct: r4(100 * halfSp(r)), moneyness: r4(r.k / spot) };

if (!env.ALPACA_KEY || !env.ALPACA_SECRET) { console.log('no Alpaca key'); process.exit(1); }
const HAL = J('data/halal.json', {}), BAD = new Set(J('data/zad-list.json', {}).notHalal || []);
const OK = Object.entries(HAL).filter(([s, v]) => v && v.s === 'ok' && !BAD.has(s) && /^[A-Z.]+$/.test(s)).map(([s, v]) => ({ s, by: v.by }));
console.log('halal ok symbols: ' + OK.length);
// 20-session average traded value
const tv = {}, from = addDays(TODAY, -45);
for (let i = 0; i < OK.length; i += 50) { const b = OK.slice(i, i + 50).map(x => x.s);
  const g = await pages(AD + '/v2/stocks/bars?symbols=' + b.map(encodeURIComponent).join(',') + '&timeframe=1Day&start=' + from + '&end=' + TODAY + '&adjustment=raw&feed=sip&limit=10000', 'bars');
  for (const s of b) { const a = (g[s] || []).slice(-20); if (a.length >= 15) tv[s] = { tv20: a.reduce((u, x) => u + x.c * x.v, 0) / a.length, close: a[a.length - 1].c, closeDay: a[a.length - 1].t.slice(0, 10) }; } }
const ranked = OK.filter(x => tv[x.s]).sort((a, b) => tv[b.s].tv20 - tv[a.s].tv20).map((x, i) => ({ ...x, rank: i + 1 }));
const forced = ranked.filter(x => GIANTS.includes(x.s)), rest = ranked.filter(x => !GIANTS.includes(x.s)), PICK = [...forced, ...rest.slice(0, Math.max(0, 30 - forced.length))].sort((a, b) => a.rank - b.rank);
console.log('picked ' + PICK.length + ' (' + forced.length + ' named giants marked ok; missing giants: ' + GIANTS.filter(g => !forced.some(f => f.s === g)).join(' ') + ')');
// live spot (latest trade) for ATM
const snap = await alp(AD + '/v2/stocks/snapshots?symbols=' + PICK.map(x => x.s).join(',') + '&feed=sip') || {};
const rows = [];
for (const p of PICK) { const sp = snap[p.s], spot = (sp && sp.latestTrade && sp.latestTrade.p) || tv[p.s].close;
  const g = await pages(AD + '/v1beta1/options/snapshots/' + encodeURIComponent(p.s) + '?feed=opra&type=call&limit=1000&expiration_date_gte=' + addDays(TODAY, LO) + '&expiration_date_lte=' + addDays(TODAY, HI), 'snapshots');
  const chain = Object.entries(g).filter(([o]) => /C\d{8}$/.test(o)).map(([occ, v]) => { const m = occ.match(/(\d{6})C(\d{8})$/), q = v.latestQuote || {}, exp = '20' + m[1].slice(0, 2) + '-' + m[1].slice(2, 4) + '-' + m[1].slice(4, 6);
    return { occ, exp, days: dayDiff(TODAY, exp), k: +m[2] / 1000, delta: v.greeks && isFinite(v.greeks.delta) ? v.greeks.delta : null, ap: q.ap, bp: q.bp, qt: q.t || null }; }).filter(r => r.days >= LO && r.days <= HI);
  const two = chain.filter(twoSided), exps = [...new Set(chain.map(r => r.exp))].sort();
  const mon = exps.filter(isMonthly), atmExp = (mon.length ? mon : exps).slice().sort((a, b) => Math.abs(dayDiff(TODAY, a) - 90) - Math.abs(dayDiff(TODAY, b) - 90) || (a < b ? -1 : 1))[0] || null;
  const nearK = (list) => list.slice().sort((a, b) => Math.abs(a.k - spot) - Math.abs(b.k - spot) || a.k - b.k)[0] || null;
  const atm = atmExp ? nearK(two.filter(r => r.exp === atmExp)) : null;
  const atmAll = exps.map(e => nearK(two.filter(r => r.exp === e))).filter(Boolean).map(halfSp);
  const aff = two.filter(r => r.delta !== null && r.delta >= MIN_DELTA && 100 * r.ap <= CAP);
  const cheapest = aff.slice().sort((a, b) => a.ap - b.ap || b.delta - a.delta)[0] || null, best = aff.slice().sort((a, b) => b.delta - a.delta || a.ap - b.ap)[0] || null;
  const affFee = aff.filter(r => 100 * r.ap + FEE <= CAP);
  rows.push({ sym: p.s, halalBy: p.by, liquidityRank: p.rank, tv20USDm: r4(tv[p.s].tv20 / 1e6), spot: r4(spot), contracts: chain.length, twoSided: two.length, withDelta: chain.filter(r => r.delta !== null).length, expiries: exps.length,
    atm: atm ? { ...view(atm, spot), mid: r4((atm.ap + atm.bp) / 2), premiumMidUSD: r4(50 * (atm.ap + atm.bp)) } : null, atmHalfSpreadPctMedianAllExpiries: r4(atmAll.length ? 100 * median(atmAll) : null),
    cheapestAffordable: view(cheapest, spot), highestDeltaAffordable: view(best, spot), anyAffordable: aff.length > 0, nAffordable: aff.length, anyAffordableWithFee: affFee.length > 0,
    affordableHalfSpreadPctMedian: r4(aff.length ? 100 * median(aff.map(halfSp)) : null) });
  console.log(p.s.padEnd(6), 'spot ' + r4(spot), 'atm ' + (atm ? (100 * atm.ap).toFixed(0) + ' USD hs ' + (100 * halfSp(atm)).toFixed(2) + '%' : 'n/a'), 'affordable ' + aff.length, best ? 'best delta ' + best.delta.toFixed(2) : ''); }
const atmHs = rows.filter(r => r.atm).map(r => r.atm.halfSpreadPct), withAff = rows.filter(r => r.anyAffordable);
const S = { stocks: rows.length, medianAtmHalfSpreadPct: r4(median(atmHs)), maxAtmHalfSpreadPct: r4(Math.max(...atmHs)), medianAtmCostUSD: r4(median(rows.filter(r => r.atm).map(r => r.atm.costUSD))),
  withAffordableCall: withAff.length, withAffordableCallIncludingFee: rows.filter(r => r.anyAffordableWithFee).length,
  typicalDeltaCheapestAffordable: r4(median(withAff.map(r => r.cheapestAffordable.delta))), typicalDeltaHighestAffordable: r4(median(withAff.map(r => r.highestDeltaAffordable.delta))),
  medianHalfSpreadPctCheapestAffordable: r4(median(withAff.map(r => r.cheapestAffordable.halfSpreadPct))), medianDaysCheapestAffordable: median(withAff.map(r => r.cheapestAffordable.days)),
  withoutAffordable: rows.filter(r => !r.anyAffordable).map(r => r.sym) };
const OUT = { generatedAt: new Date().toISOString(), note: 'INFORMATION ONLY (one-off survey). OPRA snapshot (Alpaca Algo Trader Plus): latest quotes and greeks at run time; outside market hours these are the last quotes of the session. Not a rule, not a buy. Half-spread % = (ask - bid) / 2 / mid. Cost = ask x 100 (the ZAD fee of 5 USD is extra; anyAffordableWithFee counts ask x 100 + 5 <= 300).',
  window: { daysToExpiry: [LO, HI], cap: CAP, minDelta: MIN_DELTA, atm: 'standard monthly expiry nearest 90 days in the window (any expiry if no monthly), strike nearest the latest trade' },
  universe: { halalOk: OK.length, ranked: ranked.length, picked: PICK.length, giantsIncluded: forced.map(x => x.s), giantsMissing: GIANTS.filter(g => !forced.some(f => f.s === g)) },
  summary: S, requests: req, errors: errs, stocks: rows };
fs.writeFileSync('data/options-spread-survey.json', JSON.stringify(OUT, null, 1));
const f = (x, d = 2) => x === null || x === undefined ? 'n/a' : (+x).toFixed(d);
const md = ['# Options spread survey (' + TODAY + ', information only)', '', 'OPRA snapshot at ' + OUT.generatedAt + ' (Alpaca). Calls ' + LO + '-' + HI + ' days to expiry. ' + rows.length + ' most liquid ZAD-halal-ok US stocks (20-day traded value; named giants always in).', '',
  '**Summary:** median ATM half-spread ' + f(S.medianAtmHalfSpreadPct) + '% of mid (worst ' + f(S.maxAtmHalfSpreadPct) + '%); median ATM call costs ' + f(S.medianAtmCostUSD, 0) + ' USD. ' + S.withAffordableCall + ' of ' + rows.length + ' have a call with delta >= 0.30 at <= 300 USD (' + S.withAffordableCallIncludingFee + ' counting the 5 USD fee); typical delta of the cheapest such call ' + f(S.typicalDeltaCheapestAffordable) + ', of the highest-delta affordable call ' + f(S.typicalDeltaHighestAffordable) + '. No affordable call: ' + (S.withoutAffordable.join(', ') || 'none') + '.', '',
  '| # | Stock | Spot | ATM cost USD | ATM half-spr % | Cheapest <=300 & delta>=0.30: strike / expiry / delta / cost / half-spr % | Highest-delta <=300 | Any? |', '|---|---|---|---|---|---|---|---|',
  ...rows.map(r => { const c = r.cheapestAffordable, b = r.highestDeltaAffordable; return '| ' + r.liquidityRank + ' | ' + r.sym + ' | ' + f(r.spot) + ' | ' + (r.atm ? f(r.atm.costUSD, 0) : 'n/a') + ' | ' + (r.atm ? f(r.atm.halfSpreadPct) : 'n/a') + ' | ' + (c ? c.strike + ' / ' + c.expiry + ' / ' + f(c.delta) + ' / ' + f(c.costUSD, 0) + ' / ' + f(c.halfSpreadPct) : '-') + ' | ' + (b ? b.strike + ' ' + b.expiry + ' d' + f(b.delta) + ' ' + f(b.costUSD, 0) + ' USD' : '-') + ' | ' + (r.anyAffordable ? 'yes (' + r.nAffordable + ')' : 'no') + ' |'; }), ''];
fs.writeFileSync('data/options-spread-survey.md', md.join('\n'));
console.log(JSON.stringify(S, null, 1));
