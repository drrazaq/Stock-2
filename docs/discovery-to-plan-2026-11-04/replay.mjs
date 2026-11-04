// Offline replay only. Read a pinned local snapshot; print aggregates and one scoped lane line.
// Owner marks are used only in memory. No financial records, provider calls or Telegram delivery.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {resolveZad} from '../../zad-compliance.mjs';
import {loadScan,blocked} from '../../test/load-scan.mjs';
const input=process.argv[2],at='2026-11-04T15:00:00.000Z';
if(!input)throw Error('Provide local data directory for pinned a95af150 snapshot');
const names=['signals','discovery','squad11-today','halal','zad-list','settings'];
const raw=Object.fromEntries(names.map(n=>[n,fs.readFileSync(path.join(input,n+'.json'),'utf8')]));
const expected={signals:'c759e2bde152a73a4bc6e48a645bb6833c384c994f89429caefc60dcc91c4e9f',discovery:'2038c5ba33a75eb815d462c7a197d5d2bcbacd3657c7fb50762208dc1c93144d','squad11-today':'1b3450a950ac2b0e1f8a2c8bec84becf3b10652ba9aa948c05da7404a80ce93d'};
for(const [name,hash]of Object.entries(expected))if(crypto.createHash('sha256').update(raw[name]).digest('hex')!==hash)throw Error('Pinned public source mismatch');
const data=Object.fromEntries(names.map(n=>[n,JSON.parse(raw[n])]));
const fixed=Date.parse(at),real=Date.now;Date.now=()=>fixed;
try{
 const policy=resolveZad(data.halal,data['zad-list'],fixed);
 const countZad=rows=>{
  const count={ownerApproved:0,policyExcluded:0,ownerRejected:0,confirmationMissingOrExpired:0};
  for(const r of rows){const s=r.sym;if(policy.excluded.has(s))count.policyExcluded++;else if(policy.marks[s]?.s==='ok')count.ownerApproved++;else if(policy.marks[s]?.s==='fail')count.ownerRejected++;else count.confirmationMissingOrExpired++;}
  return count;
 };
 const files=Object.fromEntries(names.map(n=>['data/'+n+'.json',raw[n]]));
 const S=await loadScan({files});
 // Empty holdings are only a fixture for a zero-new-signal lane. No capacity inference is made.
 // Other lane inputs intentionally absent: do not interpret the rest of this generated message.
 const rendered=await S.fn('actionsText')(data.signals,{},null,'OFFLINE PINNED SNAPSHOT');
 const lane=rendered.split('\n').filter(l=>/^- LEADER DIP: no qualifying trade/.test(l));
 if(lane.length!==1)throw Error('Expected exactly one scoped zero-signal status');
 const sq=data['squad11-today'],m=sq.methods['SQ11-PB12'],dis=data.discovery,sig=data.signals;
 const result={schema:'PINNED_DISCOVERY_TO_PLAN_REPLAY_V1',productionSnapshot:'a95af15061569854c89350a5fb0f981e99783822',asOf:at,
  publicInputs:Object.fromEntries(['signals','discovery','squad11-today'].map(n=>[n,{sha256:crypto.createHash('sha256').update(raw[n]).digest('hex'),generatedAt:data[n].generatedAt,session:data[n].session||data[n].lastClose}])),
  separatePopulations:{
   discovery:{swept:dis.swept,strong:dis.strong,shortlist:dis.candidates.length,zad:countZad(dis.candidates),trustedSecurityIdentityFields:dis.candidates.filter(x=>x.securityId).length,bboFields:dis.candidates.filter(x=>x.bid>0&&x.ask>0).length},
   scanner:{scanned:sig.scanned,tested:sig.tested,stocks:sig.stocks.length,buyWatchWithPrice:sig.stocks.filter(x=>x.state==='Buy watch'&&x.buyLo).length,quickPaused:sig.quickPaused,quickHeld:sig.quickHeld.length,earningsRows:sig.pead.length,earningsLive:sig.pead.filter(x=>x.live).length,eventRows:sig.evt.length},
   selectedLane:{rule:'SQ11-PB12',verdict:m.tier,leadersAsOf:sq.leadersAsOf,leaders:sq.leaders.length,leaderZad:countZad(sq.leaders),newSignals:m.newSignals.length,existingPaperOpen:m.open.length,actionableEntries:0}},
  actualCaller:'scan.mjs actionsText → ldipLines / lane status',output:lane[0].slice(2),
  limits:['Parallel populations are not one sequential funnel.','Only the selected lane status is replayed; this is not a complete private ACTIONS message.','No owner holdings were read; free slots and cash are not assessed.','Generated time and last close do not establish fresh executable BBO.','The active intraday run has no terminal evidence in this snapshot.','Current zero signals cannot establish readiness of identity/quote gates for a future signal.'],
  externalRequests:blocked.length};
 if(blocked.length)throw Error('Unexpected external request');
 console.log(JSON.stringify(result,null,2));
}finally{Date.now=real;}
