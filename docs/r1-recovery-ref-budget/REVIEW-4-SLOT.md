# Independent review of Codex's 4-slot recovery design (`c4a4fc4f7`): SELECTED, with one addition and one bug fix

Codex's proposal: `docs/reviews/r1-recovery-budget-ffef0524/bounded-alternative/PROPOSAL.md`. Review only; no branch, setting, cleanup or production action.

## Verdict: adopt the four-slot design

It replaces my rejected 24-checkpoint proposal. I agree with Codex's three findings against mine:
- the UNKNOWN bypass was unbounded;
- a logical size cap is not a physical storage or fetch cap;
- my count, clock and percentage statements were wrong.

| Property | Assessment |
|---|---|
| **Cap enforcement** | Correct. The cap is enforced by ref uniqueness on the server: the checkpoint and its slot are created in one `--atomic` push, both leased as absent (`--force-with-lease=<ref>:` with an empty expectation). No listing, stale view or UNKNOWN can admit a fifth. Verified locally: the lease rejects a second writer even when its view was stale, and the losing atomic push leaks no checkpoint. |
| **Size guard** | Sound and conservative. Uncompressed objects reachable from HEAD but not from local `origin/main` must be known and at most 32 MiB. A stale local `origin/main` only overestimates. |
| **Retention** | No expiry and no eviction; unmerged state is deleted only by approved exact name+tip. Agreed. |
| **Cleanup** | Paired exact-tip cleanup only after confirmed recovery (this pass merged the tip into main, or main already contains it). Agreed. |
| **Ambiguous push reply** | Read-only reconciliation without a second admission. Agreed. |
| **What the cap means** | It is a logical admission bound (4 × 32 MiB), not a physical repository-size or fetch cap. No server GC promise, $0 added spending. Agreed. |

## Challenges and what I changed

1. **The bot's single slot loses later states in the same outage. Added: same-run advance.**
   - Under the design as written, a bot run that keeps failing to reach main fills its one slot with its first unpublished state. Every later state in that run (for example an owner command recorded 25 minutes later) could not be kept.
   - **Addition:** when this run already holds a slot for an **ancestor** of HEAD, one atomic push:
     1. creates the new immutable checkpoint;
     2. moves the slot, leased on the old tip;
     3. deletes this run's own superseded checkpoint, leased on the old tip.
   - The new tip contains every old commit, so no content is lost, capacity does not grow, and nothing belonging to another run is touched.
   - If the recovery pass merged and released the old pair meanwhile, the leases fail and the state is re-admitted as new.
   - **Across runs**, the bot can still hold only one pending state. That remains L7.
2. **A real bug: the bot's kept-state never persisted.** `bot-save.sh` ran `sealed_recovery_push 2>&1 | tee -a run.log`, a pipeline subshell, so `SEALED_RECOVERY_LAST`/`REF` were lost after every save. This was already true in rev5–rev12: the "already kept" check never worked in the bot loop. With slots, it would have turned the run's second save into a false "FULL". It now runs in the bot's own shell, and a wiring test forbids a pipe.
3. **Role binding.** The role comes from `GITHUB_WORKFLOW_REF` (`…/.github/workflows/bot.yml@…` gives bot, `main.yml` gives main, anything else is shared). Display names are not used. No workflow file changes.
4. **Slot without a checkpoint** (a person deleted the checkpoint, or something partial outside these tools): reported and **kept**. It blocks that role's capacity until a person resolves it. Releasing it automatically would be a deletion without confirmed recovery, so it is not done.
5. **Atomic-push support on github.com is not verified here.** Only local Git was exercised. If the server refused `--atomic`, every admission would fail closed, so every outage would become L7, not a cap breach. **It must be confirmed in the release rehearsal, on a disposable branch with the owner's approval, before L7 is accepted.**
6. **Not implemented:** the PENDING (day 7) and STALE (day 30) health labels, and a distinct owner message for FULL. The existing SAVE NOT CONFIRMED message is sent. These stay proposals.

## Capacity, stated plainly for the owner decision

| Writer | Open recovered states | Note |
|---|---|---|
| bot | at most 1 | its own run may keep replacing it with newer states |
| main | at most 1 | |
| the other 5 writers | at most 2 together | |
| total | at most 4 × 32 MiB logical | not a physical cap |

**Loss case L7:** while a writer's slots are occupied, a different run's save that also cannot reach main is lost when its runner ends, as are an oversized save and an unknown-size save. The previous 24-checkpoint figure is withdrawn.
