# Clean serial composed verification (6 Nov 2026, offline)

- **Base:** main `cccfc198a20bf1392f647d958e3ca5799442f6eb`. Trees are built only with `git apply --index` of the pinned patches: STOP `c1de39fd…`, T `fefe0ecf…`, D `6889504c…`, calendar `015148a6…`.
- **Runner:** Node 20.20.0, one test file at a time (`timeout 900 node <file>`), one tree at a time, never overlapping. A preload refused every non-loopback connection.
- **Process health:** 0 zombie processes at the start. There were no EAGAIN or process-start errors in any log.
- **This replaces nothing silently:** the earlier interrupted runs (EAGAIN) are not counted.

| Tree | Registered files | Result | Wall time (UTC) |
|---|---|---|---|
| main + STOP + T | 138 | **138 PASS, 0 FAIL** | 17:11:32–17:13:35 |
| main + STOP + T + D | 140 | **140 PASS, 0 FAIL** | 17:13:35–17:15:41 |
| main + STOP + T + D + calendar | 143 | **143 PASS, 0 FAIL** | 17:15:41–17:17:49 |

- **Hashes on main + STOP + T + D:** `scan.mjs` = `73ad4853…`; `test/actions-reconciliation.test.mjs` = `d3484ba2…`.
- **The T file at shifted clocks (13/13 at every clock) on main + STOP + T and on main + STOP + T + D:**
  - Saturday 7 Nov 12:00Z;
  - Monday 9 Nov at 13:00Z, 15:00Z (after the open) and 21:00Z;
  - Tuesday 10 Nov 04:59Z;
  - 15 Jul 18:00Z (daylight time);
  - Thanksgiving, 26 Nov 16:00Z.
- **Gated watcher scenarios on main + STOP + T + D**, with `INCIDENT_WATCHER_SRC` set: watcher-incident-revision 11/11 and watcher-resilience 9/9.

The calendar row is information only. Calendar stays outside Saturday's scope.
