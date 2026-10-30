#!/usr/bin/env python3
"""Read-only inventory. Never runs repository entry points, fetches data, or changes datasets."""
import argparse, gzip, hashlib, json, re, subprocess
from pathlib import Path

def audit(root, syntax=False):
    private_file=root/'.github/private-files.txt'
    private={'data/'+x.strip() for x in private_file.read_text().splitlines() if x.strip() and not x.lstrip().startswith('#')} if private_file.exists() else set()
    modules=[]
    for p in sorted(root.glob('*.mjs')):
        source=p.read_text(); deps=re.findall(r"(?:from\s*|import\s*)['\"](\./[^'\"]+)['\"]",source)
        item={'path':p.name,'bytes':p.stat().st_size,'imports':deps,'missingImports':[x for x in deps if not (p.parent/x).exists()], 'auditLevel':'INVENTORIED_ONLY'}
        if syntax:
            r=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
            item['syntax']='PASS' if r.returncode==0 else 'FAIL'
            if r.returncode:item['error']=r.stderr[:1000]
        modules.append(item)
    workflows=[]
    for p in sorted((root/'.github/workflows').glob('*.yml')):
        s=p.read_text();workflows.append({'path':str(p.relative_to(root)),'hardcodedMainCheckout':bool(re.search(r'^\s+ref: main\s*$',s,re.M)),'contentsWrite':'contents: write' in s,'actionsWrite':'actions: write' in s,'deploys':'actions/deploy-pages' in s,'auditLevel':'INVENTORIED_ONLY'})
    datasets=[]
    def invalid_constant(x):raise ValueError('non-JSON numeric constant')
    for p in sorted((root/'data').rglob('*')):
        if not p.is_file():continue
        rel=str(p.relative_to(root))
        if rel in private:continue
        fmt=p.name.removesuffix('.gz')
        if not fmt.endswith(('.json','.jsonl')):continue
        item={'path':rel,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'check':'ENCODING_AND_JSON_SYNTAX_ONLY'}
        try:
            opener=gzip.open if p.suffix=='.gz' else open
            with opener(p,'rt',encoding='utf-8') as f:
                if fmt.endswith('.jsonl'):
                    n=0
                    for line in f:
                        if line.strip():json.loads(line,parse_constant=invalid_constant);n+=1
                    item['records']=n
                else:json.load(f,parse_constant=invalid_constant)
            item['status']='PASS'
        except (ValueError, OSError, UnicodeError, EOFError) as e:item.update(status='FAIL',error=type(e).__name__)
        datasets.append(item)
    return {'scope':'Inventory/static syntax/serialization integrity only; not semantic or trading validation','modules':modules,'workflows':workflows,'datasets':datasets,'privateFilesExcluded':len(private),'testFiles':len(list((root/'test').glob('*.test.mjs')))+len(list((root/'tests').glob('*.test.mjs'))),'totals':{'modules':len(modules),'workflows':len(workflows),'datasetsChecked':len(datasets),'datasetFailures':sum(x['status']=='FAIL' for x in datasets),'missingImportModules':sum(bool(x['missingImports']) for x in modules)}}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--root',default='.');ap.add_argument('--syntax',action='store_true');ap.add_argument('--output');args=ap.parse_args()
    report=audit(Path(args.root).resolve(),args.syntax)
    if args.output:Path(args.output).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report['totals'],indent=2))
    if any(x.get('syntax')=='FAIL' or x['missingImports'] for x in report['modules']) or report['totals']['datasetFailures']:raise SystemExit(1)
