// Real renderers, adversarial owner-state matrix; no production data or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadScan,blocked} from '../test/load-scan.mjs';
const today=new Date().toISOString().slice(0,10),ok={s:'ok',d:today,by:'ZAD (you)'},iso=new Date().toISOString();
const q={sym:'AAA',last:20,n:60,win:.65,avgPct:.05,buyLo:20,buyHi:20.5,stop:18,maxHold:5,q:'dip',pcts:Array(60).fill(.04)};
const sig={quickRecord:{n:40,winRate:.6,avgPct:.02,avgSpy:.005,days:12,stocks:25},session:today,market:{up:true,above50:true},quick:[q],stocks:[],lottery:{}};
const states=[
 ['missing',{}],['rejected',{AAA:{...ok,s:'fail'}}],['expired',{AAA:{...ok,d:'2025-01-01'}}],
 ['pending-recheck',{AAA:{...ok,requiresRecheck:true}}],['malformed-author',{AAA:{...ok,by:{owner:true}}}],['future',{AAA:{...ok,d:'2099-01-01'}}],['malformed',null],['third-party',{AAA:{...ok,by:'Zoya'}}],
 ['excluded',{AAA:ok},{notHalal:['AAA','SPUS','IAUM']}],['bad-list',{AAA:ok},{notHalal:{AAA:true}}],['missing-list',{AAA:ok},null]
];
const files=(marks,list={notHalal:[]})=>({
 'data/halal.json':marks,'data/zad-list.json':list,'data/settings.json':{focus:false,tier2:true},
 'data/signals.json':sig,'data/names.json':{AAA:'Fixture Company'},
 'data/options-shadow.json':{open:[{sym:'AAA',ask:2,strike:20,d:today,exp:'2027-01-15'}],real:[]},
 'data/squad10-today.json':{lastClose:today,methods:{'SQ10-SH10-C15':{lastReview:today,members:[{sym:'AAA',weightAtReview:1}]}}},
 'data/squad11-today.json':{generatedAt:iso,lastClose:today,methods:{'SQ11-PB12':{newSignals:[{sym:'AAA',close:20}]}}},
 'data/leaders.json':{session:today,paper:[{sym:'AAA'}],text:'BUY AAA FROM OLD CACHE'},
 'data/scan-report.txt':'BUY AAA AT 20\nOLD UNAUTHENTICATED ENTRY'
});
for(const [name,marks,list] of states)test('revoked/unusable ZAD cannot pass actual current renderers: '+name,async()=>{
 const s=await loadScan({files:files(marks,list)});
 const next=s.fn('sessionPlus')(today,1),row={sym:'AAA',buy:next,sell:'2027-01-15',hold:10,lastClose:20,halal:'ok',event:'2027-02-01',firstStated:today,kinds:['PDUFA'],precision:'day'};
 s.write('data/catalyst-today.json',{generatedAt:iso,sessions:[next],rules:{'CAT-RUN1':'PROVEN'},upcoming:[row]});
 s.write('data/chain-today.json',{generatedAt:iso,sessions:[next],rules:{'CHAIN-MOM1':'PROVEN'},buys:[{...row,rule:'CHAIN-MOM1',chainLayer:'Fixture > Layer'}]});
 s.write('data/discovery2-today.json',{generatedAt:iso,sessions:[next],rules:{'D2-003':'TRADABLE SMALL'},buys:[{...row,rule:'D2-003'}]});
 s.write('data/follow-today.json',{at:iso,calls:[{sym:'AAA',trader:'fixture',last:20,H:20,record:'synthetic fixture'}]});

 assert.notEqual(s.fn('myHalal')('AAA'),'ok');
 const outputs=[s.fn('catalystLines')(sig,{}).join('\n'),s.fn('chainLines')(sig,{}).join('\n'),s.fn('discoveryLines')(sig,{}).join('\n'),s.fn('followSection')(sig,{}).join('\n'),await s.fn('detailList')(sig),s.fn('planText')(sig,{}),s.fn('conclusion')(sig,{}).join('\n'),s.fn('conclusionLive')(sig,{}, {AAA:20.1}).join('\n'),
  s.fn('checkOne')('AAA',sig),s.fn('optionsText')(),s.fn('optionsLabTicketText')({sym:'AAA'},'OPT-LH1','proven',{}),
  s.fn('ldipLines')({}, {AAA:20},null,today).join('\n'),s.fn('cachedReportText')(s.read('data/scan-report.txt'))];
 for(const output of outputs)assert.doesNotMatch(output,/(?:^|\n)(?:\d+\) AAA\b|AAA: BUY|TICKET[^\n]*BUY TO OPEN|- BUY AAA)|> pick BUY CALL/);
 assert.deepEqual(s.fn('tradeButtons')(sig,{},5,"TODAY'S ACTIONS\n- BUY AAA\nNOT ACTIONABLE TODAY"),[]);
 assert.equal(s.fn('buyToday')('AAA',sig),null);
 assert.match(s.fn('basketText')(),/NO CORE PURCHASE APPROVAL/);
 assert.match(s.fn('basketBuyText')(1000),/NO BASKET PURCHASE APPROVAL/);
 assert.equal(s.read('data/scan-report.txt'),'BUY AAA AT 20\nOLD UNAUTHENTICATED ENTRY');
});
test('positive controls and local revocation: legitimate stock/fund paths survive; stale cached buttons do not',async()=>{
 const s=await loadScan({files:files({AAA:ok,SPUS:ok,IAUM:ok})});
 assert.match(s.fn('conclusion')(sig,{}).join('\n'),/AAA: BUY/);
 assert.match(s.fn('conclusionLive')(sig,{}, {AAA:20.1}).join('\n'),/AAA: BUY/);
 assert.match(s.fn('planText')(sig,{}),/AAA/);assert.ok(s.fn('buyToday')('AAA',sig));
 assert.match(s.fn('basketText')(),/SPUS/);assert.doesNotMatch(s.fn('basketText')(),/NO CORE PURCHASE APPROVAL/);
 assert.match(s.fn('optionsLabTicketText')({sym:'AAA',ask:2,spot:20,k:20},'OPT-LH1','proven',{n:60,avg:.1,stock:.01}),/NOT AN APPROVED BUY/);
 s.write('data/halal.json',{AAA:{...ok,s:'fail'},SPUS:ok,IAUM:ok});
 assert.doesNotMatch(s.fn('conclusion')(sig,{}).join('\n'),/AAA: BUY/);
 assert.deepEqual(s.fn('tradeButtons')(sig,{},5,"TODAY'S ACTIONS\n- BUY AAA\nNOT ACTIONABLE TODAY"),[]);
});
test('monthly reminder and fallback do not turn absent/third-party funds into purchase permission',async()=>{
 const s=await loadScan({files:files({AAA:ok})}),at=Date.parse('2026-11-02T16:00:00Z');
 const r=s.fn('basketDue')(at,{},null,null,s.fn('basketMarks')(),false);
 assert.match(r.msgs[0],/^Monthly basket day: NO CORE PURCHASE APPROVAL/);
 assert.doesNotMatch(r.msgs[0],/put your monthly amount|2 orders/);
 s.write('data/halal.json',{AAA:ok,SPUS:{...ok,by:'Zoya'},IAUM:ok});assert.match(s.fn('coreZadBlock')(),/SPUS/);
});
test('browser policy agrees with server boundary for legacy/local marks and invalid exclusions',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),logic=html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1],ctx={module:{exports:{}}};vm.runInNewContext(logic,ctx);const L=ctx.module.exports;
 for(const [name,marks,list] of states){const h=L.halalOf('AAA',marks,list);assert.notEqual(h,'ok',name);assert.equal(L.applyGates({act:true},{halal:h}).act,undefined);}
 assert.equal(L.halalOf('AAA',{AAA:{s:'ok',at:today}},{notHalal:[]}),'ok');
 assert.equal(L.applyGates({act:true},{halal:'ok'}).act,true);
 assert.match(html,/state.zadList = null/);assert.match(html,/fetch\(url.replace\('signals.json','zad-list.json'\)/);
});
test('no external request was attempted',()=>assert.deepEqual(blocked,[]));
test('actual watcher approval boundary rereads owner state before quote/SEC/send, including revocation mid-session',async()=>{
 const {resolveZad,zadApproved}=await import('../zad-compliance.mjs');
 const {isFreshPriceAge}=await import('../ignition-gates.mjs');
 const src=fs.readFileSync(new URL('../ignition-watch.mjs',import.meta.url),'utf8');
 const code=src.slice(src.indexOf('function currentOwnerZadApproved('),src.indexOf('// ---- pre-market record'));
 let marks={AAA:ok},list={notHalal:[]},quotes=0,sec=0,sends=[];
 const ctx={Date,resolveZad,zadApproved,isFreshPriceAge,readJson:path=>path.includes('halal.json')?marks:list,
  passed:[{rule:'IG1',exit:'close',exitName:'fixture exit'}],paperOk:()=>true,notHalal:()=>false,LOTT:{},alerts:0,earlyAlerts:0,
  flag:()=>{},approvedQuoteGate:()=>{quotes++;return {ok:true,spreadPct:.001};},secRisk:async()=>{sec++;return {known:true,tags:[]};},
  PREC:{'IG1/close':{n:60,avg:.1,stress:.09,days:60}},sendAlert:()=>true,tg:async text=>{sends.push(text);return true;},
  clock:()=>600,fmtM:()=> '10:00',kuwait:()=> 'fixture',mode:'SIP',pc:x=>String(x)};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 const run=async()=>{const t={};await ctx.maybeAlert({sym:'AAA',price:20,qt:Date.now()},t,{id:'IG1',name:'fixture'},.02,.1,1,{age:null},{},false);return t;};
 assert.equal((await run()).alerted,true);assert.match(sends[0],/BUY only up to/);
 for(const [name,m,l]of states){marks=m;list=l===undefined?{notHalal:[]}:l;quotes=0;sec=0;sends=[];assert.deepEqual(Array.from((await run()).blocked||[]),['ZAD_NOT_CONFIRMED'],name);assert.equal(quotes,0,name);assert.equal(sec,0,name);assert.equal(sends.length,0,name);}
});
