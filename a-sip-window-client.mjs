// Inactive Alpaca SIP protocol adapter. No default socket, credentials, environment reads or reconnects.
// Official wire contract: https://docs.alpaca.markets/docs/streaming-market-data (stocks / v2/sip).
import {evidenceTime} from './reclaim-research-workflow.mjs';
export function createASipWindowClient({socketFactory,credentials,clock=Date.now,timers={set:setTimeout,clear:clearTimeout},maxBytes=1024*1024,maxMessages=10000}){
 const need=(v,c)=>{if(!v)throw Error(c);};need(typeof socketFactory==='function'&&typeof credentials?.key==='string'&&credentials.key.length>0&&credentials.key.length<=256&&typeof credentials?.secret==='string'&&credentials.secret.length>0&&credentials.secret.length<=256,'EXPLICIT_CLIENT_BINDINGS_REQUIRED');
 need(Number.isInteger(maxBytes)&&maxBytes>0&&maxBytes<=1024*1024&&Number.isInteger(maxMessages)&&maxMessages>0&&maxMessages<=10000,'CLIENT_BOUNDS_REQUIRED');
 return {observe({symbol,start,end,signal}){
  need(/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol||''),'CLIENT_SYMBOL_REQUIRED');const a=evidenceTime(start),b=evidenceTime(end),now=clock();
  need(Number.isFinite(a)&&Number.isFinite(b)&&b>a&&b-a<=30000&&now>=a-10000&&now<=b,'CLIENT_WINDOW_REFUSED');
  return new Promise(resolve=>{
   const messages=[];let socket,bytes=0,last=now,subscribedAt=null,state='WAIT_CONNECTED',done=false,finishTimer,startup;
   const finish=reason=>{if(done)return;done=true;timers.clear(finishTimer);timers.clear(startup);signal?.removeEventListener('abort',cancel);try{socket?.close();}catch{}resolve({status:reason==='COMPLETE'?'COMPLETE':'INCOMPLETE',reason,messages,coveredFrom:subscribedAt===null?null:new Date(Math.max(a,subscribedAt)).toISOString(),coveredUntil:reason==='COMPLETE'?end:null,bytes,connections:1});};
   const cancel=()=>finish('WINDOW_INTERRUPTED');
   if(signal?.aborted){finish('WINDOW_INTERRUPTED');return;}signal?.addEventListener('abort',cancel,{once:true});
   startup=timers.set(()=>finish('CLIENT_STARTUP_TIMEOUT'),Math.min(10000,b-now));
   finishTimer=timers.set(()=>finish(subscribedAt!==null&&subscribedAt<=a?'COMPLETE':'LATE_SUBSCRIPTION'),b-now);
   try{socket=socketFactory('wss://stream.data.alpaca.markets/v2/sip');}catch{finish('SOCKET_START_FAILED');return;}
   socket.addEventListener('error',()=>finish('SOCKET_ERROR'));socket.addEventListener('close',()=>finish('EARLY_SOCKET_CLOSE'));
   socket.addEventListener('message',event=>{
    if(done)return;try{
     const at=clock();need(Number.isFinite(at)&&at>=last&&at<=b,'RECEIVE_CLOCK_INVALID');last=at;
     need(typeof event.data==='string','WIRE_TEXT_REQUIRED');const raw=Buffer.from(event.data);bytes+=raw.length;need(bytes<=maxBytes&&messages.length<maxMessages,'CLIENT_STORAGE_CAP');
     // Retain original provider bytes and the actual original system receipt clock, before parsing.
     messages.push({base64:raw.toString('base64'),receivedAt:new Date(at).toISOString()});
     const rows=JSON.parse(event.data);need(Array.isArray(rows)&&rows.length>0,'WIRE_SCHEMA_ERROR');
     for(const row of rows){
      if(row.T==='error')throw Error('PROVIDER_REFUSAL');
      if(row.T==='success'&&row.msg==='connected'){need(state==='WAIT_CONNECTED','PROTOCOL_ORDER_UNKNOWN');state='AUTH_SENT';socket.send(JSON.stringify({action:'auth',key:credentials.key,secret:credentials.secret}));}
      else if(row.T==='success'&&row.msg==='authenticated'){need(state==='AUTH_SENT','PROTOCOL_ORDER_UNKNOWN');state='SUBSCRIBE_SENT';socket.send(JSON.stringify({action:'subscribe',quotes:[symbol]}));}
      else if(row.T==='subscription'){need(state==='SUBSCRIBE_SENT','PROTOCOL_ORDER_UNKNOWN');need(Array.isArray(row.quotes)&&row.quotes.length===1&&row.quotes[0]===symbol,'SUBSCRIPTION_MISMATCH');subscribedAt=at;state='ACTIVE';timers.clear(startup);}
      else if(row.T==='q')need(state==='ACTIVE'&&subscribedAt!==null&&row.S===symbol,'UNSUBSCRIBED_OR_WRONG_SYMBOL');
      else throw Error('UNEXPECTED_WIRE_MESSAGE');
     }
    }catch(e){finish(/^[A-Z_]+$/.test(e.message)?e.message:'WIRE_SCHEMA_ERROR');}
   });
  });
 }};
}
