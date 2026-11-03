#!/usr/bin/env python3
"""Synthetic walk-through checker for mentor release procedure r5.5 (§14).

Times are minutes relative to E (the running bot job's estimated end). Pure, offline, no production access.
Positive scenarios must produce zero violations; every negative control must produce each of its expected
violation codes. Exit status: 0 only if all of that holds, otherwise 1.
"""
import re, sys

T = dict(ready_from=-30, ready_to=-20, ack_by=-12, click_from=-15, click_to=-12, cutoff=-8,
         j_end_by=10, push_by=20, ci_window=10, rollback_window=15, enable_target=45,
         max_gap=15, push_turn=15, silence=20, ping=10, prep_turn=10)
EXACT = re.compile(r'^VERIFIED (V0|V1|V2)$')                    # exact states only; "UNVERIFIED V0" never matches
FINAL_OK = re.compile(r'^(VERIFIED (V0|V1|V2), restored|NO ATTEMPT, nothing changed|UNVERIFIED: .+)$')

def check(ev):
    v = set()
    req_d = None            # None | 'OPEN' | 'RECONCILED'
    req_e = None
    writes = {}             # name -> 'APPLIED' | 'REJECTED' | 'UNKNOWN'
    push_t = {}             # name -> time
    ci = None; ci_t = None
    block = False; block_recorded = False
    verified = {}           # state -> time of fresh verification
    late_disable = None
    vis = []; unreachable = False; pings = []; t_click = None
    disabled = False; enabled_after = False; enable_t = None
    for t, kind, *a in ev:
        x = a[0] if a else None
        if kind == 'visible':
            vis.append(t)
        elif kind == 'ready' and not (T['ready_from'] <= t <= T['ready_to']):
            v.add('READY_WINDOW')
        elif kind == 'click_request':
            t_click = t; req_d = 'OPEN'
            if not (T['click_from'] <= t <= T['click_to']): v.add('CLICK_WINDOW')
            if not any(k == 'ack' and tt <= t for tt, k, *_ in ev): v.add('CLICK_WITHOUT_ACK')
        elif kind == 'disabled_read':
            disabled = True
            if req_d == 'OPEN': req_d = 'RECONCILED'
            if t > T['cutoff']: late_disable = t
        elif kind == 'not_clicked':
            if req_d == 'OPEN': req_d = 'RECONCILED'
        elif kind == 'push':
            name, outcome = x, a[1]
            if any(s == 'UNKNOWN' for s in writes.values()): v.add('PUSH_WHILE_UNKNOWN')
            if not any(k == 'pushing_record' and aa and aa[0] == name and tt <= t for tt, k, *aa in ev): v.add('PUSH_WITHOUT_RECORD')
            if late_disable is not None: v.add('PUSH_AFTER_LATE_DISABLE')
            if block: v.add('PUSH_WITH_WRITER')
            if name == 'D' and t > T['push_by']: v.add('D_PUSH_LATE')
            writes[name] = outcome; push_t[name] = t
        elif kind == 'resolve':
            name, how = x, a[1]
            if how == 'owner_decision': v.add('OWNER_RESOLVED_UNKNOWN')          # owner cannot resolve a write
            elif how in ('APPLIED', 'REJECTED'): writes[name] = how
        elif kind == 'ci':
            ci, ci_t = x, t
        elif kind == 'writer_block':
            block = x; block_recorded = block_recorded or x
        elif kind == 'verify':
            st = x
            if any(s == 'UNKNOWN' for s in writes.values()): v.add('VERIFY_WHILE_UNKNOWN')
            if st == 'V1':
                if writes.get('D') != 'APPLIED' or ci != 'pass' or ci_t > push_t['D'] + T['ci_window']: v.add('V1_WITHOUT_EVIDENCE')
            if st == 'V2':
                if writes.get('R') != 'APPLIED': v.add('V2_WITHOUT_EVIDENCE')
                if 'D' in push_t and t > push_t['D'] + T['rollback_window'] and not block_recorded: v.add('ROLLBACK_BEYOND_TARGET')
            if st == 'V0' and 'D' in writes and writes['D'] != 'REJECTED': v.add('V0_AFTER_D')
            verified[st] = t
        elif kind == 'enable_request':
            req_e = 'OPEN'; enable_t = t
            m = EXACT.match(x or '')
            if not m: v.add('ENABLE_ON_INEXACT_STATE')
            else:
                st = m.group(1)
                if st not in verified: v.add('ENABLE_WITHOUT_VERIFY')
                if late_disable is not None and verified.get(st, -999) < late_disable: v.add('ENABLE_LATE_CLICK_NOT_REVERIFIED')
            if any(s == 'UNKNOWN' for s in writes.values()): v.add('ENABLE_WHILE_UNKNOWN')
            if req_d == 'OPEN': v.add('ENABLE_WITH_OPEN_REQ_D')
            if block: v.add('ENABLE_WITH_WRITER')
        elif kind == 'active_read':
            if req_e == 'OPEN': req_e = 'RECONCILED'
        elif kind == 'unreachable':
            unreachable = True
        elif kind == 'ping':
            pings.append(t)
        elif kind == 'transfer':
            last = max(vv for vv in vis if vv < t)
            if not pings or pings[-1] - last < T['silence'] or t - pings[-1] < T['ping']: v.add('EARLY_TRANSFER')
        elif kind == 'turn':                       # ('turn', start, end, label)
            start, end = x, a[1]
            if end - start > T['push_turn']: v.add('TURN_TOO_LONG')
        elif kind == 'final':
            if not FINAL_OK.match(x): v.add('FINAL_NOT_EXACT')
            if x.endswith('restored'):
                if req_e != 'RECONCILED': v.add('RESTORED_WITHOUT_ACTIVE_READ')
                if req_d == 'OPEN': v.add('RESTORED_WITH_OPEN_REQ_D')
                if any(s == 'UNKNOWN' for s in writes.values()): v.add('RESTORED_WITH_UNKNOWN')
            if x.startswith('NO ATTEMPT') and (req_d == 'OPEN' or writes): v.add('NO_ATTEMPT_WITH_OPEN_ITEMS')
            if not x.startswith('UNVERIFIED') and req_d == 'OPEN': v.add('OPEN_REQ_D_NOT_REPORTED')
            if not x.startswith('UNVERIFIED') and any(s == 'UNKNOWN' for s in writes.values()): v.add('UNKNOWN_NOT_REPORTED')
    if t_click is not None and not unreachable:
        g = [b - a for a, b in zip([u for u in vis if u >= t_click], [u for u in vis if u >= t_click][1:])]
        if g and max(g) > T['max_gap']: v.add('VISIBLE_GAP')
    return v

def base(click=-15):
    return [(-25, 'ready'), (-25, 'visible'), (-23, 'ack'), (click, 'click_request'), (click, 'visible')]

POS = {
 'S1 normal success': base() + [(-13, 'disabled_read'), (-13, 'visible'), (0.3, 'visible'),
    (1, 'turn', 1, 9), (1, 'pushing_record', 'D'), (2, 'push', 'D', 'APPLIED'), (5, 'ci', 'pass'), (6, 'verify', 'V1'),
    (6, 'enable_request', 'VERIFIED V1'), (6, 'visible'), (8, 'active_read'), (8, 'visible'), (8, 'final', 'VERIFIED V1, restored')],
 'S2 late click, re-verified V0': base() + [(-8, 'visible'), (-6, 'disabled_read'), (-5, 'verify', 'V0'),
    (-5, 'enable_request', 'VERIFIED V0'), (-5, 'visible'), (-2, 'active_read'), (-2, 'visible'), (-2, 'final', 'VERIFIED V0, restored')],
 'S3 missing ACK READY': [(-25, 'ready'), (-25, 'visible'), (-12, 'visible'), (-12, 'final', 'NO ATTEMPT, nothing changed')],
 'S3b no DONE DISABLE, no click': base() + [(-8, 'visible'), (5, 'visible'), (20, 'visible'), (30, 'visible'),
    (30, 'final', 'UNVERIFIED: REQ-D outstanding; owner must reply NOT CLICKED')],
 'S3c no click, owner NOT CLICKED': base() + [(-8, 'visible'), (2, 'not_clicked'), (2, 'visible'), (2, 'final', 'NO ATTEMPT, nothing changed')],
 'S4 slow CI -> rollback': base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (4, 'visible'),
    (5, 'turn', 5, 19), (5, 'pushing_record', 'D'), (5, 'push', 'D', 'APPLIED'), (15, 'pushing_record', 'R'), (16, 'push', 'R', 'APPLIED'),
    (18, 'verify', 'V2'), (18, 'enable_request', 'VERIFIED V2'), (18, 'visible'), (21, 'active_read'), (21, 'visible'), (21, 'final', 'VERIFIED V2, restored')],
 'S5 rollback blocked by writer': base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (4, 'visible'),
    (5, 'turn', 5, 9), (5, 'pushing_record', 'D'), (5, 'push', 'D', 'APPLIED'), (8, 'ci', 'fail'), (9, 'writer_block', True), (9, 'visible'),
    (24, 'visible'), (30, 'writer_block', False), (30, 'turn', 30, 34), (30, 'pushing_record', 'R'), (31, 'push', 'R', 'APPLIED'), (33, 'verify', 'V2'),
    (33, 'enable_request', 'VERIFIED V2'), (33, 'visible'), (36, 'active_read'), (36, 'visible'), (36, 'final', 'VERIFIED V2, restored')],
 'S6 operator lost after D, Codex V1': base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (4, 'pushing_record', 'D'),
    (5, 'push', 'D', 'APPLIED'), (6, 'unreachable'), (7, 'ci', 'pass'), (23, 'ping'), (33, 'transfer'), (34, 'verify', 'V1'),
    (35, 'enable_request', 'VERIFIED V1'), (35, 'visible'), (38, 'active_read'), (38, 'visible'), (38, 'final', 'VERIFIED V1, restored')],
 'S6b lost push response stays UNKNOWN': base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (4, 'pushing_record', 'D'),
    (5, 'push', 'D', 'UNKNOWN'), (6, 'unreachable'), (23, 'ping'), (33, 'transfer'), (40, 'visible'),
    (40, 'final', 'UNVERIFIED: write D UNKNOWN; bot stays disabled; no VERIFIED, no Enable instruction')],
}
NEG = {   # each must raise every listed code
 'N1 Enable on "UNVERIFIED V0"': (base() + [(-6, 'disabled_read'), (-5, 'enable_request', 'UNVERIFIED V0'), (-5, 'visible'), (-2, 'active_read'),
    (-2, 'final', 'VERIFIED V0, restored')], {'ENABLE_ON_INEXACT_STATE'}),
 'N2 Enable while write UNKNOWN': (base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (4, 'pushing_record', 'D'), (5, 'push', 'D', 'UNKNOWN'),
    (6, 'verify', 'V0'), (6, 'enable_request', 'VERIFIED V0'), (6, 'visible'), (8, 'active_read'), (8, 'final', 'VERIFIED V0, restored')],
    {'ENABLE_WHILE_UNKNOWN', 'VERIFY_WHILE_UNKNOWN', 'RESTORED_WITH_UNKNOWN'}),
 'N3 owner decision "resolves" UNKNOWN': (base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (4, 'pushing_record', 'D'), (5, 'push', 'D', 'UNKNOWN'),
    (12, 'resolve', 'D', 'owner_decision'), (12, 'visible'), (12, 'final', 'UNVERIFIED: write D UNKNOWN')], {'OWNER_RESOLVED_UNKNOWN'}),
 'N4 rollback beyond target, no block': (base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (4, 'visible'), (5, 'pushing_record', 'D'),
    (5, 'push', 'D', 'APPLIED'), (8, 'ci', 'fail'), (9, 'visible'), (22, 'pushing_record', 'R'), (23, 'push', 'R', 'APPLIED'), (24, 'verify', 'V2'),
    (24, 'enable_request', 'VERIFIED V2'), (24, 'visible'), (27, 'active_read'), (27, 'final', 'VERIFIED V2, restored')], {'ROLLBACK_BEYOND_TARGET'}),
 'N5 late click, Enable without fresh V0': (base() + [(-8, 'visible'), (-10, 'verify', 'V0'), (-6, 'disabled_read'), (-5, 'enable_request', 'VERIFIED V0'),
    (-5, 'visible'), (-2, 'active_read'), (-2, 'final', 'VERIFIED V0, restored')], {'ENABLE_LATE_CLICK_NOT_REVERIFIED'}),
 'N6 restored with open REQ-D': (base() + [(-8, 'visible'), (2, 'visible'), (2, 'final', 'VERIFIED V0, restored')],
    {'RESTORED_WITHOUT_ACTIVE_READ', 'RESTORED_WITH_OPEN_REQ_D'}),
 'N7 early transfer': (base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (6, 'unreachable'), (12, 'ping'), (20, 'transfer'),
    (30, 'final', 'UNVERIFIED: transfer')], {'EARLY_TRANSFER'}),
 'N8 V1 from CI after cutoff, 16-min gap': (base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (4, 'pushing_record', 'D'), (5, 'push', 'D', 'APPLIED'),
    (19, 'ci', 'pass'), (19, 'verify', 'V1'), (19, 'enable_request', 'VERIFIED V1'), (19, 'visible'), (21, 'active_read'), (21, 'final', 'VERIFIED V1, restored')],
    {'V1_WITHOUT_EVIDENCE', 'VISIBLE_GAP'}),
 'N9 retry while UNKNOWN': (base() + [(-12, 'disabled_read'), (-12, 'visible'), (3, 'visible'), (4, 'pushing_record', 'D'), (5, 'push', 'D', 'UNKNOWN'),
    (7, 'push', 'D', 'APPLIED'), (8, 'visible'), (8, 'final', 'UNVERIFIED: write D UNKNOWN')], {'PUSH_WHILE_UNKNOWN'}),
 'N10 final not an exact state': (base() + [(-8, 'visible'), (2, 'not_clicked'), (2, 'final', 'probably fine')], {'FINAL_NOT_EXACT'}),
}

def main():
    ok = True
    for n, ev in POS.items():
        v = check(ev); ok &= not v
        print(f'POS {n:40} {"PASS" if not v else "FAIL " + str(sorted(v))}')
    for n, (ev, want) in NEG.items():
        v = check(ev); miss = want - v; ok &= not miss
        print(f'NEG {n:40} {"PASS (caught " + ",".join(sorted(want)) + ")" if not miss else "FAIL missing " + str(sorted(miss))}')
    R = T; budget = [
        ('ACK cutoff before click window end', R['ack_by'] >= R['click_to']),
        ('click window ends before disable cutoff', R['click_to'] < R['cutoff']),
        ('prep turn fits J end -> D push', R['j_end_by'] + R['prep_turn'] <= R['push_by']),
        ('D push + CI window <= E+30', R['push_by'] + R['ci_window'] <= 30),
        ('rollback window fits in push turn', R['rollback_window'] <= R['push_turn']),
        ('V2 latest (unblocked) <= Enable target', R['push_by'] + R['rollback_window'] <= R['enable_target']),
        ('push turn below silence trigger', R['push_turn'] < R['silence']),
        ('visible cadence below silence trigger', R['max_gap'] < R['silence']),
    ]
    for n, c in budget:
        ok &= c; print(f'BUDGET {"PASS" if c else "FAIL"} {n}')
    print('OVERALL', 'PASS' if ok else 'FAIL'); sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
