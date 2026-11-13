# Private adoption prerequisites (P0 Route A, source only, 13 Nov 2026)

Nothing below is authorized or performed by this package: no seeding, no private write, no public cleanup, no data rewrite, no
research rerun. These are the conditions the reviewed adoption must meet before the private-mode marker (.github/private-data-mode)
exists. Codex 6852935516 / 6852885259 / 6852749074.

## 1. Custody before any cutover pull
- Every file on .github/private-files.txt (owner files, owner-derived outputs under their canonical names, and the complete research
  registry data/strategy-library.json) is copied from the current checkout to the private repository and read back byte-identical
  BEFORE the marker exists. The existing mechanism is `private-data.sh check` (copies every listed file present, reads it back,
  compares checksums, fails on any difference); it must run on the final list.
- Required history must be confirmed present privately: the registry, agent-a-lab.json, event-orb-retest-15d-paper.json and
  catalyst-events.jsonl (see section 3), plus the owner files the pull requires (holdings, marks, settings).
- Only after this read-back may a cutover pull set a public copy aside as data/private-stale-<name> (an optional file absent privately).
  Without it, an existing public copy would be set aside while the private repository has none: the history would be missing, and
  the required-history admission would (correctly) stop those producers as UNKNOWN.

## 2. Public bytes and history
- Existing public bytes and git history of every newly private file stay untouched until a separate, exact cleanup approval.
- From adoption on, no public writer stages them (guard stage phase, pre-push hook, the generic no-public-add workflow test).

## 3. Required-history admission (research writers)
- `private-data.sh require FILE...` runs in private mode after the pull, before the producer: a missing private frozen record or
  registry is UNKNOWN and the producer does not run. It never resets trial accounting, erases a failed verdict or starts a fresh
  registry. Wired: the registry in all 56 registry workflows; agent-a-lab.json (agent-a-lab, leaders-study); the event-orb paper
  ledger and catalyst event log (event-orb-retest-research). Outputs recomputed in full each run (account replay, options survey) stay
  optional.
- Protective bot and holding paths never call `require`; the bot's pull requires only the owner files it protects.

## 4. Registry writes
- Every writer merges only its own run's changes onto the newest private registry (`private-data.sh merge-library`, library-merge.mjs;
  a rejected push re-fetches and re-merges). A failed run's registry copy becomes private quarantine, never merged as current.
- Outside private mode the registry edits are explicitly NOT DURABLE (warning), never published.

## 5. Adoption review
- The 24-workflow / 31-job owner-file pull, the 56-workflow registry routing and the class C routing are new source with their own
  reviewed adoption; they are not covered by the frozen Friday Stage 2 binding (only ignition.yml overlaps it).

## 6. Added 13 Nov (steps 38–43)
- Custody (section 1) includes every file under the three private directories; `private-data.sh check` expands them.
- Watcher reservations: `node watcher-custody.mjs prepare OUTDIR` (offline) builds the custody import of every public reservation plus
  CUSTODY.json; it must be stored privately and read back, and Codex's guard follow-up denying `data/watcher-message-state` publicly must
  be in place BEFORE the marker exists. OLD-WRITER DRAIN (Codex 6855446097): `admit`'s snapshot-equality check proves only that nothing
  changed before the check, NOT quiescence. INDEPENDENT drain/exclusion evidence that the legacy public writer can no longer reserve
  (e.g. its workflows disabled and drained, the backstop adopted) must be recorded in CUSTODY.json oldWriterDrain {method, evidence,
  at}; `admit` refuses without it. If drain cannot be established, adoption stays stopped.
- There is NO public reservation path in source any more: before cutover reservation-gated watcher sends are withheld and the run
  record states LIVE SENDS UNAVAILABLE (PRIVATE_ROUTE_NOT_ADOPTED). Guard backstop, route and custody are adopted together. Until `admit` returns ADMITTED in a job, private reservations stay closed (the watcher withholds sends; no public fallback).
- The private step shell, the artifact removals and the PARTIAL run-log tails are part of the same adoption (75 workflows).
- The watcher path changes (ignition-watch.mjs, ignition, bot, main, premarket) need their own exact Stage 1 review; never Friday
  authority.
- OPEN dispositions in CONSUMER_MATRIX.md (hold-lab owner field, squad29 holdings) must be closed before adoption.
- ADOPTION ORDER (verified 13 Nov with a local fixture): Codex's mandatory watcher-state backstop (guard 01d818bc) refuses public
  reservation pushes even without the private-mode marker. In a job with the pre-push hook (ignition installs it), the PRE-cutover public
  publisher then returns PUBLICATION_UNCONFIRMED: privacy-safe (fail closed, nothing published), but the watcher withholds stop messages.
  So the backstop must be adopted together with (not before) the private reservation route, custody admission and the marker, or the
  owner must accept withheld watcher stop messages for the interval.
