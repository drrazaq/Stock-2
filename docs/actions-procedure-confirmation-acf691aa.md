# Focused confirmation: ACTIONS procedure r3 (Codex acf691aa), D1/D2 only

**Reviewer:** the Claude review session, 3 Nov 2026. Read-only. No scheduling or production action. The nine-file patch is unchanged.

**Verdict: D1 PASS, D2 handoff PASS. One remaining defect, R1.** The C1–C4 passes from 0fc705a9 are preserved: §§2–5 are unchanged apart from the corrected capability text.

## Verified

- **Hashes:**
  - All 8 procedure files match `maintenance-approval-manifest.json`, including `bounded-maintenance-proposal.md` `e7a2d897…` and `verify-save-evidence.py` `7705012e…`.
  - The frozen patch `a9560969…`, manifest `545e1a77…` and rollback `4e28ee37…` are unchanged.
  - All 17 ACTIONS pins still match current main `bc3554ab`.
- **D1 (§6):** the five conditions (a)–(e) match my proposal. Two points are tighter than mine and correct:
  - a complete log is required, so a tail alone fails;
  - silence must hold across the whole loop step.

  The limits are stated truthfully. Not proven by the five conditions: ignored files, the freshness of a silently failed initial pull, scan/reply success, command intent and equality to the latest remote. `verify-save-evidence.py`, run here against the unpatched main worktree, reports **PASS, 9/9 cases**. The worktree stayed clean.
- **D2 (§2, §8):**
  - Claude's capability is now stated correctly (last 5,000 lines).
  - Codex is a read-only verifier with no deploy, rollback, cancellation or transfer authority, and must be actively started by the owner and acknowledge.
  - The receipt must cover all groups and be tied to the exact SHA, and it is sanitized. Claude alone decides V1 or abort.
  - Missing, partial or late evidence means UNVERIFIED, and after D the ABORT B gates apply.
  - The tail alternative is explicitly not adopted.

## R1: an exact-parent hosted Tests run will normally not exist

§8 requires a hosted Tests run on the exact immediate parent M; a missing one "blocks this primary route". But `tests.yml` has `paths-ignore: data/**`, and main's tip is almost always a data commit:

- current main `bc3554ab` is "squad 26 watcher";
- only 5 of the 53 main commits on 3 Nov changed anything outside `data/`.

So the gate fails at entry on a normal morning, and again before D whenever a data writer commits. Data writers run continuously and are allowed to.

The parent run adds nothing to the decision: §8 already judges the release absolutely. Only TRY SMALL cases 1/3b, or nothing, may fail, and parent failures are not grandfathered.

**Required change (one sentence):**
- D's own complete hosted log, read through the Codex handoff, is the gate.
- The hosted baseline is the most recent main Tests run whose non-`data/` tree is byte-identical to M's (`git diff --quiet <B> <M> -- . ':!data'`). It is informational, and its run, job and SHA are recorded in the receipt.
- No exact-M run is required, and none is created.

D always changes code, so D always gets its own run. The inverse R does too.

## Note: the baseline has changed

Commit `9f53fdad` (another session, 3 Nov) fixed the dated fixtures in `test/try-small-audit.test.mjs`. Tests run 41632750514 on main is now **success**. §8 already covers this ("If both parent/candidate pass that file, record it"). The expected outcome is now an all-PASS hosted log, with cases 1/3b allowed only if they reappear. The readiness full suites must be re-run on the new main. This is not a procedure defect.
