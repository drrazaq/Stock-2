# Focused review: assessment implementation `c8466c63f` (Codex 6735492964)

Review only, offline. Branch `codex/engineering-continuation-20261108`; diff against the reviewed `b9753abb2` is `scan.mjs` (+64/−13), `test/assessment-context.test.mjs` and 6 integration manifests. No provider call or delivery.

**Verdict: CORRECTIONS REQUIRED.** S1 is a correctness defect and L1 is a delivery/product defect. The design and the P1–P3 incorporation are otherwise sound.

## Passes

- **Read-only; no gate change.** `assessmentContext` only reads `horizons.json`, `quality.json`, `discovery.json`, `events-recent.json` and `names.json`, and returns text. The `word` / `gateVerdict` / ZAD logic in `checkLive` and the `holdingsText` action rows are unchanged; the card is appended after them.
- **P1 incorporated.** Every horizon or quality row now shows:
  - both halves;
  - model vs average stock, the raw S&P figure and the worst trade (UNKNOWN when the field is absent);
  - the pre-registered average-stock margin (0.5 / 1.5 / 3.0 points for 20 / 60 / 120 sessions, matching the frozen `why` text), as met or NOT MET;
  - the frozen `why` text.
- **P2 incorporated.** `refLine2` now labels the untested reference-level diagnostic separately and prints `o.cases`. The rule line says "selected-rule record".
- **P3 incorporated.** "rank percentile NN.N"; a malformed rank (not a number in [0, 1]) shows "not ranked".
- **Provenance.**
  - Study ages are shown in hours.
  - A future timestamp, or a missing one, gives UNKNOWN.
  - Identity is stated as ticker only.
  - Event dates are labelled "not an original receipt".
  - Newlines in stored strings are flattened (`clean`).

## Corrections

**S1 (correctness): `checkOne` ignores the owner's holding.**
- `check SYM` for a stock in last night's scan routes to `checkOne(sym, sig)`, which calls `assessmentContext(sym, sig, {}, lines[0])` with an **empty** position map.
- Reproduced with the actual function (`measure2.mjs`): LNTH is held with stop 8.00 and is in `sig.stocks` with trigger 13.00. The card says:
  - "Entry: Existing scanner needs a daily close above 13.00";
  - "Exit: No adopted exit supplied here".

  It omits the holding, its stop and its rule.
- That contradicts "existing holder SELL cannot be overridden" and can read as an add signal.
- **Fix:** pass `loadPos()` in `checkOne`, as `checkLive` already does. Add a held-stock `checkOne` test.

**L1 (delivery): card length makes the nightly and reply messages very long.**

| Card | Size |
|---|---|
| No horizon rows | about 2,900 characters |
| One setup with 3 horizon rows | about 4,800 characters, more than one Telegram part (`splitTelegramText` limit 3,800) |

- `holdingsText` appends one card per holding (up to 15) in its **non-raw path**. That path is used by the **nightly** "YOUR STOCKS: what to do at the next open" message (`scan.mjs` 4382) and by `my stocks`. With 15 holdings this is roughly 45,000–70,000 characters, about 12–19 Telegram parts, every night.
- `opportunitiesText` appends up to 8 cards, roughly 23,000–38,000 characters.
- Nothing is lost, because `telegram()` splits. But it conflicts with the owner's standing requirement for short, results-first messages (CLAUDE.md §1 and §9), and it buries the SELL / HOLD lines.
- **Suggested bounded fix:**
  - keep the full card only on the single-stock paths (`check SYM`, `review SYM`);
  - in the nightly / `my stocks` and `opportunities` lists, add one short line per stock: horizon statuses, plus "details: check SYM".

  No rule changes.

**Minor:**
- `clean()` cuts the frozen `why` at 240 characters mid-word ("the edge over an average s"). Cut at a clause boundary, or mark the truncation with "…".
- Quality rows always show "worst model trade UNKNOWN", because `quality.json` has no `worst` field. That is correct, but it says so on every row; consider stating it once.

## Not reviewed here

- Codex's full 316-file run is still in progress.
- I did not run the integration-manifest pin refresh; its history records were not checked beyond the diff stat.
