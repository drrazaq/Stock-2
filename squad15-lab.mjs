// SQUAD 15 LAB (24 Oct 2026): calls on the large, liquid winners. LONG CALLS ONLY. Probe part (MODE=probe); the test itself follows.
import fs from 'node:fs';
const env = process.env, MODE = env.MODE || 'run', OUT = 'data/squad15-lab.json', CD = 'squad15-cache';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const AD = 'https://data.alpaca.markets', AT = 'https://paper-api.alpaca.markets';
const AH = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' } };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10), TODAY = iso(Date.now()), addDays = (d, n) => iso(Date.parse(d + 'T12:00:00Z') + n * 864e5);
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(CD, { recursive: true });
const PREV = J(OUT, {});
async function get(url) { try { const r = await fetch(url, AH), txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {} return { status: r.status, j, txt: txt.slice(0, 600), bytes: txt.length }; } catch (e) { return { status: 'ERR', txt: String(e.message).slice(0, 200) }; } }

if (MODE === 'probe') {
  if (!env.ALPACA_KEY) { console.log('no key'); process.exit(0); }
  const P = { at: new Date().toISOString() };
  // an active AAPL call about 200 days out (for the live endpoints) and expired ones (for history)
  const ct = await get(AT + '/v2/options/contracts?underlying_symbols=AAPL&type=call&expiration_date_gte=' + addDays(TODAY, 150) + '&expiration_date_lte=' + addDays(TODAY, 270) + '&limit=200');
  const list = (ct.j && ct.j.option_contracts) || []; P.contractsActive = { status: ct.status, n: list.length };
  const occ = list.length ? list.sort((a, b) => Math.abs(+a.strike_price - 250) - Math.abs(+b.strike_price - 250))[0].symbol : null; P.activeContract = occ;
  const OLD = 'AAPL250117C00200000';
  const sum = (r, key) => { const v = r.j && r.j[key]; let n = 0, first = null, last = null; if (v && typeof v === 'object') for (const a of Object.values(v)) if (Array.isArray(a)) { n += a.length; if (a.length) { first = first || a[0]; last = a[a.length - 1]; } }
    return { status: r.status, n, first, last, msg: r.j && r.j.message || (r.status !== 200 ? r.txt : undefined) }; };
  // 1. historical option QUOTES (bid/ask history): previously 404
  P.quotesHist = sum(await get(AD + '/v1beta1/options/quotes?symbols=' + OLD + '&start=2024-10-01T13:30:00Z&end=2024-10-01T14:00:00Z&limit=20'), 'quotes');
  P.quotesHistOpra = sum(await get(AD + '/v1beta1/options/quotes?symbols=' + OLD + '&start=2024-10-01T13:30:00Z&end=2024-10-01T14:00:00Z&limit=20&feed=opra'), 'quotes');
  P.quotesHistRecent = sum(await get(AD + '/v1beta1/options/quotes?symbols=' + (occ || OLD) + '&start=' + addDays(TODAY, -6) + 'T13:30:00Z&end=' + addDays(TODAY, -6) + 'T14:00:00Z&limit=20&feed=opra'), 'quotes');
  // 2. latest quotes and snapshots on the OPRA feed (previously only 'indicative')
  { const r = await get(AD + '/v1beta1/options/quotes/latest?symbols=' + (occ || OLD) + '&feed=opra'); P.latestQuoteOpra = { status: r.status, body: r.txt.slice(0, 300) }; }
  { const r = await get(AD + '/v1beta1/options/snapshots/AAPL?feed=opra&type=call&limit=3&expiration_date_gte=' + addDays(TODAY, 150) + '&expiration_date_lte=' + addDays(TODAY, 270));
    const s = r.j && r.j.snapshots ? Object.entries(r.j.snapshots)[0] : null; P.snapshotOpra = { status: r.status, sample: s ? { occ: s[0], keys: Object.keys(s[1]), quote: s[1].latestQuote, greeks: s[1].greeks || null, iv: s[1].impliedVolatility ?? null } : r.txt.slice(0, 300) }; }
  { const r = await get(AD + '/v1beta1/options/snapshots/AAPL?feed=indicative&type=call&limit=3&expiration_date_gte=' + addDays(TODAY, 150) + '&expiration_date_lte=' + addDays(TODAY, 270));
    const s = r.j && r.j.snapshots ? Object.entries(r.j.snapshots)[0] : null; P.snapshotIndicative = { status: r.status, sample: s ? { occ: s[0], quote: s[1].latestQuote, greeks: s[1].greeks || null } : r.txt.slice(0, 300) }; }
  // 3. option BARS: how far back (contracts that expired in 2023 and Jan 2024)
  for (const [k, sym, from, to] of [['bars2023', 'AAPL230616C00180000', '2022-06-01', '2023-06-16'], ['barsJan2024', 'AAPL240119C00190000', '2023-01-01', '2024-01-19'], ['barsJun2024', 'AAPL240621C00190000', '2023-06-01', '2024-06-21'], ['barsRecent', occ || OLD, addDays(TODAY, -10), TODAY]])
    P[k] = sum(await get(AD + '/v1beta1/options/bars?symbols=' + sym + '&timeframe=1Day&start=' + from + '&end=' + to + '&limit=1000'), 'bars');
  P.tradesHist = sum(await get(AD + '/v1beta1/options/trades?symbols=' + OLD + '&start=2024-10-01T13:30:00Z&end=2024-10-01T13:40:00Z&limit=5'), 'trades');
  // 4. SIP stock bars (old and to today)
  P.stockSipOld = sum(await get(AD + '/v2/stocks/bars?symbols=AAPL&timeframe=1Day&start=2016-01-01&end=2016-01-10&feed=sip&adjustment=raw'), 'bars');
  P.stockSipToday = sum(await get(AD + '/v2/stocks/bars?symbols=AAPL&timeframe=1Day&start=' + addDays(TODAY, -7) + '&end=' + TODAY + '&feed=sip&adjustment=raw'), 'bars');
  P.stockSipMinuteNow = sum(await get(AD + '/v2/stocks/bars?symbols=AAPL&timeframe=1Min&start=' + new Date(Date.now() - 30 * 60e3).toISOString() + '&feed=sip&limit=5'), 'bars');
  fs.writeFileSync(OUT, JSON.stringify({ ...PREV, probe: P }, null, 1));
  console.log(JSON.stringify(P, null, 1).slice(0, 6000)); process.exit(0);
}
console.log('squad15-lab: mode ' + MODE + ' not built yet');
