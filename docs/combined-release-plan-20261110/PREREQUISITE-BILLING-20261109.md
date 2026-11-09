# Release prerequisite record: GitHub Actions spending control ($0)

- **Recorded:** 2026-11-09 12:34 UTC, from the owner's message in the Claude session (session_017cC8uWFU58B3u4ZSirToHT).
- **Owner's statement:** "the account-wide Actions budget is $0.00 and shows '100% — Usage blocked.' No billing settings were changed."
- **Status:** the prerequisite "existing $0 control confirmed by the owner" in protocol `d2f76b645947f0ce8ac874c44a86d8a56a7eab69` §7 is **satisfied by owner attestation**. Neither agent can read billing settings, so this is the owner's confirmation and was not independently verified.
- **This is not deployment approval.** The owner's approval text, the R-A choice and the session A request are all still outstanding.

## What it means for the release

- "Usage blocked" at a $0 budget means that metered usage beyond the free allowance is **stopped instead of billed**. That is the intended $0 control.
- `drrazaq/Stock-2` is a public repository. Standard GitHub-hosted runner minutes for public repositories are not metered, so the release's own jobs are expected to run as usual: the push Tests, scanner, watcher, calendar and nightly scan.
- Evidence consistent with that: Actions runs in this repository were observed starting and running on 9 November while the budget showed 100%.
- **Residual:** if any job a release check needs were to be blocked by billing, that check is FAILED or UNVERIFIED under the protocol. It is never treated as passed, and no budget change is part of this release.
- **Re-check at session A:** the owner re-confirms the $0 setting if anything has changed. The fresh census confirms that jobs actually start.
