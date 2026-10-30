// Dependency-injected, offline-tested transport preparation. No default fetcher or key lookup.
import {newCapture,appendCapture,frameFromSnapshots,finishCapture} from './prospective-paper-capture.mjs';
export async function runCalibration({plan,transport,now,wait,readEvents,metadata,persist}){
 let state=newCapture(plan),attempts=0,bytes=0,status='INCOMPLETE';
 const start=Date.parse(plan.start),end=Date.parse(plan.end);
 const bounded=async fn=>{let timer;try{return await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOCAL_CALLBACK_TIMEOUT_STOP')),10000);})]);}finally{clearTimeout(timer);}};
 try{
  for(let i=0;i<41;i++){
   // Last cycle starts ten seconds before the hard end, to leave response headroom.
   const due=i===40?end-10000:start+i*60000;
   if(now()<due)await wait(due-now());
   if(now()>end-10000){status='TIME_LIMIT';break;}
   const requestedAt=new Date(now()).toISOString();attempts++;
   const controller=new AbortController();let timer;
   const operation=(async()=>{
    const response=await transport('https://data.alpaca.markets/v2/stocks/snapshots?symbols='+plan.universe.join(',')+'&feed=sip',{method:'GET',redirect:'error',signal:controller.signal});
    if(response.status!==200)throw Error(response.status===429?'RATE_LIMIT_STOP':'PROVIDER_FAILURE_STOP');
    const reader=response.body.getReader(),parts=[];let size=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;bytes+=value.byteLength;if(size>65536||bytes>8388608)throw Error('RESPONSE_BUDGET_STOP');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
    return Buffer.concat(parts).toString('utf8');
   })();
   let rawResponse;
   try{rawResponse=await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('REQUEST_TIMEOUT_STOP'));},10000);})]);}finally{clearTimeout(timer);controller.abort();}
   if(now()>end){status='TIME_LIMIT';break;}
   const receivedAt=new Date(now()).toISOString();
   state=appendCapture(state,frameFromSnapshots({sequence:state.frames.length,requestedAt,receivedAt,rawResponse,events:await bounded(()=>readEvents(receivedAt)),metadata,universe:plan.universe}));
   // Mandatory authenticated encrypted checkpoint upload ACK before another provider request.
   if(await bounded(()=>persist(state))!==true){status='CHECKPOINT_UNCONFIRMED_STOP';break;}
   status=i===40?'CAPTURE_COMPLETE':'INCOMPLETE';
  }
 }catch(e){status=['RATE_LIMIT_STOP','PROVIDER_FAILURE_STOP','RESPONSE_BUDGET_STOP','REQUEST_TIMEOUT_STOP','LOCAL_CALLBACK_TIMEOUT_STOP'].includes(e.message)?e.message:'INPUT_OR_CHECKPOINT_ERROR_STOP';}
 return {status,providerAttempts:attempts,responseBytes:bytes,checkpointState:state,...finishCapture(state)};
}
