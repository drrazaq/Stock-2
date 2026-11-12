import copy,gzip,importlib.util,json,pathlib,subprocess,sys,tempfile,unittest
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));import evaluate as E
C=json.loads((HERE/'CONTRACT.json').read_text());A=json.loads((HERE/'AMENDMENT.json').read_text())
def p(n=100):return {k:[10.]*n if k!='v' else [1000000.]*n for k in ['o','h','c','v']}
class Checks(unittest.TestCase):
 def test_stream_matches_unsorted_days_and_headers(self):
  x={'ref':{'syms':['ZZQ']},'days':{'2026-01-05':{'T':['ZZQ'],'o':[10],'h':[11],'l':[9],'c':[10],'v':[100]},'2022-01-03':{'T':[]}},'gone':[]}
  with tempfile.TemporaryDirectory() as d:
   f=pathlib.Path(d)/'a.gz';f.write_bytes(gzip.compress(json.dumps(x).encode()));headers={};self.assertEqual(dict(E.days(f,headers)),x['days']);self.assertEqual(headers['ref'],x['ref'])
 def test_calendar_known_closures_and_early_close_retained(self):
  self.assertNotIn('2025-01-09',E.sessions('2025-01-01','2025-12-31'));self.assertNotIn('2024-03-29',E.sessions('2024-01-01','2024-12-31'));self.assertIn('2024-11-29',E.sessions('2024-01-01','2024-12-31'));self.assertEqual(len(E.sessions('2024-01-01','2024-12-31')),252)
 def test_causal_level_touches_excludes_future(self):
  q=p();D=[('2023-01-'+str(i)) for i in range(100)] # dates only compared lexically in this pure detector
  for i in range(60):q['h'][i]=11 if i in [1,20,40] else 10.5
  q['c'][60]=11.1;q['h'][60]=11.2;q['v'][60]=2000000
  events=E.stock_events('ZZQ',q,D,C);z=next(x for x in events if x['t']==60);self.assertTrue(z['base']);self.assertTrue(z['repeat']);self.assertEqual(z['e'],61);self.assertEqual(z['x'],70)
  q['h'][61]=1000;new=next(x for x in E.stock_events('ZZQ',q,D,C) if x['t']==60);self.assertEqual(z['repeat'],new['repeat']);self.assertEqual(z['base'],new['base'])
 def test_missing_exit_preserved_not_sold_last_mark(self):
  q=p();D=['2023-01-03']*100;q['c'][70]=float('nan');z=next(x for x in E.stock_events('ZZQ',q,D,C) if x['t']==60);self.assertEqual(z['status'],'UNRESOLVED_EXIT');self.assertIsNone(z['g'])
 def test_fee_bounds_are_conditional_and_not_softened(self):
  lo,hi=E.conditional_bounds(0,0);self.assertLess(lo,-.006);self.assertLess(hi,-.006);self.assertLess(E.conditional_bounds(0,.02)[1],hi)
 def test_actual_main_no_outcomes_when_coverage_fails(self):
  with tempfile.TemporaryDirectory() as d:
   f=pathlib.Path(d)/'a.gz';f.write_bytes(gzip.compress(json.dumps({'days':{}}).encode()));out=pathlib.Path(d)/'out'
   r=subprocess.run([sys.executable,str(HERE/'evaluate.py'),'--input',str(f),'--output-dir',str(out)],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr);a=json.loads((out/'diagnostic.json').read_text());self.assertFalse(a['outcomesAccessed']);self.assertEqual(a['status'],'INCONCLUSIVE')
 def test_cap_symmetric_not_drop_big_winner(self):
  q=p();q['c'][70]=100.;D=['2023-01-03']*100;z=next(x for x in E.stock_events('ZZQ',q,D,C) if x['t']==60);self.assertEqual(z['g'],3)
 def test_positive_raw_mean_does_not_beat_stronger_base_or_market(self):
  D=E.sessions('2023-01-03','2024-12-31');P={('S'+str(i)):p(len(D)) for i in range(51)};P['SPY']=p(len(D))
  def mocked(sym,px,dates,c):
   a=[]
   for t in range(0,len(D)-10,10):
    g=(.10 if sym=='S0' else .20)+(t%30)*.0001
    a += [{'s':sym,'t':t,'e':t+1,'x':t+10,'g':g,'status':'MODELED_RESOLVED','base':True,'repeat':sym=='S0'}, {'s':sym,'t':t+1,'e':t+2,'x':t+11,'g':0.,'status':'MODELED_RESOLVED','base':False,'repeat':False}]
   return a
  with patch.object(E,'stock_events',side_effect=mocked):r=E.evaluate(P,D,C,A)
  self.assertEqual(r['status'],'RETIRED_ON_LEGACY_PANEL');self.assertGreater(r['halves']['repeat']['older']['avg'],0);self.assertLess(r['halves']['repeat']['older']['pairedBaseDifference'],0);self.assertIsNone(r['executablePerformance'])
 def test_unknown_selected_exit_cannot_disappear_into_rejection_or_success(self):
  D=E.sessions('2023-01-03','2024-12-31');P={('S'+str(i)):p(len(D)) for i in range(51)};P['SPY']=p(len(D))
  def mocked(sym,px,dates,c):return [{'s':sym,'t':t,'e':t+1,'x':t+10,'g':None if sym=='S0' and t==0 else .1,'status':'UNRESOLVED_EXIT' if sym=='S0' and t==0 else 'MODELED_RESOLVED','base':True,'repeat':sym=='S0'} for t in range(0,len(D)-10,10)]
  with patch.object(E,'stock_events',side_effect=mocked):r=E.evaluate(P,D,C,A)
  self.assertEqual(r['status'],'INCONCLUSIVE');self.assertEqual(r['halves']['repeat']['older']['unknown'],1)
if __name__=='__main__':unittest.main()
