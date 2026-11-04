"""Run only in a disposable reviewed r2 source checkout. No real credentials/data."""
import os
import pathlib
import subprocess

root = pathlib.Path.cwd()
original = (root / 'test/watcher-resilience.test.mjs').read_text()
scenarios = "['moved','competing','refusal-retry','interrupted','uncertain','clear-rejection','finish-refusal','missing-snapshot']"
assert original.count(scenarios) == 1
assert original.count('t:fixtureNow()*1e6') == 1
probe = original.replace(scenarios, "['moved']").replace('t:fixtureNow()*1e6', 't:(fixtureNow()+30000)*1e6').replace('STOP LEVEL REACHED', 'STOP CHECK UNKNOWN')
target = root / 'test/independent-stop-future.actual.test.mjs'
with target.open('x') as stream:
    stream.write(probe)
try:
    result = subprocess.run([os.environ.get('NODE', 'node'), '--test', str(target)], env={**os.environ, 'INCIDENT_WATCHER_SRC': str(root / 'ignition-watch.mjs')})
finally:
    target.unlink()
raise SystemExit(result.returncode)
