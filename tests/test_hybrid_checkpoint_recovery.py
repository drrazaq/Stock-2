"""Python3.9+ public fixture recovery contracts; no owner key or network."""
import base64
import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("hybrid_recovery", ROOT / "tools/recover-hybrid-checkpoints.py")
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)
KEY = "stock2-hybrid-public-fixture-key"
SHA = "b" * 40

class HybridCheckpointRecovery(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.src = Path(self.temp.name) / "encrypted"
        self.src.mkdir()
        self.dest = Path(self.temp.name) / "plain"
        self.file = self.src / "checkpoint-000.json.gz.enc"
        self.file.write_bytes((ROOT / "tests/fixtures/hybrid-checkpoint-node-v1.json").read_bytes())

    def recover(self, key=KEY, sha=SHA):
        with patch("socket.socket", side_effect=AssertionError("NETWORK_FORBIDDEN")):
            return r.recover(self.src, self.dest, key, sha)

    def test_actual_node_v1_envelope_recovers_offline_and_never_claims_market_completeness(self):
        result = self.recover()
        self.assertTrue(result["authenticated"])
        self.assertEqual(result["status"], "AUTHENTICATED_CHECKPOINT_FILES_ONLY")
        payload = json.loads(gzip.decompress((self.dest / "checkpoint-000.json.gz").read_bytes()))
        self.assertEqual(payload["sourceSha"], SHA)
        self.assertEqual(payload["state"]["cycles"], 1)
        self.assertFalse(payload["orders"])

    def test_wrong_key_and_tampered_ciphertext_produce_no_output(self):
        with self.assertRaises(Exception):
            self.recover(key="another-public-fixture-key")
        self.assertFalse(self.dest.exists())
        env = json.loads(self.file.read_bytes())
        env["ciphertext"] = base64.b64encode(b"tampered").decode()
        self.file.write_text(json.dumps(env))
        with self.assertRaises(Exception):
            self.recover()
        self.assertFalse(self.dest.exists())

    def test_wrong_source_and_renamed_file_are_not_accepted(self):
        with self.assertRaisesRegex(ValueError, "SOURCE_OR_PATH"):
            self.recover(sha="c" * 40)
        self.file.rename(self.src / "checkpoint-001.json.gz.enc")
        with self.assertRaisesRegex(ValueError, "SOURCE_OR_PATH"):
            self.recover()
        self.assertFalse(self.dest.exists())

    def test_symlinks_and_existing_destination_are_refused(self):
        self.file.unlink()
        self.file.symlink_to(ROOT / "tests/fixtures/hybrid-checkpoint-node-v1.json")
        with self.assertRaisesRegex(ValueError, "TYPE_BLOCKED"):
            self.recover()
        self.file.unlink()
        self.file.write_bytes((ROOT / "tests/fixtures/hybrid-checkpoint-node-v1.json").read_bytes())
        self.dest.mkdir()
        (self.dest / "keep").write_text("unchanged")
        with self.assertRaisesRegex(ValueError, "NEW_OUTPUT"):
            self.recover()
        self.assertEqual((self.dest / "keep").read_text(), "unchanged")

    def test_interrupted_ciphertext_staging_is_counted_and_present_tags_still_verified(self):
        (self.src / ".pending-public-fixture").write_bytes(b"partial ciphertext only")
        report = self.recover()
        self.assertEqual(report["ignoredStagingFiles"], 1)
        self.assertEqual(report["files"], 1)

if __name__ == "__main__":
    unittest.main()
