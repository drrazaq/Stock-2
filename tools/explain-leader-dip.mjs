// Development-only, read-only explanation from explicit stdin. No file discovery, network or state recording.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {leaderDipMentorPlan,renderLeaderDipMentor,savedLeaderDipSignal} from '../mentor-plan.mjs';
export function explainLeaderDip(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['symbol','asOf','position','signal','quantity'].includes(k)))throw Error('INVALID_MENTOR_INPUT');
 if(typeof input.symbol!=='string'||!(/^[A-Z][A-Z.\-]{0,5}$/).test(input.symbol)||typeof input.asOf!=='string'||!(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).test(input.asOf)||!Number.isFinite(Date.parse(input.asOf))||new Date(input.asOf).toISOString()!==input.asOf)throw Error('INVALID_SYMBOL_OR_CLOCK');
 if(input.position!=null&&(typeof input.position!=='object'||Array.isArray(input.position)))throw Error('INVALID_POSITION');
 const asOfDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(input.asOf));
 // A holding may only use its archived contract, never a replacement current signal.
 const signal=input.position?savedLeaderDipSignal(input.position.mentorContract):input.signal;
 const plan=leaderDipMentorPlan({...input,signal,asOfDay,asOfMs:Date.parse(input.asOf)});
 return {kind:'DEVELOPMENT_MENTOR_EXPLANATION_NOT_TRADE_ADVICE',plan,text:renderLeaderDipMentor(plan)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)throw Error('STDIN_ONLY');
  const chunks=[];let total=0;const timer=setTimeout(()=>process.stdin.destroy(Error('INPUT_TIMEOUT')),10000);
  try{for await(const b of process.stdin){total+=b.length;if(total>32768)throw Error('INPUT_LIMIT');chunks.push(b);}}finally{clearTimeout(timer);process.stdin.destroy();}
  process.stdout.write(JSON.stringify(explainLeaderDip(JSON.parse(Buffer.concat(chunks).toString('utf8'))),null,2)+'\n');
 }catch{process.stderr.write('ERROR: invalid or oversized mentor input; nothing recorded.\n');process.exitCode=1;}
}
