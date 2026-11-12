import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {boundedQuoteFetcher,captureTwoQuotes} from '../tools/bounded-quotes.mjs';
import {inspectInputs,runCapture} from '../tools/quote-phase.mjs';
import {quoteHash} from '../private-quote-retention.mjs';import {makeScannerAssessmentRule} from '../discovery-runtime.mjs';
const NOW=Date.parse('2026-11-12T15:00:00Z'),iso=n=>new Date(NOW+n*1000).toISOString(),sourceSha='a'.repeat(40),checkout=path.resolve('.');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x,hash=x=>quoteHash(Buffer.from(JSON.stringify(canonical(x))));
function inputs(t){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bounded-private-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));const root=path.join(tmp,'input');fs.mkdirSync(root,{mode:0o700});
 const review={status:'INDEPENDENT_PROVENANCE_REVIEWED',at:iso(-600),comment:'https://github.com/drrazaq/Stock-2/pull/1#issuecomment-1'};
 const records=['TWLO','COST'].map((symbol,i)=>({symbol,securityId:'BBG00000000'+i,issuerCik:String(i+1),securityType:'CS',status:'INDEPENDENT_ISSUER_REVIEWED',knownAt:iso(-600),validFrom:iso(-600),validTo:null,review,source:'https://www.sec.gov/Archives/synthetic'}));
 const reference={kind:'REVIEWED_OFFICIAL_INSTRUMENT_CAPTURE_V1',records:records.map(r=>({observedAt:iso(-600),url:'https://api.massive.com/v3/reference/tickers/'+r.symbol,transport:'HTTPS_OFFICIAL_CAPTURE',raw:{status:'OK',results:{ticker:r.symbol,market:'stocks',locale:'us',type:'CS',share_class_figi:r.securityId}}}))};
 const rule=makeScannerAssessmentRule({logicVersion:1,sourceHash:'b'.repeat(64),variant:{fam:'cross',mult:2,tp:null,mf:false,fast:20,slow:50,maxHold:10},config:{ATR:14,TREND:200,TIME_STOP_DAYS:10,FLAT_R:1},targetOverlay:{mode:'none',x:null},ruleText:'SYNTHETIC existing crossover',variantKey:'CROSS20'});
 const rows=records.map((r,i)=>({type:'assessment',id:String(i+1).repeat(64),symbol:r.symbol,horizon:'short',recordedAt:iso(-10),evidenceVersion:'c'.repeat(64),ruleIdentityState:'IDENTIFIED',ruleId:rule.ruleId,ruleVersion:rule.ruleVersion,ruleDefinition:rule.definition}));
 const journal=Buffer.from(rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
 // synthetic=false here exercises the authentic-input gate shape only; all bytes are fixtures.
 const evaluation={kind:'EVALUATED_ASSESSMENT_INPUT_V1',synthetic:false,review,journalSha256:quoteHash(journal),evaluations:rows.map(r=>({assessmentId:r.id,symbol:r.symbol,ruleId:r.ruleId,ruleVersion:r.ruleVersion,evidenceVersion:r.evidenceVersion,definitionSha256:hash(rule.definition),sourceSha256:'d'.repeat(64),observedAt:iso(-5),expiresAt:iso(60),setup:'UNKNOWN',verdict:'NOT PROVEN',population:{status:'PARTIAL'}}))};
 const files={};function put(n,v){const b=Buffer.isBuffer(v)?v:Buffer.from(JSON.stringify(v));files[n]=b;fs.writeFileSync(path.join(root,n),b,{mode:0o600});}
 put('identities.json',{records});put('policy.json',{kind:'PRIVATE_QUOTE_RETENTION_POLICY_V1',review,reviewedProducerShas:[sourceSha],identity:{path:'identities.json',sha256:quoteHash(files['identities.json'])}});put('instrument-reference.json',reference);put('journal.jsonl',journal);put('evaluation.json',evaluation);put('assessment-policy.json',{kind:'PRIVATE_ASSESSMENT_POLICY_V1',review,evaluationSha256:quoteHash(files['evaluation.json'])});
 const a={kind:'BOUNDED_PRIVATE_EVIDENCE_ADMISSION_V1',sourceSha,authorizedPhase:'quote-capture',ownerLinked:false,independentIssuerReview:true,entitlementAndHostedTermsVerified:true,enrollmentVerified:true,zeroSpendVerified:true,storageReservedMiB:25,maxProviderGETs:2,maxRunnerMinutes:3,symbols:['TWLO','COST'],notBefore:iso(-1),latestStart:iso(60),approvalComment:review.comment,files:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,quoteHash(b)]))};put('admission.json',a);
 return {tmp,root,files,a,pin:quoteHash(files['admission.json'])};
}
const options={method:'GET',redirect:'error'},url='https://data.alpaca.markets/v2/stocks/snapshots?feed=sip&symbols=TWLO,COST';
test('actual snapshots SIP403 -> IEX only, captures both receipts with original attribution',async()=>{
 const events=[],calls=[];const r=await captureTwoQuotes({fetcher:async u=>{calls.push(u);return calls.length===1?new Response('{}',{status:403}):Response.json({TWLO:{latestQuote:{t:iso(-1)}},COST:{latestQuote:{t:iso(-1)}}});},onReceipt:e=>events.push(e)});
 assert.equal(calls.length,2);assert.match(calls[1],/feed=iex/);assert.deepEqual(events.map(e=>[e.feed,e.outcome]),[['sip','HTTP_FAILURE'],['iex','SUCCESS']]);assert.equal(r.transport.calls,2);
});
test('429, network error, invalid JSON and oversized403 never retry or downgrade',async()=>{
 for(const response of [()=>new Response('{}',{status:429}),()=>{throw Error('network');},()=>new Response('{bad'),()=>new Response('x'.repeat(1048577),{status:403})]){
  let n=0;const r=await captureTwoQuotes({fetcher:async()=>{n++;return response();}});assert.equal(n,1);assert.equal(r.payload,null);
 }
});
test('wrapper refuses scope, third request, body stream cap, expired phase and stalled transport',async()=>{
 const f=boundedQuoteFetcher({fetcher:async()=>new Response('{}')});await assert.rejects(()=>f.fetch(url.replace('TWLO','ZZQ'),options));
 const b=boundedQuoteFetcher({fetcher:async()=>new Response('x'.repeat(1048577))});await assert.rejects(()=>b.fetch(url,options));assert.equal(b.report().stopped,true);
 let time=0;const c=boundedQuoteFetcher({monotonic:()=>time,fetcher:async()=>new Response('{}')});time=30001;await assert.rejects(()=>c.fetch(url,options));
 const slow=boundedQuoteFetcher({perRequestMs:5,fetcher:async(u,o)=>new Promise((r,j)=>o.signal.addEventListener('abort',()=>j(Error('aborted'))))});await assert.rejects(()=>slow.fetch(url,options));
 const d=boundedQuoteFetcher({fetcher:async()=>new Response('{}',{status:403})});await d.fetch(url,options);await d.fetch(url.replace('sip','iex'),options);await assert.rejects(()=>d.fetch(url,options));
});
test('preflight pins and expiry fail before a provider call; extra private file rejected',async t=>{
 const f=inputs(t);assert.throws(()=>inspectInputs(f.root,'0'.repeat(64),{sourceSha,now:NOW}));assert.throws(()=>inspectInputs(f.root,f.pin,{sourceSha,now:NOW+61000}));
 fs.writeFileSync(path.join(f.root,'holdings.json'),'{}');let calls=0;await assert.rejects(()=>runCapture({input:f.root,manifestPin:f.pin,sourceSha,checkout,output:path.join(f.tmp,'out'),privateBase:path.join(f.tmp,'private'),fetcher:async()=>{calls++;}}));assert.equal(calls,0);
});
test('actual same-process producer/DeltaA reader -> static report -> ZIP -> distinct-process restore preserves bytes and clocks',async t=>{
 const f=inputs(t),out=path.join(f.tmp,'out');let calls=0;const old=Date.now;Date.now=()=>NOW;
 try{await runCapture({input:f.root,manifestPin:f.pin,sourceSha,checkout,output:out,privateBase:path.join(f.tmp,'private'),now:()=>NOW,fetcher:async()=>{calls++;return Response.json(Object.fromEntries(['TWLO','COST'].map(s=>[s,{latestQuote:{t:iso(-1),bp:99,ap:100,bs:5,as:5,c:['R']}}])));}});}finally{Date.now=old;}
 assert.equal(calls,1);const text=fs.readFileSync(path.join(out,'owner-report.txt'),'utf8');assert.match(text,/AS-OF SNAPSHOT — NOT A CURRENT QUOTE/);assert.match(text,/ZAD UNKNOWN/);assert.match(text,/PARTIAL_COVERAGE/);assert.doesNotMatch(text,/ADEQUATELY_OBSERVED/);
 const zip=path.join(f.tmp,'recovery.zip');execFileSync('python3',['tools/evidence-custody.py','pack',out,zip]);const pin=quoteHash(fs.readFileSync(zip)),restored=path.join(f.tmp,'restored');
 execFileSync('python3',['tools/evidence-custody.py','recover',zip,pin,restored]);execFileSync(process.execPath,['tools/recovery-check.mjs',restored,path.join(f.tmp,'restored-private')]);
 for(const n of fs.readdirSync(out))assert.deepEqual(fs.readFileSync(path.join(out,n)),fs.readFileSync(path.join(restored,n)));
 assert.throws(()=>execFileSync('python3',['tools/evidence-custody.py','recover',zip,'0'.repeat(64),path.join(f.tmp,'bad')],{stdio:'pipe'}));
});
test('synthetic mobile artifact stays tiny, plain UTF8 and contains no credentials/market evidence',t=>{
 const f=inputs(t),zip=path.join(f.tmp,'mobile.zip');execFileSync('python3',['tools/evidence-custody.py','rehearsal',zip]);assert.ok(fs.statSync(zip).size<65536);
 const text=execFileSync('python3',['-c','import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read("mobile-access-fixture.txt").decode())',zip],{encoding:'utf8'});assert.match(text,/SYNTHETIC ACCESS TEST/);assert.match(text,/Expiry UTC/);assert.match(text,/NOT A CURRENT QUOTE/);
});
test('invalid independent identities, scope and synthetic-marked inputs stop before acquisition',async t=>{
 for(const change of [f=>{const x=JSON.parse(f.files['identities.json']);x.records[0].status='REFERENCE_ONLY';return ['identities.json',x];},f=>{const x=JSON.parse(f.files['evaluation.json']);x.synthetic=true;return ['evaluation.json',x];},f=>{const x=JSON.parse(f.files['evaluation.json']);x.evaluations.pop();return ['evaluation.json',x];}]){
  const f=inputs(t),[n,x]=change(f),b=Buffer.from(JSON.stringify(x));fs.writeFileSync(path.join(f.root,n),b);f.a.files[n]=quoteHash(b);
  const admission=Buffer.from(JSON.stringify(f.a));fs.writeFileSync(path.join(f.root,'admission.json'),admission);let calls=0;
  await assert.rejects(()=>runCapture({input:f.root,manifestPin:quoteHash(admission),sourceSha,checkout,output:path.join(f.tmp,'out'),privateBase:path.join(f.tmp,'private'),now:()=>NOW,fetcher:async()=>{calls++;}}));assert.equal(calls,0);
 }
});
test('actual source verifier binds approved HEAD and recovery-only child; drift and rerun fail closed',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'source-gate-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const manifest=JSON.parse(fs.readFileSync('docs/evidence-source-manifest.json'));
 for(const n of [...Object.keys(manifest.files),'docs/evidence-source-manifest.json','docs/reference-only-scope.json']){const p=path.join(tmp,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(n,p);}
 const env={...process.env,GIT_AUTHOR_NAME:'Stock-2 scanner',GIT_AUTHOR_EMAIL:'scanner@users.noreply.github.com',GIT_COMMITTER_NAME:'Stock-2 scanner',GIT_COMMITTER_EMAIL:'scanner@users.noreply.github.com'};
 const git=(...a)=>execFileSync('git',a,{cwd:tmp,env,stdio:['ignore','pipe','pipe']}).toString().trim();git('init','-q');git('add','.');git('commit','-qm','Synthetic private source fixture');const head=git('rev-parse','HEAD');
 const run=more=>execFileSync('python3',['tools/evidence-source-verify.py'],{cwd:tmp,env:{...env,EXPECTED_MAIN_SHA:head,GITHUB_WORKFLOW_SHA:head,GITHUB_RUN_ATTEMPT:'1',GITHUB_REF_NAME:'main',EVIDENCE_PHASE:'rehearsal',LATEST_START_UTC:new Date(Date.now()+60000).toISOString(),...more},stdio:'pipe'});
 run();assert.throws(()=>run({GITHUB_RUN_ATTEMPT:'2'}));fs.writeFileSync(path.join(tmp,'quote-owner-recovery.zip'),'SYNTHETIC');git('add','quote-owner-recovery.zip');git('commit','-qm','Synthetic owner recovery child');run({EVIDENCE_PHASE:'recovery'});
 fs.appendFileSync(path.join(tmp,'tools/quote-phase.mjs'),'\n// altered\n');assert.throws(()=>run({EVIDENCE_PHASE:'recovery'}));
});
