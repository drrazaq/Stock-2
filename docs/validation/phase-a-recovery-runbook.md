# Phase A rollback and evidence recovery

No validation workflow has been installed or dispatched. These instructions apply only after explicit approval of the dated session and its exact workflow bytes.

## Stop / rollback

1. To stop immediately, use Actions → the specific validation run → Cancel workflow. No automatic restart or recurring schedule exists. The revised wrapper refuses reruns and later dispatches for the same dated title using preserved run history. Do not delete that history to bypass the guard, and do not retry without fresh explicit approval.
2. The proposed 340-minute process timeout leaves cleanup time before the 360-minute job timeout. Ordinary failed collection attempts still attempt evaluation, sealing and encrypted upload. **Force cancellation, the hard job timeout, VM loss or upload failure can prevent final cleanup and lose unuploaded data.** Neither the pinned collector nor `always()` guarantees artifact recovery after those events. Such an attempt is incomplete/failed, never a success. If guaranteed recovery of intermediate data is required, a newly reviewed checkpointing design/source is needed before approval; it is not silently substituted for `7dd702d`.
3. After the job has stopped, revert/delete only the newly installed `.github/workflows/premarket-research-validation.yml`. Do not merge PR1, revert unrelated main updates, alter existing schedules, cancel broker orders, change secrets, or restore frozen research. The validation workflow never writes positions, orders or canonical production data.

## Download before retention expires

Encrypted Phase A evidence is retained for **three days**. Open the run's Artifacts section and download `encrypted-premarket-RUN_ID-1`. Unzip into a private local folder. Do not upload decrypted files to the public repository, an issue, chat or another service.

Optional equivalent on a machine already authenticated to GitHub:

```sh
gh run download RUN_ID --repo drrazaq/Stock-2 --name encrypted-premarket-RUN_ID-1 --dir phase-a-encrypted
```

Use the directory containing the encrypted relative paths as input, not an extra wrapper directory added by an unzip application. Keep an unchanged copy of the encrypted download.

## Decrypt offline

Requires local Node20+ and Python3. Use recovery tools from verified engineering commit `889dcb2193dc26f91a5611f3e9277fca2b99b40c`: `tools/recover-research-artifact.py`, `tools/recover-research-artifact.mjs`, and its unchanged sibling `tools/seal-research-artifact.mjs`. These offline tools are newer than the pinned collector; do not expect them in the old main checkout. The tools perform no network requests. Use a fresh output directory outside the repository:

```sh
python3 tools/recover-research-artifact.py phase-a-encrypted phase-a-recovered 7dd702d5d2ed3578f7558bc4f7fcc211f3619669
```

Enter the existing key only at the hidden prompt in your local terminal. **Never paste it into chat, a workflow input, command arguments, logs or a support message.** The helper passes it only to the local child environment; it does not write the key. A wrong key, altered authentication tag, unexpected source/path, symlink or oversized input aborts. All tags are verified before any plaintext output directory is created. Existing output directories are refused.

Read `recovery-report.json`. `AUTHENTICATED_INCOMPLETE` means readable evidence with missing/partial session information; it is not full-session acceptance. Missing summaries or encrypted cycle files remain explicit. Even `AUTHENTICATED_CLOCK_WINDOW_ONLY` proves neither freshness, tradable-universe coverage, data completeness nor profitability. Review the separate `validation-evaluation.json`, source/input SHAs, individual field clocks, error counts, and all330 expected minute samples. The revised wrapper fails validation on inadequate responses/latency/coverage rather than relying on collector exit0.

## Key recoverability is currently unverified

The local engineering workspace has no bound research key. Commit4c919aa reports that the owner saved/configured RESEARCH_ARTIFACT_KEY, but that is not independent offline-recovery proof. The legacy PRIVATE_KEY and legacy encrypted data must remain untouched. Fixture encryption/decryption proves the code path only. GitHub secret names/references do not prove that an owner-held copy matches the active binding. No real-key test was run.

To close this blocker, first confirm an independently recoverable owner copy. If needed, separately approve the non-active `key-recovery-proof.yml.proposed`: a branch-only, five-minute key check that binds only the existing RESEARCH_ARTIFACT_KEY, seals a known non-sensitive marker and uploads only its ciphertext. It does not install or dispatch Phase A, request market data, send Telegram, use broker keys, change a secret or touch production. It has not been installed or triggered.

After an authorized key-proof run, download `phase-a-key-proof-RUN_ID-1` and recover it with the same offline command (substitute the downloaded folder). The expected local `key-check.txt` is exactly `Stock2 Phase A recovery challenge v1`. A challenge intentionally has no session summary, so its recovery report is incomplete while authentication succeeds. Confirm only success/failure; do not share the key or owner data. A mismatch blocks Phase A and requires owner-controlled key recovery, not an automatic rotation or permission change.
