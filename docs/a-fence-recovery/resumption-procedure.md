# Inactive A recovery/resumption procedure — K1/K2

Preparation and synthetic testing only. This is not permission to operate a real store, add a key/binding, recover a transaction, migrate private state or activate a cohort. Existing approvals for unrelated releases are unchanged.

## Entry prerequisites

An approved operator must first establish the actual exclusive writer/host boundary and identify the exact store, code/contract/cohort, capacity and original evidence. Preserve a private byte-for-byte copy before any authorized transition. No unchanged-file or quiet-log inference substitutes for that boundary. Use the reviewed current worker, not a retired worker copy. No simultaneous remote/copy writers. The kernel lock stays in place; do not remove it to clear a busy result.

K1 additionally requires a recovery public verification root **already** approved/pinned at new-store creation, and a separately controlled authorized signer. This offline package provides only the verifier and synthetic tests. A legacy store without that root stops at `RECOVERY_AUTHORITY_NOT_CONFIGURED`; do not use the old token to enroll an owner. Actual root/bootstrap/custody setup is a separate approval.

## K1 — permanently unresolved original, authorized new generation

1. Read `head()`, `recoveryView()` and `generationAttempt()` under the held host boundary. Record the exact current head, full sorted incomplete-intent descriptors and unclassified data partials privately. Distinguish missing original bytes from a verifiable exact replay. Never fetch replacements to make a historical intent appear complete.
2. Prefer existing same-generation exact-byte recovery when the actual original is retained and verifies. If it cannot be established, the owner must explicitly authorize the **complete** unresolved inventory and next owner. The signer signs the fixed-schema request described in README, bound to store UUID/cohort/contract/previous head and boundary evidence. Do not publish private descriptors or signer material. No library inference grants that authority.
3. Before mutation, re-read the real boundary and current inventory. If another attempt is already recorded, settle it using K2. Otherwise call `recoverUnresolved({authorization})` exactly once. No token-only disposition. A writer-busy result is a terminal no-start refusal; an interrupted/unknown result requires inspection, not a different attempt.
4. Read the exact attempt/head/receipt. If incomplete, use K2. Complete only when the expected target head, recorded request hash and generation-completion receipt agree; validate all signed UNRESOLVED markers and preserved original byte hashes. A response reporting an error does not prove the transition was unapplied.
5. The old token must be stale. The new token may retain **research context only** in this tainted store. `head().unresolved` remains positive, disposed IDs stay UNRESOLVED and strict/historical evaluation is not admissible. Missing evidence and losing/unknown outcomes never disappear from completeness. No clearing operation exists. Later-found bytes belong in separately labelled secondary context; originals/dispositions are immutable.

## K2 — deterministic interrupted generation

1. Read `generationAttempt()` or its explicit generation. For RECORDED, preserve its request and `attemptHash`. Verify owner/signature/bindings, old/target head and original generation bytes. A conflicting request or head beyond the target generation stops; no takeover, head restore or old data restoration.
2. Call `resumeClaim({generation, attemptHash})` for that exact recorded attempt. It regenerates only deterministic control state and keeps every original attempt/partial. It does not reconstruct market evidence or invent an authorization. Recheck the boundary before doing so. An already-completed current attempt returns the same head/token without creating another generation.
3. `ORIGINAL_REQUEST_REQUIRED` means the first write died before the complete authorization was recorded. Only an operator-retained **identical original request** with the matching hash may be replayed through `claim` or `recoverUnresolved`. If unavailable, remain blocked. Partial bytes or a new owner request do not substitute.
4. `LEGACY_GENERATION` is an old-format generation file with HEAD not advanced. Inspect its exact retained owner/time/boundary/previous-head/cohort/contract. Pin its raw-file digest using `generationAttempt`. `resumeClaim` derives only those exact values, preserves its bytes, records the explicit replay and advances HEAD. If the store requires an authority, supply the matching approved claim authorization; never change the historical owner/time to make it pass.
5. Final verification: correct target generation and completion receipt, original files unchanged, old tokens refused, no pending transition, no removed lock/intent/partials, sticky unresolved evidence still visible. Only then may an already-authorized new research writer resume. The library does not start a process, provider request, workflow or collection automatically.

## Stop conditions

Invalid/missing authority, changed/omitted inventory, wrong store/contract/head, conflicting takeover, invalid signature, corrupt intent/attempt/receipt, unexpected late commit, inode/symlink/permissions/lock changes, insufficient capacity or unavailable exact original request all remain UNVERIFIED/UNKNOWN. Preserve private artifacts and report the fixed error category to the authorized custodian. No stale-lock deletion, truncation, evidence replacement, unsigned owner change, selective exclusion or repeated guesses to obtain success. A failed operation is not a license to restore an old head.

The host boundary is indispensable: a recovery marker cannot make obsolete arbitrary code or an administrator obey it. The updated protocol blocks normal writes while a transition is pending; a new HEAD fences old-token writers. The tests exercise that exact distinction. No real execution, boundary, authority installation or service restoration is claimed by offline passes.
