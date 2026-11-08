# Re-review of Codex's corrected development port `3589faf514cb61b1003abe0425796f1a6f025642` (request 6721380973)

**Verdict: PASS WITH FINDINGS.**
- F1–F4 and the dependency-manifest corrections are fixed as claimed. No test or threshold was weakened.
- One narrower F1 case remains (**R1**, medium-low), plus two low items (R2, which was already in the code before the port, and R3).
- The review was read-only: Node 20.20.0, network guard, loopback only.
- `scan.mjs` line numbers below are at `3589faf5`.

## F1–F4

| Item | Result |
|---|---|
| **F1** | **Fixed for the reported case.** `holdingAction` decides stop lines on a 5-minute `stopEv` (:4364, :4370), and adds PRICE STATUS UNKNOWN for a quote 3–5 min old above the stop (:4371). Targets, HOLD and "% from entry" still need the 3-minute `ev`. `stopFallback` uses `quoteEvidence(…,5)` (:4424). PRICE UNVERIFIED is skipped when the 5-minute stop check says reached (:4435). A 4-minute quote now gets one verdict in both messages. |
| **F2** | **Fixed.** `quoteEvidence` returns UNKNOWN for `FUTURE_SOURCE_TIME` (:4351), an invalid or future `observedAt` (:4353), and a quote invalid at `observedAt` (:4354). `liveQ` always sets `observedAt` (:1070, :1073). No other path turns a future-at-fetch quote into a price claim: the intraday loop treats it as not fresh (:4433), and other `liveQ` callers read the fetch-time `price`, which is null. |
| **F3** | **Fixed.** `test/open-check-repair.test.mjs:65,74` again require the exact stale and undated reasons. |
| **F4** | **Fixed.** Owner text at :4391/:4393 is plain and accurate. The dependency-port README now records the 7,019-byte block and the early-alerts New York date display. |

## Remaining findings

**R1 (medium-low; F1-class): the two routes still judge the same quote at different moments.**
- `stopFallback` judges right after each fetch (:4424). `firstCheckText` re-judges at its own later `Date.now()` (:4479), after a loop of up to 40 symbols that can include 3 s or 61 s pauses.
- Failing case: a quote 4 min 50 s old at fetch, under the stop, and 30 s pass before the first check. YOUR STOPS says "STOP LEVEL REACHED: ZZS … 70.00", while the first check says "ZZS: STOP STATUS UNKNOWN … 5 min old".
- **Fix:** judge each quote once, at `observedAt`, and reuse that verdict.
- **Note:** this also affected my composition rev10. It is fixed in R1 rev11, posted separately.

**R2 (low; already in `cf63a04a`, `9c27aa25` and `a4976e0`, not introduced by the port).**
- The stale-holding alert prints "ZZS at 0.00: YOUR POSITION: PRICE UNVERIFIED".
- Cause: `say` builds `sym+' at '+money(p)` with `p = +null = 0` (:4434–4435).
- It is a false price shown to the owner; the price part should be dropped when no price is valid.

**R3 (low, wording).**
- For the same stale quote under a stop, the first check's STOP STATUS UNKNOWN line cites "(limit 3 min)", because `evidenceText` switches to `stopEv` only for SELL (:4377).
- The same run's STOP CHECK UNKNOWN cites "(limit 5 min)".
- The restored F3 assertion at :65 locks in the 3-minute text on a stop-status line.

## Reproducers (this folder; run with `REVIEW_TREE=<tree>`)

| File | `cf63a04a` | `3589faf5` |
|---|---|---|
| `desired-behaviour.test.mjs` (F1 a–d, F2 a–c including the real intraday caller, loopback) | 4 pass / 4 fail (expected) | **8/8** |
| `residual.test.mjs` (R1, R2, R3, loopback) | 1 pass / 3 fail | 1 pass / 3 fail (open findings) |

- My earlier `port-review.test.mjs` flips exactly its two current-behaviour assertions: the F1 "limit 3 min" and the F2 "STOP LEVEL REACHED" at T+30 s. Those are the intended fixes.

## Dependency manifests (`mcmp.mjs`)

- **Exactly 23 values changed:** 19 edges across the 5 A manifests (4+4+4+4+3), and 4 in `review-ad3837-response`.
- **Hashes check out:** all 23 new hashes equal the files at `3589faf5`; all 23 old hashes equal `a4976e0`.
- **Nothing else moved:** no other key changed, and `historicalBaseDependencyHashes` is untouched. The originals are retained in `pin-refresh-audit.json` and `sixth-pin-repair.json`.
- **No assertion weakened:** the 6 package tests are byte-identical to `a4976e0`.
- **Scope note:** maps named `protectedUnchanged` / `productionProtected` now pin the changed `scan.mjs` and `ignition-watch.mjs`. It is documented, but the A acceptance evidence no longer covers those bytes, so it belongs in the sign-off scope.
- **Watcher late-start test:** a tightening. `/STOP HIT NOW/` becomes the anchored exact "STOP LEVEL REACHED: ZZQ … stop 11.00: last price 10.00", and the one-message and no-duplicate checks are kept.

## Tests on `3589faf5` (one file at a time)

| Test file | Pass |
|---|---|
| open-check-repair | 12/12 |
| stop-alert-validity | 17/17 |
| stop-watch | 3/3 |
| shadow | 10/10 |
| dependency-port-review | 7/7 |
| watcher-nov2-clock | 9/9 |
| watcher-nov2-guard | 15/15 |
| a-fenced-recovery | 63/63 |
| the 6 package pin tests | 2/2 each |
| gated watcher-incident-revision (`development-full`) | 11/11 |
| gated watcher-resilience (`development-full`) | 9/9 |
| cadence-current | 10/10 |
| extra open-check reviews | 2/2 and 2/2 |

- **Full serial suite: NOT verified locally.** It was stopped after 14 of 313 files: 13 passed, and `a-first-entry-panels` hit a 300 s per-file timeout (slow, not a failure verdict).
- **Hosted claim** (run 42471387411, 313/313): not checked offline. That run id is not recorded in the committed receipts at `3589faf5`.
