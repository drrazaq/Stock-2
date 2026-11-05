# Independent reviews, 5 Nov 2026: A fixes, historical audit tooling, stop package r2

Reviewer: the Claude session, offline only.
- **Not done:** no deployment, collection, dispatch, provider call, permission or secret change, or credential request.
- **How tests ran:** Node 20.20.0. A preload (`probes/block-external.mjs`) refuses every non-loopback connection, and no test needed one.
- **Not used as evidence:** IG1 feasibility is not A validation and is not used as such anywhere below.

## Verdicts

| Area | Verdict |
|---|---|
| **Engineering** | **A fixes 7d3d6ba9:** PASS for A1, A2 and A6. A3, A4, A5 and A7 stay **OPEN**.<br>**Historical client 84937c96 + scope f33447aa + companion 37095a18:** PASS WITH FINDINGS (H1 should be fixed before any execution approval; H2–H5 are minor or conditions).<br>**Stop r2 c73cb6a8:** PASS. Its documentation is now reconciled. |
| **Execution readiness (historical audit)** | **NOT READY.** Engineering is not the blocker. These are all open:<br>• no verified private research repository;<br>• no verified current key custody;<br>• no official provider answers on quote size units, conditions and retention;<br>• no setup approval;<br>• no execution approval.<br>H1 must be fixed and re-pinned first. The custody upload protocol has never run against GitHub (H3). |
| **A pilot readiness** | **NOT READY.** A3 (stale ZAD mark accepted), A4 (unauthenticated source URL and hash) and A5 (unauthenticated outcome evidence fixed as the immutable result) all bear on the pilot's integrity. A7 (lock and damaged-tail recovery) remains an operational gap. No pilot date is proposed. |
| **Strategy evidence** | **NONE.**<br>• **A:** zero real observations. All A results are synthetic.<br>• **IG1:** the 12-case historical audit has not run. Even if it runs, it is data and cost feasibility only, on previously examined cases, not an untouched holdout.<br>Nothing here supports a buy, a promotion or a live rule. |

## 1. A fixes at `7d3d6ba9103d0227e784aec72f383784562b414a` (parent 37095a18)

**Tests executed:**

| File | Result |
|---|---|
| catalyst-reclaim-prototype | 20/20 pass |
| reclaim-research-workflow | 46/46 pass |
| a-catalyst-reclaim-store | 27/27 pass |
| a-pathway-review-regressions | 13/13 pass (my regressions from 477a3405, now green) |

**Actual callers driven by my probes** (`probes/probe2-4.mjs`, run on the 7d3d6ba9 tree):

| Finding | Result | Evidence |
|---|---|---|
| A1: one issuer per session | **RESOLVED** | A duplicate issuer and session now gives 1 card and 1 resolved unit (before: 2). A later duplicate placed **first** in the input is still admitted only in chronological order: runner admitted `[SYNTHETIC_OBSERVATION_1]`, duplicate `[ZZ_LATER]`, its exit evidence listed as unapplied. The store holds a card for the same observation with 1 outcome. Runner, summary and batch storage agree. |
| A2: one sizing rule | **RESOLVED** | A $5–$60 sweep shows no share mismatch between card and outcome. Both use the shared `paperPositionSize`. The summary rejects `o.shares !== card.paperShares` and an entry that differs from the sizing price. |
| A6: incomplete cohort | **RESOLVED** | With one outcome missing, the headline mean and sum are **null**, and the resolved subset is reported separately. Missingness: `INCOMPLETE`, conditional lower net bound −$959.52, conditional lower mean unit return −47.98%, upper bound null. The denominator is `SUPPLIED_ONLY_NOT_COMPLETE_RISK_SET`. |
| A3: stale ZAD mark | **OPEN** | A 2024 mark is still accepted (status PAPER_SETUP_ONLY). |
| A4: source authenticity | **OPEN** | A fabricated source URL and an all-zero hash are still accepted. The card wording now admits that authenticity is not established. That is honest, but it is not a fix. |
| A5: outcome authenticity | **OPEN** | Outcome evidence is unauthenticated, and the first complete set becomes the immutable result. |
| A7: recovery operations | **OPEN** | Stale locks need manual deletion. There is no tool to repair a damaged tail. |

**Owner of A3–A5 and A7:** the A implementation owner (Codex). I have not changed any A file.

## 2. Historical audit tooling

**Reviewed commits:**
- **Client** `84937c966cd1bc85ab5f240f3e53a44dc4fa98ba`: `tools/historical-sip-audit-client.mjs`, SHA256 `55d36619…`. It is byte-identical at 3334e10 and 37095a18.
- **Scope** `f33447aa195c903d5cf77de48f6f72a6f4859eb2`: raw `087597180556…`, canonical hash `9751a2a0db8b…`.
- **Companion** `37095a18e44a50fffd026e9e2bfb016e6026f920`, on top of `3334e10e`. Files: the custody, invocation, wire, action, preflight, launcher and recover tools; `historical-audit-action/`; and the proposed workflow.

**Executed:**

| Check | Result |
|---|---|
| `test/historical-sip-audit-client.test.mjs` | **42/42 pass** |
| `test/historical-audit-invocation.test.mjs` | **54/54 pass** (96 total, matching the published `offline96.tap`) |
| Blocked external connections | **0** |
| `SHA256SUMS` in the companion folder | all OK |
| Source manifest raw SHA256 | `73707d49…`, equal to the workflow pin |
| Scope reproduction | `prepare-scope.py` re-run on `data/ignition-paper.jsonl` at f0911952 (SHA256 `a4de490a…`, matches the pin) produces output **byte-identical** to the committed scope |

**About the scope:**
- The pinned source has 102 IG1/v3 rows over 8 dates. The rule takes the first 3 per date in append order and stops at 12, so it covers 15, 16, 19 and 20 Oct only.
- Signal minutes run from 09:39 to 10:47 New York.
- The selection is mechanical and disclosed as previously examined, so it is not a holdout.

**What I checked and found sound:**
- **Fail-closed design:** any non-200, schema or symbol mismatch, timeout or cap stops the batch. There is no retry and no fallback.
- **Request journal:** each request intent is sealed and fsynced before I/O. Each raw response is sealed before it is interpreted. AES-256-GCM with a fresh nonce; `wx` file creation; an exclusive `AUDIT_STARTED` claim and a per-run claim.
- **Request limits:** 1 request per second, 20 s full-response timeout, 600 s provider phase. Budget 156 = 36 + 120, counted before I/O.
- **Pagination:** page tokens must come from the previous response.
- **Time windows:** New York times use −04:00, which is correct for 15–20 Oct (daylight time ended 1 Nov). Daily bars end at 04:00 New York on the case day, so the case day's own session is not included (no look-ahead). Quotes start one minute after the recorded signal minute.
- **Credentials:** keys are read only after every guard, and are zeroed and deleted afterwards. Public output is limited to an exact status/reason/counts allowlist, with child stderr never forwarded. The workflow proposal is pinned to exact checkout and setup-node commits, with `contents: read` and `actions: read` only.

### Findings

| # | Severity | Finding | Owner |
|---|---|---|---|
| **H1** | **Medium (fix before execution approval)** | **Massive splits and dividends requests set no `limit`.** Massive documents the `/v3/reference/splits` and `/v3/reference/dividends` default as **10** (maximum 1000). Both endpoints are also marked **deprecated**. Any case ticker with more than 10 historical splits or dividends up to that date (including an earlier issuer of the same ticker) returns `next_url`. The client then throws `UNEXPECTED_PAGINATION_INCOMPLETE`, and the whole one-shot batch stops with every later case not attempted. Reproduced in `probes/historical-pagination-probe.mjs` with a synthetic 10-row page plus `next_url`: identity OK, splits OK, dividends `UNEXPECTED_PAGINATION_INCOMPLETE`, then `BATCH_STOPPED_NO_RETRY`. It is probably not triggered by these 12 small-cap tickers, but it cannot be ruled out offline, and the approved run is single-use. **Suggested fix:** add `limit=1000` to both requests, and ask Massive whether the deprecated routes remain served. This changes the client hash, so the manifest, workflow pin and evidence must be re-pinned. The scope does not change. | Codex (client owner) |
| H2 | Low | **The storage limits are inconsistent.** The raw limit of 128 MiB is base64-encoded inside sealed records (×4/3 = 170.7 MiB), which exceeds the 160 MiB sealed limit (minus the 64 KiB reserves). The effective raw limit is therefore about **119.9 MiB**. The failure is fail-closed (`SEALED_STORAGE_LIMIT`), but it hits after a provider request was spent, and the TERMINAL_FAILURE record may itself be refused, leaving the intent unresolved. The README's "128 MiB" is not reachable. Fix the number or the encoding. | Codex |
| H3 | Condition | **The custody upload has never been exercised against GitHub.** It uses the Actions results-service protocol (`ACTIONS_RUNTIME_TOKEN`, twirp CreateArtifact/Finalize/GetSignedArtifactURL, Azure block upload), tested only against the same author's loopback model. If GitHub's protocol differs, the run ends `CUSTODY_UNVERIFIED` **after** spending the provider budget, and the sealed data dies with the runner. **Suggested condition:** one separately approved, provider-free custody rehearsal (a synthetic archive with no market data) in the proposed private repository before the provider run. | Codex, then an owner setup decision |
| H4 | Low | **The readback download has a 10 s per-request deadline for up to 160 MiB.** That needs at least 16 MiB/s from Azure to the runner. This is usually fine, but a slow download would mark a good capture `CUSTODY_UNVERIFIED`. Worth measuring in the H3 rehearsal. | Codex |
| H5 | Low | **The recovery receipt has no producer.** `recover-historical-audit.mjs` needs `archiveSHA256` and the original context, including `approvalSHA256 = sha256(JSON.stringify(parsed authorization))`. Neither is printed by the public result. Both are reconstructible (the artifact digest, and re-stringifying the approval file), but no tool or documented step produces the receipt. Document or add a receipt builder. | Codex |
| H6 | Question | Whether Alpaca accepts `asof` on the single-symbol quotes route, and whether an empty window returns `[]` or `null`, cannot be settled offline. A `null` would stop the batch. Add both to `provider-questions.md`. | Codex (provider questions) |

None of these is a credential, privacy or public-output defect.

## 3. Stop package r2: documentation reconciled

`claude/stop-alert-validity`: the code is unchanged at `c73cb6a8`. Only README, verification.json and SHA256SUMS changed.

| Item | Result |
|---|---|
| `production.patch` | `c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b` (unchanged) |
| `rollback.patch` | `1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9` (unchanged) |
| Re-executed 5 Nov | stop-alert-validity 17/17; stop-watch 3/3; watcher-resilience 9/9 and watcher-incident-revision 11/11, both with `INCIDENT_WATCHER_SRC`, 0 skipped |
| Main compatibility | main `0d8f7918` has not changed any of the 10 files since base a95af150. The patch applies cleanly. The full suite on main plus the patch is in the stop package's verification.json. |
| Stale text removed | "14/14"; "watcher-resilience … not executed here"; the scope list without watcher-incident-revision |

**Remaining deployment conditions:**
1. Codex review of r2, pinned to the commit and patch hash.
2. Owner approval of the exact patch hash.
3. Recheck main compatibility just before deployment.
4. Deploy only at a natural boundary (no bot run active or pending, outside the watcher session), with no pause, cancel or dispatch.
5. Hosted CI all-PASS, then a complete-log receipt.

## Ownership (to coordinate on PR #1)

| Owner | Files |
|---|---|
| **Claude (only)** | `claude/stop-alert-validity` (the ten stop files plus `docs/stop-alert-validity/`); `docs/review-2026-11-05/` on `claude/mentor-release-handoff` |
| **Codex** | all A files (`catalyst-reclaim-prototype.mjs`, `reclaim-research-*.mjs`, `tools/a-catalyst-reclaim-store.mjs`, their tests and docs); all historical-audit files (`tools/historical-*.mjs`, `tools/historical-audit-action/`, `tools/recover-historical-audit.mjs`, `docs/intraday-audit-client/`, `docs/historical-audit-invocation/`, `docs/subscription-evaluation-decision-20261104/`) |
| **Owner** | any setup approval (private repository, bindings, key custody), any execution approval, and any stop deployment approval |
