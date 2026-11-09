// SEC note wording (6 Nov 2026 repair). Synthetic local server only. The discovery note said an HTTP 404 "after 3 retries" meant
// "the SEC is refusing this server"; a 404 is "not found" and is never retried. This runs the ACTUAL sec() source from discover.mjs
// (extracted verbatim, so the whole discovery job does not run) and checks the note, the request count and the unchanged fallback (null).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'discover.mjs'), 'utf8');
const a = SRC.indexOf("let secNote = '';"), b = SRC.indexOf('\n}\n', SRC.indexOf('async function sec(url)', a)) + 3;
const BODY = SRC.slice(a, b);
function load() { // the verbatim source, with the job's own helpers stubbed (no waiting in tests)
  return new Function('fetch', 'UA', 'FAST', 'sleep', BODY + '\nreturn { sec, note: () => secNote };')(fetch, 'synthetic-test-agent', true, async () => {});
}
async function serve(status) { const hits = []; const s = http.createServer((req, res) => { hits.push(req.url); res.statusCode = status; res.end(status === 200 ? '{"ok":1}' : ''); });
  await new Promise(r => s.listen(0, '127.0.0.1', r)); return { url: 'http://127.0.0.1:' + s.address().port + '/api/xbrl/frames/us-gaap/Revenues/USD/CY2026Q2.json', hits, close: () => s.close() }; }

test('extracted source is the real sec() function', () => { assert.ok(a > 0 && b > a); assert.match(BODY, /async function sec\(url\)/); assert.match(BODY, /return r\.json\(\)/); });

test('HTTP 404: one request, described as not found (no refusal, no retries), fallback unchanged', async () => {
  const s = await serve(404), m = load();
  try { assert.equal(await m.sec(s.url), null); assert.equal(s.hits.length, 1);
    assert.equal(m.note(), 'SEC answered HTTP 404 (not found) for USD/CY2026Q2.json: the SEC has no such file (for example that quarter is not published yet); not retried; the Finnhub fallback is used instead');
    assert.doesNotMatch(m.note(), /refusing|retries/); } finally { s.close(); }
});

test('HTTP 403 and 429 keep the three retries and are described as refusal / rate limiting with the real retry count', async () => {
  for (const [st, word] of [[403, 'refusing'], [429, 'rate-limiting']]) { const s = await serve(st), m = load();
    try { assert.equal(await m.sec(s.url), null); assert.equal(s.hits.length, 4, String(st));
      assert.equal(m.note(), 'SEC answered HTTP ' + st + ' for USD/CY2026Q2.json after 3 retries (the SEC is ' + word + ' this server); the Finnhub fallback is used instead'); } finally { s.close(); } }
});

test('other errors: not retried, stated plainly; success unchanged', async () => {
  const s = await serve(500), m = load();
  try { assert.equal(await m.sec(s.url), null); assert.equal(s.hits.length, 1); assert.match(m.note(), /^SEC answered HTTP 500 for USD\/CY2026Q2\.json \(not retried\); the Finnhub fallback is used instead$/); } finally { s.close(); }
  const ok = await serve(200), m2 = load();
  try { assert.deepEqual(await m2.sec(ok.url), { ok: 1 }); assert.equal(m2.note(), ''); } finally { ok.close(); }
});
