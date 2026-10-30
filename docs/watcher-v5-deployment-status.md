# Watcher v5 deployment: approved, blocked by natural boundary

30 October2026. Owner approved the exact watcher v5 package from `16be57ee9903971d686ac4cf19224564db718d53`, SHA256 `a9a9d2ef49da38b100015da9e86be8ab2c05a47849292e062c64de4b27290bd6`. Approval remains conditional; **no watcher deployment has occurred**. [Read-only checks and fresh test results](validation/watcher-v5-deployment-attempt.json).

Current production main tested: **3945cee7e536c90b57dd1ed12742f21a74f68333**. Advances from the reviewed base are data-only. The exact approved patch applies cleanly. All23 resulting file hashes, frozen dependencies and all deployed accounting hashes match before and after testing. Fresh production-main-plus-patch tests pass **121 files /1,199 cases**, retaining all115 production test files; root-module syntax checks pass. The patch is applied only to isolated local checkout `/workspace/watcher-v5-deployment`, with no deployment commit or push. Production data/accounting are untouched. Approved manifest/patch bytes are unchanged.

## Precise blocker

- Watcher **41061535419**, job **124082233084**, is **in_progress**. Job started13:14:11Z; watcher step13:14:23Z. Its process start/duration is not observation coverage.
- Watcher **41072889693** is **pending**, with zero jobs started, and may start naturally after the active run finishes.
- The inspection occurred inside the market/observation window. Neither run was cancelled, no workflow disabled, and no delivery suppressed. No manual dispatch was submitted.

**Next preferred assessment:30October2026 at or after20:00Z (16:00 New York).** The configured watcher endpoint is15:00 New York, but market close is16:00; prefer the latter for an outside-market boundary. Time alone is insufficient. Re-enumerate runs and wait for **both** existing runs (and any replacements) to finish naturally. Inspect final persistence, source/run identity and available artifacts; do not infer successful publication from job conclusion alone. If a run remains active/pending or evidence is uncertain, remain blocked. The job’s355-minute timeout is not a guaranteed safe completion or proof that evidence was saved.

Once that boundary is freshly established, re-fetch main, compare all affected source/dependencies with the approved base and verify the exact patch again. If anything except unrelated data changed, stop for compatibility reconciliation. Rerun tests as material changes warrant. Apply only the exact patch as a normal fast-forward commit; preserve newer unrelated remote changes and every production data/accounting file. No full-PR merge, force push, dispatch, cancellation or suppression is authorized. Approval need not be requested again for this unchanged procedure.

## Pending passive checks

Deployed SHA/CI, run archives, canonical/duplicate behavior, persisted snapshot, delivery-state health and successful publication are **not yet observable for v5 because it is not deployed**. After any later deployment, inspect exact-commit CI from ordinary triggers and naturally scheduled watcher runs; no fabricated observation, message or trade is permitted. Friday’s pre-deployment runs cannot verify new code. Weekend observation is not implied; the next weekday cron is Monday2November, with actual start time uncertain and the DST transition requiring source/time inspection.

Interrupted append recovery can require a retained artifact and separate reviewed restoration; automatic cross-run recovery is not guaranteed. [Separate historical documentation correction](incident-v4-b2-review.md) removes the inaccurate Git-staging claim; [v3 correction](incident-v3-review.md) distinguishes its old restart behavior from v5. No repair code was changed after approval. Trusted instrument identity remains required for approved BUY; labelled research remains retained. Coverage stays09:30–15:00, not the full16:00 session. October29 stays excluded from primary ranking; October28 remains the excluded pilot. This is an operational change, not profitability evidence. Strategy/ZAD/privacy, instrument activation, collection expansion, orders, purchases and secret/permission changes remain outside scope.
