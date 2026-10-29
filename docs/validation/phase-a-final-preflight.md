> **Current readiness update — 29 October, after10:40UTC:** Research-key recovery remains VERIFIED. A pre-existing automatic branch diagnostic (not Phase A) made5 fixed GET checks in run40859412224 and observed Massive0 fresh/13,238 rows versus targeted SIP2/3 at06:40EDT. Subscription/cause/delay/schema remain unresolved. Earlier no-live-probe statements were incorrect for that automatic run; code-change triggers have now been removed, with secret-free tests remaining automatic. **Phase A is NO-GO pending provider freshness clarification and separate dated approval.** Its reviewed source7dd702d, workflow SHA25694824b7bf9cfab2d3862a73be107c405f16ef21059a65edf370eefbe9bcd34fa, date/window/limits and no-deployment state are unchanged; no Alpaca fallback is silently substituted. Account/access descriptions were requested without keys/account identifiers. Current engineering acceptance22/40; actual prospective cases0.

# Phase A final preflight — 29 October 2026

**Research-key recovery: VERIFIED. Phase A: NOT AUTHORIZED, NOT INSTALLED, NOT DISPATCHED.** The owner independently decrypted actual GitHub challenge artifact12879798326 from run40834596544/attempt1 on iPad/iSH with the separately saved RESEARCH_ARTIFACT_KEY. Authentication, exact marker, one file and pinned source all matched. This closes the key prerequisite only; it grants no collection permission. No secret was shared or changed.

## Exact dated deployment proposal

| Item | Proposed scope |
|---|---|
| Session | **Friday30October2026**, normal NYSE trading day |
| Manual dispatch | **03:55 EDT /07:55UTC /10:55Kuwait**; wrapper must start by04:00 New York |
| Collection | **04:00–09:30 EDT /08:00–13:30UTC /11:00–16:30Kuwait**; observations04:00–09:29,330 distinct minutes |
| Expiry | **2026-10-30T13:35:00Z**; no date rollover or extension |
| Earliest valid approval | **2026-10-29T13:35:00Z**, because expiry must be within24hours of real approval; approvedAt stays null until actual approval |
| Runtime | Full pin **7dd702d5d2ed3578f7558bc4f7fcc211f3619669**, nine listed source files identical to that commit |
| Candidate | [premarket-research-validation.preflight-revision.yml.proposed](premarket-research-validation.preflight-revision.yml.proposed), **not the older baseline proposal** |
| Exact candidate SHA256 | **94824b7bf9cfab2d3862a73be107c405f16ef21059a65edf370eefbe9bcd34fa** |
| Only future production change | Add those exact bytes as **.github/workflows/premarket-research-validation.yml on main** after explicit approval; no merge of PR1, no edits to existing workflows/runtime/data |
| Trigger | Manual workflow_dispatch only, main only, fixed dated title; no cron/push trigger; attempt1 and earliest retained matching dispatch only |

This document is a proposal. The candidate approval JSON at `phase-a-2026-10-30.candidate.json` remains `approvedAt:null` /NOT_APPROVED_DO_NOT_DISPATCH. Installation and one manual dispatch require separate explicit owner approval naming this date/window and revised workflow. An approval before the earliest time cannot be backdated, postdated or silently extended. A missed startup window requires another reviewed dated proposal, not a rerun.

## Preflight findings

1. **Key recoverability VERIFIED:** owner attestation for the actual GitHub artifact, not a fixture or a GitHub-only same-key roundtrip. Exact evidence is [phase-a-owner-key-verification.json](phase-a-owner-key-verification.json). No repeat proof job is needed or authorized.
2. **Runtime integrity PASS:** all nine runtime Git blobs match7dd702d. Both Phase A workflow locations on current main and development branch are absent. The only installed key-proof job remains the separately authorized challenge.
3. **Production isolation PASS for proposed one-file change:** all77 workflows were checked at main **c1991e71a79713cbdbb28f123eb500081c7c96c2**. The installation push matches only existing secret-free `tests.yml`; there are no workflow_run downstream workflows. Existing production jobs, schedules and trading behavior are not changed. Recheck this inventory against then-current main before any authorized install; do not overwrite concurrent changes.
4. **Single-session guard PASS in fixtures:** exact source/day/expiry/budgets, fresh approval, main/manual event, attempt1, exhaustive history and earliest matching run. Incomplete API history or a history/API failure blocks provider secrets. Preserve all failed run records; deletion is not a way to authorize a retry. Concurrency serializes attempts; a queued duplicate is rejected rather than restarting collection.
5. **Transport and permissions PASS statically/with fixtures:** GET-only fixed provider endpoints, redirects refused,15second timeout, no unbounded retries. Only MASSIVE_KEY/FINNHUB_KEY reach collection. Only RESEARCH_ARTIFACT_KEY reaches encryption steps; the pinned sealer's local PRIVATE_KEY variable is an alias for that research secret, **never secrets.PRIVATE_KEY**. No Telegram, Alpaca, broker, private-data credential, order client or repository-write operation is included. Job permission contents:read; checkout credentials not persisted. No secret or sensitive permission changes are proposed.
6. **Safe engineering completed:** acceptance evaluator now rejects malformed containers, duplicate/missing snapshot evidence, nonfinite/negative latency and impossible fresh counts. Python3.9-compatible `recover-phase-a.py` authenticates full encrypted artifact trees offline without Node; it checks every tag/source/path before output, blocks symlinks/overwrites and preserves incomplete evidence as incomplete. The existing owner-proven challenge tool is unchanged.

## Enforced limits and honest residual limits

- 330 cycles;420 total provider attempts; expected330 snapshot plus up to66 general-news calls. Missing credentials, errors and rate-limit cooldowns remain evidence, never synthetic success. There is no separate consecutive-error shutdown in pinned7dd702d; a provider refusal can continue within those total/time budgets. Validation still fails inadequate coverage. No extra service/subscription will be purchased to fix a refusal.
- 64MiB **compressed cycle files**,96MiB **sealed artifact output**, three-day artifact retention. These are not a raw HTTP response-body cap or a hard total runner RAM/disk cap. Final discovery/provenance files are covered by the sealed-output budget, not the compressed-cycle counter. Oversized input may fail the runner before final sealing; report failure rather than guaranteed recovery.
- 340minute soft collector process timeout,15second kill grace,360minute hard job timeout; exact approval expiry and trading window still apply. Ordinary collection failures attempt evaluation/sealing/encrypted upload. Hard cancellation, VM loss, hard timeout or upload/quota failure can lose all unuploaded evidence: **no encrypted intermediate checkpoints exist in the pinned source**. `always()` is not a recovery guarantee.
- The collector alone can exit0 despite stale/absent feeds. The proposed wrapper separately requires330 distinct minutes, at least314 valid snapshot minutes and314 broad snapshots (>=10,000 received unique symbols with at least one fresh price), and finite p95 snapshot latency<10seconds. A single fresh price is not broad fresh coverage. Fresh percentages and age/quote clocks are reported; verified tradable-universe coverage remains UNVERIFIED. Passing this test does not establish profitability or approve BUY signals.
- Provider entitlements, real premarket freshness, real latency and available GitHub artifact quota have not been exercised by this preflight. They are measurements/possible failures of the authorized one-session experiment, not claims of readiness already proven.

## Recovery and rollback

See [phase-a-recovery-runbook.md](phase-a-recovery-runbook.md). Download the encrypted run-specific artifact before its three-day expiry. The new single-file Python recovery tool works with the existing py3-cryptography dependency and Python3.9.16; no Node upgrade or key disclosure is needed. Authentication/file-count reporting is separate from freshness/market-completeness validation. Keep all failed/incomplete evidence private and encrypted outside local recovery.

After approval, stop by cancelling that exact run, then revert/delete only the new validation workflow file after the job has stopped. No automatic restart, recurring schedule, data rollback, order reversal or secret rotation exists. Recheck the installed bytes/hash before dispatch. A force-stop may sacrifice unuploaded evidence; that limitation is part of this proposal.

## Approval boundary

Approval is requested **only after the earliest valid time** for: installation of the exact revised one-file main workflow and one30October research-only session within the stated limits, existing collection/research-key bindings and three-day encrypted artifact retention. Approval must acknowledge the documented hard-cancellation/upload-loss limitation. All other production files remain outside the change.

**Phase B, BUY/Telegram alerts, orders, recurring collection, services, secret changes and merging PR1 remain unauthorized.** Acceptance remains21/40(52.5%); prospective matched paper cases remain0. Key recovery closes a deployment prerequisite, not a trading-performance acceptance check.

## Verified engineering checkpoint

Source **f65686fb7634d37010fc64e232383570503a5c01** passed all12 exact-commit checks: push/PR Node suites, six Python matrix jobs, safety, watcher fixture-open/close and research fixtures. Local totals1,300 Node /22 unique Python /9 targeted preflight/recovery tests; machine evidence in [phase-a-owner-confirmed-preflight-evidence.json](phase-a-owner-confirmed-preflight-evidence.json). No failed/ skipped local tests. The current documentation checkpoint does not change the reviewed candidate bytes or runtime pin.
