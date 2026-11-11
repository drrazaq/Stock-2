#!/bin/bash
# OFFLINE exercise of stage1_retry.py. A local bare repository stands in for GitHub; nothing touches the network or the
# real remote. Each scenario starts from the real main 1239510a and the reviewed candidate 11c56c0a (tested tree e21606e8).
# Usage: offline-exercise.sh <path to the Stock-2 .git> <binding-stage1.json> <inverse-stage1.json>
set -u
SRC=$1; BIND=$2; INV=$3; HERE=$(cd "$(dirname "$0")" && pwd); TOOL=$HERE/stage1_retry.py
BASE=1239510ad6573fcb23f606b1cb588517d265cb8d; TESTED=11c56c0abbce4946f1c3bfcfc1eda8decd88a906
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
export GIT_AUTHOR_NAME=fixture GIT_AUTHOR_EMAIL=fixture@example.invalid GIT_COMMITTER_NAME=fixture GIT_COMMITTER_EMAIL=fixture@example.invalid
pass=0; fail=0
setup() {  # fresh bare "remote" at BASE + operator clone + helper clone (both share objects with SRC: no copy, no network)
  rm -rf "$W/r" "$W/op" "$W/h"; git init -q --bare "$W/r"; echo "$SRC/objects" > "$W/r/objects/info/alternates"
  git -C "$W/r" update-ref refs/heads/main $BASE
  git clone -q --shared "$W/r" "$W/op" 2>/dev/null; echo "$SRC/objects" >> "$W/op/.git/objects/info/alternates"
  git clone -q --shared "$W/r" "$W/h" 2>/dev/null; echo "$SRC/objects" >> "$W/h/.git/objects/info/alternates"
  git -C "$W/op" fetch -q "$SRC" $TESTED 2>/dev/null || true; rm -f "$W/n"
}
inject() {  # $1 = data|code : land a commit on the remote main, as a concurrent workflow would
  git -C "$W/h" fetch -q origin main && git -C "$W/h" checkout -q -B main origin/main
  if [ "$1" = data ]; then n=$(ls "$W"/h/data 2>/dev/null | wc -l); echo "{\"inject\":$RANDOM$n}" > "$W/h/data/zz-inject-$RANDOM.json"
  else echo "// unrelated newer code" >> "$W/h/watcher-guard.mjs"; fi
  git -C "$W/h" add -A && git -C "$W/h" commit -qm "inject $1" && git -C "$W/h" push -q origin main
}
# STAGE1_PUSH wrapper: $PLAN is a comma list per attempt: real | data-then-real | code-then-real | real-then-fail |
# real-then-data-then-fail | fail-without-push | hook-reject
cat > "$W/push.sh" <<'EOF'
#!/bin/bash
n=$(( $(cat "$W/n" 2>/dev/null || echo 0) + 1 )); echo $n > "$W/n"; step=$(echo "$PLAN" | cut -d, -f$n); remote=${@: -2:1}; spec=${@: -1}
case "$step" in
  data-then-real) inject data >/dev/null 2>&1; exec git push --porcelain "$remote" "$spec";;
  code-then-real) inject code >/dev/null 2>&1; exec git push --porcelain "$remote" "$spec";;
  real-then-fail) git push --porcelain "$remote" "$spec" >/dev/null 2>&1; echo "fatal: the remote end hung up unexpectedly" >&2; exit 128;;
  real-then-data-then-fail) git push --porcelain "$remote" "$spec" >/dev/null 2>&1; inject data >/dev/null 2>&1; exit 128;;
  fail-without-push) echo "fatal: unable to access: Could not resolve host" >&2; exit 128;;
  hook-reject) printf '#!/bin/sh\necho protected >&2; exit 1\n' > "$W/r/hooks/pre-receive"; chmod +x "$W/r/hooks/pre-receive"; exec git push --porcelain "$remote" "$spec";;
  *) exec git push --porcelain "$remote" "$spec";;
esac
EOF
chmod +x "$W/push.sh"; export W; export -f inject
check() {  # $1 name, $2 expected exit, $3 expected final classification of the remote: PUBLISHED|UNTOUCHED, $4 injected data commits expected kept
  local name=$1 want=$2 final=$3; local out rc M
  out=$(cd "$W/op" && STAGE1_PUSH="$W/push.sh" python3 "$TOOL" --binding "$BIND" --inverse "$INV" --tested $TESTED --cutoff "${CUTOFF:-2099-01-01T00:00:00Z}" --cap 3 2>&1); rc=$?
  M=$(git -C "$W/r" rev-parse refs/heads/main)
  local ok=1 detail=""
  [ "$rc" = "$want" ] || { ok=0; detail+=" rc=$rc(want $want)"; }
  python3 - "$W/r" "$M" "$BASE" "$BIND" "$INV" "$final" > "$W/v" 2>&1 <<'PY' || { ok=0; detail+=" $(cat $W/v)"; }
import json,subprocess,sys,os,tempfile
R,M,BASE,B,I,final=sys.argv[1:]; g=lambda *a:subprocess.run(['git','-C',R,*a],capture_output=True,text=True)
files=json.load(open(B))['files']; inv=json.load(open(I))['restore']
def lv(t): return dict((l.split('\t',1)[1],tuple(l.split('\t')[0].split()[::2])) for l in g('ls-tree','-r',t).stdout.splitlines())
L=lv(M)
st={('A' if L.get(f,(0,0))[1]==v['gitBlobSHA1'] else 'B' if L.get(f,(0,0))[1]==(v.get('before') or {}).get('gitBlobSHA1') else 'X') for f,v in files.items()}
assert g('merge-base','--is-ancestor',BASE,M).returncode==0, 'history rewritten: base not ancestor'
injected=[c for c in g('log','--format=%H %s',BASE+'..'+M).stdout.splitlines() if c.endswith('inject data')]
for c in injected:  # every concurrent data commit is still in history and its files are still present unchanged
    for f in g('diff-tree','--no-commit-id','--name-only','-r',c.split()[0]).stdout.split(): assert f in L, 'lost data '+f
if final=='PUBLISHED':
    assert st=={'A'}, 'bound paths not published'
    rel=[c.split()[0] for c in g('log','--format=%H %s',BASE+'..'+M).stdout.splitlines() if 'Stage 1 release' in c]
    assert len(rel)==1, 'release commits=%d'%len(rel)
    # inverse on the FINAL remote main keeps every newer leaf and restores exactly the 9 before-blobs
    idx=tempfile.mktemp(); env=dict(os.environ,GIT_INDEX_FILE=idx,GIT_DIR=R,GIT_WORK_TREE=tempfile.mkdtemp())
    subprocess.run(['git','read-tree',M],env=env,check=True)
    for r in inv:
        if r.get('sha') is None: subprocess.run(['git','update-index','--force-remove','--',r['path']],env=env,check=True)
        else: subprocess.run(['git','update-index','--add','--cacheinfo',r['mode']+','+r['sha']+','+r['path']],env=env,check=True)
    T=subprocess.run(['git','write-tree'],env=env,capture_output=True,text=True).stdout.strip(); os.remove(idx); Li=lv(T)
    assert {p:v for p,v in Li.items() if p not in files}=={p:v for p,v in L.items() if p not in files}, 'inverse changed unbound leaves'
    assert all(Li.get(f,(0,0))[1]==(v.get('before') or {}).get('gitBlobSHA1') for f,v in files.items() if (v.get('before') or {}).get('gitBlobSHA1')), 'inverse not exact'
    print('published; kept %d concurrent data commits; inverse exact on final main'%len(injected))
else:
    assert 'A' not in st and not any('Stage 1 release' in c for c in g('log','--format=%s',BASE+'..'+M).stdout.splitlines()), 'unexpected publication'
    print('untouched; kept %d concurrent data commits'%len(injected))
PY
  if [ $ok = 1 ]; then pass=$((pass+1)); echo "PASS  $name  rc=$rc  $(cat $W/v)"; else fail=$((fail+1)); echo "FAIL  $name $detail"; fi
  echo "$out" | sed 's/^/      /'
}
setup; PLAN=real                                  check "S1 clean first attempt"                         0 PUBLISHED
setup; PLAN=data-then-real,real                   check "S2 data lands before push; retry on new parent"  0 PUBLISHED
setup; PLAN=data-then-real,data-then-real,real    check "S3 two data races then success (within cap 3)"   0 PUBLISHED
setup; PLAN=data-then-real,data-then-real,data-then-real check "S4 data race every attempt: cap 3 STOP"    2 UNTOUCHED
setup; PLAN=code-then-real,real                   check "S5 newer NON-data change: gate STOP, no retry"  2 UNTOUCHED
setup; PLAN=real-then-fail                        check "S6 ambiguous: pushed but client error -> PUBLISHED, no retry" 0 PUBLISHED
setup; PLAN=real-then-data-then-fail              check "S7 ambiguous + later data on top -> PUBLISHED via ancestry" 0 PUBLISHED
setup; PLAN=fail-without-push,real                check "S8 transport error, nothing sent -> UNKNOWN, no retry" 3 UNTOUCHED
setup; PLAN=hook-reject,real                      check "S9 non-NFF server rejection -> UNKNOWN, no retry" 3 UNTOUCHED
setup; git -C "$W/h" fetch -q origin main
f=$(python3 -c "import json;print(sorted(json.load(open('$BIND'))['files'])[2])"); git -C "$W/h" checkout -q -B main origin/main; echo "// drift" >> "$W/h/$f"; git -C "$W/h" commit -qam drift; git -C "$W/h" push -q origin main
PLAN=real                                         check "S10 bound-path drift on main -> STOP before push" 2 UNTOUCHED
setup; PLAN=real CUTOFF=2000-01-01T00:00:00Z      check "S11 cutoff already passed -> STOP before push"   2 UNTOUCHED
echo "RESULT pass=$pass fail=$fail"
[ $fail = 0 ]
