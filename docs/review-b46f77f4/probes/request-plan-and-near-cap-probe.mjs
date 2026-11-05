import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const W=process.argv[2];
const m=await import(W+'/tools/historical-sip-audit-client.mjs');const cu=await import(W+'/tools/historical-audit-custody.mjs');
const scope=JSON.parse(fs.readFileSync(W+'/docs/intraday-audit-client/scope.proposed.json','utf8'));
const out={scopeHash:m.validateScope(scope),pinned:m.PINNED_SCOPE_SHA256,effectiveRaw:m.EFFECTIVE_RAW_BYTES};
// request plan enumeration
const kinds=['identity','splits','dividends','daily','minutes'];let plan={MASSIVE:0,ALPACA:0};const lim=new Set();
for(let i=0;i<12;i++){for(const k of kinds){const p=m.planPage(scope,{caseIndex:i,kind:k});plan[p.provider]++;if(k==='splits'||k==='dividends')lim.add(new URL(p.path,'https://x').searchParams.get('limit'));}for(let pg=1;pg<=8;pg++){m.planPage(scope,{caseIndex:i,kind:'quotes',page:pg,pageToken:pg===1?null:'t'});plan.ALPACA++;}}
let refused=[];for(const k of ['splits','dividends','identity','daily','minutes']){try{m.planPage(scope,{caseIndex:0,kind:k,page:2,pageToken:'t'});}catch(e){refused.push(k+':'+e.message);}}
try{m.planPage(scope,{caseIndex:0,kind:'quotes',page:9,pageToken:'t'});}catch(e){refused.push('quotes9:'+e.message);}
try{m.planPage(scope,{caseIndex:12,kind:'identity'});}catch(e){refused.push('case12:'+e.message);}
out.plan={...plan,total:plan.MASSIVE+plan.ALPACA,splitsDividendsLimit:[...lim]};out.refused=refused;
// near-cap drive with GuardedJournal: 4 MiB quote pages until refusal
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp2-'));fs.chmodSync(dir,0o700);const key=Buffer.alloc(32,5);
const j=new cu.GuardedJournal(dir,key);let now=0,calls=0;
const auth={executionApproved:true,scopeHash:m.PINNED_SCOPE_SHA256,retentionRightsVerified:true,sizeAndConditionsVerified:true,approvalRecordId:'SYNTHETIC'};
const big=(sym,tok)=>{const head=JSON.stringify({quotes:[],symbol:sym,next_page_token:tok,pad:''});const pad='x'.repeat(4194304-head.length);return Buffer.from(JSON.stringify({quotes:[],symbol:sym,next_page_token:tok,pad}));};
const transport=async r=>{calls++;const sym=scope.cases[r.caseIndex].symbol;if(r.kind==='identity')return {status:200,body:Buffer.from(JSON.stringify({results:{ticker:sym}}))};if(r.kind==='splits'||r.kind==='dividends')return {status:200,body:Buffer.from(JSON.stringify({results:[]}))};if(r.kind!=='quotes')return {status:200,body:Buffer.from(JSON.stringify({bars:[],symbol:sym}))};return {status:200,body:big(sym,r.page<8?'tok'+r.page:null)};};
const c=new m.HistoricalAuditClient({scope,authorization:auth,transport,journal:j,clock:()=>now,sleep:async ms=>{now+=ms;}});
let stopReason=null;outer:for(let i=0;i<12;i++){try{for(const k of kinds)await c.page({caseIndex:i,kind:k});let tok=null;for(let pg=1;pg<=8;pg++){const r=await c.page({caseIndex:i,kind:'quotes',page:pg,pageToken:tok});tok=r.nextPageToken;if(!tok)break;}}catch(e){stopReason=e.message;break outer;}}
const reqBefore=c.requests;let after=null;try{await c.page({caseIndex:11,kind:'identity'});}catch(e){after=e.message;}
j.close();const ins=m.SealedAuditJournal.inspect(dir,key);out.lastEvents=ins.events.slice(-2).map(e=>e.type+":"+(e.requestId||"")+":"+(e.reason||""));
out.nearCap={stopReason,providerRequests:reqBefore,transportCalls:calls,rawMiB:+(c.rawBytes/1048576).toFixed(2),sealedMiB:+(ins.events.length&&fs.readdirSync(dir).filter(n=>n.endsWith('.sealed')).reduce((s,n)=>s+fs.statSync(path.join(dir,n)).size,0)/1048576).toFixed(2),unresolvedIntents:ins.unresolvedRequestIds,callAfterStop:after,callsAfterStop:calls-reqBefore};
fs.rmSync(dir,{recursive:true,force:true});console.log(JSON.stringify(out,null,1));
