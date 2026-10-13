# Requirement and interface test scenarios

Prepared on 13 October 2026 for the planned implementation. These are expected behaviours, not claims that the matching engine has passed them in this published checkpoint.

| Scenario | Expected behaviour |
| --- | --- |
| IELTS total meets the fixture threshold but writing does not | Identify the writing gap; do not label all conditions met |
| GPA and its original scale are missing | Keep academic comparison unresolved |
| GPA scale differs from the recorded requirement's scale | Do not linearly convert; request confirmation |
| A programme has a closed list of accepted majors | Identify an explicitly excluded field; do not infer equivalence |
| The university accepts related fields | Mark relevance for university confirmation rather than automatic acceptance |
| One mandatory requirement fails and another is unknown | Retain both the known gap and unresolved condition |
| Language waiver is selected without confirmed evidence | Keep the waiver unresolved |
| TOEFL version and test date are inconsistent | Reject invalid input or flag the version problem clearly |
| Tuition differs by intake or local/non-local category | Keep year, category and fee basis together |
| A deadline's year has not been stated | Preserve the recurring description without inventing a year |
| A record has only directory evidence or partial requirements | Do not assign an admission conclusion or recommendation tier |
| A programme is transfer-only | Keep it outside direct-new-admission results |
| Search has no results; a saved item is selected again | Explain no results and avoid duplicate saved IDs when implemented |

Any invented scores used during future automated tests are synthetic fixtures, not university admission minima. Real programme records remain source-linked and independently reviewed before stronger conclusions are enabled.

The tests implemented here cover only the limited HTTP foundation, English checkpoint page and pilot metadata. User research and university-requirement review are separate from those technical tests.
