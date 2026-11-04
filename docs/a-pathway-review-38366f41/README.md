# Independent review: A catalyst-reclaim pathway at 38366f414b4cb56af69c2ff873c58e6c5a03bddd

Reviewer: Claude, 4 Nov 2026. Offline. All inputs are synthetic: the committed `example.synthetic` and `docs/examples` inputs, plus mutated copies of them. There was no collection, provider call, workflow action, message, trade or pilot start.

| Verdict | Result |
|---|---|
| **Engineering** | **PASS WITH FINDINGS.** Fix A1 and A2 before any pilot use. |
| **Pilot readiness** | **NOT READY.** The preconditions in §3 are unimplemented. |
| **Strategy evidence** | **NONE.** Synthetic software tests only. NOT PROVEN, and no promotion. |

## 1. Executed evidence (Node 20, `env -i`)

- **Tests:** the three test files pass on Node 20.
  - `test/catalyst-reclaim-prototype.test.mjs`: 20/20.
  - `test/reclaim-research-workflow.test.mjs`: 46/46.
  - `test/a-catalyst-reclaim-store.test.mjs`: 27/27.

  That is **93/93**. The doc's Node 24 claim is reproduced on Node 20.
- **Runner CLI:** `node reclaim-research-runner.mjs --input docs/examples/reclaim-synthetic.json` writes JSON to stdout only, with `allowBuy:false` and `realDollars:0`.
- **Store CLI:**
  - Ran it on the committed synthetic input into a fresh 0700 directory: 2 observations, 1 outcome, 1 card, no pending work, lock released.
  - Ran it again on the same directory: idempotent, and identical output.
  - All three JSONL logs are byte-identical to the committed `example.synthetic/generated`.
- **Adversarial probes** (`probe.mjs`, `probe2.mjs`, `probe3.mjs` here; run with `node probeN.mjs <checkout> [tmp0700dir]`):

| Probe | Result |
|---|---|
| Second writer while the lock is held | refused (`EEXIST`); `inspect` reports the lock |
| Partial line appended to the observations log | `TRUNCATED_LOG_NO_AUTOMATIC_REPAIR`, the store stops |
| Second share class, same issuer and session (store) | logged, `newPaperEntry:false`, `CANDIDATE_ALREADY_CARDED`, still 1 card |
| Outcome sequence: incomplete closes, then complete, then different evidence | UNRESOLVED kept, MODELED kept, third refused `RESOLVED_OUTCOME_IMMUTABLE` |
| Same issuer and session under a second observation ID (runner/summary path) | **counted twice: 2 resolved units** (A1) |
| Ask $5.00, $1,000 budget, 0.25% slippage | **card 199 shares, outcome 198 shares** (A2) |
| `zadAsOf` set to 2024-01-02 | **accepted: PAPER_SETUP_ONLY** (A3) |
| Arbitrary `https://example.invalid/...` URL plus an all-zero 64-hex document hash | **accepted** (A4) |
| A carded observation with no exit evidence | listed in `missingOutcomeIds`; **means and sums exclude it** (A6) |

## 2. Findings, mapped to the six review points

1. **Evidence before entry (no hindsight):** structurally sound.
   - Every quote, bar and catalyst clock is checked: `availableAt` or `observedAt` must be ≤ decision time, and the quote's time plus its declared delay must be ≤ decision time.
   - Market cap must be at or before the prior close, and liquidity before the open. Bars must be contiguous and completed, and the trigger must be the last completed bar with a quote after it.
   - **A4: source authentication is format-only.** The `VERIFIED_MATERIAL_AGREEMENT` label, an https URL and a 64-hex hash are accepted as given; nothing is fetched or re-hashed. **A5: outcome evidence is likewise unauthenticated**, and the operator chooses which exit-evidence set is submitted first. Immutability then protects that choice, but does not prevent choosing in hindsight.
2. **One paper entry per issuer/session; rejections retained:** the **store** does this correctly. Rejections and repeats are logged, and the card is keyed by issuer, session and policy. **A1:** the **runner and summary** path (the CLI shown in the prototype doc) has no issuer-session dedup, so a repeated observation becomes a second independent unit in the descriptive statistics.
3. **Input, card and policy linkage; immutable outcomes:**
   - **PASS:** the hash chain, intent and commit binding, card re-hash, the outcome-to-original-card and input check, and the review-note append without replacement all hold.
   - **A2:** the card's `paperShares` is `floor((budget−3)/ask)`, but the outcome uses `floor((budget−3)/(ask×(1+slippage)))`. So the card can state one share more than the outcome measures.
4. **Crash recovery, duplicates, damaged tails, stale locks:** behaves as documented.
   - Duplicates are idempotent, conflicts are refused, and damaged tails stop the writer. Pending intents block new writes until `recoverPending()`.
   - **A7 (limit):** after a hard exit, the lock prevents even opening a store to run `recoverPending()` until an operator deletes it by hand. There is no reviewed repair tool for a damaged tail.
5. **Whole-share costs, exit precedence, missing outcomes:**
   - **Costs:** $3 per side, slippage on both sides, spread counted once, and cash-inclusive unit return. Correct.
   - **Exit precedence:** a close below the opening low leads to the next open. On the last day it stays a fifth-close exit. Correct.
   - **Execution size:** too little displayed size gives UNRESOLVED. Correct.
   - **A6:** missing outcomes are listed, but the means, sums and win rate are computed over resolved units only. There is no bound or worst-case treatment, despite the protocol requiring that missing outcomes "count against the sample".
6. **Missing implementation (exact):** see §3.

## 3. Not implemented (pilot preconditions; none is waived)

- **Authenticated sources:**
  - fetch the catalyst document and re-hash it;
  - parse amount, currency, contingency and parties;
  - provider receipts for quotes, bars and closes;
  - an authoritative calendar and security/issuer mapping (currently "structurally checked, not authenticated").
- **Current ZAD validity:** no validity window exists (A3). The handbook treats marks older than 90 days as "check ZAD again". The evaluator accepts any past `zadAsOf` together with `zad:'YES'`.
- **Population:** no candidate source and no complete-denominator mechanism. The store records only the observations supplied to it.
- **Controls:** `NOT_IMPLEMENTED`, and set to null in every outcome. Same-stock and same-day universes are not frozen.
- **Acquisition caps:** only storage caps exist (64 MiB per directory, 1 MiB per line). There are no request, endpoint or daily caps, and no dates or universe.

## 4. Scope notes

- **Coordination:** the historical-audit invocation and provider requirements belong to the existing Codex task and were not duplicated here. IG1 data feasibility is not A validation.
- **Not done:** no redesign and no added indicators.
