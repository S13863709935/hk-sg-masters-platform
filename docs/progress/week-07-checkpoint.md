# Week 7 selected publication — 3 November 2026

The user confirmed that the current period is W7 (2–8 November) during the planned stage review. Under the delegated publication cadence, publish one meaningful tested batch on `checkpoint/week-07`. This is early-week progress towards the 8 November core/data review, not evidence that W7 or later integration/user testing is finished.

## Scope

Start at verified published W6 commit `ebc08ffec2827523fff575562b6583f0b62ba92a`. Preserve the twenty original direct-entry pilot IDs and one transfer-only reference. Select five already observed programme objects from advanced local commit `83deae6fb50305744e6cdccd515a3ffaf0e87571`; the other sixteen retain their W6 objects. The workbook and directory file are unchanged. Their actual observation dates stay 6–24 October; no 3 November source reading is invented.

Add working comparison, candidate-reference management, opt-in browser saving and public-reference export to the limited runtime. These are core T5 functions under the existing plan. The expanded catalogue, route/category engines, database/admin functions, broader source batches and later local acceptance work are not merged or published.

## Behaviour and validation

- Compare up to four distinct programmes. Select one current offering per column; a blank choice has no default fee. Different modes, cohorts, currencies, fee exclusions and recorded dates remain separate.
- Keep up to twenty pilot references, without duplicates. Removal and clear controls work independently of comparison. Adding a duplicate does not silently replace its selected study option.
- Candidate saving is opt-in and stores only programme/option IDs. Reload validates them against the current catalogue; stale or foreign options are flagged without substitution or automatic storage rewriting. Blocked/quota storage errors retain the temporary list and do not claim a successful save.
- The export has an explicit public-field whitelist. It retains original source dates, currencies, cohort fee bases and unknown values, and excludes personal background, match results and extra fields even when supplied to the exporter.
- **83 automated tests passed**, zero failed/skipped/cancelled. Fifteen new tests cover list limits, mode binding, duplicates, stale references, storage failure, privacy boundaries and the five selected source observations. The prior synthetic API scenarios still exercise twenty records each (140 comparisons), retaining gaps and unresolved conditions without a recommendation tier.
- Actual desktop browser checks used Lingnan part-time and NUS General Track full-time, retained HKD/SGD separately, transferred an exact option to candidates, saved/reloaded the same option and downloaded a JSON file. The actual file retained the selected PT ID and public fields without personal background. Clear/reload then returned an empty list. Page width matched its 1265px viewport; the comparison table uses its own horizontal scroll area. A screenshot is kept outside Git as local QA evidence.
- No real participants, independent human review, mobile/clean-machine acceptance, current application availability, teammate contribution or public deployment is inferred from these checks.

## Remaining work and release boundary

All real records remain partial; independent human reviews and complete requirements are zero. Candidate references and comparison do not establish eligibility. Source recency/conflicts, route/category applicability, wider data completion and later integration/user testing remain to be handled honestly. The research milestone is not completed by generating a plan or synthetic tests.

Commit and push this selected W7 branch once after final data, syntax, link, privacy and diff checks; verify the remote SHA and all five earlier protected branches. Keep `main`, previous checkpoints and the advanced local branch unchanged during this publication. The advanced branch's 1,403-test result describes that local version; it is not substituted for this checkpoint's 83-test result.
