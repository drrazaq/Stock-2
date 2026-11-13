// Run-local fetch cache for the two-pass nightly scan (P0 Route A, development). The public pass records successful GET JSON responses;
// the private pass replays them first and fetches only what is missing (mainly private-only names), so market data is not fetched twice.
// The cache key is the URL WITHOUT credential parameters (apikey, apiKey, token), hashed; credentials are never written to disk.
// Only GET requests with status 200 are cached; POST (Telegram) and every other request pass straight through. The directory must be
// run-local and outside the repository; it is never committed.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const SECRET = /([?&])(apikey|apiKey|token|key|api_key)=[^&]*/g;
export const cacheKey = (url) => crypto.createHash('sha256').update(String(url).replace(SECRET, '$1$2=')).digest('hex');
export function installFetchCache(dir, mode, realFetch = globalThis.fetch) {
  if (!dir || !['record', 'replay'].includes(mode)) return realFetch;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const cached = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input && input.url, method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET' || !url) return realFetch(input, init);
    const file = path.join(dir, cacheKey(url) + '.json');
    if (mode === 'replay') { try { const body = fs.readFileSync(file, 'utf8'); return new Response(body, { status: 200, headers: { 'content-type': 'application/json', 'x-scan-cache': 'hit' } }); } catch {} }
    const r = await realFetch(input, init);
    if (r.status === 200) { try { const body = await r.clone().text(); JSON.parse(body); const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, body, { mode: 0o600 }); fs.renameSync(tmp, file); } catch {} }
    return r;
  };
  globalThis.fetch = cached; return cached;
}
