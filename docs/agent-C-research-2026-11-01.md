# Agent C (Crowd) research, 1 Nov 2026

This run was due Thu 29 Oct and ran late, on Sun 1 Nov.

**Score: Agent C Crowd: 0 points.** Tested this week: C-INSQ1 (too few cases), C-CONG1-20 (rejected), C-CONG1-60 (rejected), EXP-CONG1 (too few cases). C-GOV1 was closed from its 25 Oct run. Champion: E3 (unchanged).

**Tier:** no rule reached tier 2 (TRADABLE SMALL), the TRY SMALL bar, or PROVEN.

## 1. Results (each rule run once; first verdict frozen in `data/agent-c-lab.json` firstRun)

| Rule | Idea | Trades older / newer | Avg after 0.8% (older / newer) | Avg after 1.2% stress | Edge vs average stock | Block t | Verdict |
|---|---|---|---|---|---|---|---|
| C-INSQ1 | 2+ insiders buy 200k+ USD in 5 sessions, in a B-FCF1 cash-rich company above its 200-day average; hold 63, 15% stop | 0 / 5 signals | not computed | not computed | not computed | – | TOO FEW CASES (pre-registered count-first rule) |
| C-CONG1-20 | Every House member stock purchase, bought after the PTR filing date, held 20 sessions | 1,700 / 3,307 | −0.8% / +0.6% | −1.2% / +0.2% | +0.8% / −0.2% | 1.41 / −0.41 | REJECTED |
| C-CONG1-60 | Same, held 60 sessions | 1,299 / 2,332 | −0.6% / +3.0% | −1.0% / +2.6% | +0.9% / −0.1% | 0.96 / −0.28 | REJECTED |
| EXP-CONG1 | Top-10% House members, ranked point in time by their earlier purchases; hold 126, 35% stop | 12 / 34 | −6.0% / −3.5% | −6.4% / −3.9% | −11.0% / −5.3% | – / −3.49 | TOO FEW CASES |

More detail:

- **C-CONG1 coverage:** 1,150 different stocks, 575 entry days and 106 members (20-session version).
- **C-CONG1 median and worst trades:**
  - 20 sessions: median −0.9% / +0.1%; worst −39% / −59%.
  - 60 sessions: worst −90% / −62%.
- **C-CONG1 averages by year** (60 sessions, after cost):

  | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
  |---|---|---|---|---|---|
  | −8.2% | −2.9% | +2.6% | +2.3% | +3.7% | +2.0% |

  Members' buys rise with the market, but they do not beat the average stock on the same days.
- **EXP-CONG1 comparison:** buying every member's purchases did +0.9% / +7.0% over 126 sessions (newer edge −0.5%). The top-ranked members did worse than that (newer t −3.49). Ranking members by their past purchases picks no skill. The rule needs 20 cases per half, so its verdict is TOO FEW CASES; it is not a FADE verdict.
- **C-INSQ1 filters:** 2,190 clusters fell in the first 200 sessions, before a 200-day average existed. Of the rest, 1,969 had no price, 1,944 were not liquid, 1,682 were under their 200-day average and 272 failed B-FCF1. This repeats DEC2-INSQ (7 / 16 cases): the combination is too rare to test.
- **C-GOV1 (closed):** the parent-mapped version C-GOV1b ran once on 25 Oct with 33% of awards matched. Only 9 awards in 5 years were worth 20% or more of the company's market cap, so it is TOO FEW CASES. The information version (any award of 50M USD or more) was REJECTED. It was not re-run. The library was updated.

**What it means for the owner:** do not copy Congress members' trades, whether all of them or the "best" ones. The published post-2012 result (NBER w35041) is confirmed on 2021–2026 House data.

## 2. Data and method

**Congress data:**
- **Index:** the House Clerk yearly index `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/<YEAR>FD.zip`, 2021–2026: 3,177 PTRs.
- **Downloads:** all 3,177 PDFs downloaded (`/public_disc/ptr-pdfs/<YEAR>/<DocID>.pdf`) and read with `pdftotext -layout` on the Actions runner.
- **Scanned filings:** 485 PTRs (15%) are scanned images with no text layer. They are left out, because the system has no OCR.
- **Tickers:** 22,145 of 23,379 stock rows (94.7%) have a ticker.
- **Purchases:** 7,853 purchase events.
- **Filing lag:** the median gap from trade to filing is 29 days.
- **Signal date:** always the FILING date, never the trade date.
- **Senate:** not included, because there is no bulk route.

**Parser:** `parsePtrText` in `agent-c-core.mjs` is a JavaScript rewrite inspired by trader-skill `trader-pelosi/ptr.py` (MIT, github.com/Jakeschincariol/trader-skill). No code was copied.

**Parser bug fixed before any return was computed:**
- DIAG run 1 showed ticker coverage of 89.1%, under the pre-registered 90% data bar.
- DIAG run 2 dumped the raw text. The 2021-era PDFs turn some capital letters into lower case in their text layer, for example "(AlB)" and "(gOOg)".
- Tickers are now matched without regard to case (parser v2, with a test). The bar was not changed.

**Insider data:**
- 139,160 Form 4 open-market purchases from squad 1's SEC data-set cache (23 quarters, read only).
- The B-FCF1 check uses value-lab's companyfacts cache (3,694 companies) through `fcfCheck`, unchanged.
- Lookups use the issuer CIK, not today's tickers.

**Price data:** the whole-market cache including dead stocks, 2021-10-12 to 2026-10-30.

**Testing:**
- Entry at the next open; costs 0.8% (stress 1.2%); +300% cap on both the rule and the yardstick.
- Judged with the value-core judge; proof bar 4.09.

## 3. Tip sources (tip-score, Sunday run of 1 Nov; prices to 19 Oct)

- **No FOLLOW source.** No source has reached the tier-2 sample yet (30+ tips on 10+ days).
- **FADE (base rule):**
  - **Reddit crowd:** 30 tips on 5 days; 5-session edge −3.5% vs the average stock (t −9.1); 30% win.
  - **YouTube VerifiedInvesting:** 19 tips on 5 days; edge −2.6% (t −2.06).
- **Too early:** ARK daily buys (0 finished), Analysts turning positive (19 tips, 1 day), Insider buying (3), ZipTrader (6, 2 days), and the rest.
- **Congress members as one source (historical, from C-CONG1):** no edge either way; edge +0.8% / −0.2%, t 1.41 / −0.41. Neither FOLLOW nor FADE.

## 4. Web scout (registered in `data/strategy-library.json`)

1. **C-CONG2: unreadable (scanned) PTRs.**
   - Source: Dong, Xu & Yu, May 2026: https://abfer.org/media/abfer-events-2026/annual-conference/slides-corporate/20260520-CorpFin-Unreadable-Political-Trades.pdf
   - Finding: trades in paper or scanned filings earn about 37 bps more over 22 days and are filed later.
   - Status: needs data (OCR of the 485 scanned PTRs). This is the one Congress angle still open.
2. **C-F144X: Form 144 sale notices that expire without a sale.**
   - Source: Neupane 2026, https://arxiv.org/abs/2602.17890
   - Finding: only the large-cap alpha is significant (14.5 bps a month, t 2.30).
   - Status: queued, low. EDGAR Form 144 data only starts in 2023.
3. **C-INS52W: insider purchase far below the 52-week high.**
   - Source: Zhao 2026, https://arxiv.org/abs/2602.06198
   - Status: not built. It is a 1–3 day microcap reaction, a short hold, which is the closed lane.

Other sources read: NBER w35041 (already in the library), and practitioner pages on copying Congress after the 45-day delay (no exact rules, so not registered).

## 5. Files and commits

**Files (all new, Agent C's own):**
- `agent-c-core.mjs` (rules pre-registered in its header)
- `agent-c-lab.mjs`
- `.github/workflows/agent-c-lab.yml` (one-shot, push of `run-agent-c-now.txt`; no schedule)
- `test/agent-c-core.test.mjs`
- `data/agent-c-lab.json`
- `data/agent-c-diag.json`
- `data/house-ptr.json.gz` (7,853 dated House purchases, for later tip-score or follow-lane use)
- `data/agent-c-run.log`

**Commits:**

| Commit | What |
|---|---|
| 97001c3 | Pre-registration, lab, first DIAG |
| a2d705a | DIAG 1 result |
| 9a8ecbe | DIAG raw-text dump |
| c34c51c | DIAG 2 result |
| cfa0f67 | Parser v2 and LAB trigger |
| fde105e | LAB result (frozen verdicts) |

## 6. Next in the Agent C queue

1. C-CT1.
2. C-S8 and C-LOCK as avoid rules.
3. C-IC1, C-INS3, C-SI1.
4. C-CONG2, if OCR is approved. Adding tesseract to the runner is free, but it is a new tool.
