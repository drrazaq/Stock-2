// Single-page, serial historical transport. No automatic execution or credentials.
import https from 'node:https';
import http from 'node:http';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HOSTS=Object.freeze({ALPACA:'https://data.alpaca.markets',MASSIVE:'https://api.massive.com'});
const digest=b=>createHash('sha256').update(b).digest('hex');
export const PINNED_SCOPE_SHA256='9751a2a0db8bf41a1788a61270be927a983da28170e51c72d68ee8f8759e2772';
const fail=s=>{throw new Error(s);};
function plain(x){return JSON.stringify(x);}
export function auditScopeHash(scope){return digest(Buffer.from(plain(scope)));}
export function validateScope(scope){
 if(!scope||scope.kind!=='UNAPPROVED_INTRADAY_HISTORICAL_FEASIBILITY_SCOPE_V1'||scope.approved!==false||scope.decision!=='DATA_AND_QUOTE_PAPER_COST_FEASIBILITY_ONLY_NOT_STRATEGY_ACCEPTANCE')fail('INVALID_FIXED_SCOPE');
 const b=scope.requestBudget,l=scope.bounds;
 if(!b||b.caseCount!==12||b.combinedMaximum!==156||b.massiveMaximum!==36||b.alpacaMaximum!==120||b.alpacaQuotePagesPerCase!==8||b.retries!==0||b.fallbacks!==0||b.unbudgetedPagination!==false)fail('INVALID_REQUEST_BOUNDS');
 if(!l||l.providerPhaseSeconds!==600||l.perRequestFullResponseSeconds!==20||l.requestsPerSecondMaximum!==1||l.quoteRowsPerPageRequested!==10000||l.perBodyBytes!==4194304||l.aggregateRawBytes!==134217728||l.aggregateEncryptedBytes!==167772160||l.publicReportBytes!==16384)fail('INVALID_STORAGE_OR_TIME_BOUNDS');
 if(!Array.isArray(scope.cases)||scope.cases.length!==12||new Set(scope.cases.map(x=>x.day+'|'+x.symbol)).size!==12)fail('INVALID_FIXED_CASES');
 for(const c of scope.cases)if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(c.symbol)||!/^2026-10-(15|16|19|20)$/.test(c.day)||!Number.isInteger(c.recordedMinuteNY)||c.recordedMinuteNY<570||c.recordedMinuteNY>=660)fail('INVALID_HISTORICAL_CASE');
 return auditScopeHash(scope);
}
export function planPage(scope,{caseIndex,kind,page=1,pageToken=null}){
 validateScope(scope);const c=scope.cases[caseIndex];if(!c||!Number.isInteger(caseIndex))fail('UNKNOWN_CASE');
 const keys=['identity','splits','dividends','daily','minutes','quotes'];if(!keys.includes(kind))fail('UNKNOWN_REQUEST_KIND');
 if(!Number.isInteger(page)||page<1||page>(kind==='quotes'?8:1)||(page===1&&pageToken!==null)||(page>1&&(typeof pageToken!=='string'||!pageToken||pageToken.length>2048)))fail('UNAPPROVED_PAGINATION');
 const provider=['identity','splits','dividends'].includes(kind)?'MASSIVE':'ALPACA';
 const query=new URLSearchParams();let endpoint;
 if(kind==='identity'){endpoint='/v3/reference/tickers/'+encodeURIComponent(c.symbol);query.set('date',c.day);}
 if(kind==='splits'||kind==='dividends'){endpoint='/v3/reference/'+kind;query.set('ticker',c.symbol);query.set('execution_date.lte',c.day);if(kind==='dividends'){query.delete('execution_date.lte');query.set('ex_dividend_date.lte',c.day);}}
 if(provider==='ALPACA'){
   endpoint='/v2/stocks/'+encodeURIComponent(c.symbol)+'/'+(kind==='quotes'?'quotes':'bars');query.set('feed','sip');query.set('asof',c.day);
   // Fixed October cases precede US winter time; New York was UTC-4.
   const nyAt=minute=>`${c.day}T${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}:00-04:00`;
   const end=nyAt(960);let start;
   if(kind==='daily'){const d=new Date(c.day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-60);start=d.toISOString();query.set('timeframe','1Day');query.set('adjustment','raw');query.set('limit','10000');query.set('end',nyAt(240));}
   else if(kind==='minutes'){start=nyAt(240);query.set('timeframe','1Min');query.set('adjustment','raw');query.set('limit','10000');query.set('end',end);}
   else{start=nyAt(c.recordedMinuteNY+1);query.set('limit','10000');query.set('end',end);if(pageToken)query.set('page_token',pageToken);}
   query.set('start',start);query.set('sort','asc');
 }
 return {caseIndex,kind,page,provider,path:endpoint+'?'+query.toString(),requestId:`${caseIndex}:${kind}:${page}`};
}
function wirePage(url,headers,{signal,maxBodyBytes}) {
 return new Promise((resolve,reject)=>{
   if(!Number.isInteger(maxBodyBytes)||maxBodyBytes<1||maxBodyBytes>4194304)return reject(new Error('INVALID_WIRE_BODY_CAP'));
   const protocol=url.protocol==='https:'?https:http;
   const req=protocol.request(url,{method:'GET',headers,signal},res=>{
     const chunks=[];let bytes=0;
     res.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBodyBytes){res.destroy(new Error('BODY_LIMIT'));req.destroy(new Error('BODY_LIMIT'));}else chunks.push(chunk);});
     res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));
   });req.on('error',reject);req.end();
 });
}
export function createHttpsPageTransport(headersByProvider){
 return request=>{
   const base=HOSTS[request.provider],relative=request.path;
   if(!base||typeof relative!=='string'||!relative.startsWith('/')||relative.startsWith('//'))return Promise.reject(new Error('INVALID_TRANSPORT_DESTINATION'));
   const url=new URL(relative,base);if(url.origin!==base)return Promise.reject(new Error('CROSS_ORIGIN_REQUEST'));
   const headers=headersByProvider?.[request.provider];if(!headers||typeof headers!=='object')return Promise.reject(new Error('MISSING_EXPLICIT_AUTH_HEADERS'));
   return wirePage(url,headers,request);
 };
}
// Same wire implementation, but loopback-only and synthetic headers. Never reads
// or forwards provider credentials. This test adapter is not a production override.
export function createLoopbackPageTransport(origin){
 const base=new URL(origin);if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)fail('LOOPBACK_TEST_ORIGIN_REQUIRED');
 return request=>{const url=new URL(request.path,base);if(url.origin!==base.origin)return Promise.reject(new Error('CROSS_ORIGIN_TEST_REQUEST'));return wirePage(url,{'X-Synthetic-Test':'NO_REAL_CREDENTIALS'},request);};
}
export class SealedAuditJournal {
 constructor(directory,key,maxBytes=167772160){
   if(!Buffer.isBuffer(key)||key.length!==32)fail('EXPLICIT_32_BYTE_SEAL_KEY_REQUIRED');
   if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>167772160)fail('INVALID_SEALED_CAP');
   const st=fs.lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(directory)!==path.resolve(directory))fail('PRIVATE_REAL_DIRECTORY_REQUIRED');
   if(st.mode&0o077)fail('PRIVATE_DIRECTORY_PERMISSIONS_REQUIRED');
   this.directory=directory;this.key=Buffer.from(key);this.maxBytes=maxBytes;this.bytes=0;this.index=0;this.closed=false;
   const lock=fs.openSync(path.join(directory,'AUDIT_STARTED'),'wx',0o600);fs.fsyncSync(lock);fs.closeSync(lock);this.syncDirectory();
 }
 syncDirectory(){const fd=fs.openSync(this.directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 append(event){
   if(this.closed)fail('JOURNAL_CLOSED');const raw=Buffer.from(plain(event)),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);
   const encrypted=Buffer.concat([nonce,cipher.update(raw),cipher.final(),cipher.getAuthTag()]);
   if(this.bytes+encrypted.length>this.maxBytes)fail('SEALED_STORAGE_LIMIT');
   const target=path.join(this.directory,String(this.index).padStart(6,'0')+'.sealed');const fd=fs.openSync(target,'wx',0o600);
   try{fs.writeFileSync(fd,encrypted);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   this.syncDirectory();this.bytes+=encrypted.length;this.index++;return digest(encrypted);
 }
 close(){this.key.fill(0);this.closed=true;}
 static inspect(directory,key,{verifiedPrefixLimit=null}={}){
   if(!Buffer.isBuffer(key)||key.length!==32||!fs.lstatSync(directory).isDirectory()||fs.lstatSync(directory).isSymbolicLink()||fs.realpathSync(directory)!==path.resolve(directory))fail('INVALID_RECOVERY_DIRECTORY_OR_KEY');
   const names=fs.readdirSync(directory).filter(n=>/^\d{6}\.sealed$/.test(n)).sort(),events=[];
   if(names.length>400)fail('RECOVERY_RECORD_CAP');
   const count=verifiedPrefixLimit===null?names.length:verifiedPrefixLimit;
   if(!Number.isInteger(count)||count<0||count>names.length)fail('INVALID_RECOVERY_PREFIX_LIMIT');
   let encryptedBytes=0;
   for(let i=0;i<count;i++){
     if(names[i]!==String(i).padStart(6,'0')+'.sealed')fail('JOURNAL_SEQUENCE_GAP');
     const file=path.join(directory,names[i]);if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())fail('INVALID_JOURNAL_FILE');
     const size=fs.statSync(file).size;encryptedBytes+=size;if(size<28||size>8*1024*1024||encryptedBytes>167772160)fail('TRUNCATED_OR_OVERSIZE_SEALED_RECORD');
     const b=fs.readFileSync(file);
     const decipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));decipher.setAuthTag(b.subarray(-16));
     events.push(JSON.parse(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString('utf8')));
   }
   const open=new Map();for(const e of events){if(e.type==='REQUEST_INTENT')open.set(e.requestId,e);if(e.type==='RESPONSE')open.delete(e.requestId);}
   return {events,unresolvedRequestIds:[...open.keys()],unverifiedTailRecords:names.length-count,prefixOnly:count<names.length,automaticResumeAllowed:false};
 }
}
export class HistoricalAuditClient {
 constructor({scope,authorization,transport,journal,clock=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
   this.scope=structuredClone(scope);this.scopeHash=validateScope(scope);
   if(this.scopeHash!==PINNED_SCOPE_SHA256)fail('PINNED_SCOPE_MISMATCH');
   if(!authorization||authorization.executionApproved!==true||authorization.scopeHash!==this.scopeHash||authorization.retentionRightsVerified!==true||authorization.sizeAndConditionsVerified!==true||!authorization.approvalRecordId)fail('NOT_AUTHORIZED');
   if(typeof transport!=='function'||!(journal instanceof SealedAuditJournal)||journal.closed)fail('EXPLICIT_TRANSPORT_AND_DURABLE_JOURNAL_REQUIRED');
   this.transport=transport;this.journal=journal;this.clock=clock;this.sleep=sleep;this.started=clock();this.lastStart=-Infinity;this.requests=0;this.rawBytes=0;this.stopped=false;this.inFlight=false;this.completed=new Map();this.used=new Set();this.counts={ALPACA:0,MASSIVE:0};
   journal.append({type:'BATCH_STARTED',scopeHash:this.scopeHash,at:this.started});
 }
 async page(spec){
   if(this.stopped)fail('BATCH_STOPPED_NO_RETRY');if(this.inFlight)fail('CONCURRENT_REQUEST_FORBIDDEN');this.inFlight=true;
   try{
     if(validateScope(this.scope)!==PINNED_SCOPE_SHA256)fail('SCOPE_MUTATION');
     const request=planPage(this.scope,spec);
     if(this.used.has(request.requestId))fail('DUPLICATE_REQUEST_NO_RETRY');
     if(request.page>1){const previous=this.completed.get(`${request.caseIndex}:quotes:${request.page-1}`);if(!previous||previous.nextPageToken!==spec.pageToken)fail('PAGE_TOKEN_NOT_FROM_PREVIOUS_RESPONSE');}
     if(this.requests>=156||this.counts[request.provider]>=(request.provider==='ALPACA'?120:36))fail('REQUEST_BUDGET_EXHAUSTED');
     if(this.rawBytes>=134217728)fail('RAW_STORAGE_LIMIT');
     const wait=Math.max(0,1000-(this.clock()-this.lastStart));if(wait)await this.sleep(wait);
     const remaining=600000-(this.clock()-this.started);if(remaining<=0)fail('PROVIDER_DEADLINE');
     this.journal.append({type:'REQUEST_INTENT',requestId:request.requestId,provider:request.provider,caseIndex:request.caseIndex,path:request.path,at:this.clock()});
     this.used.add(request.requestId);this.requests++;this.counts[request.provider]++;this.lastStart=this.clock();
     const controller=new AbortController();let timer;
     try{
       const response=await Promise.race([this.transport({...request,signal:controller.signal,maxBodyBytes:Math.min(4194304,134217728-this.rawBytes)}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('FULL_RESPONSE_TIMEOUT'));},Math.min(20000,remaining));})]);
       if(this.clock()-this.started>600000)fail('PROVIDER_DEADLINE');
       if(!response||!Number.isInteger(response.status)||!Buffer.isBuffer(response.body))fail('INVALID_TRANSPORT_RESULT');
       if(response.body.length>4194304||this.rawBytes+response.body.length>134217728)fail('RAW_STORAGE_LIMIT');
       this.rawBytes+=response.body.length;
       // Persist raw response before interpretation; no API body is printed publicly.
       this.journal.append({type:'RESPONSE',requestId:request.requestId,status:response.status,rawBase64:response.body.toString('base64'),rawHash:digest(response.body),at:this.clock()});
       if(response.status!==200)fail('HTTP_REFUSAL_OR_NON_200');
       let body;try{body=JSON.parse(response.body.toString('utf8'));}catch{fail('INVALID_JSON');}
       if(!body||typeof body!=='object'||Array.isArray(body)||body.error||body.code&&body.message)fail('INVALID_PROVIDER_SCHEMA');
       if(body.symbol&&body.symbol!==this.scope.cases[request.caseIndex].symbol)fail('RESPONSE_SYMBOL_MISMATCH');
       if(body.feed&&body.feed!=='sip'&&request.provider==='ALPACA')fail('RESPONSE_FEED_MISMATCH');
       if(['splits','dividends'].includes(request.kind)&&Array.isArray(body.results)&&body.results.some(x=>x?.ticker!==this.scope.cases[request.caseIndex].symbol))fail('ACTION_SYMBOL_MISMATCH');
       const next=body.next_page_token??body.next_url??null;
       if(next!==null&&(typeof next!=='string'||!next||next.length>2048))fail('INVALID_NEXT_PAGE_TOKEN');
       if(request.kind!=='quotes'&&next)fail('UNEXPECTED_PAGINATION_INCOMPLETE');
       if(request.kind==='quotes'&&(!Array.isArray(body.quotes)||body.quotes.length>10000))fail('INVALID_QUOTES_SCHEMA');
       if(['daily','minutes'].includes(request.kind)&&(!Array.isArray(body.bars)||body.bars.length>10000))fail('INVALID_BARS_SCHEMA');
       if(request.kind==='identity'&&(!body.results||body.results.ticker!==this.scope.cases[request.caseIndex].symbol))fail('IDENTITY_RESPONSE_MISMATCH');
       if(['splits','dividends'].includes(request.kind)&&!Array.isArray(body.results))fail('INVALID_ACTIONS_SCHEMA');
       this.completed.set(request.requestId,{nextPageToken:next});
       if(request.kind==='quotes'&&request.page===8&&next)fail('QUOTE_PAGE_CAP_INCOMPLETE');
       return {requestId:request.requestId,status:'RETAINED_PAGE_ONLY',body,nextPageToken:next,allowBuy:false};
     }catch(error){this.stopped=true;try{this.journal.append({type:'TERMINAL_FAILURE',requestId:request.requestId,reason:error.message,at:this.clock()});}catch{/* An unsealed terminal record leaves REQUEST_INTENT unresolved. */}throw error;}
     finally{clearTimeout(timer);controller.abort();}
   }catch(error){this.stopped=true;throw error;}finally{this.inFlight=false;}
 }
 publicStatus(){
   const report={status:this.stopped?'INCOMPLETE_STOPPED':'INCOMPLETE_NOT_EVALUATED',requests:this.requests,byProvider:this.counts,rawBytes:this.rawBytes,scopeHash:this.scopeHash,allowBuy:false,automaticResume:false};
   const text=plain(report);if(Buffer.byteLength(text)>16384)fail('PUBLIC_REPORT_CAP');return report;
 }
}
