# Focused review: research horizons and bounded CEG evidence request (`5f76cea43`, Codex 6733406620)

Review only, offline. No acquisition, setup, provider contact, credential or spending.

**Scope:** the new symbolic missing-stale arithmetic, the horizon attribution, and the workability of the single CEG evidence request. Prior reviewed analyses were not recomputed.

**Verdict:** **PASS** on the arithmetic. **CORRECTIONS REQUIRED** (C1–C5 below): two factual and attribution corrections, and three gaps that block the request from being executable.

## 1. Missing-stale arithmetic: PASS

- `missing-stale-sensitivity.py` reruns byte-identically. The input sha256 pin `55f5a6b4…` holds, and all 4 `manifest.json` hashes match.
- **Independent recomputation** from `retained-diagnostics.json`: the known 21-reject mean intervals, base view first, then stress, +2% each way, and stress +2% each way.

  | View | Known 21-reject mean | Required pair mean for zero (= −21b/2, −21a/2) |
  |---|---|---|
  | Base | −3.165 / −3.107% | **32.620–33.233%** |
  | Stress | −3.971 / −3.906% | **41.008–41.699%** |
  | +2% each way | −7.035 / −6.929% | **72.755–73.865%** |
  | Stress +2% each way | −7.841 / −7.727% | **81.138–82.334%** |

  All four match the findings.
- **Cross-check:** −21·mean/51 gives 1.279–1.303 points at base cost, which reproduces the already reviewed fixed-51 gate effect. The fixed-53 intercept and the −2/53·m coefficient follow from the same identity.
- **Sign logic is right:** below the lower threshold, rejecting all 23 helps; above the upper threshold, it harms. The 23 = 21 + 2 and 31 = 23 + 8-overlap labels are consistent with the 102 breakdown (68 + 23 + 10 + 1).
- No imputation, new arm or new threshold.

## 2. Horizon attribution: corrections C1 and C2

Spot-checked against the frozen lab files:
- **B-FCF1** (`data/value-lab.json` firstRun) matches exactly: means +3.87 / +5.72%, own-stock −2.74 / −0.46%, newer tBlock 1.79.
- **PB8, PB12 and IG1** figures match earlier reviewed outputs. The PB12 "+71.72 points" figure is correct: 324 × 7.305 / 33.
- **Crisis commissions:** 120 × 2 × $3 = $720 is correct.

**C1 (SQ6-MTUM attribution is one-sided).** `data/squad6-lab.json` firstRun gives own-stock excess by half:
- older −15.71% (ownCovered 3);
- newer +1.28% (ownCovered 4);
- all −6.0% (ownCovered 7).

The table cites only the older −15.71%. Please state the coverage and give all three figures. Also pin the source of "7 formation blocks": the file has `newer.blocks = 4` and no older `blocks` field. The 7 matches `ownCovered` 3 + 4, which is not the same quantity.

**C2 (horizon boundary).** B-FCF1's frozen hold is **63 sessions**, about 3 months. That sits on the mid/long boundary, yet it is filed under Long-term. Either note that it straddles the boundary, or place it in mid-term. Its verdict is unchanged either way.

## 3. What the CEG specimen enables, and what stays missing

**Enables, if everything passes, data feasibility for one hand-picked event only:**
1. Whether the held entitlement returns complete historical SIP quotes for CEG in two 30-second windows, with `asof` mapping and corporate actions, within the caps.
2. Whether the existing normalizer/evaluator interprets conditions, tape, exchange and size units correctly on real responses.
3. One conditional mark: the 7 Oct first eligible ask and the 3 Nov last eligible bid, with q = floor(997/ask) and $3 per side, reported apart from the spread.

**Enables nothing statistical:** n = 1 on a selected case; no controls; no original decision or receipt timing; no proof of a fill; no test of A or any strategy.

**Still missing afterwards** (as the request itself says), unchanged:
- A's 617 rows: original bodies, IDs, receipt clocks and denominator;
- IG1: 2 missing stale outcomes, 10 no-fills and 1 no-bars path;
- all 102 authentic chains;
- earnings 395 membership and consensus vintages;
- SQ6 daily book and cache;
- the third-party cash-deal population;
- the PB12 control witnesses.

A passing specimen would justify, at most, proposing a separately reviewed population-level request. It would not justify any trading or research verdict.

**C3 (date convention).** By `market-session.mjs`, 3 Nov 2026 is the **20th session counting 7 Oct as session 1**, which is **19 sessions after the entry session**. "20 sessions" must state that inclusive convention, because the system's time exits count sessions after entry; CLAUDE.md already lists a one-session discrepancy. The times are correct: 7 Oct 13:30Z = 09:30 EDT, and 3 Nov 21:00Z = 16:00 EST, after the 1 Nov DST change.

**Risk to state (not a correction):** `limit=10000` with no paging over a 30-second window at the CEG open can overflow. That makes GET 1 end INCONCLUSIVE by design, using up the single attempt. State it as the most likely failure, so a failure is not misread as an entitlement refusal.

## 4. Are entitlement, custody and $0 workable?

**C4 (entitlement gate is owner-only and likely terminal).**
- Neither Claude nor Codex can see the account plan or the accepted agreement versions; only the owner can open them. The request should say so.
- It should also say that if the accepted terms do not expressly cover processing by a hosted AI operator, the route **STOPs**, because resolving that needs provider contact, which is a separate decision.
- As written ("do not ask owner to guess technical facts"), it is unclear who performs the prerequisite.

**C5 (custody is not executable yet). Two gaps:**
1. **Executor and credential route are unnamed.**
   - The 3 GETs need an Alpaca API key on some host. The only existing keys are trading keys: paper, able to place paper orders, and kept as GitHub Actions secrets.
   - Public-repository Actions logs are public, and the private repository's Actions are disabled.
   - A Claude session would need the key through the credential form, which is a credential grant carrying order capability.
   - The request must name the host, the key route and that capability. Until then, custody cannot be judged.
2. **Recovery-copy key is unnamed.** The request rightly refuses to borrow R1's key, but names no alternative. Workable option: a separate owner-held specimen key, made and proved outside the runner with the same reviewed K2 procedure and `k2-key-tool.html` (key-check route). The procedure is reused, not the key.

**$0: workable on condition.**
- Storage is ≤ 8 MiB in the existing private repository. The market-data subscription is already held (the feed check of 23 Oct records the upgrade), and quote requests are not metered per call.
- The ceiling is enforceable only if the executor is not a new paid runner:
  - **Claude-session executor:** nothing is metered.
  - **Any Actions use:** the owner must confirm an Actions spending limit of $0.
- Alert-only controls are correctly rejected as insufficient.

## Summary

| Item | Result |
|---|---|
| Missing-stale arithmetic | PASS |
| Horizon attribution | C1 (SQ6 one-sided), C2 (B-FCF1 boundary) |
| CEG specimen scope | Data feasibility for one selected event only; C3 (session convention) |
| Entitlement | C4: owner-only; likely STOP without provider contact |
| Custody | C5: executor/credential route and recovery key unnamed |
| $0 | Workable if no metered runner is used |
