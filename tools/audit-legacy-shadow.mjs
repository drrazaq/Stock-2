// Offline local Git-object audit. No fetch, provider request, original writes or secret access.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {auditLegacyShadow,auditCasesCsv} from '../legacy-paper-audit.mjs';
const args=process.argv.slice(2),opts={};for(let i=0;i<args.length;i+=2){if(!['--ref','--path','--expected-sha256','--output'].includes(args[i])||!args[i+1]||opts[args[i]])throw Error('INVALID_ARGUMENTS');opts[args[i]]=args[i+1];}
const ref=opts['--ref']||'f8a3fa97b08d94e1e5608e6c777787ac347da0a3',file=opts['--path']||'data/shadow/2026-10-30.jsonl.gz',expected=opts['--expected-sha256']||'722e4923fc9a5ae9fc6ba8596bf20ebea71de7efd346840d00c6b0911c324228';
if(!/^[a-f0-9]{40}$/.test(ref)||!/^data\/shadow\/\d{4}-\d\d-\d\d\.jsonl\.gz$/.test(file)||!/^[a-f0-9]{64}$/.test(expected))throw Error('INVALID_PIN');
const git=(...args)=>{try{return execFileSync('git',['--no-replace-objects','-c','protocol.allow=never',...args],{env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'},timeout:5000,maxBuffer:8*1024*1024});}catch{throw Error('LOCAL_GIT_READ_FAILED');}};
const compressed=git('show',ref+':'+file),sha=createHash('sha256').update(compressed).digest('hex');if(sha!==expected)throw Error('ARTIFACT_HASH_MISMATCH');
const meta=git('show','-s','--format=%H%n%P%n%aI%n%cI',ref).toString().trim().split('\n'),blob=git('rev-parse',ref+':'+file).toString().trim();
const protocolBytes=fs.readFileSync(new URL('../discovery-paper.mjs',import.meta.url)),protocolSha256=createHash('sha256').update(protocolBytes).digest('hex');if(protocolSha256!=='57254fa0a2845cf392d4f5cbb59225eeda5d9387e34f1d7be6de546baf452b43')throw Error('FROZEN_PROTOCOL_SOURCE_MISMATCH');
const report=auditLegacyShadow(compressed,{cutoff:meta[3],provenance:{protocolSha256,admissionRevision:'IDENTITY_EVENT_QUOTES_EXPOSURE_V3',commit:meta[0],parent:meta[1],authorTime:meta[2],commitTime:meta[3],path:file,blob,expectedCompressedSha256:expected,sourceAuthenticity:'Immutable repository evidence; not provider authentication or V1 prospective enrollment'}});
const {cases,...summary}=report;
if(opts['--output']){const dir=path.resolve(opts['--output']);if(fs.existsSync(dir))throw Error('OUTPUT_EXISTS');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'audit.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(dir,'cases.csv'),auditCasesCsv(report),{flag:'wx'});}
process.stdout.write(JSON.stringify(summary,null,2)+'\n');
