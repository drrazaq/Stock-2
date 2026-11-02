# Batch 2 (smart-money / calendar ingress), rebased onto accepted development `e0c12d31`

**Author:** Claude, 2 Nov 2026. **For:** Codex integration review. **Not deployed.**

| Item | Value |
|---|---|
| Branch | `claude/market03-batch2-rebased` |
| Code commit | `76cdb349d11d2b85c5f6c1b27c6c2996dfa49363` |
| Accepted base | `e0c12d31e1e741762da76ce3cdbad466c213e5f2` |
| Source package | `claude/market03-batch2-r2` @ `1873fda4` (B2-1..B2-4 fixes), left unchanged |

## Rebase method

- **Runtime files:** `smart-money.mjs` and `calendar.mjs` on the base are byte-identical to the pre-batch versions the package was built on, so the reviewed versions were transplanted unchanged. Their manifest hashes match the source package exactly.
- **Tests:** the four batch test files were added.
- **Matrix:**
  - the matrix tool's batch contract entries were applied as a diff over the base tool, so Codex's newer content is preserved;
  - the required matrix was regenerated;
  - result: 87 decision ingresses, 32 reviewed, 3 fully covered.
- **Shared helper:** the accepted source contract (`source-contract.mjs`, SHA256 `515f2034…`) is used exactly as integrated, with no shared-helper change. Both callers keep their local guard around `isDay`, which is harmless with the accepted helper.
- **Pinned dependencies:** all unchanged against the base, including `scan.mjs` `18a5765c…`, `ignition-watch.mjs`, `mentor-plan.mjs` and the integrated r3 files.

## Results

Node 20.20.0, run locally as root.

| Run | Result |
|---|---|
| `market03-batch2-smart-money` | 3/3 |
| `market03-batch3-calendar` | 3/3 |
| `market03-batch2-review` | 5/5 |
| Codex's batch-2 cases: vendored copy, and Codex's checkpoint file `58be2ace` run unchanged against this tree | 4/4 |
| Integrated r3 / source-contract suites on this tree | `market03-source-contract` 12/12, `market03-r2-spy-counts` 4/4 (including Codex's added case), `market03-review-r1-r3` 7/7, matrix 3/3 |
| **Full suite on the exact commit** | **261 of 262 files pass.** The only failure is `tests/research-recovery-publication.test.mjs`: it refuses to run as root, and Codex reports 7/7 when run non-root. |

## Exact artifacts

| Item | Value |
|---|---|
| Patch `docs/validation/market03-batch2-rebased-code.patch` (base → `76cdb349`, 8 files including the regenerated matrix) | SHA256 `1718e13dc3a232e5e2cc96fada1c19c2cc996b5b2917698686cc2a0f98d5c7e2` |
| Manifest | `docs/validation/market03-batch2-rebased-manifest.json` |

**Integration note:** `claude/market03-discover-rebased` regenerates the same shared matrix JSON from the same base. If both packages are integrated, apply both tool diffs and regenerate the matrix once (`node tools/market03-ingress-matrix.mjs --write`).

**Still coordinated separately:** the `scan.mjs` dividend-currency reader (not edited).
