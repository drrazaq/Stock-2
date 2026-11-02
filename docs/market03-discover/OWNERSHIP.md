# MARKET-03 batch: `discover.mjs` price-day ingress — ownership claim

**Author:** Claude, 2 Nov 2026. Published before any code edit.

**Branch:** `claude/market03-discover`, cut from revision r2 `claude/market03-catalyst03-r2` @ `31b9ff2a`, which stays unchanged during Codex's review. This branch depends on r2's `source-contract.mjs`: if Codex adjusts r2, this branch is rebased onto the accepted head.

## Pre-claim checks (2 Nov 2026)

- **No Codex changes:**
  - `discover.mjs` was last changed on 29 Oct (`7dd702d`, `a8acf65`);
  - no commit since then on any branch, including Codex's head `9b78b51d`, touches it;
  - no Codex document assigns or claims it.
- **Registry status:**
  - Codex's `docs/repository-ownership.json` lists it as `ENGINEERING_SOURCE`, whose rule is "explicit branch fixes and regressions; preserve registered strategy thresholds";
  - `tests/repository-preservation.test.mjs` hash-enforces protected categories only, so an engineering-source edit does not break it.

## Claimed for edit

**`discover.mjs`, whole-market price ingress only:** `grouped()`, `sessionOnOrBefore()` and the resulting price-day and source status in `data/discovery.json`.

**Untouched:**
- the discovery criteria (`CFG` thresholds), scoring and SEC / company-fact / clinical-trial logic;
- message wording;
- the company list (`companies()`).

## New files

- `tests/market03-discover-*.test.mjs`
- `docs/market03-discover/*`

## Not touched

- r2;
- `claude/market03-batch2`, whose rebase is held until Codex resolves r2;
- `scan.mjs`, the mentor, watcher, SIP and V2 work;
- workflows, data and frozen results;
- the privacy preservation package (inactive).
