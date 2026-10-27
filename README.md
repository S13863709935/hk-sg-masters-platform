# HK–SG Masters Platform — Week 6 checkpoint

A source-linked information and programme-screening project for taught/coursework master's degrees at the target Hong Kong and Singapore universities. The interface is entirely in English.

## This publication

Prepared on **27 October 2026**, during W6 (26 October–1 November). This branch starts at the published Study Week checkpoint `2451419`, rather than merging the advanced local prototype. It consolidates eight existing programme observations under ongoing T2 data collection and a necessary language-date check under T5. It does not claim W6, user research or the whole project is complete.

The limited pilot still provides search, programme details, temporary background input and source-linked condition checks. Comparison and candidate lists remain design previews. The expanded catalogue, route/applicant engines, persistence, full comparison and saved shortlists remain local.

## Run locally

Use Node.js 24 or later. No runtime dependencies need to be installed. If the default Node is older, use an already installed compatible runtime.

```text
npm start
npm test
npm run check:data
```

Open http://127.0.0.1:3110. The service binds only to loopback; set PORT explicitly if needed. This separate checkpoint does not replace the advanced local server on port 3102.

Background input goes only to this local service and remains in page memory. It is not logged, written to disk, placed in URLs or saved in browser storage. Reload clears it. No account, document upload or contact details are requested.

## Data scope and limits

- Fourteen target universities: eight Hong Kong UGC-funded and six Singapore autonomous universities.
- Twenty direct-entry pilot records, plus one excluded transfer-only reference.
- Eight records updated in this publication: CityU Applied Economics; CUHK Anthropology; NUS MComp General Track and Finance; NTU Information Systems and Applied Economics; SUTD Architecture and Human-Centred AI.
- The two SMU records retain their earlier 20 October updates. Eleven records retain 6 October observations, including the transfer reference.
- Actual observation dates range from 6–24 October. **27 October is publication preparation, not a source recheck date.**
- Independent human reviews: **0**. Complete requirement records: **0**. All real records remain partial and recommendation tiers remain disabled.
- The original 175-row workbook and directory register are unchanged. This is neither a full admissions catalogue nor a live application-portal check.

The update preserves university discretion and conflicting or unavailable evidence: unknown current fees stay blank, a closure notice does not become an invented deadline, and graduation GPAs do not become undergraduate entry cutoffs. Published test-date floors are checked independently of test-version boundaries, with missing dates unresolved. GPA scales are not converted; waivers are not automatically accepted.

The website does not submit applications, predict admission probabilities or guarantee admission. AI source checking does not require the user to manually repeat each check; it also does not establish independent human review.

## Evidence and remaining work

- [Selected scope, verification and remaining work](docs/progress/week-06-checkpoint.md)
- [Eight source observations and their original dates](docs/research/week-06-selected-sources.md)
- [Machine-readable publication manifest](data/publication-week-06.json)
- [Calendar and action plan](docs/calendar-and-backlog.md)
- [Scope and requirements](docs/scope-and-requirements.md)
- [Data fields and matching principles](docs/data-and-matching.md)
- [Existing data and limitations](data/README.md)
- [Team and planned workflow](docs/team-and-workflow.md)
- [User/service research protocol](docs/user-research-protocol.md)
- [Staged publication policy](docs/publication-policy.md)
- [Prior Study Week publication](docs/progress/study-week-2026-10-20.md)
- [Prior Week 5 publication](docs/progress/week-05-checkpoint.md)

Actual user-needs/service-comparison results for the 25 October milestone have not been established by this publication. Real user testing, wider data completion and later development milestones remain separate tasks. Planned ownership is not proof of teammate contribution.

This is a GitHub checkpoint for review, not a public deployment or course submission. Keep `main`, historical checkpoints and the advanced local branch separate. Do not commit private student data, CVs, signatures, credentials, browser settings or runtime databases.
