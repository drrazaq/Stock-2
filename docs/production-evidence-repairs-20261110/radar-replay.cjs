// Offline replay of the exact retained public research ledger. No network or writes.
const fs=require('node:fs'),crypto=require('node:crypto');
const text=fs.readFileSync(process.argv[2],'utf8');
if(crypto.createHash('sha256').update(text).digest('hex')!=="eb91b7d85b86c81a5f89e0da0c5427e1c0cfcdd0ccd95c483dce131816db2afb")throw Error('Input differs from pinned original ledger');
const rows=text.trim().split(/\r?\n/).map(JSON.parse),lists=rows.filter(r=>r.type==='list'),closes=new Map(rows.filter(r=>r.type==='close').map(r=>[r.d+'|'+r.sym,r])),s5=new Map(rows.filter(r=>r.type==='s5').map(r=>[r.d+'|'+r.sym+'|'+r.panel,r]));
const panels={};for(const l of lists){const o=panels[l.panel]??={n:0,sumLegacy:0,sumWhole:0,positiveLegacy:0,positiveWhole:0,n5:0,sum5:0,missingClose:0,budgetNoEntry:0};const c=closes.get(l.d+'|'+l.sym);if(!c){o.missingClose++;continue;}const spread=l.px<5?.01:.003,legacy=+(c.px/l.px-1-.006-spread).toFixed(4);o.n++;o.sumLegacy+=legacy;if(legacy>0)o.positiveLegacy++;const q=Math.floor(997/l.px);if(q<1)o.budgetNoEntry++;else{const net=q*(c.px-l.px)-6-q*l.px*spread;o.sumWhole+=net;if(net>0)o.positiveWhole++;}const f=s5.get(l.d+'|'+l.sym+'|'+l.panel);if(f&&f.net!==null){o.n5++;o.sum5+=f.net;}}
for(const o of Object.values(panels)){o.legacyAvg=+(o.sumLegacy/o.n).toFixed(4);o.wholeShareAvgBudgetReturn=o.sumWhole/(o.n*1000);o.fiveSessionAvg=o.n5?+(o.sum5/o.n5).toFixed(4):null;}
console.log(JSON.stringify({status:'MODELED_REFERENCE_PRICES_NOT_EXECUTION',rawRows:rows.length,rawLists:lists.length,panels},null,2));
