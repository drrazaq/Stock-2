#!/usr/bin/env python3
"""Stage 1 finite non-force publication / inverse (amendment A4, rev2 per Codex 6789554579 and 6790013856).

  forward: stage1_retry.py --mode forward --binding B.json --inverse I.json --tested <tested commit> --deadline <ISO UTC>
  inverse: stage1_retry.py --mode inverse --binding B.json --inverse I.json --tested <tested commit> --deadline <ISO UTC>
  options: [--cap 3] [--remote origin] [--suite "node --test --test-concurrency=8 test/*.test.mjs"] [--dry-run]

--deadline is the approved hard cutoff: forward = push cutoff (T+20); inverse = D+30 (inverse publication).
Python standard library and git only. Every rule below is enforced in code.

  R1 Finite and clocked. At most --cap attempts (default 3). The deadline is checked before an attempt starts AND
     immediately before each push starts. Every external command (git, suite, push) gets a timeout no longer than the time
     left before the deadline. The push start time of EVERY attempt is logged, and FIRST_PUSH_START is the publication clock
     P (forward) or the inverse clock (inverse). Later attempts never reset it. A push that starts but does not answer in
     its budget is classified from the remote only, and is never retried.
  R2 Identity is (mode, blob), or absence. Bound-path state compares the full identity: BEFORE = the binding before
     (mode, blob) or absent for the 4 new paths; AFTER = the binding (mode, blob). Anything else is OTHER/MIXED.
  R3 Fresh composition and fresh evidence on EVERY attempt, recomputed for the current remote main M:
     forward: C = M plus the 9 after-blobs. Required:
       (a) all non-data/ leaves of C are identical to the tested candidate;
       (b) diff(M, C) is exactly the 9 paths, with the binding identities (mode, SHA-1, SHA-256, bytes);
       (c) M is BEFORE;
       (d) the inverse applied to C gives exactly tree(M);
       (e) the applicable suite passes on a checkout of C itself, inside the time left (no reuse of older-parent evidence).
     inverse: R = M with the 9 inverse entries (5 before-blobs, 4 deletions). Required:
       (b') diff(M, R) is exactly the 9 paths;
       (c') M is AFTER;
       (d') R is BEFORE on all 9 (mode, blob, absence);
       (e') every other leaf of R equals M (newer data and newer unbound code kept).
       The inverse receipt is the hosted Tests run on the published inverse (by D+85). No local suite is run, so recovery
       is not delayed.
  R4 Push: `git push --porcelain REMOTE X:refs/heads/main`. Never forced, no rebase, no data restore.
  R5 Verdict = push output + a fresh remote read (ls-remote, fetch, ancestry, full bound-path identity, non-data leaves):
     PUBLISHED        X is an ancestor of the remote main, the 9 paths are in the target state, and (forward) the remote
                      main's non-data leaves equal X's.
     PUBLISHED_DRIFT  X is an ancestor, but the bound paths or non-data leaves have changed since. Status is UNVERIFIED.
                      Never retried; it goes to the reviewed recovery decision.
     NOT_PUBLISHED    ONLY on an explicit porcelain non-fast-forward rejection of refs/heads/main, with X not in the remote
                      main and the 9 paths still in the starting state. Only this permits the next attempt.
     UNKNOWN          anything else. STOP, no retry.
Exit codes: 0 PUBLISHED; 2 STOPPED (nothing published); 3 UNKNOWN; 4 PUBLISHED_DRIFT.
Test hook: STAGE1_TEST_PREPUSH_SLEEP (seconds; inert unless set) simulates slow preparation for the deadline regression.
"""
import argparse, datetime as dt, hashlib, json, os, shlex, subprocess, sys, tempfile, time

NOW = lambda: dt.datetime.now(dt.timezone.utc)
class Expired(Exception): pass

def left(deadline):
    s = (deadline - NOW()).total_seconds()
    if s <= 0: raise Expired()
    return s

def run(cmd, deadline, cwd=None, env=None, cap=None):
    t = min(3600 if cap is None else cap, left(deadline))  # never longer than the time left (and at most 1 h per command)
    return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, env=env, timeout=t)

def git(deadline, *a, env=None, check=True):
    r = run(['git', *a], deadline, env=env)
    if check and r.returncode: raise RuntimeError('git ' + ' '.join(a[:2]) + ': ' + r.stderr.strip()[-200:])
    return r

def leaves(deadline, tree):
    out = {}
    for line in git(deadline, 'ls-tree', '-r', '--full-tree', tree).stdout.splitlines():
        meta, path = line.split('\t', 1); mode, _t, sha = meta.split(); out[path] = (mode, sha)
    return out

non_data = lambda lv: {p: v for p, v in lv.items() if not p.startswith('data/')}

def write_tree(deadline, base, updates):
    idx = tempfile.mktemp(); env = dict(os.environ, GIT_INDEX_FILE=idx)
    try:
        git(deadline, 'read-tree', base, env=env)
        for p, v in updates.items():
            if v is None: git(deadline, 'update-index', '--force-remove', '--', p, env=env)
            else: git(deadline, 'update-index', '--add', '--cacheinfo', f'{v[0]},{v[1]},{p}', env=env)
        return git(deadline, 'write-tree', env=env).stdout.strip()
    finally:
        if os.path.exists(idx): os.remove(idx)

def ident(files):  # path -> (before identity or None=absent, after identity)
    return {f: ((v['before']['mode'], v['before']['gitBlobSHA1']) if v.get('before') else None, (v['mode'], v['gitBlobSHA1']))
            for f, v in files.items()}

def state(lv, I):
    s = set()
    for f, (b, a) in I.items():
        cur = lv.get(f)
        s.add('BEFORE' if cur == b else 'AFTER' if cur == a else 'OTHER')
    return s.pop() if len(s) == 1 else 'MIXED'

def remote_main(deadline, remote):
    r = git(deadline, 'ls-remote', remote, 'refs/heads/main', check=False)
    if r.returncode or not r.stdout.strip(): return None
    sha = r.stdout.split()[0]
    return sha if git(deadline, 'fetch', '-q', remote, sha, check=False).returncode == 0 else None

def main():
    ap = argparse.ArgumentParser()
    for k in ('--binding', '--inverse', '--tested', '--deadline'): ap.add_argument(k, required=True)
    ap.add_argument('--mode', choices=['forward', 'inverse'], default='forward'); ap.add_argument('--cap', type=int, default=3)
    ap.add_argument('--remote', default='origin'); ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--suite', default='node --test --test-concurrency=8 test/*.test.mjs')
    a = ap.parse_args()
    files = json.load(open(a.binding))['files']; inv = json.load(open(a.inverse))['restore']
    deadline = dt.datetime.fromisoformat(a.deadline.replace('Z', '+00:00')); I = ident(files)
    assert len(files) == 9 and len(inv) == 9 and {r['path'] for r in inv} == set(files)
    inv_upd = {r['path']: None if r.get('sha') is None else (r['mode'], r['sha']) for r in inv}
    assert all(inv_upd[f] == I[f][0] for f in files), 'inverse file disagrees with binding before-identities'
    start_state, target_state = ('BEFORE', 'AFTER') if a.mode == 'forward' else ('AFTER', 'BEFORE')
    clock = {'firstPushStart': None, 'unresolved': False}  # unresolved: a push started and has no verdict yet
    def log(**k): print(json.dumps({'at': NOW().isoformat(timespec='milliseconds'), 'mode': a.mode, **k}), flush=True)
    try:
        tested_nd = non_data(leaves(deadline, a.tested + '^{tree}'))
        for attempt in range(1, a.cap + 1):
            left(deadline)
            M = remote_main(deadline, a.remote)
            if M is None: log(attempt=attempt, result='STOPPED', why='remote unreadable before attempt'); return 2
            Ml = leaves(deadline, M); st = state(Ml, I)
            if st != start_state: log(attempt=attempt, result='STOPPED', why=f'current main bound state {st}, need {start_state}', main=M); return 2
            if a.mode == 'forward':
                T = write_tree(deadline, M, {f: I[f][1] for f in files}); Xl = leaves(deadline, T)
                gates = {'nonDataEqualsTested': non_data(Xl) == tested_nd,
                         'diffExactly9': sorted(p for p in set(Ml) | set(Xl) if Ml.get(p) != Xl.get(p)) == sorted(files),
                         'bindingIdentities': state(Xl, I) == 'AFTER' and all(
                             hashlib.sha256(subprocess.run(['git', 'cat-file', 'blob', v['gitBlobSHA1']], capture_output=True).stdout).hexdigest() == v['sha256']
                             for v in files.values()),
                         'inverseRestoresParent': write_tree(deadline, T, inv_upd) == git(deadline, 'rev-parse', M + '^{tree}').stdout.strip()}
            else:
                T = write_tree(deadline, M, inv_upd); Xl = leaves(deadline, T)
                gates = {'diffExactly9': sorted(p for p in set(Ml) | set(Xl) if Ml.get(p) != Xl.get(p)) == sorted(files),
                         'allNineBefore': state(Xl, I) == 'BEFORE',
                         'otherLeavesKept': {p: v for p, v in Xl.items() if p not in files} == {p: v for p, v in Ml.items() if p not in files}}
            if not all(gates.values()): log(attempt=attempt, result='STOPPED', why='composition gate failed', main=M, gates=gates); return 2
            msg = 'Stage 1 release: premarket P and recovery floor (source 211cf164, binding afd2a30f)' if a.mode == 'forward' \
                  else 'Stage 1 inverse: restore pre-release 9 paths (binding afd2a30f), newer data and code kept'
            X = git(deadline, 'commit-tree', T, '-p', M, '-m', msg).stdout.strip()
            if a.mode == 'forward':  # (e) fresh suite on THIS candidate
                wt = tempfile.mkdtemp(prefix='stage1-cand-')
                try:
                    git(deadline, 'worktree', 'add', '-q', '--detach', wt, X)
                    r = run(['bash', '-c', a.suite], deadline, cwd=wt)
                    tail = r.stdout[-2000:]
                    tests = next((int(l.split()[-1]) for l in tail.splitlines() if l.startswith('# tests ')), 0)
                    fails = next((int(l.split()[-1]) for l in tail.splitlines() if l.startswith('# fail ')), -1)
                    gates['freshSuite'] = {'rc': r.returncode, 'tests': tests, 'fail': fails}
                    if r.returncode != 0 or fails != 0 or tests == 0:
                        log(attempt=attempt, result='STOPPED', why='fresh suite did not pass on this candidate', main=M, candidate=X, gates=gates); return 2
                finally:
                    subprocess.run(['git', 'worktree', 'remove', '--force', wt], capture_output=True)
            log(attempt=attempt, main=M, candidate=X, tree=T, gates=gates)
            if a.dry_run: log(attempt=attempt, result='DRY_RUN'); return 2
            if os.environ.get('STAGE1_TEST_PREPUSH_SLEEP'): time.sleep(float(os.environ['STAGE1_TEST_PREPUSH_SLEEP']))
            try: budget = min(600, left(deadline))  # R1: immediately before the push starts (at most 10 min)
            except Expired: log(attempt=attempt, result='STOPPED', why='deadline reached during preparation; push not started', candidate=X); return 2
            started = NOW(); clock['firstPushStart'] = clock['firstPushStart'] or started.isoformat(timespec='milliseconds'); clock['unresolved'] = True
            log(attempt=attempt, pushStart=started.isoformat(timespec='milliseconds'), firstPushStart=clock['firstPushStart'], budgetSec=round(budget, 1))
            try:
                push = subprocess.run(shlex.split(os.environ.get('STAGE1_PUSH', 'git push --porcelain')) + [a.remote, f'{X}:refs/heads/main'],
                                      capture_output=True, text=True, timeout=budget)
            except Exception as e:
                push = None; log(attempt=attempt, pushException=type(e).__name__)
            # R5 verdict; the remote read gets its own short budget (it may run after the deadline: read-only)
            rd = NOW() + dt.timedelta(seconds=120)
            M2 = remote_main(rd, a.remote)
            if M2 is None: log(attempt=attempt, result='UNKNOWN', why='remote unreadable after push', firstPushStart=clock['firstPushStart']); return 3
            has_x = git(rd, 'merge-base', '--is-ancestor', X, M2, check=False).returncode == 0
            M2l = leaves(rd, M2); st2 = state(M2l, I)
            refline = next((l for l in (push.stdout if push else '').splitlines() if ':refs/heads/main' in l), '')
            nff = push is not None and push.returncode != 0 and refline.startswith('!') and '[rejected]' in refline \
                  and ('non-fast-forward' in refline or 'fetch first' in refline)
            same_nd = (non_data(M2l) == non_data(Xl)) if a.mode == 'forward' else True
            if has_x and st2 == target_state and same_nd: verdict, code = 'PUBLISHED', 0
            elif has_x: verdict, code = 'PUBLISHED_DRIFT', 4
            elif nff and st2 == start_state: verdict, code = 'NOT_PUBLISHED', None
            else: verdict, code = 'UNKNOWN', 3
            log(attempt=attempt, result=verdict, remoteMain=M2, containsCandidate=has_x, boundState=st2, nonDataUnchanged=same_nd,
                pushRc=None if push is None else push.returncode, pushRef=refline[-200:], firstPushStart=clock['firstPushStart'])
            if code is not None: return code
            clock['unresolved'] = False  # NOT_PUBLISHED proven for this attempt
        log(result='STOPPED', why=f'attempt cap {a.cap} reached; nothing published', firstPushStart=clock['firstPushStart']); return 2
    except Expired:
        log(result='STOPPED' if not clock['unresolved'] else 'UNKNOWN', why='deadline reached', firstPushStart=clock['firstPushStart'])
        return 2 if not clock['unresolved'] else 3
    except subprocess.TimeoutExpired:
        log(result='STOPPED' if not clock['unresolved'] else 'UNKNOWN', why='command exceeded remaining budget', firstPushStart=clock['firstPushStart'])
        return 2 if not clock['unresolved'] else 3

if __name__ == '__main__':
    sys.exit(main())
