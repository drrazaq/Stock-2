import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('incident_recover',Path(__file__).parents[1]/'tools/recover-watcher-incident.py')
recovery=importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)
class IncidentRecovery(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.repo=self.root/'repo'
        self.repo.mkdir()
        subprocess.run(['git','init','-q','-b','fixture'],cwd=self.repo,check=True)
        (self.repo/'data').mkdir()
        self.raw=b'{"day":"2026-10-21","heartbeat":[]}\n'
        (self.repo/'data/ignition-live.json').write_bytes(self.raw)
        subprocess.run(['git','add','.'],cwd=self.repo,check=True)
        subprocess.run(['git','-c','user.name=fixture','-c','user.email=fixture@example.test','commit','-qm','synthetic'],cwd=self.repo,check=True)
        self.sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.repo,text=True).strip()
    def test_byte_identical_secondary_archive_and_original_unchanged(self):
        out=self.root/'secondary'
        r=recovery.recover(self.repo,out,[('2026-10-21',self.sha)])
        self.assertFalse(r['primaryOrConfirmationEvidence'])
        self.assertEqual((out/'2026-10-21'/self.sha/'data/ignition-live.json').read_bytes(),self.raw)
        self.assertEqual((self.repo/'data/ignition-live.json').read_bytes(),self.raw)
        self.assertTrue(any(x['status']=='MISSING_IN_SOURCE_COMMIT' for x in r['sources'][0]['files']))
    def test_existing_output_and_bad_source_refuse_without_overwrite(self):
        out=self.root/'secondary'
        out.mkdir()
        with self.assertRaises(ValueError):recovery.recover(self.repo,out,[('2026-10-21',self.sha)])
        with self.assertRaises(ValueError):recovery.recover(self.repo,self.root/'new',[('2026-10-21','HEAD')])
        self.assertFalse((self.root/'new').exists())
    def test_duplicate_source_and_symlink_refuse(self):
        with self.assertRaises(ValueError):recovery.recover(self.repo,self.root/'dup',[('2026-10-21',self.sha)]*2)
        link=self.root/'link'
        link.symlink_to(self.repo,target_is_directory=True)
        with self.assertRaises(ValueError):recovery.recover(self.repo,link/'out',[('2026-10-21',self.sha)])
