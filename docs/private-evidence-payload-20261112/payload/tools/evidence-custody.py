"""Offline bounded artifact/recovery. No provider, credential or network access."""
import pathlib,sys,json,hashlib,zipfile,datetime,os,re,stat
def sha(b): return hashlib.sha256(b).hexdigest()
def regular(p,cap):
 s=p.lstat(); assert stat.S_ISREG(s.st_mode) and not p.is_symlink() and s.st_size<=cap
 b=p.read_bytes();assert len(b)<=cap;return b
def pack(root,target,cap):
 assert root.is_dir() and not root.is_symlink() and not target.exists()
 allowed={'owner-report.txt','quote-recovery.json','assessment-recovery.json','receipt.json'}
 files={p.name:regular(p,3*1048576) for p in root.iterdir()}
 assert set(files)==allowed and sum(map(len,files.values()))<=3*1048576
 files['DIGESTS.json']=json.dumps({n:sha(b) for n,b in files.items()},sort_keys=True).encode()
 with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED) as z:
  for n,b in files.items():z.writestr(n,b)
 assert target.stat().st_size<=cap
 return sha(target.read_bytes())
def rehearsal(target):
 assert not target.exists();now=datetime.datetime.now(datetime.timezone.utc);expiry=now+datetime.timedelta(seconds=120)
 text=('SYNTHETIC ACCESS TEST — NO MARKET OR OWNER DATA\nAS-OF SNAPSHOT — NOT A CURRENT QUOTE\nFixture: STOCK2-ACCESS-20261112-01\n'
       f'Issued UTC: {now.isoformat()}\nExpiry UTC: {expiry.isoformat()}\n'
       'Expiry is historical after two minutes; download never makes it current.\nNo signal, holding, issuer identity or trading delivery is represented.\n').encode()
 with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED) as z:
  z.writestr('mobile-access-fixture.txt',text);z.writestr('SHA256SUMS.txt',sha(text)+'  mobile-access-fixture.txt\n')
 assert target.stat().st_size<=65536
 return sha(target.read_bytes())
def recover(bundle,pin,target):
 raw=regular(bundle,4*1048576);assert re.fullmatch('[a-f0-9]{64}',pin) and sha(raw)==pin
 assert not target.exists();os.mkdir(target,0o700)
 with zipfile.ZipFile(bundle) as z:
  names=z.namelist();allowed={'owner-report.txt','quote-recovery.json','assessment-recovery.json','receipt.json','DIGESTS.json'}
  assert len(names)==len(allowed) and set(names)==allowed and sum(i.file_size for i in z.infolist())<=3*1048576+65536
  files={n:z.read(n) for n in names}; dig=json.loads(files.pop('DIGESTS.json'));assert set(dig)==set(files)
  assert all(sha(b)==dig[n] for n,b in files.items())
  receipt=json.loads(files['receipt.json']);assert receipt['kind']=='BOUNDED_QUOTE_FEASIBILITY_V1' and receipt['deliveryAttempted'] is False
  assert sha(files['quote-recovery.json'])==receipt['quoteRecoverySha256']
  for n,b in files.items():
   with os.fdopen(os.open(target/n,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:f.write(b)
 return 'VERIFIED_ORIGINAL_EXPORT_BYTES_NO_CLOCK_REFRESH'
if __name__=='__main__':
 try:
  mode=sys.argv[1]
  if mode=='rehearsal': print('SYNTHETIC_ACCESS_ZIP_SHA256='+rehearsal(pathlib.Path(sys.argv[2])))
  elif mode=='pack': print('QUOTE_RECOVERY_ZIP_SHA256='+pack(pathlib.Path(sys.argv[2]),pathlib.Path(sys.argv[3]),4*1048576))
  elif mode=='recover':print(recover(pathlib.Path(sys.argv[2]),sys.argv[3],pathlib.Path(sys.argv[4])))
  else:raise ValueError('mode')
 except Exception:
  print('BOUNDED_CUSTODY_STOP_NO_RETRY',file=sys.stderr);sys.exit(1)
