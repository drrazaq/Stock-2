# Development full-session correction — no deployment

Separate from main, Stage1, Stage2 and validated113 successor. Base dfa03f36 retains closed radar/bulk source. Corrects both queued workflow jobs to fetch the immutable event SHA before restore; updates development full-session guard caller to scheduled cash close (legacy core default900 unchanged); timestamps news quote freshness at receipt rather than startup, retaining strict nonfuture/180-second bounds.

Actual watcher pre-open wait had been swallowed by a comment; restored it. A snapshot crossing a minute is attributed to receipt, and a response beyond segment/session end is not scored as an earlier market minute. 16:00 context is not a391st regular minute. Regular session390, halfday210, legacy09:30–15:00 inclusive331. Original research15:00 endpoint unchanged. No frozen strategy rescoring or quote acquisition.

Focused fixtures launch actual watcher at opening/last minute and force a fetch to cross the close; inspect persistent run archives and coverage. Actual news caller receives a delayed current quote crossing its original stop and must retain notification. Existing send/journal/unknown/retry boundaries are retained, not substituted by helper tests. Full applicable receipts and independent review are required before composition; source fingerprint repins preserve existing assertions and historical packages in Git.

This cannot create a host through GitHub scheduling/runner outages, recover unobserved minutes or prove provider entitlement. Full-session window is DEVELOPMENT ONLY and is not added to approved workflows/packages. Activation, permissions, spending, capture, dispatch and production writes remain unauthorized.
