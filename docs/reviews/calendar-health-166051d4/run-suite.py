import pathlib,subprocess,sys,json,time,os
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=False);node='/workspace/milestones/nov2-watcher-incident/node20/bin/node';rows=[]
files=sorted(p for p in (root/'test').glob('*.test.mjs') if p.name!='calendar-health-review-regressions.test.mjs')
for p in files:
 t=time.monotonic();r=subprocess.run([node,str(p)],cwd=root,capture_output=True);(out/(p.name+'.log')).write_bytes(r.stdout+r.stderr);rows.append({'file':str(p.relative_to(root)),'exitCode':r.returncode,'seconds':round(time.monotonic()-t,3)});(out/'results.json').write_text(json.dumps(rows,indent=2)+'\n')
summary={'root':str(root),'uid':os.getuid(),'files':len(rows),'passed':sum(r['exitCode']==0 for r in rows),'failed':[r for r in rows if r['exitCode']!=0]};(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary));raise SystemExit(bool(summary['failed']))
