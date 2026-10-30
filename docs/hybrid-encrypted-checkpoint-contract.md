# Encrypted hybrid checkpoint and offline recovery

The new journal writes immutable checkpoint-NNN.json.gz.enc files only, using the unchanged V1 AES256GCM/scrypt envelope from the existing sealer. The source SHA and relative checkpoint filename are authenticated AAD. File content includes frozen provider reference, plan, scientific state, transport counters and cycle evidence; no credential lookup/copy. Synthetic public keys are the only keys used in development tests. Existing RESEARCH_ARTIFACT_KEY and PRIVATE_KEY are not read, exported or modified.

Each write serializes bounded JSON, compresses and encrypts, fsyncs a mode0600 staging file, atomically links to a new filename (no overwrite), and fsyncs the mode0700 journal directory. Staging ciphertext remaining after process loss counts against the storage budget; symlinks are rejected. A restored journal authenticates present checkpoints, sequence/session and source scope before appending. An exhausted/halted transport retains requests, actual bytes, minute bucket, original start/deadline and refusal state; it cannot obtain a fresh budget by restarting. Gaps, wrong source/key/path, tampered tags, future state or changed plan are blocked. Tests use a separately restored fixture job, not a live session.

This is local recoverability infrastructure, not remote durability. There is no upload or live workflow. Future approved collector must upload only the authenticated committed-file allowlist, never a glob including staging files, with separately reviewed cancellation/upload budgets and three-day retention. A hard kill before any upload can still lose all local evidence; no claim otherwise is made.96MiB journal and8MiB per-checkpoint JSON caps are engineering bounds, not proof they fit actual broad snapshots. No old Phase A limit or runtime is changed.

New tools/recover-hybrid-checkpoints.py supports Python3.9 and authenticated cryptography AESGCM, tested with public Node-produced V1 fixture, wrong key, tampering, renamed/wrong source and symlinks. It authenticates all present files before writing a new output directory; it retains gzip bytes and labels results AUTHENTICATED_CHECKPOINT_FILES_ONLY. It does not validate decompressed scientific completeness or a strategy result. Original recover-phase-a.py remains pinned to7dd702d and intentionally does not accept a new hybrid pin.

For a FUTURE separately approved hybrid artifact, use the existing iPad/iSH Python environment with cryptography installed, then run offline:

```
python3 tools/recover-hybrid-checkpoints.py ENCRYPTED_DIR NEW_OUTPUT_DIR REVIEWED_NEW_SOURCE_SHA
```

Use the exact newly reviewed runtime SHA, not the public unit fixture's synthetic bbbb... SHA and not an invented substitute for7dd702d. Enter the independently saved research key only at the hidden local prompt; never put it in argv, a shell variable or chat. No new owner proof is requested and there is no live artifact from this milestone. The existing successful challenge proof remains VERIFIED.
