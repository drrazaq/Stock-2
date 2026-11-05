# Focused review of `2c9f418634e05adad5ead5b7fc85de6d1f3eedee` (K1/K2 recovery; native SEC join and close sources from `7ee150f8`)

Reviewer: the Claude session, 5 Nov 2026, offline only.
- **Not done:** no setup, credentials, provider calls, collection or production change.
- **How tests ran:** Node 20.20.0, with a preload refusing every non-loopback connection; 0 were attempted.
- Saturday's approved maintenance is unaffected.

## Preservation check

- `7ee150f854b23c0f6066a6407e3d52e3a3b774ac` is an ancestor of `2c9f4186`. The range `572dc5ae..2c9f4186` contains `1e629bc`, `6f003e8`, `7ee150f` and `2c9f418`.
- These native-source files are **byte-identical** at 7ee150f and 2c9f418: `test/a-close-source.test.mjs`, `test/a-native-source-join.test.mjs`, `test/a-native-source-package.test.mjs` and `tools/market03-ingress-matrix.mjs`.
- `a-native-source-join.mjs` (+2/−1 lines) and `a-close-source.mjs` (+2/−1) changed only **additively** in 2c9f418: fence and transition checks at the end, plus the UNKNOWN propagation `STORE_EVIDENCE_UNRESOLVED`.
- **Both implementations are preserved in the reviewed tree.**

## Consolidated verdict

| Area | Verdict |
|---|---|
| **K1 (lost-body intent)** | **RESOLVED offline**, for stores configured with a recovery authority. See finding L1 for stores without one. |
| **K2 (interrupted claim)** | **RESOLVED offline** for every recorded stage. A torn attempt temp needs the identical original signed request (L2). |
| **Native SEC join (CIK, accession, document; acceptance vs Atom)** | **PASS offline.** |
| **Close normalization and revisions** | **PASS offline**, as a research-only aggregate-bar close. |
| **UNKNOWN propagation** | **PASS** inside the store, the join and `retainClose`. **But the new modules have no non-test caller** (L3), so they are not yet consumed by the strict A evaluator or a collector. |
| **Authenticated integration** | **MISSING.** See below. |
| **Acceptance rows** | **None meets its complete closure criteria.** 24 accepted / 16 OPEN unchanged. |
| **Prior passes** | Preserved. A1/A2/A6 13/13; F1–F3 35/35 and 32/32; collector 38/38; fenced store 12/12; H1–H6 untouched. |

## Executed

**Tests (Node 20), all passing:**

| File | Result |
|---|---|
| a-fenced-recovery | 48/48 |
| a-fenced-store | 12/12 |
| a-native-source-join | 24/24 |
| a-close-source | 20/20 |
| a-native-source-package | 2/2 |
| a-authenticated-collector | 38/38 |
| a-evidence-contract | 35/35 |
| a-independent-coverage | 32/32 |
| a-recovery-copy | 17/17 |
| a-pathway-review-regressions | 13/13 |
| catalyst-reclaim-prototype | 20/20 |
| reclaim-research-workflow | 46/46 |
| a-catalyst-reclaim-store | 27/27 |

**Independent probes** (`probes/k1-k2-authority-probes.mjs`, output saved) against the actual worker processes:

| Probe | Result |
|---|---|
| **K1 reproduction** | Append killed after its intent gives `WRITE_OUTCOME_UNKNOWN`. Every **other** append under the old generation is now refused (`PENDING_INTENT_REQUIRES_RECOVERY`), so the 572dc5ae gap is closed. `recover` gives `PENDING_ORIGINAL_UNAVAILABLE`. |
| **Signed authorization** | Unsigned claim: `RECOVERY_AUTH_CONTEXT_MISMATCH`. Wrong key: `RECOVERY_AUTH_SIGNATURE_INVALID`. Wrong action: `RECOVERY_AUTH_CONTEXT_MISMATCH`. Inventory changed after signing (a new residue): `RECOVERY_INVENTORY_CHANGED`. A valid disposal advances to generation 2 with 1 unresolved record. **Replaying the same authorization: `CONTROL_CAS_FAILED`.** |
| **After disposal** | Old token: `STALE_FENCE`. The lost ID looks up as `UNRESOLVED` (`allowBuy:false`). Re-appending its bytes: `INTENT_PERMANENTLY_UNRESOLVED`. `evaluate`: `UNRESOLVED_STORE_EVIDENCE`. No original bytes invented. |
| **K2 at AFTER_CLAIM_ATTEMPT, DURING_ATTEMPT_WRITE, AFTER_GENERATION, BEFORE_HEAD, AFTER_SWITCH_WRITE** | **Conflicting takeover** by a different authorized claim: `GENERATION_ATTEMPT_CONFLICT` at every stage. **Recovery:** `resumeClaim` with the recorded attempt pin (or an identical request for the torn temp) completes generation 2. The old token is `STALE_FENCE` afterwards. |
| **Torn attempt, original request lost** | `generationAttempt` gives `ORIGINAL_REQUEST_REQUIRED`. An authorized `DISPOSE` and a new claim both give `GENERATION_ATTEMPT_CONFLICT`. Only the identical signed request recovers (L2). |
| **Store without a recovery authority** | After a lost-body intent: dispose gives `RECOVERY_AUTHORITY_NOT_CONFIGURED`; claim and append give `PENDING_INTENT_REQUIRES_RECOVERY`. **Permanently blocked** (L1). |

**Code review of the native source and close modules:**
- **CIK, accession and document binding:**
  - the submissions response must be `https://data.sec.gov/submissions/CIK{issuerCik}.json`, with `cik` equal to the event CIK;
  - the matching row needs the exact accession and the same form;
  - the primary document comes from that same row and must be a safe name;
  - the primary URL is derived as `/Archives/edgar/data/{CIK}/{accession without dashes}/{document}`;
  - the response port only accepts that `www.sec.gov` Archives path, with no query or fragment and no redirects (`responseUrl` must equal the URL).
- **Acceptance vs Atom-updated:**
  - acceptance time comes only from `acceptanceDateTime` in submissions, and must not be later than that response's receipt;
  - Atom `updated` is carried only as `reportedAtomUpdatedAt` and never substitutes;
  - acceptance is "timely" only if the submissions response was received at or before the first Atom observation; otherwise it is `LATE_ACCEPTANCE_RESEARCH_ONLY`; missing acceptance gives `ACCEPTANCE_OR_DOCUMENT_UNAVAILABLE`;
  - the `Z` reading follows the repo's reviewed `sec-time.mjs` convention.
- **Persistent revisions:** first Atom, acceptance and primary records are written once. Any variant or later change writes a `SEC_FIRST_CONFLICT` record, which keeps the result UNKNOWN even after the bytes revert.
- **Close normalization:**
  - single-symbol `1Day` raw bars only, with an exact route and parameters;
  - the session must be a known trading session in `market-session.mjs`;
  - the response must be received after the **actual** session close (early closes included);
  - conflicting duplicate bars are refused;
  - the price is labelled `AGGREGATE_BAR_CLOSE_NOT_AUCTION_OR_EXECUTABLE_FILL`;
  - the feed is requested but not attested;
  - a revision is keyed by the target-bar hash (reordered fields or added sessions are not revisions);
  - the first conflict survives reversion.

## Findings

| # | Severity | Finding | Suggested remedy |
|---|---|---|---|
| **L1** | Medium (liveness) | `recoveryAuthority` is optional at INIT and `STORE.json` is immutable. A store created without one is **permanently blocked** by any lost-body intent, which is K1's failure in a different form. | Make `recoveryAuthority` mandatory for any non-`SYNTHETIC` origin (refuse INIT otherwise). |
| **L2** | Low | A torn control-attempt temp (`DURING_ATTEMPT_WRITE`) can be cleared only by the identical original signed request. An authorized disposal can't retire it. Ed25519 is deterministic, so re-signing the exact same body reproduces it, but only if every field (`at`, `nextOwner`, boundary) is known. | Either let an authorized `DISPOSE` retire a torn `.control-*` attempt (retain its bytes, record UNRESOLVED), or document that operators must retain the signed authorization until `GENERATION_READY`. |
| **L3** | Integration gap | `joinNativePrimary`, `createPrimaryResponsePort` and `retainClose` have **no non-test caller**. Their outputs don't yet feed `verifyAObservation` (source receipt) or `deriveAExit`/coverage (CLOSE events with `availableAt`). UNKNOWN propagation is verified within the modules only. | Wire them through reviewed adapters into the strict evaluator, keeping UNKNOWN reasons, before any claim of end-to-end coverage. |
| L4 | Info | The close's `securityId` is supplied by the caller. Symbol-to-security identity at the session isn't verified (HISTORY-02 scope). | Bind it to an authenticated identity source later. |

## Completed offline behaviour versus remaining authenticated integration

**Completed offline:**
- signed, inventory-pinned, CAS-bound disposal of lost intents and residues (permanent UNRESOLVED, no invented bytes);
- recorded generation attempts with resumable claims and conflicting-takeover refusal;
- stale-token rejection at every stage;
- native CIK/accession/document binding with acceptance clocks separate from Atom-updated;
- persistent first-record and conflict semantics;
- calendar-correct close normalization;
- UNKNOWN propagation from the store into the join and close results.

**Remaining:**
- live SEC acquisition through the port, with source authentication (no TLS or origin attestation);
- an agreed close-source and finality contract (official close vs aggregate bar);
- adapters into the strict evaluator (L3);
- real distinct trust roots with key custody, including the recovery authority (L1);
- physically independent CAPTURE and WITNESS;
- private host, binding and custody;
- authenticated stop of legacy writers;
- official provider semantics and rights;
- an adopted A policy and cohort, controls and population.

## Rows

| Row | Status |
|---|---|
| A3, A4, A5, A7 | OPEN |
| CATALYST-03, CATALYST-04 | OPEN |
| MARKET-03 | OPEN |
| HISTORY-02, HISTORY-04 | OPEN |
| REPO-03, ACTIONS-04, EXEC-03 | OPEN |

**No row has complete closure evidence.** All of the above is engineering progress only.
