// The two-pass fetch cache replays only DECLARED immutable historical market routes, never quotes, snapshots, news, account or screening
// requests; keys never contain credentials; replay carries the original receipt clock. Loopback/synthetic only.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { cacheable, cacheKey, installFetchCache } from '../fetch-cache.mjs';
test('only declared historical daily-bar routes are cacheable', () => {
  for (const u of ['https://api.twelvedata.com/time_series?symbol=ZZP&interval=1day&outputsize=4000&order=ASC&apikey=S', 'https://api.massive.com/v2/aggs/ticker/ZZP/range/1/day/2021-01-01/2026-11-12?adjusted=true&apiKey=S', 'https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/2026-11-12?adjusted=true&apiKey=S']) assert.equal(cacheable(u), true, u);
  for (const u of ['https://api.twelvedata.com/price?symbol=ZZP&apikey=S', 'https://finnhub.io/api/v1/quote?symbol=ZZP&token=S', 'https://api.twelvedata.com/time_series?symbol=ZZP&interval=1min&apikey=S', 'https://data.alpaca.markets/v2/stocks/snapshots?symbols=ZZP', 'https://finnhub.io/api/v1/company-news?symbol=ZZP&token=S', 'https://api.halalterminal.com/screen?symbol=ZZP']) assert.equal(cacheable(u), false, u);
  assert.equal(cacheKey('https://h/time_series?symbol=A&interval=1day&apikey=ONE'), cacheKey('https://h/time_series?symbol=A&interval=1day&apikey=TWO'), 'credentials are not part of the key');
  assert.notEqual(cacheKey('https://h1/time_series?symbol=A&interval=1day'), cacheKey('https://h2/time_series?symbol=A&interval=1day'), 'host context is part of the key');
});
test('record then replay: replay hits declared routes with the original receipt clock and passes everything else through', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-cache-')); let calls = 0;
  const real = async (u) => { calls++; return new Response(JSON.stringify({ u: String(u).replace(/apikey=[^&]*/, '') }), { status: 200 }); };
  const rec = installFetchCache(dir, 'record', real); await rec('https://h/time_series?symbol=A&interval=1day&apikey=SECRET'); await rec('https://h/price?symbol=A&apikey=SECRET');
  for (const f of fs.readdirSync(dir)) assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /SECRET/);
  assert.equal(fs.readdirSync(dir).length, 1, 'only the daily-bar route was stored');
  const rep = installFetchCache(dir, 'replay', real); calls = 0;
  const r = await rep('https://h/time_series?symbol=A&interval=1day&apikey=OTHER'); assert.equal(r.headers.get('x-scan-cache'), 'hit'); assert.ok(Date.parse(r.headers.get('x-scan-cache-received-at'))); assert.equal(calls, 0);
  await rep('https://h/price?symbol=A&apikey=OTHER'); assert.equal(calls, 1, 'current quotes always fetched live');
  await rep('https://h/time_series?symbol=A&interval=1day', { method: 'POST' }); assert.equal(calls, 2, 'POST never cached');
  fs.rmSync(dir, { recursive: true, force: true });
});
