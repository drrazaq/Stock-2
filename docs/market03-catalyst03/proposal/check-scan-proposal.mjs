// Standalone check for the UNAPPLIED scan.mjs proposal (Claude, 2 Nov 2026). Not run by CI: scan.mjs is owned by the main session.
// Usage: node check-scan-proposal.mjs <tree>   (prints JSON; exit 0 always - it reports, it does not gate)
import path from 'node:path';import {pathToFileURL} from 'node:url';
const tree=path.resolve(process.argv[2]),U=p=>pathToFileURL(path.join(tree,p)).href;
const {loadScan}=await import(U('test/load-scan.mjs')),{reactionSession}=await import(U('source-contract.mjs'));
const S=await loadScan({files:{'data/settings.json':{}}}),out={tree:path.basename(tree)};
let tdBars=null;try{tdBars=S.fn('tdBars');}catch{}
out.tdBarsPresent=!!tdBars;
if(tdBars){const v=(d,o,h,l,c)=>({datetime:d,open:o,high:h,low:l,close:c,volume:'100'});
 out.malformedRowsDropped=tdBars({meta:{symbol:'AAA'},values:[v('2026-10-29','10','11','9','10.5'),v('2026-10-30','x','11','9','10'),v('bad','10','11','9','10'),v('2026-10-31','10','9','11','10')]},'AAA')?.length===1;
 out.foreignSeriesRefused=tdBars({meta:{symbol:'XYZ'},values:[v('2026-10-29','10','11','9','10.5')]},'AAA')===null;
 out.emptySeriesRefused=tdBars({meta:{symbol:'AAA'},values:[]},'AAA')===null;}
// EARNINGS DRIFT reaction day: the current weekday-only nextDay versus the producer's exchange-calendar session.
const nextDay=d=>{let ms=Date.parse(d+'T12:00:00Z');do{ms+=864e5;}while([0,6].includes(new Date(ms).getUTCDay()));return new Date(ms).toISOString().slice(0,10);};
out.thanksgivingAmc={report:'2026-11-25',weekdayNextDay:nextDay('2026-11-25'),calendarSession:reactionSession('2026-11-25','AMC').session};
out.goodFridayAmc={report:'2027-03-25',weekdayNextDay:nextDay('2027-03-25'),calendarSession:reactionSession('2027-03-25','AMC').session};
const src=(await import('node:fs')).readFileSync(path.join(tree,'scan.mjs'),'utf8');out.peadUsesProducerSession=/typeof r\.reactionSession === 'string'/.test(src);
console.log(JSON.stringify(out,null,1));process.exit(0);
