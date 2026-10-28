import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadHurdle } from '../early-alerts.mjs';
const q = { price: 3, bid: 2.99, ask: 3.01 };
test('valid quote is fresh', () => assert.match(spreadHurdle({...q,qAgeSec:30}), /^Spread now /));
test('future quote is rejected', () => assert.match(spreadHurdle({...q,qAgeSec:-1}), /^Spread: no fresh quote/));
test('stale quote is rejected', () => assert.match(spreadHurdle({...q,qAgeSec:121}), /^Spread: no fresh quote/));
test('invalid prices are rejected', () => {for(const v of [{bid:NaN},{ask:Infinity},{bid:0},{ask:2.5}]) assert.match(spreadHurdle({...q,...v,qAgeSec:10}), /^Spread: no fresh quote/);});
