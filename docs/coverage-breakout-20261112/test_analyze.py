import copy,gzip,hashlib,importlib.util,json,pathlib,subprocess,sys,tempfile,unittest
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('coverage',HERE/'analyze.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
C=json.loads((HERE/'CONTRACT.json').read_text())
def pack():return {'T':['FAKE'],'o':[10],'h':[11],'l':[9],'c':[10],'v':[1000000]}
def fixture():return {'days':{'2022-01-03':{**pack(),'x':{k:[] for k in m.KEYS}},'2026-10-30':{**pack(),'x':{k:[] for k in m.KEYS}}},'ref':{'complete':True,'syms':['FAKE']}}
class Checks(unittest.TestCase):
 def test_legacy_cache_never_becomes_proven_coverage(self):
  x=fixture();before=copy.deepcopy(x);r=m.inspect(x,C,'a'*64);self.assertEqual(x,before);self.assertEqual(r['status'],'INCONCLUSIVE');self.assertFalse(r['outcomesAccessed']);self.assertFalse(r['signalsEnumerated']);self.assertEqual(r['counts']['mainRows'],2);self.assertIsNone(r['executablePerformance']);self.assertIn('AUTHENTIC_SESSION_CALENDAR_MISSING',r['issues'])
 def test_missing_tail_and_dead_population_separate(self):
  x=fixture();del x['days']['2022-01-03']['x'];r=m.inspect(x,C,'a'*64);self.assertEqual(r['counts']['sessionsMissingTail'],1);self.assertIn('PIT_SECURITY_IDENTITY_AND_COMPLETE_DEAD_POPULATION_NOT_AUTHENTICATED',r['issues'])
 def test_invalid_ohlcv_arrays_and_duplicate(self):
  x=fixture();x['days']['2022-01-03']['x']=pack();x['days']['2026-10-30']['h']=[8];r=m.inspect(x,C,'a'*64);self.assertEqual(r['counts']['duplicateSymbolDays'],1);self.assertEqual(r['counts']['badNumericRows'],1)
 def test_cap_stops_not_silent_subset(self):
  c=copy.deepcopy(C);c['limits']['maxRows']=1
  with self.assertRaisesRegex(ValueError,'ROW_CAP'):m.inspect(fixture(),c,'a'*64)
 def test_calendar_holes_are_not_suspensions_or_holidays(self):
  x=fixture();x['sessionCalendar']={'sourceSha256':'b'*64,'completeThrough':'2026-10-30','dates':['2022-01-03','2022-01-04','2026-10-30']};self.assertIn('MISSING_OR_EXTRA_REGULAR_SESSIONS',m.inspect(x,C,'a'*64)['issues'])
 def test_actual_cli_preserves_original_and_outputs_only_aggregates(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'cache.gz';p.write_bytes(gzip.compress(json.dumps(fixture()).encode()));before=p.read_bytes();out=pathlib.Path(d)/'coverage.json';r=subprocess.run([sys.executable,str(HERE/'analyze.py'),'--input',str(p),'--output',str(out)],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(p.read_bytes(),before);v=json.loads(out.read_text());self.assertEqual(v['inputSha256'],hashlib.sha256(before).hexdigest());self.assertNotIn('FAKE',out.read_text());self.assertFalse(v['outcomesAccessed']);self.assertLess(out.stat().st_size,C['limits']['coverageOutputBytes'])
 def test_missing_invalid_inputs_no_leak(self):
  with tempfile.TemporaryDirectory() as d:
   out=pathlib.Path(d)/'coverage.json';r=subprocess.run([sys.executable,str(HERE/'analyze.py'),'--input',str(pathlib.Path(d)/'not-there'),'--output',str(out)],capture_output=True,text=True);self.assertEqual(r.returncode,0);self.assertEqual(json.loads(out.read_text())['status'],'INCONCLUSIVE');self.assertNotIn(d,out.read_text())
if __name__=='__main__':unittest.main()
