# R1 confirmation and Stage 2 operating-proposal review (ee725432; comments 6764950000 and 6764972150)

Review only. No production action.

## R1: CLOSED. Binding f3b01676 is FREEZABLE.

- **Fingerprint:** sha256 of `binding-successor.json` at c059c6eb is f3b01676…, as claimed.
- **What changed:** against e513e26f, only the `inverse` field changed (it now points to `docs/watcher-price-followon-20261110/inverse-successor-to-stage1.json`, 39 entries) and `watcherOnlyInverse` was added (`inverse-watcher-to-stage2.json`, 2 entries).
- **Inverse files:** both are byte-identical to the files I applied as index objects in 331e6abd. They produce tree 83637535 (equal to Stage 1 outside `docs/`, helper v1 kept) and tree 1c43f60a (equal to 590bf434).
- **Bound paths:** all 46 are identical at 93ab136c, c059c6eb and ee725432.
- **Note, no change requested:** the bound text still says `sourcePass … review pending` and `independentVerdict: PENDING`. The PASS is recorded in 331e6abd and here. I am not asking for a re-hash for this.

## Timing arithmetic: confirmed

- **Weekday:** first union trigger 12:45 UTC, minus the 30 min buffer, gives a complete recovery receipt by 12:15.
- **Worst case:** T+160 = complete, so T ≤ 09:35 and P ≤ T+20 = 09:55. Then D = P+55 = 10:50, inverse = D+30 = 11:20, inverse receipt = D+85 = 12:15. A 20 min disposition reserve leaves T+180 inside the 3 h reservation.
- **Adoption:** H = P+24 h and D_A ≤ H−85 min = P+22 h 35 min. The inverse is due by D_A+30 and its receipt by D_A+85 ≤ H.

## Operating proposal: CORRECTIONS REQUIRED (4)

**C1. The census and trigger band must be derived, not pinned to three workflows.**

Scheduled workflows that load a written or bound path, worked out from each workflow's `node` scripts and their import closure:

| Workflow | Schedule (UTC) | Loads |
|---|---|---|
| main | weekdays 13:10–20:40 every 30 min, plus 21:30 | `scan.mjs`, `save-data.sh` |
| ignition | 13:10, 14:10 | watcher |
| calendar | weekdays 20:45, Sunday 05:30 | `calendar.mjs`, `econ-series.mjs` |
| bot | every 30 min | `scan.mjs`, alert merger, watcher guard |
| discover | Tue–Sat 05:30 | `discover.mjs`, which is a **write path** |
| leaders-study | Sunday 06:00 | `calendar.mjs`, `econ-series.mjs` |
| comeback | Tue–Sat 01:35, Sunday 17:45 | `scan.mjs` |
| squad17-lab | Tue–Sat 00:31, Sunday 16:29 | `scan.mjs` |
| squad23-lab | Tue–Sat 00:43 | `scan.mjs` |
| research-lab | weekdays 22:17 | `scan.mjs` |
| premarket | weekdays 12:40 | unchanged dependencies only |
| opportunity-radar | weekdays 20:40 | unchanged dependencies only |

- discover, comeback and the lab workflows use one consistent checkout plus an inline data pull/push, with no bound save helper. They may be **exempted with that stated reason**.
- Otherwise they belong in the census and the band. This matters mostly for an off-hours D_A or inverse (00:20–01:50 or about 05:15 UTC).
- premarket and opportunity-radar load only unchanged dependencies, so they are exempt. That keeps the 12:45 weekday basis; if premarket were included, the basis would be 12:40, giving T ≤ 09:30.
- The protocol should state this rule and these exemptions.

**C2. Define the D_A disposition when B has no scanner witnesses because GitHub never created the runs.**
- Recent delivery: intraday 0–2 runs per day from 3 Nov and **0 on 9 Nov**; nightlies 3.5–6.2 h late.
- The amendment requires at least one completed P-code intraday run and the selected nightly, and says zero witnesses stays UNVERIFIED. But it does not say what happens at D_A in that case.
- Without an explicit rule, UNVERIFIED becomes an indefinite renewal, which contradicts "no automatic renewal".
- Make it explicit, and owner-chosen before approval. **My recommendation:** if no completed P-code intraday run and selected nightly exist by D_A, take the 39-path inverse.

**C3. A census blocked at D must not abandon recovery.**
- A main.yml nightly runs for 45–53 min, and late-created runs have arrived hours late. A blocking run at D can therefore make inverse ≤ D+30 impossible.
- The current wording ("do not write blindly … no blind retry") reads as no inverse at all.
- **Add:** publish the inverse at the first safe census after the blocking run ends, inside the reserve or at the next attended checkpoint. Record it as LATE with the actual fault, discovery, census and publication times. It is still one inverse in total.

**C4. Make the Stage 1 and late-nightly preconditions explicit.**
- Stage 2 T only after Stage 1's own runtime verdict is complete and PASS (its read-only checkpoint, Thursday 21:15–22:00 UTC), with no Stage 1 inverse pending and its recovery window closed.
- "Previous nightly completed" must be checked against its actual run. If the nightly has not been created by T, defer; do not assume it was dropped.
- The B review window must start after the realistic late-nightly completion. A delivery 6 h 11 min late completed at 04:30 UTC on 10 Nov, so the window must start no earlier than about 05:00–05:30 UTC the next day, still before D_A.

Everything else is accepted:
- single operator and verifier, with presence reconfirmed per unit;
- one 39-path inverse to Stage 1 on the current unbound tree, with helper v1 kept;
- the 2-path inverse is evidence only;
- F1+25 receipt rules;
- the qualified scanner label (SOURCE/FUNCTIONALLY VERIFIED FOR OBSERVED RUNS — SCHEDULE COVERAGE UNVERIFIED), which is not READY;
- the restoration (R2) mirror;
- the stated residuals for owner acceptance.
