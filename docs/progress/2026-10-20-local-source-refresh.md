# Local source refresh — 20 October 2026

Song Shaoheng initiated this work with AI assistance during Study Week. Actual source-check and commit dates are retained; no independent review, team acceptance, participant feedback or backdated weekly work is claimed.

- Re-read the SMU MPA admissions/fees page and dated August 2027 application schedule. Updated only that programme's record, preserved stable IDs and kept the original seed/workbook unchanged.
- Added explicit unresolved submission-time language validity/waiver confirmation. Test-exemption GPAs are not imported as generic cutoffs; dates remain separate from academic results.
- 217 automated tests passed, zero skipped. Regression checks cover the dated source URL/read date, catalogue/details, selected study option and unchanged academic results after a deadline passes. All-source data checks and whitespace checks passed.
- Browser QA used an isolated, in-memory preview on port 3107, not the user's normal browser background/preferences. Verified the English MPA details, explicit part-time selection and desktop/390-pixel page/dialog reflow. No saved programme, academic background or choice context was created. The temporary viewport override was reset.
- Data counts remain 551 parent records, 548 default-browsable, 21 page-checked parents, zero independent reviews and zero complete requirement sets. Only MPA was re-read today; the batch date is not a full-catalogue refresh.
- Original workbook SHA-256: `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

## Publication decision

The user delegates appropriate checkpoint timing. Selected this bounded update under ongoing T2 source collection for `checkpoint/study-week`, starting at published Week 5 commit `9aeddfa`. That branch retains the limited Week 5 functionality and its own tests, changing only the MPA data plus honest publication labels, table readability and documentation. The 551-record catalogue, route/applicant engines and other advanced features remain local. No main merge, PR, public deployment, course-file edit or submission is authorised by this checkpoint.

Published and verified remote commit: `7e7056648f592130351960ca5f8b0c0bd00a9b72` on `checkpoint/study-week`. Its own 45 tests passed. Live remote verification confirmed Weeks 4/5 and `main` remain unchanged. Only the selected publication branch was pushed, not this advanced development branch.
