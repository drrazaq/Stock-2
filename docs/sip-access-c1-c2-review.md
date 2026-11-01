# Diagnostic C1/C2 correction — SOURCE CHECKPOINT, UNVERIFIED
The accepted contracts package and original107935f6 remain immutable. This checkpoint changes only the inactive diagnostic; final source/workflow pins follow passing source tests.
C1: bounded early wait inside the runner,10minutes maximum, latest startT0+30seconds, same absolute data deadlineT0+180seconds. Dispatch proposed10:50NY /18:50Kuwait forT0=11:00NY /19:00Kuwait on3November; scheduling delay beyond the latest start refuses before credentials are read. Total runner ceiling790seconds; final workflow will use20minutes including setup/upload and an800second process ceiling. No request/body/storage/output cap expansion; max7, no retries/fallback.
C2:20 fixed codes, jointly checked with exit0/1/2. Any unknown/malformed code, mismatch or exit124/137/143 becomes ERROR. Both proposed wrapper/finalizer must use this exact contract.
Own actual-runner tests use a real loopback HTTP service and synthetic bindings; fixtures preserve full declared early/late/repeat/deadline clocks while accelerating timers. Interrupted waiting must produce ERROR_INTERRUPTED and no requests.
Claude files were supplied as Sediment attachments, but download_file currently returns requires a ready execution workspace. Contents/hashes/harness execution remain UNVERIFIED; do not claim access or reproduction:
REVIEW-sip-107935f6.md expected a6efe8572331238bcb16077183d6c358a0ead58fa5a4f303da16ebd900586204 (file_00000000d4f0821199984a3312dc72f1).
realpath.mjs expected4253399aab8ba4e5a6c6467710704c69d170d9b531e55621a280dbe2b2e5618c (file_00000000e54c82118c310b265a5268f3).
Previous107935f6:5 check-runs across3 workflow runs, all PASS: test124824874025; safety124824874354; fixture-open124824874114; fixture-close124824949337; source-preservation124824873909. This is not5 workflow runs.
No installation, binding, provider call, dispatch or protocol adoption.
