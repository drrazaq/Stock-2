# HISTORY-03 catalogue builder (reviewer: Claude). Documentation only. Inputs: catalogue_data.py (hand-mapped priority claims)
# and source-candidates.json (extract-claims.py output with enclosing function names). Writes the JSON catalogue, the candidate
# inventory with review status, and the two Markdown views into <out>.
# Usage: python3 -I build-catalogue.py <dir with catalogue_data.py and hits.json> <out dir>
import json, re, sys, pathlib, importlib.util
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('cd', src / 'catalogue_data.py'); cd = importlib.util.module_from_spec(spec); spec.loader.exec_module(cd)
C, MAIN = cd.C, cd.MAIN
RANK = [('W01','HIGH'),('A01','HIGH'),('W03','HIGH'),('W04','HIGH'),('X01','HIGH (latent)'),('W07','HIGH'),
        ('W08','MEDIUM-HIGH'),('A04','MEDIUM-HIGH'),('A05','MEDIUM'),('S07','MEDIUM'),('W02','MEDIUM'),('A02','MEDIUM'),('W06','MEDIUM'),
        ('S02','MEDIUM'),('W09','MEDIUM'),('A03','MEDIUM'),('W05','MEDIUM'),('X02','MEDIUM-LOW'),('X03','MEDIUM-LOW'),('X07','MEDIUM-LOW'),
        ('W16','LOW-MEDIUM'),('S03','LOW'),('W11','LOW'),('W12','LOW'),('A09','LOW'),('X04','LOW (latent)'),('W13','LOW'),('A08','LOW'),
        ('W15','LOW'),('A12','LOW'),('A06','LOW'),('A10','LOW')]
byid = {c['id']: c for c in C}
assert all(i in byid for i, _ in RANK), [i for i, _ in RANK if i not in byid]
for n, (i, sev) in enumerate(RANK, 1): byid[i]['rank'], byid[i]['severity'] = n, sev
DEV = 'Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9'
DEVSTATE = {'A04': 'CHANGED on ' + DEV + ': "FOCUS OFF: presentation expanded; unproven engine candidates remain paper only" (no longer shown as buys)',
            'X03': 'WORDING ABSENT on ' + DEV,
            'S01': 'RELABELLED on ' + DEV + ': "SCORECARD (LEGACY_FORWARD_V1 ...; descriptive, not admitted prospective evaluation)"; row S02 wording still present',
            'X02': 'PARTLY on ' + DEV + ': one of the two "Tested buys in ACTIONS" strings remains',
            'A09': 'CHANGED on ' + DEV + ': "% summed normalized net return per hypothetical 1,000 USD full trade, not account return or dollar P&L" (cost basis still the modelled 0.8%)',
            'S06': 'PERSISTS on ' + DEV + ' (template at scan.mjs:613 on main; dynamic text, checked by template)'}
for c in C: c['development'] = DEVSTATE.get(c['id'], 'PERSISTS on ' + DEV + ' (same wording found by phrase search)')
FIELDS = ['id','rank','severity','surface','status','wording','source','evidence','population','period','rule','costs','hold','coverage','reproduced','finding','correction','development']
cat = {'kind': 'HISTORY03_USER_FACING_CLAIM_CATALOGUE_V1', 'productionSource': MAIN, 'renderedFrom': 'repository data committed at ' + MAIN + ' (offline render, 1 Nov 2026)',
       'statusVocabulary': {
         'SUPPORTED': 'traces to a named artifact and the wording matches its scope',
         'SUPPORTED_QUALIFIED': 'traces, and the message already carries the needed limit (paper / not proven / too early)',
         'MISLEADING': 'traces at least partly, but the wording overstates, mixes populations, omits material context or uses a word ("proven", "tested", "works", "passed") for a weaker bar',
         'UNSUPPORTED': 'no artifact supports it, or the artifact contradicts it',
         'STALE': 'contradicts current owner decisions or configuration',
         'EVIDENCE_NOT_MAPPED': 'no artifact identified in this pass'},
       'reproductionNote': 'No claim was recomputed from raw market data in this package. "NOT RECOMPUTED" means the number was traced to the named artifact only.',
       'claims': [{k: c.get(k) for k in FIELDS} for c in sorted(C, key=lambda c: (c.get('rank', 999), c['id']))]}
(out / 'claims-catalogue.json').write_text(json.dumps(cat, indent=1, ensure_ascii=False) + '\n')
# Candidate inventory: every extracted source string, with the catalogue id when its file:line is inside a mapped source reference.
refs = []
for c in C:
    for m in re.finditer(r'([\w./-]+\.mjs):(\d+)(?:-(\d+))?((?:/\d+(?:-\d+)?)*)', c['source']):
        f = m.group(1); spans = [(int(m.group(2)), int(m.group(3) or m.group(2)))]
        for extra in re.findall(r'/(\d+)(?:-(\d+))?', m.group(4) or ''): spans.append((int(extra[0]), int(extra[1] or extra[0])))
        for a, b in spans: refs.append((f, a, b, c['id']))
    for m in re.finditer(r'(\d+(?:-\d+)?)(?=[,)\s]|$)', c['source'].split('(')[0]):
        pass
hits = json.loads((src / 'hits.json').read_text())
inv = []
for h in hits:
    ids = sorted({i for f, a, b, i in refs if f == h['file'] and a - 1 <= h['line'] <= b + 1})
    inv.append({'file': h['file'], 'line': h['line'], 'function': h.get('fn'), 'text': h['text'], 'claimWords': h['words'], 'numericPattern': h['numeric'],
                'reviewStatus': ('MAPPED: ' + ', '.join(ids)) if ids else 'NOT_REVIEWED (evidence not mapped)'})
(out / 'source-candidates.json').write_text(json.dumps({'kind': 'HISTORY03_SOURCE_CLAIM_CANDIDATES_V1', 'productionSource': MAIN,
    'method': 'tools/extract-claims.py over the 88 production sender files and their local imports (workflows with TG_TOKEN); string literals with claim words or numeric performance phrases',
    'counts': {'candidates': len(inv), 'mapped': sum(1 for x in inv if x['reviewStatus'].startswith('MAPPED')), 'notReviewed': sum(1 for x in inv if not x['reviewStatus'].startswith('MAPPED'))},
    'candidates': inv}, indent=0, ensure_ascii=False) + '\n')
esc = lambda s: (s or '').replace('|', '\\|').replace('\n', ' ')
L = ['# HISTORY-03 user-facing claim catalogue', '', f'Production source: main `{MAIN}`. Wording is from offline renders of the production code on the committed repository data (1 Nov 2026), or from the source template where values vary. Owner-specific values are replaced by `<placeholders>`.', '',
     'Status vocabulary and the field definitions are in `claims-catalogue.json`. No claim was recomputed from raw market data; "NOT RECOMPUTED" means traced to the named artifact only. A field reading **MISSING** means the evidence for it is not recorded anywhere this pass could find.', '']
groups = [('ACTIONS (nightly; also today / records / what to buy today)', 'A'), ('SCORECARD, SCOREBOARD and SHADOW', 'S'), ('Owner-facing replies (ways, basket, longterm, help, leaders, autolab, details, day trades, stops, sources, lessons, league, quality)', 'W'), ('Other production senders (session alerts, news, radar, octopus, movers)', 'X')]
for title, p in groups:
    L += ['## ' + title, '']
    for c in sorted([c for c in C if c['id'].startswith(p)], key=lambda c: c['id']):
        L += [f"### {c['id']}: {c['surface']} | **{c['status']}**" + (f" | rank {c['rank']} ({c['severity']})" if c.get('rank') else ''), '',
              '> ' + esc(c['wording']), '',
              '| Field | Value |', '|---|---|']
        for k, lab in [('source','Source'),('evidence','Evidence artifact'),('population','Population'),('period','Selection period'),('rule','Rule version'),('costs','Costs'),('hold','Holding basis'),('coverage','Coverage'),('reproduced','Reproduction'),('development','Development branch')]:
            L.append(f'| {lab} | {esc(c.get(k))} |')
        L += ['', '**Assessment:** ' + c['finding']] + (['', '**Proposed wording:** ' + c['correction']] if c.get('correction') else []) + ['']
(out / 'CLAIMS-CATALOGUE.md').write_text('\n'.join(L) + '\n')
R = ['# HISTORY-03: unsupported or misleading claims, ranked', '', f'Production source: main `{MAIN}`. Ranked by harm to the owner\'s decisions: wrong instructions about money first, then claims that call unproven results proven or working, then mixed or incomplete figures, then labels. Proposed wording is plain English for the owner; it changes no rule, gate, frozen result or record. Codex owns the runtime edits.', '',
     '| # | Severity | ID | Where | Problem | Proposed plain-English wording |', '|---:|---|---|---|---|---|']
for i, sev in RANK:
    c = byid[i]; R.append(f"| {c['rank']} | {sev} | {i} | {esc(c['surface'])} (`{esc(c['source'].split(' (')[0])}`) | {esc(c['finding'])} | {esc(c.get('correction') or '(no change; add the missing field)')} |")
R += ['', 'Claims judged acceptable as written (kept in the catalogue for completeness): A07, A11, A13, S01, S04, S05, S06, W10, W14, X05, X06.', '']
(out / 'RANKED-FINDINGS.md').write_text('\n'.join(R) + '\n')
print(json.dumps({'claims': len(C), 'ranked': len(RANK), 'candidates': len(inv), 'mapped': sum(1 for x in inv if x['reviewStatus'].startswith('MAPPED'))}))
