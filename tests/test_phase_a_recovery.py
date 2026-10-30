"""Public fixture-only tests; no owner key/data/network."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("phase_a_recovery", ROOT / "tools/recover-phase-a.py")
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)
KEY = "public-fixture-key-only-2026"


class PhaseARecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.src = Path(self.temp.name) / "encrypted"
        self.src.mkdir()
        self.dest = Path(self.temp.name) / "plain"
        self.key = r.Scrypt(salt=b"Stock2ResearchArtifactV1", length=32, n=16384, r=8, p=1).derive(KEY.encode())

    def seal(self, name, body):
        context = {"sourceSha": r.SOURCE, "path": name}
        iv = hashlib.sha256(name.encode()).digest()[:12]  # Deterministic per-path public fixtures only.
        aad = json.dumps({"version": 1, "context": context}, separators=(",", ":")).encode()
        sealed = r.AESGCM(self.key).encrypt(iv, body, aad)
        env = {"version": 1, "context": context, "iv": base64.b64encode(iv).decode(),
               "tag": base64.b64encode(sealed[-16:]).decode(), "ciphertext": base64.b64encode(sealed[:-16]).decode()}
        target = self.src / (name + ".enc")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(env))
        return target

    def recover(self, key=KEY):
        with patch("socket.socket", side_effect=AssertionError("NETWORK_FORBIDDEN")):
            return r.recover_directory(self.src, self.dest, key, r.SOURCE)

    def test_node_produced_existing_format_fixture(self):
        (self.src / "key-check.txt.enc").write_bytes((ROOT / "tests/fixtures/key-proof-node-v1.json").read_bytes())
        report = self.recover()
        self.assertTrue(report["authenticated"])
        self.assertEqual(report["status"], "AUTHENTICATED_INCOMPLETE")
        self.assertEqual((self.dest / "key-check.txt").read_text(), "Stock2 Phase A recovery challenge v1")

    def test_full_file_counts_do_not_claim_market_validation(self):
        for n in range(330):
            self.seal("100-1/%03d.json.gz" % n, b"compressed-byte-fixture")
        self.seal("100-1/summary.json", json.dumps({"sourceSha": r.SOURCE, "mode": "RESEARCH_ONLY", "attempt": "100-1", "orders": False, "approvedBuy": False, "cycles": 330, "bytes": 330 * len(b"compressed-byte-fixture"), "uniqueMinutes": 330, "executionWindowComplete": True}).encode())
        report = self.recover()
        self.assertEqual(report["status"], "AUTHENTICATED_FILE_COUNTS_ONLY")
        self.assertIn("No decompression", report["note"])

    def test_late_tampering_creates_no_plaintext(self):
        self.seal("001.json", b"public-good-fixture")
        target = self.seal("zzz.json", b"public-bad-fixture")
        env = json.loads(target.read_text())
        env["tag"] = base64.b64encode(bytes(16)).decode()
        target.write_text(json.dumps(env))
        with self.assertRaisesRegex(r.RecoveryError, "AUTHENTICATION_FAILED"):
            self.recover()
        self.assertFalse(self.dest.exists())

    def test_wrong_key(self):
        self.seal("input-source.json", b"public")
        with self.assertRaisesRegex(r.RecoveryError, "AUTHENTICATION_FAILED"):
            self.recover("wrong-public-fixture-key")
        self.assertFalse(self.dest.exists())

    def test_scope_path_and_symlink_rejection(self):
        target = self.seal("input-source.json", b"public")
        env = json.loads(target.read_text());env["context"]["sourceSha"] = "0" * 40
        target.write_text(json.dumps(env))
        with self.assertRaisesRegex(r.RecoveryError, "SCOPE_MISMATCH"):
            self.recover()
        target.unlink();target.symlink_to(ROOT / "tests/fixtures/key-proof-node-v1.json")
        with self.assertRaisesRegex(r.RecoveryError, "SYMLINK"):
            self.recover()
        self.assertFalse(self.dest.exists())

    def test_reserved_output_and_overwrite_prevention(self):
        target = self.seal("recovery-report.json", b"not-a-report")
        with self.assertRaisesRegex(r.RecoveryError, "SCOPE_MISMATCH"):
            self.recover()
        target.unlink();self.seal("input-source.json", b"public")
        self.dest.mkdir();(self.dest / "keep").write_text("unchanged")
        with self.assertRaisesRegex(r.RecoveryError, "ALREADY_EXISTS"):
            self.recover()
        self.assertEqual((self.dest / "keep").read_text(), "unchanged")

    def test_input_and_plaintext_budgets(self):
        self.seal("input-source.json", b"public")
        for name in ("MAX_INPUT", "MAX_PLAIN", "MAX_FILES"):
            with patch.object(r, name, 1), self.assertRaisesRegex(r.RecoveryError, "BUDGET|SCOPE"):
                if name == "MAX_FILES":
                    self.seal("other.json", b"public")
                self.recover()
            self.assertFalse(self.dest.exists())

    def test_missing_cycle_and_malformed_summary_remain_incomplete(self):
        self.seal("100-1/000.json.gz", b"public")
        self.seal("100-1/summary.json", b"null")
        report = self.recover()
        self.assertEqual(report["status"], "AUTHENTICATED_INCOMPLETE")
        self.assertIn("MALFORMED_SUMMARY", report["summaries"][0]["problems"])


if __name__ == "__main__":
    unittest.main()
