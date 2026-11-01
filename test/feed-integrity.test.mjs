// Feed integrity (1 Nov 2026): per-response SIP/IEX attribution, error handling and per-field provider clocks.
// Synthetic local fetchers only; no provider, credential or message. Run: node --test test/feed-integrity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshots, feedUsed, snapshotFeed, feedEvidence, resetFeed, COOLDOWN_CAP_MS } from '../alpaca-feed.mjs';
import { massiveSnapshot, alpacaSnapshot, mergeLiveSnapshot } from '../snapshot-fields.mjs';

const BASE = 'http://127.0.0.1:9';
const row = (v) => ({ latestTrade: { p: 10, t: '2026-10-30T14:00:00Z' }, dailyBar: { t: '2026-10-30T04:00:00Z', v } });
const reply = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => body });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const feedOf = (url) => new URL(url).searchParams.get('feed');

test('each payload carries the feed of its own response, even when concurrent requests race on a SIP 403', async () => {
  resetFeed(); const calls = [];
  // Part A: SIP 403 at 20 ms, then IEX at 80 ms. Part B: SIP 200 at 40 ms, between A's 403 and A's IEX answer.
  const f = async (url) => { const feed = feedOf(url), part = new URL(url).searchParams.get('symbols'); calls.push(feed + ':' + part);
    if (part === 'AAA' && feed === 'sip') { await sleep(20); return reply(403, {}); }
    if (part === 'AAA') { await sleep(80); return reply(200, { AAA: row(5e4) }); }
    await sleep(40); return reply(200, { BBB: row(3e6) }); };
  const [a, b] = await Promise.all([snapshots(BASE, ['AAA'], {}, f), snapshots(BASE, ['BBB'], {}, f)]);
  assert.equal(snapshotFeed(a), 'iex'); assert.equal(snapshotFeed(b), 'sip');
  assert.equal(feedUsed(), 'mixed', 'a run that saw both feeds must not claim one');
  assert.deepEqual(calls.sort(), ['iex:AAA', 'sip:AAA', 'sip:BBB']);
});

test('SIP 422 is a failed request, never an entitlement downgrade: no IEX request, nothing returned', async () => {
  resetFeed(); const calls = []; const f = async (url) => { calls.push(feedOf(url)); return reply(422, { message: 'invalid' }); };
  assert.equal(await snapshots(BASE, ['AAA'], {}, f), null);
  assert.deepEqual(calls, ['sip']); assert.equal(feedEvidence().lastFailure, 'HTTP_422'); assert.equal(feedUsed(), 'unobserved');
  assert.equal(await snapshots(BASE, ['AAA'], {}, f), null); assert.deepEqual(calls, ['sip', 'sip'], 'later requests still ask SIP');
});

test('forced SIP never falls back to IEX on 403', async () => {
  resetFeed(); process.env.ALPACA_FEED = 'sip'; const calls = [];
  try { assert.equal(await snapshots(BASE, ['AAA'], {}, async (url) => { calls.push(feedOf(url)); return reply(403, {}); }), null); }
  finally { delete process.env.ALPACA_FEED; }
  assert.deepEqual(calls, ['sip']);
});

test('an invalid forced feed is refused before any request', async () => {
  resetFeed(); process.env.ALPACA_FEED = 'delayed_sip'; let n = 0;
  try { assert.equal(await snapshots(BASE, ['AAA'], {}, async () => { n++; return reply(200, { AAA: row(1) }); }), null); }
  finally { delete process.env.ALPACA_FEED; }
  assert.equal(n, 0); assert.equal(feedEvidence().lastFailure, 'INVALID_FEED_CONFIGURATION');
});

test('429 is not retried; Retry-After is honoured but capped at 5 minutes', async () => {
  resetFeed(); let n = 0; const f = async () => { n++; return reply(429, {}, { 'retry-after': '86400' }); };
  const before = Date.now(); assert.equal(await snapshots(BASE, ['AAA'], {}, f), null); assert.equal(n, 1);
  const until = Date.parse(feedEvidence().cooldownUntil); assert.ok(until <= before + COOLDOWN_CAP_MS + 1000 && until > before + COOLDOWN_CAP_MS - 1000);
  assert.equal(await snapshots(BASE, ['AAA'], {}, f), null); assert.equal(n, 1, 'no request during the pause');
  assert.equal(feedEvidence().lastFailure, 'RATE_LIMIT_COOLDOWN');
});

test('network failure, non-JSON body and an unrequested symbol all return nothing (never a partial guess)', async () => {
  for (const [name, f] of [
    ['network', async () => { throw Error('ECONNRESET'); }],
    ['bad-json', async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => { throw SyntaxError('x'); } })],
    ['foreign-symbol', async () => reply(200, { AAA: row(1), ZZZ: row(1) })],
    ['error-object', async () => reply(200, { message: 'quota' })],
  ]) { resetFeed(); assert.equal(await snapshots(BASE, ['AAA'], {}, f), null, name); }
});

test('a null row is dropped for that symbol only; the rest of the batch is kept', async () => {
  resetFeed(); const j = await snapshots(BASE, ['AAA', 'BBB'], {}, async () => reply(200, { AAA: row(7), BBB: null }));
  assert.deepEqual(Object.keys(j), ['AAA']); assert.equal(snapshotFeed(j), 'sip');
});

test('only the Alpaca data origin or a local test service is accepted as a base', async () => {
  for (const base of ['https://evil.example', 'https://data.alpaca.markets/v2', 'http://data.alpaca.markets']) { resetFeed(); let n = 0;
    assert.equal(await snapshots(base, ['AAA'], {}, async () => { n++; return reply(200, { AAA: row(1) }); }), null, base); assert.equal(n, 0); }
});

test('Alpaca volume: SIP only, clocked by the same response\'s latest minute bar, never by the trade', () => {
  const x = { latestTrade: { p: 11, t: '2026-10-30T14:29:30Z' }, minuteBar: { t: '2026-10-30T14:28:00Z' }, dailyBar: { t: '2026-10-30T04:00:00Z', c: 11, v: 3e6 }, latestQuote: { bp: 10.99, ap: 11.01, t: '2026-10-30T14:29:31Z' } };
  const sip = alpacaSnapshot('AAA', x, true), iex = alpacaSnapshot('AAA', x, false);
  assert.equal(sip.vol, 3e6); assert.equal(sip.vt, Date.parse('2026-10-30T14:28:00Z')); assert.equal(sip.volumeFeed, 'sip');
  assert.equal(iex.vol, null); assert.equal(iex.vt, 0); assert.equal(iex.quoteFeed, 'iex'); assert.equal(iex.priceFeed, 'iex');
  assert.equal(sip.t, Date.parse('2026-10-30T14:29:30Z')); assert.equal(sip.qt, Date.parse('2026-10-30T14:29:31Z'));
  const noMinute = alpacaSnapshot('AAA', { ...x, minuteBar: undefined }, true); assert.equal(noMinute.vt, Date.parse('2026-10-30T04:00:00Z'), 'without a minute bar only the session start is known');
  const staleMinute = alpacaSnapshot('AAA', { ...x, minuteBar: { t: '2026-10-29T19:59:00Z' } }, true); assert.equal(staleMinute.vt, Date.parse('2026-10-30T04:00:00Z'), 'a minute bar from another session is not this volume\'s clock');
  const closeOnly = alpacaSnapshot('AAA', { dailyBar: { t: '2026-10-30T04:00:00Z', c: 12 }, latestTrade: { t: '2026-10-30T14:29:30Z' } }, true);
  assert.equal(closeOnly.price, 12); assert.equal(closeOnly.priceKind, 'DAILY_BAR'); assert.equal(closeOnly.t, Date.parse('2026-10-30T04:00:00Z'), 'a bar price never borrows the trade clock');
});

test('Massive price clock follows the price actually used; the snapshot "updated" time is never a price clock', () => {
  const u = 1793370000000;
  const trade = massiveSnapshot({ ticker: 'AAA', lastTrade: { p: 10, t: u * 1e6 }, min: { c: 9, t: u - 60000, av: 500 }, day: { c: 8, v: 900 }, updated: (u + 5000) * 1e6 });
  assert.equal(trade.t, u); assert.equal(trade.vt, u - 60000); assert.equal(trade.vol, 500);
  const dayOnly = massiveSnapshot({ ticker: 'AAA', day: { c: 8, v: 900 }, updated: (u + 5000) * 1e6 });
  assert.equal(dayOnly.price, 8); assert.equal(dayOnly.t, 0, 'a close with no clock must not look fresh');
});

test('merge: newer SIP volume replaces late Massive volume; IEX never does; future and crossed values never win', () => {
  const now = Date.parse('2026-10-30T14:30:00Z');
  const m = massiveSnapshot({ ticker: 'AAA', lastTrade: { p: 10, t: (now - 20 * 60000) * 1e6 }, min: { c: 10, t: now - 21 * 60000, av: 1e5 }, lastQuote: { p: 9.9, P: 10.1, t: (now - 20 * 60000) * 1e6 } });
  const x = { latestTrade: { p: 11, t: new Date(now - 30000).toISOString() }, minuteBar: { t: new Date(now - 60000).toISOString() }, dailyBar: { t: '2026-10-30T04:00:00Z', v: 3e6 }, latestQuote: { bp: 10.99, ap: 11.01, t: new Date(now - 30000).toISOString() } };
  const a = { ...m }; assert.equal(mergeLiveSnapshot(a, alpacaSnapshot('AAA', x, true), now), true);
  assert.equal(a.price, 11); assert.equal(a.vol, 3e6); assert.equal(a.volumeFeed, 'sip'); assert.equal(a.bid, 10.99); assert.equal(a.quoteFeed, 'sip');
  const b = { ...m }; mergeLiveSnapshot(b, alpacaSnapshot('AAA', x, false), now);
  assert.equal(b.price, 11); assert.equal(b.vol, 1e5, 'IEX volume is one venue only'); assert.equal(b.quoteFeed, 'iex', 'an IEX quote is labelled as IEX, not NBBO');
  const c = { ...m }; mergeLiveSnapshot(c, alpacaSnapshot('AAA', { ...x, latestTrade: { p: 50, t: new Date(now + 60000).toISOString() }, latestQuote: { bp: 11, ap: 10, t: new Date(now - 1000).toISOString() } }, true), now);
  assert.equal(c.price, 10, 'future trade clock refused'); assert.equal(c.bid, 9.9, 'crossed quote refused');
});
