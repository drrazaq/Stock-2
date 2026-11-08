#!/usr/bin/env python3
"""Offline pure RA-C2 K2/K3 arithmetic; examples are synthetic, not scored evidence."""
from decimal import Decimal as D, ROUND_FLOOR
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CONTRACT=ROOT/'docs/recommendation-audit-20261108/ra-c2/final/contract.json'
def executed_return(entry,exit,view):
    entry,exit=D(str(entry)),D(str(exit))
    if entry<=0 or exit<0: raise ValueError('positive raw entry and nonnegative evidenced exit required')
    slip=D(str(view['entrySlip']));outslip=D(str(view['exitSlip']));friction=D(str(view['friction']))
    gross=exit/entry-1;capped=min(gross,D(3));e=entry*(1+slip);x=entry*(1+capped)*(1-outslip)
    q=int((D(997)/e).to_integral_value(rounding=ROUND_FLOOR));invested=q*e;fees=D(6) if q else D(0)
    net=q*(x-e)-friction*invested-fees
    return {'q':q,'zeroOrder':q==0,'executedSides':2 if q else 0,'rawGross':str(gross),'cappedGross':str(capped),'entryView':str(e),'exitView':str(x),'invested':str(invested),'frictionUSD':str(friction*invested),'feesUSD':str(fees),'netOver1000':str(net/D(1000))}
if __name__=='__main__':
    c=json.loads(CONTRACT.read_text());v={x['id']:x for x in c['mandatoryViews']}
    capped={k:executed_return(100,500,a) for k,a in v.items()}
    assert D(capped['B0']['netOver1000'])==D('2.6868')
    assert D(capped['S2']['netOver1000'])==D('2.596656')
    assert executed_return(990,990,v['B0'])['q']==1
    z=executed_return(990,990,v['S2']);assert z['q']==0 and z['feesUSD']=='0'
    loss=executed_return(100,0,v['S2']);assert D(loss['netOver1000'])==D('-.931344')
    print(json.dumps({'kind':'SYNTHETIC_ARITHMETIC_CONFORMANCE_ONLY','newExternalScores':0,'cappedExample':capped,'perViewZeroOrderExample':z,'evidencedZeroExitExample':loss},indent=2))
