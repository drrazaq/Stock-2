# MARKET-03 / CATALYST-03 source-to-candidate contract package

**Author:** Claude, 2 Nov 2026. **Integration lead and reviewer:** Codex.

**Branch:** `claude/market03-catalyst03`
- **Development base:** `Stock2-safety-fixes` @ `a51fa948537c3fb2df7fa8bb7fc8dbf73c7a159f`, so Codex's SEC, news, insider, chain and share-supply repairs are reused, not restarted.
- **Production compatibility:** checked separately against main `f6a9b1668d0591cf24a734034949b96b241fe35b`.

**What it is:** offline engineering only. There were no provider calls, credentials, deployment, collection or messages, and strategy rules, gates and frozen results are unchanged. **Verdict:** both rows stay OPEN (see `CLOSURE-ASSESSMENT.md`), with acceptance at 24/40.

## What is in the package

| Piece | Files |
|---|---|
| Shared contract: identity (fail-closed aliases, mixed-case notation refused), strict units, clocks (unit mix-ups, zone-less ISO, date precision, future/stale), New York sessions (half days, holidays, DST), earnings timing and reaction session, adjustment-basis labels, latched revision book, bounded JSON transport, session-based close freshness | `source-contract.mjs` |
| Earnings ingress (AV, FMP, Finnhub): per-provider status; requested-symbol identity; pending vs malformed vs share-class rows; provider timing kept apart from study timing; cross-provider corroboration vs same-provider revision | `earnings-study.mjs` (fetch mode only) |
| Discovery2 live file: per-line close day, IDs, basis; `PRICE_CACHE` freshness; stale lines withheld | `discovery2.mjs` (live writer only) |
| Comeback: SPY ingress (bounded, New York bar day, unfinished bar excluded, revised bars kept); lab-file freshness, IDs and basis | `comeback-lab.mjs`, `comeback-provenance.mjs` |
| News: per-field and attribution digests; attribution changes held back; no story text in public state | `news-revision-archive.mjs`, `news-watch.mjs` (hook only) |
| Candidate eligibility: market-symbol identity; producer status for the added providers (legacy is `LEGACY_UNSTATED`); earnings report-day window; session-based close lag; earnings evidence shown on the record | `discovery-runtime.mjs` |
| Provider-ingress matrix and drift guard | `tools/market03-ingress-matrix.mjs`, `docs/validation/market03-ingress-matrix.json` |
| Regressions | `tests/market03-source-contract.test.mjs` (12), `tests/catalyst03-source-to-candidate.test.mjs` (6), `tests/market03-comeback-spy.test.mjs` (1), `tests/market03-ingress-matrix.test.mjs` (3) |
| Unapplied `scan.mjs` proposal and its standalone check | `proposal/scan-market03.patch`, `proposal/check-scan-proposal.mjs` |
| Dependencies outside the package (integration, `scan.mjs`, privacy, live collection, paid data, policy) | `DEPENDENCIES.md` |
| Exact patch, manifest and test evidence | `docs/validation/market03-catalyst03-*.{patch,json}` |

## End-to-end regressions

Each test drives an **actual producer script** against a local fake provider. It then reads the producer's output through `collectDiscovery` and `updateDiscovery`, and checks what becomes a candidate and which evidence fields the research record shows.

1. **Earnings:** an AV rate limit, an AV answer for another ticker, an AV `None`, an FMP plan refusal, an FMP answer carrying another symbol, and Finnhub pending, class, DMH and malformed rows each get a distinct status. Only the valid reports become RESEARCH ONLY / NOT AN APPROVED BUY records, carrying provider, timing and reaction session.
2. **Earnings:** a later cross-provider disagreement latches a conflict, keeps the original report and revokes the shown observation in the next cycle.
3. **Earnings:** a dated report older than the lane window is refused, however new the file is. Legacy rows keep their earlier handling.
4. **Discovery2:** freshness counts sessions. Friday's close is current on Monday; a three-session-old close, or a producer that says STALE, admits nothing.
5. **Comeback:** missing, undated or stale lab files and invalid symbols hold signals back with the reason. Fresh lines carry provenance into the record.
6. **SPY ingress** (`market03-comeback-spy`): malformed bars are rejected, today's bar is excluded, a revised bar is kept as the original with the conflict recorded, and a 503 reads as UNAVAILABLE. This test also passes on production main with the comeback hunks applied.
7. **News:** the same story re-attributed to other symbols is held back. The audit records `changedFields: ['attribution']`, reverting does not clear it, and no story text is added to the published state.

## Results

Run as a mirror of `tests.yml`, on Node 20.20.0, locally as the root user.

| Tree | Files | Result |
|---|---|---|
| Base `a51fa948` | 239 | 238 pass, 1 fail |
| Package `5c5b2eeb` (exact detached checkout) | 243 | **242 pass**, 1 fail; the 4 new package files all pass |

- **The single failure** is `tests/research-recovery-publication.test.mjs`. It refuses to run as root ("run this permissions regression as a non-root user"). It fails identically on base and package, and this package does not touch it. Hosted CI runs as non-root.
- **Node 22:** the package tests and the touched-caller suites all pass (see `market03-catalyst03-test-evidence.json`).
- **Production main `f6a9b166`:**
  - The pure modules pass their 12 tests there.
  - The SPY ingress regression passes with the comeback hunks applied.
  - Four caller hunks require Codex's unmerged branch: `discovery2`, `earnings-study`, `news-watch` and `discovery-runtime`. See D1 in `DEPENDENCIES.md`.
- **`scan.mjs` proposal:** applies to both the package branch and main. All 58 test files that load `scan.mjs` pass on the patched tree, and the standalone check shows before and after.

## Exact artifacts

- **Code patch:** `docs/validation/market03-catalyst03-code.patch`, SHA256 `21841f123ccd9e108a5ae83400d3cce5d816148a11d1ea014d4d30b21d82dff1`.
  - It holds 13 code and test files: base `a51fa948` → `5c5b2eeb`.
  - Take `docs/validation/market03-ingress-matrix.json` with it: the drift guard reads that file.
- **Manifest:** `docs/validation/market03-catalyst03-manifest.json`.
  - Before and after SHA256 for every file.
  - Twelve dependency files pinned unchanged: `scan.mjs`, `mentor-plan.mjs`, `comeback-core.mjs`, `discovery2-core.mjs` and the rest.
- **Test evidence:** `docs/validation/market03-catalyst03-test-evidence.json`.
