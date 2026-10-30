import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCatalyst,headlineDirection} from '../early-alerts.mjs';
const now=Date.parse('2026-10-28T15:15:00Z');
const sec={known:true,filings:[{form:'8-K',items:'2.02,8.01,9.01',at:'2026-10-28T12:28:00Z',accession:'0001628280-26-067737'}]};
// Paraphrased fixtures based on issuer releases dated Oct 28; not a reconstruction
// of an unavailable original Finnhub response. Source URLs are retained for audit.
const repurchase={at:Date.parse('2026-10-28T11:25:00Z'),source:'Business Wire',id:1,url:'https://investor.progholdings.com/news-releases/news-release-details/prog-holdings-announces-intention-enter-100-million-accelerated',headline:'PROG announces intention to enter $100 million accelerated share repurchase program'};
const cut={at:Date.parse('2026-10-28T13:57:00Z'),source:'secondary fixture',id:2,url:'https://example.invalid/fixture',headline:'PROG Q3 results miss estimates; company cuts guidance'};
test('repurchase wording is positive interpretation, never a BUY approval',()=>{
 assert.equal(headlineDirection(repurchase.headline),'POSITIVE');
 const c=classifyCatalyst({sec,news:{ok:true,items:[repurchase]},nowMs:now});
 assert.equal(c.direction,'POSITIVE');assert.match(c.interpretation,/not verified economic impact/);assert.equal(c.evidence[1].url,repurchase.url);assert.equal('approved' in c,false);
});
test('PRG repurchase and guidance reduction remain separate, aggregate MIXED',()=>{
 const c=classifyCatalyst({sec,news:{ok:true,items:[repurchase,cut]},nowMs:now});
 assert.equal(c.direction,'MIXED');assert.equal(c.evidence.length,3);assert.equal(c.evidence[0].source,'SEC');
 assert.deepEqual(c.evidence.slice(1).map(x=>x.direction),['POSITIVE','NEGATIVE']);
});
test('positive headline does not erase dilution or make unknown sources available',()=>{
 const c=classifyCatalyst({sec:{known:true,filings:[{...sec.filings[0],items:'3.02'}]},news:{ok:true,items:[repurchase]},nowMs:now});assert.equal(c.direction,'DILUTION');
 const n=classifyCatalyst({sec:{known:false},news:{ok:true,items:[repurchase]},nowMs:now});assert.equal(n.cls,'UNCONFIRMED');assert.equal(n.sourceAvailability.sec,false);
});
