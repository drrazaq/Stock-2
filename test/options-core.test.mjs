// Seams: options-core.mjs, the pure rules of the OPTIONS LANE (pre-registered 23 Oct 2026 as OPT-LH1 / OPT-CAT1 / OPT-FOLLOW1 / OPT-UOA1):
//   optionNet(entryOpen, exitClose, h)          -> one contract's return after the spread (h each side) and ZAD's 5 USD each side
//   pickContract(chain, bars, day, spot)          -> the strike nearest the money that traded on the entry session
//   exitValue(bars, day, rawClose, strike)       -> the exit price: the close, or the intrinsic floor when it did not trade
//   verdictOf(trades, opts)                       -> TRADABLE SMALL / PROVEN / NOT PROVEN / REJECTED / TOO FEW CASES
//   isOptionsCall(call)                           -> an explicit, bullish options call on the named stock
//   entrySession(pubIso, sessions)                -> the first regular-session open after the post was public
// Run: node test/options-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { optionNet, pickContract, exitValue, verdictOf, isOptionsCall, entrySession } from '../options-core.mjs';

test('a call bought at 2.00 and sold at 3.00 with a 5% half-spread and 5 USD each side', () => {
  // paid 2.00 x 1.05 = 2.10 -> 210 + 5 = 215 USD; got 3.00 x 0.95 = 2.85 -> 285 - 5 = 280 USD; 280 / 215 - 1 = +30.23%
  assert.equal(+optionNet(2.0, 3.0, 0.05).toFixed(4), 0.3023);
});

test('a call that expires worthless loses the premium plus the entry fee and nothing more', () => {
  assert.equal(optionNet(1.0, 0, 0.02), -1);
});

const chain = [95, 97.5, 100, 102.5, 105].map(k => ({ occ: 'X' + k, k }));
test('the nearest strike that traded on the entry session is chosen; one that did not trade that day is skipped', () => {
  // spot 101.0: 100 is nearest but had no bar on 2024-05-01; 102.5 (1.5 away) beats 97.5 (3.5 away)
  const bars = { X100: [{ t: '2024-04-30', o: 3, c: 3 }], 'X102.5': [{ t: '2024-05-01', o: 2.1, c: 2.2 }], 'X97.5': [{ t: '2024-05-01', o: 4.4, c: 4.5 }] };
  assert.equal(pickContract(chain, bars, '2024-05-01', 101.0).occ, 'X102.5');
});

test('a tie between two strikes goes to the lower strike; nothing traded -> null', () => {
  const bars = { X100: [{ t: '2024-05-01', o: 3, c: 3 }], 'X102.5': [{ t: '2024-05-01', o: 2, c: 2 }] };
  assert.equal(pickContract(chain, bars, '2024-05-01', 101.25).occ, 'X100');
  assert.equal(pickContract(chain, {}, '2024-05-01', 101.25), null);
});

test('exit: the close of the exit session; no bar that day -> the intrinsic floor at the stock close', () => {
  const bars = [{ t: '2024-06-03', o: 5, c: 5.5 }];
  assert.deepEqual(exitValue(bars, '2024-06-03', 110, 100), { px: 5.5, by: 'close' });
  assert.deepEqual(exitValue(bars, '2024-06-04', 108, 100), { px: 8, by: 'intrinsic' });
  assert.deepEqual(exitValue(bars, '2024-06-04', 97, 100), { px: 0, by: 'intrinsic' });
});

// 40 trades, one every 5 sessions, B = 10 -> 2 trades a block, 20 blocks; halves of 20 trades each
const book = (f) => Array.from({ length: 40 }, (_, j) => { const r = f(j); return { e: j * 5, net: r[0], netStress: r[1], stock: r[2] }; });
const good = (j) => j % 4 < 2 ? [0.10, 0.07, 0.02] : [0.30, 0.27, 0.02];   // blocks alternate +10% / +30% (block t 8.7), stress 3 points lower, stock +2%

test('every gate passed, block t below the proof bar -> TRADABLE SMALL; at or above it -> PROVEN', () => {
  assert.equal(verdictOf(book(good), { B: 10, bar: 1e9 }).verdict, 'TRADABLE SMALL');
  assert.equal(verdictOf(book(good), { B: 10, bar: 4 }).verdict, 'PROVEN');
});

test('19 trades in a half -> TOO FEW CASES', () => {
  assert.equal(verdictOf(book(good).slice(0, 39), { B: 10, bar: 4 }).verdict, 'TOO FEW CASES');
});

test('beats the stock in both halves but loses at the 1.5x spread stress in one half -> NOT PROVEN, and the reason is named', () => {
  const v = verdictOf(book(j => j < 20 ? [0.05, -0.01, -0.10] : good(j)), { B: 10, bar: 4 });
  assert.equal(v.verdict, 'NOT PROVEN');
  assert.match(v.why, /stress.*older/);
});

test('makes money but less than buying the same stock with the same money -> REJECTED', () => {
  const v = verdictOf(book(j => [0.05, 0.04, 0.08]), { B: 10, bar: 4 });
  assert.equal(v.verdict, 'REJECTED');
  assert.match(v.why, /same stock/);
});

test('a profit that is only its 2 best trades is not tier 2', () => {
  const v = verdictOf(book(j => j === 3 || j === 33 ? [30, 30, 0] : [-0.05, -0.06, -0.2]), { B: 10, bar: 1e9 });
  assert.notEqual(v.verdict, 'TRADABLE SMALL');
  assert.match(v.why, /2 best/);
});

const yt = (sym, tt, bull = 1) => ({ sym, tt, bull, src: 'yt' });
test('explicit bullish options calls on the named stock are counted', () => {
  assert.equal(isOptionsCall(yt('AMD', '🚀 AMD CALLS PRINTED! Is This Just the Beginning? 🔥')), true);
  assert.equal(isOptionsCall(yt('HOOD', 'This TRADE Paid for my Vacation | $1400 $HOOD Calls')), true);
  assert.equal(isOptionsCall({ sym: 'NVDA', bull: 1, src: 'st', tt: '$NVDA 200c 11/21 loading up' }), true);
  assert.equal(isOptionsCall(yt('BBAI', '7 Hidden Under $10 LEAPS Options I\'m Buying | BBAI my #1 2028 Pick')), true);
});

test('education, selling, other meanings of "call", funds, unnamed tickers and bearish posts are not', () => {
  assert.equal(isOptionsCall(yt('NVDA', 'What Is A Call Option? A Live Nvidia Trade, Explained')), false);
  assert.equal(isOptionsCall(yt('AMD', 'I Sold Covered Calls on My $1M AMD Position | Assigned!')), false);
  assert.equal(isOptionsCall(yt('TJX', 'Calls of the Day: TJX Companies and the XLU')), false);
  assert.equal(isOptionsCall(yt('IBKR', '17.8M Call Options Held by Hedge Funds │ BIG Catalyst Coming │ NIO Stock Analysis')), false);
  assert.equal(isOptionsCall(yt('SPY', 'SPY Calls RIPPED Off This One Level (30%+ Fast)')), false);
  assert.equal(isOptionsCall(yt('AMD', 'AMD calls are dead, I bought puts', 0)), false);
});

const S = ['2024-04-30', '2024-05-01', '2024-05-02', '2024-05-03', '2024-05-06'];
test('entry: before 9:30 New York on a session -> that open; during or after it -> the next session; a weekend -> Monday', () => {
  assert.equal(entrySession('2024-05-01T13:00:00Z', S), 1);   // 9:00 New York (summer time)
  assert.equal(entrySession('2024-05-01T13:30:00Z', S), 2);   // 9:30: the open has started, so the next session
  assert.equal(entrySession('2024-05-04T15:00:00Z', S), 4);   // Saturday -> Monday
  assert.equal(entrySession('2024-05-07T15:00:00Z', S), null);
});
