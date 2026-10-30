// Offline, read-only pending-sale gate. Never import scan.mjs or recover a sale.
// Output contract: exactly PASS, BLOCKED or ERROR; no exception/data/identifier output.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createDecipheriv} from 'node:crypto';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function check(root){
 if(!process.env.PRIVATE_KEY)return 'BLOCKED';
 const specs=[['private.enc',8*1024*1024],['my-positions.json',16*1024*1024],['my-trades.jsonl',64*1024*1024],['leaderdip-ledger.jsonl',64*1024*1024]],buffers=[];
 for(const [name,limit] of specs){const file=path.join(root,'data',name);let stat;try{stat=fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return 'BLOCKED';throw e;}if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit)throw Error();const b=fs.readFileSync(file);if(b.length>limit)throw Error();buffers.push(b);}
 const encoded=buffers[0].toString('utf8').trim();if(!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length%4!==0)throw Error();
 const b=Buffer.from(encoded,'base64');if(b.length<29)throw Error();const key=createHash('sha256').update(process.env.PRIVATE_KEY).digest(),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));let plain;
 try{plain=Buffer.concat([d.update(b.subarray(28)),d.final()]);}finally{key.fill(0);}
 let state;try{state=JSON.parse(plain.toString('utf8'));}finally{plain.fill(0);}if(!object(state))throw Error();
 // Conservatively block every retained intent, even if apparently complete. Reconciliation
 // belongs to a separately scoped operator; this checker never identifies/repairs it.
 const pending=Object.hasOwn(state,'pendingSale');
 if(state.shares!==undefined&&!object(state.shares)||state.closed!==undefined&&!Array.isArray(state.closed)||state.saleReceipts!==undefined&&(!Array.isArray(state.saleReceipts)||state.saleReceipts.some(x=>typeof x!=='string')))throw Error();
 if(!object(JSON.parse(buffers[1].toString('utf8'))))throw Error();
 for(const bytes of buffers.slice(2))for(const line of bytes.toString('utf8').split('\n'))if(line.trim()&&!object(JSON.parse(line)))throw Error();
 // Detect an unprotected/moving local copy. An immutable source snapshot and external
 // current-main revalidation are still required; this is not a production locking claim.
 for(let i=0;i<specs.length;i++){const file=path.join(root,'data',specs[i][0]),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>specs[i][1]||!fs.readFileSync(file).equals(buffers[i]))throw Error();}
 return pending?'BLOCKED':'PASS';
}
let status='ERROR';try{if(process.argv.length!==3)throw Error();status=check(path.resolve(process.argv[2]));}catch{}process.stdout.write(status+'\n');process.exitCode=status==='PASS'?0:status==='BLOCKED'?2:1;
