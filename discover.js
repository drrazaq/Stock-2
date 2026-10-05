// Discovery engine for the US stock signal board. Runs on GitHub Actions.
// Each night it sweeps the WHOLE US market for strong price trends, then checks the strongest against official SEC filings
// (revenue growth, profit trend, debt, cash) and writes a short list of small, fast-growing companies to data/discovery.json.
// It finds candidates to research. It does not give buy signals and cannot trade.
import fs from 'node:fs';

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
const TEST = local(env.MASSIVE_BASE), FAST = Boolean(TEST);
const PX_HOSTS = TEST ? [TEST] : ['https://api.massive.com', 'https://api.polygon.io'];
const SEC_WWW = local(env.SEC_BASE) || 'https://www.sec.gov', SEC_DATA = local(env.SEC_BASE) || 'https://data.sec.gov';
const CT = local(env.CT_BASE) || 'https://clinicaltrials.gov', AV = local(env.AV_BASE) || 'https://www.alphavantage.co';
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', TG = local(env.TG_BASE) || 'https://api.telegram.org', FMP = local(env.FMP_BASE) || 'https://financialmodelingprep.com';
const UA = env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com';
if (!env.MASSIVE_KEY) { console.error('Missing secret MASSIVE_KEY'); process.exit(1); }

const CFG = { MIN_PRICE: 1, MIN_DOLLAR_VOL: 2e6, MIN_MOM6: 0.40, MAX_OFF_HIGH: 0.20, MIN_REV: 5e6, MIN_REV_GROWTH: 0.25, MAX_MCAP: 10e9, CHECK_TOP: 250, KEEP: 25, MONTHS: 12 };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const pct = (x) => (x >= 0 ? '+' : '') + Math.round(x * 100) + '%';
const usd = (x) => x >= 1e9 ? (x / 1e9).toFixed(1) + ' billion USD' : Math.round(x / 1e6) + ' million USD';
fs.mkdirSync('data', { recursive: true });

// ---- 1. Whole-market prices: one call returns every US stock for one day (Massive, formerly Polygon, free plan: 5 calls a minute)
let host = 0, calls = 0;
async function grouped(date) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (calls && !FAST) await sleep(13000);
    calls++;
    let r;
    try { r = await fetch(PX_HOSTS[host] + '/v2/aggs/grouped/locale/us/market/stocks/' + date + '?adjusted=true&apiKey=' + encodeURIComponent(env.MASSIVE_KEY)); }
    catch (e) { if (host + 1 < PX_HOSTS.length) { host++; continue; } throw e; }
    if (r.status === 429) { await sleep(FAST ? 5 : 61000); continue; }
    if (r.status === 401) { console.error('The MASSIVE_KEY secret was rejected.'); process.exit(1); }
    if (r.status === 403) return [];                      // not available on this plan yet (for example today's data)
    if (r.status === 404 && host + 1 < PX_HOSTS.length) { host++; continue; }
    const j = await r.json().catch(() => ({}));
    return j.results || [];
  }
  return [];
}
// Walk back from a calendar date to the nearest day that has data (skips weekends and holidays).
async function sessionOnOrBefore(ms) {
  for (let k = 0; k < 7; k++) {
    const d = new Date(ms - k * 86400000), wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const rows = await grouped(iso(d.getTime()));
    if (rows.length > 500) return { date: iso(d.getTime()), rows };
  }
  return null;
}

let secNote = '';
async function sec(url) {
  await sleep(FAST ? 0 : 250);                            // SEC fair-use limit is 10 requests a second
  let r;
  try { r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }); } catch (e) { if (!secNote) { secNote = 'SEC request failed: ' + e.message; console.log(secNote); } return null; }
  if (!r.ok) { if (!secNote) { secNote = 'SEC answered HTTP ' + r.status + ' for ' + url.split('/').slice(-2).join('/') + ' (403 or 429 means the SEC is refusing this server; the Finnhub fallback is used instead)'; console.log(secNote); } return null; }
  return r.json().catch(() => null);
}
async function frame(taxonomy, tag, unit, period) {
  const j = await sec(SEC_DATA + '/api/xbrl/frames/' + taxonomy + '/' + tag + '/' + unit + '/' + period + '.json'), m = new Map();
  for (const x of (j && j.data) || []) m.set(x.cik, x.val);
  return m;
}
async function telegram(text) {
  if (!env.TG_TOKEN || !env.TG_CHAT) { console.log('[no Telegram secrets, message not sent]\n' + text); return; }
  for (let i = 0; i < text.length; i += 3800) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(i, i + 3800), disable_web_page_preview: true }) });
}

// ---- sweep
const now = Date.now(), samples = [];
const first = await sessionOnOrBefore(now);
if (!first) { console.error('No market data returned. Check the MASSIVE_KEY secret.'); process.exit(1); }
samples.push(first);
const prev = readJson('data/discovery.json', null);
if (prev && prev.session === first.date && !env.FORCE) { console.log('No new session since ' + first.date + '. Nothing to do.'); process.exit(0); }
for (let k = 1; k <= CFG.MONTHS; k++) { const s = await sessionOnOrBefore(Date.parse(first.date) - k * 30.44 * 86400000); if (!s) break; samples.push(s); }
console.log('price samples:', samples.map(s => s.date).join(' '));

const closes = samples.map(s => new Map(s.rows.map(r => [r.T, r])));
const spyNow = closes[0].get('SPY') ? closes[0].get('SPY').c : null;
const strong = [];
for (const [sym, r0] of closes[0]) {
  if (!/^[A-Z]{1,5}$/.test(sym)) continue;
  const c = closes.map(m => m.get(sym) ? m.get(sym).c : null);
  if (!(c[0] >= CFG.MIN_PRICE) || !c[3] || !c[6]) continue;
  const dv = closes.slice(0, 4).map(m => m.get(sym)).filter(Boolean).map(r => r.c * r.v).sort((a, b) => a - b), dollarVol = dv[Math.floor(dv.length / 2)];
  const hi = Math.max(...c.filter(Boolean)), mom6 = c[0] / c[6] - 1, mom3 = c[0] / c[3] - 1, mom12 = c[12] ? c[0] / c[12] - 1 : null, offHigh = 1 - c[0] / hi;
  if (dollarVol < CFG.MIN_DOLLAR_VOL || mom6 < CFG.MIN_MOM6 || mom3 <= 0 || offHigh > CFG.MAX_OFF_HIGH) continue;
  strong.push({ sym, price: r0.c, mom3, mom6, mom12, offHigh, dollarVol });
}
strong.sort((a, b) => b.mom6 - a.mom6);
console.log('market swept:', closes[0].size, 'tickers,', strong.length, 'in strong uptrends');

// ---- 2. Official filings (SEC EDGAR, free). One request returns one number for every company.
const tickers = await sec(SEC_WWW + '/files/company_tickers.json') || {}, cikOf = new Map(), nameOf = new Map();
for (const k in tickers) { const t = tickers[k]; if (!cikOf.has(t.ticker)) { cikOf.set(t.ticker, t.cik_str); nameOf.set(t.ticker, t.title); } }
const qd = new Date(now - 75 * 86400000), qy = qd.getUTCFullYear(), qq = Math.floor(qd.getUTCMonth() / 3);   // latest quarter that ended at least 75 days ago
const y = qq === 0 ? qy - 1 : qy, q = qq === 0 ? 4 : qq, P = 'CY' + y + 'Q' + q, P0 = 'CY' + (y - 1) + 'Q' + q;
const merge = (...maps) => { const out = new Map(); for (const m of maps) for (const [k, v] of m) if (!out.has(k)) out.set(k, v); return out; };
const REV = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTaxes', 'SalesRevenueNet'];
const revNow = merge(...await Promise.all(REV.map(t => frame('us-gaap', t, 'USD', P)))), revPrev = merge(...await Promise.all(REV.map(t => frame('us-gaap', t, 'USD', P0))));
const niNow = await frame('us-gaap', 'NetIncomeLoss', 'USD', P), niPrev = await frame('us-gaap', 'NetIncomeLoss', 'USD', P0);
const debt = merge(await frame('us-gaap', 'LongTermDebt', 'USD', P + 'I'), await frame('us-gaap', 'LongTermDebtNoncurrent', 'USD', P + 'I'));
const cash = merge(await frame('us-gaap', 'CashAndCashEquivalentsAtCarryingValue', 'USD', P + 'I'), await frame('us-gaap', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'USD', P + 'I'));
const shares = merge(await frame('dei', 'EntityCommonStockSharesOutstanding', 'shares', P + 'I'), await frame('us-gaap', 'CommonStockSharesOutstanding', 'shares', P + 'I'));
console.log('filings for', P, 'vs', P0, ': revenue', revNow.size, 'companies, shares', shares.size);

const found = [];
for (const s of strong.slice(0, CFG.CHECK_TOP)) {
  const cik = cikOf.get(s.sym); if (!cik) continue;
  const r1 = revNow.get(cik), r0 = revPrev.get(cik); if (!(r1 >= CFG.MIN_REV) || !(r0 > 1e6)) continue;
  const revGrowth = r1 / r0 - 1; if (revGrowth < CFG.MIN_REV_GROWTH) continue;
  const sh = shares.get(cik), mcap = sh ? sh * s.price : null; if (mcap !== null && mcap > CFG.MAX_MCAP) continue;
  const n1 = niNow.get(cik), n0 = niPrev.get(cik), d = debt.get(cik), ca = cash.get(cik);
  const c = { ...s, name: nameOf.get(s.sym) || '', quarter: P, revenue: r1, revGrowth, netIncome: n1 ?? null, netIncomePrev: n0 ?? null, mcap,
    debtToCap: mcap && d !== undefined ? d / mcap : null, cashToCap: mcap && ca !== undefined ? ca / mcap : null, insider: null };
  c.profitTrend = n1 === undefined || n0 === undefined ? 'unknown' : n1 > 0 && n0 <= 0 ? 'turned profitable' : n1 > 0 ? (n1 > n0 ? 'profitable and growing' : 'profitable') : n1 > n0 ? 'losing less' : 'losing more';
  c.score = Math.round(100 * Math.min(s.mom6, 3) + 100 * Math.min(revGrowth, 2) + (c.profitTrend === 'turned profitable' || c.profitTrend === 'profitable and growing' ? 25 : c.profitTrend === 'losing more' ? -25 : 0) - 100 * s.offHigh);
  found.push(c);
}
// ---- 2b. Fallback when the SEC returns nothing: Finnhub's summary numbers for each strong stock (needs the FINNHUB_KEY secret)
let source = 'SEC filings';
if (!revNow.size && env.FINNHUB_KEY) {
  source = 'Finnhub summary data';
  console.log('using Finnhub fallback for', Math.min(strong.length, 150), 'stocks');
  for (const s of strong.slice(0, 150)) {
    await sleep(FAST ? 0 : 1100);
    let m;
    try { const r = await fetch(FH + '/stock/metric?symbol=' + s.sym + '&metric=all&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (r.status === 429) { await sleep(FAST ? 5 : 30000); continue; } if (!r.ok) continue; m = (await r.json()).metric; } catch (e) { continue; }
    if (!m) continue;
    const g = m.revenueGrowthQuarterlyYoy ?? m.revenueGrowthTTMYoy; if (g === null || g === undefined) continue;
    const revGrowth = g / 100; if (revGrowth < CFG.MIN_REV_GROWTH) continue;
    const mcap = m.marketCapitalization ? m.marketCapitalization * 1e6 : null; if (mcap !== null && mcap > CFG.MAX_MCAP) continue;
    const margin = m.netProfitMarginTTM ?? m.netProfitMarginAnnual, de = m['totalDebt/totalEquityQuarterly'] ?? m['totalDebt/totalEquityAnnual'];
    const c = { ...s, name: nameOf.get(s.sym) || '', quarter: 'latest', revenue: null, revGrowth, netIncome: null, netIncomePrev: null, mcap, debtToCap: null, cashToCap: null, debtToEquity: de ?? null, insider: null,
      profitTrend: margin === null || margin === undefined ? 'unknown' : margin > 0 ? 'profitable' : 'losing money' };
    c.score = Math.round(100 * Math.min(s.mom6, 3) + 100 * Math.min(revGrowth, 2) + (c.profitTrend === 'profitable' ? 25 : 0) - 100 * s.offHigh);
    found.push(c);
  }
}
// ---- 2c. Last resort: no business data at all. List the strongest prices and say so plainly.
if (!found.length && !revNow.size && !env.FINNHUB_KEY) {
  source = 'price only';
  for (const s of strong.filter(x => x.price >= 5).slice(0, CFG.KEEP)) found.push({ ...s, name: nameOf.get(s.sym) || '', quarter: '', revenue: null, revGrowth: null, netIncome: null, netIncomePrev: null, mcap: null, debtToCap: null, cashToCap: null, insider: null, profitTrend: 'unknown', score: Math.round(100 * Math.min(s.mom6, 3) - 100 * s.offHigh) });
}
console.log('business data source:', source, '-', found.length, 'passed');
found.sort((a, b) => b.score - a.score);
const top = found.slice(0, CFG.KEEP);

// ---- 3. Insider activity for the finalists (optional, needs the FINNHUB_KEY secret)
if (env.FINNHUB_KEY) for (const c of top) {
  try { const r = await fetch(FH + '/stock/insider-sentiment?symbol=' + c.sym + '&from=' + iso(now - 120 * 86400000) + '&to=' + iso(now) + '&token=' + encodeURIComponent(env.FINNHUB_KEY));
    if (r.ok) { const j = await r.json(), mth = (j.data || []).slice(-3); if (mth.length) { const a = mth.reduce((x, k) => x + (k.mspr || 0), 0) / mth.length; c.insider = a > 10 ? 'net buying' : a < -10 ? 'net selling' : 'balanced'; if (a > 10) c.score += 15; } } } catch (e) {}
  await sleep(FAST ? 0 : 1100);
}
// ---- 3b. Deeper dig on the finalists with Financial Modeling Prep (optional, needs the FMP_KEY secret).
// Annual statements: multi-year revenue path, free cash flow, debt and cash against company value, share dilution, and fund detection.
let fmpNote = '';
if (env.FMP_KEY) {
  const get = async (pathname, sym, limit) => {
    const r = await fetch(FMP + pathname + '?symbol=' + sym + (limit ? '&limit=' + limit : '') + '&apikey=' + encodeURIComponent(env.FMP_KEY));
    if (r.status === 401 || r.status === 429) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    if (!r.ok) {   // 402/403: this part is not on the plan. Note FMP's own explanation once, then carry on with the other parts.
      const part = pathname.split('/').pop();
      if (!denied[part]) { denied[part] = r.status; const body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220); console.log('FMP refused ' + part + ' for ' + sym + ' with HTTP ' + r.status + ': ' + body); }
      return [];
    }
    const j = await r.json(); return Array.isArray(j) ? j : [];
  };
  const denied = {};
  const num = (o, ...keys) => { for (const k of keys) if (o && typeof o[k] === 'number') return o[k]; return null; };
  let done = 0, probe = 0, keysLogged = false;
  for (const c of top) {
    try {
      if (probe < 3) { delete denied['tipranks-ratings-symbol']; delete denied['income-statement']; delete denied['balance-sheet-statement']; delete denied['cash-flow-statement']; delete denied['profile']; probe++; }   // the first three stocks each get a full try
      const skip = (part) => probe >= 3 && denied[part];
      const inc = skip('income-statement') ? [] : await get('/stable/income-statement', c.sym, 4); await sleep(FAST ? 0 : 350);
      const bal = skip('balance-sheet-statement') ? [] : await get('/stable/balance-sheet-statement', c.sym, 1); await sleep(FAST ? 0 : 350);
      const cf = skip('cash-flow-statement') ? [] : await get('/stable/cash-flow-statement', c.sym, 1); await sleep(FAST ? 0 : 350);
      const prof = skip('profile') ? [] : await get('/stable/profile', c.sym); await sleep(FAST ? 0 : 350);
      const ar = skip('tipranks-ratings-symbol') ? [] : await get('/stable/tipranks-ratings-symbol', c.sym); await sleep(FAST ? 0 : 350);
      if (ar.length) {   // analyst evidence from the FMP x TipRanks dataset. Field names are read tolerantly; only key names are ever logged.
        const o = ar[0], f = (re) => { for (const [k, v] of Object.entries(o)) if (re.test(k) && typeof v === 'number') return v; return null; };
        if (!keysLogged) { keysLogged = true; console.log('FMP x TipRanks fields:', Object.keys(o).slice(0, 25).join(', ')); }
        const buy = f(/buy/i), hold = f(/hold/i), sell = f(/sell/i), tgt = f(/target/i), n = (buy || 0) + (hold || 0) + (sell || 0);
        if (n > 0) c.analyst = (buy / n >= 0.6 ? 'supportive' : buy / n < 0.4 ? 'weak' : 'mixed') + ', ' + n + ' analysts (' + (buy || 0) + ' buy, ' + (hold || 0) + ' hold, ' + (sell || 0) + ' sell)' + (tgt ? ', average target ' + tgt.toFixed(2) : '');
      }
      if (!inc.length && !bal.length && !cf.length && !prof.length && !ar.length) continue;
      const p0 = prof[0] || {}, deep = {};
      if (p0.isEtf === true || p0.isFund === true) { c.drop = true; continue; }
      const mc = c.mcap || num(p0, 'marketCap', 'mktCap');   // FMP's figure is used for the sums below, never published
      if (p0.companyName && !c.name) c.name = String(p0.companyName).slice(0, 60);
      if (p0.industry) deep.industry = String(p0.industry).slice(0, 50);
      const revs = inc.map(x => num(x, 'revenue')).filter(x => x !== null);            // newest first
      if (revs.length >= 3) deep.revUpYears = revs[0] > revs[1] && revs[1] > revs[2] ? 2 : revs[0] > revs[1] ? 1 : 0;
      const sh = inc.map(x => num(x, 'weightedAverageShsOutDil', 'weightedAverageShsOut')).filter(Boolean);
      if (sh.length >= 2) deep.dilution = sh[0] / sh[1] - 1;
      const fcf = num(cf[0], 'freeCashFlow'); if (fcf !== null) deep.fcfPositive = fcf > 0;
      const debt = num(bal[0], 'totalDebt'), cash = num(bal[0], 'cashAndShortTermInvestments', 'cashAndCashEquivalents');
      if (mc && debt !== null) deep.debtToCap = debt / mc;
      if (mc && cash !== null) deep.cashToCap = cash / mc;
      c.deep = deep; done++;
      c.score += (deep.fcfPositive ? 15 : 0) + (deep.revUpYears === 2 ? 10 : 0) - (deep.dilution > 0.2 ? 20 : 0) - (deep.debtToCap !== undefined && deep.debtToCap > 0.33 ? 15 : 0);
    } catch (e) {
      if (e.status === 401) { fmpNote = 'FMP answered HTTP 401: the FMP_KEY secret is wrong.'; break; }
      if (e.status === 429) { fmpNote = 'FMP daily limit reached after ' + done + ' stocks.'; break; }
    }
  }
  if (!done && !fmpNote) fmpNote = 'FMP has none of this data on your plan for these stocks.';
  console.log('FMP deep dig:', done, 'of', top.length, 'finalists', fmpNote ? '- ' + fmpNote : '', Object.keys(denied).length ? '| refused parts: ' + Object.keys(denied).join(', ') : '');
  if (done) source += ' + FMP statements';
}
// ---- 3b-2. Alpha Vantage statements for the leading finalists (optional, free key, 25 requests a day: 8 companies x 3 statements).
// Fills what FMP's free plan refuses for small companies: multi-year revenue, free cash flow, debt and cash, share dilution.
if (env.ALPHAVANTAGE_KEY) {
  const n0 = (x) => x === undefined || x === null || x === 'None' || x === '' ? null : +x, need = top.filter(c => !c.drop && !(c.deep && c.deep.fcfPositive !== undefined)).sort((a, b) => b.score - a.score).slice(0, 8);
  let got = 0, stop = '';
  const av = async (fn, sym) => { await sleep(FAST ? 0 : 13000); const r = await fetch(AV + '/query?function=' + fn + '&symbol=' + sym + '&apikey=' + encodeURIComponent(env.ALPHAVANTAGE_KEY)); const j = await r.json().catch(() => ({})); if (j.Information || j.Note) { stop = String(j.Information || j.Note).slice(0, 120); return null; } return j.annualReports || []; };
  for (const c of need) {
    try {
      const inc = await av('INCOME_STATEMENT', c.sym); if (stop) break; const bal = await av('BALANCE_SHEET', c.sym); if (stop) break; const cf = await av('CASH_FLOW', c.sym); if (stop) break;
      if (!inc.length && !bal.length && !cf.length) continue;
      const deep = c.deep || (c.deep = {}), revs = inc.map(x => n0(x.totalRevenue)).filter(x => x !== null), sh = bal.map(x => n0(x.commonStockSharesOutstanding)).filter(Boolean);
      if (revs.length >= 3) deep.revUpYears = revs[0] > revs[1] && revs[1] > revs[2] ? 2 : revs[0] > revs[1] ? 1 : 0;
      if (sh.length >= 2) deep.dilution = sh[0] / sh[1] - 1;
      const ocf = n0((cf[0] || {}).operatingCashflow), capex = n0((cf[0] || {}).capitalExpenditures); if (ocf !== null) deep.fcfPositive = ocf - Math.abs(capex || 0) > 0;
      const b0 = bal[0] || {}, debt = n0(b0.shortLongTermDebtTotal) ?? n0(b0.longTermDebt), cash = n0(b0.cashAndShortTermInvestments) ?? n0(b0.cashAndCashEquivalentsAtCarryingValue);
      if (c.mcap && debt !== null) deep.debtToCap = debt / c.mcap; if (c.mcap && cash !== null) deep.cashToCap = cash / c.mcap;
      c.score += (deep.fcfPositive ? 15 : 0) + (deep.revUpYears === 2 ? 10 : 0) - (deep.dilution > 0.2 ? 20 : 0) - (deep.debtToCap !== undefined && deep.debtToCap > 0.33 ? 15 : 0); got++;
    } catch (e) {}
  }
  console.log('Alpha Vantage deep dig:', got, 'of', need.length, 'leading finalists', stop ? '- stopped: ' + stop : '');
  if (got) source += ' + Alpha Vantage statements';
}
for (let k = top.length - 1; k >= 0; k--) if (top[k].drop) top.splice(k, 1);

// ---- 3c. Biotech radar (ClinicalTrials.gov, free and public). One trial result can gap a biotech stock 50% overnight, so a
// late-stage result that is due soon blocks the candidate. If the trial data cannot be checked, it is treated as blocked too.
const BIO = /biotech|pharma|drug|life science|therapeut/i, ACTIVE = new Set(['RECRUITING', 'ACTIVE_NOT_RECRUITING', 'ENROLLING_BY_INVITATION', 'NOT_YET_RECRUITING']);
const cleanName = (n) => String(n || '').replace(/[,.]/g, ' ').replace(/\b(inc|incorporated|corp|corporation|ltd|limited|plc|holdings?|co|company|sa|nv|ag|common stock|class [a-z])\b/gi, ' ').replace(/\s+/g, ' ').trim();
let bioChecked = 0;
for (const c of top) {
  let industry = '', name = c.name;
  if (env.FINNHUB_KEY) { try { const r = await fetch(FH + '/stock/profile2?symbol=' + c.sym + '&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (r.ok) { const j = await r.json(); industry = j.finnhubIndustry || ''; name = name || j.name || ''; if (!c.name && j.name) c.name = String(j.name).slice(0, 60); if (industry) c.industry = String(industry).slice(0, 40); } } catch (e) {} await sleep(FAST ? 0 : 1100); }
  if (!BIO.test(industry) && !(c.deep && BIO.test(c.deep.industry || ''))) continue;
  c.bio = { risk: 'unknown', text: 'Trial data could not be checked, so it is treated as blocked.' };
  const sponsor = cleanName(name); if (sponsor.length < 3) continue;
  try {
    const r = await fetch(CT + '/api/v2/studies?query.spons=' + encodeURIComponent(sponsor) + '&pageSize=100&format=json', { headers: { Accept: 'application/json' } });
    if (!r.ok) { console.log('ClinicalTrials.gov answered HTTP ' + r.status + ' for one sponsor'); continue; }
    const first = sponsor.split(' ')[0].toLowerCase(), list = [];
    for (const st of ((await r.json()).studies || [])) {
      const ps = st.protocolSection || {}, sm = ps.statusModule || {}, lead = (((ps.sponsorCollaboratorsModule || {}).leadSponsor || {}).name || '').toLowerCase();
      if (!lead.includes(first) || !ACTIVE.has(sm.overallStatus)) continue;
      const phases = ((ps.designModule || {}).phases || []).join('/'), d = (sm.primaryCompletionDateStruct || {}).date || '';
      list.push({ id: (ps.identificationModule || {}).nctId || '', title: String((ps.identificationModule || {}).briefTitle || '').slice(0, 90), phases, late: /PHASE2|PHASE3/.test(phases), when: d ? Date.parse(d.length === 7 ? d + '-15' : d) : null, date: d });
    }
    const late = list.filter(x => x.late), soon = late.filter(x => x.when && x.when > now - 60 * 86400000 && x.when < now + 120 * 86400000).sort((a, b) => a.when - b.when), next = late.filter(x => x.when && x.when >= now + 120 * 86400000).sort((a, b) => a.when - b.when)[0];
    bioChecked++;
    if (soon.length) c.bio = { risk: 'high', trials: list.length, late: late.length, text: 'A late-stage trial result is due around ' + soon[0].date + ' (' + soon[0].phases.replace(/PHASE/g, 'phase ') + ', ' + soon[0].id + ': ' + soon[0].title + '). Blocked until it has passed.' };
    else if (late.length) c.bio = { risk: 'elevated', trials: list.length, late: late.length, text: late.length + ' late-stage trial' + (late.length > 1 ? 's' : '') + ' running, none due within four months' + (next ? '. Next expected around ' + next.date : '') + '.' };
    else if (list.length) c.bio = { risk: 'low', trials: list.length, late: 0, text: list.length + ' early-stage trial' + (list.length > 1 ? 's' : '') + ' running, none late-stage.' };
    else c.bio = { risk: 'unknown', trials: 0, late: 0, text: 'No trials were found under this company name, which for a drug developer usually means the name did not match. Treated as blocked until checked by hand.' };
  } catch (e) { console.log('ClinicalTrials.gov request failed: ' + e.message); }
  await sleep(FAST ? 0 : 400);
}
for (const c of top) if (c.bio) c.score -= c.bio.risk === 'high' ? 40 : c.bio.risk === 'unknown' ? 20 : 0;
console.log('biotech radar:', top.filter(c => c.bio).length, 'biotech finalists,', bioChecked, 'checked,', top.filter(c => c.bio && (c.bio.risk === 'high' || c.bio.risk === 'unknown')).length, 'blocked');
top.sort((a, b) => b.score - a.score);
for (const c of top) {
  c.reasons = ['Price ' + pct(c.mom6) + ' in 6 months' + (c.mom12 !== null ? ', ' + pct(c.mom12) + ' in 12' : '') + ', ' + Math.round(c.offHigh * 100) + '% below its high',
    c.revGrowth === null ? 'Business data unavailable: this is price strength only, and it may be a fund rather than a company' : 'Revenue ' + pct(c.revGrowth) + ' against a year ago' + (c.revenue ? ' (' + usd(c.revenue) + ' in ' + c.quarter + ')' : ''), 'Profit: ' + c.profitTrend,
    c.mcap ? 'Company value about ' + usd(c.mcap) : 'Company value unknown', c.debtToCap !== null ? 'Debt ' + Math.round(c.debtToCap * 100) + '% of company value' + (c.cashToCap !== null ? ', cash ' + Math.round(c.cashToCap * 100) + '%' : '') : c.debtToEquity !== null && c.debtToEquity !== undefined ? 'Debt is ' + Number(c.debtToEquity).toFixed(2) + ' times shareholder equity' : 'Debt ratio unknown'];
  c.privateNotes = [];
  if (c.analyst) c.privateNotes.push('Analyst evidence: ' + c.analyst + ' (FMP x TipRanks). Evidence, not a signal');
  if (c.deep) {
    const d = c.deep, R0 = c.reasons; c.reasons = c.privateNotes;   // everything in this block comes from FMP: Telegram only
    if (d.industry && !c.industry) c.reasons.push('Industry: ' + d.industry);
    if (d.debtToCap !== undefined) c.reasons.push('Total debt ' + Math.round(d.debtToCap * 100) + '% of company value' + (d.cashToCap !== undefined ? ', cash ' + Math.round(d.cashToCap * 100) + '%' : '') + '. Shariah screens commonly cap debt near one third; pre-screen only');
    if (d.revUpYears !== undefined) c.reasons.push(d.revUpYears === 2 ? 'Yearly revenue rose in each of the last two years' : d.revUpYears === 1 ? 'Yearly revenue rose last year but not the year before' : 'Yearly revenue did not rise last year');
    if (d.fcfPositive !== undefined) c.reasons.push(d.fcfPositive ? 'Free cash flow is positive: the business funds itself' : 'Free cash flow is negative: it burns cash and may need to raise money');
    if (d.dilution !== undefined && d.dilution > 0.05) c.reasons.push('Share count rose ' + Math.round(d.dilution * 100) + '% in a year: existing holders are being diluted');
    c.reasons = R0;
  }
  if (c.insider) c.reasons.push('Insiders: ' + c.insider + ' over 3 months');
  if (c.industry) c.reasons.push('Industry: ' + c.industry);
  if (c.bio) c.reasons.push((c.bio.risk === 'high' ? 'BINARY EVENT RISK HIGH. ' : c.bio.risk === 'unknown' ? 'BINARY EVENT RISK UNKNOWN. ' : 'Trial check: ') + c.bio.text + ' (ClinicalTrials.gov)');
  if (c.price < 5) c.reasons.push('Under 5 USD: very high risk');
}

// ---- 4. Journal and honest follow-up: how did earlier candidates do against the S&P 500?
const journal = fs.existsSync('data/discovery-journal.jsonl') ? fs.readFileSync('data/discovery-journal.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const seen = new Set(journal.map(x => x.sym)), fresh = top.filter(c => !seen.has(c.sym));
for (const c of fresh) fs.appendFileSync('data/discovery-journal.jsonl', JSON.stringify({ sym: c.sym, d: first.date, price: c.price, spy: spyNow, score: c.score }) + '\n');
const aged = journal.filter(x => Date.parse(first.date) - Date.parse(x.d) >= 28 * 86400000 && closes[0].get(x.sym) && x.spy && spyNow).map(x => ({ ret: closes[0].get(x.sym).c / x.price - 1, spy: spyNow / x.spy - 1 }));
const record = aged.length ? { n: aged.length, avgReturn: aged.reduce((a, x) => a + x.ret, 0) / aged.length, avgSpy: aged.reduce((a, x) => a + x.spy, 0) / aged.length, beat: aged.filter(x => x.ret > x.spy).length / aged.length } : null;

// The public file carries only what came from the price sweep and Finnhub. FMP and TipRanks material goes to Telegram only,
// because their terms do not allow displaying it on a public page.
const pub = top.map(({ privateNotes, deep, analyst, ...c }) => c);
fs.writeFileSync('data/discovery.json', JSON.stringify({ generatedAt: new Date(now).toISOString(), session: first.date, swept: closes[0].size, strong: strong.length, quarter: P, source: source.replace(' + FMP statements', '').replace(' + Alpha Vantage statements', ''), secNote, record, candidates: pub }, null, 1));
console.log('discovery done:', top.length, 'candidates,', fresh.length, 'new');

if (fresh.length) {
  const msg = ['Discovery engine, ' + first.date, 'Swept ' + closes[0].size + ' US stocks. ' + strong.length + ' in strong uptrends, ' + top.length + (source === 'price only' ? ' listed on price strength only (no business data available).' : ' also have fast-growing revenue (' + source + ').'), '', 'NEW CANDIDATES (' + fresh.length + ')'];
  for (const c of fresh.slice(0, 10)) msg.push(c.sym + ' ' + c.name + ', ' + c.price.toFixed(2) + ' USD\n  ' + [...c.reasons, ...(c.privateNotes || [])].join('\n  '));
  if (record) msg.push('', 'Earlier candidates after 4+ weeks: ' + pct(record.avgReturn) + ' on average, S&P 500 ' + pct(record.avgSpy) + ' (' + record.n + ' stocks).');
  msg.push('', 'Candidates to research, not buy signals. Most fast movers fall back. Not financial advice, not a halal ruling.' + (env.PAGE_URL ? '\n' + env.PAGE_URL : ''));
  await telegram(msg.join('\n'));
}
