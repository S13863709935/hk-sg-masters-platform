# Week 8 selected integration — 10 November 2026

The user explicitly requested a push during W8 (9–15 November). This branch starts at published W7 `dff8b54a2be6bf864d5167a0e9132420e4bc42a8` and retains the twenty original direct-entry pilot IDs and the excluded transfer reference. Selected source objects come from local development commit `de0f18e70cf1751c25c0ca6fd4644528186036f0`; that branch and its complete source history are not merged here.

## Selected work

Five existing pilot records are reconciled with their already collected observations. CityU CS fees stay category-dependent; HKBU MA honours/equivalence and language conflicts remain explicit; HKBU Business Management keeps unknown category-specific tuition; EdUHK January and September cohorts keep separate amounts and unknown category cutoffs; HKUST uses 2027/28 language/classification conditions without importing graduation GPA or direct MEng admission. The remaining sixteen objects and frozen workbook/directory bytes are unchanged.

Integration fixes preserve one exact study option, refuse invalid or repeated option parameters, prevent a multiple-option card from presenting its first fee as a default, and show/export recorded rounds with exact offsets. Nested export fields use an explicit public whitelist. A separate W8 storage key leaves older saved W7 references untouched instead of silently rebinding them to revised intake meanings. Strict language minima and completed-only degree semantics are tested using labelled synthetic fixtures; no applicable university facts are added to make these fixtures pass.

## Actual verification

- All **92 tests passed**, with zero failed/skipped/cancelled. The first run caught a retained W7 badge assertion; after updating its expected label, the full checkpoint suite passed. Existing validation protections were retained.
- Seven synthetic API scenarios cover all twenty direct-entry records (140 comparisons), keeping gaps, unresolved conditions and null admission tiers.
- New integration tests traverse every pilot study option through details, reference reconciliation and public export. They also check missing/foreign/retired/repeated selections, category-dependent amounts, mixed source dates, nested export privacy, exact noon offsets, five-round ordering and matching boundary cases.
- Desktop browser checks on independent port 3112 confirmed the English W8 page, CUHK's five rounds in details, explicit choice before comparing, its unresolved part-time fee and HKU's `2027-01-04T12:00:00+08:00` cutoff in comparison. No new real-user, mobile, clean-machine or independent-review claim is made.

The final pre-push audit checks syntax, local documentation links, selected/retained fingerprints, the diff and publishable files. Remote SHA verification is recorded separately after an ordinary push. No forced update, main merge, deployment, assessment submission, backdating or invented teammate contribution is part of this checkpoint.

All records remain partial, with zero independent reviews and zero complete requirement sets. W8's 15 November integration target and later user-testing milestones are not declared complete by this midweek publication.
