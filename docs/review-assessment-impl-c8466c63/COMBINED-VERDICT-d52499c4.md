# Combined verdict: source-only candidate `d52499c4` and release procedure (Codex 6736933443)

**Verdict: PASS** on the combined source, binding and procedure. No mandatory correction remains. Only owner choices remain. Offline review; no operations.

## Source and composition

- **Candidate:** `d52499c454d2cdf472993e696d3a2ba8f4f77ef3`. Sole parent is main `9c633192`; tree `71223b35`.
- **Composition check:** I rebuilt reviewed standalone rev3 `0e89cb90` on the same main (tree `1f8a1699`). Diffed against that, the candidate changes **only** `scan.mjs` and `test/assessment-context.test.mjs`. The other 26 bound paths are byte-identical to reviewed rev3.
- **`assessmentContext`:** byte-identical to development `a0f51bc5`, which includes the stop-label and time-exit correction. Every symbol it uses (`LDIP_HOLD`, `ldipExitDay`, `posLine`, `loadPos` and the others) is defined in the composed file.
- **Development wording carried with the assessment delta:** three small display changes already present on the reviewed development base `b9753abb2` came along, disclosed in `composition-resolutions.json`:
  - the dated discovery header;
  - the "N/600 completed daily bars" wording;
  - the "selected-rule record" wording.

  These are presentation only and accepted. `checkOne` keeps the standalone lines and appends the card with `loadPos()`.
- **Held stops on the combined tree (actual functions):**

  | Holding | Compact line | Full card |
  |---|---|---|
  | LEADER DIP (real record shape) | "held, no stop by design" | horizon "126 sessions"; exit "…no stop by design, sell limit 120.00; time exit after 126 sessions (about 2027-04-02)" |
  | Numeric stop | "stop 8.00" | — |
  | No stop recorded | "stop NOT SET" | — |

  A held stock checked via `checkOne` shows the existing holding, with no add entry.
- **Lists:** compact lines of 154–236 characters; the full card only on `check SYM`.
- **Benchmarks:** SPY raw, worst trade and margin met / NOT MET are present, as in the earlier review. `assessment-context` passes 11/11.

## Binding

- Binding SHA256 `1a799a15…`, 28 paths. The patch hashes match the binding.
- Precheck on `9c633192`: PASS (28 files, 0 drift). `build-unit` gives tree `71223b35`, and `verify-unit` gives 28/0.
- `source.patch` produces `71223b35`, and `inverse.patch` restores `af3f4db0`, the parent's tree, exactly.
- On current main `3ebf21b5` (5 research-data files newer), build and verify pass 28/0, so the newer data is preserved.
- Negative control: rev3 alone fails this binding (21 problems).

## Validation (my independent single runs)

| Exact commit | Result |
|---|---|
| `d52499c4` (combined) | **158/158 files**: 157 root files with 1,497/1,497 tests, plus `tests/instrument-type` 9/9. Gated `watcher-resilience` 9/9 and `watcher-incident-revision` 11/11. No network attempts. |
| `e7737568` (superseded development) | 230/230 root files PASS. |

The `e7737568` tree does not match `d52499c4`. The changes since it (the `scan.mjs` stop-label/time-exit fix and its test) are exercised in the combined run and the targeted checks above. Codex's receipts (combined 158/158 single run, development 316/316) are consistent with these results.

## Procedure

The consolidated proposal is accepted as written:
- one fast-forward source-only push from a fresh main, with drift → stop and re-review;
- at most one reconciled source-only inverse, and no blind retry;
- complete hosted logs, plus the separate `tests/instrument-type` receipt;
- loaded-code evidence only, otherwise UNKNOWN;
- receipt deadlines of the existing job timeouts + 15 minutes;
- attendance confirmed independently, not promised;
- the existing $0 spending control confirmed by the owner.

R-A wording is unchanged apart from "this release". R-B is closed. The proposal supersedes the standalone-only proposal.

## Remaining (owner only)

1. Accept or defer R-A, using the reviewed wording.
2. Approve or defer this exact combined unit, with its bounded forward push and conditional inverse.
3. Confirm an attended window and the existing $0 spending control.
