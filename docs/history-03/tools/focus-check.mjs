// Reviewer check (local only): does planCands().ok (used by "market today" BUYING DAY) honour focus mode like ACTIONS does?
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const tree=path.resolve(process.argv[2]);process.chdir(tree);const {loadScan}=await import(pathToFileURL(path.join(tree,'test/load-scan.mjs')).href);
const files={};for(const n of fs.readdirSync('data')){const p='data/'+n;if(fs.statSync(p).isFile()&&!/\.(gz|enc|log)$/.test(n))files[p]=fs.readFileSync(p,'utf8');}
const out={};for(const focus of [true,false]){const st=JSON.parse(files['data/settings.json']||'{}');st.focus=focus;const S=await loadScan({files:{...files,'data/settings.json':JSON.stringify(st)},env:{}});
 const sig=JSON.parse(files['data/signals.json']);const c=S.fn('planCands')(sig,{});out['focus='+focus]={candidates:c.length,ok:c.filter(x=>x.ok).length,okKinds:[...new Set(c.filter(x=>x.ok).map(x=>x.kind))],paused:c.filter(x=>x.focusPaused||x.paused).length};}
console.log(JSON.stringify(out));process.exit(0);
