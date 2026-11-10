// Existing holdings/exit rules are unchanged. This report admits only an actual
// pre-market invocation and separates live evidence from dated recorded exits.
import {snapshots,snapshotFeed} from './alpaca-feed.mjs';
import {marketClock,completedMarketSession} from './market-session.mjs';
import {priceEvidence,STOP_MAX_AGE_MIN} from './stop-watch.mjs';
import fs from 'node:fs';
const env=process.env,local=u=>u&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u)?u:null;
const AD=local(env.ALPACA_DATA_BASE)||'https://data.alpaca.markets',TG=local(env.TG_BASE)||'https://api.telegram.org';
const invocationAt=Date.now(),invocation=marketClock(invocationAt);
if(invocation.phase!=='PRE_MARKET'){console.log('premarket: skipped outside pre-market; invocation '+new Date(invocationAt).toISOString()+'; NY '+(invocation.day||'UNKNOWN')+' '+invocation.phase);process.exit(0);}
const J=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return d;}};
const money=x=>typeof x==='number'&&Number.isFinite(x)&&x>0?x.toFixed(x>=1?2:4):'UNKNOWN';
const pcs=x=>typeof x==='number'&&Number.isFinite(x)?(x>=0?'+':'')+(x*100).toFixed(1)+'%':'UNKNOWN';
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const at=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const nyDate=ms=>marketClock(ms).day;
const stamp=ms=>{const n=marketClock(ms);return n.day+' '+String(Math.floor(n.minutes/60)).padStart(2,'0')+':'+String(n.minutes%60).padStart(2,'0')+':'+String(n.seconds).padStart(2,'0')+' New York ('+n.phase+')';};
const age=ms=>Math.round(ms/1000)+' s';
const clean=x=>String(x??'').replace(/[\r\n]+/g,' ').slice(0,200);
const P=J('data/my-positions.json',{}),SG=J('data/signals.json',{}),AS=J('data/actions-sells.json',{sells:[]});
const syms=Object.keys(P).filter(s=>P[s]&&positive(P[s].entry));
if(!syms.length){console.log('premarket: no positions');process.exit(0);}
let snaps={},note='',feed=null;
if(env.ALPACA_KEY&&env.ALPACA_SECRET){try{const j=await snapshots(AD,syms,{headers:{'APCA-API-KEY-ID':env.ALPACA_KEY,'APCA-API-SECRET-KEY':env.ALPACA_SECRET}});if(j){snaps=j;feed=snapshotFeed(j);}else note='price feed refused';}catch{note='price feed unreachable';}}else note='no Alpaca key in this workflow';
const receivedAt=Date.now(),sourceFeed=feed?feed.toUpperCase():'UNKNOWN';
const q={},fetchEvidence={};for(const sym of syms){const lt=snaps[sym]?.latestTrade,t=at(lt?.t);q[sym]={sym,price:lt?.p,t,provider:'ALPACA',feed:feed||'UNKNOWN',kind:'TRADE'};
 fetchEvidence[sym]=priceEvidence(sym,q[sym],receivedAt,STOP_MAX_AGE_MIN);
 // A future-at-fetch trade never becomes trusted merely by waiting.
 if(fetchEvidence[sym].state==='OK'&&(marketClock(t).phase!=='PRE_MARKET'||nyDate(t)!==invocation.day))fetchEvidence[sym]={state:'UNKNOWN',why:'trade is outside this pre-market session'};
}
const renderAt=Date.now(),renderClock=marketClock(renderAt);
if(renderClock.phase!=='PRE_MARKET'||renderClock.day!==invocation.day){console.log('premarket: skipped after fetch; session changed before rendering');process.exit(0);}
const expected=completedMarketSession(renderAt),scanAt=at(SG.generatedAt),scanCurrent=!!expected&&SG.session===expected&&scanAt!==null&&scanAt<=renderAt&&completedMarketSession(scanAt)===SG.session;
const asAt=at(AS.at),asValid=asAt!==null&&asAt<=renderAt&&renderAt-asAt<4*864e5;
const asell=Object.fromEntries((Array.isArray(AS.sells)?AS.sells:[]).map(x=>[x.sym,x.why]));
const last=Object.fromEntries((Array.isArray(SG.stocks)?SG.stocks:[]).filter(x=>positive(x.last)).map(x=>[x.sym,x.last]));
const rows={exit:[],watch:[],hold:[],unknown:[],history:[]},asserted=[];
for(const sym of syms){const p=P[sym],sn=snaps[sym]||{},lt=sn.latestTrade,t=at(lt?.t),observed=fetchEvidence[sym],ev=observed.state==='OK'?priceEvidence(sym,q[sym],renderAt,STOP_MAX_AGE_MIN):observed,stop=positive(p.stop)?p.stop:null;
 const pb=sn.prevDailyBar,db=sn.dailyBar,pbt=at(pb?.t),dbt=at(db?.t);
 const ref=positive(pb?.c)?{price:pb.c,src:sourceFeed+' snapshot previous-day bar',day:pbt!==null&&pbt<=receivedAt?nyDate(pbt):null}:positive(db?.c)&&dbt!==null&&dbt<=receivedAt&&nyDate(dbt)<invocation.day?{price:db.c,src:sourceFeed+' snapshot daily bar',day:nyDate(dbt)}:positive(last[sym])?{price:last[sym],src:'saved scan',day:SG.session||null}:null;
 const reference=ref?'prior-close reference '+money(ref.price)+' ('+ref.src+', session '+(ref.day||'UNKNOWN')+'; not a current stop observation)':'prior close UNKNOWN';
 const trade=t!==null?'source trade '+money(lt?.p)+' ('+sourceFeed+', '+stamp(t)+', age '+age(renderAt-t)+'; received '+new Date(receivedAt).toISOString()+')':'source trade/time UNKNOWN';
 const tag=sym+' '+trade+'; '+reference+'; recorded stop '+(stop?money(stop):'NOT SET');
 const prior=SG.posVerdict&&typeof SG.posVerdict[sym]==='string'?SG.posVerdict[sym]:null;
 if(prior){const line='- '+sym+': RECORDED CLOSE-BASED EXIT, session '+clean(SG.session||'UNKNOWN')+', generated '+clean(SG.generatedAt||'UNKNOWN')+': '+clean(prior)+'. This is an existing instruction, not a live stop observation or proof of a fill; it is not withdrawn by a later quote. Follow the existing exit plan; this notice does not change the adopted rule\'s execution timing. No 15-minute stop delay is introduced. Check the broker to avoid selling twice.';
  (scanCurrent?rows.exit:rows.history).push(line);}
 if(asell[sym])rows.history.push('- '+sym+': RECORDED ACTIONS EXIT at '+clean(AS.at||'UNKNOWN')+(asValid?'':' (clock stale, future or unavailable)')+': '+clean(asell[sym])+'. Source-session/fulfilment not established here; reconcile the existing instruction and broker state. This report neither cancels it nor creates a new exit rule.');
 if(ev.state!=='OK'){rows.unknown.push('- '+tag+': PRICE/STOP CHECK UNKNOWN: '+clean(ev.why)+'. No current HOLD or stop-crossing assessment; existing broker/close-based instructions are not cancelled.');continue;}
 asserted.push(sym);
 if(stop&&ev.price<=stop)rows.watch.push('- '+tag+': PRE-MARKET STOP LEVEL OBSERVED at/below '+money(stop)+'. This does not prove a broker fill. Follow the existing stop policy in the regular session; check the broker, do not sell twice, and do not add a 15-minute wait.');
 else if(prior||asell[sym])rows.history.push('- '+tag+': PRICE CONTEXT ONLY; the recorded exit above stands. No replacement assessment is made from this trade.');
 else if(stop&&ev.price/stop-1<0.03)rows.watch.push('- '+tag+': WATCH, within the existing 3% stop-distance threshold on this fresh pre-market trade; regular-session stop status is not established.');
 else rows.hold.push('- '+tag+': HOLD context based only on this fresh pre-market trade (limit '+STOP_MAX_AGE_MIN+' min); not a regular-session stop confirmation or a new entry.');
}
const openKuwait=day=>{const h=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(day+'T12:00:00Z'))),k=570-(h-12)*60+180;return (Math.floor(k/60)%12||12)+':'+String(k%60).padStart(2,'0')+' pm';};
const msg=['PRE-MARKET CHECK '+invocation.day+' (regular open '+openKuwait(invocation.day)+' Kuwait)','Invocation '+new Date(invocationAt).toISOString()+'; fetched '+new Date(receivedAt).toISOString()+'; rendered '+new Date(renderAt).toISOString()+'; prices '+sourceFeed+(note?'; '+note:''),'Saved scan session '+clean(SG.session||'UNKNOWN')+', generated '+clean(SG.generatedAt||'UNKNOWN')+'; expected completed session '+(expected||'UNKNOWN')+'.',...Object.entries(rows).filter(([,r])=>r.length).flatMap(([k,r])=>['',({exit:'RECORDED CLOSE-BASED EXITS',watch:'WATCH / STOP OBSERVATIONS',hold:'FRESH PRE-MARKET CONTEXT',unknown:'CURRENT ASSESSMENT UNKNOWN',history:'PRIOR INSTRUCTIONS NEED RECONCILIATION'})[k],...r]),'','No pre-market trade is instructed. Existing exit/stop rules and broker orders remain; no 15-minute stop delay is introduced.'];
const currentEvidence=now=>{const n=marketClock(now);return n.phase==='PRE_MARKET'&&n.day===invocation.day&&asserted.every(sym=>fetchEvidence[sym].state==='OK'&&priceEvidence(sym,q[sym],now,STOP_MAX_AGE_MIN).state==='OK');};
console.log('premarket report prepared; session '+invocation.day+'; private body omitted from logs');

// Local bounded transport: only explicit429 is retried; every part/attempt rechecks evidence.
// A lost reply or incomplete ACK is UNKNOWN and never replayed here.
async function sendPremarket(text,currentEvidence){
 const parts=[];let rest=text;
 while(rest.length>3800){let cut=rest.lastIndexOf('\n',3800);if(cut<1500)cut=3800;parts.push(rest.slice(0,cut));rest=rest.slice(cut).replace(/^\n+/,'');}parts.push(rest);
 let acknowledged=0;
 const result=(description,definitelyUnsent=false)=>({ok:false,description,acknowledgedParts:acknowledged,expectedParts:parts.length,definitelyUnsent:!acknowledged&&definitelyUnsent});
 for(const part of parts){for(let attempt=0;;attempt++){
  let valid=false;try{valid=currentEvidence(Date.now())===true;}catch{}
  if(!valid)return result('LOCAL_EVIDENCE_REFUSAL',true);
  let r;try{r=await fetch(TG+'/bot'+env.TG_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TG_CHAT,text:part,disable_web_page_preview:true})});}catch{return result('NETWORK_ERROR; UNKNOWN; no replay');}
  if(r.status===429&&attempt<2){let seconds=5;try{seconds=Math.min(30,Math.max(0,Number((await r.json()).parameters?.retry_after)||5));}catch{}await new Promise(resolve=>setTimeout(resolve,seconds*1000));continue;}
  if(!r.ok)return result('HTTP '+r.status+(r.status>=500?'; UNKNOWN':''),r.status>=400&&r.status<500);
  let ack;try{ack=await r.json();}catch{return result('NOT_ACKNOWLEDGED; UNKNOWN');}
  if(ack?.ok!==true||!Number.isSafeInteger(ack.result?.message_id))return result('NOT_ACKNOWLEDGED; UNKNOWN');
  acknowledged++;break;
 }}
 return {ok:true,acknowledgedParts:acknowledged,expectedParts:parts.length};
}

if(env.TG_TOKEN&&env.TG_CHAT){const r=await sendPremarket(msg.join('\n'),currentEvidence);if(!r.ok)console.error('premarket delivery UNCONFIRMED: '+r.description+'; acknowledged parts '+r.acknowledgedParts+'/'+r.expectedParts);}
