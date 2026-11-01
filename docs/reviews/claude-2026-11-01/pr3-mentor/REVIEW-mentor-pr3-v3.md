# Independent re-review: read-only LEADER DIP mentor, PR #3 revision 3 (changes only)

**Reviewer:** Claude.

**Scope:** read-only review. I made no edit, deployment, credential use, provider call or message. Every bot run used synthetic positions and a fake Telegram server on 127.0.0.1.

**Earlier reviews:**
- `REVIEW-mentor-pr3.md`: CHANGES REQUIRED (M1, M2, M3).
- `REVIEW-mentor-pr3-v2.md`: M3 closed; M1 and M2 open.

## Verdict: APPROVE for release (M1 and M2 closed)

There are two non-blocking notes (n1, n2). A review verdict is not deployment approval; release remains the owner's decision.

## What was reviewed

| Item | Value |
|---|---|
| Revised PR head | `review/mentor-readonly-20261101` @ `25a85000b076c4da649634606467e71b577bc75c` |
| Patch | `docs/validation/mentor-readonly-production.patch`, SHA256 `1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7` (manifest kind `READ_ONLY_MENTOR_PRODUCTION_PACKAGE_V3_M1_M3`) |
| Production base | main `f6a9b1668d0591cf24a734034949b96b241fe35b` |
| Changed since revision 2 | `mentor-plan.mjs` (`c9450320…` → `5c081a88…`); tests `mentor-readonly`, `mentor-release`, `mentor-release-plan`; new `test/mentor-m1-m3.test.mjs` |
| Unchanged since revision 2 | `scan.mjs` (`a8641753…`, byte-identical to the revision-2 after-hash), `test/load-scan.mjs`, `test/mentor-release-examples.mjs` |

**Identity (independently executed):** the patch applies cleanly to main `f6a9b166`. All 8 resulting files match the manifest after-hashes and are byte-identical to the PR head `25a8500`.

## M1 (closed): a consistent holding no longer reads as contradictory

`leaderDipMentorPlan` now splits the issues into two lists:
- `contradictions`: target ≠ +20%, stop variant, over the $1,000 slot, future buy date, buy date ≠ the signal's next open, hold ≠ 126, clock/date mismatch;
- `evidenceGaps`: everything else.

The plan status is derived from those lists:

| Situation | Plan status |
|---|---|
| A recorded holding with no original signal on file | `RECORDED_PLAN_PROVENANCE_MISSING` |
| Missing fill, buy date or calendar | `INCOMPLETE_RECORDED_PLAN` |
| A real difference | `UNRESOLVED` |
| A non-LEADER-DIP lane | `UNSUPPORTED` |

The reply says plainly: "Original signal not on file; this is missing history, not a contradiction." It still states "NOT PROVEN" and "No new BUY or HOLD approval".

A real difference still surfaces as a plain check line, for example "Check: Stored target differs from the unadopted +20% overlay."

**Executed:**
- Synthetic consistent holding (bought 30 Oct 2026, $100, target $120, hold 126): `RECORDED_PLAN_PROVENANCE_MISSING`, no contradictions.
- Target 130, stop 90, slot over $1,000, future buy: each `UNRESOLVED`, with the right check line.
- No buy date: `INCOMPLETE_RECORDED_PLAN`, with "the exit date cannot be calculated".
- Real record shapes: I also ran the function locally on the field shapes of the owner's current records, printing only status codes.
  - No owner-format LEADER DIP record reads as contradictory.
  - The trend-trade lane (`kind: 'leader'`) correctly reads as unsupported.
  - Those values are not published.

## M2 (closed): the reply is short, numbers first and readable

| | Revision 2 | Revision 3 |
|---|---|---|
| Consistent holding | about 3,240 characters, codes such as `MONITOR_RESEARCH_CONTRACT`, "up to126", "model0.8%" | 1,386 characters, 14 lines |
| Unsupported lane / unknown symbol | about 3,000 characters | 113 to 152 characters |

- **Structure:** six numbered lines lead (position, owner overlay, tested exit date and time, size/risk, limits, timing), then "No new BUY or HOLD approval", then Details.
- **Scans on every rendered reply:**
  - no `UPPER_CASE_CODE` tokens;
  - no number-word joins.
  - Remaining jargon: "BBO" (see n2).

## Safety (re-verified, unchanged behaviour)

All from the actual-bot harness `mentor-harness-v3.mjs`, Node 20.20.0.

- **Read-only:** 8 mentor-only batches change only `data/tg-state.json`; the offset advances; foreign chats are ignored.
- **Mixed messages still record owner commands:**
  - `mentor GOOD` + `stop OTHER 46` (both orders, and `/mentor`): the stop is saved;
  - separate messages in one batch: the stop is saved and other positions are unchanged.
- **Spellings:** `/mentor`, `@bot`, dotted symbol, two lines: one reply per symbol. Bare or malformed text: the usage hint, nothing written.
- **Dates:**
  - the exit date in the reply equals the independent 126th-session count for every held case, including the Thanksgiving buy;
  - the lead's entry date equals the next session;
  - the pure-function check over 186 buy days: 0 mismatches.

## Tests (Node 20.20.0, CI-style loop, without `INCIDENT_WATCHER_SRC`)

- `mentor-m1-m3` 10/10, `mentor-readonly` 2/2, `mentor-release` 10/10, `mentor-release-plan` 8/8.
- **Full suite on main + patch:** 132/132 files pass.

## Notes (non-blocking)

- **n1: deadline state is not in the numbered summary.**
  - The plan computes the deadline state, but line 3 only gives the date ("3. Tested exit reference: 2 Nov 2026 at 16:00 New York CLOSE.").
  - When the close is today, no line says so (the guide's `REGISTERED_CLOSE_TODAY` text is no longer rendered).
  - When it has passed, the note is only in Details.
  - Suggestion: append "(today)" or "(passed: verify sold or held)" to line 3.
  - Not a safety issue: the nightly holdings review issues TIME EXIT separately, and this view is explanation only.
- **n2: wording.**
  - The unsupported reply prints the raw lane code ("Recorded lane: leader."), and "leader" reads like LEADER DIP. The bot calls this lane "trend trade" (`scan.mjs:638`).
  - "BBO" is jargon; "bid/ask" is plainer.
  - The source date is ISO (`2026-10-30`) while the other dates read "30 Oct 2026".

## Hosted CI

Checked by me through the GitHub API (I did not run them): workflow `Tests` on head `25a85000`, push run [41342940853](https://github.com/drrazaq/Stock-2/actions/runs/41342940853) and PR run [41342945481](https://github.com/drrazaq/Stock-2/actions/runs/41342945481), both **success**.

The HISTORY-03 regression harness (`claude/history-03-claims` @ `5bcf4d29`) gives the same result on main and on main + this patch, on Node 20 and 22: 30 tests, 19 pass, 0 fail, 11 todo. The mentor patch does not interact with it.
