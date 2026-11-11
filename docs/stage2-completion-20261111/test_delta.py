import importlib.util,json,unittest
from pathlib import Path
P=Path(__file__).parent
spec=importlib.util.spec_from_file_location('reconcile',P/'reconcile.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Delta(unittest.TestCase):
 def decision(self,**changes):
  x=dict(stage1_pass=True,nightly_created=True,nightly_complete=True,adopted=True,intraday=True,selected_nightly=True,at_decision=True,safe=True,pair=True);x.update(changes);return m.disposition(**x)
 def test_stage1_source_pass_is_not_runtime_pass(self):self.assertEqual(self.decision(stage1_pass=False),'DEFER_BEFORE_PUBLICATION')
 def test_uncreated_previous_nightly(self):self.assertEqual(self.decision(nightly_created=False),'DEFER_BEFORE_PUBLICATION')
 def test_running_previous_nightly(self):self.assertEqual(self.decision(nightly_complete=False),'DEFER_BEFORE_PUBLICATION')
 def test_no_intraday_at_finite_deadline(self):self.assertEqual(self.decision(intraday=False),'ONE_39_PATH_INVERSE_REQUIRED')
 def test_no_selected_nightly_at_finite_deadline(self):self.assertEqual(self.decision(selected_nightly=False),'ONE_39_PATH_INVERSE_REQUIRED')
 def test_no_adoption(self):self.assertEqual(self.decision(adopted=False),'ONE_39_PATH_INVERSE_REQUIRED')
 def test_blocked_inverse_not_abandoned(self):self.assertEqual(self.decision(intraday=False,safe=False),'INVERSE_REQUIRED_BLOCKED_UNVERIFIED_LATE_RECOVERY_PENDING')
 def test_pair_absent_no_blind_write(self):self.assertEqual(self.decision(adopted=False,pair=False),'INVERSE_REQUIRED_BLOCKED_UNVERIFIED_LATE_RECOVERY_PENDING')
 def test_not_yet_decision_is_not_ready(self):self.assertEqual(self.decision(at_decision=False),'PENDING_NOT_READY')
 def test_witnesses_not_automatic_pass(self):self.assertEqual(self.decision(),'EVIDENCE_REVIEW_REQUIRED_NOT_AUTOMATIC_PASS')
 def test_actual_object_composition(self):
  x=json.loads((P/'composition-census.json').read_text());self.assertEqual((x['boundPaths'],x['writes'],x['inverseEntries']),(46,39,39));self.assertEqual(x['afterErrors'],[]);self.assertEqual(x['inverseErrors'],[])
 def test_actual_census(self):
  x=json.loads((P/'composition-census.json').read_text());r={v['workflow'].split('/')[-1]:v for v in x['census']['proposal']}
  self.assertIn('discover.mjs',r['discover.yml']['boundReferences']);self.assertIn('scan.mjs',r['comeback.yml']['boundReferences']);self.assertIn('econ-series.mjs',r['leaders-study.yml']['boundReferences']);self.assertIn('.github/save-data.sh',r['main.yml']['boundReferences']);self.assertNotIn('scan.mjs',r['research-lab.yml']['boundReferences'])
if __name__=='__main__':unittest.main(verbosity=2)
