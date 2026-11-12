# Tracks C and D: data readiness and source mechanisms (12 Nov 2026), revision 3

Owner: Claude (ownership accepted in PR #1 comments 6827445114 and 6827466998). Reviewer: Codex.

**Basis and scope.** Source snapshot `origin/main` 6c3ae39d. Offline and read-only. No provider or SEC calls, no outcomes computed, no edits to data or workflows.

**Why a revision.** r2 corrects r1 (4d860d2a) after Codex's review 6827646044. r1's errors are listed at the end and kept for the record. Citations to `data/strategy-library.json` are written SL:line (±1).

## Retained input manifest (actual public files only)

These are the only inputs I could actually read. Everything else lives in GitHub Actions caches, which I did not restore and cannot see, so their coverage is **UNVERIFIED**.

| File (origin/main) | Bytes | SHA-256 (first 16 hex) | What it is |
|---|---|---|---|
| data/squad29-lab.json | 110,711 | e64d1aedf9d777dc | Frozen verdict plus **aggregate** coverage summary. It is not the raw SEC corpus. |
| data/squad29-diag.json | 16,591 | 52615b294f00aa78 | Diagnostics, aggregate. |
| data/insider-study.json | 24,106 | cde1ff108b782757 | Frozen verdict, aggregate. |
| data/squad25-lab.json | 404,568 | 99c0fa8dfe49a0c5 | Frozen verdicts, aggregate. |
| data/value-lab.json | 3,008,772 | 804e85704066c95b | Frozen verdicts plus summary. It is not the companyfacts corpus. |
| data/sec-ciks.json | 54,470 | cd29d1d4d25a6bf0 | Today's ticker-to-CIK map. It is not point-in-time. |
| data/shadow-report.json | 44,702 | 25800ea534e69d57 | Ranking shadow report, generated 2026-11-12T02:03Z. |
| data/shadow-outcomes/ | 11 files | not hashed individually | Forward outcome files. |
| data/squad15-lab.json | 454,780 | cc4031fb4ec191bb | Frozen SQ15 verdicts plus data probe. |
| data/squad15b-paper.jsonl | 5,750 | ab6542bf917ebc07 | 17 rows of forward paper ledger. |
| data/follow-board.json | 1,399,498 | 19da17653411d25e | Follow-lane scoring, title-parsed calls. |
| data/strategy-library.json | 1,873,447 | b6658cbd5b86d46e | Registry. |

**The raw inputs sit in Actions caches.** These are the cache keys each workflow restores, as named in `.github/workflows/*.yml`:

| Workflow | Cache keys restored |
|---|---|
| squad29-lab | `squad29-cache-`, `squad4-cache-`, `leaders-study-` |
| squad25-lab | `squad25-cache-`, `squad4-cache-`, `leaders-study-` |
| value-lab | `value-cache-`, `leaders-study-` |
| squad15-lab | `squad15-cache-`, `leaders-study-` |

None of these caches has a retained manifest, receipt or completeness proof that I could access.

## Track C: DATA-READY / MISSING-INPUT

**Result: no frozen historical question is DATA-READY on inputs I can actually verify, and no frozen method can genuinely be evaluated now.**

| Rank | Question | Pre-registration / frozen state | What is actually verified | Missing (exact) | Status |
|---|---|---|---|---|---|
| 1 | Ranking model D (SEC live feed), forward | `rank-models.mjs`. Frozen 2026-10-28: evalFrom 2026-10-29, minSessions 20, minPicks 50 (`shadow-report.json` ranking.frozen). 28 and 29 Oct excluded (admissionDecision). | Report at 02:03Z 12 Nov: **35 picks, 7 sessions**. prospectiveAdmission NOT_ESTABLISHED. | Sessions and picks; maturity date **UNKNOWN**. **Source continuity and completeness not established** (see the note after this table). The history replay is not approved (`docs/ranking-experiment-2026-10-28.md:98-105`). | MISSING-INPUT (time, plus unestablished source continuity) |
| 2 | SQ29 F4 late filing / F6 delisting notice | `squad29-core.mjs:1`. firstRun frozen 27 Oct; no re-run allowed. | Only the aggregate coverage claims in `squad29-lab.json`. | The raw SEC corpus (`squad29-cache`, `squad4-cache`): retention, manifest and completeness are UNVERIFIED. The price input is `leaders-study-`. | MISSING-INPUT, SEC-side coverage UNVERIFIED |
| 3 | Insider Form 4 (insider-study, C-INS3-60, C-IC1) | `insider-study.mjs:1-9`; frozen. | Aggregate verdict file only. | The raw Form 3/4/5 corpus (cached, UNVERIFIED). The price input is `leaders-study-`. | MISSING-INPUT |
| 4 | Squad 25 (13F / 13D / 13G) | `squad25-core.mjs` header. firstRun and correctedRun REJECTED. | Aggregate only. | The cached SEC corpus (UNVERIFIED). Fails-to-deliver files 202605a/b are absent per the lab. The price input is `leaders-study-`. | MISSING-INPUT |
| 5 | B-DREV1 / B-OE1 | **Registered 10 Nov** with specific queue specs (SL:34703 / SL:34717), but not implemented and not frozen in any code header. No firstRun. Summaries below; the full registered wording is kept in the registry, and the spec is unchanged. **B-DREV1:** entry the session after the 10-Q/10-K filing day; signal is the 4-quarter change in deferred revenue divided by assets, with deferred revenue ≥ 2% of assets; top 10% using the causal 63-session B-FCFN1 cut; hold 63; control is the top 10% by filing revenue growth. **B-OE1:** 21-session formation; signal is (TTM(revenue − cost of sales − SG&A + R&D − change in receivables/inventory/prepaid + change in payables/deferred revenue/accrued) − TTM capex) / market value; top 10%; hold 126; controls B-FCF1 and ANOM-CFOA. | The `value-lab.mjs:149-153` TAGS list has no deferred-revenue, receivables, payables, accrued or prepaid tags. | Missing independently of any price panel: the tags, a point-in-time CIK identity, acceptance times, and the companyfacts corpus (`value-cache`, UNVERIFIED). | MISSING-INPUT |
| 6a | SQ15 history | `squad15-core.mjs:1`. firstRun frozen 24 Oct (NOT PROVEN). | The probe of 24 Oct (`squad15-core.mjs:10-14`): historical option quotes endpoint 404; daily option bars from 2024-01-18. | **The precise gap is historical option bid/ask.** Whether any current entitlement provides it, and on what terms, is UNVERIFIED. r1's "paid vendor needed / owner declined" is withdrawn. | MISSING-INPUT (historical bid/ask) |
| 6b | SQ15-PB12-300 / -2000, forward paper | `squad15b-core.mjs:7,41`, MIN_N 20. | 17 ledger rows: 15 signals and 2 entry attempts. Both attempts were skipped as "no affordable contract". 0 fills. | Closed calls. With zero fills, no closure date can be predicted. r1's "Q1–Q2 2027" is withdrawn. | MISSING-INPUT (time) |

**Model D: forward counts and readiness receipts** (structure checks by Codex, PR #1 comments 6827743753 and 6827762292; no outcomes):

- All 22 retained gzip files parse. The raw F/D decision counts match the report (1,368; R0 = 110).
- F-stream decisions by date:

  | Date | 28, 29, 30 Oct | 2 Nov | 3 Nov | 4 Nov | 5 Nov | 6 Nov | 9 Nov | 10 Nov | 11 Nov |
  |---|---|---|---|---|---|---|---|---|---|
  | Decisions | 0 each | 149 | 175 | 217 | 364 | 121 | 200 | 142 | 0 |

  The 0 on 11 Nov came despite 2,040 shadow rows that day.
- The stored fields hold no original SEC response and no full delivery-clock proof.
- Retained watcher receipts (`ignition-days`):

  | Day | Process start (NY) | First OK (NY) | Polls | Failed polls | Filings | Decisions |
  |---|---|---|---|---|---|---|
  | 10 Nov | 09:15 | 09:28 | 90 | 0 | 181 | 149 (vs 142 in retained shadow) |
  | 11 Nov | 10:02 | 10:02 | 58 | 1 | 0 | 0 |

- 11 Nov is Veterans Day, which is possibly an SEC non-filing day; that calendar is not verified here. Counts are not complete clock proof, and a zero is not proof of a feed failure. **The 11 Nov zero remains unclassified.**
- **Next action (offline only):** join the retained receipts against shadow coverage. No new requests.


**Corrected relationship to R-A2.** The parked R-A2 raw-plus-splits panel is **not** a shared input for rows 2–5. r1 was wrong to say so. That proposal:
- keeps R-A2's exact old label/day mask;
- starts at 2022-01-03;
- is scoped to the R-A2 question only.

The other studies need Oct 2021 warm-up and different universes, formation rules, tags and acceptance data. Panel, scope and rights must not be carried across. Frozen studies are not restarted.

**Closest failed neighbours** (registry rows, unchanged from r1):
- B-OE1: ANOM-CFOA REJECTED (SL:11791).
- B-DREV1: ANOM-ACC REJECTED (SL:11896).
- SQ15: SQ15-REPL NOT PROVEN (SL:22358).
- 13D: ANOM-13D REJECTED (SL:12316).
- Insiders: SQ1-INSCLU REJECTED (SL:16426).
- 8-K: RQ-ISC-NE-21 REJECTED (SL:31907).
- SQ25-GIANTSTAKE-A/B REJECTED (SL:30416).

## Track D: source mechanisms (comment 6820446932), revision 3

**Source text was provided by Codex; I did the code comparison independently.** Primary text was retrieved by Codex, PR #1 comment 6827820454 (SOURCE_RETRIEVAL receipt):
- **11 exact URLs returned HTTP 200** between 15:19:58 and 15:20:02Z on 12 Nov. Each has its full response hash and text hash recorded.
- **The Costco monthly-sales index redirected** to the IR overview, so no Costco release was examined.

This session's network cannot reach those hosts. So I cannot re-hash the pages; the page-content claims below rest on Codex's retrieval. What I verified independently is the Stock-2 side.

| Source (published) | Stated mechanism (primary text, per Codex) | Evidence class | Nearest Stock-2 rule and the exact mismatch |
|---|---|---|---|
| Qullamaggie, 2 Nov 2021 | Gap ≥ 10% with heavy opening volume (ideally a full average day in 15–20 min). Entry on the 1-minute opening-range high, adding at 5 min and on later 5/60-min chances. Low-of-day stop within about 1–1.5 ADR. Prefers 3–6 months of prior sideways action. No single complete exit stated. | (a) claim. The search for examples deliberately selected winners, but two AFRM losses are recounted. (b) none. (c) only partly specified. | DEC-EP (`decoded-core.mjs:18-22,93-100`, verified): daily gap, full-day volume, close confirmation and a **next-open** entry, with the handicap noted in the code. SQ2-EPORB (`squad2-core.mjs:53-55,149-153`, verified) is closer, but uses a **5-minute** ORH with relative volume ≥ 3 at 09:35. **Its cited source is a secondary FWTV summary, not this primary article.** Both are adaptations; their frozen REJECTED verdicts stand and are not re-run. |
| Stockbee, 30 Jul 2014 | Neglected stocks with game-changing earnings. After-hours scan: > 4% on 50k shares. Pre-market: ≥ 2% on 50k. Intraday: close/prior close > 1.04, volume > 3× the 50-day average and ≥ 300k. Immediate pre- or post-market buying after a qualitative catalyst review. | (a) a process description. (b) none. (c) incomplete: no fixed risk or exit. | Materially different from both DEC-EP (next open) and SQ2-EPORB (regular-session ORH): **extended-hours entry**. Missing inputs: timestamped earnings and expectations; extended-hours quotes, size, spread and halts; all qualifying failures. |
| SMB, 10 Aug 2020 (inline transcript read; video not watched) | (i) Post-earnings compression of 2–4 days (about a $4 range against an $8 ATR), then a range break. (ii) A separate second-day setup: day-1 close in the top or bottom 20% of the range, then afternoon support/resistance. | (a) examples. No cohort, sizing or fixed exit. | Neither is "buy the day-2 open". E16, absorption, UNDER5-EPS-LOW and SQ12-EGAPHOLD are related adaptations, with their failed or unproven verdicts unchanged. |
| TSMC monthly revenue (page modified 10 Nov 2026) | Monthly revenue in NT$ millions, plus YoY. | Business-activity evidence, not a surprise or a signal. | B-NOW1 (dated consensus) and C-REV1 stay queued unchanged. Original release clocks, currency and ADR reaction, and revisions are missing. Costco was not examined. |
| Cambridge, *Dual Peer Effects* (12 Dec 2025) | Ridge peer index from peer-average characteristics and firm deviations: 153 characteristics cut to 130, ranked monthly, 84-month rolling window. | (a) academic; long-short. | Not replicated by ANOM-INDMOM, SQ16-IND12, SQ1-CUSTMOM, ANOM-RESMOM or C-PEER1. The ½·own algebra applies only to a proposed scalar shortcut, not to the paper. The dated characteristics and the licence are missing. |
| Damodaran (undated) | DCF, dividend, FCFE and FCFF assumption templates. | Templates, not rules. | V3, V6 and V13 unchanged. They may inform assumption records in the existing assessments, with no new score. |
| TraderTV (undated) | Advertises live entries, exits and reasoning. | A claim about content. | `follow-board.json` NO EDGE covers only a **title-parsed proxy**. It is not an audit of broadcasts or trades. |
| Kinfo, 2 pages (undated) | Broker-linked imports, no manual edits, closed-trade metrics. | Stronger provenance class than a screenshot. **No named account audited.** | FOLLOW-KINFO stays queued: neither endorsed nor dismissed. |
| OIC, Sep 2026 | IV crush, time decay, spread, multiplier and fees. | Education. | SQ15 uses daily bars plus today's spread, not historical bid/ask. Entitlement, ZAD contract terms and fees are unverified. |
| OpenSourceAP (code page updated 28 Oct 2026) | Original definitions and code. Rebuilding needs CRSP/WRDS. AnalystRevision needs I/B/E/S. | Definitions. | The 23 anomaly references need definition-level matching. 331 SignalDoc rows are not 331 new strategies. The registry entries (currently 831) are search attempts and adaptations, not distinct strategies. |

**Ranked next actions (no operations, no outcomes):**
1. **Retain this mismatch map.** Any future EP-family test needs one pre-registered specification, original catalyst and expectations clocks, matched non-winners, and minute or extended-hours quote coverage. None of that is established.
2. **Monthly disclosures and broker-verified records** are source leads with stated missing inputs. They are not promoted strategies.
3. **Valuation templates** go into the existing assessment assumptions only.
4. **New finding (verified):** SQ2-EPORB's source citation is a secondary summary. Record this as a provenance limitation of that frozen verdict; it is not grounds to re-run it.

## r1 errors corrected in r2

1. r1 said the SEC side is "complete / point-in-time CIK / dead stocks included". That rested on source comments and frozen aggregates, not on a retained corpus. It is now UNVERIFIED.
2. r1 said the raw-plus-splits panel was a single shared input that would unblock rows 2–5. That was false, for the scope reasons above.
3. r1 gave "about 13 more sessions" and "Q1–Q2 2027". Neither date was justified, and both are withdrawn.
4. r1 said a paid OPRA vendor was needed and the owner had declined. That is not established without the current entitlement terms. The precise gap is historical bid/ask.
5. r1 and r2 drew Track D conclusions without the source texts, and said all 8 pages were blocked when only 4 were attempted. It also proposed a new surprise definition. All three are withdrawn.
