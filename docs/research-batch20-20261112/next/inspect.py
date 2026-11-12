"""Offline documentary field audit; no strategy outcomes, network or production writes."""
import json,hashlib,re,pathlib,html.parser
HERE=pathlib.Path(__file__).resolve().parent
class Text(html.parser.HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.skip=0
 def handle_starttag(self,t,a):
  if t in ('script','style'):self.skip+=1
 def handle_endtag(self,t):
  if t in ('script','style'):self.skip=max(0,self.skip-1)
 def handle_data(self,d):
  if not self.skip:self.parts.append(d)
def normal(p):
 s=p.read_text(errors='replace')
 if p.suffix=='.html':
  h=Text();h.feed(s);s=' '.join(h.parts)
 return re.sub(r'\s+',' ',s).strip()
c=json.loads((HERE/'CONTRACT.json').read_text());inputs=[];docs={}
for x in c['retainedPrimaryInputs']:
 p=pathlib.Path(x['path']);b=p.read_bytes();assert len(b)==x['bytes'] and hashlib.sha256(b).hexdigest()==x['sha256'],p
 inputs.append({'file':p.name,'sha256':x['sha256'],'bytes':len(b),'verified':True})
 if p.suffix!='.pdf':docs[p.name]=normal(p)
# Hand-coded documentary decisions, never inferred from keyword frequency.
cases=[
 ('AXTI','AXTI.html','Capacity/demand discussion; no named binding contract with accepted delivery AND contract-specific cash.','No same-product QoQ ASP/quantity pair established.','No completed disposal-to-principal chain established.'),
 ('CRWV','CRWV.html','Expected customer prepayments/deposits are future advances, not cash earned on accepted delivery. Cognition production workload is not a payment receipt.','Deployment throughput is not realized unit price and quantity.','Convertibles/ATM financing are not cash disposal-funded debt retirement.'),
 ('FOSL','FOSL.html','No identified accepted-delivery/cash chain established.','Reported sales/margin do not establish unit price and same-product quantity.','Prior South Africa sale gain does not establish cash proceeds explicitly applied to principal.'),
 ('SNDK','SNDK_10Q.txt','NBM prepayments/deposits and aggregate CFO do not establish same-contract accepted-delivery cash.','ASP risk-factor mention and shipment timing commentary do not supply the required reported QoQ numeric pair.','Subsidiary sale net proceeds are disclosed; explicit current principal retirement from them is not established.'),
 ('LFST','LFST-offering.html','No identified binding customer delivery/cash chain established.','No same-product ASP/quantity pair established.','Selling-holder secondary proceeds do not go to issuer; not business disposal-funded retirement.'),
 ('GCT','GCT-10Q.html','Aggregate service revenue/receivables/CFO do not establish a named contract-specific receipt.','Revenue growth is not separately measured price/quantity.','No completed disposal-to-principal chain established.'),
 ('BB','BB-10Q.html','Backlog is not cash; no same-contract delivery/receipt chain established.','Potential AlloyKore ASP is forward-looking, not realized QoQ ASP with shipments.','Cylance prior disposal and noncash consideration do not establish current cash-funded principal retirement.'),
 ('KNSA','KNSA-issuer-release.html','Drug revenue and company CFO are not named contract-specific acceptance/cash.','No same-product unit price/quantity pair established.','No completed noncore disposal explicitly funding principal retirement established.'),
 ('OSCR','OSCR.html','NOT ASSESSED: existing research gate remains unresolved.','NOT ASSESSED: existing research gate remains unresolved.','NOT ASSESSED: existing research gate remains unresolved.')]
patterns={'AXTI.html':['indium phosphide','capacity'], 'CRWV.html':['prepayments','Cognition','convertible'], 'FOSL.html':['South Africa','divestiture'], 'SNDK_10Q.txt':['average selling prices','timing of shipments','34 million'], 'SNDK_RELEASE.html':['prepayments and deposits'], 'LFST-offering.html':['will not receive','selling stockholder'], 'GCT-10Q.html':['accounts receivable','operating activities'], 'BB.html':['Alloy','Coretura'], 'BB-10Q.html':['Cylance'], 'KNSA-issuer-release.html':['cash flow','Regeneron']}
w=[]
for file,terms in patterns.items():
 s=docs[file]
 for term in terms:
  hits=list(re.finditer(re.escape(term),s,re.I))
  for m in hits[:1]:
   lo=max(0,m.start()-90);hi=min(len(s),m.end()+240)
   w.append({'file':file,'term':term,'normalization':'HTML visible text then whitespace collapse; offsets refer to normalized text, NOT original bytes','normalizedStart':lo,'normalizedEnd':hi,'excerpt':s[lo:hi]})
rows=[{'symbol':sym,'anchorFile':f,'deliveryCash':a,'unitPrice':b,'disposalDebt':d,'qualifyingCompleteEvents':0 if sym!='OSCR' else None,'status':'NOT_ESTABLISHED_IN_RETAINED_SOURCES' if sym!='OSCR' else 'NOT_ASSESSED_PENDING_EXISTING_GATE'} for sym,f,a,b,d in cases]
out={'kind':'EXPLORATORY_DOCUMENTARY_FIELD_FEASIBILITY_NOT_RETURN_TEST','inputs':inputs,'rows':rows,'witnesses':w,'counts':{'retainedFilesVerified':len(inputs),'distinctIssuers':9,'issuersAssessed':8,'issuersNotAssessed':1,'verifiedQualifyingEvents':0},'limits':['Zero VERIFIED events is not proof zero actual events; absent disclosure is not economic falsification.','Convenience attention-selected sources; no event prevalence, returns or alpha inference.','No authenticated original decision-time observation, complete event universe, paired controls or USD/BBO entry-exit chains.','Executable performance, portfolio drawdown and historical ZAD eligibility remain NULL.']}
(HERE/'FIELD_RESULTS.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'verifiedInputs':len(inputs),'assessedIssuers':8,'verifiedEvents':0,'witnesses':len(w),'resultSha256':hashlib.sha256((HERE/'FIELD_RESULTS.json').read_bytes()).hexdigest()}))
