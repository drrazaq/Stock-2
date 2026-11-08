# R1 release: operator confirmation and amendment O1 (review only; not approved, not executed)

This confirms Codex's `RELEASE-PROPOSAL.md` @ `ff587b508` for rev17 `73aa701f` and binding `c29852d1`, with one amendment, **O1**. Nothing was dispatched, paused, pushed or changed. The census below was read on 8 Nov from main `6e72a8d0` and the public workflow list (all workflows `active`).

## Why O1 is needed

- **Two rules require main to stay quiet:**
  - B4 refuses to push `C` if main moved after `M0`.
  - `r1-migrate.yml` exits before `--apply` unless `origin/main` equals `source_sha=C`.
- **Main moves often:** 56 workflows push to main on a schedule, and GitHub delays scheduled runs by hours. On Sat 7 Nov, 07:30–10:30 UTC, main received pushes from comeback (cron 01:35), confluence (02:30), research-lab (Fri 22:17) and the claude.ai daily researcher (Sat–Thu 08:37 UTC, about 1 h).
- **Push triggers are not a risk:** no bound path is a `run-*-now.txt`, `index.html` or `verify-lab` path. Pushing `C` starts only `tests.yml`, which does not push. No workflow uses `workflow_run`, `repository_dispatch` or issue triggers.

## Window choice (`census-scheduled-main-pushers.json`)

These are scheduled main-pushers **outside the 10 writers** whose cron fires in the 14 hours before the window ends. 14 hours covers the observed delay of up to 11 h.

| Window (UTC) | Kuwait | Extra pauses needed |
|---|---|---|
| Sat 14 Nov 08:00–10:00 (Codex draft) | 11:00–13:00 | **44**, plus the daily researcher at 08:37 UTC |
| Sat 14 Nov 15:00–17:00 | 18:00–20:00 | 6 |
| **Sat 14 Nov 17:00–19:00 (proposed)** | **20:00–22:00** | **4: `discover`, `ml-lab`, `options-lab`, `squad26-lab`** |
| Sun 15 Nov 05:00–07:00 | 08:00–10:00 (a Kuwait workday) | 2 |

The proposed Saturday evening is on the owner's weekend and clear of the daily researcher (done by about 09:40 UTC) and Agent A (Sun 11:47 UTC).

## O1 amendment

1. **Pause set = 14:** the 10 writers plus `discover`, `ml-lab`, `options-lab`, `squad26-lab`.
   - Record each prior state just before the window, and restore only those states after the Enable decision (bot first).
   - No other setting is changed.
2. **Capture-v2 (B3/B8) open-status queries cover all 14.** The 31-day completed-run coverage stays on the 10 writers.
3. **Quiet-main check:** `origin/main` must equal `M0` right before the `C` push, and equal `C` right before B6. If it moves anyway:
   - before the push: restart at B1 within the cutoffs;
   - after `C`: no migrate dispatch; follow R-0; no second dispatch.
   - A migrate log showing "main is no longer the approved source", with no manifest on remote main, is established **not published**.
4. **Cutoffs:** Codex's table shifted by +9 h, with every other rule unchanged.

| Phase | Cutoff UTC / Kuwait, Sat 14 Nov |
|---|---|
| Fresh precheck, state record, owner pauses the 14, drain, capture | 17:15 / 20:15 |
| `C` publication and complete CI receipt | 17:35 / 20:35 |
| Backup proof (`backup-compare`, owner adds then removes `R1_BACKUP_CHECK`) | 17:50 / 20:50 |
| Migration plus independent proof | 18:20 / 21:20 |
| Fresh writer gate and owner Enable decision | 18:30 / 21:30 |
| Reserved recovery / first bot observation | 19:00 / 22:00 |

**Post-receipts:**
- First bot save: about 30 min after Enable.
- First watcher day: Mon 16 Nov, 13:10 UTC start.
- First nightly scan: Mon 16 Nov, 21:30 UTC.
- Each cutoff is actual `started_at` + job timeout + 15 min.

## Confirmed as written

- Job limits: Tests 10 min; key-check, backup-compare 5; migrate 15; bot 350; main 300; ignition 360.
- Capture age at most 10 min.
- The 10 writers equal RELEASE B2.
- 2 dispatches (B5b route (a) + B6), with one R-0 at most.
- SEALED_SECRET 21; M0 `PRIVATE_KEY` 7.
- Receipt rule, rollback/UNKNOWN rules and the $0 constraints.
