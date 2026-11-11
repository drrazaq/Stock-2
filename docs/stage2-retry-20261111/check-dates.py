"""Validate the ONE proposed calendar's arithmetic, not future attendance."""
import datetime as d,json
from pathlib import Path
UTC=d.timezone.utc;K=d.timezone(d.timedelta(hours=3))
def t(day,time):return d.datetime.fromisoformat('2026-11-'+day+'T'+time+':00+00:00')
A=t('13','09:00');Pmax=t('13','09:20');Dmax=t('13','10:15');rec=t('13','11:40');lateA=t('13','11:00');lateAr=t('13','11:55');endA=t('13','12:00')
B=t('14','05:30');Bend=t('14','06:30');DA=t('14','06:45');pub=t('14','07:15');receipt=t('14','08:10');late=t('14','07:30');later=t('14','08:25');end=t('14','08:30');writer=t('14','08:37')
assert A.weekday()==4 and B.weekday()==5
assert Pmax==A+d.timedelta(minutes=20) and Dmax==Pmax+d.timedelta(minutes=55) and rec==Dmax+d.timedelta(minutes=85)
assert lateAr==lateA+d.timedelta(minutes=55) and lateAr<endA<t('13','12:45')-d.timedelta(minutes=30)
assert receipt==DA+d.timedelta(minutes=85) and pub==DA+d.timedelta(minutes=30)
assert later==late+d.timedelta(minutes=55) and receipt<later<end<writer
for p in [A,Pmax]:assert DA<=p+d.timedelta(hours=22,minutes=35) and later<=p+d.timedelta(hours=24)
assert Bend-B==d.timedelta(minutes=60) and Bend<DA and Bend-t('13','13:10')<d.timedelta(hours=20)
assert t('17','06:30')-t('16','13:10')<d.timedelta(hours=20)
assert t('16','13:10').weekday()==0 and t('17','05:30').weekday()==1
rows={k:{'UTC':v.isoformat(),'Kuwait':v.astimezone(K).isoformat()} for k,v in locals().copy().items() if isinstance(v,d.datetime)}
Path(__file__).with_name('dates.json').write_text(json.dumps({'status':'ARITHMETIC_PASS_NOT_ATTENDANCE','noFallbackDate':True,'SaturdayResearcherMarginAfterSessionMinutes':7,'SaturdayResearcherMarginAfterLateReceiptMinutes':12,'appointments':rows},indent=2)+'\n')
print('Fixed Friday/Saturday and conditional restoration arithmetic PASS; no availability inferred.')
