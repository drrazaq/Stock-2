# A pathway: A1/A2 repairs and A6 reporting mitigation

Independent review: Claude at 477a34050e353894c65e54ec18706b2d78d0b224,
reviewing implementation 38366f41. This repair starts from fresh development
37095a18e44a50fffd026e9e2bfb016e6026f920 and preserves the independently assigned
historical invocation/custody/client and stop-package work. No production,
provider-data calls, credential use, collection, pilot or strategy activation.

## Reproduced before repair

- Claude's unchanged probe2: three displayed cards (including a rejected message),
  two resolved units, summed model net USD71.89500000000018 for a repeated issuer
  and session under a second observation ID.
- Ask USD5, USD1000 unit, proposed entry slippage0.25%: card199 shares versus
  modeled outcome198.
- Nine new regression cases ran RED before implementation (0pass/9fail).
  The full sanitized local failure log is retained here. Some failures expose
  the absent admission/reporting interface; the two concrete counters above are
  independently reproduced old-behavior observations, not inferred from them.

## Changes

### A1: one entry per supplied issuer/session throughout the batch path

All observations/rejections remain in the ledger. Eligible assessments are
ordered by supplied decision clock, stable security ID and observation ID; the
first per issuer/session/policy becomes an admission. This ordering uses no exit
outcome or return. Missing issuer/mapping evidence does not fall back to ticker
or security ID. Later assessments/class aliases remain visible as duplicates,
not additional entry units. Only admissions produce cards and modeled outcomes.
Provided exits for rejected/duplicate observations are disclosed with hashes as
unapplied evidence. Orphan exit IDs are refused.

The summary independently verifies the admission manifest, the first eligible
observation and issuer/session uniqueness. The offline batch-storage CLI uses
the same ordering/admissions before recording outcomes; an existing card is
never replaced if a later batch supplies an earlier clock. Such a conflict stays
an error, not a retrospective repair. The lower-level append-oriented store
still preserves its first recorded card; prospective ordering/ingestion has not
been implemented or authenticated by this fix.

Cards now contain qualifying admissions only. All rejected/duplicate human
messages are retained separately as assessmentMessages; callers must not count
that message list as trades. Full raw input remains bound by dataset/input hashes
and must be retained separately under the approved archive arrangement.

### A2: one shared whole-share sizing calculation

The paper card and outcome both use floor((budget-3)/(ask*(1+slippagePct/100))).
The card retains the unadjusted reference ask and displays the proposed sizing
price/slippage separately. At ask5 both now use198 shares. Fee assumptions,
strategy thresholds, stops and exits do not change. The summary independently
checks card/outcome quantities, modeled entry, USD6 commissions and arithmetic.

### A6: incomplete cohorts cannot present resolved-only headline averages

If any admitted entry lacks a modeled resolution, headline mean, total, win rate,
profit factor, remove-two-best view and clustered t are null. Resolved-only
diagnostics remain under resolvedSubsetOnly, with missing IDs and counts.

For each unpriced unit with known modeled entry size/price, report an explicitly
conditional lower bound: zero exit proceeds and exactly USD3 fees each side.
There is no finite upside bound for missing long-equity returns. A missing cohort
therefore remains INCOMPLETE; controls, source/exit authenticity, full risk-set
coverage and economic admission remain unestablished. These conditional model
bounds are NOT a guarantee about real execution, fees or financial loss. No
overall economic GO, profitability or live admission follows from them.

## After repair

- Unchanged Claude probe2: one card, one resolved unit, model net35.9475.
- Unchanged Claude probe3: one resolved, one missing; headline mean/total null.
- Local Nodev24.22.1:106/106 tests across the existing prototype/workflow/store
  and13 new review regressions. Both actual CLIs are covered by those tests.
  The original nine-case RED log and full final GREEN log are retained.
- Added tests cover another share class, reversed input ordering, storage/runner
  parity, stale/rejected assessments, missing issuer mapping, incompatible
  admission/outcome manifests, 21 quote/slippage boundary combinations, quantity
  mismatch detection and conditional incomplete-cohort reporting.
- No repository-wide local suite or final exact-head hosted PASS is claimed by
  this build-time report; hosted CI and Claude's focused re-review follow.

Old383 synthetic examples and review artifacts remain intact at their original
paths; they describe that old implementation. New CLI-generated examples live
under this repair folder. The default docs/examples synthetic input adds the
explicit synthetic issuer mapping needed by the corrected runner. No financial
or original research data file is changed. The paper hypothesis is unapproved.

## Not fixed or waived

- A3: no current-validity policy for ZAD evidence is enforced. A historical mark
  is not established as current. No new90-day or daily re-mark rule is adopted.
- A4: verification labels/URLs/hash format are not original-content acquisition
  or authentication. Human card text now states source authenticity is not
  established, rather than implying this evaluator verified a real agreement.
- A5: submitted exit evidence is unauthenticated and can be selected in hindsight.
  Deduplication/immutability protect linkage, not truth or untouched evaluation.
- A6: reporting is mitigated, but real outcome bounds, controls and a complete
  candidate denominator still need authenticated data and independent review.
- A7: no automatic stale-lock deletion, tail truncation or new recovery authority.
  Existing fail-closed behavior remains; operational recovery must be reviewed.

Pilot readiness stays BLOCKED; NOT PROVEN, no prospective admission, no live BUY.
Stop r2 remains Claude's package and Codex's separate re-review; no deployment or
maintenance is requested here. Please re-review A1/A2 and A6 changes at the new
exact commit and report findings rather than inheriting a PASS from old tests.
