# Maintenance add-on S1.2-D: D1–D4 after a verified STOP R2, in the same attended session

**PREPARATION ONLY. Codex focused review pending. Nothing is scheduled, clicked, cancelled or deployed.**
- **Base procedure:** STOP R2 procedure S1.2, `3af43a092de136aa034b32e84e53ab653981a114` (file SHA256 `d0624dd3…`, Codex PASS 6651816688). It is **unchanged**. The owner's STOP approval for Saturday 7 November is **unchanged** and is not widened by this text.
- **What the add-on is:** an optional second phase, used only if the owner separately approves it before readiness (09:15 Kuwait Saturday).
- **If it isn't approved:** the session is STOP-only, exactly as already approved.

**Released unit (Codex PASS on `35b52c2e`):**
- patch `6889504c6ef67130193b9be0a070a76347bbaec24f83c9b116736c74e2d45bba`;
- inverse `7a9e1250e38176323e8ee88989fefc75a7e017bf2e00dccabc9305ddce39dc7f`;
- exactly `scan.mjs`, `test/leader-dip.test.mjs`, `test/leader-dip-entry-window.test.mjs` and `test/actions-wording-d1-d4.test.mjs`.

## 1. Entry condition (all required; otherwise **D SKIPPED** and the session continues exactly as S1.2)

1. **STOP is applied and verified.** STOP R2 ended **VERIFIED V1**:
   - its exact release commit is applied;
   - its complete hosted-log receipt is validated;
   - no STOP rollback has started.

   A STOP V0, V2, ABORT or UNVERIFIED result, or any STOP push still UNKNOWN, means **no D**.
2. **The bot is still disabled.** REQ-D-1 is SETTLED COMPLETED, and a fresh API read shows `bot.yml = disabled_manually` and `main.yml = active`. **No REQ-E has been issued**, and no click request of any kind is open, withdrawn-unconfirmed or UNKNOWN.
3. **Writer check passes:** S1.2 §4 scope (bot `reply`, `main.yml`, `ignition.yml`, `opportunity-radar.yml`, plus the production-effect catch-all), fresh at entry. The pending run P from STOP's phase is terminal-cancelled or absent, and no new bot run exists. A new production consumer run is never waited for past the D push cutoff (§3); it means D is skipped.
4. **Codex is active and available** as read-only verifier for a second complete-log receipt. If it isn't, D is skipped.
5. **Time:** the D push can still happen by **E+50** (§3).

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
| STOP phase | Exactly S1.2. **Change:** after STOP VERIFIED V1, Claude does **not** send `CLICK ENABLE NOW`. A visible turn-ending `STOP V1 VERIFIED – D PHASE` gives the D entry decision (§1) and the next wake time. |
| D entry, by E+40 | All §1 conditions and §2 checks pass. Otherwise **D SKIPPED (reason)**, followed by the S1.2 Enable path. |
| D push by **E+50** (hard cutoff) | Fresh writer check and states. Post `PUSHING D-ACTIONS=<sha> ONTO M′=<parent>` on PR #1 before the request. One normal, non-force commit changing only the 4 files. **No D push after E+50.** |
| D verdict by D push +12 | Codex's complete hosted-log receipt for exact D (actual checkout = D; every registered file PASS exactly once; nothing missing, duplicate or truncated); Claude validates it, giving **D APPLIED VERIFIED**. A failure, missing result or late evidence means **D rollback**. |
| D rollback (only if needed) | Fresh writer check. Apply only inverse `7a9e1250…` to a fresh parent whose 4 after-hashes match, preserving STOP and every intervening data commit. It gets its own push-triggered CI and complete-log verification, giving **D ROLLED BACK VERIFIED** (scan.mjs back to `6aa77716…`). Target ≤5 minutes plus CI. Never touch STOP's files beyond D's inverse; never apply STOP's inverse in this phase. |
| Enable target **E+70** (conditional) | Only after a terminal D outcome (APPLIED VERIFIED, SKIPPED or ROLLED BACK VERIFIED), with no UNKNOWN write, writer check passing and REQ-D-1 settled. The single visible `VERIFIED STOP V1 + D <outcome> – CLICK ENABLE NOW (REQ-E-1)`. Settled per S1.2 §3: numbered confirmation plus an independent API read. |
| Expected first natural bot restart, about E+100 | Conditional, **not guaranteed**. |

## 4. Skip and abort paths

| Situation | Path |
|---|---|
| Any §1 entry condition fails, a §2 check fails, or the E+50 cutoff can't be met | **D SKIPPED**: no D push; Enable as S1.2 with STOP V1; outcome `VERIFIED STOP V1 + D SKIPPED (<reason>), restored`. |
| D push rejected definitively (NOT APPLIED) | No retry on Saturday; D SKIPPED. |
| D push outcome **UNKNOWN** | S1.2 rule: no retry, no takeover, no Enable request. The bot stays disabled; report `UNVERIFIED: D write UNKNOWN`. It is never settled by time or silence. |
| D CI fails, or the receipt is missing, partial or late | **D rollback** (code only, D's inverse). STOP V1 is preserved. |
| D rollback push UNKNOWN, CI fails, or a writer blocks it | The bot stays disabled; `UNVERIFIED: <exact item>`; no workaround, and no use of STOP's inverse. |
| Interruption or lost operator | S1.2 rules: the 20-minute silence / 10-minute ping; no automatic handover; state is UNKNOWN until checked. |
| New production consumer run appears during the D phase | Before the push: D SKIPPED. After the push: let it drain naturally and report it; do not roll back underneath it. |

## 5. Verified restoration and outcomes

Restoration requires all of these, exactly as S1.2 §9:
- REQ-E-1 SETTLED COMPLETED;
- an independent API read showing `bot.yml = active` and `main.yml = active`;
- no outstanding request;
- no UNKNOWN write;
- exact verified code.

**Possible final outcomes:**
- `VERIFIED STOP V1 + D APPLIED, restored`
- `VERIFIED STOP V1 + D SKIPPED (<reason>), restored`
- `VERIFIED STOP V1 + D ROLLED BACK, restored`
- any S1.2 outcome when STOP did not reach V1 (D never attempted)
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
