// Local TLS only. Synthetic ephemeral certificate, no credentials or external I/O.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import https from 'node:https';import {spawn,execFileSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-custody-timeout-'));fs.chmodSync(dir,0o700);let server;
try{
 const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore',timeout:10000});let calls=0;
 server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(_req,res)=>{calls++;res.writeHead(200);res.flushHeaders();});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const code=`import {singleHttpsRequest} from ${JSON.stringify(new URL('./historical-audit-wire.mjs',import.meta.url).href)};let refused=false;try{await singleHttpsRequest({url:${JSON.stringify('https://127.0.0.1:'+server.address().port)},timeoutMs:10000,maxBytes:167772160});}catch{refused=true;}process.exitCode=refused?0:1;`;
 const start=performance.now(),child=spawn(process.execPath,['--input-type=module','-e',code],{env:{NODE_EXTRA_CA_CERTS:cert},stdio:'ignore'});const result=await new Promise(r=>child.on('close',r));if(result!==0||calls!==1||performance.now()-start<9500||performance.now()-start>14000)throw Error('DEADLINE_PROOF');console.log('PASS');
}catch{console.log('ERROR');process.exitCode=1;}finally{server?.closeAllConnections();server?.close();fs.rmSync(dir,{recursive:true,force:true});}
