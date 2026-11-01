# HISTORY-03: user-facing claim catalogue (first package, documentation only)

**Owner of this package:** Claude.

**Integration:** Codex reviews and integrates. This package changes no runtime file, strategy rule, gate, cost, frozen result, ledger or historical evidence. It is not on `main`.

## What was done

1. **Production surface.** Every script started by a workflow that holds `TG_TOKEN`, plus the local modules they import: 88 files on main `f6a9b1668d0591cf24a734034949b96b241fe35b` (`tools/production-files.txt`).
2. **Source candidates.** `tools/extract-claims.py` lists every string literal containing a claim word or a numeric performance phrase:
   - claim words: tested, proven, unseen, positive, profitable, works, beat, won, passed, edge, average, …;
   - 914 candidates in total, in `source-candidates.json`.
3. **Rendered messages.**
   - **Tool:** `tools/render-messages.mjs` renders the actual Telegram texts of `scan.mjs` offline from the data committed in the repository: ACTIONS, SCORECARD, SCOREBOARD, HELP, ways, and 27 commands.
   - **Isolation:** the tree's own test loader blocks all network access; Telegram is a local fake server; no real token or key is used; 0 fetch attempts were recorded.
   - **Not published:** the raw render, because it contains the owner's holdings. Catalogue wording uses `<placeholders>` for owner values.
4. **Evidence mapping.** 43 priority claims were traced by hand, covering ACTIONS, RECORDS, SCORECARD, SCOREBOARD, research summaries, lane descriptions and the session-alert senders. Each was traced to:
   - its source line;
   - its evidence artifact;
   - the population, selection period, rule version, costs, holding basis and coverage.

   Anything not recorded is written **MISSING** (`claims-catalogue.json`, `CLAIMS-CATALOGUE.md`).
5. **Development outputs.**
   - The same extractor was run on `Stock2-safety-fixes@ffb806eb`. Every catalogued claim carries its development-branch state, found by phrase search.
   - The 22 claim strings that exist only on the development branch are in `development-only-candidates.json`. The mentor strings among them are covered by the separate mentor review.

## Results

**Status of the 43 catalogued claims**

| Status | Claims |
|---|---|
| STALE | W01 |
| UNSUPPORTED | W03, W04, W07 |
| MISLEADING | A01, A02, A04, A05, S02, S03, W02, W05, W06, W08, W09, W11, W12, X01, X02, X03, X04, X07 |
| EVIDENCE_NOT_MAPPED | W13 |
| SUPPORTED or SUPPORTED_QUALIFIED | the rest, mostly the LOSING / too-early forward-paper rows, which are stated honestly |

### Top of the ranked list (`RANKED-FINDINGS.md`, 32 entries)

1. **W01 (`ways`).** The reply still describes the pre-27-Oct plan: "65% … 35% kept as cash for Basket 1", and "TRY SMALL: 1,000 USD buys". It does not mention LEADER DIP.
2. **A01 (ACTIONS research line).** "insider buying works in rising markets (+0.1% / +6.1% a trade)". The study verdict is NOT PROVEN, and in the older half that +0.1% trailed the S&P 500's +0.3% on the same days.
3. **W03 (`longterm`).** "the S&P 500 beat every long-term stock-picking method tested".
   - It is computed only from two labs, as "nothing was PROMISING"; one of those labs covers 4 years, not 5.
   - Other methods did beat it on raw return: Basket 1 16.7% vs 12.2% a year; LEADER DIP replay 11.6% vs 10.2%. They are NOT PROVEN, so this may be luck.
4. **W04 (HELP).** It speaks of "every proven buy" while no rule is proven.
5. **X01 (intraday radar, latent).** A forward-paper graduation would print "PROVEN" and "BUY". That needs a wording fix and an owner decision on the gate.
6. **W07 (autolab).** "Only PROVEN LIVE rules … appear in your ACTIONS". This is false: the owner's NOT PROVEN lanes appear there.
7. **W08 / A04 / A05 / S07: the words "proof", "proven", "unseen" and "tested" mean at least four different bars.**

   | Where | What the word means there |
   |---|---|
   | Handbook PROVEN | every gate passed in both halves, block t ≥ 2.5, luck bar about 4.1 |
   | Engine `okEv` | the per-stock check: 30+ trades on that stock's own past at +0.4% or better |
   | autolab | 30+ live paper trades |
   | intraday radar | 30+ paper trades |

   Messages use the strong words for the weak bars.

Then: the basket evidence shows Basket 1, not the SPUS/IAUM plan (W02); "provisionally promising" leaders (A02, W06); the swing scorecard row mixes two populations (S02); "Only rules that PASSED send … alerts" (W09); missing context on the LEADER DIP line (A03); and smaller label and period errors.

**Already changed on the development branch:**
- A04: engine candidates stay paper only when focus is off;
- X03: the wording is gone;
- the SCORECARD header is relabelled LEGACY;
- A09: re-described as a normalized return.

Everything else persists there.

## What remains for HISTORY-03 closure

1. **Wording repairs (Codex, runtime).**
   - Apply or adapt the proposed wording in `RANKED-FINDINGS.md`, in the files where it lives: `scan.mjs`, `autolab.mjs`, `intraday-radar.mjs`, `news-watch.mjs`, `radar-v3-core.mjs`, `ignition-watch.mjs`, `octopus.mjs`.
   - Add a test per corrected message asserting the new wording.
   - No rule, gate or frozen result changes.
2. **Owner decisions** (not engineering):
   - W01: confirm the `ways` text describes the current plan;
   - X01: whether a forward-paper graduation may ever print BUY. CLAUDE.md §9 allows plain BUYs only for the owner's lanes.
3. **One vocabulary.**
   - Pick one meaning each for "proven", "tested", "unseen" and "passed" (the handbook's), and rename the weaker bars, for example "passes the per-stock check" or "paper record passed".
   - This is a cross-file wording change for Codex, with my review.
4. **Coverage still open.**
   - **Unreviewed source candidates:** 837 of 914 are NOT_REVIEWED. Many are not claims (labels, errors), but they must be triaged.
   - **Messages not rendered in this pass:**
     - the Sunday research summaries sent by the ~40 lab scripts in `leaders-study.yml`;
     - the opportunity radar A–D panels and the DELIVERY SCORECARD;
     - early-alerts RESEARCH LEAD / PAPER SETUP;
     - premarket, smart-money, deals, discover, movers, news and TipRanks messages;
     - `scan.mjs` replies that need live input: `check SYM`, the sell/hold review, the opinion replies, and the LEADER DIP buy confirmation ("No stop by design (tested without one)").
5. **MISSING fields.** Several claims have no recorded period, cost, population or coverage in their artifacts:
   - smart-money study dates and cost;
   - stop-study universe and cost;
   - tip-ledger costs;
   - the "test expected about half" source;
   - the per-stock `okEv` window.

   Either the producing labs record these, or the messages must drop the claim.
6. **Independent reproduction (external evidence).** No number was recomputed from raw market data in this package. Closure also needs authenticated reproduction, from the frozen inputs, of at least:
   - the claims the owner acts on: the LEADER DIP 73% / 75% and the 3-slot replay;
   - the Basket 1 / SPUS record;
   - the insider study halves;
   - the leaders fair test.

   That needs the 5-year price cache and a separately authorized run. Wherever a claim relies on history that is not available, it has to be qualified instead.
7. **Re-run after repairs.**
   - Re-render with `tools/render-messages.mjs` and re-extract on the repaired commit.
   - Confirm that no ranked wording remains and that no new unqualified claim was introduced. Then update the closure board row.

## Files and SHA256

| File | Purpose | SHA256 |
|---|---|---|
| `CLAIMS-CATALOGUE.md` | 43 priority claims, all fields, assessment, proposed wording, development-branch state | `bd3e13d0bd7c5e5a3c868c9b826d0eec7031055b41a119f48d2ff9c0f785a79a` |
| `RANKED-FINDINGS.md` | 32 ranked unsupported / misleading / stale claims with plain-English corrections | `f68844e8fc59ffe14ce4b8df50221605dbb114b0e0f864f31ba35360523a8a0b` |
| `claims-catalogue.json` | machine-readable catalogue (same content) | `ab20f85600501690dfc7dadf8429cc49d51110031e98d6039588ed987de3e5c2` |
| `source-candidates.json` | all 914 production source candidates; 77 MAPPED, 837 NOT_REVIEWED (explicit) | `7b8bb919575d129ec59e37ae007055ddc20146e6084023a2badf301e5dc0b377` |
| `development-only-candidates.json` | 22 claim strings present only on Stock2-safety-fixes@ffb806eb | `be37d73b92160190bd04b2371f6fa870fa2d0afad58e8ace643e8abfaa90d220` |
| `tools/extract-claims.py` | source extractor | `c40b219d491f68beea9c379c1d6569cf762174c5a2a5264d84658bb4aaad6ce9` |
| `tools/render-messages.mjs` | offline renderer of the actual scan.mjs Telegram texts (output local only) | `f9f21d07e29d1fb88a8c82a11ee22e43bc12b9b20527372cecc7732a8dd9337f` |
| `tools/build-catalogue.py` | builds the four catalogue outputs | `ae5e40da1e6dc76177ae4a0a2b6fbf677d54b4a198860b16f83d484b82f3dc62` |
| `tools/catalogue_data.py` | hand-mapped evidence records | `bd5ba43e13c4cb2fe1ce5d25e3b557151aa5a1999f0fe50968bd1063fd09cce0` |
| `tools/production-files.txt` | the 88 production files scanned | `8105b28e91bf6a64a9493d5332e2ccb1b47e2552de31ec1078cf7760f9b75f40` |

## Reproduce

```
python3 -I tools/extract-claims.py <repo> $(cat tools/production-files.txt) > hits.json
node tools/render-messages.mjs <repo> > rendered.json                                         # local only; contains owner holdings
python3 -I tools/build-catalogue.py <dir with catalogue_data.py and hits.json> <out dir>
```

Rebuilding from these tools on main `f6a9b166` reproduces `claims-catalogue.json`, `source-candidates.json`, `CLAIMS-CATALOGUE.md` and `RANKED-FINDINGS.md` byte for byte (checked before publication).

---

# Batch 2: Sunday lab summaries, opportunity radar, early alerts

This batch covers the surfaces missing from the first catalogue. Every caller was rendered offline:
- **Sunday lab senders:** on a synthetic 5-year price cache.
- **Bot research replies and the after-close radar runner:** on the committed data.
- **Radar and early-alert builders:** on the repository's own test fixtures.

Every fetch went to a local fake server or was refused, and no real message was sent. Raw renders stay local.

## Results

- **29 records:** 14 findings (B01-B14) and 15 reviewed-acceptable surfaces (B20-B34). NOT PROVEN and REJECTED results are preserved as recorded.
- **Gate or decision defects** (kept separate from wording):
  - **B01:** the radar counts "APPROVED SIGNALS: N tested alerts sent". That count includes EARLY PAPER (NOT PROVEN) alerts, and alerts that were recorded but not sent.
  - **B03:** the per-stock "15+ past trades, +1.5%" bar still admits engine BUY candidates. Its only test (hunting-lab persistence) was inconclusive, and its picks did worse than the other stocks.
  - **B13:** the stop study's risk-preference choice is applied automatically to new owner buys, under the name "tested stop".
  - **B02, and the batch-1 latent items X01 / X04:** paper results that produce trade wording.
- **Wording-only defects:**
  - **B04:** selection-biased "+1.6% to +2.2% a trade" averages in the `days` and `market today` replies;
  - **B05:** "proven buy" used for the per-stock past-trade check;
  - **B06:** a hard-coded "5 years" on studies that cover 3.5 to 4.3 years;
  - **B07:** a mislabelled rebuy metric;
  - **B08:** "buy day / sell day" printed for REJECTED catalyst rules;
  - **B09:** "Missing: ... REJECTED; 2 more trading days";
  - **B12:** "Tested buys ..." (the same as batch-1 X03).
- **Provenance-only gaps:** B10 (static chasing statistic), B11 (static EW-ALERT-1 note), B14 ("tested AVOID").
- **Owner policy questions, not decided here:**
  - **P1:** may a paper record alone trigger a trade suggestion or BUY wording?
  - **P2:** may the unvalidated per-stock check admit engine BUYs when focus is off?
- **Production note:** the Sunday labs treat a missing `settings.quiet` as quiet. With the committed settings, most Sunday lab messages are sent only when something passes. The owner sees the results through the bot's research replies.

## Coverage counts (`COVERAGE.md`)

Batch 1's "914 - 837 = 77" did not mean 77 reviewed claims. It meant **77 source strings within one line of a catalogued claim's source reference**:
- those strings covered 31 of the 43 claims;
- 15 of them counted against more than one claim.

Inventory v2 replaces that rule with:
- exact anchor phrases, with long-string truncation handled;
- every string in the batch-2 files read one by one;
- a broader extraction that found 298 strings the batch-1 word list missed.

| Category | Strings |
|---|---:|
| CATALOGUED_CLAIM | 57 |
| REVIEWED_ACCEPTABLE | 202 |
| NOT_A_CLAIM | 50 |
| NOT_REVIEWED | 903 |
| **Total** | **1212** (914 batch-1 + 298 broad-only) |

**Records:** 43 (batch 1) + 29 (batch 2) = 72.
- 42 are anchored to an extracted string.
- 14 have their phrase in a source literal that carries no listed claim word.
- 1 is assembled at runtime.
- 15 are whole rendered surfaces (B20-B34).

The 15 records not anchored to a string were reviewed from rendered text.

## Still open for HISTORY-03 closure (updated)

1. **903 strings still unreviewed:** mostly `scan.mjs`, plus discover, deals, movers, news-watch, premarket-check, smart-money, tipranks and intraday-radar.
2. **Texts not yet rendered:**
   - the live-only alert bodies (`ignition-watch.mjs`, read from source only) and the intraday-radar cards;
   - the owner-input replies (`check SYM`, the sell/hold review, the opinion replies, the LEADER DIP buy confirmation).
3. **Codex: wording repairs** per `RANKED-FINDINGS-v2.md` and `EVIDENCE-VOCABULARY.md`, plus the counter split for B01. Codex is changing these runtime files, so nothing is edited here.
4. **Owner:** answer P1 and P2, and confirm the automatic stop default (B13).
5. **MISSING provenance fields:** those from batch 1, plus B10, B11 and B14.
6. **Independent recomputation** from raw prices of the claims the owner acts on (needs an authorized run on the 5-year cache).
7. **Re-render and re-extract** after the repairs.

## Batch 2 files and SHA256

| File | Purpose | SHA256 |
|---|---|---|
| `BATCH2-FINDINGS.md` | batch-2 findings (B01-B14) and reviewed surfaces (B20-B34): supports / unsupported / defect type / correction; owner policy questions P1, P2 | `77a34cac1f19228335815f2ef09240140a8e7a924e862ff4e7ed9eb48371dd65` |
| `RANKED-FINDINGS-v2.md` | combined ranked corrections, batches 1 and 2, with defect type | `f23dd3b531679ba52e6f007b8a52bb88ef77ed874ffe66b7cc84bc14670ce8d5` |
| `EVIDENCE-VOCABULARY.md` | one proposed evidence vocabulary and the wording it replaces | `47f5a1ff092b1cdf1df6c2a7992153fa256f181c861dc092699aeea279a8a7c9` |
| `COVERAGE.md` | coverage counts, claim presence table and the reconciliation of the batch-1 "77 mapped" | `8f6e1050f234da02e39ccdff1c997deb73a3749866435d8e7cbe4309498f78bb` |
| `batch2-claims.json` | machine-readable batch-2 records and policy questions | `8207456496b3d28ec6ac182aa2c3decb41937ec44020b976f5dc9a9b7a2f3148` |
| `source-inventory-v2.json` | all 1,212 strings (914 batch-1 + 298 broad-only) with category, claim ids and per-claim presence | `1f63d36e574cbe454cce53d57035b055ae6074189f01686cc0b81f8c1d079200` |
| `tools/extract-claims-broad.py` | broader extractor (recall check) | `d92f278def75eb2277f927fb8b0afb2fe5343f82541a150673f8e9e923e02946` |
| `tools/render-sunday-labs.mjs` | runs the 15 Sunday lab senders offline on a synthetic 5-year cache (output local only) | `173495e3ca7f0f0bc2779692eddedcb8e84f6e04afb81938bbe85a619dd3e03d` |
| `tools/render-research.mjs` | renders scan.mjs research replies on committed data, offline (output local only) | `dcb4b4a783d20d10c48616a5f26b837348803f2c2bc998f770f7f09292676f0c` |
| `tools/render-radar-alerts.mjs` | radar and early-alert builders on the repository test fixtures; opportunity-radar close on committed data, offline (output local only) | `bd7d6de157effcd91c0cd7be6b928480625a5c647429214f2096c94935ca8b1b` |
| `tools/focus-check.mjs` | checks that the market-today buy list respects focus mode (committed data, local) | `b2147f7d8a66435c7c5b2f7da448b7ade9266595d8d03001e7f1761236817f23` |
| `tools/catalogue_data_b2.py` | hand-mapped batch-2 records, vocabulary and policy questions | `ab8b38b1cb92d755e00612c8d4410b91ee851e41de48bb670795f257b136a059` |
| `tools/build-batch2.py` | builds every batch-2 output above | `0563683b0b20201ffae4c7b1417f5d0d81b90f8423626411122537a6d8f8330b` |
| `tools/readme_b2.py` | writes this README section | `878fab65232f37346baed2b7189b1dddaf303d7597e8733d72f360e1e9c21a39` |

Reproduce (the outputs are byte-identical on main `f6a9b166`):

```
python3 -I tools/extract-claims-broad.py <repo> $(cat tools/production-files.txt) > hits-broad.json
python3 -I tools/build-batch2.py docs/history-03 hits-broad.json <repo>
node tools/render-sunday-labs.mjs <repo> <work dir>       # local only
node tools/render-research.mjs <repo>                     # local only; contains owner holdings
node tools/render-radar-alerts.mjs <repo> <work dir>      # local only
```

Batch 1's `source-candidates.json` is unchanged. Its `reviewStatus` field is superseded by `source-inventory-v2.json`.

---

# Batch 3: live alert bodies, intraday radar, unrendered Sunday labs

Same method and fields as batch 2. Nothing was sent and no provider was called; raw renders stay local.

## Results

- **C01 (P1, extends B02):** an EARLY WAVE ALERT [PAPER, NOT PROVEN] uses the approved alert's body, including an explicit "BUY only up to <price>", a stop and an exit. A NOT PROVEN paper result therefore produces a full buy instruction. This stays an owner policy question (P1).
- **C02 (wording):** the intraday-radar card says "holding time that tested best". It is a split-half choice on 30+ paper trades without a luck bar, and it is not shown today because no group has a selected hold.
- **C03 (wording):** the intraday-radar card labels the setup's paper record (currently negative for all four groups) as "Expected:".
- **C04 (latent, = X01, P1):** the "BUY, PROVEN ON PAPER" board section and position sizing.
- **Acceptable:** stop alerts (C10), PRE-WAVE / PAPER PLAN cards (C11).
- **C12:** the Sunday autolab and quality messages crashed on the synthetic input, and rebalance and fastmover-lab sent nothing. They are covered by reading their source strings and by their replies on committed data.

## Coverage after this batch (`COVERAGE.md`, `source-inventory-v3.json`)

| Category | Strings |
|---|---:|
| CATALOGUED_CLAIM | 58 |
| REVIEWED_ACCEPTABLE | 212 |
| NOT_A_CLAIM | 56 |
| NOT_REVIEWED | 886 |
| **Total** | **1212** |

Records to date: 79 (43 in batch 1, the rest in `all-claims.json`). The combined ranking is in `RANKED-FINDINGS-v3.md`.

## Files and SHA256

| File | SHA256 |
|---|---|
| `BATCH3-FINDINGS.md` | `45f9e78bc3f4c0d218c06e1b8034c5499f74927f78a744c9601fa6ed170096ea` |
| `RANKED-FINDINGS-v3.md` | `b213551746274783daf72e9a19bdc2c9fc3f3979fe3a00070236cc3a4a9dd7c2` |
| `COVERAGE.md` | `84df7d5e84e0a2f6cd2fa3d8e44406fc6ee5f0ae36ec6f98eb1679123f01e676` |
| `all-claims.json` | `b28678bfeb41058fab536a3cc83c743ca078dc03422f992d0ccad37eb50ec683` |
| `source-inventory-v3.json` | `457e49f835f5c941a6098d75fd55a0623235980f0b99a80f9252a9fb8b98c910` |
| `tools/catalogue_data_b3.py` | `8a54572e7751b4e20979e8a216561a77a117f47bb29cba249c2b15926fdc84ff` |
| `tools/build-audit.py` | `0784a9e631652517c953811753bb04603f378d8d9da7d2a3fe19071b1456f064` |
| `tools/readme_batch.py` | `db4b15b3cb0f0e703ee185420c17f25dfb00b012c2e17aea7e74ce5a96b7ee22` |

---

# Batch 4: trading-decision replies (scan.mjs)

Same method and fields as batch 2. Nothing was sent and no provider was called; raw renders stay local.

## Results

- **D01 (decision, P3):** the holdings review raises a "TAKE PROFIT OPTION (tested on 5 years …)" (sell, buy back 10% lower) for every stretched or spiking holding, without checking the study verdict. The study is BELOW THE LEAGUE BAR (+1.9% / +1.8% vs holding, 2022-2026), and the rebuy reply on the same data says "Do not sell to buy back lower". The owner gets opposite guidance from two replies.
- **D06 (latent gate, P4):** tier-2 CHAIN, DISCOVERED, FOLLOWING and CATALYST RUN-UP lanes and AUTO-DISCOVERED ("PROVEN ON LIVE PAPER") print a plain "- BUY" in ACTIONS when they fire. `settings.tier2` is unset (on) and focus mode does not pause them, while CLAUDE.md §9 names only LEADER DIP and LONGER HOLDS. None fires today.
- **D03 (high, wording):** the EARNINGS DRIFT owner-lane BUY card says "passed its own 5-year test", but the frozen earnings study (23 Oct) is NOT PROVEN. Its "+1.8% a trade over 176 past beats" has no recorded source.
- **D02:** the `check` reply hard-codes "proven: stops, trim, switch, avoid rules". The library has none of these as PROVEN, and the switch is "not proven".
- **D04 / D05 (wording):** card fallbacks say "whole-market fair test passed" with no recorded pass, and "PROVISIONALLY PROMISING" leaders become "passed the whole-market fair test".
- **D08 (wording):** the per-stock check is called "passed its tests", "PROVEN signal", "proven setup" or "tested exit" across the decision replies. The gating itself is consistent: focus mode is respected.
- **D07, D12, D13, D14:** inconsistent FADE labels; a "5 years" stop study that covers 4.3; a static "-4.9%, 719 cases" figure; a 3-trade record used as an argument.
- **D15:** early paper alerts are recorded but not sent under the default `opportunitiesOnly`, so B02 and C01 are latent. The B01 counter still counts them as sent and approved.
- **Supported:** the danger-filing SELL reasons (D10: squad29 F4 −12.5% / −16.3% at 60 sessions, block t ≈ −6, both halves) and the lottery AVOID (D09: autolab M15 discovery, −3.2%, t −5.1; resolves B14's provenance). Exits, the target-study note, the LONGER HOLDS evidence line and the "no tested support" replies are acceptable (D11, D20).
- **New owner policy questions:** P3 and P4 (not decided).

## Coverage after this batch (`COVERAGE.md`, `source-inventory-v3.json`)

| Category | Strings |
|---|---:|
| CATALOGUED_CLAIM | 108 |
| REVIEWED_ACCEPTABLE | 806 |
| NOT_A_CLAIM | 67 |
| NOT_REVIEWED | 231 |
| **Total** | **1212** |

Records to date: 95 (43 in batch 1, the rest in `all-claims.json`). The combined ranking is in `RANKED-FINDINGS-v3.md`.

## Files and SHA256

| File | SHA256 |
|---|---|
| `BATCH4-FINDINGS.md` | `d5bdeb97d12d247d1159a25243a9d49762d05c55c6b988b0c3b808629756a6e3` |
| `RANKED-FINDINGS-v3.md` | `22f90db45192e22efa4f87d13edd8609a9d9f6795e6ff17729f12a52e154d7f9` |
| `COVERAGE.md` | `941b886734a07ed456f076211bb52f8fa34b35e912d11c1725f7141ba4b0bdaa` |
| `all-claims.json` | `d73b9592839c0acd36c027de0b292ca61c073be5ff54709026d2b2d2b823d3e8` |
| `source-inventory-v3.json` | `f5814d34bc83a1f668f12bbf9ad1d3fbf8d1879ee3030e1d831ca7e431f916d7` |
| `tools/catalogue_data_b4.py` | `22853fa6dab216236e0b271452365eeb601015eb53c6e52eb4bdad75ad17586a` |
| `tools/render-decisions.mjs` | `efafa50f948e10c1b0c2559bf63c11d1b05107a0fcada7c18167dbc9630b367c` |
| `tools/build-audit.py` | `0784a9e631652517c953811753bb04603f378d8d9da7d2a3fe19071b1456f064` |
| `tools/readme_batch.py` | `db4b15b3cb0f0e703ee185420c17f25dfb00b012c2e17aea7e74ce5a96b7ee22` |

---

# Batch 5: remaining senders and modules

Same method and fields as batch 2. Nothing was sent and no provider was called; raw renders stay local.

## Results

- **E01 (medium-high):** the live MARKET SHOCK message (sent when the S&P 500 moves 1.5%+) quotes the selection-biased market-day averages ("the system’s tested buys made X a trade … unseen trades") and says "Decided by the system from the 5-year market-day test". Its hold-and-keep-your-stops advice is fine.
- **E02:** the `discover` reply's "Companies that keep selling new shares lag the market" is stated as fact, but its evidence is below the luck bar (S2: −3.8%, t −2.3) and the S-8 share-creep test (C-S8) was rejected.
- **E03 (latent, P1):** `deals` says a pattern "becomes a BUY only after 30+ paper trades with a profit".
- **E04 (vocabulary):** `tipranks` uses "BUY WATCH (tested rule)" for the per-stock check.
- **E10:** the lab and study verdict templates across the remaining modules are acceptable.
- **Coverage:** every extracted string is now classified; none remains NOT_REVIEWED.

## Coverage after this batch (`COVERAGE.md`, `source-inventory-v3.json`)

| Category | Strings |
|---|---:|
| CATALOGUED_CLAIM | 115 |
| REVIEWED_ACCEPTABLE | 989 |
| NOT_A_CLAIM | 108 |
| NOT_REVIEWED | 0 |
| **Total** | **1212** |

Records to date: 100 (43 in batch 1, the rest in `all-claims.json`). The combined ranking is in `RANKED-FINDINGS-v3.md`.

## Files and SHA256

| File | SHA256 |
|---|---|
| `BATCH5-FINDINGS.md` | `adb763e69476928fc57553ab8c1a81c7d96a26fb5a1e19937b49dc1119791729` |
| `RANKED-FINDINGS-v3.md` | `89a5aa41cccd5a7ee997a4d421f00bdb744360e1e4fe067604c07f3b4208b056` |
| `COVERAGE.md` | `bdda1917aba7154dd0216868481335e6d67f4ea04f7d850524e76163c4722a99` |
| `all-claims.json` | `1014cd29f592ea3cd1f710f3005acd289401273f728fd0ec63e974b661aaacf1` |
| `source-inventory-v3.json` | `214cc9df1565ba498a613f985964975e3d9513f8e71c1da80dee4be906dc3a0e` |
| `tools/catalogue_data_b5.py` | `10019907109c6d62960058b4cfd11fb66651cfce87e5b3d823972aa2f1711a7c` |
| `tools/build-audit.py` | `14ff06c6b21e124ab21362439dc700f78aca361d333820bf137491f43c1ecf02` |
| `tools/readme_batch.py` | `db4b15b3cb0f0e703ee185420c17f25dfb00b012c2e17aea7e74ce5a96b7ee22` |

---

# Final: reconciliation, provenance register, closure checklist

## Where to start

- `CLOSURE-CHECKLIST.md`: status per part of the criterion, and the remaining owner, Codex and external-evidence items.
- `RANKED-FINDINGS-v3.md`: all ranked corrections.
- `PROVENANCE-REGISTER.md`: every missing field and every stored-row gap.
- `EVIDENCE-VOCABULARY-v2.md`: the consolidated vocabulary.

## Final counts

- **Strings:** 1212 extracted (914 narrow + 298 broad-only).
  - 115 catalogued claims;
  - 989 reviewed and acceptable;
  - 108 not claims;
  - 0 not reviewed.
- **Records:** 100.
- **Batch order:** batch 1 is the first section of this README; batches 2 to 5 follow, each section with its own file hashes.

## Correction to batch 4

The first publication of batch 4 (`b2b762dd`) quoted the owner's own-pick record in D14. It now uses placeholders. The figure comes from data already committed to the repository; the branch history was not rewritten.

## Final files and SHA256

| File | SHA256 |
|---|---|
| `CLOSURE-CHECKLIST.md` | `bb478ce62e93ddf8796fa2e5438e12a86d60bd92a7c2b26442de965dae011202` |
| `PROVENANCE-REGISTER.md` | `616ea4ed80fc26cf8b07798baeaf855469ab5006a2a44cde6c6d08f7d4534a74` |
| `EVIDENCE-VOCABULARY-v2.md` | `f65d07beebac7177145ff6da2abf0c7fd133ffd4c6fae5791ef9239b78cd5996` |
| `RANKED-FINDINGS-v3.md` | `9b0d279c753aebb93f375d52ccfd465e9112cb60d3e607f2281c2a936b10091b` |
| `COVERAGE.md` | `bdda1917aba7154dd0216868481335e6d67f4ea04f7d850524e76163c4722a99` |
| `all-claims.json` | `e2ae665798edb2f3be45b746f597064c3963134bd3137f8ea55a0400bf971045` |
| `source-inventory-v3.json` | `214cc9df1565ba498a613f985964975e3d9513f8e71c1da80dee4be906dc3a0e` |
| `consistency-checks.json` | `f9d42d535ad9b425f23c43fa163d38ed727252fe5a98c705334ba837a7ad344d` |
| `BATCH4-FINDINGS.md` | `5034d15be7710707f85110d3c4a13408b07759aee06b2751304b9bb12fe12b8a` |
| `tools/catalogue_data_b4.py` | `86bddb916f66e49a42ab73182fa63423019f5e19096fcb1ffa6058c4339652a0` |
| `tools/consistency-checks.py` | `76cc5e63f288194ab39929635e251520f750bed95d4776f4a1b6d2b2ab26c433` |
| `tools/final_package.py` | `637d978b39cecbc8770feea90540d94cd114b509f26630dfcb3555afcb555c64` |
| `tools/readme_final.py` | `77953f018c3872a7407b0f4b72c654f8e45d54a2d0ed9069bbbb5a8265747747` |
| `tools/build-audit.py` | `14ff06c6b21e124ab21362439dc700f78aca361d333820bf137491f43c1ecf02` |
