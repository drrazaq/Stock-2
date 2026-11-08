# Rev16 independent review — CHANGES REQUIRED

Exact candidate cdda3dc376d9bead23ae14fba24bd60db9ee53ee, handoff6725427920. Binding b3e3a744, binding.json SHA256845866e2f80cb8758a87bfa5ae8441f6c87e046c5ed4da9390c3e9b5573ab0bb. No deployment, keys/settings or production changes. This is not operational READY.

## Closed findings and verified safeguards

- **Strict BUY NOW boundary CLOSED:** prior actual-caller timely/expired/exact1200second cases pass. Its original strictly-less-than1200second admission is restored at fetch and dispatch, while other shared5/20minute boundaries remain as documented.
- **Previous first-send/retry cases CLOSED within that tested scope:** all16 independent prior holding/plan delay, first429retry, actual BUY NOW, future-at-fetch/general and recovery cases pass on the latest-main built unit. Original future-at-fetch/HOLD, timed historical stops and valid/keyless/tampered/legacy radar actual-process probes also pass. B1–B5 warning, pending reconciliation, cross-step ownership, deletion races, provenance and sealed-reader safeguards stay closed.
- **Operative count finding CLOSED:** rev16 explicitly adds two bounded regression test paths, so the reviewed binding is75, not the prior73. Both added paths and4changed paths match the declaration;0removed. All live RELEASE build/verify/unit/G1/G6/B5 counts and binding README opening agree on75; older68/73counts are clearly historical. STOP pins remain17, with8changed/9unchanged.
- Exact75path bytes/sizes/Git modes,4checksums, source-only build/verify/whole-tree/patch/inverse and data/unbound-source preservation independently pass on774273205e1c8ce3db30c59ca368dc107617ef73 and6e72a8d0c46385f3c329157d627636875505a224. Trees10e3d8bce56e0476eaf0a281c6dea2599c197885 and43e82ea7d9ce9cf9f477968efe0a92ddf67ced6e. All mandatory identity/mode/unavailable/wrong-candidate controls, whole branch and old73binding refuse. No refs/index/working-tree mutation during binding checks. Never merge/push the historical candidate branch; build source-only on the fresh release M0.
- Expanded focused148/148PASS; gated actual watcher11/11+9/9PASS, Node20.20.0 and external-network guard. Complete whole-source sweep of actual built unit9d5ec34143059eb3091c0f01d9212e65be819158 is recorded below. Candidate161root+1other; built unit163root+1other. Original development314-file validation remains scoped to037792b8, not transferred to this unit.

## One remaining release blocker: BUY NOW multipart remainder bypass

In scan.mjs's BUY NOW telegramLive callback, `if (sent.length) return tgRemainder(shown,sent)` executes **before** alertEvidence. Once one part has been sent, all later parts and their retries therefore use the old cached shown text without checking current eligibility. The new sender calls the renderer each time, but this caller bypasses the required check. The first-part/retry fix is real; it does not cover the remaining-part branch.

Independent actual intraday caller and actual telegramLive/retry loop, source-only latest-main built unit, synthetic quotes/records and loopback only:

1. A long card made from4well-typed accepted candidate records for one synthetic symbol (sample counts40–43, all numeric fields ordinary) produces2parts. Part1is3148characters and sent at source age1190seconds. A30second delay after that attempt makes source age1220seconds at part2. Part2still sends “Now:105.00, inside the range:OK to buy”, the range and “Amount:BUY1000USD”. Desired assertion FAILS.
2. Without that first-part delay, a synthetic429on the later part advances the clock30seconds. Its real retry at1220seconds again sends the same expired current-price/actionable text. Desired assertion FAILS.
3. The same multipart input at a timely10second age, followed by30seconds, delivers its eligible remaining price lines normally: positive control PASS. Loopback-only control PASS. Overall2PASS/2FAIL, no waiver.

The fixture intentionally exercises accepted long-card input; it is not evidence that these records occurred in production. No malformed types, provider data, real holdings or real messages are used. This route does not enforce a uniqueness/message-length contract that rules out the branch. No new dedup rule, input filter, arbitrary truncation or silent size assumption is requested to hide the failure. A preliminary attempt using a sector field did not create a long earnings card because that route omits sector; it was not used as blocker evidence. The published fixture asserts that the later part really occurs and captures its dispatch clock.

## Bounded correction and disposition

**CHANGES REQUIRED**, one code blocker. Revalidate the quote before the sent.length early return and before dispatch/retry of the not-yet-sent BUY NOW remainder, under the restored strict<1200second rule. Preserve already-sent parts, original fetch provenance, timed stop history and all existing rules. Suppress or explicitly qualify expired unsent current-price/actionable content; do not treat an unvalidated remainder as a completed eligible offer. No global ACK/exactly-once delivery redesign or optional warning product is requested. Regenerate exact binding/STOP pins after the narrow change and return the pinned candidate for focused reproduction.

Immediate request6725877594is already on PR1; Claude need not wait for a scheduled check or another owner message. All prior closures above remain scoped and intact; this failing external assertion is not erased by registered-suite totals. Optional N2rounding/N3unreplicated boundary/health labels remain deferred.

The conditional owner release proposal is withheld because this exact candidate does not pass. Existing owner prerequisites remain parked: exact unit/window/roles, key/off-GitHub recovery copy/proof route, residual public-output disposition,4-slot logical-capacity/L7 acceptance, fresh main/writer census, complete attended hosted receipts and every restoration/Enable gate. No owner action is needed for this source correction. GitHub atomic capability remains established read-only; no write probe is required for capability. Deadlines unchanged; acceptance24/40,16OPEN,0new full-row closures or authentic trading admissions. No profitability is inferred from software tests.

## Complete built-unit validation

Actual source-only release unit9d5ec34143059eb3091c0f01d9212e65be819158 (parent6e72a8d0):164/164registered files PASS,0FAIL, Node20.20.0 with external-network guard;163root+1tests/. Retained input preconditions were copied byte-exact from that unit/M0, no source or assertion changes. Per-file result/exit statuses, full-log fingerprints and reproducer are retained; raw complete logs remain local. Focused148/148,gated11+9,and prior16/16alsoPASS. The two independently failing multipart assertions remain release blockers; timely multipart and loopback controls PASS. No test failure was waived and no economic/operational acceptance transferred.
