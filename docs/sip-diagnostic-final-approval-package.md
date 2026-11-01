# Exact SIP diagnostic approval package — prepared, NOT authorized

Scope: installation of only the byte-identical proposed workflow and, separately, ONE dated manual seven-request diagnostic using existing bindings. No installation, dispatch, credential use or provider call has occurred. This is not V2 capture, strategy evaluation, a feed switch or trading authorization.

## Immutable reviewed bytes

Independent Claude review is published at6465c071d7206e3f089063fa448eb2d1076610dc, docs/reviews/claude-2026-11-01/REVIEW-sip-diagnostic-pr5.md (SHA256 b1cfe86715d520175a6da68bd32b5127502535951b08892735280039d240e9af). Verdict PASS, inactive package only; C1/C2 closed. Reviewed PR5 head510ef31cb90c9623ee8a0170cfed1010ebfd28bf and diagnostic bytes at71cccb62 are identical. Runtime is pinned to b8e0fe8ccaabe35642af16e9317a6fcf67d45d9c.

| Item | SHA256 |
|---|---|
| Proposed workflow docs/validation/sip-access-diagnostic.workflow.yml.proposed | 5c707d1df5494398e13068eab82f7f02464b0a00ae805a90d87c3bb656c6d1c3 |
| Runner/checker tools/run-sip-access-diagnostic.mjs | 2728669651e1fcdb9f1ff01af457bf7dd13cbf89da92fcb3b551cbf4e2499866 |
| Client/orchestration sip-access-diagnostic.mjs | 8810a1220102786119b3fdf0caf296b8a38412c87bd9f3c1bc5ee9cb58d35d8a |
| Single-attempt HTTPS sip-access-https.mjs | cd82157e48daf7c53822c2a0fb2e1ea6f01433058ee0ac61bb20c8bc47dccfd9 |
| Fixed result contract sip-access-result.mjs | 01a3c1859003e49a5caf5001bfd6219faf3fcf88b68549b81127528ea09a337b |
| Validator tools/validate-sip-access-result.mjs | 7a6b93e17edb4a1dd3250d0028cc1d3f06aa355a158b7eefeed9839e6b260744 |
| Pinned plan docs/validation/sip-access-plan.proposed.json | c83fd81e8a8f71f9791683abc24901b901248209b9529d8b89f9c126e4dcfb05 |

Installation, if later approved, must preserve EVERY workflow byte, including the INACTIVE REVIEW COPY comment. A changed byte requires a new reviewed hash. Install no other development code. The workflow separately checks source/plan hashes before binding credentials; the runner rechecks all five runtime files, Git HEAD, workflow, plan and scoped approval. Main must be freshly reconciled before installation; these historical checks are not authority to overwrite newer work.

## Proposed date and exact timing

Tuesday3November2026. Proposed dispatch10:50New York /18:50Kuwait /15:50UTC; sample T0=11:00New York /19:00Kuwait /16:00UTC. This is a practical mid-session choice after DST, away from the open/close, not empirically privileged or owner-approved. Monday2November's natural-run/DST verification is separate.

Runner entry window:10:50:00–11:00:30New York. Earlier/later starts refuse before reading credential properties or making requests. A valid early runner waits internally until11:00. Data deadline11:03New York/19:03Kuwait is absolute; late starts do not extend it. Runner ceiling790seconds, outer timeout800seconds plus5-second kill grace, job20minutes including setup/upload. Scheduling/setup latency is not guaranteed. No automatic replacement or retry after a refusal/failure; inspect run history before the one authorized dispatch.

The approval JSON must contain the ACTUAL approval time within24hours before T0 (earliest2November16:00UTC/19:00Kuwait). Do not backdate or invent a later approval timestamp for an earlier authorization. If the window/date is missed, stop for a reviewed dated scope rather than silently rolling the plan forward. The example remains granted=false and approvedAt=null; the plan's approved=false is not changed.

## Bindings, permissions and outputs

Only existing ALPACA_KEY and ALPACA_SECRET are explicitly bound to the protected step. No new secret or permission; no PRIVATE_KEY, broker, Telegram or financial-state access. SIP_APPROVED_SOURCE is a non-secret immutable code pin. Repository contents:read, checkout persist-credentials:false, main/manual identity, attempt1 and concurrency without cancellation. Standard upload-artifact uses the existing Actions runtime mechanism, not a new owner secret.

The key values ARE present in the protected step environment during the bounded early wait (up to10minutes), although the runner reads them and constructs transport only after the time gate. Approval must acknowledge this distinction. Do not send key values in chat or put them in approval JSON.

Stdout is one of20 fixed allowlisted codes paired with exit0/1/2. Wrapper and independent finalizer jointly validate code, exit and native step outcome. Unknown/malformed output, mismatches, PASS with timeout/interruption/failure, missing files or result-write failures become ERROR. No identifiers, input values, provider text, prices or secrets in refusal codes. The aggregate report is at most16KiB: endpoint IDs/statuses/counts/ages/latencies/numeric rate headers only. Quote ages include runner clock skew; they are not exchange-latency guarantees. No raw BBO, price, body, private record or trading-case dataset is retained.

## Exactly seven requests; separate authorization boundaries

Reference preparation0 + diagnostic SIP sampling at most7 = combined application maximum7. Existing watcher operations, proposed V2 capture and any future reference collection have separate scopes. GET only to data.alpaca.markets, feed=sip, fixed public sample SPY/AAPL:
1. snapshots;
2. latest quotes;
3. latest trades;
4. raw1Min bars over five CLOSED minutes before T0;
5. repeat that IDENTICAL window at T0+90seconds;
6. raw1Day bars over the declared previous session;
7. AAPL trades for the ten seconds before T0.

No redirects, retries, IEX fallback, pagination followups or additional symbols/endpoints. Per request/body10seconds;128KiB/body;896KiB cumulative body bytes;16KiB aggregate report. These are application/body limits, not TLS wire-byte quotas. First refusal, timeout, malformed/oversize body, unknown pagination, clock regression or deadline stops the sequence. A last-slot oversize response is a legitimate incomplete result, not permission to retry.

One report may be uploaded with3-day retention. Artifact upload/ack failure means UNKNOWN durability; a report can be lost after cleanup or interruption. Do not claim it was retained merely because the diagnostic completed. Existing/partial local report paths are not overwritten. Cleanup removes the exact temporary approval/report/raw/code/exit paths after upload/finalization; no financial state or offsets are touched. No automatic recovery or new provider request is authorized by failure.

## Evidence and unresolved follow-up

Claude independently ran all24 author tests and all16 real TLS harness scenarios on Node22.22.0, the proposed target runtime; seven key TLS scenarios were also repeated onNode20.20.0. Published https-harness.mjs SHA25666cc56a5945436b9a51603ff0b0fa5e7ab29be9fab31564889cce5af55dbfa18; wrapper-harness.py SHA256c2ee604621cd3af3162d65a2294a66350a801a0c06331cb819150a7d2b1f5c3a. These are CLAUDE's executions, not this author rerunning her harness locally. Hosted CI is separate and did not proveNode22 in its skipped cache probe. Exact-target evidence is now supplied by the independent review. Node22 is not an additional40-row acceptance criterion; observer/production watcher targetNode20.

F1 remains an honest follow-up: one Node20 corrections test failed once in12 concurrent-load runs, but the review did not retain the failing case/log. This cannot be classified retrospectively as a harmless fixture issue or a runtime defect. The current real-path fixture has a potential signal-readiness race (preload ready precedes application handler registration; fixed50ms wait), but it is not proof of F1's cause. Preserve the1/12 observation; capture case-level output under controlled load before claiming resolution. Independent review classified it non-blocking; this package does not represent it as fixed.

Action provenance is author-verified against official GitHub tags/commits: checkoutv4.2.2=11bd71901bbe5b1630ceea73d27597364c9af683; setup-nodev4.4.0=49933ea5288caeca8642d1e84afbd3f7d6820020; upload-artifactv4.6.2=ea165f8d65b6e75b540449e92b4886f43607fa02. Claude checked consistency but did not independently resolve those repositories. This is provenance, not a complete action security audit or actual execution of the proposed workflow. No installed-run timing/upload/cleanup evidence exists. Five original check-runs across three workflows are named in the linked provenance JSON; do not call them five workflows.

Subscriptions are confirmed: Alpaca Algo Trader Plus and Massive Stocks Starter15-minute delayed. The run can establish sampled binding access, responses, ages and revisions. It cannot establish general settling/coverage/rate guarantees, total traded volume, executable fills, whole-market real-time surveillance, profitability or any acceptance closure. Proposed20-session/60-second/two-minute thresholds remain unapproved.

## Exact additional decision (not requested by installation or execution here)

After reviewing these exact bytes and limitations, the owner may approve only: byte-identical workflow installation plus the existing two bindings and ONE dated manual run within this window, with a valid actual approval timestamp. No full development PR merge, observer activation, V2 adoption/collection, new feed routing, messages, orders, purchases or secret/permission changes. An independent PASS does not grant this approval.
