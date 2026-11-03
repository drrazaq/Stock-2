# ACTIONS maintenance: owner approval package (pinned to procedure 97dd460c)

**PACKAGE ONLY.** Nothing is scheduled, no clicks are requested and no production action has been taken.

**Procedure:** `docs/nov2-actions-correction/bounded-maintenance-proposal.md` (r4) at `97dd460cf52f0364c170010b2880680c0cd0070b`, with SHA256 `e7a2d897…` as recorded in `maintenance-approval-manifest.json` at that commit. Claude's PASS for this revision is at `93704749a09694bbc4050f7e0ce4b6cbedb38a19`.

**Release package** (code approval already given, unchanged):

| File | SHA256 |
|---|---|
| `production-standalone.patch` | `a9560969298368490a0b3cbd5b151e429b7d68b2bc302ba35025ccebb0981a53` |
| `standalone-manifest.json` | `545e1a7775f43f6b3b6b8e72c84a6f8e47c8ecde0b560128695ab17f2a67cd2b` |
| `rollback-standalone.patch` | `4e28ee37e58e8f0ea57b3d70a09438562efc12aaa8a5a1e9075df3927c6d91c9` |

## Proposed date and window (a projection; re-derived at readiness)

**Wednesday 4 November 2026, about 08:00–10:15 Kuwait (05:00–07:15 UTC; 00:00–02:15 New York, market closed).**

The current bot run, 41600894879, started its loop at about 13:18 UTC on 3 Nov. Projected natural ends: about 18:48 and 00:18 UTC, then **E ≈ 05:49 UTC (08:49 Kuwait) on 4 Nov**. If readiness shows E outside 05:15–08:00 UTC, or any gate fails, there is no attempt and the date moves.

| Kuwait (approx.) | Step |
|---|---|
| from 08:04 | Claude readiness checks. Codex must be started by the owner and confirm read-only availability. |
| 08:19–08:29 | OPERATOR READY, naming J, P and E. Owner replies **ACK READY** by 08:37. Owner separately approves P's exact ID. |
| 08:34–08:37 | CLICK DISABLE NOW. |
| by 08:41 | Disable verified by API. Otherwise no release. |
| ≈08:49 | J ends naturally. Claude cancels only P, if still never started. |
| by 09:09 | Nine-file release push. No push after this point. |
| ≈09:19 | Codex full-log receipt. All-PASS gives V1; otherwise rollback. |
| ≈09:34 | VERIFIED – CLICK ENABLE NOW. |
| ≈09:35–10:05 | First natural bot restart (cron every 30 min plus GitHub delay). |

## Roles

- **Owner:**
  - Click 1: Disable `bot.yml` on its Actions page.
  - Click 2: Enable `bot.yml`, only after Claude's turn-ending `VERIFIED … CLICK ENABLE NOW`.
  - Also: ACK READY, DONE DISABLE, DONE ENABLE or NOT CLICKED replies; one run-ID approval for P; starting Codex. The scanner (`main.yml`) is not touched.
- **Claude, sole release and rollback operator:** readiness, API verification of workflow states, writer checks, the J save proof, the single P cancellation, the release push, rollback if needed, and the Enable request. All instructions come only in turn-ending messages.
- **Codex, read-only full-log verifier:** reads D's complete hosted Tests log and posts a sanitized receipt. It has no deploy, rollback, cancel or takeover authority.

## Cancellation

Only one run, P:

- a scheduled `bot.yml` run, pending, with zero jobs;
- its exact ID published at readiness and approved by the owner;
- re-read immediately before cancelling;
- confirmed cancelled with zero jobs afterwards.

J and any active or started run are never cancelled. If P has started, there is no release; it finishes naturally and service is restored.

## Abort and restoration

**No release (code unchanged), then verified restoration, if any of these occur:**

- no ACK READY by E−12;
- Disable not verified by E−8;
- P has started, or its cancellation is uncertain;
- J does not end SUCCESS with the five-condition save proof by E+10;
- an unexpected writer appears;
- a pin changes;
- push time passes E+20.

**Rollback** (the exact `rollback-standalone.patch` only, data preserved) if D's complete hosted results are not all PASS, or the Codex receipt is missing, partial or late.

**UNKNOWN push:** no retry and no Enable until the outcome is settled. The bot stays disabled and this is reported plainly.

**Enable is requested only when all of these hold:**

- code verified V0, V1 or V2;
- no UNKNOWN write;
- writer check passes;
- every click reconciled.

Final outcome is one of: `VERIFIED Vx, restored`, `NO ATTEMPT, nothing changed`, or `UNVERIFIED: <exact condition>`.

## Residual risk

- **Planned bot outage:** about 45–75 minutes, from 08:49 to about 09:35–10:05 Kuwait. Not guaranteed.
- **Outage can grow:** GitHub queueing, a late or missing owner reply, missing save or CI evidence, an UNKNOWN push or a new scanner run can extend it. While uncertain, the bot stays disabled.
- **Telegram messages:** commands sent during the gap wait on Telegram and are answered after restart, as long as the gap stays well under about 24 hours, when Telegram may drop them.
- **Nothing else stops:** labs, the scanner and data writers keep running. Market-hours monitoring is unaffected.
- **Silence is not a click:** if contact is lost, Claude may need a message from the owner to resume.

## Approval text (to copy only when you decide)

> I approve the ACTIONS maintenance procedure r4 at 97dd460cf52f0364c170010b2880680c0cd0070b, as confirmed by Claude at 93704749a09694bbc4050f7e0ce4b6cbedb38a19, for the already-approved nine-file release: production patch a9560969298368490a0b3cbd5b151e429b7d68b2bc302ba35025ccebb0981a53, manifest 545e1a7775f43f6b3b6b8e72c84a6f8e47c8ecde0b560128695ab17f2a67cd2b, rollback 4e28ee37e58e8f0ea57b3d70a09438562efc12aaa8a5a1e9075df3927c6d91c9.
>
> Claude is the sole release and rollback operator. Codex is a read-only full-log verifier with no deploy, rollback, cancel or takeover authority. I make only two clicks: Disable bot.yml and, after Claude's verified instruction, Enable bot.yml. The Stock scanner stays enabled.
>
> I confirm an attended session on Wednesday 4 November 2026, about 08:00–10:15 Kuwait, subject to fresh readiness checks. Without them there is no attempt.
>
> Cancellation is limited to one scheduled bot run that has never started, whose exact ID I approve at readiness. No active or started run may be cancelled.
>
> The release requires:
> - D's complete hosted tests all PASS;
> - the five-condition save proof;
> - every data, financial and offset byte preserved;
> - UNKNOWN handling and the abort and verified-restoration rules as written.
>
> Timing targets are conditional, and I accept a planned bot outage of about 45–75 minutes that may be longer.
>
> No watcher or mentor deployment, merge, dispatch, test message, provider call, order, purchase, or secret or permission change.
