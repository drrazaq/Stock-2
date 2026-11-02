# Revision r2: exact results

**Fix commit:** `456c149536cec1f86a46b0ceaee914e25966c26d`, on development `e6c99995b38602b187cee839c5275c0700f7c1e0` (current `Stock2-safety-fixes` head when built).

## Full suite

Run as a mirror of `tests.yml` on an exact detached checkout, Node 20.20.0, locally as the root user: **251 of 253 files pass**. Both failures are pre-existing on unmodified development and unrelated to this revision.

| File | Cause | On unmodified development `e6c99995` |
|---|---|---|
| `tests/research-recovery-publication.test.mjs` | Refuses to run as root ("run this permissions regression as a non-root user"); this environment runs as root | Same failure (it failed identically on every earlier base) |
| `test/try-small-audit.test.mjs` | Case 1b, "without a session, a list whose close is more than 5 trading sessions old is not shown". Apparently date-dependent; not touched by this revision | **Same failure, re-run independently on `e6c99995`: 15 pass, 1 fail** |

I have not edited `try-small-audit`; it is Codex's, and I'm reporting it for its own triage.

## Review-specific

| Run | Before the fix (re-pin `cd266920`) | After the fix (`456c1495`) |
|---|---|---|
| Codex harness (`9c3d7475…`) | 0/4 | **4/4** (Node 20 and 22) |
| New R1–R3 regressions | 0/7 | **7/7** (Node 20 and 22) |

## Artifacts

| Item | Value |
|---|---|
| Code patch, development `e6c99995` → `456c1495` (15 files) | SHA256 `cfce2c2c208768295baf670fc1bf18981d788b9e83822c7e454edfff50bf627b`; applies cleanly to `e6c99995` |
| Required matrix | SHA256 `a2e21c9a2a6ea2b0f444c48cd3287ab8c576bc43d7b70c487b9f9c2b1491255b` |
| Manifest | `docs/validation/market03-catalyst03-r2-manifest.json`: per-file before/after hashes, and 12 dependency pins against current development, all unchanged |
