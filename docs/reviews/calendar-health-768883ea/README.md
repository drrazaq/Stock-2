# Calendar revision 2 — CHANGES REQUIRED; watcher review complete

Codex independent offline review, 6 November 2026. Calendar commit **768883ea9ca4a510899c1799fc46ddd3b29e6be5**, replacing166051d4; fresh production source **ee5e85eca9d575eeed4a9a1283788942039b5f70**. No candidate implementation edits, production write, provider request, credential access, message, dispatch or workflow control. Synthetic/local-service tests only, Node20.20.2, non-root UID1000. Saturday STOP R2 and D1–D4 are unchanged.

## Current calendar verdict

**CHANGES REQUIRED: one remaining part of R4.** The original8counterexamples now PASS on both the exact revision and production+STOP+D+revision. All other passes from the prior review are preserved. An additional missing-clock case reproduces the original requirement to handle UNKNOWN clocks explicitly; it is not a new strategy or policy requirement.

| Original finding | Current disposition and independently checked behavior |
|---|---|
| R1 period join | CLOSED: disagreeing provider/official period remains UNKNOWN; agreeing/no-hint controls retained. |
| R2 typed duplicates | CLOSED: conflicting units are UNKNOWN in either order; equivalent40K/0.04M normalize deliberately. |
| R3 actual arithmetic | CLOSED for reviewed scope: null/zero index cannot become−100%; exact adjacent periods/finite positive levels required; legitimate zero payroll change retained. Frozen study parsing/fill rules remain unchanged. |
| R4 vintage/source clocks | PARTIAL: provider previous is as-retrieved, not falsely certified pre-release; partial refresh does not freshen another series. **Missing actual retrieval clock still disappears from output**, as reproduced below. |
| R5 numeric direction | CLOSED:189K versus195K reads BELOW; economic interpretation stays separate; strategy comparison sign unchanged. |
| R6 delivery health | CLOSED: configured-window coverage does not hide actionable message-recovery counts. |

### Remaining R4 counterexample

Through the actual calendar job→encrypted cache→actual `calendarText(false)` caller, retain valid synthetic NFP levels150050/150000 for the exact adjacent periods but no original retrieval timestamp. Numeric change50K is valid; `actual.retrievedAt` correctly remainsnull. The actual reply is:

> Nonfarm payrolls (monthly change), October2026: came in50K [actual Alpha Vantage (BLS series NFP)]

Spacing above is compacted only for prose; the retained test log contains exact output. It never says the retrieval clock is UNKNOWN. `scan.mjs:98` explicitly omits unknown timing for `k === 'actual'`; `econ-series.mjs:167,172` allows a numeric value withnull retrieval time. A timestamped control preserves its actual date and passes.

Required narrow correction: explicitly render missing/invalid actual retrieval time as UNKNOWN, while preserving legitimate numbers and real supplied timestamps; do not fabricate a time or backfill historical vintage. Test the actual producer/caller path, including the existing timestamped control. No new collection or strategy decision is required. [Portable harness](r4-unknown-clock.test.mjs): `CALENDAR_REVIEW_TREE=/path/to/candidate node /path/to/r4-unknown-clock.test.mjs`. Exact and composed runs give **9PASS/1FAIL,0skipped**. Assertions describe corrected behavior; the single failure is not waived. R4 does not reopen R1/R2/R3/R5/R6.

Documentation also retains stale r1 wording under “What changes” and the module header, including `PUBLISHED_BEFORE_THIS_RELEASE_MAY_BE_REVISED`, and the old7/7table despite the current15case economic suite. Reconcile these with r2; do not change frozen study results or imply source authentication. Historical review counts may be preserved if explicitly labelled historical.

## Package, rollback and execution evidence

- Exact seven-path production patch SHA256 **55bb6c0ff2a3d4e38e087c44a682b98eddef64aa62c9c6885b533d622c55c314**. Inverse **59304ea7fe09839cae0a47402e620fd2d8910f123c6694cc6f73c7e6ec87511f**.
- All four SHA256SUMS and all seven manifest before/after hashes verified. Direct main application/inverse restores original tracked bytes. Main+STOP+D+calendar applies; calendar inverse restores its exact immediate parent including data and STOP/D. [Verification](verification.json) records the tree identities. Future release-parent pins still require a fresh check; applicability is not deployment approval.
- Independently executed production-main+STOP+D+calendar **143/143test files PASS**. Current supplied package suites total **26/26cases** (15economic,7health,4SEC). Original reviewer harness **8/8PASS** on exact and composed revisions; extended harness **9/10PASS**, exposing the missing-clock case. [Per-file exits](composed-full-suite-results.json), complete counterexample logs (`*.log.gz`) and exact source pins are retained here. Full ordinary per-file logs remain preserved locally under `/workspace/milestones/calendar-health-r2-review-20261106/composed-full-suite/`.
- The hosted `test` check at768883ea is SUCCESS (run42226012294/job127919582694). This statement is check metadata, not a new complete-hosted-log receipt. Claude's reported140/140branch and143/143composition are separately authored executions; they are not substituted for the independent local143file run above.
- `discover.mjs` is byte-identical to166051d4; prior SEC transport/fallback passes remain valid. `macroNow` headline study-key caller and subsidiary rejection tests pass; frozen study definitions/histories are not revised. Plausibility bands are heuristics, not authentication. Legacy global cache clocks cannot recover previously lost per-resource timing. Old-writer rollback restores old limitations, not corrected cached data.

## Separate watcher verdict

**PASS for offline correctness — independent review COMPLETE**, not pending. Reviewed package is Codex046877af; independent reviewer is **Claude**, publication **80b4bdb1256f29e46551902b4ae5675ade86c2be**, [review](https://github.com/drrazaq/Stock-2/blob/80b4bdb1256f29e46551902b4ae5675ade86c2be/docs/review-watcher-cadence-046877af/README.md).

I inspected that exact published review and reconciled its package identity, execution attribution and remaining conditions. It reports Node20.20.0, non-loopback traffic blocked, actual workflow/guard/watcher probes at0/2.5/30/59/65seconds work, unchanged STOP/D tests, and identity of old781+delta versus refreshed full patch. Those executions are Claude's, not new Codex runs; the published review is a results report, not retained complete execution logs. Codex's earlier119focused and143file runs remain separately attributed.

Exact patch **6a361eca81204becf41bc2d731ad01343d774cfd2adf62ebc54db69d978df8b0**, inverse **3253805799eb0554804c36aa6e2744004630e669b02f6faa681f3d36d7fafe9b**, delta **2753853d0322b3e5e6edc1255d111a9a82881d8bc6b6db28e4ba6d0f7dc671f5** unchanged. Its11paths and38pins remain a separate after-Saturday scope. Review completion is **not owner deployment approval**. Required: owner approval, fresh after-Saturday pins/rollback compatibility, safe boundary and exact release CI. Residual attribution race, source overruns, small timer-phase drift, configured09:30–15:00coverage and source freshness limitations remain. No calendar finding blocks recognition of the completed watcher review; no watcher pass validates prices, market breadth or profitability.
