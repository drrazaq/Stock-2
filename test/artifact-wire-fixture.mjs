// SYNTHETIC HTTP protocol fixture; no fetch, sockets or SDK execution.
import {createHash} from 'node:crypto';
export const syntheticArtifactToken='SYNTHETIC.'+Buffer.from(JSON.stringify({scp:'Actions.Results:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222'})).toString('base64url')+'.SYNTHETIC';
export const syntheticResultsOrigin='https://results.example.invalid',syntheticStorageOrigin='https://synthetic.blob.core.windows.net';
export function artifactWireFixture({onRequest=async()=>null,onFinalized=async()=>{}}={}){
 const calls=[],archives=new Map(),artifacts=new Map();let nextId=1;
 const fetcher=async(url,options)=>{
  const u=new URL(url),body=Buffer.from(options.body||''),phase=u.pathname.endsWith('/CreateArtifact')?'create':u.pathname.endsWith('/FinalizeArtifact')?'finalize':u.searchParams.get('comp')==='block'?'block':u.searchParams.get('comp')==='blocklist'?'commit':'unknown',call={url,phase,method:options.method,headers:options.headers,body,signal:options.signal};calls.push(call);
  if(options.redirect!=='manual'||options.credentials!=='omit'||!options.signal)throw Error('MOCK_TRANSPORT_SCOPE');
  const injected=await onRequest(call,calls);if(injected)return injected;
  if(phase==='create'){
   if(u.origin!==syntheticResultsOrigin||options.method!=='POST'||!options.headers.Authorization?.startsWith('Bearer '))throw Error('MOCK_RESULTS_AUTH');const request=JSON.parse(body);if(request.version!==7||request.mime_type!=='application/zip'||request.workflow_run_backend_id!=='11111111-1111-4111-8111-111111111111'||request.workflow_job_run_backend_id!=='22222222-2222-4222-8222-222222222222'||!request.expires_at)throw Error('MOCK_PROTO_JSON_SCHEMA');
   artifacts.set(request.name,{request,blocks:new Map(),zip:null});return Response.json({ok:true,signed_upload_url:syntheticStorageOrigin+'/synthetic/'+encodeURIComponent(request.name)+'?sig=SYNTHETIC_ONLY'});
  }
  if(phase==='block'||phase==='commit'){
   if(u.origin!==syntheticStorageOrigin||options.method!=='PUT'||options.headers.Authorization||options.headers['x-ms-version']!=='2026-02-06')throw Error('MOCK_STORAGE_SCOPE');const name=decodeURIComponent(u.pathname.split('/').at(-1)),artifact=artifacts.get(name);if(!artifact)throw Error('MOCK_NO_CREATE');
   if(phase==='block'){if(body.length>8*1024*1024)throw Error('MOCK_BLOCK_BUDGET');artifact.blocks.set(u.searchParams.get('blockid'),body);}
   else {const ids=[...body.toString().matchAll(/<Latest>([^<]+)<\/Latest>/g)].map(m=>m[1]);if(!ids.length||ids.some(id=>!artifact.blocks.has(id)))throw Error('MOCK_COMMIT_BLOCKS');artifact.zip=Buffer.concat(ids.map(id=>artifact.blocks.get(id)));}
   return new Response(null,{status:201});
  }
  if(phase==='finalize'){
   const request=JSON.parse(body),artifact=artifacts.get(request.name),zip=artifact?.zip;if(!zip||request.size!==String(zip.length)||request.hash!=='sha256:'+createHash('sha256').update(zip).digest('hex'))throw Error('MOCK_FINALIZE_HASH');const id=nextId++;archives.set(id,zip);await onFinalized({id,zip,request});return Response.json({ok:true,artifact_id:String(id)});
  }
  throw Error('UNEXPECTED_MOCK_ENDPOINT');
 };
 return {fetcher,calls,archives,artifacts};
}
