// Inert prerequisite: merge contract + actual old/new scanner reader compatibility. Synthetic loopback only.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';
import {mergeAlertState} from '../.github/merge-alert-state.mjs';import {loadScan,blocked} from './load-scan.mjs';
test('UNKNOWN suppression survives a concurrent legacy flag without becoming an ACK',()=>{
 const a={day:'2026-11-10',sent:{ZZAmyst:'UNKNOWN'},delivery:{ZZAmyst:{status:'UNKNOWN'}}},b={day:'2026-11-10',sent:{ZZAmyst:1}};
 for(const [x,y]of [[a,b],[b,a]]){const z=mergeAlertState(x,y);assert.equal(z.sent.ZZAmyst,'UNKNOWN');assert.equal(z.delivery.ZZAmyst.status,'UNKNOWN');}
});
test('actual scanner reader, before or after successor, does not replay a retained UNKNOWN stop intent',async t=>{
 const now=Date.parse('2026-11-10T15:00:00Z'),messages=[];
 const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{res.setHeader('content-type','application/json');
 if(req.url.includes('/getUpdates'))return res.end(JSON.stringify({ok:true,result:[]}));
 if(req.url.includes('/sendMessage')){messages.push(JSON.parse(body).text);return res.end(JSON.stringify({ok:true,result:{message_id:messages.length}}));}
 if(req.url.includes('/quote'))return res.end(JSON.stringify({c:7,t:(now-10000)/1000}));
 res.end(JSON.stringify({values:[],earningsCalendar:[]}));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const S=await loadScan({files:{'market-session.mjs':fs.readFileSync(new URL('../market-session.mjs',import.meta.url),'utf8'),'data/my-positions.json':{ZZA:{entry:10,stop:8}},'data/signals.json':{session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z',stocks:[],quick:[],leaders:[]},'data/alert-state.json':{day:'2026-11-10',sent:{ZZAmyst:'UNKNOWN'},delivery:{ZZAmyst:{status:'UNKNOWN'}}},'data/tg-state.json':{offset:42}},env:{BOT_ONLY:'',MODE:'intraday',TG_TOKEN:'synthetic',TG_CHAT:'synthetic',TG_BASE:base,TD_BASE:base,FH_BASE:base,FINNHUB_KEY:'synthetic'}});
 const original=S.read('data/my-positions.json'),real=Date.now;Date.now=()=>now;try{await S.fn('intraday')(false);}finally{Date.now=real;}
 assert.equal(messages.filter(x=>x.startsWith('YOUR STOPS')).length,0);
 assert.equal(S.readJson('data/alert-state.json').sent.ZZAmyst,'UNKNOWN');assert.equal(S.readJson('data/alert-state.json').delivery.ZZAmyst.status,'UNKNOWN');assert.equal(S.read('data/my-positions.json'),original);assert.equal(S.readJson('data/tg-state.json').offset,42);
});
test('all compatibility requests stayed on loopback',()=>assert.deepEqual(blocked,[]));
