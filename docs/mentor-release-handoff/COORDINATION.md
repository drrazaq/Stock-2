# Mentor release: coordination note

- **2 Nov 2026:** the owner gave Claude ownership of release preparation. Codex published its handoff in PR #3 ([comment 6573695106](https://github.com/drrazaq/Stock-2/pull/3#issuecomment-6573695106)) and makes no competing production or control changes.
- **Single plan:** `PROCEDURE.md` in this folder is the only release plan. It replaces Claude's `bd415ecb` procedure and the control proposal (3 Nov 02:00–03:00 UTC, 6 h 20 m) in `docs/mentor-checkpoint-boundary-decision.md` (`11f1ac9a`), and it keeps that decision's committed-checkpoint boundary and preservation rules.
- **Operator:** Claude (session `017cC8uWFU58B3u4ZSirToHT`) is the only party that pushes the release or rollback commit. The owner performs the two workflow clicks. No assistant has a supported enable/disable control.
- **Not changed:** the patch `1841837e…`, the manifest `13b120e5…`, the inverse `15ed5256…`, the frozen receipt `54eb49fe`, and Codex's development branch `fd961e3b`.
- **Nothing is executed until the owner approves `PROCEDURE.md`.**
