// One pinned retrospective audit, not a signal producer, quote collector or new strategy.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const hash=(s,algorithm='sha256')=>createHash(algorithm).update(s).digest('hex');
export function assessRetainedCandidates({discovery,journal,signals,squad,quality,scoreStudy}){
 const rows=discovery.candidates.map(c=>{
  const entries=journal.filter(x=>x.sym===c.sym),first=entries[0]||null,scan=signals.stocks.find(x=>x.sym===c.sym)||null;
  const sources={leaderDip:(squad.methods['SQ11-PB12'].newSignals||[]).some(x=>x.sym===c.sym),longerHold:(quality.fscoreUpToday||[]).some(x=>x.sym===c.sym),liveEarnings:(signals.pead||[]).some(x=>x.sym===c.sym&&x.live)};
  return {symbol:c.sym,firstDetectionAt:null,firstDetectionStatus:'UNKNOWN',earliestRetainedPriceSession:first?.d||null,journalModelPrice:first?.price??null,currentBatchGeneratedAt:discovery.generatedAt,currentPriceSession:discovery.session,
   historicalQualification:'UNKNOWN',currentScanner:scan?{state:scan.state,why:scan.why,proven:scan.proven===true,rule:scan.rule}:null,currentOwnerLaneSourceMatches:sources,
   scorePickerVerdict:c.scoreVerdict||scoreStudy.verdict||'UNKNOWN',quoteAtDetection:'UNKNOWN',executableOutcome:'UNKNOWN',
   financialContext:{period:c.quarter,revenueGrowth:c.revGrowth,profitTrend:c.profitTrend,insiderSummary:c.insider||null,trialSummary:c.bio?.text||null},verifiedTimedCatalystAtDetection:'UNKNOWN',
   savedDilutionFlag:c.hardBlock||null,industryHint:c.industry||null,authenticatedIdentity:'UNKNOWN',
   ownerActionNow:'NONE_REQUESTED_WHILE_RULE_AND_ENTRY_UNQUALIFIED',
   primaryCurrentDisposition:Object.values(sources).some(Boolean)?'SOURCE_MATCH_REQUIRES_ALL_REMAINING_GATES':'NO_NEW_ENTRY_IN_RETAINED_OWNER_LANE_SOURCES',
   historicalEntryAssessment:'UNKNOWN_NO_CONTEMPORANEOUS_CLOCK_BBO_OR_REGISTERED_PLAN',
   plan:{status:'UNRESOLVED_NOT_ACTIONABLE',entry:null,expiry:null,allocation:null,stop:null,target:null,holdingPeriod:null,exit:null}};
 });
 return {schema:'RETAINED_TEN_CANDIDATE_AUDIT_V1',snapshot:'a95af15061569854c89350a5fb0f981e99783822',retrospective:true,
  sourceGeneratedAt:discovery.generatedAt,sourceSession:discovery.session,originalOrderPreserved:true,rows,
  counts:{candidates:rows.length,historicalEntryEstablished:0,currentOwnerLaneSourceMatches:rows.filter(r=>Object.values(r.currentOwnerLaneSourceMatches).some(Boolean)).length,currentScannerNoAction:rows.filter(r=>r.currentScanner?.state==='No action').length,currentScannerAbsent:rows.filter(r=>!r.currentScanner).length},
  limits:['Journal d is a price-session date, never first ingestion or detection time.','Current qualifications and current ZAD records cannot be backdated to first detection.','Model prices/aggregate journal returns are not executable BBO outcomes.','Missing catalyst is not a universal exclusion: SQ11 is a price rule.','No prices, strategy rules, stops, targets, sizing or holds are invented.']};
}
function pinned(file,blob){const b=fs.readFileSync(file),git=x=>hash(Buffer.concat([Buffer.from('blob '+x.length+'\0'),x]),'sha1');let original=b,added=false;
 if(git(b)!==blob){if(b.at(-1)!==10||git(b.subarray(0,-1))!==blob)throw Error('PINNED_RETAINED_INPUT_MISMATCH');original=b.subarray(0,-1);added=true;}
 return {text:original.toString(),pin:{gitBlob:blob,originalSHA256:hash(original),localCopyAddedOneTerminalNewline:added}};
}
export function loadPinnedRetainedInputs(base,extra){
 if(!base||!extra)throw Error('Supply two local retained-data directories; no download is performed');
 const specs={discovery:[path.join(base,'discovery.json'),'43ffb69fa4a1698438bf12f8bd78e306208055ba'],signals:[path.join(base,'signals.json'),'3b47b76900454305303e17db92409ac14ba05209'],squad:[path.join(base,'squad11-today.json'),'e0baf15b450e976075af4d6b7a7bd8efc861fb98'],journal:[path.join(extra,'data-discovery-journal.jsonl'),'2f5648f662333c59875b797128e1928389a0b772'],quality:[path.join(extra,'data-quality.json'),'3741131c2cb08d3330748575a0622dcb4aaa7cb4'],scoreStudy:[path.join(extra,'data-score-study.json'),'60a9b80b09d33c98d503d4a3ee8317a82c5ac3e0']};
 const inputs={},pins={};for(const [name,[file,blob]]of Object.entries(specs)){const x=pinned(file,blob);inputs[name]=name==='journal'?x.text.trim().split('\n').map(l=>JSON.parse(l)):JSON.parse(x.text);pins[name]=x.pin;}
 return {inputs,pins};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {inputs,pins}=loadPinnedRetainedInputs(...process.argv.slice(2));
 console.log(JSON.stringify({...assessRetainedCandidates(inputs),inputPins:pins},null,2));
}
