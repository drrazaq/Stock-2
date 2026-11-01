# PR #6 independent review evidence (inactive V2 host/guard/recovery)

Read-only review outputs. Nothing here is imported or run by the system.

**Inputs**
- Every harness uses the reviewed tree's own synthetic fixtures (local child processes, mock artifact/provider transports, synthetic keys).
- Case I3 also uses one 127.0.0.1 HTTP listener started by the harness.
- No provider call and no credentials.

| File | Purpose |
|---|---|
| `REVIEW-v2-host-pr6.md` | Review of PR #6 (`6868d9a3` / head `64611cdf`): **CHANGES REQUIRED** (F1) |
| `v2-host-harness.mjs` | Actual host → worker → real wire client → recovery. Covers recovery tamper cases R00–R20, guard cases G00–G10 and watcher-isolation cases I1–I3. `node v2-host-harness.mjs <tree> [all\|recovery\|guards\|isolation]` |
| `diag-monitor.sh` | F1 root cause. Instruments only the host storage-monitor `catch` in a throwaway copy, then reruns the author's "success" case. `bash diag-monitor.sh <tree> <node> <runs>` |
| `harness-result-node20.json` | Harness output, Node 20.20.0, tree at `6868d9a3` |
| `harness-result-node22.json` | Harness output, Node 22.22.0, tree at `6868d9a3` |

The full-suite counts used `../runall.sh` (published earlier, unchanged).

## SHA256

- `REVIEW-v2-host-pr6.md`: `9d66747d256c3be19c717d03ede241999d55728e8218928e57cc4eb05b442d63`
- `v2-host-harness.mjs`: `fb83f88ae72c7a40f1a4515426aedfc1e030600e067e8b6f5b7d43ac794b751d`
- `diag-monitor.sh`: `e5b539a40d329c130526564925512c3f285c97caf6f8334a2150f0b3c1337a34`
- `harness-result-node20.json`: `0beca55e16651d2d027576368e12ea29bd9784d9a1e5bffa10fb94e9261a4c09`
- `harness-result-node22.json`: `19268dbebe32fe3a10e3fc0db8bb97ec474920063f618439e90ae1d78bd2a1e3`
