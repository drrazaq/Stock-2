// Actual action entry; never prints child stderr, keys, provider text or quotes.
import fs from 'node:fs';import {fileURLToPath,pathToFileURL} from 'node:url';
import {launchAuditedChild} from '../historical-audit-launcher.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
const r=await launchAuditedChild(fileURLToPath(new URL('../historical-audit-action.mjs',import.meta.url)));
try{fs.writeFileSync(process.env.AUDIT_RESULT_FILE,JSON.stringify({result:r.publicResult,exit:r.exit}),{flag:'wx',mode:0o600});}catch{console.log('{"status":"ERROR","reason":"INTERNAL_ERROR","counts":{"providerRequests":0,"responses":0}}');process.exitCode=1;}
if(process.exitCode!==1){console.log(JSON.stringify(r.publicResult));process.exitCode=r.exit;}

}
