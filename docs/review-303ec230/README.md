# Focused review of `303ec230044bbd6f8a8b287030ca9d81cfc97690` (F1–F3, legacy gate, ZAD policy, A7 procedure)

Reviewer: the Claude session, 5 Nov 2026, offline only.
- **Not done:** no setup, keys, provider calls, collection, activation or production change.
- **How tests ran:** Node 20.20.0, with a preload refusing every non-loopback connection; 0 were attempted.
- **Scope:** delta `ffe18e7f..303ec230` (one commit).

## Verdict

| Item | Verdict |
|---|---|
| **F1 omitted quote** | **RESOLVED offline.** An independent WITNESS coverage set must match the full tape event set. Rerunning my counterexample through the evaluator **and** the actual CLI now gives `INDEPENDENT_CAPTURE_SET_MISMATCH`. **Residual:** if the witness omits the same quote, it still verifies (+$35.95). Independence is attested only by `provenanceReference`; it is not proven. |
| **F2 key and role separation** | **RESOLVED.** One role per key. The same underlying key is refused as `UNDERLYING_KEY_REUSED` across PEM, CRLF-PEM, DER and JWK encodings. A witness collector bound to the capture key is refused. A collector ID absent from the contract makes every CAPTURE and WITNESS receipt `UNTRUSTED_RECEIPT`. |
| **F3 delay validation** | **RESOLVED.** `NaN`, −1, `Infinity`, string, null and missing values are all refused, both on the input quote (the whole dataset is refused) and on tape BBOs (`UNRESOLVED:INVALID_SOURCE_DELAY`). |
| **Legacy gate (A3 legacy path)** | **RESOLVED (fail closed).** See the table below. |
| **Proposed ZAD validity policy** | **Sound as a proposal; an owner decision is still needed.** The 90-day affirmative maximum is proposed but **not enforced** by the verifier: my 2030 interval still verifies under the unadopted contract. Adoption needs the owner decision, an authoritative owner-state source bound to the OWNER key, and verifier enforcement of the adopted maximum. The existing 90-day non-halal exclusion and production `resolveZad` / `zadApproved` are unchanged. |
| **A7 recovery and resumption procedure** | **Sound as a procedure; operationally BLOCKED.** It correctly requires an authenticated writer boundary, preserves the original lock, and gives no stale-lock expiry. Secondary reconstruction is replay-only, and a normal writer can't reopen it. A fenced, authenticated new primary writer is **not implemented**, so there is no resumption. |
| **Prior passes** | Preserved. A1/A2/A6 regressions 13/13: the file now imports the renamed structural-rehearsal functions, with the same assertions. H1–H6 untouched. |
| **Acceptance rows** | **None meets its full closure criteria.** 24 accepted / 16 OPEN is unchanged. A3–A5 and A7 stay open (see below). |

**Legacy gate detail:**

| Entrypoint | Result now |
|---|---|
| `evaluateObservation` with a 2024 mark | `UNKNOWN: AUTHENTICATED_A_EVIDENCE_REQUIRED` |
| `assessReclaim` | `UNKNOWN: AUTHENTICATED_A_EVIDENCE_REQUIRED` |
| `measurePaperExit` | `UNRESOLVED` |
| `runResearchDataset`, `persistResearchDataset`, `appendObservation` | throw |
| store with no mode | `LEGACY_A_WRITER_DISABLED` |
| store in rehearsal mode with `RETAINED_RESEARCH` | `LEGACY_A_WRITER_DISABLED` |
| structural rehearsal with `RETAINED_RESEARCH` | `SYNTHETIC_REHEARSAL_ONLY` |
| structural rehearsal with a 2024 mark | still `PAPER_SETUP_ONLY`, but labelled `evidenceAuthenticated:false`, `UNAUTHENTICATED_STRUCTURAL_REHEARSAL` |

The `SYNTHETIC` origin is self-declared. Labelling real data synthetic yields only an explicitly unauthenticated rehearsal result, never an authenticated one.

## Executed

**Tests (Node 20):**

| File | Result |
|---|---|
| a-evidence-contract | 35/35 |
| a-independent-coverage | 32/32 |
| a-recovery-copy | 17/17 |
| a-recovery-inspect | 2/2 |
| catalyst-reclaim-prototype | 20/20 |
| reclaim-research-workflow | 46/46 |
| a-catalyst-reclaim-store | 27/27 |
| a-pathway-review-regressions | 13/13 |

**Independent probes:** in `probes/`, with saved outputs. They exercise the actual `runAEvidenceDataset`, `validateTrustContract`, the legacy entrypoints, and the CLI `tools/a-evidence-runner.mjs`, run as a child process with an empty environment:
- **CLI baseline:** exit 0, status-only stdout, empty stderr, report `VERIFIED_UNDER_SUPPLIED_TRUST_CONTRACT`.
- **CLI with omitted quote:** report `UNRESOLVED:INDEPENDENT_CAPTURE_SET_MISMATCH`.
- **API with both quotes present:** net −$479.76. The correct outcome is the one reported.

## Completed offline safeguards versus what is still missing

**Done offline:**
- coverage witness matching;
- separate keys per role;
- delay validation;
- retired legacy entrypoints and writer;
- replay-only recovery;
- fenced secondary copy;
- an exclusive no-overwrite report.

**Missing (implementation, not just credentials):**
- **Collection:** an authenticated collector and an **independent** witness collector with real provenance. Physical and organizational independence must be shown, not just a distinct key.
- **Writer:** a fenced primary writer with generation tokens checked before every append, commit, publication and retry, plus authenticated stop and fencing of old writers.
- **Trust and ZAD:** an adopted trust policy and keys with custody; ZAD maximum enforcement plus an authoritative owner-state source.
- **Pilot design:** a cohort version fixed before collection, symmetric controls and population, and bounded acquisition scope.

## New findings

| # | Severity | Finding |
|---|---|---|
| G1 | Info / limit | A colluding or shared-operator witness can repeat the omission. Distinct keys don't prove distinct parties. Record collector independence evidence (operator, host, network path) in the adopted trust policy. |
| G2 | Low | An invalid input-quote delay throws for the whole dataset rather than marking that one observation UNRESOLVED. This fails closed. Making it per-observation would keep other observations reportable. |
| G3 | Low | If the 90-day ZAD maximum is adopted, the verifier must enforce `min(validUntil, decidedAt + 90 d)`. Today it accepts any explicit interval. |

## Rows

- **A3, A4, A5, A7, CATALYST-03, CATALYST-04, HISTORY-02:** OPEN. Contracts and gates are done offline; authenticated acquisition, writer integration and owner decisions are missing.
- **No row closes.**
