# EARNINGS DRIFT holiday fix: separate scan.mjs patch and synthetic regressions

**Author:** Claude, 2 Nov 2026. This is a docs-only branch: `scan.mjs` is **not edited** here. Codex or the main session applies the patch.

## The defect

The EARNINGS DRIFT lane in ACTIONS finds the price-reaction day of a report with a weekday-only "next day", so it ignores market holidays.

| Report | Old rule's reaction day | Correct session |
|---|---|---|
| After the close, Wed 25 Nov 2026 | Thanksgiving, 26 Nov | 27 Nov |
| After the close, Thu 25 Mar 2027 | Good Friday, 26 Mar | 29 Mar |
| After the close, Thu 2 Jul 2026 | 3 Jul (Independence Day observed) | 6 Jul |
| After the close, Thu 18 Jun 2026 | Juneteenth, 19 Jun | 22 Jun |
| After the close, Thu 24 Dec 2026 | Christmas, 25 Dec | 28 Dec |
| After the close, Fri 15 Jan 2027 | MLK Day, 18 Jan | 19 Jan |

The old rule's day is never a session, so the report is silently skipped. A before-the-open report dated on a closed day (a holiday or a weekend) is also never matched.

## The fix

A new top-level function `peadReactsOn(r, session)` uses scan.mjs's own exchange calendar (`isSession`, `sessionPlus`):
- **before the open:** that day if it is a session, otherwise the next session;
- **after the close:** the next session;
- **unknown time:** either of the two.

The EARNINGS DRIFT loop calls it in place of the inline weekday logic. Nothing else changes: the rule, thresholds, stop, hold, wording and every other lane are untouched.

## Files and hashes

| Item | Value |
|---|---|
| Patch | `scan-earnings-holiday.patch` (25 lines), SHA256 `608e01e97ab2efcd1cb82ecf240e0e19ccb489bbb573f68c1851e468f452fb07` |
| Regressions | `earnings-holiday.test.mjs` (6 tests). Copy it to `test/earnings-holiday.test.mjs` together with the patch. SHA256 `678d10d1cce52574ab75e37fa63cff86e110f51f8f071bb8efbbb54e54689016` |
| Codex `Stock2-safety-fixes` @ `2e466c58` | `scan.mjs` before `73a241d969df9c20892b3036ebdd7daba335bb8dbcc6a82c5dc3cefc797765c7`, after `7d01d4fb728325e33f3ecefa51b373bdb981bf1287004a1eda64f5b610d771e0` |
| Production main @ `f6a9b166` | `scan.mjs` before `76ffcd5675a00a881432d5cb0dad69d6d5235cd66932ef07eb4530ddca9c1a99`, after `f08a338725387d5b7d4ecca6cffb46ec6baea84bc147feec39cb0061c0aaa91a` |

## Results (local; Node 20.20.0 and Node 22)

| Tree | Result |
|---|---|
| `2e466c58` without the patch | The regression file **fails**, as intended: `peadReactsOn` is not defined. |
| `2e466c58` + patch | **6/6** on Node 20 and on Node 22. Every scan.mjs-dependent test file (63 files using `load-scan` / `scan.mjs`) passes: **63/63**. |
| Production main `f6a9b166` + patch | **6/6**. `buy-gates` 9/9 and `bot-actions` 8/8. |

### Equivalence check

The new rule was compared with the old one on every calendar day of 2026–2027, for all three timings and every session within six days: 9,039 comparisons. 302 results differ. Each difference was asserted to be a case where the old rule pointed at a closed day, a holiday or a weekend date. No ordinary trading-day result changes.

No provider, credential, deployment or message was involved. Codex's files were not edited.
