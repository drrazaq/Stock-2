// All bytes/clocks/identities below are SYNTHETIC; never prospective evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {openNativeRun,appendNativeResponse,appendNativeSubmissions,readNativeRun,nativeRunDigest} from '../native-sec-events.mjs';
import {createNativeSecShadow} from '../native-sec-shadow.mjs';
import {parseAtom,nyMinuteOf} from '../edgar-feed.mjs';
import {nativeEventPort} from '../paper-capture-ports.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),sha='a'.repeat(40),t=m=>new Date(Date.parse('2026-11-05T14:30:00Z')+60000*m).toISOString();
const atomUrl='https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom',subUrl='https://data.sec.gov/submissions/CIK0000000001.json';
const entry=(items='1.01')=>`<entry><title>8-K - SYNTHETIC (0000000001) (Filer)</title><summary>Item ${items}</summary><updated>${t(-2)}</updated><id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id></entry>`;
const feed=(items)=>Buffer.from('<feed>'+entry(items)+'</feed>');
const sub=(accept=t(-1))=>Buffer.from(JSON.stringify({cik:'0000000001',filings:{recent:{form:['8-K'],filingDate:['2026-11-05'],items:['1.01'],accessionNumber:['0000000001-26-000001'],acceptanceDateTime:[accept]}}}));
const fields=(m=0)=>({requestStartedAt:t(m-.02),headersReceivedAt:t(m-.01),bodyReceivedAt:t(m),observedAt:t(m)});
const atom=(m=0,items)=>({body:feed(items),url:atomUrl,httpStatus:200,legacySeen:new Set(),...fields(m)});
const submission=(m=-.5,accept)=>({body:sub(accept),url:subUrl,httpStatus:200,...fields(m)});
const create=(root,id,parent=null)=>openNativeRun({directory:path.join(root,id),runId:id,sourceSha:sha,provenance:'SYNTHETIC_FIXTURE',parent});
const read=s=>readNativeRun({directory:s.directory,expectedRunId:s.runId,expectedSourceSha:sha});
const pin=s=>({directory:s.directory,runId:s.runId,sourceSha:sha,sha256:nativeRunDigest(s.directory).sha256});
function fixture(fn){return async()=>{const root=fs.mkdtempSync('/tmp/sec-lineage-');try{await fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}};}
test('actual existing submissions response tee → persisted proof → Atom → pinned reader/capture event, no extra fetch',fixture(async root=>{
 const shadow=createNativeSecShadow({enabled:true,directory:path.join(root,'first'),runId:'first',sourceSha:sha,provenance:'SYNTHETIC_FIXTURE',now:()=>t(-.5)});
 const raw=sub(),response=new Response(raw);let consumes=0;const arrayBuffer=response.arrayBuffer.bind(response);response.arrayBuffer=()=>{consumes++;return arrayBuffer();};
 assert.equal((await shadow.readSubmissions(response,{url:subUrl,requestStartedAt:t(-.52)})).cik,'0000000001');assert.equal(consumes,1);
 shadow.observe(atom());const a=readNativeRun({directory:path.join(root,'first'),expectedRunId:'first',expectedSourceSha:sha});assert.equal(a.responses.length,2);assert.deepEqual(Buffer.from(a.responses[0].payload.bodyBase64,'base64'),raw);assert.equal(a.observations[0].acceptance.at,t(-1));assert.equal(a.observations[0].firstIngestedAt,t(0));assert.equal(a.observations[0].nativeEvidenceStatus,'COMPLETE_ORIGINAL_EVIDENCE');
 const events=JSON.parse(await nativeEventPort({directory:path.join(root,'first'),expectedRunId:'first',expectedSourceSha:sha})({at:t(1),identities:[{issuerCik:'0000000001',symbol:'SYNTH',securityId:'synthetic',asOf:t(-3),identityAudit:'DOCUMENTED_SOURCE_REVIEW'}]}));assert.equal(events.events[0].sourceAt,t(-1));assert.equal(events.events[0].observedAt,t(0));assert.equal(events.genuineAdmissions,0);
}));
test('pinned cross-run restart preserves first ingestion, revisions and original parent bytes, independent of parent availability',fixture(root=>{
 const first=create(root,'first');appendNativeSubmissions(first,submission());appendNativeResponse(first,atom());const parent=pin(first),old=nativeRunDigest(first.directory);const second=create(root,'second',parent);appendNativeResponse(second,atom(1));
 assert.equal(read(second).observations[0].firstIngestedAt,t(0));assert.equal(read(second).observations[0].producerRunId,'first');assert.equal(read(second).observations[0].duplicateCount,1);assert.deepEqual(nativeRunDigest(first.directory),old);
 fs.renameSync(first.directory,path.join(root,'preserved-original'));const restored=openNativeRun({directory:second.directory,runId:'second',sourceSha:sha,provenance:'SYNTHETIC_FIXTURE',parent:{...parent,directory:path.join(root,'preserved-original')}});appendNativeResponse(restored,atom(2,'2.02'));assert.equal(read(restored).observations[0].nativeEvidenceStatus,'REVISION_REQUIRES_REVIEW');assert.deepEqual(read(restored).lineageRunIds,['first','second']);
 const third=create(root,'third',pin(second));appendNativeResponse(third,atom(3));assert.equal(read(third).observations[0].firstIngestedAt,t(0));assert.equal(read(third).observations[0].revisionCount,2);
}));
test('late or contradictory submissions cannot retroactively admit an original observation',fixture(root=>{
 const s=create(root,'late');appendNativeResponse(s,atom());appendNativeSubmissions(s,submission(1));assert.equal(read(s).observations[0].nativeEvidenceStatus,'LATE_ACCEPTANCE_SUPPLEMENT_RESEARCH_ONLY');assert.equal(read(s).observations[0].acceptance.at,null);assert.equal(read(s).observations[0].acceptanceSupplements.length,1);
 const next=create(root,'next',pin(s));appendNativeResponse(next,atom(2));assert.equal(read(next).observations[0].nativeEvidenceStatus,'LATE_ACCEPTANCE_SUPPLEMENT_RESEARCH_ONLY');assert.equal(read(next).observations[0].firstObservedAt,t(0));
 const c=create(root,'conflict');appendNativeSubmissions(c,submission());appendNativeResponse(c,atom());appendNativeSubmissions(c,submission(1,t(-.9)));assert.equal(read(c).observations[0].nativeEvidenceStatus,'CONFLICTING_ACCEPTANCE_PROOFS');
}));
test('missing, partial, changed and provenance-mixed parents fail closed; first missing clocks never repaired',fixture(root=>{
 const s=create(root,'first');appendNativeResponse(s,{...atom(),legacySeen:new Set(['0000000001-26-000001|1'])});const p=pin(s);assert.throws(()=>create(root,'bad',{...p,sha256:'0'.repeat(64)}),/DIGEST/);
 const n=create(root,'next',p);appendNativeSubmissions(n,submission(1));appendNativeResponse(n,atom(2));assert.equal(read(n).observations[0].nativeEvidenceStatus,'ORIGINAL_FIRST_INGESTION_UNAVAILABLE');assert.equal(read(n).observations[0].firstObservedAt,null);
 fs.writeFileSync(path.join(s.directory,'response-000001.json.pending-crash'),'partial');assert.throws(()=>create(root,'partial',p),/INCOMPLETE/);assert.throws(()=>openNativeRun({directory:path.join(root,'native'),runId:'native',sourceSha:sha,provenance:'DECLARED_UNAUDITED_NATIVE',parent:pin(n)}),/INCOMPLETE/);
 const f=path.join(n.directory,'lineage.json'),original=fs.readFileSync(f);fs.writeFileSync(f,Buffer.concat([original,Buffer.from(' ')]));assert.throws(()=>read(n),/HASH/);
}));
test('malformed, mismatched issuer, failed and future proofs remain unavailable; nonmonotonic cross-run clocks rejected',fixture(root=>{
 for(const [id,input]of [['bad',{body:Buffer.from('{}')}],['issuer',{body:Buffer.from(sub().toString().replace('0000000001','0000000002'))}],['failure',{httpStatus:429}],['future',{body:sub(t(2))}]]){const s=create(root,id);appendNativeSubmissions(s,{...submission(),...input});appendNativeResponse(s,atom());assert.equal(read(s).observations[0].acceptance.at,null);assert.equal(read(s).observations[0].nativeEvidenceStatus,'ACCEPTANCE_UNAVAILABLE');}
 const a=create(root,'clock');appendNativeResponse(a,atom());const b=create(root,'clock-next',pin(a));assert.throws(()=>appendNativeResponse(b,atom(-1)),/NONMONOTONIC/);assert.equal(read(b).responses.length,0);
}));
test('actual proposed production secRiskIssuer and pollEdgar callers tee only existing responses and retain legacy outputs',fixture(async root=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../docs/validation/native-sec-shadow-production-manifest-v2.json',import.meta.url))),base=JSON.parse(gunzipSync(fs.readFileSync(new URL('../docs/validation/native-sec-shadow-base-v2.json.gz',import.meta.url))));
 for(const [file,text]of Object.entries(base.files)){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);assert.equal(hash(text),manifest.before[file]);}
 execFileSync('git',['init','-q'],{cwd:root,stdio:'ignore'});const patch=new URL('../docs/validation/native-sec-shadow-production-v2.patch',import.meta.url).pathname;execFileSync('git',['apply',patch],{cwd:root,stdio:'ignore'});for(const [file,h]of Object.entries(manifest.after))assert.equal(hash(fs.readFileSync(path.join(root,file))),h);
 const code=fs.readFileSync(path.join(root,'ignition-watch.mjs'),'utf8'),risk=code.slice(code.indexOf('async function secRiskIssuer('),code.indexOf('async function secRisk(sym)')),poll=code.slice(code.indexOf('async function pollEdgar('),code.indexOf('async function decideFilings('));
 let now=Date.parse(t(-.5)),calls=[];class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const shadow=createNativeSecShadow({enabled:true,directory:path.join(root,'evidence'),runId:'producer',sourceSha:sha,provenance:'SYNTHETIC_FIXTURE',now:()=>new Date(now).toISOString()});
 const EF={seen:new Set(),pending:[],last:0,first:true,polls:0,fails:0,filings:0,lat:[],firstOkM:null};
 const context=vm.createContext({Buffer,TextDecoder,Date:Clock,console,SEC_UA:'synthetic',SEC_DATA:'https://data.sec.gov',SEC_WWW:'https://www.sec.gov',NATIVE_SEC_SHADOW:shadow,EF,DAY4:Date.parse(t(-3)),parseAtom,nyMinuteOf,marketSymbol:x=>x,request:async url=>{calls.push(url);return new Response(url.includes('/submissions/')?sub():feed());},fetch:async url=>{calls.push(url);return new Response(feed());}});
 vm.runInContext('let TICK={SYNTH:1},secLogged=false;'+risk+poll+';globalThis.api={secRiskIssuer,pollEdgar};',context);
 const result=await context.api.secRiskIssuer('SYNTH');assert.equal(result.known,true);assert.equal(result.filings[0].accession,'0000000001-26-000001');now=Date.parse(t(0));await context.api.pollEdgar(570);assert.equal(calls.length,3);assert.equal(EF.pending.length,1);const a=readNativeRun({directory:path.join(root,'evidence'),expectedRunId:'producer',expectedSourceSha:sha});assert.equal(a.responses.length,3);assert.equal(a.observations[0].nativeEvidenceStatus,'COMPLETE_ORIGINAL_EVIDENCE');assert.equal(a.observations[0].acceptance.at,t(-1));assert.equal(a.genuineAdmissions,0);
 context.request=async()=>{throw Error('SYNTHETIC_REFUSAL');};now=Date.parse(t(1));assert.equal((await context.api.secRiskIssuer('SYNTH')).known,false);assert.equal(readNativeRun({directory:path.join(root,'evidence'),expectedRunId:'producer',expectedSourceSha:sha}).sourceStatus,'PARTIAL_OR_UNKNOWN');
}));

test('interrupted proof append suppresses capture while legacy response parsing survives; original bytes unchanged',fixture(async root=>{
 const s=create(root,'interrupted');appendNativeResponse(s,atom());const before=fs.readFileSync(path.join(s.directory,'response-000000.json'));fs.mkdirSync(path.join(s.directory,'.writer-lock'));
 const shadow=createNativeSecShadow({enabled:true,directory:s.directory,runId:s.runId,sourceSha:sha,provenance:'SYNTHETIC_FIXTURE',now:()=>t(1)});
 const result=await shadow.readSubmissions(new Response(sub()),{url:subUrl,requestStartedAt:t(.9)});assert.equal(result.cik,'0000000001');assert.equal(shadow.report().status,'UNKNOWN');assert.deepEqual(fs.readFileSync(path.join(s.directory,'response-000000.json')),before);assert.equal(read(s).status,'INCOMPLETE');
 await assert.rejects(nativeEventPort({directory:s.directory,expectedRunId:s.runId,expectedSourceSha:sha})({at:t(2),identities:[]}),/INCOMPLETE/);
}));
test('same-clock conflicting revisions across runs and duplicate ancestor run IDs remain unresolved',fixture(root=>{
 const a=create(root,'original');appendNativeResponse(a,atom());const b=create(root,'later',pin(a));appendNativeResponse(b,atom(0,'2.02'));assert.equal(read(b).observations[0].nativeEvidenceStatus,'CONFLICTING_SAME_OBSERVATION');
 assert.throws(()=>openNativeRun({directory:path.join(root,'reused'),runId:'original',sourceSha:sha,provenance:'SYNTHETIC_FIXTURE',parent:pin(b)}),/INCOMPLETE/);
}));
