# D-companion test-fixture correction (T): deterministic clocks for one existing test. Test-only; not approved

- **Prepared:** 6 Nov 2026 by Claude on `claude/d-test-clock-fixture`, from main `7b7cf0f7`.
- **Not done:** no deployment, workflow action or production change.
- **Unchanged:** Saturday's approved STOP R2 (`c1de39fd…`, inverse `1a13a44d…`) and D1–D4 (`6889504c…`, inverse `7a9e1250…`) patch bytes.

## Problem (reproduced)

With D1–D4 applied, case 6 of `test/actions-reconciliation.test.mjs` ("pending ZAD signal and no permitted buy are distinct") stamped its synthetic list with the **machine's current time** (`generatedAt: new Date()`). D1/R2 correctly treats a list generated after its own next open as UNKNOWN. So the case **failed on weekdays from the 09:30 New York open until New York midnight**, and passed only before the open, overnight, at weekends and on holidays. Saturday's clock would hide it; that is not acceptable.

## Correction (one file, test only; assertions and production code unchanged)

Inside that one case only, both clocks are frozen to the intended scenario:
- the evaluation clock is **Wed 4 Nov 2026 08:00 New York** (`2026-11-04T13:00:00Z`, pre-open);
- the list's `generatedAt` is **Tue 3 Nov 16:30 New York** (`2026-11-03T21:30:00Z`, after that session's close).

The previous-session derivation is unchanged and is now asserted (`today` = 2026-11-04, `day` = 2026-11-03). The `Date` substitute (frozen `Date.now()` and no-argument `new Date()`) is installed only for this case and always restored. All four original assertions are byte-identical.

| | SHA256 |
|---|---|
| `test/actions-reconciliation.test.mjs` before (main) | `a63bb5793651a5b0cd4862233b90a6c6da07c29f55557a740eaf9a3891dcbe41` |
| after | `d3484ba2d2fc427a6bbaf0622aac569956dd4353180a94fb35b380abed8addb4` |
| `test-fixture.patch` | `fefe0ecfd862729b276db82433ae58ea351901e41939dc80f61eeb5b381dd969` |
| `test-fixture-rollback.patch` (exact inverse) | `3a2d2ffdcd8913fc17e01b85adce7cd15665ebe9d3060c49c08db02c31eb95a9` |

Neither the STOP nor the D patch touches this file. T applies on main, on main + STOP and on main + STOP + D.

## Evidence (Claude, Node 20, external connections blocked)

**Machine-clock matrix** (whole file, pass/fail; M = main `7b7cf0f7`, MSD = main + STOP + D):

| Machine clock (UTC) | Case | M orig | M fixed | MSD orig | MSD fixed |
|---|---|---|---|---|---|
| 2026-11-09 13:00:00 | weekday pre-open (EST) | 13/0 | 13/0 | 13/0 | 13/0 |
| 2026-11-09 14:29:59 | 1 s before open | 13/0 | 13/0 | 13/0 | 13/0 |
| 2026-11-09 14:30:00 | exact open | 13/0 | 13/0 | **12/1** | 13/0 |
| 2026-11-09 14:30:01 | 1 s after open | 13/0 | 13/0 | **12/1** | 13/0 |
| 2026-11-09 22:00 | weekday evening | 13/0 | 13/0 | **12/1** | 13/0 |
| 2026-11-10 04:59 | before NY midnight | 13/0 | 13/0 | **12/1** | 13/0 |
| 2026-11-10 05:30 | after NY midnight | 13/0 | 13/0 | 13/0 | 13/0 |
| 2026-11-07 07:00 | Saturday | 13/0 | 13/0 | 13/0 | 13/0 |
| 2026-11-08 20:00 | Sunday | 13/0 | 13/0 | 13/0 | 13/0 |
| 2026-07-15 13:29 | summer (EDT) pre-open | 13/0 | 13/0 | 13/0 | 13/0 |
| 2026-07-15 15:00 | summer (EDT) post-open | 13/0 | 13/0 | **12/1** | 13/0 |
| 2026-11-02 14:45 | Monday after DST end | 13/0 | 13/0 | **12/1** | 13/0 |
| 2027-03-15 13:45 | Monday after DST start | 13/0 | 13/0 | **12/1** | 13/0 |
| 2026-11-26 16:00 | Thanksgiving | 13/0 | 13/0 | 13/0 | 13/0 |
| 2026-11-27 19:00 | early-close day, after close | 13/0 | 13/0 | **12/1** | 13/0 |

**The frozen clock drives D's real cutoff** (fixed file, MSD, only `EVAL_AT` varied): `…T14:29:59.999Z` gives 13/0, `…T14:30:00.000Z` gives 13/0 (D's inclusive cutoff), and `…T14:30:00.001Z` gives **12/1** (expired). So the fixture's pre-open scenario is meaningful, and D's production behaviour is unchanged.

**Exact proposed composition, real clock** (Fri 6 Nov 14:51 UTC, a weekday after the open, when the original fails):
- main `7b7cf0f7` + STOP + T: **138/138 files**.
- main + STOP + T + D: **140/140 files**; `scan.mjs` after = `73ad4853…`, matching D's expected after-hash.
- D's gates on that tree: gated watcher scenarios 9/9 and 11/11, D1–D4 23/23, STOP 17/17, actions-reconciliation 13/13.

## Form and ordering: a separately ordered test-only commit (D's approved bytes unchanged)

T is **not** a refreshed D package. It is one separate, normal, non-force commit changing only `test/actions-reconciliation.test.mjs`. Proposed order within the attended session:

1. STOP R2 reaches **VERIFIED V1** (unchanged).
2. **T:**
   - fresh-parent check that the file's before-hash is `a63bb579…`;
   - all tests on parent + T pass;
   - writer check (no production consumer reads tests);
   - push T as a direct child of the fresh parent;
   - T's push CI: every registered file PASS exactly once, with Codex's complete-log receipt;
   - T's outcomes: APPLIED / NOT APPLIED / UNKNOWN. **UNKNOWN or UNVERIFIED: no D.**
3. **D:** unchanged patch and gates, with T's commit as the fresh parent. D's before-hashes are unaffected because T touches none of D's files.

**Rollback:**
- T: its exact inverse only, if T's own CI or log gate fails, and before D.
- If D is later rolled back, T stays: it passes on main without D at every clock tested.

**Rule (owner, 6 Nov):** if T is not independently reviewed **and** separately approved before Saturday's session, D is **skipped**, and the session follows the reviewed STOP-only restoration path.
