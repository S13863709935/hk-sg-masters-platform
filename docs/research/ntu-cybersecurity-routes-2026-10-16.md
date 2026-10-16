# NTU cybersecurity route checks — 16 October 2026

Local engineering research, prepared with AI assistance for Song Shaoheng. Not assessment text, participant research, independent review or evidence of other members' contributions.

## Source evidence and decisions

- [NTU Applied Cryptography directory/programme page](https://www.ntu.edu.sg/education/graduate-programme/master-of-science-in-master-of-science-in-cybersecurity-applied-cryptography) identifies the SPMS coursework degree. The [SPMS programme page](https://www.ntu.edu.sg/spms/about-us/mathematics/grad/msc-in-cybersecurity-applied-cryptography) supplies quantitative-background requirements, modes and the August 2027 timetable. Its fee table is explicitly 2026/27, so that amount is not used as 2027/28 tuition.
- [NTU Applied Cybersecurity programme page](https://www.ntu.edu.sg/education/graduate-programme/master-of-science-in-cybersecurity-%28applied-cybersecurity) identifies the CCDS route, August 2027 application window and 2027/28-onwards fee basis. Honours and bachelor's-plus-experience pathways are alternatives, not cumulative conditions. The credited deposit is not added to tuition; no personal grant is assumed.
- [NTU coursework admissions guide](https://www.ntu.edu.sg/admissions/graduate/cwadmissionguide) gives separate SPMS and CCDS language rows, TOEFL versions and application-date validity. No cross-school score conversion or invented GPA cutoff is applied. MOI/equivalence/discretion still require confirmation.

These are factual extractions with original source URLs and actual access dates, not copied marketing descriptions. The two route snapshots retain their own rules, offerings, source/review fields and unresolved conditions in `data/route-programmes.json`. The official coursework classification includes Cryptography's dissertation study option; that option is not treated as a separate research degree.

## Implementation boundary

The original group ID SG-NTU-P061 and its two directory references stay unchanged. Route IDs identify children of that group, not new catalogue records or additional confirmed independent awards. All 551 parent records and frozen historical inventories are preserved.

The server validates route identity against the recorded directory variants and requires an independent snapshot rather than inheriting parent/sibling fields. Explicit selection determines the effective fields and checks. A client-supplied flag cannot bypass the unresolved-group gate; only a server-resolved route can remove that particular unknown. Partial coverage and manual conditions still block final eligibility/tiering. Unselected or unsupported routes remain unresolved, and invalid selections return 422.

Route snapshots are startup-loaded read-only source data, separate from SQLite programme edits. The parent catalogue export remains a parent export; the versioned route JSON must be preserved separately. Candidate export retains the selected route ID and its public programme facts, never background data.

Remaining work: independent human review, full language/waiver/equivalence checks, further grouped routes, source refresh/conflict workflow for future route editing, and real user testing. Two route page reads do not complete the NTU catalogue or any current-eligibility assessment.
