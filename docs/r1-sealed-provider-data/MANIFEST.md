# R1 candidate manifest (review only; not deployed)

- **Base:** `b0d769876a6ee76f23544850c959111f59d8ae7b` (origin/main when R1 started). **Branch:** `claude/r1-sealed-provider-data`.
- **Candidate identity:** the commit that adds this file. Its id is given in the PR #1 comment, because a file cannot contain the id of the commit that holds it.
- **Changed-file allowlist** (relative to the base; this manifest itself excluded): 41 files.
- `git diff b0d76987 -- <allowlist>` sha256: `d1ea71f11cfe70cb7e42f52b45dbdf4d43d9e31efe516f6f72955d8b64d5eaa7`

| Status | File | sha256 (candidate) |
|---|---|---|
| A | `.gitattributes` | `873f59d9355f4ba27446eb549847336e6c53be85206f28de248d1dea2a71bf9d` |
| M | `.github/save-data.sh` | `5347169fa58e9daa7b147d05451ca91030a02b69ec467c21d366a99ccc088ea4` |
| A | `.github/sealed-git.sh` | `79189b263e4efbfd895650157aff02d078afb0fcd18e9a478b42bc2626d79297` |
| M | `.github/workflows/Smart-money.yml` | `caf963b9de6633fdc3ec3de8ff177cbf1278c16a7445c2ce2efb416fde517527` |
| M | `.github/workflows/bot.yml` | `65c570446b67cda64b1853d8f2aa2120a9272a284c113028ea860c627941a4ea` |
| M | `.github/workflows/ignition.yml` | `a1978f7f2fa0ed191976926409e3751c53387427a4c09c617c69bca212bf4b08` |
| M | `.github/workflows/leaders-study.yml` | `9e7d84746fdc89b6a57fa27104066d3a31a462bf869bfa9526ff5051ba6ffa11` |
| M | `.github/workflows/main.yml` | `94f9757ef04fe1efddd78b03b5f8164d24930e861d1e0e026ebc4382ae560afa` |
| M | `.github/workflows/movers.yml` | `6273c83c0f83c0c99122276b1468d63a246d59ba7c7042beb4146997bcab4f60` |
| M | `.github/workflows/opportunity-radar.yml` | `e98b95b7d91ddb8a6aa605a79013cb53015cbfb502d4452e3d3e5b7707ff5f75` |
| M | `.github/workflows/options-survey.yml` | `5d12547ee7511f65f49d2867190bbbb0c54af6f619f13438697ea44d13c7d74b` |
| A | `.github/workflows/r1-migrate.yml` | `33c2bea47ddd8def0b2f8dc04b9d186e3ad9a3e56919f977edc408a53522d217` |
| M | `.github/workflows/scorecard-1023.yml` | `9e5cc4f7342606f9f8775035a79658c0cb7803f1062e93b61df048c0aa6b3a33` |
| A | `docs/r1-sealed-provider-data/README.md` | `c0890a44e4d30eae3457ed9541f888005f7de92e2b971945a314e676d693c162` |
| A | `docs/r1-sealed-provider-data/t1-inventory.tsv` | `a04ce3bcab12b577634f37279004ca88014e52768c95403ede8ee59cfe6792dd` |
| M | `fastmover-lab.mjs` | `821597c35a9632cf40336861acdf9d43a142049553edaba8b1809b7644328339` |
| M | `health.mjs` | `56f65693a9a175cd6b7fa074f078aee841d16fa9b51a194d3f9606c492fc2f84` |
| M | `ignition-watch.mjs` | `cb94fc5caf8ea60d0d99647bfd112627e52da0706ee0da4451353f83d0bfd46c` |
| M | `missed-runners.mjs` | `23831f799748f6ddd7faebc68432c8b62477a9e968d3ddee66103b7eba0687a0` |
| M | `movers.mjs` | `f5329eb7167de885e34aff314111af2744d61dfcd8bac30651c184d8f8e9b0bc` |
| M | `options-survey.mjs` | `a988f757c0ef97d4f188ddb78c5ae14b678d1eb2a9e0691ce072d2e0275f7421` |
| M | `scan.mjs` | `3bb5373143556422ff606854a738515df5a86134f5845e2ee644630250e37e5a` |
| M | `scorecard-1023.mjs` | `6453e957cb0fbd05d3f3297aae01f27efe8600c3abbbb58fc8ba8705a6aca7ac` |
| A | `sealed-guard.mjs` | `7e6db33feb2ab85380bf3ac9a546377ba50db4c2a57a437c5d6d4a31e4945f88` |
| A | `sealed-merge.mjs` | `a5f60e1771a9ce8dc7547de2efca7c3002d007e24badaedb65c2ec87548e7dcd` |
| A | `sealed-migrate.mjs` | `fb4d51d116f7dadd64b894244f67eb546033aa117e4a168d351ffc3f31940bca` |
| A | `sealed-store.mjs` | `f6d530b99a4bc1ea30d4b59a1637fc1135edaea76ea52912f541ea4842a4db35` |
| M | `shadow-outcomes.mjs` | `c97f069a085a4413581daf5af48b7ed8e3ff59e8a7de30dbb50aee1a4a96c129` |
| M | `smart-money.mjs` | `ac1231e64256ed76c29b1d656f84a9d3b05c559eb31e42483610932cc043040e` |
| M | `test/feed-integrity-watcher.test.mjs` | `7144f713f3158671fe61feae52112b766d341f2685cc5a7c12a6a2baf02f4cfd` |
| M | `test/load-scan.mjs` | `37bce00506cc2bb73d5707dc2f737fd3d7d8c1de08cbcfb2b86c32ffa726bdde` |
| M | `test/private-data.test.mjs` | `2c43d3a0fd677fd1cad0404abeecf04b5b555b8fa020512e02ec42c80af0658c` |
| A | `test/sealed-git.test.mjs` | `410791b5fa4be153c86cb3e019f9d8006e4826d073665225e7ff8c2cc7661a72` |
| A | `test/sealed-migrate.test.mjs` | `35750713f20ed5c3e9eb1a20f79c0f5c3c8a6fc3ab7e4c7d20ed66809890526a` |
| A | `test/sealed-readers.test.mjs` | `83ddbf15fdf1875adf5fa4612518cede65fced6ca368445c33acc8779139fcfc` |
| A | `test/sealed-store.test.mjs` | `9d2cf44de30157edf6b3818a6966d696c5f0d0dc58cc8d729208ab954fee2cb7` |
| A | `test/sealed-wiring.test.mjs` | `90658d9293cd3fb63caed725f295cbc1d1d74f133ce8632a61256244fe451458` |
| M | `test/sec-request-runtime.test.mjs` | `0de8866ec04bda4688a09612ac73c42d9c335a9eaada16f07a73068ce73f86fb` |
| M | `test/watcher-incident-revision.test.mjs` | `dedec3819728826305d7ef5dd595c9911d2a9774c82a04416600694e4b1b31c3` |
| M | `test/watcher-resilience.test.mjs` | `3f189b666dce213f162007fa972a32141d0d6fe5383baa8beb71a12e7a1102f0` |
| M | `watcher-reporting.mjs` | `f1b67a6cca82061a1f9619f722b9492281047c555c99f46f0ef97e32b00f3ee0` |

## Full serial suite on this tree

- Node 20.20.0; preload refusing every non-loopback connection (0 attempted).
- **146 of 146 files pass.**
- `premarket-feed` builds its fixture from the real New York date and clock. In an earlier full run on this tree (same hour as a run on the unchanged base `b0d76987`), it failed identically on both trees (cases 1–2). It passes in this run. R1 does not touch it: `premarket-check.mjs` reads no T1 file.
- **Gated actual-watcher scenarios** (`INCIDENT_WATCHER_SRC`): `watcher-resilience` 9/9, `watcher-incident-revision` 11/11.
