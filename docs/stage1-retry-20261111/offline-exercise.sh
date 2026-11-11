#!/bin/bash
# OFFLINE exercise of stage1_retry.py (rev2). A local bare repository stands in for GitHub: no network and no real remote.
# Every scenario starts from the real main 1239510a; forward scenarios use the reviewed candidate 11c56c0a.
# Usage: offline-exercise.sh <Stock-2 .git> <binding-stage1.json> <inverse-stage1.json>
set -u
SRC=$1; BIND=$2; INV=$3; HERE=$(cd "$(dirname "$0")" && pwd); TOOL=$HERE/stage1_retry.py
BASE=1239510ad6573fcb23f606b1cb588517d265cb8d; TESTED=11c56c0abbce4946f1c3bfcfc1eda8decd88a906
FAST="node --test test/recovery-floor.test.mjs test/premarket-feed.test.mjs test/premarket-standalone-evidence.test.mjs test/alert-merge-compatibility.test.mjs"
FULL="node --test --test-concurrency=8 test/*.test.mjs"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT; export W
export GIT_AUTHOR_NAME=fixture GIT_AUTHOR_EMAIL=fixture@example.invalid GIT_COMMITTER_NAME=fixture GIT_COMMITTER_EMAIL=fixture@example.invalid
pass=0; fail=0
setup() {
  rm -rf "$W/r" "$W/op" "$W/h" "$W/n"; git init -q --bare "$W/r"; echo "$SRC/objects" > "$W/r/objects/info/alternates"
  git -C "$W/r" update-ref refs/heads/main $BASE
  for d in op h; do git clone -q --shared "$W/r" "$W/$d" 2>/dev/null; echo "$SRC/objects" >> "$W/$d/.git/objects/info/alternates"; done
  git -C "$W/op" fetch -q "$SRC" $TESTED 2>/dev/null || true
}
inject() {  # land a concurrent commit on the remote main: data | code | chmod <path> | content <path>
  git -C "$W/h" fetch -q origin main && git -C "$W/h" checkout -q -B main origin/main
  case "$1" in
    data) echo "{\"inject\":$RANDOM}" > "$W/h/data/zz-inject-$RANDOM$RANDOM.json";;
    code) echo "// unrelated newer code" >> "$W/h/watcher-guard.mjs";;
    chmod) chmod +x "$W/h/$2"; git -C "$W/h" update-index --chmod=+x "$2";;
    content) echo "// drift" >> "$W/h/$2";;
  esac
  git -C "$W/h" add -A && git -C "$W/h" commit -qm "inject $1" && git -C "$W/h" push -q origin main
}
export -f inject
publish_forward() {  # simulate a completed forward publication for the inverse scenarios (+1 data commit on top)
  (cd "$W/op" && STAGE1_PUSH="git push --porcelain" python3 "$TOOL" --mode forward --binding "$BIND" --inverse "$INV" --tested $TESTED \
     --deadline 2099-01-01T00:00:00Z --suite "$FAST" >/dev/null 2>&1); inject data >/dev/null 2>&1
}
cat > "$W/push.sh" <<'EOF'
#!/bin/bash
n=$(( $(cat "$W/n" 2>/dev/null || echo 0) + 1 )); echo $n > "$W/n"; step=$(echo "$PLAN" | cut -d, -f$n); remote=${@: -2:1}; spec=${@: -1}
case "$step" in
  data-then-real) inject data >/dev/null 2>&1; exec git push --porcelain "$remote" "$spec";;
  code-then-real) inject code >/dev/null 2>&1; exec git push --porcelain "$remote" "$spec";;
  real-then-fail) git push --porcelain "$remote" "$spec" >/dev/null 2>&1; echo "fatal: the remote end hung up unexpectedly" >&2; exit 128;;
  real-then-data-then-fail) git push --porcelain "$remote" "$spec" >/dev/null 2>&1; inject data >/dev/null 2>&1; exit 128;;
  real-then-chmod-then-fail) git push --porcelain "$remote" "$spec" >/dev/null 2>&1; inject chmod scan.mjs >/dev/null 2>&1; exit 128;;
  real-then-code-then-fail) git push --porcelain "$remote" "$spec" >/dev/null 2>&1; inject code >/dev/null 2>&1; exit 128;;
  real-then-hang) git push --porcelain "$remote" "$spec" >/dev/null 2>&1; sleep 90;;
  hang-without-push) sleep 90;;
  accept-after-cutoff) (sleep 38; git push --porcelain "$remote" "$spec" >/dev/null 2>&1) >/dev/null 2>&1 & disown; echo "fatal: the remote end hung up unexpectedly" >&2; exit 128;;
  fail-without-push) echo "fatal: unable to access: Could not resolve host" >&2; exit 128;;
  hook-reject) printf '#!/bin/sh\necho protected >&2; exit 1\n' > "$W/r/hooks/pre-receive"; chmod +x "$W/r/hooks/pre-receive"; exec git push --porcelain "$remote" "$spec";;
  *) exec git push --porcelain "$remote" "$spec";;
esac
EOF
chmod +x "$W/push.sh"
# check <name> <mode> <expected exit> <expected remote: AFTER|BEFORE|DRIFTED-AFTER|UNTOUCHED> [suite] [deadline]
check() {
  [ -n "${ONLY:-}" ] && [[ "$1" != $ONLY* ]] && return 0
  local name=$1 mode=$2 want=$3 final=$4 suite=${5:-$FAST} deadline=${6:-2099-01-01T00:00:00Z} out rc M0
  M0=$(git -C "$W/r" rev-parse refs/heads/main)
  out=$(cd "$W/op" && STAGE1_PUSH="$W/push.sh" timeout 900 python3 "$TOOL" --mode $mode --binding "$BIND" --inverse "$INV" --tested $TESTED \
        --deadline "$deadline" --cap 3 --suite "$suite" ${DECISION:+--decision "$DECISION"} 2>&1); rc=$?
  [ "$final" = LATE-AFTER ] && { sleep 45; final=AFTER; }
  local M=$(git -C "$W/r" rev-parse refs/heads/main) ok=1 detail=""
  [ "$rc" = "$want" ] || { ok=0; detail+=" rc=$rc(want $want)"; }
  python3 - "$W/r" "$M0" "$M" "$BASE" "$BIND" "$INV" "$final" "$mode" > "$W/v" 2>&1 <<'PY' || { ok=0; detail+=" $(cat $W/v)"; }
import json,subprocess,sys,os,tempfile
R,M0,M,BASE,B,I,final,mode=sys.argv[1:]; g=lambda *a:subprocess.run(['git','-C',R,*a],capture_output=True,text=True)
files=json.load(open(B))['files']; inv=json.load(open(I))['restore']
before={f:((v['before']['mode'],v['before']['gitBlobSHA1']) if v.get('before') else None) for f,v in files.items()}
after={f:(v['mode'],v['gitBlobSHA1']) for f,v in files.items()}
def lv(t):
    o={}
    for l in g('ls-tree','-r',t).stdout.splitlines():
        meta,p=l.split('\t',1); m,_,s=meta.split(); o[p]=(m,s)
    return o
def st(L): return {('A' if L.get(f)==after[f] else 'B' if L.get(f)==before[f] else 'X') for f in files}
L=lv(M); L0=lv(M0)
assert g('merge-base','--is-ancestor',M0,M).returncode==0, 'history rewritten'
for c in g('log','--format=%H %s',BASE+'..'+M).stdout.splitlines():           # every concurrent data commit survives
    if c.endswith('inject data'):
        for f in g('diff-tree','--no-commit-id','--name-only','-r',c.split()[0]).stdout.split(): assert f in L, 'lost data '+f
rel=[c for c in g('log','--format=%s',M0+'..'+M).stdout.splitlines() if c.startswith('Stage 1 ')]
if final=='AFTER':
    assert st(L)=={'A'}, 'not all 9 AFTER (mode,blob)'; assert len(rel)==1, 'release commits %d'%len(rel)
    idx=tempfile.mktemp(); env=dict(os.environ,GIT_INDEX_FILE=idx,GIT_DIR=R,GIT_WORK_TREE=tempfile.mkdtemp())
    subprocess.run(['git','read-tree',M],env=env,check=True)
    for r in inv:
        if r.get('sha') is None: subprocess.run(['git','update-index','--force-remove','--',r['path']],env=env,check=True)
        else: subprocess.run(['git','update-index','--add','--cacheinfo',r['mode']+','+r['sha']+','+r['path']],env=env,check=True)
    Li=lv(subprocess.run(['git','write-tree'],env=env,capture_output=True,text=True).stdout.strip()); os.remove(idx)
    assert all(Li.get(f)==before[f] for f in files), 'inverse not exact on all 9 (mode,blob,absence)'
    assert {p:v for p,v in Li.items() if p not in files}=={p:v for p,v in L.items() if p not in files}, 'inverse changed other leaves'
    print('9 AFTER; inverse on final main exact on all 9 incl. 4 absent; other leaves kept')
elif final=='BEFORE':
    assert st(L)=={'B'}, 'not all 9 BEFORE (mode,blob,absence)'; assert len(rel)==1 and rel[0].startswith('Stage 1 inverse'), 'inverse commits %s'%rel
    new=set(L)-set(L0)-set(files); assert all(p.startswith('data/') for p in new), 'unexpected new leaves'
    assert {p:v for p,v in L.items() if p not in files and p in L0}=={p:v for p,v in L0.items() if p not in files}, 'inverse changed unbound leaves'
    print('9 BEFORE incl. 4 absent; newer data and unbound leaves kept')
elif final=='DRIFTED-BEFORE':
    assert st(L)=={'B'}, 'not all 9 BEFORE'; assert len(rel)==1 and rel[0].startswith('Stage 1 inverse'), 'inverse commits %s'%rel
    print('inverse published then unbound source drifted; recorded, not retried')
elif final=='DRIFTED-AFTER':
    assert len(rel)==1, 'expected exactly one published release, got %d'%len(rel); print('published then drifted; recorded, not retried')
else:
    assert not rel, 'unexpected publication %s'%rel; assert L0.keys()-L.keys()==set(), 'leaf lost'; print('untouched (no release commit)')
PY
  if [ $ok = 1 ]; then pass=$((pass+1)); echo "PASS  $name  rc=$rc  $(cat $W/v)"; else fail=$((fail+1)); echo "FAIL  $name $detail"; fi
  echo "$out" | sed 's/^/      /'
}
soon() { python3 -c "import datetime as d;print((d.datetime.now(d.timezone.utc)+d.timedelta(seconds=$1)).isoformat())"; }
# ---- forward ----
setup; PLAN=real                            check "F1 clean, FULL suite on the fresh candidate"      forward 0 AFTER "$FULL"
setup; PLAN=data-then-real,real             check "F2 data race -> NOT_PUBLISHED -> new parent"        forward 0 AFTER
setup; PLAN=data-then-real,data-then-real,real check "F3 two data races -> attempt 3"                  forward 0 AFTER
setup; PLAN=data-then-real,data-then-real,data-then-real check "F4 race on every attempt -> cap STOP"   forward 2 UNTOUCHED
setup; PLAN=code-then-real,real             check "F5 newer non-data change -> gate STOP"              forward 2 UNTOUCHED
setup; PLAN=real-then-fail                  check "F6 pushed, client error -> PUBLISHED, no retry"     forward 0 AFTER
setup; PLAN=real-then-data-then-fail        check "F7 pushed + later data, client error -> PUBLISHED"  forward 0 AFTER
setup; PLAN=fail-without-push,real          check "F8 transport error, nothing sent -> UNKNOWN"        forward 3 UNTOUCHED
setup; PLAN=hook-reject,real                check "F9 non-NFF rejection -> UNKNOWN"                    forward 3 UNTOUCHED
setup; inject content scan.mjs >/dev/null 2>&1; PLAN=real check "F10 bound content drift -> STOP"     forward 2 UNTOUCHED
setup; PLAN=real                            check "F11 deadline already passed -> STOP"                forward 2 UNTOUCHED "$FAST" 2000-01-01T00:00:00Z
setup; inject chmod scan.mjs >/dev/null 2>&1; PLAN=real check "F12 chmod-only bound drift -> STOP (R2)" forward 2 UNTOUCHED
setup; PLAN=real-then-chmod-then-fail       check "F13 pushed + mode drift after -> PUBLISHED_DRIFT"   forward 4 DRIFTED-AFTER
setup; PLAN=real-then-code-then-fail        check "F14 pushed + source drift after -> PUBLISHED_DRIFT" forward 4 DRIFTED-AFTER
setup; PLAN=real; export STAGE1_TEST_PREPUSH_SLEEP=40
                                            check "F15 deadline crosses during preparation -> no push" forward 2 UNTOUCHED "$FAST" "$(soon 30)"
unset STAGE1_TEST_PREPUSH_SLEEP
setup; PLAN=real                            check "F16 suite fails on the candidate -> STOP"           forward 2 UNTOUCHED "false"
setup; PLAN=real-then-hang                  check "F17 push lands then hangs past budget -> PUBLISHED_LATE (timing UNKNOWN)" forward 5 AFTER "$FAST" "$(soon 40)"
setup; PLAN=hang-without-push,real          check "F18 hang without push past budget -> UNKNOWN, no retry" forward 3 UNTOUCHED "$FAST" "$(soon 40)"
setup; PLAN=accept-after-cutoff,real        check "F19 server accepts only AFTER the cutoff -> UNKNOWN, never timely, no retry" forward 3 LATE-AFTER "$FAST" "$(soon 40)"
# ---- inverse (forward already published, 1 data commit on top); D = now, deadline <= D+30 ----
export DECISION=$(soon 0); INVDL=$(soon 1500)
setup; publish_forward; PLAN=real           check "I1 inverse clean"                                   inverse 0 BEFORE "$FAST" "$INVDL"
setup; publish_forward; PLAN=data-then-real,real check "I2 inverse data race -> retry"                 inverse 0 BEFORE "$FAST" "$INVDL"
setup; publish_forward; PLAN=data-then-real,data-then-real,data-then-real check "I3 inverse race x3 -> cap STOP" inverse 2 UNTOUCHED "$FAST" "$INVDL"
setup; publish_forward; PLAN=real-then-fail check "I4 inverse pushed, client error -> PUBLISHED"       inverse 0 BEFORE "$FAST" "$INVDL"
setup; publish_forward; PLAN=fail-without-push,real check "I5 inverse transport error -> UNKNOWN"      inverse 3 UNTOUCHED "$FAST" "$INVDL"
setup; publish_forward; inject content scan.mjs >/dev/null 2>&1; PLAN=real check "I6 main not AFTER -> STOP" inverse 2 UNTOUCHED "$FAST" "$INVDL"
setup; publish_forward; PLAN=real           check "I7 inverse deadline already passed -> STOP"         inverse 2 UNTOUCHED "$FAST" 2000-01-01T00:00:00Z
setup; publish_forward; PLAN=real-then-code-then-fail check "I10 inverse pushed, then unbound source drift -> PUBLISHED_DRIFT, no retry" inverse 4 DRIFTED-BEFORE "$FAST" "$INVDL"
setup; publish_forward; inject code >/dev/null 2>&1; PLAN=real check "I8 newer non-data code after release -> inverse STOP (compatibility unproven)" inverse 2 UNTOUCHED "$FAST" "$INVDL"
setup; publish_forward; PLAN=real           check "I9 inverse deadline beyond D+30 -> refused before any action" inverse 1 UNTOUCHED "$FAST" "$(soon 3600)"
unset DECISION
echo "RESULT pass=$pass fail=$fail"
[ $fail = 0 ]
