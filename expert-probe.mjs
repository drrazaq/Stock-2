// EXPERT LAB PROBE (23 Oct 2026). Which official / licensed endpoints for ranked experts does each key reach on its plan?
// Writes data/expert-probe.json: per endpoint the HTTP status, the row count, the FIELD NAMES and the date range only (never
// values, never a key). TipRanks: tools/list only (the tool NAMES); no tool is called, so no monthly quota is used. Alpha Vantage:
// ONE call (25 a day are shared with the other jobs). Never places an order.
import fs from 'node:fs';
const env = process.env, out = { at: new Date().toISOString(), keys: {}, endpoints: {} };
for (const k of ['FMP_KEY', 'FINNHUB_KEY', 'ALPHAVANTAGE_KEY', 'TIPRANKS_KEY', 'SEC_UA', 'ETORO_KEY', 'ETORO_USER_KEY', 'OPENFIGI_KEY']) out.keys[k] = !!env[k];
const dates = (rows) => { const d = []; for (const r of rows) for (const [k, v] of Object.entries(r || {})) if (/date|time|filed|published/i.test(k) && typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v)) d.push(v.slice(0, 10)); d.sort(); return d.length ? [d[0], d[d.length - 1]] : null; };
const shapeOf = (j) => { const rows = Array.isArray(j) ? j : j && typeof j === 'object' ? (Object.values(j).find(Array.isArray) || []) : [];
  return { rows: rows.length, fields: rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]).slice(0, 30) : j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j).slice(0, 20) : [], range: dates(rows) }; };
async function probe(name, url, opt = {}) { try { const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(45000) }); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {}
    out.endpoints[name] = { status: r.status, ...(j ? shapeOf(j) : { text: txt.length }), note: j && !Array.isArray(j) && (j['Error Message'] || j.error || j.Information || j.Note || j.message) ? String(j['Error Message'] || j.error || j.Information || j.Note || j.message).replace(/[A-Za-z0-9]{24,}/g, '*').slice(0, 200) : undefined }; }
  catch (e) { out.endpoints[name] = { error: String(e.message).slice(0, 120) }; } }
const FMP = 'https://financialmodelingprep.com', fk = encodeURIComponent(env.FMP_KEY || '');
if (env.FMP_KEY && !env.PROBE2) for (const [n, p] of [['fmp grades', '/stable/grades?symbol=AAPL'], ['fmp grades-historical', '/stable/grades-historical?symbol=AAPL'], ['fmp grades-latest-news', '/stable/grades-latest-news?page=0&limit=5'],
  ['fmp grades-news', '/stable/grades-news?symbol=AAPL&page=0&limit=5'], ['fmp price-target-news', '/stable/price-target-news?symbol=AAPL&page=0&limit=5'], ['fmp price-target-latest-news', '/stable/price-target-latest-news?page=0&limit=5'],
  ['fmp price-target-summary', '/stable/price-target-summary?symbol=AAPL'], ['fmp senate-trades', '/stable/senate-trades?symbol=AAPL'], ['fmp house-trades', '/stable/house-trades?symbol=AAPL'], ['fmp senate-latest', '/stable/senate-latest?page=0&limit=5'],
  ['fmp house-latest', '/stable/house-latest?page=0&limit=5'], ['fmp institutional-holder-list', '/stable/institutional-ownership/latest?page=0&limit=5'], ['fmp insider-trading-search', '/stable/insider-trading/search?page=0&limit=5'],
  ['fmp v3 upgrades-downgrades', '/api/v4/upgrades-downgrades?symbol=AAPL'], ['fmp v4 price-target', '/api/v4/price-target?symbol=AAPL']]) await probe(n, FMP + p + (p.includes('?') ? '&' : '?') + 'apikey=' + fk);
if (env.FMP_KEY && env.PROBE2) { out.endpoints = {}; for (const ep of ['house-latest', 'senate-latest', 'price-target-latest-news', 'grades-latest-news']) for (const pg of [0, 5, 20, 50, 100, 200]) await probe('fmp ' + ep + ' page ' + pg + ' limit 100', FMP + '/stable/' + ep + '?page=' + pg + '&limit=100&apikey=' + fk);
  for (const s of ['SOFI', 'IONQ', 'CELH']) await probe('fmp grades ' + s, FMP + '/stable/grades?symbol=' + s + '&apikey=' + fk); }
const FH = 'https://finnhub.io/api/v1', hk = encodeURIComponent(env.FINNHUB_KEY || '');
if (env.FINNHUB_KEY && !env.PROBE2) for (const [n, p] of [['finnhub upgrade-downgrade', '/stock/upgrade-downgrade?symbol=AAPL&from=2020-01-01'], ['finnhub price-target', '/stock/price-target?symbol=AAPL'], ['finnhub recommendation', '/stock/recommendation?symbol=AAPL'],
  ['finnhub congressional-trading', '/stock/congressional-trading?symbol=AAPL&from=2020-01-01&to=2026-10-23'], ['finnhub insider-transactions', '/stock/insider-transactions?symbol=AAPL'], ['finnhub institutional-ownership', '/institutional/ownership?symbol=AAPL&cusip=&from=2024-01-01&to=2024-06-30']]) { await probe(n, FH + p + '&token=' + hk); await new Promise(r => setTimeout(r, 1100)); }
if (env.ALPHAVANTAGE_KEY && !env.PROBE2) await probe('alphavantage CONGRESS_TRADES symbol', 'https://www.alphavantage.co/query?function=CONGRESS_TRADES&symbol=NVDA&apikey=' + encodeURIComponent(env.ALPHAVANTAGE_KEY));
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com';
if (!env.PROBE2) await probe('sec 13f data sets page', 'https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets', { headers: { 'User-Agent': UA } });
try { const r = await fetch('https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets', { headers: { 'User-Agent': UA } }); const t = await r.text(); out.sec13fZips = [...new Set([...t.matchAll(/href="([^"]*13f[^"]*\.zip)"/gi)].map(m => m[1]))].slice(0, 80); } catch (e) {}
if (!env.PROBE2) await probe('openfigi mapping', 'https://api.openfigi.com/v3/mapping', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.OPENFIGI_KEY ? { 'X-OPENFIGI-APIKEY': env.OPENFIGI_KEY } : {}) }, body: JSON.stringify([{ idType: 'ID_CUSIP', idValue: '037833100', exchCode: 'US' }]) });
if (env.TIPRANKS_KEY && !env.PROBE2) { try { const MCP = 'https://mcp.tipranks.com/mcp/?apikey=' + encodeURIComponent(env.TIPRANKS_KEY); let sess = null, id = 0;
  const rpc = async (method, params, notify) => { const h = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }; if (sess) h['Mcp-Session-Id'] = sess;
    const r = await fetch(MCP, { method: 'POST', headers: h, body: JSON.stringify(notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params }) }); if (r.headers.get('mcp-session-id')) sess = r.headers.get('mcp-session-id'); if (notify) return null;
    const t = await r.text(); let m = null; for (const l of t.split('\n')) if (l.startsWith('data:')) { try { m = JSON.parse(l.slice(5)); } catch (e) {} } if (!m) try { m = JSON.parse(t); } catch (e) {} return m && m.result; };
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'expert-probe', version: '1' } }); await rpc('notifications/initialized', {}, true);
  const tl = await rpc('tools/list', {}); out.tipranksTools = ((tl && tl.tools) || []).map(t => ({ name: t.name, args: Object.keys((t.inputSchema && t.inputSchema.properties) || {}) })); } catch (e) { out.tipranksTools = 'error ' + String(e.message).slice(0, 80); } }
fs.mkdirSync('data', { recursive: true }); fs.writeFileSync('data/expert-probe.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 6000));
