# Verify installed reviewed source bytes; no environment dump/network/writes.
import pathlib,json,hashlib,os,subprocess,re
root=pathlib.Path('.');d=json.loads((root/'docs/reference-only-scope.json').read_text());expected=os.environ.get('EXPECTED_MAIN_SHA','');assert re.fullmatch('[a-f0-9]{40}',expected)
assert os.environ.get('GITHUB_RUN_ATTEMPT')=='1' and os.environ.get('GITHUB_REF_NAME')=='main'
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==expected==os.environ.get('GITHUB_WORKFLOW_SHA')
for name,h in d['files'].items():
 p=root/name;assert p.is_file() and not p.is_symlink() and hashlib.sha256(p.read_bytes()).hexdigest()==h
print('REVIEWED_REFERENCE_SOURCE_VERIFIED_NO_ACQUISITION')
