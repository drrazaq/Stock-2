# Final ACTIONS maintenance procedure r3 — approval and focused confirmation pending

**PREPARATION ONLY.** No scheduling, Disable/Enable, cancellation, protected execution, deployment or production messages are authorized by this document. Quoted instructions below are future templates, not instructions to click now. This is the one current ACTIONS procedure; it supersedes the earlier two-workflow proposal. The exact nine-file code approval stands unchanged. Watcher and mentor are excluded.

## 1. Scope, operator and fixed artifacts

C1–C4 from [Claude review d808d06d](https://github.com/drrazaq/Stock-2/blob/d808d06da56b353b134ded5f64eaa265d838f71e/docs/actions-maintenance-review-7bfdce3c.md) are accepted. Communication safeguards come from the corrected r5.5 §14 in `docs/mentor-release-handoff/PROCEDURE.md` at that same commit, including the corrected late-click table. Scope substitutions are explicit: nine ACTIONS paths, PR1 write ledger, and **no mentor rollback transfer**.

**Proposed sole release and rollback operator: Claude.** Codex provides development preparation/read-only review only, makes no competing production push and has no ACTIONS takeover authority. The owner alone performs the two bot workflow clicks. Claude performs the one specifically approved pending-run cancellation, if all fresh checks pass. No blanket cancellation or automatic role transfer.

| Fixed artifact | SHA256 |
|---|---|
| production-standalone.patch | a9560969298368490a0b3cbd5b151e429b7d68b2bc302ba35025ccebb0981a53 |
| standalone-manifest.json | 545e1a7775f43f6b3b6b8e72c84a6f8e47c8ecde0b560128695ab17f2a67cd2b |
| rollback-standalone.patch | 4e28ee37e58e8f0ea57b3d70a09438562efc12aaa8a5a1e9075df3927c6d91c9 |

Runtime scope is only `scan.mjs`; the other eight paths are tests. No financial records, offsets, workflows, strategy/gate rules, secret bindings, provider routes or unrelated files change. No full-PR merge. A review-companion test or report is not an added production patch path.

[Telegram bot replies](https://github.com/drrazaq/Stock-2/actions/workflows/bot.yml) is the **only** workflow proposed for Disable/Enable. [Stock scanner](https://github.com/drrazaq/Stock-2/actions/workflows/main.yml) stays enabled throughout. Its off-hours schedule reduces overlap but never replaces fresh writer checks. Neither workflow is changed now.

## 2. Capability and attendance gates

Claude's review reports its connector can read actual workflow states, runs, every attempt/job and at most the last5,000 job-log lines, and cancel a run by ID; it cannot Enable/Disable workflows. A small complete bot log can fit that cap; a larger hosted Tests log does not. Full hosted assessment uses the separately activated Codex read-only handoff in §8, not a claimed Claude capability. At readiness Claude must confirm those capabilities remain available, ordinary non-force publication/rollback access works, and the prepared inverse is compatible. No production write, cancel test or substitute credential is used to prove capability. An unavailable read/control required by the procedure means no entry.

Claude uses authenticated API readbacks for workflow verification; owner readbacks are supplementary. Codex's HTTP400 limitation is not attributed to Claude. Conversely, a past Claude read is not a current read. Before Disable, establish `bot.yml=active` and `main.yml=active`. If either differs, stop; this procedure does not enable an already-disabled workflow or change scanner state.

Propose an **attended readiness assessment Wednesday4November2026 at05:00UTC /08:00 Kuwait /00:00 New York**, not a scheduled action. Select actual active bot job J with projected natural end E in05:15–08:00UTC, derived from the actual shell-loop start plus330minutes, not creation time. Re-derive it at readiness; the review's approximately05:50UTC projection is not evidence. E is a planning time: actual successful completion and saves are indispensable. If date, attendance, permissions or timing fail, no attempt. Nothing wakes an idle operator reliably by promise.

## 3. Visible communication and outstanding clicks

Only a **turn-ending message** carries an owner instruction, request, decision or VERIFIED result. Mid-turn output is not a delivered instruction. Each visible message states send time UTC/Kuwait, current state and next wake deadline. Owner code words are **ACK READY, DONE DISABLE, DONE ENABLE, NOT CLICKED**. Owner messages are answered first; Claude's reads, aborts and rollback do not wait for a code word. Specific approval to cancel P is an additional explicit run-ID decision, never inferred from ACK READY.

Monitoring is continuous only during an active turn. A bounded read-only poll/wake can be prepared at the authorized window (30second GitHub-state/ref polls, ending on change/deadline); it is not a guaranteed wake. No background poll, scheduled message or timer is installed now. Between turns the owner may have to message Claude. While a request, drain, write or block remains open, Claude ends a turn with visible status at least every15minutes; during drain, no later than15minutes after Disable confirmation and by E+7.

**20minute silence /10minute ping:** after20minutes without a visible Claude message following Disable, the owner PINGs Claude. No response within10more minutes is an escalation, not evidence a write settled or permission for another writer. The bot remains disabled pending verified restoration. This ACTIONS scope does not borrow mentor's Codex transfer. Any replacement operator needs a separate explicit owner decision, exclusive handover and resolution of every outstanding write; no unattended availability is promised.

Track requests independently of acknowledgments:

| Request | Reconciliation and late-response rule |
|---|---|
| REQ-D, Disable | Read actual `disabled_manually` on every wake even without DONE DISABLE; or owner explicitly says NOT CLICKED. A missing/late acknowledgment does not mean no click. At the cutoff, absent a verified Disable, no deployment; keep reconciling. At E+30 with no resolution report `UNVERIFIED: REQ-D outstanding` and ask for NOT CLICKED or notification of a later click. A deadline never clears REQ-D. |
| REQ-E, Enable | Only after fresh code verification, no UNKNOWN write, writer clearance and REQ-D reconciliation. Read actual `active` even without DONE ENABLE; acknowledgment alone is insufficient for VERIFIED restoration. If absent after10minutes, send a new visible instruction only after refreshing all gates. Report UNVERIFIED restoration until actual API state is active. |

If Disable is first verified **after E−8**, do not deploy. Read the actual state and reconcile REQ-D, then verify the original code/pins freshly **after that click**, resolve all writes and obtain writer clearance before a visible `VERIFIED V0 – CLICK ENABLE NOW`. Never reuse pre-click verification, tell the owner to Enable unilaterally, or infer NO ATTEMPT from silence. Late ACK READY or DONE DISABLE never revives an expired window. An independent owner override is recorded as outside the procedure, not falsely VERIFIED.

## 4. Baseline and writer contract

M0 is readiness main. M is the **immediate pre-release parent**, not a historical e15ce188 checkpoint. Verify all17 before/dependency entries and the three artifact hashes. Any pin change requires reconciliation before release; passing tests do not bless changed protected bytes. Unrelated new lab files do not automatically block release: enumerate the current tests, build baseline and candidate from their actual source, and include the new files in both. Changes affecting a caller or state authority must be reconciled, not dismissed as unrelated.

Run ordinary Node20 `node "$f"` for every registered `test/*.test.mjs` on M's source and on M+exact patch; no historical clock. Only the accepted TRY SMALL cases1/3b may fail, or none. Any other failure requires reconciliation. If M advances from M0 only in data and the entire tested source/test/dependency set is identical, record the source identity proof; otherwise rebaseline both trees on the new M within the preparation deadline or abort. Preserve all intervening data. The nine after hashes and added-file absence requirements must match exactly.

The last independently reproduced broader totals were130/131 baseline and132/133 ACTIONS; registered totals were129/130 and131/132. The extra file is `tests/instrument-type.test.mjs`. Those are historical counts, not a fixed future file-count gate.

**Fresh writer check WC** at entry, throughout drain, immediately before and after **every** D/R push or retry, and before Enable: complete all-status/all-attempt/job listings for bot/scanner and any workflow executing `scan.mjs`, plus affected state writers (`discover.yml`, `movers.yml`). Check actual checkout/execution source when needed; a run's head SHA alone is insufficient. Listing gaps or unknown execution block mutation. At entry/drain only designated J may execute; designated P may be pending with zero jobs. Before code mutation: J terminal SUCCESS with §6 proof, P conclusively cancelled without any job execution (or absent if none was designated), no active/queued/waiting affected writer, bot disabled by fresh read, scanner active, and no UNKNOWN code write. A new active/pending scanner blocks the push; do not pause or cancel it.

Unrelated research/data writers may continue only where they do not execute this caller or mutate its authoritative financial/offset state. Preserve their commits by building D/R on fresh main. Before/after mutation verify all pinned bytes and the entire data tree against that exact parent. If an unexpected writer appears after D/R, inspect actual executed bytes, report any old/unknown-source writer, let it drain naturally and do not roll back underneath it. Schedule predictions are never WC evidence.

## 5. The one cancellation P

At readiness publish P's **numeric run ID and exact run URL**, event, attempt list, pending status and complete zero-job evidence. The owner must explicitly approve **that one ID**. No present document preapproves41600894879 or any future replacement. If there is no P, no cancellation is needed. Multiple pending runs, replacement of P, manual-event ambiguity or incomplete history means no cancellation/entry under this scope.

After verified Disable and before J ends, Claude re-reads P and all attempts/jobs and confirms J still active. Cancel **only P**, only if the specific owner approval exists and no job has started. Do not cancel J, an active writer, another pending ID or a replacement. If P has gained a job, do not cancel: abort deployment, let it finish naturally and follow verified restoration. A submitted cancellation is not proof of completion: re-read terminal `cancelled` and zero jobs. Unknown outcome or a race is reported honestly and blocks deployment; do not retry blindly or label an executing cancellation a safe no-op. An unresolved cancellation is an outstanding operation: reconcile its exact outcome and writer state before any Enable request; otherwise a delayed cancellation could affect a resumed writer. It does not become settled from silence or an acknowledgment.

## 6. Final-save evidence — five-condition silent-save contract

J must end naturally with SUCCESS, the main shell step complete and full authentic job log available. Job success alone is insufficient: production `save()` can emit a save error and still exit0. Inspect **executed output**, distinguishing it from the echoed shell source containing the same error literal. An actual `Error: could not save the data folder to the repository`, reply/full-check failure affecting recording, failed/unknown publication, truncated evidence or unaccounted state blocks D. Do not publish raw private logs, records, offsets or identifiers.

Record the final persisted data-tree and offset-file blob identities privately, verify ancestry/presence on fresh main and preserve them across D/R. Check the actual source/state authority; no protected key, decryption, transaction recovery, offset reset or financial reconciliation is authorized. Public commit timing/log inference is not authenticated proof of all historical intentions.

The D1 review at [0fc705a9](https://github.com/drrazaq/Stock-2/blob/0fc705a95dba940c71cf5af5d635d597c347d25a/docs/actions-procedure-confirmation-873fd2bb.md) replaces the prior run-local trace requirement. Accept a silent completed save sequence only when **all five** conditions hold:

(a) J and its main loop step are terminal **SUCCESS**; no caught caller outcome is represented as an independently successful command.

(b) Retrieve J's **complete** authentic job log: starts with setup, includes the whole loop step and ends through Post job cleanup, with line count below the reader's cap and no truncation indication. A final tail alone cannot pass. The reviewed sample job125684790153 has196lines and is within Claude's5,000line cap; a future larger/incomplete log is UNVERIFIED until a full read is available.

(c) Verify the echoed full script and actual shell line against the exact pinned workflow, byte for byte: `bash --noprofile --norc -e -o pipefail`, standalone `save; mirror` calls, exact embedded `save()`, and unchanged loop/redirection behavior. The bot uses **its embedded save**, not scanner `.github/save-data.sh`. Verify tracked authoritative data, including the offset file, is within `git add data`; stage1 mirror does not alter public authoritative data after save. Unexpected source/state-authority differences require reconciliation.

(d) There are **zero executed output lines over the entire loop step**, after the echoed-script/env group and before cleanup—not merely during the last save. Echoed source is not execution output. Any executed line (`fatal:`, `error:`, rejection, save error or other output), incomplete evidence or ambiguous boundaries means BLOCKED under this conservative branch. A later quiet no-op must not hide an earlier failed publication.

(e) Verify J's checkout SHA and all identified `bot …` save commits from its execution are ancestors of fresh main, with complete relevant history and existing writer/checkpoint checks. A commit label/time alone is not authenticated job attribution. If that membership/ancestry cannot be established, report UNVERIFIED; no empty/new commit is manufactured. Check the persisted final checkpoint and any subsequent authoritative state changes separately before D.

**What this supports:** under this pinned standalone `-e` control flow, a failed `git add`/`git commit` fails the step. A completed changed save either publishes or, after all five refused attempts, emits output. A no-change save returns without making a commit. With the whole-step silence and ancestry premises, completed saves leave the tracked Git-managed data checkpoint previously published in main's history. This does **not identify which individual saves changed data**. It does not require an artificial final commit.

**What it does not support:** ignored/untracked files, the freshness of a silently failed initial pull, semantic correctness of financial state, historical command intent, successful scan/reply execution, every Telegram command saved, or equality to the latest remote state without the separate checkpoint/writer checks. Scan/reply errors are deliberately caught into `run.log`, and the initial pull error is deliberately suppressed; five-condition silence cannot exclude those. Known recording errors still block under the preceding requirements. Original historical uncertainty is not repaired or waived.

[Exact-shell offline evidence](silent-save-D1-evidence.json) independently matches the196line sample's echoed script/shell and zero loop output; it does not certify a future J or retrospectively certify all five conditions for that sample. [Actual-save companion](verify-save-evidence.py) passes9cases: legitimate changed/no-change saves, refused push, later silent no-op with stale unpublished HEAD, silent commit failure, add failure, caught initial pull failure, and caught full-check/reply failures. It uses exact five-attempt save logic and actual shell flags; only synthetic node responses and sleep duration are mocked. No real financial command, record, instrumentation or new production commit is created.

Pending Telegram commands remain behind the existing persisted offset. Never call getUpdates to test, consume messages, reset/replay offsets, fabricate a trade or assert commands processed from job success. Normal naturally scheduled service resumes later. Record the gap; retention is not indefinite (Telegram updates can expire after about24hours).

## 7. One timeline, code verification and rollback

| Phase | Mandatory action / deadline |
|---|---|
| Entry from E−45 | Claude confirms access, exact code/parent tests, prepared inverse, states, J/E, P and run-ID approval. |
| E−30…E−20 | Visible turn-ending `OPERATOR READY`; names J, P, E, next wake and asks ACK READY. |
| By E−12 | ACK READY required. Only then send visible `CLICK DISABLE NOW` at E−15…E−12, with the bot-only link; open REQ-D. |
| By E−8 | API must read bot `disabled_manually`, scanner still `active`. Check independently of DONE DISABLE. Otherwise no deployment and reconcile any outstanding click. |
| Before J ends | Claude cancels only approved P after §5 fresh checks and verifies terminal zero-job outcome. |
| By E+10 | J must finish naturally with §6 proof and WC pass. Otherwise ABORT A, unchanged code; restoration gates still apply. |
| Preparation ≤10minutes | Fetch M, establish immediate baseline identity, exact D/inverse/pins/data proof and fresh WC. End visibly `D READY – PUSH TURN NEXT`, with1minute wake deadline. |
| D push by E+20 | One active push turn: fresh WC/states; post authoritative PR1 `PUSHING D=<sha> ONTO M=<parent>` before the request. Publish only normal isolated D. No release push after E+20. |
| D push +10 | Wait for ordinary hosted CI/log verdict (§8) in the active turn. Baseline-relative accepted result → verify V1. New failure/missing result → ABORT B in that turn: fresh WC, exact R on fresh parent, record/publish R and verify V2. |
| Push turn ≤15minutes | CI target≤10, rollback target≤5. Targets do not override writer/UNKNOWN/compatibility gates. If blocked, end visibly with D status, exact blocker/run ID and next wake. |
| Enable target E+45 | Only fresh VERIFIED V0/V1/V2, no UNKNOWN, WC pass and REQ-D reconciled allow turn-ending `VERIFIED Vx – CLICK ENABLE NOW`. Owner clicks; Claude independently verifies actual bot active and scanner still active. |

Code states: **V0** original immediate source/pins (no D applied), **V1** exact D after hashes, **V2** exact code-only inverse of D on fresh main. Workflow API readbacks are recorded separately; do not confuse a code V1 with a disabled-state receipt. Verify actual bytes, not just commit names.

D is a direct child of exact parent M, changing only the approved nine paths. Use the reviewed normal non-force publication method; no broad merge, force push or overwrite. Each main-ref request is pre-recorded with operator, parent, candidate SHA/tree and exact intended scope in PR1. **APPLIED** needs positive evidence of that exact commit on main/ancestry. **NOT APPLIED** needs definitive terminal rejection of that exact request. Otherwise **UNKNOWN**; later main movement, timeout, silence, owner instruction or review never settles it. While UNKNOWN: no retry, takeover, VERIFIED clearance or Enable request. Report it visibly, re-read and keep the bot disabled; no automatic deadline clears it.

ABORT A: if D definitely never applied, freshly verify V0/pins/data preservation and all restoration gates; reconcile clicks and restore service. ABORT B: R is only `rollback-standalone.patch` on fresh matching nine after hashes/dependencies, preserving every intervening data/unrelated commit. Never revert an old whole tree, restore data or offsets, or add fixes. Check WC/states before every R mutation. Any retry requires definitive NOT APPLIED, fresh parent/data/pin verification and a recorded candidate; at most one retry for data-only advancement. UNKNOWN forbids it. If a writer blocks R, let it drain naturally, no cancellation/suppression; later deadlines become conditional, never guaranteed. Missing inverse compatibility means report and reconcile, not force it.

## 8. Baseline-relative hosted verification and restoration

`tests.yml` fails its whole job on any failed file; its red badge is **neither release success nor automatic new regression**. Read complete ordinary job logs for the exact D and immediate parent baseline. Verify the complete current registered file list: every other file PASS, only `test/try-small-audit.test.mjs` failed, only cases1/3b within it,14pass/2fail there. No timeout, missing file/result, extra failure or unrelated failed required check is accepted. If both parent/candidate pass that file, record it; do not require a failure artificially.

Actual GitHub logs normalize the emitted `::error file=...` into `##[error]test file failed` inside the file's group. [Baseline normalization evidence](ci-log-normalization-evidence.json) verifies exactly one test-file failure annotation in the TRY SMALL group and129 PASS lines; the terminal exit1 message is the consequence, not another failed file. The echoed shell `echo "::error..."` is not a test failure. Inspect raw directives **or their authenticated normalized group/annotation equivalent**, never count source echoes. Cases/names/results, rather than an old hard-coded total or a badge, determine disposition. Other new baseline failures still require reconciliation under the owner's rule; they are not grandfathered because the parent has them.

### Full hosted-log read-only handoff (D2; primary gate unchanged)

Codex's current `github_fetch_workflow_job_logs` route can retrieve complete decoded logs beyond Claude's5,000line limit. [Observed access/assessment](hosted-full-log-access-evidence.json): actual production Tests job125814418123 at exact7bd91089 has8,250lines, all130registered groups and129PASS/one accepted file failure; development20ad7211 job125878630898 has16,699lines and all268registered groups/PASS. Both include setup, exact checkout SHA and cleanup. They demonstrate retrieval/assessment capability, **not logs for the as-yet-uncreated isolated ACTIONS release**. Simulated last5,000line reads miss49/181groups and are explicitly UNVERIFIED.

Claude remains sole code operator. **Codex is read-only log verifier, with no deployment/rollback/cancellation/transfer authority.** At readiness the owner must actively start Codex's session for this narrow read-only assignment, and Codex must confirm actual tool access and active availability; a historical READY or PR notification is not a wake guarantee. Plan baseline assessment before any Disable and active release-log assessment within the D push turn. The baseline assessment and release assessment are separate activations: a completed baseline turn does not keep Codex awake. Immediately before D, activate Codex with the prepared candidate/parent and deadline; require a current read-only-verifier-active acknowledgment while its assessment turn/poll remains active. If the required reader is unavailable, do not enter/push. No scheduled wake or background availability is promised.

Handoff in PR1: exact M/D SHAs, actual workflow/run/job IDs and attempts, ordinary Node20 invocation and expected registered file inventory/source hashes, and the D push/CI deadline. Codex independently reads run/job metadata and actual checkout identity, downloads the full log via its own connector, checks setup/cleanup and truncation/completeness, enumerates **all** expected groups/results, inspects all failures/other job steps and posts a sanitized exact-SHA receipt: byte/line counts and SHA256, covered/expected files, accepted failures, metadata conclusion, assessment and limitations. Raw private data, identifiers, credentials or real-message contents are not posted. Claude verifies that receipt against M/D, preserves it and alone decides V1/abort. No receipt, partial/wrong-SHA/missing-job evidence or result after the push-turn deadline remains **UNVERIFIED**; after D applied use the existing ABORT B/inverse gates, never pretend it passed.

The exact immediate parent M can be data-only with **no hosted Tests run**: current e15ce188 has zero check runs. This is absence of evidence, not a successful baseline. Before entry verify the required M hosted run exists; before D reconfirm for the actual parent. Another commit's logs (even source-equivalent), a local run or an old green badge do not silently satisfy an exact-commit hosted gate. No manual dispatch or fabricated commit is authorized to create evidence. A missing exact M run blocks this primary route. The future actual isolated D also has no log before it exists; no anticipatory PASS is claimed.

[Separately proposed local-exact-run plus hosted-tail alternative](hosted-tail-alternative-NOT-ADOPTED.md) addresses missing full-log/parent-run evidence. **It is not adopted, not an automatic fallback, and does not modify this gate.** It needs focused independent review and an explicit owner decision on the changed verification standard before any maintenance starts.

No Enable instruction until all gates hold, however late. Re-read actual workflow state regardless of DONE ENABLE. If REQ-E is open after10minutes, visibly repeat only after fresh checks. Final restored reports require bot `active`, scanner still `active`, no outstanding REQ-D/REQ-E, exact verified code and no UNKNOWN write. After a blocked target keep explicit UNVERIFIED status; do not leave the workflow disabled silently or promise an absolute outage bound.

Plan roughly45–75minutes from E to the first natural bot restart, **not a guarantee**. A60minute suppression target is also conditional. GitHub queueing, missing save/CI evidence, an intervening scanner, UNKNOWN or missing owner/operator response can extend it. Normal bot cron is every30minutes; no manual dispatch is allowed. Observe the next natural job's actual scan bytes, subsequent saves and offset continuity without test messages; don't claim queued commands processed without evidence. Record suppression and actual response-service gap separately.

Final visible outcomes only: `VERIFIED V0/V1/V2, restored`; `NO ATTEMPT, nothing changed` (requires no outstanding click or write); or `UNVERIFIED: <exact open condition and follow-up>`. No scheduled wake, maintenance or production action has occurred in preparation.

## 9. Decision and focused confirmation

Claude's **focused confirmation of this exact r3 D1/D2 revision and companion evidence is pending**. C1–C4 passes from0fc705a9 are preserved; their communication/operator/writer rules are unchanged. Preserved C1–C4 mapping: §§2–3 communication/readback/operator; §§4–5 scanner and one-ID cancellation; §8 immediate-baseline CI; §6 the five-condition persisted-checkpoint proof. This is not another general package review. Do not claim Claude confirmed an unreviewed revision.

After that confirmation the smallest additional owner decision is: designate Claude as sole operator; confirm proposed4November attendance/E bounds; permit **owner Disable/Enable of bot.yml only** under this procedure; and separately approve **one exact P ID** after readiness publication. Scanner remains enabled. Existing nine-file code approval is preserved, not requested again. No automatic Codex handover is included. The owner must explicitly accept conditional service-gap timing and all stop/restoration rules. If the final-save evidence cannot meet §6, approval does not waive it: no deployment.

Suggested additional-authorization text (not granted):

> I approve this exact ACTIONS procedure revision after Claude's focused confirmation, with Claude as sole release/rollback operator and myself performing only bot.yml Disable/Enable clicks. Stock scanner remains enabled. I confirm the proposed4November attended session subject to fresh J/E/readiness checks. Cancellation is limited to one specific P ID I separately approve after its fresh zero-job evidence; no active writer or replacement ID may be cancelled. Preserve the already-approved nine-file patch/inverse, every data/financial/offset/unrelated byte, baseline-relative tests permitting only TRY SMALL1/3b, truthful save evidence, UNKNOWN handling and verified restoration. No missing save proof is waived and timing targets are conditional. No watcher/mentor deployment, full-PR merge, dispatch, fabricated command/trade, real test message, provider probe, collection expansion, order, purchase or secret/permission change.
