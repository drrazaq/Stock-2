# Read-only recovery check on a DIFFERENT runner, of the owner-held re-upload.
import pathlib,zipfile,json,hashlib,sys,io
p=pathlib.Path(sys.argv[1]);expected=sys.argv[2];assert p.is_file() and not p.is_symlink() and p.stat().st_size<=20*1024*1024
b=p.read_bytes();assert len(expected)==64 and hashlib.sha256(b).hexdigest()==expected
with zipfile.ZipFile(io.BytesIO(b)) as z:
 names=z.namelist();assert len(names)<=17 and len(set(names))==len(names) and sum(x.file_size for x in z.infolist())<=24*1024*1024+65536
 assert all(n=='DIGESTS.json' or n=='capture-result.json' or n.startswith('originals/') and n.count('/')==1 and n.endswith('.json') for n in names)
 d=json.loads(z.read('DIGESTS.json'));assert set(names)==set(d)|{'DIGESTS.json'}
 for n,h in d.items():assert hashlib.sha256(z.read(n)).hexdigest()==h
 r=json.loads(z.read('capture-result.json'));assert len(r['receipts'])<=15 and r['rawBytes']<=24*1024*1024
print('OWNER_RECOVERY_BYTES_VERIFIED_NO_ACQUISITION_OR_ACTIVATION')
