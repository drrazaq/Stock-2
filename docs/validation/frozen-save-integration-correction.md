# Frozen-save metadata source and private-clone integration

Failed source4c9e4785a7cd4a4d6261dcf57af3099813aebab5: full push40877866052 and PR40877876353 failed private-data test7. The helper read policy from caller CWD; private-data delegates to the public helper while running in a different clone. Anchoring policy to BASH_SOURCE's public-checkout root repairs the real integration. The fixture public checkout now includes docs/repository-ownership.json. No production private-data script, credential binding or permission change.

Corrected local8 shared-save and9 private-data tests pass; original owner conflict and no-token/no-secret-leak controls remain. The guard is not weakened: missing/corrupt source policy still refuses publication before commit. Re-run full hosted suites, source preservation, safety and artifact continuity on the corrected exact commit. Failed source remains in history, not labelled verified.
