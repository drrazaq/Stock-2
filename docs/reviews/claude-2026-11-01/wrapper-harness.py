# Independent check of the proposed workflow's literal Python (reviewer: Claude). Extracts the wrapper (step "Protected diagnostic only")
# and finalizer (step "Validate final result independently") heredocs from the .proposed workflow and runs them on crafted inputs.
# Usage: python3 -I wrapper-harness.py <path to sip-access-diagnostic.workflow.yml.proposed>
import os, re, subprocess, sys, tempfile, pathlib, json
wf = pathlib.Path(sys.argv[1]).read_text()
blocks = re.findall(r"python3 - <<'PY'\n(.*?)\n\s*PY\n", wf, re.S)
def dedent(b):
    lines = b.split('\n'); ind = min(len(l) - len(l.lstrip()) for l in lines if l.strip()); return '\n'.join(l[ind:] for l in lines)
wrapper = next(dedent(b) for b in blocks if "SIP_RAW_EXIT" in b)
final = next(dedent(b) for b in blocks if "SIP_WRAPPER_OUTCOME" in b)
def run(code, files, env):
    d = tempfile.mkdtemp()
    for n, v in files.items():
        pathlib.Path(d, n).write_bytes(v if isinstance(v, bytes) else v.encode())
    r = subprocess.run([sys.executable, '-I', '-c', code], env={'PATH': os.environ['PATH'], 'RUNNER_TEMP': d, **env}, capture_output=True, text=True)
    out = {n: pathlib.Path(d, n).read_text() for n in ('sip-access.code', 'sip-access.exit') if pathlib.Path(d, n).exists()}
    return r.returncode, r.stdout.strip(), out
cases = []
for raw, rc in [('PASS\n', '0'), ('PASS\n', '1'), ('PASS\n', '124'), ('PASS\n', '137'), ('ERROR_HTTP_403\n', '1'), ('ERROR_HTTP_403\n', '2'), ('BLOCKED_START_TOO_LATE\n', '2'),
                ('NOT_A_CODE\n', '1'), ('PASS\nextra', '0'), ('pass\n', '0'), ('', '0'), ('ERROR_TIMEOUT\n', '143'), ('X' * 200, '1')]:
    ec, out, files = run(wrapper, {'sip-access.raw': raw}, {'SIP_RAW_EXIT': rc})
    cases.append({'step': 'wrapper', 'raw': raw[:24], 'rc': rc, 'exit': ec, 'printed': out, 'written': files})
ec, out, files = run(wrapper, {}, {'SIP_RAW_EXIT': '0'}); cases.append({'step': 'wrapper', 'raw': '(missing file)', 'rc': '0', 'exit': ec, 'printed': out, 'written': files})
for code, ex, outcome in [('PASS\n', '0\n', 'success'), ('PASS\n', '0\n', 'failure'), ('ERROR_HTTP_429\n', '1\n', 'failure'), ('ERROR_HTTP_429\n', '1\n', 'success'),
                          ('BLOCKED_SOURCE\n', '2\n', 'skipped'), ('PASS\n', '2\n', 'failure'), ('BLOCKED_SOURCE\n', '2\n', 'weird'), (None, None, 'skipped')]:
    files = {} if code is None else {'sip-access.code': code, 'sip-access.exit': ex}
    ec, out, _ = run(final, files, {'SIP_WRAPPER_OUTCOME': outcome})
    cases.append({'step': 'finalizer', 'code': (code or '(none)').strip(), 'exitFile': (ex or '(none)').strip(), 'outcome': outcome, 'exit': ec, 'printed': out})
print(json.dumps(cases, indent=0))
