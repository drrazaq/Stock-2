# ACTIONS wording package D1–D4 (revision 2): development only, not deployed

**Revision 2** applies Codex's four findings on `c670d626`. Each counterexample has a regression in `test/actions-wording-d1-d4.test.mjs`, and each of those fails on the r1 code:

| # | Finding | Change |
|---|---|---|
| **R1** | The entry window could close during the ACTIONS caller's asynchronous work (name lookup, prices, calendar) and a BUY could still be output. | The window is rechecked synchronously, after the last `await` and immediately before the message is built. An expired or UNKNOWN entry loses its BUY block **and** its MARK HALAL request, and the lane line states the reason. The cutoff stays inclusive: valid up to 09:30:00.000 New York. Reproduced with a clock that crosses the cutoff during the caller's own loopback name lookup, and during the calendar read. |
| **R2** | Generation timestamps without a zone were parsed in local time, and were not checked against the claimed close. | `generatedAt` must be ISO with `Z` or `±hh:mm`. It must not predate the claimed close (`barClosed`, 16:10 New York, conservative on early-close days). It must not postdate that list's own next open. Each signal's own day must equal the list's close. Anything else is **UNKNOWN**. |
| **R3** | "During the session" used fixed 9:30–16:00. | It now uses the reviewed NYSE calendar `market-session.mjs` (holidays; 1 pm early closes such as 27 Nov 2026), loaded at run time with no network: during the session, before the open, after the close, or market closed that day. If the calendar can't be read, the line says "session status UNKNOWN" and never claims "during the session". |
| **R4** | My r1 D4 edit put an inline `//` comment mid-line in `test/leader-dip.test.mjs`, disabling the two command assertions after it. | Restored (`\nhalal UNK yes   or   halal UNK no`, and no generic `halal SYM`). The third, `/BAD\|ZZL/`, was already commented out on main before this package. It is unchanged here and flagged for Codex. |

**One Codex-origin expectation changed (R2 consequence; please confirm):** in `test/leader-dip.test.mjs`, a fixture list that claims a 9-session-old close but was generated today is now **UNKNOWN** (inconsistent evidence), where it used to be "expired". It is never a BUY either way.

- **Prepared:** 5 Nov 2026 by Claude on branch `claude/actions-wording-d1-d4`, from main `2c993500752fa13902dcdca46819bc7884eded52`.
- **Not done:** no deployment, workflow change, real message or provider call.
- **Separate from** Saturday's approved stop release, which this package does not change. **Separate approval needed.**
- **Source:** the owner's 5 Nov 12:03 Kuwait MORNING ACTIONS, traced read-only. The message text and holdings are not in this repository; all tests use invented tickers.

## What changes (wording and safety only; strategy rules, evidence gates and ZAD gates unchanged)

| # | Defect on main | Change |
|---|---|---|
| **D1** | `ldipFresh` had no opening cutoff. A pick marked halal after the open would still show "BUY … at the open", and a stale list could be shown for up to 5 sessions. | **Ported unchanged from Codex `984a1c2`** (`Stock2-safety-fixes`; Codex owns the semantics): `ldipEntryWindow` is valid until the actual New York next open (09:30, DST-aware). A source session that is behind the scanner, generated in the future or not yet closed is **UNKNOWN**, never a late entry. Expired or UNKNOWN lists give "LEADER DIP: no qualifying trade — …" and record no offer. **One deviation from 984a1c2:** that line is shown once, under APPROVED LANES; it is no longer also copied into NOT ACTIONABLE. |
| **D2** | "MARKET SHOCK TODAY … buy only inside the ranges below" appeared for a reading taken during the previous session, and when no buy ranges existed. | The line names when the move was measured (date, New York time, "during the session, not a close"). It says "TODAY" only on the same New York date. With no permitted BUY it says "no permitted buy today" instead of pointing at missing ranges. The 18-hour window, threshold and HOLD advice are unchanged. |
| **D3** | "QUICK TRADES held back … Why: … (has 41)" printed the first stock's reason for all four, and didn't say which condition failed. | Reasons are grouped by the failing condition, with each stock's count, for example "ZQA, ZQB, ZQC: … safety margin not positive or not computable (41, 49 and 50 unseen trades); ZQD: … fewer than 30 unseen trades (has 19)". Already-saved reasons are read from their count without guessing more. The producer names the failing condition. **The gate is unchanged:** 30+ trades and a positive safety margin. |
| **D4** | Actionable sections didn't state their source close. | The SELL header, the quick-trade line, the leader-dip mark line and the leader-dip BUY block name the close they come from. An invalid scanner session shows "source close UNKNOWN" rather than an invented date. |

**A halal mark never makes a buy by itself.** A marked pick is a lane BUY only while it is in its single entry window, has a free slot, is not NOT-halal, and has no danger or event flag. These are the existing lane rules (LEADER DIP, owner's lane, 27 Oct).

## Files (exactly four)

| File | Before SHA256 | After SHA256 |
|---|---|---|
| `scan.mjs` | `19a5368bff6e14d4d114d9a3c9b52d395ee3b4dad8164a0a8a01762f16f5799f` | `884bfd5baa692014489df21b027e14f452b05064968447cbf36c6bddbe462df6` |
| `test/leader-dip.test.mjs` | `609dee1523c3ddaf3ba089b1eb278cdcb6fbdaa41027cf663de1daf567518e2f` | `850b0f911cbb7785b7ccbfc87223a96c3e2724e0cb2080c7156ea2f5efd2fa58` |
| `test/leader-dip-entry-window.test.mjs` | absent | `348144d45285e525a78b2b42979740c2bbdfd64f04742899afa3e6d333e09c90` (Codex 984a1c2, byte-identical) |
| `test/actions-wording-d1-d4.test.mjs` | absent | `da4ac9088c06f0074e806fd7306f6243cf41194c55d0e75be822f44ab162947a` |

The `test/leader-dip.test.mjs` changes are:
- Codex 984a1c2's clock pin and expired/UNKNOWN expectations;
- Codex 038667ee's frozen-date fixture line;
- the D4 wording in one regex.

**Patch hashes:**
- `production.patch`: `861d6f59607a923f691531a0b5d321849bdfe1a27ee7ab3419949c9a7fb42549`
- `rollback.patch` (exact inverse): `869aa01dbff0129cfacdb3aa64552f3b179bcd47feb2923c49d51f62bf31cad6`
- r1 hashes (`17c325f5…`, `17bae108…`) are superseded.

Applying the patch and then the inverse to main restores main exactly.

## Tests (Node 20, sequential `node "$f"`, external connections blocked; 0 attempted)

| Run | Result |
|---|---|
| `test/actions-wording-d1-d4.test.mjs` (new; real `actionsText` caller) | 19/19. The R1–R3 counterexample tests fail on the r1 code. |
| `test/leader-dip-entry-window.test.mjs` (Codex, unchanged) | 9/9 |
| `test/leader-dip.test.mjs` (updated) | 14/14 |
| Full suite on the branch | 138/138 |
| Full suite with the stop patch also applied | 139/139, gated watcher scenarios 9/9 and 11/11 |

**Covered (r2 additions):**
- **R1:** the clock crosses 09:30:00.001 during the loopback name lookup, so there's no BUY. Exactly 09:30:00.000 keeps the BUY (inclusive). A crossing during the calendar read removes the MARK HALAL request.
- **R2:** generation clocks rejected: no zone; space separator; before the claimed close; after its own next open; a signal day that disagrees; a future time by offset. An explicit `+03:00` is accepted.
- **R3:** early close on 27 Nov (1:30 pm is after the close, 12:30 pm is during); Thanksgiving is closed; a normal day; before the open; missing calendar gives UNKNOWN.

**Covered (r1):**
- **D1:**
  - **Exact cutoff:** 14:29:59.999Z and 14:30:00.000Z give a BUY; 14:30:00.001Z, later the same day and the next morning are expired.
  - **Owner's PSX shape:** an unmarked pick before the open asks for the mark and names its single entry instant. A mark given after the open does not revive it, and the line appears once.
  - **Stale or future sources:** a list behind the scanner, a list generated in the future, or a scanner already on a newer close is UNKNOWN even when marked.
  - **Slot and NOT-halal gates kept.**
- **D2:**
  - a previous-session intraday reading is dated, with no "today" and no ranges;
  - a same-day reading with a BUY keeps the original advice;
  - a big down day with no buys says so;
  - the 18-hour window is unchanged.
- **D3:**
  - the saved 5 Nov reason shape (41, 49, 50, 19) is grouped correctly;
  - new and other reasons are grouped;
  - the gate source is unchanged.
- **D4:**
  - the SELL header shows the close, or UNKNOWN for an invalid session;
  - the leader-dip BUY block shows its signal close.

## Compatibility with Saturday's approved stop release (unchanged: `c1de39fd…`, inverse `1a13a44d…`)

- **Order:** the two patches apply in either order and give byte-identical `scan.mjs`. Each inverse still applies with the other present.
- **Sequencing:** this package must deploy **after** the stop release, never before. The stop procedure pins `scan.mjs` before-hash `19a5368b…`, and deploying D first would stop Saturday's release for reconciliation.
- **Re-base:** after the stop release, rebuild this patch on the new main and re-run the tests (the after-hash of `scan.mjs` changes). The patch content does not change.
- **No combined approval:** each needs its own owner approval and Codex review.

## Remaining before any deployment

1. **Codex review** of this package, pinned to the branch commit and patch hash.
2. **Owner approval** of the exact rebuilt patch after the stop release.
3. **Deployment rules:** a natural boundary, or an approved maintenance procedure, with fresh writer checks; hosted CI all-PASS; a complete-log receipt.
4. **Watch D1 on deployment day:** if a leader-dip signal is pending, deploy outside the window between its source close and the next open, or accept that the new expiry applies immediately.
