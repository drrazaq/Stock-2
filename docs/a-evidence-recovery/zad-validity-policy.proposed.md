# Proposed A ZAD validity policy — NOT ADOPTED

5November2026. This is a review/owner decision document, not policy activation. No marks are created, inferred, extended or changed. `scan.mjs`, `zad-compliance.mjs`, existing owner records and the existing90-day non-halal exclusion are unchanged by this package. A remains research-only and unproven.

## Concrete proposal for the new A evidence/cohort version

1. Only an authenticated owner attestation can supply an affirmative decision. It must name issuer and security identity, original owner decision time, original system receipt time, an explicit validity interval and original evidence ID. A newer official exclusion takes precedence; source failures/missing identity remain UNKNOWN. Never derive YES from expiry of NO, a third-party screen or an absent record.
2. For affirmative A eligibility, propose the earlier of the owner's explicit `validUntil` and90calendar days after `decidedAt`, with an exclusive expiry boundary.90days is a **proposed maximum for the new contract**, not a decision taken by this implementation. It is motivated by the existing affirmative freshness check/quarterly review cadence, not an assertion that a company cannot change earlier. Shorter validity and immediate revocation are supported. The shipped unadopted verifier continues to check explicit intervals and does not silently enforce or adopt a new maximum.
3. Existing non-halal exclusion duration and precedence remain exactly as currently configured. This proposal neither shortens that90-day exclusion nor extends it by assigning a long custom interval. A research event after an exclusion expires is still not an affirmative owner confirmation. Request/reconcile an actual current decision only when an otherwise qualifying setup warrants it; do not ask for bulk reconfirmations or rewrite old marks.
4. Latest known decision wins; same-time contradictions and unavailable authoritative history remain unresolved. No resumption, historical reconstruction or later signature may backdate owner knowledge. Original historical marks without validity/receipt evidence stay legacy context, not authenticated confirmations.
5. Before adoption, bind a reviewed authoritative owner-state source and its history/override/exclusion semantics to a dedicated OWNER public key. CAPTURE, REVIEW and WITNESS keys cannot be that underlying key. Key separation is not proof of separate custody. No bindings/key generation or migration is part of this proposal.

## Baseline distinction that must remain visible

Current development `zad-compliance.mjs` already carries fail marks as recheck-required beyond their freshness interval, while `scan.mjs` retains90-day explanatory comments/constants. This package does not reconcile that pre-existing distinction or choose a new exclusion policy. It changes neither file. The source/authority integration review must explain actual deployed behavior and preserve the owner's90-day exclusion requirement; an unresolved state cannot be relabelled YES. The A interval contract does not replace production `resolveZad` or `zadApproved`.

## Exact owner decision after independent review

Accept, reject or amend the proposed affirmative maximum and the authoritative owner-state/trust source for a new A evidence/cohort version. Specify the applicable official-exclusion precedence and expired-state wording while leaving the existing90-day non-halal exclusion unchanged. Until that decision and real attestation integration exist, A is NOT READY;0prospective admissions and no live BUY wiring. An interval signed through2030 is a useful unadopted-contract test, not authority to extend production approval through2030.
