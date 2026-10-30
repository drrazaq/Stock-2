# Scanner shared-save failure barriers

A failed git add/commit could be followed by a successful push of an unchanged branch and report success despite unsaved data. Separately, pull() returned !in_rebase after a transport/auth failure, so a failed pull without a rebase could fall through to push. Explicit stage/commit exit checks and an active-rebase requirement after failed pull close these paths. Temporary merge files are removed on exit, including early failure.

The four previously verified owner-hunk/conflict controls remain unchanged. Two new disposable-local-Git fault contracts use a refused commit hook and a pull transport wrapper; repaired6/6 pass, original4 pass/2 fail. Failed state/commits are retained locally; remote remains unchanged on these failure fixtures. No external remote, production data, owner secret or workflow dispatch is used.

This does not claim every save helper/workflow is fixed. The inherited conflict policy still chooses the job's conflicting hunk for non-owner data, including potential research artifacts, and other lab workflows retain -X theirs. That broader ACTIONS04/frozen-output conflict audit remains OPEN; preserving the prior S1 fix is not certification of all paths. Changes are development-branch only, not deployed scanner behavior.
