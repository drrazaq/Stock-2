// Offline retained-evidence replay. No provider calls, collection, writes or strategy changes.
// node docs/price-readiness-research-20261110/replay.mjs /path/to/exact-7d07e701-checkout
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const stats=a=>{const v=a.filter(Number.isFinite).sort((a,b)=>a-b),n=v.length,sum=v.reduce((a,b)=>a+b,0);return {n,mean:n?sum/n:null,median:n?(n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2):null,positive:v.filter(x=>x>0).length,withoutBest:n>1?(sum-v.at(-1))/(n-1):null,withoutBest2:n>2?(sum-v.at(-1)-v.at(-2))/(n-2):null};};
const key=r=>r.d+'|'+r.sym+'|'+r.panel;
export function analyze({runs,opp,ledger}){
 const primary=Object.values(runs.reduce((o,r)=>{if(!o[r.day]||r.heartbeat.length>o[r.day].heartbeat.length)o[r.day]=r;return o;},{}));
 const first=primary.flatMap(r=>r.missed.map(m=>({...m,day:r.day})));
 const firstStat=a=>({n:a.length,age:stats(a.map(x=>x.firstQuoteAgeMin)),older3:a.filter(x=>x.firstQuoteAgeMin>3).length,neverFresh:a.filter(x=>x.firstLive===null).length});
 const coverage=[...new Set(runs.map(r=>r.day))].sort().map(day=>{const rs=runs.filter(x=>x.day===day),seen=new Set(rs.flatMap(r=>r.heartbeat.filter(b=>b.m>=570&&b.m<=900&&b.received>0&&b.evaluated>0).map(b=>b.m))),missing=Array.from({length:331},(_,i)=>570+i).filter(m=>!seen.has(m));return {day,runs:rs.map(x=>x.runId),observed:seen.size,expected:331,missing};});
 const selected=opp.filter(x=>x.d>='2026-11-02'&&x.d<='2026-11-09');
 const bucket=r=>r.dollarVol>=2e6?'GE_2M':r.dollarVol>0?'LT_2M':'UNKNOWN';
 const liquidity=Object.fromEntries(['GE_2M','LT_2M','UNKNOWN'].map(k=>{const a=selected.filter(r=>bucket(r)===k);return[k,{rows:a.length,validBbo:a.filter(r=>r.bid>0&&r.ask>=r.bid).length,freshBbo120:a.filter(r=>r.bid>0&&r.ask>=r.bid&&Number.isFinite(r.qAgeSec)&&r.qAgeSec>=0&&r.qAgeSec<=120).length,identityKnown:a.filter(r=>r.instrument?.status==='KNOWN').length}];}));
 const lists=ledger.filter(x=>x.type==='list'),outcomes=ledger.filter(x=>x.type==='s5'),dup=rows=>Object.entries(rows.reduce((a,r)=>(a[key(r)]=(a[key(r)]||0)+1,a),{})).filter(([,n])=>n>1);
 const B=outcomes.filter(r=>r.panel==='B').map(r=>{const entries=lists.filter(l=>key(l)===key(r));if(entries.length!==1)throw Error('Ambiguous B entry '+key(r));const entry=entries[0],half=entry.px<5?.005:.0015,slip=entry.px<5?.005:.001;const cost=stress=>{const ask=entry.px*(1+half+stress),bid=r.px5*(1-half-stress),q=Math.floor(997/ask);return {shares:q,outlay:q>0?q*ask+3:0,netDollars:q>0?q*(bid-ask)-6:0,returnOnBudget:q>0?(q*(bid-ask)-6)/1000:0};};return {...r,entry,base:cost(0),stress:cost(slip)};});
 return {neverFreshBreakdown:{total:first.filter(x=>x.firstLive===null).length,under1Coded:first.filter(x=>x.code==='UNDER_1_USD').length,under1NeverFresh:first.filter(x=>x.code==='UNDER_1_USD'&&x.firstLive===null).length,regularFirstUnder1:first.filter(x=>x.firstSeen>='09:30'&&x.code==='UNDER_1_USD').length,otherNeverFresh:first.filter(x=>x.code!=='UNDER_1_USD'&&x.firstLive===null).map(x=>({symbol:x.sym,day:x.day,code:x.code}))},firstSight:{all:firstStat(first),preOpen:firstStat(first.filter(x=>x.firstSeen<'09:30')),regular:firstStat(first.filter(x=>x.firstSeen>='09:30'))},coverage,liquidity,B:{listed:lists.filter(x=>x.panel==='B').length,matured:B.length,unmatured:lists.filter(x=>x.panel==='B').length-B.length,legacy:stats(B.map(x=>x.net)),wholeShareProxy:stats(B.map(x=>x.base.returnOnBudget)),stressProxy:stats(B.map(x=>x.stress.returnOnBudget)),beatsStoredSpy:B.filter(x=>x.net>x.spy).length,best:B.slice().sort((a,b)=>b.net-a.net).slice(0,2).map(x=>({symbol:x.sym,day:x.d,net:x.net})),days:[...new Set(B.map(x=>x.d))].map(day=>({day,legacy:stats(B.filter(x=>x.d===day).map(x=>x.net)),spy:B.find(x=>x.d===day).spy})),observations:B},controlCaveat:{duplicateListKeys:dup(lists),duplicateS5Keys:dup(outcomes),ArawS5:stats(outcomes.filter(x=>x.panel==='A').map(x=>x.net)),meaning:'A mixed-cap reference only. GNSS two entries/two s5 outcomes share a key; no invented original observation linkage. Stored SPY return is not executable benchmark proof.'},verdict:'INCONCLUSIVE: frozen study unchanged; descriptive concentration and cost sensitivity, no demonstrated executable edge'};
}
// CLI: require the immutable input pins; does not change files.
if(process.argv[1]&&import.meta.url.endsWith('/replay.mjs')){
 const root=process.argv[2];if(!root)throw Error('Exact retained checkout path required');
 const manifest=JSON.parse(fs.readFileSync(new URL('./input-manifest.json',import.meta.url),'utf8'));
 const read=p=>{const bytes=fs.readFileSync(path.join(root,p));const sha=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');if(sha!==manifest.files[p])throw Error('Input blob mismatch '+p);return bytes.toString('utf8');};
 const runs=manifest.runPaths.map(p=>JSON.parse(read(p))),opp=read('data/opp-ledger.jsonl').trim().split(/\r?\n/).map(JSON.parse),ledger=read('data/radar-v3-ledger.jsonl').trim().split(/\r?\n/).map(JSON.parse);
 console.log(JSON.stringify(analyze({runs,opp,ledger}),null,2));
}
