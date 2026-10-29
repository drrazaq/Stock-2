# Repository ownership and research preservation

repository-ownership.json assigns every tracked baseline blob a change-authority policy. The owner retains production/deployment, private-data, activation, secret and frozen-research authority; engineering may repair explicit development-branch source/tests/docs. Individual personal maintainers are not invented; unknown assets require review. This is authority/preservation coverage, not behavioral certification.

All399 baseline production data blobs and all51 frozen study registry blobs are preserved. Owner-file paths come from the existing private-files manifest. Checks read Git path/blob/mode metadata, never owner-data bodies or encryption keys. Protected replacements, deletions, symlink-mode changes, trigger markers, candidate approvals and the Phase A activation file cannot bypass policy by being allowlisted. New source paths require explicit review. Publication orchestration applies the same verifier before committing.

Hosted push fixtures validate every protected branch blob/mode. PR merge fixtures validate frozen studies while allowing unrelated authorized mutable-data updates from current main. Seven regressions cover full baseline policy coverage, actual Git preservation metadata, explicit code changes, owner/frozen/activation faults, deletions/modes, invalid paths/hashes/duplicate entries and unreviewed additions.

Only the repository ownership-map acceptance item may close after verification. Entire-script behavior, workflow semantics, historical source authenticity and production reliability remain separate open checks. No map entry grants live execution, new permission or research promotion.
