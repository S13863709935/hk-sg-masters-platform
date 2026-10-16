# Week 5 checkpoint: 12–18 October 2026

Prepared on 16 October 2026. Commits use their actual execution time; this is not backdated work. Prepared by Song Shaoheng with AI assistance. Planned team owners are not reported as actual contributors.

## Selected scope

This branch starts at the published Week 4 checkpoint `6a7baf9`. It does not merge `feat/local-prototype`. It publishes interface/data/rule design and the beginning of core development, in line with the 18 October design checkpoint.

| Plan focus | Published evidence | Remaining limit |
| --- | --- | --- |
| B06 interface and user flow | English browse/detail/background screens, per-rule reasons; comparison/candidate design views; interface contract | Team acceptance and real usability testing not recorded; comparison and saving not implemented |
| Data structure | Stable programme/offering IDs, explicit field states, source/review metadata and API contract | JSON read model only; SQLite implementation and migrations remain later work |
| Matching approach | Tested source-linked condition-check module and rule specification | Proof of concept only; no real eligibility sign-off or recommendation tiers |
| Start core development | Pilot search, detail API, optional transient background checks | Later bulk data, persistence, admin tools, full comparison/shortlists and deployment remain excluded |

## Data and publication controls

- Inherited data files are unchanged: 20 direct-entry records and one hidden transfer reference, covering 14 target universities.
- Source dates stay 6 October 2026. No 16 October admissions recheck is claimed.
- Independent reviews: 0. Complete requirements: 0. No fabricated feedback or member contributions.
- The larger catalogue, detailed route reconciliation and completed later-stage local features are not part of this branch.
- No CVs, contact details, student records, signatures, credentials or local configuration are added.

## Checks before push

Executed on 16 October 2026 for this selected branch, not inferred from the advanced prototype's separate 102-test result:

- All 37 automated tests passed, zero skipped. All eight JavaScript modules passed syntax checks.
- The pilot data check passed. A Git comparison with Week 4 confirmed no changes anywhere under `data/`.
- Browser checks passed: no-result/reset flow, combined NUS/SG/Computing search, source-linked General Track details, temporary background input and result reasons.
- A synthetic IELTS total of 7 with writing 5 produced a recorded writing gap for the HKUST pilot while retaining three other unresolved conditions. This was not a real student or usability-study participant.
- Reload cleared the synthetic background. Comparison and candidate views displayed their design-only status; no saving or comparison engine was claimed.
- Desktop (1280 px) and narrow (390 px) checks found no page-wide horizontal overflow. The narrow background and comparison views also reflowed without page-wide overflow. Visible copy was English and the browser reported no warning/error logs. The temporary viewport override was reset.
- The changed-text scan found no known contact details, credential patterns or private Desktop paths. No screenshot or generated local runtime data is included in the publication.

These checks establish the behaviour of this limited build, not complete admissions data, independent review, team acceptance or user satisfaction. Final staged-diff checks and remote branch verification are part of the publication operation.

## Next planned work

Obtain actual interface/data-contract review; continue source collection and current intake/route checks, implement the remaining core workflows in small stages, and later conduct real user testing. Week 4's outstanding team confirmation and research evidence do not become complete merely because this branch exists.

Push only `checkpoint/week-05` after checks. Keep `main`, the Week 4 branch and the ahead-of-plan local development branch unchanged. A push is code publication for review, not a public website deployment or a course submission.
