import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const W=process.argv[2];
const {evaluateObservation,measurePaperExit,freezeProposal}=await import(W+'/reclaim-research-workflow.mjs');
const {ReclaimResearchStore}=await import(W+'/tools/a-catalyst-reclaim-store.mjs');
const ds=JSON.parse(fs.readFileSync(W+'/docs/a-catalyst-reclaim-pilot/storage/example.synthetic/input.synthetic.json','utf8'));
const pol=ds.policy, ok=ds.observations.find(o=>evaluateObservation(o,pol).result.status==='PAPER_SETUP_ONLY'), ex=ds.exits[ok.observationId];
const clone=x=>structuredClone(x), out={};
// P1 card shares vs modeled outcome shares
{const e=evaluateObservation(ok,pol),m=measurePaperExit(ok,pol,ex);out.P1={cardShares:e.result.card.paperShares,outcomeShares:m.shares,slip:pol.slippagePerSidePct,entryAsk:ok.quote.ask,budget:ok.paperBudgetUsd};
 const i2=clone(ok);i2.paperBudgetUsd=1000;i2.quote.ask=ok.quote.ask;let found=null;for(let a=5.0;a<60&&!found;a+=0.01){i2.quote.ask=+a.toFixed(2);i2.quote.bid=+(a*0.999).toFixed(2);const e2=evaluateObservation(i2,pol);if(e2.result.status!=='PAPER_SETUP_ONLY')continue;const s1=e2.result.card.paperShares,s2=Math.floor((1000-3)/(i2.quote.ask*(1+pol.slippagePerSidePct/100)));if(s1!==s2)found={ask:i2.quote.ask,cardShares:s1,outcomeShares:s2};}out.P1.mismatchExample=found;}
// P3 ZAD validity window
{const i=clone(ok);i.zadAsOf='2024-01-02T15:00:00Z';out.P3_oldZad=evaluateObservation(i,pol).result.status;}
// P4 source authentication is a label
{const i=clone(ok);i.catalyst.sourceUrl='https://example.invalid/anything';i.catalyst.documentHash='0'.repeat(64);out.P4_fakeSource=evaluateObservation(i,pol).result.status;}
// stores
const mk=()=>{const d=fs.mkdtempSync(path.join(process.argv[3],'st-'));fs.chmodSync(d,0o700);return d;};
// P5 stale lock after hard exit (simulate: open store, do not close)
{const d=mk();const s=new ReclaimResearchStore({directory:d,policy:pol,origin:'SYNTHETIC',implementationId:'probe'});s.recordObservation(ok);
 let r;try{new ReclaimResearchStore({directory:d,policy:pol,origin:'SYNTHETIC',implementationId:'probe'});r='opened';}catch(e){r=e.code||e.message;}out.P5_secondWriterWhileLocked=r;out.P5_inspect=ReclaimResearchStore.inspect(d).lockPresent;}
// P6 damaged tail
{const d=mk();const s=new ReclaimResearchStore({directory:d,policy:pol,origin:'SYNTHETIC',implementationId:'probe'});s.recordObservation(ok);s.close();fs.appendFileSync(path.join(d,'a-catalyst-reclaim-observations.jsonl'),'{"partial":');let r;try{ReclaimResearchStore.inspect(d);r='ok';}catch(e){r=e.message;}out.P6_damagedTail=r;}
// P7 second share class, same issuer/session, and P2 outcome choice
{const d=mk();const s=new ReclaimResearchStore({directory:d,policy:pol,origin:'SYNTHETIC',implementationId:'probe'});s.recordObservation(ok);
 const b=clone(ok);b.observationId=ok.observationId+'_CLASS_B';b.securityId=ok.securityId+'_B';b.catalyst.securityId=b.securityId;b.quote.securityId=b.securityId;b.bars.forEach(x=>x.securityId=b.securityId);b.symbol=ok.symbol.slice(0,3)+'B';b.quote.symbol=b.symbol;b.bars.forEach(x=>x.symbol=b.symbol);
 const p=s.recordObservation(b);out.P7={secondClassStatus:p.event.result.status,newPaperEntry:p.newPaperEntry,reason:p.reason,cards:ReclaimResearchStore.inspect(d).cards};
 const bad=clone(ex);bad.sessionCloses=bad.sessionCloses.slice(0,1);const u=s.recordOutcome(ok,bad);const m=s.recordOutcome(ok,ex);let again;try{const ex2=clone(ex);ex2.quote.bid=ex.quote.bid*1.05;ex2.quote.ask=Math.max(ex2.quote.ask,ex2.quote.bid);s.recordOutcome(ok,ex2);again='accepted';}catch(e){again=e.message;}
 out.P2={first:u.outcome.status+' '+u.outcome.reason,second:m.outcome.status,thirdDifferentEvidence:again,outcomesStored:ReclaimResearchStore.inspect(d).outcomes};s.close();}
console.log(JSON.stringify(out,null,1));
