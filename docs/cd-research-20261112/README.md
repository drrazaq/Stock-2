# Tracks C and D: data readiness and source mechanisms (12 Nov 2026), revision 2

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

**Result: no frozen historical question is DATA-READY on inputs I can actually verify.**

| Rank | Question | Pre-registration / frozen state | What is actually verified | Missing (exact) | Status |
|---|---|---|---|---|---|
| 1 | Ranking model D (SEC live feed), forward | `rank-models.mjs`. Frozen 2026-10-28: evalFrom 2026-10-29, minSessions 20, minPicks 50 (`shadow-report.json` ranking.frozen). 28 and 29 Oct excluded (admissionDecision). | Report at 02:03Z 12 Nov: **35 picks, 7 sessions**. prospectiveAdmission NOT_ESTABLISHED. | Sessions and picks. The maturity date is **UNKNOWN**: it depends on the future pick rate and on data completeness, so I give no date. The history replay is not approved (`docs/ranking-experiment-2026-10-28.md:98-105`). | MISSING-INPUT (time) |
| 2 | SQ29 F4 late filing / F6 delisting notice | `squad29-core.mjs:1`. firstRun frozen 27 Oct; no re-run allowed. | Only the aggregate coverage claims in `squad29-lab.json`. | The raw SEC corpus (`squad29-cache`, `squad4-cache`): retention, manifest and completeness are UNVERIFIED. The price input is `leaders-study-`. | MISSING-INPUT, SEC-side coverage UNVERIFIED |
| 3 | Insider Form 4 (insider-study, C-INS3-60, C-IC1) | `insider-study.mjs:1-9`; frozen. | Aggregate verdict file only. | The raw Form 3/4/5 corpus (cached, UNVERIFIED). The price input is `leaders-study-`. | MISSING-INPUT |
| 4 | Squad 25 (13F / 13D / 13G) | `squad25-core.mjs` header. firstRun and correctedRun REJECTED. | Aggregate only. | The cached SEC corpus (UNVERIFIED). Fails-to-deliver files 202605a/b are absent per the lab. The price input is `leaders-study-`. | MISSING-INPUT |
| 5 | B-DREV1 / B-OE1 | **Not pre-registered in any code header.** Library entries only (SL:34703 / SL:34717). No firstRun. | The `value-lab.mjs:149-153` TAGS list has no deferred-revenue, receivables, payables, accrued or prepaid tags. | Missing independently of any price panel: the tags, a point-in-time CIK identity, acceptance times, and the companyfacts corpus (`value-cache`, UNVERIFIED). | MISSING-INPUT |
| 6a | SQ15 history | `squad15-core.mjs:1`. firstRun frozen 24 Oct (NOT PROVEN). | The probe of 24 Oct (`squad15-core.mjs:10-14`): historical option quotes endpoint 404; daily option bars from 2024-01-18. | **The precise gap is historical option bid/ask.** Whether any current entitlement provides it, and on what terms, is UNVERIFIED. r1's "paid vendor needed / owner declined" is withdrawn. | MISSING-INPUT (historical bid/ask) |
| 6b | SQ15-PB12-300 / -2000, forward paper | `squad15b-core.mjs:7,41`, MIN_N 20. | 17 ledger rows, 0 filled entries. | Closed calls. With zero fills, no closure date can be predicted. r1's "Q1–Q2 2027" is withdrawn. | MISSING-INPUT (time) |

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

## Track D: source mechanisms (comment 6820446932)

**Retrieval.** 4 hosts were attempted from this session and failed DNS:
- qullamaggie.com
- stockbee.blogspot.com
- smbtraining.com
- investor.tsmc.com

The other listed pages were **not attempted**: Costco, the Cambridge repository, NYU Stern, tradertv.live, kinfo.com and optionseducation.org.

The only outside source actually read was the public OpenSourceAP repository, via git:
- `SignalDoc.csv` (331 signals);
- `Signals/pyCode/Predictors/AnalystRevision.py`. Its input is `IBES_EPS_Unadj.parquet`.

**Because no source text was read, this track cannot conclude anything about what the sources say.** In particular it cannot say:
- that a mechanism is new or not new;
- that a family is "saturated";
- that a source has no full trade record;
- that no options approach is possible.

The table below only maps each source **topic** to Stock-2's own registry rows. Codex will supply public primary-text extracts; mechanism extraction waits for those.

| Source topic | Stock-2 registry rows on the same topic (verdicts as recorded) | Status |
|---|---|---|
| Episodic pivot / earnings gap (Qullamaggie, Stockbee, SMB) | SQ2-EPORB REJECTED (SL:17193). DEC-EP REJECTED (SL:4070). E16 NOT PROVEN. UNDER5-EPS-LOW REJECTED. SQ12-EGAPHOLD NOT PROVEN. ANOM-SUE NOT PROVEN. | Text not retrieved. Whether Stock-2's coded versions match the sources is **untested**. |
| Monthly business updates (Costco, TSMC) | B-NOW1 queued (SL:2860; needs dated consensus). C-REV1 queued. SQ1-GUIDEUP REJECTED. SQ12-REVEPS NOT PROVEN. | Text not retrieved. B-NOW1 is preserved as queued. r1's "surprise vs own history" idea is withdrawn as an unapproved new hypothesis. |
| Peer information (Cambridge paper) | ANOM-INDMOM REJECTED. SQ16-IND12 REJECTED. SQ1-CUSTMOM REJECTED. ANOM-RESMOM NOT PROVEN. C-PEER1 queued. | Text not retrieved. One algebraic fact holds whatever the paper says: ½·peer + ½·(own−peer) = ½·own. |
| Damodaran templates | V3, V6 and V13 NOT PROVEN. | Text not retrieved. |
| TraderTV | `follow-board.json` scores **title-parsed** calls: NO EDGE at 20 sessions. That is not a full trade-record or live-mention audit. | Text not retrieved. |
| Kinfo | FOLLOW-KINFO queued (SL:3474). `follow-board.json` records "not reached". | Text not retrieved. |
| OIC options webinar | SQ15 rows (above); OPT-LH1 and OPT-CAT1 REJECTED. | Text not retrieved. |
| OpenSourceAP | 23 anomaly rows cite it (`anomaly-core.mjs:29`). AnalystRevision maps to ANOM-REVISION, "needs data" (SL:12690). | **Retrieved** (repo files above). Next offline step: map all 331 acronyms to SL ids, preserving failures. |

## r1 errors corrected in r2

1. r1 said the SEC side is "complete / point-in-time CIK / dead stocks included". That rested on source comments and frozen aggregates, not on a retained corpus. It is now UNVERIFIED.
2. r1 said the raw-plus-splits panel was a single shared input that would unblock rows 2–5. That was false, for the scope reasons above.
3. r1 gave "about 13 more sessions" and "Q1–Q2 2027". Neither date was justified, and both are withdrawn.
4. r1 said a paid OPRA vendor was needed and the owner had declined. That is not established without the current entitlement terms. The precise gap is historical bid/ask.
5. r1 drew Track D conclusions without the source texts, and said all 8 pages were blocked when only 4 were attempted. It also proposed a new surprise definition. All three are withdrawn.
