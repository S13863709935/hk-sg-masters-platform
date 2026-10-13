# Singapore directory pass — 13 October 2026

This is an internal development/research record, not assessment submission text. Work was AI-assisted at Song Shaoheng's request. No other team contribution or independent human review is claimed.

## Outcomes and counting boundaries

| School | Consulted-directory outcome | Added leads | Qualification |
| --- | --- | ---: | --- |
| SMU | 18 professional postgraduate cards; 17 masters after JD exclusion | 7 | Executive/Chinese programmes remain in scope. Tracks, modes and intakes are not additional awards. |
| SUTD | 21 unfiltered results; official coursework filter gives 18 across two pages | 14 | Three research routes are omitted by the filter: Interdisciplinary MEng, Innovation by Design MEng, and the CGU dual-master route. Separately named MTD routes retain separate identities. |
| SIT | Four awards in the explicit coursework table | 0 | Research table excluded. Health Sciences now links to a CSM pathway; pathway admission detail is not treated as another award. |
| SUSS | 38 master/doctor/JD/dual-pathway links; 28 master leads remaining | 16 | Four doctorates, JD and two confirmed research masters excluded; three FHNW dual pathways held separately. **28 is not a confirmed taught-master total**: programme-level type/delivery checks are pending. |

Source lists: [SMU professional programmes](https://masters.smu.edu.sg/programmes), [SUTD coursework page 1](https://www.sutd.edu.sg/admissions/graduate/masters/?programme-level=769), [SUTD coursework page 2](https://www.sutd.edu.sg/admissions/graduate/masters/?programme-level=769&paged=2), [SIT postgraduate admissions](https://www.singaporetech.edu.sg/admissions/postgraduate), [SUSS graduate programmes](https://www.suss.edu.sg/academics/programmes/graduate-programmes/programmes). Consulted 13 October 2026. Directory presence is not evidence of an open current intake.

The SUSS Master of Social Sciences is retained as a coursework-led stackable lead: its page describes 60 cu from two graduate diplomas plus a 10-cu applied project. A programme is not automatically a research degree just because it contains a project. Admission via stackable credentials still needs checking. [Programme structure](https://www.suss.edu.sg/programmes/detail/master-of-social-sciences).

The two research routes already present in the immutable seed are retained with their original IDs and an evidence-linked scope overlay:

- SG-SUTD-P003: [Innovation by Design](https://www.sutd.edu.sg/programme-listing/mibd/about/programme-overview) explicitly tagged Master By Research.
- SG-SUSS-P008: [Applied Research in Social Sciences](https://www.suss.edu.sg/programmes/detail/master-of-applied-research-in-social-sciences-mress) explicitly described as a master's by research with a 40-cu thesis.

These exclusions concern programme type, not a student's qualifications. SUSS-FHNW dual pathways must not inherit the ordinary degree's requirements; they stay in the research inventory until route-specific records are designed.

## Reconciliation and reproducibility

37 new leads bring the expansion layer from 186 to 223. The original 175 records remain unchanged, so total stored = 398. Default catalogue = 395 after excluding one transfer-only route and two research routes. Detailed initial page checks remain 21, including the retained transfer record; independent reviews and complete requirements remain zero. Six of 14 consulted university directories now have completed enumeration; this is not full coverage of all 14 institutions.

Inputs are frozen Oct-13 observations under data/research. The SUTD public-HTML observations include source hashes and filtered result counts. SMU uses readable official-directory text and observed destination URLs. SUSS uses visible browser DOM after expanding all nine school sections. The ordinary public collector's empty/stub/403 responses are also retained; no access barrier was bypassed. No private student data was submitted to university sites.

build-sg-directory-inventory.mjs generates the crosswalk and unreviewed expansion layer. Existing IDs are preserved; repeating the build may label this batch's already-added IDs as existing rather than new. New-batch totals should be calculated from inventoryBatch, not that rerun label. The older Oct-8 builder refuses to overwrite a newer batch. Original workbook, catalogue.json and Oct-8 research snapshots are unchanged.

## Next data work

NUS and NTU still need full dynamic-directory enumeration; their existing 34/22 seed records are not official totals. The other four Hong Kong pending lists and PolyU scheme/award reconciliation remain open. For the pilot, prioritise missing tuition/intake evidence, test versions and programme-specific academic equivalence. New directory leads have no imported requirements, no invented year/deadline, and no recommendation tier.
