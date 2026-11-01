# MARKET-03 and CATALYST-03: closure assessment after this package

**Author:** Claude, 2 Nov 2026. Codex reviews this independently.

**Verdict for both rows: OPEN.** This package advances both rows. It does not close either, and it claims no acceptance credit: the score stays **24/40**, with 0 new closures and 0 admitted prospective cases.

Below, each requirement from the board is set against what is now evidenced.

## MARKET-03

**Board requirement:** "Inventory every provider symbol format, field units/clocks, exchange/session and corporate-action normalization; ambiguous aliases fail closed. Test representative preferred/share classes, ticker changes, DST/half days, missing/future/stale fields across actual ingress paths."

| Requirement | Status now | Evidence |
|---|---|---|
| Inventory every provider ingress | **Done (inventory).** 296 source files and 305 provider (file, host) pairs, with 0 unclassified. The 187 frozen-research pairs are out of scope because their inputs are preserved. 87 decision-path ingresses remain. | `tools/market03-ingress-matrix.mjs`, `docs/validation/market03-ingress-matrix.json`. The drift guard `tests/market03-ingress-matrix.test.mjs` fails on any new unclassified provider call. |
| Symbol format / aliases fail closed | **Shared contract done.** Wired into earnings (AV, FMP, Finnhub), Comeback lab files and the discovery consumer. | `source-contract.mjs` `providerSymbol`. Dot and dash classes stay distinct. Mixed-case notation (`XYZpA`) is refused instead of being upper-cased into another ticker. A requested-versus-returned mismatch is IDENTITY_MISMATCH. |
| Units | **Partial.** Strict numbers keep MISSING separate from INVALID. EPS currency is not stated by the providers and is labelled as such. Seconds versus milliseconds clocks are detected, never rescaled. | `strictNumber`, `parseSourceTime` (UNIT_MISMATCH); earnings caller tests. |
| Clocks | **Done for the wired callers.** Zone-less ISO is AMBIGUOUS_ZONE; impossible, future and stale clocks have distinct statuses; date-only precision is kept. | Unit tests, plus the earnings, comeback and discovery regressions. |
| Exchange / session | **Done for the wired callers.** New York calendar phases cover half days and holidays; beyond the calendar is CALENDAR_UNKNOWN. Freshness counts sessions, not hours, so Friday's close is current on Monday. Earnings reaction sessions are calendar-aware. | `sessionPhase`, `latestCompletedSession`, `closeLagSessions`, `reactionSession`. DST tests cover the repeated 01:30 hour on 1 Nov 2026 and the first post-DST open. |
| Corporate-action basis | **Labelled, not authenticated.** The SPY basis comes from the request (`SPLIT_ADJUSTED_AS_OF_FETCH`). The shared grouped cache is recorded as split-adjusted as of each fetch, plus a heuristic split repair. Lab-reported prices are BASIS_UNVERIFIED. | Matrix notes; `adjustmentBasis`. |
| Representative cases across actual ingress | **Partial.** Preferred and class shares, ticker change (FB/META), DST, half day, Thanksgiving, missing, future and stale are all tested. They run through the actual earnings, comeback, discovery2-output and consumer paths. | `tests/market03-*.test.mjs`, `tests/catalyst03-source-to-candidate.test.mjs`. |

**Smallest remaining gap:**
1. **60 decision-path ingresses have no reviewed contract.** They are listed in the matrix `summary.unreviewedDecisionPairs`; the main ones are `discover`, `smart-money`, `deals`, `follow-lane`, `calendar`, `scan` (non-Twelve), `ignition-watch` (Massive, SEC, Finnhub) and `shadow-outcomes`. Of the 27 reviewed, only 3 are fully covered on all seven dimensions.
2. **The `scan.mjs` proposal is unapplied** (`proposal/scan-market03.patch`). It covers the EARNINGS DRIFT reaction day across holidays and Twelve Data bar identity and finiteness.
3. **Authoritative security identity** (CUSIP/FIGI-level, historical ticker reuse) needs an external reference. That is dependency D5.

## CATALYST-03

**Board requirement:** "Source-by-source event identity, publication/ingestion clocks, stale/future/broken payloads, duplicate/revised stories, threat/materiality truthfulness and persistence across jobs. Include conflicting/missing source evidence."

| Lane | Before (Codex matrix, `a51fa948`) | Added here | Still unmet |
|---|---|---|---|
| NEWS_CATALYST | Bounds, status, revision quarantine, remote CAS ACK | Per-field digests show which field changed. Attribution changes (related, source, category) are held back as ATTRIBUTION_CONFLICT, latched, and audited with `changedFields`. | **Full-text revision archive:** needs a private path (D3). **News threat-wording truthfulness:** HISTORY-03 B04/E01 are open. **Quote/profile paths:** still legacy. |
| SEC_EVENT | Accession and publication metadata; repeated-accession conflicts | — | Body revisions and authenticity; aggregate cache validation. |
| EARNINGS_SURPRISE | Finnhub calendar status; malformed isolation; same-provider revision | **Per-provider status** (AV, FMP, Finnhub): RATE_LIMITED, REFUSED, IDENTITY_MISMATCH, pending and malformed kept apart. **Identity and timing:** requested-symbol identity; provider timing (DMH) kept apart from study timing; calendar-aware reaction session. **Cross-provider:** corroboration versus conflict, with the original kept. **Consumer:** refuses dated reports older than the lane window, and revokes a shown observation when a later conflict appears. | Independent authenticated providers; durable cross-job publication of the cache (ACTIONS-04 overlap); EPS currency. |
| INSIDER_CLUSTER | Extensive (Codex) | — | As listed in the Codex matrix. |
| INDUSTRY_RIPPLE | Extensive (Codex) | — | As listed in the Codex matrix. |
| SUPPLY_SHIFT | Extensive (Codex) | — | As listed in the Codex matrix. |
| TECHNICAL_BUILDUP (Discovery2) | SEC index failure blocks new buys | **Live file provenance:** each line carries its close day, ID, revision ID, clock, price basis and identity basis. **Status:** `PRICE_CACHE` status with session lag; lines from a stale cache are withheld into `retainedBuys`. **Consumer:** blocks on a non-observed `PRICE_CACHE`; legacy files are labelled LEGACY_UNSTATED. | Identity of cache tickers (classes excluded, ticker reuse); method-level schema for side sources. |
| MARKET_DISLOCATION (Comeback) | — (no lane contract) | **Lab files:** freshness per lab file; missing, undated or stale lab files hold signals back with the reason; invalid symbols are refused. **Rows:** IDs and basis on emitted rows. **SPY bars:** bounded ingress, New York bar day, today's unfinished bar excluded, revised bars kept as original (CONFLICT), explicit UNAVAILABLE / REFUSED / MALFORMED. | Upstream lab producers' own contracts. `squad19` and `squad26` today files lack `lastClose`. |

**Cross-lane:** the consumer now records producer statuses for every lane except NEWS (which has its own counts) and records `LEGACY_UNSTATED` instead of implying OBSERVED.

**Smallest remaining gap:**
1. **Threat/materiality truthfulness review of news wording.** This is the HISTORY-03 B04/E01 corrections, which Codex owns.
2. **SEC filing-body revisions.**
3. **A news full-text archive.** It needs the owner's private-storage decision (D3).
4. **Persistence certification for the earnings cache and lab outputs across jobs.** This is shared with ACTIONS-04.
5. **Legacy identity migration** for pre-contract rows. They remain UNVERIFIED or LEGACY_UNSTATED rather than being rewritten.

## What this package did not change

- **Code it did not touch:**
  - strategy rules and gates;
  - the study mode of `earnings-study.mjs`;
  - Discovery2 discovery and testing, and its freezing;
  - `comeback-core.mjs`;
  - `scan.mjs`.
- **Data and evidence it did not change:** frozen results, data files and existing tests. Verified by `git diff --name-only`: no `data/` file, no frozen verdict file, and no Codex test file is in the diff.
- **Activity that did not happen:** no provider calls, credentials, deployment, collection or messages.
