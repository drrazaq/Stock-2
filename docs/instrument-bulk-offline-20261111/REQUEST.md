# One bulk instrument-reference request — independent review only

**No acquisition, setup or activation authorized.** This replaces the unapproved7-name/8GET proof and CS-only8page draft; neither remains an active owner request. It explicitly increases their bounds to14provider pages across **all types**, plus one SEC map. The parked IG1 three-GET plan and original approved release packages are untouched.

## Useful question and finite result

Can an authenticated current all-type reference classify the actual broad discovery population into verified common stocks, non-common instruments and explicit UNKNOWN, rather than leave ordinary-stock radar A/B empty? Funds are positively identified as funds when their fields support it; ETF type does **not** establish leverage or its underlying. The six reviewed exclusions remain. Primary SNDK already establishes common-stock class; bulk adds standardized identity/provenance, not a new business discovery. Unknown/missing/unsupported names stay investigable. No historical study is filtered or rescored with this current reference.

## Exact scope proposed for one future approved session

- Initial GET: `https://api.massive.com/v3/reference/tickers?market=stocks&active=true&limit=1000&sort=ticker&order=asc`.
- Up to14provider GETs total, including the first page, at most1000records/page and14000records. Subsequent requests follow only the previous original response's `next_url`, official same origin/path, apiKey stripped from receipts; no constructed cursor, alternate host, redirect, date/type/search filter or retry.
- One GET `https://www.sec.gov/files/company_tickers.json`. No authentic current original was recovered; the currently parsed normal-run map was not archived byte-exactly. If such an original is recovered before approval, explicitly remove this GET and repin the plan.
- At most15GET total; concurrency1; **minimum13seconds between request starts**;5seconds/request; one210second monotonic session bound. Shared quota is not reserved:429stops, never retries. A page14 with another cursor means partial UNKNOWN, not a15thprovider GET.
- Hard1MiB/provider response,4MiB SEC body,4MiB prepared candidate and24MiB total originals+candidate+reports/receipts (including1MiB reserved for capture receipts). Oversize is a stop, never truncation presented as a complete original. Preserve partial evidence privately without activation.401/403/429, malformed data, origin/cursor drift, duplicate/regressing tickers, clock or storage failure stop the attempt. No price/trade/quote/news endpoints, purchase or upgrade.

The exact UTC session, approved collector/transport source, private destination and approval record must be pinned before execution. The implemented offline assembler is not a network collector or execution authorization.

## Frozen identity rule, before capture

Require byte-exact originals and independent official-HTTPS provenance review. Hashes authenticate bytes, not origin. Record raw-page hash/byte count, exact sanitized URL, request/receipt times, HTTP status/request ID, cursor linkage and the first-request/last-receipt bracket. Provider last_updated_utc, if absent, stays absent; receipt is not publication. Tickers must increase strictly within/across pages. No result means no verified coverage, not proof of a quiet/empty market.

For supported CS require US/stocks/active, valid share-class FIGI (or the inherited composite-FIGI fallback), provider CIK and exactly one matching literal SEC ticker/CIK. **No dot/dash substitution is guessed**: BRK.B versus BRK-B stays UNKNOWN without separately authenticated class evidence. A CIK shared by distinct class FIGIs is allowed and reported as one issuer/multiple instruments; duplicate security IDs/conflicting identity are UNKNOWN. Missing/conflicting CIK or FIGI stays UNKNOWN. Non-common supported types such asETF/ETN/PFD/WARRANT are excluded from ordinary common-stock queues when identity is supported, without requiring a corporate issuer CIK. Unsupported types/ADRC remain investigation context, not a halal ruling.

At the actual reference-aware SEC boundary, a bulk CS also needs agreement with the CIK already obtained through the normal current SEC lookup. A conflict or unavailable current CIK becomes UNKNOWN; no new GET is added for it. This reduces ticker-reuse risk but does not authenticate the security behind a ticker-only quote or prove current tradability. Executable BBO/identity and ZAD remain separate.

The entire reference expires to UNKNOWN when any required capture clock exceeds the inherited7day maximum. A one-off capture cannot support indefinitely non-empty daily A/B. **Recurring refresh is not authorized by this request**; it needs a separately bounded approval/private publication route. Neither private capture nor an offline candidate automatically binds production.

## Official capabilities researched and actual access limitation

Official AllTickers documentation supports the above filters/pagination/optionalFIGI+CIK and inclusion in Stocks plans. Retained November1 UI confirms Stocks Starter; a runtime key's current mapping/quota remains unverified.13secondspacing also respects the published5/minute lowest tier in isolation. No current endpoint call was made. https://massive.com/docs/rest/stocks/tickers/all-tickers . Historical TickerOverview fundamentals have report-period semantics and are not past-knowledge evidence.

Personal-use terms allow licensed personal analysis/storage and restrict redistribution and independent processor use. No raw or reconstructible reference is published in public Git/artifacts/chat. Current source/order and processor-retention conditions must be established before capture; a plan label does not grant public redistribution. https://massive.com/legal/market-data-terms-of-service and https://massive.com/legal/individuals-terms-of-service . No provider message is authorized.

**Actual tool check:** this executor has no MASSIVE_KEY, ALPACA_KEY or ALPACA_SECRET binding name, and no connected Massive/Alpaca tool is exposed. No values were read, extracted or changed. Existing GitHub production secret bindings cannot be exported by the read API. Therefore a new capture cannot be executed here using an imaginary integration.

## Minimum private setup and owner authority

Reuse the existing private research repository and a reviewed private executor rather than buy hardware. Its Actions are presently required to remain disabled under S1; no new workflow, App grant, secret enrollment, run or settings change is included in current authorization. A separately reviewed setup stage must name the exact private payload/operator, existing-key enrollment method, processor controls, hard additional-spend control, artifact/access/retention and owner-held recovery verification. Do not rotate/regenerate production credentials; a local GET-only client is not a server-enforced read-only credential.

Retain originals in the approved private destination,0700directory/0600files where applicable, with an owner-held verified recovery copy before the transient executor disappears. Capture/derived-file retention and end-of-retention actions must be expressly approved; no cleanup or deletion of existing repositories/evidence is inferred. Existing private/public repositories remain untouched under this proposal.

**Owner decision after independent review:** authorize the exact private setup/credential enrollment separately, then this single15GET capture after setup/recovery/terms/zero-spend gates pass. Current output is review-only, not an invitation to paste keys, install anything, run a workflow or buy data. This dependency does not block public-primary company research or the validated engineering successor.

Terminal receipt: complete pagination or explicit partial; instrument counts bytype/status/UNKNOWN, distinct verifiedissuer and security counts, matched/conflict/missing joins, original clock/hash/size receipts and consumer parity. Proceed to independent provenance review only when complete; otherwise INCONCLUSIVE. No live activation, current BUY, execution-capacity or strategy-performance claim follows from identity coverage.
