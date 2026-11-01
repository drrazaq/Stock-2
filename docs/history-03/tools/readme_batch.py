# Appends a "Batch N" section (summary, files, SHA256) to docs/history-03/README.md (reviewer: Claude).
# Usage: python3 -I -B readme_batch.py <docs/history-03 dir> <N> <commit-free note>
import hashlib, pathlib, sys, importlib.util, json
D, N = pathlib.Path(sys.argv[1]), int(sys.argv[2])
sp = importlib.util.spec_from_file_location('m', D / 'tools' / ('catalogue_data_b%d.py' % N)); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
inv = json.loads((D / 'source-inventory-v3.json').read_text()); c = inv['counts']; g = lambda k: c.get('narrow / ' + k, 0) + c.get('broad-only / ' + k, 0)
L = ['', '---', '', '# ' + m.TITLE, '', 'Same method and fields as batch 2. Nothing was sent and no provider was called; raw renders stay local.', '', '## Results', ''] + m.SUMMARY + ['',
     '## Coverage after this batch (`COVERAGE.md`, `source-inventory-v3.json`)', '', '| Category | Strings |', '|---|---:|'] + [f'| {k} | {g(k)} |' for k in ['CATALOGUED_CLAIM', 'REVIEWED_ACCEPTABLE', 'NOT_A_CLAIM', 'NOT_REVIEWED']] + [f'| **Total** | **{inv["total"]}** |', '',
     f'Records to date: {43 + sum(1 for _ in json.loads((D / "all-claims.json").read_text())["batches"].values() for _ in _)} (43 in batch 1, the rest in `all-claims.json`). The combined ranking is in `RANKED-FINDINGS-v3.md`.', '',
     '## Files and SHA256', '', '| File | SHA256 |', '|---|---|'] + [f'| `{f}` | `{hashlib.sha256((D / f).read_bytes()).hexdigest()}` |' for f in m.FILES]
p = D / 'README.md'; p.write_text(p.read_text().rstrip('\n') + '\n' + '\n'.join(L) + '\n')
