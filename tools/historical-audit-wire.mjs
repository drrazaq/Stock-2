// Single-request wire for the isolated historical action. No redirects/retries,
// environment lookup or default execution. The private runtime token stays in headers.
import https from 'node:https';
export function singleHttpsRequest({url,method='GET',headers={},body,timeoutMs,maxBytes}){
 return new Promise((resolve,reject)=>{let u;try{u=new URL(url);}catch{return reject(Error('WIRE_URL'));}if(u.protocol!=='https:'||u.username||u.password||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>167772160)return reject(Error('WIRE_SCOPE'));
 const actualHeaders={...headers,...(Buffer.isBuffer(body)?{'Content-Length':String(body.length)}:{})};const req=https.request(u,{method,headers:actualHeaders,timeout:timeoutMs},res=>{let bytes=0;const parts=[];res.on('data',b=>{bytes+=b.length;if(bytes>maxBytes){res.destroy(Error('WIRE_BODY_CAP'));req.destroy(Error('WIRE_BODY_CAP'));}else parts.push(b);});res.on('error',()=>reject(Error('WIRE_IO')));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(parts),headers:res.headers}));});const timer=setTimeout(()=>req.destroy(Error('WIRE_DEADLINE')),timeoutMs);req.on('timeout',()=>req.destroy(Error('WIRE_DEADLINE')));req.on('error',()=>reject(Error('WIRE_IO')));req.on('close',()=>clearTimeout(timer));if(body)req.write(body);req.end();
 });
}
