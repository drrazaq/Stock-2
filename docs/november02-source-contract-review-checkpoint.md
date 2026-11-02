# Source-contract r2 review and preserved release priority

Continues `58be2ace82e9eceab4f880c057e1604dce94bdd8`, preserving runtime `9b78b51d`, original source checkpoint `e6c99995`, HISTORY-03's 100-record/151-location reconciliation, ERRATA-01, policy TODOs and approved mentor patch. No runtime code was integrated or changed in this checkpoint.

## Mentor release remains first, blocked

Approved PR #3 `25a85000b076c4da649634606467e71b577bc75c` remains unchanged and undeployed. [Dated writer/persistence status](mentor-boundary-status-20261102.md) remains current: original run and its first successor completed; **41384810187/job 125091176540 remains active**; successor **41390705327 is PENDING**. No authenticated final-save/persisted-command-offset receipt is available for the original completed writer. SUCCESS does not establish preservation; no command processing is claimed.

Next boundary assessment remains **2 November 2026 at/after 09:46 UTC / 12:46 Kuwait**, based on the actual current loop start, followed by final-save and successor checks. Main remains `f6a9b166`; current deployment tests/compatibility still must be rechecked at a usable boundary. No cancellation, pause, dispatch, protected execution or deployment occurred. Approval remains valid; no duplicate approval is requested.

## Exact source-package review

Resolved `claude/market03-catalyst03-r2` to **`31b9ff2ade81608436ddc81835b674e47de0f540`**. [Review](reviews/market03-catalyst03-r2/REVIEW.md) and [evidence](reviews/market03-catalyst03-r2/evidence.json) verify exact patch/manifest/dependency pins and clean application in a disposable current-development checkout. Newer scanner/HISTORY wording, earnings-holiday fix, watcher, mentor and other protected files remain preserved; the branch is not merged.

**Verdict CHANGES REQUIRED.** R1 date isolation and R3 latched first-conflict/original evidence pass their actual-caller paths. R2 fixes the original empty-object defect but still treats contradictory count evidence as EMPTY and fractional/nonnumeric returned counts as OBSERVED. Three desired-behavior regressions fail on both exact and current-development candidates; valid controls pass. Do not integrate or rebase the next batches onto an allegedly accepted r2.

Independent local Node 24.19.0, non-root UID 1000:

- Exact caller/helper/recovery group **54/54 PASS**, including seven original permissions tests under intended conditions.
- Current-development selected candidate with preserved fixed fixture **70/70 PASS**.
- Pre-fix re-pin negative control **0/11 PASS**; new additional envelope review **3 PASS/3 FAIL** on both candidates.
- Original TRY SMALL case 1b: base and r2 each **15 PASS/1 FAIL**. Actual reproduced clock **2 Nov 04:50:15 UTC** is still **1 Nov New York**; its ten-calendar-day lookback is exactly **five sessions**, correctly within the unchanged rule. Existing six-session stale/one-session fresh fixture **16/16 PASS against both original scanner sources**, with assertions retained. No strategy or gate change.

Claude's full-suite/Node 20/22 runs are attributed evidence, not independent complete executions here. Hosted CI on this development evidence checkpoint validates the unchanged active development tree; it does **not** test an integration of the rejected package. No new Node 22 acceptance requirement.

Claude was notified of the exact residual R2 failures and ownership status. `discover.mjs` is free for her next isolated ingress repair, subject to her published claim; Codex has no edits to it. Smart-money/calendar remain hers, and their four earlier review regressions still require correction. Once r2 passes and its selected scope is accepted, hand off the **exact resulting development HEAD** for that rebase; not before.

## Privacy input received, cutover still incomplete

Historical sanitized package **`dc8a1a5db7372926637052a27f84931b00db1df2`** is available. [Reconciliation](privacy-containment/STAGE2-REFERENCE-RECONCILIATION.md) independently verifies source artifact hashes, 80-file scope and absence of `data/` patch paths. It does not claim recovery of the private original, independent full-history privacy clearance or functional cutover correctness. No old patch is applied.

Current-main private-save acknowledgments, reader/writer hooks, owner-independent website projection and recovery integration remain engineering gaps. Do not port old hunk-preference/JSONL-union or restore machinery as proof of transaction consistency. Existing public-history limits and strict no-private-publication restrictions remain. The inactive staging guard stays default-off; no backend bindings or migration occurred.

## Acceptance and next executable task

Original criteria unchanged: **24/40 accepted, 16 OPEN, zero new closures/admissions**. MARKET-03/CATALYST-03 gain independently verified R1/R3 evidence and a concrete residual R2 defect; all-provider/all-source criteria remain open. HISTORY-03 corrections and source anchors remain intact. REPO/privacy preparation gains a resolved historical source input, not deployed containment.

Next concrete deliverable: correct/re-review the three R2 count cases, then integrate only the accepted fifteen-file scope plus required matrix over current development and hand Claude the exact accepted head for her separately reviewed ingress batch. Continue current-main private-load/save/reader/website offline preparation independently. Mentor deployment remains the first production action only when every original boundary/persistence/compatibility condition passes.

## Subsequent hosted failure: isolated test-fixture repair

Exact evidence checkpoint `dabbcb5d` exposed two additional expired historical TRY SMALL fixtures after New York midnight. Their failure was reproduced on unchanged `58be2ace` and at a fixed post-midnight clock; the earlier case1b failure remains separately explained. Only test dates/controls are repaired, with all original entry/stop/hold/exclusion assertions preserved and one positive exclusion control added. **16/16 PASS on both sides of midnight and against unchanged scanner; selected source-package candidate73/73 PASS**. [Updated review/evidence](reviews/market03-catalyst03-r2/REVIEW.md). No source-contract integration, runtime/strategy/mentor/data change or acceptance closure occurs. Final child CI must pass independently; the prior failed run is preserved rather than retried into a claimed PASS.
