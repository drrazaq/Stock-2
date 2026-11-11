# Exact invocation arrangement for reviewed use only

No production execution is authorized here. Binding/inverse must be materialized byte-identically from their pinned commit, tool/hash verified against manifest, and tested reference fixed to `5fccc6ec3e18c426531a0398b5085e2621a6e192`. Operate in the existing release clone with remote `origin` unchanged; the tool makes source-only objects/worktrees without resetting its checkout. Do not create a new repository, workflow, credential or task.

## Actual operator input without interactive-terminal assumptions

The existing shell can start a bounded background process and write a local named pipe. `admission-exercise.py` A8 exercises this exact POSIX route. Before starting, the pair must establish actual present access/readiness and the required external approvals. Then the sole operator may prepare a PRIVATE LOCAL temporary directory and named pipe; no repository or settings change is involved:

```bash
stage2_io_dir=$(mktemp -d /tmp/stage2-forward.XXXXXX)
chmod 700 "$stage2_io_dir"
mkfifo "$stage2_io_dir/admit"
(
  exec 3<>"$stage2_io_dir/admit"
  env -u STAGE2_PUSH -u STAGE2_TEST_PREPUSH_SLEEP -u STAGE2_TEST_ADMIT \
    python3 "$stage2_tool" --mode forward \
      --binding "$stage2_binding" --inverse "$stage2_inverse" \
      --tested 5fccc6ec3e18c426531a0398b5085e2621a6e192 \
      --deadline 2026-11-13T09:20:00Z --cap 3 \
      <&3 >"$stage2_io_dir/log" 2>&1
  echo "$?" >"$stage2_io_dir/exit"
) &
```

`stage2_tool`, `stage2_binding`, `stage2_inverse` are only verified absolute LOCAL paths to the manifest-pinned bytes, not replaceable source/reference choices. Keep the directory/process identity and full log; no automatic cleanup/restart is included. Do not publish private input or credentials.

Read `admissionRequired` from that log. For EACH attempt, collect fresh complete consumer/writer/band evidence and the independent verifier's actual pre-write clearance and attendance. The sole operator writes ONLY the exact printed mode/parent/candidate prefix plus the three actual receipt references and newline to the pipe, using an ordinary separate shell/Python command. Do not feed a guessed candidate or preapprove retries. A read-only verifier does not become the push operator by posting that clearance. The tool's wait has the original hard deadline, including partial input; if no clearance arrives no push starts.

Synthetic/offline receipt references are never valid for production. `STAGE2_TEST_ADMIT` is not a substitute for attendance and must remain unset. Existing GitHub connector reads/posting supply the real census/clearance; no unsupported workflow-settings API or new local token is assumed.

## Inverse arguments

Same tool, binding, inverse, tested ref, default suite and hooks UNSET. Use a fresh local IO directory/process for the inverse, actual originalD and its actual cutoff (not a literal inequality):

- Normal inverse: `--mode inverse --decision "$original_D_ISO" --deadline "$original_D_plus_30_or_earlier_ISO" --cap "$remaining_inverse_cap"`.
- Conditional LATE A: original D/deadline PLUS `--late-cutoff 2026-11-13T11:00:00Z --receipt-cutoff 2026-11-13T11:55:00Z`.
- Conditional LATE Saturday: original D/deadline PLUS `--late-cutoff 2026-11-14T07:30:00Z --receipt-cutoff 2026-11-14T08:25:00Z`.

A late invocation cannot begin before its ORIGINAL cutoff expired. Do not move that cutoff to current time. Across all inverse calls, candidate attempts must total<=3 and publication<=one; no unresolved/published request is restarted. Deduct any proven-not-published earlier attempts, preserve their earliest request/originalD evidence, and ensure only one publisher process exists. A published late inverse is still initially UNVERIFIED and cannot renew any clock/cap. The fixed complete hosted receipt/restoration gates remain mandatory.

## Development-only reproduction

Fetch the already-published tested object and prerequisite source objects through existing repository access if missing. Do not dispatch anything:

```bash
python3 docs/stage2-retry-20261111/build-objects.py
bash docs/stage2-retry-20261111/offline-exercise.sh \
  /absolute/existing/Stock-2/.git \
  /absolute/reviewed/binding-successor.json \
  /absolute/reviewed/inverse-successor-to-stage1.json
python3 docs/stage2-retry-20261111/config-exercise.py
python3 docs/stage2-retry-20261111/admission-exercise.py
```

These exercises create only temporary local bare repositories/clones and push ONLY there, with no network/production remote. Use existing Node20 on PATH, matching the default full-suite runtime. No installation or provider credentials. Preserve unchanged source receipts; only this delta needs review.
