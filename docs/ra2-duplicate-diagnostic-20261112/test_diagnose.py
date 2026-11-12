import copy,gzip,hashlib,json,pathlib,subprocess,sys,tempfile,unittest
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));import diagnose as D
import evaluate as E
C=json.loads((HERE/'frozen/CONTRACT.json').read_text())
def part(labels,values=None):
 vals=values or [10]*len(labels);return {'T':list(labels),'o':list(vals),'h':[x+1 for x in vals],'l':[x-1 for x in vals],'c':list(vals),'v':[1000000]*len(labels)}
def row(main,tail):return {**main,'x':tail}
def classify(obj,c=C):
 with tempfile.TemporaryDirectory() as d:
  p=pathlib.Path(d)/'synthetic.gz';p.write_bytes(gzip.compress(json.dumps(obj).encode()));return D.classify(p,c)
class Checks(unittest.TestCase):
 def test_identical_overlap_counts_keys_dates_labels_and_all_relevant_fields(self):
  x=classify({'days':{'2023-01-03':row(part(['SYN','SYN']),part(['SYN'])),'2023-01-04':row(part(['SYN']),part(['SYN']))}})
  self.assertEqual(x['counts']['duplicateOccurrences'],3);self.assertEqual(x['counts']['affectedDayLabelKeys'],2);self.assertEqual(x['affectedDates'],2);self.assertEqual(x['affectedTickerLabels'],1);self.assertEqual(x['groupClassification']['decodedTypeAndValueIdentical'],2);self.assertEqual(x['groupOrigins']['crossPartition'],2)
 def test_each_outcome_relevant_field_conflict_retained(self):
  for field in D.FIELDS:
   p=part(['SYN']);q=copy.deepcopy(p);q[field][0]+=1;x=classify({'days':{'2023-01-03':row(p,q)}});self.assertEqual(x['groupClassification']['conflictingRelevantValues'],1);self.assertEqual(x['conflictingKeysByField'][field],1)
 def test_permutation_day_and_row_order_do_not_change_classification_or_audit(self):
  a={'days':{'2023-01-03':row(part(['SYN','ALT'],[10,12]),part(['SYN','SYN'],[10,11])),'2023-01-04':row(part(['ALT']),part(['ALT']))}}
  b=copy.deepcopy(a);b['days']=dict(reversed(list(b['days'].items())))
  for x in b['days'].values():
   for y in [x,x['x']]:
    for f in ['T',*D.FIELDS]:y[f].reverse()
  self.assertEqual(classify(a),classify(b))
 def test_numeric_representation_and_nonfinite_are_not_identical(self):
  a=part(['SYN']);b=part(['SYN']);b['o'][0]=10.0;x=classify({'days':{'2023-01-03':row(a,b)}});self.assertEqual(x['groupClassification']['numericEquivalentRepresentationDiffers'],1)
  b['o'][0]=True;x=classify({'days':{'2023-01-03':row(a,b)}});self.assertEqual(x['groupClassification']['invalidOrNonfiniteUnresolved'],1)
 def test_no_alias_normalization_or_cross_day_duplicate(self):
  x=classify({'days':{'2023-01-03':row(part(['SYN','syn','SYN.A','SYN-A','SYN ']),part([])),'2023-01-04':row(part(['SYN']),part([]))}});self.assertEqual(x['counts']['duplicateOccurrences'],0)
 def test_caps_abort_whole_diagnostic_not_favorable_subset(self):
  c=copy.deepcopy(C);c['limits']['maxRows']=1
  with self.assertRaisesRegex(ValueError,'ROW_CAP'):classify({'days':{'2023-01-03':row(part(['SYN']),part(['SYN']))}},c)
 def test_reports_contain_no_symbol_day_or_price_values(self):
  x=classify({'days':{'2023-01-03':row(part(['SENSITIVE_SYNTHETIC_LABEL'],[123.456]),part(['SENSITIVE_SYNTHETIC_LABEL'],[124.456]))}});s=json.dumps(x);self.assertNotIn('SENSITIVE_SYNTHETIC_LABEL',s);self.assertNotIn('2023-01-03',s);self.assertNotIn('123.456',s);self.assertFalse(x['outcomesAccessed']);self.assertEqual(x['canonicalization'],'NONE; no rows selected/dropped/merged')
 def test_original_frozen_coverage_still_blocks_same_duplicates(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'x.gz';p.write_bytes(gzip.compress(json.dumps({'days':{'2023-01-03':row(part(['SYN']),part(['SYN']))}}).encode()));cov,_,_=D.coverage(p,C);self.assertIn('DUPLICATE_SYMBOL_DAY',cov['issues']);self.assertFalse(cov['outcomesAccessed'])
 def test_cli_identity_mismatch_outputs_no_classification_and_never_outcomes(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'x.gz';p.write_bytes(gzip.compress(json.dumps({'days':{'2023-01-03':row(part(['SYN']),part(['SYN']))}}).encode()));out=pathlib.Path(d)/'out';r=subprocess.run([sys.executable,str(HERE/'diagnose.py'),'--input',str(p),'--output-dir',str(out)],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr);diag=json.loads((out/'diagnostic.json').read_text());self.assertEqual(diag['issues'],['RETAINED_INPUT_IDENTITY_MISMATCH']);self.assertFalse(diag['outcomesAccessed'])
 def test_no_outcome_function_reachable_from_classification(self):
  with patch.object(E,'evaluate',side_effect=AssertionError('OUTCOMES_FORBIDDEN')),patch.object(E,'stock_events',side_effect=AssertionError('OUTCOMES_FORBIDDEN')),patch.object(E,'load_panel',side_effect=AssertionError('OUTCOMES_FORBIDDEN')):
   x=classify({'days':{'2023-01-03':row(part(['SYN']),part(['SYN']))}});self.assertFalse(x['outcomesAccessed'])
 def test_xat_presence_cannot_authenticate_backfill_and_ratio_pattern_is_not_split_proof(self):
  a=row(part(['SYN'],[4]),part(['SYN'],[2]));a['xAt']='2026-11-01';b=copy.deepcopy(a);b.pop('xAt')
  x=classify({'days':{'2023-01-03':a,'2023-01-04':b}});self.assertEqual(x['affectedDateXAtMetadata']['validXAtPresent'],1);self.assertEqual(x['affectedDateXAtMetadata']['xAtAbsentOrInvalid'],1);self.assertEqual(x['crossPartitionCloseRatioBuckets']['nearSimpleFactorPattern_NOT_AUTHENTICATED_SPLIT'],2);self.assertIn('NOT_IDENTIFIABLE',x['backfilledVsFresh']);self.assertIn('NOT_AUTHENTICATED',x['splitAdjustmentOrIssuerLineage']);self.assertEqual(x['crossPartitionCurrentQualifiesCounts']['allTailCurrentlyFailQualifies'],2)
 def test_full_coverage_only_cli_with_exact_fixture_pin_never_calls_outcomes(self):
  with tempfile.TemporaryDirectory() as d:
   dates=E.sessions(C['range']['warmupFrom'],C['range']['outcomesThrough']);obj={'days':{day:row(part(['SYN']),part(['SYN'])) for day in dates}};p=pathlib.Path(d)/'x.gz';p.write_bytes(gzip.compress(json.dumps(obj).encode()));out=pathlib.Path(d)/'out';pin=hashlib.sha256(p.read_bytes()).hexdigest()
   code="import diagnose as D, evaluate as E; D.EXPECTED="+repr(pin)+"; E.evaluate=lambda *a,**k: (_ for _ in ()).throw(RuntimeError('OUTCOMES_FORBIDDEN')); E.stock_events=E.evaluate; E.load_panel=E.evaluate; D.main()"
   r=subprocess.run([sys.executable,'-c',code,'--input',str(p),'--output-dir',str(out)],cwd=HERE,capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr);x=json.loads((out/'diagnostic.json').read_text());self.assertEqual(x['status'],'COVERAGE_ONLY_CLASSIFIED_NOT_REPAIRED');self.assertFalse(x['outcomesAccessed']);self.assertEqual(x['counts']['duplicateOccurrences'],len(dates))
 def test_lag_proxy_counts_extra_occurrences_not_dates_and_never_authenticates_lineage(self):
  a=row(part(['SYN','SYN']),part(['SYN']));a['xAt']='2026-11-01';b=row(part(['SYN']),part(['SYN']));b['xAt']='2023-01-09';x=classify({'days':{'2023-01-03':a,'2023-01-04':b}});self.assertEqual(x['xAtLagDuplicateOccurrenceBuckets']['over60days'],2);self.assertEqual(x['xAtLagDuplicateOccurrenceBuckets']['0to10days'],1);self.assertEqual(x['affectedDates'],2);self.assertIn('NOT lineage',x['lagMeaning'])
if __name__=='__main__':unittest.main()
