# Independent review: development correction `3b7af847` (Codex 6726677555 / 6727112388)

Review only. No push to the development branch, no workflow action and no production change. Parent is `037792b8`.

**Verdict: PASS for the code.** One routine record correction (D1) is needed in the pin cascade. One note (D2) is optional and deferred.

## What was challenged, and the result

| Item | Result |
|---|---|
| **Per-part and per-retry guard** | CONFIRMED. `telegram()` calls `currentEvidence(Date.now())` inside the retry loop before **every** POST: each part, and each 429 retry of a part. A refusal returns `deliveredParts:i`, the number of parts actually accepted. A 429'd part is not counted. |
| **Strict local-zero proof** | CONFIRMED. `deliverAlertOnce` releases a key only when `reason==='PRICE_EVIDENCE_EXPIRED'`, `localEvidenceRefusal===true` and `deliveredParts===0`. The flag is set only by the local guard. A Telegram `description` cannot forge it, because the flag is never read from the response. |
| **Partial or earlier UNKNOWN stays quarantined** | CONFIRMED. `deliveredParts>0`, a missing flag, or a negative count gives `UNKNOWN`. An existing `UNKNOWN` reservation short-circuits as `ALREADY_RESERVED_OR_ACKED` before `send` (0 calls). |
| **3-minute current rule kept** | CONFIRMED. `stillCurrent` uses `quoteEvidence(...,3)`. Its boundary (`ageSec > 180` is stale) is inclusive at 180 s, the same as the fetch gate `Date.now()-j.t<=180000`. The 5-minute stop rule (`quoteEvidence(...,5)` for `priceUnknown`) and the historical check-timed stops are unchanged. Production R1's 5/20-minute gates were not copied. |
| **Unicode splitter, ACK and no-blind-replay** | CONFIRMED unchanged: `splitTelegramText` and the network-error path are untouched. Intent is persisted before the network. |
| **Routes** | First check: `openCurrent` is fixed at the same `at` that `firstCheckText` renders, then guarded per part. ENTRY REVIEW: pre-skip if stale (not reserved), then guarded. Market-hours: non-current lines (`priceUnknown`) are never gated; current lines are filtered before send and guarded per part. YOUR STOPS is unguarded by design (check-timed). |
| **Pin cascade** | 6 `scan.mjs` edges plus 1 manifest-of-manifest edge: every hash re-derived and **matches** (`scan.mjs` `a1d60659…` → `a15de89d…`). No live pin of the old `scan.mjs` remains outside historical records. **See D1** for `alert-delivery-state.mjs`. |

## Tests run (Node 20, loopback only)

- Codex's focused tests on `3b7af847`: `test/intraday-current-dispatch.test.mjs` + `tests/alert-delivery-state.test.mjs`, **12/12 PASS**.
- The 20 test files on `3b7af847` that exercise `intraday`, `telegram(` or `alert-delivery`: **267/267 PASS**.
- My probes (`probe.test.mjs` here; run with `REVIEW_TREE=<tree> node --test probe.test.mjs`): **4/4 on `3b7af847`; 3 FAIL / 1 PASS on parent `037792b8`**.
  - **P1:** expiry during a 429 retry of a mixed Market-hours message (a current target line plus a `PRICE UNVERIFIED` warning). Nothing is delivered, **both** keys are released (not quarantined), and the next run delivers both.
  - **P2:** a current line stale before send is held back, while the unverified warning still goes out (ACK) in the same run.
  - **P3:** at the 180 s / 181 s boundary at a 429 retry, current and stale respectively.

## D1 (routine record correction; not code)

`alert-delivery-state.mjs` changed in this commit (`eb9a496d…` → `1cfb0b89…`; it had been unchanged since 29 Oct). Five validation records still pin the old hash, and `pin-refresh.json` lists only `scan.mjs` edges:

- `docs/validation/repo03-reviewed-contracts.json`: a **reviewed-contract register entry**, which now names a version that is no longer current;
- `docs/validation/repo03-behavioral-matrix.json`;
- `docs/validation/repo03-critical-batch-evidence.json`;
- `docs/validation/repo03-critical-callers-manifest.json` (`unchangedRuntimeDependencies`);
- `docs/validation/discovery-coverage-current-reference-20261104.json`.

No test checks them, which is why CI is green. They are dated records, so they need not be rewritten. But either the register entry should record the new hash as reviewed here (D1a), or `pin-refresh.json` should state that these five are deliberately left as historical (D1b). As things stand, the cascade claims completeness that it lacks for this file.

Also: `pin-refresh.json` gives `afterManifestSha256` `47f6f3d0…` for `docs/a-fence-recovery/manifest.json`. That is an intermediate state, because the file was edited a second time by the last edge. The committed file is `19c11471…`. Nothing pins either value. Fix the record when touching it for D1.

## D2 (optional, deferred)

If `currentEvidence` ever threw, the existing `catch` would record it as `NETWORK_ERROR` / "outcome unknown" (quarantined, nothing sent). That is safe, but misattributed. `quoteEvidence` does not throw on any input reachable here, so this needs no change now.
