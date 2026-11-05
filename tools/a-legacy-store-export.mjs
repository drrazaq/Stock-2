// Inactive explicit read-only inspection. No financial migration, key use or output-copy default.
import {pathToFileURL} from 'node:url';import {createAFencedStore} from '../a-fenced-store.mjs';import {planLegacyCopyOut} from '../a-legacy-store-export.mjs';
export function inspectLegacyStore(directory){const p=planLegacyCopyOut(createAFencedStore(directory));return {status:p.status,files:p.files,totalBytes:p.totalBytes,manifestHash:p.manifestHash,admissionEligible:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{if(process.argv.length!==3)throw Error('ARGS');process.stdout.write(JSON.stringify(inspectLegacyStore(process.argv[2]))+'\n');}catch{process.stdout.write('ERROR\n');process.exitCode=1;}}
