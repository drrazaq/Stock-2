// Synthetic software authority regression, not market evidence. All Telegram traffic stays on localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {loadScan,blocked} from './load-scan.mjs';
const today=new Date().toISOString().slice(0,10);
const paper={sym:'ZZP',d:today,exp:'2027-01-15',strike:20,ask:2,bid:1.9,under:20};
test('paper winners, private pass marks and affordable quotes never authorize a new option entry',async()=>{
 const done=Array.from({length:20},(_,i)=>({d:'2026-10-'+String(i+1).padStart(2,'0'),ret:.5,stock:.01}));
 const S=await loadScan({files:{'data/halal.json':{ZZP:{s:'ok'}},'data/options-shadow.json':{open:[paper],done,real:[],cc:{open:[{...paper,bid:2}],done:[]}}}});
 const t=S.fn('optionsText')();assert.match(t,/20 on 20 signal/);assert.match(t,/RESEARCH ONLY/);assert.doesNotMatch(t,/BUY TO OPEN|SELL TO OPEN|SMALL TRIAL ALLOWED|> confirm/);
});
test('a PROVEN research label still cannot render an executable options ticket',async()=>{
 const S=await loadScan();const t=S.fn('optionsLabTicketText')({...paper,k:20,spot:20,sellBy:today},'OPT-LH1','proven',{n:300,avg:.1,stock:.01,tBlock:5});
 assert.match(t,/300 trades/);assert.match(t,/NO BUY/);assert.doesNotMatch(t,/BUY CALL|quantity 1|> confirm|most you can lose/);
});
test('actual shadow caller retains paper state and existing real SELL while suppressing new entry sends',async t=>{
 const sent=[];const server=http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{sent.push(JSON.parse(b).text);res.setHeader('Content-Type','application/json');res.end('{"ok":true,"result":true}');});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const S=await loadScan({env:{ALPACA_KEY:'synthetic',ALPACA_SECRET:'synthetic',TG_TOKEN:'synthetic',TG_CHAT:'42',TG_BASE:'http://127.0.0.1:'+server.address().port},files:{'data/halal.json':{ZZP:{s:'ok'}},'data/options-shadow.json':{open:[paper],done:[],real:[{sym:'ZZR',strike:20,exp:'2027-01-15',d:'2026-10-01',sellBy:today,paid:2}],cc:{open:[],done:[]}},'data/signals.json':{stocks:[],quick:[]}}});
 await S.fn('optionsShadow')();assert.equal(sent.length,1);assert.match(sent[0],/SELL TO CLOSE/);assert.doesNotMatch(sent.join('\n'),/BUY CALL|TRIAL TICKET/);
 const saved=S.readJson('data/options-shadow.json');assert.equal(saved.open.length,1);assert.equal(saved.open[0].sym,'ZZP');assert.equal(saved.trialSent,undefined);assert.equal(saved.real[0].notified,today);
});
test('no external network call was attempted',()=>assert.deepEqual(blocked,[]));
