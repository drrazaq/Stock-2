# HISTORY-03 coverage and count reconciliation

Production source: main `f6a9b1668d0591cf24a734034949b96b241fe35b`; extractor and file list unchanged from batch 1 (88 production files, 914 candidate strings).

## What the batch-1 "77 mapped" meant (corrected)

In batch 1, `source-candidates.json` marked a string **MAPPED** if it lay within one line of a source-line reference in one of the 43 catalogued claims. So:
- **77 strings matched 31 of the 43 claims.** 15 strings counted against more than one claim: S01, S04 and S05 share the same scorecard line range.
- **12 claims matched no string:** X01, S07, W06, S02, A09, W13, A08, W15, A10, A07, S06, W10. Their source field named a function or a line where the text is assembled at runtime.
- **Neighbouring non-claim strings were swept in** by the proximity rule.

"914 - 837 = 77" was therefore **77 source strings touched by catalogued claims**, not 77 reviewed claims. The 43 traced claims were the unit of review.

## Inventory v2 (`source-inventory-v2.json`), replacing the proximity rule

The universe now has two parts:
- the **914 batch-1 strings** (narrow word list);
- **298 more strings** found by a broader word list (`tools/extract-claims-broad.py`, which adds test, tests, proof, approved, losing, promising, record, better, worse, a year, per year).

The batch-1 word list missed claim strings such as the `ways` text ("made money in both test halves") and "LOSING: do not act on these".

| Category | Batch-1 strings | Broad-only strings | Total | Meaning |
|---|---:|---:|---:|---|
| CATALOGUED_CLAIM | 47 | 11 | 58 | contains (or is a 15+ character fragment of) the anchor phrase of a catalogued claim in the same file |
| REVIEWED_ACCEPTABLE | 156 | 56 | 212 | in a batch-2 file, read individually; claim-bearing text or a template fragment whose rendered message was reviewed and is acceptable (verdict words preserved) |
| NOT_A_CLAIM | 48 | 8 | 56 | in a batch-2 file, read individually; a rule definition, condition label or error text, not a performance or evidence claim |
| NOT_REVIEWED | 663 | 223 | 886 | outside both batches' file-level review (most are in scan.mjs); some of these were seen as rendered lines in batch 1 but were not classified one by one |
| **Total** | **914** | **298** | **1212** | |

Reconciliation of the batch-1 numbers: of the 914 batch-1 strings, 47 now anchor a catalogued claim (exact phrase, not proximity), 204 were read one by one in batch 2 and found acceptable or not a claim, and 663 remain unreviewed (batch 1 said 837 under the proximity rule).

## How each catalogued claim relates to the source strings

| Claim | Presence |
|---|---|
| W01 | ANCHORED (broad extractor only: missed by the batch-1 word list) |
| A01 | ANCHORED (narrow extractor) |
| W03 | ANCHORED (narrow extractor) |
| W04 | ANCHORED (inside a long string; stored text truncated at 600 characters) |
| X01 | ANCHORED (narrow extractor) |
| W07 | ANCHORED (narrow extractor) |
| W08 | ANCHORED (narrow extractor) |
| A04 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| A05 | ANCHORED (narrow extractor) |
| S07 | ANCHORED (narrow extractor) |
| W02 | ANCHORED (narrow extractor) |
| A02 | ANCHORED (broad extractor only: missed by the batch-1 word list) |
| W06 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| S02 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| W09 | ANCHORED (narrow extractor) |
| A03 | ANCHORED (narrow extractor) |
| W05 | ANCHORED (inside a long string; stored text truncated at 600 characters) |
| X02 | ANCHORED (narrow extractor) |
| X03 | ANCHORED (narrow extractor) |
| X07 | ANCHORED (narrow extractor) |
| W16 | ANCHORED (narrow extractor) |
| S03 | ANCHORED (narrow extractor) |
| W11 | ANCHORED (narrow extractor) |
| W12 | ANCHORED (narrow extractor) |
| A09 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| X04 | ANCHORED (narrow extractor) |
| W13 | ANCHORED (broad extractor only: missed by the batch-1 word list) |
| A08 | ANCHORED (narrow extractor) |
| W15 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| A12 | ANCHORED (narrow extractor) |
| A06 | ANCHORED (narrow extractor) |
| A10 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| A07 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| A11 | ANCHORED (narrow extractor) |
| A13 | ANCHORED (narrow extractor) |
| S01 | ANCHORED (broad extractor only: missed by the batch-1 word list) |
| S04 | ANCHORED (broad extractor only: missed by the batch-1 word list) |
| S05 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| S06 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| W10 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| W14 | ASSEMBLED AT RUNTIME (phrase not a literal in source; reviewed from rendered text) |
| X05 | ANCHORED (narrow extractor) |
| X06 | ANCHORED (narrow extractor) |
| B01 | ANCHORED (narrow extractor) |
| B02 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| B03 | ANCHORED (narrow extractor) |
| B04 | ANCHORED (narrow extractor) |
| B05 | ANCHORED (narrow extractor) |
| B06 | ANCHORED (narrow extractor) |
| B07 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| B08 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| B09 | ANCHORED (broad extractor only: missed by the batch-1 word list) |
| B10 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| B11 | ANCHORED (narrow extractor) |
| B12 | ANCHORED (narrow extractor) |
| B13 | ANCHORED (broad extractor only: missed by the batch-1 word list) |
| B14 | ANCHORED (narrow extractor) |
| B20 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B21 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B22 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B23 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B24 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B25 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B26 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B27 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B28 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B29 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B30 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B31 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B32 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B33 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| B34 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| C01 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| C02 | ANCHORED (narrow extractor) |
| C03 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| C04 | IN SOURCE, NOT EXTRACTED (string has no listed claim word) |
| C10 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| C11 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |
| C12 | REVIEWED SURFACE (whole rendered or read message, no single anchor) |

## Claims

- **Batch 1:** 43 claims (`claims-catalogue.json`).
- **Batches 2+:** 36 records (`batch2-claims.json`): 18 findings and 18 reviewed-acceptable surfaces.
- **Total:** 79 records.
- **Claims not anchored to an extracted string:** 18 (see the presence table). They were reviewed from rendered output.
- **Gate or decision defects among the ranked corrections:** B01, B03, X01, B02, C01, B13, X04, C04.

## Rendered surfaces in batch 2

- **Sunday senders** of the `leaders-study` workflow, run offline on a synthetic cache: 11 of 15 produced their message, 12 messages in all.
  - `quality` and `autolab` crashed on the synthetic input (no fundamentals cache; synthetic rows). Their owner-facing text was reviewed via the `quality` and `autolab` replies on committed data.
  - `rebalance` and `fastmover-lab` sent nothing on the synthetic input. Their text was reviewed via the batch-1 `rebalance` and `day trades` replies.
- **Bot research replies on committed data:** `lab`, `winners`, `exits`, `research`, `events`, `missed`, `catalysts`, `chains`, `days`, `market today`, `rebuy`, plus the batch-1 set.
- **Opportunity radar:** midday panels (3 fixtures) and close (1 fixture), all through the actual builders; the actual `opportunity-radar.mjs close` runner on committed data (its 2 Alpaca requests were refused, so it failed closed).
- **Early watch:** RESEARCH LEADS, PAPER SETUP and the DELIVERY SCORECARD (fixtures through the actual builders).

## Batch 3: live alert bodies, intraday radar, unrendered Sunday labs: coverage

- **Read from source** (live-session only, not renderable offline without a market session): the ignition-watch alert bodies (approved and early-paper kinds), the stop alerts (stop-watch.mjs), and the intraday-radar cards and board (intraday-radar.mjs).
- Every extracted string of intraday-radar.mjs and stop-watch.mjs was read one by one.
- **Not rendered on the synthetic cache:** Sunday autolab and quality (crash on synthetic input), rebalance and fastmover-lab (no message). Covered through source triage and their replies on committed data.

## Still not covered

- **886 source strings** outside both file-level reviews (mostly `scan.mjs`, plus discover, deals, movers, news-watch, premarket-check, smart-money, tipranks, intraday-radar and others).
- **Live-only texts:** the `ignition-watch.mjs` alert bodies, which were read from source, not rendered, and the intraday-radar cards.
- **Owner-input replies:** `check SYM`, the sell/hold review, the opinion replies, and the LEADER DIP buy confirmation.
- **No independent recomputation** of any number from raw prices (see the README).
