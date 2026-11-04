// Synthetic reproduction only; SCAN_SRC may point to the pinned original source.
import {loadScan} from '../../test/load-scan.mjs';
const asOf=Date.parse('2026-11-04T15:00:00Z'),real=Date.now;Date.now=()=>asOf;
try {
 const S=await loadScan({files:{'data/halal.json':{ZZQ:{s:'ok',d:'2026-11-03',by:'you'}},'data/settings.json':{focus:false},'data/names.json':{ZZQ:'Synthetic'},'data/squad11-today.json':{generatedAt:'2026-11-03T22:00:00Z',lastClose:'2026-11-03',methods:{'SQ11-PB12':{newSignals:[{sym:'ZZQ',close:100,d:'2026-11-03'}]}}}}});
 const lines=S.fn('ldipLines')({}, {},null,'2026-11-03');
 console.log(JSON.stringify({asOf:'2026-11-04T15:00:00Z',ny:S.fn('ny')(asOf),fresh:S.fn('ldipFresh')('2026-11-03','2026-11-03T22:00:00Z','2026-11-03'),buyCount:lines.filter(x=>x.startsWith('- BUY ')).length,sourceSignalRows:1}));
}finally{Date.now=real;}
