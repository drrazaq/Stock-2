# Review criteria for the next Codex delivery (N1–N3, legacy-store export, B/C proposals)

Prepared by the Claude session on 5 Nov 2026, **before** the work is published, so the bar is known in advance. This is review planning only: no setup, keys, provider calls, collection, activation or production change. Saturday's approved STOP-plus-D maintenance is unaffected.

**Preserved:**
- L1–L4 as confirmed at `a32539f5` (review `eb234b30`);
- K1/K2, F1–F3, A1/A2/A6 and H1–H6 as earlier reviewed.

Any change to a confirmed behaviour needs its own regression and will be re-probed.

## 1. File ownership (to avoid collisions)

| Owner | Files |
|---|---|
| **Codex** (writes) | `a-fenced-store.mjs`, `a-native-evidence-importer.mjs`, `a-native-evidence-contract.mjs`, `tools/a-native-evidence-runner.mjs`, any new export tool, `docs/a-native-importer/**`, new B/C proposal files, and their tests |
| **Claude** (writes) | `docs/review-*` on `claude/mentor-release-handoff`, the STOP and D packages on their own branches, and `scan.mjs` deployment work on Saturday only |
| **Neither, without owner approval** | `data/*` owner files, workflows, secrets, main |

Claude will not edit Codex's files. Findings come back as review text with reproducers.

## 2. Bar for N1–N3 and legacy export

| Item | Mandatory to PASS | Recommended only |
|---|---|---|
| **N1** importer resume | An exact importer retry completes after an interruption at append #2+ (AFTER_INTENT, AFTER_RECORD) and at EVALUATE AFTER_INTENT. No pending intent is skipped or rewritten; original bytes stay identical. Regressions for each. Procedure step 7 matches the behaviour. | Exposing `recover` in the CLI |
| **N2** origin label | RETAINED_RESEARCH is refused when any trust root, collector, hostId or recovery authority is marked SYNTHETIC. The repository's own fixture, relabelled, gives UNKNOWN. | Pinning retained roots by fingerprint in a reviewed contract (becomes mandatory once real roots exist) |
| **N3** planted reservation | An unverifiable request file is never treated as a reservation that blocks an **authorized** claim or DISPOSE. The file is retained, never deleted. | — |
| **Legacy export** | **First, an inventory showing whether any non-synthetic, rootless store holding real data exists.** No real collection has occurred, so probably none does. If none: a documented refusal is sufficient, and new export code is **scope expansion** that needs a justification. If some do: a read-only copy-out into a new enrolled store that preserves bytes, marks the result secondary, and never upgrades its trust. | — |

## 3. Architectural requirements: threat and minimum boundary

The owner is one person, the output is research or paper only (`allowBuy:false`), and real money moves only by the owner's hand. The main threats are therefore **self-deception** (selective or omitted evidence, look-ahead), **software defects** and **accidental leakage**. A well-resourced attacker is not the main threat. The minimum boundaries below are sized to that.

| Requirement | Threat it addresses | Minimum sufficient boundary (mandatory) | Not required now (recommendation) |
|---|---|---|---|
| **Independent CAPTURE and WITNESS** | One collector (or one bug) silently omits or alters events, and the "witness" agrees because it is the same process. Example: the hidden adverse exit quote. | Two collectors with **separate signing keys**, **separate write authority over their own records** (neither can rewrite the other's), and each with its own receipt clock and its own fetch. Separate execution contexts are enough: two different jobs or runners, or one GitHub-hosted job plus one other host. | Physically separate hardware, different provider accounts, different networks. These add cost but little against the stated threat. |
| **Distinct trust roots and key custody** | One key signs every role, so signatures prove nothing (the N2 class). | Each role key is held by a different custodian or secret store. The REVIEW and recovery keys are owner-held and **never present on a collector host**. Root fingerprints are pinned in a reviewed contract. | HSMs, hardware tokens, threshold signing. |
| **Recovery authority** (L1) | A stuck store, or an unauthorized takeover using a token anyone can derive. | One owner-held ed25519 key, used rarely, with the signed request kept as a durable file. | Multiple authorities or quorum. |
| **Private host and binding** | Owner data or positions leak through the public repository. | Retained evidence and owner data live only in the private repository or host (`stock-2-private-data` model). Least-privilege tokens. | A dedicated machine. |
| **Legacy writer fence** | An old writer appends after takeover, mixing generations. | The old workflow is disabled **and** its write token is revoked or rotated, verified by readback. | — |
| **Source authentication** (TLS or origin attestation) | Fabricated provider responses. | **Labelling only:** results stay `NOT_INDEPENDENTLY_ESTABLISHED`, and the WITNESS's independent second fetch is the practical cross-check. | TLS notarization. It is costly and outside current scope, and should not block research. |

## 4. Bar for the B/C research proposals

**Mandatory** (a proposal missing any of these is returned, not reviewed further):

1. **Novelty.**
   - Map the proposal against `data/strategy-library.json` (744+ tested ideas), the squad and lab results, and the closest published studies (for example post-earnings drift, insider clusters, 8-K or event drift, momentum and leader dips).
   - State what is new.
   - A re-test of a rejected idea must name the failure it fixes. Without that, it is not reviewed further.
2. **Timing.**
   - Every input uses its acceptance or publication time, not its event time.
   - Entry is at the **next open** after information is available.
   - An earnings report with no time-of-day is treated as after the close (the Squad 28 lesson).
   - No same-bar decisions.
3. **Executable costs.**
   - At least 0.8% (1.2% stress), plus 2% slippage per side for small stocks and 3% in extended hours, plus ZAD $3 per order.
   - A spread is used only from real quote data. Option returns come only from real option prices.
4. **Population.**
   - The whole US market from Oct 2021 to Oct 2026, **dead stocks included**, identified by CIK as of the date.
   - Any halal filter uses only information knowable at the time, or is stated as a limitation.
   - Today's ZAD list must not be applied backwards without a survivorship note.
5. **Controls.**
   - The average stock on the same days, the same stock on its other days, SPY per year, and the time-causal random baseline R1.
   - Both halves (before 2024 / from 2024).
   - Still positive without the 2 best trades.
6. **Missingness.**
   - Every UNKNOWN or missing input is counted and reported.
   - The primary result treats a missing exit as a loss, or excludes it with the excluded count shown and a sensitivity check.
   - No silent drops.
7. **Multiple testing.**
   - Pre-register the rule, parameters and sole primary metric in the file header before any result. Run it once and freeze `firstRun`.
   - Count the proposal against the league luck bar (about t 4.07 over about 2,130 tries). Report block t ≥ 2.5 and the luck-bar comparison.
   - Variants count as separate tries.
8. **Labelling.** Results are NOT PROVEN, PAPER only and `allowBuy:false` until the existing gates pass. Nothing is presented as a BUY.

**Recommended:**
- a power estimate (expected n per half before running);
- a written kill criterion;
- reuse of the A evidence store rather than a new storage format.

**Scope guard:**
- B and C must not change A's files or confirmed behaviour, scanner rules, owner files or workflows.
- New data sources need the owner's OK; no paid data.

## 5. What the consolidated verdict will contain

1. PASS or FAIL against each mandatory row above, with reproducers.
2. The remaining engineering, split into mandatory and recommended.
3. The owner decisions, listed exactly (the expected candidates are in §6).
4. The acceptance row status. No row closes on synthetic evidence.

## 6. Owner decisions already foreseeable (none requested now)

1. Whether to fund or approve two separate collector contexts (the minimum boundary in §3) once A moves past offline work.
2. Who holds the REVIEW and recovery keys, and where.
3. Which close source counts (official close versus aggregate bar) and any provider terms.
4. Adoption of an A policy and cohort, and the ZAD validity policy (currently unadopted).
5. Whether B/C may use any new data source.
