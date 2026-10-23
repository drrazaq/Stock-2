// Seam: alpaca-feed.mjs. Owner upgrading to Alpaca Algo Trader Plus (23 Oct 2026): every live snapshot asks the full-market SIP feed
// first and falls back to IEX (the free plan) on 403, so nothing breaks before or after the upgrade and the run says which feed it used.
// Run: node test/alpaca-feed.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshots, feedUsed, resetFeed } from '../alpaca-feed.mjs';

const fake = (sipOk) => { const calls = []; const f = async (url) => { calls.push(url); const sip = /feed=sip/.test(url);
  if (sip && !sipOk) return { ok: false, status: 403, json: async () => ({ message: 'subscription does not permit querying recent SIP data' }) };
  return { ok: true, status: 200, json: async () => ({ AAA: { latestTrade: { p: 10 }, dailyBar: { v: sip ? 5e6 : 1e5 } } }) }; }; f.calls = calls; return f; };

test('upgraded plan: SIP is used and its full volume comes back', async () => {
  resetFeed(); const f = fake(true); const j = await snapshots('https://x', ['AAA'], {}, f);
  assert.equal(feedUsed(), 'sip'); assert.equal(j.AAA.dailyBar.v, 5e6); assert.equal(f.calls.length, 1);
});
test('free plan: SIP refused with 403, IEX used, and later calls go straight to IEX', async () => {
  resetFeed(); const f = fake(false); const j = await snapshots('https://x', ['AAA'], {}, f);
  assert.equal(feedUsed(), 'iex'); assert.equal(j.AAA.latestTrade.p, 10);
  await snapshots('https://x', ['AAA'], {}, f); assert.equal(f.calls.filter(u => /feed=sip/.test(u)).length, 1);
});
test('ALPACA_FEED=iex forces IEX', async () => {
  resetFeed(); process.env.ALPACA_FEED = 'iex'; const f = fake(true); await snapshots('https://x', ['AAA'], {}, f);
  assert.equal(feedUsed(), 'iex'); assert.ok(!f.calls.some(u => /feed=sip/.test(u))); delete process.env.ALPACA_FEED;
});
