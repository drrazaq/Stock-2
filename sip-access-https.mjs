// Single HTTP attempt; Node's core HTTPS request does not retry or follow redirects.
// No key lookup and no request until the protected runner explicitly calls this factory.
import https from 'node:https';import {Readable} from 'node:stream';
export function createSingleAttemptHttpsRequest({requestImpl=https.request}={}){
 if(typeof requestImpl!=='function')throw Error('TRANSPORT_ERROR');
 return (url,options)=>new Promise((resolve,reject)=>{
  const u=new URL(url);
  if(u.origin!=='https://data.alpaca.markets'||u.username||u.password||u.hash||options.method!=='GET'||options.redirect!=='error')return reject(Error('TRANSPORT_ERROR'));
  let request;try{
   request=requestImpl(u,{method:'GET',headers:options.headers,agent:false,signal:options.signal},response=>{
    resolve({status:response.statusCode,headers:{get:name=>{const value=response.headers[String(name).toLowerCase()];return typeof value==='string'?value:null;}},body:Readable.toWeb(response)});
   });
   request.once('error',reject);request.end();
  }catch(e){request?.destroy();reject(e);}
 });
}
