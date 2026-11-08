#!/usr/bin/env bash
# R1 (review only): sourced by every workflow step that commits sealed provider-data files (*.sealed).
#  1. registers the merge driver for *.sealed (.gitattributes), so concurrent saves merge records instead of keeping one side;
#  2. sealed_stage PATH...  stages additions AND deletions (git add -A) for each path that exists or is tracked; staging only the new
#     .sealed name would leave the old plaintext in the commit (Codex R1-C2);
#  3. sealed_guard  refuses the commit when the STAGED change adds or modifies a T1 plaintext path or a temp file, or the driver is missing.
R1_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # the checked-out code that sourced this file
git config merge.sealed.name "R1 sealed provider data"
git config merge.sealed.driver "node '$R1_ROOT/sealed-merge.mjs' %O %A %B %P"
sealed_stage() { local p; for p in "$@"; do if [ -e "$p" ] || [ -n "$(git ls-files -- "$p")" ]; then git add -A -- "$p"; fi; done; }
sealed_guard() { node "$R1_ROOT/sealed-guard.mjs" --staged; }
