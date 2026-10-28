## UPDATE 22 Oct 2026 (read before the SHARED part; it overrides it where they differ)

**Findings corrected by the 22 Oct audit**
- Earnings drift E1 was never put through the full gates. With them added (rule unchanged) it is NOT PROVEN and no longer a buy: it already loses at the 1.2% stress cost in the older half. Its first gated verdict is frozen by the next Sunday run.
- The league bar now counts every study's tries: 1,611, bar about 4.0.
- SEC acceptance times are UTC; six studies read them as New York time (fixed 22 Oct). Their old verdicts are marked "re-run needed".
- Stocks that fall under 3 USD now stay in the study data after entry, so their losses count.
- "Run once" is enforced: each study's first complete verdict is frozen in `firstRun`; later runs write `latest` (monitoring only).
- IG8's live record is 568 trades, 51% won, +0.4% (−0.3% at 1.5x cost) on 5 days: not evidence yet.

**TWO LEVELS (the owner's decision, 22 Oct)**
- PROVEN: every gate and the league luck bar (about 4.0). Unchanged.
- TRADABLE SMALL (tier 2):
  - the rule's own pre-registered test passed in BOTH halves after the 1.2% stress cost;
  - it beats its yardstick (the average stock, or holding);
  - it survives without its 2 best trades;
  - t >= 2.5 in every reported half and block.

  Traded at most 1,000 USD with a stop, always labelled with its odds, and switched off automatically when its own live record turns negative (20+ finished cases).
- Today at tier 2: V15 (LONGER HOLDS) and the switch (STRETCH and SPIKE, buy back 10% lower). The trim rule and E1 do not qualify.
- Your job now has a second target: judge every rule you test for BOTH levels. A tier-2 pass is a real result for the owner, so report which level each tested rule reached. Tier 2 uses each rule's own bar, so it does not tighten as the library grows; the live auto-off is the guard against luck.

**WEB SCOUT (step 4 replaced; first job of every run)**
The owner (22 Oct): "1,600 ideas is nothing compared to what has not been tested; learn from the web daily." Every run starts here:
1. Search for new, sourced ideas in your lane:
   - recent papers (firecrawl_research_search_papers, SSRN, arXiv q-fin, journal pages via WebSearch);
   - practitioner write-ups that state exact rules;
   - well-documented anomalies with published t-statistics.

   Prefer effects with an out-of-sample or post-publication record.
2. Public traders who post dated calls (X, StockTwits, YouTube, Reddit, newsletters): do NOT copy them.
   - If their calls are dated and public, add the source to tip-score: log the calls with dates and score them forward.
   - A source with a positive forward record over 30+ calls on 10+ days becomes a FOLLOW source at tier 2; a negative one becomes FADE.
   - Official APIs and pages a person can read only; no scraping of logged-in pages.
3. Register up to 5 new ideas per run in the library, each with:
   - the source link;
   - the exact rule, written before any test;
   - the data it needs, and whether the system has it;
   - the queue position.

   Then build from the queue as before (at most 2 builds a run). Mark ideas the system cannot test (no data) as "needs data", with what data would unlock them.
4. In the SUMMARY:
   - ideas found this run (with links);
   - which were registered;
   - any source moved to FOLLOW or FADE.

**NOTE (28 Oct 2026):** the money plan changed since this update. TRY SMALL is paper only, and the owner's real lane is LEADER DIP. See CLAUDE.md section 2.
