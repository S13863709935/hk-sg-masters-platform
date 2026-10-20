# Local MITB intake reconciliation — 20 October 2026

Actual Study Week work initiated by Song Shaoheng with AI assistance. No invented teammate participation, independent review, user study or earlier-week activity.

- Re-read official MITB admissions/fees and the application-page schedule. The unreadable older faculty fee link is not used as evidence. Research details: `docs/research/smu-mitb-refresh-2026-10-20.md`.
- Replaced two combined-intake options with four explicit 2027 intake/mode options. Fee cohorts are known; application dates remain unresolved because the source omits window years and conflicts on the August start month. No year is inferred from billing dates.
- Preserved parent identity/counts. Retired old option IDs rather than silently assigning a saved choice to a new cohort. Automated tests verify review warnings, independent survival of other saved programmes, explicit January/August repair and current-data export.
- All 227 automated tests passed, zero skipped; data checks passed. Browser QA on an isolated in-memory preview (port 3109) confirmed all four choices, separate January/August part-time fees, unknown date status, English copy and desktop/390-pixel reflow without page/dialog horizontal overflow. Screenshots are outside Git; no warning/error logs were observed. No background, shortlist or remembered choice was written during browser QA. Viewport override was reset.
- The selected publication branch separately passed 52 tests and 10 syntax checks, with only MITB incrementally changed from `7e70566`. Its browser verified the four option rows and source uncertainty. The advanced catalogue, route/applicant/persistence engines remain local.
- Counts remain 551 parent records, 548 default-browsable, 21 page-checked parents, zero independent reviews and zero complete requirement sets. Only MPA/MITB have 20 October source dates; unrelated records keep their original dates.
- Original workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

Publication follows the user's delegated timing and the T2 data-collection plan: a small additional commit on `checkpoint/study-week`, not a push of the advanced branch or a main merge. Real research, independent review and team acceptance are still pending.

Published and live-verified remote SHA: `245141969aa5bd6039dd2d8f718b022db0bd753b`. Remote Weeks 4/5 and `main` remain unchanged. No PR, merge, public deployment, desktop assessment edit or course submission occurred.
