> **Superseded source pin:** H1/H2 corrections and receipt/custody preparation are recorded in [H review disposition](../historical-audit-invocation/H-review-disposition.md). Current pins are in the companion package.json. The original twelve-case scope is unchanged; old client-byte-identical and128MiB-reachable statements below describe the earlier build.

# Fixed historical page client — implementation, not execution approval

Implements the small offline-client task in the decision package at f33447aa,
without acquiring any provider data. The original 12 cases and 156-request scope
are preserved. No new strategy, collection approval, purchase, workflow, key
binding, production caller or BUY admission is created.

## Implemented

- A scope-pinned planner for exactly the named cases, dated Massive reference,
  splits/dividends, and explicit Alpaca SIP daily/minute/quote pages. Every request
  is one raw GET. No SDK, retry, redirect following, alternate host/feed or
  automatic pagination. Historical `asof`, raw bar adjustments and October NY
  UTC-4 clocks are explicit. Unsupported parameters must fail, not be adapted.
- Serial one-request-at-a-time execution, minimum one second between starts,
  600-second provider-phase deadline, at most 20 seconds for the entire response,
  4 MiB per body, 128 MiB aggregate raw, 160 MiB sealed, and 16 KiB public status.
  Per-case/page IDs and exact scope impose 36 Massive plus 120 Alpaca maximum.
  A previous response must supply the token for the next quote page; eight pages
  with a further token is INCOMPLETE. Non-quote pagination is also INCOMPLETE.
- Exact approved-scope assertions, retention and size/condition evidence flags,
  an explicit authorization-record identifier, a real private encrypted journal,
  and explicitly supplied transport/headers are required. These flags are a
  caller contract, NOT cryptographic authentication of owner consent or proof of
  provider terms. The trusted invocation/binding must receive independent review.
- A fixed-host HTTPS adapter with normal certificate verification; no environment
  credential discovery, imports with network side effects or executable live CLI.
  It cannot follow arbitrary `next_url` links. A separate loopback-only adapter
  tests the same wire-reading implementation using synthetic headers only.
- A fresh 0700 directory, 0600 exclusive files, an exclusive batch-start marker,
  AES-256-GCM encrypted records, file/directory fsync, request intent before I/O,
  and raw-response sealing before schema interpretation. Public status contains
  counts and hashes, never raw bodies, symbols, tokens, headers or keys.
- Read-only recovery verifies each sealed record and reports unresolved intents.
  A timeout or failed response seal cannot be cleared by a client failure note.
  A damaged tail is rejected by strict inspection; an explicitly requested prefix
  inspection labels the unverified tail and never grants resumption. Reusing the
  started directory for a second batch is refused. The caller must preserve the
  seal key privately; the journal does not implement key escrow or recovery.

Raw response bodies are base64 inside encrypted records. Consequently the sealed
cap can bind before the nominal raw cap. Hitting it stops incomplete; it never
raises a budget. Recovery is local durable-file verification, not authenticated
off-host retention or a signature guaranteeing an unmodified historical archive.

## Scope and tests

`scope.proposed.json` is copied from the pinned decision package. The canonical
JSON-object digest is hardcoded in the client as
9751a2a0db8bf41a1788a61270be927a983da28170e51c72d68ee8f8759e2772.
The client does not change the source manifest's `approved:false`. Separate
authorization is required; synthetic test authorization is never owner approval.

Run `node --test test/historical-sip-audit-client.test.mjs`.

42 offline tests pass locally on Node v24.22.1. They include all 156 synthetic
request slots, request timing, refusal/redirect/429 handling, schema/identity/feed
errors, caps, duplicated and concurrent requests, timeouts, before-I/O and
after-response durability failures, encrypted recovery/tamper/truncation,
symlink/private-directory handling, scope mutation and actual loopback HTTP
streaming/abort behavior. No real credentials, endpoint calls or holdings are
used. Actual provider TLS/access and all named-security coverage remain untested.
The full local TAP log and file hashes are retained beside this document.

## Exact remaining execution dependencies

1. Independent review of this code and the original decision scope. No PASS is
   presumed. This code is not yet installed in a protected invocation workflow.
2. Non-secret evidence for provider quote-size/condition interpretation and
   private retention rights; truthful existing binding/network readiness.
3. A reviewed invocation that supplies only the approved existing bindings and
   private output/key custody; one bounded owner approval. No key in chat.
4. A one-batch capture and semantic analysis after that approval. Captured page
   arrays are not authenticated common-share identity, 20 complete daily sessions,
   valid/firm BBO paths, executable depth, continuous coverage or profitability.
   Every eligible case still needs an honest complete/unknown disposition. No
   same-stock or market controls are included in this fixed feasibility sample.

The public status deliberately remains INCOMPLETE_NOT_EVALUATED even if all 156
pages are captured: a transport cannot declare strategy acceptance or data
feasibility by counting requests. No hypothesis or live BUY gate is relaxed.

The contract/reclaim prototype is a distinct untested proposal; this audit tests
the feasibility of retained IG1 quote/cost analysis. The existing IG1 and
event-ORB negative/unproven results remain unchanged. Claude's stop-alert repair
remains separate and its files are not edited here.
