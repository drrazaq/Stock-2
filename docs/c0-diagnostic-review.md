# Inactive C0 operational diagnostic review

Prepared 29 October 2026. **Not installed, not dispatched, not authorized. Date UNSET.** The earlier 16 November date was illustrative and unapproved; it is no longer a scheduled assumption. Evaluation thresholds in the [aim-to-evidence plan](aim-to-evidence-acceptance-plan.md) also await agreement.

## Purpose and exact review package

Determine whether the specified feed/reference can support bounded premarket coverage and recoverable evidence. C0 cannot measure strategy detection lead, delivered alerts, executable fills or profitability. Zero prospective cases are admitted. Broad Alpaca SIP availability remains NOT ESTABLISHED; delayed Massive discovery is not fresh whole-market surveillance.

The dedicated [runtime](../c0-diagnostic.mjs), [guarded CLI](../tools/c0-diagnostic.mjs), [independent offline recovery](../tools/recover-c0-diagnostic.py), [failure tests](../tests/c0-diagnostic.test.mjs) and [proposed workflow](validation/c0-diagnostic.workflow.yml.proposed) are separate from retired collectors and offline hybrid CLI. See [machine-readable review](validation/aim-collection-review.proposed.json) for the immutable runtime pin and exact workflow/dependency hashes after publication. A following review-only commit supplies those hashes; pending pins cannot authorize execution. The workflow remains outside .github/workflows. No existing secret or permission has been altered.

The proposed workflow would bind only existing ALPACA_KEY, ALPACA_SECRET and RESEARCH_ARTIFACT_KEY (aliased C0_ARTIFACT_KEY). No value is needed in the approval. Its proposed contents:read permission, disabled checkout credentials and absence of push/order/Telegram code are review constraints; installation and those bindings require separate authorization. No Massive binding is selected, so allowDelayedBaseline must be false. Optional delayed transport exists only for a separately reviewed proposal, always labelled nominal 15-minute delay.

## Scope and hard limits

One owner-selected, calendar-validated trading date; proposed 08:45–09:00 America/New_York window, three observations due 08:45/08:50/08:55. UTC is derived for that date, not copied across DST. Approval must be dated within 24 hours before start, reference exact immutable runtime and workflow bytes, and confirm entitlement. No date rollover, automatic retry, resume of uncertain work or same-day second run. Late start over 30 seconds, expired/retrograde clock or incomplete previous cycle stops collection. Each cycle has its five-minute deadline and ten-minute monotonic guard; job ceiling 20 minutes includes uploads. Failed uploads prevent later collection; remote durability is not inferred from local success.

| Resource | Enforced maximum / behavior |
|---|---|
| Application HTTP attempts | 400 cumulative, including three public GitHub run-history guard GETs. With 100 batches the selected no-Massive plan needs at most 304 attempts: 1 assets +300 SIP +3 history. No retries. |
| Pacing | At most 60 attempts/minute, evenly paced across independent cycle processes; owner manifest can lower caps. Source-specific stricter terms govern. |
| Transport | GET only to fixed public GitHub history, paper Alpaca assets, Alpaca SIP snapshots; redirects refused. 15-second request/body deadline, aborted even when fetch ignores abort. Stop on any HTTP failure, including 401/403/429; no feed fallback. |
| Universe | At most 20,000 reference rows, unique literal symbols/provider IDs; freeze sorted active/us_equity/tradable subset before outcomes. No post-outcome sample or dash/dot class guessing. All exclusions/missing rows retained. Current reference is not a historical common-stock universe. |
| Response bounds | 8 MiB per body (history additionally 1 MiB), 128 MiB cumulative; streamed chunk/schema/depth/duplicate-key bounds. Max 200 symbols/request, at most 100 batches/cycle. |
| Local storage | 128 MiB plaintext frame bytes, 64 MiB gzip, 96 MiB sealed bytes cumulative; 900 frames; each sealed file at most 12 MiB and uncompressed frame at most 9 MiB. No plaintext snapshot files. Exceeding any cap stops rather than truncates into success. |
| Artifacts | Only encrypted cycle files, each cycle uploaded separately, three-day retention; no cumulative duplicate uploads, no quote logs, owner state or private repository state. Control-plane checkout/setup/upload traffic is outside the application HTTP cap; bounded separately by job time and artifact bytes. |

Each HTTP intent is authenticated and sealed BEFORE transport. Response raw UTF-8 bytes/hash, request ID/kind, first access, original clocks, missing/invalid/future rows and frozen universe are retained. AES-256-GCM with existing research-key derivation authenticates source and checkpoint path; writes use exclusive atomic link/fsync, never overwrite. Persistent restoration checks sequencing, approval/source, budgets and previous cycle completion. Public GitHub date-history GET (no token) plus job concurrency rejects another/unknown same-day manual run and attempt>1, including one that failed preflight. Conservative refusal is intentional; no same-day re-run authorization is implied.

Metrics include requested/received/interpretable/fresh denominators, p50/p95 quote/trade ages and request latency. Raw quote sizes are retained without treating them as executable capacity. Missing/future/stale evidence receives no freshness credit. LOCAL_COLLECTION_COMPLETE says only local collection; remoteUploadVerified remains false until actual artifacts are independently checked. No BUY or strategy evaluation is produced.

## Recovery and shutdown review

Three uploads have success gates between collection steps. A failed collect may attempt best-effort encrypted recovery upload of only its failed cycle; an unknown/failed upload is not retried blindly. Hard cancellation, runner loss, storage failure or artifact quota can lose unuploaded frames. A local upload-step acknowledgment is not independent remote-byte authentication, and neither synthetic fixtures nor an existing key challenge proves a future upload. Every missing cycle must remain incomplete.

After a separately authorized run, download within three days and extract each artifact into a local root preserving cycle-0/, cycle-1/, cycle-2/ (do not flatten). Verify hashes against the pinned review, then on a trusted offline Python environment with cryptography use:

```text
python3 tools/recover-c0-diagnostic.py INPUT_ROOT NEW_OUTPUT RUNTIME_SOURCE_SHA APPROVAL_SHA256
```

The tool requests the existing research key interactively without displaying it or placing it in argv. Approval hash is SHA256 of the exact JSON.stringify approval object used by the runtime. Authenticate all present tags, source/path/approval/sequence, request/response pairs, raw-body digests and end markers before creating new plaintext output. Reject tampering, wrong key/source, gaps, duplicates, symlinks and budget expansion. Partial valid evidence may be recovered forensically without claiming full collection. Keep decrypted licensed data private; do not commit it. Never substitute a legacy proof/key tool or alter secrets.

Shutdown on entitlement/HTTP failure, malformed/unexpected reference or snapshots, budgets/time, unknown previous upload, identity conflict or authentication failure. No subsequent provider request or real notification follows failure. No independent retry or approval extension is authorized.

## Verification, readiness and next decision

44 focused fixture cases include actual independent CLI processes, a synthetic pinned Git/workflow caller with mocked transport, provider errors/timeouts/body budgets, persistent limits and universe, tamper/wrong-key/partial-frame recovery and the inactive workflow's upload gates. Complete Node/Python and static evidence is recorded in validation/c0-diagnostic.json; hosted CI must be verified on its exact published SHA. These are offline failure tests, not provider observations or proof that GitHub uploads survive cancellation.

Engineering readiness remains FAIL (24/40); bounded collection readiness remains FAIL pending official entitlement, reviewed source/workflow, quota/recovery preflight and dated approval. Narrow offline runtime preparation passes only its documented fixtures. Paper and owner-executed alert readiness remain FAIL; aim profitability NOT ESTABLISHED. CATALYST-03 and ACTIONS-04 stay open.

The exact missing non-secret official evidence is listed in [Alpaca evidence](c0-alpaca-entitlement-evidence.md). Complete that reconciliation first, then the next owner decision is whether to authorize ONE dated, pinned operational diagnostic with these bounds and existing bindings. Preparation does not request or imply execution. If entitlement disallows SIP or retained evidence, reject/revise the proposal instead of collecting.

The former 5–10 engineer-day runtime estimate and 2–4 day Share-supply estimate are superseded by completed source/offline work. Allow roughly 1–3 further engineer-days for independent review, entitlement-driven corrections, final date/manifest and preflight preparation after evidence arrives; external response/approval time is unknown. C0 has no promised date. Remaining broader source/writer/normalization/delivery/spec allowance is still provisionally 15–30 engineer-days and needs per-path sizing. C1/full-session and C2/paper require new preparation and approval after C0; historical and prospective observation periods in the aim plan remain conditional. No date for profitable trading can be promised.
