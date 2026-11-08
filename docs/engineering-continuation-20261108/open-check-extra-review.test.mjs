// Open-check repair (6 Nov 2026). Synthetic fixtures only: invented tickers and prices, loopback services, no owner records,
// credentials, provider requests or real messages. Every case runs the ACTUAL intraday() caller (the scanner's market-hours check).
// 1 one holding action: a nightly exit (posVerdict, a trend exit included) is never shown as HOLD, and agrees with ACTIONS (planText)
// 2 a price-based stop claim needs ticker-bound, dated, fresh evidence; stale, undated or missing prices are UNKNOWN, never HOLD
// 3 no "PROVEN BUYS" label and no timing promise; a late first run shows its actual time and says it did not observe the open
// 4 the regular NYSE close (4:00 pm, 1:00 pm on early-close days) is kept apart from the watcher's configured 3:00 pm cutoff
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.env.REVIEW_TREE;
if(!root) throw Error('Set REVIEW_TREE to the isolated composed source tree');
const {loadScan,blocked}=await import(pathToFileURL(root+'/test/load-scan.mjs'));

const AT = (iso) => Date.parse(iso);
const ON_TIME = AT('2026-11-05T14:40:00Z');   // Thu 9:40 am New York (winter time)
const LATE = AT('2026-11-06T19:57:00Z');      // Fri 2:57 pm New York, the 6 Nov pattern
const EARLY_CLOSE = AT('2026-11-27T15:00:00Z');   // Fri 27 Nov 10:00 am New York, NYSE early close 1:00 pm
const SIG = { session: '2026-11-04', stocks: [], quick: [], leaders: [], posVerdict: { ZZG: 'it closed under its 50 day average, the trend is broken.' } };

// quotes: { SYM: { c, ageSec } | { c, t: 0 } | null }, served as Finnhub /quote responses
// the reviewed NYSE calendar is loaded by scan.mjs at run time (dynamic import), so the fixture folder gets the repository's copy
const SESSION_SRC = fs.readFileSync(root+'/market-session.mjs', 'utf8');
async function run(t, { now = ON_TIME, pos, quotes, sig = SIG, calendar = true }) {
  const sent = [];
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol'), q = quotes[sym];
      if (!q) return res.end(JSON.stringify({ c: 0, t: 0 }));
      return res.end(JSON.stringify({ c: q.c, t: 't' in q ? q.t : Math.floor((now - q.ageSec * 1000) / 1000) })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const files = { 'data/my-positions.json': pos, 'data/signals.json': sig, 'data/tg-state.json': { offset: 42 } }; if (calendar) files['market-session.mjs'] = SESSION_SRC;
  const S = await loadScan({ files,
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => now;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const first = sent.find(x => /FIRST MARKET-HOURS CHECK|MARKET OPEN CHECK/.test(x)) || '';
  return { sent, first, S, line: (sym) => first.split('\n').find(l => l.startsWith(sym + ' ') || l.startsWith(sym + ':')) || '' };
}

test('review: missing quote without a stop cannot become a fresh HOLD', async t => {
 const r=await run(t,{pos:{ZZN:{entry:20,src:'leader dip',target:24},ZZF:{entry:10,stop:8}},quotes:{ZZF:{c:12,ageSec:30}}});
 assert.ok(r.line('ZZN'),'holding line must be present'); assert.match(r.line('ZZN'),/UNKNOWN/); assert.doesNotMatch(r.line('ZZN'),/: HOLD:/);
});
test('review: all quotes missing still reports holdings as UNKNOWN in the first check', async t => {
 const r=await run(t,{pos:{ZZN:{entry:20,stop:15}},quotes:{}});
 assert.ok(r.first,'first market-hours check must describe unavailable evidence'); assert.match(r.line('ZZN'),/UNKNOWN/);
});
