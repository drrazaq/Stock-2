// One dated, bounded read-only access check. Not Phase A or a universe collector.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createHybridSnapshotTransport} from '../hybrid-snapshot-transport.mjs';
import {marketSymbol} from '../market-symbol.mjs';
import {summarizeAlpaca,auditSession} from './alpaca-access-audit.mjs';
export async function probeAlpacaBatch({env={},fetcher=fetch,now=Date.now}={}){
 const began=now(),report={kind:'ONE_SHOT_ALPACA_BATCH_ACCESS_PROBE',sourceSha:env.GITHUB_SHA||null,observedAt:new Date(began).toISOString(),session:auditSession(began),freshnessWindowMs:180000,scope:'FIXED_HASH_SAMPLE_NOT_MARKET_WIDE',requests:0,assetBytes:0,results:[],sampleSize:0,claims:{accountPlan:'NOT_INFERRED',wholeMarketCoverage:'NOT_ESTABLISHED',premarketCoverage:'NOT_ESTABLISHED',phaseA:false,orders:false,approvedBuy:false}};
 if(!env.ALPACA_KEY||!env.ALPACA_SECRET){report.status='NOT_CONFIGURED';return report;}
 let reader,records;report.requests++;
 try{
  const response=await fetcher('https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity',{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'APCA-API-KEY-ID':env.ALPACA_KEY,'APCA-API-SECRET-KEY':env.ALPACA_SECRET}});
  report.assetHttpStatus=response.status;if(!response.ok){await response.body?.cancel?.();report.status='ASSET_REFERENCE_REFUSED';return report;}
  const length=response.headers?.get?.('content-length');if(length&&Number(length)>8*1024*1024){await response.body?.cancel?.();throw Error();}
  reader=response.body?.getReader?.();if(!reader)throw Error();const chunks=[];while(true){const c=await reader.read();if(c.done)break;report.assetBytes+=c.value.byteLength;if(report.assetBytes>8*1024*1024)throw Error();chunks.push(c.value);}
  records=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(records)||records.length>30000)throw Error();
 }catch{report.status='ASSET_REFERENCE_FAILED_OR_BUDGET';return report;}finally{if(reader)void reader.cancel().catch(()=>{});}
 const eligible=new Map(),conflicts=new Set();for(const row of records){if(!row||row.status!=='active'||row.class!=='us_equity'||row.tradable!==true||marketSymbol(row.symbol)!==row.symbol||typeof row.id!=='string')continue;if(eligible.has(row.symbol)&&eligible.get(row.symbol)!==row.id)conflicts.add(row.symbol);eligible.set(row.symbol,row.id);}
 const symbols=[...eligible.keys()].filter(s=>!conflicts.has(s)).sort((a,b)=>createHash('sha256').update('Stock2BatchAudit2026-10-29|'+a).digest('hex').localeCompare(createHash('sha256').update('Stock2BatchAudit2026-10-29|'+b).digest('hex'))).slice(0,200);
 report.eligibleReferenceSymbols=eligible.size-conflicts.size;report.conflictingSymbols=conflicts.size;report.sampleSize=symbols.length;report.sampling='DETERMINISTIC_HASH_SAMPLE_NOT_RANDOM_OR_COMMON_STOCK_CERTIFIED';
 if(symbols.length!==200){report.status='INSUFFICIENT_REFERENCE_SAMPLE';return report;}
 const client=createHybridSnapshotTransport({credentials:{key:env.ALPACA_KEY,secret:env.ALPACA_SECRET},fetcher,now,limits:{maxRequests:2,requestsPerMinute:2,maxBatchSymbols:200,maxResponseBytes:4*1024*1024,maxTotalBytes:8*1024*1024,maxDurationMs:30000,requestTimeoutMs:10000}});
 for(const feed of ['sip','iex']){
  const result=await client.snapshots(symbols,{feed}),{rows,...safe}=result;
  if(rows)safe.measurements=summarizeAlpaca(rows,{now:Date.parse(result.receivedAt),requested:symbols}).summary;
  report.results.push(safe);if(client.report().halted)break;
 }
 report.requests+=client.report().requests;report.transport=client.report();report.status='OBSERVATIONS_ONLY';report.finishedAt=new Date(now()).toISOString();return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF_NAME!=='Stock2-safety-fixes'||process.env.GITHUB_EVENT_NAME!=='push'||process.env.GITHUB_RUN_ATTEMPT!=='1'||Date.now()<Date.parse('2026-10-29T13:30:00Z')||Date.now()>=Date.parse('2026-10-29T15:00:00Z'))throw Error('DATED_BRANCH_PROBE_REFUSED');
 const report=await probeAlpacaBatch({env:process.env}),encoded=JSON.stringify(report);if(Buffer.byteLength(encoded)>1024*1024)throw Error('REPORT_BUDGET');fs.mkdirSync('probe-output',{recursive:true});fs.writeFileSync('probe-output/alpaca-batch-probe.json',encoded);console.log(encoded);
}
