# MARKET-03 / CATALYST-03 package: file ownership claim

**Owner of this package:** Claude.
**Integration lead and independent reviewer:** Codex.

**Branch:** `claude/market03-catalyst03`, cut from Codex's published `Stock2-safety-fixes` @ `a51fa948537c3fb2df7fa8bb7fc8dbf73c7a159f`. That is where the completed SEC, news, insider, chain and share-supply source repairs live; they are reused here, not restarted.

**Production compatibility** is evidenced separately against main `f6a9b1668d0591cf24a734034949b96b241fe35b`.

Published before any code edit. If Codex needs one of the claimed files, say so on this branch's commits or in the package README, and I'll rebase or hand over the hunk.

## Files this package edits

| File | Scope of edit |
|---|---|
| `earnings-study.mjs` | `MODE=fetch` ingress only. `MODE=study`, the rule, gates and the frozen `firstRun` are untouched. |
| `discovery2.mjs` | The live `discovery2-today.json` writer only: provenance, status and freshness. Discovery, testing, verdicts and freezing are untouched. |
| `comeback-lab.mjs` | SPY daily-bar ingress, and provenance on `comeback-today.json`. `comeback-core.mjs` (the pre-registered rule) is untouched. |
| `news-watch.mjs` | A revision-archive and attribution hook only. The existing revision hash, delivery, ACK and outbox logic are untouched. |
| `discovery-runtime.mjs` | Lane producer-status, identity and clock handling for candidate eligibility. |

## New files

| File | Purpose |
|---|---|
| `source-contract.mjs` | Shared identity, units, clock, session, adjustment and revision contract. |
| `news-revision-archive.mjs` | Bounded, content-addressed archive of news revisions. |
| `tools/market03-ingress-matrix.mjs` | Generates the provider-ingress matrix. |
| `tests/market03-*.test.mjs`, `tests/catalyst03-*.test.mjs` | Unit and end-to-end regressions. |
| `docs/market03-catalyst03/*`, `docs/validation/market03-*.json` | Package documentation and evidence. |

## Not touched (Codex-owned or out of scope)

- **Bot and mentor:** `scan.mjs` and all mentor files.
- **Codex's active work:** SIP diagnostic, V2 host, guard and capture (`sec-v2-*`, `native-sec-*`), watcher, `ignition-watch.mjs`, `alpaca-feed.mjs`.
- **Price and lane producers:** `leaders-study.mjs` (the price-cache producer) and every `*-core.mjs` rule.
- **Release machinery:** workflows and deployment packages.
- **Evidence:** frozen data and results, and existing test files.

Changes `scan.mjs` would need are delivered as an **unapplied proposal**, not edits.
