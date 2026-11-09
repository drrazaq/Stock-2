# Minimal prospective SEC reference retention — assessment only, inactive

Purpose: retain a body the existing discovery run already downloads, so a later identity join can cite original response bytes/receipt rather than the derived sec-ciks cache. This is NOT the seven-request proposal and does not establish class, eligibility or profitability.

Smallest bounded scope for independent review:
- One existing logical discover.mjs request to https://www.sec.gov/files/company_tickers.json, on one ordinary already-authorized discovery invocation. Zero additional GETs, no dispatch and no request made merely to capture. Existing request/retry behavior unchanged; no extra retry from retention.
- At most ONE successfully received JSON body, maximum4MiB, stored byte-for-byte as delivered by Fetch before parsing/normalization, content-addressed by SHA256. This is decoded HTTP body, not compressed wire packets.
- One accompanying receipt, maximum4KiB, total retained payload bound4MiB+4KiB. URL/status, request-start/response-complete clocks, exact body length/hash, available content-type/ETag/Last-Modified, source commit and available run/job IDs. Missing fields UNKNOWN. No request headers/User-Agent/contact email, authentication, holdings, trades or messages.
- Single publisher: existing discovery workflow only. Once receipt/body exists, stop retention for this bounded experiment. No rolling archive, automatic deletion, overwrite, second body or continuous capture.
- Oversize, failed, malformed or storage-conflicting response: mark capture UNVERIFIED and preserve originals; no additional request. Normal existing consumer behavior must remain separately tested, not silently replaced by an empty map. Implementation would need actual save/rebase and crash-boundary tests before approval.
- No private executor/account/key needed for this public response. No change to Alpaca/Telegram/production credentials, permissions, workflows or settings. Proposed additional service spend0; no purchase/paid runner. Exact future source/storage paths and code/binding must be reviewed before any activation.
- Terminal deliverable: exact associations and missing/colliding raw ticker labels across the frozen3000-label population, with source/receipt lineage. Stop after that report. Unmatched, class, halt, current tradability, successor and historical point-in-time gaps remain UNKNOWN; it cannot score an entry/exit or replace ZAD/BBO/outcome evidence.

Current state: DESIGN ONLY. No retention code activated, no response captured, no additional acquisition. No owner setup or approval is requested by this note. Seven requests remain deferred; the approved release package does not include this change.
