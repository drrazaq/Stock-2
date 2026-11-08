#!/usr/bin/env bash
# The bot loop's save (bot.yml sources this file; it was inline there). R1 rev3, review only.
#  - stages data/, refuses T1 plaintext (sealed_guard), commits;
#  - publishes ANY unpublished local commit, not only a new one: before rev3 a push refused or lost in a conflict left the commit behind,
#    and the next save returned early because nothing new was staged, so a recorded owner change could stay unpublished indefinitely;
#  - pull/rebase uses the sealed merge driver (the owner's options record merges by key and a real clash is refused, never dropped),
#    then sealed_push_guard checks the exact tree before the push;
#  - when a save cannot be published, the change stays in the local commit and is retried at every later save; it is ALSO pushed to
#    a recovery branch (sealed_recovery_push, rev4) so it survives the end of this runner; the owner is told ONCE per run:
#    SAVE NOT CONFIRMED. bot_recover (rev4) merges every recovery branch, from any workflow, back into main.
source "$(dirname "${BASH_SOURCE[0]}")/sealed-git.sh"
BOT_SAVE_WARNED="${RUNNER_TEMP:-/tmp}/bot-save-warned-$$"
bot_save_warn() {
  [ -f "$BOT_SAVE_WARNED" ] && return 0; : > "$BOT_SAVE_WARNED"
  local base="https://api.telegram.org"; case "${TG_BASE:-}" in http://127.0.0.1:*|http://localhost:*) base="$TG_BASE" ;; esac
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] && curl -s -o /dev/null --max-time 20 --data-urlencode "chat_id=$TG_CHAT" \
    --data-urlencode "text=SAVE NOT CONFIRMED: a change the bot recorded (for example an option trade) is not yet saved to your records. It is kept and retried every few minutes. If you see this again, send it to Claude." \
    "$base/bot$TG_TOKEN/sendMessage" || true
}
save() {
  git add data
  sealed_guard || { git reset -q; echo "Error: refusing to publish T1 provider data in plaintext (save skipped; the bot keeps answering)" | tee -a run.log; return 0; }
  git diff --cached --quiet || git commit -q -m "bot $(date -u +%FT%RZ)"
  [ -n "$(git rev-list origin/main..HEAD 2>/dev/null)" ] || return 0   # nothing unpublished
  local i; for i in 1 2 3 4 5; do
    if git pull -q --rebase -X theirs && sealed_push_guard && git push -q; then rm -f "$BOT_SAVE_WARNED"; return 0; fi
    git rebase --abort 2>/dev/null || true; sleep "${BOT_SAVE_SLEEP:-5}"
  done
  echo "Error: could not save the data folder to the repository (kept in the local commit; retried at the next save)" | tee -a run.log
  sealed_recovery_push 2>&1 | tee -a run.log
  bot_save_warn
}
bot_recover() {
  local rc=0; sealed_recover >> run.log 2>&1 || rc=$?
  case $rc in 0) ;; 2) echo "Error: save recovery state UNKNOWN (the recovery branches could not be listed); nothing assumed merged" >> run.log; bot_save_warn ;;
    *) echo "Error: a save-recovery branch could not be merged yet (kept for the next pass)" >> run.log; bot_save_warn ;; esac
}
