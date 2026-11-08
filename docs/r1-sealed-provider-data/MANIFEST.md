# R1 candidate manifest, rev4 (review only; not deployed)

- **Base:** `b0d769876a6ee76f23544850c959111f59d8ae7b` (origin/main when R1 started). **Branch:** `claude/r1-sealed-provider-data`. **Previous candidates:** `ae8cbb63` (CHANGES REQUIRED, 6717623537), `a791b438` (CHANGES REQUIRED, 6718099309).
- **Candidate identity:** the commit that adds this file. Its id is given in the PR #1 comment, because a file cannot contain the id of the commit that holds it.
- **Changed-file allowlist** (relative to the base; this manifest itself excluded): 50 files.
- `git diff b0d76987 -- <allowlist>` sha256: `ccc52bb0944f8dc438aa9b08fcf15239adc213745680b9fede5d41d43a718fc7`

| Status | File | sha256 (candidate) |
|---|---|---|
| A | `.gitattributes` | `873f59d9355f4ba27446eb549847336e6c53be85206f28de248d1dea2a71bf9d` |
| A | `.github/bot-save.sh` | `594b498bcd9bcc284446de80191246dc9638b9934e90e6a20058ee6db4342b55` |
| M | `.github/save-data.sh` | `2f14d37adeeaa3c4624f45c1f29442347e5a897e78132bd82fdc6ad37766ff3a` |
| A | `.github/sealed-git.sh` | `636fb1f91c60a2894f12e56f4e5d00669dba9ff4c32501d118022a3e01e7afb7` |
| M | `.github/workflows/Smart-money.yml` | `d395f27f65b666778a310bd8ffbce2012150e9f78c0367ce7762a06a655335ab` |
| M | `.github/workflows/bot.yml` | `2e4cb467ca233f6ab2a79926b1ca69584dc52f03d428d0f7dd12b3ebd608a89d` |
| M | `.github/workflows/ignition.yml` | `0be4410560a06621656dc5f1326b8af87f0ca149cc786579681ceb927a1c2919` |
| M | `.github/workflows/leaders-study.yml` | `c32756c900354f1a8753e8be7332d6c8350c96bbbca0026d93ae277a77df8566` |
| M | `.github/workflows/main.yml` | `94f9757ef04fe1efddd78b03b5f8164d24930e861d1e0e026ebc4382ae560afa` |
| M | `.github/workflows/movers.yml` | `6b582f33e5f7ec9c7f781b81542bc33faf57a5783b2c8e4beeae91ac00319d90` |
| M | `.github/workflows/opportunity-radar.yml` | `e98b95b7d91ddb8a6aa605a79013cb53015cbfb502d4452e3d3e5b7707ff5f75` |
| M | `.github/workflows/options-survey.yml` | `4af85096edd7761ace7af0231b18a38f59fedb3341ed475ac958c53dff15fe02` |
| A | `.github/workflows/r1-migrate.yml` | `005b26b8b7d99513313e8e4ed4ee3e56d86ac7088006f905b62ee94e88f3de7b` |
| M | `.github/workflows/scorecard-1023.yml` | `9e5cc4f7342606f9f8775035a79658c0cb7803f1062e93b61df048c0aa6b3a33` |
| A | `.gitignore` | `1f3ba70278008b3e3d1542d35177da92a1e678cb131f55376a7a388fffc94892` |
| A | `docs/r1-sealed-provider-data/README.md` | `fbfc1e2e32d316f239b04742f54373ce3b4644f1ccfae6d6887700a493a875d9` |
| A | `docs/r1-sealed-provider-data/RELEASE.md` | `dc837ad3b2f1c2f8c84155061062b9fcbfdff97cc39d5bc4782624e555a6a218` |
| A | `docs/r1-sealed-provider-data/cost-projection.mjs` | `c4e10f28c820de2e86840f4e247b83bcfbfc9bb36ad9eb9cb31738013ea68cf2` |
| A | `docs/r1-sealed-provider-data/t1-inventory.tsv` | `a04ce3bcab12b577634f37279004ca88014e52768c95403ede8ee59cfe6792dd` |
| M | `fastmover-lab.mjs` | `a777ecc0d47fe9a08e9e2ca488af1b7a128b5764cd625a22271493e1f66de7ea` |
| M | `health.mjs` | `c63bce9306df2ff897c92dad13001e1eec77fb12eba3c93f475272808348e40e` |
| M | `ignition-watch.mjs` | `cb94fc5caf8ea60d0d99647bfd112627e52da0706ee0da4451353f83d0bfd46c` |
| M | `missed-runners.mjs` | `067d900ec3c1b66ddfd7e754f58fcbef91641a79655eb13bde42d0a5ce3cfd92` |
| M | `movers.mjs` | `93472c5e0b3d151fd6d49c08c7404d2173f569f05b6ddfceb360e67e0bf545a3` |
| M | `options-survey.mjs` | `d3cea82f378e8e5afe287f56b80c29fef8cdefded5effb781c9022e0191e53c9` |
| A | `r1-release-precheck.mjs` | `2bf817a703a73145eb7d56eaf607bdcc7fa15cb25599459e18edad613dc5389b` |
| A | `r1-writer-gate.mjs` | `234116d5597c1cc0a91733ef4240cbf3866b05b489dcf380ec6dca7d56f7c282` |
| M | `scan.mjs` | `2d55c5e1f62a088d54b6a66f18be848dae018aad1fc74c213104e0300e2b0d31` |
| M | `scorecard-1023.mjs` | `a0f0a6a9f1bc9d41886996c76e8d20aa3d988b1ec148a3f7b9ce642bdd10b48a` |
| A | `sealed-guard.mjs` | `b2dc4384e680e8f723951441ff5072487fc5b3a41f13aba7c507463e4e1d7fae` |
| A | `sealed-merge.mjs` | `4182335911f74cf1ef4adf90da45b9dd071ab344e9e659e1506cf6a2c0fbb3a0` |
| A | `sealed-migrate.mjs` | `08f1b4c589aeac13bb54dc6393b62d64c5f598b131b1718f0fd572917b8cbb4f` |
| A | `sealed-store.mjs` | `093665cc77014f34e15365bff378894062117ae322e8696bb58e2d043086cc31` |
| M | `shadow-outcomes.mjs` | `1dcf0a28d9511569cce0d493fc6f00debdc87bd40d966627e478467b10340bdc` |
| M | `smart-money.mjs` | `3b3a937fbbc47aeafd97d5bf4ffaa53ba224d6c24490c5316424afae8b795bcd` |
| M | `test/feed-integrity-watcher.test.mjs` | `7144f713f3158671fe61feae52112b766d341f2685cc5a7c12a6a2baf02f4cfd` |
| M | `test/load-scan.mjs` | `37bce00506cc2bb73d5707dc2f737fd3d7d8c1de08cbcfb2b86c32ffa726bdde` |
| M | `test/private-data.test.mjs` | `2c43d3a0fd677fd1cad0404abeecf04b5b555b8fa020512e02ec42c80af0658c` |
| A | `test/sealed-blockers.test.mjs` | `47b72c14b99b596c243088902cb71180d6b0cea9ba49f663a077bed47ea4372e` |
| A | `test/sealed-git.test.mjs` | `ef3692008daedc85a4a741862d0f428bc76f4ce3207adb9f80c639c033ecb0e3` |
| A | `test/sealed-migrate.test.mjs` | `95760bc5d725e1bdd7a4b934f1d42d8c9424fc364fdd1c6672d893dddc5ce60f` |
| A | `test/sealed-readers.test.mjs` | `83ddbf15fdf1875adf5fa4612518cede65fced6ca368445c33acc8779139fcfc` |
| A | `test/sealed-recovery.test.mjs` | `680412ad1d7dbad81a76d6a800a660ee158f33eebbbfce1e6c89792b09946b57` |
| A | `test/sealed-release-rehearsal.test.mjs` | `28fd0330a81c5fc480a01686ef7338bd5bbce7e5d0401463e8a1b3f4c64f60ee` |
| A | `test/sealed-store.test.mjs` | `eef5c043965b0417c3c03ea90df5379672989328c2393aac21c579c07faa84e9` |
| A | `test/sealed-wiring.test.mjs` | `bfa2b46735e697459eec578863576030f68dad66b7e706f85a734633c6b968d6` |
| M | `test/sec-request-runtime.test.mjs` | `0de8866ec04bda4688a09612ac73c42d9c335a9eaada16f07a73068ce73f86fb` |
| M | `test/watcher-incident-revision.test.mjs` | `dedec3819728826305d7ef5dd595c9911d2a9774c82a04416600694e4b1b31c3` |
| M | `test/watcher-resilience.test.mjs` | `3f189b666dce213f162007fa972a32141d0d6fe5383baa8beb71a12e7a1102f0` |
| M | `watcher-reporting.mjs` | `49808e58cc39cde7e159f87d80014adefde9f6cbc7f124e871adbf3d2eead25d` |

## Full serial suite on this tree

- Node 20.20.0; preload refusing every non-loopback connection (0 attempted).
- **149 of 149 files pass.**
- `premarket-feed` builds its fixture from the real New York date and clock. At one hour on 8 Nov it failed identically on this branch and on the unchanged base `b0d76987`; it passes in this run. R1 does not touch it.
- **Gated actual-watcher scenarios** (`INCIDENT_WATCHER_SRC`): `watcher-resilience` 9/9, `watcher-incident-revision` 11/11.
- **Release precheck** against production main at packaging time: see the PR comment (re-run at the start of any window, gate G6).
