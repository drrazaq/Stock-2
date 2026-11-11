# Focused review: LFST / GCT / BB primary assessments, f475ff6e (handoff 6795687664)

Research review only. Stage 1 (Thursday) and Stage 2 are untouched. No production action, no provider or paid service.

## Reproduced

- `complete.py` reproduces `arithmetic.json` exactly.
- 24 independent recomputations from `primary-facts.json` all match the stated figures:
  - **LFST:** principal less cash 53.057; the debt bridge to 255.524; operating cash flow less capex 132.622; the implied repurchase price $13.02, which is the offering price less the underwriting spread and consistent.
  - **GCT:** revenue +27.3%; operating cash flow −34.2%; operating cash flow / net income 63.4%; working-capital uses 74.646; 417.998; 474.744; diluted shares −4.74%.
  - **BB:** licensing share 13.5%; note shares 8.77%; 447.1.
  - **Whole-share and fee diagnostics:** 68, 16 and 108 shares; 0.604%, 0.632% and 0.603%.
- The labelling meets the mission's requirements: INVESTIGATE BUSINESS / WAIT, no adopted entry or exit attached, ZAD UNKNOWN, prices dated to the 9 Nov retained session with no executable quote, and business falsifiers that are not stops.

## Verdict: PASS on arithmetic, internal consistency and labelling, with two corrections

**R1. Source facts cannot be independently verified.**
- My container's network policy denies the issuer and SEC hosts (proxy CONNECT 403), so I could not re-fetch the seven receipts or check their sha256 values.
- Your raw HTML exists only at `/workspace/research-primary-evidence-20261111/` on your machine. Every transcribed figure therefore currently rests on one reader.
- **Fix:** commit verifiable excerpts. For each figure: the source ID, the exact quoted line or table cell, and its byte or character offset in the hashed document. SEC filings are public-domain government records and can be committed whole. Issuer press releases should be quoted excerpts only.
- Until then the facts are **SINGLE-READER, UNVERIFIED BY CLAUDE**. That is not a defect finding.

**R2. The BB conversion exposure is understated.**
- $200M principal / 51.5M initial-rate shares means an **implied conversion price of about $3.88**, against the $9.22 reference price. The notes are about 2.4× in the money.
- At that reference price, full conversion value is about **$475M**, which exceeds the reported $447.1M of cash and investments (itself not all available cash).
- So, with the window open (Oct–Dec), realistic settlement involves **substantial share issuance or a cash outflow beyond principal**. It is not a remote exposure.
- **Fix:** state the implied conversion price and the in-the-money value explicitly, labelled as derived arithmetic from transcribed figures. Before relying on it, verify the conversion rate and settlement terms in the 10-Q or indenture: the 51.5M figure must be the full-principal count at the initial rate.
- Nothing about the trade changes. It remains WAIT, with no rule.

**Minor (no change required).** The BB share count (587.032M as of 21 Sep) predates the Oct–Dec window, so it cannot reflect window conversions. Your wording is consistent with that.

**Remaining gaps, as you state them:** LFST offering close and repurchase on 12 Nov; BB conversion requests and settlement; the current adopted rule or signal; executable quotes; broker mapping; owner ZAD; point-in-time controls and outcome chains.
