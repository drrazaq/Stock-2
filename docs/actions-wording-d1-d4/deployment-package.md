# D1–D4 deployment approval package: separate from STOP R2; not approved, not scheduled

- **Reviewed package:** `claude/actions-wording-d1-d4` @ `35b52c2e07c375ec5cef5d558efd10de18932396`. Codex PASS: owner-reported 5 Nov.
- **Status:** prepared on 5 Nov. Nothing is deployed, scheduled, clicked or cancelled.
- **Saturday's approved STOP R2 session is not altered or expanded by this document.**

## 1. Exact release unit

| Item | Value |
|---|---|
| Production patch | `6889504c6ef67130193b9be0a070a76347bbaec24f83c9b116736c74e2d45bba` |
| Inverse (rollback) | `7a9e1250e38176323e8ee88989fefc75a7e017bf2e00dccabc9305ddce39dc7f` |
| Files (exactly 4) | `scan.mjs`, `test/leader-dip.test.mjs`, `test/leader-dip-entry-window.test.mjs` (new), `test/actions-wording-d1-d4.test.mjs` (new) |
| Runtime reads (not changed) | `market-session.mjs` (reviewed NYSE calendar, SHA256 `2a90c4ea…`, already on main) |
| Base the patch was built on | `2c993500752fa13902dcdca46819bc7884eded52` (pre-STOP) |
| `scan.mjs` after STOP R2 + D | `73ad4853340ee5f562618155df92371ab1ff87e62584bf507157d9c84cd276c3` (same in either order) |

**Unchanged:** strategy rules, evidence and ZAD gates, workflows, data, offsets, financial records. A halal mark alone never creates a buy.

## 2. Sequencing (mandatory)

1. **STOP R2 first.** D may start only after STOP R2 reaches a terminal result: `VERIFIED V1, restored`, `VERIFIED V2`, `VERIFIED V0`, or `NO ATTEMPT`. **Never during an UNKNOWN or unresolved STOP state.**
2. **Why the order matters:** the STOP procedure pins `scan.mjs` before-hash `19a5368b…`. Deploying D first would block Saturday's release.
3. **Patch base:** D's patch applies unchanged on top of STOP V1, and on main without STOP if STOP ends V0 or V2.
   - **Verified today** on current main `32af6f3d`: none of the 13 files touched by either package has changed since base. STOP then D applies, and D's inverse applies.
   - Before the push, the expected after-hash is recomputed for whichever STOP outcome actually happened.

## 3. Fresh checks before the D push (repeat immediately before)

- **Main:** fetch the fresh immediate parent M. The 4 D before-hashes must match:
  - `scan.mjs` = post-STOP hash, or `19a5368b…` if STOP did not apply;
  - `test/leader-dip.test.mjs` = `609dee15…`;
  - the two new test files absent.

  Any change stops the procedure for reconciliation. No three-way or forced application.
- **Tests on M plus the exact patch** (Node 20, `node "$f"` for every registered test):
  - **all must pass**, with no failure allowance;
  - the D1–D4 file must pass 23/23;
  - with STOP R2 V1 present, the gated watcher scenarios must pass 9/9 and 11/11.
- **Inverse:** must apply to M plus D, and restore M exactly.
- **Writer check (the four production consumers, same rule as STOP S1.2 §4):**
  - no active, queued or waiting runs of bot `reply`, `main.yml` scanner, `ignition.yml` watcher or `opportunity-radar.yml`, other than the designated drained bot state;
  - D's own CI, the accounting preflight, and the discover/movers data jobs are not blockers; their data commits are preserved;
  - the bot must be **disabled by a settled numbered request**, with zero queued successor;
  - no UNKNOWN write outstanding from STOP or D.
- **Leader-dip window check:** on weekends there is no pending next-open entry; Friday-close signals are entered Monday. D1 then enforces the Monday-open expiry, which is the intended behaviour.

## 4. Release, verification and rollback

- **D push:**
  - one normal, non-force commit, a direct child of M, changing only the 4 files;
  - pre-announced on PR #1 as `PUSHING D-ACTIONS=<sha> ONTO M=<parent>`;
  - outcomes: APPLIED needs positive evidence; NOT APPLIED needs a definitive rejection; anything else is **UNKNOWN**, which means no retry, no Enable and the bot stays disabled.
- **Complete hosted-log gate:**
  - D's own push-triggered CI: actual checkout = D, every registered file PASS exactly once, no missing, duplicate or truncated results;
  - **Codex** (activated, read-only) retrieves the full log and posts a receipt; **Claude** validates it;
  - missing or late evidence counts as UNVERIFIED and leads to rollback;
  - target ≤10 minutes, conditional.
- **Rollback:**
  - only inverse `7a9e1250…`, applied to a fresh parent whose 4 after-hashes match, preserving every intervening data commit;
  - if D is rolled back, STOP's result is left in place;
  - the rollback gets its own complete hosted-log verification;
  - writer checks before every mutation.
- **Outcomes for D:**
  - `VERIFIED D1-APPLIED`;
  - `VERIFIED D-ROLLED-BACK`;
  - `D NOT ATTEMPTED`;
  - `UNVERIFIED: <item>`.

  These are reported separately from STOP's outcome.

## 5. Option A (recommended default): a separate attended D session after Saturday

The same S1.2 safeguards apply:
- an E derived from the actual bot job;
- bot-only numbered Disable and Enable;
- at most one approved never-started pending bot run cancelled;
- the five-condition save proof;
- the writer check above.

The window is chosen later, with no date proposed now. Saturday's approval is not involved. This needs its own owner approval (wording in §7A) and Codex's procedure confirmation, because S1.2 is pinned to the stop files.

## 6. Option B: extend Saturday's attended window (feasible; needs new authorization)

**Feasibility:**
- **Fits the calendar:** it is a weekend, so the scanner, watcher and radar have no crons, and Saturday's bounds have room.
- **Extra time:** D would run while the bot is still disabled after STOP is VERIFIED V1, adding about **15–25 minutes**:
  - fresh checks and tests on M plus D, about 5–10 minutes (the full suite is the long pole; it can run in parallel while STOP's CI runs, but it must be rerun on the actual post-STOP parent);
  - the push;
  - D's hosted CI and Codex receipt, about 10 minutes.
- **Revised timeline:** Enable moves from about 11:07 to roughly 11:30–11:45 Kuwait, and the expected bot restart to about 12:00–12:15. **Not guaranteed.**
- **Gating:**
  - only after **STOP VERIFIED V1**, and only if no UNKNOWN or open request exists;
  - if STOP ends V0, V2 or UNVERIFIED, D is **not** attempted on Saturday;
  - if D's gates fail, D is not pushed or is rolled back, and the bot is restored with STOP's verified result.

**Why it needs new authorization:** Saturday's approval explicitly limits:
- the release to the ten STOP files and patch `c1de39fd…`;
- rollback to `1a13a44d…`;
- the Enable request to STOP's verified outcome.

A second code release, a longer disabled period and a second rollback scope are outside it. Extending requires all of the following, **given before Saturday's readiness at 09:15 Kuwait**:

1. **Codex confirmation of a short S1.2-D addendum.** It covers:
   - the second release slot after STOP V1;
   - an Enable request only after D's own verified outcome;
   - D's rollback scope;
   - outcome reporting kept separate.
2. **A separate owner approval of the D code release** (§7B), naming patch `6889504c…` and inverse `7a9e1250…`.
3. **Owner acceptance** of the longer conditional outage (bot disabled until about 11:45; restart about 12:15, not guaranteed) and attendance until D's result is verified.
4. **Codex verifier availability** for a second complete-log receipt.

Without all four, Saturday stays exactly as approved (STOP only) and D uses Option A.

## 7. Approval wording (for the owner; neither is granted)

**7A: separate D session (Option A)**
> I approve deployment of ACTIONS wording package D1–D4 (reviewed 35b52c2e, Codex PASS), production patch 6889504c6ef67130193b9be0a070a76347bbaec24f83c9b116736c74e2d45bba on exactly scan.mjs, test/leader-dip.test.mjs, test/leader-dip-entry-window.test.mjs and test/actions-wording-d1-d4.test.mjs; rollback only inverse 7a9e1250e38176323e8ee88989fefc75a7e017bf2e00dccabc9305ddce39dc7f, preserving intervening data. Only after STOP R2 has a terminal verified outcome, in a separately scheduled attended session under the reviewed S1.2-style procedure (Claude sole operator, Codex read-only verifier, my numbered bot.yml clicks only, one separately approved never-started pending run at most), with fresh before-hash, all-pass test, writer, complete hosted-log, UNKNOWN and verified-restoration gates. No dispatch, workflow, data, offset or rule change. This does not amend the STOP R2 approval.

**7B: Saturday extension (Option B; only together with Codex's addendum confirmation)**
> In addition to, and without changing, my STOP R2 approval for Saturday 7 November: if and only if STOP R2 reaches VERIFIED V1 with no UNKNOWN or open request, I approve deploying D1–D4 patch 6889504c6ef67130193b9be0a070a76347bbaec24f83c9b116736c74e2d45bba (rollback only 7a9e1250e38176323e8ee88989fefc75a7e017bf2e00dccabc9305ddce39dc7f) in the same attended session, before the Enable request, under Codex-confirmed addendum S1.2-D, with its own fresh checks, writer check, complete hosted-log verification and rollback. I accept the bot staying disabled until D's result is verified (target about 11:45 Kuwait; restart about 12:15; not guaranteed) and will attend until then. If STOP does not reach V1, or any D gate fails, D is not attempted or is rolled back, and the bot is restored with STOP's verified result.
