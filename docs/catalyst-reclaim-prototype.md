# Offline catalyst/reclaim workflow — implementation checkpoint

This completes an offline research path, not production readiness or a profitable
strategy. All new behavior is isolated on the development branch. Existing stops,
holdings, offsets, workflows, gates and historical study results are unchanged.

## What runs now

```
node reclaim-research-runner.mjs --input docs/examples/reclaim-synthetic.json
```

The supplied example is entirely SYNTHETIC. It contains a qualifying paper
sequence, a stale-price rejection and a later synthetic exit. It is not a stock
recommendation, retained live alert, market observation or profitability test.
The command writes JSON to stdout and never opens a default data path or writes
any file. Redirect output only to an explicitly chosen research location.

The workflow does the following in one run:

1. Requires an explicit research policy, supplied session calendar, identity,
   owner ZAD evidence, catalyst document hash and timing, committed USD contract
   amount and prior market cap, liquidity evidence and price/volume history.
2. Checks supplied evidence clocks against decision time, including capture and
   declared delay. Quote sizes must be normalized to shares, not lots. The
   contract, quote and bars must have the same supplied security identifier.
3. Defines the opening range as the first completed bar, requires opening volume
   at least the configured multiple of its supplied prior same-interval median,
   a pullback holding strictly above the opening low, then a completed reclaim
   above the opening high. It does not use incomplete-bar highs to claim an entry.
4. Produces a paper-only card or an explicit rejection/unknown reason, retaining
   both outcomes. Whole-share sizing uses at least a $1,000 research budget and
   $3 entry commission. No real dollars are allocated.
5. Returns an append-preserving, hash-linked observation ledger. Repeated identical
   IDs are idempotent; changed contents or policy hashes are errors. This is an
   in-memory integrity contract, NOT authenticated durable append-only storage.
6. Resolves supplied quote-based paper economics after the required session-close
   path is available. Includes $3 per side and explicitly configured slippage;
   entry ask/exit bid already include spread, which is not charged twice.
7. Reports cash-inclusive independent-unit results, missing outcomes and purely
   descriptive statistics. No trade count, t statistic or positive return can
   grant BUY admission. Controls and an account replay are not fabricated.

## Exact proposed hypothesis in the example

The example policy is UNAPPROVED and was not frozen before untouched real-market
outcomes. It uses a pre-open, fixed-committed-USD material agreement worth at least
10% of prior market capitalization; price at least $2; prior 20-day dollar volume
at least $500,000; spread below 3%; 30-second quote/trigger age limits; 5-minute
bars; opening volume at least 1.5 times supplied prior same-interval median; and
0.25% slippage on EACH side. These are assumptions to review, not established
optimal settings. This narrower volume-only contract proposal differs from the
source's ambiguous “gap or volume” rule. It has no options, intraday stop, target,
portfolio trim or automatic strategy promotion.

Exit precedence is explicit: max fifth-session close, OR next session open after
an earlier session closes below the opening low, whichever occurs first. An
invalidation on the fifth close does not extend holding to a sixth session. The
pre-close bid models a planned close exit and is not a guaranteed closing-auction
fill. Invalidation exits can gap below the opening low. No software promises a
maximum realized stop loss.

## Existing method stays rejected

The repository already contains EVENT_ORB_RETEST_15D_V1. At base 26508599 its
saved gate file is REJECTED: 75 modeled outcomes, mean net -0.59% at modeled
0.8% cost, with failures in both halves. Those saved outputs are context only;
they were read, not independently regenerated. That method uses a different
event-relative opening range, 15-minute data delay, VWAP confirmation and 1.5R
target. The new contract-specific prototype does not inherit an edge, repair
that result, replace it or count it as new proof. Its existing core regression
script was run unchanged alongside the new tests.

## Verification

Local Node v24.22.1: 67/67 Node test-runner results pass across the two prototype
test files and the unchanged existing event-ORB script. One result is that legacy
script's wrapper, not one new independent strategy test. There are 66 native new
prototype/workflow tests. The actual CLI was exercised on temporary synthetic
files, including malformed input and missing arguments; the input remained
unchanged. A separate example command completed. No full-repository local suite
or Node 20 result is claimed here. Hosted CI runs separately on publication.

Coverage includes options/ZAD rejection, impossible/future/ambiguous clocks,
delayed evidence, wrong symbols/security IDs, quote-size units, materiality
provenance, contract ceiling rejection, supplied early closes, no reclaim,
opening-low failure, gaps, expiry, missing closes, insufficient exit size,
gap-loss economics, last-day exit precedence, ledger conflicts, preserved
rejections, positive synthetic statistics without promotion, duplicate/orphan
outcomes and actual CLI execution.

## What remains before live research or BUY use

- Independent code and hypothesis review. No third-party review is claimed.
- An authoritative calendar and security mapping; supplied IDs/calendars are
  structurally checked, not independently authenticated. A supplied early-close
  session is supported, but this is not a complete exchange holiday service.
- Verified primary-document acquisition/parser and amount/currency/contingency
  interpretation, prior panel source/availability and declared-delay verification.
- A concrete existing-data evaluation/approved acquisition plan. Synthetic
  examples cannot establish actual coverage, fees paid, fills or returns.
- Predetermined matched controls, full failed-candidate denominator, untouched
  evaluation, uncertainty/multiple-testing review and account-level capital replay.
- Separate reviewed operational integration. No caller in scan.mjs, watcher,
  Telegram, browser or workflow invokes these new files. No new live collection
  or provider request is activated by publishing them.

The existing stop-alert package and production operator responsibilities remain
separate. No original acceptance row is closed by this software checkpoint.
