import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {RESULT_EXITS} from '../sip-access-result.mjs';
const workflow=fs.readFileSync(new URL('../docs/validation/sip-access-diagnostic.workflow.yml.proposed',import.meta.url),'utf8');
function script(name){const start=workflow.indexOf('      - name: '+name);assert.ok(start>=0);const part=workflow.slice(start).split('      - name: ')[1];const m=part.match(/python3 - <<'PY'\n([\s\S]*?)\n          PY/);assert.ok(m);return m[1].split('\n').map(l=>l.slice(10)).join('\n');}
const wrapper=script('Protected diagnostic only'),finalizer=script('Validate final result independently');
function run(code,dir,rc,outcome='success'){return spawnSync('python3',['-c',code],{env:{...process.env,RUNNER_TEMP:dir,SIP_RAW_EXIT:String(rc),SIP_WRAPPER_OUTCOME:outcome},encoding:'utf8',timeout:3000});}
test('both proposed workflow steps use the exact fixed allowlist and exit mapping',()=>{
 for(const source of [wrapper,finalizer]){const literal=source.match(/^EXITS = (.+)$/m);assert.ok(literal);assert.deepEqual(JSON.parse(literal[1]),RESULT_EXITS);}
});
test('actual proposed wrapper/finalizer Python validates every result, malformed output and timeout/interruption exits',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sip-yaml-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const cases=[...Object.entries(RESULT_EXITS).map(([code,rc])=>[code+'\n',rc,code,rc]),
 ...[1,2,124,137,143].map(rc=>['PASS\n',rc,'ERROR',1]),
 ...['UNKNOWN\n','PASS private\n','PASS\nPASS\n','PASS\n\n',' PASS','PASS\r\n','PASS\0','x'.repeat(129)].map(s=>[s,0,'ERROR',1])];
 for(const [raw,rc,want,exit]of cases){fs.writeFileSync(path.join(dir,'sip-access.raw'),raw);let r=run(wrapper,dir,rc);assert.equal(r.status,exit,r.stderr);assert.equal(r.stdout,want+'\n');assert.equal(r.stderr,'');r=run(finalizer,dir,0,exit===0?'success':'failure');assert.equal(r.status,exit,r.stderr);assert.equal(r.stdout,want+'\n');assert.equal(r.stderr,'');}
 for(const [raw,rc]of [['PASS\n','1\n'],['PASS\n','124\n'],['UNKNOWN\n','0\n'],['PASS\n\n','0\n'],['PASS\n','0'],['BLOCKED_INPUT\n','0\n']]){fs.writeFileSync(path.join(dir,'sip-access.code'),raw);fs.writeFileSync(path.join(dir,'sip-access.exit'),rc);const r=run(finalizer,dir,0);assert.equal(r.status,1);assert.equal(r.stdout,'ERROR\n');}

 for(const outcome of ['failure','skipped','cancelled','','unexpected']){fs.writeFileSync(path.join(dir,'sip-access.code'),'PASS\n');fs.writeFileSync(path.join(dir,'sip-access.exit'),'0\n');const r=run(finalizer,dir,0,outcome);assert.equal(r.status,1);assert.equal(r.stdout,'ERROR\n');}
 fs.unlinkSync(path.join(dir,'sip-access.raw'));assert.equal(run(wrapper,dir,0).stdout,'ERROR\n');
 fs.unlinkSync(path.join(dir,'sip-access.exit'));assert.equal(run(finalizer,dir,0).stdout,'ERROR\n');
 fs.unlinkSync(path.join(dir,'sip-access.code'));fs.mkdirSync(path.join(dir,'sip-access.code'));fs.writeFileSync(path.join(dir,'sip-access.raw'),'PASS\n');let failure=run(wrapper,dir,0);assert.equal(failure.status,1);assert.equal(failure.stdout,'ERROR\n');assert.equal(failure.stderr,'');
 fs.rmSync(path.join(dir,'sip-access.code'),{recursive:true});fs.symlinkSync(path.join(dir,'sip-access.raw'),path.join(dir,'sip-access.code'));failure=run(wrapper,dir,0);assert.equal(failure.status,1);assert.equal(failure.stdout,'ERROR\n');assert.equal(failure.stderr,'');

});
test('proposed wrapper timing, action pins and preparation remain bounded and inactive',()=>{
 assert.match(workflow,/timeout-minutes: 20/);assert.match(workflow,/timeout --signal=TERM --kill-after=5s 800s/);
 assert.match(workflow,/delta < -600/);assert.match(workflow,/delta > 30/);assert.match(workflow,/if: always\(\)/);
 for(const sha of ['11bd71901bbe5b1630ceea73d27597364c9af683','49933ea5288caeca8642d1e84afbd3f7d6820020','ea165f8d65b6e75b540449e92b4886f43607fa02'])assert.ok(workflow.includes(sha));
 assert.ok(workflow.indexOf('delta > 30')<workflow.indexOf('secrets.ALPACA_KEY'));
 assert.equal(fs.existsSync(new URL('../.github/workflows/sip-access-diagnostic.yml',import.meta.url)),false);
});
