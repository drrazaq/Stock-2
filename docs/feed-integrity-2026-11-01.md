# Feed integrity: SIP/IEX attribution, errors and provider clocks (1 Nov 2026)

**Status:** verified offline, then published on the separate branch `claude/feed-integrity`. Not deployed, not merged and not activated. No provider was contacted, and no feed default changed.

**Owner:** Claude, taking over from Codex, whose environment ran out of processes and threads. This is **not** Codex's unpublished candidate (`provider-integrity.patch`, SHA256 `a78e11d1…`). That candidate exists only on Codex's blocked workspace, is on no GitHub ref, and could not be downloaded or hash-checked. This work was rebuilt from published sources only:
- production `main` at `8291efd5`;
- the published development checkpoint `cfc8550d` (its `alpaca-feed.mjs`, `market-symbol.mjs` and `snapshot-fields.mjs`).

## Scope (five runtime files)

| File | Change |
|---|---|
| `alpaca-feed.mjs` | Per-response feed label (`snapshotFeed`). SIP 403 is the only IEX downgrade; 422 is a failed request. 429 is not retried, and its pause is capped at 5 min. Network, JSON, unrequested-symbol and error-object answers return nothing. A `null` row drops only that symbol. The base must be the Alpaca data origin or a local test service. 10 s timeout, no redirects. |
| `market-symbol.mjs` | New. Syntax-only symbol check, taken from the development checkpoint. |
| `snapshot-fields.mjs` | New. Each field keeps its own provider clock. Massive: the price clock follows the price actually used, and the snapshot's `updated` time is never a price clock. Alpaca: volume comes from SIP only, clocked by the same response's latest minute bar (never the trade). A daily-bar price keeps the session-start clock. Merges refuse future clocks and crossed quotes. |
| `ignition-watch.mjs` | Uses the modules above. SIP is judged per response. Live SIP volume replaces late Massive volume only when its own clock is newer. The top-50 fallback keeps its original field set but no longer throws away same-response SIP volume. The source label names this minute's feeds. The refresh symbol scope and decision tree are unchanged. |
| `premarket-check.mjs` | "Today's pre-market trade" uses the New York date, not the UTC date. The header names the response feed, and each pre-market price shows its own New York time. |

**Unchanged:**
- SIP first, and IEX only after a SIP 403;
- request cadence (apart from no retry during a 429 pause);
- symbol and refresh scope;
- strategy rules, gates, halal/ZAD, accounting and messages, apart from the pre-market feed/time text;
- archive file set and field schema;
- workflows, `data/**`, and the V1 and frozen evaluators.

## Defects fixed (each reproduced on production `main` by the tests below)

1. **IEX volume read as SIP (concurrency race).**
   - **How:** `alpacaAll` sends up to 6 requests at once and read a shared, mutable feed label after each response. If one part's SIP answer landed between another part's SIP 403 and its IEX answer, the IEX payload was read as SIP.
   - **Effect:** IEX's one-venue volume was used as full-market volume.
   - **Shown on the actual production watcher:** 200 IEX-answered symbols got relative volume 0.025 (IEX 5e4) instead of 0.05 (Massive 1e5).
2. **422 treated as an entitlement downgrade.** Production switched to IEX for the rest of the run on a 422, which signals an invalid request.
3. **429 retried immediately.** The same minute requested again with no pause.
4. **Massive price clock.** A daily close with no trade or minute bar took the snapshot's `updated` time, so a stale price could look fresh.
5. **Volume clock borrowed from the trade clock.** Alpaca and Massive volume were stamped with the trade time.
6. **Top-50 fallback discarded same-response SIP volume.** It used late Massive volume instead, or null when there was no Massive row.
7. **Pre-market date in UTC.** In New York winter time, a 7–8 pm after-hours trade has the next UTC date. Production would have shown it as today's pre-market price from 2 Nov.
8. **Source label.** The label was a process-wide guess; it now names the feeds actually observed.

## Tests

| Test file | Cases | On this branch | On production `main` (negative control) |
|---|---:|---|---|
| `test/feed-integrity.test.mjs` (feed and field modules) | 11 | all pass | the modules do not exist there |
| `test/feed-integrity-watcher.test.mjs` (actual watcher, synthetic local Massive/Alpaca, external fetch refused, fixed clock) | 6 | all pass | 4 fail (SIP label, 422, 429, race); 2 controls pass (403, top-50) |
| `test/premarket-feed.test.mjs` (actual pre-market check) | 3 | all pass | 3 fail (UTC date, plus 2 label checks) |
| `test/alpaca-feed.test.mjs` (existing) | 3 | pass | base URL updated to a local service, as in the development checkpoint |

**Archive preservation** (actual watcher, production vs branch, keys compared, values excluded):
- the SIP, SIP-403 and top-50 scenarios write the same files with identical field schemas (8, 7 and 7 files);
- the 9:25 pre-market record (`data/premarket.jsonl`) is byte-identical.

Full production suite results are in `docs/validation/feed-integrity-verification.json`.

## Not claimed; remaining blockers

- **Codex's candidate:** `a78e11d1…` is unverified and unavailable, and this branch makes no statement about it.
- **V2 outcomes file:** `sec-proof-ready-outcomes.mjs` (an interrupted write) is on no published ref. Its existence and completeness are UNKNOWN. Nothing was reconstructed and nothing is included here.
- **Live behaviour is unverified:**
  - the account's actual SIP entitlement and endpoint/key mapping;
  - real BBO ages, sizes and coverage;
  - whether real SIP `minuteBar` timing behaves as the fixtures assume.

  These need the owner's protected checks, not provider probes from here.
- **Massive delay:** Massive stays 15 minutes delayed for discovery, the opening range and pre-market minute bars. This change does not make those fields real-time.
- **One-sided quotes:** a one-sided Alpaca quote (bid 0) no longer replaces Massive's quote. This is stricter than production.
- **Deployment:** needs the owner's approval and independent review.
