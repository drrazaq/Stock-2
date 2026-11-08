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
import { loadScan, blocked } from './load-scan.mjs';

const AT = (iso) => Date.parse(iso);
const ON_TIME = AT('2026-11-05T14:40:00Z');   // Thu 9:40 am New York (winter time)
const LATE = AT('2026-11-06T19:57:00Z');      // Fri 2:57 pm New York, the 6 Nov pattern
const EARLY_CLOSE = AT('2026-11-27T15:00:00Z');   // Fri 27 Nov 10:00 am New York, NYSE early close 1:00 pm
const SIG = { session: '2026-11-04', stocks: [], quick: [], leaders: [], posVerdict: { ZZG: 'it closed under its 50 day average, the trend is broken.' } };

// quotes: { SYM: { c, ageSec } | { c, t: 0 } | null }, served as Finnhub /quote responses
// the reviewed NYSE calendar is loaded by scan.mjs at run time (dynamic import), so the fixture folder gets the repository's copy
const SESSION_SRC = fs.readFileSync(new URL('../market-session.mjs', import.meta.url), 'utf8');
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

test('conflicting exits: last night\'s trend exit is SELL in the first check, never HOLD, and agrees with ACTIONS', async t => {
  const pos = { ZZG: { entry: 6, stop: 1.98, kind: 'leader', since: '2026-10-20' } };
  const r = await run(t, { pos, quotes: { ZZG: { c: 3.77, ageSec: 20 } } });
  const l = r.line('ZZG');
  assert.match(l, /^ZZG: SELL: last night's exit rule, it closed under its 50 day average, the trend is broken\./);
  assert.doesNotMatch(l, /HOLD/);
  assert.match(l, /Last price 3\.77 \(FINNHUB, Nov 5 09:39 New York, 20 s old\) \(-37\.2% from your 6\.00\)/);
  // the same holding in ACTIONS (planText, unchanged) is a SELL from the same nightly verdict
  const actions = r.S.fn('planText')(SIG, pos, { ZZG: 3.77 });
  assert.match(actions, /ZZG: SELL at the close or next open\. It closed under its 50 day average, the trend is broken\./);
  assert.equal(r.S.readJson('data/my-positions.json').ZZG.stop, 1.98, 'stop unchanged');
});

test('stop reached on fresh evidence takes precedence over a nightly exit, as in ACTIONS', async t => {
  const r = await run(t, { pos: { ZZG: { entry: 6, stop: 4, kind: 'leader', since: '2026-10-20' } }, quotes: { ZZG: { c: 3.77, ageSec: 20 } } });
  assert.match(r.line('ZZG'), /^ZZG: STOP LEVEL REACHED: at or below your stop 4\.00\. If your broker stop order has filled, you are already out: do not sell again\./);
});

test('stale quote under the stop: UNKNOWN in the first check (not a hit, not HOLD), and STOP CHECK UNKNOWN from the stop route', async t => {
  const r = await run(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 70, ageSec: 30 * 60 } } });
  const l = r.line('ZZS');
  assert.match(l, /^ZZS: STOP STATUS UNKNOWN: no exit rule is active, but whether your stop 80\.00 was reached cannot be confirmed right now/);
  assert.match(l, /Current price UNKNOWN \(the latest price is 30 min old \(limit 5 min\)\)/);
  assert.doesNotMatch(l, /REACHED|HOLD|% from your/);
  assert.match(r.sent.find(x => /STOP CHECK UNKNOWN/.test(x)) || '', /ZZS: the latest price is 30 min old/);
  assert.equal(r.sent.filter(x => /STOP LEVEL REACHED|STOP LOSS REACHED/.test(x)).length, 0);
});

test('undated quote and a holding with no price at all are UNKNOWN and still listed (never dropped)', async t => {
  const r = await run(t, { pos: { ZZU: { entry: 50, stop: 40 }, ZZN: { entry: 20, stop: 15 }, ZZF: { entry: 10, stop: 8 } },
    quotes: { ZZU: { c: 39, t: 0 }, ZZF: { c: 12, ageSec: 30 } } });
  assert.match(r.line('ZZU'), /^ZZU: STOP STATUS UNKNOWN.*Current price UNKNOWN \(the price has no source timestamp\)/);
  assert.match(r.line('ZZN'), /^ZZN: STOP STATUS UNKNOWN.*Current price UNKNOWN \(no valid price\)/);
  assert.match(r.line('ZZF'), /^ZZF: HOLD: no exit rule is active; above your stop 8\.00\. Last price 12\.00 \(FINNHUB, Nov 5 09:39 New York, 30 s old\)/);
});

test('delayed startup: a 2:57 pm first run shows its actual time and says it did not observe the open', async t => {
  const r = await run(t, { now: LATE, pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(r.first, /^TODAY'S FIRST MARKET-HOURS CHECK, run at 2:57 pm New York \(22:57 Kuwait\)\. The system is running\./);
  assert.match(r.first, /LATE: this is the first check that reached this point today, so it did NOT observe the open\. The market opened at 9:30 am New York \(5:30 pm Kuwait\), 5 h 27 min before this check\./);
  assert.doesNotMatch(r.first, /MARKET OPEN CHECK/);
  const ok = await run(t, { now: ON_TIME, pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(ok.first, /run at 9:40 am New York \(17:40 Kuwait\)/); assert.doesNotMatch(ok.first, /LATE|did NOT observe/);
});

test('labels and promises: no PROVEN BUYS, no "the moment", no fixed 30-minute promise; buy lines need fresh evidence', async t => {
  const r = await run(t, { pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.doesNotMatch(r.first, /PROVEN BUYS|the moment|I check every 30 minutes/);
  assert.match(r.first, /BUY LIST FROM LAST NIGHT'S SCAN \(the rules are NOT PROVEN; a line is a buy only while its price is INSIDE its range\)/);
  assert.match(r.first, /none\. Nothing qualified in last night's scan\. New buy candidates are chosen only by the nightly scan, never during the day\./);
  assert.match(r.first, /scheduled every 30 minutes while the market is open, but GitHub can start them late or skip them, so no exact time is promised/);
});

test('close statement: the regular 4:00 pm NYSE close is kept apart from the watcher\'s 3:00 pm cutoff; early-close days use 1:00 pm', async t => {
  const r = await run(t, { pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(r.first, /Regular NYSE session today: 9:30 am to 4:00 pm New York \(5:30 pm to 12 am Kuwait\)\. The live watcher’s configured window ends at 3:00 pm New York, 60 minutes before the close; the last part of the session is not watched live\./);
  const e = await run(t, { now: EARLY_CLOSE, pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(e.first, /Regular NYSE session today: 9:30 am to 1:00 pm New York \(5:30 pm to 9 pm Kuwait\)\. The live watcher’s configured window ends at 3:00 pm New York\./);
  const u = await run(t, { calendar: false, pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(u.first, /Regular session hours today: UNKNOWN \(the NYSE calendar could not be read\)\./); assert.doesNotMatch(u.first, /4:00 pm/);
});

test('records untouched: positions and Telegram offset unchanged; one first check a day', async t => {
  const pos = { ZZF: { entry: 10, stop: 8 } };
  const r = await run(t, { pos, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.deepEqual(r.S.readJson('data/my-positions.json'), pos); assert.equal(r.S.readJson('data/tg-state.json').offset, 42);
  assert.equal(r.S.readJson('data/alert-state.json').sent.__open, 1);
  assert.equal(r.sent.filter(x => /FIRST MARKET-HOURS CHECK/.test(x)).length, 1);
});

test('8 Nov review: a no-stop leader-dip holding with no valid price is STATUS UNKNOWN (never HOLD) when another holding triggers the check', async t => {
  const r = await run(t, { pos: { ZZN: { entry: 20, src: 'leader dip', target: 24 }, ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(r.line('ZZN'), /^ZZN: STATUS UNKNOWN: no exit rule is active from last night, but the current price cannot be confirmed right now \(leader dip, no stop by design; check whether your sell limit 24\.00 has filled\)/);
  assert.doesNotMatch(r.line('ZZN'), /HOLD/);
  assert.match(r.line('ZZF'), /^ZZF: HOLD: no exit rule is active; above your stop 8\.00/, 'the priced holding is unaffected');
  const c = await run(t, { pos: { ZZN: { entry: 20, src: 'leader dip', target: 24 } }, quotes: { ZZN: { c: 21, ageSec: 30 } } });
  assert.match(c.line('ZZN'), /^ZZN: HOLD: no exit rule is active; leader dip, no stop by design, sell limit 24\.00\. Last price 21\.00/, 'control: with fresh evidence it is still HOLD');
  const ns = await run(t, { pos: { ZZM: { entry: 5 }, ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(ns.line('ZZM'), /^ZZM: STATUS UNKNOWN: .*; NO STOP SET;/, 'an ordinary holding without a stop too');
});

test('8 Nov review: when EVERY holding quote is missing the first check is still sent and lists each holding as UNKNOWN', async t => {
  const r = await run(t, { pos: { ZZN: { entry: 20, stop: 15 }, ZZL: { entry: 30, src: 'leader dip', target: 36 } }, quotes: {} });
  assert.match(r.first, /^TODAY'S FIRST MARKET-HOURS CHECK/);
  assert.match(r.line('ZZN'), /^ZZN: STOP STATUS UNKNOWN/); assert.match(r.line('ZZL'), /^ZZL: STATUS UNKNOWN/);
  assert.equal(r.sent.filter(x => /FIRST MARKET-HOURS CHECK/.test(x)).length, 1);
  const none = await run(t, { pos: {}, quotes: {} });
  assert.equal(none.first, '', 'no holdings and no prices: nothing to report (unchanged)');
});

test('all requests stayed synthetic and on loopback', () => assert.deepEqual(blocked, []));

test('future-at-fetch quote remains UNKNOWN after another holding request advances the rendering clock', async t => {
  const start=ON_TIME;let clock=start,quoteCount=0;const sent=[];
  const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{
    res.setHeader('content-type','application/json');
    if(req.url.includes('/getUpdates'))return res.end(JSON.stringify({ok:true,result:[]}));
    if(req.url.includes('/quote')){quoteCount++;if(quoteCount===1)return res.end(JSON.stringify({c:70,t:(start+20000)/1000}));clock=start+30000;return res.end(JSON.stringify({c:12,t:(start-30000)/1000}));}
    if(req.url.includes('/sendMessage')){sent.push(JSON.parse(body).text);return res.end(JSON.stringify({ok:true,result:{message_id:sent.length}}));}
    res.statusCode=404;res.end('{}');
  });});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const S=await loadScan({files:{'data/my-positions.json':{ZZS:{entry:100,stop:80},ZZF:{entry:10,stop:8}},'data/signals.json':{session:'2026-11-04',stocks:[],quick:[],leaders:[]},'market-session.mjs':SESSION_SRC},env:{BOT_ONLY:'',MODE:'intraday',TG_TOKEN:'synthetic',TG_CHAT:'42',TG_BASE:base,FH_BASE:base,FINNHUB_KEY:'synthetic',TD_BASE:base}});
  const originalNow=Date.now;Date.now=()=>clock;
  try{await S.fn('intraday')(false);}finally{Date.now=originalNow;await new Promise(r=>server.close(r));}
  const first=sent.find(x=>/FIRST MARKET-HOURS CHECK/.test(x))||'',stop=sent.find(x=>/^YOUR STOPS/.test(x))||'';
  assert.equal(quoteCount,2);assert.match(first,/ZZS: STOP STATUS UNKNOWN/);assert.match(first,/was in the future when fetched/);assert.doesNotMatch(first,/ZZS: STOP LEVEL REACHED/);assert.match(stop,/STOP CHECK UNKNOWN: ZZS.*future/);
});

test('original observation-time validation preserves the existing five-minute default and explicit stricter gate',async()=>{
 const S=await loadScan({});const q={price:70,reportedPrice:70,t:ON_TIME-240000,src:'synthetic',observedAt:ON_TIME};
 assert.equal(S.fn('quoteEvidence')('ZZS',q,ON_TIME).state,'OK');
 assert.equal(S.fn('quoteEvidence')('ZZS',q,ON_TIME,3).state,'UNKNOWN');
 assert.equal(S.fn('quoteEvidence')('ZZS',{...q,status:'FUTURE_SOURCE_TIME'},ON_TIME+60000).state,'UNKNOWN');
 assert.equal(S.fn('quoteEvidence')('ZZS',{...q,observedAt:NaN},ON_TIME).state,'UNKNOWN');
});
