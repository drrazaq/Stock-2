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
