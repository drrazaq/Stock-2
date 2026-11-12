# Standard-library private artifact packing, no network or credentials.
import pathlib,json,hashlib,zipfile,sys
root=pathlib.Path('runtime/reference-capture');files=sorted(root.glob('originals/*.json'))+[root/'capture-result.json'];assert len(files)<=16 and all(p.is_file() and not p.is_symlink() for p in files)
total=sum(p.stat().st_size for p in files);assert total<=24*1024*1024
manifest={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files};(root/'DIGESTS.json').write_text(json.dumps(manifest,indent=2));out=pathlib.Path('runtime/owner-recovery.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files+[root/'DIGESTS.json']:z.write(p,str(p.relative_to(root)))
assert out.stat().st_size<=20*1024*1024
print('OWNER_RECOVERY_SHA256='+hashlib.sha256(out.read_bytes()).hexdigest());print('OWNER_RECOVERY_BYTES='+str(out.stat().st_size))
