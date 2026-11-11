# Private original-byte second reading. No network, provider or runtime data writes.
import pathlib,json,hashlib,re,sys,copy
from html.parser import HTMLParser
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/workspace/research-primary-evidence-20261111/broad-next-batch')
class Tables(HTMLParser):
 def __init__(self):super().__init__();self.tables=[];self.stack=[];self.row=None;self.cell=None;self.text=[]
 def handle_starttag(self,t,a):
  if t=='table':self.stack.append(len(self.tables));self.tables.append({'before':' '.join(self.text)[-1500:],'rows':[]})
  if t=='tr':self.row=[]
  if t in ['td','th']:self.cell=[]
 def handle_data(self,d):
  if d.strip():self.text.append(d.strip())
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  if t in ['td','th'] and self.cell is not None:
   if self.row is not None:self.row.append(' '.join(''.join(self.cell).split()))
   self.cell=None
  if t=='tr' and self.row is not None:
   if self.stack:self.tables[self.stack[-1]]['rows'].append(self.row)
   self.row=None
  if t=='table' and self.stack:self.stack.pop()
def number_cells(row,label):
 assert label in row,('ROW_LABEL_MISSING',label);out=[];neg=False
 for c in row[row.index(label)+1:]:
  c=c.strip().replace('$','')
  if c=='(':neg=True;continue
  if c in ['',')','$']:continue
  if c in ['—','–','-']:out.append('0');continue
  if not re.fullmatch(r'\(?-?\$?[0-9][0-9,]*(?:\.[0-9]+)?\)?',c):raise AssertionError(('NON_NUMERIC_CELL',label,c))
  sign='-' if neg or c.startswith('(') or c.startswith('-') else '';out.append(sign+re.sub(r'[,()$-]','',c));neg=False
 return out
def bind_periods(table):
 h=' '.join(c for r in table['rows'][:10] for c in r);assert 'Three Months Ended' in h and 'Nine Months Ended' in h and h.index('Three Months Ended')<h.index('Nine Months Ended')
 assert h.count('September 30,')>=1 and 'in thousands' in h.lower()
 years=[r for r in table['rows'][:10] if [c for c in r if re.fullmatch(r'20\d\d',c)]==['2026','2025','2026','2025']];assert len(years)==1
 return ['Q3_2026','Q3_2025','NINE_MONTHS_2026','NINE_MONTHS_2025']
def choose(tables,labels,context=None):
 matches=[t for t in tables if all(any(label in r for r in t['rows']) for label in labels) and (context is None or context in t['before'] or any(context in c for r in t['rows'][:4] for c in r))];assert len(matches)==1,('AMBIGUOUS_TABLE',labels,len(matches));return matches[0]
def exact(table,label,expected,after=None,before=None):
 periods=bind_periods(table);rows=table['rows'];lo=next(i for i,r in enumerate(rows) if after in r)+1 if after else 0;hi=next(i for i,r in enumerate(rows) if before in r) if before else len(rows);hits=[r for r in rows[lo:hi] if label in r];assert len(hits)==1,('AMBIGUOUS_ROW',label);values=number_cells(hits[0],label);assert len(values)==4
 observed=dict(zip(periods,values))
 for p,v in expected.items():assert observed[p]==v,('CELL_VALUE_MISMATCH',label,p,observed[p],v)
 return {'label':label,'periodValues':observed,'tableYearOrder':[2026,2025,2026,2025],'rowSectionAfter':after,'rowSectionBefore':before}
docs={};witness={}
for name in ['OSCR','OSCR-10Q','KNSA-issuer-release']:
 b=(root/(name+'.html')).read_bytes();receipt=json.loads((root/(name+'.receipt.json')).read_text());assert hashlib.sha256(b).hexdigest()==receipt['sha256'];p=Tables();p.feed(b.decode());docs[name]=p.tables;witness[name]={'sha256':receipt['sha256'],'bytes':len(b),'tables':len(p.tables),'checks':[]}
os=choose(docs['OSCR'],['Total revenue','Net income (loss) attributable to Oscar Health, Inc.'],context='Third Quarter 2026 Financial Highlights');witness['OSCR']['checks']+=[exact(os,'Total revenue',{'Q3_2026':'5139298','Q3_2025':'2985984'}),exact(os,'Net income (loss) attributable to Oscar Health, Inc.',{'Q3_2026':'167281','Q3_2025':'-137450'})]
shares=choose(docs['OSCR'],['Weighted Average Common Shares Outstanding']);witness['OSCR']['checks'].append(exact(shares,'Basic',{'Q3_2026':'309339','Q3_2025':'259273'},after='Weighted Average Common Shares Outstanding'))
eq=choose(docs['OSCR-10Q'],['Common stock, Class A shares','Common stock, Class B shares']);A='Common stock, Class A shares';B='Common stock, Class B shares'
witness['OSCR-10Q']['checks']+=[exact(eq,'Issuance of common stock from equity incentive plans and stock purchase agreement',{'NINE_MONTHS_2026':'13281'},after=A,before=B),exact(eq,'Shares withheld for net settlement of share-based awards',{'NINE_MONTHS_2026':'-1000'},after=A,before=B),exact(eq,'Issuance of common stock from equity incentive plans',{'NINE_MONTHS_2026':'660'},after=B),exact(eq,'Conversion of Class B shares to Class A shares',{'NINE_MONTHS_2026':'1322'},after=A,before=B),exact(eq,'Conversion of Class B shares to Class A shares',{'NINE_MONTHS_2026':'-1322'},after=B)]
kn=choose(docs['KNSA-issuer-release'],['Product revenue, net','Net income','Weighted average ordinary shares outstanding—basic']);witness['KNSA-issuer-release']['checks']+=[exact(kn,'Product revenue, net',{'Q3_2026':'285970','Q3_2025':'180855'}),exact(kn,'Net income',{'Q3_2026':'47345','Q3_2025':'18435'}),exact(kn,'Weighted average ordinary shares outstanding—basic',{'Q3_2026':'78192603','Q3_2025':'74714846'})]
# Adverse checks: similar substring, wrong period and damaged period header must fail.
checks=0
for kind in ['substring','wrongperiod','wrongheader']:
 t=copy.deepcopy(eq if kind=='substring' else os)
 if kind=='substring':
  for r in t['rows']:
   if 'Issuance of common stock from equity incentive plans' in r:r[r.index('660')]='1,660'
  action=lambda:exact(t,'Issuance of common stock from equity incentive plans',{'NINE_MONTHS_2026':'660'},after=B)
 elif kind=='wrongperiod':
  r=next(r for r in t['rows'] if 'Total revenue' in r);i,j=r.index('$5,139,298'),r.index('$2,985,984');r[i],r[j]=r[j],r[i];action=lambda:exact(t,'Total revenue',{'Q3_2026':'5139298'})
 else:
  for r in t['rows']:
   for i,c in enumerate(r):r[i]=c.replace('Three Months Ended','Nine Months Ended')
  action=lambda:exact(t,'Total revenue',{'Q3_2026':'5139298'})
 try:action();raise RuntimeError('ADVERSE_VALIDATOR_FALSE_PASS')
 except AssertionError:checks+=1
witness['scope']='CODEX_SECOND_READ_OF_HASHED_ORIGINALS; CLAUDE_EXTRACTION_ONLY; NO_AUTHENTICITY_UPGRADE';witness['adverseFailuresCorrectlyCaught']=checks
(root/'second-read-bound-cells.private.json').write_text(json.dumps(witness,indent=2));print(json.dumps({'sourceHashes':{n:witness[n]['sha256'] for n in docs},'wholeCellPeriodBoundChecks':sum(len(witness[n]['checks']) for n in docs),'adverseFailuresCorrectlyCaught':checks,'rawTablesPublished':False}))
