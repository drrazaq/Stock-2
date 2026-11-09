// Evidence script (review only): drives docs/r1-sealed-provider-data/k2-key-tool.html in Chromium (Playwright) against key-check
// records made by the real sealed-migrate.mjs. Usage: node k2-key-tool.browser-check.mjs <repo checkout>
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
const repo = path.resolve(process.argv[2]), page_ = 'file://' + path.join(repo, 'docs/r1-sealed-provider-data/k2-key-tool.html');
const vec = (secret) => execFileSync(process.execPath, [path.join(repo, 'sealed-migrate.mjs'), '--key-check-make'], { env: { PATH: process.env.PATH, SEALED_SECRET: secret } }).toString().replace(/^R1 KEY CHECK VECTOR /, '').trim();
const A = crypto.randomBytes(32).toString('hex'), B = crypto.randomBytes(32).toString('hex'), VA = vec(A);
const results = [], ok = (name, cond) => { results.push((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };
const browser = await chromium.launch(); const page = await browser.newPage(); const requests = [];
page.on('request', (r) => requests.push(r.url()));
await page.goto(page_);
const check = async (secret, vector) => { await page.fill('#secret', secret); await page.fill('#vector', vector); await page.click('#check'); await page.waitForFunction(() => !/Checking/.test(document.getElementById('checkOut').textContent)); return page.textContent('#checkOut'); };
const keys = new Set(); for (let i = 0; i < 20; i++) { await page.click('#gen'); keys.add(await page.textContent('#genOut')); }
ok('generator: 20 clicks give 20 distinct keys, each exactly 64 lower-case hex', keys.size === 20 && [...keys].every((k) => /^[0-9a-f]{64}$/.test(k)));
const made = [...keys][0]; ok('a generated key is accepted by the real release tool and its record verifies in the page', /^PASS/.test(await check(made, vec(made))));
ok('right copy PASSES (record from the real sealed-migrate.mjs)', /^PASS/.test(await check(A, VA)));
ok('a different valid-format key FAILS', /^FAIL: this copy is NOT the key/.test(await check(B, VA)));
ok('one changed character FAILS', /^FAIL: this copy is NOT the key/.test(await check(A.slice(0, 40) + (A[40] === '0' ? '1' : '0') + A.slice(41), VA)));
ok('upper-case copy of the right key FAILS (the secret is case-sensitive)', /^FAIL: this copy is NOT the key/.test(await check(A.toUpperCase(), VA)));
ok('63 characters FAILS on format', /^FAIL: not a 64-character/.test(await check(A.slice(1), VA)));
ok('a trailing space FAILS on format', /^FAIL: not a 64-character/.test(await check(A + ' ', VA)));
ok('a damaged record FAILS', /^FAIL/.test(await check(A, VA.replace(/"sealed":"(.)/, (m, c) => '"sealed":"' + (c === 'A' ? 'B' : 'A')))));
await page.click('#demo'); await page.click('#check'); await page.waitForFunction(() => !/Checking/.test(document.getElementById('checkOut').textContent));
ok('built-in synthetic preflight PASSES', /^PASS/.test(await page.textContent('#checkOut')));
ok('no network request other than the page file itself', requests.every((u) => u === page_));
console.log(results.join('\n')); console.log(results.filter((r) => r.startsWith('PASS')).length + '/' + results.length + ' checks (headless Chromium ' + browser.version() + ')');
await browser.close();
