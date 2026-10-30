// Offline authenticated recovery of downloaded upload-artifact ZIPs. No network,
// key in argv/env, financial record writes, or automatic session resumption.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureJson} from '../capture-json.mjs';
import {immutableRead,recoverUploadedCapture} from '../paper-capture-wrapper.mjs';
export function recoverDirectory({input,receiptFile,expectedReceiptSha256,expectedApprovalHash,expectedSourceSha,output,key}){
 const raw=immutableRead(receiptFile,65536).bytes.toString(),m=captureJson(raw),archives=new Map();
 if(!Array.isArray(m.receipts)||m.receipts.length>41)throw Error('RECEIPT_SCOPE');
 let size=0;for(const r of m.receipts){if(!Number.isSafeInteger(r.artifactId)||r.artifactId<1)throw Error('ARTIFACT_ID');const bytes=immutableRead(path.join(input,'artifact-'+r.artifactId+'.zip'),16*1024*1024).bytes;size+=bytes.length;if(size>164*1024*1024)throw Error('ARCHIVE_BUDGET');archives.set(r.artifactId,bytes);}
 const result=recoverUploadedCapture({archives,receiptRaw:raw,expectedReceiptSha256,expectedApprovalHash,expectedSourceSha,key});
 for(let p=path.resolve(output);;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('RECOVERY_SYMLINK');if(path.dirname(p)===p)break;}
 if(fs.existsSync(output))throw Error('RECOVERY_OUTPUT_EXISTS');fs.mkdirSync(output,{mode:0o700});fs.writeFileSync(path.join(output,'authenticated-capture.json'),JSON.stringify(result),{flag:'wx',mode:0o600});return {status:result.status,frames:result.frames,genuineAdmissions:0,automaticResumeAuthorized:false};
}
function hiddenKey(){
 if(!process.stdin.isTTY||typeof process.stdin.setRawMode!=='function')throw Error('HIDDEN_TTY_REQUIRED');let bytes=[];const old=process.stdin.isRaw;process.stderr.write('Research artifact key (hidden): ');process.stdin.setRawMode(true);
 try{for(;;){const b=Buffer.alloc(1);if(fs.readSync(0,b,0,1,null)!==1)throw Error('KEY_INPUT_ABORTED');if(b[0]===3||b[0]===4)throw Error('KEY_INPUT_ABORTED');if(b[0]===10||b[0]===13)break;if(b[0]===8||b[0]===127){bytes.pop();continue;}bytes.push(b[0]);if(bytes.length>1024)throw Error('KEY_INPUT_BUDGET');}return Buffer.from(bytes).toString('utf8');}finally{process.stdin.setRawMode(old);process.stderr.write('\n');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{
 const [mode,input,receiptFile,expectedReceiptSha256,expectedApprovalHash,expectedSourceSha,output]=process.argv.slice(2);if(process.argv.length!==9||!['--recover','--fixture'].includes(mode))throw Error('RECOVERY_ARGUMENTS');
 const key=mode==='--fixture'?'synthetic-paper-capture-key-only':hiddenKey();console.log(JSON.stringify(recoverDirectory({input,receiptFile,expectedReceiptSha256,expectedApprovalHash,expectedSourceSha,output,key})));
 }catch{console.error('PAPER_CAPTURE_RECOVERY_ERROR');process.exitCode=1;}}
