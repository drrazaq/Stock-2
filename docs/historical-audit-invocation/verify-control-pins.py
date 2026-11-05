"""Offline pin-feasibility proof; disposable Git only, no credentials/network."""
import json
import pathlib
import re
import subprocess
import tempfile
import unittest
import yaml

HERE = pathlib.Path(__file__).resolve().parent

class ControlPins(unittest.TestCase):
    def test_actual_proposal_uses_distinct_immutable_control_commit(self):
        raw = (HERE / 'historical-audit-once.yml.proposed').read_text()
        workflow = yaml.load(raw, Loader=yaml.BaseLoader)
        self.assertEqual(workflow['on']['workflow_dispatch']['inputs']['control_commit']['required'], 'true')
        job = workflow['jobs']['audit']
        self.assertEqual(job['steps'][0]['with']['ref'], '${{ inputs.control_commit }}')
        self.assertEqual(workflow['permissions'], {'contents': 'read', 'actions': 'read'})
        self.assertIn("['git','-C','control','rev-parse','HEAD']", raw)
        self.assertIn("re.fullmatch('[0-9a-f]{40}',os.environ['AUDIT_CONTROL_COMMIT'])", raw)

    def test_real_git_workflow_then_authorization_has_no_self_pin(self):
        with tempfile.TemporaryDirectory(prefix='SYNTHETIC-control-pin-') as temp:
            root = pathlib.Path(temp)
            def git(*args, **kwargs):
                return subprocess.check_output(['git', '-C', temp, *args], stderr=subprocess.DEVNULL, **kwargs).decode().strip()
            git('init')
            (root / 'workflow').write_text('SYNTHETIC workflow W, no research execution')
            git('add', '.')
            git('-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'workflow W')
            w = git('rev-parse', 'HEAD')
            (root / 'authorization.json').write_text(json.dumps({'workflowSHA': w, 'executionApproved': False}))
            git('add', '.')
            git('-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'separate controls C')
            c = git('rev-parse', 'HEAD')
            self.assertNotEqual(c, w)
            self.assertEqual(json.loads(git('show', c + ':authorization.json'))['workflowSHA'], w)
            with self.assertRaises(subprocess.CalledProcessError):
                git('show', w + ':authorization.json')

    def test_control_commit_shape_is_not_a_branch_or_expression(self):
        self.assertTrue(re.fullmatch('[0-9a-f]{40}', 'a' * 40))
        for value in ['main', '', 'a' * 39, 'A' * 40, 'a' * 40 + '\n', '$(anything)']:
            self.assertIsNone(re.fullmatch('[0-9a-f]{40}', value))

if __name__ == '__main__':
    unittest.main()
