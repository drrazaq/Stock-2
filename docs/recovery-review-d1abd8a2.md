# Independent review of Codex's recovery decision (d1abd8a2)

Reviewer: the Claude session, 4 Nov 2026, 13:20–13:45 Kuwait. Read-only and offline. There was no new provider collection, dispatch, cache restore, credential use, strategy adoption or trading action. Every number below comes from committed files on `main` (`ebdcb9ff…` / `e6b8d75d…`) or from hosted job logs I read myself, unless marked as Codex's.

## Verdict

1. **Shortlist: agree with NO credible, usable trading candidate. One omission to add.** DEC2-TPS is not usable. Its PROVEN label is real but measures the wrong quantity for an account. The shortlist leaves out the account-level replays, which are the most economically relevant evidence. They are negative or SPY-level, so they don't produce a stronger candidate either. Nothing is promoted.
2. **Original caches: BLOCKED, not recovered.** My authorized GitHub interface cannot list, inspect or export Actions caches. Indirect hosted-log evidence says the current study cache is a *newer* key with different bytes. The original exact keys are therefore probably no longer touched, but their existence remains UNVERIFIED.
3. **Reconstruction limits: confirmed.** Even an exact original study cache would not contain the fresh 20–23 Oct responses. Those were merged in memory only. Today's own lab log shows the same pattern.

## 1. Strategy shortlist challenge

### DEC2-TPS: what each result establishes

Source: `data/decoded-history.json` firstRun (frozen 2026-10-23T19:13Z) and `data/decoded-check.json` (monitoring check, 2026-10-23T19:16Z, `decoded-lab.mjs` lines 243–252).

| Measure | Older half | Newer half | What it means |
|---|---|---|---|
| Per trade, **on money actually invested** (frozen PROVEN) | n 18,458, +1.07% (stress +0.67%), block t 6.40 | n 49,689, +1.47% (+1.07%), block t 12.39 | When the rule puts money in, those dollars earn more than the average stock over the same span. It clears every per-trade gate. |
| Per **planned position** (10/20/30/40 scale-in, cost on money traded) | **−0.25%** (stress −0.65%) | **−0.13%** (−0.53%) | Measured against the full planned position, the account loses money in both halves. |
| Same, first buy at the next open | −0.21% | −0.15% | The negative result is not an artefact of entering at the signal close. |
| Budget "edge" versus its control | +0.48%, block t 3.19 | +0.31%, block t 4.43 | It loses *less* than holding the average stock with the same money. That is still a loss, not a profit. |

**Why the two disagree (my arithmetic on the saved summaries, not a rerun):**
- The planned-position return is roughly the average deployed fraction times the invested return, plus a size–return covariance term.
- The average deployed fraction is 0.4979, so independence would give about +0.53% (older) and +0.73% (newer).
- The observed −0.25% and −0.13% imply a size–return covariance of about **−0.78 and −0.86 percentage points**.
- In plain terms: trades that bounce quickly win while only 10% is invested. Trades that keep falling get filled to 100% and lose.
- This is averaging down. It produces the 78% win rate and the worst trade of −86% (no stop). The handbook warns about exactly this ("hold until even / average down").

**Usable? No.**
- The economically relevant measure (money per planned position) is negative after cost in both halves.
- The real ZAD fee is $3 per order. On a $1,000 plan, a $100 first leg pays $6 round trip (6% of that leg), and up to 5 orders mean $15. That is worse than the 0.8% modelled.
- Its correct registry status already blocks it from TRY SMALL.
- The PROVEN label should stay as recorded, beside the negative budget result. Neither may be quoted without the other.

### Other candidates checked with one consistent standard

- **Census:** in the current registry (783 entries), only **4 records carry a positive label**: DEC2-TPS (per-trade PROVEN), SQ23-GOLD (EARNS ITS PLACE), and the SQ24-SIDE-FIRST and SQ24-SIDE-INSIDER exploratory side tests (never verdicts). I found no stronger omitted record.
- **Omission to add:** the shortlist does not address the **account-level replays**. They answer "would the owner's account make money?" directly:
  - **`data/account-replay.json` REPLAY-2SLOT** (2-slot TRY SMALL account, $2,000, pre-registered 27 Oct):
    - older: +15.0% versus SPY +7.6%;
    - **newer: +18.1% versus SPY +48.0% and SPUS +57.3%**;
    - max drawdown about −30% and −27%.

    It fails the both-halves SPY gate. This matches the handbook ("did not beat SPY"), and it is a negative finding to retain.
  - **LEADER DIP:** the owner's lane, approximately equal to SPY as a 3-slot account, per the handbook. Its account evidence should be listed. It is not stronger.
  - **Today's `confluence-lab` monitoring portfolios** (job 126365672609, 4 Nov 03:19Z) are **monitoring only, not verdicts**. Some TRY SMALL sizings beat same-dollar SPUS and some don't. Several CONF-2 combinations lose money. They do not change any frozen result.
- **Supply-chain PROMISING, RESMOM/TAX/INV, SQ11, SQ2:** I agree with Codex's dispositions as recorded. I did not re-derive their numbers.

## 2. Original-cache availability (exact keys from Codex)

Keys: `leaders-study-39915553600`, `squad4-cache-40069419224`, `squad5-cache-40074150745`, `squad11-cache-40075403009`, `squad11-cache-40075496654`, `a-cache-39916773908`, `anomaly-cache-40009045154`, `squad2-min-v1-0-40068690732`, `leaders-study-39212201641`, `leaders-study-39219499165`, `events-cache-39949096448`, `value-cache-39918169936`.

- **Capability:** my authorized GitHub tools list workflows, runs, jobs and artifacts. They read job logs (the last 5,000 lines) and artifacts. **There is no cache list, cache metadata or cache download method.** I did not use a substitute interface or credentials. So existence, date, size and recoverability of the exact keys are **UNVERIFIED from here**. This matches Codex's own blocker.
- **Indirect evidence (my read of the hosted log, confluence job 126365672609, 4 Nov 03:19:45Z):** the prefix restore `restore-keys: leaders-study-` hit **`leaders-study-41281582224`**, 119,225,376 B. The lab then reported "cache to 2026-10-19; fresh sessions: 2026-10-20 … 2026-11-03".
  - The newest study cache is a different, later key. Its size differs from the original `leaders-study-39915553600` (≈118,778,998 B, per Codex), so it is **not the original bytes**. It could support only a separately labelled replication.
  - Prefix restores pick the newest match, so the older exact keys are no longer accessed by current labs. GitHub normally evicts caches that haven't been accessed for 7 days. The original keys are therefore *probably* gone. That is an inference, not a verified deletion.
- **To settle it:** a supported read-only cache-inventory and export capability, or a separately approved export. A new data purchase would not settle it.

## 3. Reconstruction limits

- **No original price, minute, universe or action inputs were recovered.** Codex's searches and artifact digests are Codex's work; I did not repeat them.
- **Fresh responses held only in memory stay missing**, even if a base cache surfaces. The original SQ11 and anomaly runs merged fresh sessions in memory onto a cache ending 19 Oct (per Codex). The current lab still behaves the same way (log above).
- **Recovered and recoverable pieces:** the SQ2 6,438 saved rows; the TPS frozen record and only 1,500 of 68,147 trade rows; the SQ11 frozen output; and partial supporting snapshots. These are original derived outputs, not inputs. They must never be described as untouched confirmation of a re-run, and no synthetic fixture may stand in for them.

## Attribution and coordination

- **Claude independently:**
  - read the TPS frozen and check records;
  - did the covariance arithmetic;
  - ran the registry positive-label census;
  - read the account-replay results;
  - read the cache key and range from the hosted confluence log;
  - assessed the capability of my own interface.
- **Codex's (not repeated):** filesystem, Git and branch archive searches, artifact downloads and digests, the SQ2/SQ11 arithmetic reproduction, and the mentor-compatibility runs.
- **Duplicate work:** to avoid it, I did not repeat Codex's archive search.
- **Suggestion:** add the account-level replay findings (REPLAY-2SLOT, LEADER DIP 3-slot) to the shortlist as retained negative or neutral evidence.
