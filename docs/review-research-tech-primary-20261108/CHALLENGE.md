# Independent challenge: Codex's three-case supplier/contract review (`6d5b506e2`, request 6720358361)

**Overall: AGREE with STOP on any revival of supplier drift. DISAGREE that the remaining idea is a clearly distinct mechanism. DO NOT run the proposed AVGO novelty census as written.** Research only; no trading, acquisition, credentials or production action.

**Verification limits, said plainly:**
- `www.sec.gov` and `www.globenewswire.com` do not resolve from this sandbox, so **no primary page was opened**.
- The MU, AVGO and GTAT dates and terms below are checked only against the reviewer's background knowledge, marked *(recall)*. They are **unverified**.
- The repository checks were run directly:
  - `REVIEW.md` and `FINDINGS.md` at `6d5b506e2`;
  - the `squad24`/`25`/`26`/`28-core.mjs` headers;
  - `data/strategy-library.json` (747 entries);
  - `docs/review-ad3837-response/retained-comparison.json`.

## 1. Is the mechanism distinct from SQ28, Qima and the contract studies? AGREE WITH CORRECTIONS (largely a relabel)

**SQ28 is genuinely different on its trigger.**
- SQ28-SUPDRIFT (`squad28-core.mjs` L14–16, L62–87) is triggered by the customer's earnings (SUE in the top 30% plus a positive reaction day), not by a new commitment.
- The review's corrected numbers match `retained-comparison.json`: 92/39, −1.42%/−0.25%, and 121/55, −1.77%/−0.10%, all REJECTED.

**The contract/deal family is where "newly enforceable demand" overlaps:**
- SQ21-CONTRACT10D (8-K 1.01 with a named counterparty; 839/1,025 trades, about −1%; its ≥10%-of-revenue subset "also lost").
- SQ24-MEGADEAL (deal ≥ 20% of the filer's market value with a top-100 company, already an economic-size filter; rejected).
- SQ26-FIRSTMIN (commercial terms required, financing wording screened out; rejected).
- C-QK1 and DEC2-CONTRACT (rejected).

**Omission: `C-CT1`** (`data/strategy-library.json`, "Contract size vs company size").
- It was pre-registered on 22 Oct and queued, never run.
- Rule: an 8-K 1.01 whose stated value is over 10% of market value; version 2 also requires the contract to cover 4+ quarters of cash burn.
- It is the project's existing pre-registered encoding of "an economically enforceable increment".
- The review neither cites nor rules on it.

**What is left:** "newly enforceable demand" is in practice a novelty and enforceability **filter on an event set that already lost about 1% per trade**, not a new event class. Only the **qualification-milestone** half (production qualification or design-win announcements) looks untested: grepping the library for qualification, design win, take-or-pay and prepayment found no event rule.

**One real difference the review should state:** the three cases are large or mega caps, while Squads 24–26 were $1–10 stocks and SQ21 had a $2 minimum.

**Qima:** the only retained mention is "Qima is parked" (`docs/a-first-capture-continuation/worker-runtime-followup.md:3`), with no rule definition. The review is right not to rule on it, but it equally cannot claim distinctness from Qima.

**Untraceable figures:** `REVIEW.md` L9 "contract-family firstRun 426/491, −1.32%/−0.85%". These match neither SQ21 (839/1,025), SQ24 (108/156) nor SQ26 (108/130) in the library, nor `retained-comparison.json`. Cite the source.

**Stale library status:** `strategy-library.json` still lists SQ28 as "too few cases" or "not proven", while the corrected verdict is REJECTED.

## 2. Original availability and prior disclosure: AGREE WITH CORRECTIONS (not verified against primary pages)

- **MU** *(recall)*: probably understated.
  - Micron's 27 Sep 2023 FQ4 call already said HBM3E was sampling, with an early-2024 ramp.
  - NVIDIA announced H200 on 13 Nov 2023.
  - Micron's 20 Dec 2023 results were released **after the close**, so "already public" dates from about 20 Dec after 16:00 ET.
- **GTAT** *(recall)*: consistent so far: the 4 Nov 2013 8-K and release, the $578M prepayment in instalments, about $439M received before the 6 Oct 2014 Chapter 11 filing. The 16:15 ET stamp is unverified.
- **Correction:** the review records no EDGAR **acceptance** times (`REVIEW.md` L32). Project rule §2 requires acceptance and publication times, and the EDGAR filing index shows them. Record them for each 8-K rather than leaving them unknown.

## 3. Reading of the obligations: AGREE WITH CORRECTIONS, with one overreach risk

- **The general GTAT reading fits recall:** the prepayment was repayable (mainly as credits against Apple purchases from 2015), secured and accelerable, with no Apple minimum purchase.
- **The overreach risk is `FINDINGS.md` L7.** It says the 4 Nov 2013 release itself disclosed "no guaranteed volumes, minimum supplier capacity and exclusivity obligations". *Recall:* the detailed one-sided terms (exclusivity, capacity, penalties) became widely public mainly through the October 2014 bankruptcy declarations, and the agreements were filed later with redactions. If so, the attribution is hindsight-tinted.
  - **Required:** verbatim quotes, each with its exact source document and acceptance time, before keeping that sentence.
  - Soften "the downside was visible in the announcement" until those quotes exist.
- **AVGO** *(recall)*: the 23 Jan 2020 8-K (about $15B under multiyear Apple agreements to mid-2023) supports reading 2023 as a renewal or replacement. "Conditional purchase obligations" and "capacity allocation" need verbatim support.

## 4. Choosing cases with hindsight: AGREE WITH CORRECTIONS

- The write-up labels the cases illustrative and claims no performance (`REVIEW.md` L3, L19; `FINDINGS.md` L19). Good.
- But the selection is plainly hindsight: two famous winners and one famous blow-up, from an Instagram lead. Some leakage is real:
  - the proposed coding fields (prior-known, new economic state, obligations, timing) were derived from outcome-known cases;
  - the census targets AVGO–Apple, a pair already inspected, whose outcome is known.
- The fields are fine as data hygiene. **They must not become rule filters.**

## 5. Is the bounded novelty census justified? DISAGREE as specified

- **Too few events:** AVGO 8-Ks naming Apple in 2020–2023 probably number about 2 to a handful. A "cap 20" census would test a novelty definition on about 2 events from a pair already seen. That is neither outcome-independent nor capable of validating a reproducible definition.
- **Weak prior:** the parent event set lost about 1% per trade over thousands of trades.
- **Gates likely unmeetable:** large-cap enforceable-demand events are rare, so n ≥ 20 per half on 10+ days is likely unmeetable (compare SQ28's TOO FEW). Any later rule must also clear t ≈ 4.07 after about 2,130 tries.
- **Recommendation: do not run it.** If the owner wants anything, the only defensible step is a **feasibility count only**:
  1. a pre-frozen mechanical query (for example, all 8-K Items 1.01/7.01/8.01 from top-300 issuers, Oct 2021 – Oct 2026, containing "qualif*", "minimum purchase", "take-or-pay" or "prepayment");
  2. a coding scheme frozen first, with two coders who have no price access and agreement of at least 0.8;
  3. **STOP permanently** if fewer than 20 "new enforceable" events per half are projected;
  4. logged as a try, with no price data.
- Otherwise the governance-clean test of contract size is the already pre-registered `C-CT1`, expected to inherit the contract family's negative base rate.

## Requested corrections before relying on the review

1. Keep STOP on supplier drift.
2. Re-label the remaining idea as "largely a filter on the rejected contract family, plus an untested, unscoped qualification-event idea" (not "distinct, INCONCLUSIVE").
3. `FINDINGS.md` L7: verbatim GTAT terms, each with its source document and acceptance time.
4. `REVIEW.md` L9: cite the source of 426/491.
5. Add `C-CT1` and the EDGAR acceptance times.
6. Do not run the AVGO census.
