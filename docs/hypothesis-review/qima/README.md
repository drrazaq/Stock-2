# Qima-style relationship proposal — bounded hypothesis review

6 November 2026. **Recommendation: INCONCLUSIVE on the exact proposal; STOP new implementation and collection.** No new BUY hypothesis or five-rule programme is selected. No social-media data, provider request, scraping, experiment, filter, scoring blend, trading-rule change or production action.

**Input limitation:** the exact pasted proposal is absent from this accessible thread, repository search and PR1 handoffs. A request for its text is pending. This review covers only the user-described **catalyst → business relationship → another stock** mechanism; it does not claim to have read or rejected the unseen five rules.

Source baseline: development **5713011e426f21e283dccad286af096519f741e9**. The raw input artifacts remain unchanged. [Pins](source-pins.json) and [reproducible field inventory](retained-evidence.json) distinguish available records from unavailable original evidence. All returns below are already examined historical model results, not new tests, untouched holdouts, executable trades or admitted prospective cases.

## 1. Already implemented and tested

| Existing implementation | Economic overlap with the described idea | Preserved result |
|---|---|---|
| `chain-ripple.mjs`, `data/chains.json` | A chain member rises≥6% on2×volume; lagging same-layer peers or other-layer suppliers/customers enter next open, held3/10/20sessions. Also monthly customer momentum. | FirstRun: both3session ripple variants REJECTED;10/20session variants NOT PROVEN. CUSTOMER_TOP_21 NOT PROVEN. Same-stock comparisons and hindsight membership limitations are not removed. |
| `chain-decoder.mjs` / `chain-core.mjs`: CHAIN-DEMAND1 | A customer's guidance/capex earnings-filing catalyst → suppliers via customer disclosures/material agreements **or inferred upstream layers**. This already mixes factual-link candidates and capability inference. | REJECTED: frozen2373modeled trades, older1160/newer1213; model-net means−0.05%/+0.70%, same-stock differences−1.42%/−1.11%. Positive pooled mean does not override rejection. |
| CHAIN-READ1 / CHAIN-MOM1 / CHAIN-LAG1 | Revenue-up≥10% plus raised guidance → same-layer peers; hot layers; learned layer ordering. | READ1 REJECTED,960cases; MOM1 NOT PROVEN,588cases; LAG1 NO REPEATING ORDER FOUND. Source timing and heuristic-link limitations remain. |
| `squad28-core.mjs`, SQ28-SUPDRIFT and SQ28-SUPDRIFT-ANY | Explicit major-customer earnings surprise → suppliers with dated10-K revenue-concentration links. This is the closest direct information-transmission test. | Original primary TOO FEW CASES75/11; original variant NOT PROVEN126/55. **Corrected primary REJECTED92/39,−1.42%/−0.25%; corrected variant REJECTED121/55,−1.77%/−0.10%.** These are overlapping variants, not independent samples to pool. |
| `macro-core.mjs` / `macro-lab.mjs` | Commodity/rate/currency drivers and war/peace/OPEC/climate events → exposed sectors/funds. Sector exposure is not a named commercial contract. |37firstRun rules:19REJECTED,4NOT PROVEN,14TOO FEW CASES. Corrected GOLD-S20 and USD-E60 remain NOT PROVEN. Descriptive event-response tables are labelled information only, not predictive source skill. |

The chain decoder's retained window is2022-01-21..2026-10-19, with its recorded2024-06-05 half split. SQ28 and macro have their own recorded windows/splits; they must not be silently pooled.

Historical chain/SQ28/macro costs are0.8% round trip and1.2% stress where implemented. These modeled means do not establish whole-share cash outcomes with $3 each side, observed ask/bid, fees/slippage/capacity, halts and missing exits. Existing required costs/controls are retained; no cheaper model is proposed. Spread contained in ask/bid must not be charged twice in any later approved executable study.

## 2. Does one materially distinct economic hypothesis remain?

**None is established from the available description.** “A catalyst benefits businesses connected to it” already overlaps CHAIN-DEMAND1, CHAIN-READ1, SQ28 and macro exposure. A new source/person, a more persuasive story, a smaller watchlist or tighter filters is not a new mechanism and does not revive rejected results.

A possible distinction would have to identify **new, measurable cash-flow information for a legally identified counterparty**, beyond thematic capability or the already tested customer earnings/guidance shock, and explain why the existing material-agreement/link machinery does not already test it. The exact proposal and pre-event evidence are needed to establish that distinction. This is a question for comparison, **not a replacement hypothesis selected here**.

A's existing proposed pre-open committed-USD material-agreement/reclaim rule concerns its issuer's entry contract. It remains NOT PROVEN and is not validation of a cross-company narrative. No Qima filter, relationship graph or new population is added to A.

## 3. Relationship evidence and clocks

The completed outcome-blind inventory found:
- The old graph has2162**candidate** rows:628customer links and1534agreement links. All2162`first_public_at` fields are **date only**; none carries an original receipt/ingestion clock, original-body hash or BBO field. All retain source pointers and excerpts. Among agreement candidates515have a stated-value field and433a supplier-revenue field; these are not515verified committed contracts.
- Its16chains/58layers/415memberships are context.399memberships are marked point-in-time because an own filing contained a capability keyword; that does **not** prove that company supplied a named customer. Today's curated themes and47demand-node selection still carry hindsight.
- The stricter SQ28 file has844dated filing rows representing280pairs,228suppliers and129customers. Each retains accession and excerpt. Its reported hand check was45/50correct—not independent verification of every row, and not a newly performed hand check here.
- SQ28's correction did use SEC acceptance information:1980/2240customer reports matched an8-K;260did not. Each retained timing summary has25examples. Thus it would be false to say no acceptance-clock work exists. However corrected trade rows131/176 do not retain a complete per-trade original-response/first-ingestion/quote join. Acceptance time is not necessarily first earnings dissemination.
- The chain output's2379top-level monitoring trade rows are not the frozen2373DEMAND1population. They retain dates/source pointers but not original acceptance/receipt/BBO clocks; they cannot silently substitute for the frozen sample.
- Macro has34curated events with dates and pre/after labels. One prose clock fragment is not a normalized, authenticated event clock. No complete timestamped source-call denominator was supplied or audited.

**Documented commercial relationship:** original dated document, correct legal entities, direction and scope of the obligation/revenue exposure, valid before the catalyst, with later changes retained point in time. A URL, parser hit or hash format alone is insufficient. A cancellation, negotiation, non-binding partnership, combined-customer share or generic capability must not be relabelled committed revenue.

**Timing for an executable claim:** original event publication/acceptance evidence as applicable, actual first system receipt, actionable observation, decision and entry/exit quote clocks, quote sizes/conditions and complete followups. Later document retrieval cannot backdate first ingestion. Price appreciation after an event cannot establish that an entry was assessable then. No source is called skilled from selected winners; that would require the complete timestamped record including misses, revisions/deletions and all prior calls.

## 4. Smallest offline feasibility check — completed

Without calculating new returns or choosing a winning example, inspected all retained graph/link rows, corrected trade-record schemas and the macro event table, pinned to the14source/data Git blobs.

**Result:** zero complete admission-grade relationship→event→original-ingestion→executable-entry proof chains are demonstrated **within these inspected artifacts**. This is not a claim that no raw originals exist anywhere: unmounted Actions caches, other preserved workspaces and private artifacts were not comprehensively inspected. No new source was fetched to manufacture a historical original.

Reproduce read-only:

```sh
python3 retained-evidence-audit.py --root /path/to/Stock-2 --pins source-pins.json
```

The audit refuses mismatched source blobs, emits only derived inventory/examined verdicts and performs no network calls or file modifications. Compare its JSON with retained-evidence.json. It is not a strategy runner, signal filter or capture framework.

**Finite next decision:** obtain the exact proposal text, then determine whether it specifies a cash-flow mechanism genuinely outside the predecessor rules. If not, STOP as overlap. If yes, inspect already-held original relationship/event evidence and identify whether a complete outcome-blind denominator and executable clocks can be reconstructed. Missing original system receipts remain unrecoverable as contemporaneous evidence; do not fill them with later data. No collection request is justified merely to repeat corrected rejected supplier drift.

## 5. Disposition and A priority

**INCONCLUSIVE for the unseen exact proposal; STOP implementation/collection now.** No materially distinct, evidence-feasible survivor has been selected, so no new frozen trading protocol is invented. If one genuinely survives after the text/evidence comparison, present exactly one protocol for independent review before expansion, preserving all costs, controls, missingness and original studies.

A remains the main implementation queue: G2 must derive opening/reclaim bars, prior panels/cap and materiality/owner provenance through its actual host, not supplied JSON. Qima work is documentation/retained-evidence inspection only. The current code milestone5713011e and its prior hosted6/6PASS record are preserved. A fresh local preservation test failed during fenced-store initialization with WRITE_OUTCOME_UNKNOWN; a minimal isolated flock→Node worker probe timed out without output. This is a current worker-execution blocker to verifying further A edits, not a request for keys, collection or policy permission. Command execution alone does not prove child-worker execution is healthy. Failed logs/probe remain in /workspace/milestones/qima-hypothesis-review-20261106/. No failed test is counted as a pass and no new A code is claimed complete.

No acceptance row closes, genuine admission, deployment, provider call or rule change follows from this audit.

## Pinned study sources

[Chain rules](https://github.com/drrazaq/Stock-2/blob/5713011e426f21e283dccad286af096519f741e9/chain-core.mjs) · [Chain results](https://github.com/drrazaq/Stock-2/blob/5713011e426f21e283dccad286af096519f741e9/data/chain-decoder.json) · [Corrected supplier results](https://github.com/drrazaq/Stock-2/blob/5713011e426f21e283dccad286af096519f741e9/data/squad28-lab.json) · [Macro results](https://github.com/drrazaq/Stock-2/blob/5713011e426f21e283dccad286af096519f741e9/data/macro-lab.json).

Large GitHub contents responses returned no text despite nonempty blob IDs. The corresponding original Git blobs were read successfully; the audit subsequently reproduced their hashes against the preserved checkout. Empty connector text was not misreported as missing or empty source data.
