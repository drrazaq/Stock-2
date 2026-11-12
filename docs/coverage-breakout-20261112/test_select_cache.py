import io,json,os,pathlib,runpy,tempfile,unittest,urllib.request
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent
class Resp:
 def __init__(self,url,obj):self.url=url;self.b=json.dumps(obj).encode()
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def geturl(self):return self.url
 def read(self,n):return self.b[:n]
class Fake:
 def __init__(self,obj):self.obj=obj;self.calls=0
 def open(self,r,timeout):self.calls+=1;return Resp(r.full_url,self.obj)
class Checks(unittest.TestCase):
 def invoke(self,obj):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'out';f=Fake(obj)
   with patch('urllib.request.build_opener',return_value=f),patch.dict(os.environ,{'GH_TOKEN':'synthetic-not-real','GITHUB_OUTPUT':str(p)}):runpy.run_path(str(HERE/'select_cache.py'),run_name='fixture')
   return p.read_text(),f.calls
 def test_latest_key_not_old_fallback(self):
  a={'id':1,'key':'leaders-study-1','size_in_bytes':100,'created_at':'2026-11-11T00:00:00Z','ref':'refs/heads/main'};b={**a,'id':2,'key':'leaders-study-2','created_at':'2026-11-12T00:00:00Z'}
  out,n=self.invoke({'total_count':2,'actions_caches':[a,b]});self.assertEqual(out,'key=leaders-study-2\n');self.assertEqual(n,1)
 def test_oversized_newest_stops_not_old_small_fallback(self):
  a={'id':1,'key':'leaders-study-1','size_in_bytes':300000000,'created_at':'2026-11-12T00:00:00Z','ref':'refs/heads/main'}
  with self.assertRaisesRegex(RuntimeError,'BYTE_CAP'):self.invoke({'total_count':1,'actions_caches':[a]})
 def test_shell_metacharacters_never_reach_output(self):
  a={'id':1,'key':"leaders-study-';echo bad",'size_in_bytes':100,'created_at':'2026-11-12T00:00:00Z','ref':'refs/heads/main'}
  with self.assertRaisesRegex(RuntimeError,'INVALID_CACHE_KEY'):self.invoke({'total_count':1,'actions_caches':[a]})
 def test_metadata_pagination_is_bounded(self):
  a={'id':1,'key':'leaders-study-1','size_in_bytes':100,'created_at':'2026-11-12T00:00:00Z','ref':'refs/heads/main'}
  with self.assertRaisesRegex(RuntimeError,'INCOMPLETE'):self.invoke({'total_count':201,'actions_caches':[a]*100})
if __name__=='__main__':unittest.main()
