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

        def invoke():
            return subprocess.run(
                ["bash", "-euxc", save + "\nsave\n"], cwd=bot,
                env=env, capture_output=True, timeout=15,
            )

        original = git(bot, "rev-parse", "HEAD")
        noop = invoke()
        assert noop.returncode == 0
        assert b"+ git diff --cached --quiet" in noop.stderr
        assert b"+ return 0" in noop.stderr
        assert b"+ git commit" not in noop.stderr
        assert git(bot, "rev-parse", "HEAD") == original
        assert git(remote, "rev-parse", "refs/heads/main") == original
        assert git(bot, "status", "--porcelain", "--", "data") == ""
        results.append({
            "case": "unchanged save", "pass": True,
            "newCommitRequired": False,
            "support": "actual quiet-diff branch trace plus clean data/index and unchanged remote",
        })

        (bot / "data/tg-state.json").write_text('{"offset":2}\n')
        changed = invoke()
        assert changed.returncode == 0
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
    print(json.dumps({
        "status": "PASS", "cases": results,
        "scope": "synthetic offline evidence companion; not production save proof",
        "noChangeCaveat": "A quiet production log alone cannot prove the no-op branch; unavailable supporting evidence blocks deployment.",
    }, indent=2))


if __name__ == "__main__":
    main()
