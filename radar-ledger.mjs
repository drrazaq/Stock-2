// Append-only research identity; deliberately independent of Telegram delivery state.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>x&&typeof x==='object'?Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
// No invented day/symbol enrollment rule. Missing source time cannot be merged safely.
export function observationKey(r){return r?.type==='list'&&/^\d{4}-\d{2}-\d{2}$/.test(r.d)&&(Number.isFinite(r.at)||(typeof r.at==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.at)))&&['A','B'].includes(r.panel)&&typeof r.sym==='string'&&r.sym.length&&Number.isFinite(r.px)&&r.px>0?sha(canonical(r)):null;}
export function radarLedgerView(rows){const seen=new Set(),out=[];let exactRepeats=0,unknownIdentity=0;for(const r of rows){const k=observationKey(r);if(r.type==='list'&&!k)unknownIdentity++;if(k&&seen.has(k)){exactRepeats++;continue;}if(k)seen.add(k);out.push(r);}return {rows:out,rawLists:rows.filter(r=>r.type==='list').length,logicalLists:out.filter(r=>r.type==='list').length,exactRepeats,unknownIdentity,version:'EXACT_REPEAT_CORRECTION_V1'};}
export function readRadarLedger(file){if(!fs.existsSync(file))return [];const text=fs.readFileSync(file,'utf8');return text.split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x));}
function syncWrite(file,bytes,flags='w'){const fd=fs.openSync(file,flags);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
// flock releases on interruption. A durable intent permits ONLY completion of a known
// append prefix; neither recovery nor correction truncates/replaces ledger bytes.
function lockedAppend(file,rows){const pending=file+'.pending.json',dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true});
 const recover=()=>{if(!fs.existsSync(pending))return;const p=JSON.parse(fs.readFileSync(pending,'utf8')),b=fs.existsSync(file)?fs.readFileSync(file):Buffer.alloc(0),addition=Buffer.from(p.append,'base64');if(p.version!==1||!Number.isSafeInteger(p.size)||p.size<0||b.length<p.size||sha(b.subarray(0,p.size))!==p.prefix||b.length>p.size+addition.length||!b.subarray(p.size).equals(addition.subarray(0,b.length-p.size)))throw Error('radar pending append conflicts with preserved ledger; manual evidence review required');if(b.length<p.size+addition.length)syncWrite(file,addition.subarray(b.length-p.size),'a');else {const fd=fs.openSync(file,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}fs.unlinkSync(pending);syncDir(dir);};
 recover();const existing=readRadarLedger(file),seen=new Set(existing.map(observationKey).filter(Boolean)),fresh=[];for(const row of rows){const k=observationKey(row);if(row.type==='list'&&!k)throw Error('new radar observation missing complete identity');if(k&&seen.has(k))continue;if(k)seen.add(k);fresh.push(row);}if(!fresh.length)return {appended:0};
 const before=fs.existsSync(file)?fs.readFileSync(file):Buffer.alloc(0);if(before.length&&before[before.length-1]!==10)throw Error('unterminated ledger without recoverable intent; preserving original bytes');const append=Buffer.from(fresh.map(x=>JSON.stringify(x)).join('\n')+'\n'),intent={version:1,size:before.length,prefix:sha(before),append:append.toString('base64')};
 const temp=pending+'.tmp';syncWrite(temp,JSON.stringify(intent)+'\n');fs.renameSync(temp,pending);syncDir(dir);recover();return {appended:fresh.length};}
export function appendRadarRows(file,rows){file=path.resolve(file);fs.mkdirSync(path.dirname(file),{recursive:true});const lock=file+'.lock';return JSON.parse(execFileSync('flock',['--exclusive','--wait','5',lock,process.execPath,fileURLToPath(import.meta.url),'--append',file],{input:JSON.stringify(rows),encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']}));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.argv[2]==='--append'){try{const rows=JSON.parse(fs.readFileSync(0,'utf8'));if(!Array.isArray(rows))throw Error('rows must be an array');console.log(JSON.stringify(lockedAppend(process.argv[3],rows)));}catch(e){console.error('radar ledger append refused: '+e.message);process.exitCode=1;}}
