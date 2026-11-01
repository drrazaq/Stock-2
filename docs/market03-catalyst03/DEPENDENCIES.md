# MARKET-03 / CATALYST-03: dependencies outside this package (concrete proposals)

**Author:** Claude, 2 Nov 2026.

Nothing below was done. Each item needs the named decision-maker and is written so it can be approved or rejected as one unit.

## D1. Integration and release (Codex, then the owner)

**What:** take this package's code commits onto the integration line, then into production by the existing release process.

**Precondition:** this package is built on `Stock2-safety-fixes` @ `a51fa948`. It depends on Codex's unmerged source repairs there:
- `news-source.mjs`, `news-revision-state.mjs`, `research-collector.mjs`, `discovery-runtime.mjs`;
- the share-supply, insider, chain and SEC caller repairs.

Production main `f6a9b166` lacks those files, so the package patch cannot apply to main by itself. The compatibility evidence shows exactly which files differ.

**Proposed order:**
1. Codex reviews this package.
2. Codex cuts its next release package from the integration line that includes these commits.
3. The owner approves that release.

## D2. `scan.mjs` changes (main session / Codex; owner if ACTIONS wording changes)

**What:** `proposal/scan-market03.patch`. It is unapplied and is 45 lines.

**Status:** applies cleanly to both the package branch and production main. `proposal/check-scan-proposal.mjs` shows the before and after behaviour.

**Effect:**
1. **EARNINGS DRIFT:** the reaction day uses the exchange calendar, so an after-the-close report before a market holiday is no longer silently skipped.
2. **Twelve Data daily bars:** they must name the requested symbol and have valid, finite prices. An empty or foreign series becomes an error, not "no history".

**What does not change:** no rule, threshold or wording.

## D3. Privacy: `news-log.jsonl` is public (owner decision; privacy migration owner)

**Finding:**
- The 28 Oct privacy commit `d2d77cb` listed `news-log.jsonl` as a private file.
- It is not in `.github/private-files.txt` on main or on `Stock2-safety-fixes`.
- `news.yml` commits it, together with `news-delivery.json`, to the public repository.
- The log records threat headlines per held symbol, so it reveals holdings.

**Proposal:**
- Restore `news-log.jsonl` to the private list as part of the approved cutover.
- Decide whether `news-delivery.json` (delivery state per story key) is private too.

**Consequence for this package:** the news field archive stores digests only, never story text. Keeping full revision text (CATALYST-03's "immutable full body archive") needs a private path. Once the owner picks one, the archive can add text with no other change: it is keyed by the same revision ids.

## D4. Live collection and provider evidence (owner; data reviewer)

**What this package does:** fixture-only provider shapes. No provider was called.

**To turn shape contracts into observed evidence:**
- **(a)** One approved, dated, read-only collection day per provider: AV, FMP, Finnhub calendar and company-news, and Massive SPY. It records raw responses with their access clocks under the existing archive rules.
- **(b)** Compare those responses with these contracts: status counts, identity mismatches, pending rows, revisions.

This is CATALYST-04 / MARKET-04 territory, and needs explicit approval of dates, scope and storage.

## D5. Paid data and credentials (owner)

**Not needed by this package.** No new key, binding or purchase.

**For authoritative security identity** (share classes, ticker changes, preferreds), an official reference such as OpenFIGI (already probed in `expert-probe.mjs`) or exchange listings would be required. The owner has declined paid data until the system pays for itself. Until then, ambiguous aliases stay UNKNOWN by design.

## D6. Policy (owner)

**No policy is changed by this package.**

**Behaviour changes that are data-quality protections (listed for transparency):**
- **Earnings:**
  - cross-provider values that agree to the cent count as corroboration, not conflict;
  - a provider with no timing does not conflict with one that has timing;
  - an FMP answer carrying another symbol stores nothing.
- **Discovery2:** lines from a price cache older than the previous completed session move to `retainedBuys`, so they are not shown as today's buys. This affects what `scan.mjs` can print; finding D06 / policy question P4 of HISTORY-03 is unchanged.
- **Comeback:** signals from a lab file with no close date, or a stale one, are held back with the reason. No COMEBACK methods exist on current data, so nothing shown today changes. `squad19` and `squad26` today files lack `lastClose` and would be held back if they ever qualified.
- **News:** a story re-attributed to different symbols, source or category is held back as ATTRIBUTION_CONFLICT. This is latched, like Codex's revision conflicts.
