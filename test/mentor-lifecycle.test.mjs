import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import fs from 'node:fs';
import {captureLeaderDipContract,leaderDipMentorPlan,renderLeaderDipMentor} from '../mentor-plan.mjs';import {explainLeaderDip} from '../tools/explain-leader-dip.mjs';import {loadScan} from './load-scan.mjs';
const source={rule:'SQ11-PB12',day:'2026-05-29',close:100,sha256:'a'.repeat(64)},position={src:'leader dip',entry:100,target:120,ldHold:126,boughtSession:'2026-06-01',mentorContract:captureLeaderDipContract(source)};
const input=asOf=>({symbol:'EXMPL',asOf,position,quantity:10});
test('full existing frozen entry and risk contract remains explicit; no new target, stop or price range',()=>{
 const p=explainLeaderDip(input('2026-06-01T14:00:00.000Z')).plan;
 assert.match(p.selection.condition,/top20%.*300/);assert.match(p.selection.condition,/12%.*50-session.*200-session/);assert.equal(p.selection.verified,false);
 assert.equal(p.entry.session,'2026-06-01');assert.equal(p.entry.range,null);assert.equal(p.risk.maximumAllocationPerSlot,1000);assert.equal(p.risk.maximumSlots,3);assert.equal(p.risk.stopDefinedLossCap,null);assert.equal(p.exit.targetStudyAdopted,false);assert.equal(p.guide.stage,'MONITOR_RESEARCH_CONTRACT');assert.equal(p.actionability,'NOT_ACTIONABLE');
});
test('126th session half-day close, not16:00 or next-open: before/at/after are distinguished',()=>{
 const before=explainLeaderDip(input('2026-11-27T17:59:59.000Z')).plan,at=explainLeaderDip(input('2026-11-27T18:00:00.000Z')).plan,after=explainLeaderDip(input('2026-11-27T18:00:01.000Z')).plan;
 assert.equal(before.exit.session,'2026-11-27');assert.equal(before.guide.referenceCloseMinute,780);assert.equal(before.guide.stage,'REGISTERED_CLOSE_TODAY');assert.equal(at.guide.stage,'CLOSE_REACHED_EXECUTION_UNVERIFIED');assert.equal(after.guide.stage,'CLOSE_REACHED_EXECUTION_UNVERIFIED');assert.match(at.guide.next,/unvalidated timing variant/);assert.equal(at.actionability,'NOT_ACTIONABLE');
});
test('missing clock never establishes whether the close was missed; contradictions stay unresolved',()=>{
 const p=leaderDipMentorPlan({symbol:'EXMPL',position,signal:source,quantity:10,asOfDay:'2026-11-27'});assert.equal(p.guide.stage,'VERIFY_EXIT_CLOCK');assert.equal(p.guide.deadlineState,'CLOSE_TODAY_CLOCK_UNKNOWN');
 const bad=explainLeaderDip({...input('2026-11-27T17:00:00.000Z'),position:{...position,stop:90}}).plan;assert.equal(bad.guide.stage,'RECONCILE_PLAN');assert.match(renderLeaderDipMentor(bad),/STOP_VARIANT_NOT_TESTED/);
});
test('expired lead is not a late-entry suggestion; guide lists changes without executing them',()=>{
 const p=explainLeaderDip({symbol:'EXMPL',asOf:'2026-06-01T13:30:01.000Z',signal:source}).plan;assert.equal(p.guide.stage,'ENTRY_EXPIRED');assert.equal(p.guide.executable,false);assert.ok(p.guide.changes.some(x=>x.event==='REPORTED_SALE'));assert.match(p.guide.changes.find(x=>x.event==='STORED_TARGET_TOUCHED').effect,/not a confirmed fill/);
});
test('standalone caller cannot borrow current signals for a legacy holding or expose validation input in errors',()=>{
 const p=explainLeaderDip({...input('2026-06-01T14:00:00.000Z'),position:{...position,mentorContract:null},signal:source}).plan;assert.equal(p.source,null);assert.equal(p.guide.stage,'RECONCILE_PLAN');
 for(const extra of [{asOf:'2026-02-30T14:00:00.000Z'},{asOf:'2026-06-01T14:00:00Z'},{symbol:'../bad'},{unknown:'sentinel-private'}])assert.throws(()=>explainLeaderDip({...input('2026-06-01T14:00:00.000Z'),...extra}));
});
test('stdin tool is bounded/read-only, emits actual lifecycle and never imports production runner',()=>{
 const tool=new URL('../tools/explain-leader-dip.mjs',import.meta.url),r=spawnSync(process.execPath,[tool.pathname],{input:JSON.stringify(input('2026-11-27T17:59:59.000Z')),encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).plan.guide.stage,'REGISTERED_CLOSE_TODAY');
 for(const text of ['sentinel-private',' '.repeat(32769)]){const bad=spawnSync(process.execPath,[tool.pathname],{input:text,encoding:'utf8',timeout:15000});assert.equal(bad.status,1);assert.equal(bad.stdout,'');assert.doesNotMatch(bad.stderr,/sentinel/);}
});
test('actual bot mentor caller includes lifecycle/selection, no financial mutations and no borrowed legacy signal',async()=>{
 const s=await loadScan({files:{'data/my-positions.json':{EXMPL:position}},env:{PRIVATE_KEY:'synthetic-mentor-key'}});s.fn('privWrite')({shares:{EXMPL:10},buys:[]});const paths=['data/my-positions.json','data/private.enc'],before=paths.map(f=>s.read(f));const text=s.fn('mentorText')('EXMPL',{EXMPL:position});assert.match(text,/Workflow:/);assert.match(text,/Entry condition.*top20%/);assert.match(text,/Portfolio-wide capacity is not verified/);assert.match(text,/EXPLANATION ONLY/);assert.deepEqual(paths.map(f=>s.read(f)),before);assert.equal(fs.existsSync(s.dir+'/data/my-trades.jsonl'),false);
});
