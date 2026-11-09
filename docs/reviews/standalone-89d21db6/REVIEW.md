# Standalone rev2 independent review

**CORRECTIONS REQUIRED**, verdict published immediately6733545959, independently of K2/research. Exactsource89d21db67cc9da1ab8254144d5d97ab80b5c4de3; docs614ee388; bindingSHA61f75b81acfdf51c46e540efdd856ae8c9698dc73e452fa3c005bc93401ca1b8. No deployment/production action.

F1closed: only source change versus10874f68 is test/try-small-audit.test.mjs, byte-identical developmentb9753abb2. All16assertions pass at9Nov04:30,28Dec04:30,9Nov05:30. Positive controls/runtime gates unchanged. F2closed: complete155file inventory; independent exact-source155/155PASS at actual clock, no failures/waivers. Prior independently tested runtime send/multipart safeguards remain exact; no need repeat unchanged fixtures. All25fingerprints/bytes/modes/sourcepatch/inversePASS.

Calendar actual-caller4/4compatibility checks independently pass. The published test was copied into candidate/test only for execution, with ONE harness adjustment: propagate NODE_OPTIONS to the child so the external-network guard remains active. It was moved out afterwards; not part of source/binding/full155inventory. Original assertions unchanged. No existing key used; synthetic fixture only. Passing tests show no crash and reveal unitless old-reader displays; they do not prove semantic safe-at-any-time rollback.

Remaining required release-instruction corrections:

1. bot.yml attempts pull each iteration but abort||true can continue old code on failed pull. Processing/save/mirror duration unbounded. Remove guaranteed5min/25sec adoption and require actual loaded-source evidence.
2. A bot data commit after the source push is insufficient loaded-code proof: an old in-flight process can save/rebase after that push. Require exact executed-source/content evidence, otherwiseUNKNOWN. Job head alone also insufficient.
3. Source/data disjointness proves code inverse preserves saved data, not semantic safety of old/new producers/readers or concurrently running processes. Own compatibility result admits unitless forecast figures after rollback. Remove blanket'safe at any time'/'cannot conflict'claim. Supply bounded restoration/warning qualification preserving original data and required UNKNOWN, or a separately reviewed explicit residual-acceptance proposal. No automatic settings change or restoring stale encrypted calendar from backup.

These are release/procedure blockers, not new demonstrated runtime regressions. SEC404 omission remains optional scope recommendation and is not promoted to blocker. Refresh only changed operative artifacts/identity after corrections; source tests need no repetition if bytes remain identical. Acceptance24/40unchanged; no key/setup/workflow/production action.
