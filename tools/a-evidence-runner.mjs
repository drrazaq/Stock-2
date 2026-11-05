import fs from 'node:fs';import path from 'node:path';
// Explicit offline integration only; supplied local trust roots are not owner approval.
import {pathToFileURL} from 'node:url';
import {runAEvidenceDataset,withOriginals} from '../a-evidence-contract.mjs';
export function runEvidenceFiles(directory){return withOriginals(directory,read=>{const input=read.control('request.json');if(input.length>1024*1024)throw Error('REQUEST_CAP');const request=JSON.parse(input);return runAEvidenceDataset(JSON.parse(read(request.dataset).toString()),JSON.parse(read(request.contract).toString()),directory);});}
export function persistEvidenceReport(directory,result){
 const root=path.resolve(directory);if(fs.realpathSync(root)!==root)throw Error('PRIVATE_OUTPUT_REQUIRED');
 const d=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 try{const st=fs.fstatSync(d);if(st.mode&0o077||fs.realpathSync(`/proc/self/fd/${d}`)!==root)throw Error('PRIVATE_OUTPUT_REQUIRED');const f=fs.openSync(`/proc/self/fd/${d}/evidence-report.json`,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(f,JSON.stringify(result)+'\n');fs.fsyncSync(f);}finally{fs.closeSync(f);}fs.fsyncSync(d);}finally{fs.closeSync(d);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{if(process.argv.length!==3)throw Error('ARGS');const result=runEvidenceFiles(process.argv[2]);persistEvidenceReport(process.argv[2],result);process.stdout.write(JSON.stringify({status:'OFFLINE_REPORT_SAVED',synthetic:result.synthetic,allowBuy:false,prospectiveAdmissions:0})+'\n');}catch{process.stderr.write('A_EVIDENCE_ERROR\n');process.exitCode=1;}}
