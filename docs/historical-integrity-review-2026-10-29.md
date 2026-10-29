# Historical evidence integrity review

This review reads frozen results; it does not rerun, retune or rewrite them. The source checkpoint is `e717c657ff3a726bbb1f8e6e3d232c2a3b1c9b6b`.

The registry contains **747 unique strategy IDs**, with no duplicates. Its entries contain no structured `registeredAt` timestamps or paired holdout boundaries. That is a gap in machine-verifiable provenance, not proof that written preregistration never existed elsewhere. Status text, a high win rate, a favorable corrected run or the label PROMISING cannot establish a new approved BUY.

The companion manifest covers all **51** `data/*-lab.json` and `decoded-history.json` blobs, **35,367,699 bytes**. Each source blob is pinned by Git hash. Metadata traversal records first-run/corrected-run paths, verdicts and protocol/identity/holdout field names through depth eight. Historical trade arrays and original source authenticity are outside this traversal. Eight connector responses were truncated; their complete public files were downloaded read-only into scratch storage and independently verified against the original Git blob IDs before parsing. No truncated response was classified as a corrupted study.

Missing structured CIK/security-history, dead-stock denominators and holdout metadata remain unverified. A present field is also not certification that its contents are correct. Existing rejected verdicts and corrected-run history remain intact. The metadata registry audit is complete; economic replay and historical performance acceptance are not.

## New-evidence admission checks

`historical-integrity.mjs` and `tools/check-research-evidence.mjs` reject malformed or unresolved new evidence before a performance claim:

- A symbol must resolve to one documented security and issuer within the actual validity interval, using information known at decision time. A current ticker, issuer CIK alone, future mapping or ambiguous share class cannot identify an old security.
- Registration/parameter hashes and explicit train/holdout bounds must agree. Training outcomes cannot cross the holdout boundary; the holdout cannot be used for parameter selection.
- Universe membership must have point-in-time intervals and provenance. Current survivors alone do not establish a historical denominator.
- A delisted security needs documented terminal value. Missing exit data remains unresolved; it is neither silently excluded nor automatically assigned zero. Documented worthless outcomes are retained.
- Entry/exit prices must use consistent corporate-action adjustment bases, valid chronology and explicit nonnegative costs.

Even passing these structural checks returns **STRUCTURE_VALID_ONLY**, never profitability certification or BUY approval. The validator is an explicit tool for new evidence; it is not retroactive validation of the frozen studies and does not replace any existing safety gate. Run it with `node tools/check-research-evidence.mjs EVIDENCE.json`. No provider call, order, Telegram message or result-file write occurs.

Next evidence needed: historical security lineage including ticker reuse/share classes, source-specific delisting coverage and documented terminal treatment, original point-in-time universe snapshots, immutable parameter registration, purged holdout samples, executable after-cost replay and independent prospective confirmation. No new profitability conclusion is supported yet.
