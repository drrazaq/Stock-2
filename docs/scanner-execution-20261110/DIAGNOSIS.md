# Missing scanner runs: diagnosis (read-only, 10 November 2026)

Evidence from production `main` `40308ddf`, GitHub's run and job APIs for `main.yml`, `bot.yml` and `premarket.yml`, and complete job logs. No dispatch, cancellation, workflow change or production write was made.

> **Erratum (10 Nov, after Codex 6760515948 / 6761038271).** An earlier version of this file said no nightly run was created for 9 Nov and "none created by 04:30 UTC" on 10 Nov. That was wrong: my run list was read before 03:40:52 UTC, and I did not re-read it before committing. The 9 Nov nightly *was* delivered, 6 h 11 min late. Telegram delivery of that night's ACTIONS remains UNVERIFIED (no explicit acknowledgement record). The corrected statement is: on 4–6 and 9 Nov the nightly arrived 3.5–6.2 hours late, and in-session intraday delivery was 0–2 per day from 3 Nov.

## 1. What the 29-second run 42716422194 actually executed

| Fact | Evidence |
|---|---|
| Created 2026-11-09 22:57:34 UTC (17:57 NY); `event: schedule`; job 129499026589 ran 22:57:37–22:58:02 | jobs API |
| Checked out `9cb6e07c94813aaa1861702795450319f719e0ae` | checkout step log (`git log -1`) |
| `MODE: intraday` and `FORCE` empty | the step's printed `env`. The workflow sets `intraday` only when `github.event.schedule == '10,40 13-20 * * 1-5'`, so GitHub delivered this as one of the **intraday** cron events (latest possible slot 20:40 UTC, so it was at least 2 h 17 min late). **It was not the 21:30 nightly.** |
| `scan.mjs` ran `intraday()`: `tgCommands(sig)`, then `preMarket(sig)` (acts only 04:00–05:00 NY), then printed **`Market closed. Nothing to do.`** at 22:57:46.60 and returned | log line; `scan.mjs` lines 4230–4241 on `main` |
| `daily()` was **not** called: no data load, no ACTIONS, no `signals.json` | `scan.mjs` line 4316 dispatches by `MODE` |
| The save step ran (14 s) and produced **no commit**: there is no `scan …` commit on `main` between 22:50 and 23:10 UTC on 9 Nov | `git log origin/main` |
| Private mirror: `private data: no change` | log |

Whether `tgCommands` answered any Telegram command cannot be seen from public evidence. It wrote no data, because there was no commit.

## 2. Slot reconciliation, `main.yml` (all events on record; no `workflow_dispatch` runs in the period)

Mode is **confirmed from the log only for 42716422194**. For the other runs it is inferred from duration and creation time: about 45–53 min means a full daily scan; about 30 s outside market hours means an intraday "Market closed" exit; 1–3 min during market hours means an intraday check.

| Market day | Intraday runs created inside 13:10–21:00 UTC (16 slots) | Nightly (cron 21:30 UTC) run that executed the daily scan |
|---|---|---|
| Fri 30 Oct | at least 6 (15:52 … 20:41; earlier runs not retrieved) | 21:59 (48 min) |
| Mon 2 Nov | 7 (14:18 … 20:21), plus one at 21:21 after the close | 22:04 (53 min) |
| Tue 3 Nov | 2 (14:15, 20:36) | 22:10 (47 min) |
| Wed 4 Nov | 1 (20:23) | created **01:34 on 5 Nov** (+4 h 04 min) |
| Thu 5 Nov | 1 (20:37) | created **01:41 on 6 Nov** (+4 h 11 min) |
| Fri 6 Nov | 1 (19:55) | created **01:00 on 7 Nov** (+3 h 30 min) |
| Mon 9 Nov | **0** | created **03:40:52 UTC on 10 Nov** (+6 h 11 min): run 42751003080, `MODE=daily`, checkout `40308ddf`, scanner step 03:41:06–04:30:29, saved in `9b3c9ac1` at 04:30:45 (erratum, see below). Run 42716422194 at 22:57 was a separate late intraday event |

Late intraday events that exited "Market closed": 4 Nov 00:52, 5 Nov 01:02, 6 Nov 01:06, 7 Nov 00:04 and 9 Nov 22:57 (all UTC).

The same pattern appears elsewhere:
- `premarket.yml` (cron 12:40) was created 20:01, 20:15 and 19:41 UTC on 4–6 Nov and 22:41 UTC on 9 Nov.
- `bot.yml` (cron every 30 min) created run 42598952130 at 10:10 UTC and the next one, 42697949183, only at 20:57 UTC on 9 Nov.

## 3. What is established, what is ruled out, and what is not proven

**Established.** For each missing slot GitHub **created no run**. There is no queued, cancelled, failed or startup-failure run for it: the full run list shows only completed `success` runs, and the scheduled runs that did arrive came late.

**Ruled out (repository side):**
- **Workflow disabled.** `main.yml` state is `active` in the workflows API.
- **Invalid workflow file.** The same file produced runs on the same days.
- **Concurrency cancellation.** `concurrency: scanner` is used only by `main.yml`; a superseded pending run would appear as `cancelled`, and none exists.
- **60-day inactivity auto-disable.** The repository is active daily.
- **Billing block.** Other workflows started on the same days. Actions on standard runners is free for public repositories, so the $0 / "Usage blocked" budget did not stop run creation.
- **Code failure in the nightly path.** The late 9 Nov nightly ran `daily()` and saved normally once delivered.

**Not proven.** *Why* GitHub created no run is not observable from the repository. GitHub's documentation for the `schedule` event says it "can be delayed during periods of high loads … If the load is sufficiently high enough, some queued jobs may be dropped" (docs.github.com, *Events that trigger workflows*, schedule). The observations are **consistent with** that documented behaviour, but it is not proven to be the cause. A per-repository effect cannot be confirmed or excluded either: this repository has 60 cron-bearing workflows, including `bot.yml` every 30 minutes. The accurate statement is therefore:

> **No run was created for these slots; the cause lies in GitHub's scheduling, outside the repository, and the specific mechanism is unproven.** Saying "GitHub skipped it" overstates what is known; "the scheduled event never produced a run" does not.

**Correction to my earlier statements:**
- In 6758155955 I wrote "GitHub is skipping almost all of the scanner's scheduled runs". The supported wording is above.
- I also said that holdings checks during market hours "aren't happening". That was too broad. The bot loop (`bot.yml`, `MODE: chat`) runs `scan.mjs` about every 5 minutes and checks the owner's own positions (stop fallback) whenever a bot run is active. What is missing is the scheduled intraday scanner's wider list (plan buys, leaders, quick trades) and the nightly scan. The bot itself also had a gap on 9 Nov from about 18:10 to 20:58 UTC (13:10–15:58 NY).

## 4. Consequences

- **Nightly:** on 4–6 Nov and 9 Nov the nightly arrived 3.5–6.2 hours late (9 Nov: saved 04:30 UTC = 07:30 Kuwait; delivery unverified).
- **Intraday:** from 3 Nov, 0–2 checks per day instead of 16.
- **Release protocol `d2f76b64`:** B requires all 16 intraday runs plus the nightly. At this delivery rate B cannot reach VERIFIED, whatever the code does.
