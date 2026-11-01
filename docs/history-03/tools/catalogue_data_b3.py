# HISTORY-03 batch 3 (reviewer: Claude): live alert bodies, intraday-radar cards and board, and the Sunday labs that did not render
# on the synthetic cache. Source lines refer to main f6a9b166. Same fields as batch 2.
TITLE = 'Batch 3: live alert bodies, intraday radar, unrendered Sunday labs'
SCOPE = ['intraday-radar.mjs', 'stop-watch.mjs']   # files whose extracted strings were read one by one in this batch (in addition to batch 2's)
NOT_A_CLAIM_TEXT = {'earnings beat or raised guidance', 'BEATING its sector by ', 'Beating its sector at entry', 'Not beating its sector'}
NOT_A_CLAIM_AT = [('intraday-radar.mjs', 62), ('intraday-radar.mjs', 67)]   # regex / code fragments picked up by the tokenizer
ANCHOR = {
 'C01': ('ignition-watch.mjs', ['BUY only up to ']),
 'C02': ('intraday-radar.mjs', ['the holding time that tested best']),
 'C03': ('intraday-radar.mjs', ['Expected: ']),
 'C04': ('intraday-radar.mjs', ['BUY, PROVEN ON PAPER (']),
}
B = []
def add(**k): B.append(k)
add(id='C01', surface='EARLY WAVE ALERT body (ignition-watch.mjs maybeAlert, early paper kind) - extends B02', defect='GATE_OR_DECISION', status='POLICY QUESTION P1 (stronger evidence than B02)',
    wording="EARLY WAVE ALERT [PAPER, NOT PROVEN] | only <n> paper trades on <d> day(s). Ride it only with the minimum 1,000 USD and the stop. / <SYM> <chg> at <time> ... / BUY only up to <price> (3% above now; higher = skip). STOP <stop>. EXIT: <exit> ... / Rule: <name>. Forward-tested only. Live paper: <n> trades, <avg> (<stress> at 1.5x costs). / Check ZAD first. 1,000 USD at most.",
    rendered='source read (live session only; same body for the approved and the early paper kind)', source='ignition-watch.mjs:169-174',
    evidence='early kind: live-only rule, 20+ paper trades, average > 0, positive at 1.5x costs (PREC); no history-test pass', population='live-only ignition rules', period='forward paper', rule='early paper alert path', costs='1.5x stress shown', hold='intraday, exit before 11 pm Kuwait', coverage='live watcher',
    supports='The header says PAPER, NOT PROVEN; the trade count and the 1.5x-cost figure are shown; "Forward-tested only" is accurate.',
    unsupported='The early paper alert uses the approved alert\'s body, including an explicit "BUY only up to <price>" line, a stop and an exit. A NOT PROVEN paper result therefore produces a full buy instruction. Whether that is allowed is owner policy P1.',
    correction="(if P1 = no) replace the BUY/STOP/EXIT lines of the early kind with: 'PAPER ONLY: logged and scored; not a buy.'  (if P1 = yes) keep, and state the owner's rule in the alert.",
    fix='Owner decides P1; Codex then aligns the body. Not edited here.', policyQuestion='P1')
add(id='C02', surface='intraday radar card "Sell:" line (only when a group has a selected hold)', defect='WORDING_ONLY', status='MISLEADING (overstated)',
    wording="Sell: at the close after <h> trading days (the holding time that tested best for this kind of setup; the stop still applies)", rendered='source read (no group has a selected hold today: data/radar-record.json hold = null for all 4 groups)',
    source='intraday-radar.mjs:161-168 (selection), :222 (text)', evidence='hold chosen on the older half of the group\'s PAPER trades (30+ needed) and kept only if it also beats the rule exit on the newer half and is positive; no luck bar',
    population='one paper group', period='forward paper', rule='hold selection', costs='paper costs', hold='1-5 day options', coverage='radar groups',
    supports='A split-half check is used.', unsupported='"tested best" reads as a full test; it is a split-half choice on 30+ paper trades without a luck bar.',
    correction="Sell: at the close after <h> trading days (best on the first half of this setup's paper trades and still better on the second half; not a full test).", fix='Codex wording.', policyQuestion=None)
add(id='C03', surface='intraday radar card "Expected:" line', defect='WORDING_ONLY', status='MISLEADING (record labelled as expectation)',
    wording="Expected: <group paper record, e.g. 266 finished, 40% won, average -0.6% after costs>", rendered='source read; group records from data/radar-record.json',
    source='intraday-radar.mjs:172 (recText), :223', evidence='data/radar-record.json group paper records (all four groups currently negative)', population='radar group', period='forward paper', rule='-', costs='after costs', hold='per group', coverage='~280 strong stocks live',
    supports='The figures are the group\'s real paper record.', unsupported='"Expected" presents a short, currently negative paper record as a forecast.', correction="Paper record of this setup so far: <record>.", fix='Codex wording.', policyQuestion=None)
add(id='C04', surface='intraday radar board "BUY, PROVEN ON PAPER" section and card sizing (latent)', defect='GATE_OR_DECISION', status='POLICY QUESTION P1 (latent; = batch-1 X01)',
    wording="BUY, PROVEN ON PAPER (<n>) / <SYM>: buy <lo> to <hi>, stop <stop>, sell <t1> or after 5 days  |  Size: shares = (the loss you accept minus your 6 USD broker fees) / <R>",
    rendered='source read (no group proven today)', source='intraday-radar.mjs:152 (graduation), :219-225, :302', evidence='graduation: n >= 30, days >= NEED_DAYS, avg > 0, PF > 1.2, best share < 50%, newer > 0 (paper only)',
    population='radar groups', period='forward paper', rule='graduation', costs='after costs', hold='per card', coverage='~280 strong stocks',
    supports='The bar is stated in the radar note.', unsupported='Paper graduation alone produces BUY wording and position sizing (P1).', correction='See X01.', fix='Owner P1; Codex aligns.', policyQuestion='P1')
add(id='C10', surface='STOP HIT / NEAR STOP alerts (stop-watch.mjs via the live watcher)', defect='NONE', status='SUPPORTED (no performance claim)', wording="STOP HIT NOW: <SYM> <px> is under your stop <stop>. SELL NOW at market ... / NEAR STOP: ...",
    rendered='source read', source='stop-watch.mjs:12-15', evidence='the owner\'s recorded stop', population='-', period='-', rule='owner stop', costs='-', hold='-', coverage='live watcher',
    supports='An instruction tied to the owner\'s own stop; no evidence claim.', unsupported='-', correction=None, fix=None, policyQuestion=None)
add(id='C11', surface='intraday radar PRE-WAVE WATCH and PAPER PLAN cards', defect='NONE', status='SUPPORTED_QUALIFIED', wording="STAGE: PRE-WAVE WATCH. Not a buy. ... | PAPER PLAN, NO BUY: this kind of setup is not proven yet (research levels, not an instruction) ... Size: none, paper only",
    rendered='source read', source='intraday-radar.mjs:216-225', evidence='-', population='-', period='-', rule='-', costs='-', hold='-', coverage='-', supports='Clear paper labelling.', unsupported='-', correction=None, fix=None, policyQuestion=None)
add(id='C12', surface='Sunday AUTOLAB and QUALITY messages; REBALANCE and FAST-MOVER Sunday messages', defect='NONE', status='REVIEWED VIA SOURCE + REPLY',
    wording='(see autolab / quality / rebalance / day trades replies rendered on committed data in batches 1-2)', rendered='NOT RENDERED on the synthetic cache: autolab crashed (r.b not iterable), quality crashed (no fundamentals cache), rebalance and fastmover-lab produced no message. Production data runs completed on 1 Nov (artifacts dated 2026-11-01).',
    source='autolab.mjs:182-192; quality.mjs:218-224; rebalance.mjs:79-92; fastmover-lab.mjs:174-246', evidence='data/autolab.json, data/quality.json, data/rebalance.json, data/fastmover-lab.json', population='per lab', period='per lab', rule='per lab', costs='per lab', hold='per lab', coverage='per lab',
    supports='Every extracted string of these files was read one by one (batch 2) and their owner-facing replies were rendered on committed data (W07, W10, W15 and batch-2 triage).', unsupported='The Sunday message bodies themselves were not rendered; synthetic-input crashes are a fixture limitation, not evidence of a production fault.', correction=None, fix=None, policyQuestion=None)
POLICY = []
COVERAGE_NOTES = ['- **Read from source** (live-session only, not renderable offline without a market session): the ignition-watch alert bodies (approved and early-paper kinds), the stop alerts (stop-watch.mjs), and the intraday-radar cards and board (intraday-radar.mjs).', '- Every extracted string of intraday-radar.mjs and stop-watch.mjs was read one by one.', '- **Not rendered on the synthetic cache:** Sunday autolab and quality (crash on synthetic input), rebalance and fastmover-lab (no message). Covered through source triage and their replies on committed data.']
RANK = [('C01', 'HIGH (P1)', 'GATE_OR_DECISION', 7.5), ('C04', 'LOW (latent; P1)', 'GATE_OR_DECISION', 41.5), ('C03', 'MEDIUM-LOW', 'WORDING_ONLY', 27.5), ('C02', 'LOW', 'WORDING_ONLY', 33.5)]
SUMMARY = [
 '- **C01 (P1, extends B02):** an EARLY WAVE ALERT [PAPER, NOT PROVEN] uses the approved alert\'s body, including an explicit "BUY only up to <price>", a stop and an exit. A NOT PROVEN paper result therefore produces a full buy instruction. This stays an owner policy question (P1).',
 '- **C02 (wording):** the intraday-radar card says "holding time that tested best". It is a split-half choice on 30+ paper trades without a luck bar, and it is not shown today because no group has a selected hold.',
 '- **C03 (wording):** the intraday-radar card labels the setup\'s paper record (currently negative for all four groups) as "Expected:".',
 '- **C04 (latent, = X01, P1):** the "BUY, PROVEN ON PAPER" board section and position sizing.',
 '- **Acceptable:** stop alerts (C10), PRE-WAVE / PAPER PLAN cards (C11).',
 '- **C12:** the Sunday autolab and quality messages crashed on the synthetic input, and rebalance and fastmover-lab sent nothing. They are covered by reading their source strings and by their replies on committed data.']
FILES = ['BATCH3-FINDINGS.md', 'RANKED-FINDINGS-v3.md', 'COVERAGE.md', 'all-claims.json', 'source-inventory-v3.json', 'tools/catalogue_data_b3.py', 'tools/build-audit.py', 'tools/readme_batch.py']
