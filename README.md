# HK–SG Masters Platform — Week 4 checkpoint

A source-linked information and programme-screening project for taught/coursework master's degrees at the target Hong Kong and Singapore universities.

## Published checkpoint

This branch publishes Week 4 foundations (5–11 October 2026), prepared for release on 13 October. It contains project/data documentation, 14 university directory entries, a first 20-programme pilot and a minimal local HTTP runtime.

It does not publish programme search, student profiles, requirement matching, comparison, shortlists or a public deployment. This is not the complete platform.

## Run the foundation

Use Node.js 24 or later. No runtime dependencies need to be installed.

```text
npm start
npm test
npm run check:data
```

Open http://127.0.0.1:3103 after starting the service. It binds only to 127.0.0.1. The published page is entirely in English and collects no student background.

## Data status

- Target scope: eight Hong Kong UGC-funded universities and six Singapore autonomous universities.
- Pilot: 20 direct-entry programme records, plus one transfer-only reference.
- Source snapshot: 6 October 2026. All records have partial requirement coverage.
- Independent reviews: 0. Complete requirement records: 0.
- Directory-entry checks are not complete catalogue enumeration or proof that applications are open.
- The original 175-record workbook is preserved as historical research material, not a verified production database.

Do not invent GPA cutoffs, convert incomparable scales or treat language waivers as automatically accepted. The platform does not handle applications, predict admission probabilities or guarantee admission.

## Checkpoint documents

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
