# K1/K2 — authorized unresolved recovery and deterministic generation resumption

Inactive development follow-up to Claude's [446cd250bfe1aba6e8e5b949223d5fe4732cb9d2 review](https://github.com/drrazaq/Stock-2/blob/446cd250bfe1aba6e8e5b949223d5fe4732cb9d2/docs/review-572dc5ae/README.md), PR1 comment6661973064. Fresh base **7ee150f854b23c0f6066a6407e3d52e3a3b774ac** and all prior native-source work are preserved. Ownership coordination: PR1 comment6663566428. No setup, real keys, provider calls, collection, production state or workflow actions. Real-key enrollment, operating this transition and activation are not authorized here.

| Finding | Reproduced baseline | Corrected offline behavior |
|---|---|---|
| K1 | Published original worker permits unrelated old-generation appends after a missing-body intent; exact recovery fails and a new claim is blocked. | Only exact pending replay can proceed in that generation. A separate signed recovery request binds the store, head, full incomplete inventory and next owner. The original intent becomes permanently UNRESOLVED; no missing body or success receipt is invented. The new head fences old-token writers; research can continue in the new generation, but this store's evaluations remain unresolved. |
| K2 | Original generation file written before HEAD, followed by a different claim, refuses with IMMUTABLE_RECORD_CONFLICT; no explicit replay record/procedure. | Record the full attempt first. Every subsequent control write derives from it. Exact pinned resumption is idempotent; different owner/context/attempt is rejected. Genuine old-format generation residue is resumed only from its exact retained values, without rewriting it. |

The baseline `.source` fixture is the exact public store module from7ee (SHA2567ddff2773a6a7b82a9b4d090575978630303d827ca814ec16c54c3a0ef164065). Tests execute it in separate processes with unchanged public dependencies. Expected-defect assertions apply **only to that immutable baseline**; current implementation assertions require the corrected behavior. No original trading result or private record is a fixture.

## Authority and scope

A fresh store may receive one explicitly supplied **public** Ed25519 recovery verification root at creation. The new optional `recoveryAuthority` field is immutable with `STORE.json`; its public key is canonicalized and fingerprinted. This package installs no real root or signing key. Test signatures use ephemeral synthetic keys only. The verifier does not load environment keys or possess a signer.

A recovery request contains only `keyId`, a fixed-schema `body`, and `signature`. It signs the canonical evidence hash of:

- action `DISPOSE_INCOMPLETE_AND_ADVANCE`, schema, store UUID, cohort and contract hashes;
- exact previous-head hash, next owner, declared boundary time and boundary-evidence hash;
- the **complete sorted** incomplete-intent descriptors (key, original intent-byte digest, record hash, kind, logical ID), and all unclassified original-data partial-file descriptors.

The old token is only a compare-and-swap/fencing value. It cannot create or authorize this request. A key or public root included by the requester is not accepted as trust authority. Signatures from the wrong key, altered owner/context, another store, omitted intent, stale inventory or token-shaped signature fail before a transition. Once a root is configured, later ordinary generation claims also require its signed `CLAIM_GENERATION` request; only the initial fresh-store bootstrap uses the already-established private host boundary. Existing same-generation exact-byte `recover(token)` remains a replay of already-retained evidence, **not** authority to dispose it or transfer ownership.

**Legacy stores without a previously pinned recovery authority cannot self-enroll one using their token.** They may replay verifiable exact originals or use exact old-format generation resumption; unresolved disposition is refused. Any actual legacy authority bootstrap/migration requires a separate reviewed, approved setup scope. A supplied verification root does not prove owner identity or an authenticated writer boundary. Private0700/0600 storage, kernel flock and a protected exclusive host remain prerequisites. Tokens are not credentials; this library cannot stop a malicious same-UID filesystem administrator, copied stores on different hosts, or arbitrary obsolete code that ignores the updated protocol and rereads new tokens. No real boundary is inferred from quiet or unchanged files.

## Transition order and permanent missingness

1. Verify the fixed-schema signature, expected head, original byte hashes and complete inventory while holding the existing permanent kernel lock.
2. Preserve the full immutable generation attempt and original request. Its hash is the replay identity. Pending transitions block normal updated callers, including token-derived writes.
3. Preserve the exact next generation and staged head bytes. Atomically advance HEAD. **Old-token writers, including the actual baseline worker, are now stale even if recovery stops before disposition.** A real legacy-writer drain/exclusive boundary is still necessary before this atomic step; the marker alone cannot fence obsolete code before HEAD advances. Revalidation refuses changed inventory rather than guessing.
4. Write immutable per-intent/per-partial UNRESOLVED dispositions, referencing the signed original request and original byte digests. Never delete/truncate the intent, raw evidence, partials, lock or prior attempts. A disposed logical ID cannot later be overwritten or completed; genuinely recovered bytes can be retained under a separately labelled secondary research ID.
5. Publish the immutable generation-completion receipt. Until then, normal updated writes remain blocked. A crash after this receipt may have completed the transition: read back the exact recorded attempt/head/receipt; do not infer failure from a lost response or start a different request.

Missingness is sticky. `head().unresolved` and lookup `UNRESOLVED` distinguish a disposed intent from NOT_COMMITTED. Strict `evaluate` and historical evaluation lookup return `UNRESOLVED_STORE_EVIDENCE` with0prospective admissions; a previously valid result cannot be reused as a current complete result. Old committed results stay byte-identical on disk. New-generation research originals may be retained; they cannot clear the missingness or resurrect the incomplete logical ID. Source joins and close adapters preserve their original data and return UNKNOWN with `STORE_EVIDENCE_UNRESOLVED`. The actual collector cannot redial a disposed request.

This is a storage/evidence recovery rule, not a strategy, ZAD, risk, cost, sampling or enrollment policy change. It does not turn a synthetic or unauthenticated case into prospective evidence.

## Crash/resumption contract

Read-only `generationAttempt()` reports the active or latest recorded attempt. `resumeClaim({generation, attemptHash})` replays only that exact stored request. A configured store re-verifies its original owner signature, all bindings, generation bytes and completion receipt. A changed head beyond the target generation or conflicting takeover is refused. A different signed owner still cannot replace the first recorded attempt.

If the process dies while **first recording** the attempt, its retained control filename identifies the request hash but may contain only partial bytes. Status is `ORIGINAL_REQUEST_REQUIRED`: replay the identical original request retained by the operator; never reconstruct missing authorization from a partial file. A different hash is rejected. Later torn control files derive from the durable attempt and can be regenerated deterministically; their original partial bytes remain untouched. Control copies are kept separate from `.partial-*` original-data evidence, which needs explicit unresolved disposition. Nothing is aged out or silently removed.

The tests kill actual worker processes during/after attempt, generation, staged head, atomic pointer-copy, disposition and receipt writes. They restart independent workers, preserve original snapshots, test concurrent authorized owners, verify actual old-version stale-token refusal and revalidate corruption. See [the exact offline procedure](resumption-procedure.md), [verification](verification.json) and [manifest](manifest.json).

Limits remain **16MiB total /2000 files**, private anchored filesystem and15second worker timeout. Preserving interrupted files consumes those same limits; capacity/permission/authority/corruption failures stop safely. No automatic space cleanup, changed budget, new permission, root installation, signing service or remote custody is added. Physical independent capture, source authenticity, full prior-run evidence, primary acquisition and reviewed close/evaluator integration remain missing. The earlier native package/report is retained at7ee; its consumed manifest now explicitly records this authorized dependency/guard revision.

## Acceptance and next action

K1/K2 are **offline implementation/tested, independent confirmation pending**. Prior store12, collector38 and native-source46 controls are retained. ACTIONS-04/A7 and REPO-03 advance; CATALYST-03/EXEC-03 receive composed UNKNOWN/missingness evidence. **0rows closed;24/40 accepted,16open;0real prospective admissions.** Original40 criteria, frozen protocols, original data, production modules and strategy/ZAD gates remain unchanged.

Next: Claude's focused confirmation of the exact recovery package and native composition, then outstanding source-close/strict-importer work. Real authority enrollment, host/writer boundary, custody and any collection remain separately approved actions, not execution instructions in this package.
