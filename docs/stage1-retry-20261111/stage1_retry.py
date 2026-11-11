#!/usr/bin/env python3
"""Stage 1 finite non-force publication with data-only recomposition (amendment A4, revised per Codex 6789554579).

Run from a clone whose remote REMOTE is the publication target. Python standard library and git only.

  stage1_retry.py --binding B.json --inverse I.json --tested <tested candidate commit> --cutoff <ISO UTC>
                  [--cap 3] [--remote origin] [--dry-run]

Rules (each enforced in code below):
  R1 Finite. At most --cap push attempts (default 3), and never at or after --cutoff (the approved push cutoff, P <= T+20).
  R2 Fresh composition per attempt. Fetch the current main M. Compose C = tree(M) with the 9 binding after-blobs. Require:
     a. ALL non-data leaves of C (every path not under data/, with mode and blob, including workflows, dependencies and the
        test inventory) equal those of the tested candidate. A newer non-data change on main means STOP.
     b. diff(M, C) = exactly the 9 bound paths, each with the binding mode/SHA-1/SHA-256/bytes.
     c. On M, all 9 bound paths are at their binding BEFORE state (0 drift).
     d. The reviewed inverse applied to C gives exactly tree(M) (newer data kept).
     A PASS on an older parent is not reused: a-d are recomputed for every M.
  R3 Push. Exactly `git push --porcelain REMOTE C:refs/heads/main`, never forced.
  R4 Classify the result from the push output AND a fresh remote read (ls-remote + fetch + ancestry + bound-path
     reconciliation):
     PUBLISHED      push reported the ref update, or the remote main has C as an ancestor and carries the 9 after-blobs.
     NOT_PUBLISHED  ONLY when the push output is an explicit non-fast-forward rejection of refs/heads/main AND the fresh
                    remote main does not contain C AND all 9 paths are still at BEFORE. Only this permits another attempt.
     UNKNOWN        anything else (network error, timeout, exit code without a porcelain verdict, any other rejection
                    reason, remote unreadable, after-blobs present without C in the ancestry). STOP. No retry.
  R5 Nothing is ever overwritten: no force, no rebase of main, no data restore. A rejection is not a permission.
Exit codes: 0 PUBLISHED, 2 STOPPED (not published, a gate failed, cap or cutoff), 3 UNKNOWN.
"""
import argparse, datetime as dt, hashlib, json, os, subprocess, sys, tempfile

def git(*a, check=True, env=None):
    r = subprocess.run(['git', *a], capture_output=True, text=True, env=env)
    if check and r.returncode:
        raise RuntimeError('git ' + ' '.join(a) + ': ' + r.stderr.strip())
    return r

def leaves(tree):  # path -> (mode, blob)
    out = {}
    for line in git('ls-tree', '-r', '--full-tree', tree).stdout.splitlines():
        meta, path = line.split('\t', 1); mode, _t, sha = meta.split()
        out[path] = (mode, sha)
    return out

def non_data(lv): return {p: v for p, v in lv.items() if not p.startswith('data/')}

def write_tree(base, updates):  # updates: path -> (mode, sha) or None to remove
    idx = tempfile.mktemp(); env = dict(os.environ, GIT_INDEX_FILE=idx)
    try:
        git('read-tree', base, env=env)
        for p, v in updates.items():
            if v is None: git('update-index', '--force-remove', '--', p, env=env)
            else: git('update-index', '--add', '--cacheinfo', f'{v[0]},{v[1]},{p}', env=env)
        return git('write-tree', env=env).stdout.strip()
    finally:
        if os.path.exists(idx): os.remove(idx)

def blob_ok(sha, v):
    data = subprocess.run(['git', 'cat-file', 'blob', sha], capture_output=True).stdout
    return hashlib.sha256(data).hexdigest() == v['sha256'] and len(data) == v['bytes']

def bound_state(lv, files):
    st = set()
    for f, v in files.items():
        cur = lv.get(f, (None, None))[1]
        st.add('BEFORE' if cur == (v.get('before') or {}).get('gitBlobSHA1') else 'AFTER' if cur == v['gitBlobSHA1'] else 'OTHER')
    return st.pop() if len(st) == 1 else 'MIXED'

def remote_main(remote):
    r = git('ls-remote', remote, 'refs/heads/main', check=False)
    if r.returncode or not r.stdout.strip(): return None
    sha = r.stdout.split()[0]
    if git('fetch', '-q', remote, sha, check=False).returncode: return None
    return sha

def classify(push, C, remote, files):
    """R4. push = CompletedProcess of the porcelain push, or None when it raised."""
    M2 = remote_main(remote)
    if M2 is None: return 'UNKNOWN', 'remote unreadable after push', None
    has_c = git('merge-base', '--is-ancestor', C, M2, check=False).returncode == 0
    state = bound_state(leaves(M2), files)
    lines = (push.stdout if push else '').splitlines()
    ref = [l for l in lines if l.endswith('refs/heads/main') or '\trefs/heads/main' in l or ':refs/heads/main' in l]
    if has_c and state == 'AFTER': return 'PUBLISHED', f'remote main {M2} contains {C}; 9 after-blobs present', M2
    if push is not None and push.returncode != 0 and ref and ref[0].startswith('!') and ('[rejected]' in ref[0]) \
       and ('non-fast-forward' in ref[0] or 'fetch first' in ref[0]) and not has_c and state == 'BEFORE':
        return 'NOT_PUBLISHED', f'explicit non-fast-forward rejection; remote main {M2} lacks {C}; 9 paths BEFORE', M2
    return 'UNKNOWN', f'push rc={None if push is None else push.returncode} ref={ref[:1]} hasC={has_c} bound={state}', M2

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--binding', required=True); ap.add_argument('--inverse', required=True)
    ap.add_argument('--tested', required=True); ap.add_argument('--cutoff', required=True)
    ap.add_argument('--cap', type=int, default=3); ap.add_argument('--remote', default='origin')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    files = json.load(open(a.binding))['files']; inv = json.load(open(a.inverse))['restore']
    cutoff = dt.datetime.fromisoformat(a.cutoff.replace('Z', '+00:00'))
    tested_nd = non_data(leaves(a.tested + '^{tree}'))
    assert len(files) == 9 and len(inv) == 9
    log = lambda **k: print(json.dumps({'at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), **k}), flush=True)
    for attempt in range(1, a.cap + 1):
        if dt.datetime.now(dt.timezone.utc) >= cutoff:
            log(attempt=attempt, result='STOPPED', why='cutoff reached before attempt'); return 2
        M = remote_main(a.remote)
        if M is None: log(attempt=attempt, result='STOPPED', why='remote unreadable before attempt'); return 2
        Ml = leaves(M)
        if bound_state(Ml, files) != 'BEFORE':
            log(attempt=attempt, result='STOPPED', why='bound paths not at BEFORE on current main', main=M); return 2
        T = write_tree(M, {f: (v['mode'], v['gitBlobSHA1']) for f, v in files.items()})
        Cl = leaves(T)
        gates = {
            'nonDataEqualsTested': non_data(Cl) == tested_nd,
            'diffExactly9': sorted(p for p in set(Ml) | set(Cl) if Ml.get(p) != Cl.get(p)) == sorted(files),
            'bindingIdentities': all(Cl.get(f) == (v['mode'], v['gitBlobSHA1']) and blob_ok(v['gitBlobSHA1'], v) for f, v in files.items()),
            'inverseRestoresParent': write_tree(T, {r['path']: None if r.get('sha') is None else (r['mode'], r['sha']) for r in inv})
                                     == git('rev-parse', M + '^{tree}').stdout.strip(),
        }
        if not all(gates.values()):
            log(attempt=attempt, result='STOPPED', why='composition gate failed', main=M, gates=gates); return 2
        C = git('commit-tree', T, '-p', M, '-m', 'Stage 1 release: premarket P and recovery floor (source 211cf164, binding afd2a30f)').stdout.strip()
        log(attempt=attempt, main=M, candidate=C, tree=T, gates=gates)
        if a.dry_run: log(attempt=attempt, result='DRY_RUN'); return 2
        try:
            push = subprocess.run(os.environ.get('STAGE1_PUSH', 'git push --porcelain').split() + [a.remote, f'{C}:refs/heads/main'],
                                  capture_output=True, text=True, timeout=120)
        except Exception as e:  # timeout / transport exception: verdict comes only from R4
            push = None; log(attempt=attempt, pushException=type(e).__name__)
        verdict, why, M2 = classify(push, C, a.remote, files)
        log(attempt=attempt, result=verdict, why=why, remoteMain=M2,
            pushRc=None if push is None else push.returncode, pushOut=None if push is None else push.stdout.strip()[-300:])
        if verdict == 'PUBLISHED': return 0
        if verdict == 'UNKNOWN': return 3
    log(result='STOPPED', why=f'attempt cap {a.cap} reached; nothing published'); return 2

if __name__ == '__main__':
    sys.exit(main())
