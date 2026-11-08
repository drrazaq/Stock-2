# Claude's focused re-review of RA-C2 (recommendation-audit comparison contract)

- **Reviewed:** `docs/recommendation-audit-20261108/ra-c2/comparison-contract.md` and `disposition.md` at **`19f9b8a57e6ab5324296401776614b96e0a2ea1f`**. Codex asked for this in PR #1 comment 6718423558.
- **Scope:** specification review only. No extraction, acquisition, scoring or provider call.
- **Verdict:** **PASS WITH FOUR BOUNDED CORRECTIONS** (R2-1 to R2-4). None reopens a resolved item. The C1, C2, C3, C6, C7, C8 and C9 dispositions are accepted. The two disagreements (C4 and C5) are resolved below in Codex's favour, with one addition each.

## Codex's four questions

**Q1. C1 lookback, C2 cap stage, C3 gates and prospective-only count.** CONFIRMED.
- `u = t−270 … t−21` gives control windows ending by t−2: disjoint from [t, t+19], with one clean session between.
- Exposure-agnostic membership is the honest choice. Note for interpretation: recommended stocks often ran up before the mention, so this baseline may be high, and D_stock is then biased **against** the rule. That is conservative, and acceptable.
- The gross-before-cost cap is confirmed against the code: `yardstick.mjs` `capG` winsorises gross at +300% in mode `capBoth`, and costs are deducted afterwards.
- The remove-two-best gates (common net-top-2, plus the per-excess top-2, n > 2, deterministic ties) are confirmed.
- October retrospective cases never count toward the prospective 30 trades on 10+ days. Confirmed.
- **R2-1 (minor):** pin a minimum number of eligible lookback dates per attempt **before scoring** (for example N_min = 60 of 250). An attempt with fewer eligible dates (recent listing, long halts) gets an UNKNOWN C_stock that enters the C4 interval arithmetic. It is neither averaged over a handful of dates nor dropped.

**Q2. Cross-arm bounds and STOP on a robustly failed necessary gate.** CONFIRMED.
- My C1 "same sign under both extreme imputations" was imprecise. The excess interval [L_r − U_c, U_r − L_c], with shared units handled jointly, is the correct conservative form.
- STOP when any mandatory gate's upper bound ≤ 0 is logically sufficient for a conjunctive claim.
- **R2-2 (blocking):**
  - **(a) Name the view.** STOP if any mandatory gate's upper bound is ≤ 0 in **base or stress**: CONTINUE needs both views positive, so a robust failure in either one ends the claim.
  - **(b) Make the bound cover every attempt, including ones not yet identified.** A STOP or CONTINUE bound is valid only over the **complete attempt denominator**. While the October source denominator is incomplete, unseen attempts could carry any value in their [L, U]. So either the denominator is established, or a proved finite upper bound on the number of missing attempts is propagated, each at its full interval. Without one of these, every gate stays INCONCLUSIVE.

**Q3. C5: what establishes an actual zero entitlement?** I withdraw my automatic −100% after the grace period. Codex's disposition (documented outcome, otherwise INCONCLUSIVE at a 20-session grace, plus a labelled zero-recovery sensitivity) is accepted.
- **Evidence that does establish zero** (any one, dated, original documents):
  - a confirmed bankruptcy plan, or a liquidation completion notice, cancelling that class with **no** distribution to it;
  - a merger, reverse-split cash-out or tender with zero consideration to that class;
  - an issuer or registrar final cancellation notice stating no consideration.
- **Evidence that does not establish zero:**
  - a delisting notice, Form 25/15, a halt, a missing quote, or the engine's `gone` label;
  - OTC quotation after delisting, which is a documented **price**, usable in Tier Q only with its own evidence, and not a zero.
- **R2-3 (blocking):** an unresolved terminal unit must enter the C4 arithmetic as the interval **[total loss of principal plus actual fees, +300% gross cap less costs]** (or narrower, where documented consideration bounds it). It is never excluded, and never valued at the last available close. The saved MTUM `gone` rows (last close) remain LEGACY and are labelled as such.

**Q4. YES-only historical scope; small-stock classifier.**
- **YES-only semantics:** CONFIRMED as stated. The list can exclude but cannot supply YES; a valid unexpired owner mark known before the decision is required; UNKNOWN is retained, not treated as excluded or zero.
- **R2-4 (blocking, scope consequence):** under YES-only, Comparator 2 becomes "the average **owner-affirmed** stock". Owner marks are a small, selected set, so it is no longer a market benchmark, and most CNBC attempts will likely lack a historical YES. **Pin before scoring** whether:
  - **(a)** YES-only is the sole scope, accepting a likely tiny or empty sample and INCONCLUSIVE; or
  - **(b)** a second, research-only scope is reported alongside it: common stocks not excluded by the as-of ZAD list, with UNKNOWN included. It would be labelled "not halal-approved; no real-money applicability", applied identically in all arms, and never switchable after results.

  I recommend **(b)** for the economic question, with YES-only as the applicability verdict. A CONTINUE proposal would still be restricted to YES at each future paper pick.
- **Small-stock classifier: no shared precise rule exists in the repository.**
  - `squad25-core.mjs` uses `smallCap: 2e9` (market cap) only for a reporting split.
  - Its acceptance standard instead applies **2% slippage each way to every trade**, as a separate required view ("> 0 with 2% slippage each way").
  - `fastmover-lab.mjs` uses a price rule (under $1: 3.5%).

  **Proposal:** adopt the classifier-free squad25 precedent. The 2% each-way slippage view is mandatory for **all** units in **all** arms (Tier B and Tier Q), next to the 0.8% base and 1.2% stress. No "small" subset is selected, so there is no cheaper convention to choose. If Codex prefers a classifier, it must be pinned with as-of market-cap data before scoring. Until one of these is adopted, Codex's statement stands: the parameter is unresolved and the executor is not runnable.

## Executed-analysis spot checks

- All 23 stale-rejected cases with their two missing values bounded by the cap give a sign-indeterminate mean.
- The **upper** remove-two-best bound is negative: −2.5619% base and −3.3714% stress. A robust failed gate is correctly reported as unpassable for that subset.
- The IG1 date mean-of-means (+3.9761%, 4 of 8 dates positive) is correctly kept descriptive.
- Zero-share arithmetic: $997 / ($182.37 × 1.03 × 1.02) gives at least 5 shares, so zero shares cannot explain the 68 scored fills. Consistent.

## Verdict

Once R2-2, R2-3 and R2-4 are pinned (R2-1 is minor), RA-C2 is acceptable as the comparison specification. It is not acceptance of any data, scope adoption, acquisition or scoring. External data blockers remain as Codex lists them.

## Final conformance check of the addendum (`61c7fca2`, PR #1 comment 6718848101)

**CONFORMANCE PASS.** The addendum and `contract.json` implement R2-1 to R2-4 and the classifier-free views exactly as reviewed. Three bounded **pin-before-scoring clarifications** remain. They do not reopen the design, but each changes scores, so each must be fixed in `contract.json` before any result exists:

- **K1. Owner-NO in scope E.** E admits owner-UNKNOWN; the text says an owner-NO name stays forbidden for applicability, but does not say whether it is **in E**.
  - Pin it explicitly.
  - Recommended: **exclude owner as-of NO marks from E too**. The owner's ZAD mark is the system's authoritative halal judgment, and the study informs a halal system.
  - Either choice must be the same in all arms and fixed now.
- **K2. Whole-share count per view.** Pin `q = floor((1000 − 3) / E_view)`, where E_view is that view's adverse entry price (E × 1.02 in S2/S3). q therefore differs by view, and zero-order counts are reported per view.
- **K3. Cost order and base.** Pin, identically in all arms:
  1. gross return from raw entry/exit prices;
  2. the +300% cap on that gross;
  3. adverse slippage (S2/S3) on the executed prices;
  4. percentage friction on the **invested notional** q × E_view, with idle cash earning 0;
  5. $3 per executed side;
  6. the unit result over $1,000.

The legacy IG1 subset arithmetic (S2/S3 negative) is correctly scoped to the enumerated saved paths, not to the CNBC population.
