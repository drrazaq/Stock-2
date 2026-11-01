# HISTORY-03 audit builder, all batches (reviewer: Claude). Documentation only. Generalizes build-batch2.py: loads every
# tools/catalogue_data_b<N>.py (N >= 2); each module may add SCOPE (files read one by one), NOT_A_CLAIM_TEXT, ANCHOR, POLICY, RANK.
# Writes versioned outputs (BATCH<N>-FINDINGS.md for N >= 3, all-claims.json, source-inventory-v3.json, RANKED-FINDINGS-v3.md,
# COVERAGE.md); batch-1 and batch-2 published files are not rewritten.
# Inputs (in <docs dir>): claims-catalogue.json (batch 1), source-candidates.json (batch-1 extractor output), tools/catalogue_data_b2.py.
# Outputs (in <docs dir>): batch2-claims.json, BATCH2-FINDINGS.md, EVIDENCE-VOCABULARY.md, source-inventory-v2.json, COVERAGE.md,
# RANKED-FINDINGS-v2.md. The batch-1 files are left unchanged (their "MAPPED" status used a +-1-line proximity rule; v2 replaces it).
# Usage: python3 -I build-batch2.py <docs/history-03 dir> <broad hits JSON from tools/extract-claims-broad.py> <repo root>
import json, sys, pathlib, importlib.util, collections
D, BROAD, REPO = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
import re as _re
MODS = []
for f in sorted((D / 'tools').glob('catalogue_data_b*.py'), key=lambda p: int(_re.search(r'_b(\d+)', p.name).group(1))):
    n = int(_re.search(r'_b(\d+)', f.name).group(1)); sp = importlib.util.spec_from_file_location('b%d' % n, f); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); m.N = n; MODS.append(m)
b2 = MODS[0]
class _All: pass
ALLB = [c for m in MODS for c in m.B]; ALLPOLICY = [p for m in MODS for p in getattr(m, 'POLICY', [])]
cat1 = json.loads((D / 'claims-catalogue.json').read_text())['claims']
inv = json.loads((D / 'source-candidates.json').read_text())['candidates']
for x in inv: x['extractor'] = 'narrow'
NARROW = len(inv)
_k = {(x['file'], x['line'], x['text']) for x in inv}
for x in json.loads(BROAD.read_text()):
    if (x['file'], x['line'], x['text']) not in _k: inv.append({**x, 'function': x.get('fn'), 'extractor': 'broad-only'})
MAIN = 'f6a9b1668d0591cf24a734034949b96b241fe35b'
# ---- 1. Deterministic anchors: a candidate belongs to a catalogued claim when it contains the claim's anchor phrase (same file),
#         or (fragments of 15+ chars) the anchor phrase contains it.
ANCHOR = {  # batch 1
 'A01': ('scan.mjs', ['works in rising markets']), 'A02': ('scan.mjs', ['PROVISIONALLY PROMISING', 'provisionally promising']), 'A03': ('scan.mjs', ['tested 73% / 75% of trades won']),
 'A04': ('scan.mjs', ['focus off  shows them as buys']), 'A05': ('scan.mjs', ['strict gate: needs 30+ unseen']), 'A06': ('scan.mjs', ['no winning record in falling markets']),
 'A07': ('scan.mjs', ['EARLY WAVE (intraday, paper)']), 'A08': ('scan.mjs', ['Put that money in Basket 2']), 'A09': ('scan.mjs', ['per 1,000 USD traded after costs']),
 'A10': ('scan.mjs', ['POSITIVE SO FAR: ']), 'A11': ('scan.mjs', ['unproven engines: NOT buys for you']), 'A12': ('scan.mjs', ['Tested this week: ']), 'A13': ('scan.mjs', ['COMEBACK (forward paper records']),
 'S01': ('scan.mjs', ['SCORECARD (future days only']), 'S02': ('scan.mjs', ['(finished trades: ']), 'S03': ('scan.mjs', ['POSITIVE so far (one market period only']), 'S04': ('scan.mjs', ['LOSING: do not act on these']),
 'S05': ('scan.mjs', ['YOUR REAL trades on system picks']), 'S06': ('scan.mjs', ['Last 90 days: ']), 'S07': ('scan.mjs', ['Tested-rule buys (swing and quick)']),
 'W01': ('scan.mjs', ['65% of ~1,000 USD', 'rules that made money in both test halves']), 'W02': ('scan.mjs', ['Tested 2022-01 to 23 Oct 2026', 'With 30% gold']), 'W03': ('scan.mjs', ['beat every long-term stock-picking method']),
 'W04': ('scan.mjs', ['real fills on every proven buy', 'every proven buy is listed']), 'W05': ('scan.mjs', ['passed five years of tests']), 'W06': ('scan.mjs', [' versions every night; ', 'Past test, ']),
 'W07': ('scan.mjs', ['Only PROVEN LIVE rules']), 'W08': ('scan.mjs', ['No setup has proof']), 'W09': ('scan.mjs', ['Only rules that PASSED']), 'W10': ('scan.mjs', ['FAST MOVERS AND DAY TRADES (five years']),
 'W11': ('scan.mjs', ['from the 5-year stop study']), 'W12': ('scan.mjs', ['under 10 tips or under a month', 'with the tested stop added']), 'W13': ('scan.mjs', ['the test expected about half']),
 'W14': ('scan.mjs', ['luck bar for everyone']), 'W15': ('scan.mjs', ['QUALITY COMPANIES']), 'W16': ('scan.mjs', ['tier 2 TRADABLE SMALL']),
 'X01': ('intraday-radar.mjs', ['PROVEN: its alerts say BUY', 'this kind of setup is PROVEN on paper', 'has earned it on paper']), 'X02': ('news-watch.mjs', ['Tested buys in ACTIONS', 'buy only tested buys', 'tested buys made']),
 'X03': ('radar-v3-core.mjs', ['Tested buys for the next session']), 'X04': ('octopus.mjs', ['Both gates passed']), 'X05': ('movers.mjs', ['This subset was profitable in this period']),
 'X06': ('ignition-watch.mjs', ['EARLY WAVE ALERT [PAPER, NOT PROVEN]', '(paper only: the rule has not passed its history test)']), 'X07': ('ignition-watch.mjs', ['separate from the tested swing buys']),
 # batch 2
 'B01': ('radar-v3-core.mjs', [' tested alert', '. Approved: ', 'C. APPROVED SIGNALS today: ']), 'B02': ('ignition-watch.mjs', ['Ride it only with the minimum']), 'B03': ('hunting-lab.mjs', ['stocks passed on their own older-half record', 'A STOCK\u2019S OWN RECORD HELPS']),
 'B04': ('scan.mjs', ['DAY OF THE WEEK: does the buy day matter', 'unseen trades bought after days like this']), 'B05': ('scan.mjs', ['no proven buy rule fired', ' proven buy']),
 'B06': ('horizons.mjs', ['5 years, whole market', '5 years, whole market, ']), 'B07': ('rebuy.mjs', ['came back to the buy-back price']), 'B08': ('scan.mjs', ['buy day = 30 sessions before']), 'B09': ('radar-v3-core.mjs', ['Missing: ', 'its 5-year history test (']),
 'B10': ('radar-v3-core.mjs', ['Chasing: stocks already up 20%+']), 'B11': ('early-alerts.mjs', ['Trigger EW-ALERT-1 is UNPROVEN']), 'B13': ('stops.mjs', ['New buys you record get the recommended stop', 'RECOMMENDED', ' versions. Research only. New buys you record']),
 'B14': ('ignition-watch.mjs', ['(tested AVOID)']), 'B12': ('radar-v3-core.mjs', ['Tested buys for the next session']),
}
EXTRA_FILES = {'B06': ['stops.mjs', 'exits.mjs']}
for m in MODS[1:]: ANCHOR.update(getattr(m, 'ANCHOR', {}))
def matches(x, f, phrases):
    if x['file'] != f: return False
    t = x['text']
    return any(p in t or (len(t.strip()) >= 15 and t.strip() in p) for p in phrases)
claim_of = collections.defaultdict(set)
for cid, (f, ph) in ANCHOR.items():
    for i, x in enumerate(inv):
        if matches(x, f, ph) or any(matches(x, g, ph) for g in EXTRA_FILES.get(cid, [])): claim_of[i].add(cid)
# Long literals are stored truncated (600 chars) by the extractor: a phrase found on the source line where an extracted literal starts,
# with that literal truncated, belongs to it.
TRUNC = {}
for cid, (f, ph) in ANCHOR.items():
    if any(cid in v for v in claim_of.values()): continue
    for g in [f] + EXTRA_FILES.get(cid, []):
        if not (REPO / g).exists(): continue
        lines = (REPO / g).read_text(errors='replace').split('\n')
        for ln, l in enumerate(lines, 1):
            if any(p in l for p in ph):
                for i, x in enumerate(inv):
                    if x['file'] == g and x['line'] == ln and len(x['text']) >= 600: claim_of[i].add(cid); TRUNC[cid] = True
# ---- 2. Batch-2 scope triage (all candidates in these files were read one by one).
B2FILES = ['leaders-study.mjs','winners-study.mjs','hunting-lab.mjs','score-study.mjs','earnings-study.mjs','events-study.mjs','horizons.mjs','exits.mjs','rebuy.mjs','rebalance.mjs',
           'quality.mjs','stops.mjs','autolab.mjs','octopus.mjs','fastmover-lab.mjs','radar-v3-core.mjs','opportunity-radar.mjs','early-alerts.mjs','ignition-watch.mjs']
for m in MODS[1:]: B2FILES += [f for f in getattr(m, 'SCOPE', []) if f not in B2FILES]
NOT_A_CLAIM_TEXT = {'share count up 20%+ in a year (dilution)', 'FDA approved a new drug (openFDA)', 'FDA approved a new use for a drug (openFDA)', 'under a year of history', 'no price cache yet (the fair test builds it)', 'Fewer messages: alerts approved  or  alerts off.'}
NOT_A_CLAIM_IDX = set(list(range(10, 19)) + [86, 96, 102, 116, 117, 118, 119, 136, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 198, 208, 268, 269, 298, 299, 300, 301, 303, 320, 321, 322, 879, 900, 901, 902])
for m in MODS[1:]: NOT_A_CLAIM_TEXT |= set(getattr(m, 'NOT_A_CLAIM_TEXT', set()))
NOT_A_CLAIM_AT = {tuple(a) for m in MODS[1:] for a in getattr(m, 'NOT_A_CLAIM_AT', [])}
rows, counts = [], collections.Counter()
for i, x in enumerate(inv):
    ids = sorted(claim_of.get(i, []))
    if ids: c = 'CATALOGUED_CLAIM'
    elif x['file'] in B2FILES: c = 'NOT_A_CLAIM' if ((i < NARROW and i in NOT_A_CLAIM_IDX) or x['text'] in NOT_A_CLAIM_TEXT or (x['file'], x['line']) in NOT_A_CLAIM_AT) else 'REVIEWED_ACCEPTABLE'
    else: c = 'NOT_REVIEWED'
    counts[(x['extractor'], c)] += 1
    rows.append({'n': i, 'extractor': x['extractor'], 'file': x['file'], 'line': x['line'], 'function': x.get('function'), 'text': x['text'], 'category': c, 'claims': ids})
ids_all = [c['id'] for c in cat1] + [c['id'] for c in ALLB]
def presence(cid):
    f, ph = ANCHOR[cid]; files = [f] + EXTRA_FILES.get(cid, [])
    anchored_n = any(cid in claim_of.get(i, ()) for i in range(NARROW)); anchored_b = any(cid in claim_of.get(i, ()) for i in range(NARROW, len(inv)))
    if TRUNC.get(cid): return 'ANCHORED (inside a long string; stored text truncated at 600 characters)'
    if anchored_n: return 'ANCHORED (narrow extractor)'
    if anchored_b: return 'ANCHORED (broad extractor only: missed by the batch-1 word list)'
    src = ''.join((REPO / g).read_text(errors='replace') for g in files if (REPO / g).exists())
    if any(p in src for p in ph): return 'IN SOURCE, NOT EXTRACTED (string has no listed claim word)'
    return 'ASSEMBLED AT RUNTIME (phrase not a literal in source; reviewed from rendered text)'
PRES = {cid: (presence(cid) if cid in ANCHOR else 'REVIEWED SURFACE (whole rendered or read message, no single anchor)') for cid in ids_all}
anchored = collections.Counter(cid for r in rows for cid in r['claims'])
no_anchor = [cid for cid in ids_all if not anchored[cid] and cid in ANCHOR]
DESC = {'CATALOGUED_CLAIM': 'contains (or is a 15+ character fragment of) the anchor phrase of a catalogued claim in the same file',
        'REVIEWED_ACCEPTABLE': 'in a batch-2 file, read individually; claim-bearing text or a template fragment whose rendered message was reviewed and is acceptable (verdict words preserved)',
        'NOT_A_CLAIM': 'in a batch-2 file, read individually; a rule definition, condition label or error text, not a performance or evidence claim',
        'NOT_REVIEWED': 'outside both batches\' file-level review (most are in scan.mjs); some of these were seen as rendered lines in batch 1 but were not classified one by one'}
(D / 'source-inventory-v3.json').write_text(json.dumps({'kind': 'HISTORY03_SOURCE_INVENTORY_V3', 'productionSource': MAIN, 'replaces': 'source-inventory-v2.json (batch 2); v2 replaced the batch-1 proximity rule',
    'categories': DESC, 'counts': {e + ' / ' + c: n for (e, c), n in sorted(counts.items())}, 'total': len(rows), 'narrowTotal': NARROW, 'claimPresence': PRES, 'claimsWithAnchoredStrings': {k: anchored[k] for k in ids_all if anchored[k]}, 'claimsWithoutAnchoredString': no_anchor, 'rows': rows}, indent=0, ensure_ascii=False) + '\n')
# ---- 3. Batch-2 claims JSON + findings Markdown
FIELDS = ['id','surface','defect','status','wording','rendered','source','evidence','population','period','rule','costs','hold','coverage','supports','unsupported','correction','fix','policyQuestion']
(D / 'all-claims.json').write_text(json.dumps({'kind': 'HISTORY03_ALL_BATCH_CLAIMS_V1', 'productionSource': MAIN, 'batch1': 'claims-catalogue.json (43 records)',
    'batches': {('batch%d' % m.N): [{k: c.get(k) for k in FIELDS} for c in m.B] for m in MODS}, 'policyQuestions': ALLPOLICY}, indent=1, ensure_ascii=False) + '\n')
esc = lambda s: (s or '').replace('|', '\\|').replace('\n', ' ')
for m in MODS:
    if m.N < 3: continue
    L = ['# HISTORY-03 ' + m.TITLE, '', f'Production source: main `{MAIN}`. Same method, fields and defect types as batch 2 (`BATCH2-FINDINGS.md`). Nothing was sent and no provider was called; raw renders stay local.', '']
    for c in m.B:
        L += [f"## {c['id']}: {c['surface']} | {c['defect']} | **{c['status']}**", '', '> ' + esc(c['wording']), '', '| Field | Value |', '|---|---|']
        for k, lab in [('rendered','Rendered'),('source','Source'),('evidence','Evidence artifact'),('population','Population'),('period','Selection period'),('rule','Rule version'),('costs','Costs'),('hold','Holding basis'),('coverage','Coverage')]:
            L.append(f'| {lab} | {esc(c.get(k))} |')
        L += ['', '**What the recorded evidence supports:** ' + c['supports'], '', '**Unsupported wording or missing provenance:** ' + c['unsupported']]
        if c.get('correction'): L += ['', '**Proposed wording:** ' + c['correction']]
        if c.get('fix'): L += ['', '**Who / what:** ' + c['fix']]
        if c.get('policyQuestion'): L += ['', '**Owner policy question:** ' + c['policyQuestion']]
        L.append('')
    if getattr(m, 'POLICY', []):
        L += ['## New owner policy questions (not decided here)', ''] + [f"- **{p['id']}:** {p['question']} Where: {p['where']}. {p['note']}" for p in m.POLICY]
    (D / ('BATCH%d-FINDINGS.md' % m.N)).write_text('\n'.join(L) + '\n')

# ---- 4. Combined ranking v2
r1 = {c['id']: c for c in cat1}
RANK = [('B01','HIGH (gate/decision)','GATE_OR_DECISION'),('W01','HIGH','WORDING_ONLY (stale plan)'),('A01','HIGH','WORDING_ONLY'),('W03','HIGH','WORDING_ONLY'),('W04','HIGH','WORDING_ONLY'),
        ('B03','HIGH (unvalidated gate)','GATE_OR_DECISION'),('X01','HIGH (latent; P1)','GATE_OR_DECISION'),('B02','HIGH (P1)','GATE_OR_DECISION'),('W07','HIGH','WORDING_ONLY'),
        ('B04','MEDIUM-HIGH','WORDING_ONLY'),('W08','MEDIUM-HIGH','WORDING_ONLY (vocabulary)'),('A04','MEDIUM-HIGH','WORDING_ONLY (vocabulary)'),('B05','MEDIUM','WORDING_ONLY (vocabulary)'),
        ('A05','MEDIUM','WORDING_ONLY'),('S07','MEDIUM','WORDING_ONLY'),('B13','MEDIUM','GATE_OR_DECISION (confirm default)'),('W02','MEDIUM','WORDING_ONLY'),('A02','MEDIUM','WORDING_ONLY'),('W06','MEDIUM','WORDING_ONLY'),
        ('S02','MEDIUM','WORDING_ONLY'),('W09','MEDIUM','WORDING_ONLY'),('A03','MEDIUM','WORDING_ONLY'),('W05','MEDIUM','WORDING_ONLY'),('B09','MEDIUM-LOW','WORDING_ONLY'),('B08','MEDIUM-LOW','WORDING_ONLY'),
        ('X02','MEDIUM-LOW','WORDING_ONLY'),('X03/B12','MEDIUM-LOW','WORDING_ONLY'),('X07','MEDIUM-LOW','WORDING_ONLY'),('B06','LOW-MEDIUM','WORDING_ONLY'),('W16','LOW-MEDIUM','WORDING_ONLY'),
        ('B07','LOW','WORDING_ONLY'),('S03','LOW','WORDING_ONLY'),('W11','LOW','WORDING_ONLY'),('W12','LOW','WORDING_ONLY'),('A09','LOW','WORDING_ONLY'),('X04','LOW (latent; P1)','GATE_OR_DECISION'),
        ('B10','LOW','PROVENANCE_ONLY'),('B11','LOW','PROVENANCE_ONLY'),('B14','LOW','PROVENANCE_ONLY'),('W13','LOW','PROVENANCE_ONLY'),('A08','LOW','WORDING_ONLY'),('W15','LOW','WORDING_ONLY'),
        ('A12','LOW','WORDING_ONLY'),('A06','LOW','PROVENANCE_ONLY'),('A10','LOW','WORDING_ONLY')]
b2d = {c['id']: c for c in ALLB}
_W = [(float(n), i, sev, typ) for n, (i, sev, typ) in enumerate(RANK)] + [(w, i, sev, typ) for m in MODS[1:] for (i, sev, typ, w) in getattr(m, 'RANK', [])]
RANK = [(i, sev, typ) for w, i, sev, typ in sorted(_W, key=lambda x: x[0])]
def get(i):
    k = i.split('/')[0]; c = r1.get(k) or b2d.get(k)
    return c, (c.get('finding') or c.get('unsupported')), c.get('correction')
R = ['# HISTORY-03: ranked corrections (all batches to date)', '', f'Production source: main `{MAIN}`.', '',
     '**Order:** a gate or decision affected first; then wrong money instructions; then unproven results called proven or working; then mixed or incomplete figures; then labels and provenance.',
     '',
     '**Defect type** separates real decision/gate problems from wording-only problems. Questions about whether paper results may trigger trades are owner policy (P1, P2), not decided here.', '',
     '| # | Severity | ID | Defect type | Where | Problem | Proposed wording / action |', '|---:|---|---|---|---|---|---|']
for n, (i, sev, typ) in enumerate(RANK, 1):
    c, prob, corr = get(i)
    R.append(f"| {n} | {sev} | {i} | {typ} | {esc(c['surface'])} | {esc(prob)} | {esc(corr or c.get('fix') or '(add the missing field)')} |")
R += ['', 'Owner policy questions: **P1** (may a paper record alone trigger a trade suggestion or BUY wording?) and **P2** (may the unvalidated per-stock past-trade check admit engine BUYs when focus is off?). Details in `BATCH2-FINDINGS.md` and later batch files.', '',
      'Acceptable as written (kept for coverage): A07, A11, A13, S01, S04, S05, S06, W10, W14, X05, X06, B20-B34, and every later record with defect NONE.']
(D / 'RANKED-FINDINGS-v3.md').write_text('\n'.join(R) + '\n')
# ---- 5. Coverage and reconciliation
gate = [i for i, s, t in RANK if t.startswith('GATE')]
Cv = ['# HISTORY-03 coverage and count reconciliation', '', f'Production source: main `{MAIN}`; extractor and file list unchanged from batch 1 (88 production files, 914 candidate strings).', '',
      '## What the batch-1 "77 mapped" meant (corrected)', '',
      'In batch 1, `source-candidates.json` marked a string **MAPPED** if it lay within one line of a source-line reference in one of the 43 catalogued claims. So:',
      '- **77 strings matched 31 of the 43 claims.** 15 strings counted against more than one claim: S01, S04 and S05 share the same scorecard line range.',
      '- **12 claims matched no string:** X01, S07, W06, S02, A09, W13, A08, W15, A10, A07, S06, W10. Their source field named a function or a line where the text is assembled at runtime.',
      '- **Neighbouring non-claim strings were swept in** by the proximity rule.',
      '',
      '"914 - 837 = 77" was therefore **77 source strings touched by catalogued claims**, not 77 reviewed claims. The 43 traced claims were the unit of review.', '',
      '## Inventory v2 (`source-inventory-v2.json`), replacing the proximity rule', '',
      'The universe now has two parts:',
      f'- the **{NARROW} batch-1 strings** (narrow word list);',
      f'- **{len(rows) - NARROW} more strings** found by a broader word list (`tools/extract-claims-broad.py`, which adds test, tests, proof, approved, losing, promising, record, better, worse, a year, per year).',
      '',
      'The batch-1 word list missed claim strings such as the `ways` text ("made money in both test halves") and "LOSING: do not act on these".', '',
      '| Category | Batch-1 strings | Broad-only strings | Total | Meaning |', '|---|---:|---:|---:|---|'] + [f"| {k} | {counts.get(('narrow', k), 0)} | {counts.get(('broad-only', k), 0)} | {counts.get(('narrow', k), 0) + counts.get(('broad-only', k), 0)} | {DESC[k]} |" for k in ['CATALOGUED_CLAIM', 'REVIEWED_ACCEPTABLE', 'NOT_A_CLAIM', 'NOT_REVIEWED']] + [f'| **Total** | **{NARROW}** | **{len(rows) - NARROW}** | **{len(rows)}** | |', '',
      'Reconciliation of the batch-1 numbers: of the 914 batch-1 strings, ' + str(counts.get(('narrow', 'CATALOGUED_CLAIM'), 0)) + ' now anchor a catalogued claim (exact phrase, not proximity), ' + str(counts.get(('narrow', 'REVIEWED_ACCEPTABLE'), 0) + counts.get(('narrow', 'NOT_A_CLAIM'), 0)) + ' were read one by one in batch 2 and found acceptable or not a claim, and ' + str(counts.get(('narrow', 'NOT_REVIEWED'), 0)) + ' remain unreviewed (batch 1 said 837 under the proximity rule).', '',
      '## How each catalogued claim relates to the source strings', '',
      '| Claim | Presence |', '|---|---|'] + [f'| {cid} | {PRES[cid]} |' for cid in ids_all] + ['',
      '## Claims', '',
      f'- **Batch 1:** 43 claims (`claims-catalogue.json`).',
      f'- **Batches 2+:** {len(ALLB)} records (`batch2-claims.json`): {sum(1 for c in ALLB if c["defect"] != "NONE")} findings and {sum(1 for c in ALLB if c["defect"] == "NONE")} reviewed-acceptable surfaces.',
      f'- **Total:** {43 + len(ALLB)} records.',
      f'- **Claims not anchored to an extracted string:** {sum(1 for v in PRES.values() if v.startswith("IN SOURCE") or v.startswith("ASSEMBLED"))} (see the presence table). They were reviewed from rendered output.',
      f'- **Gate or decision defects among the ranked corrections:** {", ".join(gate)}.', '',
      '## Rendered surfaces in batch 2', '',
      '- **Sunday senders** of the `leaders-study` workflow, run offline on a synthetic cache: 11 of 15 produced their message, 12 messages in all.',
      '  - `quality` and `autolab` crashed on the synthetic input (no fundamentals cache; synthetic rows). Their owner-facing text was reviewed via the `quality` and `autolab` replies on committed data.',
      '  - `rebalance` and `fastmover-lab` sent nothing on the synthetic input. Their text was reviewed via the batch-1 `rebalance` and `day trades` replies.',
      '- **Bot research replies on committed data:** `lab`, `winners`, `exits`, `research`, `events`, `missed`, `catalysts`, `chains`, `days`, `market today`, `rebuy`, plus the batch-1 set.',
      '- **Opportunity radar:** midday panels (3 fixtures) and close (1 fixture), all through the actual builders; the actual `opportunity-radar.mjs close` runner on committed data (its 2 Alpaca requests were refused, so it failed closed).',
      '- **Early watch:** RESEARCH LEADS, PAPER SETUP and the DELIVERY SCORECARD (fixtures through the actual builders).',
      '',
      *[l for m in MODS[1:] for l in (['## ' + m.TITLE + ': coverage', ''] + getattr(m, 'COVERAGE_NOTES', []) + [''] if getattr(m, 'COVERAGE_NOTES', None) else [])],
      '## Still not covered', '',
      f'- **{counts.get(("narrow", "NOT_REVIEWED"), 0) + counts.get(("broad-only", "NOT_REVIEWED"), 0)} source strings** outside both file-level reviews (mostly `scan.mjs`, plus discover, deals, movers, news-watch, premarket-check, smart-money, tipranks, intraday-radar and others).',
      '- **Live-only texts:** the `ignition-watch.mjs` alert bodies, which were read from source, not rendered, and the intraday-radar cards.',
      '- **Owner-input replies:** `check SYM`, the sell/hold review, the opinion replies, and the LEADER DIP buy confirmation.',
      '- **No independent recomputation** of any number from raw prices (see the README).']
(D / 'COVERAGE.md').write_text('\n'.join(Cv) + '\n')
print(json.dumps({'counts': {e + '/' + c: n for (e, c), n in counts.items()}, 'total': len(rows), 'records': 43 + len(ALLB), 'noAnchor': no_anchor, 'gateDefects': gate}))
