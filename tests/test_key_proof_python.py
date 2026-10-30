"""Public fixtures only. No owner key, data or network is used."""
import ast
import base64
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("recovery", ROOT / "tools/recover-key-proof.py")
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)
KEY = "public-fixture-key-only-2026"
FIXTURE = json.loads((ROOT / "tests/fixtures/key-proof-node-v1.json").read_text())


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.src = Path(self.temp.name) / "encrypted"
        self.src.mkdir()
        self.dest = Path(self.temp.name) / "recovered"

    def recover(self, envelope=None, key=KEY, sha=r.SOURCE_SHA):
        (self.src / "key-check.txt.enc").write_text(json.dumps(FIXTURE if envelope is None else envelope))
        # Fail on any network operation attempted by recovery or dependencies.
        with patch("socket.socket", side_effect=AssertionError("NETWORK_FORBIDDEN")):
            return r.recover_challenge(self.src, self.dest, key, sha)

    def rejected(self, error, **kwargs):
        with self.assertRaisesRegex(r.RecoveryError, error):
            self.recover(**kwargs)
        self.assertFalse(self.dest.exists())

    def test_existing_node_fixture_and_private_outputs(self):
        report = self.recover()
        self.assertTrue(report["authenticated"])
        self.assertTrue(report["challengeMatched"])
        self.assertEqual((self.dest / "key-check.txt").read_bytes(), r.MARKER)
        self.assertEqual(self.dest.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.dest / "key-check.txt").stat().st_mode & 0o777, 0o600)

    def test_wrong_key(self):
        self.rejected("AUTHENTICATION_FAILED", key="wrong-public-fixture-key")

    def test_ciphertext_tag_and_iv_tampering(self):
        for field in ("ciphertext", "tag", "iv"):
            with self.subTest(field=field):
                envelope = copy.deepcopy(FIXTURE)
                data = bytearray(base64.b64decode(envelope[field]))
                data[0] ^= 1
                envelope[field] = base64.b64encode(data).decode()
                self.rejected("AUTHENTICATION_FAILED", envelope=envelope)

    def test_expected_sha_and_context_tampering(self):
        self.rejected("UNEXPECTED_SOURCE_SHA", sha="0" * 40)
        for field, value in (("sourceSha", "0" * 40), ("path", "../key-check.txt")):
            envelope = copy.deepcopy(FIXTURE)
            envelope["context"][field] = value
            self.rejected("RECOVERY_SCOPE_MISMATCH", envelope=envelope)

    def test_authenticated_context_order_is_preserved(self):
        envelope = copy.deepcopy(FIXTURE)
        envelope["context"] = dict(reversed(list(envelope["context"].items())))
        self.rejected("AUTHENTICATION_FAILED", envelope=envelope)

    def test_malformed_and_unsupported_envelopes(self):
        for field, value in (("tag", "!"), ("iv", "AA=="), ("version", True), ("context", [])):
            with self.subTest(field=field):
                envelope = copy.deepcopy(FIXTURE)
                envelope[field] = value
                self.rejected("MALFORMED|UNSUPPORTED|SCOPE", envelope=envelope)
        with self.assertRaisesRegex(r.RecoveryError, "MALFORMED_ENVELOPE"):
            r.reject_duplicates([("version", 1), ("version", 1)])

    def test_existing_output_is_untouched(self):
        self.dest.mkdir()
        (self.dest / "keep").write_text("untouched")
        with self.assertRaisesRegex(r.RecoveryError, "ALREADY_EXISTS"):
            self.recover()
        self.assertEqual((self.dest / "keep").read_text(), "untouched")

    def test_symlink_and_extra_files_blocked(self):
        (self.src / "key-check.txt.enc").symlink_to(ROOT / "tests/fixtures/key-proof-node-v1.json")
        with self.assertRaisesRegex(r.RecoveryError, "SYMLINK"):
            r.recover_challenge(self.src, self.dest, KEY, r.SOURCE_SHA)
        self.assertFalse(self.dest.exists())
        (self.src / "key-check.txt.enc").unlink()
        (self.src / "unexpected").write_text("no")
        self.rejected("EXPECTED_SINGLE")

    def test_hidden_prompt_fails_closed(self):
        import warnings
        with patch.object(r.sys, "argv", ["tool", "input", "output", r.SOURCE_SHA]), \
             patch.object(r.sys.stdin, "isatty", return_value=True), \
             patch.object(r.sys.stderr, "isatty", return_value=True), \
             patch.object(r.getpass, "getpass", side_effect=lambda _: warnings.warn("hidden unavailable", r.getpass.GetPassWarning)):
            with self.assertRaisesRegex(r.RecoveryError, "HIDDEN_PROMPT_UNAVAILABLE"):
                r.main()

    def test_authenticated_wrong_marker_is_not_accepted(self):
        envelope = copy.deepcopy(FIXTURE)
        key = r.Scrypt(salt=b"Stock2ResearchArtifactV1", length=32,
                       n=16384, r=8, p=1).derive(KEY.encode())
        aad = json.dumps({"version": 1, "context": envelope["context"]},
                         separators=(",", ":")).encode()
        sealed = r.AESGCM(key).encrypt(base64.b64decode(envelope["iv"]), b"wrong challenge", aad)
        envelope["ciphertext"] = base64.b64encode(sealed[:-16]).decode()
        envelope["tag"] = base64.b64encode(sealed[-16:]).decode()
        self.rejected("CHALLENGE_MARKER_MISMATCH", envelope=envelope)

    def test_malformed_json_and_size_budget(self):
        target = self.src / "key-check.txt.enc"
        for body, error in ((b"{", "MALFORMED_ENVELOPE"),
                            (b"x" * (r.MAX_ENVELOPE_BYTES + 1), "BUDGET_EXCEEDED")):
            target.write_bytes(body)
            with self.assertRaisesRegex(r.RecoveryError, error):
                r.recover_challenge(self.src, self.dest, KEY, r.SOURCE_SHA)
            self.assertFalse(self.dest.exists())

    def test_redirected_prompt_is_rejected_before_key_read(self):
        with patch.object(r.sys, "argv", ["tool", "input", "output", r.SOURCE_SHA]), \
             patch.object(r.sys.stdin, "isatty", return_value=False), \
             patch.object(r.getpass, "getpass", side_effect=AssertionError("NO_PROMPT")):
            with self.assertRaisesRegex(r.RecoveryError, "INTERACTIVE_TERMINAL_REQUIRED"):
                r.main()

    def test_nist_aes256_gcm_vector(self):
        # NIST all-zero AES-256-GCM, 96-bit IV, one zero plaintext block.
        sealed = bytes.fromhex("cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919")
        self.assertEqual(r.AESGCM(bytes(32)).decrypt(bytes(12), sealed, b""), bytes(16))

    def test_python39_grammar_and_no_network_or_process_imports(self):
        tree = ast.parse((ROOT / "tools/recover-key-proof.py").read_text(), feature_version=(3, 9))
        imports = {node.names[0].name if isinstance(node, ast.Import) else node.module
                   for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))}
        self.assertFalse(imports & {"socket", "urllib", "requests", "http", "subprocess"})


if __name__ == "__main__":
    unittest.main()
