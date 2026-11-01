# MARKET-03 / CATALYST-03 — independent integration review

**Verdict: CHANGES REQUIRED. No package code integrated or deployed.** Reviewed on 1 November 2026; the package's author-entered 2 November date is not substituted for this observation date.

Exact branch head: `e6a1382c69201bd13add0b2249fa75e1fc3d51bd` (`claude/market03-catalyst03`). Code commit: `5c5b2eeb763ae2c7e62b631a78f0fda4b08bda6d`. Development base: `a51fa948537c3fb2df7fa8bb7fc8dbf73c7a159f`.

- Supplied 13-file code patch SHA256: `21841f123ccd9e108a5ae83400d3cce5d816148a11d1ea014d4d30b21d82dff1` — independently matches.
- Manifest SHA256: `19d7df266bb0d7c745ba710e986c189b260a6c7b080f81ad21a787d2bfad4c27` — all 13 after-file hashes match the exact branch.
- Required matrix SHA256: `a2e21c9a2a6ea2b0f444c48cd3287ab8c576bc43d7b70c487b9f9c2b1491255b`. This is an additional required input, not optional documentation.

## Independently reproduced findings

The attached [desired-behavior regressions](additional-regressions.mjs) use synthetic records, an actual `collectDiscovery` call and actual `comeback-lab.mjs` subprocesses with a loopback Massive stub. They require corrected behavior; they do not assert that a bug must remain. They are review evidence outside the registered passing repository suite.

| Finding | Reproduction and effect | Required correction |
|---|---|---|
| R1 — invalid date throws; row isolation fails | `source-contract.mjs` `validDay('2026-13-01')` and month `00` throw `RangeError` from `toISOString()`. An invalid `publicationDay` before a valid earnings row makes actual `collectDiscovery` return no observation and classify the whole source MALFORMED. The two corrected-behavior tests fail. | Return INVALID/false for all invalid calendar days without throwing. Keep valid rows and truthful per-row rejection counts when a neighboring row is malformed. Test invalid months as well as normalized invalid days. |
| R2 — absent SPY payload is reported observed | The actual comeback producer receives HTTP 200 `{}` and emits `SPY_BARS.status='OBSERVED'`. Missing identity/results are accepted as a successful empty loop. | Validate the official response envelope. Distinguish authenticated empty results from malformed/missing data. Preserve existing endpoints and request scope. |
| R3 — unresolved SPY conflict loses its integrity status | First a cached bar is revised; the producer reports CONFLICT and preserves the original. A second run returns the original value: persisted conflict evidence remains, but both current source and cache status revert to OBSERVED without any resolution. | Keep unresolved source-lineage integrity separate from latest transport/response status. Do not erase or silently resolve the retained conflict. Test revision, reversion, restart and later failure without rewriting original bars. |

All four added desired-behavior tests fail on the reviewed code, including both actual-producer tests. No real service, key, message, financial record or study was used.

## Compatibility and execution evidence

The exact code patch applies to a disposable checkout of verified development `2e466c58`. Only its 13 files plus the required matrix were selected; the entire branch was not merged. Newer HISTORY-03 news wording is preserved. In that disposable checkout the copied matrix initially differed only in source-file count because the new source files were untracked: staging the exact selected files reproduced the committed inventory and the test passed. That local setup mismatch is not a package defect.

| Evidence | Result and attribution |
|---|---|
| Exact published package, four supplied test files | Independently run: **22/22 PASS**, local Node 24.19.0. |
| Selected patch on current development | Independently run: **22/22 PASS** after representing the complete selected file set in the disposable index. |
| Selected patch plus newer `d3c1ee58` footer companion | Independently run: **23/23 PASS**, including the hermetic worker-dependency regression; all four added adversarial tests still FAIL. No newer code overwritten. |
| Existing affected producer/consumer/HISTORY caller suites | Independently run: **127 PASS, six existing policy TODO, zero failures**. |
| Actual inactive host/guard, monitor and closed worker dependencies | Independently run: **13/13 PASS**, including partial acknowledgements/recovery. No new worker-closure failure reproduced. |
| Added adversarial desired-behavior regressions | Independently run: **0/4 PASS**; findings R1–R3 above. |
| Exact `e6a1382c` hosted CI | Read-only inspection: `test` SUCCESS; `host-monitor-stress` SKIPPED. This green suite does not contain the four new edge cases. |
| Claude's full-run / Node 22 evidence | Reported by Claude, not an independently repeated complete 243-file run here. Her root-only permissions failure is reported separately from functional regressions. Node 22 is not added as a new acceptance requirement. |

The unchanged-dependency manifest is pinned to the older development base. Current development differs in **`scan.mjs` and `ignition-watch.mjs`** because of completed independent work. The news writer's resulting hash also differs after applying the patch over newer HISTORY wording. Rebase/re-pin the bounded candidate; do not restore the older files to satisfy a hash. Production main `f6a9b166` lacks required unmerged source dependencies, so this is **not** a standalone production patch or part of the approved mentor package.

## Ingress matrix and remaining acceptance

The matrix is a static `(file, literal host)` inventory plus declared shared inputs, not proof that every runtime route or all seven contract dimensions are verified. The selected tree reports 305 provider-host pairs, 87 unique decision ingresses, 27 reviewed ingresses and only three fully covered ones. Its own remaining unreviewed decision set and partial unit/adjustment/identity dimensions keep MARKET-03 open. It does not authenticate security identity, historical ticker reuse or corporate-action adjustment correctness.

The package retains research-only labels and does not authorize BUYs. News field digests help detect attribution changes but are not an immutable full-body archive; public state and private selection cannot be conflated. CATALYST-03 remains open for source-specific authenticity/full-body/revision evidence and the reported remaining ingress gaps. The package's statement that HISTORY news-wording repairs are still absent is stale against current development; preserve the completed corrections. Subscription ownership is confirmed (Alpaca Algo Trader Plus / Massive Stocks Starter); endpoint/reference access and response quality remain separate evidence, not an assumed refusal to buy data.

The separately published holiday-only scan patch at `979bcdf4` has since been integrated in development at `e17d4181e00482eb88b412cc83499d2874ad1dde` after its explicit handoff, along with the bounded HISTORY corrections. With those newer scan/test files included, the selected MARKET/CATALYST candidate plus caller/closed-worker tests passes **36/36**; all four adversarial edge tests still fail. This does not integrate the package's Twelve Data proposal or any of its 13 runtime/test files.

**Next action:** Claude repairs R1–R3, refreshes the exact patch/matrix/dependency manifest against current development, then Codex reruns these regressions and actual callers. The isolated earnings-holiday ownership handoff is now complete; any further scan hunks must preserve that integration. Privacy containment is [a separate proposal](../../news-log-containment-proposal.md), not permission to migrate state. Both acceptance rows stay OPEN; no score increase.

To reproduce offline, check out the exact package or apply its selected files and matrix in a disposable development checkout, then run:

```sh
REVIEW_TREE=/path/to/disposable-package node --test /path/to/additional-regressions.mjs
```
