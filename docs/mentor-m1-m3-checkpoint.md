# Mentor M1–M3 bounded checkpoint

PR #3 stable revision: **25a85000b076c4da649634606467e71b577bc75c**. Current production base **f6a9b1668d0591cf24a734034949b96b241fe35b**. Exact eight-file patch SHA256 **1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7**. Production is unchanged; LEADER DIP remains NOT PROVEN.

## Corrections

M1: recorded buy dates and fills are facts separate from original-signal provenance. Missing original history does not itself contradict the plan. Original signal stays null; no backdating or inference. Actual target, stop, size, holding-period, future-date and saved-source/date contradictions remain unresolved. Missing recorded facts are incomplete. No new BUY or HOLD approval.

M2: short numbered position/entry/date, owner overlay, tested exit, risk/size and limitations summary precedes details. Tested close versus bot next-open mismatch remains explicit. Unsupported lanes and unknown symbols receive concise refusals. No invented target or range.

M3: rebuilt from current main. Its bot-actions fix is already present and excluded. Only eight deployment files; manifests, rollback and synthetic examples are linked from [the proposal](mentor-readonly-production-proposal.md). Prior V1/V2 patch evidence remains preserved.

## Execution and attribution

Claude review and unchanged harness were fetched from independent-reviews commit 06c137f1a6c43704c9d5788fee374b22246a9c5c and verified before execution. Review SHA256 e3802dde81cc0a615ebc9ffd715caea5642d2ea4baf45c7905384364995b52bc; harness SHA256 75d4c9b24b65bc53f6be5726921163f44d853099035dd235c22cd59979d8b471.

Author local Node24: 30 focused cases passed; production-plus-patch 133 distinct files passed. The unchanged harness preserved all financial data, ignored foreign commands, preserved the explicit mixed owner stop, and produced zero mismatches across 186 independent date comparisons. Its old enum/text selectors cannot parse the M2 wording; this is recorded explicitly, rather than claiming its legacy text booleans passed. New actual-bot assertions verify plain no-BUY/HOLD wording and unchanged machine actionability.

Final stable PR head hosted Node20.20.2 checks both PASS: push run [41342940853](https://github.com/drrazaq/Stock-2/actions/runs/41342940853) and PR run [41342945481](https://github.com/drrazaq/Stock-2/actions/runs/41342945481), each 132 ordinary test files. The extra local file is the instrument-type suite. Hosted evidence is separate from author and Claude executions.

## Next action and limits

Independent focused M1/M2 re-review of this stable head; M3 current-main mechanics and unchanged safety controls rechecked. Then an owner deployment decision for the exact patch, subject to fresh compatibility and a safe recording boundary. No deployment, dispatch, live message, provider call, secret use, strategy/risk gate change or claim-catalogue edit occurred. No acceptance row is closed solely by this inactive package. Existing legacy provenance, execution quality, portfolio capacity, profitability and tested-close versus bot-next-open remain material limitations. Original 40 criteria and 24/40 acceptance count are unchanged.

Development-only assertion/example updates keep callers aligned with revised plain output. The frozen V1 capsule and original historical results are unchanged. No SIP diagnostic or PR #6 edits are part of this checkpoint.
