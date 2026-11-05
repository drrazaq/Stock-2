// Explicit inactive offline command. No credentials, store creation, network or delivery.
import {pathToFileURL} from 'node:url';
import {withOriginals} from '../a-evidence-contract.mjs';
import {captureJson} from '../capture-json.mjs';
import {createAFencedStore} from '../a-fenced-store.mjs';
import {importNativeAEvidence} from '../a-native-evidence-importer.mjs';
export function runNativeEvidenceFiles(originalsDirectory,requestRef){return withOriginals(originalsDirectory,read=>{const request=captureJson(read(requestRef).toString());const store=createAFencedStore(request.storeDirectory);return importNativeAEvidence({store,token:request.fenceToken,originalsDirectory,request});});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{if(process.argv.length!==5)throw Error('ARGS');const result=runNativeEvidenceFiles(process.argv[2],{file:process.argv[3],sha256:process.argv[4]});process.stdout.write(JSON.stringify({status:result.status==='OFFLINE_RESEARCH_ONLY'?'OFFLINE_RESEARCH_ONLY':'UNKNOWN',allowBuy:false,prospectiveAdmissions:0})+'\n');}catch{process.stdout.write('ERROR\n');process.exitCode=1;}}
