# Focused review of Codex package `b46f77f4c1d6a93d29fa3b51d156580357d19cab` (5 Nov 2026)

Reviewer: the Claude session, offline only.
- **Not done:** no repository creation, installation, secret binding, rehearsal, dispatch, provider call or deployment.
- **How tests ran:** Node 20.20.0 and 22.22.0. A preload (`probes/block-external.mjs`) refuses every non-loopback connection, and none was attempted.

## Verdicts

| Area | Verdict |
|---|---|
| **H1–H6 corrections (engineering)** | **PASS, proven offline.** See section 1. The two items that can only be closed outside this session stay open: H3 (does the upload work against GitHub itself) and H6 (provider answers). |
| **Historical execution readiness** | **NOT READY.** Missing: the private repository, the GitHub rehearsal PASS, current owner key custody, the provider answers (H6 and Massive's deprecated routes) and every approval. |
| **Setup / rehearsal boundary** | **Sound in design, with three corrections before any approval cites it** (S1–S3 below). A setup-only package comes first. The run approval can only be written once the workflow commit W and the private control commit C exist (section 2). |
| **Stop r2 release** | **BLOCKED at the boundary, not in code.** Fresh main `8a05fb69` is compatible and the patch passes. But the bot runs back to back with a queued successor, so no natural writer gap exists (section 3). |
| **A pilot** | **Unchanged: NOT READY.** A3, A4, A5 and A7 stay open. The new A7 read-only inspector (`tools/a-recovery-inspect.mjs`) only diagnoses. It never deletes, truncates or repairs, so it is not recovery. No audit or stop approval authorizes the A pilot. |

## 1. H1–H6 at b46f77f4

**Pins checked:**
- **Source commit** `07995aff92053f8bce4e0dd5674c46107a73d39f`: every manifest file at that commit equals the same file at b46f77f4.
  - `source-manifest.json` raw SHA256 is `8b6725dd…`, the value pinned in the audit workflow proposal. All 13 listed files match their hashes.
  - `rehearsal-manifest.json` is `ac8be83d…`, the value pinned in the rehearsal workflow. All 17 listed files match.
  - `SHA256SUMS` all OK.
- **Workflow proposals:** audit `8f259d2b…`, rehearsal `cb4f3bb6…`.
- **Old pins superseded:** 3334e10e / 73707d49 / 8087ed87.

**Tests (Node 20, then 22, identical results):**

| File | Result |
|---|---|
| historical-sip-audit-client | 42/42 |
| historical-audit-invocation | 54/54 |
| historical-review-findings (new) | 7/7 |

**Also executed on Node 20:**

| File | Result |
|---|---|
| a-recovery-inspect | 2/2 |
| leader-dip (frozen-date fixture fix) | 14/14 |
| catalyst-reclaim-prototype | 20/20 |
| reclaim-research-workflow | 46/46 |
| a-catalyst-reclaim-store | 27/27 |
| a-pathway-review-regressions | 13/13 |

**Actual tools run:**
- `tools/rehearsal-timeout-proof.mjs` → PASS on both Node versions. A real TLS server stalls after sending headers; the wire gives up at 10 s with exactly one request.
- `tools/historical-custody-action/index.mjs` with no approval → `ERROR`, exit 1, nothing on stderr.

| Item | Result | Evidence |
|---|---|---|
| **H1** limit=1000, no pagination widening | **PASS** | The splits and dividends paths now carry `limit=1000`. My original probe now shows `?limit=1000&ticker=…`. A `next_url` is still sealed and then stops the batch, with no page 2 and no retry. Page 2 is refused for every non-quote request (`UNAPPROVED_PAGINATION`), and quote page 9 is refused. No `/stocks/v1` substitution or fallback. **Still open:** whether Massive keeps serving the deprecated v3 routes (provider question 6). |
| **H2** 112 MiB effective raw limit, reservation before each request | **PASS** | `EFFECTIVE_RAW_BYTES = 117440512` (112 MiB), below the frozen 128 MiB ceiling. Before an intent is written or a counter moves, `prepareResponseCapacity` reserves the base64 size of the largest possible next response, plus 32 KiB of metadata, plus 64 KiB of final-record headroom.<br>**Near-cap probe (actual client + GuardedJournal):** 4 MiB quote pages run until the raw limit. The stop came at 108 MiB raw with 144.0 MiB sealed (under 160). `SEALED_STORAGE_LIMIT` never fired. A TERMINAL_FAILURE record was written, and 0 transport calls happened after the stop.<br>**Inherent residual:** the request that crosses the raw ceiling is spent, and its body is not sealed (its intent stays unresolved, with a terminal record). The size cannot be known before asking. This is disclosed by "a batch can still stop early on storage bounds". |
| **H3** provider-free rehearsal | **PASS offline; NOT RUN on GitHub** | The near-cap synthetic archive (more than 158 MiB) goes through local readback and fresh recovery with matching receipts. The rehearsal entry refuses provider, owner-key, private-data and Telegram bindings. It requires a private repository, actor `drrazaq`, `workflow_dispatch`, attempt 1, the dedicated ref, an exact approval hash and a one-run history. **Whether the upload works against GitHub's actual service is unproven until the approved rehearsal passes.** |
| **H4** real-wire timeout | **PASS offline; real speed unmeasured** | Each wire request still has 10 s, and the remote phase 120 s, both unchanged. Readback and remote timings are now recorded. Real throughput from GitHub's storage is measured only by the rehearsal. A timeout there is ERROR, not readiness. |
| **H5** receipt and recovery tools | **PASS** | `produceRecoveryReceipt` checks the acknowledged digest, the canonical approval hash, the source and scope. It verifies the archive against the original RUN_CONTEXT and the terminal chain, then writes the receipt exclusively with mode 0600. The offline CLI `build-historical-audit-receipt.mjs` rebuilds an identical receipt. A wrong run, approval or acknowledgement is refused, and a symlinked destination is refused. **Limit:** a valid receipt does not prove who uploaded or downloaded the archive. |
| **H6** provider questions | **OPEN (answers needed)** | One consolidated list: 5 questions to Alpaca, 2 to Massive. No message has been sent and no answer is invented. |
| **Twelve cases and 156 requests unchanged** | **PASS** | The scope hash is still `9751a2a0…` and the file is still `08759718…`. Enumerating `planPage` gives Massive 36 + Alpaca 120 = **156**. Case 12 → `UNKNOWN_CASE`. Retries and fallbacks are still 0. |

## 2. Private setup and rehearsal boundary

**Corrections before any approval cites the package:**
- **S1 (doc consistency).** `setup-decision-20261105.md` still says the historical code is pinned to `3334e10e` with manifest `73707d49`, that raw is "128MiB", and that Claude's A re-review is pending. `package.json`, the workflows and `H-review-disposition.md` now say `07995aff`, `8b6725dd` and 112 MiB, and my A re-review was published at `4923b443`. The setup document must be corrected, or marked superseded, before an approval quotes it.
- **S2 (runtime parity).** The rehearsal action declares `using: node24` (with setup-node 24.19.0). The audit action declares `using: node20`. Two consequences:
  - The rehearsal's PASS would prove the custody path on a different runtime from the one the audit uses.
  - A JavaScript action runs on the runner's bundled Node for its declared version, not the setup-node version.

  Align the two declared runtimes, or record explicitly which Node the hosted runner actually used in each case. Node 24 was not available offline here, so I could not test it.
- **S3 (quota).** Private-repository Actions minutes and artifact storage are unverified: 5 minutes plus about 160 MiB for 3 days for the rehearsal; 15 minutes plus 160 MiB for the audit. The owner must confirm they fit within included capacity. No purchase.

**Why the approval has two stages:** W (the commit containing the installed workflow) and C (the private commit containing `rehearsal-approval.json`, which itself must name W) cannot exist before installation. Asking for one approval now would leave them blank. So:

### Stage 1: setup-only package (offered for the owner's decision; not requested as an execution approval)

> APPROVE PRIVATE REHEARSAL SETUP ONLY.
> 1. Create the private repository drrazaq/stock-2-research-audit, with access for the owner and the activated Codex operator only. No environments, secrets, variables, deploy keys or apps.
> 2. Copy the exact bytes of docs/historical-audit-invocation/custody-rehearsal.yml.proposed from public commit b46f77f4c1d6a93d29fa3b51d156580357d19cab (SHA256 cb4f3bb67b2338f71235d9ba64914897b32eab70169edf913193871972efbc46) to .github/workflows/custody-rehearsal.yml on its default branch. Create branch custody-rehearsal-once-4923b443 at that same commit, W.
> 3. Create a separate private branch with one commit, C, containing only rehearsal-approval.json. It names W, source 07995aff92053f8bce4e0dd5674c46107a73d39f, sha256("drrazaq/stock-2-research-audit"), operator CODEX_ON_DEMAND, scopeHash SYNTHETIC_CUSTODY_ONLY, and a proposed window of at most 30 minutes.
> 4. Confirm private Actions minutes and artifact headroom within included quota.
>
> No dispatch, no rehearsal, no provider or owner-key binding, no audit workflow installation, and no change to the public repository or the financial mirror. Report W, C and the approval-file SHA256.

### Stage 2: exact run approval, to be written only once W, C and the approval hash exist (form, not a request)

> APPROVE ONE PROVIDER-FREE CUSTODY REHEARSAL: drrazaq/stock-2-research-audit, workflow custody-rehearsal.yml at W=⟨40 hex⟩ on ref custody-rehearsal-once-4923b443, control_commit C=⟨40 hex⟩, approval_sha256=⟨64 hex⟩, source 07995aff92053f8bce4e0dd5674c46107a73d39f, rehearsal manifest ac8be83db16f01fcf3e49545ab0f6260640cabe5cb999a2e2b97ca0a04a9aa62, window ⟨UTC start⟩–⟨UTC end⟩ (≤30 min). Dispatched once by drrazaq, attempt 1, no retry. Synthetic data and an ephemeral key only. A PASS proves GitHub custody mechanics only: not owner key custody, provider access or audit approval.

The November 6, 08:00–08:30 UTC window is only Codex's proposal. **Nothing above is authorized now.** The market-data audit needs its own later setup approval (four bindings, key custody) and its own run approval.

## 3. Stop r2 release refresh

**Compatibility, rechecked 05:53 UTC:**
- Fresh main is `8a05fb6920eae7cb42270ac8a6e248ab67ff7b9c`. None of the 16 manifest and dependency paths has changed since base `a95af150`.
- The patch applies cleanly. `rollback.patch` applies to the patched tree and restores main exactly (clean `git diff`).
- On main `8a05fb69` with the patch applied: full suite **136/136 pass**; gated watcher scenarios 9/9 and 11/11, 0 skipped. Details are in `stop-refresh.json`.

**Patch and rollback:**
- Production patch `c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b`.
- Inverse `1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9`.
- Both cover exactly ten files:
  - production: `stop-watch.mjs`, `ignition-watch.mjs`, `scan.mjs`, `early-alerts.mjs`;
  - tests: `test/load-scan.mjs`, `test/shadow.test.mjs`, `test/stop-alert-validity.test.mjs`, `test/stop-watch.test.mjs`, `test/watcher-resilience.test.mjs`, `test/watcher-incident-revision.test.mjs`.

**Boundary: BLOCKED.** Bot workflow `bot.yml` uses concurrency group `bot`, does not cancel in-progress runs, has a 350-minute job limit and a */30 schedule. That schedule keeps one successor queued.
- **Observed handoff:** run 41911711790's job ended at 05:48:37 UTC. Queued run 41947731543, created at 01:19:31, started its job at 05:48:40 UTC. The gap was **3 seconds**.
- **Current state:** run 41947731543 is in progress and will run for up to 350 minutes (to 11:38 UTC at most). A new successor will be queued long before it ends.
- **Main scan:** `main.yml` also writes at 13:10–20:40 and 21:30 UTC on weekdays.

Under Codex's natural-boundary rule (every writer terminal, with no successor queued), no gap is eligible now.

A natural gap appears only when GitHub fails to queue a successor. That happened on 4 Nov between 12:55 and 13:17 UTC, and the health-line release `c19ef302` used it at 13:01. Such gaps cannot be predicted. I will check at each handoff; until one is verified, the status is BLOCKED. No pause, cancellation or dispatch is authorized. Deployment therefore needs one of these separate owner decisions:
- **(a)** an approved maintenance procedure that stops a successor from being queued;
- **(b)** an explicit decision that a single atomic ten-file commit may land while a bot run is active, with that run's data pushes rebasing onto it as usual.

I recommend **(a)**. It is the procedure already proven on 3–4 Nov.

**Sole operator:** I can operate as sole operator through completion or a safe abort:
- push access to `main` was proven by `c19ef302`;
- run, job and log reads work through the GitHub connector;
- I would keep scheduled self-check-ins during the hosted run.

**Limit:** this session's container can be reclaimed after inactivity. If that happens mid-procedure, the state stays UNKNOWN until checked, with no blind retry, rollback or takeover.

### Exact stop-only approval wording (for the owner to use only when ready; not an approval of any boundary-creating action)

> APPROVE STOP R2 ONLY. Apply production patch c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b (reviewed source c73cb6a8881f0ab8fef5e64cbabeec0d966a7d8d, docs d142feb7942aee8b26f077d40f7bef13d85e88a7) as one normal, non-force commit on freshly verified main. It changes exactly these ten files: stop-watch.mjs, ignition-watch.mjs, scan.mjs, early-alerts.mjs, test/load-scan.mjs, test/shadow.test.mjs, test/stop-alert-validity.test.mjs, test/stop-watch.test.mjs, test/watcher-resilience.test.mjs, test/watcher-incident-revision.test.mjs.
>
> Deploy only at a verified natural boundary: bot, scanner and watcher runs all terminal with final saves verified, nothing queued, and outside the watcher session. Recheck immediately before the push. Claude is the sole operator. No pause, cancellation, dispatch, workflow change, offset, data or financial-record change, and no broad merge.
>
> Rollback scope: only inverse 1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9 on the same ten files, at the same kind of boundary, preserving every intervening data commit.
>
> Verification: complete hosted test log of the exact release commit, then passive observation only.
>
> This does not approve the historical setup, rehearsal or audit, or the A pilot.
