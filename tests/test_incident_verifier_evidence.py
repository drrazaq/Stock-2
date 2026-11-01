"""Actual offline verifier caller on a miniature disposable local Git repository."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'tools/verify-incident-production-package.py'

class IncidentVerifierEvidenceTests(unittest.TestCase):
    def fixture(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name) / 'repo'
        root.mkdir()
        (root/'tools').mkdir()
        (root/'test').mkdir()
        (root/'docs/validation').mkdir(parents=True)
        shutil.copyfile(SOURCE, root/'tools/verify-incident-production-package.py')
        git = lambda *args: subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL).decode().strip()
        git('init', '-q')
        git('config', 'user.name', 'Synthetic Fixture')
        git('config', 'user.email', 'fixture@example.invalid')
        git('config', 'commit.gpgsign', 'false')
        (root/'example.mjs').write_text('export const value=1;\n')
        (root/'test/example.test.mjs').write_text("import assert from 'node:assert/strict';import {value} from '../example.mjs';assert.equal(value,2);\n")
        git('add', '.')
        git('commit', '-qm', 'synthetic local base')
        base = git('rev-parse', 'HEAD')
        after = b'export const value=2;\n'
        (root/'example.mjs').write_bytes(after)
        patch = subprocess.check_output(['git', 'diff', '--', 'example.mjs'], cwd=root)
        (root/'example.mjs').write_text('export const value=1;\n')
        folder = root/'docs/validation'
        (folder/'accounting-production-fix-v3.patch').write_bytes(patch)
        manifest = {'patchSha256': hashlib.sha256(patch).hexdigest(), 'baseMain': base,
                    'files': {'example.mjs': hashlib.sha256(after).hexdigest()}, 'unchangedProductionDependencies': {}}
        (folder/'accounting-production-manifest-v3.json').write_text(json.dumps(manifest))
        return root, Path(tmp.name)/'evidence'

    def run_verifier(self, root, out):
        return subprocess.run([sys.executable, str(root/'tools/verify-incident-production-package.py'), '--scope', 'accounting', '--output', str(out)], cwd=root, capture_output=True, text=True, timeout=20)

    def test_new_evidence_roundtrip_and_repeat_preserve_first_logs(self):
        root, out = self.fixture()
        first = self.run_verifier(root, out)
        self.assertEqual(first.returncode, 0, first.stderr)
        result = json.loads((out/'result.json').read_text())
        self.assertEqual(result['failures'], [])
        self.assertTrue(result['allManifestAndDependencyHashesVerifiedBeforeAndAfter'])
        self.assertEqual(result['allNodeTestFiles'], 1)
        original = {p.name: p.read_bytes() for p in out.iterdir()}
        second = self.run_verifier(root, out)
        self.assertNotEqual(second.returncode, 0, 'an evidence directory must be new for every attempt')
        self.assertEqual({p.name:p.read_bytes() for p in out.iterdir()}, original)
        self.assertEqual((root/'example.mjs').read_text(), 'export const value=1;\n')

    def test_existing_symlink_output_cannot_overwrite_earlier_evidence(self):
        root, out = self.fixture()
        existing = out.with_name('original')
        existing.mkdir()
        (existing/'node.log').write_text('ORIGINAL SYNTHETIC LOG')
        out.symlink_to(existing, target_is_directory=True)
        result = self.run_verifier(root, out)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(sorted(p.name for p in existing.iterdir()), ['node.log'])
        self.assertEqual((existing/'node.log').read_text(), 'ORIGINAL SYNTHETIC LOG')

if __name__ == '__main__':
    unittest.main()
