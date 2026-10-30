"""Python 3.9+ offline recovery for isolated Phase A artifacts, not owner data.

Requires packaged cryptography. No network, subprocess, key environment lookup,
ZIP extraction, Node, or legacy key access. Every GCM tag passes before output.
"""
import base64
import binascii
import getpass
import json
import os
from pathlib import Path
import re
import sys
import warnings
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

SOURCE = "7dd702d5d2ed3578f7558bc4f7fcc211f3619669"
MAX_INPUT = 96 * 1024 * 1024
MAX_PLAIN = 128 * 1024 * 1024
MAX_FILES = 512


class RecoveryError(Exception):
    pass


def unique_object(pairs):
    obj = {}
    for name, value in pairs:
        if name in obj:
            raise RecoveryError("DUPLICATE_JSON_KEY")
        obj[name] = value
    return obj


def load_json(raw):
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object)
    except (ValueError, UnicodeError):
        raise RecoveryError("MALFORMED_ENVELOPE") from None


def decode(value, length=None):
    try:
        if not isinstance(value, str):
            raise ValueError()
        body = base64.b64decode(value, validate=True)
        if length is not None and len(body) != length:
            raise ValueError()
        return body
    except (ValueError, binascii.Error):
        raise RecoveryError("MALFORMED_ENVELOPE") from None


def recover_directory(input_dir, output_dir, secret, expected_sha):
    if expected_sha != SOURCE:
        raise RecoveryError("UNEXPECTED_SOURCE_SHA")
    src, dest = Path(input_dir), Path(output_dir)
    for candidate in (src, dest):
        if any(p.is_symlink() for p in (candidate, *candidate.parents)):
            raise RecoveryError("RECOVERY_SYMLINK_BLOCKED")
    if dest.exists():
        raise RecoveryError("RECOVERY_OUTPUT_ALREADY_EXISTS")
    if not src.is_dir():
        raise RecoveryError("INPUT_DIRECTORY_REQUIRED")
    if not isinstance(secret, str) or len(secret.encode("utf-16-le")) // 2 < 16:
        raise RecoveryError("ARTIFACT_KEY_UNAVAILABLE")
    key = Scrypt(salt=b"Stock2ResearchArtifactV1", length=32,
                 n=16384, r=8, p=1).derive(secret.encode("utf-8"))
    cipher = AESGCM(key)
    key = None
    payloads, input_bytes, plain_bytes = [], 0, 0

    def walk(directory, depth=0):
        nonlocal input_bytes, plain_bytes
        if depth > 8:
            raise RecoveryError("RECOVERY_DEPTH_EXCEEDED")
        for item in sorted(directory.iterdir()):
            if item.is_symlink():
                raise RecoveryError("RECOVERY_SYMLINK_BLOCKED")
            if item.is_dir():
                walk(item, depth + 1)
                continue
            if not item.is_file() or not item.name.endswith(".enc"):
                raise RecoveryError("UNEXPECTED_RECOVERY_FILE")
            relative = item.relative_to(src).as_posix()[:-4]
            if (not re.fullmatch(r"[A-Za-z0-9_./-]+", relative) or ".." in relative
                    or relative == "recovery-report.json" or len(relative) > 240
                    or len(payloads) >= MAX_FILES):
                raise RecoveryError("RECOVERY_SCOPE_MISMATCH")
            with item.open("rb") as handle:
                raw = handle.read(MAX_INPUT - input_bytes + 1)
            input_bytes += len(raw)
            if input_bytes > MAX_INPUT:
                raise RecoveryError("RECOVERY_INPUT_BUDGET_EXCEEDED")
            envelope = load_json(raw)
            if (not isinstance(envelope, dict)
                    or set(envelope) != {"version", "context", "iv", "tag", "ciphertext"}
                    or type(envelope["version"]) is not int or envelope["version"] != 1):
                raise RecoveryError("UNSUPPORTED_ENVELOPE")
            context = envelope["context"]
            if context != {"sourceSha": expected_sha, "path": relative}:
                raise RecoveryError("RECOVERY_SCOPE_MISMATCH")
            aad = json.dumps({"version": 1, "context": context},
                             ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            try:
                body = cipher.decrypt(decode(envelope["iv"], 12),
                                      decode(envelope["ciphertext"]) + decode(envelope["tag"], 16), aad)
            except InvalidTag:
                raise RecoveryError("AUTHENTICATION_FAILED") from None
            plain_bytes += len(body)
            if plain_bytes > MAX_PLAIN:
                raise RecoveryError("RECOVERY_PLAINTEXT_BUDGET_EXCEEDED")
            payloads.append((relative, body))

    try:
        walk(src)
    finally:
        cipher = None
    if not payloads:
        raise RecoveryError("EMPTY_RECOVERY")
    # Never decompress market payloads during recovery. GCM authenticates the
    # original compressed bytes; bounded analysis is a separate operation.
    summaries = []
    for relative, body in payloads:
        if not relative.endswith("/summary.json"):
            continue
        folder = relative.rsplit("/", 1)[0]
        cycles = [(name, b) for name, b in payloads
                  if name.rsplit("/", 1)[0] == folder and re.fullmatch(r"\d{3}\.json\.gz", name.rsplit("/", 1)[-1])]
        problems = []
        try:
            summary = load_json(body)
        except RecoveryError:
            summary = None
        if not isinstance(summary, dict):
            problems.append("MALFORMED_SUMMARY")
        else:
            if summary.get("sourceSha") != expected_sha or summary.get("mode") != "RESEARCH_ONLY" or summary.get("orders") is not False or summary.get("approvedBuy") is not False:
                problems.append("SUMMARY_SCOPE_MISMATCH")
            if summary.get("attempt") != folder or not re.fullmatch(r"\d+-1", folder):
                problems.append("ATTEMPT_IDENTITY_MISMATCH")
            if (type(summary.get("cycles")) is not int or summary["cycles"] != len(cycles)
                    or type(summary.get("bytes")) is not int or summary["bytes"] != sum(len(b) for _, b in cycles)):
                problems.append("CYCLE_COUNT_OR_BYTE_MISMATCH")
            if (summary.get("executionWindowComplete") is not True
                    or type(summary.get("uniqueMinutes")) is not int or summary["uniqueMinutes"] != 330
                    or {name.rsplit("/", 1)[-1] for name, _ in cycles} != {"%03d.json.gz" % n for n in range(330)}):
                problems.append("INCOMPLETE_CLOCK_EVIDENCE")
        summaries.append({"attempt": folder, "files": len(cycles), "problems": problems})
    complete_counts = len(summaries) == 1 and not summaries[0]["problems"]
    report = {"sourceSha": expected_sha, "authenticated": True, "files": len(payloads),
              "bytes": plain_bytes, "summaries": summaries,
              "status": "AUTHENTICATED_FILE_COUNTS_ONLY" if complete_counts else "AUTHENTICATED_INCOMPLETE",
              "note": "GCM authenticates present files only. Missing summaries/cycles remain incomplete. Files not listed by a summary may still be missing. No decompression, minute/freshness/latency validation, market completeness, profitability or BUY approval is implied. Review validation-evaluation.json separately."}
    # All tags and paths are verified BEFORE creating any plaintext output.
    dest.mkdir(mode=0o700)
    for relative, body in payloads + [("recovery-report.json", json.dumps(report, indent=2).encode("utf-8"))]:
        target = dest / relative
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(str(target), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(body)
    return report


def main():
    if len(sys.argv) != 4:
        raise RecoveryError("usage: python3 recover-phase-a.py ENCRYPTED_DIR NEW_OUTPUT_DIR EXPECTED_SOURCE_SHA")
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise RecoveryError("INTERACTIVE_TERMINAL_REQUIRED")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            secret = getpass.getpass("Saved RESEARCH_ARTIFACT_KEY (hidden, offline): ")
        except getpass.GetPassWarning:
            raise RecoveryError("HIDDEN_PROMPT_UNAVAILABLE") from None
    try:
        print(json.dumps(recover_directory(*sys.argv[1:3], secret, sys.argv[3])))
    finally:
        secret = None


if __name__ == "__main__":
    try:
        main()
    except (RecoveryError, OSError, EOFError, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, RecoveryError) else "RECOVERY_ABORTED", file=sys.stderr)
        sys.exit(1)
