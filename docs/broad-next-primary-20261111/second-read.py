import pathlib,json,hashlib,re,sys
from html.parser import HTMLParser
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/workspace/research-primary-evidence-20261111/broad-next-batch')
class Rows(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.ignore=0
 def handle_starttag(self,t,a):
  if t=='tr':self.row=[]
  if t in ['td','th']:self.cell=[]
 def handle_data(self,d):
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  if t in ['td','th'] and self.cell is not None:
   if self.row is not None:self.row.append(re.sub(r'\s+',' ',''.join(self.cell)).strip())
   self.cell=None
  if t=='tr' and self.row is not None:self.rows.append(self.row);self.row=None
records={}
for name in ['OSCR','OSCR-10Q','KNSA-issuer-release']:
 b=(root/(name+'.html')).read_bytes();receipt=json.loads((root/(name+'.receipt.json')).read_text());assert hashlib.sha256(b).hexdigest()==receipt['sha256'];p=Rows();p.feed(b.decode());records[name]={'sha256':receipt['sha256'],'bytes':len(b),'tableRows':len(p.rows),'matchedRows':{}}
 for term in ['Total revenue','Net income','Weighted Average Common','Weighted average ordinary','Issuance of common stock from equity','Shares withheld','Earnings from operations','Net cash provided by operating']:
  hits=[row for row in p.rows if any(term.lower() in cell.lower() for cell in row)]
  if hits:records[name]['matchedRows'][term]=hits[:6]
(root/'second-read-tables.private.json').write_text(json.dumps(records,indent=2));print({k:{'sha256':v['sha256'],'tableRows':v['tableRows'],'matchedLabels':list(v['matchedRows'])} for k,v in records.items()})
# Numeric vectors must be seen in original table cells, not a rewritten summary.
for name,expected in {'OSCR':['5,139,298','2,985,984','167,281','309,339','259,273'],'OSCR-10Q':['13,281','660','1,000','1,322','16,391','20,727'],'KNSA-issuer-release':['285,970','180,855','47,345','18,435','78,192,603','74,714,846']}.items():
 b=(root/(name+'.html')).read_text();p=Rows();p.feed(b);allcells='|'.join(cell for row in p.rows for cell in row)
 for n in expected:assert n in allcells,(name,n)
print('SECOND_READ_HASH_AND_ORIGINAL_TABLE_NUMBERS_PASS; not an independent second person or source-authentication upgrade')
