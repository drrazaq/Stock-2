// Synthetic quote/reference ports only; no provider, credential, private setup or key.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectIg1Entry,evaluateIg1Entry,collectIg1Entry} from '../tools/ig1-entry-evidence.mjs';
import {SealedAuditJournal} from '../tools/historical-sip-audit-client.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const reference={results:{ticker:'OPK',type:'CS',primary_exchange:'XNAS',cik:'1',share_class_figi:'BBG000000001'}};
const q=(overrides={})=>({t:'2026-10-15T13:49:00.000000001Z',z:'C',c:['R'],bp:1.53,ap:1.54,bs:1000,as:1000,...overrides});
const payload=quotes=>({symbol:'OPK',quotes,next_page_token:null});
const plan=inspectIg1Entry().plan;
const evaluate=quotes=>evaluateIg1Entry({reference,quoteConditions:{R:'Regular'},quotePayload:payload(quotes)},plan);
test('first regular quote is fixed before size/price: later favorable quote cannot rescue tiny first size',()=>{
 assert.equal(evaluate([q()]).status,'QUOTED_ENTRY_REFERENCE_PASSES');
 const v=evaluate([q({as:1}),q({t:'2026-10-15T13:49:01Z',as:100000,ap:1.535})]);
 assert.equal(v.status,'INCONCLUSIVE_FOR_CAPACITY');assert.equal(v.entryAsk,1.54);assert.equal(v.displayedTopOfBookAskSizeSufficient,false);
 const costly=evaluate([q({ap:1.57})]);assert.equal(costly.rawAskWithinLimit,true);assert.equal(costly.status,'QUOTED_ENTRY_REFERENCE_PASSES');assert.ok(costly.modeledEntry>plan.economics.literalAskLimit);assert.equal(costly.costModelAffectsPriceVerdict,false);assert.equal(costly.strategyAdmission,false);assert.equal(costly.outcomeChainComplete,false);
});
test('unobserved/partial/ambiguous quotes are inconclusive, never negative trading proof',()=>{
 assert.equal(evaluate([]).status,'INCONCLUSIVE');
 assert.equal(evaluate([q(),q({ap:1.55})]).reason,'FIRST_TIMESTAMP_AMBIGUOUS');
 const x=evaluateIg1Entry({reference,quoteConditions:{R:'Regular'},quotePayload:{...payload([q()]),next_page_token:'more'}},plan);
 assert.equal(x.reason,'FIRST_TIMESTAMP_PAGE_BOUNDARY_UNKNOWN');
 const page=evaluateIg1Entry({reference,quoteConditions:{R:'Regular'},quotePayload:{...payload([q(),q({t:'2026-10-15T13:49:01Z'})]),next_page_token:'more'}},plan);assert.equal(page.status,'QUOTED_ENTRY_REFERENCE_PASSES');
 const empty=evaluateIg1Entry({reference,quoteConditions:{R:'Regular'},quotePayload:{...payload([]),next_page_token:'more'}},plan);assert.equal(empty.reason,'QUOTE_PAGE_NO_ELIGIBLE_QUOTE');
 assert.equal(evaluate([q({ap:1.59})]).status,'QUOTED_ENTRY_REFERENCE_FAILS');assert.equal(evaluate([q({bp:1.54})]).lockedQuote,true);
 const oversized=evaluateIg1Entry({reference,quoteConditions:{R:'Regular'},quotePayload:payload(Array(8001).fill(q()))},plan);assert.equal(oversized.reason,'QUOTE_PAGE_INCOMPLETE');
 assert.equal(evaluate([q({t:'2026-10-15T13:49:30Z'})]).reason,'QUOTE_CLOCK_OR_TAPE_UNKNOWN');
});
test('no approval or expired window opens no private context; refusal stops without retry',async t=>{
 let opened=0;const open=()=>{opened++;throw Error('UNEXPECTED');};
 const denied=await collectIg1Entry({approval:null,openPrivateContext:open});assert.equal(denied.attempted,0);assert.equal(opened,0);
 const p=inspectIg1Entry(),runtime=fs.readFileSync('docs/a-first-capture-continuation/ig1-entry-runtime.json');
 const approval={executionApproved:true,planSha256:p.planSha256,runtimeManifestSha256:hash(runtime),ownerLocalExecutorReady:true,applicableProviderTermsReviewed:true,incrementalSpendLimitUsd:0,approvalRecordId:'SYNTHETIC_NOT_OWNER_APPROVAL',independentClaudeReview:{verdict:'PASS',planSha256:p.planSha256,runtimeManifestSha256:hash(runtime),url:'https://example.invalid/SYNTHETIC_NOT_REVIEW'}};
 approval.privateDirectory='/tmp/SYNTHETIC_NOT_CREATED';const expired=await collectIg1Entry({approval,clock:()=>Date.parse('2026-11-09T17:02:00Z'),openPrivateContext:open});assert.equal(expired.reason,'EXECUTION_WINDOW_CLOSED');assert.equal(opened,0);
 let calls=0;const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-entry-resolution-')),key=Buffer.alloc(32,7);fs.chmodSync(directory,0o700);t.after(()=>{key.fill(0);fs.rmSync(directory,{recursive:true,force:true});});
 const journal=new SealedAuditJournal(directory,key,5242880);
 approval.privateDirectory=directory;
 const no=await collectIg1Entry({approval,clock:()=>Date.parse('2026-11-09T17:00:00Z'),openPrivateContext:async()=>({ownerLocalOnly:true,exclusiveNewRunClaim:true,journal,transport:async()=>{calls++;return {status:403,body:Buffer.from('{"SYNTHETIC":"DENIED"}')};}})});
 const records=SealedAuditJournal.inspect(directory,key).events;
 assert.equal(calls,1);assert.equal(no.reason,'PROVIDER_REFUSAL');assert.equal(journal.closed,true);assert.equal(records.filter(x=>x.type==='RESPONSE').length,1);assert.equal(records.at(-1).type,'TERMINAL');
});
test('three synthetic responses traverse actual sealed journal and recover the same entry-only result',async t=>{
 const p=inspectIg1Entry(),runtime=fs.readFileSync('docs/a-first-capture-continuation/ig1-entry-runtime.json');
 const approval={executionApproved:true,planSha256:p.planSha256,runtimeManifestSha256:hash(runtime),ownerLocalExecutorReady:true,applicableProviderTermsReviewed:true,incrementalSpendLimitUsd:0,approvalRecordId:'SYNTHETIC_NOT_OWNER_APPROVAL',independentClaudeReview:{verdict:'PASS',planSha256:p.planSha256,runtimeManifestSha256:hash(runtime),url:'https://example.invalid/SYNTHETIC_NOT_REVIEW'}};
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-entry-resolution-')),key=Buffer.alloc(32,8);fs.chmodSync(directory,0o700);t.after(()=>{key.fill(0);fs.rmSync(directory,{recursive:true,force:true});});
 approval.privateDirectory=directory;
 const journal=new SealedAuditJournal(directory,key,5242880),requests=[],bodies=[reference,{R:'Regular'},payload([q()])];let at=Date.parse('2026-11-09T17:00:00Z');
 const result=await collectIg1Entry({approval,clock:()=>at,sleep:async ms=>{at+=ms;},openPrivateContext:async()=>({ownerLocalOnly:true,exclusiveNewRunClaim:true,journal,transport:async req=>{requests.push(req.path);return {status:200,body:Buffer.from(JSON.stringify(bodies[requests.length-1]))};}})});
 assert.deepEqual(requests,p.plan.requests.map(x=>x.path));assert.equal(result.attempted,3);assert.equal(result.status,'QUOTED_ENTRY_REFERENCE_PASSES');assert.equal(result.originalDetectionEstablished,false);assert.equal(result.outcomeChainComplete,false);assert.equal(result.profitability,'NOT_EVALUATED');
 const recovered=SealedAuditJournal.inspect(directory,key).events;assert.equal(recovered.filter(x=>x.type==='RESPONSE').length,3);assert.deepEqual(recovered.at(-1).result.status,result.status);assert.equal(recovered.filter(x=>x.type==='RESPONSE').reduce((n,x)=>n+Buffer.from(x.bodyBase64,'base64').length,0),result.rawBytes);
});
