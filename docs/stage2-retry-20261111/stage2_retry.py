#!/usr/bin/env python3
"""Stage2 bounded publication / inverse, adapted from unchanged Stage1 A4rev4 a76f315f.

Binding roles: every declared file is BOUND; only writePaths change; dependencyPaths
must be unchanged. Inverse entries must equal writePaths and their before identities.
All sizes are derived from the pinned binding/inverse, not hardcoded to Stage1 nine.
Every attempt retains A4's fresh parent, exact nondata compatibility, identities,
forward full-suite and inverse exact-parent restoration, nonforce porcelain/ancestry
proofs, cap and UNKNOWN/late/drift handling. No census/attendance is automated. Each actual push requires a fresh, candidate-specific
operator admission naming the census/writer/verifier receipts; missing admission stops.

--deadline is the ORIGINAL approved cutoff. In inverse mode --decision is ORIGINAL D
and --deadline must be <=D+30. Normally no write can start after --deadline.
Explicit C3 LATE invocation additionally requires --late-cutoff and --receipt-cutoff
(pinned approved calendar values). It may start only after ORIGINAL cutoff expired,
requires a complete55minute hosted allowance after late cutoff, retains D+85 as the
original receipt obligation, and ALWAYS returns PUBLISHED_LATE/UNVERIFIED if published.
This is not an extension or on-time PASS. No automatic late-mode fallback or restart.
At most3 attempts TOTAL per mode; any prior attempts must be deducted from --cap by
the sole operator, who must retain receipts; restarting never renews authorization.
Production invocations MUST leave STAGE2_PUSH/STAGE2_TEST_PREPUSH_SLEEP/STAGE2_TEST_ADMIT unset and use
the default full suite. Hooks exist solely for local-bare offline rehearsal.
No source/production change, workflow action or execution is authorized by this file.
"""
import argparse, datetime as dt, hashlib, json, os, shlex, subprocess, sys, tempfile, time, select

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

def blob_ok(deadline, v):  # bounded; checks SHA-256 AND byte length
    b = subprocess.run(['git', 'cat-file', 'blob', v['gitBlobSHA1']], capture_output=True, timeout=min(3600, left(deadline))).stdout
    return hashlib.sha256(b).hexdigest() == v['sha256'] and len(b) == v['bytes']

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

def read_admission(deadline):
    # A ready pipe can contain only a partial line. Bound every subsequent read;
    # readline() alone could wait indefinitely for the missing newline.
    buf = bytearray(); fd = sys.stdin.fileno()
    while True:
        ready, _, _ = select.select([fd], [], [], left(deadline))
        if not ready: raise Expired()
        chunk = os.read(fd, 4096 - len(buf))
        if not chunk: return buf.decode('utf-8', errors='replace').strip()
        buf.extend(chunk)
        if b'\n' in buf: return buf.split(b'\n', 1)[0].decode('utf-8', errors='replace').strip()
        if len(buf) >= 4096: raise RuntimeError('admission exceeds4096bytes without newline')

def main():
    ap = argparse.ArgumentParser()
    for k in ('--binding', '--inverse', '--tested', '--deadline'): ap.add_argument(k, required=True)
    ap.add_argument('--mode', choices=['forward', 'inverse'], default='forward'); ap.add_argument('--cap', type=int, default=3)
    ap.add_argument('--remote', default='origin'); ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--decision', help='inverse mode: the ORIGINAL qualifying decision time D (ISO UTC); --deadline must be <= D+30 min')
    ap.add_argument('--suite', default='node --test --test-concurrency=8 test/*.test.mjs')
    ap.add_argument('--late-cutoff', help='inverse ONLY: exact separately approved LATE publication cutoff')
    ap.add_argument('--receipt-cutoff', help='inverse ONLY: exact approved LATE hosted receipt cutoff; >= late-cutoff+55min')
    a = ap.parse_args()
    binding = json.load(open(a.binding)); files = binding['files']; inv = json.load(open(a.inverse))['restore']
    def require(ok, message):
        if not ok: ap.error(message)
    def utc(value):
        t = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(t.tzinfo is not None and t.utcoffset() == dt.timedelta(0), 'timestamps must include UTC offset')
        return t
    original_deadline = utc(a.deadline); deadline = original_deadline
    require(1 <= a.cap <= 3, '--cap must be between1 and3; no mode restart to renew total')
    writes = binding['writePaths']; deps = binding['dependencyPaths']; bound = set(files)
    require(len(writes) == len(set(writes)) and len(deps) == len(set(deps)), 'duplicate binding role')
    require(set(writes).isdisjoint(deps) and set(writes)|set(deps) == bound, 'write/dependency roles must partition bound paths')
    require(binding['totalBoundPaths'] == len(files) and len(writes)>0 and len(inv)==len(writes), 'binding/inverse cardinality mismatch')
    require(len({r['path'] for r in inv})==len(inv) and {r['path'] for r in inv}==set(writes), 'inverse paths must exactly match writePaths')
    all_I = ident(files); I = {f:all_I[f] for f in writes}
    require(all(b!=a0 for b,a0 in I.values()), 'writePaths must change identity')
    require(all(all_I[f][0]==all_I[f][1] for f in deps), 'dependency must be unchanged')
    inv_upd = {r['path']: None if r.get('sha') is None else (r['mode'], r['sha']) for r in inv}
    require(all(inv_upd[f] == I[f][0] for f in writes), 'inverse disagrees with binding before-identities')
    original_receipt = None; late_mode = bool(a.late_cutoff or a.receipt_cutoff)
    require(a.mode == 'inverse' or not late_mode, 'LATE recovery is inverse-only')
    if a.mode == 'inverse':
        require(bool(a.decision), '--decision originalD is required in inverse mode')
        D0 = utc(a.decision)
        require(D0 <= NOW(), 'original decision must not be in the future')
        require(original_deadline <= D0 + dt.timedelta(minutes=30), '--deadline exceeds originalD+30')
        original_receipt = D0 + dt.timedelta(minutes=85)
        if late_mode:
            require(bool(a.late_cutoff and a.receipt_cutoff), 'LATE recovery needs BOTH pinned cutoff arguments')
            deadline = utc(a.late_cutoff); late_receipt = utc(a.receipt_cutoff)
            require(NOW() > original_deadline, 'LATE invocation cannot start before original deadline expired')
            require(deadline > original_deadline, 'late cutoff must follow original cutoff')
            require(late_receipt >= deadline + dt.timedelta(minutes=55), 'LATE receipt allowance less than55min')
    def dependencies_ok(lv):
        return all(lv.get(f)==all_I[f][1] for f in deps)
    start_state, target_state = ('BEFORE', 'AFTER') if a.mode == 'forward' else ('AFTER', 'BEFORE')
    clock = {'firstPushStart': None, 'unresolved': False}  # unresolved: a push started and has no verdict yet
    def log(**k): print(json.dumps({'at': NOW().isoformat(timespec='milliseconds'), 'mode': a.mode, 'boundCount':len(files), 'writeCount':len(writes), 'inverseCount':len(inv), 'lateRecovery':late_mode, 'originalPublicationDeadline':original_deadline.isoformat(), 'effectivePublicationCutoff':deadline.isoformat(), 'originalDecision':a.decision, 'originalReceiptDeadline':None if original_receipt is None else original_receipt.isoformat(), 'lateReceiptCutoff':a.receipt_cutoff, **k}), flush=True)
    try:
        tested_nd = non_data(leaves(deadline, a.tested + '^{tree}'))
        for attempt in range(1, a.cap + 1):
            left(deadline)
            M = remote_main(deadline, a.remote)
            if M is None: log(attempt=attempt, result='STOPPED', why='remote unreadable before attempt'); return 2
            Ml = leaves(deadline, M); st = state(Ml, I)
            if st != start_state or not dependencies_ok(Ml): log(attempt=attempt, result='STOPPED', why=f'current main bound state {st}, need {start_state}', main=M); return 2
            if a.mode == 'forward':
                T = write_tree(deadline, M, {f: I[f][1] for f in writes}); Xl = leaves(deadline, T)
                gates = {'nonDataEqualsTested': non_data(Xl) == tested_nd,
                         'diffExactlyWrites': sorted(p for p in set(Ml) | set(Xl) if Ml.get(p) != Xl.get(p)) == sorted(writes),
                         'bindingIdentities': state(Xl, I) == 'AFTER' and dependencies_ok(Xl) and all(blob_ok(deadline, v) for v in files.values()),
                         'inverseRestoresParent': write_tree(deadline, T, inv_upd) == git(deadline, 'rev-parse', M + '^{tree}').stdout.strip()}
            else:
                T = write_tree(deadline, M, inv_upd); Xl = leaves(deadline, T)
                gates = {'diffExactlyWrites': sorted(p for p in set(Ml) | set(Xl) if Ml.get(p) != Xl.get(p)) == sorted(writes),
                         'allWritesBefore': state(Xl, I) == 'BEFORE' and dependencies_ok(Xl),
                         'otherLeavesKept': {p: v for p, v in Xl.items() if p not in writes} == {p: v for p, v in Ml.items() if p not in writes},
                         # compatibility: no newer non-data code beside the release (a new caller of a Stage 1 helper would break)
                         'nonDataCompatibleWithTested': {p: v for p, v in non_data(Ml).items() if p not in writes} ==
                                                        {p: v for p, v in tested_nd.items() if p not in writes}}
            if not all(gates.values()): log(attempt=attempt, result='STOPPED', why='composition gate failed', main=M, gates=gates); return 2
            msg = ('Stage 2 release: reviewed bound/written source '+binding['source'] if a.mode == 'forward'
                   else 'Stage 2 inverse: restore reviewed Stage1 identities; current data/unbound code kept')
            X = git(deadline, 'commit-tree', T, '-p', M, '-m', msg).stdout.strip()
            if a.mode == 'forward':  # (e) fresh suite on THIS candidate
                wt = tempfile.mkdtemp(prefix='stage2-cand-')
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
                    subprocess.run(['git', 'worktree', 'remove', '--force', wt], capture_output=True, timeout=60)  # local cleanup, bounded
            log(attempt=attempt, main=M, candidate=X, tree=T, gates=gates)
            if a.dry_run: log(attempt=attempt, result='DRY_RUN'); return 2
            # C1 applies before EACH physical push, including an internal retry.
            # Existing connector-based evidence is collected by the attended pair,
            # not a fabricated workflow/settings API or unattended callback.
            prompt = f'ADMIT {a.mode} {M} {X} <census-ref> <writer-ref> <verifier-ref>'
            log(attempt=attempt, admissionRequired=prompt)
            if os.environ.get('STAGE2_TEST_ADMIT'):
                local_url = git(deadline, 'remote', 'get-url', a.remote).stdout.strip()
                if not os.path.isabs(local_url) or not os.path.isdir(local_url) or git(deadline, '--git-dir='+local_url, 'rev-parse', '--is-bare-repository').stdout.strip() != 'true':
                    log(attempt=attempt, result='STOPPED', why='offline admission hook requires an absolute local bare remote'); return 2
                admission = f'ADMIT {a.mode} {M} {X} OFFLINE_CENSUS OFFLINE_WRITER OFFLINE_VERIFIER'
            else:
                admission = read_admission(deadline)
            tokens = admission.split()
            if len(tokens)!=7 or tokens[:4]!=['ADMIT',a.mode,M,X]:
                log(attempt=attempt, result='STOPPED', why='missing or mismatched per-push admission; no push started'); return 2
            log(attempt=attempt, admissionAt=NOW().isoformat(timespec='milliseconds'), censusRef=tokens[4], writerRef=tokens[5], verifierRef=tokens[6])
            if os.environ.get('STAGE2_TEST_PREPUSH_SLEEP'): time.sleep(float(os.environ['STAGE2_TEST_PREPUSH_SLEEP']))
            try: budget = min(600, left(deadline))  # R1: immediately before the push starts (at most 10 min)
            except Expired: log(attempt=attempt, result='STOPPED', why='deadline reached during preparation; push not started', candidate=X); return 2
            started = NOW(); clock['firstPushStart'] = clock['firstPushStart'] or started.isoformat(timespec='milliseconds'); clock['unresolved'] = True
            log(attempt=attempt, pushStart=started.isoformat(timespec='milliseconds'), firstPushStart=clock['firstPushStart'], budgetSec=round(budget, 1))
            try:
                push = subprocess.run(shlex.split(os.environ.get('STAGE2_PUSH', 'git push --porcelain')) + [a.remote, f'{X}:refs/heads/main'],
                                      capture_output=True, text=True, timeout=budget)
            except Exception as e:
                push = None; log(attempt=attempt, pushException=type(e).__name__)
            # R5 verdict; the remote read gets its own short budget (it may run after the deadline: read-only)
            rd = NOW() + dt.timedelta(seconds=120)
            M2 = remote_main(rd, a.remote); read_at = NOW()  # remote read: an upper bound on any publication time
            if M2 is None: log(attempt=attempt, result='UNKNOWN', why='remote unreadable after push', firstPushStart=clock['firstPushStart']); return 3
            has_x = git(rd, 'merge-base', '--is-ancestor', X, M2, check=False).returncode == 0
            M2l = leaves(rd, M2); st2 = state(M2l, I)
            refline = next((l for l in (push.stdout if push else '').splitlines() if ':refs/heads/main' in l), '')
            nff = push is not None and push.returncode != 0 and refline.startswith('!') and '[rejected]' in refline \
                  and ('non-fast-forward' in refline or 'fetch first' in refline)
            same_nd = non_data(M2l) == non_data(Xl)  # both modes: no non-data drift since the published commit
            timely = read_at <= original_deadline and not late_mode  # publication is proven timely only if it was observed on the remote before the deadline
            if has_x and st2 == target_state and dependencies_ok(M2l) and same_nd and timely: verdict, code = 'PUBLISHED', 0
            elif has_x and st2 == target_state and dependencies_ok(M2l) and same_nd: verdict, code = 'PUBLISHED_LATE', 5
            elif has_x: verdict, code = 'PUBLISHED_DRIFT', 4
            elif nff and st2 == start_state and dependencies_ok(M2l): verdict, code = 'NOT_PUBLISHED', None
            else: verdict, code = 'UNKNOWN', 3
            log(attempt=attempt, result=verdict, remoteReadAt=read_at.isoformat(timespec='milliseconds'), remoteMain=M2, containsCandidate=has_x, boundState=st2, nonDataUnchanged=same_nd,
                pushRc=None if push is None else push.returncode, pushRef=refline[-200:], firstPushStart=clock['firstPushStart'])
            if code is not None: return code
            clock['unresolved'] = False  # NOT_PUBLISHED proven for this attempt
        log(result='STOPPED', why=f'attempt cap {a.cap} reached; nothing published', firstPushStart=clock['firstPushStart']); return 2
    except Expired:
        log(result='STOPPED' if not clock['unresolved'] else 'UNKNOWN', why='deadline reached', firstPushStart=clock['firstPushStart'])
        return 2 if not clock['unresolved'] else 3
    except (RuntimeError, OSError) as e:
        log(result='UNKNOWN' if clock['unresolved'] else 'STOPPED', why=str(e)[-200:], firstPushStart=clock['firstPushStart'])
        return 3 if clock['unresolved'] else 2
    except subprocess.TimeoutExpired:
        log(result='STOPPED' if not clock['unresolved'] else 'UNKNOWN', why='command exceeded remaining budget', firstPushStart=clock['firstPushStart'])
        return 2 if not clock['unresolved'] else 3

if __name__ == '__main__':
    sys.exit(main())
