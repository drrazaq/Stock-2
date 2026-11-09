// Evidence script (review only; offline): drives docs/r1-sealed-provider-data/k2-key-tool.html in headless Chromium (Playwright)
// against key-check records made by the real sealed-migrate.mjs. The page is served from 127.0.0.1 (a secure context), not file://.
// Usage: node k2-key-tool.browser-check.mjs <repo checkout>
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto'; import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const repo = path.resolve(process.argv[2]), html = fs.readFileSync(path.join(repo, 'docs/r1-sealed-provider-data/k2-key-tool.html'));
const srv = http.createServer((q, r) => { if (q.url === '/k2-key-tool.html') { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(html); } else { r.statusCode = 404; r.end(); } });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); const URLP = 'http://127.0.0.1:' + srv.address().port + '/k2-key-tool.html';
const vec = (secret) => execFileSync(process.execPath, [path.join(repo, 'sealed-migrate.mjs'), '--key-check-make'], { env: { PATH: process.env.PATH, SEALED_SECRET: secret } }).toString().replace(/^R1 KEY CHECK VECTOR /, '').trim();
const A = crypto.randomBytes(32).toString('hex'), B = crypto.randomBytes(32).toString('hex'), VA = vec(A);
const results = [], ok = (name, cond, got) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  got: ' + String(got).slice(0, 160))); if (!cond) process.exitCode = 1; };
const browser = await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox","--disable-background-networking"]});
async function open(init) { const ctx = await browser.newContext(); const page = await ctx.newPage(); const reqs = []; page.on('request', (r) => reqs.push(r.url())); if (init) await page.addInitScript(init); await page.goto(URLP); return { page, reqs, ctx }; }
const check = async (page, secret, vector) => { await page.fill('#secret', secret); await page.fill('#vector', vector); await page.click('#check'); await page.waitForFunction(() => !/Checking/.test(document.getElementById('checkOut').textContent)); return page.textContent('#checkOut'); };
{ const { page, reqs, ctx } = await open();
  ok('capability banner: all capabilities present', /every capability/.test(await page.textContent('#cap')), await page.textContent('#cap'));
  const keys = new Set(); for (let i = 0; i < 20; i++) { await page.click('#gen'); keys.add(await page.textContent('#genOut')); }
  ok('generator: 20 clicks give 20 distinct keys, each exactly 64 lower-case hex', keys.size === 20 && [...keys].every((k) => /^[0-9a-f]{64}$/.test(k)));
  const made = [...keys][0]; let t = await check(page, made, vec(made)); ok('a generated key is accepted by the real release tool and its record verifies (PASS)', /^PASS/.test(t), t);
  t = await check(page, A, VA); ok('right copy: PASS', /^PASS/.test(t), t);
  t = await check(page, B, VA); ok('different valid key: NOT VERIFIED, cause not determined, stop', /^NOT VERIFIED: this copy did not open the record .*cause is not determined.*Stop; do not run, repeat or retry/.test(t), t);
  t = await check(page, A.slice(0, 40) + (A[40] === '0' ? '1' : '0') + A.slice(41), VA); ok('one changed character: NOT VERIFIED', /^NOT VERIFIED/.test(t), t);
  t = await check(page, A.toUpperCase(), VA); ok('upper-case copy: NOT VERIFIED (secret is case-sensitive)', /^NOT VERIFIED/.test(t), t);
  t = await check(page, A.slice(1), VA); ok('63 characters: INPUT ERROR, nothing checked', /^INPUT ERROR: .*nothing was checked/.test(t), t);
  t = await check(page, A + ' ', VA); ok('trailing space: INPUT ERROR', /^INPUT ERROR/.test(t), t);
  t = await check(page, A, VA.replace(/"sealed":"(.)/, (m, c) => '"sealed":"' + (c === 'A' ? 'B' : 'A'))); ok('altered record: INPUT ERROR or NOT VERIFIED, never PASS', /^(INPUT ERROR|NOT VERIFIED)/.test(t), t);
  await page.click('#demo'); await page.click('#check'); await page.waitForFunction(() => !/Checking/.test(document.getElementById('checkOut').textContent));
  t = await page.textContent('#checkOut'); ok('built-in synthetic preflight: PASS', /^PASS/.test(t), t);
  const body = await page.textContent('body'); ok('no result text claims the data is fine or invites a retry', !/nothing is wrong|retry once|try again|NOT the key/i.test(body), body);
  ok('no network request other than the page itself', reqs.every((u) => u === URLP), reqs.join(' '));
  await ctx.close(); }
{ const { page, ctx } = await open('delete globalThis.DecompressionStream;');
  const cap = await page.textContent('#cap'); ok("without DecompressionStream: UNSUPPORTED banner before anything is made or checked", /^UNSUPPORTED: this browser lacks DecompressionStream\('deflate-raw'\)/.test(cap), cap);
  ok('without DecompressionStream: Make key / Check / test buttons disabled', await page.isDisabled('#gen') && await page.isDisabled('#check') && await page.isDisabled('#demo'));
  const r = await page.evaluate(async ({ s, v }) => checkCopy(s, v), { s: A, v: VA }); ok('Codex 6733594774 case: a VALID record without deflate-raw returns UNSUPPORTED, not "damaged"', r.kind === 'UNSUPPORTED' && !/damaged/.test(r.why), JSON.stringify(r));
  await ctx.close(); }
{ const { page, ctx } = await open('Object.defineProperty(globalThis.crypto, "subtle", { value: undefined });');
  const cap = await page.textContent('#cap'); ok('without crypto.subtle: UNSUPPORTED banner, buttons disabled', /^UNSUPPORTED: .*crypto\.subtle\.digest/.test(cap) && await page.isDisabled('#gen'), cap);
  await ctx.close(); }
console.log(results.join('\n')); console.log(results.filter((r) => r.startsWith('PASS')).length + '/' + results.length + ' checks (headless Chromium ' + browser.version() + ', served from 127.0.0.1)');
await browser.close(); srv.close();
