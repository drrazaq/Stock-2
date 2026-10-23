// AGENT A data probe (23 Oct 2026, temporary): which earnings-history and ETF price sources answer from GitHub Actions.
// Writes data/agent-a-probe.json (counts and one sample row per source; no keys). Removed once the lab is built.
import fs from 'node:fs';
const env = process.env, out = { at: new Date().toISOString() }, mask = (u) => u.replace(/(apiKey|token|apikey)=[^&]+/g, '$1=***');
async function get(name, url, headers = {}) { try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) }); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {}
  out[name] = { url: mask(url), status: r.status, bytes: txt.length, sample: j ? JSON.stringify(j).slice(0, 700) : txt.slice(0, 300) }; return j; } catch (e) { out[name] = { url: mask(url), error: String(e.message || e).slice(0, 200) }; return null; } }
const MK = encodeURIComponent(env.MASSIVE_KEY || '');
const b = await get('benzinga', 'https://api.massive.com/benzinga/v1/earnings?date.gte=2021-07-26&date.lte=2021-07-28&limit=1000&apiKey=' + MK);
if (b && Array.isArray(b.results)) out.benzinga.count = b.results.length;
const b2 = await get('benzinga2019', 'https://api.massive.com/benzinga/v1/earnings?date.gte=2019-01-01&date.lte=2019-01-31&limit=1000&apiKey=' + MK);
if (b2 && Array.isArray(b2.results)) out.benzinga2019.count = b2.results.length;
for (const s of ['SPUS', 'HLAL', 'SPSK', 'SPRE', 'SPTE', 'SPWO', 'UMMA', 'AMAP', 'BAR', 'SPY', 'GLD']) { const j = await get('aggs_' + s, 'https://api.massive.com/v2/aggs/ticker/' + s + '/range/1/day/2018-01-01/2026-10-23?adjusted=true&sort=asc&limit=50000&apiKey=' + MK);
  if (j && Array.isArray(j.results)) { out['aggs_' + s] = { n: j.results.length, first: new Date(j.results[0].t).toISOString().slice(0, 10), last: new Date(j.results.at(-1).t).toISOString().slice(0, 10), status: 200 }; } }
await get('dividends', 'https://api.massive.com/v3/reference/dividends?ticker=SPUS&limit=50&apiKey=' + MK);
await get('nasdaq', 'https://api.nasdaq.com/api/calendar/earnings?date=2021-07-27', { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' });
const f = await get('finnhubCal', 'https://finnhub.io/api/v1/calendar/earnings?from=2021-07-26&to=2021-07-28&token=' + encodeURIComponent(env.FINNHUB_KEY || ''));
if (f && f.earningsCalendar) out.finnhubCal.count = f.earningsCalendar.length;
await get('fmpCal', 'https://financialmodelingprep.com/stable/earnings-calendar?from=2021-07-26&to=2021-07-28&apikey=' + encodeURIComponent(env.FMP_KEY || ''));
await get('avCal', 'https://www.alphavantage.co/query?function=EARNINGS&symbol=IBM&apikey=' + encodeURIComponent(env.ALPHAVANTAGE_KEY || ''));
await get('twelveEarn', 'https://api.twelvedata.com/earnings?symbol=AAPL&start_date=2021-01-01&end_date=2021-12-31&apikey=' + encodeURIComponent(env.TWELVE_KEY || ''));
fs.writeFileSync('data/agent-a-probe.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1).slice(0, 4000));
