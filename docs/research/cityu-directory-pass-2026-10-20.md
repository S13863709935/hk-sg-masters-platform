# CityU directory reconciliation — 20 October 2026

Internal AI-assisted research/development notes, not coursework submission text. No independent review, completed team contribution or user-study outcome is asserted.

## Observed source and count boundaries

The [official 2027/28 master's programme list](https://www.cityu.edu.hk/pg/taught-postgraduate-programmes/list) was read in the browser after the web reader returned 403. The frozen public table contains 72 rows with 69 unique admission codes: P84 appears three times and P17 twice across departments. The stored 72-row observation was compared with the browser extraction and matched exactly.

These are directory observations, not 72 independently checked master's programmes. The reconciliation is:

- Four excluded codes: P43 Juris Doctor; P45/P93 postgraduate certificates; P83 mostly-Beijing delivery.
- Two held codes: P01B partner/concentration route; P60 possible identity/rename conflict with the old Civil and Architectural Engineering seed. Neither receives a new programme identity or copied admissions rules.
- P01A/P12 EMBA language routes are conservatively grouped under the existing EMBA parent. P05A/P05B BIS streams are grouped under one candidate parent. Grouped routes are not interchangeable admissions criteria.
- The result is 61 candidate groups, not a confirmed distinct-award total. Nine reuse existing stable IDs; 52 add unreviewed directory leads. The old Civil seed remains unchanged and outside the resolved mappings, so the local CityU registry has 62 retained records, not a claimed official total of 62.

The directory audit is therefore `entries_enumerated`, not `complete_for_consulted_directory`; confirmedProgrammeCount stays null. The 65 master-code leads after exclusions still include the two held codes and are not a final programme count. Full 14-school scope enumeration remains incomplete.

## Programme-specific boundary checks

- [P83](https://www.cityu.edu.hk/en/pg/programme/program-list/2027/college-of-business/department-of-accountancy/p83): its class-schedule section places most classes in Beijing; the asterisk describes collaboration with BNAI, not pending approval. This is why it is excluded from Hong Kong/Singapore delivery scope.
- [P01B](https://www.cityu.edu.hk/en/pg/programme/program-list/2027/college-of-business/college-of-business/p01b): a Chinese EMBA concentration with an optional Tsinghua MPA requiring separate admission and further courses. It is held for partner/delivery reconciliation rather than counted as another standalone EMBA or MPA.
- [P01A](https://www.cityu.edu.hk/en/pg/programme/program-list/2027/college-of-business/college-of-business/p01a): Chinese-language route with combined study mode. Language variants are grouped conservatively rather than assumed to have identical rules or deadlines.
- [P17](https://www.cityu.edu.hk/en/pg/programme/program-list/2027/college-of-computing/department-of-computer-science/p17): jointly offered by two CityU departments, so the repeated row is not another programme. Its title is explicitly subject to University approval. That caveat is kept in directory evidence; it is not applied to every asterisk or treated as verified approval.

Only the boundary information above was used from these pages. Their admissions criteria were not imported in this batch or counted as newly checked programme records.

## What was deliberately not inferred

Raw local/non-local deadline labels and combined-mode labels remain in research evidence only. New catalogue offerings keep their dates, tuition, mode, academic year and entry requirements unknown until programme-specific checks. No fee, GPA, language rule, open-application status, independent-review status or admission tier is fabricated from a directory row. Existing checked records and applicant-category source fingerprints are preserved.

The builder is deterministic and tested for re-runs, missing/conflicting rows, unsafe paths and newer evidence. It preserves unrelated institutions' records and source dates. Original seed data and the source workbook remain unchanged.
