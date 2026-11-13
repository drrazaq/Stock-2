# Public-pass input/source map (P0 Route A, 13 Nov 2026)

Generated from the actual scanner read closure (scan.mjs and its local imports: literal data/ paths, J() reads, and the lab loops <lab>-lab.json / <lab>-today.json). Code: scan-passes.mjs PUBLIC_SEEDS, SCAN_OUTPUTS, seedClass, CODE_COPY. Only DECLARED_PUBLIC and manifest-verified SCAN_OUTPUT inputs enter the public sandbox; every other input is quarantined from it (the private pass keeps the full real state). A producer is the workflow that commits the file plus every module it runs (local import closure); owner state = any private-listed file, data/private-*, private.enc, the hydrating signals reader, or the owner quiet setting. A runtime producer can be declared public only when that closure AND every data file it reads are declared public (transitive); none qualifies yet.

Code copy into each sandbox: root *.mjs/*.js/*.cjs, index.html (the scanner's logic block, read only), watchlist.txt. Nothing else (no docs, logs, run triggers, tools, tests, .github).

| input (data/) | class | basis |
|---|---|---|
| chains.json | DECLARED_PUBLIC | REFERENCE: hand-maintained in git; no module or workflow writes it |
| zad-list.json | DECLARED_PUBLIC | REFERENCE: hand-maintained in git; no module or workflow writes it |
| actions-sells.json | PRIVATE |  |
| alpaca-paper.json | PRIVATE |  |
| basket-state.json | PRIVATE |  |
| halal.json | PRIVATE |  |
| leaderdip-ledger.jsonl | PRIVATE |  |
| market-calls.jsonl | PRIVATE |  |
| my-positions.json | PRIVATE |  |
| my-trades.jsonl | PRIVATE |  |
| opinions.jsonl | PRIVATE |  |
| private-signals.json | PRIVATE |  |
| private.enc | PRIVATE |  |
| scan-report.txt | PRIVATE |  |
| sell-notices.jsonl | PRIVATE |  |
| settings.json | PRIVATE |  |
| signals-private.json | PRIVATE |  |
| tips.jsonl | PRIVATE |  |
| watch-extra.json | PRIVATE |  |
| agent-a-lab.json | QUARANTINED: owner-derived producer | publishing workflow agent-a-lab.yml, leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, catalyst-lab.mjs (+20) |
| agent-league.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| angles-lab.json | QUARANTINED: owner-derived producer | publishing workflow angles-lab.yml runs a module reading owner state: angles-lab.mjs |
| angles-today.json | QUARANTINED: owner-derived producer | publishing workflow angles-lab.yml runs a module reading owner state: angles-lab.mjs |
| anomaly-lab.json | QUARANTINED: owner-derived producer | publishing workflow anomaly-lab.yml runs a module reading owner state: anomaly-lab.mjs |
| anomaly-today.json | QUARANTINED: owner-derived producer | publishing workflow anomaly-lab.yml runs a module reading owner state: anomaly-lab.mjs |
| autolab.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| calendar.enc | QUARANTINED: owner-derived producer | publishing workflow calendar.yml, leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| catalyst-lab.json | QUARANTINED: owner-derived producer | publishing workflow catalyst-lab.yml, leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| catalyst-today.json | QUARANTINED: owner-derived producer | publishing workflow catalyst-lab.yml, leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| chain-ripple.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| chain-today.json | QUARANTINED: owner-derived producer | publishing workflow chain-decoder.yml, leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, agent-a-lab.mjs, catalyst-lab.mjs (+20) |
| chains-status.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| confluence-lab.json | QUARANTINED: owner-derived producer | publishing workflow confluence-lab.yml runs a module reading owner state: confluence-lab.mjs |
| confluence-today.json | QUARANTINED: owner-derived producer | publishing workflow confluence-lab.yml runs a module reading owner state: confluence-lab.mjs |
| decoded-check.json | QUARANTINED: owner-derived producer | publishing workflow decoded-lab.yml runs a module reading owner state: decoded-lab.mjs |
| decoded-history.json | QUARANTINED: owner-derived producer | publishing workflow decoded-lab.yml runs a module reading owner state: decoded-lab.mjs |
| decoded-today.json | QUARANTINED: owner-derived producer | publishing workflow decoded-lab.yml runs a module reading owner state: decoded-lab.mjs |
| discovery2-today.json | QUARANTINED: owner-derived producer | publishing workflow discovery2.yml, leaders-study.yml runs a module reading owner state: league.mjs, chain-decoder.mjs, agent-a-lab.mjs, catalyst-lab.mjs (+20) |
| earnings-cache.json.gz | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| earnings-study.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| events-study.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| exits.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| expert-lab.json | QUARANTINED: owner-derived producer | publishing workflow expert-lab.yml runs a module reading owner state: expert-lab.mjs |
| expert-today.json | QUARANTINED: owner-derived producer | publishing workflow expert-lab.yml runs a module reading owner state: expert-lab.mjs |
| fastmover-lab.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| follow-board.json | QUARANTINED: owner-derived producer | publishing workflow follow-lane.yml runs a module reading owner state: follow-lane.mjs |
| follow-fade.json | QUARANTINED: owner-derived producer | publishing workflow follow-lane.yml runs a module reading owner state: follow-lane.mjs |
| follow-today.json | QUARANTINED: owner-derived producer | publishing workflow follow-lane.yml runs a module reading owner state: follow-lane.mjs |
| health.json | QUARANTINED: owner-derived producer | publishing workflow calendar.yml runs a module reading owner state: calendar.mjs |
| horizons.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| hunting-lab.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| ignition-days.jsonl | QUARANTINED: owner-derived producer | publishing workflow ignition.yml runs a module reading owner state: ignition-watch.mjs, opp-mode.mjs, notify-route.mjs |
| ignition-lab.json | QUARANTINED: owner-derived producer | publishing workflow fastmover-intraday.yml runs a module reading owner state: fastmover-lab.mjs, notify-route.mjs |
| ignition-live.json | QUARANTINED: owner-derived producer | publishing workflow ignition.yml runs a module reading owner state: ignition-watch.mjs, opp-mode.mjs, notify-route.mjs |
| insider-study.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| leaders-study.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| macro-lab.json | QUARANTINED: owner-derived producer | publishing workflow macro-lab.yml runs a module reading owner state: macro-lab.mjs, macro-core.mjs |
| macro-log.jsonl | QUARANTINED: owner-derived producer | publishing workflow news.yml runs a module reading owner state: news-watch.mjs, signals-read.mjs, notify-route.mjs |
| macro-today.json | QUARANTINED: owner-derived producer | publishing workflow macro-lab.yml runs a module reading owner state: macro-lab.mjs, macro-core.mjs |
| ml-lab.json | QUARANTINED: owner-derived producer | publishing workflow ml-lab.yml runs a module reading owner state: ml-lab.mjs |
| ml-today.json | QUARANTINED: owner-derived producer | publishing workflow ml-lab.yml runs a module reading owner state: ml-lab.mjs |
| news-log.jsonl | QUARANTINED: owner-derived producer | publishing workflow news.yml runs a module reading owner state: news-watch.mjs, signals-read.mjs, notify-route.mjs |
| octopus-paper.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| octopus.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| options-lab.json | QUARANTINED: owner-derived producer | publishing workflow options-lab.yml runs a module reading owner state: quality.mjs |
| quality.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| rebalance.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| rebuy.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| research-lab.json | QUARANTINED: owner-derived producer | publishing workflow research-lab.yml runs a module reading owner state: research-lab.mjs |
| research-today.json | QUARANTINED: owner-derived producer | publishing workflow research-lab.yml runs a module reading owner state: research-lab.mjs |
| score-study.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| sequence-study.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| share-supply.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| shares.json.gz | QUARANTINED: owner-derived producer | publishing workflow calendar.yml, leaders-study.yml, research-lab.yml runs a module reading owner state: research-lab.mjs, league.mjs, discovery2.mjs, chain-decoder.mjs (+21) |
| splits.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| squad1-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad1-lab.yml runs a module reading owner state: squad1-lab.mjs |
| squad1-today.json | QUARANTINED: owner-derived producer | publishing workflow squad1-lab.yml runs a module reading owner state: squad1-lab.mjs |
| squad10-today.json | QUARANTINED: owner-derived producer | publishing workflow squad10-lab.yml runs a module reading owner state: squad10-lab.mjs, squad10-core.mjs, squad5-core.mjs |
| squad11-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad11-lab.yml runs a module reading owner state: squad5-core.mjs |
| squad11-today.json | QUARANTINED: owner-derived producer | publishing workflow squad11-lab.yml runs a module reading owner state: squad5-core.mjs |
| squad12-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad12-lab.yml runs a module reading owner state: squad12-lab.mjs, squad5-core.mjs |
| squad12-today.json | QUARANTINED: owner-derived producer | publishing workflow squad12-lab.yml runs a module reading owner state: squad12-lab.mjs, squad5-core.mjs |
| squad13-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad13-lab.yml runs a module reading owner state: squad13-lab.mjs |
| squad13-today.json | QUARANTINED: owner-derived producer | publishing workflow squad13-lab.yml runs a module reading owner state: squad13-lab.mjs |
| squad14-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad14-lab.yml runs a module reading owner state: squad14-lab.mjs, squad5-core.mjs |
| squad14-today.json | QUARANTINED: owner-derived producer | publishing workflow squad14-lab.yml runs a module reading owner state: squad14-lab.mjs, squad5-core.mjs |
| squad15b-board.json | QUARANTINED: owner-derived producer | publishing workflow squad15b-lab.yml runs a module reading owner state: squad15b-lab.mjs, squad15b-core.mjs |
| squad16-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad16-lab.yml runs a module reading owner state: squad16-lab.mjs, squad10-core.mjs, squad5-core.mjs |
| squad16-today.json | QUARANTINED: owner-derived producer | publishing workflow squad16-lab.yml runs a module reading owner state: squad16-lab.mjs, squad10-core.mjs, squad5-core.mjs |
| squad17-today.json | QUARANTINED: owner-derived producer | publishing workflow squad17-lab.yml runs a module reading owner state: squad17-lab.mjs, squad10-core.mjs, squad5-core.mjs |
| squad18-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad18-lab.yml runs a module reading owner state: squad18-lab.mjs, squad10-core.mjs, squad5-core.mjs |
| squad18-today.json | QUARANTINED: owner-derived producer | publishing workflow squad18-lab.yml runs a module reading owner state: squad18-lab.mjs, squad10-core.mjs, squad5-core.mjs |
| squad2-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad2-lab.yml runs a module reading owner state: squad2-lab.mjs |
| squad2-today.json | QUARANTINED: owner-derived producer | publishing workflow squad2-lab.yml runs a module reading owner state: squad2-lab.mjs |
| squad20-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad20-lab.yml runs a module reading owner state: squad20-lab.mjs, squad5-core.mjs |
| squad20-today.json | QUARANTINED: owner-derived producer | publishing workflow squad20-lab.yml runs a module reading owner state: squad20-lab.mjs, squad5-core.mjs |
| squad21-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad21-lab.yml runs a module reading owner state: squad21-lab.mjs |
| squad21-today.json | QUARANTINED: owner-derived producer | publishing workflow squad21-lab.yml runs a module reading owner state: squad21-lab.mjs |
| squad22-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad22-lab.yml runs a module reading owner state: squad22-lab.mjs |
| squad22-today.json | QUARANTINED: owner-derived producer | publishing workflow squad22-lab.yml runs a module reading owner state: squad22-lab.mjs |
| squad24-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad24-lab.yml runs a module reading owner state: squad24-lab.mjs |
| squad24-today.json | QUARANTINED: owner-derived producer | publishing workflow squad24-lab.yml runs a module reading owner state: squad24-lab.mjs |
| squad25-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad25-lab.yml runs a module reading owner state: squad25-lab.mjs |
| squad25-today.json | QUARANTINED: owner-derived producer | publishing workflow squad25-lab.yml runs a module reading owner state: squad25-lab.mjs |
| squad28-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad28-lab.yml runs a module reading owner state: squad28-lab.mjs |
| squad28-today.json | QUARANTINED: owner-derived producer | publishing workflow squad28-lab.yml runs a module reading owner state: squad28-lab.mjs |
| squad29-flags-today.json | QUARANTINED: owner-derived producer | publishing workflow squad29-lab.yml runs a module reading owner state: squad29-lab.mjs, squad29-core.mjs |
| squad29-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad29-lab.yml runs a module reading owner state: squad29-lab.mjs, squad29-core.mjs |
| squad3-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad3-lab.yml runs a module reading owner state: squad3-lab.mjs |
| squad3-today.json | QUARANTINED: owner-derived producer | publishing workflow squad3-lab.yml runs a module reading owner state: squad3-lab.mjs |
| squad4-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad4-lab.yml runs a module reading owner state: squad4-lab.mjs |
| squad4-today.json | QUARANTINED: owner-derived producer | publishing workflow squad4-lab.yml runs a module reading owner state: squad4-lab.mjs |
| squad6-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad15-lab.yml, squad6-lab.yml runs a module reading owner state: squad15-lab.mjs, squad6-lab.mjs |
| squad6-today.json | QUARANTINED: owner-derived producer | publishing workflow squad15-lab.yml, squad6-lab.yml runs a module reading owner state: squad15-lab.mjs, squad6-lab.mjs |
| squad7-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad7-lab.yml runs a module reading owner state: squad7-lab.mjs |
| squad7-today.json | QUARANTINED: owner-derived producer | publishing workflow squad7-lab.yml runs a module reading owner state: squad7-lab.mjs |
| squad8-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad8-lab.yml runs a module reading owner state: squad8-lab.mjs |
| squad8-today.json | QUARANTINED: owner-derived producer | publishing workflow squad8-lab.yml runs a module reading owner state: squad8-lab.mjs |
| squad9-lab.json | QUARANTINED: owner-derived producer | publishing workflow squad9-lab.yml runs a module reading owner state: squad9-lab.mjs |
| squad9-today.json | QUARANTINED: owner-derived producer | publishing workflow squad9-lab.yml runs a module reading owner state: squad9-lab.mjs |
| stops.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| strategy-library.json | QUARANTINED: owner-derived producer | publishing workflow agent-a-lab.yml, agent-a-ldx-lab.yml, agent-a-tgt-lab.yml, agent-a-tp-lab.yml, agent-c-lab.yml, agent-c2-lab.yml, agent-c3-lab.yml, angles-lab.yml, anomaly-lab.yml, catalyst-lab.yml, chain-decoder.yml, comeback.yml, confluence-lab.yml, decoded-lab.yml, discovery2.yml, event-orb-retest-research.yml, expert-lab.yml, hold-lab.yml, leaders-study.yml, macro-lab.yml, ml-lab.yml, options-lab.yml, research-lab.yml, squad1-lab.yml, squad10-lab.yml, squad11-lab.yml, squad12-lab.yml, squad13-lab.yml, squad14-lab.yml, squad15-lab.yml, squad15b-lab.yml, squad16-lab.yml, squad17-lab.yml, squad18-lab.yml, squad19-lab.yml, squad2-lab.yml, squad20-lab.yml, squad21-lab.yml, squad22-lab.yml, squad23-lab.yml, squad24-lab.yml, squad25-lab.yml, squad26-lab.yml, squad27-lab.yml, squad28-lab.yml, squad29-lab.yml, squad3-lab.yml, squad4-lab.yml, squad5-lab.yml, squad6-lab.yml, squad7-lab.yml, squad8-lab.yml, squad9-lab.yml, tipster-lab.yml, value-lab.yml, winners-autopsy.yml runs a module reading owner state: winners-autopsy-lab.mjs, value-lab.mjs, tipster-lab.mjs, squad9-lab.mjs (+68) |
| tip-score.json | QUARANTINED: owner-derived producer | publishing workflow agent-c2-lab.yml, leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| tipster-lab.json | QUARANTINED: owner-derived producer | publishing workflow tipster-lab.yml runs a module reading owner state: tipster-lab.mjs |
| tipster-today.json | QUARANTINED: owner-derived producer | publishing workflow tipster-lab.yml runs a module reading owner state: tipster-lab.mjs |
| value-lab.json | QUARANTINED: owner-derived producer | publishing workflow value-lab.yml runs a module reading owner state: value-lab.mjs |
| value-today.json | QUARANTINED: owner-derived producer | publishing workflow value-lab.yml runs a module reading owner state: value-lab.mjs |
| winners-study.json | QUARANTINED: owner-derived producer | publishing workflow leaders-study.yml runs a module reading owner state: league.mjs, discovery2.mjs, chain-decoder.mjs, agent-a-lab.mjs (+20) |
| avoid-ledger.jsonl | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| channels.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| comeback-board.json | QUARANTINED: transitive (clean modules, tainted data inputs) | workflow comeback.yml: its modules read no owner file, but they read quarantined data files (for example strategy-library.json, other labs' outputs, shares/agent-league), so the output is not proven owner-independent |
| comeback-lab.json | QUARANTINED: transitive (clean modules, tainted data inputs) | workflow comeback.yml: its modules read no owner file, but they read quarantined data files (for example strategy-library.json, other labs' outputs, shares/agent-league), so the output is not proven owner-independent |
| comeback-today.json | QUARANTINED: transitive (clean modules, tainted data inputs) | workflow comeback.yml: its modules read no owner file, but they read quarantined data files (for example strategy-library.json, other labs' outputs, shares/agent-league), so the output is not proven owner-independent |
| companies.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| company-investigations.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| discovery-journal.jsonl | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| discovery.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| earnings-recent.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| events-recent.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| fastmover-live.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| fastmover-paper.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| halal-ext.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| ignition-results.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| intraday-radar.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| leaders-universe.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| movers-journal.jsonl | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| movers-state.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| octopus-daily.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| options-shadow.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| radar-record.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| radar-universe.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| research-assessments.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| sec-ciks.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| smart-money-study.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| smart-money.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| squad26-lab.json | QUARANTINED: transitive (clean modules, tainted data inputs) | workflow squad26-lab.yml, squad26-labels.yml: its modules read no owner file, but they read quarantined data files (for example strategy-library.json, other labs' outputs, shares/agent-league), so the output is not proven owner-independent |
| squad26-today.json | QUARANTINED: transitive (clean modules, tainted data inputs) | workflow squad26-lab.yml, squad26-labels.yml: its modules read no owner file, but they read quarantined data files (for example strategy-library.json, other labs' outputs, shares/agent-league), so the output is not proven owner-independent |
| tg-failures.jsonl | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| tg-state.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| tier2-ledger.jsonl | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| watcher-message-state/ | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| zoya.json | QUARANTINED: unknown/unproven producer | no audited publishing producer; not presumed owner-independent |
| alert-state.json | SCAN_OUTPUT (manifest-verified) |  |
| dow-study.json | SCAN_OUTPUT (manifest-verified) |  |
| engine-history.jsonl | SCAN_OUTPUT (manifest-verified) |  |
| experiments.jsonl | SCAN_OUTPUT (manifest-verified) |  |
| fm-state.json | SCAN_OUTPUT (manifest-verified) |  |
| journal.jsonl | SCAN_OUTPUT (manifest-verified) |  |
| leaders.json | SCAN_OUTPUT (manifest-verified) |  |
| lessons.json | SCAN_OUTPUT (manifest-verified) |  |
| mday-study.json | SCAN_OUTPUT (manifest-verified) |  |
| models.json | SCAN_OUTPUT (manifest-verified) |  |
| names.json | SCAN_OUTPUT (manifest-verified) |  |
| options-probe.json | SCAN_OUTPUT (manifest-verified) |  |
| outcomes.json | SCAN_OUTPUT (manifest-verified) |  |
| sectors.json | SCAN_OUTPUT (manifest-verified) |  |
| sic-extra.json | SCAN_OUTPUT (manifest-verified) |  |
| signals.json | SCAN_OUTPUT (manifest-verified) |  |
| skipped.jsonl | SCAN_OUTPUT (manifest-verified) |  |
| spy-closes.json | SCAN_OUTPUT (manifest-verified) |  |
| switch-paper.json | SCAN_OUTPUT (manifest-verified) |  |
| timing-study.json | SCAN_OUTPUT (manifest-verified) |  |
