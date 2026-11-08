# R1 candidate manifest, rev3 (review only; not deployed)

- **Base:** `b0d769876a6ee76f23544850c959111f59d8ae7b` (origin/main when R1 started). **Branch:** `claude/r1-sealed-provider-data`. **Previous candidate:** `ae8cbb63` (Codex: CHANGES REQUIRED, PR #1 comment 6717623537).
- **Candidate identity:** the commit that adds this file. Its id is given in the PR #1 comment, because a file cannot contain the id of the commit that holds it.
- **Changed-file allowlist** (relative to the base; this manifest itself excluded): 45 files.
- `git diff b0d76987 -- <allowlist>` sha256: `976b40d88b65251e2cfbb34d60d9662de517b067a711593e056dae78e2b8eab0`

| Status | File | sha256 (candidate) |
|---|---|---|
| A | `.gitattributes` | `873f59d9355f4ba27446eb549847336e6c53be85206f28de248d1dea2a71bf9d` |
| A | `.github/bot-save.sh` | `de02eded8e718cd76a66ab8f08fb5c4b5b74d4e9e05b8ce0ba3be4614caca4d9` |
| M | `.github/save-data.sh` | `11f42f32b095ddcb3819cae07b8edccea0ec60d6f40fddf3c8823330a3dd9f59` |
| A | `.github/sealed-git.sh` | `d776fc0a62a77e339cb49fb5f79b770647bd6a63db0ffa866b65a26f39e3a8c1` |
| M | `.github/workflows/Smart-money.yml` | `4a2632f5e8cad0b3b479a039b21ac1e3074f9f516fdace7aabad914f70a75561` |
| M | `.github/workflows/bot.yml` | `8c23334d195b8e00cffb6623f8e081d765c6a40babd291928686db0c2fcdec50` |
| M | `.github/workflows/ignition.yml` | `e3b8f030e0b6174dff01b17d5f108f280cb7bfd2facebfd574de1e51e3202ca6` |
| M | `.github/workflows/leaders-study.yml` | `37b43d16951da3dab825cd4882ad8a2f2129a8d98058dc40b8e9672645f8bb65` |
| M | `.github/workflows/main.yml` | `94f9757ef04fe1efddd78b03b5f8164d24930e861d1e0e026ebc4382ae560afa` |
| M | `.github/workflows/movers.yml` | `aabf9a1d81ce1caf200e40ef1cf02003417800019d303e5ec7657057e89cf61c` |
| M | `.github/workflows/opportunity-radar.yml` | `e98b95b7d91ddb8a6aa605a79013cb53015cbfb502d4452e3d3e5b7707ff5f75` |
| M | `.github/workflows/options-survey.yml` | `6177f9646b78ce9e903b0b9a4a5c3efeda9385e88e3833564457abd1f3c8e6ef` |
| A | `.github/workflows/r1-migrate.yml` | `005b26b8b7d99513313e8e4ed4ee3e56d86ac7088006f905b62ee94e88f3de7b` |
| M | `.github/workflows/scorecard-1023.yml` | `9e5cc4f7342606f9f8775035a79658c0cb7803f1062e93b61df048c0aa6b3a33` |
| A | `docs/r1-sealed-provider-data/README.md` | `9aea9b739d13f4cdab5b67b642270e784048063055632b8d1504d90d4f25eb4d` |
| A | `docs/r1-sealed-provider-data/cost-projection.mjs` | `c666f8a6825cc4d8b69ac9ef5be0fd1aeac9b6731364a7b017a4c23b64ad324e` |
| A | `docs/r1-sealed-provider-data/t1-inventory.tsv` | `a04ce3bcab12b577634f37279004ca88014e52768c95403ede8ee59cfe6792dd` |
| M | `fastmover-lab.mjs` | `a777ecc0d47fe9a08e9e2ca488af1b7a128b5764cd625a22271493e1f66de7ea` |
| M | `health.mjs` | `c63bce9306df2ff897c92dad13001e1eec77fb12eba3c93f475272808348e40e` |
| M | `ignition-watch.mjs` | `cb94fc5caf8ea60d0d99647bfd112627e52da0706ee0da4451353f83d0bfd46c` |
| M | `missed-runners.mjs` | `067d900ec3c1b66ddfd7e754f58fcbef91641a79655eb13bde42d0a5ce3cfd92` |
| M | `movers.mjs` | `93472c5e0b3d151fd6d49c08c7404d2173f569f05b6ddfceb360e67e0bf545a3` |
| M | `options-survey.mjs` | `d3cea82f378e8e5afe287f56b80c29fef8cdefded5effb781c9022e0191e53c9` |
| A | `r1-writer-gate.mjs` | `5c2b2907724accc91c53bee19e24548f3a41aa4f59bdd643652c389a717941c0` |
| M | `scan.mjs` | `2d55c5e1f62a088d54b6a66f18be848dae018aad1fc74c213104e0300e2b0d31` |
| M | `scorecard-1023.mjs` | `a0f0a6a9f1bc9d41886996c76e8d20aa3d988b1ec148a3f7b9ce642bdd10b48a` |
| A | `sealed-guard.mjs` | `b2dc4384e680e8f723951441ff5072487fc5b3a41f13aba7c507463e4e1d7fae` |
| A | `sealed-merge.mjs` | `4182335911f74cf1ef4adf90da45b9dd071ab344e9e659e1506cf6a2c0fbb3a0` |
| A | `sealed-migrate.mjs` | `7ea127aa07a9363332ff1428185fb1d834ff8d484fcd07c0e828e2c881ff96c4` |
| A | `sealed-store.mjs` | `68d46f43db82488c5827b8e79fcb534e4ae2b68ab3645cd77d741ba2fc880e6f` |
| M | `shadow-outcomes.mjs` | `1dcf0a28d9511569cce0d493fc6f00debdc87bd40d966627e478467b10340bdc` |
| M | `smart-money.mjs` | `3b3a937fbbc47aeafd97d5bf4ffaa53ba224d6c24490c5316424afae8b795bcd` |
| M | `test/feed-integrity-watcher.test.mjs` | `7144f713f3158671fe61feae52112b766d341f2685cc5a7c12a6a2baf02f4cfd` |
| M | `test/load-scan.mjs` | `37bce00506cc2bb73d5707dc2f737fd3d7d8c1de08cbcfb2b86c32ffa726bdde` |
| M | `test/private-data.test.mjs` | `2c43d3a0fd677fd1cad0404abeecf04b5b555b8fa020512e02ec42c80af0658c` |
| A | `test/sealed-blockers.test.mjs` | `d615b2a588314c9fd8feb2bceade83158ce35e8035b71c895b29401af2e06169` |
| A | `test/sealed-git.test.mjs` | `ef3692008daedc85a4a741862d0f428bc76f4ce3207adb9f80c639c033ecb0e3` |
| A | `test/sealed-migrate.test.mjs` | `37bf25c931dcd7c0c4de1c5dce8ec2b24137dc05cf450da8e198f04eb9907988` |
| A | `test/sealed-readers.test.mjs` | `83ddbf15fdf1875adf5fa4612518cede65fced6ca368445c33acc8779139fcfc` |
| A | `test/sealed-store.test.mjs` | `eef5c043965b0417c3c03ea90df5379672989328c2393aac21c579c07faa84e9` |
| A | `test/sealed-wiring.test.mjs` | `4370a6936cc25e0d84f525444df3824b73bbe74466a52e6956aaa7d105bef4d2` |
| M | `test/sec-request-runtime.test.mjs` | `0de8866ec04bda4688a09612ac73c42d9c335a9eaada16f07a73068ce73f86fb` |
| M | `test/watcher-incident-revision.test.mjs` | `dedec3819728826305d7ef5dd595c9911d2a9774c82a04416600694e4b1b31c3` |
| M | `test/watcher-resilience.test.mjs` | `3f189b666dce213f162007fa972a32141d0d6fe5383baa8beb71a12e7a1102f0` |
| M | `watcher-reporting.mjs` | `49808e58cc39cde7e159f87d80014adefde9f6cbc7f124e871adbf3d2eead25d` |

## Full serial suite on this tree

- Node 20.20.0; preload refusing every non-loopback connection (0 attempted).
- **147 of 147 files pass.**
- `premarket-feed` builds its fixture from the real New York date and clock. At one hour on 8 Nov it failed identically on this branch and on the unchanged base `b0d76987`; it passes in this run. R1 does not touch it.
- **Gated actual-watcher scenarios** (`INCIDENT_WATCHER_SRC`): `watcher-resilience` 9/9, `watcher-incident-revision` 11/11.
