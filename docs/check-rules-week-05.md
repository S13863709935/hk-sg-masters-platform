# Week 5 condition-check proof of concept

Prepared 16 October 2026. This defines deterministic comparisons, not admission selection or a probability model. Synthetic test thresholds are software fixtures only and never enter the real programme catalogue.

## Input and comparison rules

1. Use only direct-entry records for the pilot UI. A transfer reference is not a new-student application option.
2. Require a non-empty undergraduate major. Degree completion, classification and experience are self-reported, not independently verified credentials.
3. Compare a numeric GPA only when both values use the same original scale. Do not linearly convert percentages or infer honours classifications. The real pilot does not contain invented numeric GPA cutoffs.
4. Match explicit major names after case/punctuation normalisation only. “Related discipline” needs university confirmation; a general programme subject tag is not an admission-major rule.
5. Check the language test's recorded total and, where supported, its component minimum. A passing total cannot hide a failing writing score. Missing components stay unresolved. The form's component fields are IELTS-only.
6. Distinguish TOEFL score scales and their recorded date windows. A scale/date conflict is rejected. A missing date stays unresolved when it is needed. A waiver request or an undocumented at-home option is not automatically accepted.
7. Leave additional requirements, equivalence, interviews, test alternatives and programme-specific validity anchors for explicit confirmation. Do not use today's date as an invented validity anchor.
8. Separate mandatory conditions from preferences. A preference gap is not a failed mandatory condition. Retain known gaps and other unknowns at the same time.
9. Partial coverage or missing independent review always adds an unresolved completeness condition, even if every extracted numerical rule passes.

## Result semantics

| Status | Meaning |
| --- | --- |
| has_gap | At least one recorded mandatory condition is not met; other unknowns remain visible |
| needs_confirmation | No known mandatory failure, but at least one condition or evidence gate is unresolved |
| meets_checked | All recorded mandatory checks pass in a complete, reviewed synthetic test; not confirmed admission eligibility |

Every result has `tier: null`. Stretch, match and relatively-safer labels are design concepts in the earlier baseline only; they are not enabled in this branch, including synthetic cases. All 20 real pilot records remain partial with no independent review.

Deadline and fee information are displayed with the recorded intake and source context, not used to invent an open-application status or an academic failure. Source dates remain 6 October; later revalidation is still required.

## Verification boundary

Automated tests exercise GPA scales, honours, major equivalence, language totals/components, unknowns, mandatory/preferences, request validation and privacy boundaries. Browser checks exercise navigation and a synthetic background. Neither establishes the correctness/completeness of all admissions information, actual user satisfaction or independent human review.
