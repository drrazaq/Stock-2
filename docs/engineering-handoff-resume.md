# Interrupted engineering milestone

Branch remains a06032cca7c309f486a5215b15bd8a81fc6b1b08 (re-read GitHub after publication interruption). No new commit or CI was confirmed. Do not claim publication.

Seven changed/new files are bundled in /workspace/scratch/stock2-milestone-publish.json with exact base tree and expected branch head. Preserve all other GitHub tree entries. Never create a commit from this partial local source materialization. Use a complete clone or GitHub create_tree with base_tree_sha, then create_commit(parent=expectedHead), then update_ref only Stock2-safety-fixes with the expected-head lease and no force. First inspect the patch.

Changes: legacy-duration overwrite protection; separate Massive/Alpaca trade and volume clocks; strict finite provider numeric fields; no inferred timestamp when missing; four provider regressions and one legacy-duration regression. Full details in engineering-progress.md and engineering-ledger.json.

Validation: 12 targeted tests passed; five changed JS files parsed. Python-launched real watcher completed-session integration passed with no fixture mutation. Node spawnSync returns EPERM locally, affecting integration tests; do not skip these in CI or call them passing locally. Full suite for new code has not passed yet. Existing base full/safety CI all passed.

Next actions: inspect/publish bundle, verify all new-commit CI; mocked-provider integration; publication/rebase race and incomplete per-attempt shadow archive review; then whole-system backlog. Nine discovery lanes, broader news/Telegram repairs, premarket/full-session coverage, ZAD all-path review, strategy research and remaining acceptance checks are still open. Acceptance stays 15/40 (37.5%); strategy promotion stays zero.

Frozen research and remote data unchanged. Synthetic no-credential smoke outputs are quarantined in /workspace/scratch/stock2-interrupted-fixture/data; never publish them as research. No merge/deploy/trade/live message/paid service/permission change performed.

## Recovery publication confirmed

Published repair commit `352316eb0dae144eead342c99be1c2a969ce7034` to Stock2-safety-fixes using a non-forced expected-head update from a06032c. Seven explicit files only; no data changes. Local full suite 1,195 passed, zero failures/skips. Twelve targeted tests, Python watcher integration, 207 syntax checks and 78 workflow parses passed. Exact-commit remote CI pending. Do not republish the old bundle or claim the branch remains a06032c.

Exact repair-commit CI verified successful on 29 October: pull_request 40811340889, push 40811335253, push 40811335260. Recovery and publication are complete. Continue fresh-price coverage, monitoring and discovery integration; do not repeat recovery.

## Next independent milestone

Per-symbol stale refresh and future-clock recovery implemented; 1,198 tests passed and six changed JS files parsed. New mocked-provider real-watcher integration passes. Publish only ignition-watch.mjs, live-refresh-universe.mjs, snapshot-fields.mjs, tests/live-refresh-universe.test.mjs, tests/snapshot-fields.test.mjs, tests/watcher-refresh.test.mjs and the three engineering documents. Base is documentation checkpoint 43084d62424ba7caabfaa1c28af318b0ab2653bd; use its tree. CI for that documentation checkpoint also passed all three checks. No data file belongs in this patch.

## Guard timing milestone

Freshness commit 2d276c3f63356356cb91776d8069c13f3d0bc614 passed all three CI checks (40811856454, 40811851330, 40811851254). Next patch fixes INC-03 using actual latest-attempt watch-job start/end instead of run creation. Three code/test files: watcher-guard-core.mjs, watcher-guard.mjs, test/watcher-guard.test.mjs; three engineering docs. Fourteen targeted guard tests and full 1,204-test suite passed; no skips. Publish from freshness commit tree 228bfba66f0a90406e80fbfca6dd892eceff85e7, then verify exact-commit CI. Do not reapply old patches or include any restored data.

Remaining priority: full 16:00/half-day session observation (guard still ends 14:55, watcher 15:00), live heartbeat freshness, all-attempt shadow/delivery archives, nine-lane runtime integration with point-in-time provenance, all-channel Telegram acknowledgment, and broader strategy/compliance acceptance. No new approved strategy. Full engineering acceptance stays 15/40.
