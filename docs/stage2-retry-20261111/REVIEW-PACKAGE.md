# Stage 2: one bounded retry/recovery and dated operating package

**Review only. No production action or owner approval.** Addresses S2-1/S2-2/S2-3 in [6795552418](https://github.com/drrazaq/Stock-2/pull/1#issuecomment-6795552418). The C1–C4 text/object PASS on13564bf6 remains closed; this amendment replaces only its publication method and infeasible appointment shape. The application source, binding, inverse and source reviews are unchanged. Thursday's Stage1 is frozen and its attendance/recovery allowance is not available for this work.

## Exact package

| Item | Pin |
|---|---|
| Stage2 source | `93ab136cbab139b80882a45dabc09b17bacad1e1` |
| Bound/write/dependency paths | 46 / 39 / 7 |
| Binding | `docs/watcher-price-followon-20261110/binding-successor.json` at `ee725432e2a6b535ecb53d55ff4d078f978347bd`; SHA256 `f3b01676729edf833c210ca07487e4c895d29d3c0ee7acb18a97128e9dcb5577` |
| Operational inverse | Same pin, `inverse-successor-to-stage1.json`, 39 entries, including22 deletions and restoration of helper v1 |
| Tested current composition | `5fccc6ec3e18c426531a0398b5085e2621a6e192`, development branch `codex/stage2-tested-20261111` |
| Retained main | `10a25bf67c506894a9da74d2ef0cab6aec75d169`; research4933429a and all newer code/data preserved |
| Tool/invocation/exercise fingerprints | `manifest.json` and `validation.json` in this directory |
| Closed Stage1 A4 parent | `a76f315f9850ce3c5fb68abc3dad04593d70dbfd`; original tool SHA256 `8cb36bc3f624644578f35b05760bf958696fd41c8a63424a2ae2189fd1c54510` |

The tested object includes a **hypothetical Stage1** on retained main, then exactly39 Stage2 writes. It is not installed Stage1, production F1 or runtime verification. `build-objects.py` proves all46 mode/blob/SHA256/length identities and exact inverse restoration of the Stage1/current-unbound tree. New source is not copied wholesale from development. The seven dependencies are verified, not rewritten. Data-only descendants are admitted by the fresh-parent gates; any later non-data incompatibility stops. No silent tested-reference repin or discarding intervening code/data.

## S2-1: A4 mechanics at46/39, with a per-push admission barrier

`stage2_retry.py` derives its roles from the binding and inverse. It rejects duplicate/overlapping roles, mismatched inverse identities or counts, changed dependencies and caps outside1–3. All39 written before/after identities are compared including absence and modes; all46 after fingerprints are checked. Every forward attempt rebuilds on freshly read remote main, proves exact39 diff, all non-data identity against the tested reference, and exact inverse to that parent, then runs the default FULL suite on that fresh candidate. Every inverse restores39 paths to Stage1, verifies seven unchanged dependencies and preserves all other leaves. Strict I8 remains: newer unbound non-data code means STOP, not a guessed compatibility exemption. No inverse local suite delays recovery; the full hosted inverse receipt remains required.

The default push remains non-force porcelain. Retry only after explicit non-fast-forward refusal PLUS candidate absence/ancestry and complete starting identities proving NOT_PUBLISHED. PUBLISHED/late/drifted/UNKNOWN is never retried. Transport failure is not proof of no publication. First remote observation after cutoff preserves the publication fact but never proves timeliness. Commands and input waits are bounded by cutoff; only read-only reconciliation may continue for120seconds after it, with local worktree cleanup capped60seconds.

**Before every actual push, including each retry**, the tool emits a candidate-specific admission request and waits. Claude collects a fresh complete dependency-derived census, writer/band proof and Codex's actual presence/read-only pre-write clearance, then supplies:

`ADMIT <mode> <printed-parent> <printed-candidate> <census-receipt-ref> <writer-receipt-ref> <verifier-receipt-ref>`

Missing, wrong, stale-candidate or partial input cannot start a push. Waiting never resets the cutoff. Receipts are operator/verifier attestations, not cryptographic proof or a fabricated workflow-settings API: the tool verifies their candidate binding; the attended pair must establish their truth/freshness. No unattended verifier is assumed. A local named pipe works with ordinary background shell execution; no interactive-terminal feature is needed. See `invocation.md`. Rehearsal verifies this real pipe route, missing/partial input, timeout and stale retry admission.

Production MUST leave `STAGE2_PUSH`, `STAGE2_TEST_PREPUSH_SLEEP` and `STAGE2_TEST_ADMIT` UNSET. The automatic admission hook refuses anything except an absolute local bare remote and exists only for offline fixtures. No hook/default-suite override is authorized for production.

**Finite budget:** at most3 forward attempts TOTAL and one forward publication; at most3 inverse attempts TOTAL and one logical39-path inverse, including any late continuation. No force/rebase/data restore, cap renewal or simultaneous publishers. Forward P is the FIRST request, refusals included; never reset it. D is the ORIGINAL qualifying decision. If a normal inverse invocation has already consumed attempts before a safe late continuation, record its terminal NOT_PUBLISHED proof, retain earliest request/D receipts and pass ONLY the remaining cap; cap across calls must total<=3. Never restart an unresolved/published attempt. No new inverse allowance is created by switching to late mode. These across-invocation authorization facts remain the sole operator's recorded obligation, not an invented durable global ledger.

## One fixed proposed cycle — Friday13 through Saturday14 November2026

No fallback date. No future attendance or operational READY is established. Owner approves only after focused review and all prerequisites, then initiates the named sessions. Owner is not the verifier and need not keep chats awake between units. Claude is sole operator; Codex is read-only verifier. Actual presence/access is independently reconfirmed at each unit and before each physical write.

| Unit/cutoff | UTC | Kuwait |
|---|---|---|
| Stage1 runtime prerequisite (UNCHANGED) | Thu12Nov21:15–22:00 | Fri13Nov00:15–01:00 |
| Stage2 A: readiness, forward, F1 and immediate recovery | Fri13Nov09:00–12:00 | Fri12:00–15:00 |
| Forward hard cutoff | Fri09:20 | Fri12:20 |
| Latest immediate D, if no earlier qualifying decision | Fri10:15 | Fri13:15 |
| Worst ordinary inverse / complete receipt | Fri10:45 /11:40 | Fri13:45 /14:40 |
| Explicitly LATE A cutoff / complete receipt | Fri11:00 /11:55 | Fri14:00 /14:55 |
| Selected nightly expected trigger | Fri21:30 | Sat00:30 |
| B: complete retained-evidence review | Sat14Nov05:30–06:30 | Sat08:30–09:30 |
| Finite adoption/missing-witness decision D_A | Sat06:45 | Sat09:45 |
| Paired recovery incl. conditional late reserve | Sat06:45–08:30 | Sat09:45–11:30 |
| Ordinary D_A inverse / complete receipt | Sat07:15 /08:10 | Sat10:15 /11:10 |
| Explicitly LATE inverse cutoff / complete receipt | Sat07:30 /08:25 | Sat10:30 /11:25 |
| Next fresh daily-researcher invocation (operator-inspected task metadata) | Sat08:37 | Sat11:37 |

**S2-2 choice(c):** the entire Saturday pair/reserve ends08:30, seven minutes before08:37; complete late hosted receipt is due08:25. The incompatible Saturday10:30–12:30UTC reserve is WITHDRAWN. No researcher hold/settings change or broader I8 exception is proposed. The researcher remains authorized by its existing saved task; a quiet interval is not proof no writer exists. Friday is its scheduled non-run day; AgentC's Thursday11:47 invocation precedes A. Verify actual sessions/queued or delayed code work at readiness and each write. A lab's single-checkout data-save exemption does not exempt the separate Claude.ai source writer. Any incompatible/new/unknown writer stops admission.

**S2-3 and C4:** A only after actual Stage1 runtime PASS, no Stage1 recovery pending and its recovery window closed. If Stage1 is UNVERIFIED, Friday is blocked. Thursday21:30's nightly must have been CREATED and completed by A; absence is DEFER, not presumed scheduler skip. Friday/Saturday are proposed appointments, never an automatic reschedule if any prerequisite fails. A readiness and fresh full applicable composition checks must fit its20-minute cutoff. Actual forward candidates use the pinned tool/reference; future incompatible non-data changes require focused composition reconciliation and a new exact reviewed pin before any approval/publication, not silent acceptance.

**Timing/retention feasibility:** the original mandatory F2 scope is the selected Friday13:10–20:40 scanner cycle plus Friday nightly, watcher, calendar and applicable guard provenance. The original retained-evidence protocol at `d2f76b645947f0ce8ac874c44a86d8a56a7eab69` distinguishes potentially UNKNOWN full bot/guard functional provenance from completed mandatory-cycle witnesses. Stage2 DOES NOT make writer-definition adoption optional: its complete P-def census is mandatory by D_A and missing proof causes the inverse. Morning read-only adoption census is not a completed runtime job with a job-completion timestamp. Do not discard earlier actual failures or reclassify an actual mandatory witness to fit this calendar. B's end06:30 is17h20 after the earliest possible13:10 selected scanner completion, within20h. Apply the EARLIEST actual mandatory F2–F6 completion, not a convenient sample. If any mandatory component's earlier completion makes06:30 fail20h, or actual evidence expiry gives less than2h retrieval margin, this calendar is NO-GO; do not relabel that witness, waive it or shift B. B's60minutes is below the existing90-minute work cap, not permission to sample: if complete review is not feasible in that time, no forward admission. B starts>=05:30 AND after actual selected-nightly completion. Late overnight delivery can still block it.

## Readiness and runtime evidence retained in full

C1's dependency-derived complete workflow census/band and explicit consistent-checkout/unchanged-dependency exemptions stay as reviewed in13564bf6/6795552418. Include queued/waiting/requested/in_progress and actual external code writers. No unclassified/dynamic consumer is silently exempted. Main/ignition/calendar remain non-exempt; bot is allowed only under the explicitly accepted finite adoption exposure. All writes require>=30minutes before the next trigger under installed/proposed/restored definitions, including opposite-season no-ops. Preserve the full recovery receipt before the conservative30-minute buffer. Friday first union trigger12:45 gives12:15 receipt boundary; our late A receipt11:55 is earlier. Recalculate the actual weekend union and exemptions before Saturday recovery; no weekday cutoff is copied blindly. An unsafe census/band blocks the write.

F1: Tests start<=P+30; complete exact-checkout hosted log<=actual start+25. Known failure, UNKNOWN or an earlier missed required deadline establishes D immediately; never wait until10:15 merely because it is the table's maximum. Normal inverse publication<=originalD+30; complete hosted receipt<=originalD+85. At D_A, compatible bot-definition adoption AND at least one completed P-code intraday witness AND the selected completed P-code nightly AND all other required evidence are needed. Missing minimum witness/adoption means the same39-path inverse decision, even if baseline scheduler failure is suspected. No indefinite renewal. Earlier qualifying defects use their actual earlier D, not06:45.

B enumerates ALL16 scanner slots, actual runs/failures/queues/no-ops/misses and the selected nightly, with complete P-def/P-code/output/save/publication evidence; no successful-run sampling. All16 coverage remains unsatisfied unless genuine. Only when minimum functional witnesses/other required evidence pass may baseline missing slots retain **SOURCE/FUNCTIONALLY VERIFIED FOR OBSERVED RUNS — SCHEDULE COVERAGE UNVERIFIED**, never READY/all16PASS. Introduced admission/runtime/output/save defects and missing/UNKNOWN evidence are not waived. Given recent0–2 intraday deliveries, the finite missing-witness inverse is a realistic likely outcome, not proof of a new code fault. No dispatch, scheduler repair or scanner-guard release is bundled.

Inspect actual winter watcher14:10 admission (13:10 no-op is not observing evidence), heartbeat coverage/gaps/end and immutable publication; actual calendar result/status; required bot/guard provenance. New scanner guard remains separate. Bot checkout alone does not prove later pulled code or inline save-definition adoption. Delivery needs retained ACK or private received-message evidence, never only a green job. No private holdings/trades/messages are copied into public receipts.

## Explicit LATE recovery, without clock renewal

If the safe census is blocked, do not write blindly or abandon the obligation. Preserve fault/report/discovery/decision, blocking jobs, original publication/receipt deadlines, actual first safe attended census, publication and hosted receipt times. Use one inverse at the first safe ATTENDED opportunity inside the fixed reserve. This does not authorize an action while either role/access is unavailable.

Normal invocation passes original `--decision D` and `--deadline <=D+30`. The separately approved C3 LATE path additionally passes BOTH exact `--late-cutoff` and `--receipt-cutoff` values from the table. It can start only after the original cutoff expired and requires>=55minutes between late cutoff and receipt cutoff. It retains D+85 in its log and ALWAYS reports published recovery as PUBLISHED_LATE/UNVERIFIED initially, never on-time PASS. The named late cutoffs do not reset D, H, caps or earlier missed obligations. Each late branch uses15minutes of the original20-minute disposition reserve, leaving5minutes after its full55-minute hosted allowance; no test/receipt allowance is shortened. Late recovery still needs the same fresh per-push admission, writer/UNKNOWN/non-data gates and complete hosted/restoration receipts.

H remains P+24h and D_A<=P+22h35. For earliest P09:00, D_A06:45 is21h45 later, within22h35; ordinary receipt08:10 and late receipt08:25 precede earliest H09:00. Later permitted P only increases this margin. Receipt includes complete exact checkout, not tail/badge. Read-only reconciliation after a publication cutoff is not permission to start a write then. If the blocker outlasts the fixed reserve, the cap is exhausted, new source breaks I8, the evidence is UNKNOWN, or a role/access is lost: remain UNVERIFIED, record the missed obligation and escalate for separately reviewed recovery. Do not silently extend, switch inverse, change tasks or claim guaranteed24-hour physical recovery.

Between Friday A and Saturday B there is no promised continuous monitoring, immediate acknowledgement or unattended recovery. Owner-reported faults retain actual report time and block further release progress when received. The original prospectively approved human-response/retrospective-review residual remains explicit: absence can make recovery late and physical exposure exceed planned H. No promise an unavailable agent will operate. This risk requires explicit owner acceptance, not inference from urgency.

## One inverse and finite restoration C

Only the39-entry inverse to reviewed Stage1 on the current unbound tree is operational; helper v1 survives for still-running newer-definition bots. The watcher-only2-entry/full-baseline inverse is not an ad hoc alternative. Preserve all newer data/code; no message recall or in-flight process termination is implied. Stage1 calendar-unit and older watcher admission/duplicate-dispatch residuals return and require explicit acceptance.

If inverse occurs during Friday A before the day's triggers: use the selected Friday ordinary restored cycle and its nightly; C occupies Saturday05:30–06:30 INSTEAD OF a successful Stage2 B. If inverse occurs Saturday: the next ordinary restored cycle is Monday16Nov scanner16slots/watcher/calendar and Monday21:30 nightly; C is Tuesday17Nov05:30–06:30UTC /08:30–09:30Kuwait, only after actual nightly completion and within original20h/expiry limits. These are one fixed conditional branch per actual inverse, not rolling 'first successful run' dates. Any next-cycle ineligibility is recorded UNVERIFIED, not silently moved.

C uses the source/outputs OLD code can actually produce and SAME scanner amendment for restored16 slots/nightly. Late/missing/partial receipts and unresolved legacy warnings are not full restoration. Reversed source remains REVERSED—UNVERIFIED until complete hosted receipt and every applicable restoration gate pass. This review is read-only<=60minutes; no second inverse, forward repair, workflow action or new live restriction is authorized. Required actual C availability is unconfirmed until then, like A/B/recovery.

## Validation and owner boundary

`validation.json` reconciles the final frozen-tool rehearsal, configuration/admission tests, local full suite and independently read complete hosted Tests receipt. The earlier fixture error is preserved, explained and superseded by a clean run, not waived. Raw local TAP remains local (hash/length recorded); the complete hosted source log is independently retrievable through the linked run/job, avoiding duplication of potentially sensitive test output. Exact counts, inventory and hashes are evidence of engineering checks only, not strategy economics or deployed/runtime verification. The165 closed root files remain; three retained newer tests bring the actual root inventory to168. No unchanged nested/gated source receipt is reopened or counted as a new check.

After Claude accepts this exact delta, ONE owner approval request must name source/binding/inverse/tool/tested pins and these fixed dates, accept the finite missing-witness inverse/qualified scanner distinction, natural-adoption exposure, explicit late recovery/interruption/retrospective risks and restored Stage1 residuals, and require verified existing Actions$0 control plus fresh actual readiness/attendance. No keys, encryption, Stage1 amendment, guard, workflow/settings action, acquisition or task hold is included. A passed root suite is not operational READY. No approval is requested from this review document itself.
