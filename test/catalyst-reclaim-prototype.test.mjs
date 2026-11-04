import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessReclaim} from '../catalyst-reclaim-prototype.mjs';
const policy = {id:'UNAPPROVED-RECLAIM-PROTOTYPE-1', minPrice:2, minDollarVolume:500000, maxSpreadPct:3, maxQuoteAgeMs:30000, materialityRatio:0.1, openingBarMs:300000, invalidationContract:'PROPOSED ONLY: exit next open after close below opening low', exitContract:'PROPOSED ONLY: close of session 5; execution evaluation required'};
function fixture() {
  const bar = (start,end,open,high,low,close,n) => ({symbol:'TEST',start,end,open,high,low,close,evidenceId:`synthetic-bar-${n}`});
  return {symbol:'TEST',instrument:'US_COMMON_STOCK',zad:'YES',asOf:'2026-11-04T14:45:05Z', sessionOpen:'2026-11-04T14:30:00Z',sessionClose:'2026-11-04T21:00:00Z',prior20DayDollarVolume:1000000,paperBudgetUsd:1000,
    catalyst:{sourceId:'synthetic-document',documentHash:'synthetic-hash',verification:'VERIFIED_MATERIAL_AGREEMENT',publishedAt:'2026-11-04T13:00:00Z',observedAt:'2026-11-04T13:01:00Z',firstTradableSessionOpen:'2026-11-04T14:30:00Z',contractValueUsd:20000000,priorMarketCapUsd:100000000,marketCapAsOf:'2026-11-03T21:00:00Z'},
    quote:{symbol:'TEST',source:'SYNTHETIC',evidenceId:'synthetic-quote',at:'2026-11-04T14:45:04Z',bid:10.49,ask:10.5,bidSize:1000,askSize:1000},
    bars:[bar('2026-11-04T14:30:00Z','2026-11-04T14:35:00Z',10,10.4,9.9,10.3,1),bar('2026-11-04T14:35:00Z','2026-11-04T14:40:00Z',10.3,10.35,10.1,10.2,2),bar('2026-11-04T14:40:00Z','2026-11-04T14:45:00Z',10.2,10.6,10.15,10.5,3)]};
}
test('valid synthetic sequence yields paper-only card, whole shares and no mutation',()=>{const x=fixture(),before=JSON.stringify(x),p=JSON.stringify(policy),r=assessReclaim(x,policy);assert.equal(r.status,'PAPER_SETUP_ONLY');assert.equal(r.actionable,false);assert.equal(r.realDollars,0);assert.equal(r.card.entryIsFill,false);assert.equal(r.card.paperShares,94);assert.equal(JSON.stringify(x),before);assert.equal(JSON.stringify(policy),p);});
const controls = [
 ['options excluded',x=>x.instrument='OPTION','UNSUPPORTED_INSTRUMENT'],
 ['impossible session date',x=>x.sessionOpen='2026-02-30T14:30:00Z','INVALID_SESSION_CLOCK'],
 ['ZAD required',x=>x.zad='UNKNOWN','ZAD_NOT_CONFIRMED'],
 ['stale quote',x=>x.quote.at='2026-11-04T14:40:00Z','STALE_OR_INVALID_QUOTE_CLOCK'],
 ['future quote',x=>x.quote.at='2026-11-04T14:46:00Z','STALE_OR_INVALID_QUOTE_CLOCK'],
 ['wrong ticker',x=>x.quote.symbol='OTHER','INVALID_QUOTE'],
 ['insufficient ask size',x=>x.quote.askSize=1,'INSUFFICIENT_DISPLAYED_ENTRY_SIZE'],
 ['wide spread',x=>x.quote.bid=9,'SPREAD_TOO_WIDE'],
 ['unknown catalyst',x=>x.catalyst.verification='HEADLINE_ONLY','UNVERIFIED_CATALYST'],
 ['future observation',x=>x.catalyst.observedAt='2026-11-04T15:00:00Z','CATALYST_CLOCK_OR_SESSION_UNRESOLVED'],
 ['market cap hindsight',x=>x.catalyst.marketCapAsOf='2026-11-04T14:00:00Z','MISSING_POINT_IN_TIME_MATERIALITY'],
 ['missing first-session binding',x=>delete x.catalyst.firstTradableSessionOpen,'FIRST_TRADABLE_SESSION_UNVERIFIED'],
 ['low breached',x=>x.bars[1].low=9.8,'OPENING_LOW_NOT_HELD'],
 ['no reclaim',x=>x.bars[2].close=10.3,'NO_COMPLETED_PULLBACK_RECLAIM'],
 ['bar gaps',x=>x.bars[1].start='2026-11-04T14:36:00Z','INVALID_OR_GAPPED_BAR_EVIDENCE'],
 ['future completed bar',x=>{x.asOf='2026-11-04T14:44:59Z';x.quote.at=x.asOf;},'INVALID_OR_GAPPED_BAR_EVIDENCE'],
 ['expired session',x=>x.asOf=x.sessionClose,'OUTSIDE_ENTRY_SESSION'],
 ['quote before trigger',x=>x.quote.at='2026-11-04T14:44:59Z','ENTRY_QUOTE_NOT_PAIRED_TO_NEW_TRIGGER'],
 ['missing policy',()=>{},'INCOMPLETE_PROPOSED_POLICY']
];
for(const [name,mutate,reason] of controls) test(name,()=>{const x=fixture();mutate(x);const r=assessReclaim(x,name==='missing policy'?null:policy);assert.equal(r.reason,reason);assert.equal(r.actionable,false);assert.equal(r.realDollars,0);assert.equal(r.card,undefined);});
