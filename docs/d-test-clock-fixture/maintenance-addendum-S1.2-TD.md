# Maintenance add-on S1.2-TD: T then D after a verified STOP R2, in the same attended session

**PREPARATION ONLY. Revision 1, written for Codex's focused review of PR #1 comment 6690539225. Nothing is scheduled, clicked, cancelled or deployed. The cutoffs proposed for T in §3 are proposals until Codex passes them and the owner approves them.**

## 0. What this replaces and what it keeps

- **Base procedure:** STOP R2 procedure S1.2 at `3af43a092de136aa034b32e84e53ab653981a114` (file SHA256 `d0624dd346fec184cb6f9974f90ccfc473d9b731bf861b97f469344c6a3d8e1f`). **It is unchanged.** The owner's STOP approval (PR #1 comment 6652184563) is unchanged and is not widened.
- **Replaces, for Saturday:** add-on S1.2-D at `357a3e32` (file SHA256 `df1d5b5d46915ebb7627438d9891473638c9588b623cb5ab7aecfe2966d2a34d`). That file is left byte-unchanged as the record. It is **not** reused with T inserted. On Saturday, D can be attempted **only** under this add-on.
- **Owner rule (6 Nov):** D is not deployed with a known clock-dependent test failure. So:
  - **no T, no D**;
  - if this add-on, the clean serial composed verification and the owner's supplemental approval are not all complete before readiness (09:15 Kuwait Saturday), the session is **STOP-only** under S1.2, exactly as already approved.
- **Patch bytes:** all are preserved exactly.

| Unit | Patch SHA256 | Inverse SHA256 | Paths |
|---|---|---|---|
| STOP R2 | `c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b` | `1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9` | the 10 S1.2 paths |
| **T** (Codex PASS on `a1d13aab`, 6690539225) | `fefe0ecfd862729b276db82433ae58ea351901e41939dc80f61eeb5b381dd969` | `3a2d2ffdcd8913fc17e01b85adce7cd15665ebe9d3060c49c08db02c31eb95a9` | exactly `test/actions-reconciliation.test.mjs` |
| D1–D4 (Codex PASS on `35b52c2e`) | `6889504c6ef67130193b9be0a070a76347bbaec24f83c9b116736c74e2d45bba` | `7a9e1250e38176323e8ee88989fefc75a7e017bf2e00dccabc9305ddce39dc7f` | `scan.mjs`, `test/leader-dip.test.mjs`, `test/leader-dip-entry-window.test.mjs`, `test/actions-wording-d1-d4.test.mjs` |

T and D share no path. T changes no production source.

**The three result classes from S1.2-D r2 are kept:**
- **(A)** STOP is not VERIFIED V1: the applicable original S1.2 path, from the actual state. Neither T nor D is attempted.
- **(B)** A T- or D-specific check fails: that unit, and everything after it, is SKIPPED (with the reason).
- **(C)** A restoration prerequisite is unresolved: **UNVERIFIED: <item>**. No Enable request and no "restored" claim.

## 1. Order and entry conditions

**Fixed order: STOP → T → D.** Each step starts only after the previous one is VERIFIED. Nothing is pushed in parallel, and nothing is pushed out of order.

### 1.1 T entry (after STOP)

1. **(A) STOP is VERIFIED V1** (S1.2 §§7–8):
   - exact release commit;
   - validated complete hosted-log receipt;
   - no STOP rollback started.

   Anything else means the original S1.2 path from the actual state. **No T, no D.**
2. **(C) The bot is still disabled, with no open request:**
   - REQ-D-1 is SETTLED COMPLETED;
   - a fresh API read shows `bot.yml = disabled_manually` and `main.yml = active`;
   - no REQ-E has been issued;
   - no click request is open, withdrawn-unconfirmed or UNKNOWN.

   Otherwise **UNVERIFIED: <item>**, and no T.
3. **Writer check:** S1.2 §4 scope, fresh. P is terminal-cancelled or absent, and no new bot run exists.
   - **(B)** If a production consumer is running, T is SKIPPED, and D with it.
4. **(B) Codex is attended and can assess this receipt now** (§2.4). Otherwise T is SKIPPED, and D with it.
5. **(B) Time:** the T push can still happen by the T push cutoff (§3). Otherwise T is SKIPPED, and D with it.
6. **(B) Fresh compatibility for T (§2.2)** passes. Otherwise T is SKIPPED, and D with it.

### 1.2 D entry (after T)

1. **(B) T is APPLIED VERIFIED** (§3), with no T rollback started. If T is SKIPPED, ROLLED BACK or anything else, D is SKIPPED.
2. **(C)** Conditions 1.1-2 and 1.1-3 hold again, freshly.
3. **(B)** Codex is attended for the D receipt.
4. **(B)** The D cutoffs can still be met: entry by E+40 and push by E+50.
5. **(B)** Fresh compatibility for D (§2.3) passes.

## 2. Compatibility, predicted trees and reviewer availability

### 2.1 Readiness (from 09:15 Kuwait, before E)

Let **M0** be the main commit at readiness. Its non-data tree must be identical to the base used below.

- **Predicted trees, built with `git apply --index` only:**
  - **M0 + STOP + T** (138 registered test files);
  - **M0 + STOP + T + D** (140 registered test files).
- **Full suite on both trees, run serially, one file at a time:**
  - every registered file must PASS exactly once;
  - no failure allowance;
  - an interrupted, resource-starved (EAGAIN or process-start) or partial run counts as **not run**, never as a pass.
- **Also on M0 + STOP + T + D:**
  - the gated watcher scenarios with `INCIDENT_WATCHER_SRC` set;
  - the 13-case `test/actions-reconciliation.test.mjs` at the shifted clocks used in the T review. These must include a weekday after the 09:30 New York open. This is the failure T exists to fix.
- **If either full suite does not finish all-PASS before E:** T and D are SKIPPED, and the session is STOP-only.

### 2.2 T on the actual post-STOP parent M′

- **Before-hash on M′:** `test/actions-reconciliation.test.mjs` = `a63bb5793651a5b0cd4862233b90a6c6da07c29f55557a740eaf9a3891dcbe41`. STOP does not touch this file.
- **After-hash:** `d3484ba2d2fc427a6bbaf0622aac569956dd4353180a94fb35b380abed8addb4`. Every other byte equals M′.
- **Non-data identity:** `git diff --quiet <predicted base>+STOP M′ -- . ':!data'`, with both non-data tree hashes recorded.
  - If identical, the readiness results stand. Also rerun the T file (13/13) on M′ + T as a fast check.
  - Any non-data difference requires the full suite on M′ + T. If it cannot finish before the T push cutoff, T is SKIPPED.
- **Inverse:** `3a2d2ffd…` must apply to M′ + T and restore M′ exactly.
- **No forced, fuzzy or three-way apply.**

### 2.3 D on the actual post-T parent M″

- **Before-hashes on M″:**
  - `scan.mjs` = STOP after-hash `6aa77716cb2a8b614faf3845ecb5d96bf07bad81a5cc6acceca817ae9974fc5c`;
  - `test/leader-dip.test.mjs` = `609dee1523c3ddaf3ba089b1eb278cdcb6fbdaa41027cf663de1daf567518e2f`;
  - the two new D test files absent;
  - `market-session.mjs` unchanged;
  - `test/actions-reconciliation.test.mjs` = T after-hash `d3484ba2…`.
- **After-hashes:** as S1.2-D §2:
  - `scan.mjs` `73ad4853340ee5f562618155df92371ab1ff87e62584bf507157d9c84cd276c3`;
  - `test/leader-dip.test.mjs` `850b0f91…`;
  - `test/leader-dip-entry-window.test.mjs` `348144d4…`;
  - `test/actions-wording-d1-d4.test.mjs` `db6dfeff…`.

  Every other byte equals M″.
- **Non-data identity:** M″ against the predicted base + STOP + T, as in §2.2.
  - If identical, the readiness results stand. Also rerun D1–D4 (23/23) and `test/leader-dip.test.mjs` (14/14) on M″ + D.
  - Otherwise the full suite must run on M″ + D. If it cannot finish by E+50, D is SKIPPED.
- **Inverse:** `7a9e1250…` must apply to M″ + D and restore M″ exactly, which leaves T in place.

### 2.4 Reviewer availability (no unattended promise)

- **At readiness:** Codex confirms on PR #1 that it will be attended for up to **five** complete-log receipts during the attended session:
  - STOP, T and D;
  - at most one T or D rollback;
  - at most one STOP rollback under S1.2.
- **The availability claim covers the attended session only.** Nobody promises unattended availability.
- **At each unit's entry, Claude reconfirms that Codex is attended now.** If Codex is not reachable at an entry, that unit and everything after it is SKIPPED (B). The state that has been reached is kept and verified as such.

## 3. Timeline: existing cutoffs unchanged, T bounded inside them

**Unchanged cutoffs:**
- **From S1.2:** STOP push ≤ E+20; STOP verdict ≤ STOP push + 10.
- **From S1.2-D:** D entry ≤ E+40; D push ≤ E+50; D verdict ≤ D push + 12.

**T's cutoffs are new and are PROPOSALS for review (Codex's conservative proposal, adopted unchanged):**

| Phase | Cutoff | Rule |
|---|---|---|
| STOP | S1.2 unchanged | STOP push ≤ E+20, verdict ≤ push+10, giving **V1**. **Not V1 → (A)**. |
| T entry | after STOP V1 | §1.1. A visible turn-ending status `STOP V1 VERIFIED – T PHASE`, with the T entry decision and the next wake. `CLICK ENABLE NOW` is **not** sent here. |
| **T push** | **≤ E+28 (proposal)** | Fresh writer check and states. Post `PUSHING T=<sha> ONTO M′=<parent>` on PR #1 before the push. One normal, non-force commit changing only `test/actions-reconciliation.test.mjs`. **No T push after E+28.** |
| **T verdict** | **≤ E+38 (proposal; at most 10 minutes after the latest push)** | Codex's complete hosted-log receipt for exact T: the actual checkout equals T, and all 138 registered files PASS exactly once, with nothing missing, duplicated or truncated. Claude validates it, giving **T APPLIED VERIFIED**. A failure, a missing result or late evidence means a **T rollback** (§4) and **D SKIPPED**. A badge, a summary or a local run never substitutes. |
| D entry | ≤ E+40 (unchanged) | §1.2. |
| D push | ≤ E+50 (unchanged, hard) | As S1.2-D. `PUSHING D=<sha> ONTO M″=<parent>` is posted first. |
| D verdict | ≤ D push + 12 (unchanged) | The complete hosted-log receipt (140 files) gives **D APPLIED VERIFIED**. Otherwise a **D rollback** (§4). |
| Enable target | E+70 (conditional, not guaranteed) | Only after a terminal T outcome and a terminal D outcome, plus every S1.2 §9 prerequisite. |

**Consequences, stated plainly:**
- **No deadline is extended.** A late STOP verdict or a late T result is never compensated by moving a later cutoff.
- **A STOP that verifies at the latest S1.2 time (up to E+30) leaves no T opportunity,** because the T push cutoff is E+28. T and D are then SKIPPED, and the session ends as STOP V1. This is accepted.
- **For reference only:** the T source-branch hosted run 42238454176 took about 2 minutes. This does not relax any gate.
- **E+70 and the restart estimate are targets.** A T rollback, a D rollback or a writer block moves them. That makes them **UNVERIFIED until met**; they are never assumed.

## 4. T states, abort and rollback

### 4.1 T write states

| T push result | Meaning |
|---|---|
| **APPLIED** | The push is accepted, and main's head is the T commit with exact after-hashes. CI has not been judged yet. |
| **NOT APPLIED** | The push was definitively rejected. Nothing changed. **No retry on Saturday.** T is SKIPPED and D is SKIPPED. Restoration as S1.2 §9 with STOP V1. |
| **UNKNOWN** | The outcome cannot be established. **This blocks:** retries, D, takeover, any VERIFIED claim and any Enable request. The bot stays disabled, and the state is `UNVERIFIED: T write UNKNOWN` until it is resolved by a fresh read of main. |

### 4.2 T rollback

**When:** T CI fails; or the receipt is missing, partial or late (after E+38); or the checkout or inventory does not match.

1. Fresh writer check.
2. **D is not attempted** (SKIPPED).
3. Apply only inverse `3a2d2ffd…`, to a fresh parent whose `test/actions-reconciliation.test.mjs` has the T after-hash `d3484ba2…`. Preserve STOP and every intervening data commit. Never use STOP's inverse in this phase.
4. One normal, non-force push, announced first as `PUSHING T-ROLLBACK=<sha> ONTO <parent>`.
5. Its own push-triggered CI and a complete hosted-log all-PASS receipt (138 files on STOP-only content) give **T ROLLED BACK VERIFIED**. A badge or a local run is never accepted.
6. **If the rollback push is UNKNOWN, its CI fails, or a writer blocks it:** `UNVERIFIED: <item>`. The bot stays disabled, restoration is conditional, and there is no workaround.

### 4.3 D rollback (unchanged from S1.2-D, with T explicit)

**When:** D CI fails, or the receipt is missing, partial or late.

- Apply only inverse `7a9e1250…`, to a fresh parent with D's four after-hashes.
- **T stays in place.** It is not rolled back with D.
- Its own complete hosted-log receipt (138 files on STOP + T content) gives **D ROLLED BACK VERIFIED**. The result is STOP + T.
- **UNKNOWN, CI failure or a blocked rollback:** `UNVERIFIED: <item>`.

### 4.4 Other cases (as S1.2 / S1.2-D)

- **A lost operator, an interruption, or a production consumer appearing after a push:** handled exactly as S1.2-D §4. Nothing is settled by time or silence.

## 5. Verified states and outcomes

| Code state | How it is reached | Allowed to stay? |
|---|---|---|
| **STOP V1, T SKIPPED, D SKIPPED** | T not entered (for example the time, Codex, writer or compatibility condition) | Yes: the STOP-only result. |
| **STOP V1 + T VERIFIED, D SKIPPED** | T verified; D not entered or NOT APPLIED | Yes, **only as this explicitly verified state.** T is test-only, and on the STOP-only tree it passes at all clocks (readiness evidence on M0 + STOP + T). |
| **STOP V1 + T VERIFIED + D VERIFIED** | Both receipts validated | Yes. |
| **STOP V1, T ROLLED BACK VERIFIED, D SKIPPED** | T's CI or receipt failed; inverse verified | Yes (equivalent to STOP-only code). |
| **STOP V1 + T VERIFIED, D ROLLED BACK VERIFIED** | D's CI or receipt failed; D inverse verified, T kept | Yes (equal to STOP + T). |
| **UNVERIFIED: <item>** | Any UNKNOWN write, an unverified rollback, an open click, or a failing writer check | No Enable request until resolved. |

**Enable** (`VERIFIED STOP V1 + T <outcome> + D <outcome> – CLICK ENABLE NOW (REQ-E-1)`) is requested only when:
- the exact code state is one of the five verified rows above;
- REQ-D-1 is SETTLED COMPLETED, and no other request is open;
- there is no UNKNOWN write;
- the writer check passes.

**Final outcomes** add `restored` only after S1.2 §9:
- REQ-E-1 SETTLED COMPLETED;
- an independent API read showing `bot.yml = active` and `main.yml = active`.

STOP's, T's and D's results are reported separately.

**Click rules kept unchanged:**
- numbered-click settlement by definitive evidence;
- visible instructions;
- acknowledgment-independent API readbacks;
- late-click reconciliation;
- Claude as sole release and rollback operator.

## 6. Saturday's window after Friday's approved bot restart (projection; re-derived at readiness)

**The actual chain:**
- On 6 Nov the owner-approved bot run **42258713266** started its loop at **17:07:50 UTC**. Its E is therefore ≈ **22:38 UTC Friday (01:38 Kuwait Saturday)**.
- If the next run follows at once, its loop starts at about 22:38–22:40 UTC. Its natural end, and Saturday's first possible **E**, is ≈ **04:08–04:10 UTC (07:08–07:10 Kuwait)**. That is before readiness at 09:15 Kuwait.
- The run after that would end at ≈ **09:38–09:45 UTC (12:38–12:45 Kuwait)**. That is **after** the approved E band (10:00–11:30 Kuwait).
- **So on the current chain, no E falls inside the approved band.** A gap in successor creation, like the missing successor on 6 Nov, would move every later E by the gap. The band is met only if the successor's start is delayed by roughly 2 hours 50 minutes to 4 hours 20 minutes in total.

**This add-on does not move the band.**
- At readiness, Claude derives E from the actual J.
- **If E is outside 10:00–11:30 Kuwait, there is no maintenance under the existing approval.** The owner may separately approve a different band, or choose another date.
- Nothing about this is assumed.

## 7. Authorization (separate owner approval required before readiness)

**Required before Saturday readiness (09:15 Kuwait):**
1. Codex's focused PASS on this add-on, including the T cutoffs proposed in §3.
2. The clean serial composed verification (§2.1, current main), all-PASS with no allowance, published.
3. The owner's supplemental approval, given after items 1 and 2.
4. Codex's attended-availability confirmation at readiness (§2.4).

**The supplemental approval covers only:**
- T's exact file, patch and inverse;
- the STOP → T → D order and the T cutoffs;
- deferring REQ-E-1 until terminal T and D outcomes;
- the T and D pushes and their code-only rollbacks;
- the longer conditional disabled period.

**It adds no workflow control, cancellation scope, dispatch or operator authority.**

**If any of items 1–4 is missing, the session is STOP-only under S1.2.**
