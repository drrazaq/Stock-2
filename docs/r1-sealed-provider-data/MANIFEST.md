# R1 combined-unit candidate manifest, rev13 (review only; not deployed)

- **Base:** `b0d769876a6ee76f23544850c959111f59d8ae7b` (origin/main when R1 started). **Branch:** `claude/composed-r1-opencheck-calendar-watcher` (never push or merge it: build the release commit with `--build-unit`, RELEASE.md B4). **Previous candidates:** `ae8cbb63` (CHANGES REQUIRED, 6717623537), `a791b438` (CHANGES REQUIRED, 6718099309), `292557c2` (CHANGES REQUIRED, 6718423725), `d02cdfea` (CHANGES REQUIRED, 6718847939), `dc11c03a` (CHANGES REQUIRED, wording only, 6719132742), `67f1beba` (R1 rev7: PASS, 6719376168), `1be8b683` (composition PASS; release binding missing, 6719376168), `af11dbfd` (rev8: CHANGES REQUIRED, modes and candidate identity, 6719707423), `0663f337` (rev9: binding controls PASS; future-at-fetch runtime blocker, 6720355907), `b6ffea2f` (rev10: near-limit re-ageing found in review 6721730197 R1), `8567fd46` (rev11: stale HOLD frozen at fetch age, 6722848900), `5849242e` (rev12: runtime fix; recovery bound still open, 6722943461).
- **Candidate identity:** the commit that adds this file. Its id is given in the PR #1 comment, because a file cannot contain the id of the commit that holds it.
- **Binding:** the authoritative 68-path list with sha256 and size for every file, including this one, is the external `docs/r1-combined-binding/binding.json` (branch `claude/mentor-release-handoff`). This table repeats it for reading.
- **Changed-file allowlist** (relative to the base; this manifest itself excluded): 67 files.
- `git diff --full-index b0d76987 -- <allowlist>` sha256: `1a363fe0531491257b754ae13a6c1bae85206d62a510df2d90323efe5e836b81`

| Status | File | sha256 (candidate) |
|---|---|---|
| A | `.gitattributes` | `873f59d9355f4ba27446eb549847336e6c53be85206f28de248d1dea2a71bf9d` |
| A | `.github/bot-save.sh` | `46f54da729e5aa0060329af8534d60c813871a69a365ca06bfb71d53f53a2211` |
| M | `.github/save-data.sh` | `2f14d37adeeaa3c4624f45c1f29442347e5a897e78132bd82fdc6ad37766ff3a` |
| A | `.github/sealed-git.sh` | `755c41916d85ea5b0b24c13e8f176dc08aee98515d4b0e547f56e88b57b7cb21` |
| M | `.github/workflows/Smart-money.yml` | `d395f27f65b666778a310bd8ffbce2012150e9f78c0367ce7762a06a655335ab` |
| M | `.github/workflows/bot.yml` | `2e4cb467ca233f6ab2a79926b1ca69584dc52f03d428d0f7dd12b3ebd608a89d` |
| M | `.github/workflows/ignition.yml` | `e17509c5c42cb28cde4a856e1f95cb8f2a4d97e4ef2f1ef2f70339d6fb38938a` |
| M | `.github/workflows/leaders-study.yml` | `c32756c900354f1a8753e8be7332d6c8350c96bbbca0026d93ae277a77df8566` |
| M | `.github/workflows/main.yml` | `94f9757ef04fe1efddd78b03b5f8164d24930e861d1e0e026ebc4382ae560afa` |
| M | `.github/workflows/movers.yml` | `6b582f33e5f7ec9c7f781b81542bc33faf57a5783b2c8e4beeae91ac00319d90` |
| M | `.github/workflows/opportunity-radar.yml` | `e98b95b7d91ddb8a6aa605a79013cb53015cbfb502d4452e3d3e5b7707ff5f75` |
| M | `.github/workflows/options-survey.yml` | `4af85096edd7761ace7af0231b18a38f59fedb3341ed475ac958c53dff15fe02` |
| A | `.github/workflows/r1-migrate.yml` | `c12ae92aeeb40ba14a267715028c69d3fdfce61a2dcbf7162a974f8ac225459b` |
| M | `.github/workflows/scorecard-1023.yml` | `9e5cc4f7342606f9f8775035a79658c0cb7803f1062e93b61df048c0aa6b3a33` |
| A | `.gitignore` | `1f3ba70278008b3e3d1542d35177da92a1e678cb131f55376a7a388fffc94892` |
| M | `calendar.mjs` | `33e18a1b893ca80d03684e2043e370354a0a6168d159ff6a7e44eef2b8c74cf3` |
| M | `discover.mjs` | `10ca734376bc2a7213565114656e996f1d4fbcd90d01c39e08eb3a92b573eab4` |
| A | `docs/r1-sealed-provider-data/README.md` | `52a9454624cc66ec761c3db84a45f5cb9b3e2588687a699ab4db5fc34eb75bb6` |
| A | `docs/r1-sealed-provider-data/RELEASE.md` | `d318b02b5e0f74973289c43fcaae6fec7cbdbe81147acdc4397193abcc3764aa` |
| A | `docs/r1-sealed-provider-data/cost-projection.mjs` | `c4e10f28c820de2e86840f4e247b83bcfbfc9bb36ad9eb9cb31738013ea68cf2` |
| A | `docs/r1-sealed-provider-data/t1-inventory.tsv` | `a04ce3bcab12b577634f37279004ca88014e52768c95403ede8ee59cfe6792dd` |
| A | `econ-series.mjs` | `bf1784e957edcff8a03a9cacc61515f094f9dc56451e28c157db33a4e95ebf58` |
| M | `fastmover-lab.mjs` | `a777ecc0d47fe9a08e9e2ca488af1b7a128b5764cd625a22271493e1f66de7ea` |
| M | `health.mjs` | `c63bce9306df2ff897c92dad13001e1eec77fb12eba3c93f475272808348e40e` |
| M | `ignition-watch.mjs` | `5b2fa9e6dadbb5b1d4d9c0d17f70f1b5c8dc6a617e3ae53e1734bdc4ed374e45` |
| M | `missed-runners.mjs` | `067d900ec3c1b66ddfd7e754f58fcbef91641a79655eb13bde42d0a5ce3cfd92` |
| M | `movers.mjs` | `93472c5e0b3d151fd6d49c08c7404d2173f569f05b6ddfceb360e67e0bf545a3` |
| M | `options-survey.mjs` | `d3cea82f378e8e5afe287f56b80c29fef8cdefded5effb781c9022e0191e53c9` |
| A | `r1-release-precheck.mjs` | `fd56115e0cd354314e962b793b7e9122dee16e8e79db10cd760b2876efb3f57c` |
| A | `r1-writer-gate.mjs` | `7ff7a8456d8f693820719f81a70c7370dce9c1f4b7085ed19de7100fe43b6354` |
| M | `scan.mjs` | `3af9dda35a2ea9bc9daa94202d160c52ba8d0c047c8dc28160e8b7f5adc91949` |
| M | `scorecard-1023.mjs` | `a0f0a6a9f1bc9d41886996c76e8d20aa3d988b1ec148a3f7b9ce642bdd10b48a` |
| A | `sealed-guard.mjs` | `b2dc4384e680e8f723951441ff5072487fc5b3a41f13aba7c507463e4e1d7fae` |
| A | `sealed-merge.mjs` | `4182335911f74cf1ef4adf90da45b9dd071ab344e9e659e1506cf6a2c0fbb3a0` |
| A | `sealed-migrate.mjs` | `7b24fa34d2b63e4ff1c40496f551b3a4a340e87ac997d0e1390f959992606ecb` |
| A | `sealed-recover.mjs` | `fc2b8625209e9a0ef6c4b604abae38cf4f25eee29345f6f77f8aaa6ac9fd6faf` |
| A | `sealed-store.mjs` | `093665cc77014f34e15365bff378894062117ae322e8696bb58e2d043086cc31` |
| M | `shadow-outcomes.mjs` | `1dcf0a28d9511569cce0d493fc6f00debdc87bd40d966627e478467b10340bdc` |
| M | `smart-money.mjs` | `3b3a937fbbc47aeafd97d5bf4ffaa53ba224d6c24490c5316424afae8b795bcd` |
| A | `test/discover-sec-note.test.mjs` | `2561908a8afd7181b7d51b5451574b9e0c53f581c397d38ae1ef165bb22041d5` |
| A | `test/econ-calendar-exact-series.test.mjs` | `aa9e0177cff2753ff459e89d712d1098e77716c91731e784c7a016198a0b9e03` |
| M | `test/feed-integrity-watcher.test.mjs` | `7144f713f3158671fe61feae52112b766d341f2685cc5a7c12a6a2baf02f4cfd` |
| A | `test/health-text-watcher-qualification.test.mjs` | `28f16479ec6e5ccf5332496d8c5816d691e6db328a5511b67c5ecb40be4e0310` |
| M | `test/load-scan.mjs` | `37bce00506cc2bb73d5707dc2f737fd3d7d8c1de08cbcfb2b86c32ffa726bdde` |
| A | `test/open-check-repair.test.mjs` | `cc86f2ced9f4b8bdf3462107e04034c7dbe720a3d3020990146c6b2eb4512ddb` |
| M | `test/private-data.test.mjs` | `2c43d3a0fd677fd1cad0404abeecf04b5b555b8fa020512e02ec42c80af0658c` |
| A | `test/sealed-blockers.test.mjs` | `016805622b6b0c21300af4c29a4746f088b219fde36007a0a27580520e60f1de` |
| A | `test/sealed-git.test.mjs` | `ef3692008daedc85a4a741862d0f428bc76f4ce3207adb9f80c639c033ecb0e3` |
| A | `test/sealed-migrate.test.mjs` | `ba4dff2cf6bfb25900758ef7d3ea0faab63aed04226a33b012eabc9e64cf9fb9` |
| A | `test/sealed-readers.test.mjs` | `83ddbf15fdf1875adf5fa4612518cede65fced6ca368445c33acc8779139fcfc` |
| A | `test/sealed-recovery.test.mjs` | `4f22acf836b59c92fa90f1e3a74fbd575f84751dd6c0420a9f9213092ebe2971` |
| A | `test/sealed-release-rehearsal.test.mjs` | `205cc92cf35171056376974b30b498dfc814a8cefc9060c3129e99543ce5edb4` |
| A | `test/sealed-store.test.mjs` | `eef5c043965b0417c3c03ea90df5379672989328c2393aac21c579c07faa84e9` |
| A | `test/sealed-wiring.test.mjs` | `0a37ad53e2c17ce99f6c06644c831d844c6e60972c07823a436731875e86d601` |
| M | `test/sec-request-runtime.test.mjs` | `0de8866ec04bda4688a09612ac73c42d9c335a9eaada16f07a73068ce73f86fb` |
| A | `test/watcher-cadence-review.test.mjs` | `3dcc24b6a5504c1dd6f2410542f30bc1f6d7e560e315fa4351e3727fc69e5af8` |
| M | `test/watcher-guard.test.mjs` | `aee017d1e57126865562dd199c2e2fa7812a789ad5e3f63c279fcd58700efee6` |
| M | `test/watcher-incident-revision.test.mjs` | `dedec3819728826305d7ef5dd595c9911d2a9774c82a04416600694e4b1b31c3` |
| A | `test/watcher-nov2-clock.test.mjs` | `c3ba6cb9ae99d3fc1ec78a93e648313c85fc33ace9392e870eba47ea732a4c19` |
| A | `test/watcher-nov2-fixture.mjs` | `71e812625907e1cd4156470e87cd17017ed6eadf67daa1217a09c309f53fe41a` |
| A | `test/watcher-nov2-guard.test.mjs` | `6e2fbcd66a09af00366e6a21a4677b48ddcdfe9fbd8c568cd224e4774a3b238d` |
| M | `test/watcher-resilience.test.mjs` | `3f189b666dce213f162007fa972a32141d0d6fe5383baa8beb71a12e7a1102f0` |
| M | `watcher-guard-core.mjs` | `05a0d3b7a5ff12e019200f71d5624bc2c8b43d0f65fa354f4b7c5baf19039812` |
| A | `watcher-guard-history.mjs` | `10ae2aa871f495ba603b61fa922d31042516639b4b78682084ae3595507fc421` |
| M | `watcher-guard.mjs` | `d34ade6fbba9c7c78675c51f0dc14cf06a8c76ed2bdb20f9619137e650b52d16` |
| M | `watcher-reporting.mjs` | `49808e58cc39cde7e159f87d80014adefde9f6cbc7f124e871adbf3d2eead25d` |
| A | `watcher-schedule.mjs` | `9fdcdf9bae3c4c0c29d40f0a1b4c747d487e21d00e1e932f6e006a5c744bc111` |

## Full serial suite on this tree

- Node 20.20.0; preload refusing every non-loopback connection (0 attempted).
- **156 of 156 files pass.**
- `premarket-feed` builds its fixture from the real New York date and clock. At one hour on 8 Nov it failed identically on this branch and on the unchanged base `b0d76987`; it passes in this run. R1 does not touch it.
- **Gated actual-watcher scenarios** (`INCIDENT_WATCHER_SRC`): `watcher-resilience` 9/9, `watcher-incident-revision` 11/11.
