// HISTORY-03 batch 2 renderer (reviewer: Claude). Runs the ACTUAL Sunday lab scripts (leaders-study workflow senders, in workflow order)
// in one throwaway copy of the repository, on a SYNTHETIC 5-year price cache (study-cache format used by the repo's own tests), with
// Telegram and every provider base pointed at a local fake server and every other fetch refused by a preload. Captures each
// sendMessage text. Numbers in the output are synthetic; only the WORDING and the claim structure are evidence.
// Output (local only; the copy carries repository data): JSON {script: {exit, messages[], blocked[]}}.
// Usage: node render-sunday-labs.mjs <tree> <work dir> > sunday.json
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import zlib from 'node:zlib';import {spawn,execFileSync} from 'node:child_process';
const [tree,work]=process.argv.slice(2).map(p=>path.resolve(p));
const SCRIPTS=['leaders-study.mjs','winners-study.mjs','hunting-lab.mjs','score-study.mjs','earnings-study.mjs','events-study.mjs','horizons.mjs','exits.mjs','rebuy.mjs','rebalance.mjs','quality.mjs','stops.mjs','autolab.mjs','octopus.mjs','fastmover-lab.mjs'];
fs.rmSync(work,{recursive:true,force:true});fs.mkdirSync(work,{recursive:true});
execFileSync('bash',['-c',`cd "${tree}" && tar --exclude=.git -cf - . | tar -C "${work}" -xf -`]);
// Synthetic market: 1,310 weekday sessions 2021-10-12.., 300 stocks (seeded random walks, mixed drift/volatility, 20 delisted midway) + SPY.
let seed=20261101;const rnd=()=>((seed=(seed*1103515245+12345)%2147483648)/2147483648);const gauss=()=>{let u=0;for(let i=0;i<6;i++)u+=rnd();return (u-3)/1.2;};
const D=[];for(let t=Date.parse('2021-10-12T12:00:00Z');D.length<1310;t+=864e5){const w=new Date(t).getUTCDay();if(w&&w<6)D.push(new Date(t).toISOString().slice(0,10));}
const out0={};const N=300,px=Array.from({length:N},(_,i)=>5+rnd()*200),mu=Array.from({length:N},()=>(rnd()-0.45)*0.002),sg=Array.from({length:N},()=>0.01+rnd()*0.04);let spy=430;const days={};
for(let t=0;t<D.length;t++){const m={T:[],o:[],h:[],l:[],c:[],v:[]},x={T:[],o:[],h:[],l:[],c:[],v:[]};const put=(r,s,o,c)=>{r.T.push(s);r.o.push(+o.toFixed(2));r.h.push(+(Math.max(o,c)*1.01).toFixed(2));r.l.push(+(Math.min(o,c)*0.99).toFixed(2));r.c.push(+c.toFixed(2));r.v.push(2e6);};
 const so=spy;spy*=1+0.0004+0.01*gauss();put(m,'SPY',so,spy);
 for(let i=0;i<N;i++){const s='S'+String(i).padStart(3,'0');if(i<20&&t>650+i*20){put(x,s,0.8,0.8);continue;}const o=px[i]*(1+0.002*gauss());px[i]=Math.max(0.5,o*(1+mu[i]+sg[i]*gauss()));put(px[i]>=3?m:x,s,o,px[i]);}
 days[D[t]]={...m,x};}
// Owner switch in the THROWAWAY copy only: labs treat a missing settings.quiet as quiet (no message). quiet:false renders what they would send.
{const sf=path.join(work,'data/settings.json');let st={};try{st=JSON.parse(fs.readFileSync(sf,'utf8'));}catch{}const productionQuiet=st.quiet;st.quiet=false;fs.writeFileSync(sf,JSON.stringify(st));out0.productionQuietSetting=productionQuiet===undefined?'UNSET (labs treat as quiet)':productionQuiet;}
fs.mkdirSync(path.join(work,'study-cache'),{recursive:true});const CACHE=path.join(work,'study-cache/grouped.json.gz');fs.writeFileSync(CACHE,zlib.gzipSync(JSON.stringify({days})));
const sent=[];let calls=[];const server=http.createServer((q,s)=>{let b='';q.on('data',x=>b+=x);q.on('end',()=>{calls.push(q.method+' '+q.url.replace(/bot[^/]+/,'bot<T>').slice(0,120));s.setHeader('content-type','application/json');
 if(/\/sendMessage/.test(q.url)){try{sent.push(JSON.parse(b).text);}catch{sent.push(b);}return s.end('{"ok":true,"result":{"message_id":1}}');}
 if(/\/v2\/aggs\/grouped/.test(q.url))return s.end('{"results":[],"resultsCount":0}');s.end('{}');});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const preload=path.join(work,'.offline-preload.mjs');fs.writeFileSync(preload,`const f=globalThis.fetch;globalThis.fetch=(u,o)=>{const s=String(u&&u.url?u.url:u);if(!s.startsWith(${JSON.stringify(base)}))return Promise.reject(new TypeError('OFFLINE_BLOCKED '+s.slice(0,80)));return f(u,o);};`);
const out={_cache:{sessions:D.length,from:D[0],to:D.at(-1),stocks:N,delisted:20,synthetic:true},_settings:out0};
for(const sc of SCRIPTS){sent.length=0;calls=[];
 const env={PATH:process.env.PATH,HOME:process.env.HOME,MODE:'study',CACHE,TG_TOKEN:'synthetic',TG_CHAT:'42',TG_BASE:base,MASSIVE_BASE:base,MASSIVE_KEY:'synthetic',SEC_BASE:base,SEC_UA:'synthetic fixture',FH_BASE:base,FINNHUB_KEY:'synthetic',AV_BASE:base,FMP_BASE:base,FDA_BASE:base,TD_BASE:base,ALPACA_DATA:base,STUDY:'1'};
 const child=spawn(process.execPath,['--import',preload,sc],{cwd:work,env,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
 const timer=setTimeout(()=>child.kill('SIGKILL'),300000);const code=await new Promise(r=>child.on('close',r));clearTimeout(timer);
 out[sc]={exit:code,messages:[...sent],providerCalls:calls.filter(c=>!/sendMessage/.test(c)).length,blocked:(log.match(/OFFLINE_BLOCKED [^\s'"]+/g)||[]).slice(0,5),log:log.slice(-12000)};}
console.log(JSON.stringify(out));server.closeAllConnections();server.close();
