# Rev15 independent review — CHANGES REQUIRED

Exact candidate09f58ca51258e02c6950f8d528a3c4093d2963e9, handoff6725039263. Binding832fceea, binding.json SHA25625c884e0c80cf5e570bc3c261bce44e49a535aa49df8173ee7d2f8f95831b8e2. No deployment, keys, settings or production changes. Review is not operational READY.

## Passed scope

- Exact73paths, bytes/sizes/Git modes,4checksums,17STOPpins/8changed/9unchanged; explicit1added/0removed/4changed declaration matches comparison. Missing candidate/mode, unavailable/mismatched candidate, wrong mode/candidate, whole branch and old68/72-path bindings refuse.
- Source-only build/verify, exact patch tree and inverse restore pass on774273205e1c8ce3db30c59ca368dc107617ef73,00bd79634fdf51825f557668d427406103eb5758, and newer main6e72a8d0c46385f3c329157d627636875505a224. Trees7a67151af4b1d771e095fe2018a7036567e4ab50,dd3ab3b929ef33216c62fe4966edb20eb0b88c5f,and547680a7c87c7ee977b7c7e9a84e9af2934fcb89. All data and unbound paths preserved; latest main differs from the handoff main only in data. No ref/index/working-tree mutation within binding verification.
- Actual latest-main built unit4069b2769c0ef6becaeafc3675bfc44fbb6f12da: complete162/162registered test files PASS (161root+1tests/), Node20.20.0, external-network guard; exact retained input preconditions restored from its own Git objects, no source/assertion changes or new acquisition. Candidate has159root+1other; author159-root totals are not substituted for the newer-main result. Full logs remain local with per-file fingerprints.
- Expanded focused140/140PASS, actual gated watcher11/11+9/9PASS. Prior general-alert fetch-batch/future-at-fetch cases and five actual recovery cases8/8PASS. Built-unit original future-at-fetch/HOLD, dedicated stop provenance and valid/keyless/tampered/legacy radar probes PASS. Original B1–B5 remain CLOSED. Reader/writer/helper/workflow fingerprints are in paths.json; no T1-route change beyond the reviewed scanner correction. Prior full314-file development fingerprint validation remains scoped to037792b8, not this R1 unit.

The improvements are real: quote provenance is retained, missing/future-at-fetch evidence is not admitted, the post-quote-loop holding5minute and plan20minute checks suppress expired claims before that batch, and freshness-withheld targets are not marked by those checks. They do not establish actual dispatch-time freshness after later awaits.

## Remaining release blockers

### R1. Freshness is checked before earlier network awaits and not again on retry

scan.mjs snapshots nowSend, renders strings and writes alert-state before await telegram(openMsg), every BUY NOW card, and the stop batch. The general message is dispatched only afterwards. telegram() may itself wait/retry or split a payload while retaining the same static text. Therefore this is a batch-time check, not the required per-payload/per-attempt check.

Actual caller and real telegram retry loop, invented data and loopback only, on the exact latest-main built unit:

1. Holding target quote290seconds old at fetch/batch check; FIRST MARKET-HOURS CHECK send completes30seconds later. At actual general-alert dispatch the source is320seconds old, but TARGET2/price/% is sent and ZZTmyt2 is already1.
2. Plan paper-target quote1190seconds old; same earlier send delay. Actual dispatch at1220seconds still sends current target/price and marks its key.
3. Holding target starts290seconds old; the first general-message request gets synthetic HTTP429; clock advances20seconds. The real retry sends the same current target/price at310seconds.
4. Actual eligible BUY NOW fixture: timely control sends normally;1190seconds old plus the first-check30second delay still dispatches the card at1220seconds and marks ZZEbuynow.

Desired assertions fail, with captured transmission clocks and positive fixture/loopback controls. The fixtures advance time on the FIRST MARKET-HOURS CHECK send, after fetching, not on the initial menu setup. The retry test records429then200 attempts. No real messages/provider data/keys are used. Logs retain the failures; the registered-suite PASS does not erase these independent counterexamples.

Required bounded correction: carry original quote/fetch provenance to each price-bearing payload, render/revalidate at the corresponding network attempt after all prior awaits, including retries/rate-limit and relevant multipart waits. An expired payload must not assert a current target/entry/price/% or retain the sent key for a freshness-withheld alert. Reuse the documented holding5minute/plan20minute rules and preserve stop observations as explicitly timed history. Define the local dispatch point; no guarantee about eventual remote-delivery time is requested. No global ACK/exactly-once delivery redesign, new trading filter, warning product or policy activation is requested.

### R2. BUY NOW admission boundary changed

Rev14 used `Date.now()-j.t <20*60000`. Rev15 priceEvidence rejects only age>20minutes, so the new path accepts exactly1200seconds. The actual eligible earnings-drift fixture at exactly1200seconds is suppressed onrev14 and sent/marked onrev15. Timely controls pass onboth. This is a reproduced guard-preservation regression, not optional whole-minute rounding or an unreplicated stop-boundary hypothesis.

Restore the original strict `<20minutes` BUY NOW comparator as part of the same bounded correction. Do not change holding/other existing helper boundaries or choose a new threshold. Previously ungated manual-review routes can retain their explicitly documented mapping; do not describe those as formerly gated.

### R3. Operative build instructions still contradict73-path binding

RELEASE.md's current “C is built source-only” paragraph still says “exactly the68bound files” and “all68files” even though its header/G1/B5 now say73. Synchronize this live instruction with the final actual binding count, preserving clearly historical counts elsewhere. The verifier itself checks all73; this is an operative procedure correction, not a runtime weakness in its binding checks.

## Disposition and next action

**CHANGES REQUIRED.** Immediate focused correction requests6725196088/6725264200 are on PR1; Claude need not wait for a scheduled check or another owner message. Correct only the above, regenerate exact binding/STOP pins and return the precise candidate for independent reproduction. Optional N2rounding/N3unreplicated boundary/health-label additions stay deferred. No repeated archive study, strategy/filter/exit change or new audit platform.

Because the exact candidate does not pass, a release approval proposal is not presented. Existing owner prerequisites remain parked: exact unit/window/roles, key/recovery-copy/proof choice, residual public-output disposition, selected4-slot logical-capacity/L7 acceptance, fresh main/writer census, attended hosted receipts and every restoration/Enable gate. No owner action is required to authorize these source corrections. GitHub atomic capability remains established read-only; no live probe is needed for capability. Deadlines unchanged; acceptance24/40,16OPEN,0new full-row closures or authentic trading admissions. No profitability finding is inferred from these software results.
