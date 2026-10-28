# Private data migration (owner request, 28 Oct 2026)

Moves the owner's private files from the public repository `drrazaq/Stock-2` to the private repository `drrazaq/stock-2-private-data`. Every stage can be undone. Nothing is deleted until the owner approves it.

## Stage status

| Stage | What | Status |
|---|---|---|
| 0 | The website publishes only `index.html` | **DONE.** The owner switched the Pages source; `pages.yml` deployed at 09:09 UTC. Checked live: `/Stock-2/` gives 200; `/data/my-positions.json`, `/data/settings.json` and `/scan.mjs` give 404. |
| 1 | Connection plus copy (mirror) | **Built, waiting for the owner's token.** `private-data-check.yml` tests read, write and read-back. After it passes, the bot and the nightly scan keep a copy in the private repository. Production still reads the public files. |
| 2 | Switch production to read the private repository | Not started. Needs the owner's OK after stage 1 has run cleanly for a few days. |
| 3 | Remove the files from the public repository (current version) | Not started. Done in the same commit as stage 2. |
| 4 | Purge history | Optional; see "Historical exposure". |

## 1. Private files (`.github/private-files.txt`)

| File | What it reveals |
|---|---|
| `my-positions.json` | Holdings, entry prices, stops, dates |
| `my-trades.jsonl` | Real trade history (buys, sells, results) |
| `settings.json` | Owner decisions (focus, lanes, stop plans) |
| `halal.json` | The owner's ZAD marks |
| `alpaca-paper.json` | Practice account (paper) |
| `private.enc` | Share counts and money (already encrypted) |
| `sell-notices.jsonl`, `actions-sells.json` | SELL advice on the holdings |
| `scan-report.txt` | Holdings with stops and targets |
| `tips.jsonl`, `opinions.jsonl`, `market-calls.jsonl` | Tips the owner forwarded, with source names |
| `watch-extra.json` | The owner's own watch list |
| `basket-state.json` | Basket last shown to the owner |
| `leaderdip-ledger.jsonl` | LEADER DIP trades (created when the first one happens) |

These stay public, with reasons:

- `calendar.enc` is encrypted.
- `tg-state.json` holds only the message counter.
- `journal.jsonl` and `tier2-ledger.jsonl` are the system's own signals, not the owner's trades.
- **`signals.json` needs work in stage 2.** Its `posVerdict` field names held stocks with their sell reason. Stage 2 moves that field to a private file. The website reads only the public fields.
- **Owner details:** the name and profession were removed from `CLAUDE.md` on 28 Oct, and no current file contains them. Old versions are in history (see section 7).

## 2. Who reads and writes these files

**67 of the 76 workflows** read at least one private file. Mapped from each workflow's scripts and their imports.

- **Writers** (need read/write):
  - `bot.yml` (Telegram commands `bought`, `sold`, `halal`, `stop`, buttons, settings);
  - `main.yml` (nightly scan; also writes `scan-report.txt`, `sell-notices.jsonl`, `alpaca-paper.json`).
- **Readers of the holdings or settings:**
  - `ignition.yml` (live stop alerts), `premarket.yml`, `news.yml`, `calendar.yml`;
  - `Smart-money.yml`, `Tiprank.yml`, `deals.yml`, `discover.yml`, `movers.yml`;
  - `intraday-radar.yml`, `opportunity-radar.yml`, `fastmover-intraday.yml`, `hold-lab.yml`;
  - `leaders-study.yml`, `agent-a-lab.yml`, `options-lab.yml`, `squad29-lab.yml`.
- **Readers of `halal.json` only:** about 48 research labs (`squad*-lab`, `angles`, `anomaly`, `macro` and others). They use it to label signals.
- **Telegram commands** that change these files (all in `scan.mjs`):
  - `bought`, `sold`, `added`, `halal`, `stop`, `stop placed`;
  - `focus`, `quiet`, `alerts`, `radar`, `basket`, `watch`;
  - `tip`, `size`, `budget`;
  - the confirm buttons.
- **Website:** `index.html` reads only `signals.json` and `discovery.json`. It reads no private file.
- **Logs:** Actions logs of a public repository are public. The scripts print counts, not holdings. The only full-message print happens when the Telegram secrets are missing, which never happens in production.

## 3. Connection design (least privilege)

- **One fine-grained personal access token**, limited to **only** `stock-2-private-data`.
  - **Contents: Read and write.** Metadata: read-only (GitHub adds it automatically).
  - **Nothing else**: no other repository, no account permissions, no Actions or Secrets permissions.
- Stored as the Actions secret **`PRIVATE_DATA_TOKEN`** in `drrazaq/Stock-2`. Workflows get it only in the steps that need it.
- **How it stays hidden:**
  - `.github/private-data.sh` passes it to git through environment settings. It is never in a URL, a file, a commit or a log line, and GitHub also masks it in logs. A test checks this.
  - Workflows started from forks or pull requests never receive secrets.
  - Telegram messages report pass/fail, file counts and the token's expiry date, never the token.
- The private copy is cloned into the runner's temporary folder, outside the public checkout. A public `git add data` can never pick it up.

## 4. Read-only or read/write?

- **Read/write is needed** for the bot and the nightly scan, because `bought`, `sold`, `halal` and the settings commands save changes.
- **Read-only is enough** for the other 65 workflows. For stage 2, the safer setup adds a **second token**, `PRIVATE_DATA_READ` (Contents: Read-only, same single repository), for those readers. Then the many lab workflows cannot change the owner's files even if a lab script has a bug. For stage 1 only the read/write token is needed.
- **Expiry:** fine-grained tokens expire, at most one year with a custom date. The check reports the expiry date. Stage 2 adds a SYSTEM HEALTH warning 14 days before it.

## 5. Tests done before anything is switched (`test/private-data.test.mjs`, 9 tests, local throwaway repositories)

- No token: nothing happens.
- Mirror waits for the connection check, then retries at most every 10 minutes.
- The check copies every private file, and the read-back is identical. No file content is printed.
- The token never appears in the output, in `.git/config` or in any commit.
- `pull` stops with an error if the private repository is unreachable or has no positions file, so no job runs without the holdings.
- `push` saves a `halal` change. When two jobs collide, the bot's newer positions win, the same rule as `.github/save-data.sh`.
- The website workflow publishes `index.html` only.

## 6. Website

The Pages source is now "GitHub Actions". `pages.yml` copies only `index.html` and **fails the run if any other file is in the site folder**. Commits that change data do not redeploy the site. Checked live (28 Oct): data files and scripts return 404.

## 7. Historical exposure: what can and cannot be removed

- **Git history.** Every past version of the private files is in the public history: the bot commits them every few minutes.
  - **What we can do:** rewrite history with `git filter-repo` to drop those paths, then force-push.
  - **What that costs:** every commit ID changes; all 76 workflows must be paused during the rewrite; any open clone breaks.
  - **What it cannot fix:** GitHub keeps old commits reachable by their ID until GitHub Support runs a cleanup (the owner must file a request). Copies already taken (clones, archive sites, data crawlers) cannot be recalled. The repository had 0 forks on 28 Oct.
- **Website deployments.** Only the current deployment is served, so the old ones no longer show. Search engines or web.archive.org may hold snapshots; removal requests go to them.
- **Actions logs** are public, kept 90 days by default, and can be deleted per run. They contain counts, not holdings.
- **Recommendation:** finish stages 2 and 3 first, so no new private data is published. Decide on history afterwards; that is the owner's choice.

## 8. Preserving data

- Stage 1 only copies; the public files stay as they are.
- Stage 2 starts from a private copy the mirror has kept current for days. Before the switch, the check must report "N of N identical".

## 9. Unchanged

- Trading rules, the halal gate, holdings, the frozen ranking experiment (A/B/C/D/R/R0) and live alert selection.
- Only `bot.yml` and `main.yml` gained one mirror step, which does nothing without the token.

## Rollback

- Stage 1: delete the secret `PRIVATE_DATA_TOKEN` and everything stops (no-op). The commit that added stage 1 can be reverted safely.
- Stage 0: Settings → Pages → Source → "Deploy from a branch". This would publish the whole repository again, so it is not advised.
