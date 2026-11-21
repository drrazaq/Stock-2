# Bounded protected SIP-access diagnostic — inactive proposal

Prepared 1 November 2026. No installation, binding, dispatch, provider request or execution is authorized. The [accepted contracts package](market-data-contracts-review-pass.md) is unchanged and is not imported by this diagnostic.

## Exact purpose and limits

Sample whether the existing ALPACA_KEY/ALPACA_SECRET binding can receive the requested SIP endpoints and report observed source clocks. Owner subscription ownership is confirmed: Algo Trader Plus; Massive Stocks Starter remains 15 minutes delayed. Subscription evidence does not establish this binding's access or real quote ages.

Proposed session: Tuesday **3 November 2026 at 11:00 New York / 19:00 Kuwait**. This is a proposal, not an approved appointment. Fixed public sample: SPY and AAPL, not selected from private holdings. These two names establish no small-cap, whole-market or premarket coverage. Reference preparation is **0 requests**. Diagnostic capture is **at most 7 application HTTP attempts**, combined maximum **7**, separately authorized from any reference preparation, calibration or frozen evaluation. Control-plane checkout/artifact traffic is outside the application cap and bounded by the job.

The immutable [plan](validation/sip-access-plan.proposed.json) has approved=false permanently. Separate dated approval is required; changing plan bytes creates a new scope for review. Requests are GET-only to https://data.alpaca.markets, feed=sip, no redirects, IEX fallback, retries or pagination followups:
1. snapshots for SPY,AAPL;
2. latest quotes for SPY,AAPL;
3. latest trades for SPY,AAPL;
4. raw 1Min bars for SPY,AAPL over the five closed minutes before T0;
5. repeat the IDENTICAL bar window at T0+90 seconds;
6. raw 1Day bars for SPY,AAPL across the declared previous session;
7. AAPL trades over the ten seconds before T0.

This replaces the earlier all-day seven-request sketch with one feasible <=180second packet. It does not claim thin-stock gap explanation, full-day minute/daily reconciliation or after-hours coverage. The inclusive bar end is T0 minus 1ms, so the open minute is not requested. A page token means INCOMPLETE_PAGE and immediate stop; absence of a returned bar is not proof of no traded volume. One repeat measures sampled revisions, never a universal REST settling period. Rate-limit header numbers describe these responses, not sustained limits. This does not reconcile all minute volume, determine halt rights, prove quote units through an account test, guarantee fills or validate profitability.

Hard limits: 10 seconds per HTTP request AND body, 128KiB/body, 896KiB cumulative body bytes read (not a TLS/wire-byte guarantee), 16KiB report and seven attempts. The data window ends at T0+180 seconds. Bounded early waiting is separate: at most 10 minutes, runner ceiling 790 seconds, process watchdog 800 seconds plus 5-second kill grace, total job 20 minutes including setup/upload. These are engineering watchdogs, not strategy thresholds. No automatic run retries; attempt>1 is blocked. Concurrency serializes jobs but is not a cross-dispatch single-use authorization store: the operator must inspect prior run history before the ONE approved dispatch and must not dispatch a replacement after failure without new approval. Refusal, timeout, malformed/oversize response, unknown pagination, clock reversal or deadline stops the sequence. A failed/uncertain attempt is never resumed automatically.

## Implemented offline

- sip-access-diagnostic.mjs: fixed routes, request/time/body/report caps, stop behavior, per-response ages, all-seven-field sample revision comparison, no ambient fetch.
- tools/run-sip-access-diagnostic.mjs: inactive guarded entrypoint. Requires manual main workflow identity, attempt1, pinned source/plan/workflow hashes and a dated scoped approval before reading existing bindings into its client. Ordinary execution fails closed.
- test/sip-access-diagnostic.test.mjs: mocked full orchestration, failures, actual bounded HTTP adapter with mocked streams, CLI refusal. No provider calls or credentials.
- The [pinned proposed workflow](validation/sip-access-diagnostic.workflow.yml.proposed) remains outside .github/workflows; [manifest](validation/sip-access-diagnostic-manifest.json) pins source b8e0fe8ccaabe35642af16e9317a6fcf67d45d9c and each exact file hash. No accepted contracts source is changed.

The runtime stores no raw provider responses, identifiers from private state, holdings or account details. Raw bodies are bounded in memory only. The report contains endpoint IDs, HTTP status, counts, clock ages, sample revision counts and fixed claim exclusions. Numeric rate headers are allowlisted; error strings/provider bodies/credentials are omitted. There is no price, BBO, symbol-level dataset or decrypted state artifact. Aggregate-only reporting intentionally cannot support later trading-case admission.

## Protected execution proposal

After independent review, approval would cover only installation of the final proposed workflow, one manual run on this date with immutable source/plan/workflow hashes, and binding the already-existing ALPACA_KEY/ALPACA_SECRET to its protected step. No new secret, PRIVATE_KEY, research encryption key, broker endpoint, Telegram binding, permission escalation or normal-bot substitute. Repository permission contents:read, checkout persist-credentials:false, job20min, no pushes.

The proposed wrapper verifies the fixed source and plan hashes BEFORE the protected credential-bearing step; the runner rechecks source/plan/workflow/approval. No arbitrary repository script is run instead.

The report upload is bounded to one <=16KiB JSON file, retention3days; upload failure is UNKNOWN durability, not successful collection. Hard interruption may lose the report. An existing or partial report path fails before transport and is never overwritten. Recovery is download of that existing aggregate report only; no repeated provider calls, financial recovery or automatic second run. Artifact acknowledgment is not independent remote-byte verification.

Before execution the operator must verify protected workflow permissions/guards, existing binding availability without displaying values, calendar/date, source and report-storage quotas. A single authorization must specify workflow bytes, source SHA, plan hash, date, exactly seven attempts and current binding. No unused earlier preflight/capture authorization is repurposed.

## Evidence and separation

Monday **2 November** natural watcher/premarket verification remains a separate passive task: DST timing, successful/refused SEC/provider sources, archive/save publication and delivery state. No observation is inferred from tests or this proposed diagnostic. No acceptance closure, prospective admission, strategy adoption or endorsement follows from either source of operational evidence.

The 20-session comparison, 60-second grace and two-minute volume freshness proposal remain unapproved. This diagnostic may falsify assumptions in its sample; it cannot establish general settling, coverage or rate guarantees.

## C1 timing and C2 result contract revision

Proposed dispatch: **3 November 2026, 10:50 New York / 18:50 Kuwait**, ten minutes before T0. Setup may finish later; the runner permits startup only between T0−10 minutes and T0+30 seconds. Starting outside this interval refuses before reading credential properties or making requests. It waits to T0 inside the runner; it does not depend on an exact scheduler launch. Scheduling/setup delay beyond 11:00:30 New York refuses. The date does not roll forward automatically, and a refused run does not authorize a replacement.

11:00 is a practical mid-session sample, away from the open/close, after the US DST transition. It is not empirically privileged and establishes no premarket/small-cap or full-session coverage. Kuwait remains UTC+3; New York on this date is UTC−5. This is a proposed time, not owner approval.

The protected wrapper and independent finalizer accept only the exact twenty codes in [sip-access-result.mjs](../sip-access-result.mjs), jointly with exit0/1/2. Any unknown/malformed/oversize output or code/exit mismatch becomes ERROR. PASS with exit1,2,124,137 or143 is ERROR. No input values, identifiers, provider text or secrets appear in refusal reasons. The runner uses a core HTTPS single-attempt adapter, not native fetch with implicit connection retry. The workflow verifies immutable bytes before binding, then the runner verifies source, plan, workflow and scoped approval again.

[Correction report](sip-access-c1-c2-review.md) records execution evidence and first failed tests. [Action provenance](validation/sip-access-action-provenance.json) records official repository tag/commit lookups. The attached Claude review/harness are not yet readable in this failed execution environment; no claim to reproduce that harness is made.
