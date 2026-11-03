# Separate verification alternative — NOT ADOPTED

This is a proposed change to the full exact-baseline/release hosted-log gate, **not a fallback already approved by the code approval**. It needs Claude's focused review and explicit owner acceptance before maintenance. No installation, run, dispatch, workflow change or production action occurs in preparation. The nine-file patch, inverse, operator, writer, save, UNKNOWN and restoration rules remain unchanged.

## Why a separate decision may be needed

Codex independently retrieved complete8,250line and16,699line hosted logs through its connector, beyond Claude's5,000line tail cap. However exact current main e15ce188 is data-only and has no check runs; no tool can retrieve a Tests log that was never created. The actual future isolated ACTIONS D does not yet exist. Neither a source-equivalent earlier log nor local success is silently substituted for an exact M/D hosted verdict.

## Exact proposed alternative gate

1. Freeze the **actual immediate parent M** and candidate D, verify D's sole parent M, all17 before/dependency pins, all nine after hashes, the exact approved patch/inverse, and identical data/unrelated trees. Run both complete registered suites locally on those exact source bytes with official Node20, ordinary clocks, no preloads/credentials/providers, `node "$f"` for every file required by the pinned production workflow. Record runtime, workflow/test/dependency identities, complete per-file results/log hashes and exit statuses; enumerate actual files instead of hard-coding130/132. Only TRY SMALL cases1/3b may fail in either tree, or none. Any other failure requires reconciliation, even on M.
2. Any code/test/dependency change in a new parent invalidates those local results; rebuild/rebaseline within the existing deadline or abort. Data-only advancement must still be preserved with a source-identity proof. No altered fixture clock, test exclusion or fake commit is used to make the baseline green.
3. Inspect D's naturally push-triggered hosted Tests job through completion. Verify exact run head/workflow/attempt and all available job-step metadata. Retrieve the entire available tail; it must contain the **complete** TRY SMALL group/TAP totals and only cases1/3b, or a genuine full pass, plus terminal execution/cleanup. Every other file visible in the tail must PASS. Exactly one test-file failure annotation is allowed in the tail for that group if it fails; source echoes and the terminal exit1 consequence are not extra test failures. Missing/truncated TRY SMALL group, a new visible failure, wrong run/source binding, setup failure or unavailable terminal outcome is UNVERIFIED and blocks this alternative too.
4. If a full D log is available, use it and assess all groups; do not discard stronger evidence in favor of a tail. Assess M's hosted evidence if it exists, but explicitly label a missing exact M hosted run as **NOT OBSERVED**, with local M evidence supplying the proposed replacement. No source-equivalent commit is relabelled as M.
5. Publish a sanitized receipt in PR1 before the existing CI deadline, separately listing exact local M/D results and hosted visible/missing file coverage. Claude alone makes the release/rollback decision. All failure/late-result/UNKNOWN and writer gates still apply; no automatic transition from the primary gate after D has been pushed.

## Verification limitation requiring explicit acceptance

A hosted tail can hide earlier failures, skips or infrastructure errors; the reported job failure could include an earlier problem in addition to TRY SMALL. Local success does not prove that those files passed in the hosted environment. A tail also may omit the actual checkout log: run head plus the pinned default-checkout workflow describes intended source binding, **not observed checkout bytes**. Record that missing evidence; never claim it was read. The full-log primary gate can establish more and is preferred when available.

Likewise an absent M hosted run is not hosted baseline success. Under this alternative, confidence in M comes from the exact local full suite; this is a deliberate evidence-standard difference. It establishes neither production command processing, profitability nor prospective strategy evidence.

## Proposed decision, only after independent review

If the owner chooses this alternative, approval must name this document/revision, exact local M/D plus hosted-evidence minimum, missing earlier hosted-file/checkout coverage and possible absent M hosted run, the unchanged two-case exception, and all original stop/rollback/restoration rules. Without that explicit decision the primary full-hosted-log gate remains controlling and unavailable evidence is **UNVERIFIED**. No additional operational or deployment authority is granted here.
