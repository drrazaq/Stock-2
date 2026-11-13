// Production feed/provenance coverage retained; stale-HOLD/default-stop expectations
// are superseded by the explicit Nov10 owner requirement. Synthetic loopback only.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),T=Date.parse('2026-11-09T13:40:00Z'),iso=x=>new Date(x).toISOString();
async function pre(t,{now=T,positions={AAA:{entry:10,stop:8}},signals={session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z'},actions={sells:[]},rows,fetchAdvance=0,sendAdvance=0,afterReplyAdvance=0,mode='ack',feedStatus=200}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'premarket-evidence-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const f of ['premarket-check.mjs','market-session.mjs','stop-watch.mjs','alpaca-feed.mjs','market-symbol.mjs','signals-read.mjs'])fs.copyFileSync(path.join(root,f),path.join(dir,f));fs.mkdirSync(path.join(dir,'data'),{recursive:true});
 const original={'data/my-positions.json':JSON.stringify(positions),'data/signals.json':JSON.stringify(signals),'data/actions-sells.json':JSON.stringify(actions),'data/tg-state.json':'{"offset":7}','data/my-trades.jsonl':'{"synthetic":"original trade"}\n','data/private-original-message.txt':'SYNTHETIC ORIGINAL MESSAGE — preserve bytes'};
 for(const [file,body]of Object.entries(original))fs.writeFileSync(path.join(dir,file),body);
 const messages=[],feeds=[];let calls=0;
 const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{
  const u=new URL(req.url,'http://loopback');res.setHeader('Content-Type','application/json');
  if(u.pathname==='/v2/stocks/snapshots'){feeds.push(u.searchParams.get('feed'));if(feedStatus!==200&&u.searchParams.get('feed')==='sip'){res.statusCode=feedStatus;return res.end('{}');}return res.end(JSON.stringify(rows||{AAA:{latestTrade:{p:9,t:iso(now-60000)},prevDailyBar:{c:9.5,t:'2026-11-06T05:00:00Z'}}}));}
  assert.equal(u.pathname,'/botsynthetic/sendMessage');calls++;messages.push(JSON.parse(body).text);
  if(mode==='ambiguous'){res.destroy();return;}
  if(mode==='429'&&calls===1){res.statusCode=429;return res.end(JSON.stringify({ok:false,parameters:{retry_after:0}}));}
  res.end(JSON.stringify({ok:true,result:{message_id:calls}}));
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 const guard=`let clock=${now};const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};const raw=fetch;globalThis.fetch=async(u,o)=>{const url=String(u);if(!url.startsWith(${JSON.stringify(base+'/')}))throw Error('NO_EXTERNAL_ACCESS');const r=await raw(u,o);if(url.includes('/snapshots?'))clock+=${fetchAdvance};if(url.includes('/sendMessage'))clock+=${afterReplyAdvance};return r;};const log=console.log;console.log=(...v)=>{log(...v);if(String(v[0]).startsWith('premarket report prepared;'))clock+=${sendAdvance};};`;
 fs.writeFileSync(path.join(dir,'guard.mjs'),guard);
 const child=spawn(process.execPath,['--import',path.join(dir,'guard.mjs'),'premarket-check.mjs'],{cwd:dir,env:{PATH:process.env.PATH,ALPACA_DATA_BASE:base,ALPACA_KEY:'synthetic',ALPACA_SECRET:'synthetic',TG_BASE:base,TG_TOKEN:'synthetic',TG_CHAT:'synthetic'},stdio:['ignore','pipe','pipe'],signal:AbortSignal.timeout(30000)});
 let out='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>out+=x);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,0,out);
 for(const [file,body]of Object.entries(original))assert.equal(fs.readFileSync(path.join(dir,file),'utf8'),body,'original preserved: '+file);
 assert.doesNotMatch(out,/SYNTHETIC ORIGINAL MESSAGE|^- AAA |you bought at/m,'private body not logged');
 return {out,messages,calls,feeds,text:messages.join('\n')};
}
test('production provenance: original session/age/feed remain visible; stale and missing prices are UNKNOWN',async t=>{
 const r=await pre(t,{positions:{AAA:{entry:10,stop:8},BBB:{entry:10,stop:8},CCC:{entry:10,stop:8},FFF:{entry:10,stop:8}},rows:{
 AAA:{latestTrade:{p:9,t:'2026-11-09T00:30:00Z'},prevDailyBar:{c:9.5,t:'2026-11-06T05:00:00Z'}},
 BBB:{latestTrade:{p:9.9,t:iso(T-61000)},prevDailyBar:{c:9.5,t:'2026-11-06T05:00:00Z'}},
 CCC:{latestTrade:{p:7,t:iso(T-3*3600000)},prevDailyBar:{c:9.5,t:'2026-11-06T05:00:00Z'}}}});
 assert.match(r.text,/AAA source trade 9.00 \(SIP, 2026-11-08 19:30:00 New York \(CLOSED\)/);
 assert.match(r.text,/BBB source trade 9.90 .*age 61 s/);assert.match(r.text,/prior-close reference 9.50 .*session 2026-11-06/);
 const c=r.text.split('\n').find(x=>x.startsWith('- CCC ')),f=r.text.split('\n').find(x=>x.startsWith('- FFF '));
 assert.match(c,/PRICE\/STOP CHECK UNKNOWN/);assert.doesNotMatch(c,/HOLD context|STOP LEVEL OBSERVED/);
 assert.match(f,/source trade\/time UNKNOWN/);assert.match(f,/No current HOLD or stop-crossing assessment/);
 assert.deepEqual(r.feeds,['sip']);assert.match(r.text,/prices SIP/);
});
test('production exits: fresh stop, dated scan exit and unkeyed ACTIONS retain distinct provenance',async t=>{
 const r=await pre(t,{positions:{DDD:{entry:10,stop:9},EEE:{entry:10,stop:9},GGG:{entry:10,stop:8},HHH:{entry:10,stop:8}},rows:{
 DDD:{latestTrade:{p:8.9,t:iso(T-120000)}},EEE:{prevDailyBar:{c:8.8,t:'2026-11-06T05:00:00Z'}}},
 signals:{session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z',posVerdict:{HHH:'SELL: halal fail (ZAD).'},stocks:[{sym:'HHH',last:9.4}]},
 actions:{at:iso(T-1000),sells:[{sym:'GGG',why:'GGG: TIME EXIT after 126 sessions'}]}});
 assert.match(r.text,/PRE-MARKET STOP LEVEL OBSERVED at\/below 9.00/);assert.match(r.text,/do not add a 15-minute wait/);
 const e=r.text.split('\n').find(x=>x.startsWith('- EEE '));assert.match(e,/prior-close reference 8.80/);assert.match(e,/No current HOLD or stop-crossing assessment/);
 assert.match(r.text,/GGG: RECORDED ACTIONS EXIT .*TIME EXIT/);assert.match(r.text,/Source-session\/fulfilment not established here/);
 assert.match(r.text,/HHH: RECORDED CLOSE-BASED EXIT, session 2026-11-06/);assert.match(r.text,/not withdrawn by a later quote/);
});
test('production feed refusal preserves labeled saved close without current HOLD or inferred stop',async t=>{
 const r=await pre(t,{feedStatus:500,rows:{},positions:{JJJ:{entry:10,stop:8}},signals:{session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z',stocks:[{sym:'JJJ',last:9.6}]}});
 assert.match(r.text,/price feed refused/);assert.match(r.text,/prior-close reference 9.60 \(saved scan, session 2026-11-06/);assert.match(r.text,/PRICE\/STOP CHECK UNKNOWN/);assert.doesNotMatch(r.text,/HOLD context based/);
});
test('production SIP entitlement refusal retains explicit IEX fallback provenance',async t=>{
 const r=await pre(t,{feedStatus:403});assert.deepEqual(r.feeds,['sip','iex']);assert.match(r.text,/prices IEX/);assert.match(r.text,/source trade 9.00 \(IEX,/);
});
