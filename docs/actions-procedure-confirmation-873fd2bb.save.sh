save() {
  git add data
  git diff --cached --quiet && return 0
  git commit -q -m "bot x"
  for i in 1 2; do if git pull -q --rebase -X theirs && git push -q; then return 0; fi; git rebase --abort 2>/dev/null || true; done
  echo "Error: could not save the data folder to the repository"
}
