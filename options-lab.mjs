// OPTIONS LANE (owner, 23 Oct 2026: "check not only trading but options too, with the same mindset"). Probe stage: what historical
// option prices can this repo's keys actually get? Writes data/options-lab.json { coverage }. Network only; no orders, no Telegram.
import fs from 'node:fs';
const env = process.env, sleep = (ms) => new Promise(r => setTimeout(r, ms));
const AD = 'https://data.alpaca.markets', AT = 'https://paper-api.alpaca.markets', AV = 'https://www.alphavantage.co', MV = 'https://api.massive.com';
const AH = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' } };
async function get(url, opt) { try { const r = await fetch(url, opt); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {} return { status: r.status, j, txt: txt.slice(0, 400), bytes: txt.length }; } catch (e) { return { status: e.message }; } }
const out = { at: new Date().toISOString(), probe: {} }, P = out.probe;
// Alpaca: daily bars of a known old contract, the earliest date served, and whether expired contracts are listed
P.alpacaBarsOld = await get(AD + '/v1beta1/options/bars?symbols=AAPL240315C00170000&timeframe=1Day&start=2023-06-01&end=2024-03-16&limit=1000', AH);
if (P.alpacaBarsOld.j && P.alpacaBarsOld.j.bars) { const b = P.alpacaBarsOld.j.bars.AAPL240315C00170000 || []; P.alpacaBarsOld = { status: P.alpacaBarsOld.status, n: b.length, first: b[0], last: b[b.length - 1] }; }
P.alpacaBarsNear = await get(AD + '/v1beta1/options/bars?symbols=AAPL251017C00250000,WST251017C00300000&timeframe=1Day&start=2025-07-01&end=2025-10-18&limit=1000', AH);
if (P.alpacaBarsNear.j && P.alpacaBarsNear.j.bars) P.alpacaBarsNear = { status: P.alpacaBarsNear.status, counts: Object.fromEntries(Object.entries(P.alpacaBarsNear.j.bars).map(([k, v]) => [k, [v.length, v[0], v[v.length - 1]]])) };
P.alpacaContractsInactive = await get(AT + '/v2/options/contracts?underlying_symbols=WST&status=inactive&expiration_date_gte=2024-03-01&expiration_date_lte=2024-04-30&limit=50', AH);
if (P.alpacaContractsInactive.j) { const c = P.alpacaContractsInactive.j.option_contracts || []; P.alpacaContractsInactive = { status: P.alpacaContractsInactive.status, n: c.length, sample: c.slice(0, 2).map(x => [x.symbol, x.expiration_date, x.strike_price, x.open_interest, x.open_interest_date]) }; }
P.alpacaTrades = await get(AD + '/v1beta1/options/trades?symbols=AAPL251017C00250000&start=2025-10-01&end=2025-10-02&limit=3', AH);
P.alpacaQuotesHist = await get(AD + '/v1beta1/options/quotes?symbols=AAPL251017C00250000&start=2025-10-01&end=2025-10-02&limit=3', AH);
// Alpha Vantage: premium options history, the volume / open-interest ratio, the put/call ratio, and the daily allowance message
const avq = async (q) => { const r = await get(AV + '/query?' + q + '&apikey=' + encodeURIComponent(env.ALPHAVANTAGE_KEY || '')); await sleep(1200);
  const j = r.j; return { status: r.status, bytes: r.bytes, keys: j ? Object.keys(j).slice(0, 6) : null, info: j && (j.Information || j.Note || j['Error Message']) || null, rows: j && Array.isArray(j.data) ? j.data.length : null, first: j && Array.isArray(j.data) ? j.data.find(x => x.type === 'call') : null }; };
P.avHistOptions = await avq('function=HISTORICAL_OPTIONS&symbol=WST&date=2024-06-14');
P.avHistOptionsOld = await avq('function=HISTORICAL_OPTIONS&symbol=IBM&date=2021-03-12');
P.avVOI = await avq('function=HISTORICAL_VOLUME_OPEN_INTEREST_RATIO&symbol=WST&date=2024-06-14');
P.avPCR = await avq('function=HISTORICAL_PUT_CALL_RATIO&symbol=WST&date=2024-06-14');
// burst of 6 quick calls to see the per-minute limit message, if any
P.avBurst = []; for (let k = 0; k < 6; k++) { const r = await get(AV + '/query?function=HISTORICAL_OPTIONS&symbol=HQY&date=2025-0' + (k + 1) + '-15&apikey=' + encodeURIComponent(env.ALPHAVANTAGE_KEY || '')); P.avBurst.push([r.status, r.bytes, r.j && (r.j.Information || r.j.Note) || (r.j && Array.isArray(r.j.data) ? 'rows ' + r.j.data.length : r.txt.slice(0, 80))]); }
// Massive (formerly Polygon): option reference and aggregates
const mvq = async (p) => { const r = await get(MV + p + (p.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || '')); return { status: r.status, txt: r.txt.slice(0, 200) }; };
P.massiveContracts = await mvq('/v3/reference/options/contracts?underlying_ticker=WST&expired=true&expiration_date.lte=2024-04-30&limit=5');
P.massiveAggs = await mvq('/v2/aggs/ticker/O:AAPL240315C00170000/range/1/day/2024-01-02/2024-03-15');
fs.mkdirSync('data', { recursive: true });
const prev = (() => { try { return JSON.parse(fs.readFileSync('data/options-lab.json', 'utf8')); } catch (e) { return {}; } })();
fs.writeFileSync('data/options-lab.json', JSON.stringify({ ...prev, probe: out }, null, 1));
console.log(JSON.stringify(out, null, 1));
