# Test receipt for `b2ce57dec49fa0ac5b600b4d77d1be301fc0fd17` (Codex production-evidence repairs)

Reviewer: Claude. Read-only; no dispatch, rerun or cancellation.

## 1. Hosted CI: run 42770011496, job 129675347524 (ordinary push)

| Fact | Value | How verified |
|---|---|---|
| head_sha | `b2ce57dec49fa0ac5b600b4d77d1be301fc0fd17` | jobs API |
| Job | `test`: **completed / success**, 06:39:51–07:07:07 UTC | jobs API |
| Steps | V2 integration, REPO-03 inventory, gated watcher callers, **Run every test file** (06:41:38–07:07:04): all `success` | jobs API step conclusions |
| `host-monitor-stress` | skipped (branch condition, as designed) | jobs API |
| Full-suite semantics | the step loops over every `test/*.test.mjs` and `tests/*.test.mjs` and the 3 isolated files, sets `failed=1` on any file failure, and ends `exit $failed`; a `success` conclusion therefore means no file in that loop failed | `.github/workflows/tests.yml` at this commit |
| Log retrieved | **last 5,000 of 21,709 lines only** (connector cap; the full-log download host is blocked by this environment's proxy, HTTP 403). Saved as `ci-job-129675347524-tail5000.log`, sha256 `e17a8cc307d15fe13799c1ab2dad184fae89ebf922b17153dca337adc01f0331` | — |
| Within that tail | 84 unique `PASS <file>` lines, 0 duplicates, 0 `::error`, 83 `# fail 0` summaries, no non-zero `# fail` | parsed |

**Limitation:** I have **not** counted all 321 expected files (235 root + 86 nested) from the complete hosted log, and I could not read the checkout-SHA line, which sits in the unretrieved head. The step-level success on the exact head_sha is verified. A per-file count from the complete log must come from a route that can read it (Codex), or from my local run in §2.

## 2. Local independent run (one process per file, Node 20, this container)

**321 files run (235 `test/` + 86 `tests/`), one process each with a 600 s limit: 319 PASS, 2 FAIL as root, and both PASS as a non-root user.**
- `tests/mentor-persistence-receipt.test.mjs` subtest 14 and `tests/research-recovery-publication.test.mjs` subtest 7 failed with their own guard message, `'run this permissions regression as a non-root user'`: this container runs as uid 0. That is an environment precondition, not a code defect.
- Re-run as a non-root user (`tester`) on an identical copy of the tree: **33/33** and **7/7 PASS**.
- **Result: 321/321 files pass** under each file's stated precondition. This agrees with Codex's complete-hosted-log count (6761353994: 321/321, checkout `b2ce57de`), which I could not reproduce from the log myself (see §1).
- Per-file logs: `local-per-file-logs.tar.gz`.

## 3. Independent adversarial probes (actual `premarket-check.mjs`, faked clock, loopback stub, synthetic data)

`premarket-probe.mjs`, run against this commit:

| Case | Result |
|---|---|
| P1 actual 9 Nov late run (17:41 NY, 16:30 trade) | 0 GET, 0 POST, logs AFTER_HOURS |
| P2 previous-evening trade at 07:40 NY | UNKNOWN, no HOLD |
| P3 fresh trade below stop | STOP LEVEL OBSERVED, no 15-minute wait |
| P4 recorded exit + fresh above-stop quote | exit kept, **but the same stock also gets "HOLD context"** (finding F1) |
| P5 Thanksgiving / P6 03:30 NY | 0 GET, 0 POST |
| P7 8-minute-old trade | UNKNOWN, no HOLD |

Findings F1 (blocking), C1 and C2 (composition-blocking) and the first-15-minutes disposition: PR #1 comment 6761155780.
