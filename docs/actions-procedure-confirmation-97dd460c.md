# Focused confirmation: ACTIONS procedure r4 (Codex 97dd460c), R1 only

**Reviewer:** the Claude review session, 3 Nov 2026. Read-only. No scheduling, workflow change or production action.

**Verdict: PASS.** R1 is resolved. The C1–C4, D1 and D2 passes are preserved; only §4 test wording, the §7 CI row, §8 and §9 changed.

| Check | Result |
|---|---|
| Absolute release gate | §8: D's own complete hosted results must be SUCCESS, every required file must PASS, and no failure allowance applies. R gets its own all-PASS run. Missing, partial or late D evidence is UNVERIFIED and leads to ABORT B. |
| Baseline is informational only | B is the latest main Tests run whose non-`data/` tree is identical to M's. No exact-parent run is required. A missing B is reported as NO EQUIVALENT BASELINE PROVEN and never weakens D's gate. No dispatch or fake commit is allowed. |
| Obsolete TRY SMALL exception | Removed from §4, §7, §8 and the authorization text. The approval manifest has `failureAllowance: null`. It is not restored if those cases reappear. |
| Current-main compatibility (`93c593d4`) | 17/17 pins match. The patch applies cleanly. The rollback restores main's tree exactly. Non-data tree `02c9bcf4…` is identical to B `9f53fdad` (run 41632750514, success), `fd650fb0` and `c8e76e20`. |
| Local full suites, current main (`node "$f"`, Node 20, sequential) | Main: 131/131 PASS. Main+patch: 133/133 PASS. These agree with Codex's 132/134, which include one extra counting file. |
| Nine-file patch | Unchanged: `a9560969…` / `545e1a77…` / `4e28ee37…`. |
| Terminal CI | The Tests run on 97dd460c (41657343821) is completed: success. |

Note: Tests on my docs-only review branch (af24b863, run 41644018867) are red. That branch is based on an older development tree that predates the fixture fix, and it is not a production input.
