# Week 4 technical foundations

Prepared for publication on 13 October 2026. This is an internal engineering checkpoint, not a claim that the complete platform has been delivered.

## Published runtime

- Node.js 24 or later, built-in HTTP and test runner; no runtime packages to install.
- Loopback-only service on 127.0.0.1, default port 3103.
- One English checkpoint page, a health endpoint and read-only checkpoint metadata.
- No student form, profile storage, matching endpoint, comparison, shortlist or administrative import in this branch.

Run `npm start`, then open http://127.0.0.1:3103. Run `npm test` and `npm run check:data` to verify this checkpoint. PORT may be set explicitly if 3103 is occupied.

## Storage design

The planned platform uses SQLite for universities, programmes, offerings, requirements and source/review metadata. This publication contains the design and JSON pilot only, not the complete storage implementation.

Each programme keeps a stable ID. Different study modes, intake years, application rounds and fee categories must remain separate offerings or attributes. Programme-specific requirements and university-wide conditions retain their own official sources.

## Data gate

Directory discovery, programme-page extraction and independent human review are distinct states. The pilot has 20 direct-entry records and one transfer reference, all with partial coverage and no independent reviewer. Unknown GPA thresholds, academic equivalence, test validity anchors and waivers are not filled by assumption.

Student background will be processed for explanatory checks; the published checkpoint does not accept it. No admission probability or guarantee is planned.

## Next planned implementation

During the planned core-development stage, implement programme browsing, profile input, requirement checks, comparison and candidate lists in small independently testable increments. Check interface/data contracts before integration. This branch does not present those features as working.
