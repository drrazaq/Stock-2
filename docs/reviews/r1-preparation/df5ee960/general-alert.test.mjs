// Adversarial desired-behaviour reproducers for 730bda07 (R1/R2/R3 residual repair). Synthetic tickers, loopback only.
// Run: REVIEW_TREE=<worktree> node --test break.test.mjs
// Clock advances by ADV ms when ZZB's quote is served (ZZS is fetched first), standing in for fetch latency between fetch and report.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.env.REVIEW_TREE; if (!root) throw Error('set REVIEW_TREE');
const { loadScan, blocked } = await import(pathToFileURL(root + '/test/load-scan.mjs'));
const T = Date.parse('2026-11-05T14:40:00Z');
const SIG = { session: '2026-11-04', stocks: [], quick: [], leaders: [] };
const SESSION_SRC = fs.readFileSync(root + '/market-session.mjs', 'utf8');
async function setup(t, { pos, quotes, adv = 0 }) {
  const sent = [], order = []; let clock = T;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol'), q = quotes[sym]; order.push(sym);
      if (sym === 'ZZB') clock += adv;
      if (!q) return res.end(JSON.stringify({ c: 0, t: 0 }));
      return res.end(JSON.stringify({ c: q.c, t: Math.floor((T - q.ageSec * 1000) / 1000) })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ root, files: { 'data/my-positions.json': pos, 'data/signals.json': SIG, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC },
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock; try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const first = sent.find(x => /FIRST MARKET-HOURS CHECK/.test(x)) || '';
  return { sent, order, first, zzs: (first.match(/^ZZS:.*$/m) || [''])[0], stops: sent.find(x => /^YOUR STOPS/.test(x)) || '', all: sent.join('\n') };
}
const ZZB = { entry: 10, stop: 8 }, ZZBq = { c: 12, ageSec: 30 };


test('general target alert must not present an unqualified current price after batch delay leaves even the20-minute BUY NOW ceiling expired',async t=>{
 const r=await setup(t,{pos:{ZZS:{entry:100,stop:80,t2:88},ZZB},quotes:{ZZS:{c:90,ageSec:1190},ZZB:ZZBq},adv:30000});
 const alert=r.sent.find(x=>/^Market hours check/.test(x))||'';console.log('FIRST:',r.zzs);console.log('ALERT:',alert);
 assert.doesNotMatch(alert,/ZZS at 90\.00: YOUR POSITION: TARGET 2 REACHED/,'source1220s old at send; currently ungated target still presents an unqualified current-price claim');
});
test('future-at-fetch target evidence must not become valid merely while other quotes are fetched',async t=>{
 const r=await setup(t,{pos:{ZZS:{entry:100,stop:80,t2:88},ZZB},quotes:{ZZS:{c:90,ageSec:-20},ZZB:ZZBq},adv:30000});
 const alert=r.sent.find(x=>/^Market hours check/.test(x))||'';console.log('FIRST:',r.zzs);console.log('ALERT:',alert);
 assert.doesNotMatch(alert,/ZZS at 90\.00: YOUR POSITION: TARGET 2 REACHED/,'future at fetch must remain ineligible');
});
test('loopback only',()=>assert.deepEqual(blocked,[]));
