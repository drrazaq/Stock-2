"""Offline Python3.9+ C0 recovery. No network; never changes legacy key tools."""
import base64
import getpass
import hashlib
import json
from pathlib import Path
import re
import sys
import zlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

def unique(pairs):
    out = {}
    for k, v in pairs:
        if k in out:
            raise ValueError("DUPLICATE_JSON_KEY")
        out[k] = v
    return out

def parse(text):
    def invalid(_):
        raise ValueError("NONFINITE_JSON")
    return json.loads(text, object_pairs_hook=unique, parse_constant=invalid)

def recover(input_dir, output_dir, secret, expected_sha, approval_hash):
    if not re.fullmatch(r"[a-f0-9]{40}", expected_sha or "") or not re.fullmatch(r"[a-f0-9]{64}", approval_hash or ""):
        raise ValueError("REVIEWED_SOURCE_AND_APPROVAL_HASH_REQUIRED")
    src, dest = Path(input_dir), Path(output_dir)
    for p in (src, dest):
        if any(x.is_symlink() for x in (p, *p.parents)):
            raise ValueError("SYMLINK_BLOCKED")
    if not src.is_dir() or dest.exists() or not isinstance(secret, str) or len(secret.encode("utf-16-le")) // 2 < 16:
        raise ValueError("INPUT_OUTPUT_OR_KEY_INVALID")
    key = Scrypt(salt=b"Stock2ResearchArtifactV1", length=32, n=16384, r=8, p=1).derive(secret.encode())
    cipher = AESGCM(key)
    key = None
    files = []
    for cycle in src.iterdir():
        if cycle.is_symlink() or not cycle.is_dir() or not re.fullmatch(r"cycle-[012]", cycle.name):
            raise ValueError("CYCLE_SCOPE_INVALID")
        for item in cycle.iterdir():
            if item.is_symlink() or not item.is_file() or not re.fullmatch(r"checkpoint-\d{3}\.json\.gz\.enc", item.name):
                raise ValueError("PENDING_OR_UNEXPECTED_FILE")
            files.append((item.name, int(cycle.name[-1]), item))
    files.sort()
    if not files or len(files) > 900:
        raise ValueError("EMPTY_OR_FRAME_BUDGET")
    totals = [0, 0, 0]
    verified = []
    ends = []
    failure = False
    pending = {}
    snapshots = {}
    asset_symbols = None
    guards = {}
    for sequence, (name, cycle, file) in enumerate(files):
        if name != "checkpoint-%03d.json.gz.enc" % sequence:
            raise ValueError("GAP_OR_DUPLICATE")
        size = file.stat().st_size
        totals[0] += size
        if size > 12 * 1024 * 1024 or totals[0] > 96 * 1024 * 1024:
            raise ValueError("SEALED_BUDGET")
        env = parse(file.read_text())
        context = {"sourceSha": expected_sha, "path": name[:-4]}
        if set(env) != {"version", "context", "iv", "tag", "ciphertext"} or type(env["version"]) is not int or env["version"] != 1 or env["context"] != context:
            raise ValueError("SOURCE_PATH_MISMATCH")
        iv, tag, ciphertext = (base64.b64decode(env[k], validate=True) for k in ("iv", "tag", "ciphertext"))
        if len(iv) != 12 or len(tag) != 16:
            raise ValueError("ENVELOPE_INVALID")
        aad = json.dumps({"version": 1, "context": context}, separators=(",", ":")).encode()
        zipped = cipher.decrypt(iv, ciphertext + tag, aad)
        totals[1] += len(zipped)
        if totals[1] > 64 * 1024 * 1024:
            raise ValueError("COMPRESSED_BUDGET")
        inflater = zlib.decompressobj(16 + zlib.MAX_WBITS)
        plain = inflater.decompress(zipped, 9 * 1024 * 1024 + 1)
        totals[2] += len(plain)
        if len(plain) > 9 * 1024 * 1024 or totals[2] > 128 * 1024 * 1024 or not inflater.eof or inflater.unconsumed_tail or inflater.unused_data:
            raise ValueError("PLAIN_GZIP_BUDGET")
        payload = parse(plain)
        frame = payload.get("frame", {})
        if payload.get("kind") != "C0_DIAGNOSTIC_FRAME_V1" or payload.get("sourceSha") != expected_sha or payload.get("approvalHash") != approval_hash or type(payload.get("sequence")) is not int or payload["sequence"] != sequence or frame.get("cycle") != cycle or frame.get("type") not in ("intent", "response", "cycle_end", "failure"):
            raise ValueError("FRAME_SCOPE_INVALID")
        if frame["type"] == "intent":
            ident = frame.get("id")
            if type(ident) is not int or ident != len(pending) or frame.get("kind") not in ("run_guard", "assets", "sip", "massive"):
                raise ValueError("INTENT_SCOPE_OR_SEQUENCE")
            pending[ident] = {"cycle": cycle, "kind": frame["kind"], "resolved": False}
            if frame["kind"] == "sip":
                symbols = frame.get("symbols")
                if not isinstance(symbols, list) or not symbols or len(symbols) > 200 or len(set(symbols)) != len(symbols):
                    raise ValueError("SNAPSHOT_SCOPE")
                snapshots.setdefault(cycle, []).extend(symbols)
        if frame["type"] == "response":
            intent = pending.get(frame.get("id"))
            raw = frame.get("rawJson")
            if not intent or intent["resolved"] or intent["cycle"] != cycle or intent["kind"] != frame.get("kind") or not isinstance(raw, str):
                raise ValueError("RESPONSE_INTENT_MISMATCH")
            body = raw.encode("utf-8")
            if len(body) != frame.get("bytes") or hashlib.sha256(body).hexdigest() != frame.get("bodySha256"):
                raise ValueError("RESPONSE_BYTE_IDENTITY")
            intent["resolved"] = True
            try:
                data = parse(raw)
            except (ValueError, json.JSONDecodeError):
                data = None  # Retain authenticated malformed response as incomplete.
            if frame["kind"] == "assets":
                if cycle != 0 or asset_symbols is not None or isinstance(data, list) and len(data) > 20000:
                    raise ValueError("ASSET_SCOPE")
                asset_symbols = [r["symbol"] for r in data if isinstance(r, dict) and r.get("status") == "active" and r.get("class") == "us_equity" and r.get("tradable") is True] if isinstance(data, list) else None
            if frame["kind"] == "run_guard":
                guards[cycle] = data
        if frame["type"] == "cycle_end":
            requested = snapshots.get(cycle, [])
            guard = guards.get(cycle) or {}
            entries = guard.get("workflow_runs") or []
            if (not asset_symbols or len(requested) != len(set(requested)) or set(requested) != set(asset_symbols)
                    or any(not x["resolved"] for x in pending.values() if x["cycle"] == cycle)
                    or guard.get("total_count") != 1 or len(entries) != 1
                    or str(entries[0].get("id")) != frame.get("runId") or entries[0].get("run_attempt") != 1):
                raise ValueError("INCOMPLETE_CYCLE_MARKER")

            ends.append((cycle, frame.get("status"), frame.get("universeId")))
        failure = failure or frame["type"] == "failure"
        verified.append((name[:-7], plain))
    complete = (not failure and [x[0] for x in ends] == [0, 1, 2]
                and all(x[1] == "LOCAL_COLLECTION_COMPLETE" for x in ends)
                and len(set(x[2] for x in ends)) == 1)
    # All tags, source/path and sequence checks complete before plaintext output.
    dest.mkdir(mode=0o700)
    for name, plain in verified:
        with (dest / name).open("xb") as handle:
            handle.write(plain)
        (dest / name).chmod(0o600)
    report = {"sourceSha": expected_sha, "approvalHash": approval_hash, "frames": len(verified),
              "localThreeCyclesPresent": complete, "remoteUploadVerified": False,
              "status": "AUTHENTICATED_LOCAL_FRAMES_ONLY",
              "note": "No entitlement, complete-market, executable-fill, delivery or profitability claim."}
    (dest / "recovery-report.json").write_text(json.dumps(report, indent=2))
    return report

def main():
    if len(sys.argv) != 5 or not sys.stdin.isatty():
        raise SystemExit("Interactive offline use: python3 tools/recover-c0-diagnostic.py INPUT_ROOT NEW_OUTPUT SOURCE_SHA APPROVAL_SHA256")
    secret = getpass.getpass("Research recovery key (hidden, local only): ")
    try:
        print(json.dumps(recover(*sys.argv[1:3], secret, *sys.argv[3:5])))
    except Exception:
        raise SystemExit("C0 recovery refused: authentication/scope/budget validation failed; key not displayed.") from None
    finally:
        secret = None

if __name__ == "__main__":
    main()
