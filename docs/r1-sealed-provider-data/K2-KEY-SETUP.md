# K2: the dedicated data key `R1_DATA_KEY` (owner steps; review only; nothing here is authorized yet)

**What it is:** a new secret used **only** to encrypt the provider-data files (R1). `PRIVATE_KEY`, Alpaca, Telegram and every other existing credential stay exactly as they are; nothing is rotated or regenerated.

**Rules:**
- Make the key **on your own device**.
- Keep it in **two independent places** outside GitHub.
- Put it into GitHub's secret page only when Claude says the reviewed package passed and you approve it.
- **Never** paste it into chat, email, a comment, an issue or a repository file. Claude never sees it.

**What the format check does and does not prove:**
- The release tools accept only 64 characters, each `0`–`9` or `a`–`f`; anything else is refused (`SEALED_KEY_FORMAT`).
- That check proves only the **form**. It does not prove the key is random: randomness comes from the generator below.
- It does not catch a copying mistake that keeps valid characters, such as `b` written as `d`.
- **Only the key check (step 4) proves that a copy is correct.**
- The key is used **exactly as stored**: upper and lower case are different keys. Keep it in lower case, as generated.

## Step 1: make the key

| Route | How | Verified |
|---|---|---|
| **Mac** | Open **Terminal** (Cmd+Space, type `Terminal`, Enter). Paste `openssl rand -hex 32`, press Enter. One line of 64 characters appears. | `openssl rand -hex 32` output checked here (OpenSSL 3.0; 64 lower-case hex). The macOS Terminal itself was not run here. |
| **Any computer with Chrome or Edge** | Save `k2-key-tool.html` from the repository to the computer, open it in Chrome or Edge with no internet needed, and press **Make key**. | Checked in headless Chromium 153 (`k2-key-tool.browser-check.mjs`, 11/11). Safari and Firefox were **not** checked. |
| **iPhone only** | **Not available yet.** See "iPhone blocker" below. | **Not verified.** |

## Step 2: store two independent copies

1. In your password manager, make an entry named `Stock-2 R1_DATA_KEY` and paste the 64 characters.
2. Write the key on paper, or print it, and keep the paper away from the computer.
3. Do not copy one store from the other later; both must come from the key as generated. Step 4 checks each copy **separately**.

If every copy is lost, the encrypted data cannot be recovered. No one, including Claude and GitHub, can read the key back.

## Step 3: add it to GitHub (only after the reviewed package passes and you approve)

1. Go to github.com, then **drrazaq/Stock-2**, then **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**.
2. Fill in **Name** `R1_DATA_KEY`, and **Secret**: paste from the password manager, exactly, with no space before or after.
3. Click **Add secret**. Tell Claude only "R1_DATA_KEY is listed", never the value.

Nothing reads `R1_DATA_KEY` until the approved release is pushed.

## Step 4 (inside the release window, B5b): prove each copy equals the enrolled key, outside GitHub

1. Claude runs the one-time `key-check` job.
   - It seals a random value with the enrolled `R1_DATA_KEY` and prints a **key-check record**: a line starting `R1 KEY CHECK VECTOR`.
   - The record contains no data and no key.
   - Claude sends you that line.
2. On your own computer, open `k2-key-tool.html`. Paste the record, then check:
   - the **password-manager copy**: PASS needed;
   - the **paper copy**, typed in by hand: PASS needed.

   (The same check exists as `sealed-migrate.mjs --key-check` for a technical operator; it is not part of these owner steps.)
3. Two PASS results prove that both independent copies are the key that seals the data, and that each can decrypt it. This proof happens outside GitHub's runner.
4. **Any FAIL:** the release stops before migration, and nothing is encrypted.
   - Compare the copies character by character.
   - **Do not retry or re-run any release step on your own.** A further attempt needs its own reviewed plan and your approval.

## iPhone blocker (precise; nothing for you to try)

There is no verified iPhone-only route, for two reasons:
- **Untested engine:** this review environment has only Chromium. It has no iPhone, Safari or WebKit engine, so the page could not be run as iPhone Safari runs it.
- **No way onto the phone:** there is no reviewed way to open the page on an iPhone so that its script runs.
  - GitHub serves repository files as plain text in a locked sandbox, so scripts do not run.
  - The website workflow publishes only `index.html`. Publishing the tool would be a workflow change, which is not authorized.
  - Opening a saved HTML file from the iPhone Files app is a preview whose script support was not verified.

Until one of these is reviewed and verified, the key must be made and checked with a computer (rows 1–2 above).
