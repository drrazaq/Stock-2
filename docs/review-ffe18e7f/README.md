# Focused independent review of `ffe18e7f78a370f853c53502418824db2b7ea7b1` (5 Nov 2026)

Reviewer: the Claude session, offline only.
- **Not done:** no setup, collection, activation, provider call or production action.
- **How tests ran:** Node 20.20.0, with a preload that refuses all non-loopback connections; 0 were attempted.
- **Saturday's stop maintenance** is separate and unaffected.

**Scope:** `b46f77f4..ffe18e7f`, four commits:
- `1fdefbf` A evidence contract and secondary recovery;
- `902def9` A7 fence;
- `226508c` ingress inventory;
- `ffe18e7` A5 late-receipt refusal.

**Files:** `a-evidence-contract.mjs`, `tools/a-evidence-runner.mjs`, `tools/a-recovery-copy.mjs`, `docs/a-evidence-recovery/`, `docs/acceptance-queue-20261105.md`, `docs/historical-audit-invocation/setup-decision-20261105.md`. The legacy A evaluator, runner and store are unchanged.

## Consolidated verdict

| Area | Verdict |
|---|---|
| **Engineering of the new contracts** | **PASS as inactive, unadopted contracts**, with three findings (F1–F3) to carry into any adoption. |
| **A3, A4, A5, A7** | **All remain OPEN.** Each now has an implemented offline contract. None has working authenticated acquisition, and legacy paths are unchanged. |
| **CATALYST-03 source binding** | **Partial contract only.** Original bytes are bound to a URL and a hash under a supplied capture signature. There is no provider-native identity, no fetch or authentication of the source, no cross-source deduplication, and no materiality or threat engine. **OPEN.** |
| **Acceptance rows** | **None meets its complete closure criteria.** 24 accepted, 16 OPEN, unchanged. |
| **Revised setup-only proposal** | **PASS for setup-only.** It corrects S1 (stale pins), S2 (runtime recorded) and S3 (quota verified, or stop). No bindings, no run. |
| **A pilot** | **NOT READY.** No adopted trust roots, no collector, no controls or population. Zero real observations. |
| **Prior passes** | A1, A2 and A6 (4923b443) preserved: the regression file 13/13 still passes. Historical H1–H6 (5cf4faf1) preserved; that code was not changed by this range. |

## Executed

**Tests (Node 20):**

| File | Result |
|---|---|
| a-evidence-contract | 35/35 |
| a-recovery-copy | 17/17 (includes real child SIGKILL at four stages, concurrent recovery, torn tail and card, mid-chain corruption, symlink, source mutation) |
| a-recovery-inspect | 2/2 |
| catalyst-reclaim-prototype | 20/20 |
| reclaim-research-workflow | 46/46 |
| a-catalyst-reclaim-store | 27/27 |
| a-pathway-review-regressions | 13/13 |

**Independent probes:** `probes/a-evidence-probes.mjs` against the actual `runAEvidenceDataset`, `validateTrustContract` and the legacy `evaluateObservation`. Output is in `probes/a-evidence-probes.out.json`.

| Probe | Result | Meaning |
|---|---|---|
| Fixture baseline (synthetic root) | VERIFIED_UNDER_SUPPLIED_TRUST_CONTRACT | The path works end to end. |
| Shipped `trust-contract.proposed.json` | 0 roots, `adopted:false`; validates; every receipt → `UNTRUSTED_RECEIPT` | Nothing is trusted as shipped. Correct. |
| **A3 legacy** `evaluateObservation` with a 2024 ZAD mark | **PAPER_SETUP_ONLY** (accepted) | The legacy path is unchanged, so A3 is open there. |
| A3 new path: owner-signed 2024 decision, interval to 2025 | `ZAD_NOT_VALID_AT_DECISION` | Expiry is enforced. |
| A3 new path: owner-signed 2024 decision, interval to 2030 | VERIFIED | Staleness is entirely the owner's signed interval. There is no maximum-validity guard: a policy decision, not a defect. |
| **A4** fabricated `https://example.invalid/…` URL, signed by a supplied capture/review key | **VERIFIED** | Authenticity rests wholly on the trust root. No fetch and no provider identity. |
| One key holding OWNER + CAPTURE + REVIEW | Accepted by `validateTrustContract` | **F2:** separation of roles is not enforced. |
| **A5** quote received after the close (pre-close rule) | `OUTCOME_CLOCK_ORDER` (refused) | Late receipt is refused. |
| A5 quote with missing `sourceDelayMs` | `RULE_EXIT_RECEIPT_LATE` (refused) | Fails closed. |
| A5 quote with negative `sourceDelayMs` | Passes the receipt check, then `OUTCOME_UNRESOLVED` from `measurePaperExit` | No bypass. |
| **A5 omission:** signed `complete:true` tape containing the later (worse) pre-close quote, versus the same tape with that quote omitted | **net −$479.76 vs +$35.95; both VERIFIED** | **F1:** tape completeness is signer attestation only. Omitting one quote flips the outcome. |

## Findings

| # | Severity | Finding | Remedy before adoption | Owner |
|---|---|---|---|---|
| **F1** | **High (for adoption)** | A CAPTURE signer can omit unfavourable BBO events from a tape still marked `complete:true`. Deterministic selection then picks a better quote. Reproduced: −$479.76 becomes +$35.95. Nothing in the contract can detect omission. | Completeness must come from an independent collector, not the signer: provider sequence numbers or gap-free continuity, a second independent capture, or a witness log. Until then, A5 outcomes can be VERIFIED only "under signer honesty". | Codex |
| **F2** | Medium | `validateTrustContract` lets one key hold OWNER, CAPTURE and REVIEW. The "separate semantic-review receipt" (A4) and owner attestation (A3) can then be produced by the same party as capture. | Require distinct keys per role; at least REVIEW ≠ CAPTURE and OWNER ≠ CAPTURE. Record key custody per role in the trust policy. | Codex, then the owner's trust-policy decision |
| **F3** | Low | Quote `sourceDelayMs` is not validated as finite and ≥ 0 in `deriveAExit`. Negative values are later rejected by `measurePaperExit`, so there is no bypass, but the refusal reason is indirect. | Validate it at tape parse. | Codex |

**Other observations:**
- The A3 interval semantics are sound: latest known decision wins, NO or UNKNOWN does not revive an older YES, equal-clock conflicts block, future receipts can't backdate. The maximum validity length is an owner policy choice.
- The A7 secondary reconstruction is sound and conservative:
  - original bytes and the lock are preserved byte for byte;
  - every attempt uses an exclusive destination;
  - only a validated JSONL prefix is used, and committed damage and mid-chain corruption are refused;
  - the fenced manifest refuses a normal writer.

  But the **primary store stays locked, with lock liveness UNKNOWN**. There is no reviewed procedure to retire the original lock or resume the primary. The inspector and secondary copy are diagnosis and reconstruction, **not recovery completion**.

## Remaining blockers (precise)

**A3:**
- an owner decision on the validity-interval policy (including any maximum);
- an owner-attestation signer with key custody;
- the legacy evaluator and store still accept old marks, so they must be retired or gated for any adopted cohort;
- existing marks lack intervals.

**A4:**
- an approved acquisition collector that actually fetches primary originals (for SEC: accession and acceptance-time identity) with a secure clock;
- independent semantic review, with distinct keys (F2);
- prior-cap and identity sources.

**A5:**
- an independent completeness mechanism for outcome tapes (F1);
- an approved live capture signer;
- receipt clocks from that collector, not historical retrieval.

**A7:**
- a reviewed primary-writer boundary procedure: lock retirement, resuming from the secondary or the original, and reconciliation;
- until then, the primary is non-resumable by design.

**CATALYST-03:**
- the full eight-lane source matrix (identity, publication and ingestion clocks, stale/future/broken payloads, duplicates and revisions, threat/materiality truthfulness, cross-job persistence, conflicting and missing sources);
- the A path covers only original-byte binding under a signature.

**Pilot:**
- an adopted trust policy and roots;
- an evidence/cohort version fixed before collection;
- symmetric controls and population;
- bounded acquisition scope;
- separate owner approval.

## Revised setup-only proposal (`setup-decision-20261105.md` at ffe18e7f)

**PASS for setup-only.**
- The stale 3334e10e / 73707d49 / 128 MiB references are gone. Source `07995aff`, workflow `cb4f3bb6…` and manifest `ac8be83d…` match my b46f77f4 verification.
- **Step 1** verifies private quota with no paid overage, or stops.
- **Step 2** installs only the rehearsal workflow, records W, has no cron or push trigger, and runs nothing.
- **Step 3** has no provider or owner-key bindings, and the action refuses them.
- **Step 4** stops before C and before any run.

The runtime split (rehearsal on Node 24; audit JS action declared node20, possibly executed on Node 24) is now documented. The audit run must record its actual runtime.

**Still owner decisions and external evidence:** repository creation and access, quota, the later rehearsal approval with real W/C/approval hash and window, and the provider questions (H6).

No acceptance row closes. Nothing here is a production, collection or activation step.
