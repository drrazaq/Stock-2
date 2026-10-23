// Seams: the pure functions of follow-lane.mjs (the FOLLOW LANE, 23 Oct 2026):
//   parseVideo({title, desc}, universe)  which stocks a video calls, its direction, and any stated entry / target / stop
//   entrySession(publishMs, sessions)     the session whose OPEN is the first one after the call was public (New York time)
//   callReturn(bars, e, h, levels)        the gross return of one call held h sessions (with the trader's own exits when given)
//   judge(rows, H)                        a trader's record at his pre-registered horizon and his level FOLLOW / FADE / NO EDGE / WATCH
//   luckExpected(n, t)                    how many traders would pass t by luck alone
// Run: node test/follow-lane.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVideo, entrySession, callReturn, judge, luckExpected, horizonFor } from '../follow-lane.mjs';

const U = new Set(['NVDA', 'PLTR', 'SOFI', 'AAPL', 'TSLA', 'NOW', 'ALL', 'AI', 'CEO', 'USA', 'IONQ', 'RKLB', 'HOOD', 'GME', 'BIG', 'ONE', 'OPEN']);
const syms = (v) => parseVideo(v, U).calls.map(c => c.sym);

test('tickers: $TICKER and (TICKER) count; CEO, AI, USA in a sentence do not', () => {
  assert.deepEqual(syms({ title: 'The CEO of $PLTR just said AI will change the USA (SOFI is next)', desc: '' }), ['PLTR', 'SOFI']);
});

test('tickers: a bare listed ticker in a normal title counts; common words that are also tickers (NOW, ALL, BIG) do not', () => {
  assert.deepEqual(syms({ title: 'NVDA Stock Is About To Explode, Buy It NOW Before ALL The BIG Funds', desc: '' }), ['NVDA']);
});

test('tickers: a shouting all-caps title gives no bare tickers (only $ or brackets count there)', () => {
  assert.deepEqual(syms({ title: 'THIS ONE STOCK WILL OPEN HUGE TOMORROW', desc: '' }), []);
  assert.deepEqual(syms({ title: 'THIS STOCK WILL EXPLODE TOMORROW ($IONQ)', desc: '' }), ['IONQ']);
});

test('tickers: words that are not listed are never tickers, and at most 5 per video (title first)', () => {
  assert.deepEqual(syms({ title: 'Why FOMO Buyers of RKLB Are Wrong', desc: '' }), ['RKLB']);
  assert.equal(syms({ title: 'My picks: $NVDA', desc: '$PLTR $SOFI $AAPL $TSLA $IONQ $RKLB $HOOD' }).length, 5);
  assert.equal(syms({ title: 'My picks: $NVDA', desc: '$PLTR $SOFI $AAPL $TSLA $IONQ $RKLB $HOOD' })[0], 'NVDA');
});

test('direction: a bearish video is not a buy call; a neutral or bullish one is', () => {
  const bear = parseVideo({ title: 'Sell $TSLA now: it will crash, I am shorting it', desc: '' }, U);
  assert.equal(bear.bearish, true); assert.deepEqual(bear.calls, []);
  const bull = parseVideo({ title: '$HOOD breakout, buying more', desc: '' }, U);
  assert.equal(bull.calls[0].bull, true);
  assert.equal(parseVideo({ title: '$HOOD earnings review', desc: '' }, U).calls[0].bull, false);
});

test('levels: entry, target and stop are read only when the video names one stock', () => {
  const one = parseVideo({ title: '$SOFI swing trade', desc: 'Entry $9.50, price target $12, stop loss $8.80' }, U).calls[0];
  assert.deepEqual([one.en, one.tg, one.st], [9.5, 12, 8.8]);
  const two = parseVideo({ title: '$SOFI and $HOOD', desc: 'target $12 stop $8.80' }, U).calls;
  assert.deepEqual(two.map(c => [c.tg, c.st]), [[null, null], [null, null]]);
});

// sessions: Thu 2026-10-01, Fri 10-02, (weekend), Mon 10-05, Tue 10-06; New York is UTC-4 in October
const S = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'];
const at = (iso) => Date.parse(iso);
test('entry: published before 9:30 New York -> that day’s open', () => {
  assert.equal(entrySession(at('2026-10-01T13:00:00Z'), S), 0);   // 9:00 New York
});
test('entry: published during the session -> the NEXT session’s open (the open had passed)', () => {
  assert.equal(entrySession(at('2026-10-01T14:00:00Z'), S), 1);   // 10:00 New York
});
test('entry: published after the close on Friday -> Monday’s open', () => {
  assert.equal(entrySession(at('2026-10-02T20:30:00Z'), S), 2);   // 16:30 New York Friday
});
test('entry: published on Saturday or Sunday -> Monday’s open', () => {
  assert.equal(entrySession(at('2026-10-03T15:00:00Z'), S), 2);
  assert.equal(entrySession(at('2026-10-04T23:00:00Z'), S), 2);
});
test('entry: published late on a UTC Saturday that is still Friday evening in New York -> Monday', () => {
  assert.equal(entrySession(at('2026-10-03T01:00:00Z'), S), 2);   // Friday 21:00 New York
});
test('entry: published after the last session in the data -> -1 (pending, a new call)', () => {
  assert.equal(entrySession(at('2026-10-06T21:00:00Z'), S), -1);
});

// worked example: bought at the open of session 0 at 10.00
const bars = { o: [10, 10.2, 10.1, 10.6, 10.8, 11.5], h: [10.3, 10.4, 10.7, 10.9, 11.2, 11.9], l: [9.8, 9.9, 8.9, 10.4, 10.6, 11.3], c: [10.1, 10.0, 10.5, 10.8, 11.0, 11.8] };
test('score: held 5 sessions = bought at the 10.00 open, sold at the 5th close 11.00 -> +10% gross, +9.2% after 0.8%', () => {
  assert.equal(+callReturn(bars, 0, 5).toFixed(4), 0.1);
  assert.equal(+(callReturn(bars, 0, 5) - 0.008).toFixed(4), 0.092);
  assert.equal(+callReturn(bars, 0, 1).toFixed(4), 0.01);          // a day trade: open to the same close
});
test('score: the trader’s own stop 9.00 is hit on session 3 (low 8.90) -> -10% even though the stock ended higher', () => {
  assert.equal(+callReturn(bars, 0, 5, { st: 9 }).toFixed(4), -0.1);
});
test('score: the trader’s own target 10.80 is reached on session 4 (high 10.90) -> +8%', () => {
  assert.equal(+callReturn(bars, 0, 5, { tg: 10.8 }).toFixed(4), 0.08);
});
test('score: a horizon not finished yet -> null; a stock that stops trading is valued at its last trade', () => {
  assert.equal(callReturn(bars, 3, 5), null);
  const dead = { o: [10, NaN, NaN, NaN, NaN, NaN, NaN], h: [10, NaN, NaN, NaN, NaN, NaN, NaN], l: [9, NaN, NaN, NaN, NaN, NaN, NaN], c: [4, NaN, NaN, NaN, NaN, NaN, NaN] };
  assert.equal(+callReturn(dead, 0, 5).toFixed(4), -0.6);
});

// a trader with 3 calls a day on 10 days; the day's edge vs the average stock is m + d*z, z = +1,-1,+1,...; with 10 days t = 3m/d
const trader = ({ days = 10, per = 3, m = 0.05, d = 0.06, sign = 1, cost = 0.008 } = {}) => {
  const rows = []; for (let k = 0; k < days; k++) for (let j = 0; j < per; j++) { const edge = sign * (m + d * (k % 2 ? -1 : 1)); rows.push({ e: 10 + k * 20, sym: 'S' + k + '_' + j, r20: edge + cost, c20: 0, s20: 0 }); }
  return rows; };
test('judge: 30 calls on 10 days, t exactly 2.5, positive in both halves after 1.2% -> FOLLOW', () => {
  const j = judge(trader({ m: 0.05, d: 0.06 }), 20);
  assert.equal(j.t, 2.5); assert.equal(j.level, 'FOLLOW');
});
test('judge: the same record with t 2.49 -> NO EDGE', () => {
  const j = judge(trader({ m: 0.05, d: 0.15 / 2.49 }), 20);
  assert.equal(j.t, 2.49); assert.equal(j.level, 'NO EDGE');
});
test('judge: 29 calls, or 30 calls on only 9 days -> WATCH (too few)', () => {
  assert.equal(judge(trader().slice(0, 29), 20).level, 'WATCH');
  assert.equal(judge(trader({ days: 9, per: 4 }), 20).level, 'WATCH');
});
test('judge: winning on average but losing in the newer half -> NO EDGE', () => {
  const rows = trader({ m: 0.05, d: 0.01 }); for (const r of rows) if (r.e >= 110) r.r20 = 0.008 - 0.01;   // newer 5 days -1%
  assert.equal(judge(rows, 20).level, 'NO EDGE');
});
test('judge: the mirror image (t -2.5, worse in both halves) -> FADE', () => {
  const j = judge(trader({ m: 0.05, d: 0.06, sign: -1, cost: 0 }), 20);
  assert.equal(j.tGross, -2.5); assert.equal(j.level, 'FADE');
});
test('judge: positive edge but loses money after the 1.2% stress cost in a half -> NO EDGE', () => {
  const rows = trader({ m: 0.05, d: 0.06 }); for (const r of rows) { r.c20 = -0.06; r.r20 = r.r20 - 0.06; }   // beats a falling average stock while losing money
  assert.equal(judge(rows, 20).level, 'NO EDGE');
});
test('luck: 1,000 traders screened at t 2.5 -> about 6 pass by luck alone', () => {
  assert.equal(Math.round(luckExpected(1000, 2.5)), 6);
});
test('horizon: fixed in advance from the channel’s own words', () => {
  assert.equal(horizonFor('Daily day trading live streams, small caps'), 1);
  assert.equal(horizonFor('Swing trades and stock picks'), 20);
  assert.equal(horizonFor('Long-term investing in dividend stocks'), 60);
  assert.equal(horizonFor('Stock market news'), 20);
});

// --- sources added 23 Oct (owner: "open the web") ---
import { congressCall, f13Calls, parseInfoTable, nonUSChannel } from '../follow-lane.mjs';
const trade = (o = {}) => ({ politician_canonical: 'Nancy Pelosi', bioguide_id: 'P000197', symbol: 'NVDA', asset_type_code: 'ST', asset_name: 'NVIDIA Corporation - Common Stock', transaction_type: 'BUY', transaction_date: '2026-07-28', filed_date: '2026-08-21', ...o });
test('congress: a stock BUY is a call dated at the FILING (when the public could know), never the trade date', () => {
  const c = congressCall(trade(), U);
  assert.equal(c.sym, 'NVDA'); assert.equal(c.tr, 'cg:P000197'); assert.equal(entrySession(Date.parse(c.pub), ['2026-08-20', '2026-08-21', '2026-08-24']), 2);
});
test('congress: sales, untickered assets, puts and unknown symbols are not buy calls; a call option is', () => {
  assert.equal(congressCall(trade({ transaction_type: 'SALE' }), U), null);
  assert.equal(congressCall(trade({ symbol: null }), U), null);
  assert.equal(congressCall(trade({ asset_type_code: 'OP', asset_name: 'NVIDIA (NVDA) put options' }), U), null);
  assert.equal(congressCall(trade({ symbol: 'ZZZZ' }), U), null);
  assert.equal(congressCall(trade({ asset_type_code: 'OP', asset_name: 'NVIDIA (NVDA) Call options; strike 120' }), U).sym, 'NVDA');
});
test('13F: a new position or one raised 50%+ is a call; held, trimmed, small adds and puts are not', () => {
  const prev = { A: [100, 1], B: [100, 1], C: [100, 1] }, cur = { A: [100, 1], B: [160, 1], C: [120, 1], D: [50, 1] };
  assert.deepEqual(f13Calls(prev, cur).sort(), ['B', 'D']);
});
test('13F: the information table is read (shares summed per CUSIP; put and call lines left out)', () => {
  const xml = '<informationTable><infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip><value>500</value><shrsOrPrnAmt><sshPrnamt>10</sshPrnamt></shrsOrPrnAmt></infoTable>' +
    '<infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip><value>100</value><shrsOrPrnAmt><sshPrnamt>2</sshPrnamt></shrsOrPrnAmt></infoTable>' +
    '<infoTable><nameOfIssuer>TESLA INC</nameOfIssuer><cusip>88160R101</cusip><value>90</value><shrsOrPrnAmt><sshPrnamt>5</sshPrnamt></shrsOrPrnAmt><putCall>Put</putCall></infoTable></informationTable>';
  assert.deepEqual(parseInfoTable(xml), { '037833100': [12, 600, 'APPLE INC'] });
});

// --- corrections after the first real run (23 Oct; both only make the rule stricter) ---
test('judge: calls on many days but inside few non-overlapping H-session blocks are not independent -> not FOLLOW', () => {
  // 30 calls on 10 days, all within 2 blocks of 60 sessions: per-day t is high, but there are only 2 independent windows
  const rows = []; for (let k = 0; k < 10; k++) for (let j = 0; j < 3; j++) rows.push({ e: 10 + k * 10, sym: 'S' + k + j, r60: 0.008 + 0.05 + 0.01 * (k % 2 ? -1 : 1), c60: 0, s60: 0 });
  const J = judge(rows, 60);
  assert.ok(J.t >= 2.5); assert.equal(J.blocks, 2); assert.equal(J.level, 'NO EDGE'); assert.match(J.why, /block/);
});
test('non-US channel: Australian / Indian market channels are excluded (their codes are other companies in the US)', () => {
  assert.equal(nonUSChannel('Livewire Markets', 'Australian investing insights, ASX stocks', 'AU'), true);
  assert.equal(nonUSChannel('Breakout', 'Nifty and Sensex trading ideas', ''), true);
  assert.equal(nonUSChannel('ZipTrader', 'US stock market news and small caps', 'US'), false);
  assert.equal(nonUSChannel('Meet Kevin', 'Investing', ''), false);
});
