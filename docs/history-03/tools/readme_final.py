# Appends the final section (index of all batches, final files and SHA256) to docs/history-03/README.md (reviewer: Claude).
import hashlib, pathlib, sys, json
D = pathlib.Path(sys.argv[1]); inv = json.loads((D / 'source-inventory-v3.json').read_text()); c = inv['counts']
g = lambda k: c.get('narrow / ' + k, 0) + c.get('broad-only / ' + k, 0)
files = ['CLOSURE-CHECKLIST.md', 'PROVENANCE-REGISTER.md', 'EVIDENCE-VOCABULARY-v2.md', 'RANKED-FINDINGS-v3.md', 'COVERAGE.md', 'all-claims.json', 'source-inventory-v3.json', 'consistency-checks.json',
         'BATCH4-FINDINGS.md', 'tools/catalogue_data_b4.py', 'tools/consistency-checks.py', 'tools/final_package.py', 'tools/readme_final.py', 'tools/build-audit.py']
L = ['', '---', '', '# Final: reconciliation, provenance register, closure checklist', '',
     '## Where to start', '',
     '- `CLOSURE-CHECKLIST.md`: status per part of the criterion, and the remaining owner, Codex and external-evidence items.',
     '- `RANKED-FINDINGS-v3.md`: all ranked corrections.',
     '- `PROVENANCE-REGISTER.md`: every missing field and every stored-row gap.',
     '- `EVIDENCE-VOCABULARY-v2.md`: the consolidated vocabulary.', '',
     '## Final counts', '',
     f'- **Strings:** {inv["total"]} extracted (914 narrow + {inv["total"] - 914} broad-only).',
     f'  - {g("CATALOGUED_CLAIM")} catalogued claims;',
     f'  - {g("REVIEWED_ACCEPTABLE")} reviewed and acceptable;',
     f'  - {g("NOT_A_CLAIM")} not claims;',
     f'  - {g("NOT_REVIEWED")} not reviewed.',
     f'- **Records:** {43 + sum(len(v) for v in json.loads((D / "all-claims.json").read_text())["batches"].values())}.',
     '- **Batch order:** batch 1 is the first section of this README; batches 2 to 5 follow, each section with its own file hashes.', '',
     '## Correction to batch 4', '',
     'The first publication of batch 4 (`b2b762dd`) quoted the owner\'s own-pick record in D14. It now uses placeholders. The figure comes from data already committed to the repository; the branch history was not rewritten.', '',
     '## Final files and SHA256', '', '| File | SHA256 |', '|---|---|'] + [f'| `{f}` | `{hashlib.sha256((D / f).read_bytes()).hexdigest()}` |' for f in files]
p = D / 'README.md'; p.write_text(p.read_text().rstrip('\n') + '\n' + '\n'.join(L) + '\n')
