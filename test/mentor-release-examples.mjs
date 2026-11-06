// Synthetic documentation only. Calls the actual read-only mentorText function;
// never issues a command, records a fill or contacts a provider/Telegram.
import {loadScan,blocked} from './load-scan.mjs';
import {captureLeaderDipContract} from '../mentor-plan.mjs';
export async function mentorReleaseExamples(){
 const source={rule:'SQ11-PB12',day:'2026-10-30',close:100,generatedAt:'2026-10-30T22:00:00Z',sha256:'a'.repeat(64)};
 const position={src:'leader dip',entry:100,target:120,ldHold:126,boughtSession:'2026-11-02',mentorContract:captureLeaderDipContract(source)};
 const samples=[
  {id:'synthetic-known-source-fill',name:'Hypothetical fill with an already archived source contract',position,quantity:5,clock:'2026-11-02T14:30:00Z'},
  {id:'legacy',name:'Legacy holding: original source identity missing',position:{...position,mentorContract:null},quantity:5,clock:'2026-11-03T16:00:00Z'},
  {id:'expired',name:'Source lead after its registered next-open entry has expired',position:null,quantity:null,clock:'2026-11-03T16:00:00Z',producer:true},
  {id:'missing',name:'No matching source or holding evidence',position:null,quantity:null,clock:'2026-11-03T16:00:00Z'},
  {id:'contradictory',name:'Stored stop/target differs from the frozen reference',position:{...position,target:150,stop:90},quantity:5,clock:'2026-11-03T16:00:00Z'},
 ];const results=[];
 for(const x of samples){const files={'data/my-positions.json':x.position?{ZZQ:x.position}:{},'data/leaderdip-ledger.jsonl':[]};if(x.producer)files['data/squad11-today.json']={generatedAt:source.generatedAt,lastClose:source.day,methods:{'SQ11-PB12':{newSignals:[{sym:'ZZQ',d:source.day,close:source.close}]}}};
  const s=await loadScan({files,env:{PRIVATE_KEY:'SYNTHETIC_EXAMPLE_ONLY'}});s.fn('privWrite')({shares:x.quantity?{ZZQ:x.quantity}:{},buys:[]});const before=s.read('data/my-positions.json'),encrypted=s.read('data/private.enc'),original=Date.now;let text;try{Date.now=()=>Date.parse(x.clock);text=s.fn('mentorText')('ZZQ',s.readJson('data/my-positions.json'));}finally{Date.now=original;}
  if(s.read('data/my-positions.json')!==before||s.read('data/private.enc')!==encrypted||blocked.length)throw Error('SYNTHETIC_EXAMPLE_SIDE_EFFECT');results.push({...x,source,text});
 }return results;
}
