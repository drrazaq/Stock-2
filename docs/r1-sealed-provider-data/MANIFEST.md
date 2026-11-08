# R1 candidate manifest, rev5 (review only; not deployed)

- **Base:** `b0d769876a6ee76f23544850c959111f59d8ae7b` (origin/main when R1 started). **Branch:** `claude/r1-sealed-provider-data`. **Previous candidates:** `ae8cbb63` (CHANGES REQUIRED, 6717623537), `a791b438` (CHANGES REQUIRED, 6718099309), `292557c2` (CHANGES REQUIRED, 6718423725).
- **Candidate identity:** the commit that adds this file. Its id is given in the PR #1 comment, because a file cannot contain the id of the commit that holds it.
- **Changed-file allowlist** (relative to the base; this manifest itself excluded): 51 files.
- `git diff b0d76987 -- <allowlist>` sha256: `6abb26fae19d91ca1aef5309bbbf3ca872b990c2dc0fa4ad1e1ec5df514d1a8e`

| Status | File | sha256 (candidate) |
|---|---|---|
| A | `.gitattributes` | `873f59d9355f4ba27446eb549847336e6c53be85206f28de248d1dea2a71bf9d` |
| A | `.github/bot-save.sh` | `b2735eb55173ab31fde708fb40b501be9f19665405a1eafb5558296e74a4f721` |
| M | `.github/save-data.sh` | `2f14d37adeeaa3c4624f45c1f29442347e5a897e78132bd82fdc6ad37766ff3a` |
| A | `.github/sealed-git.sh` | `012b80b5dc95c32e7a515df026dc5565c2b8ab95b295e8f7a2172d8c40c8c6f1` |
| M | `.github/workflows/Smart-money.yml` | `d395f27f65b666778a310bd8ffbce2012150e9f78c0367ce7762a06a655335ab` |
| M | `.github/workflows/bot.yml` | `2e4cb467ca233f6ab2a79926b1ca69584dc52f03d428d0f7dd12b3ebd608a89d` |
| M | `.github/workflows/ignition.yml` | `0be4410560a06621656dc5f1326b8af87f0ca149cc786579681ceb927a1c2919` |
| M | `.github/workflows/leaders-study.yml` | `c32756c900354f1a8753e8be7332d6c8350c96bbbca0026d93ae277a77df8566` |
| M | `.github/workflows/main.yml` | `94f9757ef04fe1efddd78b03b5f8164d24930e861d1e0e026ebc4382ae560afa` |
| M | `.github/workflows/movers.yml` | `6b582f33e5f7ec9c7f781b81542bc33faf57a5783b2c8e4beeae91ac00319d90` |
| M | `.github/workflows/opportunity-radar.yml` | `e98b95b7d91ddb8a6aa605a79013cb53015cbfb502d4452e3d3e5b7707ff5f75` |
| M | `.github/workflows/options-survey.yml` | `4af85096edd7761ace7af0231b18a38f59fedb3341ed475ac958c53dff15fe02` |
| A | `.github/workflows/r1-migrate.yml` | `1b5a2ae2888e6b202dcd289430468b86707768334d0efdfccc735d5e4b9ed818` |
| M | `.github/workflows/scorecard-1023.yml` | `9e5cc4f7342606f9f8775035a79658c0cb7803f1062e93b61df048c0aa6b3a33` |
| A | `.gitignore` | `1f3ba70278008b3e3d1542d35177da92a1e678cb131f55376a7a388fffc94892` |
| A | `docs/r1-sealed-provider-data/README.md` | `5d956249a0e427c5c5453f3ce144dff77ff3d708ef44c465030d18a7ad455122` |
| A | `docs/r1-sealed-provider-data/RELEASE.md` | `d6eef0d0eb5c08f0f23211144e7aaf0df8febe474d8430318f3accb32a7e772b` |
| A | `docs/r1-sealed-provider-data/cost-projection.mjs` | `c4e10f28c820de2e86840f4e247b83bcfbfc9bb36ad9eb9cb31738013ea68cf2` |
| A | `docs/r1-sealed-provider-data/t1-inventory.tsv` | `a04ce3bcab12b577634f37279004ca88014e52768c95403ede8ee59cfe6792dd` |
| M | `fastmover-lab.mjs` | `a777ecc0d47fe9a08e9e2ca488af1b7a128b5764cd625a22271493e1f66de7ea` |
| M | `health.mjs` | `c63bce9306df2ff897c92dad13001e1eec77fb12eba3c93f475272808348e40e` |
| M | `ignition-watch.mjs` | `cb94fc5caf8ea60d0d99647bfd112627e52da0706ee0da4451353f83d0bfd46c` |
| M | `missed-runners.mjs` | `067d900ec3c1b66ddfd7e754f58fcbef91641a79655eb13bde42d0a5ce3cfd92` |
| M | `movers.mjs` | `93472c5e0b3d151fd6d49c08c7404d2173f569f05b6ddfceb360e67e0bf545a3` |
| M | `options-survey.mjs` | `d3cea82f378e8e5afe287f56b80c29fef8cdefded5effb781c9022e0191e53c9` |
| A | `r1-release-precheck.mjs` | `2bf817a703a73145eb7d56eaf607bdcc7fa15cb25599459e18edad613dc5389b` |
| A | `r1-writer-gate.mjs` | `9f32947094f03171aca11808c710508f78fcb80764888774cf5d1a6ca2533e2e` |
| M | `scan.mjs` | `2d55c5e1f62a088d54b6a66f18be848dae018aad1fc74c213104e0300e2b0d31` |
| M | `scorecard-1023.mjs` | `a0f0a6a9f1bc9d41886996c76e8d20aa3d988b1ec148a3f7b9ce642bdd10b48a` |
| A | `sealed-guard.mjs` | `b2dc4384e680e8f723951441ff5072487fc5b3a41f13aba7c507463e4e1d7fae` |
| A | `sealed-merge.mjs` | `4182335911f74cf1ef4adf90da45b9dd071ab344e9e659e1506cf6a2c0fbb3a0` |
| A | `sealed-migrate.mjs` | `4c38920cd0e50439b21b0ef40e05d30430e61b5e2605d7bd1a06318d06281704` |
| A | `sealed-recover.mjs` | `71efaa04bc1b3a9f78636c8b50384a0ba0920e9f4ff9566d02a0d745d9a6c4b6` |
| A | `sealed-store.mjs` | `093665cc77014f34e15365bff378894062117ae322e8696bb58e2d043086cc31` |
| M | `shadow-outcomes.mjs` | `1dcf0a28d9511569cce0d493fc6f00debdc87bd40d966627e478467b10340bdc` |
| M | `smart-money.mjs` | `3b3a937fbbc47aeafd97d5bf4ffaa53ba224d6c24490c5316424afae8b795bcd` |
| M | `test/feed-integrity-watcher.test.mjs` | `7144f713f3158671fe61feae52112b766d341f2685cc5a7c12a6a2baf02f4cfd` |
| M | `test/load-scan.mjs` | `37bce00506cc2bb73d5707dc2f737fd3d7d8c1de08cbcfb2b86c32ffa726bdde` |
| M | `test/private-data.test.mjs` | `2c43d3a0fd677fd1cad0404abeecf04b5b555b8fa020512e02ec42c80af0658c` |
| A | `test/sealed-blockers.test.mjs` | `621d98d5781855c44b84476b24bfe2d5a76162341debfd5912fa39a48786872d` |
| A | `test/sealed-git.test.mjs` | `ef3692008daedc85a4a741862d0f428bc76f4ce3207adb9f80c639c033ecb0e3` |
| A | `test/sealed-migrate.test.mjs` | `0e1f518f389493879677928480b1dfcb05793588d7a156201df7182e9bdbb6a8` |
| A | `test/sealed-readers.test.mjs` | `83ddbf15fdf1875adf5fa4612518cede65fced6ca368445c33acc8779139fcfc` |
| A | `test/sealed-recovery.test.mjs` | `90f4729c6253ab78e3aef8e641801dbab121edafb18930b632ac870e1f11be6d` |
| A | `test/sealed-release-rehearsal.test.mjs` | `e82bee9ffa437364892e2c7888d3440a1b43fb2545c8593bcdb0dc37d2792ec0` |
| A | `test/sealed-store.test.mjs` | `eef5c043965b0417c3c03ea90df5379672989328c2393aac21c579c07faa84e9` |
| A | `test/sealed-wiring.test.mjs` | `c0405fdd5cbc262c1057f32e9799896b288511f2d7f2b983b8b611deaf0198d9` |
| M | `test/sec-request-runtime.test.mjs` | `0de8866ec04bda4688a09612ac73c42d9c335a9eaada16f07a73068ce73f86fb` |
| M | `test/watcher-incident-revision.test.mjs` | `dedec3819728826305d7ef5dd595c9911d2a9774c82a04416600694e4b1b31c3` |
| M | `test/watcher-resilience.test.mjs` | `3f189b666dce213f162007fa972a32141d0d6fe5383baa8beb71a12e7a1102f0` |
| M | `watcher-reporting.mjs` | `49808e58cc39cde7e159f87d80014adefde9f6cbc7f124e871adbf3d2eead25d` |

## Full serial suite on this tree

- Node 20.20.0; preload refusing every non-loopback connection (0 attempted).
- **149 of 149 files pass.**
- `premarket-feed` builds its fixture from the real New York date and clock. At one hour on 8 Nov it failed identically on this branch and on the unchanged base `b0d76987`; it passes in this run. R1 does not touch it.
- **Gated actual-watcher scenarios** (`INCIDENT_WATCHER_SRC`): `watcher-resilience` 9/9, `watcher-incident-revision` 11/11.
