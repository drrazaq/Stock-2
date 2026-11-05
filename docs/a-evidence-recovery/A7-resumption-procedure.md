> **5 November — collector/fenced-writer implementation:** [Inactive actual-client/collector/store checkpoint](../a-collector-fenced/README.md) and [single setup-only approval request](../historical-audit-invocation/setup-only-approval-request.md). SIP protocol and retained-primary receipt adapters, persistent request intents, immutable first-ingestion/revisions, kernel-lock/generation fencing and strict evaluation are implemented/tested offline. No real provider/key/host/boundary or complete close acquisition is demonstrated. Prior strategy/evidence policies unchanged; independent review requested. **0 rows closed;24/40;0 admissions.** Earlier NOT IMPLEMENTED statements below are historical for the newly implemented subcomponents; remaining live/source/close gaps are explicit in the new report.

# A7 preservation, recovery and resumption procedure — review only

Source: Claude1aaf1ddcecdefb1e17bfc3fe364a61981b44588f. No execution, lock retirement, setup, migration, producer activation or permission change is authorized. Current tested capability is forensic secondary reconstruction. **Working authenticated collection/resumption remains BLOCKED** by absent approved collector/writer and a genuine authenticated writer boundary. The procedure below states the finite conditions; it does not turn UNKNOWN liveness into permission.

## Scope and authority

One explicitly activated operator, one named private A store, one frozen input/policy/evidence version and one new destination. A is separate from B/C, financial accounting and the12-case IG1 audit. No financial/private-state migration or resumption is included. No production bot/scanner/watcher workflow is affected merely because it shares the repository. First inventory actual A directory consumers: store CLI/API, capture processes, scheduled/queued jobs, local processes and any publisher that can touch that directory. A public job SUCCESS, PID guess, file age, quiet logs or unchanged snapshots cannot prove intended writes were saved or a writer is dead.

## 1. Entry boundary — fail closed

- Obtain a separate exact owner authorization for the named recovery/resumption operation after review. Record operator availability and exclusive handover. No unattended availability promise.
- On each actual execution host/control plane, prevent **new affected A starts** using a specifically approved control, record its authenticated actual-state readback, and enumerate all active/queued/retry writers. Draining active work is preferred. Any cancellation, workflow/permission change or storage fence requires its own exact authorization; none is granted here. An unaccounted started or retry-capable producer blocks continuation.
- Let active writers finish and verify their final saved files, pending intents, source/offset/input acknowledgments and upload outcomes against authenticated evidence. No financial offsets are consumed/reset. Where a writer has no intended changes, require attributable no-change evidence; never manufacture a save. Unknown publication outcomes remain UNKNOWN and block retries, handover and resumption.
- Establish an authenticated acknowledgement from every writer owner/host that it has stopped and cannot restart against the old directory. Re-enumerate writer state immediately before each mutation. Repeated hashes are supplemental consistency checks, not liveness proof. Missing supported process/job/control evidence means **STOP: boundary unverified**, not “lock stale.”

These conditions are not currently established for any real A store; no actual resumption may begin from this document alone.

## 2. Preserve and reconstruct — original lock stays intact

- Under the held boundary, use the read-only inspector and record every original filename/hash/byte count, implementation/policy/origin and the opaque lock bytes. Preserve the directory unchanged. Do not delete or retire its lock, truncate a log, repair a card in place or replace an outcome. Losing and unresolved outcomes remain evidence.
- Run only reviewed `recoverSecondaryCopy` into a **new private0700 directory**, never reuse/overwrite an incomplete attempt. It retains full originals, marks any secondary-only excluded final tail, requires a unique original pending intent for a torn card, and replays original pending payloads exactly once. Missing logs, mid-chain corruption, committed damage, changed originals or ambiguous intents block completion.
- Require `RECOVERY_COMPLETE.json`, pending0, exact original snapshot equality and the secondary-only manifest fence. Replay-only mode cannot record new observations/outcomes or arbitrary transactions. A normal writer cannot reopen the fenced secondary. Do not remove that fence to make an old writer work.
- Two recovery attempts to one destination have one exclusive winner. A failed/interrupted attempt remains labelled incomplete, retains its bytes and requires a different destination on retry. A source writer changing during copying/replay prevents a complete receipt. These are tested mechanics; they do not replace step1.

## 3. What can resume, and what remains blocked

**Offline reevaluation only:** after authorized preservation and review, existing originals can be read by the strict `a-evidence-runner`, with independently captured coverage and separate trusted roles. Use a fresh private request/output directory and exclusive no-overwrite report. Missing/authentically unavailable evidence remains unresolved; never fetch replacements, backdate ingestion, reuse untrusted legacy outcomes or relabel a secondary reconstruction as untouched confirmation. This is read-only reconstruction/evaluation, not resumed market collection or a new primary writer.

**New mutable authenticated collection:** local cooperative fencing/immutable intent/recovery mechanics are now implemented offline in [the new isolated store](../a-collector-fenced/README.md). Full authenticated source/close acquisition, external-writer fencing, host/custody integration and real primary resumption remain NOT IMPLEMENTED/NOT AUTHORIZED. Before an execution-ready resumption approval, the exact new writer must demonstrate all of the following in offline actual-caller tests:

1. One durable, common control identity for the source/cohort and every writer; an exclusive creation/lease and monotonic fencing generation checked before **every** append, commit, publication and retry. No automatic stale-lock expiry/deletion. A stale/uncertain token fails closed.
2. Authenticated stop/fencing of every old generation. Moving a pointer does not stop an old process with an open file descriptor. If an old writer cannot be fenced/drained authoritatively, no new primary starts.
3. Original archive immutable and still separately labelled; new primary references its exact original/recovery hashes and new evidence/cohort version. Primary switch must be atomic with an expected-parent/generation comparison, not an ordinary blind overwrite. Preserve intervening data.
4. Cross-run issuer/session and outcome idempotency, complete independent acquisition coverage and original first-ingestion lineage; durable pending-intent recovery at each write boundary. Verified result attachment must call the strict verifier, never the retired structural APIs.
5. Exactly one new writer owns the new primary; conflicting starts/refusals/interruption/UNKNOWN writes are exercised with disposable processes/remotes. Publish, save and recovery acknowledgments must be positive and attributable before declaring success.

The present legacy store is intentionally **not** that authenticated writer. Reopening it with `RETAINED_RESEARCH` for new evaluations is disabled. The structural rehearsal API is explicitly synthetic/unauthenticated. Do not interpret the gate or absence of a writer as “recovery complete.” Actual acquisition, fencing integration and authorized host controls are implementation/operational prerequisites, not merely a request for more credentials.

## 4. Abort, rollback and exit evidence

If source hashes change, a writer/retry appears, a write is UNKNOWN, evidence is incomplete or no verified code/control state is available, stop before any primary switch. Preserve original, all incomplete attempts and receipts. No old data restoration or outcome overwrite. Rollback means returning the control generation/pointer only through the same atomic comparison **after fresh writer checks**; never copy an old snapshot over intervening writes. A primary generation already written cannot be silently discarded. If the required primitive is unavailable, the switch/rollback remains blocked.

Record exact source/code/policy/recovery hashes, operator, boundary evidence, writer/queue state, all mutations and acknowledgments, first/last save and remaining uncertainty. Restore only the affected starts to their verified original state after success or safe abort, under the separately authorized control procedure. No conflicting late control requests may remain unresolved. Any service interruption must be recorded; there is no guaranteed outage duration. Current preparation performs none of these operational actions.

## Tests and remaining decision

Real SIGKILL at all four original transaction stages for observations and losing outcomes; exact-once replay; partial tail/card; immutable committed outcomes; mid-chain corruption; missing original files; source mutation; competing processes and normal-writer secondary fence remain tested. New replay-only guards reject all fresh record/append/materialize/transact paths. Next independent review should distinguish these mechanical passes from the indispensable real writer boundary and the still-missing fenced authenticated writer. No lock is retired by this proposal.
