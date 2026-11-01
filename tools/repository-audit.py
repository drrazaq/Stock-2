#!/usr/bin/env python3
"""Read-only inventory. Never runs repository entry points, fetches data, or changes datasets."""
import argparse, gzip, hashlib, json, re, subprocess
from pathlib import Path

SCRIPT_SUFFIXES = {'.mjs', '.js', '.cjs', '.py', '.sh'}
AXES = ('inputs', 'outputs', 'sideEffects', 'failure', 'timing', 'researchBoundary')
FACT_PATTERNS = {
    'inputs': r'process\.argv|sys\.argv|argparse|ArgumentParser|readFile|read_text|read_bytes|readSync|\.read\(|getpass|process\.env|os\.environ|\$\{?[A-Z_]+',
    'outputs': r'export\s|console\.(log|error)|process\.(stdout|stderr)|\bprint\(|writeFile|write_text|write_bytes|json\.dump|\.write\(|\becho\b|\bprintf\b',
    'sideEffects': r'writeFile|appendFile|mkdir|unlink|rename|rmSync|symlink|chmod|fsync|fetch\(|fetcher\(|request\(|https?://|spawn|execFile|subprocess|\bgit\b|\bcurl\b',
    'failure': r'throw\b|catch\b|except\b|raise\b|exitCode|process\.exit|SystemExit|\bexit\b|retry|retries|timeout|Timeout|AbortSignal|assert\.',
    'timing': r'Date\b|datetime|setTimeout|setInterval|timeout|Timeout|\bsleep\b|deadline|expires|approvedAt|[Ss]ession|[Mm]inute|now\(',
    'researchBoundary': r'approvedBuy|approvedBUY|RESEARCH|research|PAPER|paper|SYNTHETIC|synthetic|NOT_PROVEN|NOT PROVEN|approval|approved|[Ff]rozen|[Pp]rofit|ZAD|halal|orders|privacy|PRIVATE_KEY',
}

def script_paths(root):
    # Product scripts include nested tools and repository shell helpers. Test and
    # review harnesses are evidence, not production entry points. Browser scripts
    # remain part of this scope; workflow inline programs are ACTIONS-04's audit.
    paths = [p for p in root.iterdir() if p.is_file() and (p.suffix in SCRIPT_SUFFIXES or p.suffix == '.html')]
    for directory in ('tools', '.github'):
        base = root / directory
        if base.exists():
            paths.extend(p for p in base.rglob('*') if p.is_file() and p.suffix in SCRIPT_SUFFIXES)
    return sorted(set(paths))

def behavioral_inventory(root, reviews=None):
    root = Path(root).resolve()
    reviews = reviews or {}
    tests = {str(p.relative_to(root)): p.read_text() for folder in ('test', 'tests')
             if (root / folder).exists() for p in (root / folder).glob('*')
             if p.is_file() and p.suffix in SCRIPT_SUFFIXES}
    workflows = {str(p.relative_to(root)): p.read_text() for p in (root / '.github/workflows').glob('*.yml')}
    rows = []
    for p in script_paths(root):
        rel = p.relative_to(root).as_posix()
        if p.is_symlink():
            rows.append({'path': rel, 'status': 'UNREVIEWED_UNSAFE_SOURCE_LINK'})
            continue
        raw = p.read_bytes()
        source = raw.decode('utf-8')
        digest = hashlib.sha256(raw).hexdigest()
        facts = {}
        for axis, pattern in FACT_PATTERNS.items():
            hits = [i for i, line in enumerate(source.splitlines(), 1) if re.search(pattern, line)]
            facts[axis] = {'matchingLines': hits, 'meaning': 'LEXICAL_LOCATORS_ONLY_NOT_SEMANTIC_COVERAGE'}
        review = reviews.get(rel)
        valid = bool(review and review.get('sha256') == digest and all(isinstance(review.get(axis), str) and review[axis].strip() for axis in AXES)
                     and review.get('evidence') and review.get('reviewer') and review.get('status') in ('SOURCE_REVIEWED', 'SOURCE_REVIEWED_OPEN_FINDINGS'))
        rows.append({'path': rel, 'sha256': digest, 'bytes': len(raw),
                     'status': review['status'] if valid else 'STALE_OR_INVALID_REVIEW' if review else 'PENDING_SOURCE_REVIEW',
                     'facts': facts, 'contract': review if valid else None,
                     'testReferences': [name for name, text in tests.items() if p.name in text],
                     'workflowReferences': [name for name, text in workflows.items() if p.name in text],
                     'referenceCaveat': 'A filename match is navigation only, not proof of exercised behavior or production deployment.'})
    return {'kind': 'REPO03_BEHAVIORAL_MATRIX_V1', 'scope': 'Root scripts/browser, recursive tools and repository shell helpers; workflow inline programs are owned by ACTIONS-04. Test/review fixtures are supporting evidence.',
            'acceptanceRequirement': 'Per-script input/output/side-effect, failure, timing and research-boundary review with linked evidence; targeted regressions for defects. Inventory/syntax alone cannot close this.',
            'sourceExecution': False, 'datasetsRead': False, 'rows': rows,
            'totals': {'scripts': len(rows), 'sourceReviewed': sum(r['status'].startswith('SOURCE_REVIEWED') for r in rows),
                       'pending': sum(not r['status'].startswith('SOURCE_REVIEWED') for r in rows),
                       'reviewedWithOpenFindings': sum(r['status'] == 'SOURCE_REVIEWED_OPEN_FINDINGS' for r in rows)},
            'accepted': False, 'note': 'An explicit hash-matched review is required. Empty axes, source changes and inventories cannot silently count as reviewed; review is distinct from all-path runtime verification.'}

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
    ap=argparse.ArgumentParser();ap.add_argument('--root',default='.');ap.add_argument('--syntax',action='store_true');ap.add_argument('--output');ap.add_argument('--scripts-only',action='store_true');ap.add_argument('--reviews');args=ap.parse_args()
    if args.scripts_only:
        reviews=json.loads(Path(args.reviews).read_text()) if args.reviews else {}
        report=behavioral_inventory(Path(args.root),reviews)
    else:
        report=audit(Path(args.root).resolve(),args.syntax)
    if args.output:
        # An audit is append-only evidence. Never replace an earlier report or
        # write through an existing output link; stdout totals remain aggregate.
        with Path(args.output).open('x') as handle:handle.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report['totals'],indent=2))
    if not args.scripts_only and (any(x.get('syntax')=='FAIL' or x['missingImports'] for x in report['modules']) or report['totals']['datasetFailures']):raise SystemExit(1)
