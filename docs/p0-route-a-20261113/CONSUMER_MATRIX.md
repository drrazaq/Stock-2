# P0 Route A: private-file consumer matrix (generated from source tree, development)

Generated from the development tree by grep of `data/<file>` references in root `*.mjs` and the workflows that run each module. Heuristic: a reference is a reader or writer; writer/reader direction for the main owner files is stated in the notes. No data values are included.

| Private file | Modules referencing it | Workflows running those modules |
|---|---|---|
| `my-positions.json` | calendar.mjs hold-lab.mjs ignition-watch.mjs news-watch.mjs premarket-check.mjs scan.mjs smart-money.mjs squad29-core.mjs squad29-lab.mjs  | Smart-money.yml account-replay.yml bot.yml calendar.yml comeback.yml hold-lab.yml ignition.yml leaders-study.yml main.yml news.yml premarket.yml research-lab.yml squad17-lab.yml squad23-lab.yml squad29-lab.yml tests.yml  |
| `my-trades.jsonl` | hold-lab.mjs scan.mjs  | account-replay.yml bot.yml comeback.yml hold-lab.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `settings.json` | agent-a-lab.mjs autolab.mjs deals.mjs discover.mjs earnings-study.mjs events-study.mjs exits.mjs fastmover-lab.mjs horizons.mjs hunting-lab.mjs ignition-watch.mjs intraday-radar.mjs leaders-study.mjs movers.mjs octopus.mjs opp-mode.mjs opportunity-radar.mjs quality.mjs rebalance.mjs rebuy.mjs scan.mjs score-study.mjs smart-money.mjs stops.mjs tipranks.mjs winners-study.mjs  | Smart-money.yml Tiprank.yml account-replay.yml agent-a-lab.yml angles-lab.yml bot.yml comeback.yml deals.yml discover.yml fastmover-intraday.yml hold-lab.yml ignition.yml intraday-radar.yml leaders-study.yml main.yml movers.yml opportunity-radar.yml options-lab.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml value-lab.yml  |
| `halal.json` | account-replay-core.mjs account-replay-lab.mjs agent-a-lab.mjs angles-lab.mjs anomaly-lab.mjs catalyst-lab.mjs chain-decoder.mjs confluence-lab.mjs decoded-lab.mjs discovery2.mjs event-orb-retest-events.mjs expert-lab.mjs fastmover-lab.mjs follow-lane.mjs ignition-watch.mjs intraday-radar.mjs league.mjs macro-core.mjs macro-lab.mjs ml-lab.mjs opportunity-radar.mjs options-survey.mjs quality.mjs research-lab.mjs scan.mjs squad1-lab.mjs squad10-core.mjs squad10-lab.mjs squad12-lab.mjs squad13-lab.mjs squad14-lab.mjs squad15-lab.mjs squad15b-core.mjs squad15b-lab.mjs squad16-lab.mjs squad17-lab.mjs squad18-lab.mjs squad19-lab.mjs squad2-lab.mjs squad20-lab.mjs squad21-lab.mjs squad22-lab.mjs squad23-lab.mjs squad24-lab.mjs squad25-lab.mjs squad26-watch.mjs squad27-core.mjs squad27-lab.mjs squad28-lab.mjs squad3-lab.mjs squad4-lab.mjs squad5-core.mjs squad5-lab.mjs squad6-lab.mjs squad7-lab.mjs squad8-lab.mjs squad9-lab.mjs tipster-lab.mjs value-lab.mjs winners-autopsy-lab.mjs  | account-replay.yml agent-a-lab.yml angles-lab.yml anomaly-lab.yml bot.yml catalyst-lab.yml chain-decoder.yml comeback.yml confluence-lab.yml decoded-lab.yml discovery2.yml event-orb-retest-research.yml expert-lab.yml fastmover-intraday.yml follow-lane.yml hold-lab.yml ignition.yml intraday-radar.yml leaders-study.yml macro-lab.yml main.yml ml-lab.yml movers.yml opportunity-radar.yml options-lab.yml options-survey.yml research-lab.yml squad1-lab.yml squad10-lab.yml squad12-lab.yml squad13-lab.yml squad14-lab.yml squad15-lab.yml squad15b-lab.yml squad16-lab.yml squad17-lab.yml squad18-lab.yml squad19-lab.yml squad2-lab.yml squad20-lab.yml squad21-lab.yml squad22-lab.yml squad23-lab.yml squad24-audit.yml squad24-lab.yml squad25-lab.yml squad26-watch.yml squad27-lab.yml squad28-lab.yml squad3-lab.yml squad4-lab.yml squad5-lab.yml squad6-lab.yml squad7-lab.yml squad8-lab.yml squad9-lab.yml tests.yml tipster-lab.yml value-lab.yml winners-autopsy.yml  |
| `alpaca-paper.json` | scan.mjs  | account-replay.yml bot.yml comeback.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `private.enc` | scan.mjs  | account-replay.yml bot.yml comeback.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `sell-notices.jsonl` | scan.mjs  | account-replay.yml bot.yml comeback.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `actions-sells.json` | premarket-check.mjs scan.mjs  | account-replay.yml bot.yml comeback.yml main.yml premarket.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `scan-report.txt` | scan.mjs  | account-replay.yml bot.yml comeback.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `tips.jsonl` | scan.mjs smart-money.mjs tip-score.mjs tip-sources.mjs  | Smart-money.yml account-replay.yml agent-c2-lab.yml bot.yml comeback.yml leaders-study.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `opinions.jsonl` | scan.mjs tip-score.mjs  | Smart-money.yml account-replay.yml agent-c2-lab.yml bot.yml comeback.yml leaders-study.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `market-calls.jsonl` | scan.mjs tip-score.mjs  | Smart-money.yml account-replay.yml agent-c2-lab.yml bot.yml comeback.yml leaders-study.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `watch-extra.json` | events-study.mjs scan.mjs  | Smart-money.yml account-replay.yml bot.yml comeback.yml leaders-study.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `basket-state.json` | scan.mjs  | account-replay.yml bot.yml comeback.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `leaderdip-ledger.jsonl` | scan.mjs  | account-replay.yml bot.yml comeback.yml main.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |
| `signals-private.json` | premarket-check.mjs scan.mjs signals-read.mjs  | account-replay.yml bot.yml comeback.yml main.yml premarket.yml research-lab.yml squad17-lab.yml squad23-lab.yml tests.yml  |

## Findings and status (13 Nov 2026, development tree `claude/notify-route-20261113`, pin after step 43)

Superseded: the earlier finding that no workflow pulls is obsolete. Current state, all development source, nothing activated:

1. **Hydration:** 75 workflows pull the private store after checkout (marker-gated), record producer admission, and fail closed.
2. **Saves:** owner-derived outputs are saved only through the private route (`private-outputs.sh save` / `private-data.sh push`,
   delta save against the immutable hydration receipt); registry edits only through `merge-library`; failures go to quarantine only
   (`retain-failed` / `retain-copy` / `push-quarantine`), never a canonical write. Per-workflow table below.
3. **Public save guard:** scalar entries, `private-*`, and the three private directories (Codex guard 9a17c39c) are never staged
   publicly; pre-push hook in every publishing job.
4. **stdout:** every run step of the 75 hydrated workflows runs through `.github/private-shell.sh` (public log: `private step N: exit X`
   only). `main.yml`'s private scan pass additionally writes its stdout to `data/private-scan-stdout.log`.
5. **Artifacts:** no hydrated workflow uploads a log or a `data/` path. Declared exceptions: squad19 `sq19-work/plan.json.gz`,
   `sq19-work/shard-*.json.gz`, `sq19-work/daily-out.json`; squad2 `squad2-work/plan.json.gz`, `squad2-work/shard-*.json.gz` (market-only
   inter-job work files; their writers take no owner input; squad19's halal use is in `report()` only). The watcher-evidence artifact
   (ignition) is removed. The event-orb 15-day bars file is no longer retained as an artifact (derived from the private event set;
   recomputable; its coverage record is private).
6. **Watcher reservations:** private reservation route + custody admission (steps 43); public namespace denied by Codex's guard follow-up
   (pending). Separate exact review/adoption: Stage 1 watcher path.
7. **History:** public bytes and history of every newly private file stay untouched pending a separate exact cleanup approval.
8. **Closed by Codex 6855218411 (a), step 46:** `hold-lab.json`, `squad29-lab.json`, `squad29-flags-today.json`, `tip-score.json`,
   `smart-money.json` are PRIVATE under their canonical names (computation unchanged), plus the same-class `agent-c-tip-score.json`,
   `squad29-diag.json`, and the 47 `data/*-run.log` stdout tails of hydrated jobs. None was a public seed. Producers save privately
   (hold-lab, squad29-lab, agent-c2-lab now with a private save; leaders-study and Smart-money retention extended). In private mode a
   missing danger-filing record is UNKNOWN: holdings get ASSESSMENT UNKNOWN (no clean HOLD, no invented SELL; independent SELL reasons
   still fire) and BUY paths say DANGER FILINGS NOT CHECKED. Before cutover the legacy behaviour is unchanged. `tips-public.jsonl`
   stays public (ARK / public-API provenance).
9. **Field-level classification of the remaining owner-reading emitters (step 48, Codex 6855218411 rule).**

| Module(s) | Owner input read | Where it flows | Disposition |
|---|---|---|---|
| autolab, deals, discover, earnings-study, exits, horizons, hunting-lab, leaders-study, movers, rebalance, rebuy, score-study, stops, winners-study; octopus (`ownerQuietOff`) | `settings.quiet` only (a full grep for every owner file confirms no other owner read) | only the Telegram send condition (every use inspected; no file write depends on it) | outputs PROVEN PUBLIC with respect to owner data |
| fastmover-lab (CORRECTED, Codex 6855791440) | `settings.quiet` AND owner fail marks (`halal.json`, lines 283–285) | `fastmover-live.json` (live paper list filtered by owner fail marks; was publicly staged by movers.yml's guard stage) | now PRIVATE (canonical name; retention in movers and fastmover-intraday); its other outputs were already private |
| events-study (CORRECTED: not quiet-only) | `settings.quiet`, `watch-extra.json`, private signals | universe of `events-study.json`, `events-recent.json`, `sec-ciks.json` and the SEC event cache | all PRIVATE: the event cache moved from the public Actions cache to the private `events-cache.json.gz` (Codex 6856174038; an Actions cache is a publication channel); `sec-status.json` (status only) public |
| Actions caches of owner-reading modules (field flow) | fm-cache (market bars only), follow-cache, quality fund/V15-pick caches, agent-a a-cache, study-cache grouped bars, squad19 work/daily | owner marks or holdings are applied to OUTPUTS only, after the cached market data is built | independent (public cache acceptable) |
| squad29-cache | holdings (`HELDCIK` added to the SEC submissions wanted set) | per-CIK submission files of held stocks that are otherwise outside the universe | PRIVATE: moved from the public Actions cache to the private archive `squad29-cache.tar.gz` (deterministic, entry-checked; Codex 6856231228) |
| fm-cache evr-* (event-orb lanes) | lane membership of the owner-derived event study | `fm-cache/evr-sec.json.gz`, `evr-min.json.gz` | PRIVATE `evr-*.json.gz`; the shared public fm-cache is NOT exported in any run where evr-* files are present (explicit UNRETAINED line; nothing deleted; Codex 6856859159) |
| follow-lane | owner marks (`halal.json`) | `follow-today.json`, `follow-fade.json`, `follow-board.json`, `follow-channels.json`, `follow-calls.jsonl` | all already PRIVATE |
| league | owner fail marks | `agent-league.json`, `agent-shelf.jsonl` | already PRIVATE |
| quality | owner fail marks | `quality.json`, the registry, a runner-temp pick file | already PRIVATE |
| news-watch | holdings, private signals | `news-log.jsonl`, `news-meta.json`, `news-seen.json` | already PRIVATE |
| news-watch | (none) | `macro-state.json`, `macro-log.jsonl`: index move + headlines only | PROVEN PUBLIC |
| calendar | holdings (dividends of held stocks) | `calendar.enc` (AES-GCM ciphertext of owner content), `calendar-status.json` ("dividends for X of Y held stocks": a held-stock COUNT) | now PRIVATE (canonical names; calendar.yml and leaders-study save privately) |
| health | none (file ages) | `health.json` | public (operational status only) |

No owner-reading emitter is left unclassified in this tree. Classification is per OUTPUT and mode, from the actual field flow; `test/private-routed-stage` checks every routed output against the real guard's stage phase with the real manifest. New emitters must be classified the same way before adoption.

## Hydrated workflows: private save, registry merge, failure retention, required history (parsed from the YAML run commands; arguments end at a shell operator or comment)

|Workflow|private save|registry merge|failure retention (outputs)|required history (parsed `require` arguments)|
|---|---|---|---|---|
|`Smart-money.yml`|private-outputs save||events-recent.json events-study.json sec-ciks.json smart-money.json|-|
|`Tiprank.yml`|none (no owner-derived output)||-|-|
|`account-replay.yml`|private-outputs save||account-replay-pb12t20-trades.jsonl account-replay-pb12t20.json account-replay-trades.jsonl account-replay.json|-|
|`agent-a-lab.yml`|private-outputs save|yes|agent-a-lab.json rot-today.json|agent-a-lab.json strategy-library.json|
|`agent-a-ldx-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`agent-a-tgt-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`agent-a-tp-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`agent-c-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`agent-c2-lab.yml`|private-outputs save|yes|agent-c-tip-score.json agent-c2-run.log|strategy-library.json|
|`agent-c3-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`angles-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`anomaly-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`bot.yml`|private-data push||-|-|
|`calendar.yml`|private-outputs save||calendar-status.json calendar.enc|-|
|`catalyst-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`chain-decoder.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`comeback.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`confluence-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`deals.yml`|none (no owner-derived output)||-|-|
|`decoded-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`discover.yml`|none (no owner-derived output)||-|-|
|`discovery2.yml`|private-outputs save|yes|discovery2-today.json discovery2.json|discovery2.json strategy-library.json|
|`event-orb-retest-research.yml`|private-outputs save|yes|catalyst-events.jsonl event-orb-retest-15d-bars-coverage.json event-orb-retest-15d-control-requests.json event-orb-retest-15d-control-study.json event-orb-retest-15d-controls.jsonl event-orb-retest-15d-events.json event-orb-retest-15d-gates.json event-orb-retest-15d-paper.json event-orb-retest-15d-requests.json event-orb-retest-15d-study.json|catalyst-events.jsonl event-orb-retest-15d-paper.json strategy-library.json|
|`expert-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`fastmover-intraday.yml`|private-outputs save||fastmover-lab.json fastmover-paper.json ignition-lab.json ignition-results.json|fastmover-paper.json|
|`follow-lane.yml`|private-outputs save||follow-board.json follow-calls.jsonl follow-channels.json follow-fade.json follow-today.json|follow-board.json follow-calls.jsonl|
|`hold-lab.yml`|private-outputs save|yes|hold-lab-run.log hold-lab.json|strategy-library.json|
|`ignition.yml`|private-outputs save||early-wave-obs.jsonl ignition-days.jsonl ignition-live.json ignition-missed-history.jsonl ignition-paper.jsonl ignition-runs/ opp-days.jsonl opp-ledger.jsonl premarket.jsonl radar-v3-ledger.jsonl radar-v3-snap.json shadow/ vol-curve.json|ignition-days.jsonl ignition-paper.jsonl opp-ledger.jsonl radar-v3-ledger.jsonl|
|`intraday-radar.yml`|private-outputs save||intraday-missed.jsonl intraday-radar.json radar-day.json radar-paper.json radar-record.json radar-sectors.json|-|
|`leaders-study.yml`|private-outputs save|yes|agent-a-lab.json agent-league.json agent-shelf.jsonl calendar-status.json calendar.enc discovery2-today.json discovery2.json events-study.json fastmover-lab.json ignition-missed-history.jsonl quality.json rot-today.json tip-score.json|agent-a-lab.json agent-league.json agent-shelf.jsonl strategy-library.json|
|`macro-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`main.yml`|private-data push||-|-|
|`ml-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`movers.yml`|private-outputs save||fastmover-lab.json fastmover-paper.json ignition-lab.json ignition-results.json|fastmover-paper.json|
|`news.yml`|private-outputs save||news-log.jsonl news-meta.json news-seen.json|-|
|`opportunity-radar.yml`|private-outputs save||radar-v3-ledger.jsonl shadow-outcomes/ shadow-report.json|radar-v3-ledger.jsonl|
|`options-lab.yml`|private-outputs save|yes|options-lab-run.log options-lab.json quality.json|options-lab.json strategy-library.json|
|`options-survey.yml`|private-outputs save||options-spread-survey.json options-spread-survey.md|-|
|`premarket.yml`|none (no owner-derived output)||-|-|
|`research-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`scorecard-1023.yml`|private-outputs save||scorecard-1023.json|-|
|`squad1-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad10-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad11-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad12-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad13-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad14-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad15-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad15b-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad16-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad17-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad18-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad19-lab.yml`|private-outputs save|yes|squad19-board.json squad19-diag.json squad19-lab.json squad19-paper.jsonl squad19-rh1-fm.json squad19-rh1-fm.md squad19-rh1-raw.json squad19-rh1-raw.md squad19-rh1-run.log squad19-run.log squad19-today.json|squad19-lab.json squad19-paper.jsonl strategy-library.json|
|`squad2-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad20-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad21-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad22-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad23-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad24-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad25-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad26-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad27-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad28-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad29-lab.yml`|private-outputs save|yes|squad29-diag.json squad29-flags-today.json squad29-lab.json squad29-run.log|strategy-library.json|
|`squad3-lab.yml`|private-outputs save|yes|squad3-lab.json squad3-run.log squad3-today.json|squad3-lab.json strategy-library.json|
|`squad4-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad5-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad6-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad7-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad8-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`squad9-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`tipster-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`value-lab.yml`|none (no owner-derived output)|yes|-|strategy-library.json|
|`verify-lab.yml`|private-outputs save||verify-lab.json|-|
|`winners-autopsy.yml`|none (no owner-derived output)|yes|-|strategy-library.json|

"read only" = no owner-derived output of its own (registry labs merge only their registry changes; the others write public research
outputs or nothing). All 75 use the private step shell.

## Private directories (Codex 6853502834, guard 9a17c39c)

| Directory | Producer | Readers (all hydrated) | Failure retention | Bounds |
|---|---|---|---|---|
| `shadow/` | ignition (ignition-watch, shadow-stream) | opportunity-radar (shadow-outcomes) | ignition `retain-failed shadow/` | 20,000 files / 512 MiB per side |
| `ignition-runs/` | ignition | calendar (health), ignition | ignition `retain-failed ignition-runs/` | same |
| `shadow-outcomes/` | opportunity-radar (shadow-outcomes) | opportunity-radar | opportunity-radar `retain-failed shadow-outcomes/` | same |

## Private outputs: destination and failed-pass retention class (13 Nov 2026, Codex 6852016986)

Destination after a COMPLETED private pass; retention class if the private pass FAILS (scan-passes.mjs `isCritical`). CRITICAL records are
always retained whole; OPTIONAL files are size-bounded (4 MiB each, 32 MiB per failure) and each skip is named in the private log.
Diagnostics go to the private log only (data/private-scan-stdout.log); the public job log carries generic status.

| Output (as written inside the pass) | Producer | Destination after a completed pass | Failed-pass class |
|---|---|---|---|
| owner files on .github/private-files.txt (holdings, trades, settings, marks, sell notices, actions-sells, tips, opinions, market calls, watch-extra, basket state, leader-dip ledger, signals-private) | scan.mjs daily | in place (newer concurrent copy wins; scan copy to private-conflict-*) | CRITICAL |
| alert-state.json, tg-state.json, tg-failures.jsonl | scan.mjs send paths | alert-state: data/private-alert-state.json (owner state); tg-*: in place | CRITICAL (send state) |
| watcher-message-state/** | watcher reservations | unchanged by the nightly | CRITICAL |
| tier2-ledger.jsonl, options-shadow.json, skipped.jsonl | scan.mjs (TRY SMALL lane, options shadow, owner skip commands) | data/private-<name> (owner state; owner context reads/writes it via dataPath) | CRITICAL (owner execution/closure/command records) |
| other OWNER_STATE_OUTPUTS (outcomes, models, lessons, journal, leaders, studies, fm-state, names, sectors, sic-extra, spy-closes, engine-history, experiments, switch-paper, options-probe) | scan.mjs daily | data/private-<name>, installed every completed pass | OPTIONAL (model/cache) |
| signals.json (private pass) | scan.mjs daily | data/private-signals.json (full private record; paired by session + zoned generatedAt) | OPTIONAL |
| anything else the pass writes | scan.mjs | data/private-<name> | OPTIONAL |

Producer queue status: class B/C outputs, the registry, events-study, news logs, directory outputs, stdout and artifacts are routed (see
above); discovery2 / follow-lane do not read the tier2 ledger (only scan.mjs does, via dataPath). Remaining: the OPEN items in the
findings. When an owner portion moves to a private file it is added to OWNER_EVENT_LEDGERS (critical) if it records owner executions,
SELLs, closures or commands.

## Owner `report` reply (scan.mjs tgCommands, data/scan-report.txt)

| Paired private record (data/signals-private.json) | Reply |
|---|---|
| valid, paired with the published signals (shared strict hydration), not ownerStale | the report as written |
| ownerStale (the run's owner state changed or could not be confirmed) | prefixed NOT CURRENT; guidance HISTORICAL only, no new sale or entry |
| missing, unreadable, malformed, invalid or unpaired (another run) | prefixed NOT CONFIRMED; guidance HISTORICAL only, no new sale or entry |

The stored report bytes are never rewritten by the reply; the label is applied at reply time (and at write/send time for stale runs).
