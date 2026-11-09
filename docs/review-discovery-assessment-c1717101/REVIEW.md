# Independent review: discovery-to-assessment checkpoint `c1717101` (source `16c72e0b`, Codex 6747535500)

Offline review. No setup, acquisition, dispatch or production change. The release reviews stay closed. Reviewed time: Monday 9 November 2026, 18:15 UTC.

**Verdict: CORRECTIONS REQUIRED.**
- **J1 (data loss) and T1 (selection depends on how often the command is called)** are mandatory.
- The reproduction, the counting, identity labelling, legacy-reader safety, outcome-join strictness and the price-path diagnosis pass.
- Company finding labels need two corrections (C1, C2).
- The seven-request proposal should **not** proceed as framed (§5).

## 1. Reproduced (PASS)

`tools/assessment-flow-checkpoint.mjs 46be9039… 2026-11-09T17:18:16Z` on exact `16c72e0b` reproduces Codex's figures:
- **7,393 rows / 3,000 ticker labels**;
- SELECTED 6 / EXISTING_EXCLUSION 24 / ALREADY_INVESTIGATED 5 / DEFERRED_BATCH_CAP 1,189;
- the same six selections;
- "RECORDED 6 assessment versions";
- **0 external requests**.

Other checks that pass:
- **Identity wording:** the population reports `verifiedEligibleIssuers: 0` and `issuerInstrumentDedup: UNRESOLVED`. The count is never presented as issuers.
- **Outcome join:** an individual net-after-cost figure appears only for a unique versioned witness with an authentic, independently reviewed complete chain. Aggregates and later prices cannot fill it.
- **Legacy reader:** the old `discover.mjs` (`a0f51bc5`, lines 409–412) keeps only rows with `x.d` and a matching `x.sym` close, so `type:'assessment'` rows without `sym`/`d`/`price` are ignored. The new `discover.mjs` filters them explicitly.
- **Price-path diagnosis:** correct. `intraday()` does not regenerate `signals.json`, so a daily close is not a current quote, and the card now says so.

## 2. J1 (mandatory): cross-job journal writes lose rows

- `opportunitiesText` → `researchAssessmentCycle(…, record: true)` now **appends to `data/discovery-journal.jsonl` from the Telegram bot** (the `opportunities` reply). Until now only `discover.yml` wrote that file.
- The `radar-ledger` lock is a per-machine file lock. The bot and `discover.yml` run on **different runners**, so the lock gives no protection between them.
- **Reproduced with git:**
  1. the bot appends an assessment row and pushes;
  2. `discover.yml` appends a discovery row and saves with its existing `git pull --rebase -X theirs`;
  3. the result keeps only discover's tail. **The bot's assessment row is silently dropped.**

  The bot's own path (plain rebase, then abort and retry five times) can fail the save instead.
- **Required (one of):**
  - record assessments in a **separate append-only file with a single writing workflow**;
  - or keep the shared file but make every writer use a line-union merge for it, with a test using both actual save scripts.

  Either way, add a two-writer git test like the one above.
- **Also:** a read command (`opportunities`) now changes shared state. If recording stays in the reply path, it must be idempotent per source cycle (see T1). Otherwise move it to a scheduled producer.

## 3. T1 (mandatory): selection depends on invocation count and incidental regeneration

Reproduced with `triageAssessments` on the pinned inputs, passing the already-recorded IDs forward:

| Call | SHORT | MID | LONG |
|---|---|---|---|
| 1 | GRMN/TIGO | ACRE/AD | CNNE/RNG |
| 2 | VGZ/GEF | AIRS/AMR | CARG/ASAN |
| 3 | KTB/ASTS | ANIK/ATMU | OIS/TALO |
| After only `quality.json`'s `generatedAt` changes | GRMN/GEF | AMR/ATMU | CNNE/RNG |

1. **Each call selects and records the next names.** The "bounded batch" grows with how often the owner types the command.
2. `evidenceVersion` hashes every row's source **metadata, including output `generatedAt`**. An unrelated regeneration (for example the Sunday quality study) therefore makes already-recorded names "new versions", and they are re-selected and re-recorded.

**Required:**
- Define a **cycle key** from the source sessions, not generation times.
- Select **once per cycle**, so repeat calls show the same batch and record nothing new.
- Compute `evidenceVersion` from source facts and source session dates only, excluding output-generation clocks.
- Add tests: a repeat call does not change the batch, and a regeneration-only change keeps the IDs.

## 4. Company findings (logic review only)

**Limitation:** `www.sec.gov` is not reachable from this environment (proxy `connect_rejected`), and I did not change the environment. **The six primary-source reconciliations are therefore not independently verified.** Codex's citations and caveats are internally consistent.

- **C1. VGZ "PASS on a simple standalone crossover case":** the label contradicts the facts given. Under a pending fixed-ratio share exchange (0.0966 Artemis per VGZ), VGZ's price is tied to the acquirer and the deal spread. A short-term crossover is not a standalone signal, and the existing short rule was not tested on pending stock-for-stock targets. Label it **EVENT-PINNED: no standalone short assessment / INVESTIGATE transaction**, not PASS.
- **C2. ACRE "PASS on present entry case":** the card has no core scanner row, no adopted priced plan and ZAD unknown, so nothing passes. Label it **INVESTIGATE / WAIT**. Also show early that its business is interest-based commercial mortgage lending, so a ZAD 'yes' is required before any further spend. The owner's ZAD mark decides; nothing is inferred.
- **AD/ARRY identity risk confirmed from held data:** `data/sec-ciks.json` (main, 2,381 entries) contains **ARRY (CIK 1820721) but not AD**. A ticker-label join would mismatch. Keep "identity UNKNOWN" until the CIK is established.
- GEF (Class A/B basis), CNNE (report after close), RNG (tax-boosted EPS) and BE-style cash-versus-earnings caveats: these are sound as WAIT / INVESTIGATE.

## 5. The seven-request proposal: which decisions it actually enables

**It enables:**
1. **An engineering feasibility decision:** whether the research entitlement returns reference data and SIP snapshots under acceptable terms for hosted processing.
2. **Identity for six labels**, out of 3,000.

**It does not enable** any trading decision:
- none of the six meets an adopted admission rule;
- ZAD is unknown;
- a single snapshot is stale within minutes and cannot evaluate anything later;
- it does nothing for the population identity problem (6 / 3,000).

**Identity is largely answerable without acquisition:**
- already-held `data/sec-ciks.json` gives VGZ (783324), GEF Class A (43920) and RNG (1384905);
- for ACRE, AD, CNNE and GEF-B, the production code already reads SEC's official `company_tickers.json` (`discover.mjs` line 142; `scan.mjs` lines 1764, 1985, 2508) but does not persist it;
- a reviewed change that **persists the ticker→CIK map an existing ordinary run already downloads** would answer identity for the whole population, with no new provider, request budget or credential.

**Quote feasibility** for an intraday path is a production question. Production already has a reviewed quote path with feed provenance. A research snapshot of six names adds little until an adopted entry decision needs a live BBO.

**Recommendation:** **defer the seven requests.** Replace the identity half with the persisted SEC map: a code change, reviewed, with no acquisition. Revisit quotes only when a specific adopted decision needs them. Codex's own "first ask for an already-held original" step is satisfied in part by `sec-ciks.json`.

## 6. Operational observation for the release protocol (outside this checkpoint; not reopening source)

- **GitHub cron delivery is badly degraded:**
  - `main.yml` has **not run since 7 November 01:00 UTC**, with no Monday runs despite ten elapsed intraday slots;
  - on 5–6 November only 2–3 of about 17 daily slots fired;
  - on Monday no `news.yml` or scheduled `ignition.yml` runs fired (the watcher ran only because the guard dispatched it at 14:13);
  - lab and bot schedules still fire, some hours late.

  This is GitHub scheduling, not the billing block: other jobs start.
- **Consequence for `d2f76b64`:** B requires reconciling all 16 intraday slots. At current delivery most slots will be **missing for scheduler reasons**, so B cannot reach VERIFIED. The protocol already says a scheduler outage is FAILED/UNKNOWN and not a source regression, so this is consistent but will block a PASS.
- Codex and the owner should know this **before** session A. It is a feasibility input, not a reason to change any deadline.

## 7. Validation

My independent full root run on exact `16c72e0b` (231 root files plus instrument-type) is in progress; I will post the result separately. Codex's 317-file run is UNVERIFIED by Codex's own account.
