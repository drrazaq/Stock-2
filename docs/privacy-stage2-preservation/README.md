# Privacy migration stage 2: sanitized preservation package

**Author:** Claude, 2 Nov 2026.

**This is preservation only. It is not cutover authorization.** Nothing here changes production, repository visibility or history. The original private-bearing branch is **not** pushed.

## What is preserved

| Item | Value |
|---|---|
| Original commit | `d2d77cb153c954cf2778f9835ebe2e25e29edb99` (28 Oct 2026). It exists only in local branches of one ephemeral session environment. |
| Message | "Privacy migration stage 2 (owner request 28 Oct): cutover machinery built, tested and switched off; derived owner data split out". Not pushed at the time, pending the owner's OK to change production workflows. |
| Parent | `51ad0b1971a967413357802b98f545e9aba9c7f9`, on public `main` |
| Scope | 80 files: workflows, `.github/private-data.sh`, `.github/private-files.txt`, `.github/scrub-public.mjs`, `.github/private-cutover.sh`, `.github/save-data.sh`, scripts, the stage-2 test file and the migration doc. **No `data/` file.** |

The sanitized patch keeps the work recoverable if that environment is lost.

## Files

| File | SHA256 |
|---|---|
| `stage2-sanitized.patch` (`git format-patch` of the commit, sanitized) | `e6f40ec81f1796a7e201aae840844e6a07323598bc6ac444a83cb74c317f5cd0` |
| `verify-sanitized.mjs` (re-runnable check; prints counts only) | `beea808c9459563daa098a219356741c7e268b04bd629b40a9f05120bf16b42a` |
| Original patch, **not published** (for reference) | `14bc8e711f62fda52e7010076089bac37cafcf4edd4acdc78c3b1618469c3a02` |

## How to use it (only after the owner decides)

```
git checkout 51ad0b1971a967413357802b98f545e9aba9c7f9
git apply docs/privacy-stage2-preservation/stage2-sanitized.patch
# or: git am stage2-sanitized.patch, which keeps the original message
```

The patch applies cleanly to its parent: verified. Integrating it on current main is a separate, reviewed step, because main has moved since 28 Oct.

## Verification (2 Nov 2026, Node 20.20.0 and Node 22)

Run `node docs/privacy-stage2-preservation/verify-sanitized.mjs` from a full clone. It builds the sensitive set from the repository's own history of the owner's files, then checks:
- **Tickers:** 594 candidate tickers, including the owner's halal-mark history; 0 hits outside the 7-token allowlist explained in `OMISSIONS.md`.
- **Single-letter tickers:** none appears quoted or in a symbol field.
- **Private values:** 123 price / stop / target / quantity values, in plain or regex-escaped form; 0 hits.
- **Credentials:** 0 credential-pattern hits (GitHub, AWS, Slack, OpenAI-style, PEM, Telegram bot token, 9+ digit ids). The one `github_pat_TESTTOKEN_123456` is a synthetic test fixture that the scrub tests use to prove tokens are removed.
- **Identifiers:** no e-mail address other than `noreply` ones.
- **Data files:** none in the patch.

**Functional check:** on the parent commit with the sanitized patch applied, `test/private-data.test.mjs` passes **28/28**, the same as the original commit (28/28).

## Not done here

- No cutover.
- No change to `private-files.txt` on main, to workflows, visibility or history.
- No push of the original branch.
- No use of the private repository.

Those remain owner decisions; see the privacy assessment given to the owner on 2 Nov.
