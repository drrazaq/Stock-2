// Wrapper tests for the proposed bot.yml amendment (ops/bot-yml-preflight-v2.patch): run explicitly with
//   node --test ops/accounting-preflight-wrapper.test.mjs
// The patch is applied to a temporary copy of this checkout's .github/workflows/bot.yml (skipped if that is not the
// pinned main version). The protected and emit steps run exactly as written, against a FAKE checker that prints a
// chosen output; no key, no network (the emit step's GitHub URL is replaced by a local file:// repository).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.join(HERE,'..'),BOT=path.join(ROOT,'.github/workflows/bot.yml');
const BOT_MAIN='1d25e6fec025f7a7e5e7a254cd61a9df4ecd7df97423b74a84fabd68ab6061e8',sha=b=>createHash('sha256').update(b).digest('hex');
const ready=fs.existsSync(BOT)&&sha(fs.readFileSync(BOT))===BOT_MAIN,needs=ready?{}:{skip:'checkout bot.yml is not the pinned main version'};
const dirs=[],tmp=p=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),p));dirs.push(d);return d;};test.after(()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
const REVIEWED=(()=>{const m=fs.readFileSync(path.join(HERE,'accounting-preflight-v2.mjs'),'utf8').match(/const REASONS=new Set\(\[([^\]]*)\]\)/);return m[1].split(',').map(x=>x.replace(/'/g,''));})();
// the amended workflow, and the run: blocks of its named steps (YAML block scalars, dedented)
let wf='';if(ready){const d=tmp('wf-');fs.mkdirSync(path.join(d,'.github/workflows'),{recursive:true});fs.copyFileSync(BOT,path.join(d,'.github/workflows/bot.yml'));
 const r=spawnSync('git',['apply',path.join(HERE,'bot-yml-preflight-v2.patch')],{cwd:d,encoding:'utf8'});assert.equal(r.status,0,r.stderr);wf=fs.readFileSync(path.join(d,'.github/workflows/bot.yml'),'utf8');}
function stepRun(name){const L=wf.split('\n'),i=L.findIndex(l=>l==='      - name: '+name);assert.ok(i>=0,name);let j=L.findIndex((l,k)=>k>i&&l==='        run: |');const out=[];
 for(j++;j<L.length&&(L[j]===''||L[j].startsWith('          '));j++)out.push(L[j].slice(10));return out.join('\n');}
const G={GIT_AUTHOR_NAME:'f',GIT_AUTHOR_EMAIL:'f@x',GIT_COMMITTER_NAME:'f',GIT_COMMITTER_EMAIL:'f@x',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
function fakeChecker(rt,{out,code,fresh='PASS\n',freshCode=0}){fs.writeFileSync(path.join(rt,'accounting-preflight.mjs'),
 'const fresh=process.argv[2]==="--fresh";process.stdout.write(fresh?'+JSON.stringify(fresh)+':'+JSON.stringify(out)+');process.exitCode=fresh?'+freshCode+':'+code+';\n');}
const bash=(script,env,cwd)=>spawnSync('bash',['--noprofile','--norc','-e','-o','pipefail','-c',script],{cwd,encoding:'utf8',env:{PATH:process.env.PATH,HOME:os.tmpdir(),...G,...env}});
function protectedStep(out,code){const rt=tmp('rt-'),ws=tmp('ws-');fakeChecker(rt,{out,code});const r=bash(stepRun('Protected offline pending-sale check'),{RUNNER_TEMP:rt,GITHUB_WORKSPACE:ws,PRIVATE_KEY:'synthetic'},ws);
 assert.equal(r.status,0,r.stderr);return {value:fs.readFileSync(path.join(rt,'accounting-preflight.result'),'utf8'),raw:fs.existsSync(path.join(rt,'accounting-preflight.raw'))};}
function emitStep(value,{fresh,freshCode,fetchOk=true}={}){const rt=tmp('rt-'),out=path.join(tmp('out-'),'o');fs.writeFileSync(out,'');fakeChecker(rt,{out:'',code:0,fresh,freshCode});
 fs.writeFileSync(path.join(rt,'accounting-preflight.result'),value);fs.writeFileSync(path.join(rt,'accounting-preflight-source.json'),'{}');
 const src=tmp('src-'),ws=path.join(tmp('ws-'),'c');for(const a of [['init','-q','-b','main'],['commit','-q','--allow-empty','-m','s']])spawnSync('git',a,{cwd:src,env:{...process.env,...G}});spawnSync('git',['clone','-q','file://'+src,ws],{env:{...process.env,...G}});
 const script=stepRun('Emit only protected result after state freshness check').replace('https://github.com/drrazaq/Stock-2.git',fetchOk?'file://'+src:'file:///nonexistent/repo');
 const r=bash(script,{RUNNER_TEMP:rt,GITHUB_OUTPUT:out,GIT_TERMINAL_PROMPT:'0'},ws);
 const o=Object.fromEntries(fs.readFileSync(out,'utf8').split('\n').filter(Boolean).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
 return {code:r.status,stdout:r.stdout,outputs:o,leftover:fs.readdirSync(rt)};}

test('the workflow allowlist is exactly the checker\'s reviewed reason codes (no drift)',needs,()=>{const lists=[...wf.matchAll(/^ {10}codes='([^']*)'$/gm)].map(m=>m[1]);assert.equal(lists.length,2);for(const l of lists)assert.deepEqual(l.split('|').sort(),[...REVIEWED].sort());assert.equal(REVIEWED.length,16);});
test('timeout, memory limit and status-only plumbing are preserved',needs,()=>{const p=stepRun('Protected offline pending-sale check');assert.match(p,/timeout 10s node --max-old-space-size=256 "\$RUNNER_TEMP\/accounting-preflight\.mjs" "\$GITHUB_WORKSPACE"/);assert.match(p,/2>\/dev\/null \|\| rc=\$\?/);assert.match(p,/rm -f "\$RUNNER_TEMP\/accounting-preflight\.raw"/);assert.match(wf,/timeout-minutes: 2/);});

// ---- protected step: every allowed output, and malformed or unknown ones
test('protected step keeps PASS, ERROR and every reviewed BLOCKED code',needs,()=>{assert.equal(protectedStep('PASS\n',0).value,'PASS\n');assert.equal(protectedStep('ERROR\n',1).value,'ERROR\n');
 for(const c of REVIEWED){const r=protectedStep('BLOCKED '+c+'\n',2);assert.equal(r.value,'BLOCKED '+c+'\n',c);assert.equal(r.raw,false);}});
const MALFORMED=['BLOCKED NOT_A_REVIEWED_CODE\n','BLOCKED\n','BLOCKED \n','BLOCKED  MISSING_KEY\n','BLOCKED missing_key\n','BLOCKED MISSING_KEY EXTRA\n','BLOCKED STATE_CHANGEDX\n','BLOCKED XSTATE_CHANGED\n','XBLOCKED MISSING_KEY\n',
 'BLOCKED MISSING_KEY|PASS\n','BLOCKED .*\n','BLOCKED (MISSING_KEY)\n','PASS \n',' PASS\n','pass\n','PASSED\n','PASS\nPASS\n','BLOCKED MISSING_KEY\nPASS\n','PASS\nBLOCKED MISSING_KEY\n','\n','','ERROR detail\n','BLOCKED\tMISSING_KEY\n'];
test('protected step turns unknown codes and malformed output into ERROR',needs,()=>{for(const out of MALFORMED){const rc=/^PASS/.test(out)?0:/^ERROR/.test(out)?1:2;assert.equal(protectedStep(out,rc).value,'ERROR\n',JSON.stringify(out));}});
test('protected step turns a mismatched exit code into ERROR',needs,()=>{for(const [out,rc] of [['PASS\n',2],['PASS\n',1],['PASS\n',124],['BLOCKED MISSING_KEY\n',0],['BLOCKED MISSING_KEY\n',1],['ERROR\n',0],['ERROR\n',2],['BLOCKED STATE_CHANGED\n',137]])assert.equal(protectedStep(out,rc).value,'ERROR\n',out+rc);});

// ---- emit step: outputs, exit codes, freshness and cleanup
test('emit step publishes every reviewed BLOCKED code as status/reason, exit 2, and cleans up',needs,()=>{for(const c of REVIEWED){const r=emitStep('BLOCKED '+c+'\n');assert.equal(r.code,2,c);assert.deepEqual(r.outputs,{status:'BLOCKED',reason:c});assert.equal(r.stdout,'BLOCKED '+c+'\n');assert.deepEqual(r.leftover,[]);}
 let r=emitStep('ERROR\n');assert.equal(r.code,1);assert.deepEqual(r.outputs,{status:'ERROR',reason:''});});
test('emit step turns unknown codes and malformed results into ERROR',needs,()=>{for(const v of MALFORMED){const r=emitStep(v);assert.equal(r.code,1,JSON.stringify(v));assert.deepEqual(r.outputs,{status:'ERROR',reason:''});assert.deepEqual(r.leftover,[]);}});
test('emit step PASS requires a fresh-mode PASS; only STATE_CHANGED may block; anything else is ERROR',needs,()=>{
 let r=emitStep('PASS\n',{fresh:'PASS\n',freshCode:0});assert.equal(r.code,0);assert.deepEqual(r.outputs,{status:'PASS',reason:''});assert.deepEqual(r.leftover,[]);
 r=emitStep('PASS\n',{fresh:'BLOCKED STATE_CHANGED\n',freshCode:2});assert.equal(r.code,2);assert.deepEqual(r.outputs,{status:'BLOCKED',reason:'STATE_CHANGED'});
 for(const fresh of ['BLOCKED NOT_A_REVIEWED_CODE\n','BLOCKED MISSING_KEY\n','ERROR\n','','PASS\nPASS\n','pass\n']){r=emitStep('PASS\n',{fresh,freshCode:fresh.startsWith('BLOCKED')?2:1});assert.equal(r.code,1,JSON.stringify(fresh));assert.deepEqual(r.outputs,{status:'ERROR',reason:''});}
 r=emitStep('PASS\n',{fresh:'PASS\n',freshCode:0,fetchOk:false});assert.equal(r.code,1);assert.deepEqual(r.outputs,{status:'ERROR',reason:''});assert.deepEqual(r.leftover,[]);});
