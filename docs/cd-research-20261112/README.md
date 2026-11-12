# Tracks C and D: data readiness and source mechanisms (12 Nov 2026)

Owner: Claude (accepted in PR #1 comments 6827445114 and 6827466998). Reviewer: Codex.

**Basis.**
- Source snapshot: `origin/main` 6c3ae39d.
- Method: offline and read-only.
- **Not done:**
  - no provider or SEC call;
  - no backtest or outcome computed;
  - no edit to data or workflows.
- Citations to `data/strategy-library.json` are written as SL:line (±1 line).

## Track C: DATA-READY / MISSING-INPUT

**Result: no frozen historical question is DATA-READY.**

- Every historical lab in scope gets its daily prices from the `leaders-study-*` grouped cache. That cache holds the 125 conflicting stock/day rows. These labs restore it with `restore-keys: leaders-study-` (for example `.github/workflows/squad29-lab.yml:42-45` and `value-lab.yml:33-35`):
  - squad15, squad25, squad29;
  - value-lab;
  - the insider labs;
  - the squad6 and squad11 signal sources.
- No other daily panel committed to the repo covers the whole market from 2021 to 2026:
  - `sq19-daily-v1-` covers only 2024-01-02 onward;
  - the squad15 Alpaca SIP bars cover selected stocks only, from 2023-06-01.

| Rank | Question | Pre-registered / frozen | Inputs not from leaders-study | Missing → exact acquisition | Status |
|---|---|---|---|---|---|
| 1 | Ranking model D (SEC live feed), forward | `rank-models.mjs`, frozen 28 Oct; the verdict needs 20 or more sessions and 50 or more picks | Yes: Alpaca SIP outcomes in `data/shadow-outcomes/` | **Time.** About 13 more sessions. The history replay (about 40k free SEC requests) is not approved (`docs/ranking-experiment-2026-10-28.md:98-105`) | MISSING-INPUT (time) |
| 2 | SQ29 F4 late-filing / F6 delisting notices | `squad29-core.mjs:1`; firstRun frozen 27 Oct (SELL-WARNING), so it cannot be re-run | **SEC side complete:** CIK as of the date, acceptance times, dead stocks at −100%, 2021-10-12 to 2026-10-26. **Prices: no** | A coherent price panel (see the shared blocker below) | MISSING-INPUT (prices) |
| 3 | Insider Form 4 (insider-study, C-INS3-60, C-IC1) | `insider-study.mjs:1-9`; frozen | SEC Form 3/4/5 data sets: yes. It uses filing date only, with no acceptance time. **Prices: no** | The same price panel | MISSING-INPUT |
| 4 | Squad 25 (13F / 13D / 13G) | `squad25-core.mjs` header; firstRun and correctedRun REJECTED | SEC side yes. **Prices: no.** Two fails-to-deliver files are missing (202605a/b) | The price panel, plus those 2 free SEC fails-to-deliver files | MISSING-INPUT |
| 5 | B-DREV1 / B-OE1 | **Not pre-registered in any code header.** Library entries only (SL:34703 / SL:34717); no firstRun | No: `value-lab.mjs:86,110` reads the grouped cache | (a) Pre-register in the `value-lab.mjs` header. (b) The `TAGS` list (`value-lab.mjs:149-153`) has no deferred revenue, receivables, payables, accrued or prepaid tags; add them, then fetch the free SEC companyfacts bulk download. (c) The price panel. (d) Identity by CIK (a today's-ticker map drops dead companies) | MISSING-INPUT |
| 6a | SQ15 history (PB12 / MOM / REPL) | `squad15-core.mjs:1`; firstRun frozen 24 Oct (NOT PROVEN) | No. Option bars start 2024-01-18, and there is **no historical option bid/ask**: `squad15-core.mjs:10-14` prices fills from daily bars plus today's OPRA half-spread | Historical option quotes require a paid OPRA vendor, which the owner has declined | MISSING-INPUT (structural) |
| 6b | SQ15-PB12-300 / -2000, forward paper | `squad15b-core.mjs:7,41`; MIN_N 20 | Live OPRA snapshots | **Time.** 17 ledger rows so far, 0 filled entries. With holds of 63–126 sessions, the first 20 closed calls come around Q1–Q2 2027 at the earliest | MISSING-INPUT (time) |

**Closest failed neighbours:**
- B-OE1: ANOM-CFOA REJECTED (SL:11791); B-FCFN1 NOT PROVEN (SL:33269).
- B-DREV1: ANOM-ACC REJECTED (SL:11896); SQ12-REVEPS NOT PROVEN (SL:21902).
- SQ15: SQ15-REPL NOT PROVEN (SL:22358); OPT-LH1 and OPT-CAT1 REJECTED.
- SEC disclosures:
  - ANOM-13D REJECTED (SL:12316);
  - SQ1-INSCLU REJECTED (SL:16426);
  - RQ-ISC-NE-21 REJECTED (SL:31907);
  - SQ25-GIANTSTAKE-A/B REJECTED (SL:30416).

**Shared blocker.** Rows 2–5 all lack the same thing: a price panel that does not come from leaders-study. That is the same object as the parked R-A2 rebuild (raw grouped bars, `adjusted=false`, plus the official split list, about 1,222 GETs on the Massive Starter plan already paid for). Building that panel would unblock rows 2–5 at once, but **only row 5 (B-DREV1/B-OE1) could then produce a first verdict**. Rows 2–4 already have frozen firstRuns. Under CLAUDE.md §4 they can get a `correctedRun` only if the duplicate defect is shown to have affected their actual inputs. Today that is UNVERIFIED: the historical exact-input hashes are unknown.

**Could not verify:**
- whether the `value-cache`, `squad29-cache`, `squad25-cache` and `sq19-daily` Actions caches still exist (unused caches are evicted after 7 days);
- whether grouped daily bars include delisted tickers on every day;
- whether the squad6 and squad11 paper lanes read the study cache.

## Track D: source mechanisms (comment 6820446932)

**Retrieval: all 8 owner-listed source pages are NOT RETRIEVED.**
- This session's network blocks the hosts: DNS failed for the first four, and the rest were not attempted after that.
- The only outside source actually read was the public OpenSourceAP repo, via git: `SignalDoc.csv` (331 signals) and `AnalystRevision.py`.
- Where a mechanism is given below, it comes from Stock-2's own coded version, not the source text.

Evidence classes, kept separate: (a) published claim, (b) verified trade record, (c) testable rule, (d) Stock-2 evidence.

| Prio | Source | (a)/(b)/(c) | (d) Stock-2 evidence and nearest neighbour | Distinct? | Next offline step |
|---|---|---|---|---|---|
| 1 | Costco monthly sales; TSMC monthly revenue | (a) none; (b) none; (c) no entry/exit stated | No rule in the repo. B-NOW1 is queued (SL:2860, needs dated consensus); SQ1-GUIDEUP REJECTED; SQ12-RAISECONF and SQ12-REVEPS NOT PROVEN | **Yes.** A monthly disclosure is more frequent than quarterly | Use cached SEC data to list the issuers that file monthly 8-K/6-K sales releases. Define "surprise" only against the company's own history, because consensus is paid and undated |
| 2 | Cambridge peer-information paper | (a) academic; (c) codeable once the paper's spec is read | ANOM-INDMOM REJECTED; SQ16-IND12 REJECTED; SQ1-CUSTMOM REJECTED; ANOM-RESMOM and SQ28-SUPDRIFT NOT PROVEN | **Partly.** The ½·peer + ½·(own−peer) blend equals ½·own, so it adds nothing. Only a ridge peer set built from several characteristics is new | Read the paper once its host is allowed. Check that the characteristics are covered by the price and companyfacts caches. Register one version only |
| 3 | OpenSourceAP | (a) published replications; (c) yes | 23 anomaly entries already cite it (`anomaly-core.mjs:29`). AnalystRevision maps to ANOM-REVISION, "needs data" (SL:12690); its input is paid I/B/E/S | A registry aid, not a new signal | Map all 331 SignalDoc signals to SL ids. Flag the analyst-data (paid) rows. List the free-data rows that are unmapped, with no new thresholds |
| 4 | EP / earnings continuation (Qullamaggie, Stockbee, SMB) | (a) yes; (b) none; (c) yes, as already coded | **Day-1 opening range:** SQ2-EPORB REJECTED (SL:17193); A-ORB1 REJECTED. **Day-2 open:** DEC-EP REJECTED (SL:4070) and all EP exit variants REJECTED. **Multi-day base:** E16 NOT PROVEN; UNDER5-EPS-LOW REJECTED; SQ12-EGAPHOLD NOT PROVEN | **No.** All three entry timings are frozen | Once the pages are readable, diff the source text against `decoded-core.mjs` and `squad2-core.mjs`. Log any mismatch; no re-run |
| 5 | OIC options webinar | (a) education only | SQ15 NOT PROVEN; OPT-LH1 and OPT-CAT1 REJECTED; there is no historical option bid/ask (`squad15-core.mjs:10-14`) | No | None |
| 6 | Damodaran valuation templates | (a) teaching templates; not a rule | V3, V6 and V13 NOT PROVEN | Not a signal | Use only as an assumption sheet, never as a BUY score |
| 7 | Kinfo verification | (b) possible in principle, not accessible | FOLLOW-KINFO queued (SL:3474); `data/follow-board.json` records no public API and a login wall | Distinct as an evidence grade, but blocked | Keep it queued as "blocked: login" |
| 8 | TraderTV Live | (a) yes; (b) none | `data/follow-board.json`: NO EDGE on 1,005 calls parsed from titles (average −1.8% at 20 sessions, t −2.38) | No | None |

**Cross-cutting findings:**
1. **The EP family is saturated in the repo.** Every entry timing is already frozen.
2. **Monthly business updates are the only new mechanism**, and the expectations data is the blocker.
3. **No source offers a verified full trade record.**
4. **The options history cannot meet CLAUDE.md §4.6 ("real option prices only")** with free or official data. The repo already says its fills are modelled from daily bars plus today's spread.

**Process:** delegated sub-investigations, with key citations spot-checked by Claude (`value-lab.mjs:149-153`, `squad15-core.mjs:10-14`, `squad29-lab.yml:42-45`, SL ids, `follow-board.json`). No promotion, re-test or threshold change is proposed.
