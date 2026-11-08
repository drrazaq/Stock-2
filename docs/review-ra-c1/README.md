# Claude's independent review of RA-C1 (recommendation-audit comparison contract)

- **Reviewed:** `docs/recommendation-audit-20261108/comparison-contract.md` at **`fac44ccd4423fd2db81bfe648431ae54735f7289`**, branch `codex/recommendation-audit-20261108`. Codex asked for this review in PR #1 comment 6717700936.
- **Date and scope:** 8 Nov 2026. A review of the specification only.
- **Not done:** no source extraction or acquisition, provider call, scoring or production action. No data was read beyond the published files.
- **Verdict:** **CORRECTIONS REQUIRED** before any scoring. The structure is sound, and most rules are strict in the right direction. Nine corrections are listed below; C1–C5 are blocking.

## Verified (no change needed)

- **Calendar arithmetic**, recomputed from the NYSE 2026 schedule:
  - 23 possible primary entry opens (1 Oct to 2 Nov);
  - 22 possible Comparator-1 opens (2 Oct to 2 Nov);
  - 8 matured windows on 8 Nov (entry 12 Oct, session-20 exit 6 Nov);
  - the last exit is 30 Nov: Thanksgiving 26 Nov is skipped and 27 Nov is a 1:00 pm close.
- **The TD9 offset arithmetic:** 3 × 1.97 / 136 = +0.04346%.
- **Strict choices that should stay:**
  - stable security ID, not tickers;
  - entry strictly after the authenticated first-public time;
  - no available-case averaging;
  - equal weight per original attempt;
  - unknown is never a loss, cash or a favourable quote;
  - one identical execution and cost function for all three arms, pinned before scoring;
  - no p-value manufactured from overlapping windows;
  - SPY as context only;
  - no promotion beyond a separately reviewed prospective evaluation.

## Corrections

**C1 (blocking): Comparator 1 is contaminated by the treatment's own holding window.**
- **The problem:** every candidate u lies within about 22 sessions of t, so most 20-session control windows share most of their sessions with R_j's window. A control at t+1 shares 19 of 20 sessions.
  - This mechanically pulls C_stock(j) toward R_j and attenuates D_stock toward zero.
  - Controls after t also contain the post-mention path itself (pop, drift or reversal), so the contrast does not measure "the same stock without the recommendation" in either direction.
- **The contract says:** "show all overlaps without filtering them away".
  - That is correct for reporting.
  - It is not a valid primary contrast.
- **Required:** pick one before scoring.
  - **(a)** Primary C_stock uses only eligible u whose window is **disjoint** from [t, exit_j]. The all-dates version is secondary. With October-only dates this is likely empty, so the result is INCONCLUSIVE.
  - **(b, recommended)** Restate Comparator 1 as the repository's §4 gate, "beats the same stock on its other days": the same security on all eligible opens in a **fixed causal lookback** ending before t, with windows disjoint from the treatment window.
    - Pin the length in advance, for example the 250 sessions ending at t−21.
    - Because mention coverage over a year is unavailable, membership is **not conditioned on mention absence**. This is an exposure-agnostic baseline, and known mentions are reported.
- Either way, name the October near-date version as what it is: a "near-date timing contrast", not the §4 gate.

**C2 (blocking): the +300% cap is missing.** `CLAUDE.md` §4.3: "the +300% cap applies to the rule and the yardstick alike".
- **Required:** cap every unit return at +300%, identically in all three arms.
- This also gives the missingness analysis in C4 a finite upper bound. The contract currently says unknown upside "is not bounded".

**C3 (blocking): remove-two-best is a §4 gate, not only a sensitivity output.** §4.4: "still positive without its 2 best trades".
- **Required:**
  - CONTINUE requires net and both excesses to stay positive with the two best attempts removed.
  - State the maximum attainable tier explicitly. A one-month, one-horizon, chosen-after-the-fact cohort cannot meet the two-halves, per-year or block-t gates, so it can reach at most §4.5 **forward paper only** (30+ resolved trades on 10+ days, positive after cost).
  - Register the try in the method registry and the league multiplicity count (luck bar about t 4.07 at about 2,130 tries).

**C4 (blocking): "adequately complete evidence" is undefined.**
- **Required:** a symmetric bounds rule. A STOP or CONTINUE decision is allowed only if net, D_stock and D_date keep the same sign under both extreme imputations of every unknown unit:
  - **worst:** −100% minus fees, or the delisting rule in C5;
  - **best:** the +300% cap.

  Otherwise the result is INCONCLUSIVE.
- This turns the existing "finite justified bounds" sentence into a pre-registered rule and stops a point estimate on a partial sample from triggering either decision.

**C5 (blocking): delisting and terminal events need the §4.2 rule.** §4.2: "dead stocks included (delisted = real loss)".
- **Required:** a terminal event with no evidenced recovery value by the unit's maturity (plus a pinned grace period, for example 20 sessions) is scored at −100%, not left UNKNOWN indefinitely.
- An evidenced recovery value (merger consideration, cash-out) is used when documented. The same rule applies in all three arms.

**C6: Comparator 2 is unscorable by construction unless a tier is pinned.**
- Quote, BBO and capacity chains for the full point-in-time common-stock population of each entry date are thousands of chains per date. Under "unknown stays in the denominator" the comparator will practically always be INCONCLUSIVE.
- **Required:** state this up front and pin, before scoring, either:
  - **(i)** a two-tier contract:
    - **Tier B** (the §4-comparable bar model): next open, session-20 close, 0.8% cost (1.2% stress), plus 2% each way for small stocks, identical in all arms;
    - **Tier Q** (quote-executable): scored only where chains exist;
  - or **(ii)** an explicit declaration that only Tier Q is valid, accepting a permanent INCONCLUSIVE.

  Choosing after seeing results is not allowed.

**C7: dependence reporting.**
- All attempts on the same date share C_date(j) exactly, and same-episode attempts share timing.
- **Required:** alongside the attempt-weighted means, report descriptive summaries clustered by **date and episode**: the mean of cluster means, and the count of clusters with positive mean D. Never present attempts as independent.

**C8: whole-share zero-order units.**
- Under `floor((1000−3)/price)`, a price above $997 gives 0 shares. That is a proved no-order unit at 0% in every arm.
- **Required:** report the count and share of zero-order units per arm. In Comparator 2 they pull C_date toward 0 at the same time as they leave the treatment arm unaffected.

**C9: point-in-time halal scope source.**
- **Required:** name the as-of sources for the YES/NO/UNKNOWN facts: the ZAD quarterly list in force at t, plus owner marks dated at or before t (`data/halal.json`, `data/zad-list.json`). Pin the research-scope treatment of NO/UNKNOWN before scoring.
- Real-money applicability stays YES-only.

## What stays open (inputs, not contract changes)

These are already listed in the contract and are correctly treated as blocking inputs, not assumptions:
- the original October episode/mention/timestamp/edit denominator;
- stable security identity and the point-in-time listing population;
- historical halal facts;
- quote and cost chains;
- an executor shared by all arms;
- control outcomes and mature exits.

Nothing here authorizes acquisition.
