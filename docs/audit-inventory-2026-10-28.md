# Repository audit inventory — 28 October 2026

Baseline: `27259f8621e0145bfa5b7e0974e79e21ed35f590`. Static inventory only; a syntax pass or direct test reference does not establish behavioral correctness. No secrets, account contents or personal records are included.

## Scripts

All 204 root `.mjs` scripts passed `node --check` at inventory time. Modified modules were checked again before publication. Direct test references are an audit aid, not a coverage percentage.

| Script | Syntax | Direct test reference |
|---|---|---|
| `account-replay-core.mjs` | PASS | yes |
| `account-replay-lab.mjs` | PASS | not found |
| `agent-a-core.mjs` | PASS | yes |
| `agent-a-lab.mjs` | PASS | not found |
| `agent-a-tgt-core.mjs` | PASS | yes |
| `agent-a-tgt-lab.mjs` | PASS | not found |
| `alpaca-feed.mjs` | PASS | yes |
| `angles-core.mjs` | PASS | yes |
| `angles-lab.mjs` | PASS | yes |
| `anomaly-core.mjs` | PASS | yes |
| `anomaly-lab.mjs` | PASS | yes |
| `approved-quote-gate.mjs` | PASS | yes |
| `autolab.mjs` | PASS | not found |
| `blocked-runner-policy.mjs` | PASS | yes |
| `calendar.mjs` | PASS | not found |
| `catalyst-core.mjs` | PASS | yes |
| `catalyst-integrity.mjs` | PASS | yes |
| `catalyst-lab.mjs` | PASS | yes |
| `chain-core.mjs` | PASS | yes |
| `chain-decoder.mjs` | PASS | yes |
| `chain-ripple.mjs` | PASS | not found |
| `chains.mjs` | PASS | not found |
| `comeback-core.mjs` | PASS | yes |
| `comeback-lab.mjs` | PASS | not found |
| `confluence-core.mjs` | PASS | yes |
| `confluence-lab.mjs` | PASS | yes |
| `confluence-signals.mjs` | PASS | not found |
| `deals.mjs` | PASS | not found |
| `decoded-core.mjs` | PASS | yes |
| `decoded-lab.mjs` | PASS | yes |
| `decoded2-core.mjs` | PASS | yes |
| `discover.mjs` | PASS | not found |
| `discovery2-core.mjs` | PASS | yes |
| `discovery2.mjs` | PASS | yes |
| `e16-absorption.mjs` | PASS | not found |
| `early-alerts.mjs` | PASS | yes |
| `early-wave-discovery.mjs` | PASS | yes |
| `earnings-study.mjs` | PASS | yes |
| `edgar-feed.mjs` | PASS | yes |
| `event-orb-retest-bars.mjs` | PASS | not found |
| `event-orb-retest-core.mjs` | PASS | yes |
| `event-orb-retest-events.mjs` | PASS | not found |
| `event-orb-retest-gates.mjs` | PASS | not found |
| `event-orb-retest-library.mjs` | PASS | not found |
| `event-orb-retest-paper-ledger.mjs` | PASS | not found |
| `event-orb-retest-requests.mjs` | PASS | not found |
| `event-orb-retest-study.mjs` | PASS | not found |
| `events-study.mjs` | PASS | not found |
| `evidence-core.mjs` | PASS | not found |
| `ew-stack.mjs` | PASS | not found |
| `exits.mjs` | PASS | not found |
| `expert-core.mjs` | PASS | yes |
| `expert-lab.mjs` | PASS | yes |
| `expert-probe.mjs` | PASS | not found |
| `fastmover-lab.mjs` | PASS | yes |
| `first-run.mjs` | PASS | yes |
| `follow-lane.mjs` | PASS | yes |
| `fulfilling.mjs` | PASS | not found |
| `gov-awards.mjs` | PASS | not found |
| `gov-awards2.mjs` | PASS | not found |
| `health.mjs` | PASS | not found |
| `hold-core.mjs` | PASS | yes |
| `hold-lab.mjs` | PASS | not found |
| `horizons.mjs` | PASS | not found |
| `hunting-lab.mjs` | PASS | not found |
| `ignition-core.mjs` | PASS | yes |
| `ignition-gates.mjs` | PASS | yes |
| `ignition-paper.mjs` | PASS | yes |
| `ignition-watch.mjs` | PASS | yes |
| `insider-study.mjs` | PASS | not found |
| `intraday-radar.mjs` | PASS | not found |
| `leaders-study.mjs` | PASS | yes |
| `league-bar.mjs` | PASS | not found |
| `league.mjs` | PASS | not found |
| `library-merge.mjs` | PASS | not found |
| `live-refresh-universe.mjs` | PASS | yes |
| `macro-core.mjs` | PASS | yes |
| `macro-lab.mjs` | PASS | yes |
| `missed-runners.mjs` | PASS | not found |
| `ml-core.mjs` | PASS | yes |
| `ml-lab.mjs` | PASS | not found |
| `move-categories.mjs` | PASS | yes |
| `movers.mjs` | PASS | not found |
| `multi-angle-discovery.mjs` | PASS | yes |
| `news-watch.mjs` | PASS | not found |
| `octopus.mjs` | PASS | not found |
| `opp-mode.mjs` | PASS | yes |
| `opportunity-radar.mjs` | PASS | not found |
| `options-core.mjs` | PASS | yes |
| `options-lab.mjs` | PASS | yes |
| `options-survey.mjs` | PASS | not found |
| `orb-study.mjs` | PASS | not found |
| `paper-gates.mjs` | PASS | yes |
| `pattern-lab.mjs` | PASS | not found |
| `pre-ignition-discovery.mjs` | PASS | yes |
| `premarket-check.mjs` | PASS | not found |
| `quality.mjs` | PASS | yes |
| `radar-v3-core.mjs` | PASS | yes |
| `rank-models.mjs` | PASS | yes |
| `rebalance.mjs` | PASS | not found |
| `rebuy.mjs` | PASS | not found |
| `regime-gate.mjs` | PASS | not found |
| `research-core.mjs` | PASS | yes |
| `research-lab.mjs` | PASS | not found |
| `runner-hunter-core.mjs` | PASS | yes |
| `runner-hunter-study.mjs` | PASS | not found |
| `scan.mjs` | PASS | yes |
| `score-study.mjs` | PASS | not found |
| `scorecard-1023.mjs` | PASS | not found |
| `sec-time.mjs` | PASS | yes |
| `sequence-study.mjs` | PASS | not found |
| `session-coverage.mjs` | PASS | yes |
| `shadow-eval.mjs` | PASS | yes |
| `shadow-outcomes.mjs` | PASS | not found |
| `shadow-stream.mjs` | PASS | yes |
| `share-supply.mjs` | PASS | not found |
| `shares.mjs` | PASS | not found |
| `smart-money.mjs` | PASS | not found |
| `squad1-core.mjs` | PASS | yes |
| `squad1-lab.mjs` | PASS | yes |
| `squad10-core.mjs` | PASS | yes |
| `squad10-lab.mjs` | PASS | not found |
| `squad11-core.mjs` | PASS | yes |
| `squad11-lab.mjs` | PASS | not found |
| `squad12-core.mjs` | PASS | yes |
| `squad12-lab.mjs` | PASS | not found |
| `squad13-core.mjs` | PASS | yes |
| `squad13-lab.mjs` | PASS | yes |
| `squad14-core.mjs` | PASS | yes |
| `squad14-lab.mjs` | PASS | not found |
| `squad15-core.mjs` | PASS | yes |
| `squad15-lab.mjs` | PASS | not found |
| `squad15b-core.mjs` | PASS | yes |
| `squad15b-lab.mjs` | PASS | not found |
| `squad16-core.mjs` | PASS | yes |
| `squad16-lab.mjs` | PASS | not found |
| `squad17-core.mjs` | PASS | yes |
| `squad17-lab.mjs` | PASS | not found |
| `squad18-core.mjs` | PASS | yes |
| `squad18-lab.mjs` | PASS | not found |
| `squad19-core.mjs` | PASS | yes |
| `squad19-lab.mjs` | PASS | not found |
| `squad2-core.mjs` | PASS | yes |
| `squad2-lab.mjs` | PASS | not found |
| `squad20-core.mjs` | PASS | yes |
| `squad20-lab.mjs` | PASS | not found |
| `squad21-core.mjs` | PASS | yes |
| `squad21-lab.mjs` | PASS | not found |
| `squad22-core.mjs` | PASS | yes |
| `squad22-lab.mjs` | PASS | not found |
| `squad23-core.mjs` | PASS | yes |
| `squad23-lab.mjs` | PASS | not found |
| `squad24-audit-core.mjs` | PASS | yes |
| `squad24-audit-extract.mjs` | PASS | not found |
| `squad24-audit-label.mjs` | PASS | not found |
| `squad24-core.mjs` | PASS | yes |
| `squad24-lab.mjs` | PASS | not found |
| `squad25-audit-core.mjs` | PASS | yes |
| `squad25-core.mjs` | PASS | yes |
| `squad25-lab.mjs` | PASS | not found |
| `squad26-core.mjs` | PASS | yes |
| `squad26-lab.mjs` | PASS | not found |
| `squad26-labels.mjs` | PASS | not found |
| `squad26-watch.mjs` | PASS | not found |
| `squad27-core.mjs` | PASS | yes |
| `squad27-lab.mjs` | PASS | not found |
| `squad28-core.mjs` | PASS | yes |
| `squad28-lab.mjs` | PASS | not found |
| `squad29-core.mjs` | PASS | yes |
| `squad29-lab.mjs` | PASS | not found |
| `squad3-core.mjs` | PASS | yes |
| `squad3-lab.mjs` | PASS | yes |
| `squad4-core.mjs` | PASS | yes |
| `squad4-lab.mjs` | PASS | yes |
| `squad5-core.mjs` | PASS | yes |
| `squad5-lab.mjs` | PASS | not found |
| `squad6-core.mjs` | PASS | yes |
| `squad6-lab.mjs` | PASS | not found |
| `squad7-core.mjs` | PASS | yes |
| `squad7-lab.mjs` | PASS | yes |
| `squad8-core.mjs` | PASS | yes |
| `squad8-lab.mjs` | PASS | yes |
| `squad9-core.mjs` | PASS | yes |
| `squad9-lab.mjs` | PASS | not found |
| `stop-watch.mjs` | PASS | yes |
| `stops.mjs` | PASS | not found |
| `swing-lab.mjs` | PASS | not found |
| `telegram-delivery.mjs` | PASS | yes |
| `tip-score.mjs` | PASS | not found |
| `tip-sources.mjs` | PASS | not found |
| `tipranks.mjs` | PASS | not found |
| `tipster-core.mjs` | PASS | yes |
| `tipster-lab.mjs` | PASS | yes |
| `trade-plan.mjs` | PASS | yes |
| `value-core.mjs` | PASS | yes |
| `value-lab.mjs` | PASS | not found |
| `verify-core.mjs` | PASS | yes |
| `verify-lab.mjs` | PASS | not found |
| `watcher-guard-core.mjs` | PASS | yes |
| `watcher-guard.mjs` | PASS | not found |
| `winners-autopsy-core.mjs` | PASS | yes |
| `winners-autopsy-lab.mjs` | PASS | yes |
| `winners-study.mjs` | PASS | not found |
| `yardstick.mjs` | PASS | yes |

## Workflows

All 78 workflow YAML files parsed with PyYAML BaseLoader (preserves the `on` key). This is not an Actions schema/actionlint validation. 72 explicitly check out main; dispatching those from a development branch does not test development code. No workflow was dispatched. 71 request contents write; each requires path/write-scope review. Explicit `shell: bash` supplies pipefail in GitHub Actions, so a raw text search alone cannot establish masked pipeline errors.

| Workflow | Hardcoded main checkout | Contents write |
|---|---|---|
| `.github/workflows/Smart-money.yml` | yes | yes |
| `.github/workflows/Tiprank.yml` | yes | no |
| `.github/workflows/account-replay.yml` | yes | yes |
| `.github/workflows/agent-a-lab.yml` | yes | yes |
| `.github/workflows/agent-a-tgt-lab.yml` | yes | yes |
| `.github/workflows/angles-lab.yml` | yes | yes |
| `.github/workflows/anomaly-lab.yml` | yes | yes |
| `.github/workflows/bot.yml` | yes | yes |
| `.github/workflows/calendar.yml` | yes | yes |
| `.github/workflows/catalyst-lab.yml` | yes | yes |
| `.github/workflows/chain-decoder.yml` | yes | yes |
| `.github/workflows/comeback.yml` | yes | yes |
| `.github/workflows/confluence-lab.yml` | yes | yes |
| `.github/workflows/deals.yml` | yes | yes |
| `.github/workflows/decoded-lab.yml` | yes | yes |
| `.github/workflows/discover.yml` | yes | yes |
| `.github/workflows/discovery2.yml` | yes | yes |
| `.github/workflows/event-orb-retest-research.yml` | no | yes |
| `.github/workflows/expert-lab.yml` | yes | yes |
| `.github/workflows/fastmover-intraday.yml` | yes | yes |
| `.github/workflows/feed-check.yml` | no | no |
| `.github/workflows/follow-lane.yml` | yes | yes |
| `.github/workflows/hold-lab.yml` | yes | yes |
| `.github/workflows/ignition.yml` | yes | yes |
| `.github/workflows/intraday-radar.yml` | yes | yes |
| `.github/workflows/leaders-study.yml` | yes | yes |
| `.github/workflows/macro-lab.yml` | yes | yes |
| `.github/workflows/main.yml` | yes | yes |
| `.github/workflows/ml-lab.yml` | yes | yes |
| `.github/workflows/movers.yml` | yes | yes |
| `.github/workflows/news.yml` | yes | yes |
| `.github/workflows/opportunity-radar.yml` | yes | yes |
| `.github/workflows/options-lab.yml` | yes | yes |
| `.github/workflows/options-survey.yml` | yes | yes |
| `.github/workflows/pages.yml` | no | no |
| `.github/workflows/premarket.yml` | yes | no |
| `.github/workflows/private-data-check.yml` | yes | no |
| `.github/workflows/research-lab.yml` | yes | yes |
| `.github/workflows/scorecard-1023.yml` | yes | yes |
| `.github/workflows/squad1-lab.yml` | yes | yes |
| `.github/workflows/squad10-lab.yml` | yes | yes |
| `.github/workflows/squad11-lab.yml` | yes | yes |
| `.github/workflows/squad12-lab.yml` | yes | yes |
| `.github/workflows/squad13-lab.yml` | yes | yes |
| `.github/workflows/squad14-lab.yml` | yes | yes |
| `.github/workflows/squad15-lab.yml` | yes | yes |
| `.github/workflows/squad15b-lab.yml` | yes | yes |
| `.github/workflows/squad16-lab.yml` | yes | yes |
| `.github/workflows/squad17-lab.yml` | yes | yes |
| `.github/workflows/squad18-lab.yml` | yes | yes |
| `.github/workflows/squad19-lab.yml` | no | yes |
| `.github/workflows/squad2-lab.yml` | yes | yes |
| `.github/workflows/squad20-lab.yml` | yes | yes |
| `.github/workflows/squad21-lab.yml` | yes | yes |
| `.github/workflows/squad22-lab.yml` | yes | yes |
| `.github/workflows/squad23-lab.yml` | yes | yes |
| `.github/workflows/squad24-audit.yml` | yes | yes |
| `.github/workflows/squad24-lab.yml` | yes | yes |
| `.github/workflows/squad25-lab.yml` | yes | yes |
| `.github/workflows/squad26-lab.yml` | yes | yes |
| `.github/workflows/squad26-labels.yml` | yes | yes |
| `.github/workflows/squad26-watch.yml` | yes | yes |
| `.github/workflows/squad27-lab.yml` | yes | yes |
| `.github/workflows/squad28-lab.yml` | yes | yes |
| `.github/workflows/squad29-lab.yml` | yes | yes |
| `.github/workflows/squad3-lab.yml` | yes | yes |
| `.github/workflows/squad4-lab.yml` | yes | yes |
| `.github/workflows/squad5-lab.yml` | yes | yes |
| `.github/workflows/squad6-lab.yml` | yes | yes |
| `.github/workflows/squad7-lab.yml` | yes | yes |
| `.github/workflows/squad8-lab.yml` | yes | yes |
| `.github/workflows/squad9-lab.yml` | yes | yes |
| `.github/workflows/stock2-safety-ci.yml` | no | no |
| `.github/workflows/tests.yml` | no | no |
| `.github/workflows/tipster-lab.yml` | yes | yes |
| `.github/workflows/value-lab.yml` | yes | yes |
| `.github/workflows/verify-lab.yml` | yes | yes |
| `.github/workflows/winners-autopsy.yml` | yes | yes |

## Market-data endpoint inventory

Literal HTTPS hostnames in root scripts; includes links, documentation and test/config defaults as well as actual requests. Access, licensing, timeliness and point-in-time availability are not inferred.

| Host | Referencing scripts |
|---|---|
| `acfr.aut.ac.nz` | `angles-core.mjs` |
| `actionalerts.substack.com` | `follow-lane.mjs` |
| `alphaarchitect.com` | `agent-a-tgt-core.mjs`, `squad1-core.mjs`, `squad16-core.mjs`, `squad6-core.mjs` |
| `apewisdom.io` | `scan.mjs` |
| `api.fda.gov` | `events-study.mjs` |
| `api.finra.org` | `anomaly-lab.mjs`, `squad1-lab.mjs` |
| `api.github.com` | `watcher-guard.mjs` |
| `api.halalterminal.com` | `scan.mjs` |
| `api.massive.com` | `account-replay-lab.mjs`, `agent-a-lab.mjs`, `agent-a-tgt-lab.mjs`, `angles-lab.mjs`, `anomaly-lab.mjs`, `calendar.mjs`, `catalyst-lab.mjs`, `chain-decoder.mjs`, `comeback-lab.mjs`, `confluence-lab.mjs`, `deals.mjs`, `decoded-lab.mjs`, `discover.mjs`, `event-orb-retest-bars.mjs`, `expert-lab.mjs`, `expert-probe.mjs`, `fastmover-lab.mjs`, `follow-lane.mjs`, `hold-lab.mjs`, `ignition-watch.mjs`, `leaders-study.mjs`, `macro-lab.mjs`, `missed-runners.mjs`, `ml-lab.mjs`, `movers.mjs`, `orb-study.mjs`, `research-lab.mjs`, `scan.mjs`, `scorecard-1023.mjs`, `sequence-study.mjs`, `smart-money.mjs`, `squad1-lab.mjs`, `squad10-lab.mjs`, `squad11-lab.mjs`, `squad12-lab.mjs`, `squad13-lab.mjs`, `squad14-lab.mjs`, `squad16-lab.mjs`, `squad17-lab.mjs`, `squad18-lab.mjs`, `squad19-lab.mjs`, `squad2-lab.mjs`, `squad20-lab.mjs`, `squad21-lab.mjs`, `squad22-lab.mjs`, `squad23-lab.mjs`, `squad24-lab.mjs`, `squad25-lab.mjs`, `squad27-lab.mjs`, `squad28-lab.mjs`, `squad29-lab.mjs`, `squad3-lab.mjs`, `squad4-lab.mjs`, `squad5-lab.mjs`, `squad6-lab.mjs`, `squad7-lab.mjs`, `squad8-lab.mjs`, `squad9-lab.mjs`, `tipster-lab.mjs`, `value-lab.mjs`, `verify-lab.mjs`, `winners-autopsy-lab.mjs` |
| `api.nasdaq.com` | `agent-a-lab.mjs`, `angles-lab.mjs`, `anomaly-lab.mjs`, `hold-lab.mjs`, `macro-lab.mjs`, `squad10-lab.mjs`, `squad17-lab.mjs`, `squad23-lab.mjs`, `squad28-lab.mjs`, `squad4-lab.mjs`, `squad5-lab.mjs`, `squad7-lab.mjs`, `tipster-lab.mjs`, `winners-autopsy-lab.mjs` |
| `api.openfigi.com` | `expert-probe.mjs` |
| `api.polygon.io` | `deals.mjs`, `discover.mjs`, `movers.mjs`, `scan.mjs`, `smart-money.mjs` |
| `api.stocktwits.com` | `follow-lane.mjs` |
| `api.telegram.org` | `autolab.mjs`, `deals.mjs`, `discover.mjs`, `earnings-study.mjs`, `events-study.mjs`, `exits.mjs`, `fastmover-lab.mjs`, `health.mjs`, `horizons.mjs`, `hunting-lab.mjs`, `ignition-watch.mjs`, `intraday-radar.mjs`, `leaders-study.mjs`, `movers.mjs`, `news-watch.mjs`, `octopus.mjs`, `opportunity-radar.mjs`, `premarket-check.mjs`, `quality.mjs`, `rebalance.mjs`, `rebuy.mjs`, `scan.mjs`, `score-study.mjs`, `smart-money.mjs`, `stops.mjs`, `telegram-delivery.mjs`, `tipranks.mjs`, `watcher-guard.mjs`, `winners-study.mjs` |
| `api.twelvedata.com` | `regime-gate.mjs`, `scan.mjs`, `tipranks.mjs` |
| `api.usaspending.gov` | `gov-awards.mjs`, `gov-awards2.mjs` |
| `api.zoya.finance` | `scan.mjs` |
| `arkfunds.io` | `tip-sources.mjs` |
| `astuteinvestor.substack.com` | `follow-lane.mjs` |
| `blusuitdillon.substack.com` | `follow-lane.mjs` |
| `clinicaltrials.gov` | `discover.mjs`, `scan.mjs` |
| `cockneyrebel.substack.com` | `follow-lane.mjs` |
| `completetradersedge.com` | `squad2-core.mjs` |
| `data.alpaca.markets` | `ignition-watch.mjs`, `opportunity-radar.mjs`, `options-lab.mjs`, `options-survey.mjs`, `premarket-check.mjs`, `scan.mjs`, `scorecard-1023.mjs`, `shadow-outcomes.mjs`, `squad15-lab.mjs`, `squad15b-lab.mjs`, `squad19-lab.mjs`, `squad2-lab.mjs`, `squad24-lab.mjs`, `squad25-lab.mjs`, `squad26-core.mjs`, `squad26-lab.mjs`, `squad26-watch.mjs`, `squad27-core.mjs`, `squad27-lab.mjs` |
| `data.sec.gov` | `angles-lab.mjs`, `anomaly-lab.mjs`, `chain-decoder.mjs`, `discover.mjs`, `event-orb-retest-events.mjs`, `events-study.mjs`, `expert-lab.mjs`, `follow-lane.mjs`, `ignition-watch.mjs`, `quality.mjs`, `research-lab.mjs`, `scan.mjs`, `shares.mjs`, `squad10-lab.mjs`, `squad11-lab.mjs`, `squad12-lab.mjs`, `squad13-lab.mjs`, `squad14-lab.mjs`, `squad16-lab.mjs`, `squad17-lab.mjs`, `squad18-lab.mjs`, `squad19-lab.mjs`, `squad20-lab.mjs`, `squad21-lab.mjs`, `squad22-lab.mjs`, `squad23-lab.mjs`, `squad25-lab.mjs`, `squad28-lab.mjs`, `squad29-core.mjs`, `squad29-lab.mjs`, `squad4-lab.mjs`, `squad5-lab.mjs`, `tipster-lab.mjs`, `value-lab.mjs`, `verify-lab.mjs`, `winners-autopsy-lab.mjs` |
| `doi.org` | `angles-core.mjs`, `anomaly-core.mjs`, `macro-core.mjs`, `research-core.mjs`, `squad1-core.mjs`, `squad12-core.mjs`, `squad13-core.mjs`, `squad20-core.mjs`, `squad21-core.mjs`, `squad22-core.mjs`, `squad28-core.mjs`, `squad8-core.mjs` |
| `efts.sec.gov` | `catalyst-lab.mjs`, `chain-decoder.mjs`, `squad1-lab.mjs`, `squad12-lab.mjs`, `squad19-lab.mjs`, `squad21-core.mjs`, `squad21-lab.mjs`, `squad24-core.mjs`, `squad24-lab.mjs`, `squad26-core.mjs`, `squad26-lab.mjs`, `squad28-lab.mjs`, `squad29-core.mjs`, `squad29-lab.mjs`, `verify-lab.mjs` |
| `en.wikipedia.org` | `macro-core.mjs` |
| `experts.illinois.edu` | `anomaly-core.mjs` |
| `financialmodelingprep.com` | `discover.mjs`, `earnings-study.mjs`, `expert-lab.mjs`, `expert-probe.mjs`, `scan.mjs`, `smart-money.mjs` |
| `finnhub.io` | `deals.mjs`, `discover.mjs`, `earnings-study.mjs`, `expert-probe.mjs`, `ignition-watch.mjs`, `intraday-radar.mjs`, `movers.mjs`, `news-watch.mjs`, `scan.mjs`, `smart-money.mjs`, `squad1-lab.mjs`, `squad26-watch.mjs` |
| `funds.alphaarchitect.com` | `squad6-core.mjs` |
| `gvwire.com` | `macro-core.mjs` |
| `halalscreener.app` | `scan.mjs` |
| `ideas.repec.org` | `angles-core.mjs`, `anomaly-core.mjs`, `macro-core.mjs`, `research-core.mjs`, `squad1-core.mjs`, `squad12-core.mjs`, `squad28-core.mjs`, `squad8-core.mjs` |
| `in.benzinga.com` | `macro-core.mjs` |
| `it.tradingview.com` | `squad6-core.mjs` |
| `mcp.tipranks.com` | `calendar.mjs`, `expert-probe.mjs`, `tipranks.mjs` |
| `moneymachinenewsletter.substack.com` | `follow-lane.mjs` |
| `onlinelibrary.wiley.com` | `research-core.mjs` |
| `paper-api.alpaca.markets` | `options-lab.mjs`, `scan.mjs`, `squad15-lab.mjs`, `squad15b-lab.mjs` |
| `papers.ssrn.com` | `research-core.mjs`, `squad2-core.mjs`, `squad8-core.mjs` |
| `personal.lse.ac.uk` | `anomaly-core.mjs`, `squad8-core.mjs` |
| `public-api.etoro.com` | `expert-lab.mjs` |
| `public.api.bsky.app` | `follow-lane.mjs` |
| `quantifiedstrategies.substack.com` | `squad16-core.mjs` |
| `quantpedia.com` | `squad16-core.mjs` |
| `rationalreminder.ca` | `squad16-core.mjs` |
| `repec.cepr.org` | `squad8-core.mjs` |
| `sandbox-api.zoya.finance` | `scan.mjs` |
| `smartstocksnewsletter.substack.com` | `follow-lane.mjs` |
| `ssrn.com` | `anomaly-core.mjs`, `squad12-core.mjs` |
| `stockpicking.substack.com` | `follow-lane.mjs` |
| `stocktwits.com` | `follow-lane.mjs` |
| `thepatternsite.com` | `squad2-core.mjs` |
| `topstockstrader.substack.com` | `follow-lane.mjs` |
| `tradingsetupsreview.com` | `squad2-core.mjs` |
| `usethinkscript.com` | `squad6-core.mjs` |
| `wl6.wealth-lab.com` | `squad6-core.mjs` |
| `www.allsides.com` | `macro-core.mjs` |
| `www.alphatrends.net` | `squad2-core.mjs` |
| `www.alphavantage.co` | `calendar.mjs`, `discover.mjs`, `earnings-study.mjs`, `expert-probe.mjs`, `follow-lane.mjs`, `squad17-lab.mjs` |
| `www.amazon.com` | `squad6-core.mjs` |
| `www.bls.gov` | `calendar.mjs` |
| `www.bnnbloomberg.ca` | `squad24-lab.mjs` |
| `www.cxoadvisory.com` | `agent-a-tgt-core.mjs` |
| `www.dimensional.com` | `angles-core.mjs` |
| `www.ecfr.gov` | `squad27-core.mjs` |
| `www.emeraldinsight.com` | `macro-core.mjs` |
| `www.etfstrategy.com` | `squad16-core.mjs` |
| `www.etftrends.com` | `macro-core.mjs` |
| `www.evidenceinvestor.com` | `macro-core.mjs` |
| `www.federalreserve.gov` | `calendar.mjs`, `macro-core.mjs` |
| `www.financialwisdomtv.com` | `squad2-core.mjs` |
| `www.followingthetrend.com` | `squad6-core.mjs` |
| `www.fool.com` | `macro-core.mjs` |
| `www.googleapis.com` | `follow-lane.mjs`, `scan.mjs` |
| `www.innovatoretfs.com` | `squad16-core.mjs` |
| `www.investopedia.com` | `squad13-core.mjs`, `squad2-core.mjs`, `squad8-core.mjs` |
| `www.investors.com` | `squad13-core.mjs` |
| `www.johnhcochrane.com` | `research-core.mjs`, `squad16-core.mjs` |
| `www.joim.com` | `anomaly-core.mjs` |
| `www.jstor.org` | `anomaly-core.mjs`, `squad12-core.mjs`, `squad22-core.mjs` |
| `www.kjtradingsystems.com` | `squad16-core.mjs` |
| `www.luxalgo.com` | `angles-core.mjs` |
| `www.magicformulainvesting.com` | `squad16-core.mjs` |
| `www.msci.com` | `squad16-core.mjs`, `squad6-core.mjs` |
| `www.nasdaq.com` | `agent-a-lab.mjs`, `angles-core.mjs`, `angles-lab.mjs`, `anomaly-lab.mjs`, `hold-lab.mjs`, `macro-lab.mjs`, `squad10-lab.mjs`, `squad17-lab.mjs`, `squad23-lab.mjs`, `squad28-lab.mjs`, `squad4-lab.mjs`, `squad5-lab.mjs`, `squad7-lab.mjs`, `tipster-lab.mjs`, `winners-autopsy-lab.mjs` |
| `www.nber.org` | `anomaly-core.mjs`, `research-core.mjs`, `squad1-core.mjs` |
| `www.opb.org` | `macro-core.mjs` |
| `www.openassetpricing.com` | `anomaly-core.mjs` |
| `www.optimalmomentum.com` | `squad16-core.mjs` |
| `www.quant-investing.com` | `squad16-core.mjs` |
| `www.quantconnect.com` | `squad6-core.mjs` |
| `www.quantrocket.com` | `squad16-core.mjs` |
| `www.schaeffersresearch.com` | `macro-core.mjs` |
| `www.sec.gov` | `angles-lab.mjs`, `anomaly-lab.mjs`, `catalyst-lab.mjs`, `chain-decoder.mjs`, `discover.mjs`, `discovery2.mjs`, `event-orb-retest-events.mjs`, `events-study.mjs`, `expert-lab.mjs`, `expert-probe.mjs`, `follow-lane.mjs`, `gov-awards.mjs`, `gov-awards2.mjs`, `ignition-watch.mjs`, `insider-study.mjs`, `research-lab.mjs`, `scan.mjs`, `share-supply.mjs`, `shares.mjs`, `squad1-lab.mjs`, `squad10-lab.mjs`, `squad11-lab.mjs`, `squad12-lab.mjs`, `squad14-lab.mjs`, `squad16-lab.mjs`, `squad17-lab.mjs`, `squad18-lab.mjs`, `squad20-lab.mjs`, `squad21-core.mjs`, `squad21-lab.mjs`, `squad22-lab.mjs`, `squad23-lab.mjs`, `squad24-audit-extract.mjs`, `squad24-core.mjs`, `squad24-lab.mjs`, `squad25-core.mjs`, `squad25-lab.mjs`, `squad26-lab.mjs`, `squad26-labels.mjs`, `squad26-watch.mjs`, `squad27-core.mjs`, `squad27-lab.mjs`, `squad28-lab.mjs`, `squad29-core.mjs`, `squad29-lab.mjs`, `squad4-lab.mjs`, `squad5-lab.mjs`, `squad8-lab.mjs`, `tipster-lab.mjs`, `value-lab.mjs`, `verify-lab.mjs`, `winners-autopsy-lab.mjs` |
| `www.smbtraining.com` | `squad16-core.mjs` |
| `www.thechartist.com.au` | `squad6-core.mjs` |
| `www.tradertom.com` | `squad16-core.mjs` |
| `www.tradingmarkets.com` | `squad6-core.mjs` |
| `www.tradingview.com` | `squad16-core.mjs` |
| `www.validea.com` | `squad16-core.mjs` |
| `www.warriortrading.com` | `squad2-core.mjs` |
| `www.wiley.com` | `squad6-core.mjs` |
| `www.youtube.com` | `follow-lane.mjs`, `scan.mjs`, `squad9-core.mjs` |
| `www.zacks.com` | `squad16-core.mjs` |
| `youtube.com` | `squad9-lab.mjs` |
