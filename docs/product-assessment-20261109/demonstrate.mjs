// Actual existing scanner callers, isolated scratch files and loopback only. No live recommendations or real trades.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const root=process.env.REVIEW_TREE;if(!root)throw Error('set REVIEW_TREE to exact89d21db6 checkout');
const out=path.resolve(process.argv[2]||'/tmp/stock2-product-demo.json');
const {loadScan,blocked}=await import(pathToFileURL(root+'/test/load-scan.mjs'));
const {marketSession}=await import(pathToFileURL(root+'/market-session.mjs'));
const AT=Date.parse('2026-11-09T15:10:00Z'),now=Date.now;Date.now=()=>AT;
const dataRoot=process.env.ASSESSMENT_DATA_TREE||root;
const HZ=JSON.parse(fs.readFileSync(dataRoot+'/data/horizons.json')),QY=JSON.parse(fs.readFileSync(dataRoot+'/data/quality.json'));
const sessions=[];for(let t=Date.parse('2023-01-01T12:00:00Z');t<=Date.parse('2026-11-06T12:00:00Z');t+=864e5){const d=new Date(t).toISOString().slice(0,10);const m=marketSession(d);if(m.known ? !m.closed : ![0,6].includes(new Date(t).getUTCDay()))sessions.push(d);}
// Pure invented OHLCV: never read as a stock's actual price or return sample.
const values=sessions.slice(-650).map((d,i)=>{const p=100+i*.02+Math.sin(i/8)*.4;return{datetime:d,open:String(p),high:String(p+1),low:String(p-1),close:String(p),volume:'1000000'};});
if(values.length<600)throw Error('need known synthetic session history');
let sent=[];const requests=[];const quotes={ZZH:{c:12,age:30},ZZS:{c:3.77,age:20},ZZU:{c:70,age:1800}};
const server=http.createServer((req,res)=>{let b='';req.on('data',x=>b+=x);req.on('end',()=>{const u=new URL(req.url,'http://127.0.0.1');requests.push({path:u.pathname,method:req.method});res.setHeader('content-type','application/json');
 if(u.pathname==='/time_series')return res.end(JSON.stringify({values}));
 if(u.pathname==='/quote'){const q=quotes[u.searchParams.get('symbol')];return res.end(JSON.stringify(q?{c:q.c,t:(AT-q.age*1000)/1000}:{c:0,t:0}));}
 if(u.pathname.includes('/sendMessage')){sent.push(JSON.parse(b).text);return res.end(JSON.stringify({ok:true,result:{message_id:sent.length}}));}
 if(u.pathname.includes('/getUpdates'))return res.end(JSON.stringify({ok:true,result:[]}));
 res.statusCode=404;res.end('{}');});});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const fingerprint=p=>crypto.createHash('sha256').update(fs.readFileSync(dataRoot+'/'+p)).digest('hex');
const provenance={source:process.env.SOURCE_COMMIT||'89d21db67cc9da1ab8254144d5d97ab80b5c4de3 (reviewed candidate, NOT deployed)',evaluatedAt:'2026-11-09T15:10:00Z (fixed demo clock)',marketInputs:'ALL prices/holdings/OHLCV invented; pre2026 fixture dates are weekdays, not certified exchange sessions; no history-performance conclusion, real positions, quotes or keys',retainedStudyInputs:Object.fromEntries(['data/horizons.json','data/quality.json'].map(p=>[p,{sha256:fingerprint(p),generatedAt:(p.includes('horizons')?HZ:QY).generatedAt,through:(p.includes('horizons')?HZ:QY).to}]))};
try{
 const files={'data/names.json':JSON.parse(fs.readFileSync(dataRoot+'/data/names.json')),'data/horizons.json':HZ,'data/quality.json':QY,'data/settings.json':{focus:true},'data/zad-list.json':{notHalal:[]},'data/splits.json':{splits:[]},'market-session.mjs':fs.readFileSync(root+'/market-session.mjs','utf8')};
 const S=await loadScan({files,env:{TD_BASE:base,SEC_BASE:base,CT_BASE:base,RATE:'100000'}});
 const stocks=[];for(const sym of ['ETON','CNNE']){const raw=await S.fn('checkLive')(sym);stocks.push({stock:sym,label:'SYNTHETIC PRICE HISTORY + RETAINED STUDY CONTEXT; NOT a current recommendation',actualCaller:'checkLive',raw,actualHorizonLine:S.fn('horizonLine')(sym),actualQualityLine:S.fn('qualityLine')(sym)});}
 const longtermRaw=S.fn('longTermText')();
 const qualityResults=Object.values(QY.results).map(r=>({name:r.name,months:r.months,verdict:r.verdict,why:r.why,newer:r.results?.newer}));
 const horizonResults=Object.values(HZ.results).filter(r=>(HZ.today[r.setup]||[]).includes('ETON')).map(r=>({setup:r.setup,hold:r.hold,verdict:r.verdict,why:r.why,newer:r.results?.newer}));
 const pos={ZZH:{entry:10,stop:8,kind:'quick',since:'2026-11-05',maxHold:5},ZZS:{entry:6,stop:1.98,kind:'leader',since:'2026-10-20'},ZZU:{entry:100,stop:80,kind:'manual',since:'2026-11-05'}};
 const sig={session:'2026-11-06',stocks:[],quick:[],leaders:[],posVerdict:{ZZS:'it closed under its 50 day average, the trend is broken.'}};
 const T=await loadScan({files:{'data/my-positions.json':pos,'data/signals.json':sig,'data/tg-state.json':{offset:42},'market-session.mjs':fs.readFileSync(root+'/market-session.mjs','utf8')},env:{BOT_ONLY:'',MODE:'intraday',TG_TOKEN:'synthetic',TG_CHAT:'1',TG_BASE:base,FH_BASE:base,FINNHUB_KEY:'synthetic',TD_BASE:base,SEC_BASE:base,RATE:'100000'}});
 await T.fn('intraday')(false);
 const first=sent.find(x=>/FIRST MARKET-HOURS CHECK/.test(x))||'';
 if(!/ZZH: HOLD/.test(first)||!/ZZS: SELL/.test(first)||!/ZZU: STOP STATUS UNKNOWN/.test(first))throw Error('unexpected actual short caller result');
 if(blocked.length)throw Error('unexpected external request attempt '+blocked.length);
 const result={provenance,short:{caller:'intraday(false) -> telegram -> loopback sendMessage captured, no external delivery',syntheticPositions:pos,syntheticQuotes:quotes,rawMessages:sent},stockChecks:stocks,longtermCommand:{caller:'longTermText()',raw:longtermRaw},retainedTrackRecord:{horizonResults,qualityResults},network:{externalRequests:blocked.length,loopbackRequests:requests.length,paths:[...new Set(requests.map(r=>r.path))]},implementationBoundaries:'Raw product text does not itself consistently show source age, missing-evidence provenance, every horizon entry/exit, dollar fees, or fully audited strategy evidence. Sidecar dates/trackrecord here are evidence annotations, not shipped UI.'};
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output:out,stocks:stocks.map(x=>({stock:x.stock,headline:x.raw.split('\n')[0],horizon:x.actualHorizonLine,quality:x.actualQualityLine})),short:first,network:result.network},null,2));
}finally{Date.now=now;await new Promise(r=>server.close(r));}
