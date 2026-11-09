# Focused re-review: research horizons and CEG evidence request at `b852b4a6` (Codex 6733655881)

Review only, offline. No acquisition, setup, provider contact, credential or spending. The arithmetic PASS (`2004e2c7`) stands; the script and its output are byte-identical, and nothing was repeated.

**Verdict:** **PASS** on C1–C5 as reconciled, with **one correction, C6**, and **one withdrawn claim** of mine.

## Reconciliation of my C1–C5

| Item | Result |
|---|---|
| C1 SQ6-MTUM balance | **Accepted.** FINDINGS now gives own-stock excess −15.71% / +1.28% / −6.00% with ownCovered 3 / 4 / 7, and keeps both halves. **My "no older blocks field" claim is withdrawn:** `data/squad6-lab.json` `/firstRun/SQ6-MTUM/results` does contain `older.blocks` 3, `newer.blocks` 4 and `all.blocks` 7. My earlier key filter dropped the `blocks` field. Codex's pointer and sha256 (`review-response.json`) are correct. |
| C2 B-FCF1 | **Accepted:** labelled 63 sessions, on the mid/long boundary. |
| C3 session convention | **Accepted:** 3 Nov is session 20 counting 7 Oct as 1, which is 19 after entry. The open-window overflow is named as the likely INCONCLUSIVE cause, not an entitlement refusal. |
| C4 entitlement | **Accepted:** the owner opens the existing documents, reviewers interpret them, and the terminal is STOP unless the terms expressly cover hosted-AI processing. |
| C5 custody | **Accepted as a proposal.** Named host: one private-repository Actions job, which is disabled now and whose setup is a separate stage. Credential: an existing owner-held research pair only, with its order capability stated; never the bot's secrets; STOP if none exists. Neither is an executable arrangement. I could not verify that `drrazaq/Stock-2-research-private` exists, because it is outside this session's scope (HTTP 403); this is not a finding against Codex's read-only check. |

## C6 (correction): do not make the specimen depend on K2's device route

As revised, the specimen's recovery encryption uses a new owner-held `H1_SPECIMEN_KEY` and reuses the K2 procedure "only after its iPhone route passes review/preflight". That ties this research route to the K2 iPhone-setup blocker, even though the specimen does not need an owner-held encryption key to meet its own custody bar:
- The export (≤ 8 MiB) and the metadata (≤ 1 MiB) are to be kept only in an existing **owner-only private repository**, never public. Access control protects them there. Recovery is the owner's own GitHub account, which is outside the runner and already exists; the owner can open the file from the GitHub app on an iPhone.
- An extra encryption layer is needed **only if** the accepted agreements (C4) or a reviewed policy require encryption at rest. In that case the device route becomes a real prerequisite, and should be named as conditional on that finding.

**Requested wording:**
- **Default persistence:** the export is stored in the existing owner-only private repository, with no additional key.
- **`H1_SPECIMEN_KEY` and the K2 procedure:** apply only if C4 finds an encryption-at-rest obligation.

This keeps K2's device limitation explicit without making it a dependency for unrelated work. Every other cap, STOP rule and prerequisite is unchanged.

## What the specimen enables, and what it cannot resolve (restated for the corrected scope)

**Enables (data feasibility for one hand-picked event):**
- whether the held entitlement lawfully returns complete historical SIP quotes for CEG in the two 30-second windows, plus corporate actions, within all caps;
- whether the existing normalizer interprets their conditions, tape, exchange and size semantics;
- one conditional ask/bid mark with q = floor(997/ask) and $3 per side.

A pass justifies at most proposing a separately reviewed population request.

**Cannot resolve:** any profitability or strategy verdict (n = 1, selected, no controls, no original receipt or decision timing, no proof of a fill). Nor any item on its own list:
- IG1: 2 stale outcomes, 10 no-fills and 1 no-bars path;
- 102 authentic chains;
- the external attempt denominator;
- earnings membership and consensus vintages;
- SQ6 daily book and cache;
- the third-party cash-deal population;
- PB12 control witnesses.

## Workability after correction

| Gate | Status |
|---|---|
| Entitlement | Owner-only document inspection; likely STOP absent express hosted-AI coverage |
| Executor | Proposed private-repository job; setup not authorized |
| Credential | Depends on an existing owner-held research pair; STOP if none |
| Recovery | With C6, owner GitHub-account custody, with no device dependency unless the terms require encryption |
| $0 | Must be owner-verified as enforced; alerts are not enough |

All are open gates. No action is requested now.
