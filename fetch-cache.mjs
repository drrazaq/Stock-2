// Run-local fetch cache for the two-pass nightly scan (P0 Route A, development). The public pass records responses from DECLARED
// immutable historical market-data routes only (daily bar series and daily range/grouped aggregates); the private pass replays them first
// and otherwise makes exactly today's request. Current quotes, snapshots, news, account, private and screening routes are never cached.
// Key: host + path + query WITHOUT credential parameters, hashed; credentials are never written. Each entry keeps the original receipt
// clock, returned on replay in the x-scan-cache-received-at header. Only GET 200 JSON is cached. The directory is run-local, outside the
// repository, owner-only, and never committed.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const SECRET = /([?&])(apikey|apiKey|token|key|api_key)=[^&]*/g;
export const CACHEABLE = Object.freeze([
  /\/time_series\?(?:.*&)?interval=1day(?:&|$)/,                         // Twelve Data daily bar series
  /\/v2\/aggs\/ticker\/[A-Z.\-]{1,10}\/range\/1\/day\//,                  // Massive daily range aggregates
  /\/v2\/aggs\/grouped\/locale\/us\/market\/stocks\/\d{4}-\d{2}-\d{2}/,  // Massive grouped daily bars for a past date
]);
const strip = (url) => String(url).replace(SECRET, '$1$2=');
export const cacheable = (url) => { let u; try { u = new URL(String(url)); } catch { return false; } const pq = u.pathname + u.search; return CACHEABLE.some(re => re.test(pq)); };
export const cacheKey = (url) => { const u = new URL(strip(url)); return crypto.createHash('sha256').update(u.host + '\n' + u.pathname + '\n' + u.search).digest('hex'); };
export function installFetchCache(dir, mode, realFetch = globalThis.fetch) {
  if (!dir || !['record', 'replay'].includes(mode)) return realFetch;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const cached = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input && input.url, method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET' || !url || !cacheable(url)) return realFetch(input, init);
    const file = path.join(dir, cacheKey(url) + '.json');
    if (mode === 'replay') { try { const e = JSON.parse(fs.readFileSync(file, 'utf8')); return new Response(e.body, { status: 200, headers: { 'content-type': 'application/json', 'x-scan-cache': 'hit', 'x-scan-cache-received-at': e.receivedAt } }); } catch {} }
    const r = await realFetch(input, init);
    if (mode === 'record' && r.status === 200) { try { const body = await r.clone().text(); JSON.parse(body); const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ receivedAt: new Date().toISOString(), body }), { mode: 0o600 }); fs.renameSync(tmp, file); } catch {} }
    return r;
  };
  globalThis.fetch = cached; return cached;
}
