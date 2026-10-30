"""Offline, non-destructive Git-object recovery. Never fetches or writes production data."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

def recover(repo, output, sources):
    repo, output = Path(repo), Path(output)
    if output.exists() or any(p.is_symlink() for p in (output, *output.parents)):
        raise ValueError('NEW_NON_SYMLINK_OUTPUT_REQUIRED')
    prepared = []
    total = 0
    for day, sha in sources:
        if not re.fullmatch(r'\d{4}-\d\d-\d\d', day) or not re.fullmatch(r'[a-f0-9]{40}', sha):
            raise ValueError('EXACT_DATE_AND_COMMIT_REQUIRED')
        entries = []
        for name in ['data/ignition-live.json', 'data/ignition-days.jsonl', 'data/shadow/'+day+'.jsonl.gz', 'data/opp-days.jsonl']:
            spec = sha+':'+name
            size = subprocess.run(['git','cat-file','-s',spec], cwd=repo, capture_output=True, text=True)
            if size.returncode:
                entries.append({'path':name,'status':'MISSING_IN_SOURCE_COMMIT'})
                continue
            n = int(size.stdout)
            total += n
            if n > 32*1024*1024 or total > 128*1024*1024:
                raise ValueError('RECOVERY_BYTE_BUDGET')
            raw = subprocess.check_output(['git','show',spec],cwd=repo)
            if len(raw) != n:
                raise ValueError('SOURCE_SIZE_CHANGED')
            entries.append({'path':name,'status':'BYTE_IDENTICAL_COPY','sha256':hashlib.sha256(raw).hexdigest(),'bytes':n,'_raw':raw})
        prepared.append({'day':day,'sourceSha':sha,'files':entries})
    keys=[(s['day'],s['sourceSha']) for s in prepared]
    if len(keys)!=len(set(keys)):
        raise ValueError('DUPLICATE_SOURCE')
    output.mkdir(parents=True, mode=0o700)
    for source in prepared:
        for entry in source['files']:
            raw=entry.pop('_raw',None)
            if raw is not None:
                p=output/source['day']/source['sourceSha']/entry['path']
                p.parent.mkdir(parents=True,exist_ok=True)
                with p.open('xb') as handle:
                    handle.write(raw)
    result={'kind':'SECONDARY_RECONSTRUCTION_ONLY','primaryOrConfirmationEvidence':False,'originalsRewritten':False,'sources':prepared,'note':'Original whole-file bytes retained, including other dates in JSONL. Missing evidence is not reconstructed. No private owner accounting files are in the allowlist.'}
    with (output/'manifest.json').open('x') as handle:
        json.dump(result,handle,indent=2)
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',required=True)
    p.add_argument('--output',required=True)
    p.add_argument('--source',action='append',required=True,help='DATE:EXACT_40_CHARACTER_SHA')
    a=p.parse_args()
    try:
        result=recover(a.repo,a.output,[x.split(':',1) for x in a.source])
        print(json.dumps({'status':result['kind'],'sources':len(result['sources']),'originalsRewritten':False}))
    except (ValueError,subprocess.CalledProcessError,OSError):
        raise SystemExit('Recovery refused: source/output/budget validation failed.') from None
