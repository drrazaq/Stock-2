# Maintenance add-on S1.2-D: D1–D4 after a verified STOP R2, in the same attended session

**PREPARATION ONLY. Codex focused confirmation pending (revision 2). Nothing is scheduled, clicked, cancelled or deployed.**

**Revision 2** applies Codex's finding on `077d457b` to §§1, 3 and 4. The add-on now separates three cases instead of folding them into "D SKIPPED … restored":

| Case | Result |
|---|---|
| **(A)** STOP is not VERIFIED V1 | The applicable original S1.2 path, preserving the actual state. D is never attempted. |
| **(B)** STOP is VERIFIED V1 but a D-specific check fails | **D SKIPPED (<reason>)**. |
| **(C)** Any restoration prerequisite is unresolved | **UNVERIFIED: <item>**. No Enable request and no "restored" claim until every S1.2 safeguard passes. |
- **Base procedure:** STOP R2 procedure S1.2, `3af43a092de136aa034b32e84e53ab653981a114` (file SHA256 `d0624dd3…`, Codex PASS 6651816688). It is **unchanged**. The owner's STOP approval for Saturday 7 November is **unchanged** and is not widened by this text.
- **What the add-on is:** an optional second phase, used only if the owner separately approves it before readiness (09:15 Kuwait Saturday).
- **If it isn't approved:** the session is STOP-only, exactly as already approved.

**Released unit (Codex PASS on `35b52c2e`):**
- patch `6889504c6ef67130193b9be0a070a76347bbaec24f83c9b116736c74e2d45bba`;
- inverse `7a9e1250e38176323e8ee88989fefc75a7e017bf2e00dccabc9305ddce39dc7f`;
- exactly `scan.mjs`, `test/leader-dip.test.mjs`, `test/leader-dip-entry-window.test.mjs` and `test/actions-wording-d1-d4.test.mjs`.

## 1. Entry condition and classification

The add-on applies only after STOP's own S1.2 phase. Each condition is classified as **(A)**, **(B)** or **(C)** (see the table above).

1. **(A) STOP is applied and verified.** STOP R2 ended **VERIFIED V1**:
   - its exact release commit is applied;
   - its complete hosted-log receipt is validated;
   - no STOP rollback has started.

   **Anything else** (STOP V0, V2, ABORT A or B, UNVERIFIED, or a STOP push still UNKNOWN) means the add-on does not apply. **The applicable original S1.2 path continues unchanged from the actual state:**
   - S1.2 §7 ABORT A, ABORT B or the UNKNOWN rules;
   - S1.2 §9 restoration and outcomes.

   D is never attempted, and nothing in this add-on changes or relabels that path.
2. **(C) The bot is still disabled, with no open request.** REQ-D-1 is SETTLED COMPLETED, and a fresh API read shows `bot.yml = disabled_manually` and `main.yml = active`. No REQ-E has been issued. No click request of any kind is open, withdrawn-unconfirmed or UNKNOWN.
   - **If this does not hold:** D is not attempted, and the state is **UNVERIFIED: <exact item>**.
   - **Settlement:** the request is settled and the state reconciled exactly per S1.2 §3. Only after every S1.2 restoration safeguard passes may the S1.2 Enable path continue, and the outcome is then `VERIFIED STOP V1 + D SKIPPED (restoration prerequisite: <item>), restored`.
3. **Writer check:** S1.2 §4 scope (bot `reply`, `main.yml`, `ignition.yml`, `opportunity-radar.yml`, plus the production-effect catch-all), fresh at entry. The pending run P from STOP's phase is terminal-cancelled or absent, and no new bot run exists.
   - **(B) D-specific:** a production consumer running means D is skipped. Nothing is waited for past the E+50 cutoff.
   - **(C) Restoration:** the same writer check must still pass before any Enable request (S1.2 §9). While it doesn't, the state is UNVERIFIED and no Enable is sent.
4. **(B) Codex is active and available** as read-only verifier for a second complete-log receipt. If not, D is SKIPPED.
5. **(B) Time:** the D push can still happen by **E+50** (§3). If not, D is SKIPPED.
6. **(B) Fresh compatibility (§2) passes.** If not, D is SKIPPED.

**Leader-dip timing:** E falls on a weekend, so no next-open entry is pending. Friday-close signals enter on Monday, and D1 then applies the Monday-open expiry.

## 2. Fresh compatibility for D

Run on the **actual post-STOP immediate parent M′**, never on a predicted tree:

- **Before-hashes on M′:**
  - `scan.mjs` = STOP after-hash `6aa77716cb2a8b614faf3845ecb5d96bf07bad81a5cc6acceca817ae9974fc5c`;
  - `test/leader-dip.test.mjs` = `609dee1523c3ddaf3ba089b1eb278cdcb6fbdaa41027cf663de1daf567518e2f`;
  - the two new test files absent;
  - `market-session.mjs` present and unchanged (`2a90c4ea…`).

  Any mismatch means D is skipped. No forced or three-way apply.
- **Expected after-hashes:**
  - `scan.mjs` `73ad4853340ee5f562618155df92371ab1ff87e62584bf507157d9c84cd276c3`;
  - `test/leader-dip.test.mjs` `850b0f911cbb7785b7ccbfc87223a96c3e2724e0cb2080c7156ea2f5efd2fa58`;
  - `test/leader-dip-entry-window.test.mjs` `348144d45285e525a78b2b42979740c2bbdfd64f04742899afa3e6d333e09c90`;
  - `test/actions-wording-d1-d4.test.mjs` `db6dfeff51b1d50a53e52617115fad7a7823e2d8876d95f56f2632113773b238`;
  - every other byte equal to M′.
- **Tests, all must pass with no allowance.** A full Node 20 suite takes about 20–25 minutes here, so:
  - **during readiness (before E)**, run the full suite on the predicted tree M0 + STOP + D, plus the D1–D4 file and the gated watcher scenarios;
  - **at D entry**, prove M′'s full non-`data/` tree is byte-identical to that predicted tree's base: `git diff --quiet <predicted base> M′ -- . ':!data'` after applying STOP, with both non-data tree hashes recorded. If identical, the readiness results stand for the source; also rerun the D1–D4 file (23/23) and `test/leader-dip.test.mjs` (14/14) on M′ + D as a fast check;
  - if anything outside `data/` changed, the full suite must be rerun on M′ + D. If it can't finish before the E+50 cutoff, **D is skipped**.
- **Inverse:** `7a9e1250…` must apply to M′ + D and restore M′ exactly, so a rollback leaves STOP V1 intact.

## 3. Timeline (extends S1.2; S1.2's own steps up to STOP V1 are unchanged)

| Phase | Mandatory action / deadline |
|---|---|
| Readiness (from 09:15) | Everything S1.2 requires, **plus** the predicted-tree full suite for D (§2) and confirmation that Codex can verify twice. |
| STOP phase | Exactly S1.2. **(A) If STOP is not VERIFIED V1,** the add-on ends here and the applicable original S1.2 path continues from the actual state (ABORT A/B, UNKNOWN or §9 restoration). **Only if STOP is VERIFIED V1,** Claude does **not** send `CLICK ENABLE NOW`; instead a visible turn-ending `STOP V1 VERIFIED – D PHASE` gives the D entry decision (§1) and the next wake time. |
| D entry, by E+40 | All §1 conditions pass. **(B)** If a D-specific condition fails, the result is **D SKIPPED (<reason>)** with no D push. **(C)** If a restoration prerequisite is unresolved, the result is **UNVERIFIED: <item>** with no D push and no Enable request. In either case, restoration then follows S1.2 §9: Enable is requested only when every S1.2 safeguard passes. |
| D push by **E+50** (hard cutoff) | Fresh writer check and states. Post `PUSHING D-ACTIONS=<sha> ONTO M′=<parent>` on PR #1 before the request. One normal, non-force commit changing only the 4 files. **No D push after E+50.** |
| D verdict by D push +12 | Codex's complete hosted-log receipt for exact D (actual checkout = D; every registered file PASS exactly once; nothing missing, duplicate or truncated); Claude validates it, giving **D APPLIED VERIFIED**. A failure, missing result or late evidence means **D rollback**. |
| D rollback (only if needed) | Fresh writer check. Apply only inverse `7a9e1250…` to a fresh parent whose 4 after-hashes match, preserving STOP and every intervening data commit. It gets its own push-triggered CI and complete-log verification, giving **D ROLLED BACK VERIFIED** (scan.mjs back to `6aa77716…`). Target ≤5 minutes plus CI. Never touch STOP's files beyond D's inverse; never apply STOP's inverse in this phase. |
| Enable target **E+70** (conditional) | Only after a terminal D outcome (APPLIED VERIFIED, SKIPPED or ROLLED BACK VERIFIED) **and** every S1.2 §9 restoration prerequisite passing: no UNKNOWN write, writer check passing, REQ-D-1 settled, no other open request, exact verified code. Otherwise **UNVERIFIED: <item>**, with no Enable request until resolved. The single visible `VERIFIED STOP V1 + D <outcome> – CLICK ENABLE NOW (REQ-E-1)`. Settled per S1.2 §3: numbered confirmation plus an independent API read. |
| Expected first natural bot restart, about E+100 | Conditional, **not guaranteed**. |

## 4. Skip and abort paths

| Situation | Class | Path |
|---|---|---|
| STOP ended anything other than VERIFIED V1 (V0, V2, ABORT A/B, UNVERIFIED, STOP write UNKNOWN) | **(A)** | The add-on does not apply. **The applicable original S1.2 path continues unchanged from the actual state** (S1.2 §§7 and 9). No D push, no D outcome claimed, no relabelling. |
| STOP VERIFIED V1, but a D-specific check fails: Codex unavailable, §2 compatibility or tests fail, E+50 cutoff can't be met, or a production consumer is running before the push | **(B)** | **D SKIPPED (<reason>)**, no D push. Restoration then follows S1.2 §9. Only when every safeguard passes: `VERIFIED STOP V1 + D SKIPPED (<reason>), restored`. Until then: `UNVERIFIED: <item>`. |
| D push rejected definitively (NOT APPLIED) | **(B)** | No retry on Saturday; D SKIPPED; restoration as above. |
| A restoration prerequisite is unresolved at any point: an open, withdrawn-unconfirmed or UNKNOWN click request; the bot not reading disabled when expected; the writer check not passing; any UNKNOWN write; unverified code state | **(C)** | **UNVERIFIED: <exact item>**. No Enable request and no "restored" claim. Keep reconciling per S1.2 §§3, 4 and 7; never settled by time or silence. |
| D push outcome **UNKNOWN** | **(C)** | S1.2 rule: no retry, no takeover, no Enable request. The bot stays disabled; `UNVERIFIED: D write UNKNOWN`. |
| D CI fails, or the receipt is missing, partial or late | (D abort) | **D rollback** (code only, D's inverse `7a9e1250…`), preserving STOP V1 and all intervening data, with its own complete-log verification. Then restoration per S1.2 §9. Only when every safeguard passes: `VERIFIED STOP V1 + D ROLLED BACK, restored`. |
| D rollback push UNKNOWN, rollback CI fails, or a writer blocks the rollback | **(C)** | The bot stays disabled; `UNVERIFIED: <exact item>`; no workaround, and STOP's inverse is never used in this phase. |
| Interruption or lost operator | **(C)** | S1.2 rules: the 20-minute silence / 10-minute ping; no automatic handover; state is UNKNOWN or UNVERIFIED until checked. |
| A production consumer run appears **after** the D push | **(C)** until drained | Let it drain naturally and report it; do not roll back underneath it. No Enable until the writer check passes. |

## 5. Verified restoration and outcomes

Restoration requires all of these, exactly as S1.2 §9:
- REQ-E-1 SETTLED COMPLETED;
- an independent API read showing `bot.yml = active` and `main.yml = active`;
- no outstanding request;
- no UNKNOWN write;
- exact verified code.

**Possible final outcomes:**
- `VERIFIED STOP V1 + D APPLIED, restored` (only after every S1.2 §9 safeguard passes)
- `VERIFIED STOP V1 + D SKIPPED (<reason>), restored` (only after every S1.2 §9 safeguard passes)
- `VERIFIED STOP V1 + D ROLLED BACK, restored` (only after every S1.2 §9 safeguard passes)
- (A) the applicable original S1.2 outcome, from the actual state, when STOP did not reach V1 (D never attempted)
- `UNVERIFIED: <exact item>`

STOP's and D's results are reported separately. No outage limit is guaranteed and there is no unconditional Enable.

## 6. Projected Saturday attendance (owner availability from 09:15 Kuwait)

These are projections from the actual bot chain. E is recomputed at readiness, and the approved E band (10:00–11:30 Kuwait) is unchanged.

| Kuwait (projected; E ≈ 10:22) | Step |
|---|---|
| 09:15 | Owner present; readiness checks; predicted-tree D suite starts |
| ≈ 10:22 (E) | Bot job ends naturally; STOP push by E+20 (≈ 10:42) |
| ≈ 10:52 | STOP V1 verified; D phase entry by E+40 (≈ 11:02) |
| by ≈ 11:12 (E+50) | D push cutoff |
| ≈ 11:24 | D verdict (or rollback) |
| target ≈ 11:32 (E+70) | `CLICK ENABLE NOW (REQ-E-1)` |
| ≈ 12:02 (E+100) | Expected natural bot restart. **Conditional.** |

**Attend from 09:15 until restoration is verified, planning to about 12:05 Kuwait**, and longer if any gate holds. If E shifts within the approved band, every time above moves with it. With E at its latest (11:30), the end is around 13:15 Kuwait.

**Outside the scanner, watcher and radar bounds?** Saturday has no scanner, watcher or radar crons. Late-firing Friday runs are blockers under the writer check, and the movers (04:00 UTC) and discover (05:30 UTC) data jobs are not blockers.

## 7. Authorization structure

- **The existing STOP approval stays exactly as given.**
- **The add-on additionally needs, before Saturday readiness:**
  1. Codex's focused PASS on this add-on;
  2. the owner's separate supplemental approval paragraph, given after that PASS;
  3. Codex availability for the second receipt.
- **The supplemental approval covers only:**
  - deferring REQ-E-1 until D's terminal outcome;
  - the D push, D's code-only rollback, and its verification;
  - the longer conditional disabled period.
- **Missing any of the three means STOP-only.**
