# iPad/iSH: Python-only offline challenge recovery

No Node upgrade is needed. This tool uses the packaged `cryptography` library's AES-256-GCM and scrypt implementation. It opens the **existing** GitHub challenge without changing its format. It is deliberately restricted to this single non-sensitive challenge, not owner data or market-session artifacts. Independent owner recovery remains **PENDING** until you confirm success. Phase A remains unauthorized.

## 1. Install the dependency while online

In iSH, run:

```sh
apk add --no-cache py3-cryptography curl unzip
python3 --version
python3 -c 'import cryptography; from cryptography.hazmat.primitives.ciphers.aead import AESGCM; from cryptography.hazmat.primitives.kdf.scrypt import Scrypt; print("Crypto dependency ready:", cryptography.__version__)'
mkdir -p /root/stock2-key-proof
cd /root/stock2-key-proof
umask 077
```

Use iSH's **existing configured Alpine repositories**. Do not add another Alpine release's repository, upgrade Node, install an unofficial crypto package or type a key during setup. `apk` may update compatible Python patch dependencies; this script needs Python3.9 or newer. If `apk` cannot locate `py3-cryptography`, or the import check fails, stop and report only that package/import error. Do not attempt a Rust/source pip build on iSH. Installation/downloads below need Internet; the recovery command does not.

## 2. Download the public tool and unchanged encrypted artifact

Download the public `tools/recover-key-proof.py` from the exact **published commit linked with this guide**, not an arbitrary branch revision. Save as `/root/stock2-key-proof/recover-key-proof.py`. GitHub's Raw/Download button in Safari may be used. The accompanying message provides an exact `curl` command with the immutable commit SHA. No other Stock-2 script is required.

In Safari, while signed into GitHub, download this encrypted ZIP:

https://github.com/drrazaq/Stock-2/actions/runs/40834596544/artifacts/12879798326

Artifact name: `phase-a-key-proof-40834596544-1`; run40834596544, attempt1. **Download before 2026-11-01 07:18:43UTC.** No new proof run is needed. Keep the unchanged ZIP.

In the iPad Files app, copy the downloaded ZIP into **iSH → root → stock2-key-proof**. Rename that copied ZIP `key-proof.zip` if Safari used another name. Return to iSH:

```sh
cd /root/stock2-key-proof
sha256sum key-proof.zip
```

Expected GitHub-reported ZIP digest (not independently checked by the engineering workspace):

```text
2ee46a7fe6896e34f899be793043a5ef36b0240e2cc8924c6fd78f72a14ebff8
```

Stop on a digest mismatch. Extract only the named challenge from the GitHub ZIP:

```sh
mkdir encrypted-key-proof
unzip -p key-proof.zip key-check.txt.enc > encrypted-key-proof/key-check.txt.enc
```

Do not paste the encrypted file into chat. If ZIP extraction fails, fix the download first; do not enter a key.

## 3. Disconnect and recover

After setup/download, enable **Airplane Mode** and switch Wi-Fi off. The Python tool itself has no networking or subprocess code and reads no key from the environment. It never accesses `PRIVATE_KEY`, production data or Telegram.

Run in the interactive iSH terminal (not a pipe or redirected input):

```sh
cd /root/stock2-key-proof
python3 recover-key-proof.py encrypted-key-proof recovered-key-proof 7dd702d5d2ed3578f7558bc4f7fcc211f3619669
```

At `Saved RESEARCH_ARTIFACT_KEY (hidden, offline):`, enter your independently saved **research** key, then Return. **No characters or stars appear; that is expected.** Do not use the legacy key. Never place the key in a command, file, screenshot, chat or browser field. The tool does not log it or write it to disk. Python cannot guarantee immediate erasure of all secret memory; close the iSH session after verification. You may type rather than copy to avoid leaving a key in the iPad clipboard.

The tool reproduces Node's UTF-8 scrypt input, salt `Stock2ResearchArtifactV1`, N16384/r8/p1, and32-byte key. It verifies AES-GCM's16-byte tag and exact authenticated source/path before output, and then checks the expected marker. Wrong keys/tampering produce `AUTHENTICATION_FAILED`; scope mismatch produces `RECOVERY_SCOPE_MISMATCH`. Neither creates the output directory. A hidden-prompt failure aborts rather than displaying input.

`recovered-key-proof` must not already exist. For a retry use a new output name such as `recovered-key-proof-2`; do not overwrite/delete existing recovered files. If a disk-write failure leaves a partial directory, keep it and use a new name after resolving the storage problem.

## 4. Confirm the result

```sh
cat recovered-key-proof/recovery-report.json
cat recovered-key-proof/key-check.txt
```

Expected report: `"authenticated": true`, `"files": 1`, `"challengeMatched": true`, status **`AUTHENTICATED_CHALLENGE_ONLY`**. Expected non-sensitive text (there is no trailing newline):

```text
Stock2 Phase A recovery challenge v1
```

Reply only **“Challenge matched”** or the error name. Do not send your key or recovered files. This confirms the saved key can recover this GitHub-produced challenge; it does not establish market coverage, profitability or Phase A approval.

## Test evidence and limits

Fourteen automated tests cover an existing-format Node-produced public fixture, the NIST AES-256-GCM vector, wrong keys, ciphertext/tag/IV/AAD tampering, source/path mismatch, malformed inputs, size limits, hidden-prompt refusal, symlinks, extra files and overwrite prevention. No real key was used. Python3.9.16 is directly tested with cryptography46.0.3 and3.3.2 (the older Alpine-era API); Python3.12.14 is tested with cryptography50.0.0. The old library is tested for compatibility, not recommended as a new system-wide version. The engineering host could not execute the32-bit Alpine container (`exec format error`); no physical iPad/iSH test is claimed. The dependency check above is required on your device before entering the key.
