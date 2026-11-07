// Offline verifier for explicitly fetched GitHub GET evidence. No network, env,
// credentials, repository writes or provider calls. Reject unexpected paths before
// requesting any blob: a private-file surprise must not cause its contents to be read.
import {createHash} from 'node:crypto';
export const S1_MANIFEST_SHA256='bb93f3985a9155e0d76a089acc98eeeee4ab9fe0f9427c256f0f126f54d9e18d';
const digest=(b,kind='sha256')=>createHash(kind).update(b).digest('hex');
const fail=code=>{throw Error(code);};
const need=(v,c)=>{if(!v)fail(c);};
const hex=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
export function inspectS1Manifest(bytes){
 need(Buffer.isBuffer(bytes)&&digest(bytes)===S1_MANIFEST_SHA256,'MANIFEST_FINGERPRINT_MISMATCH');
 const m=JSON.parse(bytes.toString('utf8'));
 need(m.kind==='S1_EXACT_PAYLOAD_ALLOWLIST_V1'&&m.payloadCount===14&&m.files.length===14,'MANIFEST_SHAPE');
 need(new Set(m.files.map(x=>x.path)).size===14,'MANIFEST_DUPLICATE');return m;
}
export function planS1BlobReads(snapshot,manifestBytes){
 const m=inspectS1Manifest(manifestBytes),r=snapshot.repository;
 need(r?.id===1449339591&&r.full_name==='drrazaq/Stock-2-research-private'&&r.private===true&&r.fork===false,'WRONG_OR_NONPRIVATE_REPOSITORY');
 need(r.default_branch==='main','DEFAULT_BRANCH_CHANGED');
 need(snapshot.empty!==true,'EMPTY_TARGET_NO_PAYLOAD');
 const c=snapshot.commit,t=snapshot.tree;
 need(hex(snapshot.refSha)&&snapshot.refSha===c?.sha&&hex(c?.commit?.tree?.sha)&&c.commit.tree.sha===t?.sha,'COMMIT_TREE_IDENTITY_UNPROVEN');
 need(t.truncated===false&&Array.isArray(t.tree),'TREE_INCOMPLETE');
 const expected=new Map(m.files.map(x=>[x.path,x])),dirs=new Set();
 for(const f of m.files){const parts=f.path.split('/');for(let i=1;i<parts.length;i++)dirs.add(parts.slice(0,i).join('/'));}
 const paths=new Set();const reads=[];
 for(const e of t.tree){
  need(typeof e.path==='string'&&!paths.has(e.path),'TREE_DUPLICATE_PATH');paths.add(e.path);
  if(e.type==='tree'){need(e.mode==='040000'&&dirs.has(e.path),'UNEXPECTED_DIRECTORY');continue;}
  need(expected.has(e.path),'UNEXPECTED_PATH_NO_BLOB_READ');
  const f=expected.get(e.path);need(e.type==='blob'&&e.mode==='100644'&&hex(e.sha)&&e.size===f.bytes,'BLOB_MODE_SIZE_OR_ID_INVALID');
  reads.push({path:e.path,blobSha:e.sha,bytes:f.bytes,sha256:f.sha256});
 }
 need(reads.length===14&&m.files.every(x=>paths.has(x.path)),'MISSING_PAYLOAD_PATH');
 return {repository:r.full_name,commitSha:c.sha,treeSha:t.sha,reads:reads.sort((a,b)=>a.path.localeCompare(b.path)),maximumBlobGETs:14,writeOperations:0};
}
export function verifyS1ConnectorSnapshot(snapshot,manifestBytes){
 try{
  const p=planS1BlobReads(snapshot,manifestBytes),b=snapshot.blobs;
  need(Array.isArray(b)&&b.length===14&&new Set(b.map(x=>x.path)).size===14,'BLOB_SET_INCOMPLETE');
  for(const e of p.reads){const x=b.find(y=>y.path===e.path);need(x&&x.sha===e.blobSha&&x.encoding==='base64'&&typeof x.content==='string','RAW_BLOB_EVIDENCE_MISSING');
   const text=x.content.replace(/\s/g,''),raw=Buffer.from(text,'base64');need(raw.toString('base64')===text,'BASE64_NOT_CANONICAL');
   need(raw.length===e.bytes&&digest(raw)===e.sha256,'BLOB_BYTE_FINGERPRINT_MISMATCH');
   const git=digest(Buffer.concat([Buffer.from(`blob ${raw.length}\0`),raw]),'sha1');need(git===e.blobSha,'GIT_BLOB_IDENTITY_MISMATCH');
  }
  const disabled=snapshot.actionsEvidence?.source==='SUPPORTED_READ_ONLY_API'&&snapshot.actionsEvidence?.repository===p.repository&&snapshot.actionsEvidence?.enabled===false;
  return {status:disabled?'PAYLOAD_AND_DISABLED_ACTIONS_VERIFIED':'PAYLOAD_VERIFIED_ACTIONS_NOT_INDEPENDENTLY_VERIFIED',evidenceScope:snapshot.evidenceScope||'OFFLINE_OR_UNPROVEN',liveTargetVerified:snapshot.evidenceScope==='SUPPORTED_CONNECTOR_READS',payloadFiles:14,commitSha:p.commitSha,treeSha:p.treeSha,actionsDisabledIndependentlyVerified:disabled,settingsEvidence:disabled?'SUPPORTED_READ_ONLY_API':'OWNER_REPORTED_OR_UNAVAILABLE',s1Complete:false,setupOrExecutionAuthorized:false,providerCalls:0,writeOperations:0};
 }catch(e){return {status:'NOT_VERIFIED',reason:e.message,s1Complete:false,setupOrExecutionAuthorized:false,providerCalls:0,writeOperations:0};}
}

// GitHub fetch_blob currently returns tool-decoded UTF-8 text. This bridge does
// not claim raw-byte fidelity: the immutable expected byte/Git hashes above
// must still match, so BOM/newline/decoder changes are refused, never repaired.
export function connectorTextBlob(result,{path,blobSha}){
 need(result?.isError!==true&&typeof result?.structuredContent?.content==='string','CONNECTOR_BLOB_UNAVAILABLE');
 return {path,sha:blobSha,encoding:'base64',content:Buffer.from(result.structuredContent.content,'utf8').toString('base64')};
}
