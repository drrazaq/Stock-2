"""REPO-03: real inventory entrypoint, never execute source or inspect data records."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'tools/repository-audit.py'
spec = importlib.util.spec_from_file_location('repository_audit', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BehavioralInventoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for folder in ['tools/nested', '.github/workflows', 'test', 'tests', 'docs', 'data']:
            (self.root / folder).mkdir(parents=True, exist_ok=True)
        for name in ['entry.mjs', 'helper.js', 'index.html', 'tools/recover.py', 'tools/nested/a.sh', '.github/save-data.sh']:
            (self.root / name).write_text("raise Exception('MUST_NOT_EXECUTE')\n")
        for name in ['test/fake.test.mjs', 'docs/review.mjs', 'data/private.py']:
            (self.root / name).write_text('NOT_PRODUCT_SOURCE')
        (self.root / 'data/private.enc').write_bytes(b'not a readable JSON dataset')

    def test_scope_covers_helpers_shell_browser_without_executing_or_reading_data(self):
        report = module.behavioral_inventory(self.root)
        self.assertEqual(report['totals'], {'scripts': 6, 'sourceReviewed': 0, 'pending': 6, 'reviewedWithOpenFindings': 0})
        self.assertFalse(report['accepted'])
        self.assertFalse(report['datasetsRead'])
        self.assertEqual({r['path'] for r in report['rows']}, {'entry.mjs', 'helper.js', 'index.html', 'tools/recover.py', 'tools/nested/a.sh', '.github/save-data.sh'})

    def review(self):
        row = {axis: 'Explicit source contract reviewed.' for axis in module.AXES}
        row.update(sha256=hashlib.sha256((self.root/'entry.mjs').read_bytes()).hexdigest(), status='SOURCE_REVIEWED', reviewer='synthetic reviewer', evidence=['synthetic-review.md'])
        return row

    def test_hash_matched_explicit_axes_are_required(self):
        row = self.review()
        report = module.behavioral_inventory(self.root, {'entry.mjs': row})
        self.assertEqual(report['totals']['sourceReviewed'], 1)
        row['timing'] = ''
        report = module.behavioral_inventory(self.root, {'entry.mjs': row})
        self.assertEqual(report['totals']['sourceReviewed'], 0)

    def test_changed_source_cannot_inherit_a_prior_review(self):
        row = self.review()
        (self.root/'entry.mjs').write_text('changed source')
        report = module.behavioral_inventory(self.root, {'entry.mjs': row})
        self.assertEqual(report['totals']['sourceReviewed'], 0)
        self.assertEqual(next(r for r in report['rows'] if r['path']=='entry.mjs')['status'], 'STALE_OR_INVALID_REVIEW')

    def test_reference_matches_are_not_counted_as_behavioral_evidence(self):
        (self.root/'test/example.test.mjs').write_text('// entry.mjs appears only in a comment')
        report = module.behavioral_inventory(self.root)
        row = next(r for r in report['rows'] if r['path']=='entry.mjs')
        self.assertEqual(row['testReferences'], ['test/example.test.mjs'])
        self.assertEqual(report['totals']['sourceReviewed'], 0)

    def test_symlinked_source_is_not_read_or_credited(self):
        (self.root/'linked.mjs').symlink_to(self.root/'data/private.enc')
        row = next(r for r in module.behavioral_inventory(self.root)['rows'] if r['path']=='linked.mjs')
        self.assertEqual(row['status'], 'UNREVIEWED_UNSAFE_SOURCE_LINK')
        self.assertNotIn('sha256', row)

    def test_actual_cli_refuses_to_replace_report_or_existing_symlink(self):
        out = self.root/'report.json'
        command = [sys.executable, str(SOURCE), '--root', str(self.root), '--scripts-only', '--output', str(out)]
        first = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(first.returncode, 0, first.stderr)
        original = out.read_bytes()
        second = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(second.returncode, 0)
        self.assertEqual(out.read_bytes(), original)
        out.unlink()
        target = self.root/'original.json'
        target.write_text('original evidence')
        out.symlink_to(target)
        self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
        self.assertEqual(target.read_text(), 'original evidence')

    def test_lexical_locators_include_line_numbers_without_implying_acceptance(self):
        (self.root/'entry.mjs').write_text("const input=process.argv[2];\nsetTimeout(()=>console.log(input),100);\n")
        row = next(r for r in module.behavioral_inventory(self.root)['rows'] if r['path']=='entry.mjs')
        self.assertEqual(row['facts']['inputs']['matchingLines'], [1])
        self.assertEqual(row['facts']['timing']['matchingLines'], [2])
        self.assertIsNone(row['contract'])

if __name__ == '__main__':
    unittest.main()
