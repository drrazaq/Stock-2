# Watcher price follow-on: reconciled receipt, focused corrections and production path

Review-only checkpoint. No production actions, new market-data acquisition, settings, credentials or live-rule changes.

## Closed review findings
Claude PASS6764545741 / immutable receipt685187e86561291db67741138a837e6bcd96e2d5 closes the clock/cadence correction322c08b5. Preserve hosted147-file receipt and independent full-process12-case replay. Parent/mutant comparisons establish actual caller discrimination. The10s/65s cases exercise the unchanged10s request timeout: valid during-request acceptance was demonstrated below the timeout, NOT for a completed65s Alpaca response. Timeout remains fail-closed. Packetb812c6ee analysis independently reproduced with zero differences; no entitlement/spending conclusion follows.

## Minute-boundary assessment and implemented correction
Wall-minute receipts599,601,601 are three retained observations but only two usable observation minutes. Minute600 is genuinely unobserved; no data loss is required for that coverage gap. Do not backdate a receipt or call the gap covered. Fixed-second polling would alter invocation timing and is unnecessary for honest counting, so it is not introduced.

Reproduced raw loop-count inflation and inclusive-endpoint denominator error. New summary counts unique usable09:30..15:00 inclusive minutes, preserves every raw heartbeat, exposes raw/duplicate/observed counts and uses331 as the complete configured-window denominator. Existing sessionEvidence and watcherReport already deduplicate; their logic was not replaced. Original first/last raw observation fields and raw-distribution statistics stay as such. No trading threshold, endpoint, sleep policy or first-observation history is changed by this follow-on.

Replayed counting on ALL9 retained archives: zero within-run duplicate minutes found there. Primary-session legacy counts299/303/326/317/319/319 include two preopen beats each; configured unique counts297/301/324/315/317/317. Companion runs remain separate and per-day union318/319/324/315/320/317 is unchanged. This is a correction to summary semantics, NOT evidence jitter caused those historical missing minutes. Full331/390-session coverage remains unproved.

## Timeout/source label correction
snapTop50 now returns unavailable on null snapshot response or a map containing no usable price/reference/volume value. No phantom Alpaca rows are synthesized from an empty map. After unavailable refreshes,250 retained stale Massive rows survive and mode is FULL_SNAPSHOT_LATE; there is no fresh-price claim. A usable top50 response merged into a retained full universe is labelled as mixed, not “top50 only.” True no-Massive top50 coverage stays explicitly partial.

Development exact590010f5c7447bae3f4747cf0dbb11af7c4dca35 changes only watcher and the existing focused test file. Complete hosted42796788005/job129763902635:147/147files,0failures,11focused cases. Source-independent review of this narrow follow-on is pending; prior322PASS is closed, not reopened.

## Exact path toward production
1. Stage1211cf164, bindingafd2a30f, source/recovery PASS and its own protocol remain UNCHANGED. Neither this branch nor research/guard code is substituted into it.
2. Existing Stage2e689a53d/packet590bf434 remains immutable and independently PASS. It already has watcher admission, a post-wait RUN_START observation budget and passStartedAt cadence. Copying the research watcher wholesale would regress those repairs.
3. Concrete development composition93ab136cbab139b80882a45dabc09b17bacad1e1 selectively ports the needed price/receipt/actual-minute/count/label delta onto that exact Stage2. Its only source/test changes relative to590bf434 are ignition-watch.mjs and test/price-readiness-clock-boundary.test.mjs. Existing admission, winter behavior, RUN_START/passStartedAt, safe saves and all unrelated data/code are preserved.
4. New successor binding:46paths,39writes after unchanged Stage1,7fixed dependencies. Binding SHA256e513e26fda39f818a4469cae805089150d5289fd503ad77ef19af9d94d7cf3e9. Full hosted42796951273/job129764451402:165/165unique root files,0errors, exact checkout; all11focused cases pass. Complete709746-character log inspected. This root inventory does not substitute for independent composition/gated/operating review.
5. Exact two-path inverse back to590bf434 has been applied as a Git object and reproduces its full tree. The39-path inverse toStage1 on the same unbound tree is also proven; the reviewed helperv1 survives. No data restore or live reversal occurred.
6. Request Claude’s narrow source/composition/actual-caller and recovery disposition. Then freeze the reviewed new binding/inverses and obtain exact owner approval for this successor plus its operating procedure. Prior45/28path approval does NOT expand automatically. Fresh zero bound-path drift, exact loaded-code evidence, complete hosted receipts, writer/adoption handling and actual attended verification/recovery remain required. Stage2’s all16scanner criterion and natural-adoption choices remain separate unresolved operating decisions; a price-freshness metric does not waive them.
7. Recommended sequence remains Stage1 under its separately reviewed approval, then the newly reviewed Stage2 watcher successor only after its prerequisites pass. If Stage2 is deferred, this watcher fix is NOT delivered byStage1. A separate main-based watcher-only release would need a separately built/bound/composed/reviewed inverse and approval; it is not secretly authorized here. No new date or future availability is promised.

## Measuring detection effect without new acquisition
Existing evidence proves synthetic caller improvements, not a numerical historical market uplift: original rejected raw responses/receipt times were not retained. Do not infer a before/after counterfactual from aggregated heartbeats.

After a separately approved deployment, use ONLY observations already emitted by the normal authorized watcher/archive path. Freeze the first five available completed sessions with retained loaded-source proof; do not select favorable days or add capture/requests:
- unique usable configured minutes and within-window missing minutes, raw/duplicate observations, actual first/last retained minute;
- fresh/evaluated share per observed minute; retain received versus evaluated denominators and partial/mixed modes;
- existing mover firstSeen/firstLive and firstLiveUp, with preopen, UNDER_1_USD-coded/not-refreshed and other groups kept separate; these winner-selected records measure descriptive detection readiness, not unbiased recall/edge;
- selected opportunity BBO freshness by existing recorded cumulative-dollar-volume groups; identity stays UNKNOWN where missing. No common-stock or liquidity completeness is invented;
- zero-alert sessions and timeouts remain in the sample. Baseline9archives cover six dates with companion-run union, not nine independent days.
Report changes alongside coverage/mode/session differences. No causal attribution to a paid feed or profitability claim is possible from these aggregates. If ordinary jobs do not run, report the observation gap rather than dispatch, interpolate or buy data. Historical full-universe inactivity/cache/transport decomposition remains blocked by missing paired raw timestamps/response clocks.

## Separate opportunity research completed
New paired-horizon audit uses exactly the SAME20matured radarB observations: same-day modeled mean+1.142% versus five-session+6.135%; winners11->7; only10/20 improved. Seven same-day winners became five-day losses (VRT/BHYP/PCLA/FVRR/ACCO/ZSL/QXL); three losses became winners (SSP/CROX/STRZ). WithoutCHSN the means are+0.743% versus−2.921%. This is a concentration diagnostic, NOT a reason to tune the frozen exit or removeCHSN. All original observations/cost proxies remain. Instrument/actions/executable-price evidence is still incomplete. The separate rankingB cohort and GNSS A-control linkage issue are unchanged. Existing primary followups remain published, with their factual re-review pending; no repeated market-data searches were needed.

Remaining blockers: focused review of590010f5/93ab136c and actual timeout composition; successor operating/adoption/scanner-evidence decisions; fresh owner approval/readiness/actual attendance. No Stage1 source blocker is reopened. No production readiness is claimed.
