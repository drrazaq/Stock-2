# Focused confirmation: ACTIONS maintenance procedure r2 (Codex 873fd2bb)

**Reviewer:** the Claude review session, 3 Nov 2026. Read-only. No scheduling or production action. The nine-file patch is unchanged.

**Verdict: NOT YET PASS. Two precise defects: D1 and D2.** C1–C4 are correctly incorporated.

## Verified

- **Hashes:** all 5 procedure files match `maintenance-approval-manifest.json`. The 3 frozen production artifacts match:
  - `a9560969…0981a53` (patch)
  - `545e1a77…a67cd2b` (manifest)
  - `4e28ee37…d6c91c9` (rollback)
- **C1, turn-ending communication** (§3): the r5.5 §14 rules are reused, with the code words, REQ-D/REQ-E tracking, the late-click re-verification, the 20/10-minute silence rule and status at least every 15 minutes.
- **C2, operator capability** (§2): API readbacks are primary and the owner's are supplementary. Claude cancels only the one approved P. The owner makes 2 clicks, on `bot.yml` only.
- **C3, scanner** (§4): `main.yml` stays enabled. A fresh writer check runs before every push. A new scanner run blocks the push and is never cancelled.
- **C4, baseline-relative CI** (§8): the red badge is neither success nor regression on its own.
  - Checked on Tests run 41605568600, job 125814418123: the only `##[error]test file failed` is inside `##[group]test/try-small-audit.test.mjs`, with cases 1 and 3b. `Process completed with exit code 1` is the consequence, not another failure.
  - Codex's figure of 129 PASS lines could not be fully re-counted; see D2.

## D1: the no-change save rule blocks the normal case

§6 accepts a no-change final save only with "positive run-local evidence", and says a quiet log cannot provide it. In practice no-change is the normal final save: today main has one `bot …` commit between 07:50 and about 10:40 UTC. Under §6 as written, almost every attempt therefore ends `BLOCKED`.

Positive evidence already exists without any instrumentation:

1. The bot step runs as `bash --noprofile --norc -e -o pipefail`. This is shown in the authentic log of bot job 125684790153.
   - A failed `git add` or `git commit` exits the step with an error, so the job is not SUCCESS.
   - A failed pull or push is loud: git writes `fatal:`/`error:` to the job log, and save then writes `Error: could not save…`.
   - Scan and mirror output go to run.log, not the job log.
2. The success path is silent. That complete job log (196 lines, under the 5,000-line read cap) has **zero lines** between the echoed script's `##[endgroup]` and `Post job cleanup`.
3. Offline proof (`savechk`, bash `-e -o pipefail`, the same `save()`):

   | Case | Exit | Output lines | Unpushed commits |
   |---|---|---|---|
   | Changed data, pushed | 0 | 0 | 0 |
   | No-change after that | 0 | 0 | 0 |
   | Refused push | 0 | 11 (includes the Error line) | 1 |
   | Later no-change save | 0 | 0 | 1 (stale, but caught by the earlier lines) |
   | Commit failure | 1 | — | — |

**Required replacement for the §6 no-change branch.** Accept it when all of the following hold:

- (a) J is SUCCESS with the main step SUCCESS.
- (b) J's complete job log has been retrieved, its line count is below the read cap, and it ends with `Post job cleanup`.
- (c) The echoed script and shell line match the reviewed `save()`, the loop and `-e -o pipefail` byte for byte.
- (d) There are **zero executed output lines** during the loop step, over the whole run and not only the final save. That means no `Error: could not save`, `fatal:`, `error:`, `rejected` or other output.
- (e) J's checkout SHA and every `bot …` commit it made are ancestors of fresh main.

Under (a)–(e), every save either pushed or found nothing to commit while HEAD was in main's history. So the final local data, including `data/tg-state.json`, equals a persisted state on main.

Any executed output line, a truncated log or a mismatch means `BLOCKED`, as written. Nothing is added to production.

## D2: Claude cannot read a complete hosted Tests log

- `get_job_logs` returns at most the last 5,000 lines. For job 125814418123 the returned log started at 08:45:32, after the job started at 08:44:50, and covered 81 of 130 test files.
- The full ZIP (`logs_url`) is refused by this container's proxy (HTTP 403).
- `get_check_run` returns no annotations.

§2 and §8 ("complete ordinary job logs") are therefore not achievable by the designated operator. A tail-only read could miss an extra hosted failure in the first ~49 files.

**Pick one fix:**

- **(i)** Codex, read-only and not as an operator, posts the full-log verdict for D's Tests run (and the parent's) to PR1 within the push turn. The procedure states that when it is missing, the result is UNVERIFIED rather than V1.
- **(ii)** The release gate becomes the operator's local full suite on the exact D and parent bytes (Node 20, `node "$f"`), plus the hosted tail check: the try-small group with only cases 1/3b, exactly one `test file failed` annotation in the tail, and the job completed. The procedure must disclose that hosted coverage of the earlier files is not independently read.

I recommend (i), with (ii) as the declared fallback.

The bot job log is about 200 lines, so D1's evidence is fully within capability.
