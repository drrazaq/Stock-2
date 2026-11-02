// Re-runnable verifier for the sanitized stage-2 preservation patch (Claude, 2 Nov 2026). Prints COUNTS ONLY: it never prints a
// symbol, value or line. Run from a full clone of drrazaq/Stock-2: node docs/privacy-stage2-preservation/verify-sanitized.mjs
// It builds the sensitive set from the repository's own history of the owner's files (every ticker key/field and every price,
// stop, target and quantity value ever stored there) and checks the patch for them, for credential patterns and identifiers.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),txt=fs.readFileSync(path.join(here,'stage2-sanitized.patch'),'utf8');
const g=(...a)=>{try{return execFileSync('git',a,{encoding:'utf8',maxBuffer:1<<30});}catch{return '';}};
const FILES=['data/my-positions.json','data/my-trades.jsonl','data/leaderdip-ledger.jsonl','data/tips.jsonl','data/watch-extra.json','data/sell-notices.jsonl','data/actions-sells.json','data/basket-state.json','data/alpaca-paper.json','data/opinions.jsonl','data/market-calls.jsonl','data/news-log.jsonl','data/pos-verdict.json','data/hold-lab-owner.json','data/squad29-holdings.json','data/hold-lab.json','data/squad29-lab.json','data/halal.json'];
const syms=new Set(),nums=new Set();
for(const f of FILES)for(const h of g('log','--all','--format=%H','--',f).trim().split('\n').filter(Boolean)){const t=g('show',h+':'+f);if(!t)continue;
 for(const m of t.matchAll(/"(?:sym|symbol|s|ticker)"\s*:\s*"([A-Z][A-Z0-9.\-]{0,6})"/g))syms.add(m[1]);
 for(const m of t.matchAll(/"(?:entry|stop|target|t1|t2|price|p|px|exit|shares|qty|orig|raised)"\s*:\s*(\d+\.\d{2,})/g))nums.add(m[1]);
 if(f.endsWith('.json')){try{const j=JSON.parse(t);if(j&&typeof j==='object'&&!Array.isArray(j))for(const k of Object.keys(j))if(/^[A-Z][A-Z0-9.\-]{0,6}$/.test(k))syms.add(k);}catch{}}}
// Generic or coincidental tokens that also appear in that history; see OMISSIONS.md for why each is not a disclosure.
const ALLOW=new Set(['AAA','API','BAR','COST','LB','RES','SPY']);
const esc=s=>s.replace(/[.\-]/g,'\\$&'),word=s=>new RegExp('(^|[^A-Za-z0-9])'+esc(s)+'([^A-Za-z0-9]|$)');
const out={sensitiveTickersChecked:[...syms].filter(s=>s.length>=2).length,allowlisted:[...ALLOW],
 tickerHits:[...syms].filter(s=>s.length>=2&&!ALLOW.has(s)&&word(s).test(txt)).length,
 singleLetterTickersQuotedOrInSymbolFields:[...syms].filter(s=>s.length===1).reduce((n,s)=>n+(txt.match(new RegExp('["\x27]'+s+'["\x27]','g'))||[]).length,0),
 privateNumberValuesChecked:nums.size,privateNumberHits:[...nums].filter(n=>{const [a,b]=n.split('.');return new RegExp('(^|[^0-9])'+a+'(\\\\\\\\|\\\\)?\\.'+b+'(?![0-9])').test(txt);}).length,
 credentialPatternHits:[/gh[pousr]_[A-Za-z0-9]{30,}/g,/github_pat_[A-Za-z0-9_]{60,}/g,/AKIA[0-9A-Z]{16}/g,/\bsk-[A-Za-z0-9]{20,}/g,/xox[baprs]-[A-Za-z0-9-]{10,}/g,/-----BEGIN [A-Z ]*PRIVATE KEY/g,/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,/\b\d{9,}\b/g].reduce((n,re)=>n+(txt.match(re)||[]).length,0),
 syntheticTestTokens:(txt.match(/github_pat_TESTTOKEN_123456/g)||[]).length,
 emailsOtherThanNoreply:[...new Set(txt.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[])].filter(e=>!/noreply/.test(e)).length,
 dataFilesInPatch:(txt.match(/^diff --git a\/data\//mg)||[]).length};
out.pass=out.tickerHits===0&&out.singleLetterTickersQuotedOrInSymbolFields===0&&out.privateNumberHits===0&&out.credentialPatternHits===0&&out.emailsOtherThanNoreply===0&&out.dataFilesInPatch===0;
console.log(JSON.stringify(out,null,1));process.exit(out.pass?0:1);
