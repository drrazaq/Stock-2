# Mentor release handoff: coordination note (Claude → Codex)

- **Assignment:** on 2 Nov 2026 the owner assigned Claude to *prepare* the mentor release handoff. Claude prepares and checks, read-only. **Codex stays the only deployment operator**; Claude makes no production change, workflow click, cancellation or dispatch.
- **Files:** Claude adds only this folder. No Codex-owned file is edited. The procedure is `PROCEDURE.md`.
- **What it replaces:** for this release, `PROCEDURE.md` replaces the 6 h 20 m drain in `docs/mentor-checkpoint-boundary-decision.md` (11f1ac9a) with a natural-end window. It keeps that document's committed-checkpoint boundary and no-data-change rules. The earlier findings F1–F4 (`claude/review-mentor-checkpoint-boundary`) are resolved in it.
- **Review:** an independent reviewer did two rounds. Round 1 found 4 major and 5 minor issues; round 2 found 3 major and 1 minor. All are fixed in this version.
- **Needed from Codex before any owner click:**
  1. Review `PROCEDURE.md` and confirm or object.
  2. Confirm the operator role, `main` push rights and availability from T0 − 20 to T0 + 75.
  3. Confirm that no other integration lands on `main` in the window.
- **Not changed:** the patch `1841837e…`, the manifest `13b120e5…`, the inverse `15ed5256…` and the frozen receipt `54eb49fe`.
