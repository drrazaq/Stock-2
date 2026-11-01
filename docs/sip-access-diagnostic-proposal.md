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

The inclusive bar end is T0 minus 1ms, so the open minute is not requested. A page token means INCOMPLETE_PAGE and immediate stop; absence of a returned bar is not proof of no traded volume. One repeat measures sampled revisions, never a universal REST settling period. Rate-limit header numbers describe these responses, not sustained limits. This does not reconcile all minute volume, determine halt rights, prove quote units through an account test, guarantee fills or validate profitability.

Hard limits: 10 seconds per HTTP request AND body, 128KiB/body, 896KiB cumulative response bytes, 16KiB report, 180 seconds total runtime, seven attempts. No automatic run retries; refusal, timeout, malformed/oversize response, unknown pagination, clock reversal or deadline stops the sequence. A failed/uncertain attempt is never resumed automatically.

## Implemented offline

- sip-access-diagnostic.mjs: fixed routes, request/time/body/report caps, stop behavior, per-response ages, all-seven-field sample revision comparison, no ambient fetch.
- tools/run-sip-access-diagnostic.mjs: inactive guarded entrypoint. Requires manual main workflow identity, attempt1, pinned source/plan/workflow hashes and a dated scoped approval before reading existing bindings into its client. Ordinary execution fails closed.
- test/sip-access-diagnostic.test.mjs: mocked full orchestration, failures, actual bounded HTTP adapter with mocked streams, CLI refusal. No provider calls or credentials.
- Proposed workflow will remain outside .github/workflows. Its final source pin/manifest follow the first code checkpoint. No accepted contracts source is changed.

The runtime stores no raw provider responses, identifiers from private state, holdings or account details. Raw bodies are bounded in memory only. The report contains endpoint IDs, HTTP status, counts, clock ages, sample revision counts and fixed claim exclusions. Numeric rate headers are allowlisted; error strings/provider bodies/credentials are omitted. There is no price, BBO, symbol-level dataset or decrypted state artifact. Aggregate-only reporting intentionally cannot support later trading-case admission.

## Protected execution proposal

After independent review, approval would cover only installation of the final proposed workflow, one manual run on this date with immutable source/plan/workflow hashes, and binding the already-existing ALPACA_KEY/ALPACA_SECRET to its protected step. No new secret, PRIVATE_KEY, research encryption key, broker endpoint, Telegram binding, permission escalation or normal-bot substitute. Repository permission contents:read, checkout persist-credentials:false, job5min, no pushes.

The report upload is bounded to one <=16KiB JSON file, retention3days; upload failure is UNKNOWN durability, not successful collection. Hard interruption may lose the report. Recovery is download of that existing aggregate report only; no repeated provider calls, financial recovery or automatic second run. Artifact acknowledgment is not independent remote-byte verification.

Before execution the operator must verify protected workflow permissions/guards, existing binding availability without displaying values, calendar/date, source and report-storage quotas. A single authorization must specify workflow bytes, source SHA, plan hash, date, exactly seven attempts and current binding. No unused earlier preflight/capture authorization is repurposed.

## Evidence and separation

Monday **2 November** natural watcher/premarket verification remains a separate passive task: DST timing, successful/refused SEC/provider sources, archive/save publication and delivery state. No observation is inferred from tests or this proposed diagnostic. No acceptance closure, prospective admission, strategy adoption or endorsement follows from either source of operational evidence.

The 20-session comparison, 60-second grace and two-minute volume freshness proposal remain unapproved. This diagnostic may falsify assumptions in its sample; it cannot establish general settling, coverage or rate guarantees.
