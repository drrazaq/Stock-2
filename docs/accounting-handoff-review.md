# Independent accounting handoff review —30October2026

The actual attachments are now available and authenticated by SHA256:

- accounting-fixes.patch:8aabacc73299f0d973f749836133ab99ebbdc31a9fa9072ff5c7674d8029d495.
- README.md:0a1d90d0dae88eace8f06150764f7bc238ecf94717103f952e804e75c2061452.

The patch header identifies Claude's local26e707a3e266a7c8d63166a014f8584d8e766c15, based on49b9b90. That Git commit was not fetched or claimed recovered. The attachment was applied after an exact compatibility check to the published incident branch7988228325b514e3076e362ee09d2efc5a9c663e. Its scan edits do not overlap the watcher, focus, health, cohort or scorecard repairs. The original five synthetic tests were retained unchanged.

Independent verification reproduces **four failing defect tests and one passing control on49b9b90**; **all five pass** on the combined current source. The complete current suite passes187Node files/1,764reported cases plus two standalone scripts. That independently supports the current combination; it does not claim to have rerun Claude's separate184-file environment. The isolated proposed production scan also passes5/5.

The four repairs are bounded: a stated part sale with unknown held quantity records nothing and retains the position/alerts; a one-share holding cannot book a zero-share half sale; add-more reaches the actual recording handler; at-stop wording distinguishes a kept gain from a loss and subtracts the assumed two order fees. Tests use a localhost Telegram fixture and a synthetic encryption key, with no owner data or real delivery.

[Separate production patch](validation/accounting-production-fix.patch) and [manifest](validation/accounting-production-manifest.json) change only scan.mjs AFTER the isolated watcher proposal; both base/result hashes are explicit. This is a separate accounting commit/package, not permission to deploy or a privacy migration. Recheck compatibility if the watcher proposal or production source changes.

These repairs do **not** reconcile historical private and normalized journals, migrate shares or money, change owner fills, adjust past fees, change size-ladder remainder weights, count partial sales as whole trades, remove legacy spread costs or repair every command's fee assumptions. The at-stop estimate models two fees; prior buy lots, repeated sale fees, spread/slippage, halts and gaps can make actual results worse. It is not a guaranteed fill or complete cost-basis calculation. Those unresolved policies require explicit specification and evidence before changing records or size. No actual private record was read/decrypted/migrated.

No deployment, dispatch, real message, order, purchase, secret or permission change occurred. Hosted CI must be checked against each exact published accounting/final SHA before calling that milestone published-and-verified; see validation/accounting-handoff-review.json. Keep this package separate from watcher preservation and from any privacy proposal.
