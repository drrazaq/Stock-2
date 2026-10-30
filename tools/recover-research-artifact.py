"""Interactive local wrapper: the key is hidden and never supplied in argv."""
import getpass
import os
import pathlib
import subprocess
import sys

if len(sys.argv) != 4:
    raise SystemExit("usage: python3 tools/recover-research-artifact.py ENCRYPTED_DIR NEW_OUTPUT_DIR EXPECTED_SOURCE_SHA")
if not sys.stdin.isatty():
    raise SystemExit("Use a local interactive terminal; never pipe or paste a key into chat or argv.")
secret = getpass.getpass("Research artifact recovery key (hidden, local only): ")
# Offline child needs no inherited credentials, proxy secrets or Node preloads.
# In particular, do not read or forward the legacy PRIVATE_KEY.
env = {name: os.environ[name] for name in
       ("PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR")
       if name in os.environ}
env["RESEARCH_ARTIFACT_KEY"] = secret
script = pathlib.Path(__file__).with_suffix(".mjs")
try:
    raise SystemExit(subprocess.run(["node", str(script), *sys.argv[1:]], env=env).returncode)
finally:
    env.pop("RESEARCH_ARTIFACT_KEY", None)
    secret = None
