# `discover.mjs` batch: exact results

| Item | Value |
|---|---|
| Code commit | `7f5b6fd2a1ff26b0604240f766186241e632958a` |
| Base | r2 `31b9ff2ade81608436ddc81835b674e47de0f540` |

## Code patch

| Item | Value |
|---|---|
| File | `docs/validation/market03-discover-code.patch` (r2 → `7f5b6fd2`; `discover.mjs`, the test and the matrix tool) |
| SHA256 | `82a362664bd8a2ca90978c0c9d59199e6b3707ffdb68d240a37d5b594fc7103b` |
| Also required | `docs/validation/market03-ingress-matrix.json` (SHA256 `1cfea4695714168dd4831a843f478cf75974c382fad153fb7782c612db86aa32`) and r2's `source-contract.mjs` |

## File hashes (SHA256)

| File | Before (r2) | After | Codex `Stock2-safety-fixes` @ `9b78b51d` |
|---|---|---|---|
| `discover.mjs` | `abc1ddf693845d665b224fdf0033f6711ade086c976d0143540af11f367f1df9` | `b36a70235f853b4f22591844c937fbee3c5eb0b53072afd219b064c26bf92af3` | identical to "before" (no overlap) |

**Applicability:** the `discover.mjs` hunk applies cleanly to Codex's latest head `9b78b51d` and to production main `f6a9b166`. It imports `source-contract.mjs` from r2, which is not on main.

## Tests

Local run, Node 20.20.0, as a mirror of `tests.yml`, on an exact detached checkout.

| Run | Result |
|---|---|
| Full suite | **252 of 254 files pass** |
| `tests/market03-discover-price-day.test.mjs` | 10/10 on Node 20 and on Node 22; unmodified `discover.mjs` 0/10 |
| Matrix drift guard | 3/3 |

Both failing files are pre-existing on unmodified development and unrelated to this batch:
- `tests/research-recovery-publication.test.mjs` refuses to run as root;
- `test/try-small-audit.test.mjs` case 1b fails identically on `e6c99995`.

## Matrix

On this branch, 29 of 87 decision-path ingresses are reviewed: r2's 27 plus `discover.mjs` on two hosts. Batch 2's entries live on its own branch, and its rebase is held until r2 is resolved.
