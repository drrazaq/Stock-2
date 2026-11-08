import {execSync} from 'node:child_process';import crypto from 'node:crypto';import fs from 'node:fs';
const ms=['a-fence-recovery','a-first-capture-continuation','a-n-bc-integration','a-native-importer','a-native-source-join','review-ad3837-response'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(a,b,p,out){ if(JSON.stringify(a)===JSON.stringify(b))return; if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[k],b[k],p+'.'+k,out);}else out.push([p,a,b]);}
for(const m of ms){const f='docs/'+m+'/manifest.json';const o=JSON.parse(execSync('git show cf63a04a:'+f));const n=JSON.parse(fs.readFileSync(f));const out=[];walk(o,n,'',out);
 console.log('==',m,'changed paths:',out.length);for(const [p,a,b] of out){const file=p.split('.').slice(2).join('.');let actual='?';try{actual=sha(fs.readFileSync(file))}catch{}console.log('  ',p.split('.')[1],'|',file,'| new==actual:',b===actual,'| old==a4976e0:',(()=>{try{return a===sha(execSync('git show a4976e0:'+file))}catch{return '?'}})());}
 // check all non-changed pinned hashes in top-level hash maps vs actual files
 for(const [k,v] of Object.entries(n)){ if(v&&typeof v==='object'&&!Array.isArray(v)){const ents=Object.entries(v).filter(([f,h])=>typeof h==='string'&&/^[0-9a-f]{64}$/.test(h)&&fs.existsSync(f));if(!ents.length)continue;const bad=ents.filter(([f,h])=>sha(fs.readFileSync(f))!==h).map(([f])=>f);console.log('   map',k,'entries',ents.length,'mismatch-vs-current',bad.length,bad.slice(0,8).join(','));}}
}
