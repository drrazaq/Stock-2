// Independent harness for the read-only mentor (PR #3 / patch ebc62f42). Reviewer: Claude.
// Drives the ACTUAL scan.mjs tgCommands of a patched tree through the tree's own test loader (test/load-scan.mjs), with a local
// fake Telegram server on 127.0.0.1 and synthetic positions only. Checks: every data/ file byte-identical after mentor-only batches,
// command offset advanced, mixed batches keep existing recording, foreign chats ignored, and the explanation's dates/targets against
// an independent session count (market-session.mjs) and the bot's own time-exit counter.
// v3 (25a8500): extraction updated for the numbered layout; adds internal-code / glued-number scans and plan status per case.
// v2 additions: multi-line messages mixing mentor and owner mutations; bare / malformed spellings.
// Usage: node mentor-harness.mjs <patched tree>   -> prints JSON.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const tree=path.resolve(process.argv[2]),U=p=>pathToFileURL(path.join(tree,p)).href;
const {loadScan}=await import(U('test/load-scan.mjs')),{marketSession}=await import(U('market-session.mjs')),M=await import(U('mentor-plan.mjs'));
const sha=b=>createHash('sha256').update(b).digest('hex');
// Independent count: the n-th open session counting `day` as 1.
function nth(day,n){let d=day,k=marketSession(d).closed?0:1;while(k<n){d=new Date(Date.parse(d+'T12:00:00Z')+864e5).toISOString().slice(0,10);if(!marketSession(d).known)return null;if(!marketSession(d).closed)k++;}return d;}
const next=day=>{let d=day;do d=new Date(Date.parse(d+'T12:00:00Z')+864e5).toISOString().slice(0,10);while(marketSession(d).known&&marketSession(d).closed);return d;};
let updates=[],sent=[];const server=http.createServer((q,s)=>{let b='';q.on('data',x=>b+=x);q.on('end',()=>{let o={ok:true,result:[]};if(q.url.includes('/getUpdates')){o.result=updates;updates=[];}else if(q.url.includes('/sendMessage')){sent.push(JSON.parse(b).text);o.result={message_id:1};}s.end(JSON.stringify(o));});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const POS={
 GOOD:{src:'leader dip',kind:'leader dip',entry:100,target:120,ldHold:126,boughtSession:'2026-10-30',own:true},
 HOLI:{src:'leader dip',kind:'leader dip',entry:250.5,target:300.6,ldHold:126,boughtSession:'2026-11-25',own:true},
 BADTGT:{src:'leader dip',kind:'leader dip',entry:100,target:130,ldHold:126,boughtSession:'2026-10-30',own:true},
 BIG:{src:'leader dip',kind:'leader dip',entry:100,target:120,ldHold:126,boughtSession:'2026-10-30',own:true},
 OTHER:{src:'try small',entry:50,stop:45,since:'2026-10-20',own:true},
};
const SIG={generatedAt:'2026-10-30T22:00:00Z',lastClose:'2026-10-30',methods:{'SQ11-PB12':{name:'leader dip',hold:126,newSignals:[{sym:'LEAD',close:80,d:'2026-10-30'},{sym:'HOLS',close:60,d:'2026-11-25'}]}}};
const out={tree:path.basename(tree),node:process.version,cases:{}};
async function run(name,msgs,{mixedCheck}={}){
 sent=[];const s=await loadScan({files:{'data/my-positions.json':POS,'data/leaderdip-ledger.jsonl':[],'data/squad11-today.json':SIG},env:{TG_TOKEN:'fixture',TG_CHAT:'42',TG_BASE:'http://127.0.0.1:'+server.address().port,PRIVATE_KEY:'synthetic-only'}});
 s.fn('privWrite')({shares:{GOOD:10,HOLI:4,BADTGT:10,BIG:25,OTHER:20},buys:[]});s.write('data/tg-state.json',{offset:0,menuV:s.value('MENU_V')});
 const snap=()=>{const r={};const walk=d=>{for(const n of fs.readdirSync(d)){const p=path.join(d,n);if(fs.statSync(p).isDirectory())walk(p);else r[path.relative(s.dir,p)]=sha(fs.readFileSync(p));}};walk(path.join(s.dir,'data'));return r;};
 const before=snap();updates=msgs.map((m,i)=>({update_id:100+i,message:{chat:{id:m[0]},text:m[1]}}));await s.fn('tgCommands')(null);const after=snap();
 const changed=Object.keys({...before,...after}).filter(k=>before[k]!==after[k]).sort();
 return {s,text:sent.join('\n---\n'),changed,offset:s.readJson('data/tg-state.json').offset,pos:s.readJson('data/my-positions.json')};
}
// 1. Mentor-only batches: no data file except tg-state.json may change.
for(const [name,sym] of [['held_consistent','GOOD'],['held_thanksgiving_buy','HOLI'],['held_target_mismatch','BADTGT'],['held_over_slot','BIG'],['other_lane','OTHER'],['source_lead','LEAD'],['lead_before_holiday','HOLS'],['unknown','ZZZZ']]){
 const r=await run(name,[[42,'mentor '+sym],[99,'mentor GOOD'],[99,'stop GOOD 1']]);
 const P=POS[sym],sig=SIG.methods['SQ11-PB12'].newSignals.find(x=>x.sym===sym),fmt=d=>d?new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}):null;
 const ex={exitClose126:P?.boughtSession?nth(P.boughtSession,126):null,botTimeExitOpen:P?.boughtSession?next(nth(P.boughtSession,126)):null,entrySession:sig?next(sig.d):null,target20:P?+(P.entry*1.2).toFixed(2):null};
 const exitLine=(r.text.match(/^3\. Tested exit reference: (.*)$/m)||[])[1]||null,entryLine=(r.text.match(/^2\. Entry: (.*)$/m)||[])[1]||null;
 const plan=M.leaderDipMentorPlan({symbol:sym,position:P||null,signal:sig?{rule:'SQ11-PB12',day:sig.d,close:sig.close}:null,quantity:{GOOD:10,HOLI:4,BADTGT:10,BIG:25,OTHER:20}[sym]??null,asOfDay:'2026-11-02',asOfMs:Date.parse('2026-11-02T15:00:00Z')});
 out.cases[name]={replies:r.text.split('\n---\n').length,chars:r.text.length,lines:r.text.split('\n').length,changedFiles:r.changed,offset:r.offset,planStatus:plan.planStatus,contradictions:plan.contradictions,
  firstLine:r.text.split('\n')[0],exitLine,entryLine,expected:ex,
  exitDateMatches:ex.exitClose126?exitLine?.startsWith(fmt(ex.exitClose126)+' at '):null,entryDateMatches:ex.entrySession?entryLine?.startsWith(fmt(ex.entrySession)+' New York OPEN'):null,
  saysNoApproval:/No new BUY or HOLD approval/.test(r.text),saysNotProven:/NOT PROVEN/.test(r.text),showsStoredTarget:P?.target?r.text.includes(P.target.toFixed(2)):null,
  internalCodes:[...new Set(r.text.match(/\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/g)||[])],gluedNumberWords:[...new Set(r.text.match(/\b[a-z]+\d+[a-z]*\b|\b\d+(?:\.\d+)?(?!st|nd|rd|th|%)[a-z]{2,}\b/g)||[])],
  hasSelfContradictionWording:/contradiction/i.test(r.text)&&!plan.contradictions.length&&!/not a contradiction/.test(r.text)};
 if(name==='held_consistent')out.sampleText=r.text;
}
// 2. Mixed batch: an owner mutation alongside mentor keeps existing recording.
{const r=await run('mixed',[[42,'mentor GOOD'],[42,'stop OTHER 46']]);out.cases.mixed_owner_stop={changedFiles:r.changed,otherStop:r.pos.OTHER?.stop,goodUnchanged:JSON.stringify(r.pos.GOOD)===JSON.stringify(POS.GOOD),offset:r.offset};}
// 2b. One message carrying a mentor line AND an owner mutation (multi-line): the mutation must still be saved.
for(const [k,t] of [['mentor_then_stop','mentor GOOD\nstop OTHER 46'],['stop_then_mentor','stop OTHER 46\nmentor GOOD'],['slash_mentor_then_stop','/mentor GOOD\nstop OTHER 46']]){const r=await run(k,[[42,t]]);out.cases['multiline_'+k]={changedFiles:r.changed,otherStop:r.pos.OTHER?.stop,stopSaved:r.pos.OTHER?.stop===46,reply:r.text.slice(0,160).replace(/\n/g,' | '),offset:r.offset};}
// 3. Command spellings.
for(const [k,t] of [['slash','/mentor good'],['botname','/mentor@StockBot GOOD'],['dotted','mentor BRK.B'],['two_lines','mentor GOOD\nmentor LEAD'],['trailing_text','mentor GOOD please'],['bare_slash','/mentor'],['bare','mentor'],['two_slash_lines','/mentor good\n/mentor lead']]){const r=await run(k,[[42,t]]);out.cases['spell_'+k]={mentorReplies:(r.text.match(/MENTOR /g)||[]).length,changedFiles:r.changed,offset:r.offset,firstLine:r.text.split('\n')[0].slice(0,80)};}
// 4. Pure-function date checks across 2026-2027 holidays and half-days, against the independent counter.
const days=[];for(let t=Date.parse('2026-10-01T12:00:00Z');t<Date.parse('2027-06-30T12:00:00Z');t+=864e5){const d=new Date(t).toISOString().slice(0,10);if(marketSession(d).known&&!marketSession(d).closed)days.push(d);}
let mism=[],nulls=0;for(const d of days){const a=M.mentorSessionAfter(d,125),b=nth(d,126);if(a===null&&b===null){nulls++;continue;}if(a!==b)mism.push([d,a,b]);}
out.dateCheck={buyDaysChecked:days.length,mismatches:mism.slice(0,5),mismatchCount:mism.length,bothUnknownBeyondCalendar:nulls};
console.log(JSON.stringify(out,null,1));server.closeAllConnections();server.close();process.exit(0);
