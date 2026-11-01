# Batches 2 and 3: exact results

**Code commit:** `ea9019dfc433d5916c6614c23b8e5aebe90727e2`. **Base:** the frozen package `e6a1382c`.

## Code patch

| Item | Value |
|---|---|
| File | `docs/validation/market03-batch2-code.patch` |
| SHA256 | `9cc0e02f3fb61a46306b81b7cb3d77e1108d0c6319cec576ed783e567feda0cd` |
| Contents | `smart-money.mjs`, `calendar.mjs`, the two test files and the matrix tool. Take `docs/validation/market03-ingress-matrix.json` with it. |
| Prerequisite | `source-contract.mjs` from the package |

## File hashes (SHA256)

| File | Before | After | Codex `Stock2-safety-fixes` @ `2e466c58` |
|---|---|---|---|
| `smart-money.mjs` | `109adc3b5f0cf25b1a4e3b1bd490486cfc19ab37a0249725cbbd434ad78f6238` | `f16ff5f206513bbbd2c2f7971ceae262ae585e1c9190d768f8348d672bf812cd` | identical to "before" (no overlap) |
| `calendar.mjs` | `6bc0b508f72b3a64e660ea1df0efa6cf7490c690d09cdf1652b545c7b248bbeb` | `8ca4391c2af9f18a622b8d702bafb414dc16f19b5b625b036b8964c0ac9ea5eb` | identical to "before" (no overlap) |

## Tests

Local run, Node 20.20.0, as a mirror of `tests.yml`.

| Run | Result |
|---|---|
| Full suite on the exact commit | **244 of 245 files pass** |
| `tests/market03-batch2-smart-money.test.mjs` | 3/3 (Node 20 and 22); old source 0/3 |
| `tests/market03-batch3-calendar.test.mjs` | 3/3 (Node 20 and 22); old source 0/3 |
| Matrix drift guard | 3/3 |

The one failing file is `tests/research-recovery-publication.test.mjs`. It refuses to run as root, and fails identically on every base measured.

## Production main `f6a9b166`

- **`calendar.mjs` hunk:** applies to main.
- **`smart-money.mjs` hunk:** needs the Codex branch's shared Telegram import (a different first line on main). Both also need the package's `source-contract.mjs`.
