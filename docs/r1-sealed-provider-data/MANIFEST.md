# R1 combined-unit candidate manifest, rev20 (review only; not deployed)

- **Base:** `b0d769876a6ee76f23544850c959111f59d8ae7b` (origin/main when R1 started). **Branch:** `claude/composed-r1-opencheck-calendar-watcher` (never push or merge it: build the release commit with `--build-unit`, RELEASE.md B4). **Previous candidates:** `ae8cbb63` (CHANGES REQUIRED, 6717623537), `a791b438` (CHANGES REQUIRED, 6718099309), `292557c2` (CHANGES REQUIRED, 6718423725), `d02cdfea` (CHANGES REQUIRED, 6718847939), `dc11c03a` (CHANGES REQUIRED, wording only, 6719132742), `67f1beba` (R1 rev7: PASS, 6719376168), `1be8b683` (composition PASS; release binding missing, 6719376168), `af11dbfd` (rev8: CHANGES REQUIRED, modes and candidate identity, 6719707423), `0663f337` (rev9: binding controls PASS; future-at-fetch runtime blocker, 6720355907), `b6ffea2f` (rev10: near-limit re-ageing found in review 6721730197 R1), `8567fd46` (rev11: stale HOLD frozen at fetch age, 6722848900), `5849242e` (rev12: runtime fix; recovery bound still open, 6722943461), `c00b8b24` (rev13: CHANGES REQUIRED B1-B5, 6723732821), `df5ee960` (rev14: B1-B5 closed; N1 and operative counts open, 6724620286), `09f58ca5` (rev15: CHANGES REQUIRED R1-R3, 6725294448), `cdda3dc3` (rev16: multipart BUY NOW remainder unchecked, 6725877594).
- **Candidate identity:** the commit that adds this file. Its id is given in the PR #1 comment, because a file cannot contain the id of the commit that holds it.
- **Binding:** the authoritative path list (79 paths in rev20) with sha256 and size for every file, including this one, is the external `docs/r1-combined-binding/binding.json` (branch `claude/mentor-release-handoff`). This table repeats it for reading.
- **Changed-file allowlist** (relative to the base; this manifest itself excluded): 78 files.
- `git diff --full-index b0d76987 -- <allowlist>` sha256: `766bb3185391f219209bd2dc7a06dcfe22ac1ade23b5daa2fddf25342edd499a`

| Status | File | sha256 (candidate) |
|---|---|---|
| A | `.gitattributes` | `873f59d9355f4ba27446eb549847336e6c53be85206f28de248d1dea2a71bf9d` |
| A | `.github/bot-save.sh` | `0155a56e2db36da3e5766a98e83e30f115c02647fdf24cc1482b07d477ffa339` |
| M | `.github/save-data.sh` | `2f14d37adeeaa3c4624f45c1f29442347e5a897e78132bd82fdc6ad37766ff3a` |
| A | `.github/sealed-git.sh` | `987ee55dc00d407393c8bba8351fa6c28cad3d33fc59bf085a956c00f901844d` |
| M | `.github/workflows/Smart-money.yml` | `96ad0f675fc37c865ef13d834e7bc8e24fc89308ee40a6ae30439fd1786b1d41` |
| M | `.github/workflows/bot.yml` | `3d7ca09494aeda3f4436d9f4d58e41cc2c0cac0df2d06f8415a8343b8f81be6b` |
| M | `.github/workflows/ignition.yml` | `b7ae9bdc8c9e76748e77d2a8120c55d12895b607821af0bb69947a3d1227d3bc` |
| M | `.github/workflows/leaders-study.yml` | `15705735a22e6c6fc45378b2204c0aacddc9b92854b63c5508d1949d9bbed37d` |
| M | `.github/workflows/main.yml` | `70af57b6676f8079d473041849d37c6716bac51314ce31e5471edce68c2d8b7b` |
| M | `.github/workflows/movers.yml` | `8294c7f18ffd8af226292d803935bb5046453448009e77e592a8ec7300efbfe4` |
| M | `.github/workflows/opportunity-radar.yml` | `18a9154fce48d85ff7ca3123ac157eafb69b0c94c6226144dcacfacf1d2d57a0` |
| M | `.github/workflows/options-survey.yml` | `9505fae492034e52f9d59c308f8f0119355da942c2e805217f497d0377c9c804` |
| A | `.github/workflows/r1-migrate.yml` | `4daea823419dd4abe3fb2235ebd40ffdc8b065666e16696166f226e9b7005f59` |
| M | `.github/workflows/scorecard-1023.yml` | `13a4403762a517ee1150c835285dcbf0a01924f6c094d9f9184dc69fcd417a91` |
| A | `.gitignore` | `1f3ba70278008b3e3d1542d35177da92a1e678cb131f55376a7a388fffc94892` |
| M | `calendar.mjs` | `33e18a1b893ca80d03684e2043e370354a0a6168d159ff6a7e44eef2b8c74cf3` |
| M | `discover.mjs` | `10ca734376bc2a7213565114656e996f1d4fbcd90d01c39e08eb3a92b573eab4` |
| A | `docs/r1-sealed-provider-data/K2-KEY-SETUP.md` | `a669af86e9ed2ec1a5a85682723409ca7a7d2f85facf1056c16377f398a18bf6` |
| A | `docs/r1-sealed-provider-data/README.md` | `472d9d961caf6facb1084cd63ff8c5ffa47ad8ceba6fcd1ff75b597e6682a320` |
| A | `docs/r1-sealed-provider-data/RELEASE.md` | `291ed119a49289d822df84c466cef7ff4195ba1635564206b4b9277cbd14e05b` |
| A | `docs/r1-sealed-provider-data/cost-projection.mjs` | `c4e10f28c820de2e86840f4e247b83bcfbfc9bb36ad9eb9cb31738013ea68cf2` |
| A | `docs/r1-sealed-provider-data/k2-key-tool.html` | `18c663a4294f98b757105eb4b63de5a4c5dca6b5e87d27b9190bfb2d935ff00b` |
| A | `docs/r1-sealed-provider-data/t1-inventory.tsv` | `a04ce3bcab12b577634f37279004ca88014e52768c95403ede8ee59cfe6792dd` |
| A | `econ-series.mjs` | `bf1784e957edcff8a03a9cacc61515f094f9dc56451e28c157db33a4e95ebf58` |
| M | `fastmover-lab.mjs` | `a777ecc0d47fe9a08e9e2ca488af1b7a128b5764cd625a22271493e1f66de7ea` |
| M | `health.mjs` | `c63bce9306df2ff897c92dad13001e1eec77fb12eba3c93f475272808348e40e` |
| M | `ignition-watch.mjs` | `5b2fa9e6dadbb5b1d4d9c0d17f70f1b5c8dc6a617e3ae53e1734bdc4ed374e45` |
| M | `missed-runners.mjs` | `067d900ec3c1b66ddfd7e754f58fcbef91641a79655eb13bde42d0a5ce3cfd92` |
| M | `movers.mjs` | `93472c5e0b3d151fd6d49c08c7404d2173f569f05b6ddfceb360e67e0bf545a3` |
| M | `opportunity-radar.mjs` | `e628f2006f2e66e5ff8a06bdfcfee4f640876a5c47b47f6b3446bf70323c36c4` |
| M | `options-survey.mjs` | `d3cea82f378e8e5afe287f56b80c29fef8cdefded5effb781c9022e0191e53c9` |
| A | `r1-release-precheck.mjs` | `fd56115e0cd354314e962b793b7e9122dee16e8e79db10cd760b2876efb3f57c` |
| A | `r1-writer-gate.mjs` | `7ff7a8456d8f693820719f81a70c7370dce9c1f4b7085ed19de7100fe43b6354` |
| M | `scan.mjs` | `bf48e9bb6560811cd7836e31a01d125a6ad1add7a762b29d0630e3e4ecedd341` |
| M | `scorecard-1023.mjs` | `a0f0a6a9f1bc9d41886996c76e8d20aa3d988b1ec148a3f7b9ce642bdd10b48a` |
| A | `sealed-guard.mjs` | `b2dc4384e680e8f723951441ff5072487fc5b3a41f13aba7c507463e4e1d7fae` |
| A | `sealed-merge.mjs` | `4182335911f74cf1ef4adf90da45b9dd071ab344e9e659e1506cf6a2c0fbb3a0` |
| A | `sealed-migrate.mjs` | `8a11ac9edc22676bc6a2a53a1801ab8b77f09c4a3768622f141552dac70e5f9c` |
| A | `sealed-recover.mjs` | `fc2b8625209e9a0ef6c4b604abae38cf4f25eee29345f6f77f8aaa6ac9fd6faf` |
| A | `sealed-store.mjs` | `aad05868366741d724c0ea5b161e005eb676f4813f2f2599824a3a74364df8c4` |
| M | `shadow-outcomes.mjs` | `1dcf0a28d9511569cce0d493fc6f00debdc87bd40d966627e478467b10340bdc` |
| M | `smart-money.mjs` | `3b3a937fbbc47aeafd97d5bf4ffaa53ba224d6c24490c5316424afae8b795bcd` |
| A | `test/buynow-evidence.test.mjs` | `128a3af3da884af4c4a1919a14ad89557bc1c3a4374ffbbe2fe8d1c2c89ff842` |
| A | `test/buynow-multipart.test.mjs` | `7f3984bb4a19fba4ce01c6cac6d64daca79ec95164df70b263f044ab633ca2d4` |
| A | `test/discover-sec-note.test.mjs` | `2561908a8afd7181b7d51b5451574b9e0c53f581c397d38ae1ef165bb22041d5` |
| A | `test/econ-calendar-exact-series.test.mjs` | `aa9e0177cff2753ff459e89d712d1098e77716c91731e784c7a016198a0b9e03` |
| M | `test/feed-integrity-watcher.test.mjs` | `7144f713f3158671fe61feae52112b766d341f2685cc5a7c12a6a2baf02f4cfd` |
| A | `test/health-text-watcher-qualification.test.mjs` | `28f16479ec6e5ccf5332496d8c5816d691e6db328a5511b67c5ecb40be4e0310` |
| A | `test/intraday-alert-evidence.test.mjs` | `6f40820604d323293914cd1be464e73a59b3fd98caa4a2ee58a63d3d97be9d17` |
| A | `test/intraday-alert-send-time.test.mjs` | `97f4b803a932f4a76b462b1d4b7cf80353b794c08173645d1468af31cebe535a` |
| M | `test/load-scan.mjs` | `37bce00506cc2bb73d5707dc2f737fd3d7d8c1de08cbcfb2b86c32ffa726bdde` |
| A | `test/open-check-repair.test.mjs` | `9ace6e8370bf4df0cf07710c78daafd2ebaedfb0ed6b1b2e81cce9ea6195103d` |
| M | `test/private-data.test.mjs` | `2c43d3a0fd677fd1cad0404abeecf04b5b555b8fa020512e02ec42c80af0658c` |
| A | `test/radar-sealed-reader.test.mjs` | `d156b07bb189118b5d03b3c7e942d07b5e2bd80c976a5832b37de270e32243a6` |
| A | `test/sealed-blockers.test.mjs` | `016805622b6b0c21300af4c29a4746f088b219fde36007a0a27580520e60f1de` |
| A | `test/sealed-git.test.mjs` | `ef3692008daedc85a4a741862d0f428bc76f4ce3207adb9f80c639c033ecb0e3` |
| A | `test/sealed-migrate.test.mjs` | `17a4354a6f1c30dd1daabf3daa6a7a91ea91a724246d83a8b308f81308413989` |
| A | `test/sealed-readers.test.mjs` | `83ddbf15fdf1875adf5fa4612518cede65fced6ca368445c33acc8779139fcfc` |
| A | `test/sealed-recovery-actual-paths.test.mjs` | `215cf144cc90d1f69157474a4d81b380679c57a570c17ead1bfed1944663bdb8` |
| A | `test/sealed-recovery.test.mjs` | `d10906d15912eb829080128a7688a0b66d273ebd9becd5277fe586cb8e3cf8ea` |
| A | `test/sealed-release-rehearsal.test.mjs` | `7b90231ea6cb8416c48c300365f2602bb65617a70e8f286dad11cd78f6d730f4` |
| A | `test/sealed-store.test.mjs` | `eef5c043965b0417c3c03ea90df5379672989328c2393aac21c579c07faa84e9` |
| A | `test/sealed-wiring.test.mjs` | `2fea74777a0d2c2e1a7d3f816a93c20b68f56c4796135047c7d065824e82aad9` |
| M | `test/sec-request-runtime.test.mjs` | `0de8866ec04bda4688a09612ac73c42d9c335a9eaada16f07a73068ce73f86fb` |
| M | `test/stop-alert-validity.test.mjs` | `746b5dd44ecdaf57d3dc057c37cd37ad4ff817c125fb8515b6d40d99ddd01f57` |
| M | `test/try-small-audit.test.mjs` | `cfd71b94906d0fbe37fda4bcdfa5e9ab542edf53d4f05a0a1a2b91805942dfd7` |
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
- ** of  files pass.**
- `premarket-feed` builds its fixture from the real New York date and clock. At one hour on 8 Nov it failed identically on this branch and on the unchanged base `b0d76987`; it passes in this run. R1 does not touch it.
- **Gated actual-watcher scenarios** (`INCIDENT_WATCHER_SRC`): `watcher-resilience` 9/9, `watcher-incident-revision` 11/11.
