#!/usr/bin/env bash
# Diagnostic for finding F1 (reviewer: Claude). Copies a tree to a throwaway directory, instruments ONLY the host's
# storage-monitor catch in native-sec-colocated-host.mjs to log the error it swallows, then runs the author's
# "success" actual-host case N times. Nothing in the reviewed tree is modified.
# Usage: diag-monitor.sh <tree> <node-binary> <runs>
set -euo pipefail
tree=$(cd "$1" && pwd); node=$2; runs=${3:-6}
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
tar -C "$tree" --exclude=.git -cf - . | tar -C "$work" -xf -
log="$work/monitor-errors.log"; export V2_DIAG_LOG="$log"
python3 - "$work/native-sec-colocated-host.mjs" <<'PY'
import sys,re
p=sys.argv[1];s=open(p).read()
old="}catch{limitHit=true;captureChild.kill('SIGTERM');}},100);"
assert s.count(old)==1, 'anchor not found exactly once'
new="}catch(e){globalThis.__v2diag?.(e);limitHit=true;captureChild.kill('SIGTERM');}},100);"
s=s.replace(old,new)
s="import __fs from 'node:fs';globalThis.__v2diag=e=>__fs.appendFileSync(process.env.V2_DIAG_LOG,(e.code||'-')+' '+String(e.message).slice(0,160)+'\\n');\n"+s
open(p,'w').write(s)
PY
pass=0; fail=0
for i in $(seq 1 "$runs"); do
  : > "$log"
  (cd "$work" && "$node" --test --test-name-pattern='binding success$' test/sec-v2-host.test.mjs > "$work/run.txt" 2>&1) || true
  if grep -q '^# fail 0' "$work/run.txt"; then pass=$((pass+1)); r=PASS; else fail=$((fail+1)); r=FAIL; fi
  echo "run $i $r monitor-errors: $(sort "$log" | uniq -c | tr '\n' ';')"
done
echo "node $($node -v) pass=$pass fail=$fail"
