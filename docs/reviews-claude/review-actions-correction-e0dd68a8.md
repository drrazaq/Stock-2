# Review: Codex ACTIONS correction package (`e0dd68a8`)

**Reviewer:** Claude, 2 Nov 2026, read-only and offline. No deployment, provider call or message.
**Scope:** the deployable overlay `docs/nov2-actions-correction/production-after-mentor.patch` (SHA256 `5fc6c316…ccc1`), its inverse `0ca25bac…ef1d` and manifest `11b8382e…68fa`. This is a **separate approval scope** from the mentor release (`1841837e…`) and is **not** bundled into it.

## Verdict: CHANGES REQUESTED (one major, four minor, one procedural)

The six corrections are sound and well tested. **The focus-off restriction is incomplete:** one path (F1) still shows unproven buy ranges and the unqualified LEADERS claim when focus is off.

## Compatibility (verified)

- **Applying the package:**
  - on current main `f4e4d95`: mentor patch, then this overlay, applies cleanly; 8 files, all manifest after-hashes match;
  - the inverse restores the mentor tree exactly;
  - of the mentor's eight files, only `scan.mjs` is touched; `mentor-plan.mjs` and the mentor tests are unchanged.
- **Tests:** main's CI command, Node 20, as root.

  | Tree | Files passing |
  |---|---|
  | main + mentor | 132 / 133 |
  | main + mentor + overlay | 132 / 134 |

  - Both trees fail only `test/try-small-audit` cases 1 and 3b: the same baseline.
  - The new `test/actions-reconciliation.test.mjs` passes 13/13.
  - All four mentor test files pass with the overlay.
  - `test/settings-writes.test.mjs` failed once during the two parallel runs. It passed 3/3 alone on each tree, so it is a load flake, not a regression.
- **P1 (procedural):** the overlay **also applies cleanly to main without the mentor patch**, producing an unreviewed `scan.mjs` (`ef65d40d…`). The order "mentor first" is enforced only by the manifest's before-hash. Any deployment must check `scan.mjs` = `a8641753…` before applying.

## The seven points

| Point | Result |
|---|---|
| SELL timing | **OK.** One header time: next regular open, `K(570)`, New York calendar, so correct across the time change. No 15-minute override. Broker stops kept. Minor F3. |
| Outstanding-SELL reconciliation | **OK.** `priorActs` is captured before `holdingsText` changes `lastAct`. The prior SELL is shown as context, never as a new order or an execution claim. Same-day order is marked unknown. Notices before the current purchase and undated holdings are ignored. Note F5. |
| Missing data → UNKNOWN | **OK.** A failed `reviewReply` no longer silently skips the holding. A leader dip without daily history is UNKNOWN unless a stored exit flag exists. `lastAct` is not overwritten, so an existing SELL stays visible. `reviewReply` returns its verdict and price lines together or not at all, so putting the UNKNOWN check before the stop check loses no stop-hit SELL in practice. Minor F4. |
| Focus-off restrictions | **INCOMPLETE (F1).** `planCands` now applies the per-kind evidence gate whatever the focus setting, `enginePaused` no longer depends on focus, and the "focus off shows them as buys" hint is gone. |
| Qualified research claims | **OK in the RESEARCH line:** the LEADERS frozen verdict comes first; insider buying is labelled a rising-market historical subset with its verdict. **Residual:** F1 and F2. |
| Separate accounting populations | **OK.** The journal and the private cash goal are labelled as different populations, and neither as account return. No exact membership join is claimed. |
| Pending-ZAD summary | **OK.** "no permitted buy; N signal(s) waiting for your ZAD mark (existing next-open window only; no late entries)" plus NOT PROVEN. Nothing is added to the ledger. |
| Historical limits kept | **OK.** No price reconstruction, no backfill. Same-day ordering is marked unknown, and the 30 Oct health warning is dated and not treated as current coverage. |

## Findings

- **F1 (major): focus-off still shows unproven buy ranges.**
  - `actionsText` still adds `opportunitiesText(sig, true)` to SHORT-TERM when focus is off.
  - The board prints "LEADERS [EARLY] (strongest stocks; **provisionally promising on 5 years**): SYM …: **buy lo-hi, stop**" and "QUICK SETUPS [EARLY] …: lo-hi, stop".
  - It skips only stocks on the ZAD not-halal list and holdings. A stock without the owner's ZAD 'yes' can be shown with a buy range.
  - Required: with focus off, either keep the board information-only (no buy or entry ranges for [EARLY]/[PAPER] items, and only ZAD-'yes' stocks), or don't show it in ACTIONS. Replace the LEADERS label with the frozen verdict (NOT PROVEN) as in the RESEARCH line. Add a test with focus off: no buy range for an unmarked or unproven name.
- **F2 (minor): unqualified LEADERS plan-card text.** It still says "passed the whole-market fair test; live record still building" (around line 1358). The always-on gate keeps these cards paper-only, so this is wording, not a BUY. Qualify it as "newer-half pass only; NOT PROVEN".
- **F3 (minor): the SELL header says "close-based rule exits",** but the same section can hold "the stop … is reached" lines, which are not close-based. Say "close-based exits at the next open; stop-reached lines: your broker stop applies".
- **F4 (minor): UNKNOWN wording.** "current price/history unavailable" also appears for holdings with under one year of history (`reviewReply` needs 260 bars). Say "history too short or unavailable".
- **F5 (design, owner decision):**
  - "PRIOR SELL NEEDS RECONCILIATION" repeats in CRITICAL every day until the position is sold, because `sell-notices.jsonl` keeps the notice. There is no acknowledgement path.
  - The LEADER DIP "waiting" count is capped at 6 by the existing `mark.slice(0,6)`.
  - Both are acceptable if intended; state them.

## Approval scope

Separate decision. When F1 is fixed (and preferably F2–F4), this overlay can be approved on its own, for deployment only **after** the mentor release is verified (V1). It must not be added to the 3 Nov mentor window. Its own boundary and rollback reuse the same verified-state rules; its inverse is `0ca25bac…`.
