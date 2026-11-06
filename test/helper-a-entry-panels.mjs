// Synthetic original panels only; no market-data calls or authentic-source claims.
import fs from 'node:fs';import {createHash} from 'node:crypto';import {firstCaptureFixture} from './helper-a-first-capture.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function entryPanelsFixture(t,change,options={}){return firstCaptureFixture(t,{...options,change:f=>{
 const dates=[];for(let ms=Date.parse('2026-11-03T00:00:00Z');dates.length<20;ms-=86400000){if(![0,6].includes(new Date(ms).getUTCDay()))dates.unshift(new Date(ms).toISOString().slice(0,10));}
 const sessions=dates.map(date=>({date,open:date+(date<'2026-11-01'?'T13:30:00Z':'T14:30:00Z'),close:date+(date<'2026-11-01'?'T20:00:00Z':'T21:00:00Z'),evidenceId:'SYNTHETIC_CALENDAR_'+date}));
 f.input.calendar.sessions=[...sessions,...f.input.calendar.sessions.slice(1)];
 const row=(b,at,v=b.volume)=>({t:at,o:b.open,h:b.high,l:b.low,c:b.close,v,vw:10.25,n:10});
 const current=f.input.bars.map(b=>row(b,b.start)),past=sessions.flatMap(s=>f.input.bars.map((b,i)=>row(b,new Date(Date.parse(s.open)+i*300000).toISOString(),1000+i*100))),daily=sessions.map(s=>({t:s.date+(s.date<'2026-11-01'?'T04:00:00Z':'T05:00:00Z'),o:10,h:12,l:9,c:11,v:100000,vw:10,n:500}));
 const end=f.input.bars.at(-1).end,seen='2026-11-04T13:00:42Z';
 const make=(bars,timeframe,start,end,at)=>{const url='https://data.alpaca.markets/v2/stocks/TEST/bars?feed=sip&adjustment=raw&timeframe='+timeframe+'&start='+start+'&end='+end,bytes=Buffer.from(JSON.stringify({symbol:'TEST',bars,next_page_token:null})),e={url,responseUrl:url,redirected:false,httpStatus:200,requestStartedAt:at,headersReceivedAt:at,bodyReceivedAt:at,observedAt:at,bodySha256:sha(bytes),bodyBase64:bytes.toString('base64')};return f.signed(f.raw(e),'CAPTURE',at);};
 f.bundle.nativeBinding.entryPanels=[make(current,'5Min',f.input.sessionOpen,new Date(Date.parse(end)-1).toISOString(),f.input.asOf),make(past,'5Min',sessions[0].open,new Date(Date.parse(f.input.sessionOpen)-1).toISOString(),seen),make(daily,'1Day',daily[0].t,sessions.at(-1).close,seen)];
 if(change)change(f);f.refreshDecision();
 }});}
