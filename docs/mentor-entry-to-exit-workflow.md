> A separately reviewable [production mentor package](mentor-readonly-production-proposal.md) is prepared in draftPR3, not deployed. It includes a financial-byte preservation fix for foreign-message batches; it excludes new fill snapshot writes and keeps current ZAD UNKNOWN in this view.

# One usable mentor workflow — development, not a strategy endorsement

31 October 2026. **LEADER DIP / SQ11-PB12 remains NOT PROVEN.** This completes a read-only explanation workflow, not an executable trading recommendation or proof of profitable returns. No strategy, target adoption, risk gate, financial record or production reminder changes.

Use the existing owner lane because it already has source signals, reported-fill accounting, holdings and exits to reconcile. It covers months; it is not evidence for intraday or weekly profitability. Rejected shorter-horizon rules remain rejected; no new adapter is added. The owner’s broader goal remains a mentor across intraday, days, weeks and months, but one fully explained lane is more useful than unsupported slots for every horizon.

| Step | Unchanged contract and mentor behavior | What remains unresolved |
|---|---|---|
| Selection | SQ11-PB12: prior-month-end top20% by12–1 momentum among300 largest eligible US companies; first close ≥12% below its50-session highest close, above200-session average; previous close less than12% below its own50-session high. | The view explains the registered condition; it does not independently authenticate the original universe, ranking or price inputs. See `squad11-core.mjs` COMMON and RULES. |
| Entry and price | Next session’s open only. Source close is a reference, reported fill a separate fact. Entry expires immediately after that opening. | No executable range is manufactured. Production’s reference×1.03 ceiling is an owner-lane variant, not the tested next-open fill. Current BBO/size, identity, eligibility, cash, fees and slippage must be established separately. |
| Position | Existing owner-lane limits:1,000USD per slot,3slots; report known whole shares and recorded notional. Oversized or malformed records remain unresolved. | Allocation is not a maximum loss. Portfolio-wide capacity/cash/exposure is NOT verified by this view; fees are not silently subtracted using a guessed amount. |
| Stop | Frozen base has no stop. A stored stop is a different, unvalidated variant. | Full notional plus costs may be lost; gaps, halts, dilution and no quote can frustrate an exit. No stop is invented to make the plan look safe. |
| Target | Base has no fixed target. Stored+20% belongs to separate A-TGT-TGT20-PB12, NOT PROVEN, adoption=false. | Owner-lane use does not establish research adoption. Daily high touching a target is not a limit-fill receipt. |
| Holding period | Count the buy session as1; reference exit is session126’s close, using the reviewed exchange calendar. | Calendar reference is not HOLD approval. Source/fill/contract conflicts and missing evidence stay unresolved. |
| Exit | Show future / close-today-pending / clock-unknown / close-reached-or-passed. Half days use13:00NY; ordinary closes16:00NY. | Reached close does not prove a missed exit or completed sale. Verify actual execution. Legacy next-open reminder differs from the tested close; recovery is an explicitly unvalidated timing variant. |
| Decision changes | Entry expires; changed source/fill/rule requires reconciliation; lost eligibility or execution evidence blocks actionability; registered close changes reference state; actual reported sale goes through existing accounting. | Mentor never records a trade or infers one. Stored positions and private accounting are byte-preserved by the actual caller tests. |
| Costs and evidence | Frozen model0.8% round trip /1.2% stress is shown separately from unknown executable costs. Frozen negative verdict and unadopted target remain visible. | No prospective expected return, genuine admission or profitability is claimed. |

## Available now versus not deployed

Production main inspected at `6e806c4f2ea5d0f299b86c435fdc449c2f87e291` contains the owner lane, fill/sale accounting and legacy target/next-open reminders. It has **no `mentor` command or mentor module**. The deployed accounting, watcher and SEC-hotfix evidence remains preserved. This milestone changes none of those production files.

Development has `mentor SYMBOL → mentorText → leaderDipMentorPlan/renderLeaderDipMentor`, original contract snapshots for new reported fills, explicit unresolved legacy holdings, a complete lifecycle guide and eight reproducible synthetic examples. The new standalone tool makes the same explanation usable without installing the bot:

```sh
node tools/explain-leader-dip.mjs < docs/validation/mentor-example-input.json
```

The supplied input is invented. For another explanation, provide explicit JSON on stdin: `symbol`, canonical UTC `asOf` including milliseconds, optional `signal`, `position` and whole-share `quantity`. A holding uses only its saved contract, never a current replacement signal. No defaults discover holdings, secrets or data files. Input is capped32KiB with10second read deadline; invalid input emits a fixed error without echoing it. No network, messages, record writes or order interface exists. Output may contain supplied position information: keep it local; do not paste private records into public evidence.

All outputs are **EXPLANATION_ONLY / NOT_ACTIONABLE**. This is useful as a contract, expiry, risk and next-verification guide today; a deployable, validated recommendation workflow remains unestablished. Current identity/ZAD/executable quotes, portfolio capacity and frozen evidence gates are prerequisites, not switches this feature can bypass.

[Eight synthetic outputs](mentor-synthetic-examples.md) include consistent fill, legacy holding, expired lead, missing evidence, contradictory plan, half-day close pending/reached and missing exit clock. The actual bot caller and standalone CLI are tested. Frozen rules and original artifacts are unchanged. [Acceptance closure board](acceptance-closure-board.md) and [bounded remaining work / approval package](mentor-evidence-next-decision.md) separate engineering from evidence.

Verification:7new lifecycle tests and21existing mentor controls pass, including actual read-only bot and standalone callers; full222Node files/2,148cases, Python30 and syntax281 pass. Exact published CI is recorded in draftPR1 at its final SHA. No acceptance row closes.
