// Independent adversarial probe of the actual premarket-check.mjs at b2ce57de (loopback only, synthetic data).
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';
const SRC=process.argv[2];const iso=x=>new Date(x).toISOString();
async function run(name,{now,positions={AAA:{entry:10,stop:8}},signals={session:'2026-11-09',generatedAt:'2026-11-10T03:41:07Z',stocks:[{sym:'AAA',last:9.5}]},actions={sells:[]},trade}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pmprobe-'));for(const f of fs.readdirSync(SRC))if(f.endsWith('.mjs'))fs.copyFileSync(path.join(SRC,f),path.join(dir,f));
 fs.mkdirSync(dir+'/data');fs.writeFileSync(dir+'/data/my-positions.json',JSON.stringify(positions));fs.writeFileSync(dir+'/data/signals.json',JSON.stringify(signals));fs.writeFileSync(dir+'/data/actions-sells.json',JSON.stringify(actions));
 const seen={gets:0,posts:[]};
 const srv=http.createServer((q,r)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{r.setHeader('Content-Type','application/json');
  if(q.url.startsWith('/v2/stocks/snapshots')){seen.gets++;return r.end(JSON.stringify({AAA:{latestTrade:trade,prevDailyBar:{c:9.5,t:'2026-11-09T05:00:00Z'}}}));}
  seen.posts.push(JSON.parse(b).text);r.end(JSON.stringify({ok:true,result:{message_id:seen.posts.length}}));});});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port;
 fs.writeFileSync(dir+'/clock.mjs',`const c=${now};const R=Date;globalThis.Date=class extends R{constructor(...a){super(...(a.length?a:[c]));}static now(){return c;}};`);
 const out=await new Promise(res=>{const ch=spawn(process.execPath,['--import',dir+'/clock.mjs','premarket-check.mjs'],{cwd:dir,env:{PATH:process.env.PATH,ALPACA_DATA_BASE:base,ALPACA_KEY:'k',ALPACA_SECRET:'s',TG_BASE:base,TG_TOKEN:'t',TG_CHAT:'c'}});let o='';ch.stdout.on('data',x=>o+=x);ch.stderr.on('data',x=>o+=x);ch.on('close',code=>res({code,o}));});
 srv.close();return {name,...out,...seen};
}
const T=(s)=>Date.parse(s);const R=[];
// P1: the actual 9 Nov late delivery: 22:41:56Z = 17:41 NY, with a 16:xx after-hours trade
R.push(await run('P1 late 17:41 NY',{now:T('2026-11-09T22:41:56Z'),trade:{p:7.5,t:'2026-11-09T21:30:00Z'}}));
// P2: on-time 07:40 NY run; latest trade is yesterday 19:30 NY after-hours (00:30Z today)
R.push(await run('P2 prior-evening trade',{now:T('2026-11-10T12:40:30Z'),trade:{p:7.5,t:'2026-11-10T00:30:00Z'}}));
// P3: fresh pre-market trade under the stop
R.push(await run('P3 fresh below stop',{now:T('2026-11-10T12:40:30Z'),trade:{p:7.5,t:'2026-11-10T12:39:00Z'}}));
// P4: recorded stop-based close exit, quote rebounded above stop: exit must be kept
R.push(await run('P4 recorded exit kept',{now:T('2026-11-10T12:40:30Z'),signals:{session:'2026-11-09',generatedAt:'2026-11-10T03:41:07Z',posVerdict:{AAA:'closed under its stop 8.00'}},trade:{p:9.9,t:'2026-11-10T12:39:00Z'}}));
// P5: holiday; P6: 03:30 NY
R.push(await run('P5 Thanksgiving',{now:T('2026-11-26T12:40:30Z'),trade:{p:9,t:'2026-11-26T12:39:00Z'}}));
R.push(await run('P6 03:30 NY',{now:T('2026-11-10T08:30:00Z'),trade:{p:9,t:'2026-11-10T08:29:00Z'}}));
// P7: stale (8 min old) pre-market trade -> UNKNOWN, no HOLD
R.push(await run('P7 8-minute-old trade',{now:T('2026-11-10T12:48:30Z'),trade:{p:9.9,t:'2026-11-10T12:40:30Z'}}));
if(process.env.SHOW)console.log(R[3].posts.join("\n---\n"));
for(const r of R){const m=r.posts.join('\n');console.log('\n== '+r.name+' exit='+r.code+' GETs='+r.gets+' POSTs='+r.posts.length);
 console.log('  HOLD line:',/HOLD context/.test(m),'| UNKNOWN:',/CHECK UNKNOWN/.test(m),'| STOP OBSERVED:',/STOP LEVEL OBSERVED/.test(m),'| recorded exit:',/RECORDED CLOSE-BASED EXIT/.test(m),'| "after the first 15":',/after the first 15/i.test(m),'| pre-market trade claim on 16:xx:',/16:\d\d:\d\d New York \(AFTER_HOURS\)/.test(m));
 if(r.posts.length===0)console.log('  log:',r.o.trim().split('\n').slice(-1)[0]);}
