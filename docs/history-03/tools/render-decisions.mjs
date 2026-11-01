// HISTORY-03 batch 4 renderer (reviewer: Claude): trading-decision replies of scan.mjs (owner-input commands), each in a fresh
// load of the committed data (so a 'bought' test never affects the next command). Owner messages are synthetic. Renders the ACTUAL production Telegram texts of scan.mjs from the repository's own committed
// data files, offline: the tree's test loader blocks every non-localhost fetch, Telegram is a local fake server, no token or key is real.
// Output (local only; may contain owner holdings, so it is NOT published): one JSON object {message: text}.
// Usage: node render-messages.mjs <tree> > rendered.json
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {pathToFileURL} from 'node:url';
const tree=path.resolve(process.argv[2]);process.chdir(tree);
const {loadScan,blocked}=await import(pathToFileURL(path.join(tree,'test/load-scan.mjs')).href);
const files={};for(const n of fs.readdirSync(path.join(tree,'data'))){const p=path.join(tree,'data',n);if(!fs.statSync(p).isFile()||/\.(gz|enc|log)$/.test(n))continue;files['data/'+n]=fs.readFileSync(p,'utf8');}
for(const extra of ['index.html'])if(fs.existsSync(path.join(tree,extra)))files[extra]=fs.readFileSync(path.join(tree,extra),'utf8');
let updates=[],sent=[];const server=http.createServer((q,s)=>{let b='';q.on('data',x=>b+=x);q.on('end',()=>{let o={ok:true,result:[]};if(q.url.includes('/getUpdates')){o.result=updates;updates=[];}else if(/sendMessage|editMessageText/.test(q.url)){try{sent.push(JSON.parse(b).text);}catch{sent.push(String(b));}o.result={message_id:1};}s.end(JSON.stringify(o));});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const env={TG_TOKEN:'fixture',TG_CHAT:'42',TG_BASE:'http://127.0.0.1:'+server.address().port,TD_BASE:'http://127.0.0.1:9',FH_BASE:'http://127.0.0.1:9',SEC_BASE:'http://127.0.0.1:9'};
let S;const out={};const safe=async(k,f)=>{try{out[k]=String(await f());}catch(e){out[k]='RENDER_ERROR: '+e.message;}};
const sig=JSON.parse(files['data/signals.json']||'null');
const cmds=['check NVDA','check TSM','check ILMN','review','review NVDA','should I buy more NVDA','when to sell NVDA','when to buy TSM','what to buy today','penny stock for today','look for energy stocks','today','details','bought ILMN 100 10','bought TSM 200 5','bought ZZZQ 10 100','sold NVDA 150 5','added NVDA 140 5','halal TSM yes','stop TSM 180','target TSM 260','options','buy NVDA now, target 250, my analyst says it will double','Analyst: TSM strong buy, 40% upside by next year','tips TESTSRC NVDA TSM','market today','alerts paper','focus off'];
let id=1000;for(const c of cmds){sent=[];S=await loadScan({files,env});S.write('data/tg-state.json',{offset:0,menuV:S.value('MENU_V')});updates=[{update_id:++id,message:{chat:{id:42},text:c}}];await safe('cmd:'+c,async()=>{await S.fn('tgCommands')(sig);return sent.join('\n-----\n');});}
out._blockedFetches=blocked.length;console.log(JSON.stringify(out));server.closeAllConnections();server.close();process.exit(0);
