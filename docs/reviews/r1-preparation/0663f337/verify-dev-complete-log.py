import sys,re,json,hashlib,collections,subprocess
from pathlib import Path
log,sha,kind=sys.argv[1:4];raw=Path(log).read_bytes();lines=[re.sub(r'^\d{4}-\d\d-\d\dT\S+Z\s+','',x.lstrip('\ufeff')) for x in raw.decode().splitlines()]
expected=[x for x in subprocess.check_output(['git','ls-tree','-r','--name-only',sha,'--','test','tests'],cwd='/workspace/Stock-2',text=True).splitlines() if re.fullmatch(r'(?:test|tests)/[^/]+\.test\.mjs',x)]
passes=[m[1] for x in lines if (m:=re.fullmatch(r'PASS ((?:test|tests)/[^/]+\.test\.mjs)',x))];groups=[m[1] for x in lines if (m:=re.fullmatch(r'##\[group\]((?:test|tests)/[^/]+\.test\.mjs)',x))]
errors=[x for x in lines if re.match(r'^(?:##\[error\]|not ok \d|# fail [1-9]\d*\s*$|ℹ fail [1-9]\d*\s*$)',x)]
gc,pc=collections.Counter(groups),collections.Counter(passes);failed=sorted(set(groups)-set(passes));missing=sorted(set(expected)-set(groups));unexpected=sorted(set(groups)-set(expected));duplicates={f:n for f,n in gc.items() if n!=1};duplicatepasses={f:n for f,n in pc.items() if n!=1};assert sha in lines,'exact checkout SHA absent';assert any('Current runner version' in x for x in lines);assert any('Cleaning up orphan processes' in x for x in lines),'runner cleanup absent'
assert not missing and not unexpected and not duplicates and not duplicatepasses,(missing,unexpected,duplicates,duplicatepasses)
result={'sha':sha,'kind':kind,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'registered':len(expected),'groups':len(groups),'uniquePASS':len(set(passes)),'failedFiles':failed,'missing':missing,'unexpected':unexpected,'duplicateGroups':duplicates,'duplicatePASS':duplicatepasses,'errors':errors,'fullLogAndEveryRegisteredFilePresent':True,'nodeLines':[x for x in lines if re.fullmatch(r'v20\.\d+\.\d+',x)],'verdict':'PASS' if not failed and not errors else 'FAIL_NOT_WAIVED'}
if kind=='corrected':assert not failed and not errors,result
else:
 intended={'test/a-fenced-recovery.test.mjs','test/a-first-capture-package.test.mjs','test/a-n-bc-package.test.mjs','test/a-native-importer-package.test.mjs','test/a-native-source-package.test.mjs'};result['matchesPreviouslyReportedFailureFiles']=set(failed)==intended
print(json.dumps(result,indent=2))
