// Offline recovery receipt. No network or environment reads on import.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {hash,privateRead,recoverArchive,produceRecoveryReceipt,saveRecoveryReceipt,assertPrivateDirectory} from './historical-audit-custody.mjs';
export function buildReceipt({archive,authorization,runId,secret,outputParent}){
 if(!Number.isSafeInteger(runId)||runId<1)throw Error('RECEIPT_RUN');assertPrivateDirectory(outputParent);
 const context={sourceSHA:authorization.sourceSHA,scopeHash:authorization.scopeHash,approvalSHA256:hash(Buffer.from(JSON.stringify(authorization))),runId};
 const directory=fs.mkdtempSync(path.join(outputParent,'receipt-recovery-'));fs.chmodSync(directory,0o700);
 recoverArchive(archive,directory,secret,{expectedArchiveSHA256:hash(archive),expectedContext:context});
 const receipt=produceRecoveryReceipt({archive,directory,secret,authorization,context,acknowledgedSHA256:hash(archive)});saveRecoveryReceipt(outputParent,'recovery-receipt-'+runId+'.json',receipt);return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{if(process.argv.length!==6)throw Error('ARGS');buildReceipt({archive:privateRead(process.argv[2],167772160),authorization:JSON.parse(privateRead(process.argv[3],262144)),runId:Number(process.argv[4]),outputParent:process.argv[5],secret:process.env.RESEARCH_ARTIFACT_KEY});console.log('PASS');}catch{console.log('ERROR');process.exitCode=1;}}
