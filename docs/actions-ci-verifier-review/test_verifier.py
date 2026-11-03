"""Synthetic parser fixtures only: no GitHub/provider calls or real job execution."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("release_verifier", HERE / "verifier.py")
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)
REFERENCE = HERE.parents[1]
BASE = "9f53fdad27dfd2acfb21c14f293f1bfa18577425"
NAMES = ["test/positive-control.test.mjs", "test/try-small-audit.test.mjs"]


class VerifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="synthetic-ci-verifier-")
        cls.repo = Path(cls.temp.name)
        cls.env = {"PATH": os.defpath, "LANG": "C.UTF-8", "GIT_CONFIG_GLOBAL": "/dev/null",
                   "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0"}
        cls.git("init", "-q", "-b", "main")
        cls.git("config", "user.name", "synthetic")
        cls.git("config", "user.email", "synthetic@example.invalid")
        cls.git("config", "commit.gpgsign", "false")
        workflow = V.git(REFERENCE, "show", BASE + ":.github/workflows/tests.yml")
        (cls.repo / ".github/workflows").mkdir(parents=True)
        (cls.repo / ".github/workflows/tests.yml").write_bytes(workflow)
        (cls.repo / "test").mkdir()
        (cls.repo / "data").mkdir()
        (cls.repo / "data/state.json").write_text('{"synthetic":1}\n')
        for name in NAMES:
            (cls.repo / name).write_text("// Synthetic inventory fixture; never executed.\n")
        cls.git("add", ".")
        cls.git("commit", "-qm", "synthetic fixture")
        cls.sha = cls.git("rev-parse", "HEAD")

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def git(cls, *args):
        return subprocess.check_output(["git", "-C", str(cls.repo), *args],
                                       env=cls.env, stderr=subprocess.PIPE).decode().strip()

    def setUp(self):
        self.run = {"id": 1, "head_sha": self.sha, "head_branch": "main", "event": "push",
                    "path": ".github/workflows/tests.yml", "status": "completed",
                    "conclusion": "success", "run_attempt": 1,
                    "repository": {"full_name": "drrazaq/Stock-2"}}
        self.job = {"id": 2, "run_id": 1, "head_sha": self.sha, "name": "test",
                    "status": "completed", "conclusion": "success", "run_attempt": 1,
                    "steps": [{"name": n, "status": "completed", "conclusion": "success"}
                              for n in ["Set up job", "Run actions/checkout@v4",
                                        "Run actions/setup-node@v4", "Run every test file",
                                        "Post Run actions/setup-node@v4",
                                        "Post Run actions/checkout@v4", "Complete job"]]}
        parts = ["Current runner version: 'synthetic'", "[command]/usr/bin/git log -1 --format=%H", self.sha]
        for name in NAMES:
            parts += ["##[group]" + name, "ok 1 - synthetic", "PASS " + name, "##[endgroup]"]
        parts += ["Post job cleanup.", "Cleaning up orphan processes"]
        self.log = ("\n".join(parts) + "\n").encode()

    def assess(self, raw=None):
        return V.assess(self.repo, self.sha, self.run, self.job, self.log if raw is None else raw)

    def unverified(self, raw=None):
        self.assertEqual(self.assess(raw)["status"], "UNVERIFIED")

    def test_valid_control(self):
        r = self.assess()
        self.assertEqual((r["status"], r["required_files"], r["pass_files"]), ("PASS", 2, 2))

    def test_wrong_commit(self):
        self.run["head_sha"] = "0" * 40
        self.unverified()

    def test_wrong_checkout(self):
        self.unverified(self.log.replace(self.sha.encode(), b"0" * 40))

    def test_wrong_repository(self):
        self.run["repository"]["full_name"] = "synthetic/wrong"
        self.unverified()

    def test_development_branch_is_not_production(self):
        self.run["head_branch"] = "Stock2-safety-fixes"
        self.unverified()

    def test_wrong_attempt(self):
        self.job["run_attempt"] = 2
        self.unverified()

    def test_wrong_run(self):
        self.job["run_id"] = 3
        self.unverified()

    def test_invalid_numeric_identity(self):
        run, job = copy.deepcopy(self.run), copy.deepcopy(self.job)
        for field, value in [("id", -1), ("run_attempt", True)]:
            self.run, self.job = copy.deepcopy(run), copy.deepcopy(job)
            self.job[field] = value
            self.unverified()

    def test_job_not_terminal(self):
        self.job["status"] = "in_progress"
        self.unverified()

    def test_missing_final_outcomes_are_unverified(self):
        run, job = copy.deepcopy(self.run), copy.deepcopy(self.job)
        for target in ["run", "job", "step"]:
            self.run, self.job = copy.deepcopy(run), copy.deepcopy(job)
            value = self.run if target == "run" else self.job if target == "job" else self.job["steps"][3]
            value["conclusion"] = None
            self.unverified()

    def test_unknown_final_outcome_is_not_echoed(self):
        self.job["conclusion"] = "SYNTHETIC_UNKNOWN_OUTCOME"
        receipt = self.assess()
        self.assertEqual(receipt["status"], "UNVERIFIED")
        self.assertNotIn("SYNTHETIC_UNKNOWN_OUTCOME", json.dumps(receipt))

    def test_metadata_not_objects(self):
        self.assertEqual(V.assess(self.repo, self.sha, [], [], self.log)["status"], "UNVERIFIED")

    def test_missing_required_step(self):
        self.job["steps"].pop()
        self.unverified()

    def test_skipped_required_step(self):
        self.job["steps"][3]["conclusion"] = "skipped"
        self.unverified()

    def test_malformed_step(self):
        self.job["steps"].append(None)
        self.unverified()

    def test_missing_preamble(self):
        self.unverified(self.log.split(b"\n", 1)[1])

    def test_missing_cleanup(self):
        self.unverified(self.log.split(b"Post job cleanup.")[0])

    def test_partial_file_inventory(self):
        start = self.log.index(b"##[group]" + NAMES[0].encode())
        end = self.log.index(b"##[endgroup]", start) + len(b"##[endgroup]\n")
        self.unverified(self.log[:start] + self.log[end:])

    def test_duplicate_group(self):
        extra = ("##[group]" + NAMES[0] + "\n##[endgroup]\n").encode()
        self.unverified(self.log + extra)

    def test_duplicate_pass(self):
        p = ("PASS " + NAMES[0]).encode()
        self.unverified(self.log.replace(p, p + b"\n" + p))

    def test_missing_pass(self):
        self.unverified(self.log.replace(("PASS " + NAMES[0] + "\n").encode(), b""))

    def test_pass_for_wrong_group(self):
        self.unverified(self.log.replace(("PASS " + NAMES[0]).encode(), ("PASS " + NAMES[1]).encode()))

    def test_error_outside_file(self):
        self.unverified(self.log + b"##[error]test file failed\n")

    def test_legacy_try_small_failure_never_accepted(self):
        self.run["conclusion"] = self.job["conclusion"] = "failure"
        self.job["steps"][3]["conclusion"] = "failure"
        raw = self.log.replace(("PASS " + NAMES[1]).encode(),
                               b"not ok 1 - 1. synthetic\nnot ok 6 - 3b. synthetic\n##[error]test file failed")
        r = self.assess(raw)
        self.assertEqual(r["status"], "FAIL")
        self.assertEqual(r["failing_files"], [NAMES[1]])

    def test_new_failure_never_accepted(self):
        self.run["conclusion"] = self.job["conclusion"] = "failure"
        self.job["steps"][3]["conclusion"] = "failure"
        raw = self.log.replace(("PASS " + NAMES[0]).encode(), b"not ok 1 - new failure\n##[error]test file failed")
        self.assertEqual(self.assess(raw)["status"], "FAIL")

    def test_failed_other_step_is_not_success(self):
        self.job["steps"][4]["conclusion"] = "failure"
        self.job["conclusion"] = self.run["conclusion"] = "failure"
        self.assertEqual(self.assess()["status"], "FAIL")

    def test_optional_post_cache_skip_is_not_a_missing_test(self):
        self.job["steps"][4]["conclusion"] = "skipped"
        self.assertEqual(self.assess()["status"], "PASS")

    def test_failure_diagnostics_not_echoed(self):
        raw = self.log.replace(b"ok 1 - synthetic", b"ok 1 - synthetic\n# DO_NOT_PRINT_SYNTHETIC_VALUE")
        self.assertNotIn("DO_NOT_PRINT_SYNTHETIC_VALUE", json.dumps(self.assess(raw)))

    def test_input_limits_and_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "log"
            p.write_bytes(b"12345")
            with self.assertRaises(V.Unverified):
                V.read_input(p, 4)
            link = Path(directory) / "link"
            link.symlink_to(p)
            with self.assertRaises(OSError):
                V.read_input(link, 10)

    def test_fifo_is_refused_through_cli_without_waiting_for_writer(self):
        with tempfile.TemporaryDirectory() as directory:
            fifo = Path(directory) / "synthetic-fifo"
            os.mkfifo(fifo)
            p = subprocess.run(
                [sys.executable, "-B", str(HERE / "verifier.py"), "--repo", str(self.repo),
                 "--sha", self.sha, "--run", str(fifo), "--job", "unused", "--log", "unused"],
                env=self.env, capture_output=True, text=True, timeout=2,
            )
            self.assertEqual(p.returncode, 2)
            self.assertEqual(json.loads(p.stdout)["status"], "UNVERIFIED")
            self.assertEqual(p.stderr, "")

    def test_reader_does_not_write_git(self):
        before = {str(p): p.read_bytes() for p in (self.repo / ".git").rglob("*") if p.is_file()}
        self.assess()
        V.non_data_tree(self.repo, self.sha)
        after = {str(p): p.read_bytes() for p in (self.repo / ".git").rglob("*") if p.is_file()}
        self.assertEqual(before, after)

    def test_non_data_identity_matches_actual_reference(self):
        self.assertEqual(V.non_data_tree(REFERENCE, BASE), "02c9bcf4fbd19f248cd3e80b18d46676c671fb14")

    def test_non_data_identity_excludes_only_exact_data_root(self):
        original = V.non_data_tree(self.repo, self.sha)
        (self.repo / "data/state.json").write_text('{"synthetic":2}\n')
        self.git("add", "data")
        self.git("commit", "-qm", "synthetic data-only change")
        data = self.git("rev-parse", "HEAD")
        self.assertEqual(original, V.non_data_tree(self.repo, data))
        (self.repo / "data-extra.json").write_text("{}\n")
        self.git("add", "data-extra.json")
        self.git("commit", "-qm", "synthetic non-data prefix")
        self.assertNotEqual(original, V.non_data_tree(self.repo, self.git("rev-parse", "HEAD")))

    def test_non_data_identity_includes_file_modes(self):
        before = V.non_data_tree(self.repo, self.git("rev-parse", "HEAD"))
        (self.repo / NAMES[0]).chmod(0o755)
        self.git("add", NAMES[0])
        self.git("commit", "-qm", "synthetic mode change")
        self.assertNotEqual(before, V.non_data_tree(self.repo, self.git("rev-parse", "HEAD")))

    def test_missing_promised_blob_cannot_start_transport(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "copy"
            shutil.copytree(self.repo, target)
            blob = self.git("rev-parse", self.sha + ":.github/workflows/tests.yml")
            (target / ".git/objects" / blob[:2] / blob[2:]).unlink()
            marker = Path(directory) / "TRANSPORT_WAS_STARTED"
            trap = Path(directory) / "trap.sh"
            trap.write_text("#!/bin/sh\ntouch '" + str(marker) + "'\nexit 1\n")
            trap.chmod(0o700)
            for key, value in [("core.repositoryformatversion", "1"),
                               ("extensions.partialClone", "origin"),
                               ("remote.origin.promisor", "true"),
                               ("remote.origin.url", "ext::" + str(trap)),
                               ("protocol.ext.allow", "always")]:
                subprocess.run(["git", "-C", str(target), "config", key, value],
                               env=self.env, check=True, capture_output=True)
            receipt = V.assess(target, self.sha, self.run, self.job, self.log)
            self.assertEqual(receipt["status"], "UNVERIFIED")
            self.assertFalse(marker.exists())

    def test_unsupported_workflow_not_assumed_equivalent(self):
        (self.repo / ".github/workflows/tests.yml").write_text("# synthetic unsupported\n")
        self.git("add", ".github/workflows/tests.yml")
        self.git("commit", "-qm", "synthetic workflow change")
        changed = self.git("rev-parse", "HEAD")
        run, job = copy.deepcopy(self.run), copy.deepcopy(self.job)
        run["head_sha"] = job["head_sha"] = changed
        self.assertEqual(V.assess(self.repo, changed, run, job, self.log)["reason"], "unsupported_workflow")


if __name__ == "__main__":
    unittest.main()
