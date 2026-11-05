import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const W=process.argv[2];
const m=await import(W+'/tools/historical-sip-audit-client.mjs');
const scope=JSON.parse(fs.readFileSync(W+'/docs/intraday-audit-client/scope.proposed.json','utf8'));
const out={};
for(const k of ['splits','dividends','identity'])out[k+'Path']=m.planPage(scope,{caseIndex:0,kind:k}).path;
// P1: >10 historical dividends -> provider returns next_url (documented default limit 10)
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp-'));fs.chmodSync(dir,0o700);
const journal=new m.SealedAuditJournal(dir,Buffer.alloc(32,7));let now=0;
const auth={executionApproved:true,scopeHash:m.PINNED_SCOPE_SHA256,retentionRightsVerified:true,sizeAndConditionsVerified:true,approvalRecordId:'SYNTHETIC'};
const sym=scope.cases[0].symbol;
const transport=async r=>{const b=r.kind==='identity'?{results:{ticker:sym},status:'OK'}:r.kind==='splits'?{results:[],status:'OK'}:{results:Array.from({length:10},()=>({ticker:sym})),status:'OK',next_url:'https://api.massive.com/v3/reference/dividends?cursor=SYNTH'};return {status:200,body:Buffer.from(JSON.stringify(b))};};
const c=new m.HistoricalAuditClient({scope,authorization:auth,transport,journal,clock:()=>now,sleep:async ms=>{now+=ms;}});
const seq=[];for(const kind of ['identity','splits','dividends','daily']){try{await c.page({caseIndex:0,kind});seq.push(kind+':OK');}catch(e){seq.push(kind+':'+e.message);}}
out.elevenDividendsRun=seq;out.status=c.publicStatus();
// P2: raw cap vs sealed cap arithmetic
const raw=134217728,sealed=167772160;out.base64OfRawCap=Math.ceil(raw/3)*4;out.sealedCap=sealed;out.rawCapReachable=Math.ceil(raw/3)*4<sealed-65536*2;
out.maxRawBeforeSealedLimitMiB=+(((sealed-131072)*3/4)/1048576).toFixed(1);
console.log(JSON.stringify(out,null,1));fs.rmSync(dir,{recursive:true,force:true});
