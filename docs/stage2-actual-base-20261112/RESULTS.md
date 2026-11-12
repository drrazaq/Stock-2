# Stage 2 preparation on the actual Stage 1 release

12 November 2026. Completed offline work, not a release request or operational READY. No production write, workflow action, task change, acquisition or new source scope. Stage 1 publication/F1 are preserved; its runtime checkpoint is still separate.

## Executed results

Actual Stage 1 commit **7db2c83b574bbe0d85d4c9972ad2230a36004816**, tree **bfe058678599f6eb77d80292bec8a12de5143927**. The existing preparer was run without `--create-local-candidate`; no ref changed. It proves:

- 46 bound mode/blob/SHA256/size identities pass; exactly 39 source paths would change and seven dependencies stay unchanged.
- The offline composed tree is **0cec6b37843f52a8c6b7d473fd68c76c02914023**. Every non-data leaf equals tested Stage 2 **5fccc6ec3e18c426531a0398b5085e2621a6e192**. Newer data is preserved.
- The 39-entry inverse restores the EXACT actual Stage 1 tree, including the 22 expected deletions and prior helper implementation. It is not the full-baseline or watcher-only inverse.
- The complete existing scheduled-workflow literal dependency census was evaluated on this tree: **all 60 workflow entries and their closures are identical to the passed reference**. All seven unchanged bound dependencies match. The restored tree is identical to Stage 1, so its restored dependency closure is identical too.
- No source/dependency delta exists now. The existing exact-pin full hosted/local checks and tool/admission/recovery exercises remain valid within their original scopes. No redundant candidate build, test run or source re-review was made.

Machine-readable proofs: composition.json and dependency-evidence.json. Claude independently reproduced the same actual-base composition in PR1 comments **6815787082 / 6815796721**. This closes the formerly hypothetical-base question, not future writer completion or runtime adoption. No 40-item operational acceptance is newly closed from these object checks.

The non-blocking S2-5 wording correction from **6801210311** is applied: suite time is derivable from logged `at` timestamps; the frozen retry tool has no duration field. Tool/binding/inverse bytes are unchanged. Admission latency remains an explicitly assumed planning risk, not a measured success probability or extra retry allowance.

## What must genuinely wait

| Evidence | Exact positive witness | Why it cannot be supplied now |
|---|---|---|
| Today's daily researcher finished | Actual 12 Nov fire, SUCCEEDED, `finished_at` and session ID from its fresh-session task record, plus final source SHAs | Its scheduled fire is 08:37 UTC; quiet GitHub history is not termination. Claude will inspect actual records, not create/change a trigger. |
| Agent C finished | Actual 11:47 UTC delivery, persistent session IDLE after completion, actual 19 Nov re-arm and no-pending-code handoff, including children | Delivery-only `last_run` is not completion; work previously spilled into Friday. |
| Stage 1 runtime | Approved 21:15–22:00 UTC read-only checkpoint with actual availability; completed qualifying production evidence and required delivery evidence | F1 Tests prove software validation, not loaded scanner/save/delivery operation. No production workflow on the release had completed at Claude's 05:45 census. |
| Final source snapshot | Actual post-writer main by Friday 06:30 UTC; enumerate every non-data commit, even a later revert | Today's unchanged-source result cannot certify tomorrow's writer output. |
| Actual FINAL verdict | No-change proof retaining C0, or one changed composition with required local/complete hosted checks and both forward/inverse dependency review; five-item handoff by 07:55, verdict by 08:15 | Future changed code must not inherit this receipt. Missing handoff is NOT READY. |
| Owner authorization/readiness | One exact request after that verdict; exact approval before 08:45; present access, writer census, jobs and $0 control at each admitted unit | No new approval or future attendance is inferred. |

These are event gates, not a requirement to stop independent research until midnight. Current witnesses cover the source through the actual Stage 1 release only. Any intervening non-data commit invalidates the no-change conclusion and is reconciled directly with Claude; do not silently expand the 46/39 package or relax I8.

## Existing recovery and approval boundary

Friday 13 Nov A remains 09:00–12:00 UTC, push cutoff 09:20. Saturday B remains 05:30–06:30, D_A 06:45, paired recovery through 08:30, before the 08:37 researcher. P/D, ordinary and explicitly late cutoffs, finite caps, safe writer/admission census, complete hosted receipts, UNKNOWN handling and restoration gates remain as reviewed. Every later time is conditional on actual evidence and present attendance, not a promise.

The existing draft is not issued to the owner against placeholders. Final approval must name the actual validated pin and unchanged source/binding/tool/inverse plus the complete operating terms. If Stage 1 is UNVERIFIED/inverted, writer settlement or the five-item handoff misses its fixed budget, no final request is ready and Friday A is off; no automatic fallback, task pause or deadline extension.

Separately reviewed development radar/opening repairs, quote retention, new company facts, scanner guard and reference operations are NOT added to Stage 2. Research continues on its own branch; no new production activation follows from these proofs.
