# Read-only mentor command — isolated production review proposal

Prepared1November2026. **Review only; no deployment approval requested or granted.** Do not merge the broad development PR. LEADER DIP remains NOT PROVEN; this command is EXPLANATION_ONLY / NOT_ACTIONABLE and never approves a BUY or HOLD.

Production base `6e806c4f2ea5d0f299b86c435fdc449c2f87e291`; development preparation `c3a9ffd431659916685ab38132afa3e8c28a8d7b`. [Exact manifest](validation/mentor-readonly-production-manifest.json), [patch](validation/mentor-readonly-production.patch), SHA256 `ebc62f42571b0dddc9d7e44e8d81f49b0f7ff22ea097ce121ba18140a5846222`.

| Proposed file | Scope |
|---|---|
| `scan.mjs` | Import pure explanation module, add owner-chat `mentor SYMBOL` route and suppress position-save normalization for mentor-only batches, including irrelevant foreign-chat messages. Current owner mutation commands retain existing handling in mixed batches. No sale/accounting/recovery/order/callback policy changes. |
| `mentor-plan.mjs` | Existing registered selection/next-open expiry, reported fill/quantity, allocation versus loss, no-stop/base-no-target, unadopted20%overlay, session126close, half-day and unresolved execution/source states. Pure/read-only. |
| `test/load-scan.mjs` | Required test dependency copying for the two local modules; no assertions removed. |
| `test/mentor-readonly.test.mjs` | Actual caller fixtures verify financial bytes, normal offset advancement, NOT PROVEN wording, ignored foreign messages and explicit mixed owner-stop recording. No real or fabricated owner trade is requested. |
| `test/bot-actions.test.mjs` | Required baseline test-only RECORDS section boundary correction and new negative control. On Sundays, uppercase subheadings such as SCOREBOARD/PRACTICE ACCOUNT are not new top-level ACTIONS sections. Existing public-label assertions unchanged. |

Unchanged dependency bytes are pinned for `market-session.mjs` and `index.html`; node built-ins need no installation. Test-only compressed code inputs contain existing public source/test bytes, not owner data or market observations. New source-contract recording on fills is **excluded**: legacy holdings cannot borrow today’s signal as their original evidence. Existing saved contracts can be explained if present; missing identity/fill/history remains unresolved.

## Owner-visible behavior if separately approved and deployed

An explicit owner `mentor SYMBOL` request receives the selection condition, reference close versus execution price, entry expiry, reported notional and lane limits, full-loss/no-stop warning, unsupported target/stop variants, registered exit date/close and what evidence changes the decision. A reached deadline does not establish a sale. Existing next-open reminders differ from the frozen close and remain visibly unresolved. The production view intentionally shows current ZAD as UNKNOWN rather than using an old helper to authenticate it.

The command uses existing owner-chat reply transport and existing PRIVATE_KEY read path for quantities; missing/decryption-failed evidence stays UNKNOWN. No new credential binding is added. No new provider/broker call, scheduled message, quote capture, financial write or strategy/ZAD/privacy change is introduced. Mentor-only requests retain the existing command-offset/menu-state handling; that is not a new claim of all-route transactional delivery durability. Replies may still fail under existing transport behavior. Full executable price, capacity, fees, portfolio and prospective evidence remains missing. This feature is a usable explanation, not a validated trading recommendation.

## Verified behavior and baseline integrity

Current-main-plus-exact-patch:124Node files/1,208cases PASS. Separate production-capsule package tests6 and included actual-caller tests2 pass; full development suite/exact CI are recorded in [integrated verification](validation/sec-v2-mentor-verification.json). Combined compatibility with the inactive native/selection patches also passes124/1,208; this does not bundle those patches into this proposal.

The previous development source reproduces the mentor/foreign-message financial-byte write while its explicit mutation control passes; the corrected source preserves all financial bytes. Ordinary unpatched main reproduces the Sunday RECORDS test-helper failure. Original logs/results are preserved; the fix changes the parser in the test only, not records, wording, accounting, trading rules or metrics. Known gated watcher/date-fixture and legacy basket-wrapper coverage limits are not erased or represented as newly certified basket behavior.

## Future deployment and rollback, only after separate approval

1. Independent review of this exact five-file patch and manifest. No full-PR merge. Recheck all before/dependency hashes against then-current main and rerun its full tests; a changed dependency requires reconciliation.
2. Use an approved natural bot/scanner recording boundary. Do not infer a quiet writer from unchanged files or cancel/disable jobs without separate authority. Preserve every current data file, command offset, pending-sale intent, receipt and strategy ledger. No recovery, migration or fabricated trade is part of this feature.
3. If later authorized, apply only the reviewed patch as a normal commit, verify after hashes and ordinary exact-commit CI. No manual dispatch is implied.
4. Passive verification through ordinary service and a naturally occurring owner request: correct non-actionable response, unchanged financial evidence and persisted normal offset. Do not send a real test message or ask for a fictitious trade. Protected private-state inspection, if necessary, must have its own exact approved read-only scope; job success alone cannot prove preservation.
5. Roll back only the isolated code/test commit with a normal revert, preserving all data/offset/pending-sale/receipt files. Do not reset main, restore historical data or replay commands. Existing accounting/watcher/SEC deployments remain intact.

Remaining risks: unproven strategy, unadopted target and close/next-open mismatch; unverified executable BBO/identity/portfolio/cost assumptions; legacy holdings without source snapshots; bounded2026/2027 calendar; existing reply/persistence failure semantics. None is hidden by a passing test or a stored holding.
