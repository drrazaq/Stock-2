> **DEPLOYED31October2026:** owner approved the unchanged patch from review head627e81e3; isolated production commit `bd70f5a76172f369e9dff1096eba0e526c0e3fdc`, ordinary push CI PASS. [Deployment record, basket-wrapper clarification, separate gated failures, rollback and pending natural evidence](sec-request-hotfix-deployment-result.md). Original proposal below is retained as pre-deployment evidence; its approval-needed/not-deployed wording is historical.

# Isolated watcher SEC-request hotfix — owner review, not deployed

The deployed watcher calls `request()` for the SEC ticker map and submissions without defining it. The ReferenceError is caught and reported as SEC unavailable; ticker-map initialization fails, so EDGAR polling also never begins. A running watcher and market heartbeats do not prove SEC observation coverage.

**Exact correction:** source commit `9a5f2375bc6aa016b99211f1091dfe0e58aab935` on separate branch `Stock2-sec-request-hotfix`, based on current main `72690b308b9b62887b96d7dbe3435cf62bc59835`. [Exact three-file patch](validation/sec-request-hotfix.patch), SHA256 **f126e497181b670cc062acd690dbad2529a876cf82151cdc04c8a29aa1058010**. [Every before/result and206unchanged-dependency hashes](validation/sec-request-hotfix-manifest.json); [regression/test evidence](validation/sec-request-hotfix-verification.json).

| File | Exact purpose |
|---|---|
| `ignition-watch.mjs` | Define self-contained native-fetch request helper with10second AbortSignal timeout; route the existing Atom fetch through it. No new imports or telemetry-array dependency. |
| `test/sec-request-runtime.test.mjs` | Ten actual full-watcher cases with local SEC/market servers, fixed synthetic clock and external-fetch refusal; successful map/submissions/Atom, HTTP/network/malformed and header/body/Atom timeouts. |
| `test/leader-dip.test.mjs` | Existing Saturday-dependent fixture correction: explicitly assert11-session expiry and10-session eligibility; no strategy change or weakened assertion. |

Only one runtime file changes. Native `fetch` and `AbortSignal.timeout` are available in existing Node20+. The helper preserves the existing URLs, headers, pagination, polling cadence, source/error classification and fail-closed gates; no additional endpoints, retries, research/scoring, instrument/ZAD, accounting, message, secret, permission or workflow changes. This restores intended SEC traffic from the broken zero-request state; it does not expand the configured collection scope.

## Independent reproduction and verification

The supplied harness was inspected and run **unchanged** against a full current-production checkout and the corrected checkout. Its environment was cleared and a localhost-only fetch guard added through Node preload. Original:0SEC requests,0Atom requests; corrected:1ticker-map and2Atom requests. Both:0messages and301synthetic heartbeats. No native shadow flag was enabled. The supplied script lacks a submissions response and its Atom clock is not a contemporaneous acceptance source; its output is not prospective evidence.

The separate hardened suite verifies valid submissions and actual filing research decisions as well as refusals/malformed input and real, unscaled10second timeout paths.10/10pass, every path retains heartbeat/final archives,0messages. Original source fails the success regression because the working SEC server receives no ticker-map request. Current production plus the candidate exact diff passes **123files/1,205cases**;204root/tool syntax checks pass. No Python tests exist in this production base. A second pristine production checkout with the exact patch applied also passes123files/1,205cases; all result/dependency hashes remain verified after testing, and data is unchanged. Exact source commit `9a5f2375` passes its single applicable ordinary push CI check ([run41187972255](https://github.com/drrazaq/Stock-2/actions/runs/41187972255)). Development-only safety checks are not claimed for this production-base branch. Any final documentation HEAD is independently checked at its own SHA.

The original LEADER DIP fixture independently fails on Saturday with13pass/1fail. The corrected fixture retains both expiry/boundary assertions; no LEADER DIP implementation or other strategy changes are bundled. Accounting/other runtime dependencies retain their production hashes. No production data or frozen result was changed.

## Bounded deployment proposal — separate approval required

Approve **only patch SHA f126e497181b670cc062acd690dbad2529a876cf82151cdc04c8a29aa1058010**, including its two test files. Do not merge the broad development PR, native shadow package, news/calendar repairs or entry-plan changes.

Before any approved application, re-fetch main and verify every manifest before/dependency hash and source absence/presence, rerun the exact-patch production suite and check ordinary CI. If any dependency differs, stop for reconciliation. Establish a watcher-only natural boundary: all watcher runs terminal with final-save evidence, preferably outside market hours. This proposal authorizes no cancellation, workflow pause, delivery suppression or dispatch. If a natural boundary cannot be established, stop and report the exact run/status.

After separate owner approval and satisfied checks, apply the reviewed patch as a normal isolated commit, preserving every data/accounting file. Verify deployed hashes and ordinary exact-commit CI; no manual dispatch. Use only the next naturally scheduled watcher to inspect SEC request reachability, filing/source-failure context, archive/final-save persistence and unchanged duplicate/delivery behavior. Do not send a test message, fabricate an observation or request a trade. Until that natural evidence exists, operational confirmation is PENDING.

**Rollback:** normal revert of only the isolated hotfix commit, preserving all later data, transaction evidence and unrelated source changes. Verify hashes and ordinary CI again. Reversion restores the known SEC-unavailable defect, so mark SEC coverage UNKNOWN and reconcile rather than claim recovery. No reset, old-data restore, blanket branch merge or automatic rollback/dispatch is proposed.

## Remaining risks and exclusions

A reachable SEC API is not an authenticated catalyst, current instrument identity, executable quote, profitable strategy or approved BUY. Unknown trusted instrument identity continues to block approved ignition BUY while labelled research remains retained. The feed’s Atom updated field is not independently verified SEC acceptance; this hotfix does not change the frozen legacy model or relabel it. Past missing SEC coverage is UNKNOWN and is not reconstructed from heartbeat counts.

The native shadow package remains inactive and excluded. Its repeated full-chain append scans, actual-watcher flag-off/on equivalence, authentic acceptance response join and durable cross-run first-ingestion lineage require separate development/review. None is deployment-ready merely because this hotfix passes. Massive Starter stays15minute delayed; broad SIP coverage/rights remain unverified. Existing configured09:30–15:00coverage is not a full16:00session. No deployment has occurred in preparing this proposal.
