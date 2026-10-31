# Native SEC acceptance and cross-run lineage — inactive engineering package

The native adapter now retains the original submissions response from the **existing** `secRiskIssuer` request and joins explicit SEC `acceptanceDateTime` by accession and numeric CIK to the actual `pollEdgar` feed entry. Atom `<updated>` remains a separate reported clock. No new request, enrollment rule, score, message, execution or ZAD change is introduced. Both actual production functions are extracted from the exact proposed patch and executed with synthetic responses in regression tests.

This is completed offline acceptance-join/lineage engineering, **not** complete CATALYST-03 or live capture readiness. Genuine admissions remain0. The original978-row artifact audit remains0admissions; its bytes/results are unchanged. Earlier missing implementation was reconstructed, not recovered.

| Evidence path | Preserved evidence | Failure/admission behavior |
|---|---|---|
| Existing SEC submissions response → shadow tee | Exact body bytes/hash, original request/header/body/observation clocks, URL/status; legacy caller parses the same response once | HTTP/transport/malformed/CIK mismatch retained as source failure or unresolved; no acceptance invented |
| Actual Atom producer → immutable response journal | Exact entry bytes, accession/CIK event ID, entry revision hash, Atom updated and original receipt/ingestion clocks | Legacy seen keys cannot become new first observations; invalid source is not an observed empty feed |
| Independently pinned prior run → offline stage → parent manifest → next producer run | Exact original run/response/lineage bytes copied, run/source/digest pins, manifest SHA256; original files untouched | Missing/partial/changed parents, symlinks, run-ID cycles, provenance mixing and reversed clocks fail closed |
| Persisted lineage → actual native event port → guarded capture → unchanged30-minute evaluator | Original first run/clock identity retained across repeats; original raw revisions and late proof supplements remain inspectable | Revisions/conflicts and late supplements remain research-only; fixture cases never genuine admissions |

## Exact proposed package and bounds

[Seven-file patch](validation/native-sec-shadow-production-v2.patch), [before/result/dependency hashes](validation/native-sec-shadow-production-manifest-v2.json), production base `a4e88a3eb7ddaf3e7506bc82bd0fb1e4883c1958`. Patch SHA256 `2ac7cc44971b3afabd552c5887ba17ec276a2364829ab7caeb5020d54a96ef83`. Historical v1 patch/manifest/base remain unchanged. V2 is **not independently approved, installed or run**; it does not replace the deployed watcher v5 operational release.

The patch contains `native-sec-events.mjs`, `native-sec-shadow.mjs`, `capture-json.mjs`, the narrow watcher tee, its proposed workflow archive path/flag and two necessary test-only compatibility corrections. The existing weekend fixture correction retains11-session expiry and10-session eligibility assertions; the isolated issuer test now binds the real disabled shadow dependency without changing its assertions. No LEADER DIP strategy/gate was changed. The unchanged `edgar-feed.mjs` dependency is hashed. Accounting and all production data remain untouched. All native records, including submissions, share256responses/run,2MiB/source-body,4MiB/record and64MiB committed-run limits (up to4MiB interrupted staging overhead). Parent capsule is at most8MiB, depth at most8; exceeding a bound refuses lineage continuation rather than claiming complete history. Legacy parsing may consume a larger existing response before the shadow cap rejects it; this tee does not add a new network response-size bound to the deployed producer. That unchanged producer transport limit belongs in the remaining source audit.

Parent continuity is explicitly **available pinned producer-run lineage, not authenticated global first ingestion**. An omitted earlier run cannot be inferred from this chain. No parent input means run-local evidence only, not proof that the event was never seen before. Official source authenticity, complete run selection and contemporaneous identity must still be audited before any admission.

`tools/prepare-native-sec-parent.mjs --offline SOURCE_DIR RUN_ID SOURCE_SHA INDEPENDENT_DIGEST NEW_DESTINATION` stages already-held SEC bytes only. Destination must be a new path below the current directory’s `runtime/native-sec-parents/`. It emits a manifest filename/hash, refuses reuse, validates source and staged digest and does not retrieve anything. `IG_NATIVE_SEC_PARENT_FILE` plus `IG_NATIVE_SEC_PARENT_SHA256` are the proposed explicit shadow inputs. No binding is installed. An interrupted stage leaves its incomplete directory for diagnosis; there is no automatic deletion, retry, download, run selection or live resume.

## Still missing before activation

- Trusted live host/client implementation and live artifact discovery/download with independent producer run/source/digest derivation and complete-run selection. The tested offline staging tool is not that transport.
- Official Alpaca latest SIP account/session/universe and retention rights; authenticated current six-name class/FIGI/CIK/SIC/exchange references and current ZAD. Missing identity remains UNKNOWN and blocks approved BUY while retaining labelled research.
- Exact artifact SDK/wire retry/digest/size semantics, real uploaded recovery applicability and bounded service-failure handling. Existing mock ZIP tests do not prove the real backend.
- Independent review and separately approved installation/reference/capture scopes. Reference preparation18 + capture41 = **59 maximum additional source requests**, separately authorized; this shadow adds0. Existing background watcher traffic is outside59.

The proposed5November2026 six-name09:30–10:10NY calibration remains unapproved and lapses if the4November18:00Z preparation deadline is missed. Calibration is not untouched confirmation; zero eligible events is a valid result. No universe/window/exit/control/cost or evaluator change is authorized.

**Feasibility limit:** the normal main-loop order is feed observation followed by filing decisions/safety requests. If the acceptance response first arrives after that event was observed, it is retained as a late supplement and is not admitted retrospectively. The actual-caller test covers this usual ordering as well as an already-available matching response. This package cannot promise an eligible event. The8MiB parent capsule can also refuse a large prior run; that is an explicit blocked continuation, not evidence of complete global history. Any larger continuity storage/transport scope needs a separately bounded review before activation.

## Next executable work

Finish the separately pinned inactive live host/producer-artifact client, retaining the rehearsal guard; then complete remaining source-body bounds, normalization ingress and delivered-plan/spec contracts in dependency order. [All16open rows and owners](acceptance-closure-board.md). CATALYST-03, MARKET-03 and EXEC-03 remain OPEN; no whole row is engineering complete on these tests alone.

The single next evidence decision is whether the owner can supply official, non-secret evidence that the intended account permits latest SIP snapshots and retention for this six-name calibration. That resolves an evidence prerequisite only; it grants no provider calls, bindings, installation or capture.
