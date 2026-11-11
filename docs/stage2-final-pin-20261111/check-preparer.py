"""Exercise new preparation controls using existing objects; no source suite rerun/ref write."""
import importlib.util,json,subprocess,tempfile
from pathlib import Path
P=Path(__file__).resolve().parent;spec=importlib.util.spec_from_file_location('finalprep',P/'prepare-final-pin.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
refs=lambda:subprocess.check_output(['git','for-each-ref','--format=%(refname) %(objectname)'],cwd=m.ROOT)
before=refs();results=[]
try:m.check_and_build('d276bbcb1c23923255f976f2f9e2aa06857c7c34');raise AssertionError('actual pre-Stage1 main accepted')
except ValueError as e:assert 'NEVER overlay' in str(e);results.append({'case':'actual current main is not installed Stage1','result':'EXPECTED_STOP','why':str(e)})
r=m.check_and_build('61698a6f0fa81d1c805396c37cf5b54e680413a1')
assert r['tree']=='07d02433c7dd8b0dfb889bd093a18168e72b9bd5' and (r['bound'],r['writes'],r['inverse'])==(46,39,39) and not r['nonDataDiffFromOldTested']
results.append({'case':'EXISTING hypothetical Stage1 object ONLY; not future final pin','result':'COMPOSITION_PROOF_PASS','tree':r['tree'],'localCandidateCreated':False})
a=m.audit_since('10a25bf67c506894a9da74d2ef0cab6aec75d169','d276bbcb1c23923255f976f2f9e2aa06857c7c34');assert not a['nonDataCommits'];results.append({'case':'known subsequent data-only heads','result':'PASS','audit':a})
a=m.audit_since('58c56cad6de7a646abb2ef62fda0cca40e45e7f1','d276bbcb1c23923255f976f2f9e2aa06857c7c34');assert a['status']=='STOP_NONDATA_SINCE_FINAL' and any(x['sha'].startswith('4933429a') for x in a['nonDataCommits']);results.append({'case':'known source writer4933429a','result':'EXPECTED_STOP','audit':a})
try:m.check_and_build('main');raise AssertionError('mutable main accepted')
except ValueError:results.append({'case':'mutable ref rejected','result':'EXPECTED_STOP'})
assert refs()==before
(P/'preparer-checks.json').write_text(json.dumps({'status':'PREPARATION_CONTROL_PASS_NOT_FUTURE_SOURCE_TEST','noRefChanges':True,'cases':results},indent=2)+'\n')
print('Preparation controls passed; no future code built/tested, no refs changed, closed source suites not repeated.')
