# Rev12/rev13 independent review: CHANGES REQUIRED

Handoffs6723179947/6723212697/6723282733. Rev125849242e3164c19d3e34082db235a27d57544421; rev13c00b8b24f17e42cc878b9ed5c6493a977a42c189, bindingbd8627bd SHA2569304b283abfb89de0c880d2a781ed7cc776be8966421a7f955c4eb3399f31d3d. Nothing deployed; no operational READY or owner approval request.

## Verified PASS scopes

- Rev12/13 scanner runtime bytes are identical. Original future-at-fetch probe stays UNKNOWN; prior rev11 render-age/HOLD assertion now passes. Current-price evidence requires validity at fetch AND at report time. Historical stop observations are separately qualified in the first-check line, with no stale current-price percentage inferred there. Defaults/explicit3/5/20-minute gates are not relaxed.
- Exact68paths, bytes/sizes/modes and all4binding checksums match.17STOPpins and the same7changed STOP paths match. Mandatory identity/mode omission, mismatch, unavailable candidate, old binding, wrong candidate/mode mutant and whole-branch controls refuse. BothM0=774273205e1c8ce3db30c59ca368dc107617ef73 anda8f22f842e85f6743ee498c47a2dee5908853157 build/verify/patch/inverse pass. Complete treesd4b60206e8605b8e403999d71005ed8974159abe andabaecb0ded838b302403d032aa463410ea3b4b1e. All newer data/unbound paths preserved, including9newer non-data research/source/test paths on the lattermain. No refs/index/worktree change in these Git-object checks.
- Supplied relevant open/stop/storage/reader/wiring/recovery/release regressions125/125PASS on local Node20.20.0. This is an executed subset; author-reported full156/gated9/11 are not called independently complete-log verified here.
- Slot admission is atomic expected-absent checkpoint+reservation, capped to bot1/main1/shared2 with known<=32MiB per admission; no listing-based UNKNOWN bypass. It is a conservative logical unpublished-object bound, not physical storage/fetch size. Exact descendant replacement and compare-tip paired cleanup have the intended atomic structure.
- Independent actual-producer/consumer interleavings: **cleanup wins** → old pair absent, same run safely re-admits newer descendant; **replacement wins after old state reachesmain** → stale cleanup leases fail, newer pair survives, next pass recovers newer offset. Both pass, no newer-state loss observed in these cases.

## Required corrections: five reproduced blockers

### B1. Real workflow shell exits before required save warning/continuation

bot.yml executes Bash with `-e -o pipefail` and calls `save; mirror`. bot-save.sh now invokes `sealed_recovery_push` as an unguarded simple command. When recovery fails/FULL, that nonzero status exits before output is copied to run.log, before bot_save_warn and before continuation. Independent actual-flags fixture: status1, warning markerfalse, AFTER_SAVEfalse. The exact desired case also fails on rev12's pipeline under pipefail: inherited failure is retained, not waived. Catch/preserve the recovery status deliberately and always perform required failure/UNKNOWN warning/logging; keep the reviewed bot continuation behavior. Do not fix by disabling failure handling globally. This is separate from optional FULL wording.

### B2. Successful replacement + lost reply/read-back strands same-run advancement

A is kept; B descendant replacement lands; push reply and immediate ls-remote fail. The helper retains only A's old LAST/REF/SLOT and discards B's attempted unique name. Network works at the next save, C descendant exists, yet it tries to replace A using a new nonce, sees slotB/oldAabsent and remains UNKNOWN; remote staysB, latestC only on runner. Desired latest-tip assertion fails. Preserve/reconcile the exact pending operation, validating own run, ref/tip/slot and ancestry before any replacement; never weaken UNKNOWN or adopt an unrelated writer's state.

### B3. Final always-save step loses this run's ownership cache

bot.yml's loop and final always() step are different shells. Removing the tee subshell fixes within-loop variable persistence only. With the SAME run/attempt/workflow and RUNNER_TEMP, the first shell keepsA; final shell commitsB but has no LAST/REF/SLOT and reports its own earlier slot FULL. LatestB is not durable. Desired latest-tip assertion fails. Verified per-run confirmed/pending metadata must survive step boundaries (and be revalidated remotely); don't infer identity from display name or overwrite another run's slot. Preserve all newer commands/offsets and original deadlines.

### B4. Dedicated stop batch still misstates captured age after fetch delay

Actual caller: source10s old at09:40, stop70<=80; later fetch advances10minutes. First-check line correctly qualifies “10s old WHEN CHECKED at09:40; no current price now…”. Dedicated YOUR STOPS emits unqualified “last price70…10s old” plus entry percentage at09:50. Its desired provenance assertion fails. Keep the valid historical stop observation but qualify age/time in that message as well; do not turn an old snapshot into a current-price claim or add a new stop threshold. General source date/minute alone does not qualify the contradictory relative-age phrase.

### B5. Omitted T1 reader silently suppresses after-close research

opportunity-radar.mjs's readJson wrapper uses plain fs.readFileSync and catches errors as null; close calls readJson('data/ignition-live.json'). Actual subprocess in a source-only temporary copy with invented day/alerts7 and valid sealed live file: exit0, “live watcher saved no results…Nothing to score”, fixturecounts missing. Keyless/corrupt sealed cases likewise have no SEALED error. Plaintext legacy control is successfully read. Generic instrument-identity UNKNOWN boilerplate is unrelated to this missing source/error status.

opportunity-radar.yml already provides SEALED_SECRET; repair the reader and actual-caller/indirect-wrapper coverage, not key setup. This module is outside the current68path diff. The necessary new path must be explicitly added to the reviewed allowlist and regenerated binding; don't preserve68 by leaving a broken reader. Supplied static fs-pattern tests miss this wrapper indirection. No legacy plaintext fallback, silently empty data, source-results censorship or new research/trading filter is acceptable.

## Required warning behavior versus optional improvements

Required: reachable truthful SAVE NOT CONFIRMED/failure/UNKNOWN handling, no false durable confirmation, known versus only-runner state distinguished, fail-closed size/admission uncertainty, explicit partial/unreadable source status, timed historical stop-price provenance. Retain refs on uncertain recovery/deletion and keep failures visible. Existing warning transport is not proof of a real ACK; live delivery remains separately authorized.

Optional: new PENDING-at7days/STALE-at30days health labels, a new distinct FULL Telegram label, cosmetic counters, dashboards or expanded notifications. Their absence alone does not block this source review if required generic warnings/logs work. No new warning product or policy gate is requested. B1 is a genuine unreachable-warning/control-flow defect, not a request for prettier text.

## GitHub atomic capability: established read-only, no live probe needed for support

An unauthenticated bounded HTTP GET to github.com/drrazaq/Stock-2.git/info/refs?service=git-receive-pack returned200 and the Git receive-pack advertisement. Exact pkt-line parsing finds the NUL-separated `atomic` capability (also delete-refs/report-status-v2). Sanitized receipt github-atomic-readonly.json includes timestamp, bytes/hash, capability names and0refs updated. No credentials, update commands, packfile or objects were sent. Two GET reads were used: initial discovery, then exact packet parsing/receipt; neither can update refs.

Git's primary protocol specification says advertised atomic means the server can update refs in one all-or-none transaction: https://git-scm.com/docs/gitprotocol-capabilities#_atomic . Thus support is established without a write, and no live write-probe approval is requested for that question. This does not prove future authenticated permissions/rules accept every actual transaction or certify operational migration/recovery. Any separately required operational rehearsal remains separately approved; do not claim it happened. No speculative disposable-branch exercise is necessary merely to rediscover the advertised capability.

## Scope and release status

[Reader/writer path map](paths.md) records reviewedT1 routes, recovery callers and preserved unbound source. **Cannot confirm all readers/writers correct while B1–B5 remain.** Existing residualT2/public outputs, historical copies/artifacts/caches, key/owner-held recovery proof, fresh writer/M0 census, per-unit attended hosted-log verification, restoration gates and owner capacity/L7 choice remain separate. No deletion, keys/settings, production writes, workflow dispatch, collection, spending or history rewriting. Existing313-file development run remains complete at its originalSHA, not this candidate. No acceptance closure or profitability credit from these tests.
