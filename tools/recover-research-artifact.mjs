// Offline recovery only. No network, broker, Telegram or production-data writes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {openResearch} from './seal-research-artifact.mjs';
export function recoverDirectory(input,output,secret,sourceSha,maxBytes=128*1024*1024){
 if(!/^[a-f0-9]{40}$/.test(sourceSha)||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>128*1024*1024)throw Error('INVALID_RECOVERY_SCOPE');
 if(fs.existsSync(output))throw Error('RECOVERY_OUTPUT_ALREADY_EXISTS');
 if(fs.lstatSync(input).isSymbolicLink())throw Error('RECOVERY_SYMLINK_BLOCKED');
 const payloads=[];let bytes=0;
 const walk=dir=>{for(const name of fs.readdirSync(dir)){
  const file=path.join(dir,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('RECOVERY_SYMLINK_BLOCKED');
  if(stat.isDirectory()){walk(file);continue;}
  if(!stat.isFile()||!name.endsWith('.enc'))throw Error('UNEXPECTED_RECOVERY_FILE');
  if(stat.size>maxBytes)throw Error('RECOVERY_BUDGET_EXCEEDED');
  const envelope=JSON.parse(fs.readFileSync(file,'utf8')),relative=path.relative(input,file).slice(0,-4);
  if(relative==='recovery-report.json'||!relative||!/^[A-Za-z0-9_./-]+$/.test(relative)||relative.includes('..')||path.isAbsolute(relative)||envelope.context?.path!==relative||envelope.context?.sourceSha!==sourceSha)throw Error('RECOVERY_SCOPE_MISMATCH');
  const body=openResearch(envelope,secret);bytes+=body.length;if(bytes>maxBytes)throw Error('RECOVERY_BUDGET_EXCEEDED');
  // Verify every authentication tag before creating the output directory.
  payloads.push({relative,body});
 }};walk(input);if(!payloads.length)throw Error('EMPTY_RECOVERY');
 const summaries=[];
 for(const p of payloads)if(p.relative.endsWith('/summary.json')){
  const summary=JSON.parse(p.body.toString()),dir=path.dirname(p.relative);
  const cycles=payloads.filter(x=>path.dirname(x.relative)===dir&&/^\d{3}\.json\.gz$/.test(path.basename(x.relative)));
  const problems=[];
  if(summary.sourceSha!==sourceSha)problems.push('SUMMARY_SOURCE_MISMATCH');
  if(summary.executionWindowComplete===true&&(summary.cycles!==330||summary.uniqueMinutes!==330))problems.push('CLOCK_FLAG_NOT_SUPPORTED_BY_COUNT');
  if(!Number.isInteger(summary.cycles)||summary.cycles!==cycles.length)problems.push('MISSING_OR_EXTRA_CYCLE_FILES');
  for(const cycle of cycles){const row=JSON.parse(zlib.gunzipSync(cycle.body,{maxOutputLength:32*1024*1024}).toString());if(row.kind!=='RESEARCH_ONLY'||row.claims?.orders!==false||row.claims?.approvedBuy!==false)problems.push('UNEXPECTED_CYCLE_SCOPE');}
  summaries.push({attempt:dir,cycles:cycles.length,clockWindowComplete:summary.executionWindowComplete===true,problems});
 }
 fs.mkdirSync(output);for(const p of payloads){const dest=path.join(output,p.relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,p.body,{flag:'wx',mode:0o600});}
 const complete=summaries.length>0&&summaries.every(x=>!x.problems.length&&x.clockWindowComplete);
 const report={sourceSha,files:payloads.length,bytes,authenticated:true,status:complete?'AUTHENTICATED_CLOCK_WINDOW_ONLY':'AUTHENTICATED_INCOMPLETE',summaries,
  note:'Authentication does not prove all files were uploaded, source completeness, freshness or profitability. Missing summaries/clock coverage remain incomplete. Plaintext stays in the chosen local output directory.'};
 fs.writeFileSync(path.join(output,'recovery-report.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==5)throw Error('usage: node tools/recover-research-artifact.mjs ENCRYPTED_DIR NEW_OUTPUT_DIR EXPECTED_SOURCE_SHA');
 console.log(JSON.stringify(recoverDirectory(process.argv[2],process.argv[3],process.env.RESEARCH_ARTIFACT_KEY,process.argv[4])));
}
