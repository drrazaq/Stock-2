#!/usr/bin/env python3
"""Offline, read-only companion for the exact production Tests job.

It does not fetch/authenticate inputs, approve a release, or write Git/state.
The read-only operator must supply authentic full logs and matching API metadata.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

WORKFLOW_SHA256 = "b07f728230066f568dd8c0f94d64957cfdb016a9004867bfba3bc431ebb92fde"
MAX_LOG_BYTES = 8 * 1024 * 1024
SHA = re.compile(r"[0-9a-f]{40}\Z")
STAMP = re.compile(r"^\ufeff?\d{4}-\d\d-\d\dT\S+Z ")
ANSI = re.compile(r"\x1b\[[0-9;]*m")


class Unverified(Exception):
    pass


def git(repo, *args):
    env = {**os.environ, "GIT_NO_LAZY_FETCH": "1", "GIT_ALLOW_PROTOCOL": "",
           "GIT_TERMINAL_PROMPT": "0"}
    p = subprocess.run(["git", "-C", str(repo), *args], capture_output=True,
                       timeout=10, check=False, env=env)
    if p.returncode:
        raise Unverified("source_unavailable")
    return p.stdout


def commit(repo, sha):
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise Unverified("source_mismatch")
    if git(repo, "cat-file", "-t", sha).strip() != b"commit":
        raise Unverified("source_mismatch")


def non_data_tree(repo, sha):
    """Compute the actual Git root-tree identity without writing an object."""
    commit(repo, sha)
    payload = bytearray()
    for entry in git(repo, "ls-tree", "-z", sha).split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        mode, _, oid = metadata.split(b" ")
        if name == b"data":
            continue
        payload.extend(format(int(mode, 8), "o").encode() + b" " + name + b"\0")
        payload.extend(bytes.fromhex(oid.decode()))
    return hashlib.sha1(b"tree " + str(len(payload)).encode() + b"\0" + payload).hexdigest()


def read_input(path, limit):
    """Bound reads; reject a symlink, growing input or non-regular input."""
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
            raise Unverified("input_limit")
        chunks, size = [], 0
        while True:
            chunk = os.read(fd, min(65536, limit + 1 - size))
            if not chunk:
                break
            chunks.append(chunk)
            size += len(chunk)
            if size > limit:
                raise Unverified("input_limit")
        after = os.fstat(fd)
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise Unverified("input_changed")
        return b"".join(chunks)
    finally:
        os.close(fd)


def assess(repo, sha, run, job, raw):
    """PASS/FAIL/UNVERIFIED is a Tests-job assessment, not release authority."""
    result = {"status": "UNVERIFIED", "reason": "input_unavailable"}
    try:
        commit(repo, sha)
        result["sha"] = sha
        if not isinstance(run, dict) or not isinstance(job, dict):
            raise Unverified("metadata_mismatch")
        if (not isinstance(run.get("repository"), dict)
                or run["repository"].get("full_name") != "drrazaq/Stock-2"):
            raise Unverified("metadata_mismatch")
        if (run.get("head_sha") != sha or job.get("head_sha") != sha
                or run.get("head_branch") != "main" or run.get("event") != "push"
                or run.get("path") != ".github/workflows/tests.yml"
                or job.get("run_id") != run.get("id") or job.get("name") != "test"
                or type(run.get("id")) is not int or type(job.get("id")) is not int
                or type(job.get("run_id")) is not int
                or run["id"] < 1 or job["id"] < 1 or job["run_id"] < 1
                or type(run.get("run_attempt")) is not int or run["run_attempt"] < 1
                or type(job.get("run_attempt")) is not int
                or job.get("run_attempt") != run["run_attempt"]):
            raise Unverified("metadata_mismatch")
        if run.get("status") != "completed" or job.get("status") != "completed":
            raise Unverified("job_incomplete")
        if (not isinstance(job.get("steps"), list) or not job["steps"]
                or any(not isinstance(s, dict) for s in job["steps"])):
            raise Unverified("metadata_mismatch")
        required_steps = {"Set up job", "Run actions/checkout@v4", "Run actions/setup-node@v4",
                          "Run every test file", "Complete job"}
        names = [s.get("name") for s in job["steps"]]
        if any(names.count(name) != 1 for name in required_steps):
            raise Unverified("metadata_mismatch")
        if any(s.get("name") in required_steps and s.get("conclusion") == "skipped"
               for s in job["steps"]):
            raise Unverified("metadata_mismatch")
        if any(s.get("status") != "completed" for s in job["steps"]):
            raise Unverified("job_incomplete")
        known_outcomes = {"success", "failure", "neutral", "cancelled", "skipped",
                          "timed_out", "action_required", "stale", "startup_failure"}
        outcomes = [run.get("conclusion"), job.get("conclusion")]
        outcomes.extend(s.get("conclusion") for s in job["steps"])
        if any(not isinstance(value, str) or value not in known_outcomes for value in outcomes):
            raise Unverified("outcome_unavailable")
        workflow = git(repo, "show", sha + ":.github/workflows/tests.yml")
        if hashlib.sha256(workflow).hexdigest() != WORKFLOW_SHA256:
            raise Unverified("unsupported_workflow")
        expected = {
            p.decode() for p in git(repo, "ls-tree", "-rz", "--name-only", sha, "test").split(b"\0")
            if p.startswith(b"test/") and p.count(b"/") == 1 and p.endswith(b".test.mjs")
        }
        if not expected or not isinstance(raw, bytes) or len(raw) > MAX_LOG_BYTES:
            raise Unverified("input_limit")
        lines = [ANSI.sub("", STAMP.sub("", line)) for line in raw.decode("utf-8").splitlines()]
        if (not lines or not lines[0].startswith("Current runner version:")
                or "Post job cleanup." not in lines or "Cleaning up orphan processes" not in lines):
            raise Unverified("incomplete_log")
        first_file = next((i for i, line in enumerate(lines)
                           if line.startswith("##[group]test/") and line.endswith(".test.mjs")), len(lines))
        checkout = [lines[i + 1] for i, line in enumerate(lines[:first_file - 1])
                    if re.fullmatch(r"\[command\].*/git log -1 --format=%H", line)]
        if checkout != [sha]:
            raise Unverified("checkout_unverified")
        stack, groups, passed, failures = [], [], [], []
        for line in lines:
            if line.startswith("##[group]"):
                group = line[len("##[group]"):]
                stack.append(group)
                if group.startswith("test/") and group.endswith(".test.mjs"):
                    groups.append(group)
            elif line == "##[endgroup]":
                if not stack:
                    raise Unverified("malformed_log")
                stack.pop()
            elif line.startswith("PASS test/"):
                path = line[len("PASS "):]
                if not stack or stack[-1] != path:
                    raise Unverified("malformed_log")
                passed.append(path)
            elif line.startswith("not ok ") or line == "##[error]test file failed":
                if stack and stack[-1] in expected:
                    failures.append(stack[-1])
                else:
                    raise Unverified("malformed_log")
        if (stack or set(groups) != expected or len(groups) != len(expected)
                or len(passed) != len(set(passed)) or not set(passed) <= expected):
            raise Unverified("inventory_mismatch")
        result.update({"run_id": run["id"], "run_attempt": run["run_attempt"], "job_id": job["id"],
                       "log_sha256": hashlib.sha256(raw).hexdigest(),
                       "log_bytes": len(raw), "log_lines": len(lines),
                       "required_files": len(expected), "covered_files": len(groups),
                       "pass_files": len(passed), "failing_files": sorted(set(failures))})
        if (run.get("conclusion") != "success" or job.get("conclusion") != "success"
                or any(s.get("conclusion") not in {"success", "skipped"} for s in job["steps"])
                or failures):
            result.update(status="FAIL", reason="hosted_test_failure")
        elif set(passed) != expected:
            raise Unverified("inventory_mismatch")
        else:
            result.update(status="PASS", reason="all_required_files_passed")
    except Unverified as error:
        result.update(status="UNVERIFIED", reason=str(error))
    except (KeyError, ValueError, TypeError, UnicodeError, OSError, subprocess.SubprocessError):
        result.update(status="UNVERIFIED", reason="input_unavailable")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ["repo", "sha", "run", "job", "log"]:
        parser.add_argument("--" + field, required=True)
    args = parser.parse_args()
    try:
        run = json.loads(read_input(args.run, 256 * 1024))
        job = json.loads(read_input(args.job, 256 * 1024))
        receipt = assess(args.repo, args.sha, run, job, read_input(args.log, MAX_LOG_BYTES))
    except (Unverified, OSError, ValueError):
        receipt = {"status": "UNVERIFIED", "reason": "input_unavailable"}
    print(json.dumps(receipt, sort_keys=True))
    return {"PASS": 0, "FAIL": 1, "UNVERIFIED": 2}[receipt["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
