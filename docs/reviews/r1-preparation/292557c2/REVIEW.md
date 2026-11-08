# R1 292557c2 — independent focused review: CHANGES REQUIRED

Candidate `292557c20267a1735e15ffb5cca6d412460d53ef`; separate from RA-C1 strategy research. Source-only sparse checkout, no real data/keys. All50 manifest fingerprints match independently; diff SHA256 `ccc52bb0944f8dc438aa9b08fcf15239adc213745680b9fede5d41d43a718fc7`. Supplied72 focused checks and20 gated actual-watcher checks independently PASS. No full-suite claim borrowed.

## Prior findings closed in the tested cases

[Independent closure results](previous-closures.json) and [reproducer](previous-closures.mjs), invoked with the absolute exact candidate directory:

- Identical retry on directory EIO retains plaintext on BOTH attempts.
- Segmented export consolidates A,B,C once, no duplicate B,C exports.
- Removing a source file plus its manifest entry is now caught by recomputation from the source tree.
- The previously incomplete total_count and unrecognized-status writer fixtures now fail closed.

This acknowledges the repairs; new automatic save-recovery publication/replay introduces the blockers below.

## New recovery blockers — independent local reproductions

Run `node recovery-check.mjs /absolute/path/to/exact/candidate`; synthetic-only fixtures/keys, local bare Git remotes, no provider/production/Telegram traffic. [Results](recovery-results.json).

1. **Stale owner state/offset overwrites current state.** `.github/sealed-git.sh` sealed_recover cherry-picks whole commits with `-X theirs`, bypassing save-data's special owner-state reconciliation. Synthetic main offset9/current NEW position becomes offset2/STALE position after successful recovery. This can replay already-consumed commands or erase newer state. Never blindly choose a stale owner/offset side. Preserve reviewed writer/UNKNOWN safeguards and fail visibly for unresolved state; offset advancement must remain tied to its acknowledged records, not simply max(offset) without semantic proof.
2. **Recovery accepts source/code commits, not just bounded data saves.** The same fixture includes sentinel.mjs; automatic recovery publishes its stale/unapproved code while the plaintext guard reports OK. A T1 plaintext guard is not a recovery path/provenance allowlist. Validate the exact allowed paths, commit ancestry and reviewed save provenance; refuse code/workflow/settings/release/unknown-path changes. Do not add a generic branch-to-main merger to this bounded data repair.
3. **A newer acknowledged recovery checkpoint is deleted unmerged.** The producer force-updates one recovery ref; the consumer deletes it by name without a lease. Synthetic race: fetch checkpoint1; checkpoint2 advances the ref after main receives1; consumer deletes the updated ref. Main has version1, checkpoint2 is not an ancestor, recovery ref gone, helper exit0. Use immutable checkpoint refs or explicit expected-tip/ancestry checks with compare-and-delete protection; never force-overwrite/delete an unseen acknowledged checkpoint.
4. **Unknown recovery transport becomes success.** A failed git fetch makes sealed_recover return0 with no warning/output; bot_recover therefore does not report UNKNOWN. Return a visible failure/UNKNOWN and preserve pending evidence. Do not interpret failed listing/fetch as no pending recovery branches.

## Release procedure blockers — separate from software fixtures

- RELEASE.md B6 says a red migration job means “nothing published.” False: workflow pushes and then fetches/verifies; failure afterward can be post-push. Also a transport error can leave push acceptance uncertain. On red/missing/partial/late receipt, first establish the actual remote commit/parent/manifest and complete hosted evidence; remain UNKNOWN/writers off. No automatic retry or code inverse until publication state is established through the applicable reviewed rollback path.
- The writer gate now handles the tested count/status failures but lacks a capture envelope proving repository, expected filters/pages, unique run IDs and freshness. Its documented instruction to pass every page also conflicts with requiring each individual page length==total_count when a query spans multiple pages. A complete fresh capture/merge contract must precede an operational zero-writer receipt. No live listing/control-state check or unavailable API was invented here.
- Keyless verify-structure deliberately does NOT decrypt contents. It can complement, not replace, independent review of the full hosted keyed apply/verify receipt, exact expected source and all restoration gates. Owner statement of backup existence is not an independently verified recovery exercise outside the producer runner.
- No executable unit/window/operational READY is approved. Preserve previously reviewed deadlines and per-unit attended reconfirmation. No unit push without verifier; post-push missing/partial/late receipt follows reviewed rollback subject to writer/UNKNOWN protections. Rollback remains UNVERIFIED/no Enable until complete required receipts and every restoration gate pass. Post-enable observations cannot waive pre-enable gates.

## Scope, website, costs and existing copies

Watcher/stop/index remain unchanged since previous review, but altered shared helpers and new bot always-save/recovery behavior change runtime/publication semantics. Supplied synthetic gates do not refresh deployed STOP pins. Recovery creates additional public refs and deletes them; the revised route itself requires explicit bounded review/approval before any operational use. No production/source integration, ref creation/deletion, workflow action, key or settings changes performed here (all ref operations in the reproducer are local temporary fixtures).

New cost table is now explicitly nominal and broader in scope. It does not establish billing or enforceable zero spend; operational recovery refs/retries/retention also need the proposed budget. Full privacy/licensing closure remains absent: website signals/discovery and other T2/derived outputs, log echoes, fm-cache, artifact radar/message-state and historical copies remain separately unresolved. No actual data decrypted/read for R1; no old-copy removal claim. Existing history/raw URLs/clones/caches and previously recorded artifact13536188063 remain outside this repair.

## Optional improvements

Broader owner-state redesign, envelope resource limits and UI acknowledgement redesign remain separate. The bounded requirement is that this recovery implementation preserve state/offset provenance, accept only reviewed save paths, never discard a newer checkpoint, and report UNKNOWN honestly. Do not replace these fixes with a larger safety package or deploy while review is open.
