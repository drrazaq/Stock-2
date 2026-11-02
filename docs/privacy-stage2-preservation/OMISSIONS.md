# Exactly what was changed or omitted relative to the original commit

The sanitized patch has the **same number of lines** as the original `git format-patch` output. **13 lines differ, and all of them are added (`+`) lines**: no context or removed line was touched, which is why the patch still applies to its public parent. Nothing else was removed.

## Replaced (holdings and owner values in test fixtures and one doc example)

| Category | Count | Replacement | Where |
|---|---|---|---|
| Tickers of **current holdings** (on main's public `data/my-positions.json` as of 2 Nov) | 4 distinct | synthetic `ZQA`–`ZQD` (consistent within the patch) | `test/private-data.test.mjs` fixtures and assertions; one example line in `docs/private-data-migration-2026-10-28.md` |
| Ticker of a **past holding** (it appears in the owner's history files) | 1 | synthetic `ZQE` | `test/private-data.test.mjs` hold-lab owner fixture |
| An owner **entry price** paired with that past holding | 1 value, in 3 textual forms (plain, `\.`-escaped and `\\.`-escaped regex) | `111.11` | the same fixture and its assertions |

**The real-to-synthetic mapping is not published.** It existed only in a scratch file in the session environment and was deleted after this package was built. The tests do not depend on the real values: they pass 28/28 with the synthetic ones.

## Kept on purpose (allowlist; not a disclosure)

These tokens also occur somewhere in the owner-file history, but in the patch they are not holdings data:

| Token | Why it stays |
|---|---|
| `AAA` | Generic placeholder used throughout the repository's public tests |
| `API` | The English acronym, in a shell comment |
| `COST` | A code constant in an `import` list of `hold-lab.mjs` (public source) |
| `RES` | A code variable (`const RES = {}`) in `hold-lab.mjs`; 13 times in public main |
| `BAR` | A code constant (`BAR = Math.max(…)`) in `hold-lab.mjs`; unchanged context lines, 6 times in public main |
| `LB` | A code variable (`const LB = J(LIB, null)`) in `squad29-lab.mjs`; unchanged context lines, 4 times in public main |
| `SPY` | The public S&P 500 benchmark ETF used throughout the public code |
| 4 single-letter tokens | Code identifiers; none appears quoted or in a symbol field |
| Lower-case property name equal to one holding's ticker | Lower-case identifier `o.<name>` in code, 30 times; the upper-case ticker never appears |

## Also retained (already public, not owner data)

- The private repository's name, 11 times, needed by the scripts. It is already published in `CLAUDE.md` on main.
- The commit author line (`noreply@anthropic.com`) and the workflow bot address (`scanner@users.noreply.github.com`).
- The synthetic test sentinels `HOLDING-SENTINEL-7781` and `github_pat_TESTTOKEN_123456`.
