# K2: the dedicated data key `R1_DATA_KEY` (owner steps; review only)

**What it is:**
- A new secret used **only** to encrypt the provider-data files (R1).
- `PRIVATE_KEY`, Alpaca, Telegram and every other existing credential stay exactly as they are. Nothing is rotated or regenerated.

**Rules:**
- The key is made **on your own device**.
- It goes only to two private backup places and into GitHub's secret page.
- **Never** paste it in chat, email, a GitHub comment, an issue or a file in the repository. Claude never needs to see it.

**Format:**
- Exactly **64 characters**, each `0`–`9` or `a`–`f`. That is 32 random bytes.
- The release tools refuse anything else (`SEALED_KEY_FORMAT`), so a typing mistake cannot become the key.

## Step 1: make the key (on your computer)

**Mac:**
1. Open **Terminal**: press Cmd+Space, type `Terminal`, press Enter.
2. Paste this line and press Enter:
   ```
   openssl rand -hex 32
   ```

**Windows:**
1. Open **PowerShell** from the Start menu.
2. Paste this line and press Enter:
   ```
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
   ```

**Check:** one line of **64** characters appears, using only digits and the letters a–f. Count roughly: 8 groups of 8. If it is not 64, run the line again.

## Step 2: store the recovery copy in two places outside GitHub

Do this **before** you close the window.

1. In your password manager, create an entry named `Stock-2 R1_DATA_KEY`, and paste the 64 characters as the password.
2. Write it on paper, or print it, and keep it somewhere safe and separate from the computer.
3. Copy it from the password manager and compare it with the paper: all 64 characters must match.

If this key is ever lost, the encrypted data can **not** be recovered. These two copies are what prevents that.

## Step 3: add it to GitHub (only when Claude says the reviewed package passed)

1. Open github.com, then the repository **drrazaq/Stock-2**.
2. Go to **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**.
3. Fill in the form:
   - **Name:** `R1_DATA_KEY`
   - **Secret:** paste the 64 characters from the password manager. Paste exactly; no space at the start or end.
4. Click **Add secret**.
5. Tell Claude only: "R1_DATA_KEY is listed." **Do not** send the value.

No workflow reads `R1_DATA_KEY` until the reviewed release is approved and pushed. Adding it changes nothing that runs today.

## Step 4 (inside the release window): prove your copy equals the secret

This is stage B5b.
1. Add a **temporary** secret `R1_BACKUP_CHECK`, pasted from the **paper or password-manager copy**, not from the GitHub page.
2. Claude runs the one-time `backup-compare` job. It prints only PASS or FAIL.
3. Delete `R1_BACKUP_CHECK` right after.

FAIL means nothing is migrated; you then compare your copies and try once more.
