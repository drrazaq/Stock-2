"""Verify exact approved private source and fresh run admission; names/hashes only."""
import pathlib,json,hashlib,os,subprocess,re,datetime
r=pathlib.Path('.')
expected=os.environ.get('EXPECTED_MAIN_SHA','')
assert re.fullmatch('[a-f0-9]{40}',expected)
assert os.environ.get('GITHUB_RUN_ATTEMPT')=='1' and os.environ.get('GITHUB_REF_NAME')=='main'
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert expected==os.environ.get('GITHUB_WORKFLOW_SHA')
if os.environ.get('EVIDENCE_PHASE')=='recovery':
 assert subprocess.check_output(['git','show','-s','--format=%P',head],text=True).strip()==expected
 assert subprocess.check_output(['git','diff','--name-status',expected,head],text=True).strip()=='A\tquote-owner-recovery.zip'
else: assert head==expected
scope=json.loads((r/'docs/evidence-source-manifest.json').read_text())
for name,h in scope['files'].items():
 p=r/name;s=p.lstat();assert p.is_file() and not p.is_symlink() and s.st_size<=1048576 and hashlib.sha256(p.read_bytes()).hexdigest()==h
cutoff=datetime.datetime.fromisoformat(os.environ['LATEST_START_UTC'].replace('Z','+00:00'))
assert os.environ['LATEST_START_UTC'].endswith('Z') and 0<(cutoff-datetime.datetime.now(datetime.timezone.utc)).total_seconds()<=1800
print('EXACT_PRIVATE_SOURCE_AND_START_WINDOW_VERIFIED')
