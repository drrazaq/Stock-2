# Claude independent review evidence, 1 November 2026

Read-only review outputs, published so they can be fetched without access to the reviewer's workspace. Nothing here is production code:
- no file in this folder is imported by the system;
- no workflow runs it;
- every harness uses synthetic placeholder credentials and local services on 127.0.0.1 only.

None of the files were modified for publication: they contain no secrets, private data or reviewer-local paths. The two earlier SIP files (`REVIEW-sip-107935f6.md`, `realpath.mjs`) are byte-identical to the earlier attachments.

| File | Purpose |
|---|---|
| `REVIEW-sip-diagnostic-pr5.md` | Review of PR #5 (`510ef31c`; checkpoint `71cccb62`): **PASS** (inactive package) |
| `REVIEW-passive-observer-pr4.md` | Review of PR #4 (`7b3e5a6c`): **PASS** (default-off package), finding O1 before activation |
| `https-harness.mjs` | Actual SIP runner + core-HTTPS client over real TLS to a local HTTPS server (self-signed cert, virtual clock). `node https-harness.mjs <checkout> <scenario>` |
| `wrapper-harness.py` | Extracts and runs the literal wrapper/finalizer Python from the `.proposed` workflow. `python3 -I wrapper-harness.py <workflow.yml.proposed>` |
| `observer-harness.mjs` | Actual `ignition-watch.mjs`, observer off/on/failure modes, request and persisted-data parity. `node observer-harness.mjs <tree> <mode> [sip-ok\|race]` |
| `runall.sh` | Suite runner used for the full-suite counts: each `test/*.test.mjs` and `tests/*.test.mjs` via `node --test`. `bash runall.sh <tree> <result-file> <tmpdir>` |
| `REVIEW-sip-107935f6.md` | Earlier review of SIP diagnostic `107935f6` (CHANGES REQUIRED: C1/C2), byte-identical to the earlier attachment |
| `realpath.mjs` | Earlier fetch-based harness for `107935f6`, byte-identical to the earlier attachment |

## SHA256

- `REVIEW-sip-diagnostic-pr5.md`: `b1cfe86715d520175a6da68bd32b5127502535951b08892735280039d240e9af`
- `REVIEW-passive-observer-pr4.md`: `58fb75934f19f7c474976edaf259993ae45eb2d04d10704f945cd0b183aa2e16`
- `https-harness.mjs`: `66cc56a5945436b9a51603ff0b0fa5e7ab29be9fab31564889cce5af55dbfa18`
- `wrapper-harness.py`: `c2ee604621cd3af3162d65a2294a66350a801a0c06331cb819150a7d2b1f5c3a`
- `observer-harness.mjs`: `31319d4d32ec49c53621d583064d682adf8619899c66b0f40a9eff4351bd6f05`
- `runall.sh`: `662a2ecea02a5db4fa803ab6241250547d22ebfc3067e4a4591296753bcd0874`
- `REVIEW-sip-107935f6.md`: `a6efe8572331238bcb16077183d6c358a0ead58fa5a4f303da16ebd900586204`
- `realpath.mjs`: `4253399aab8ba4e5a6c6467710704c69d170d9b531e55621a280dbe2b2e5618c`
