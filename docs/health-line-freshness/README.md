# Health-line freshness correction: development package (not deployed)

Prepared on 4 Nov 2026 by Claude on the isolated branch `claude/health-line-freshness`, from release `51b5e349`. This is preparation and synthetic tests only. There was no production change, deployment, dispatch, provider call or real message. Deployment needs its own approval.

## Revision 2 (Codex blocker on 787a902f)

- **Codex's blocker:** in revision 1, any `NNNN-NN-NN` string counted as evidence. `2026-99-99` or a session after the expected close could therefore read as CURRENT, and the watchdog stayed silent.
- **The fix:** session evidence must now pass the new `isSessionDate()` check *and* be no later than the expected close. That means:
  - a real calendar date (round-trip checked);
  - a US trading session (a weekday that is not a market holiday);
  - not after the expected close.

  Anything else is **UNKNOWN**, in both the ACTIONS health line (`UNKNOWN (no valid session date)`, never "checks OK") and the watchdog (warned once per session when due, without echoing the bad value).
- **Unchanged:** the expected-close calendar, the due times and all strategy rules.

**New regressions:**
- **Rejected values:**
  - malformed or impossible dates: `2026-99-99`, `2026-02-30`, `2026-02-29` (2026 is not a leap year), `2026-13-01`, `2026-11-31`, `2026-00-10`;
  - sessions after the expected close: `2026-11-04`, `2026-11-05`, `2027-01-04`;
  - days that were not trading sessions: weekend days `2026-10-31` and `2026-11-01`, and Thanksgiving `2026-11-26`;
  - wrong formats and types: `20261103`, a leading space, a number, null and an object.
- **Valid controls:**
  - current (`2026-11-03`);
  - older (`2026-11-02`, `2025-12-31`);
  - not yet due;
  - the real leap day `2028-02-29`.
- **End-to-end checks:** the actual ACTIONS health line, and the actual watchdog through a loopback Telegram stub. The stub checks one message per session, the offset preserved, and no alert for current evidence.

**Calendar parity:** the check against the old rule still runs hourly from 31 Oct to 1 Dec 2026. The expected close is identical for every hour, and warnings are identical for valid evidence. Future evidence is now asserted to be UNKNOWN.

**Results:**
- New file: 14/14 pass.
- Against revision 1 (787a902f): 5 fail. The 3 new regressions, the reworked parity check, and one wording assertion (`no valid session date`).
- Against the unchanged release code: 12 fail.
- Full suite: see `verification.json`.

## Problem (4 Nov)

ACTIONS printed `SYSTEM HEALTH: checks OK` while the watchdog had just reported discovery for the 3 Nov close as missing. There were two causes:

1. The line reads `data/health.json`, a snapshot from the last nightly run (00:24 Kuwait on 4 Nov), and did not show when it was taken.
2. That snapshot judges discovery by age ("34 weekday-hours"). The watchdog judges it by the expected close. So a source could be overdue for its session and still pass the snapshot.

## Change (`scan.mjs` only, plus one new test file)

- **`sourceFreshness(nowMs, haves)`:** one rule shared by the watchdog and the health line.
  - The expected close is the latest finished US session on a weekday that is not a market holiday.
  - Each source has a due time: scan 8:30 pm, discovery 2:30 am and movers 3:30 am New York.
  - Each source gets one state:
    - **CURRENT:** its session is the expected one or later.
    - **LATE:** it is due, but its session is older.
    - **PENDING:** it is older but not yet due.
    - **UNKNOWN:** it has no readable session, and is never treated as OK.
- **`healthLine(nowMs)`:**
  - shows the snapshot time in Kuwait time, or `time unknown`;
  - names the expected close;
  - lists each source's live state.

  Any LATE or UNKNOWN source replaces "checks OK" with `NOT CURRENT: …`. A missing or unreadable snapshot is `saved check UNKNOWN`. Saved problems are still shown, together with any live stale source.
- **`watchdog()`:** now uses the same rule. Its warnings are unchanged. One exception: a malformed, non-date session is now treated as UNKNOWN and warned about when due. Previously it could compare as newer than the expected close and stay silent.

Example for 4 Nov at 10:36 Kuwait:

`SYSTEM HEALTH: NOT CURRENT: discovery engine LATE (the saved check 00:24 Kuwait 2026-11-04 found no problems before this); sources for the 2026-11-03 close: nightly scan current, discovery engine LATE (latest 2026-11-02), movers radar current.`

Not changed: `health.mjs`, the snapshot's own thresholds, workflows, data, alerts and their once-per-session flag (`warned`).

## Tests

The new file is `test/health-line-freshness.test.mjs`. It has 11 cases, all synthetic, offline and run through `test/load-scan.mjs`:

- the 4 Nov incident;
- recovery after the source catches up;
- a late-schedule (PENDING) window;
- unknown snapshot, missing file and malformed session;
- saved problems plus a live stale source;
- Saturday and Sunday;
- the day after Thanksgiving (2026-11-26 holiday);
- an old `warned` flag after recovery;
- an hourly parity check against the verbatim old watchdog rule for 31 Oct–1 Dec 2026, covering the DST change, a weekend and Thanksgiving (more than 3,000 comparisons);
- the actual ACTIONS caller.

| Run | Result |
|---|---|
| New file on this branch | 11/11 pass |
| Same file against the unchanged release code (`SCAN_SRC`) | 9 fail. The 2 that pass are the offline-guard case and the recovery case. The old code also says "checks OK" there, so passing is expected. |
| Full suite on this branch (`node "$f"` per file, Node 20) | see `verification.json` |

## Ownership and review

- Claude owns the two `scan.mjs` regions listed in `manifest.json` until review. Codex's development branch `Stock2-safety-fixes` (f92a29d8) does not touch them.
- Hashes: `production.patch` and `rollback.patch` are listed in `manifest.json`, with the before and after hashes and the pinned dependencies.
- Deployment would be a separate decision. The bot loads `scan.mjs` fresh for each check, so the drain and Disable/Enable questions from the ACTIONS procedure apply again.
