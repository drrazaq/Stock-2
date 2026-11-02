#!/usr/bin/env bash
# Inactive source-pinned wrapper. Its parent workflow must pin this wrapper AND pins.sha256; no workflow is installed here.
set -u
unset NODE_OPTIONS NODE_PATH
umask 077
receiptPackage=$(cd -- "$(dirname -- "$0")" && pwd -P) || exit 1
receiptScratch=$(mktemp -d /tmp/stock2-receipt-result.XXXXXXXX) || { printf 'ERROR\n'; exit 1; }
trap 'rm -rf -- "$receiptScratch"' EXIT
if ! node - "$receiptPackage/pins.sha256" >/dev/null 2>&1 <<'PINS'
const fs=require('node:fs'),s=fs.readFileSync(process.argv[2],'utf8'),rows=s.trimEnd().split('\n');
const names=['receipt.mjs','github-read-client.mjs','runner.mjs','inactive-plan.json'];
if(rows.length!==names.length)process.exit(1);
for(const n of names)if(rows.filter(x=>new RegExp('^[a-f0-9]{64}  '+n.replaceAll('.','\\.')+'$').test(x)).length!==1)process.exit(1);
PINS
then printf 'ERROR\n'; exit 1; fi
if ! (cd "$receiptPackage" && sha256sum --check --status pins.sha256) 2>/dev/null; then printf 'ERROR\n'; exit 1; fi
rc=0
(ulimit -c 0; ulimit -f 1; timeout --signal=TERM --kill-after=2s 60s node --max-old-space-size=256 "$receiptPackage/runner.mjs" "$@" > "$receiptScratch/raw" 2>/dev/null) 2>/dev/null || rc=$?
value=$(node - "$receiptScratch/raw" "$rc" 2>/dev/null <<'RESULT'
const fs=require('node:fs');let out='ERROR';try{const b=fs.readFileSync(process.argv[2]);if(b.length<=32){const k=process.argv[3]+':'+b.toString('utf8');out=({'0:PASS\n':'PASS','2:BLOCKED\n':'BLOCKED','1:ERROR\n':'ERROR'})[k]||'ERROR';}}catch{}process.stdout.write(out);
RESULT
) || value=ERROR
case "$value" in PASS) printf 'PASS\n'; exit 0 ;; BLOCKED) printf 'BLOCKED\n'; exit 2 ;; *) printf 'ERROR\n'; exit 1 ;; esac
