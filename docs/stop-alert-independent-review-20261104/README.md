# Stop-alert r2: independent focused review

Reviewed source: **c73cb6a8881f0ab8fef5e64cbabeec0d966a7d8d**, branch `claude/stop-alert-validity`. Production patch SHA256 **c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b**; rollback SHA256 **1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9**. Supersedes the independently reproduced future-price/nonfinite findings against `5f256d3f`.

**Implementation verdict: PASS for the focused corrections and exercised callers.** Release documentation still needs its contradictory old test counts/“not executed here” paragraph removed or explicitly labelled historical. No deployment approval is implied. This is separate from the historical-only audit; stop deployment is not its prerequisite.

Codex independently executed on Node **20.20.2**, ordinary non-root UID1000, synthetic local services/disposable Git remotes only:

| Independent execution | Result |
|---|---|
| r2 source, `node --test test/stop-alert-validity.test.mjs test/stop-watch.test.mjs` | **20/20 PASS** (17 + 3); actual bot caller included |
| r2 source, `INCIDENT_WATCHER_SRC=<r2>/ignition-watch.mjs node --test test/watcher-resilience.test.mjs test/watcher-incident-revision.test.mjs` | **20/20 PASS** (9 + 11), gated scenarios really enabled |
| Exact production patch applied to production source, same four suites with gated caller enabled | **40/40 PASS** |
| Added actual-watcher +30-second provider timestamp, derived moved-remote scenario | **2/2 PASS**, UNKNOWN instead of a stop crossing, observation/archive/publication assertions retained |

The added control derives only the moved-remote scenario from the reviewed resilience harness, adds 30 seconds to the synthetic provider trade timestamp, and expects `STOP CHECK UNKNOWN` instead of `STOP LEVEL REACHED`. The other assertion bodies are retained. It executes the actual watcher against a local snapshot server and disposable remote. Reproduction is provided below; it is not prospective evidence.

Every one of the **17 manifest paths** matched after applying the exact patch. Fresh production main at inspection: **d4d488a9f90db7923f2d6385df640fed428a88f6**. Its 18-commit comparison with production base `a95af15061569854c89350a5fb0f981e99783822` has 47 changed paths, **all data/**. All 16 existing manifest paths independently match their before/dependency hashes on that fresh main; the seventeenth is the newly added test. No financial/data contents were extracted for these test checkouts. The code-only production-base checkout plus exact patch therefore exercises the same non-data contents as current main plus patch. Source hashes and compatibility receipt are retained here.

The tests verify any future timestamp (no positive tolerance), nonfinite/non-numeric prices/clocks and invalid stops become UNKNOWN; fresh and boundary controls remain; missing/UNSENT/UNCERTAIN delivery fallback and ACK suppression work through the bot; normal watcher resilience, radar child module closure and archives still pass. Stop levels, strategy thresholds, holdings and offsets remain unchanged. One-way delivery de-duplication and ticker-level identity limitations remain as disclosed by the author.

Claude's **136/136 full-file-suite** result is author execution evidence, not independently rerun in this focused stop review. The separate development full suite belongs to a different source tree and is not presented as production-package evidence. The branch's README still has old 14/14 and “was not executed here” statements despite its r2 17/17 + gated-run receipts; those are documentation findings, not a new code defect. Ask Claude to reconcile those before a deployment proposal. No production write, provider call, dispatch or real message occurred.
