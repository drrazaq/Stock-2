// Offline examples only. Does not read holdings, credentials, feeds or accounting files.
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';import path from 'node:path';
import {captureLeaderDipContract,savedLeaderDipSignal,leaderDipMentorPlan,renderLeaderDipMentor} from '../mentor-plan.mjs';
export function syntheticMentorExamples(){
 const source={rule:'SQ11-PB12',day:'2026-10-30',close:100,generatedAt:'2026-10-30T22:00:00Z',sha256:createHash('sha256').update('SYNTHETIC EXMPL source fixture; no market observations').digest('hex')};
 const contract=captureLeaderDipContract(source),position={src:'leader dip',entry:100,target:120,ldHold:126,boughtSession:'2026-11-02',mentorContract:contract};
 const base={symbol:'EXMPL',asOfDay:'2026-11-02',asOfMs:Date.parse('2026-11-02T14:31:00Z'),zadStatus:'UNKNOWN'};
 return [
  {id:'new-fill',title:'Structurally consistent synthetic new fill — execution remains unverified',note:'Reported fill100 for10 whole shares; this is synthetic. The new-entry window is now closed; that does not establish when the reported fill actually occurred.',input:{...base,position,signal:savedLeaderDipSignal(contract),quantity:10}},
  {id:'legacy',title:'Legacy holding — original source/session unknown',note:'No archived source is supplied or borrowed from current signals. The holding remains recorded but its contract is unresolved.',input:{...base,position:{src:'leader dip',entry:100,target:120,since:'2026-10-15'},signal:null,quantity:null}},
  {id:'expired',title:'Expired next-open entry — no holding',note:'The next registered opening was14:30Z after DST. At14:31Z the opportunity cannot be represented as an available next-open entry.',input:{...base,signal:source}},
  {id:'missing',title:'Missing evidence — no source, fill, quantity or executable quote',note:'Unknown evidence does not become an actionable plan.',input:{...base}},
  {id:'contradictory',title:'Contradictory stored target, stop and holding period',note:'The150 target,90 stop and63-session hold conflict with this126-session no-stop contract and its unadopted20% overlay. No alternative rule is invented.',input:{...base,position:{...position,target:150,stop:90,ldHold:63},signal:savedLeaderDipSignal(contract),quantity:10}},
 ].map(x=>({...x,plan:leaderDipMentorPlan(x.input)}));
}
export function renderSyntheticMentorExamples(){return '# Synthetic mentor output — development fixtures, not advice\n\nAll symbols, prices, quantities, dates and input hashes below are invented fixture inputs. No owner records, provider observations, secrets, messages or orders are used. A structurally consistent local snapshot is not a validated trade. LEADER DIP remains NOT PROVEN; its target overlay is not adopted.\n\nRegenerate offline: `node tools/render-mentor-examples.mjs`.\n\n'+syntheticMentorExamples().map(x=>'## '+x.title+'\n\n'+x.note+'\n\n```text\n'+renderLeaderDipMentor(x.plan)+'\n```\n').join('\n');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(renderSyntheticMentorExamples());
