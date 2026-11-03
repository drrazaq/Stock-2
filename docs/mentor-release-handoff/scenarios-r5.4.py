# Synthetic walk-through of procedure r5.4 rules. Times are minutes relative to E (the running job's estimated end).
RULE = dict(ready_from=-30, ready_to=-20, ack_by=-12, click_from=-15, click_to=-12, cutoff=-8,
            j_end_by=10, push_by=20, ci_window=10, rollback_window=15, enable_target=45,
            max_visible_gap=20, max_turn=15, disable_watch_until=30, enable_resend=10, silence=20, ping=10)
def check(name, ev):
    """ev: list of (t, kind, detail). Returns violations and final state."""
    v=[]; vis=[t for t,k,_ in ev if k=='visible']; push=[t for t,k,_ in ev if k=='push']
    gaps=[b-a for a,b in zip(vis,vis[1:])]
    if gaps and max(gaps)>RULE['max_visible_gap'] and not any(k=='unreachable' for _,k,_ in ev): v.append(f'visible gap {max(gaps)}')
    for t,k,d in ev:
        if k=='push' and d=='D':
            if t>RULE['push_by']: v.append(f'D push at {t} > E+{RULE["push_by"]}')
        if k=='click_request' and not (RULE['click_from']<=t<=RULE['click_to']): v.append(f'click request at {t}')
        if k=='ready' and not (RULE['ready_from']<=t<=RULE['ready_to']): v.append(f'READY at {t}')
        if k=='enable_request' and 'VERIFIED' not in d: v.append('enable without VERIFIED')
        if k=='push' and any(k2=='idle' and t2<=t<=t3 for t2,k2,t3 in [(a,b,c) for a,b,c in ev if b=='idle']): v.append('push while idle')
        if k=='transfer':
            last=max(x for x in vis if x<t); pings=[x for x,kk,_ in ev if kk=='ping' and x<t]
            if not pings or t-last<RULE['silence']+RULE['ping'] or t-max(pings)<RULE['ping']: v.append('early transfer')
    dpush=[t for t,k,d in ev if k=='push' and d=='D']
    for t,k,d in ev:
        if k=='ci_verdict' and dpush and t>dpush[0]+RULE['ci_window'] and d=='pass': v.append('V1 from CI after cutoff')
        if k=='v2' and dpush and t>dpush[0]+RULE['rollback_window'] and 'blocked' not in d: v.append(f'V2 at {t} beyond push+15 without recorded block')
    reqs={}
    for t,k,d in ev:
        if k in('click_request','enable_request'): reqs[k]= 'OPEN'
        if k=='reconciled': reqs[d]='RECONCILED'
    unresolved=[r for r,s in reqs.items() if s=='OPEN']
    final=[d for t,k,d in ev if k=='final'][-1]
    if unresolved and 'UNVERIFIED' not in final: v.append(f'final {final} but open requests {unresolved}')
    print(f'{name:28} violations={v or "none"} | open requests={unresolved or "none"} | final={final}')
S=[
 ('S1 normal success',[(-45,'visible','entry checks'),(-25,'ready',''),(-25,'visible','OPERATOR READY'),(-23,'ack','ACK READY'),(-15,'click_request',''),(-15,'visible','CLICK DISABLE NOW'),
   (-13,'reconciled','click_request'),(-13,'visible','DISABLE CONFIRMED'),(0.3,'visible','J ended; push next'),(2,'push','D'),(5,'ci_verdict','pass'),(6,'enable_request','VERIFIED V1'),(6,'visible','VERIFIED V1 – CLICK ENABLE NOW'),
   (8,'reconciled','enable_request'),(8,'visible','FINAL'),(8,'final','VERIFIED V1, restored')]),
 ('S2 late click after cutoff',[(-25,'ready',''),(-25,'visible','READY'),(-22,'ack',''),(-15,'click_request',''),(-15,'visible','CLICK DISABLE NOW'),(-8,'visible','WINDOW CLOSED – DO NOT CLICK'),
   (-6,'reconciled','click_request'),(-5,'enable_request','VERIFIED V0'),(-5,'visible','VERIFIED V0 – CLICK ENABLE NOW'),(-2,'reconciled','enable_request'),(-2,'visible','FINAL'),(-2,'final','VERIFIED V0, restored, no attempt')]),
 ('S3 missing ACK READY',[(-25,'ready',''),(-25,'visible','READY'),(-12,'visible','NO ATTEMPT – no ACK'),(-12,'final','no attempt; no request issued')]),
 ('S3b DONE DISABLE missing, no click',[(-25,'ready',''),(-25,'visible','READY'),(-20,'ack',''),(-15,'click_request',''),(-15,'visible','CLICK DISABLE NOW'),(-8,'visible','WINDOW CLOSED'),(5,'visible','still active'),(20,'visible','still active'),(30,'visible','monitoring ended'),
   (30,'final','UNVERIFIED: Disable request outstanding; owner must confirm NOT CLICKED')]),
 ('S4 slow CI',[(-25,'ready',''),(-25,'visible','READY'),(-20,'ack',''),(-15,'click_request',''),(-15,'visible','CLICK'),(-12,'reconciled','click_request'),(-12,'visible','CONFIRMED'),(4,'visible','J ended'),(5,'push','D'),(15,'visible_note','CI cutoff, no result -> ABORT B'),
   (16,'push','R'),(18,'v2','ok'),(18,'enable_request','VERIFIED V2'),(18,'visible','VERIFIED V2 – CLICK ENABLE NOW'),(21,'reconciled','enable_request'),(21,'visible','FINAL'),(21,'final','VERIFIED V2, restored')]),
 ('S5 rollback blocked by writer',[(-25,'ready',''),(-25,'visible','READY'),(-20,'ack',''),(-15,'click_request',''),(-15,'visible','CLICK'),(-12,'reconciled','click_request'),(-12,'visible','CONFIRMED'),(4,'visible','J ended'),(5,'push','D'),(8,'ci_verdict','fail'),
   (9,'visible','D APPLIED, CI FAILED, ROLLBACK BLOCKED by scanner run (drain)'),(24,'visible','still blocked'),(31,'push','R'),(33,'v2','after blocked drain'),(33,'enable_request','VERIFIED V2'),(33,'visible','VERIFIED V2 – CLICK ENABLE NOW'),(36,'reconciled','enable_request'),(36,'visible','FINAL'),(36,'final','VERIFIED V2, restored (late: drain)')]),
 ('S6 operator interrupted after D',[(-25,'ready',''),(-25,'visible','READY'),(-20,'ack',''),(-15,'click_request',''),(-15,'visible','CLICK'),(-12,'reconciled','click_request'),(-12,'visible','CONFIRMED'),(3,'visible','J ended; PUSHING D recorded on PR #3'),(5,'push','D'),(6,'unreachable',''),
   (23,'ping',''),(33,'transfer',''),(36,'enable_request','VERIFIED V1 (Codex, CI pass)'),(39,'reconciled','enable_request'),(40,'visible','Codex report'),(40,'final','VERIFIED V1 via Codex, restored')]),
 ('S6b interrupted, lost push',[(-25,'ready',''),(-25,'visible','READY'),(-20,'ack',''),(-15,'click_request',''),(-15,'visible','CLICK'),(-12,'reconciled','click_request'),(-12,'visible','CONFIRMED'),(3,'visible','PUSHING D recorded'),(5,'push','D'),(6,'unreachable',''),
   (23,'ping',''),(33,'transfer',''),(40,'visible','Codex: UNKNOWN write'),(40,'final','UNVERIFIED: write UNKNOWN; bot stays disabled; owner decides')]),
]
for n,e in S: check(n,e)
# cross-deadline consistency
R=RULE; c=[]
c.append(('ACK cutoff leaves click time', R['click_to']<R['cutoff']))
c.append(('D push latest + CI window <= E+30', R['push_by']+R['ci_window']<=30))
c.append(('V2 latest (push_by+rollback) <= enable target', R['push_by']+R['rollback_window']<=R['enable_target']))
c.append(('post-push turn <= max turn', R['rollback_window']<=R['max_turn']))
c.append(('turn cadence below silence trigger', R['max_turn']<R['silence']))
c.append(('disable-confirm(E-8) to J-end check(E+10) gap <= 20', R['j_end_by']-R['cutoff']<=R['max_visible_gap']))
for n,ok in c: print(f'{"PASS" if ok else "FAIL"} {n}')
