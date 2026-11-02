# `discover.mjs` price-day ingress, rebased onto accepted development `e0c12d31`

**Author:** Claude, 2 Nov 2026. **For:** Codex integration review. **Not deployed.** Codex has not yet reviewed this package's code; this is its first submission for review.

| Item | Value |
|---|---|
| Branch | `claude/market03-discover-rebased` |
| Code commit | `aaf9d3b8531b17c4452187a6d7e6095871c0a031` |
| Accepted base | `e0c12d31e1e741762da76ce3cdbad466c213e5f2` |
| Source package | `claude/market03-discover` @ `b8b0476c`, left unchanged |

## Rebase method

- **Runtime file:** `discover.mjs` on the base is byte-identical to the pre-edit version the package was built on, so the packaged version was transplanted unchanged; its hash matches the source package.
- **Test:** `tests/market03-discover-price-day.test.mjs` was added.
- **Matrix:**
  - the matrix tool's two `discover.mjs` contract entries were applied as a diff over the base tool;
  - the required matrix was regenerated;
  - result: 87 decision ingresses, 29 reviewed, 3 fully covered.
- **Shared helper:** the accepted source contract (SHA256 `515f2034…`) is used as integrated.
- **Pinned dependencies:** all unchanged against the base, including `scan.mjs` `18a5765c…`.

## What the package does (unchanged from the source package)

- **Current day:** the latest completed exchange session, never today's unfinished one.
- **Request outcomes:** each grouped request keeps its outcome (FAILED, RATE_LIMITED, REFUSED, MALFORMED, EMPTY, INCOMPLETE or OBSERVED). Inside the calendar's years, closed days are never requested.
- **No silent fallback:**
  - if the latest session cannot be read, the previous list keeps its own date;
  - the attempt is recorded;
  - the run fails visibly.
- **Historical samples:** fallbacks and calendar basis are recorded; samples outside the calendar's years use a labelled weekday walk.
- **Unchanged:** the discovery criteria and wording.

## Results

Node 20.20.0, run locally as root.

| Run | Result |
|---|---|
| `tests/market03-discover-price-day.test.mjs` (actual caller) | **10/10** on Node 20 and on Node 22. The unmodified `discover.mjs` failed 0/10 in the source package's evidence. |
| Matrix drift guard | 3/3 |
| **Full suite on the exact commit** | **258 of 259 files pass.** The only failure is `tests/research-recovery-publication.test.mjs`, which refuses to run as root. |

## Exact artifacts

| Item | Value |
|---|---|
| Patch `docs/validation/market03-discover-rebased-code.patch` (base → `aaf9d3b8`, 4 files including the regenerated matrix) | SHA256 `fa5d8a494b978c4cd204cf57392ac9011fb6d3aa68620c906b4ffe75c397b616` |
| Manifest | `docs/validation/market03-discover-rebased-manifest.json` |

**Integration note:** if `claude/market03-batch2-rebased` is also integrated, apply both tool diffs and regenerate the shared matrix once.

**Known limit:** `market-session.mjs` covers 2026–2027. The current-day rule needs that calendar extended before 2028 (a separate change); until then a 2028 run fails visibly rather than guessing.
