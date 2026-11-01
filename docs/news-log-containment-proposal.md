# News-log privacy containment — proposal only

Observed read-only on 1 November 2026. No containment, migration, deletion, workflow change or history rewrite has been executed.

## Confirmed exposure and limits

At production main `f6a9b1668d0591cf24a734034949b96b241fe35b`, `data/news-log.jsonl` is publicly readable through GitHub. Its schema contains symbol-specific headline/selection context and decision rows. Those decisions can disclose holding context. No individual record, symbol, financial amount or identifier is reproduced here.

Production `news-watch.mjs` appends both selected news and per-symbol decisions. Its held-position/competitor/industry branches make the selection itself sensitive, even if a future writer removes a `held` flag. Production `.github/workflows/news.yml` explicitly stages this path; `.github/private-files.txt` does not list it. Adding a path to `.gitignore` would not protect an already tracked file or direct staging. The development writer retains these paths and adds revision quarantine/delivery state: that work is not a privacy remedy.

The production workflow inspected does **not** pull the private repository or bind a decryption key. Therefore current held-position access is not established, and this review does not claim that current holdings are being refreshed there. That does not remove existing public evidence or make future writes safe. The date of first exposure and complete historical population have not been independently established. Claude's statement about commit `d2d77cb` is review evidence, not a substituted historical proof.

## Proposed finite containment scope

| Boundary | Proposed behavior / exact affected paths | Required verification |
|---|---|---|
| Future writes | `news-watch.mjs`: keep owner-selected news, per-symbol decisions and full revision bodies in approved private storage only. No plaintext fallback when storage/authentication fails; public logs emit fixed health statuses without symbols, selected headlines, query paths or provider text. | Synthetic held/buy-list/competitor cases; absent binding, refused save, partial write, restart; no plaintext in public working tree, log or artifact. |
| Delivery durability | `data/news-delivery.json`, `news-seen.json` and related watch/meta state require classification too: story keys, targeted symbols and selection history can disclose context. Preserve reservation/ACK/uncertain states and concurrent duplicate protection; do not reset or recreate history as empty. Private persistence must support the existing durable-before-send contract. | Refusal, conflict, concurrent writer and interrupted acknowledgement tests; no message before durable reservation. |
| Publication | `.github/workflows/news.yml`, `.github/private-files.txt`, and the applicable save/publication helper: replace explicit public staging with an exact public allowlist plus an independently checked private-path denial. Inspect direct Git writers, artifacts and failure-notification logs as well as the standard private-data helper. | Whole-workflow staging tests with synthetic canary files; prove both normal and error paths exclude private content. |
| Readers | `scan.mjs` (`newsText`, gate input and news-decision readers), `discovery-runtime.mjs` and `research-collector.mjs`: use the approved private input boundary when authorized. Missing/unavailable input stays UNKNOWN, not a successful empty news check. Public research output must not republish owner-selected evidence, including derived symbol lists. | Actual caller tests, including failure paths and downstream output inspection. Keep current ZAD/execution gates and historical scoring. |
| Public research context | Do not replace this log with a redacted list drawn only from held symbols: the selection leaks context. A genuinely independent public-universe feed would need its own source/rights/scope review; this proposal authorizes no new requests. | Information-flow tests; no unapproved collection expansion. |
| Existing evidence | Preserve the original bytes and provenance pending an approved restricted evidence copy. Separately inventory current tree, reachable history, Actions logs/artifacts, caches, forks and backups without publishing their contents. Removing a current-tree path would not remove history or copies. | Restricted before/after hashes and verification of every existing consumer; publish completion status only. |

## Review and approval sequence

1. Privacy/migration owner and Codex agree the exact existing private destination and whether existing bindings can support each reader/writer. No key is requested in chat. Verify access and service boundaries separately under approval; this task has not used private-state access.
2. Prepare a minimal **future-write/read containment patch** with exact hashes and synthetic end-to-end evidence. Coordinate `scan.mjs` with Claude's isolated earnings-holiday patch and the separately approved mentor release. This document is not that deployment approval and does not change the existing mentor patch.
3. Obtain explicit approval for the exact workflow/binding/storage and production scope. A private-path list edit alone is insufficient. Do not silently suppress delivery, reset deduplication, replay messages or substitute public data.
4. Treat any existing-file migration/current-tree removal and any history rewrite as separate decisions. Preserve original evidence first. No deletion, migration or rewrite is authorized by this document; no claim of complete unpublication can be made about third-party copies.

**Smallest owner decision, after the concrete patch is reviewed:** approve a specified existing private destination and the exact future-write/read workflow scope. Historical remediation requires a second, explicitly described preservation/removal decision. Until then the exposure remains unresolved; engineering acceptance is not closed.
