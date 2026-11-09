# Standalone candidate review checkpoint

Candidate `10874f6867cd6564c236e2dba217497f1cc591e8`, binding/docs `a7704f9a`, parent production `6e72a8d0c46385f3c329157d627636875505a224`. **CORRECTIONS REQUIRED**, sent directly to Claude in PR1 comment6732979886. Combined R1 and offered K2 remain PARKED; no key or operational action.

Independently verified all24 paths, SHA256, bytes and Git modes against the binding; source-only build gives exact candidate tree; inverse returns exact parent tree. No data path changes. This is source/inverse evidence, not proof that reverting a running calendar writer is semantically safe.

The complete offline inventory is155 files:154 under test plus tests/instrument-type.test.mjs. All155 passed at the actual test clock under Node20 with external networking blocked. The original wrong154-file runner assertion stopped before testing, was corrected to155, and no file was excluded. No baseline failure waived. Separately, the unchanged try-small case1b fails at04:30UTC on9Nov on parent and candidate, then passes on candidate at05:30UTC. Ten calendar days is only five NY sessions before the midnight boundary. Use the existing reviewed exchange-session fixture and preserve positive controls/assertions; do not relax the strategy gate.

Required corrections: (1) port that existing deterministic fixture; (2) correct full inventory and validate the exact refreshed candidate; (3) correct operative claims: existing calendar PRIVATE_KEY remains in use, running bot loops git-pull and can consume a source push, and rollback requires logical calendar-schema/readers plus concurrent-save qualification. An unchanged ciphertext format is insufficient evidence for blanket safe-at-any-time rollback. These are distinct from proven runtime failures. A fresh package/binding and focused compatibility evidence are pending Claude; no deployment approval is requested.

For the smallest repair, recommend omitting unrelated SEC404 wording and its test, retaining all required fetch/send/retry and STOP safeguards. With the existing fixture correction this would be23paths. This is a scope recommendation, not a fabricated runtime blocker.

Production incidents and synthetic reproductions remain separately identified in README/evidence.json. Root source tests are engineering evidence, not trading results. Acceptance24/40 unchanged. Financial missing-control sensitivity in acfbd3fe7 has a separate arithmetic review request; it does not block this engineering review.
