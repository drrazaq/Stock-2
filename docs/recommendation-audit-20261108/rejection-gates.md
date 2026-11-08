# Executed gate-effect analysis — fixed 102 IG1 records

8 November 2026. New owner-authorized analysis of existing local Git evidence, separate from R1, the parked one-quote capture and broader A implementation. Original 102-key cohort, primary close exit, literal 3% limit, <=3-minute age rule and old friction/stress remain unchanged. No source producer, bars, provider acquisition, rule relaxation or new winner search. This is legacy saved-model counterfactual analysis, not proof of live fills, halal suitability or $3 whole-share performance.

[Reproducer](../../tools/audit-rejection-gates.py) opens the fixed old receipt and 17 explicitly pinned existing local versions of data/ignition-results.json. New lead: the age-gate correction removed numeric outcomes which may remain in older commits. No repeat broad archive search or remote data fetch. [Full results](rejection-gates-results.json) retain each version's commit/blob/bytes/SHA256, all 21 recovered keys, row hashes and numeric versions. All recovered base/stress pairs agree across their retained versions; none selected by favorable return.

## What the gates actually rejected

| Freshness predicate | Saved disposition | Count |
|---|---|---:|
| Fails age rule | stale label | 23 |
| Fails age rule | no-fill label | 8 |
| Passes age rule | scored | 68 |
| Passes age rule | no-fill label | 2 |
| Passes age rule | no-bars label | 1 |

**31/102 fail freshness**, not merely the 23 with an exclusive stale label. Eight of ten no-fill labels overlap freshness. There are 34 unique rejected/unpriced cases, not 31+10+1 distinct rejections. The producer's no-fill branch also includes an absent next bar; the stored reason alone does not distinguish that from an open above the literal 3% cap. No arbitrary assignment to “overpriced” or “missed winner.”

## Helped or harmed: the recoverable freshness subset

Recovered numeric primary outcomes for **21/23 stale-labeled records**: **17 losses, four wins; mean −2.5619%, stress −3.3714%**. Rejecting them gave up modeled winners as well as avoiding modeled losses. Thus the gate was not an oracle; its measured saved-model subset effect is favorable overall.

Use the SAME last pre-purge snapshot `d1213696833f442d26e29f08a966db3e05c3e4b5` to avoid comparing earlier rejects against a later winner-filled sample. It contains those 21 rejected numeric rows and 30 subsequently retained scored rows. All 30 retained values exactly match the final original cohort; ignition-core blob `ee8279c93173d38eb5f5dc1544f5d64d5498dc0b` is identical to current. Historical producer `fastmover-lab.mjs` still has the literal 3% cap and the same core friction import. The old independent scorer did not yet exist; do not pretend its later source hash was present.

| Same 51 recoverable attempted units | Base saved model | Existing stress |
|---|---:|---:|
| Ungated mean, all 51 modeled trades | −1.0198% | −1.9031% |
| Mean among the 30 retained modeled trades | +0.0597% | −0.8753% |
| Fixed-51 mean if the 21 freshness-rejected units stay cash/no order | +0.0351% | −0.5149% |
| Fixed-51 cash-inclusive gate effect | +1.0549 percentage points | +1.3882 percentage points |

Cash-zero above is an explicitly modeled no-order disposition under the known age predicate in this 51-unit counterfactual, not imputation of an unknown actual fill/exit. It is not a full-102 result or a funded account return. The stress result remains negative after the gate: a helpful filter does not establish a profitable strategy. No new filter/threshold is adopted.

All four dates with recovered rejected outcomes are reported in the machine output; fixed-attempt cash effects are positive on all four. On 21 Oct, however, the retained-trade mean is worse than the rejected-trade mean (−3.6125% versus −0.4433%). This shows why “higher average among filled trades” and “avoided net modeled losses” must be reported separately, not used interchangeably or optimized after seeing the result.

**Unresolved stale cases:** `2026-10-22|MACIU|IG1`, `2026-10-22|XCUR|IG1`. No retained numeric close outcome in any of the 17 inspected versions. For the full23 rejected mean to reach zero, those two would need average +26.9% under the base model or +35.4% under stress. Such upside is not ruled out by the evidence. Full23 sign is therefore INCONCLUSIVE; neither case is assigned zero/loss, replaced or acquired now.

Freshness is a known-then evidence safeguard. A stale signal's favorable later model path would not establish that its alert price was executable. These historical percentages cannot justify weakening the gate or prove its actual after-cost economic effect.

## What cannot be scored, precisely

- **Literal 3% entry limit:** 10 no-fill labels, eight overlapping age failure. None has a retained numeric primary counterfactual in these versions. Required missing evidence: original next-bar/quote sequence, precise failure cause, timely decision/reference price, quantity/displayed liquidity/conditions, same fixed exit/action/fee chain. Do not invent “entered anyway” results or alter the limit.
- **No bars:** one fresh case remains a data failure, not an economic rejection. Original price path/terminal evidence is absent.
- **Instrument/halal, SEC/dilution, halts, source-quality and other operational rejection gates:** the fixed IG1 rows do not carry a case-complete independent decision/reason ledger plus rejected-case execution paths under each gate. Their benefit/harm is UNKNOWN. Separate historical warning associations are not incremental gate effects; no F6 research substitute.
- **Authentic result:** 0/102 complete recommendation→known-then→BBO/whole-share entry→exit/action→$3-cost chains remains unchanged. Model recovery does not repair original clocks, identities, fill capacity, fee or comparison gaps.

Terminal verdict: **freshness helped the recoverable saved-model subset; full rejected-population and authentic economic effects remain INCONCLUSIVE.** Other gates have the exact blockers above. No additional material gate contrast is computable from these fixed inputs without imputing outcomes or changing rules.

Recommendation audit RA-C1 review is still separately requested. The completed contract, concentration/stress/attrition/calendar and this gate analysis remain available while that independent response is pending; neither R1 nor parked IG1 prevents them.
