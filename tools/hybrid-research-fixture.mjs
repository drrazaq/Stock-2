// Offline-only entry point. No --collect mode or credentials binding.
import fs from 'node:fs';
import path from 'node:path';
import {runHybridFixture} from '../hybrid-research-fixture.mjs';
const args=process.argv.slice(2);
if(args.length!==3||args[0]!=='--fixture')throw Error('OFFLINE_ONLY: use --fixture INPUT_JSON NEW_OUTPUT_DIR; live collection is not installed');
const stat=fs.lstatSync(args[1]);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw Error('FIXTURE_INPUT_BUDGET');
const result=await runHybridFixture(JSON.parse(fs.readFileSync(args[1],'utf8')));
// Refuse existing paths; never overwrite owner data or a prior fixture run.
fs.mkdirSync(args[2],{mode:0o700});
fs.writeFileSync(path.join(args[2],'fixture-result.json'),JSON.stringify(result),{flag:'wx',mode:0o600});
console.log(JSON.stringify({kind:result.kind,cycles:result.report.cycles,termination:result.termination,liveCollection:false,orders:false,approvedBuy:false}));
