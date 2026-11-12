// DEVELOPMENT ONLY. No network, credentials, orders, public publication or automatic deletion.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {marketClock} from './market-session.mjs';
import {readAssessmentQuote} from './assessment-quote-context.mjs';
export const quoteHash=b=>createHash('sha256').update(b).digest('hex');
const MAX=32*1024*1024, MAXFILE=4*1024*1024;
const bytes=x=>Buffer.from(JSON.stringify(x));
const stamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const fail=reason=>({status:'UNKNOWN',reason,currentBbo:false,fillClaim:false,tradePriceSubstitution:false,entryApproval:false});
function file(root,name,max=MAXFILE){
 if(!/^[a-zA-Z0-9_.-]+$/.test(name)||name==='.'||name==='..')throw Error('UNSAFE_PATH');
 const p=path.join(root,name),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('UNSAFE_FILE');
 const b=fs.readFileSync(p);if(b.length>max)throw Error('FILE_CAP');return b;
}
function privateRoot(root,checkout){
 if(!path.isAbsolute(root)||fs.lstatSync(root).isSymbolicLink())throw Error('PRIVATE_ROOT_REQUIRED');
 root=fs.realpathSync(root);const source=fs.realpathSync(checkout);
 if(root===source||root.startsWith(source+path.sep))throw Error('PUBLIC_CHECKOUT_FORBIDDEN');
 if((fs.statSync(root).mode&0o077)!==0)throw Error('PRIVATE_DIRECTORY_PERMISSIONS');
 return root;
}
function policyAt(root,pin){
 const b=file(root,'policy.json',131072);if(!/^[a-f0-9]{64}$/.test(pin)||quoteHash(b)!==pin)throw Error('POLICY_PIN');
 const p=JSON.parse(b);
 if(p.kind!=='PRIVATE_QUOTE_RETENTION_POLICY_V1'||p.review?.status!=='INDEPENDENT_PROVENANCE_REVIEWED'||!/^https:\/\/github.com\/drrazaq\/Stock-2\/pull\/1#issuecomment-\d+$/.test(p.review.comment||'')||!stamp(p.review.at)||!Array.isArray(p.reviewedProducerShas)||p.reviewedProducerShas.length!==1||!/^[a-f0-9]{40}$/.test(p.reviewedProducerShas[0])||p.identity?.path!=='identities.json')throw Error('POLICY_SCHEMA');
 const id=file(root,p.identity.path);if(quoteHash(id)!==p.identity.sha256)throw Error('IDENTITY_PIN');
 const identities=JSON.parse(id);if(!Array.isArray(identities.records)||identities.records.length>30000)throw Error('IDENTITY_SCHEMA');
 return {p,identities:identities.records};
}
function atomic(root,name,b){
 const tmp='tmp-'+randomUUID();const fd=fs.openSync(path.join(root,tmp),'wx',0o600);
 try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(path.join(root,tmp),path.join(root,name));
 const dir=fs.openSync(root,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
function immutable(root,name,b){const fd=fs.openSync(path.join(root,name),'wx',0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function usage(root){return fs.readdirSync(root).filter(n=>n!=='.writer.lock').reduce((n,k)=>n+file(root,k,MAX).length,0);}
const size=x=>Number.isInteger(x)&&x>0?x:null;
// Current official Alpaca schema: sizes are SHARES since 2025-11-03. Never apply an old 100x convention.
// https://docs.alpaca.markets/us/reference/stocklatestquotesingle-1
function normalized(symbol,row,event,ids){
 const q=row?.latestQuote,qt=q?.t,received=event.receivedAt;
 const id=ids.filter(r=>r.symbol===symbol&&r.status==='INDEPENDENT_ISSUER_REVIEWED');
 const sid=new Set(id.map(r=>r.securityId)).size===1?id[0]?.securityId:null;
 const nativeBid=size(q?.bs),nativeAsk=size(q?.as),conditions=Array.isArray(q?.c)&&q.c.length<=32&&q.c.every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(x))?q.c:null;
 return {symbol,securityId:sid||null,issuerCik:id.length===1?id[0].issuerCik:null,source:'WATCHER_NORMALIZED_BBO',provider:'ALPACA',feed:event.feed,quoteAsOf:stamp(qt)?qt:null,at:received,requestStartedAt:event.requestStartedAt,session:marketClock(Date.parse(received)).day,providerSession:stamp(qt)?marketClock(Date.parse(qt)).day:null,bid:typeof q?.bp==='number'?q.bp:null,ask:typeof q?.ap==='number'?q.ap:null,bidSizeNative:nativeBid,askSizeNative:nativeAsk,sizeUnit:stamp(qt)&&qt.slice(0,10)>='2025-11-03'?'SHARES':'UNESTABLISHED_HISTORICAL_UNITS',bidSizeShares:stamp(qt)&&qt.slice(0,10)>='2025-11-03'?nativeBid:null,askSizeShares:stamp(qt)&&qt.slice(0,10)>='2025-11-03'?nativeAsk:null,conditions,adjustmentBasis:'AS_OBSERVED',expiresAt:stamp(qt)?new Date(Math.min(Date.parse(qt),Date.parse(received))+120000).toISOString():null};
}
export function createPrivateQuoteRetention({root,checkout,policySha256,sourceSha,runId,now=()=>Date.now()}){
 root=privateRoot(root,checkout);const {p,identities}=policyAt(root,policySha256);
 if(!p.reviewedProducerShas.includes(sourceSha)||!Number.isFinite(now())||Date.parse(p.review.at)>now()||!/^[-a-zA-Z0-9_]{1,80}$/.test(runId))throw Error('UNREVIEWED_PRODUCER_OR_RUN');
 fs.mkdirSync(path.join(root,'.writer.lock'),{mode:0o700});
 let closed=false,stopped=false,rows=0,attempts=0,generation=0,pending=false;const latest=new Map();
 if(fs.existsSync(path.join(root,'current.json'))||fs.existsSync(path.join(root,'receipts.jsonl'))){fs.rmdirSync(path.join(root,'.writer.lock'));throw Error('FRESH_RUN_ROOT_REQUIRED');}
 const stop=()=>{stopped=true;atomic(root,'current.json',bytes({kind:'PRIVATE_QUOTE_POINTER_V1',status:'UNAVAILABLE',reason:'CAPTURE_FAILED',runId}));};
 const report=()=>({status:stopped?'STOPPED':closed?'CLOSED':generation?'RETAINING':'AWAITING_CYCLE',observations:rows,attempts,generations:generation});
 return {
  root,report,
  capture(event){
   if(closed||stopped)throw Error('RETENTION_STOPPED');
   try{
    if(event.provider!=='ALPACA'||!['sip','iex'].includes(event.feed)||!stamp(event.receivedAt)||!stamp(event.requestStartedAt)||Date.parse(event.requestStartedAt)>Date.parse(event.receivedAt)||Date.parse(event.receivedAt)>now()||!['SUCCESS','HTTP_FAILURE','NETWORK_ERROR','INVALID_SNAPSHOT_JSON'].includes(event.outcome)||(event.outcome==='SUCCESS'&&(!event.payload||typeof event.payload!=='object'||Array.isArray(event.payload))))throw Error('RECEIPT_PROVENANCE');
    const scoped=event.requestedSymbols||Object.keys(event.payload||{});
    if(!Array.isArray(scoped)||scoped.length>30000||new Set(scoped).size!==scoped.length||scoped.some(s=>typeof s!=='string'||!/^[-A-Z0-9.]{1,15}$/.test(s)))throw Error('REQUEST_SCOPE');
    if(event.payload&&Object.keys(event.payload).some(s=>!scoped.includes(s)))throw Error('RESPONSE_SCOPE');
    const additions=scoped.map(symbol=>({...normalized(symbol,event.payload?.[symbol],event,identities),captureOutcome:event.outcome}));
    if(rows+additions.length>30000||attempts>=30000)throw Error('RUN_ROW_OR_ATTEMPT_CAP');
    const attempt={provider:event.provider,feed:event.feed,requestStartedAt:event.requestStartedAt,receivedAt:event.receivedAt,outcome:event.outcome,httpStatus:Number.isInteger(event.httpStatus)?event.httpStatus:null,rows:additions.length};
    const line=Buffer.concat([bytes({attempt,quotes:additions}),Buffer.from('\n')]);
    if(line.length>MAXFILE||usage(root)+line.length+4096>MAX)throw Error('RUN_STORAGE_CAP');
    const fd=fs.openSync(path.join(root,'receipts.jsonl'),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW,0o600);
    try{fs.writeFileSync(fd,line);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    for(const q of additions){const old=latest.get(q.symbol);if(!old||q.at>old[0].at)latest.set(q.symbol,[q]);else if(q.at===old[0].at){if(q.captureOutcome!=='SUCCESS'||old.every(x=>x.captureOutcome!=='SUCCESS'))latest.set(q.symbol,[q]);else old.push(q);}}
    rows+=additions.length;attempts++;pending=true;return report();
   }catch(error){stop();throw error;}
  },
  publish(){
   if(closed||stopped)return report();if(!pending)return report();
   try{
    if(generation>=8)throw Error('RUN_GENERATION_CAP');
    const book=bytes({kind:'RESEARCH_ONLY',sourceSha,runId,quotes:[...latest.values()].flat()}),compressed=zlib.gzipSync(book);
    if(book.length>16*1024*1024||compressed.length>MAXFILE)throw Error('ARCHIVE_CAP');
    const n=generation+1,archive='quotes-'+n+'.json.gz',manifest='join-'+n+'.json';
    const m=bytes({kind:'ASSESSMENT_PRIVATE_QUOTE_JOIN_V1',review:p.review,reviewedProducerShas:p.reviewedProducerShas,identity:p.identity,archives:[{path:archive,sha256:quoteHash(compressed)}]});
    const publishedMs=now(),publishedAt=new Date(publishedMs).toISOString();
    const pointer=bytes({kind:'PRIVATE_QUOTE_POINTER_V1',status:'PUBLISHED',runId,generation:n,manifest,manifestSha256:quoteHash(m),publishedAt,expiresAt:new Date(publishedMs+120000).toISOString()});
    if(usage(root)+compressed.length+m.length+pointer.length+4096>MAX)throw Error('RUN_STORAGE_CAP');
    immutable(root,archive,compressed);immutable(root,manifest,m);atomic(root,'current.json',pointer);
    generation=n;pending=false;return report();
   }catch(error){stop();throw error;}
  },
  close(){if(!closed){closed=true;fs.rmdirSync(path.join(root,'.writer.lock'));}},
 };
}
// An optional research recorder must never take down the scanner. Old locks are never stolen.
export function startPrivateQuoteRetention(options){
 if(!options?.root)return {capture:undefined,publish:()=>{},close:()=>{},report:()=>({status:'OFF'})};
 try{
  const base=privateRoot(options.root,options.checkout);policyAt(base,options.policySha256);
  if(!/^[-a-zA-Z0-9_]{1,80}$/.test(options.runId))throw Error('RUN');
  const root=path.join(base,options.runId);fs.mkdirSync(root,{mode:0o700});
  for(const name of ['policy.json','identities.json'])immutable(root,name,file(base,name));
  return createPrivateQuoteRetention({...options,root});
 }catch{return {capture:undefined,publish:()=>{},close:()=>{},report:()=>({status:'DISABLED_INITIALIZATION_FAILED'})};}
}
export function readPrivateAssessmentQuote(symbol,{root,policySha256,now=Date.now()}={}){
 try{
  if(!root||!Number.isFinite(now))return fail('PRIVATE_POINTER_NOT_CONFIGURED');
  if(!path.isAbsolute(root)||fs.lstatSync(root).isSymbolicLink()||(fs.statSync(root).mode&0o077)!==0)throw Error('PRIVATE_ROOT');
  const {p}=policyAt(root,policySha256),q=JSON.parse(file(root,'current.json',8192));
  if(q.kind!=='PRIVATE_QUOTE_POINTER_V1'||q.status!=='PUBLISHED')return fail('PRIVATE_POINTER_UNAVAILABLE');
  if(!stamp(q.publishedAt)||!stamp(q.expiresAt)||Date.parse(q.publishedAt)>now||Date.parse(q.expiresAt)!==Date.parse(q.publishedAt)+120000||now>Date.parse(q.expiresAt))return fail('PRIVATE_POINTER_EXPIRED_OR_FUTURE');
  const mb=file(root,q.manifest,131072);if(quoteHash(mb)!==q.manifestSha256)throw Error('MANIFEST_PIN');const m=JSON.parse(mb);
  if(JSON.stringify(m.review)!==JSON.stringify(p.review)||JSON.stringify(m.reviewedProducerShas)!==JSON.stringify(p.reviewedProducerShas)||JSON.stringify(m.identity)!==JSON.stringify(p.identity))throw Error('POLICY_BINDING');
  return readAssessmentQuote(symbol,{manifestFile:path.join(root,q.manifest),pinnedSha256:q.manifestSha256,now});
 }catch{return fail('PRIVATE_POINTER_OR_POLICY_UNVERIFIED');}
}
// Export/restore is a byte-preserving offline recovery test, never a fresh quote or automatic remote upload.
export function exportQuoteRecovery(root){
 if(fs.existsSync(path.join(root,'.writer.lock')))throw Error('WRITER_ACTIVE');
 const files=fs.readdirSync(root).sort().map(name=>{if(!/^(policy|identities|current|join-\d+)\.json$|^quotes-\d+\.json\.gz$|^receipts\.jsonl$/.test(name))throw Error('RECOVERY_UNEXPECTED_PATH');const b=file(root,name,name==='receipts.jsonl'?MAX:MAXFILE);return {name,sha256:quoteHash(b),data:b.toString('base64')};});
 const b=bytes({kind:'PRIVATE_QUOTE_RECOVERY_V1',files});if(b.length>48*1024*1024)throw Error('RECOVERY_CAP');return {bytes:b,sha256:quoteHash(b)};
}
export function restoreQuoteRecovery({bundle,pinnedSha256,root,checkout}){
 if(bundle.length>48*1024*1024||quoteHash(bundle)!==pinnedSha256)throw Error('RECOVERY_PIN');
 root=privateRoot(root,checkout);if(fs.readdirSync(root).length)throw Error('RECOVERY_TARGET_NOT_EMPTY');
 const d=JSON.parse(bundle);if(d.kind!=='PRIVATE_QUOTE_RECOVERY_V1'||!Array.isArray(d.files)||d.files.length>20)throw Error('RECOVERY_SCHEMA');
 const seen=new Set(),checked=[];let total=0;
 for(const r of d.files){if(!/^(policy|identities|current|join-\d+)\.json$|^quotes-\d+\.json\.gz$|^receipts\.jsonl$/.test(r.name)||seen.has(r.name))throw Error('RECOVERY_PATH');seen.add(r.name);const b=Buffer.from(r.data,'base64');total+=b.length;if(b.length>(r.name==='receipts.jsonl'?MAX:MAXFILE)||total>MAX||quoteHash(b)!==r.sha256)throw Error('RECOVERY_BYTES');checked.push([r.name,b]);}
 if(!['policy.json','identities.json','current.json'].every(n=>seen.has(n)))throw Error('RECOVERY_INCOMPLETE');
 for(const [name,b]of checked)immutable(root,name,b);
 return {status:'RESTORED_ORIGINAL_BYTES',files:checked.length,currentObservation:false};
}

// Reused by the separately opted-in private assessment book; producer behavior unchanged.
export {privateRoot as validatedPrivateRoot,file as boundedPrivateFile,atomic as atomicPrivateFile};
