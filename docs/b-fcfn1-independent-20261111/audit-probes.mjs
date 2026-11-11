// Offline synthetic data-semantics probes of the exact frozen pure core, not trading evidence.
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const source=execFileSync('git',['show','e9ad49ae13cd5302a8fae5ae41d687865deea3f4:value-core.mjs']);
const dir=mkdtempSync(join(tmpdir(),'fcfn1-core-'));const file=join(dir,'core.mjs');writeFileSync(file,source);const m=await import(pathToFileURL(file));
const a=[{s:'2024-01-01',e:'2024-03-31',v:10,f:'2024-05-01'},{s:'2024-01-01',e:'2024-06-30',v:25,f:'2024-08-01'}];
assert.equal(m.quarterFlowAt(a,'2024-08-02','2024-06-30'),15);assert.equal(m.quarterFlowAt(a,'2024-08-01','2024-06-30'),null);
const annual=[...a,{s:'2024-01-01',e:'2024-09-30',v:40,f:'2024-11-01'},{s:'2024-01-01',e:'2024-12-31',v:70,f:'2025-02-01'}];assert.equal(m.quarterFlowAt(annual,'2025-02-02','2024-12-31'),30);
const rest=[a[0],{...a[0],v:12,f:'2024-08-01'}];assert.equal(m.quarterFlowAt(rest,'2024-07-01','2024-03-31'),10);assert.equal(m.quarterFlowAt(rest,'2024-08-02','2024-03-31'),12);
// Reproduce compact's original key exactly: same start/end/value keeps FIRST date.
const compact=xs=>{const seen=new Set();return [...xs].sort((a,b)=>a.f<b.f?-1:1).filter(x=>{const k=x.s+'|'+x.e+'|'+x.v;if(seen.has(k))return false;seen.add(k);return true;});};
const reverted=[...rest,{...a[0],f:'2024-11-01'}];assert.equal(m.quarterFlowAt(reverted,'2024-11-02','2024-03-31'),10);assert.equal(m.quarterFlowAt(compact(reverted),'2024-11-02','2024-03-31'),12);
console.log(JSON.stringify({status:'SYNTHETIC_SEMANTICS_ONLY_NOT_ACTUAL_DATA_VALIDATION',ytdQuarter:15,annualQ4:30,sameDayExcluded:true,laterRestatementNotUsedEarly:true,compactReversionHistoryLossReproduced:true,actualAffectedRows:'UNKNOWN_without_original_facts_cache',frozenCodeChanged:false}));
