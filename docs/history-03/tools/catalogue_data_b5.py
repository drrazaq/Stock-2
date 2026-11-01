# HISTORY-03 batch 5 (reviewer: Claude): every remaining production sender and module string (discover, discovery2, deals, movers,
# news-watch, smart-money, tipranks, tip-score, follow-lane, agent-a, labs and cores). All 231 remaining extracted strings read one by
# one. These senders call providers in production, so they were read from source (their message templates in full where they carry a
# claim); no render. Source lines: main f6a9b166.
TITLE = 'Batch 5: remaining senders and modules'
SCOPE = ['agent-a-core.mjs', 'agent-a-lab.mjs', 'calendar.mjs', 'catalyst-core.mjs', 'catalyst-lab.mjs', 'chain-core.mjs', 'chain-decoder.mjs', 'chain-ripple.mjs', 'deals.mjs', 'discover.mjs',
         'discovery2-core.mjs', 'discovery2.mjs', 'e16-absorption.mjs', 'ew-stack.mjs', 'follow-lane.mjs', 'fulfilling.mjs', 'gov-awards.mjs', 'gov-awards2.mjs', 'health.mjs', 'ignition-core.mjs',
         'ignition-paper.mjs', 'insider-study.mjs', 'league.mjs', 'missed-runners.mjs', 'movers.mjs', 'news-watch.mjs', 'orb-study.mjs', 'pattern-lab.mjs', 'rank-models.mjs', 'regime-gate.mjs',
         'sequence-study.mjs', 'share-supply.mjs', 'smart-money.mjs', 'swing-lab.mjs', 'tip-score.mjs', 'tipranks.mjs', 'watcher-guard-core.mjs', 'watcher-reporting.mjs']
NOT_A_CLAIM_TEXT = {'searchPosts worked without login'}
NOT_A_CLAIM_AT = [('calendar.mjs', 120), ('catalyst-core.mjs', 33), ('chain-core.mjs', 8), ('chain-decoder.mjs', 220), ('follow-lane.mjs', 353), ('follow-lane.mjs', 359),   # code fragments
 ('agent-a-lab.mjs', 85), ('agent-a-lab.mjs', 124), ('ignition-core.mjs', 9), ('ignition-paper.mjs', 18), ('share-supply.mjs', 89), ('swing-lab.mjs', 76), ('orb-study.mjs', 134), ('gov-awards.mjs', 47),
 ('gov-awards.mjs', 96), ('health.mjs', 30), ('health.mjs', 31), ('health.mjs', 35), ('health.mjs', 39), ('watcher-guard-core.mjs', 34), ('watcher-reporting.mjs', 33), ('movers.mjs', 321), ('movers.mjs', 324),
 ('movers.mjs', 326), ('movers.mjs', 327)] + [('discovery2-core.mjs', n) for n in (12, 13, 14, 17, 18, 19, 20, 28, 38, 175)]   # rule-feature and condition labels, status labels
ANCHOR = {
 'E01': ('news-watch.mjs', ['What the 5-year test found when the S&P 500 had', 'Decided by the system from the 5-year market-day test', 'Only the strongest tested buy today']),
 'E02': ('discover.mjs', ['Companies that keep selling new shares lag the market']),
 'E03': ('deals.mjs', ['It becomes a BUY only after 30+ paper trades with a profit']),
 'E04': ('tipranks.mjs', ['BUY WATCH (tested rule)', 'Not yet (tested rule)']),
}
B = []
def add(**k): B.append(k)
add(id='E01', surface='MARKET SHOCK message (news-watch.mjs, every 15 min in session; sent when the S&P 500 moves 1.5%+ or a tier-1 headline lands)', defect='WORDING_ONLY', status='MISLEADING (selection-biased figures in a live decision message; extends B04 and X02)',
    wording="MARKET SHOCK: S&P 500 <dp>% today / DECISION: HOLD everything you own; keep every stop at your broker. Do not panic-sell. Tested buys in ACTIONS stay valid at their prices. | Only the strongest tested buy today. / ... What the 5-year test found when the S&P 500 had a big drop (1.5%+) that day: the system’s tested buys made <x> a trade on average (<n> unseen trades) vs <y> on all days: <verdict>. / Decided by the system from the 5-year market-day test. Not financial advice.",
    rendered='source read (live only; template read in full)', source='news-watch.mjs:72-79', evidence='data/mday-study.json rows bigDown / bigUp: per-stock out-of-sample trades of engine rules on stocks pre-selected by the past-trade check (the B04 population); the engine\'s forward record is negative',
    population='stocks pre-selected for good past results', period='each stock\'s own history', rule='market-day study', costs='okEv cost model', hold='per rule', coverage='nightly scan universe',
    supports='"HOLD, keep your stops, do not panic-sell" is a precaution, not a performance claim.', unsupported='The quoted averages are selection-biased (see B04) and "tested buys" / "Decided by the system from the 5-year market-day test" present them as validated.',
    correction="MARKET SHOCK ... DECISION: hold; keep your stops. (Past test trades on stocks picked for good past results did <x> on days like this; not an expected return.)", fix='Codex wording.', policyQuestion=None)
add(id='E02', surface='discover reply / discovery cards (dilution note)', defect='WORDING_ONLY', status='OVERSTATED', wording="<SYM>: share count +<x>% in a year. Companies that keep selling new shares lag the market",
    rendered='source read', source='discover.mjs:340', evidence='library S2 "Heavy dilution (avoid test)": FAILED DISCOVERY (edge -3.8%, t -2.31 below the 3.5 bar, n 1,009); C-S8 (S-8 share creep) rejected as an AVOID (not worse than the average stock in the older half)',
    population='-', period='autolab discovery window', rule='S2 / C-S8', costs='-', hold='20 sessions', coverage='-', supports='The direction (heavy diluters lagged) appears in one discovery test.', unsupported='Stated as a general fact; the evidence is below the luck bar and the related S-8 test found no lag.',
    correction="share count +<x>% in a year (heavy diluters lagged in one test, not beyond luck)", fix='Codex wording.', policyQuestion=None)
add(id='E03', surface='deals message (deals.mjs)', defect='GATE_OR_DECISION', status='POLICY QUESTION P1 (latent)', wording="Paper record of this pattern (buy next open, 10% stop, out after 20 sessions): ... It becomes a BUY only after 30+ paper trades with a profit.",
    rendered='source read', source='deals.mjs:98', evidence='-', population='deal pattern', period='forward paper', rule='deals pattern', costs='-', hold='20 sessions', coverage='-', supports='Paper-only today.', unsupported='States that a paper record alone will turn the pattern into a BUY (P1).', correction='(after P1) state the owner\'s rule for paper-record promotion', fix='Owner P1.', policyQuestion='P1')
add(id='E04', surface='TipRanks message (tipranks.mjs, twice a week)', defect='WORDING_ONLY', status='MISLEADING (vocabulary; = D08)', wording="  BUY WATCH (tested rule): buy <range> ... | Not yet (tested rule): buy only after a close above ~<px> | Reference plan (not tested): ... | Ratings are opinions, not tested signals.",
    rendered='source read', source='tipranks.mjs:124-139', evidence='per-stock past-trade check (okEv)', population='-', period='-', rule='okEv', costs='-', hold='-', coverage='-', supports='Ratings are correctly labelled as opinions.', unsupported='"tested rule" for the per-stock check.', correction='BUY WATCH (past-trade check only, NOT PROVEN)', fix='Codex wording.', policyQuestion=None)
add(id='E10', surface='lab and study verdict templates (agent-a, chain-ripple, e16, ew-stack, fulfilling, gov-awards 1-2, insider-study, orb, pattern-lab, regime-gate, sequence, share-supply, smart-money, swing-lab, tip-score, discovery2, catalyst-lab, league, rank-models, missed-runners, movers)', defect='NONE', status='SUPPORTED_QUALIFIED',
    wording='"every gate passed in both halves ... below the proof bar" / "not better than an average stock in the ..." / "A version passed: it goes on paper first, never straight to a buy." / "one period is a lead, not proof" / "Paper only until its live record passes." / "Never PROVEN from this engine: the older half was used to find the rule."',
    rendered='source read', source='see SCOPE', evidence='each study\'s own frozen data file', population='per study', period='per study', rule='per study', costs='per study', hold='per study', coverage='per study',
    supports='Verdict templates name the gate that failed or passed and keep NOT PROVEN / paper-first language; conditional "passed" texts appear only on a recorded pass.', unsupported='-', correction=None, fix=None, policyQuestion=None)
POLICY = []
RANK = [('E01', 'MEDIUM-HIGH', 'WORDING_ONLY', 9.6), ('E02', 'LOW-MEDIUM', 'WORDING_ONLY', 30.5), ('E04', 'LOW', 'WORDING_ONLY (vocabulary)', 31.6), ('E03', 'LOW (latent; P1)', 'GATE_OR_DECISION', 41.6)]
COVERAGE_NOTES = ['- **All 231 remaining extracted strings** in these files were read one by one. After this batch no extracted string is NOT_REVIEWED.', '- **No render:** these senders query providers in production, so their claim-bearing templates were read in full from source (news-watch market shock, deals, discover, tipranks, smart-money, movers).']
SUMMARY = [
 '- **E01 (medium-high):** the live MARKET SHOCK message (sent when the S&P 500 moves 1.5%+) quotes the selection-biased market-day averages ("the system’s tested buys made X a trade … unseen trades") and says "Decided by the system from the 5-year market-day test". Its hold-and-keep-your-stops advice is fine.',
 '- **E02:** the `discover` reply\'s "Companies that keep selling new shares lag the market" is stated as fact, but its evidence is below the luck bar (S2: −3.8%, t −2.3) and the S-8 share-creep test (C-S8) was rejected.',
 '- **E03 (latent, P1):** `deals` says a pattern "becomes a BUY only after 30+ paper trades with a profit".',
 '- **E04 (vocabulary):** `tipranks` uses "BUY WATCH (tested rule)" for the per-stock check.',
 '- **E10:** the lab and study verdict templates across the remaining modules are acceptable.',
 '- **Coverage:** every extracted string is now classified; none remains NOT_REVIEWED.']
FILES = ['BATCH5-FINDINGS.md', 'RANKED-FINDINGS-v3.md', 'COVERAGE.md', 'all-claims.json', 'source-inventory-v3.json', 'tools/catalogue_data_b5.py', 'tools/build-audit.py', 'tools/readme_batch.py']
