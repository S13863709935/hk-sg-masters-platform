# HK–SG Masters Platform — Study Week data checkpoint

A source-linked information and programme-screening project for taught/coursework master's degrees at the target Hong Kong and Singapore universities.

## Published checkpoint

Prepared on 20 October 2026 during Study Week (19–25 October). This branch starts from the published Week 5 checkpoint `9aeddfa`, not from the ahead-of-plan local prototype. It publishes a small, actual programme-data refresh under the ongoing T2 collection task; it does not claim all Study Week tasks are finished.

The Week 5 feature boundary is unchanged: English interface, pilot search and details, temporary background input, and a source-linked condition-check proof of concept. Comparison and candidate lists remain clearly labelled design previews. Only SMU MPA has been re-read for this update. This is not the complete platform.

## Run the pilot

Use Node.js 24 or later. No runtime dependencies need to be installed.

```text
npm start
npm test
npm run check:data
```

Open http://127.0.0.1:3108 after starting the service. It binds only to 127.0.0.1. Set PORT explicitly if needed. It does not replace the advanced local development server on port 3102.

The optional form sends a background only to this local process for checks. It is not logged, written to disk, placed in the URL or persisted in browser storage. Page reload clears it. No account, document upload or personal contact information is required. SQLite is a planned storage design, not part of this release.

## Data status

- Target scope: eight Hong Kong UGC-funded universities and six Singapore autonomous universities.
- Pilot: 20 direct-entry programme records, plus one transfer-only reference.
- Original source snapshot: 6 October 2026. Only `SG-SMU-P001` was refreshed on 20 October; all other record dates are unchanged. The batch date means the latest read, not a full recheck.
- SMU MPA now retains its dated August 2027 admissions phases and fee context; waiver, academic-equivalence, test-exemption and interview checks remain unresolved.
- Independent reviews: 0. Complete requirement records: 0.
- Directory-entry checks are not complete catalogue enumeration or proof that applications are open.
- The original 175-record workbook is preserved as historical research material, not a verified production database.

Do not invent GPA cutoffs, convert incomparable scales or treat language waivers as automatically accepted. All recommendation tiers are disabled. The platform does not handle applications, predict admission probabilities or guarantee admission. No live application portal has been verified and the full pilot has not been revalidated as current.

## This data update

- [Selected scope, checks and outstanding work](docs/progress/study-week-2026-10-20.md)
- [Official-source research notes](docs/research/smu-mpa-refresh-2026-10-20.md)

This push is publication of checked engineering/research progress for review. It is not deployment, a course submission, independent human verification or evidence that the planned 25 October user-research milestone is complete.

## Retained Week 5 design and historical evidence

- [Week 5 scope, evidence and remaining work](docs/progress/week-05-checkpoint.md)
- [Interface flows and implementation boundaries](docs/interface-contract-week-05.md)
- [Data model and API contract](docs/data-contract-week-05.md)
- [Condition-check rules and evidence gates](docs/check-rules-week-05.md)

No expanded catalogue, route-reconciliation tooling, full comparison/shortlist implementation, administrative imports or public deployment is included. Other members' acceptance, independent review and real user research are not claimed.

## Baseline documents

- [Week 4 evidence and remaining work](docs/progress/week-04-checkpoint.md)
- [Scope and requirements](docs/scope-and-requirements.md)
- [Team and workflow](docs/team-and-workflow.md)
- [Calendar and action plan](docs/calendar-and-backlog.md)
- [Data fields and matching design](docs/data-and-matching.md)
- [Directory-entry register](data/directory-audit.json)
- [First programme pilot snapshot](data/checked-programmes.json)
- [Technical foundations](docs/technical-foundations.md)
- [User/service research procedure](docs/user-research-protocol.md)
- [Planned test scenarios](docs/test-scenarios.md)
- [Staged publication policy](docs/publication-policy.md)
- [Contribution and review process](CONTRIBUTING.md)

Team responsibilities are planned assignments, not proof of actual contribution. Do not upload CVs, contact details, signatures, credentials or identifiable student records to this repository.
