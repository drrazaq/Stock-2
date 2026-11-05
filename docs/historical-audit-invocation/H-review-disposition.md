# Findings disposition and one setup/custody rehearsal package

Review: Claude `4923b443f8af9eea381965b152ec2f6dabdefa5c`. Preparation only. **No setup, installation, bindings, rehearsal, provider request or deployment is authorized.** This report supersedes earlier historical-client/source pins and workflow proposals. The original scope hash, twelve cases,156 provider requests and frozen results do not change.

| Finding | Implemented / evidence | Remaining condition |
|---|---|---|
| H1 | Both `/v3/reference/splits` and `/v3/reference/dividends` explicitly request `limit=1000`. Actual-client regression obtains11 records instead of default10; `next_url` still seals response then stops, without page2/retry. Original Claude probe reproduced before/after; new regression distinguishes corrected behavior. | Public deprecated-route docs exist; actual serving/access is not tested. Massive must confirm continued support, or the authorized first request must be accepted as a possible failed batch. No substitution to `/stocks/v1` is authorized. |
| H2 | Frozen128MiB raw/160MiB sealed are ceilings, not simultaneous reachable capacities. Operational raw ceiling is now **112MiB**, below128. Base64 costs at most149⅓MiB for112MiB, leaving over10MiB for bounded metadata/AEAD/ZIP. Before an intent or counter is spent, reserve worst-case next response encoding plus32KiB metadata and64KiB final-record headroom. Regression refuses I/O with insufficient capacity. | A batch can still stop early on time, schema, page or storage bounds; no promise all156 requests finish. No limit is increased. |
| H3 | Real provider-free action/client prepared; near-cap roughly159MiB synthetic AEAD/STORE-ZIP passes local full-readback and fresh recovery. Actual action refuses missing approval. | **GitHub interoperability remains unverified.** One separately approved private rehearsal must pass before market-data execution. Mock success is not platform evidence. |
| H4 | Preserve ten-second full-body readback and120-second service phase. Record actual readback/remote timings. Actual local TLS stalled-body test proves ten-second timeout, one request, no retry. | Approved near-cap GitHub rehearsal must measure real full readback; timeout/refusal is ERROR, never readiness. Do not increase timeout after a failed rehearsal without review. |
| H5 | Runtime receipt producer runs after hash-verified readback, decrypts/verifies original context and terminal chain, checks canonical authorization hash, then exclusively writes a0600 private receipt. Offline CLI reconstructs the same receipt from original archive/approval/expected run and key. Actual CLI wrong-run, wrong-approval/ack and symlink cases refuse. | Real owner key custody and artifact-origin verification remain separate. A content-valid receipt does not itself establish who downloaded/uploaded it or whether custody survived an unavailable runner. |
| H6 | Exact consolidated questions below; no fabricated answer. | Applicable official provider answer/documentation and rights review remain pending. |

## Official deprecated-route evidence

Fresh public documentation GETs, no API/data call:

- https://massive.com/docs/rest/stocks/corporate-actions/reference-splits.md — HTTP200; SHA256 `dc21a5fa5677eecb5465b99d22d34149e9c0f01856b12527ff1972b8f5481aad`.
- https://massive.com/docs/rest/stocks/corporate-actions/reference-dividends.md — HTTP200; SHA256 `4ba93f2f24ccddfc25053e9a028aa7043c13c9a0cffd190703b4a636ef5e8d16`.

Both explicitly label the v3 endpoint Deprecated, describe default10/max1000, next_url, Starter inclusion, daily recency and all-history coverage. Current non-reference documentation describes different `/stocks/v1` routes; those are **not** silently selected. Public documentation establishes advertised support, not successful API access or a retirement guarantee.

## One proposed private setup and rehearsal

Use only proposed **drrazaq/stock-2-research-audit**, private and research-only, currently unverified. Never repurpose the financial mirror. First-stage setup needs **no provider secret and no RESEARCH_ARTIFACT_KEY binding**. Owner and explicitly activated Codex operator only; no unattended availability promise. No GitHub Environment is required. Standard private hosted Linux capacity must already include5 runner minutes,160MiB artifact headroom for3days and512MiB ephemeral working space; no paid overage/purchase/settings change. Actual account quota/access is unverified.

Install only the independently reviewed `custody-rehearsal.yml.proposed` bytes as `.github/workflows/custody-rehearsal.yml` in that private repository's default branch for registration and at dedicated `custody-rehearsal-once-4923b443`. Keep execution ref at immutable **W**. Separate private controls commit **C** holds `rehearsal-approval.json`, naming W and exact public source. Manual inputs: C and approval-file SHA256. Actual C/source checkout and manifest hashes are checked before action execution. Contents:read/actions:read only. GitHub's existing default read token and per-job artifact runtime token are the only service credentials. No provider, owner-key, financial, broker or Telegram binding is declared; the entry refuses them if present.

ONE owner-attended manual run, attempt1; same-ref complete history must contain only that run. Proposed window: **6 November2026,08:00–08:30UTC /11:00–11:30Kuwait**, awaiting owner/operator agreement and setup/review. It is not scheduled or approved. Latest start leaves240seconds; job limit5minutes, child limit240seconds. Approval template is disabled; dates are not owner-approved.

Run local ten-second TLS timeout proof first. Then generate roughly159MiB synthetic-only archive using an ephemeral random rehearsal key, create one private artifact, upload in8MiB blocks, finalize, download all bytes, hash-compare, verify ZIP/AEAD/context/terminal chain and recover into a fresh private directory. At most23 upload +3 recovery service requests, plus one bounded GitHub-history GET; no retries/fallbacks. Service phase120seconds, each wire request10seconds; maximum artifact160MiB, response64KiB except full archive. No provider-data calls whatsoever. The synthetic key is never logged/uploaded/bound and dies with the runner. This tests recovery mechanics, **not real owner key custody**.

Private job summary contains only synthetic receipt/context, archive size and measured timings; console emits only PASS/ERROR. Partial synthetic files may be lost on runner failure; failed rehearsal is not clearance. Always cleanup only the run-specific synthetic directory; artifact retention3days. No restart/retry is implicit. A failed/timeout run requires diagnosis and another explicit approval, not repeated attempts until PASS.

After this independent re-review, one approval may cover exact private setup and ONE provider-free rehearsal, specifying actual W/C/source/manifest/workflow/approval hashes, operator and confirmed window. Current code/workflow hashes are in package.json/rehearsal-manifest.json. Actual private W/C cannot be supplied before installation; setup alone never authorizes data execution. If the staged authorization cannot name the final W/C, obtain the single run approval after setup. No market-data run is included.

## Receipt production and private recovery

After capture/readback, `recovery-receipt-RUN.json` is written privately. Offline reconstruction:

`node tools/build-historical-audit-receipt.mjs ARCHIVE APPROVAL_JSON EXPECTED_RUN_ID EXISTING_PRIVATE_DIRECTORY`

Use the existing owner-held RESEARCH_ARTIFACT_KEY securely, never chat. The tool emits PASS/ERROR only. Source/scope/approval/run fields must agree with the authenticated archive's original RUN_CONTEXT; digest comes from actual bytes. Confirm downloaded artifact provenance/digest using authenticated platform evidence. Wrong context/key/approval, incomplete terminal chain or symlink destination refuses. Then use the existing recovery CLI; no provider resume, rescoring or original-record rewrite follows. The provider-free rehearsal uses its ephemeral synthetic key only; it does not exercise or certify the real binding.

## Exact unanswered provider questions (one list)

To Alpaca via https://alpaca.markets/support/:

1. On single-symbol `/v2/stocks/{symbol}/quotes`, is **asof=YYYY-MM-DD** supported, and what symbol/security mapping does it select for October15/16/19/20,2026? Is an unsupported parameter rejected or ignored? Do not assume bars-route semantics apply.
2. For a genuinely empty quote window, is the response `quotes:[]`, `quotes:null`, an absent field or another schema? How are no-access, unsupported symbol and unavailable history distinguished? Current client deliberately treats null/absent as incomplete, not empty.
3. Are `bs/as` shares or lots, with which date/security-specific mapping? Which c/tape combinations establish firm/protected rather than indicative/nonfirm quotes, and can quote-only responses identify halts? Quality checks never guarantee a fill.
4. Does historical output incorporate later corrections or reproduce original dissemination? No answer can recreate missing Stock-2 first-ingestion/delivery evidence.
5. Which applicable Plus agreement/version permits owner-only private hosted raw processing/storage for3days and recovery without redistribution or model training?

To Massive via **support@massive.com**:

6. Are the documented deprecated `/v3/reference/splits` and `/v3/reference/dividends` still served under Stocks Starter for this twelve-case historical request with limit1000 and the date filters? What retirement date or support restriction applies? No new route, extra call or fallback is authorized if unavailable.
7. Confirm applicable agreement/source restrictions for private hosted processing/three-day retention of identity/split/dividend responses where official personal/on-behalf clauses do not already settle them. Do not request redundant blanket permission if applicable official terms suffice.

No support message has been sent. Subscription ownership is confirmed; endpoint access, semantic applicability and current private custody remain unverified. Original scope, economic assumptions and evidence gates are preserved.

## A remains separate

Claude's4923 review independently passes A1/A2/A6 at7d3d6ba9; it does not pass A3–A5/A7. New A7 read-only inspection preserves opaque locks/damaged tails, hashes retained bytes and reports lock liveness UNKNOWN; it neither deletes locks nor repairs tails. Source/outcome authenticity remain NOT ESTABLISHED even for structurally valid stores. A3 needs an explicitly reviewed validity contract; A4/A5 need original authenticated source/exit acquisition and lineage, a complete population, controls and acquisition bounds. No date-age policy or authenticity is inferred from formats. A pilot remains NOT READY; zero real observations/admissions. Historical feasibility is not A validation.
