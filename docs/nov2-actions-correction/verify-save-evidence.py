#!/usr/bin/env python3
"""Offline companion: actual pinned bot save(), disposable Git, synthetic data only.

Does not run scan.mjs, use credentials, contact GitHub/providers or modify the
supplied checkout. This companion is outside the frozen nine-file patch.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--production-worktree", type=Path, required=True)
    args = parser.parse_args()
    workflow = (args.production_worktree / ".github/workflows/bot.yml").read_bytes()
    assert hashlib.sha256(workflow).hexdigest() == (
        "2a7a8a66bbf03d02d0732cc44f4973cf534cbef9faffe3aa85b13659e0484e40"
    )
    text = workflow.decode()
    start = text.index("          save() {")
    end = text.index("          # privacy migration", start)
    save = "\n".join(line[10:] for line in text[start:end].splitlines())
    env = {
        "PATH": os.defpath,
        "LANG": "C.UTF-8",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_TERMINAL_PROMPT": "0",
    }
    results = []
    with tempfile.TemporaryDirectory(prefix="actions-save-evidence-") as scratch:
        root = Path(scratch)

        def command(cwd, *argv):
            return subprocess.run(
                argv, cwd=cwd, env=env, capture_output=True, check=True,
                timeout=10,
            ).stdout.decode()

        def git(cwd, *argv):
            return command(cwd, "git", *argv).strip()

        seed = root / "seed"
        seed.mkdir()
        git(seed, "init", "-q", "-b", "main")
        git(seed, "config", "user.name", "synthetic")
        git(seed, "config", "user.email", "synthetic@example.invalid")
        git(seed, "config", "commit.gpgsign", "false")
        (seed / "data").mkdir()
        (seed / "data/tg-state.json").write_text('{"offset":1}\n')
        (seed / "data/my-positions.json").write_text("[]\n")
        git(seed, "add", "data")
        git(seed, "commit", "-qm", "synthetic baseline")
        remote = root / "remote.git"
        git(root, "clone", "-q", "--bare", str(seed), str(remote))
        bot = root / "bot"
        git(root, "clone", "-q", str(remote), str(bot))
        git(bot, "config", "user.name", "synthetic")
        git(bot, "config", "user.email", "synthetic@example.invalid")
        git(bot, "config", "commit.gpgsign", "false")

        # Actual production code sleeps between refused pushes. Only the local
        # synthetic sleep command is replaced so refusal testing is fast.
        binpath = root / "bin"
        binpath.mkdir()
        (binpath / "sleep").write_text("#!/bin/sh\nexit 0\n")
        (binpath / "sleep").chmod(0o700)
        env["PATH"] = str(binpath) + ":" + os.defpath

        def invoke(commands="save"):
            return subprocess.run(
                ["bash", "--noprofile", "--norc", "-e", "-o", "pipefail",
                 "-c", save + "\n" + commands + "\n"], cwd=bot,
                env=env, capture_output=True, timeout=15,
            )

        original = git(bot, "rev-parse", "HEAD")
        noop = invoke()
        assert noop.returncode == 0
        assert noop.stdout == noop.stderr == b""
        assert git(bot, "rev-parse", "HEAD") == original
        assert git(remote, "rev-parse", "refs/heads/main") == original
        assert git(bot, "status", "--porcelain", "--", "data") == ""
        results.append({
            "case": "unchanged save", "pass": True,
            "newCommitRequired": False,
            "support": "exact shell/save are silent; test directly verifies clean data/index, unchanged HEAD and persisted remote",
        })

        (bot / "data/tg-state.json").write_text('{"offset":2}\n')
        changed = invoke()
        assert changed.returncode == 0
        assert changed.stdout == changed.stderr == b""
        saved = git(bot, "rev-parse", "HEAD")
        assert saved != original
        assert git(remote, "rev-parse", "refs/heads/main") == saved
        assert git(bot, "status", "--porcelain", "--", "data") == ""
        results.append({
            "case": "changed save", "pass": True,
            "support": "data commit positively present on disposable remote",
        })

        hook = remote / "hooks/pre-receive"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o700)
        (bot / "data/tg-state.json").write_text('{"offset":3}\n')
        refused = invoke()
        assert refused.returncode == 0  # The production hazard being preserved.
        assert b"Error: could not save the data folder to the repository" in refused.stdout
        assert git(remote, "rev-parse", "refs/heads/main") == saved
        assert git(bot, "rev-parse", "HEAD") != saved
        results.append({
            "case": "refused publication", "pass": True,
            "support": "save exits zero but emits error and leaves an unpublished local commit",
            "boundaryDisposition": "BLOCKED",
        })

        later = invoke()
        assert later.returncode == 0
        assert later.stdout == later.stderr == b""
        assert git(bot, "rev-parse", "HEAD") != saved
        assert git(remote, "rev-parse", "refs/heads/main") == saved
        assert refused.stdout + refused.stderr != b""
        results.append({
            "case": "silent no-op after refused push", "pass": True,
            "support": "last call is silent with an unpushed commit; whole-run output/ancestry must reject, not just final-call silence",
            "boundaryDisposition": "BLOCKED",
        })

        # Reset ONLY the disposable synthetic checkout for independent failures.
        hook.unlink()
        git(bot, "reset", "--hard", saved)
        precommit = bot / ".git/hooks/pre-commit"
        precommit.write_text("#!/bin/sh\nexit 1\n")
        precommit.chmod(0o700)
        (bot / "data/tg-state.json").write_text('{"offset":4}\n')
        commit_failed = invoke()
        assert commit_failed.returncode != 0
        assert commit_failed.stdout == commit_failed.stderr == b""
        assert git(remote, "rev-parse", "refs/heads/main") == saved
        results.append({
            "case": "silent commit failure", "pass": True,
            "support": "actual -e shell exits nonzero despite silence; SUCCESS condition is essential",
            "boundaryDisposition": "BLOCKED",
        })
        precommit.unlink()
        git(bot, "reset", "--hard", saved)
        (bot / ".git/index.lock").write_text("synthetic lock\n")
        add_failed = invoke()
        assert add_failed.returncode != 0
        assert add_failed.stderr
        results.append({
            "case": "git add failure", "pass": True,
            "support": "actual -e shell exits nonzero, no commit or push",
            "boundaryDisposition": "BLOCKED",
        })
        (bot / ".git/index.lock").unlink()

        # The real loop deliberately catches/silences its initial pull failure.
        pull_line = next(line.strip() for line in text.splitlines()
                         if "git pull -q --rebase -X theirs 2>/dev/null" in line)
        git(bot, "remote", "set-url", "origin", str(root / "missing.git"))
        pull_failed = invoke(pull_line + "\nsave")
        assert pull_failed.returncode == 0
        assert pull_failed.stdout == pull_failed.stderr == b""
        assert git(bot, "rev-parse", "HEAD") == saved
        assert git(remote, "rev-parse", "refs/heads/main") == saved
        git(bot, "remote", "set-url", "origin", str(remote))
        results.append({
            "case": "caught initial pull failure", "pass": True,
            "support": "silent successful step can miss a refresh while HEAD remains previously persisted; five conditions do not prove freshness",
        })

        # No actual scanner/provider is executed: synthetic node fails into the
        # real caller's redirected run.log and its existing catch branch.
        (binpath / "node").write_text("#!/bin/sh\necho synthetic failure >&2\nexit 1\n")
        (binpath / "node").chmod(0o700)
        for label, needle in [("caught full check", "node scan.mjs >> run.log"),
                              ("caught reply", "BOT_ONLY=1 TG_WAIT=25 node scan.mjs")]:
            line = next(line.strip() for line in text.splitlines() if needle in line)
            caught = invoke(line + "\nsave")
            assert caught.returncode == 0
            assert caught.stdout == caught.stderr == b""
            assert "failed" in (bot / "run.log").read_text()
            assert git(bot, "rev-parse", "HEAD") == saved
            results.append({
                "case": label, "pass": True,
                "support": "real caller catches failure into run.log; silent job output cannot prove command/scan success or intent",
            })
    print(json.dumps({
        "status": "PASS", "cases": results,
        "scope": "synthetic offline evidence companion; not production save proof",
        "noChangeCaveat": "All five conditions support a persisted Git-managed checkpoint, not which save changed data, refresh success, historical command intent or every Telegram command being saved. Silence alone is insufficient.",
    }, indent=2))


if __name__ == "__main__":
    main()
