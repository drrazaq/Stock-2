# R1: stop publishing provider market data in the public `Stock-2` repository (review only)

**Prepared by Claude on 8 Nov 2026 at the owner's request. Not deployed.**
- **Not done:** no production change, workflow change, history rewrite, visibility change, spending or provider message.
- **Base:** `origin/main` `b0d76987`.
- **Basis:** D2 review on `claude/mentor-release-handoff` `276215ff` (`docs/review-d2-public-market-data/`).

## 1. Mechanism: encrypt at rest in place (recommended)

Three ways to stop the public tip from exposing the most sensitive provider data (tier T1):

| Option | Changes | Problems |
|---|---|---|
| **A. Encrypt at rest in this repository** (recommended) | A writer stores `data/x` as `data/x.sealed` (AES-256-GCM, key derived from the **existing** `PRIVATE_KEY` secret). Readers decrypt. | Readers and writers must change. A workflow without `PRIVATE_KEY` cannot read or write these files and fails loudly. |
| B. Move to `stock-2-private-data` | `private-data.sh` pull/push in about 10 workflows | `PRIVATE_DATA_TOKEN` **expires 29 Nov 2026**. The private-data cutover has not been made. Concurrent multi-workflow pushes to a second repository cause conflicts. Larger change. |
| C. Make `Stock-2` private | One setting | Actions minutes for a private repository far exceed the included allowance (the bot runs ~5.5 h at a time, around the clock), and Pages from private needs a paid plan. **Not authorized (spending).** |

**Why A:** it reuses the repository's own pattern for licensed or private data (`data/private.enc` and `data/calendar.enc`, both AES-256-GCM with a key from `PRIVATE_KEY`). It needs no new secret, account, repository or spending. The public tip then holds only ciphertext.

**Key separation:** the R1 key is `sha256("stock-2 sealed provider data v1\0" || PRIVATE_KEY)`, so it never equals the existing `private.enc` key (`sha256(PRIVATE_KEY)`).

## 2. Stage 1 (done here): the sealed store

`sealed-store.mjs` provides:

| Function | Behaviour |
|---|---|
| `writeSealed` / `writeSealedJson` | **Never** writes plaintext. A missing key gives `SEALED_KEY_MISSING`, **before** any file is touched. A successful write removes the plaintext copy from the working tree, so the next commit drops it from the public tip. History is untouched. |
| `appendSealedLines` | jsonl append (read-modify-write) |
| `readSealed` / `readSealedText` / `readSealedJson` | Prefer the sealed copy; accept legacy plaintext only until the first sealed write |
| Tampering / wrong key / truncation | `SEALED_UNREADABLE`, never silent empty data |

`test/sealed-store.test.mjs`: **7/7** (synthetic only). Covers the round trip, no plaintext leakage, fresh IVs, domain separation, wrong-key/tamper/truncation refusal, no-key refusal before any file write, plaintext→sealed migration, stale-plaintext precedence and gzip payloads.

## 3. Stage 2 (not done; after Codex's design check): exact wiring

**Files (T1, 35 paths/patterns):**
- `data/shadow/*.jsonl.gz`
- `data/ignition-runs/**` (`*.json`, `*.shadow.jsonl.gz`)
- `data/opp-ledger.jsonl`, `data/premarket.jsonl`, `data/early-wave-obs.jsonl`, `data/ignition-live.json`, `data/ignition-missed-history.jsonl`
- `data/fastmover-live.json`, `data/movers-state.json`, `data/movers-journal.jsonl`
- `data/options-spread-survey.json`, `data/options-spread-survey.md`, `data/options-shadow.json`
- `data/analyst-archive-*.jsonl.gz`

| Module | Sites (main `b0d76987`) |
|---|---|
| `ignition-watch.mjs` (**in STOP's pinned set; needs fresh watcher pins and review**) | write shadow `:380`, runs `:281` / `:364`, opp-ledger `:384`, premarket `:183`, early-wave-obs `:377`, ignition-live `:370`; read ignition-live `:51` / `:368` |
| `shadow-outcomes.mjs` | read `data/shadow` `:18`, opp-ledger `:24` |
| `watcher-reporting.mjs` | read ignition-runs `:40` |
| `missed-runners.mjs` | read ignition-live `:43`, read/write history `:33` |
| `scan.mjs` | read ignition-live `:63` / `:522`, fastmover-live `:54`, movers-state `:2003` / `:2005` / `:2166` / `:3062`, movers-journal `:2005`; read/write options-shadow `:2850` / `:2854` / `:3505–3510` |
| `health.mjs` | file-age entries for ignition-live `:24` and movers-state `:25` → their `.sealed` paths |
| `movers.mjs` | `:50`, `:219`, `:362` |
| `fastmover-lab.mjs` | `:27` |
| `options-survey.mjs` | `:77` / `:83` |
| `smart-money.mjs` | `:82` |

**Workflows needing `PRIVATE_KEY` added to the step environment** (secret already exists): `ignition.yml`, `opportunity-radar.yml` (runs `shadow-outcomes.mjs`), `fastmover-intraday.yml`, `options-survey.yml`, `Smart-money.yml`. These already have it: `bot.yml`, `main.yml`, `movers.yml`, `leaders-study.yml`.

**Explicit `git add` lists to update:**
- `ignition.yml:54/71`: commit the `.sealed` names; never the plaintext names.
- `options-survey.yml:36–39`: `cp` and `add` the `.sealed` names.
- `opportunity-radar.yml:36`: check the shadow-outcomes paths.

**Guard test (Stage 2):** a repository scan fails if any T1 plaintext path is tracked or newly added after migration.

**Website:** `index.html` reads only `data/signals.json` (tier T2), so it is **unaffected**.

**Owner privacy, a bonus:** `options-shadow.json` also holds the owner's **real** option trades (`OS.real`, `scan.mjs:3505–3510`). Sealing it removes them from the public tip as well.

## 4. Privacy, cost and failure modes

- **Cost:** no new minutes beyond negligible encryption CPU. No new secrets, accounts or spending.
- **Key custody:** losing `PRIVATE_KEY` makes sealed files unreadable. This is the same dependency `private.enc` already has; the owner's existing backup of that secret covers it.
- **Failure modes:**
  - a workflow without the key **stops with `SEALED_KEY_MISSING`** rather than publishing plaintext;
  - corrupted data gives `SEALED_UNREADABLE`, and readers must surface it, not treat it as empty.
- **Residual exposure:** git history, covered in §5.

## 5. Separate assessment: existing public copies

- **Public since:** at least **27–28 Oct 2026** for the files in this shallow checkout. `scan.mjs` notes `premarket.jsonl` has been collected since **15 Oct**, so earlier commits are likely. All past versions remain readable through commit history and raw URLs.
- **Visible reach:** **0 forks**, 1 star, 1 watcher, from the public API. Clone and download counts need admin traffic data, which was not read. Search engines or archives may have cached pages; this is unknown.
- **After R1 deploys:** new commits carry only ciphertext and the plaintext disappears from the tip. History is **not** changed.
- **Removing history:**
  - It needs a full history rewrite plus a GitHub support cache purge. That breaks every clone, including the running workflows mid-flight, and must be coordinated with the bot.
  - It is **not authorized**. Recommended only if a provider asks.
  - Making the repository private would hide history at once, but costs money (§1C).
- **Provider question (R4):** optional and **not sent**.

## 6. Deployment (separate approval)

After the Stage 2 wiring, full serial suite and Codex review: deploy as its own package at a natural boundary, with the same release discipline as STOP (fresh pins, complete hosted-log receipt, code-only inverse). `ignition-watch.mjs` is in the reviewed STOP/watcher set, so its pins must be refreshed.
