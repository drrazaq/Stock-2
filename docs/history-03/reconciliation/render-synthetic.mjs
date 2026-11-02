// Offline current-message reconciliation. All fixture data, requests and deliveries are synthetic.
// No data/ walk, market credential, real provider or owner message is used.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||path.join(import.meta.dirname,'../../..'));
const source=fs.readFileSync(path.join(root,'scan.mjs'));
const {loadScan,blocked}=await import(pathToFileURL(path.join(root,'test/load-scan.mjs')));
let updates=[],sent=[],mockProviderRequests=0;
const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{
 if(req.url.includes('/getUpdates')){res.end(JSON.stringify({ok:true,result:updates}));updates=[];return;}
 if(/sendMessage|editMessageText/.test(req.url)){sent.push(JSON.parse(body).text);res.end(JSON.stringify({ok:true,result:{message_id:1}}));return;}
 mockProviderRequests++;res.statusCode=503;res.end('{"error":"synthetic unavailable source"}');
});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port;
const day='2026-10-30',sig={session:day,market:{above50:true,up:true},stocks:[{sym:'ZZQ',last:10,state:'Watch'}],quick:[],entries:[],pead:[],evt:[],tipBoard:{tips:[{sym:'ZZQ',src:'SYNTHETIC',d:day,ret:null}],sources:[{src:'SYNTHETIC',n:12,days:5,avg:.01,spy:0,beat:6}]}};
const done=Object.fromEntries(Array.from({length:30},(_,i)=>['synthetic'+i,{rule:'IG2',sym:'ZZ'+i,d:'2026-10-'+String(i%15+1).padStart(2,'0'),close:.0001,close_s:-.009}]));
const files={'data/settings.json':{quiet:true,focus:true},'data/signals.json':sig,'data/my-positions.json':{},'data/strategy-library.json':{updated:day,strategies:[{id:'C-FADE1',name:'SYNTHETIC FADE example',status:'tested: FADE flags live; not yet wired into ACTIONS'}]},'data/fastmover-lab.json':{from:'2021-10-30',to:day,rules:{}},'data/ignition-results.json':{done},'data/stops.json':{status:'OK',from:'2022-10-30',to:day,verdict:'NOT PROVEN'},'data/news-log.jsonl':JSON.stringify({at:day+'T15:00:00Z',sym:'ZZQ',h:'SYNTHETIC historical headline',th:[],src:'SYNTHETIC'})};
let S;const messages={},errors={},originalLog=console.log;let suppressedSyntheticLogLines=0;console.log=()=>{suppressedSyntheticLogLines++;};
try{
 S=await loadScan({files,env:{TG_TOKEN:'synthetic',TG_CHAT:'42',TG_BASE:local,FH_BASE:local,TD_BASE:local,SEC_BASE:local}});
 let offset=100;for(const command of ['help','ways','strategies','experiments','day trades','sources','scorecard','records','news watch','stops','actions','calendar']){
  sent=[];S.write('data/tg-state.json',{offset:0,menuV:S.value('MENU_V')});updates=[{update_id:++offset,message:{chat:{id:42},text:command}}];
  try{await S.fn('tgCommands')(sig);messages[command]=sent.join('\n---\n');if(!messages[command])errors[command]='NO_RENDERED_REPLY';}catch{errors[command]='RENDER_EXCEPTION';}
 }
 const checks={helpQualified:/a test is not proof/.test(messages.help||''),earlyPaperDistinct:/separately labelled early paper alerts/.test(messages['day trades']||''),libraryWiring:/Current C-FADE1 wiring/.test(messages.strategies||''),registryQualified:/not an authenticated count of all experiments/.test(messages.experiments||''),noInventedFalsePassCount:!/would .pass. by pure chance/.test(messages.experiments||''),legacyPaperDistinct:/legacy|Legacy|not admitted prospective/i.test(messages.scorecard||''),noNonlocalFetchAttempt:blocked.length===0};
 const artifact={kind:'HISTORY03_SYNTHETIC_MESSAGE_RENDERING_V1',evidenceClass:'SYNTHETIC_NOT_MARKET_OBSERVATION_NOT_PROSPECTIVE_ADMISSION',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),commands:Object.keys(messages).length,checks,errors,mockProviderRequests,externalMarketProviderRequests:0,realMessages:0,admittedCases:0,messages};
 process.stdout.write(JSON.stringify({...artifact,suppressedSyntheticLogLines},null,2)+'\n');if(Object.keys(errors).length||Object.values(checks).some(x=>!x))process.exitCode=1;
}finally{console.log=originalLog;process.chdir(root);if(S)fs.rmSync(S.dir,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));}
