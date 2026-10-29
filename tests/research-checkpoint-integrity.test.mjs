import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {saveCheckpoint,readCheckpoint} from '../watcher-checkpoint.mjs';
import {discoveryState} from '../discovery-runtime.mjs';
import {quoteEvidenceState} from '../research-quote-followups.mjs';
function frame(){return {day:'2026-10-29',sourceSha:'fixture',beat:[],early:{seen:{},sent:{}},shadow:[],state:{seen:{},orb:{},vis:{},ser:{},pull:{},earlyWave:{},preIgnition:{},STOP_SENT:{},vcToday:{},RADAR:{},triggers:[],alerts:0,earlyAlerts:0,DISCOVERY:{...discoveryState(),paperQuoteEvidence:quoteEvidenceState()}}};}
test('research-required resume rejects missing or malformed scientific state while preserving source file',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-research-cp-')),file=path.join(dir,'checkpoint.json');try{
  const opts={day:'2026-10-29',sourceSha:'fixture',requireResearch:true};saveCheckpoint(file,frame());assert.ok(readCheckpoint(file,opts));
  for(const mutate of [x=>delete x.state.DISCOVERY,x=>x.state.DISCOVERY.observations=[],x=>x.state.DISCOVERY.funnel.accepted=1,x=>x.state.DISCOVERY.paperQuoteEvidence.counters.cycles=null,x=>delete x.state.DISCOVERY.paperQuoteEvidence.counters.cycles,x=>x.state.DISCOVERY.paperQuoteEvidence.quotes.bad={}]){
   const x=frame();mutate(x);saveCheckpoint(file,x);const before=fs.readFileSync(file,'utf8');assert.equal(readCheckpoint(file,opts),null);assert.equal(fs.readFileSync(file,'utf8'),before);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('oversized checkpoint input is rejected before parsing',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-large-cp-')),file=path.join(dir,'checkpoint.json');try{
  fs.writeFileSync(file,'{}');fs.truncateSync(file,128*1024*1024+1);assert.equal(readCheckpoint(file,{day:'2026-10-29',sourceSha:'fixture',requireResearch:true}),null);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual watcher requests scientific checkpoint validation before allowing resumed sends',()=>{
 const source=fs.readFileSync(new URL('../ignition-watch.mjs',import.meta.url),'utf8');assert.match(source,/readCheckpoint\(CP_FILE,\{day,sourceSha:CODE_SHA,beforeMinute:clock\(\),requireResearch:true\}\)/);assert.match(source,/const ALLOW_SEND=!env.IG_RESUME\|\|!!RESUME/);
});
