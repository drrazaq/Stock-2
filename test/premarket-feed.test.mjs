// Actual premarket-check.mjs against a synthetic local Alpaca service: the "pre-market trade" test uses New York dates
// (a late after-hours trade is the next UTC day), and the message names the response feed and the trade's own time.
// No Telegram variables are set, so nothing is sent; any non-local fetch throws. PREMARKET_ROOT can point at another tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
const root = path.resolve(process.env.PREMARKET_ROOT || path.join(import.meta.dirname, '..'));
const nyDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
// Start of today's New York date, found by stepping back from now (works in both EDT and EST).
const nyMidnight = () => { const today = nyDate(new Date()); let t = Date.now() - (Date.now() % 60000); while (nyDate(new Date(t - 60000)) === today) t -= 60000; return t; };

async function run(t, feedStatus) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'premarket-feed-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of ['premarket-check.mjs', 'alpaca-feed.mjs', 'market-symbol.mjs']) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data/my-positions.json'), JSON.stringify({ AAA: { entry: 10, stop: 8 }, BBB: { entry: 10, stop: 8 } }));
  const mid = nyMidnight(), lateAfterHours = new Date(mid - 30 * 60000).toISOString(), fresh = new Date(Date.now() - 60000).toISOString(), calls = [];
  const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://l'), feed = u.searchParams.get('feed'); calls.push(feed);
    if (feed === 'sip' && feedStatus !== 200) { res.statusCode = feedStatus; return res.end('{}'); }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ AAA: { latestTrade: { p: 9, t: lateAfterHours }, prevDailyBar: { c: 9.5 } }, BBB: { latestTrade: { p: 9.9, t: fresh }, prevDailyBar: { c: 9.5 } } })); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port, preload = path.join(dir, 'local-only.mjs');
  fs.writeFileSync(preload, `const f=fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith(${JSON.stringify(base + '/')}))throw Error('NO_EXTERNAL_ACCESS');return f(u,o);};`);
  const child = spawn(process.execPath, ['--import', preload, 'premarket-check.mjs'], { cwd: dir, env: { PATH: process.env.PATH, ALPACA_DATA_BASE: base, ALPACA_KEY: 'synthetic', ALPACA_SECRET: 'synthetic' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', x => out += x); child.stderr.on('data', x => out += x);
  const code = await new Promise(r => child.on('close', r)); assert.equal(code, 0, out);
  return { out, calls, lateAfterHours };
}

test('a late after-hours trade (next UTC date, previous New York date) is not today\'s pre-market price', async t => {
  const r = await run(t, 200), aaa = r.out.split('\n').find(l => l.includes('AAA'));
  assert.equal(new Date(r.lateAfterHours).toISOString().slice(0, 10), nyDate(new Date()), 'fixture: the trade has today\'s UTC date');
  assert.match(aaa, /AAA no pre-market trade yet, close 9\.50/);
});

test('a real pre-market trade is shown with its own New York time, and the header names the response feed', async t => {
  const r = await run(t, 200), bbb = r.out.split('\n').find(l => l.includes('BBB'));
  assert.match(bbb, /BBB pre-market 9\.90 at \d\d:\d\d NY \(\+4\.2% vs close\)/);
  assert.match(r.out, /\[prices: SIP feed\]/); assert.deepEqual(r.calls, ['sip']);
});

test('after a SIP 403 the header says IEX', async t => {
  const r = await run(t, 403); assert.match(r.out, /\[prices: IEX feed\]/); assert.deepEqual(r.calls, ['sip', 'iex']);
});
