"""Build ONLY the reviewed14 public files as an OFFLINE root Git bundle.
No remote, credentials, network, existing repository settings or private data.
Output requires an explicit destination outside the source repository.
"""
import argparse,hashlib,json,os,pathlib,subprocess,tempfile
EXPECTED='bb93f3985a9155e0d76a089acc98eeeee4ab9fe0f9427c256f0f126f54d9e18d'
def run(root,*args,input=None,env=None):
 return subprocess.run(['git','-C',str(root),*args],input=input,capture_output=True,check=True,env=env).stdout

def build(source,destination):
 source=pathlib.Path(source).resolve();destination=pathlib.Path(destination).resolve()
 if destination==source or source in destination.parents:raise ValueError('OUTPUT_MUST_BE_OUTSIDE_SOURCE')
 if destination.exists():raise ValueError('OUTPUT_ALREADY_EXISTS')
 raw=(source/'docs/a-first-capture-continuation/hosted-revision/setup-files.manifest.json').read_bytes()
 if hashlib.sha256(raw).hexdigest()!=EXPECTED:raise ValueError('MANIFEST_CHANGED')
 manifest=json.loads(raw);assert len(manifest['files'])==14
 denied={'data/'+x.strip() for x in (source/'.github/private-files.txt').read_text().splitlines() if x.strip() and not x.startswith('#')}
 with tempfile.TemporaryDirectory(prefix='s1-public-payload-fixture-') as tmp:
  root=pathlib.Path(tmp);run(root,'init','-q','-b','main');run(root,'config','core.autocrlf','false');run(root,'config','core.filemode','true')
  for entry in manifest['files']:
   path=entry['path']
   if path in denied or path.startswith(('.git/','.github/')) or '..' in pathlib.PurePosixPath(path).parts:raise ValueError('DISALLOWED_PATH')
   p=source/path
   if p.is_symlink():raise ValueError('SOURCE_SYMLINK')
   b=p.read_bytes()
   if len(b)!=entry['bytes'] or hashlib.sha256(b).hexdigest()!=entry['sha256']:raise ValueError('SOURCE_BYTES_CHANGED')
   out=root/path;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(b);out.chmod(0o644)
  run(root,'add','--',*[x['path'] for x in manifest['files']]);tree=run(root,'write-tree').decode().strip()
  env=os.environ.copy();env.update(GIT_AUTHOR_NAME='Stock-2 S1 offline preparation',GIT_AUTHOR_EMAIL='s1-offline@example.invalid',GIT_COMMITTER_NAME='Stock-2 S1 offline preparation',GIT_COMMITTER_EMAIL='s1-offline@example.invalid',GIT_AUTHOR_DATE='2026-11-07T00:00:00Z',GIT_COMMITTER_DATE='2026-11-07T00:00:00Z')
  commit=run(root,'commit-tree',tree,input=b'Offline proposed original14-file S1 payload; NOT owner approval or installation\n',env=env).decode().strip()
  run(root,'update-ref','refs/heads/main',commit)
  entries=run(root,'ls-tree','-r','--full-tree','HEAD').decode().splitlines()
  if len(entries)!=14:raise ValueError('UNEXPECTED_PAYLOAD_COUNT')
  got={row.split('\t')[1]:row.split('\t')[0].split() for row in entries}
  if set(got)!={x['path'] for x in manifest['files']} or any(v[:2]!=['100644','blob'] for v in got.values()):raise ValueError('TREE_PATH_MODE_MISMATCH')
  for x in manifest['files']:
   b=run(root,'cat-file','blob',got[x['path']][2])
   if hashlib.sha256(b).hexdigest()!=x['sha256']:raise ValueError('COMMITTED_BYTES_CHANGED')
  destination.parent.mkdir(parents=True,exist_ok=True);run(root,'bundle','create',str(destination),'refs/heads/main')
  run(root,'bundle','verify',str(destination))
  size=destination.stat().st_size
  if size>2097152:destination.unlink();raise ValueError('BUNDLE_TOO_LARGE')
 return {'kind':'OFFLINE_PROPOSED_ROOT_BUNDLE_NOT_INSTALLATION','manifestSha256':EXPECTED,'rootCommit':commit,'treeSha':tree,'files':14,'bundleBytes':size,'bundleSha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'remoteOperations':0,'privateRepositoryWrites':0,'workflowFiles':0,'setupAuthorized':False,'operator':'UNASSIGNED_PENDING_REVIEW_AND_OWNER_APPROVAL','authorship':'Offline preparer identity only; owner/Claude authorship not asserted'}

if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--source',default='.');a.add_argument('--output',required=True);v=a.parse_args();print(json.dumps(build(v.source,v.output),indent=2))
