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
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', TG = local(env.TG_BASE) || 'https://api.telegram.org';
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
top.sort((a, b) => b.score - a.score);
for (const c of top) {
  c.reasons = ['Price ' + pct(c.mom6) + ' in 6 months' + (c.mom12 !== null ? ', ' + pct(c.mom12) + ' in 12' : '') + ', ' + Math.round(c.offHigh * 100) + '% below its high',
    c.revGrowth === null ? 'Business data unavailable: this is price strength only, and it may be a fund rather than a company' : 'Revenue ' + pct(c.revGrowth) + ' against a year ago' + (c.revenue ? ' (' + usd(c.revenue) + ' in ' + c.quarter + ')' : ''), 'Profit: ' + c.profitTrend,
    c.mcap ? 'Company value about ' + usd(c.mcap) : 'Company value unknown', c.debtToCap !== null ? 'Long-term debt ' + Math.round(c.debtToCap * 100) + '% of company value' + (c.cashToCap !== null ? ', cash ' + Math.round(c.cashToCap * 100) + '%' : '') : c.debtToEquity !== null && c.debtToEquity !== undefined ? 'Debt is ' + Number(c.debtToEquity).toFixed(2) + ' times shareholder equity' : 'Debt ratio unknown'];
  if (c.insider) c.reasons.push('Insiders: ' + c.insider + ' over 3 months');
  if (c.price < 5) c.reasons.push('Under 5 USD: very high risk');
}

// ---- 4. Journal and honest follow-up: how did earlier candidates do against the S&P 500?
const journal = fs.existsSync('data/discovery-journal.jsonl') ? fs.readFileSync('data/discovery-journal.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const seen = new Set(journal.map(x => x.sym)), fresh = top.filter(c => !seen.has(c.sym));
for (const c of fresh) fs.appendFileSync('data/discovery-journal.jsonl', JSON.stringify({ sym: c.sym, d: first.date, price: c.price, spy: spyNow, score: c.score }) + '\n');
const aged = journal.filter(x => Date.parse(first.date) - Date.parse(x.d) >= 28 * 86400000 && closes[0].get(x.sym) && x.spy && spyNow).map(x => ({ ret: closes[0].get(x.sym).c / x.price - 1, spy: spyNow / x.spy - 1 }));
const record = aged.length ? { n: aged.length, avgReturn: aged.reduce((a, x) => a + x.ret, 0) / aged.length, avgSpy: aged.reduce((a, x) => a + x.spy, 0) / aged.length, beat: aged.filter(x => x.ret > x.spy).length / aged.length } : null;

fs.writeFileSync('data/discovery.json', JSON.stringify({ generatedAt: new Date(now).toISOString(), session: first.date, swept: closes[0].size, strong: strong.length, quarter: P, source, secNote, record, candidates: top }, null, 1));
console.log('discovery done:', top.length, 'candidates,', fresh.length, 'new');

if (fresh.length) {
  const msg = ['Discovery engine, ' + first.date, 'Swept ' + closes[0].size + ' US stocks. ' + strong.length + ' in strong uptrends, ' + top.length + (source === 'price only' ? ' listed on price strength only (no business data available).' : ' also have fast-growing revenue (' + source + ').'), '', 'NEW CANDIDATES (' + fresh.length + ')'];
  for (const c of fresh.slice(0, 10)) msg.push(c.sym + ' ' + c.name + ', ' + c.price.toFixed(2) + ' USD\n  ' + c.reasons.join('\n  '));
  if (record) msg.push('', 'Earlier candidates after 4+ weeks: ' + pct(record.avgReturn) + ' on average, S&P 500 ' + pct(record.avgSpy) + ' (' + record.n + ' stocks).');
  msg.push('', 'Candidates to research, not buy signals. Most fast movers fall back. Not financial advice, not a halal ruling.' + (env.PAGE_URL ? '\n' + env.PAGE_URL : ''));
  await telegram(msg.join('\n'));
}
