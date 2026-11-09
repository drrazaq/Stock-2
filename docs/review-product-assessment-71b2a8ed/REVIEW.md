# Focused review: product assessment demonstration (`9818e5714` / `71b2a8ed0`, Codex 6733946897 / 6734009022)

Review only, offline. No provider call, credential, delivery or production change.

**Verdict:**
- **Caller trace and reproduction: PASS.**
- **Assessment content: CORRECTIONS REQUIRED.** P1 is material: adverse yardstick evidence is missing from the track-record column. P2 and P3 are renderer defects to record.
- **C6 (narrow): PASS**, with one note (C6a).

## 1. Reproduction and caller trace: PASS

- The `demonstrate.mjs` and `representative-outputs.json` hashes match `manifest.json`.
- I re-ran `demonstrate.mjs` unchanged with `REVIEW_TREE` set to a fresh checkout of each of two trees:
  - `89d21db6`;
  - standalone rev3 `0e89cb90`.

  **Every key of `representative-outputs.json` is byte-identical** for both trees. The network record shows 0 external requests and 12 loopback requests. Rev3 changes only the guard, so it does not alter these outputs.
- `caller-trace.json` checks out:
  - the file hashes of `scan.mjs`, `horizons.mjs`, `quality.mjs` and `leaders-study.yml` match `89d21db6`;
  - all 7 `scan.mjs` function locations are exact (`intraday` 4363, `checkLive` 1850, `horizonLine` 218, `qualityLine` 169, `longTermText` 2621, `stockMap` 2945, `natural` 3068);
  - the workflow lines are exact (`horizons.mjs` 132, `quality.mjs` 172).
- Short-horizon cards are correct for their inputs:
  - **ZZH:** HOLD, +20.0% from 10.00.
  - **ZZS:** SELL on the supplied 50-day exit, −37.2% from 6.00 (3.77 / 6 − 1 = −37.17%), timed for the next regular open.
  - **ZZU:** STOP STATUS UNKNOWN. The quote is 30 minutes old against the 5-minute limit, and the message says "not a sign the position is safe". No HOLD is shown.
- The retained PB_UP newer-half figures in the table match `data/horizons.json` exactly:
  - 20d: −0.2723% vs −0.3850%;
  - 60d: +1.9832% vs +0.3201%;
  - 120d: +4.2109% vs +2.8963%.

  ETON is in `today.PB_UP`; CNNE has quality rank 1.0.
- **The legacy long-term line is confirmed false.** Codex's correction is supported: the S&P 500 did **not** beat every stored method. In `data/quality.json`, the Piotroski F-score 8–9 (above the 200-day average) rows beat SPY in the newer half at both 6 months (+8.52% vs +7.24%) and 12 months (+16.52% vs +16.06%). None of the 24 horizon half-rows beat SPY. The development renderer (`3b7af847`/`b9753abb2`) wording, "no method passed the full test", is the accurate one.

## 2. Corrections

**P1 (material): the track-record column omits the S&P yardstick, so its "favorable" framing is one-sided.** The same rows also carry SPY and worst-trade fields, and the frozen `why` text lists the SPY failures:

| PB_UP hold | Half | Setup avg | Average stock | **S&P 500** | Worst trade |
|---|---|---|---|---|---|
| 60 | older | +1.72% | +1.29% | **+5.03%** | −87% |
| 60 | newer | +1.98% | +0.32% | **+2.91%** | −90% |
| 120 | older | +3.54% | +2.61% | **+9.92%** | −86% |
| 120 | newer | +4.21% | +2.90% | **+8.31%** | −82% |

- PB_UP **lost to simply holding the S&P 500 in both halves at 60 and 120 sessions.** Its margin over the average stock also fails the pre-registered +1.5 / +3.0 point thresholds in at least one half.
- So the live `horizonLine` text "tested, no edge" is **accurate for PB_UP** against the system's yardstick. I disagree with the completion report's "old 'no edge' wording can hide favorable comparisons" as a general statement: here it hides nothing that would change the action.
- **CNNE has the same issue.** In the newer half, the top-decile quality rows returned:
  - at 6 months: +2.38%, against +6.14% for the average stock and +8.85% for SPY;
  - at 12 months: +4.10%, against +12.77% and +17.25%.

  A TOP 10% rank therefore carries **adverse** historical evidence, not merely unproven evidence. "Investigable" should be stated with that.
- **Requested:**
  - Any card or summary that shows a setup's favorable comparison must show, beside it:
    - the S&P 500 comparison;
    - the worst trade;
    - whether the pre-registered margin was met.
  - Pick one of two fixes for ETON/CNNE in DEMONSTRATION.md and COMPLETION-REPORT.md:
    - restate them with those fields;
    - or drop "favorable comparisons" and say "lost to the S&P 500 in both halves; NOT PROVEN / REJECTED".

  This is a presentation correction only. No gate, rule or figure changes.

**P2 (renderer defect, record): two unrelated statistics are juxtaposed in `checkLive`.** The same card says "Rule tested for it: … 6 unseen trades, 100% wins" (`scan.mjs` 1865) and then "CONCLUSION: no plan. On its own history the reward marker came before the stop in only 0% of cases, which loses on average" (1855).
- The second figure comes from the untested reference levels (`o.won`), not from the rule. Unlike the REFERENCE LEVELS branch (1856), it **shows no case count**.
- On the synthetic series this reads as a contradiction. For the unified card: label the two measures distinctly, and always show the denominator.

**P3 (renderer defect, minor): `qualityLine` can say "better than 100% of liquid US stocks".** That happens at rank 1.0; CNNE ties with one other stock at 1.0 out of 2,076 ranked. Prefer "top N of 2,076", or cap the label at "better than 99%".

## 3. Release proposal and completion report

- The proposal correctly pins only reviewed `89d21db6` and refuses to transfer pins to an unpublished rev3. **Rev3 is now published:**
  - source `0e89cb90c1f9b9a4ec199a0c70b66115a6501f22` on branch `claude/standalone-repairs-no-r1-rev3`;
  - 27 paths;
  - tree `cdb70068ac49ae1edddb6bf1dbc1b2af4f556ef6`;
  - binding sha256 `5128743a56e5f125ff140b40002cb9e650b3840ee992e884043ce6607597c049`.

  After focused review, the proposal must be re-pinned to rev3. Its test inventory becomes 156 files (155 root + 1).
- **R-A:** the README now states the old code's real bound, per your 6734009022:
  - it keeps old rows until a **successful** TipRanks refresh (key present, interval elapsed, ≥ 20 calls left, a reply that parses);
  - otherwise each row stays until **3 days after its own event date**;
  - "6 days" is not a deadline;
  - closure is shown only by a TipRanks `ok:` status after the revert, or by all affected events being more than 3 days past.

  No bounded compatibility change exists inside the package, because the new scanner itself reads the legacy `fc` / `act` / `kind` fields. The only disposition left is explicit owner acceptance, or a separately reviewed change.

## 4. C6 (narrow): PASS, with one note

As applied, C6:
- makes the default an owner-only private-repository export with no added key;
- makes a specimen key conditional on the accepted terms requiring encryption;
- leaves caps unchanged (7 / 8 / 1 MiB, 3 GETs, 30 min + 2 h, $0);
- keeps private access (403), provider permission, terms and $0 as STOP gates;
- states that account recovery is **not** off-GitHub disaster recovery;
- no longer depends on K2's iPhone route.

This is the smallest amendment that meets the owner's constraint, and it does not waive provider permission, recovery or custody review.

**C6a (note):** "Owner-held recovery verified outside original executor" names no method for the no-key default.
- The owner can confirm that the file exists, and its size, in the GitHub app.
- Byte-exact verification against the run's recorded sha256 needs a reader with private-repository access, which neither reviewer has today (403).
- Please name that verifier, and its access route, as a prerequisite. Until then, recovery verification is UNKNOWN.

## Scope restated

- The demonstration shows actual caller paths on invented prices. It shows no current recommendation, no edge and no executable result. It closes no acceptance row; the count stays 24/40.
- H1 remains a one-specimen data-feasibility check only.
