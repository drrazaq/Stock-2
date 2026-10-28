# Privacy remediation plan (owner approved preparing it, 28 Oct 2026)

**Rule from the owner:** remove unnecessary personal information from public files first, review historical exposure, and assess keeping private data outside the public repository. No disruptive hosting or billing change without approval.

## Done today (non-disruptive)

- `CLAUDE.md`: the owner's name and profession, and the holdings list with buy prices and SELL advice, are removed. The time zone stays because schedules need it.
- **Credential scan:** the current tree, the pending changes and the 64 commits available in this session were checked for key and token patterns. **None found.**
  - The full history was not available here (shallow clone).
  - GitHub runs secret scanning on public repositories automatically; see Settings → Code security.
- **The website (GitHub Pages)** keeps API keys only in the visitor's browser (localStorage), never in the repository.

## What is still public (now and in every past version)

| Item | Where | Sensitivity |
|---|---|---|
| Holdings, entry prices, stops | `data/my-positions.json` | High: what the owner owns and where he sells |
| Owner decisions, including the 90-day stop-trading plan | `data/settings.json` | Medium |
| ZAD halal marks | `data/halal.json` | Low to medium |
| Practice-account trades | `data/alpaca-paper.json` | Low |
| Name and profession | `CLAUDE.md` before today (history) | Identity |
| GitHub user name `drrazaq` | the repository address | Identity hint; cannot be hidden without a new account or organisation |

Share counts and money amounts are already **encrypted** in `data/private.enc` (AES-256-GCM, secret `PRIVATE_KEY`).

**GitHub Pages:**

- Pages is switched on and publishes the whole repository root as a website. So `.../Stock-2/data/my-positions.json` is also a public web page.
- The repository has **0 forks** and 1 star (checked 28 Oct). No known full copies exist beyond GitHub itself and anyone who cloned it.

## Options (each needs the owner's approval; none costs money)

1. **Publish only the website files (recommended first; about 5 minutes for the owner).**
   - In Settings → Pages, change the source to a small workflow that publishes only `index.html` and the two files it reads (`data/signals.json`, `data/discovery.json`).
   - Claude can write that workflow; the owner flips one setting.
   - This removes the web copies of every other file. It does not remove the GitHub copies.
2. **Move the owner files to a second PRIVATE repository (recommended; about half a day of work, no billing change).**
   - Files: `my-positions.json`, `settings.json`, `halal.json`, `alpaca-paper.json`, `private.enc`.
   - Workflows keep running in the public repository, where Actions minutes are free. They check out the private one with a read/write token stored as a secret (for example `PRIVATE_REPO_TOKEN`), and save the files back there.
   - About 16 scripts and their workflows read these files. The stop alerts depend on `my-positions.json`, so this needs tests and one careful switch-over day.
3. **Encrypt the owner files in place** with the existing `PRIVATE_KEY`, as `private.enc` already is.
   - Less moving parts than 2, but every workflow that reads a file needs the key.
   - The owner can no longer read or edit these files on GitHub, only through the bot.
4. **Purge history (not recommended now).**
   - Rewriting history removes old versions but breaks every existing clone and needs a force-push while about 70 workflows write to the repository.
   - GitHub keeps cached views until support clears them, and copies already taken cannot be recalled.
   - Worth it only after 2 or 3, and only if the owner wants the past erased.
5. **Make the repository private (not recommended: billing).**
   - Actions minutes are free only for public repositories.
   - The bot alone uses about 43,000 minutes a month, about 330 USD a month at 0.008 USD a minute.

**Suggested order:** 1 now (owner setting), then 2 after approval. 4 only if wanted afterwards.
