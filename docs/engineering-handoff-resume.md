# Stock-2 verified continuation checkpoint — 29 October 2026

Recovery/publication is COMPLETE. Do not repeat the recovery audit or reapply the old publish bundle.

## Published milestones

- `352316eb0dae144eead342c99be1c2a969ce7034`: recovered legacy-session overwrite protection and separate price/volume clocks. Full suite 1,195 passing. Push tests 40811335260, PR tests 40811340889, safety 40811335253 all successful on that exact commit.
- `43084d62424ba7caabfaa1c28af318b0ab2653bd`: recovery CI dashboard/handoff; all three checks passed.
- `2d276c3f63356356cb91776d8069c13f3d0bc614`: refresh stale minorities despite a fresh median; recover from future-dated price clocks. Full suite 1,198 passing. PR 40811856454, push tests 40811851254, safety 40811851330 all successful.
- `812f0c79e165c49ab493baba8bf75b9251974106`: actual watch-job timing, queued/unknown metadata handling and measured provenance. Full suite 1,204 passing, zero failures/skips. PR 40812268162, push tests 40812262721, safety 40812262652 all successful on the exact commit.

The next documentation-only commit records this checkpoint. Use GitHub branch HEAD as the parent for subsequent work. Commit only to Stock2-safety-fixes with an expected-head lease, no force. Draft PR #1 stays draft. No merge, production deployment, live dispatch/message, trade, secret/permission change or paid service occurred.

## Validation and workspace

Original seven-file bundle survived exactly (SHA256 e62a4e9fa7e294d711d461ca1d4883c14e8e8e54e9a96d229db34aa07037f152). Base a06032c/tree cbc9b75fb0618579cfa9a51f9b9ce2685debe2c5 matched remote with no conflict. Full diff saved at /workspace/scratch/stock2-recovery.diff. Source is a partial materialization, not a complete Git clone: never commit its entire directory as a new repository tree. Publication used explicit files on each remote base tree, preserving all unrelated paths.

Twelve recovery targeted tests and Python real-watcher duplicate integration passed again. The Python integration is saved at /workspace/scratch/stock2-duplicate-integration.py. 207 root modules parse and 78 workflows parse. Full suites require per-command localhost network capability in this managed sandbox; without it Node child/listener calls return EPERM. Do not weaken/skip tests. Missing index/static inputs and 15 required data inputs were restored from exact remote blobs; data hashes still match the original baseline. GitHub comparison confirms ZERO data-file changes. Synthetic interrupted smoke outputs remain quarantined at /workspace/scratch/stock2-interrupted-fixture/data and must never be published as market evidence.

Logs: /workspace/scratch/stock2-full-suite-final.log (1195), stock2-freshness-suite.log (1198), stock2-guard-suite.log (1204). New watcher-refresh integration has an external-fetch guard, runs against localhost fixtures, proves stale minority refresh and retained aggregate-volume age. Guard tests include original October 28 timestamps separately from labelled synthetic fixtures.

## Remaining engineering work (no extra acceptance credit)

Acceptance stays 15/40 (37.5%); 25 checks remain. No strategy promotion, profitability or production coverage claim follows from passing software tests.

1. Full session: guard ends 14:55 NY and watcher 15:00; the exchange generally closes 16:00. A 330-minute watcher window is NOT full exchange-session proof. Implement regular/half-day calendar, bounded/segmented monitoring, restart/message-state safeguards and per-minute health. Do not simply extend one GitHub job past its time limit or queue a duplicate that loses state.
2. Archive every attempt's shadow/delivery evidence as well as its heartbeat summary; audit save/rebase conflicts before canonical publication. Existing legacy protection is published, but broader publication semantics remain open.
3. Nine discovery lanes: assembleMultiAngle still lacks a runtime consumer. Inspect real collector payloads, preserve public time plus observedAt/source IDs, record unavailable sources, and integrate research only. Insider quarterly output and date-only earnings/supply summaries are not live point-in-time feeds; never invent publication timestamps or promote them to BUY.
4. All Telegram send paths: news-watch and premarket still swallow failures or consume dedup state too early. Preserve retryable acknowledgment state and current sensitive settings.
5. Provider entitlement/universe/session normalization and prospective latency measurement, all-path ZAD review, historical corporate-action/survivorship controls, strategy evidence and remaining acceptance checks.

Frozen/rejected research, owner settings/holdings/ZAD marks and original datasets are unchanged. Keep them intact. No owner approval is needed to continue authorized branch engineering; approval remains required for merge/deploy/trading/sensitive changes.
