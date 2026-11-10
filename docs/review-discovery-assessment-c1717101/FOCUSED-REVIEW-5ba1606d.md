# Focused review: `5ba1606d` (Codex 6752515472) against 6747826019 / 6748100469

Offline and read-only; reviewed on Tuesday 10 November 2026 at about 03:30 UTC. The passed release `d52499c4` / `1a799a15` is not reopened.

**Verdict: PASS.** All five findings are closed and history is preserved. There is one non-blocking efficiency recommendation (E1).

## Findings

| Finding | Verification | Result |
|---|---|---|
| **J1: cross-job journal loss** | The bot reply (`researchAssessmentCycle`) no longer writes. Writers of `discovery-journal.jsonl` are now only `discover.mjs`; `scan.mjs` only reads it (`readRadarLedger` is a pure read). `discover.yml` has `concurrency: discovery`. `test/assessment-save-paths.test.mjs` extracts the **actual** `save()` block from `bot.yml`, the actual save step from `discover.yml` and the actual producer block from `discover.mjs`, and runs them in temporary git clones in both orders, preserving legacy, discovery and assessment rows. It passes 2/2. | **CLOSED** |
| **T1: invocation-dependent selection** | My harness (`t1new.mjs`) on the same pinned inputs: the producer selects GRMN/TIGO, ACRE/AD and CNNE/RNG once. Reads 1–3 then return the **same frozen batch** and record nothing. A change to `quality.json`'s `generatedAt` alone gives the **same `cycleKey` and the same batch**. The cycle key uses source sessions, event and report dates, and the rule-identity version; `evidenceVersion` excludes generation clocks. The cycle row is about 6.3 KB per producer run. | **CLOSED** |
| **R1: unkeyed rule IDs** | `assessmentRuleIdentity` separates NO_ADOPTED_RULE_SUPPLIED (ACRE, AD, CNNE, RNG), RULE_UNKEYED (legacy GRMN and TIGO rows: **no version guessed or backfilled**) and IDENTIFIED (only rows the scanner newly emits with a re-derivable `assessmentRule` definition). The outcome join now needs IDENTIFIED plus exact `ruleId`, `ruleVersion`, `assessmentId`, `evidenceVersion` and `horizon`; net-after-cost appears only for an authentic, reviewed complete chain. Cards show "rule NOT PROVEN". | **CLOSED** |
| **C1: VGZ wording** | Current documents (CURRENT-STATUS, REVIEW-RECONCILIATION, five-correction-evidence) read "EVENT-PINNED / INVESTIGATE transaction; no standalone short assessment". | **CLOSED** |
| **C2: ACRE wording** | Reads "INVESTIGATE / WAIT", with the interest-based mortgage-lending ZAD concern shown first. | **CLOSED** |
| **Historical preservation** | `REPORT.md` is byte-unchanged since `c1717101`, so the original ambiguous "PASS" text is kept and is superseded explicitly elsewhere. Legacy journal rows are untouched; the legacy reader ignores `assessment` and `assessment-cycle` rows. | **PASS** |
| **Validation** | Hosted job 129445452513 (run 42701026958) is on exact `5ba1606d` with conclusion success; every step succeeded, including the gated watcher callers and "Run every test file" (21:19–21:54 UTC). My local targeted runs: save-paths 2/2, triage 14/14, context 12/12. | **PASS** (receipt confirmed; I did not re-run the full 318 locally) |

## E1 (non-blocking): rule definitions are duplicated in every row

- `daily()` now embeds the full `assessmentRule` in **each** scanner row, including the whole `L.CFG`.
- Measured with the actual `scannerAssessmentRule`: about **1,086–1,211 bytes per row**. For 2,187 rows that is roughly **2.3–2.6 MB** added to `signals.json`, which is 0.99 MB on main today: about 3.5× larger, rewritten nightly and parsed by every reader.
- No reader enforces a size cap, so this does not break anything.
- **Recommended:** hoist the definitions into one file-level map keyed by `ruleId`, and keep only `ruleId` and `ruleVersion` in each row. Identity verification stays the same.

## Scheduling amendment (reviewed separately)

- **Accepted as procedurally correct.**
  - Session A must not start when the scheduled evidence that B (and R2) require is already known to be unobtainable.
  - A missing slot is MISSING and is never substituted.
  - Baseline scheduler loss is not a release regression and does not by itself authorize the inverse.
  - No deadline is moved, and nothing is waived.
- **Two precisions to add:**
  1. The baseline cycle must be an ordinary NYSE market day, and the **latest such day before T**. An older good day does not show current feasibility.
  2. State the observed baseline explicitly: across 5–9 November no weekday reached all 16 intraday slots. On 9 November `main.yml` recorded **zero** intraday runs and one run created at 22:57 UTC lasting about 29 seconds (42716422194); whether that was a full nightly scan is not established, since earlier nightly runs took around 50 minutes.
- **Consequence:** Session A is **NO-GO and has no feasible start date** until a complete baseline cycle is actually observed. The release does not change cron delivery, so nothing in the approved unit can cure this.
