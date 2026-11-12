"""Read exactly <=2 GitHub metadata pages; never provider endpoints or archive bytes."""
import json,os,sys,urllib.request,re
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):return None
opener=urllib.request.build_opener(NoRedirect)
URL='https://api.github.com/repos/drrazaq/Stock-2/actions/caches?key=leaders-study-&ref=refs%2Fheads%2Fmain&per_page=100&page='
MAX=268435456
rows=[]
for page in (1,2):
 req=urllib.request.Request(URL+str(page),headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+os.environ['GH_TOKEN'],'X-GitHub-Api-Version':'2022-11-28'})
 with opener.open(req,timeout=20) as r:
  if r.geturl()!=URL+str(page):raise RuntimeError('REDIRECT_REFUSED')
  data=r.read(1048577)
 if len(data)>1048576:raise RuntimeError('METADATA_BYTE_CAP')
 obj=json.loads(data);a=obj.get('actions_caches')
 if not isinstance(a,list):raise RuntimeError('METADATA_SCHEMA')
 rows.extend(a)
 if len(a)<100:break
else:
 if obj.get('total_count',0)>200:raise RuntimeError('INCOMPLETE_CACHE_METADATA')
a=[x for x in rows if x.get('ref')=='refs/heads/main' and str(x.get('key','')).startswith('leaders-study-')]
if not a:raise RuntimeError('NO_OBSERVED_MATCHING_CACHE')
# Latest authoritative creation time; no selection by contents/results, no older fallback.
x=sorted(a,key=lambda z:(z.get('created_at',''),z.get('id',0)),reverse=True)[0]
if not isinstance(x.get('size_in_bytes'),int) or not 0<x['size_in_bytes']<=MAX:raise RuntimeError('CACHE_ARCHIVE_BYTE_CAP')
key=x['key']
if not re.fullmatch(r'leaders-study-[A-Za-z0-9_.-]+',key):raise RuntimeError('INVALID_CACHE_KEY')
with open(os.environ['GITHUB_OUTPUT'],'a') as f:f.write('key='+key+'\n')
print(json.dumps({'cacheId':x['id'],'compressedCacheBytes':x['size_in_bytes'],'metadataGETs':page,'providerGETs':0,'rawDataObserved':False}))
