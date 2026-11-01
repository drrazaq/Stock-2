# HISTORY-03 final package (reviewer: Claude). Documentation only. Builds, from the published catalogue files:
#   PROVENANCE-REGISTER.md (every MISSING field, static figure and stored-row gap), EVIDENCE-VOCABULARY-v2.md (consolidated),
#   CLOSURE-CHECKLIST.md (final counts, defect tallies, owner / Codex / external-evidence items, verification steps).
# Usage: python3 -I -B final_package.py <docs/history-03 dir> <consistency.json from tools/consistency-checks.py>
import json, sys, pathlib, collections, re, importlib.util
D, CJ = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
MAIN = 'f6a9b1668d0591cf24a734034949b96b241fe35b'
cat1 = json.loads((D / 'claims-catalogue.json').read_text())['claims']
allc = json.loads((D / 'all-claims.json').read_text()); later = [c for b in allc['batches'].values() for c in b]
inv = json.loads((D / 'source-inventory-v3.json').read_text()); cons = json.loads(CJ.read_text())
esc = lambda s: (s or '').replace('|', '\\|').replace('\n', ' ')
FIELDS = ['evidence', 'population', 'period', 'rule', 'costs', 'hold', 'coverage']
# ---------------- provenance register
rows = []
for c in cat1 + later:
    miss = [f for f in FIELDS if 'MISSING' in str(c.get(f) or '')]
    static = c.get('defect') == 'PROVENANCE_ONLY' or 'EVIDENCE_NOT_MAPPED' in str(c.get('status')) or 'NOT RECORDED' in str(c.get('status')) or 'hard-coded' in str(c.get('evidence') or '') + str(c.get('unsupported') or '')
    if miss or static: rows.append((c['id'], c.get('surface'), ', '.join(miss) or '-', c.get('evidence')))
P = ['# HISTORY-03 provenance register', '', f'Production source: main `{MAIN}`. One row per catalogued claim whose evidence is incomplete. A field marked MISSING means no recorded artifact states it; a hard-coded figure is a number written into the code with no stored source.', '',
     '## Claims with missing provenance', '', '| Claim | Surface | Missing fields | Evidence as recorded |', '|---|---|---|---|'] + [f'| {i} | {esc(s)} | {m} | {esc(e)} |' for i, s, m, e in rows]
P += ['', '## Resolved during the audit', '', '- **B14 ("tested AVOID"):** traced by D09 to `data/autolab.json` tried["lotHi/h20"] (library M15). Discovery stage only: edge −3.2%, t −5.06, n 3,054; no validation stage.',
      '- **W11 / D12 (stop study):** the committed `data/stops.json` recommends PCT35 for any stock and NONE for strong stocks, matching the 35% wording. Only the "5 years" period is wrong (4.3 years).', '',
      '## Consistency checks against stored rows (`tools/consistency-checks.py`)', '',
      'These checks recompute headline numbers from rows the repository itself stores. They are not an independent reproduction from raw prices.', '',
      '| Claim | Result |', '|---|---|'] + [f'| {esc(k)} | {esc(v.get("agrees"))} |' for k, v in cons.items()]
P += ['', '## Artifact-level gap for the owner\'s lane', '',
      '**The owner\'s lane cannot be reproduced from stored rows.** `agent-a-tgt-lab.mjs:160` keeps only trades that did not end in a time exit (`max`) or a delisting (`gone`), and only the last 300.',
      '- **What is stored:** 212 rows for A-TGT-TGT20-PB12, all target exits.',
      '- **What the frozen summary covers:** 355 trades.',
      '- **Consequence:** the LEADER DIP win rate (73% / 75%), its losses and its worst trade (−55.6%) cannot be reproduced from the repository. They need a re-run on the price cache, or a change that stores every trade. The change is a proposal for Codex; frozen results stay untouched.']
(D / 'PROVENANCE-REGISTER.md').write_text('\n'.join(P) + '\n')
# ---------------- vocabulary v2
sp = importlib.util.spec_from_file_location('b2', D / 'tools/catalogue_data_b2.py'); b2 = importlib.util.module_from_spec(sp); sp.loader.exec_module(b2)
V = list(b2.VOCAB) + [
 ('BELOW THE LEAGUE BAR', 'Passed the other gates but not the luck bar. It is a form of NOT PROVEN and must be called that in owner text.', '"tested on 5 years", "passed on 5 years of history" for such results (D01)'),
 ('SELL-WARNING', 'A frozen warning verdict: the flagged stocks underperformed beyond the pre-registered bar in both halves (for example SQ29-F4 and SQ29-F6). The only kind of evidence that may be called "tested" without a qualifier, and only with its numbers.', '"lagged ... in 5 years of tests" (keep, with the period)'),
 ('RISK RULE IN USE', 'A risk control adopted by choice (stops, trim, the AVOID list). It is not a profit test.', '"proven: stops, trim, switch, avoid rules"; "the tested stop"'),
 ('DISCOVERY-STAGE RESULT', 'Seen in the first (discovery) stage of autolab only; not validated.', '"tested 19 Oct" for M15'),
 ('STUDY SPAN', 'Always state the actual years covered (from the data), never a fixed "5 years".', 'hard-coded "5 years" (B06, D12, W11)')]
VV = ['# One evidence vocabulary (v2, consolidated)', '', 'Supersedes `EVIDENCE-VOCABULARY.md` (batch 2) by adding five terms found in batches 3-5.',
      '- **Every number carries its basis:** trades, days, period and cost.',
      '- **No upward re-wording:** NOT PROVEN and REJECTED stay as recorded.',
      '- **Owner policy is separate:** whether a paper record may produce BUY wording (P1), or a below-bar result a sell suggestion (P3), is the owner\'s decision, not vocabulary.', '',
      '| Term | Meaning | Replaces (current wording) |', '|---|---|---|'] + [f'| **{t}** | {esc(m)} | {esc(r)} |' for t, m, r in V]
(D / 'EVIDENCE-VOCABULARY-v2.md').write_text('\n'.join(VV) + '\n')
# ---------------- closure checklist
ranked = re.findall(r'^\| (\d+) \| ([^|]+) \| ([A-Z0-9/]+) \| ([^|]+) \|', (D / 'RANKED-FINDINGS-v3.md').read_text(), re.M)
typ = collections.Counter(t.strip().split(' ')[0] for _, _, _, t in ranked)
gate_ids = [i for _, _, i, t in ranked if t.strip().startswith('GATE')]
c = inv['counts']; g = lambda k: c.get('narrow / ' + k, 0) + c.get('broad-only / ' + k, 0)
pol = {p['id']: p for p in b2.POLICY + [p for p in allc['policyQuestions'] if p['id'] not in ('P1', 'P2')]}
C = ['# HISTORY-03 closure checklist', '', f'Production source: main `{MAIN}`. Branch `claude/history-03-claims` (documentation only).', '',
     '## The acceptance criterion', '',
     '> Catalogue each user-facing numerical/tested/proven/unseen claim, exact source/selection window, cost/hold basis and coverage. Authenticate/reproduce with separate audited evidence where possible; qualify unsupported claims without rewriting frozen results.', '',
     '## Status by part', '',
     '| Part | Status | Evidence |', '|---|---|---|',
     f'| Catalogue every extracted user-facing claim string | DONE (documentation) | {inv["total"]} strings: {g("CATALOGUED_CLAIM")} part of catalogued claims, {g("REVIEWED_ACCEPTABLE")} reviewed acceptable, {g("NOT_A_CLAIM")} not a claim, {g("NOT_REVIEWED")} not reviewed (`COVERAGE.md`, `source-inventory-v3.json`) |',
     f'| Exact source, selection window, cost/hold basis, coverage per claim | DONE, with gaps listed | {43 + len(later)} records (`claims-catalogue.json`, `all-claims.json`); every MISSING field in `PROVENANCE-REGISTER.md` |',
     '| Qualify unsupported claims | PROPOSED, NOT APPLIED | Proposed wording per finding in `RANKED-FINDINGS-v3.md`; vocabulary in `EVIDENCE-VOCABULARY-v2.md`. Applying it is Codex\'s runtime work. |',
     '| Authenticate / reproduce with separate audited evidence | NOT DONE (external) | Traced to artifacts only; stored-row checks in `PROVENANCE-REGISTER.md`. No recomputation from raw prices. |',
     '| Frozen results preserved | YES | No frozen result, rule, gate, ledger or data file was changed; every proposal keeps NOT PROVEN / REJECTED as recorded |', '',
     '## Findings to date', '',
     f'**{len(ranked)} ranked corrections:** ' + ', '.join(f'{k} {v}' for k, v in sorted(typ.items())) + '.', '',
     f'**Gate or decision items:** {", ".join(gate_ids)}.', '',
     '## Remaining items, by owner', '',
     '### Owner (decisions, not engineering)', '']
for pid in ['P1', 'P2', 'P3', 'P4']:
    p = pol.get(pid)
    if p: C.append(f'- [ ] **{pid}:** {p["question"]}')
C += ['- [ ] Confirm the automatic stop default for new own-pick buys (B13 / D12; the current study choice is 35%).',
      '- [ ] Confirm the `ways` text describes the current plan (W01).', '',
      '### Codex (runtime; not edited here)', '',
      '- [ ] **Counting:** split the alert counter (approved vs early paper; sent vs recorded) and fix the radar wording (B01 / D15).',
      '- [ ] **After P3:** gate or re-word the TAKE PROFIT OPTION against the rebuy study verdict (D01).',
      '- [ ] **After P4:** align the tier-2 / AUTO-DISCOVERED BUY lines with the policy (D06).',
      '- [ ] **After P1:** align the early-paper alert body, intraday-radar graduation, octopus and deals wording (B02 / C01 / C04 / X01 / X04 / E03).',
      '- [ ] **Wording repairs** in `RANKED-FINDINGS-v3.md`, in ranked order (' + ', '.join(x for _, _, x, t in ranked if t.strip().startswith('WORDING')) + '), each with a test asserting the new wording.',
      '- [ ] **Provenance:** cite or drop the hard-coded figures (B10, B11, D03 "+1.8% / 176", D13, W13). Update library status C-FADE1 ("not yet wired", D07).',
      '- [ ] **Proposal:** store every trade (including `max` and `gone` exits) in `agent-a-tgt-lab.mjs` outputs, so the LEADER DIP numbers become reproducible from stored rows. This is a proposal only; frozen results stay.', '',
      '### External evidence (separately authorized run)', '',
      '- [ ] Reproduce, from the 5-year price cache, the numbers the owner acts on:',
      '  - LEADER DIP A-TGT-TGT20-PB12: win 72.7% / 74.6%, worst −55.6%, 3-slot replay per year;',
      '  - Basket 1 (SQ10-SH10): 16.7% vs 12.2% a year;',
      '  - the danger-filing SELL-WARNINGs (SQ29-F4, SQ29-F6);',
      '  - the EARNINGS DRIFT verdict;',
      '  - the rebuy STRETCH / SPIKE LOWER10 results;',
      '  - the insider-study halves.',
      '- [ ] Any claim that cannot be reproduced gets the NOT REPRODUCED qualifier instead of a number.', '',
      '### Verification after repairs (reviewer)', '',
      '- [ ] Re-render with `tools/render-messages.mjs`, `render-research.mjs`, `render-decisions.mjs`, `render-radar-alerts.mjs` and `render-sunday-labs.mjs` on the repaired commit.',
      '- [ ] Re-extract with both extractors and rebuild with `build-audit.py`.',
      '- [ ] Confirm that no ranked wording remains and no new unqualified claim was added (exact anchor search).',
      '- [ ] Run the repository test suite on the repaired commit.',
      '- [ ] Then update the HISTORY-03 row of the acceptance closure board. Owner: Codex, with this checklist as the evidence.', '',
      '## Closure decision', '',
      '**HISTORY-03 stays OPEN.** The documentation part (catalogue, provenance, ranked corrections, vocabulary) is complete for every extracted string. Closure still needs:',
      '- the owner\'s policy answers (P1-P4);',
      '- Codex\'s wording and gate repairs, with tests;',
      '- independent reproduction of the acted-on numbers, or explicit NOT REPRODUCED qualifiers.']
(D / 'CLOSURE-CHECKLIST.md').write_text('\n'.join(C) + '\n')
print(json.dumps({'provenanceRows': len(rows), 'ranked': len(ranked), 'types': typ, 'gate': gate_ids}, default=str))
