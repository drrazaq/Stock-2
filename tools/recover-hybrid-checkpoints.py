"""Python3.9+ offline V1-envelope recovery for separately pinned hybrid checkpoints.
Does not change or relax the original Phase A/key-challenge source pins.
"""
import base64
import getpass
import json
from pathlib import Path
import re
import sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

def unique(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("DUPLICATE_JSON_KEY")
        out[key] = value
    return out

def recover(input_dir, output_dir, secret, expected_sha):
    if not isinstance(expected_sha, str) or not re.fullmatch(r"[a-f0-9]{40}", expected_sha):
        raise ValueError("EXPECTED_REVIEWED_SOURCE_SHA_REQUIRED")
    src, dest = Path(input_dir), Path(output_dir)
    for target in (src, dest):
        if any(p.is_symlink() for p in (target, *target.parents)):
            raise ValueError("SYMLINK_BLOCKED")
    if dest.exists() or not src.is_dir():
        raise ValueError("NEW_OUTPUT_AND_INPUT_DIRECTORY_REQUIRED")
    if not isinstance(secret, str) or len(secret.encode("utf-16-le")) // 2 < 16:
        raise ValueError("ARTIFACT_KEY_UNAVAILABLE")
    key = Scrypt(salt=b"Stock2ResearchArtifactV1", length=32, n=16384, r=8, p=1).derive(secret.encode("utf-8"))
    cipher = AESGCM(key)
    key = None
    payloads, total_input, total_plain, ignored = [], 0, 0, 0
    for item in sorted(src.iterdir()):
        if item.is_symlink() or not item.is_file():
            raise ValueError("INPUT_TYPE_BLOCKED")
        size = item.stat().st_size
        total_input += size
        if size > 12 * 1024 * 1024 or total_input > 96 * 1024 * 1024:
            raise ValueError("INPUT_BUDGET")
        if item.name.startswith(".pending-"):
            ignored += 1
            continue
        match = re.fullmatch(r"checkpoint-(\d{3})\.json\.gz\.enc", item.name)
        if not match or len(payloads) >= 330:
            raise ValueError("CHECKPOINT_SCOPE_BLOCKED")
        env = json.loads(item.read_text(encoding="utf-8"), object_pairs_hook=unique)
        relative = item.name[:-4]
        if (not isinstance(env, dict) or set(env) != {"version", "context", "iv", "tag", "ciphertext"}
                or type(env["version"]) is not int or env["version"] != 1
                or env["context"] != {"sourceSha": expected_sha, "path": relative}):
            raise ValueError("SOURCE_OR_PATH_MISMATCH")
        iv, tag, ciphertext = (base64.b64decode(env[k], validate=True) for k in ("iv", "tag", "ciphertext"))
        if len(iv) != 12 or len(tag) != 16:
            raise ValueError("MALFORMED_ENVELOPE")
        aad = json.dumps({"version": 1, "context": env["context"]}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        body = cipher.decrypt(iv, ciphertext + tag, aad)
        total_plain += len(body)
        if total_plain > 128 * 1024 * 1024:
            raise ValueError("PLAINTEXT_BUDGET")
        payloads.append((relative, body))
    if not payloads:
        raise ValueError("NO_AUTHENTICATED_CHECKPOINTS")
    # Verify every present tag and scope before creating any output directory.
    dest.mkdir(mode=0o700)
    for name, body in payloads:
        with (dest / name).open("xb") as handle:
            handle.write(body)
        (dest / name).chmod(0o600)
    report = {"authenticated": True, "sourceSha": expected_sha, "files": len(payloads), "ignoredStagingFiles": ignored,
              "status": "AUTHENTICATED_CHECKPOINT_FILES_ONLY",
              "note": "Compressed bytes authenticated only; no decompression, sequence/state completeness, market coverage, fills or profitability claim."}
    (dest / "recovery-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report

def main():
    if len(sys.argv) != 4 or not sys.stdin.isatty():
        raise SystemExit("Use an interactive offline terminal: python3 tools/recover-hybrid-checkpoints.py ENCRYPTED_DIR NEW_OUTPUT_DIR REVIEWED_SOURCE_SHA")
    secret = getpass.getpass("Research artifact recovery key (hidden, local only): ")
    try:
        print(json.dumps(recover(sys.argv[1], sys.argv[2], secret, sys.argv[3])))
    except Exception:
        raise SystemExit("Recovery refused: authentication, scope, input or storage validation failed; no key is displayed.") from None
    finally:
        secret = None

if __name__ == "__main__":
    main()
