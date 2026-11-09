# K2: the dedicated data key `R1_DATA_KEY` (owner steps; review only; nothing here is authorized yet)

> **Status (rev20): SETUP BLOCKED for an iPhone-only owner.** No reviewed, verified route exists to make the key and prove its copies on an iPhone (see "iPhone blocker"). No real key is to be made or enrolled until one does. The computer routes below are documented for completeness and were verified only in Chromium.

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
4. **Any result other than PASS** stops the release before migration, and nothing is encrypted. That means NOT VERIFIED, INPUT ERROR or UNSUPPORTED.
   - The page cannot tell why a check failed: the copy may differ, the record may have been altered, or the browser may have failed. **Nothing about the data can be concluded.**
   - Report the exact result line to Claude. **Do not run, repeat or retry any release step.** A further attempt needs its own reviewed plan and your approval.
   - If the page shows **UNSUPPORTED** when it opens, the browser lacks a needed capability. The buttons are disabled, and nothing is made or checked.

## iPhone blocker (precise; nothing for you to try)

There is no verified iPhone-only route. Each of the following is a blocker on its own:
1. **No iPhone engine in review.** Neither this review environment nor Codex's has Safari, WebKit or an iOS device; both have only Chromium. The tool's behaviour on iOS Safari cannot be observed by either reviewer. It needs `crypto.subtle`, `crypto.getRandomValues`, `DecompressionStream('deflate-raw')` and a secure context, and it now refuses to run without them. Documentation is not verification.
2. **No reviewed way to open the tool on an iPhone with its script running:**
   - GitHub serves repository files as `text/plain` with CSP `sandbox`, so scripts do not run (confirmed).
   - The website workflow publishes only `index.html`. Publishing the tool would be a workflow change that is not authorized.
   - A file opened from the Files app is a preview whose script support is not verified.
   - Local `file://` pages are blocked in Codex's managed browser (`ERR_BLOCKED_BY_ADMINISTRATOR`); the evidence now serves the page from `127.0.0.1` instead.
3. **The only verification step is on your phone.** Any iPhone route still needs a synthetic preflight (the built-in test record, no real key) run on an actual iPhone. The only iPhone in this process is yours, and you asked not to be given unverified iPhone steps. So that preflight cannot happen without your separate, explicit decision.

What would unblock it (each is your decision; none is requested now):
- (a) a reviewed hosting route for the tool, such as an approved change to the website workflow, followed by your explicit consent to a synthetic, no-real-key preflight on your iPhone;
- (b) use of any computer with Chrome or Edge for the one-time key steps, which is verified in Chromium;
- (c) keep R1 deferred.
