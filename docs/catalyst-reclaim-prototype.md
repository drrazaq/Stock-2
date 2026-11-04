# Catalyst/reclaim offline prototype

Implementation started 4 November 2026. Research hypothesis only; no edge claim,
production integration, provider request, Telegram delivery, collection or trades.
No existing file, holdings record, strategy gate or exit is modified.

## Implemented

`assessReclaim(input, policy)` is a pure function. It accepts supplied evidence and
caller-supplied proposed thresholds. A first completed regular-session bar defines
the opening range. A later completed bar must hold strictly above the opening low
and close below the opening high, with its high no higher than that opening high.
A subsequent completed close above the opening high is the reclaim. All supplied
bars must be consecutive, completed and timestamped. The quote must follow the
newest reclaim, pass freshness/spread/size checks and match the ticker. A failed or
unknown case returns a reason and no card. A passing case returns PAPER_SETUP_ONLY,
actionable=false, realDollars=0 and a paper decision card, never an execution fill.
Whole-share sizing reserves $3 entry commission; exit commission is disclosed but
no P&L is computed. ZAD YES is necessary here and never sufficient for live BUY.

## Deliberately unresolved

This is NOT the source message's complete strategy. Thresholds in tests are
synthetic proposals, not adopted settings. The opening-move/volume gate, contract
parser, currency/contingency checks, authoritative session calendar, security-ID
mapping, source acquisition, original contract-history search, controls and exit
simulator are not implemented. Verification flags and first-session binding are
assertions supplied by the caller; this module does not authenticate them. The
prior-volume and market-cap panels need upstream provenance validation. No
15%/35% stop combination, portfolio trim, baskets, options or automatic promotion
after 30 trades is adopted. Exit and invalidation text are explicitly supplied
research assumptions; the function neither resolves conflicting assumptions nor
executes them. Displayed quote size is not a guaranteed fill.

No assertion is made that all 744 ideas use one score. No software guarantees an
exit within a fixed distance of a stop: gaps and halts can prevent such fills.
The six-month SQ11 study remains independent. Existing operational approvals do
not authorize connecting this new hypothesis to production or collecting data.

## Validation and next integration boundary

Run `node --test test/catalyst-reclaim-prototype.test.mjs` from repository root.
19 offline synthetic cases pass, including stale/future/wrong-symbol prices,
missing catalyst evidence, materiality hindsight, missing session binding, invalid
bars, opening-low breach, no reclaim, insufficient size, expiry, ZAD and options.
Tests establish behavior only, not strategy returns. No repository-wide suite or
hosted CI result is claimed by this prototype publication.

Next: independent engineering review; freeze a complete unambiguous hypothesis,
including opening-move rule and exit precedence; then assess available retained
inputs and any separately approved acquisition. Keep production stop repairs
independent. No real-money admission follows merely from 30 observations or a
positive average.
