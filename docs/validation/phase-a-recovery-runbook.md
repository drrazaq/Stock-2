# Phase A stop, rollback and offline evidence recovery

**Key prerequisite VERIFIED by owner on29October2026. Phase A itself is NOT installed, dispatched or authorized.** Instructions below apply only to a separately approved dated run and exact reviewed workflow bytes. No repeat key-proof job is needed.

## Stop / rollback

1. Cancel the specific validation run from GitHub Actions. No automatic restart or cron exists. Keep all run records: reruns/later dispatches for the same date are rejected by attempt/history guards. Never delete a failed run to bypass these guards.
2. After it stops, revert/delete only `.github/workflows/premarket-research-validation.yml` on main, preserving any concurrent main commits. Do not merge PR1, modify other workflows/schedules, change secrets, cancel broker orders or rewrite production/frozen data. This workflow writes none of those data files.
3. A340minute process timeout reserves cleanup time before the360minute hard job cap. Ordinary failure attempts evaluation, sealing and upload. Force cancellation, VM loss, hard timeout, sealing failure or upload/quota failure can still lose unuploaded evidence. The pinned7dd702d source has **no encrypted intermediate uploads**. Any lost/partial attempt fails validation; no blind retry is authorized.

## Download before three-day expiry

Open the actual authorized run's Artifacts section and download `encrypted-premarket-RUN_ID-1`. Keep the original encrypted ZIP and the GitHub-reported digest. Download before the displayed expiry. On iPad copy the ZIP using Files into a fresh private iSH folder, for example `/root/stock2-phase-a`. Do not upload decrypted files to GitHub, chat, issues or another service.

Check `sha256sum phase-a.zip` against the actual run's GitHub artifact digest, then inspect/extract only that GitHub-produced ZIP into a fresh `phase-a-encrypted` directory. No ZIP extraction is performed by the recovery tool. Reject unexpected absolute/traversal paths or symlinks; the recovery tool also refuses symlinks and unexpected plaintext input files. The input folder must directly contain the encrypted relative paths, not an extra enclosing ZIP folder.

## Python-only iSH recovery

Use the **published, CI-verified version** of the single public file `tools/recover-phase-a.py` linked with the approved proposal/evidence. It is a different tool from `recover-key-proof.py`, which intentionally opens only the challenge. Python3.9.16 and packaged `py3-cryptography` suffice; no Node upgrade is required. While online, install/check if needed:

```sh
apk add --no-cache py3-cryptography
python3 -c 'from cryptography.hazmat.primitives.ciphers.aead import AESGCM; from cryptography.hazmat.primitives.kdf.scrypt import Scrypt; print("Crypto ready")'
```

Download the public tool before disconnecting. Keep its exact commit/hash from the engineering evidence. Activate Airplane Mode and turn Wi-Fi off. From the folder containing the script and encrypted artifact directory, use a local interactive terminal:

```sh
umask 077
python3 recover-phase-a.py phase-a-encrypted phase-a-recovered 7dd702d5d2ed3578f7558bc4f7fcc211f3619669
```

Enter the saved **RESEARCH_ARTIFACT_KEY** only at the hidden prompt. No characters/stars appear. Never use the legacy key or put a key in argv, environment commands, files, screenshots, browser inputs or chat. The tool performs no network requests or subprocesses and reads no environment key. It refuses an insecure prompt, wrong source/path, duplicate envelope keys, bad tags, symlinks, existing output and exceeded input/plaintext/file/depth budgets. No plaintext output directory is created until all present envelopes authenticate. Disk failure after authentication can leave a partial output directory; preserve it and use a fresh output name for any owner-controlled local retry. Do not overwrite existing recovery output.

Maximum encrypted input96MiB, plaintext128MiB,512 files and directory depth8. All authenticated payloads are buffered before output, so iSH needs enough memory; memory exhaustion is a local recovery failure, not a new collection authorization. The saved key is not written/logged; Python cannot guarantee erasure of all immutable secret memory. Close iSH after verification and avoid clipboard retention.

## Interpret the report honestly

Read `phase-a-recovered/recovery-report.json` locally. `authenticated:true` means the present files passed AES-GCM authentication with matching source/path. It does **not** mean all original files were uploaded.

- `AUTHENTICATED_INCOMPLETE`: absent/malformed summaries, missing cycles, mismatched counts or incomplete clock assertions. Preserve/review the partial evidence; do not call it a successful full session.
- `AUTHENTICATED_FILE_COUNTS_ONLY`: one valid scoped attempt summary and330 expected cycle filenames/counts/compressed bytes agree. The tool deliberately **does not decompress or evaluate market payloads**. This is neither freshness nor full-market certification.

Review decrypted `validation-evaluation.json` separately: it must state `COLLECTION_CHECKS_PASSED_ONLY`, not a BUY/profitability claim. Inspect actual330 minute observations, field clocks, fresh-price percentages, latency/errors, source/input SHAs and source availability. Missing evaluation is unvalidated even when GCM succeeds. Never substitute later prices for missing first-detection evidence.

The older Node20 recovery tools remain available for a suitable desktop. They are not needed on iSH. Their `AUTHENTICATED_CLOCK_WINDOW_ONLY` label also does not establish freshness, all-file completeness or profitability.
