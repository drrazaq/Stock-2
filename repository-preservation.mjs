// Authority/preservation checks use Git metadata only, never data contents.
const pathOk=p=>typeof p==='string'&&p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&!p.includes('\0')&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const hex=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
export function repositoryPolicy(path,{ownerPaths=[],frozenPaths=[]}={}){
 if(!pathOk(path))return 'INVALID_PATH';
 if(ownerPaths.includes(path))return 'OWNER_PRIVATE_DATA';
 if(frozenPaths.includes(path))return 'FROZEN_RESEARCH';
 if(path==='.github/workflows/premarket-research-validation.yml'||/^run-/.test(path)||/^docs\/validation\/phase-a-.*\.candidate\.json$/.test(path))return 'OWNER_ACTIVATION';
 if(path.startsWith('data/'))return 'PRODUCTION_DATA';
 if(/^\.env(?:$|\.)/.test(path)||path==='.github/private-files.txt'||path==='.github/private-data.sh')return 'OWNER_SECURITY_CONFIGURATION';
 if(/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))return 'WORKFLOW_BRANCH_REVIEW';
 if(/^(?:test|tests)\//.test(path))return 'TEST_FIXTURE';
 if(path.startsWith('docs/'))return 'ENGINEERING_DOCUMENTATION';
 if(/^[^/]+\.mjs$/.test(path)||/^tools\/.*\.(?:mjs|py)$/.test(path))return 'ENGINEERING_SOURCE';
 return 'MANUAL_REVIEW';
}
export function verifyRepositoryChange({baseline,next,allowedPaths,ownerPaths=[],frozenPaths=[]}){
 const errors=[];if(!Array.isArray(baseline)||!Array.isArray(next)||!Array.isArray(allowedPaths))return {status:'BLOCKED',errors:[{reason:'INVALID_TREE_INPUT'}]};
 const collect=entries=>{const map=new Map();for(const row of entries){if(!row||!pathOk(row.path)||!hex(row.blobSha)||!['100644','100755','120000'].includes(row.mode)||map.has(row.path)){errors.push({reason:'MALFORMED_OR_DUPLICATE_TREE_ENTRY',path:row?.path??null});continue;}map.set(row.path,row);}return map;};
 const before=collect(baseline),after=collect(next),allowed=new Set(allowedPaths);
 for(const path of new Set([...before.keys(),...after.keys()])){
  const a=before.get(path),b=after.get(path);if(a?.blobSha===b?.blobSha&&a?.mode===b?.mode)continue;
  const policy=repositoryPolicy(path,{ownerPaths,frozenPaths});
  if(['OWNER_PRIVATE_DATA','FROZEN_RESEARCH','OWNER_ACTIVATION','OWNER_SECURITY_CONFIGURATION','PRODUCTION_DATA','INVALID_PATH'].includes(policy))errors.push({reason:'OWNER_APPROVAL_OR_PRESERVATION_REQUIRED',path,policy});
  else if(!allowed.has(path))errors.push({reason:'UNREVIEWED_CHANGE',path,policy});
 }
 return {status:errors.length?'BLOCKED':'EXPLICIT_BRANCH_CHANGES_ONLY',errors,scope:'Git path/blob/mode metadata only; not behavioral, permission-semantic or profitability certification'};
}
