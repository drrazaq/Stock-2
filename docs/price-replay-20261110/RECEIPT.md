# 12-case offline full-watcher replay: source 322c08b5 (handoff 6764137897 / 6764180811)

Executed locally on 10 Nov 2026. No provider call, collection, dispatch, message, workflow or production write.

## How it was run

- **Harness:** `replay12.test.mjs` is derived from the existing `test/feed-integrity-watcher.test.mjs` fixture.
  - The actual `ignition-watch.mjs` runs as a child process, in **real time** with no clock scaling, against local synthetic Massive and Alpaca services.
  - The preload refuses every non-local URL.
- **Change from the fixture:** `MASSIVE_BASE` is not set, because a local `MASSIVE_BASE` makes every watcher sleep 0 ms (`FAST`), which would hide the cadence. Instead the preload routes `https://api.massive.com/` to the local server.
- **Clock header:** each request carries the child's own clock in an `x-sim-now` header, so the server stamps trades relative to that request's arrival and send time.
- **Fixture data:**
  - Massive always answers with a 20-minute-old trade at $10.
  - The Alpaca trade is $11 (active case) or a 60-minute-old $9 trade with a fresh quote (inactive case).
- **Trees replayed:**

| Tree | What it is | `ignition-watch.mjs` blob |
|---|---|---|
| 322c08b5 | the source under review | `33967ea7` |
| 7d07e701 | the parent, before the fix | `dddc30ee` |
| mutM1 | 322c08b5 with only the `validateClocks` wrap removed from `alpacaAll`, used to prove B1 discriminates | — |

- **Raw results:** `receipts.jsonl` (27 lines). Each line shows, per loop: `minute:live/received@ageP50`.

## Results

| Case | 322c08b5 (fix) | 7d07e701 (before) | Requirement |
|---|---|---|---|
| ACT-0s | 600:1/1@0, 601:1/1@0; loops start at 0 / 60 s | 600:0/1@20, 601:0/1@20 | PASS: the valid trade is accepted (before the fix it was rejected against the pre-await clock) |
| ACT-2s (trade 1 s into a 2 s request) | 600:1/1@0, 601:1/1@0; 0 / 60 s | 0/1@20; 0 / 62.2 s | PASS: during-request trade accepted; cadence 60 s instead of 62 s |
| ACT-10s | 0/1@20.3 both minutes; requests ABORTED; 0 / 60 s | 0/1@20.3; 0 / 80.3 s | Fail-closed: the 10 s client timeout (`alpaca-feed.mjs`) aborts; the stale Massive price is kept and shown as not live |
| ACT-65s | same as ACT-10s; 0 / 60 s | same; 0 / 80.2 s | Fail-closed, as for ACT-10s |
| INACT-0s | 0/1@20 in both minutes; "0 of 1" refreshed | 0/1@20 | PASS: the fresh quote is not used as the price; the old trade is not newer than Massive |
| INACT-2s | 0/1@20; 0 / 60 s | 0/1@20; 0 / 62.2 s | PASS |
| INACT-10s | 0/1@20.3; ABORT; 0 / 60 s | 0/1@20.3; 0 / 80.3 s | PASS (fail-closed) |
| INACT-65s | 0/1@20.3; ABORT; 0 / 60 s | 0/1@20.3; 0 / 80.3 s | PASS (fail-closed) |
| B1: future at receipt (2 batches; batch 1 trade at receipt + 3 s, batch 2 answers 5 s later) | 50/250 live | 50/250 | PASS. The mutant without receipt validation gives **250/250**: the 200 future-at-receipt trades were promoted at the later merge time. Receipt validation is necessary. |
| B2: 61 s fetch, 14:59 to 15:00 | beat m=900, 1/1@0 (kept) | beat m=**899**, 0/1 | PASS: attributed to the minute actually observed |
| B3: 61 s fetch, 15:00 to 15:01 | **no beat**; the 15:01 response is dropped | beat m=900, 0/1 (a 15:01 response evaluated as 15:00) | PASS: no evaluation after the endpoint |
| B4: every fetch takes 65 s | beats 601, 602 (600 visibly missing); loops at 0 / 65.2 s | beats 600, 602; loops at 0 / 125.1 s | PASS: the overrun stays visible and the next loop starts at once |

**Summary:**
- 322c08b5 passes 12 of 12 cases.
- The before tree differs on ACT-0s, ACT-2s, B2, B3 and cadence. Its B4 run first exceeded my 240 s harness guard because each loop took 125 s; I re-ran it with a 420 s guard and it completed.
- Local check on 322c08b5: the 6 new tests, the feed-integrity fixture and ignition-freshness pass, 18/18.

**Extra case, outside the 12 (X1):** 250 Massive rows, with every Alpaca snapshot timing out.
- Both trees keep all 250 rows (live 0, age 20.3).
- So the fallback does not shrink the universe.

## Source verdict: 322c08b5 clock/cadence correction PASS (development source only)

- **Receipt validation:** `validateClocks` runs at each response's receipt, in `alpacaAll` and in `snapTop50`.
- **Merge time:** the merge uses the time after the awaits.
- **Cadence:** the wait is anchored before I/O.
- **Minute and endpoint:** the minute is recalculated after the fetch, and anything past the endpoint is dropped.
- These hold in the actual process. The packet's six tests are unchanged.
- **Scope:** this verdict does not cover release, workflow or Stage 1/2 scope.

## Remaining items (none blocks the source PASS)

1. **Minute alternation near a wall-clock boundary.** Derived from the code, not replayed, because the fake clock counts minutes from process start. Production uses wall-clock New York minutes.
   - The cadence is now drift-free and the minute is taken after the fetch.
   - So if the loop's start phase sits within the fetch-latency spread of a minute boundary, latency jitter can move a loop across the boundary. The heartbeat then shows a duplicate minute plus a missing minute, although no observation was lost.
   - Coverage counts would report it as a gap.
   - Suggested fix: align loop starts to a fixed second of the wall minute, or count coverage from receipt times. This is a measurement issue only.
2. **10 s client timeout.** Refreshes of 10 s or more never produce a fresh price.
   - Each such loop spends about 20 s on two sequential timeouts (targeted refresh, then the top-50 snapshot).
   - So "valid during-request accepted" is proven only below 10 s.
   - This is correct fail-closed behaviour, not a defect, but cases at 10 s or more test the timeout, not the clock rule.
3. **Label after a timeout (pre-existing, present in both trees).** After both snapshots time out, the run reports mode `PARTIAL_TOP50_FALLBACK` and source "alpaca top-50 gainers only", although no Alpaca value was used and every row is a 20-minute-old Massive row. The heartbeat (`live` 0, age 20.3) shows the truth, but the label overstates.

## Packet b812c6ee check

- `replay.mjs` re-run against the 7d07e701 checkout, with the input-manifest blob pins verified, reproduces `analysis.json` section by section with **0 differences** in all 7 sections (neverFreshBreakdown, firstSight, coverage, liquidity, B, controlCaveat, verdict).
- **Confirmed independently:**
  - the caller refreshes only `prevC>=1` rows (`snap()`);
  - GNSS 29 Oct panel A has 2 list rows (px 1.65 / 1.64) and 2 s5 rows under one key;
  - A has n=35 and B has n=20 matured.
- Packet conclusions are accepted as stated: no spend or entitlement conclusion; B is INCONCLUSIVE with unfavorable concentration; no tuning.
- The MRNA/TMO/OIS/TALO primary follow-up was not re-derived here.
