# S2-5: admission latency and commit-race exposure — review only

Reproduce offline: `python docs/stage2-final-pin-20261111/latency.py` from this checkout. Inputs are retained Git metadata and the passed local full-suite receipt; outputs commit-metadata.json and latency-results.json. No provider data, workflow execution or production changes. Exact retained main d276bbcb1c23923255f976f2f9e2aa06857c7c34, non-shallow first-parent history 4–11 November (11 November partial through that head): **718 commits, 689 data-only, 26 non-data, 3 empty**. Git committer timestamps are arrival proxies, NOT measured push times. Author clocks gave the same selected counts; this does not establish true publication times. No out-of-order committer clock observed. Repository-events access was unavailable through this connector, not evidence of absent events.

Claude reconciled the prior table in6800976897: it used all commits including weekends and different boundaries. Its earlier counts/minimum are withdrawn; the reproducible figures here are the record.

| Historical window, UTC | Dates / data-only counts | Complete within-day gap minimum / median |
|---|---|---|
| Actual forward window09:00–09:20 | Nov4,5,6,9,10,11:1,1,1,1,0,1;5 commits/120min | None: at most1/day |
| Enclosing A09:00–12:00 | same dates:3,3,2,2,2,4;16/1080min |330s /2001.5s (10 gaps) |
| Active laboratory mornings05:30–08:30 | Nov4,5,6,7,10,11:2,14,13,14,18,13;74/1080min |19s /467.5s (68 gaps) |
| Potential inverse06:45–07:30 | same laboratory dates:0,8,8,1,8,5;30/270min |19s /259s (25 gaps) |

All 688 completed data intervals pooled across the full history have min1s, median196.5s, p10=2s. Bursts and overnight gaps make a pooled median inappropriate for the particular20-minute forward window. Selected dates follow the proposed weekday forward and existing Tue–Sat laboratory schedule; no favorable-day exclusion. Six-day windows are small, Friday is represented only once, and repairs can change future activity. Non-data writes are STOP conditions, not tolerable retry arrivals.

## Conditional calculation, not a success claim

For assumed parent-read-to-push latency L, empirical safe-start share q = sum over each historical interval max(gap-L,0) / sum(window duration-L). Window boundaries are included; starts must leave L before cutoff. This measures historical eligible time with no intervening **data commit timestamp**. It is not an observed attended-push success rate or future probability. Source details/formula are in latency.py.

Observed fresh full suite:72.800765013s. Forward prep75s assumes another2.199234987s unmeasured overhead;120s is a slower scenario. Inverse prep5/15s is wholly assumed; no inverse local full suite is introduced. Actual network, operator/verifier reaction and session latency are **not measured**. Offline automatic FIFO rehearsal proves admission mechanics only.

| Scenario | assumed attended handoff30s |60s |120s |300s |
|---|---:|---:|---:|---:|
| Forward prep75s: q |.920 |.894 |.838 |.667 |
| Forward prep120s: q |.881 |.853 |.797 |.634 |
| Inverse prep5s: q |.937 |.887 |.790 |.592 |
| Inverse prep15s: q |.920 |.870 |.774 |.584 |

Only under the additional **independent, identically distributed** retry assumption is uncapped expected attempts 1/q: forward75s with30/60/120/300s handoff gives1.087/1.118/1.193/1.498; inverse5s gives1.067/1.128/1.267/1.689. Capped expected attempts used is1+(1-q)+(1-q)^2 (machine output includes every scenario). Real repeated retries are correlated and may hit bursts, failure, UNKNOWN, ND drift or cutoff. There is no established finite actual expectation to success: three attempts can terminate in STOP. These estimates cannot justify extra attempts or a deadline extension.

Three forward attempts at75+300s alone require1125s, leaving only75s of the20-minute window before other work: a five-minute admission is impractical for a dependable three-attempt allowance. A30–60s handoff is a workload target, not measured performance or promised availability. Inverse mornings are busier and their very short gaps matter despite no local-suite delay. Admission does not guarantee publishability.

## Reduce work inside the race without weakening admission

Prepare ahead: immutable source/tool/binding/inverse hashes, known review/receipt links, templates and query commands, fixed cutoffs, test inventory, compatibility checklist and FIFO syntax. Operator and verifier coordinate directly; no owner relay per ADMIT.

Refresh for each READY candidate: actual main and candidate identity, per-candidate preservation/inverse/test proof, current writer/census receipt, all ND history since final parent, and verifier present-now confirmation. None may be pre-signed. Review data-only-parent proofs through the passed tool rather than rereading unchanged source. Send only the exact mode/main/candidate/census/writer/verifier-specific ADMIT before its deadline. No guessed push, blind replay or waived census. Slow actual communication, drift or exhausted budget means STOP under the existing procedure.

Disposition proposed for focused review: latency is a documented residual feasibility risk, not a demonstrated guaranteed-admission property. Keep three-attempt caps, strict I8, original P/D and all receipt/recovery allowances unchanged. Actual attendance and actual handoff speed remain future evidence; this assessment requires no new automation, timing experiment or production probe.
