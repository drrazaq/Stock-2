import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {collectDiscovery} from '../discovery-runtime.mjs';
const script=new URL('../insider-study.mjs',import.meta.url).pathname;
const headers={
 SUBMISSION:['ACCESSION_NUMBER','DOCUMENT_TYPE','FILING_DATE','ISSUERTRADINGSYMBOL'],
 NONDERIV_TRANS:['ACCESSION_NUMBER','TRANS_CODE','TRANS_ACQUIRED_DISP_CD','TRANS_SHARES','TRANS_PRICEPERSHARE'],
 REPORTINGOWNER:['ACCESSION_NUMBER','RPTOWNERCIK']
};
function archive({missingHeader=false,missingOwner=false,ambiguousOwner=false,badNumber=false,badDate=false,inflateOversize=false,empty=false}={}){
 const submissions=[],trans=[],owners=[];
 for(const [symbol,prefix] of [['AAA-B','dash'],['AAA.B','dot']])for(let i=1;i<=2;i++){
  const id=prefix+i;submissions.push([id,'4',badDate?'31-SEP-2026':'30-SEP-2026',symbol]);trans.push([id,'P','A',badNumber?'NaN':'100','10']);if(!missingOwner)owners.push([id,String(i)]);if(ambiguousOwner)owners.push([id,String(i+5)]);
 }
 if(empty){submissions.length=0;trans.length=0;owners.length=0;}
 const files={};for(const [name,rows] of Object.entries({SUBMISSION:submissions,NONDERIV_TRANS:trans,REPORTINGOWNER:owners})){
  const h=missingHeader&&name==='SUBMISSION'?headers[name].map(x=>x==='ISSUERTRADINGSYMBOL'?'WRONG_COLUMN':x):headers[name];
  files[name+'.tsv']=[h,...rows].map(x=>x.join('\t')).join('\n')+'\n';
 }
 if(inflateOversize)files['SUBMISSION.tsv']+='X'.repeat(65*1024*1024);
 const p=spawnSync('python3',['-c','import io,json,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED); [z.writestr(k,v) for k,v in json.load(sys.stdin).items()]; z.close(); sys.stdout.buffer.write(b.getvalue())'],{input:JSON.stringify(files)});assert.equal(p.status,0,p.stderr.toString());return p.stdout;
}
async function fixture(t,opts={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-insider-fetch-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'study-cache/insider'),{recursive:true});fs.mkdirSync(path.join(dir,'data'));
 const days={};for(let i=0;i<300;i++){const d=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);days[d]={T:['AAA-B','AAA.B','SPY'],o:[10,20,100],h:[11,21,101],l:[9,19,99],c:[10,20,100],v:[1e6,1e6,1e6]};}
 fs.writeFileSync(path.join(dir,'study-cache/grouped.json.gz'),zlib.gzipSync(JSON.stringify({days})));for(const q of ['2026q1','2026q2'])fs.writeFileSync(path.join(dir,'study-cache/insider',q+'.json'),'[]');
 const clock=path.join(dir,'clock.mjs');fs.writeFileSync(clock,"const D=Date;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:['2026-10-29T14:00:00Z']));}static now(){return D.parse('2026-10-29T14:00:00Z');}};");
 const zip=archive(opts);let requests=0,followed=0;
 const server=http.createServer((req,res)=>{
  if(req.url==='/redirect-target'){followed++;res.end(zip);return;}
  requests++;
  if(opts.status){res.writeHead(opts.status);res.end('fixture error');return;}
  if(opts.redirect){res.writeHead(302,{Location:'/redirect-target'});res.end();return;}
  if(opts.advertisedOversize){res.writeHead(200,{'Content-Length':String(65*1024*1024)});res.end();return;}
  if(opts.streamOversize){res.writeHead(200);const chunk=Buffer.alloc(1024*1024);let remaining=65;const send=()=>{while(remaining>0&&!res.destroyed){remaining--;if(!res.write(chunk)){res.once('drain',send);return;}}if(!res.destroyed)res.end();};send();return;}
  if(opts.brokenBody){res.writeHead(200,{'Content-Length':String(zip.length+100)});res.write(zip.subarray(0,20));setImmediate(()=>res.destroy());return;}
  res.writeHead(200);res.end(zip);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const readText=p=>fs.readFileSync(path.join(dir,p),'utf8');
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--import',clock,script],{cwd:dir,env:{PATH:process.env.PATH,SEC_BASE:'http://127.0.0.1:'+server.address().port}});let out='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>out+=x);child.on('error',reject);child.on('exit',code=>{try{assert.equal(code,0,out);resolve(JSON.parse(readText('data/insider-study.json')));}catch(e){reject(e);}});});
 return {run,readText,requests:()=>requests,followed:()=>followed,hasCache:()=>fs.existsSync(path.join(dir,'study-cache/insider/2026q3.json')),hasZip:()=>fs.existsSync(path.join(dir,'study-cache/insider/2026q3.zip'))};
}
test('actual SEC ZIP ingress preserves dash/dot classes through cache, clusters and discovery',async t=>{
 const f=await fixture(t),out=await f.run();assert.equal(out.status,'OK');assert.equal(f.requests(),1);assert.deepEqual(out.recent.map(x=>x.sym).sort(),['AAA-B','AAA.B']);
 const cached=JSON.parse(f.readText('study-cache/insider/2026q3.json'));assert.deepEqual([...new Set(cached.map(x=>x[0]))].sort(),['AAA-B','AAA.B']);
 const i=collectDiscovery({cutoff:'2026-10-29T14:00:00Z',readText:f.readText});assert.deepEqual(i.observations.map(x=>x.symbol).sort(),['AAA-B','AAA.B']);
 const again=await f.run();assert.equal(f.requests(),1);assert.equal(again.status,'OK');assert.equal(f.hasZip(),false);
});
for(const opts of [{missingHeader:true},{missingOwner:true},{ambiguousOwner:true},{badNumber:true},{badDate:true},{status:503},{status:429},{advertisedOversize:true},{streamOversize:true},{inflateOversize:true},{brokenBody:true},{redirect:true}]){
 test('actual SEC ZIP caller preserves UNKNOWN and never caches invalid response '+JSON.stringify(opts),async t=>{
  const f=await fixture(t,opts),out=await f.run();assert.equal(out.status,'PARTIAL_OR_UNKNOWN');assert.equal(out.firstRun,null);assert.equal(out.recent.length,0);assert.equal(f.hasCache(),false);assert.equal(f.hasZip(),false);
  assert.equal(out.sourceStatus.SEC_FORM4.fetchAttempts,opts.status===429?1:2);assert.ok(out.sourceStatus.SEC_FORM4.fetchErrors.length);assert.equal(f.followed(),0);if(opts.advertisedOversize||opts.streamOversize)assert.ok(out.sourceStatus.SEC_FORM4.fetchErrors.some(x=>x.reason==='ZIP_BYTE_BUDGET'));
 });
}

test('valid header-only SEC archive remains an observed empty result',async t=>{const f=await fixture(t,{empty:true}),out=await f.run();assert.equal(out.status,'OK');assert.equal(out.recent.length,0);assert.equal(f.hasCache(),true);assert.equal(f.requests(),1);});
