// Read-only GitHub object/ancestry client. All operations are bounded GETs; no workflow control, Git push or provider access.
import {performance} from 'node:perf_hooks';
const HEX=/^[a-f0-9]{40}$/;
const valid=p=>typeof p==='string'&&p.length<512&&!p.includes('\\')&&!p.includes('\0')&&!p.startsWith('/')&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
export function createGithubReadClient({repository,token,fetcher=fetch,base='https://api.github.com',fixture=false,timeoutMs=10000,totalMs=45000,maxRequests=16,maxBytes=4194304,totalBytes=25165824}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||repository.split('/').some(x=>x==='.'||x==='..')||base!=='https://api.github.com'&&!(fixture&&/^http:\/\/127\.0\.0\.1:\d+$/.test(base)))throw Error('INVALID_CLIENT');
 if(timeoutMs>10000||totalMs>45000||maxRequests>16||maxBytes>4194304||totalBytes>25165824||[timeoutMs,totalMs,maxRequests,maxBytes,totalBytes].some(x=>!Number.isSafeInteger(x)||x<1))throw Error('INVALID_LIMIT');
 let requests=0,bytes=0;const end=performance.now()+totalMs;
 async function get(route){if(++requests>maxRequests||performance.now()>=end)throw Error('REQUEST_BUDGET');const controller=new AbortController();let timer,reader;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('TIMEOUT'));},Math.min(timeoutMs,Math.max(1,end-performance.now())));});
  const task=async()=>{const r=await fetcher(base+'/repos/'+repository+'/'+route,{method:'GET',redirect:'error',signal:controller.signal,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:'Bearer '+token}:{})}});if(!r.ok)throw Error('SOURCE_UNAVAILABLE');if(!r.body?.getReader)throw Error('MALFORMED');reader=r.body.getReader();const parts=[];let n=0;for(;;){const x=await reader.read();if(x.done)break;n+=x.value.byteLength;bytes+=x.value.byteLength;if(n>maxBytes||bytes>totalBytes)throw Error('BODY_LIMIT');parts.push(Buffer.from(x.value));}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));};
  try{return await Promise.race([task(),deadline]);}catch{throw Error('GITHUB_READ_UNAVAILABLE');}finally{clearTimeout(timer);controller.abort();try{reader?.cancel()?.catch(()=>{});}catch{}}
 }
 async function main(){const j=await get('git/ref/heads/main');if(j.ref!=='refs/heads/main'||j.object?.type!=='commit'||!HEX.test(j.object?.sha))throw Error('MALFORMED');return j.object.sha;}
 async function ancestor(saved,head){if(!HEX.test(saved)||!HEX.test(head))throw Error('MALFORMED');const j=await get('compare/'+saved+'...'+head+'?per_page=1');if(!['ahead','identical'].includes(j.status)||j.base_commit?.sha!==saved||j.merge_base_commit?.sha!==saved)throw Error('ANCESTRY_UNVERIFIED');}
 async function entries(head,paths){if(!HEX.test(head)||!Array.isArray(paths)||paths.length>128||paths.some(p=>!valid(p)))throw Error('MALFORMED');const commit=await get('git/commits/'+head);if(commit.sha!==head||!HEX.test(commit.tree?.sha))throw Error('MALFORMED');const cache=new Map();
  async function node(sha,recursive=false){const key=sha+':'+recursive;if(cache.has(key))return cache.get(key);const j=await get('git/trees/'+sha+(recursive?'?recursive=1':''));if(j.sha!==sha||j.truncated!==false||!Array.isArray(j.tree)||j.tree.length>8192)throw Error('INCOMPLETE_TREE');const map=new Map();for(const e of j.tree){if(!valid(e.path)||!HEX.test(e.sha)||map.has(e.path)||!['tree','blob'].includes(e.type)||!['040000','100644','100755'].includes(e.mode))throw Error('MALFORMED');map.set(e.path,e);}cache.set(key,map);return map;}
  const root=await node(commit.tree.sha),dataEntry=root.get('data');if(!dataEntry||dataEntry.type!=='tree')throw Error('MISSING_DATA');const data=await node(dataEntry.sha,true),out=new Map();
  for(const p of paths){if(p.startsWith('data/')){const e=data.get(p.slice(5));if(e){if(e.type!=='blob')throw Error('MALFORMED');out.set(p,{oid:e.sha,mode:e.mode});}continue;}let nodes=root;const parts=p.split('/');let entry;for(let i=0;i<parts.length;i++){entry=nodes.get(parts[i]);if(!entry)break;if(i<parts.length-1){if(entry.type!=='tree')throw Error('MALFORMED');nodes=await node(entry.sha);}}if(entry){if(entry.type!=='blob')throw Error('MALFORMED');out.set(p,{oid:entry.sha,mode:entry.mode});}}
  return out;
 }
 return{main,ancestor,entries,stats:()=>({requests,bytes})};
}
