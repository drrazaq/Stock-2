"""Offline, Python 3.9+ recovery of the existing Stock-2 key challenge only.

Dependency: cryptography (AESGCM and Scrypt). No Node, network, subprocesses,
environment-key lookup, legacy data access, or unauthenticated plaintext output.
"""
import base64
import binascii
import getpass
import json
import os
from pathlib import Path
import sys
import warnings

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

SOURCE_SHA = "7dd702d5d2ed3578f7558bc4f7fcc211f3619669"
MARKER = b"Stock2 Phase A recovery challenge v1"
MAX_ENVELOPE_BYTES = 65536


class RecoveryError(Exception):
    pass


def reject_duplicates(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise RecoveryError("MALFORMED_ENVELOPE")
        result[name] = value
    return result


def decode_field(value, length=None):
    try:
        if not isinstance(value, str):
            raise ValueError()
        body = base64.b64decode(value, validate=True)
        if length is not None and len(body) != length:
            raise ValueError()
        return body
    except (ValueError, binascii.Error):
        raise RecoveryError("MALFORMED_ENVELOPE") from None


def recover_challenge(input_dir, output_dir, secret, expected_sha):
    if expected_sha != SOURCE_SHA:
        raise RecoveryError("UNEXPECTED_SOURCE_SHA")
    src, dest = Path(input_dir), Path(output_dir)
    # Reject symlink components, including broken output links. No traversal or
    # ZIP extraction is performed; only this exact non-sensitive challenge opens.
    for candidate in (src, dest):
        if any(p.is_symlink() for p in (candidate, *candidate.parents)):
            raise RecoveryError("RECOVERY_SYMLINK_BLOCKED")
    if dest.exists():
        raise RecoveryError("RECOVERY_OUTPUT_ALREADY_EXISTS")
    if not src.is_dir() or sorted(p.name for p in src.iterdir()) != ["key-check.txt.enc"]:
        raise RecoveryError("EXPECTED_SINGLE_CHALLENGE_FILE")
    challenge = src / "key-check.txt.enc"
    if challenge.is_symlink() or not challenge.is_file():
        raise RecoveryError("RECOVERY_SYMLINK_BLOCKED")
    with challenge.open("rb") as handle:
        raw = handle.read(MAX_ENVELOPE_BYTES + 1)
    if len(raw) > MAX_ENVELOPE_BYTES:
        raise RecoveryError("RECOVERY_BUDGET_EXCEEDED")
    try:
        envelope = json.loads(raw.decode("utf-8"), object_pairs_hook=reject_duplicates)
    except (ValueError, UnicodeError):
        raise RecoveryError("MALFORMED_ENVELOPE") from None
    if (not isinstance(envelope, dict)
            or set(envelope) != {"version", "context", "iv", "tag", "ciphertext"}
            or type(envelope["version"]) is not int or envelope["version"] != 1):
        raise RecoveryError("UNSUPPORTED_ENVELOPE")
    context = envelope["context"]
    if context != {"sourceSha": expected_sha, "path": "key-check.txt"}:
        raise RecoveryError("RECOVERY_SCOPE_MISMATCH")
    # Preserve the stored context's insertion order, exactly as JSON.stringify
    # did for the Node-produced GCM additional authenticated data (AAD).
    aad = json.dumps({"version": 1, "context": context},
                     ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    iv = decode_field(envelope["iv"], 12)
    tag = decode_field(envelope["tag"], 16)
    ciphertext = decode_field(envelope["ciphertext"])
    if not isinstance(secret, str) or len(secret.encode("utf-16-le")) // 2 < 16:
        raise RecoveryError("ARTIFACT_KEY_UNAVAILABLE")
    # Node scryptSync defaults: N=16384, r=8, p=1, 32-byte AES-256 key.
    key = Scrypt(salt=b"Stock2ResearchArtifactV1", length=32,
                 n=16384, r=8, p=1).derive(secret.encode("utf-8"))
    try:
        plaintext = AESGCM(key).decrypt(iv, ciphertext + tag, aad)
    except InvalidTag:
        raise RecoveryError("AUTHENTICATION_FAILED") from None
    finally:
        key = None
    if plaintext != MARKER:
        raise RecoveryError("CHALLENGE_MARKER_MISMATCH")
    report = {"sourceSha": expected_sha, "authenticated": True, "files": 1,
              "challengeMatched": True, "status": "AUTHENTICATED_CHALLENGE_ONLY",
              "note": "No market coverage or Phase A authorization is implied."}
    # All scope, tag and marker checks pass BEFORE any output is created.
    dest.mkdir(mode=0o700)
    for name, body in (("key-check.txt", plaintext),
                       ("recovery-report.json", json.dumps(report, indent=2).encode("utf-8"))):
        fd = os.open(str(dest / name), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(body)
    return report


def main():
    if len(sys.argv) != 4:
        raise RecoveryError("usage: python3 recover-key-proof.py ENCRYPTED_DIR NEW_OUTPUT_DIR EXPECTED_SOURCE_SHA")
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise RecoveryError("INTERACTIVE_TERMINAL_REQUIRED")
    # getpass can otherwise fall back to displaying input; fail closed instead.
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            secret = getpass.getpass("Saved RESEARCH_ARTIFACT_KEY (hidden, offline): ")
        except getpass.GetPassWarning:
            raise RecoveryError("HIDDEN_PROMPT_UNAVAILABLE") from None
    try:
        print(json.dumps(recover_challenge(*sys.argv[1:3], secret, sys.argv[3])))
    finally:
        secret = None  # Python cannot guarantee zeroization of immutable strings.


if __name__ == "__main__":
    try:
        main()
    except (RecoveryError, OSError, EOFError, KeyboardInterrupt) as error:
        # Never echo exception payloads containing an envelope or user input.
        print(str(error) if isinstance(error, RecoveryError) else "RECOVERY_ABORTED", file=sys.stderr)
        sys.exit(1)
