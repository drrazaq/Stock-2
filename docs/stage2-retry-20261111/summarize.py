"""Final frozen-tool receipts, preserving earlier fixture failures as historical evidence."""
import hashlib,json,re,subprocess
from pathlib import Path
P=Path(__file__).parent
latest={}
for line in (P/'offline-exercise.log').read_text().splitlines():
 m=re.match(r'^(PASS|FAIL)\s+([FISL]\d+)\s+(.*)',line)
 if m:latest[m[2]]={'case':m[2],'status':m[1],'detail':m[3]}
expected={*(f'F{i}' for i in range(1,20)),*(f'I{i}' for i in range(1,11)),*(f'S{i}' for i in range(1,4)),*(f'L{i}' for i in range(1,9))}
assert set(latest)==expected and all(v['status']=='PASS' for v in latest.values())
assert 'RESULT pass=40 fail=0' in (P/'offline-exercise.log').read_text()
config=json.loads((P/'config-exercise.json').read_text());admission=json.loads((P/'admission-exercise.json').read_text())
assert config['pass']==10 and config['fail']==0 and admission['pass']==9 and admission['fail']==0
raw=(P/'full-suite.local.tap').read_bytes();tap=raw.decode()
assert re.search(r'^# tests 1601$',tap,re.M) and re.search(r'^# fail 0$',tap,re.M) and re.search(r'^# skipped 0$',tap,re.M)
full=None
for l in (P/'offline-exercise.log').read_text().splitlines():
 try:r=json.loads(l.strip())
 except ValueError:continue
 if r.get('gates',{}).get('freshSuite',{}).get('tests')==1601:full=r;break
assert full and full['gates']['freshSuite']['rc']==0
hosted=json.loads((P/'hosted-receipt.json').read_text());assert hosted['uniqueRootFiles']==168 and not hosted['errors'] and not hosted['missing'] and not hosted['extra']
original=subprocess.check_output(['git','show','a76f315f:docs/stage1-retry-20261111/stage1_retry.py']);assert hashlib.sha256(original).hexdigest()=='8cb36bc3f624644578f35b05760bf958696fd41c8a63424a2ae2189fd1c54510'
historical=[s for s in (P/'pre-admission-initial.log').read_text().splitlines() if s.startswith('FAIL ')]
assert len(historical)==2
out={'status':'OFFLINE_DELTA_VALIDATION_PASS_NOT_OPERATIONAL_READY','originalStage1ToolSHA256':hashlib.sha256(original).hexdigest(),'stage1Unchanged':True,'toolSHA256':hashlib.sha256((P/'stage2_retry.py').read_bytes()).hexdigest(),'exerciseSHA256':hashlib.sha256((P/'offline-exercise.sh').read_bytes()).hexdigest(),'behaviorCases':40,'configurationCases':10,'admissionCases':9,'distinctCases':59,'unresolvedFailures':0,'historicalFixtureFailures':historical,'historicalDisposition':'Initial pre-admission run38/2 used watcher-guard.mjs as unbound though Stage2 binds it. Corrected five affected fixtures to truly unbound research-core.mjs; corrected5/5 receipt retained. Final frozen-tool complete40/0 run supersedes it. No failed run is called PASS.','cases':sorted(latest.values(),key=lambda r:(r['case'][0],int(r['case'][1:]))),'localFullSuite':{'node':'v20.20.0','rootFiles':168,'tests':1601,'fail':0,'skipped':0,'durationMs':float(re.search(r'^# duration_ms (\S+)',tap,re.M)[1]),'tapSHA256':hashlib.sha256(raw).hexdigest(),'tapBytes':len(raw),'receipt':'LOCAL_ONLY full-suite.local.tap; complete hosted source log linked separately','executedFreshCandidate':full['candidate'],'tree':full['tree'],'treeEqualsTested':full['tree']==json.loads((P/'objects.json').read_text())['stage2Tree']},'inventoryAdditionsBeyondClosed165':['test/research-svol.test.mjs','test/research-wiki.test.mjs','test/value-core-nov10.test.mjs'],'hosted':hosted,'objects':json.loads((P/'objects.json').read_text()),'dates':json.loads((P/'dates.json').read_text())}
assert out['localFullSuite']['treeEqualsTested']
(P/'validation.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:out[k] for k in ['status','toolSHA256','exerciseSHA256','distinctCases','unresolvedFailures']},indent=2))
