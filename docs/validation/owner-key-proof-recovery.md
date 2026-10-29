# Recover the GitHub-produced key challenge offline

The authorized isolated job succeeded. **Owner-side key recovery is still PENDING, not VERIFIED.** No Phase A collection is approved by this result.

- Run: [40834596544, attempt1](https://github.com/drrazaq/Stock-2/actions/runs/40834596544).
- Artifact: [phase-a-key-proof-40834596544-1](https://github.com/drrazaq/Stock-2/actions/runs/40834596544/artifacts/12879798326), artifact ID12879798326.
- Download before **1November2026,07:18:43UTC** (10:18:43Kuwait). Retention is three days.
- GitHub-reported ZIP digest: `sha256:2ee46a7fe6896e34f899be793043a5ef36b0240e2cc8924c6fd78f72a14ebff8`.

For **iPad/iSH with Python 3.9.16 and Node14**, use the [Python-only iSH guide](owner-key-proof-recovery-ish.md). It needs no Node and opens the same existing encrypted challenge. Owner verification remains pending.

## 1. Prepare public recovery tools

Use local Node20+ and Python3. No key belongs in a browser form, GitHub input, command argument or chat. The recovery command performs no network requests.

Download these three public files from verified source `d5c8c3259502054fd3864cb359c52de140d6498c` into a local `tools` folder, preserving their names (use GitHub's Download raw button):

- [recover-research-artifact.py](https://github.com/drrazaq/Stock-2/blob/d5c8c3259502054fd3864cb359c52de140d6498c/tools/recover-research-artifact.py)
- [recover-research-artifact.mjs](https://github.com/drrazaq/Stock-2/blob/d5c8c3259502054fd3864cb359c52de140d6498c/tools/recover-research-artifact.mjs)
- [seal-research-artifact.mjs](https://github.com/drrazaq/Stock-2/blob/d5c8c3259502054fd3864cb359c52de140d6498c/tools/seal-research-artifact.mjs)

The offline wrapper forwards only a small allowlist of system settings and the research key you enter; it neither reads nor forwards a legacy PRIVATE_KEY or NODE_OPTIONS. The crypto file is unchanged from the pinned7dd702d source.

## 2. Download the encrypted artifact

While logged in to GitHub, open the artifact link above and download/unzip it into `encrypted-key-proof`. That folder should directly contain **`key-check.txt.enc`**. Do not rename the encrypted file or use an extra wrapper folder as the input directory. Keep an unchanged encrypted copy.

Optional GitHub CLI equivalent, on an already authenticated machine:

```sh
gh run download 40834596544 --repo drrazaq/Stock-2 --name phase-a-key-proof-40834596544-1 --dir encrypted-key-proof
```

## 3. Decrypt locally with your saved research key

From the directory containing `tools` and `encrypted-key-proof`, run:

```sh
python3 tools/recover-research-artifact.py encrypted-key-proof recovered-key-proof 7dd702d5d2ed3578f7558bc4f7fcc211f3619669
```

On Windows, use `py` instead of `python3` if that is your installed Python3 launcher. Run from a local interactive terminal, not a notebook or redirected input. Enter your independently saved **RESEARCH_ARTIFACT_KEY** at the hidden prompt. Do not use the legacy key. The saved key is never supplied in argv or written to a file by the helper.

Use a fresh output directory: `recovered-key-proof` must not already exist. A wrong key, tampered ciphertext or source/path mismatch aborts before creating plaintext output. Report only an error name if needed; do not share a key, environment dump or a screenshot containing one.

## 4. Confirm the non-sensitive marker

Success requires both:

1. `recovered-key-proof/recovery-report.json` contains `"authenticated": true` and `"files": 1`.
2. Local `recovered-key-proof/key-check.txt` contains exactly:

```text
Stock2 Phase A recovery challenge v1
```

`AUTHENTICATED_INCOMPLETE` is **expected for this challenge**: it has no market-session summary. It does not indicate a failed key authentication, and must not be relabelled a complete market collection.

Reply only **“Challenge matched”** after successful local verification, or provide the error name. Do not send the key or recovered files. Until that confirmation, the ledger keeps independent recovery PENDING. Confirmation will close this key-proof condition only; Phase A still requires its separate revised-workflow review and explicit dated approval. No repeat job, secret rotation, legacy-key access or Phase A activation is authorized by a decryption error.
