# A observations, outcomes and generated cards — offline storage implementation

The three requested artifacts now have a real private writer, not empty template
files. Source: `tools/a-catalyst-reclaim-store.mjs`. There is no network,
Telegram, market-data collection, automatic pilot start or production integration.

## Files produced in an explicit existing private 0700 directory

- `a-catalyst-reclaim-observations.jsonl`: every supplied assessment, successful or
  rejected; stable observation and issuer-session candidate IDs, origin, input and
  policy hashes, decision/source clocks, source document references, bid/ask and
  sizes, ZAD and liquidity evidence, bar evidence, reason family and detailed
  reason. `qualifies` means a new PAPER card was recorded, never live eligibility.
  Repeated assessments of an already-carded issuer/session remain logged but do
  not create another paper entry. Missing issuer mapping remains UNKNOWN.
- `a-catalyst-reclaim-outcomes.jsonl`: append-only unresolved/model outcomes bound
  to the original card, input and policy. Fee/slippage economics come from the
  existing evaluator. Exit evidence is retained; controls are explicitly null /
  NOT_IMPLEMENTED. A completed result cannot be silently replaced. A correction
  review note can be appended, with a reason and reference to a separate reviewed
  recalculation; it never becomes a new trade or clears the original result.
- `cards/<card-hash>.json`: generated exclusively by the actual evaluator and card
  renderer, not hand-entered. Origin is included in the human-readable card. The
  first valid issuer-session card is preserved; other share classes cannot create
  another entry for that issuer/session under the same policy. Issuer identifiers
  are supplied mapping evidence, not independently authenticated by this writer.

There are no example metadata rows, arbitrary `liveFrom` dates, made-up controls,
or flags claiming an object is immutable. Each JSONL row is an integrity envelope
with `sequence`, `previousHash`, `record` and `hash`. Payloads are under
`record.payload`, rather than the flat illustrative format from outside sources.
Known reason families are explicit; unknown clocks are not labeled as late
detection without evidence. Offline delivery time is NOT_APPLICABLE, not zero.

## Persistence, interruptions and limits

Private files are 0600 and are never written to production `data/` by this code.
An exclusive writer lock, fsynced transaction intent, exclusive card creation,
fsynced log append and fsynced commit record bind the three artifacts together.
`manifest.json` binds origin, policy and implementation; the separate transaction
JSONL is required for recovery. Keep all companion files together.

Identical repeated writes are idempotent. Reused IDs with different contents,
changed cards, changed hashes, orphan links, symlinks, changed policy/origin and
truncated tails stop the writer. No automatic tail truncation or stale-lock
removal is implemented. A hard process exit leaves the lock and pending intent;
read-only inspection reports them and refuses automatic resumption. After an
operator independently establishes no old writer remains and settles the stale
lock, explicit `recoverPending()` can complete only the exact durable intent,
checking existing card/log contents before writing missing pieces. A damaged
partial line or card requires separate reviewed recovery; it is never guessed.

The interface enforces append-preservation and detects canonical-content changes.
It is not WORM storage, off-host authentication, protection against a privileged
actor recomputing all hashes, key escrow, raw-source authentication or complete
private archival custody. File-system private plaintext retention still needs
the reviewed data-rights/output-custody arrangement before real provider inputs.
Storage caps: 64 MiB for the directory's accounted artifacts and 1 MiB per log
line. A cap reached mid-transaction leaves explicit pending work; it does not
raise the cap or discard a record. These offline bounds are not pilot acquisition
approval. Existing exchange-calendar and strategy assumptions are unchanged.

## Use and verification

```
node tools/a-catalyst-reclaim-store.mjs --input explicit-offline-dataset.json --output existing-private-0700-directory
```

There are no default input/output paths or credential reads. The dataset must
explicitly be SYNTHETIC or RETAINED_RESEARCH. PROSPECTIVE_PAPER and live origins
are refused: this release cannot start the 60-day pilot by changing a label.
The input schema is the existing runner schema, plus `issuerId` and
`issuerEvidenceId` for a qualifying card. The CLI validates the dataset first,
then invokes the actual assessment/outcome functions. Full original input/source
archives remain separate required evidence; a stored hash does not recover them.

27 dedicated storage tests pass locally on Node v24.22.1. Combined with the
existing prototype/workflow tests: 93 native test cases PASS. These include actual
CLI execution, cross-class issuer deduplication, original-input/card binding,
missing controls, all transaction interruption stages, an actual child-process
exit, immutable outcomes, review-note append, locks, symlinks, tamper and truncated
tails. This is software verification, not evidence of a profitable strategy.

All files in `example.synthetic/` were generated by the actual CLI from synthetic
input. They are review examples, not trade observations, actual fills or pilot
enrollment. Do not copy them into a production ledger. No acquisition, activated
pilot, new stop, target, trim, position limit or strategy promotion is included.

Independent review is requested, not presumed complete. Authenticated source
adapters, current ZAD validity, complete candidate population, frozen controls,
acquisition caps, dates, private retention and explicit activation approval remain
the separate preconditions in `protocol.proposed.json`.
