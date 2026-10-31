# Watcher fixture clock correction — development only

The two gated production-watcher fixtures now give the watcher, radar child and synthetic market response the same explicit30October2026clock. They override both the no-argument Date constructor and Date.now, preserve real elapsed time and the existing retry time shift, and retain every original assertion. No runtime, scoring, strategy or production code changed.

Against deployed SEC-hotfix source `bd70f5a7`, incident tests pass11/11 and resilience tests9/9, including disposable-Git publication races/refusals, recovery, duplicate suppression and research preservation. Before correction the deployment baseline and candidate each passed12/20 with the same eight date-dependent radar failures. That historical result remains recorded in the deployment record; it is not rewritten as a pass. [Exact test hashes and evidence](validation/watcher-fixture-clock-repair.json).

The approved SEC deployment also contained two existing test-only basketDue wrappers. They supply SPUS/IAUM fixture defaults and were demonstrated output-neutral for the production fixture; they do not certify the development gated-ZAD behavior or real owner marks. No wrapper or strategy is changed here.

Actual post-hotfix source access, archives and delivery behavior remain pending a naturally scheduled run. The fixture clocks and synthetic messages are not market observations, prospective evidence or permission for real delivery. Acceptance remains24/40.
