# Local search and background-result consistency — 21 October 2026

Actual AI-assisted development record, not assessment prose, team attribution or user-research evidence.

## Reproduced issue

At baseline `aeb6084`, the catalogue API searched `faculty`, while the browser's background-result filter did not. Running both functions against the same records with `q=Wee Kim Wee` and `school=SG-NTU` returned `SG-NTU-P018` in catalogue discovery but no browser match results. The browser also lacked the API's 200-character query bound.

## Local fix

- Extracted one pure catalogue filter shared by the server and browser. Programme titles, faculty, subject tags, institution names and directory variants now use the same searchable fields and query bound.
- Kept outcome-specific filtering separate, including withholding stale remembered-choice outcomes. Default transfer-only and out-of-scope exclusions remain intact.
- Preserved matching order, route/mode/category projection, unknown fields, source snapshots and admission-tier safeguards. A searchable keyword is not evidence of eligible undergraduate subjects.
- Exposed only the intended browser module through the existing static allowlist and security headers. No new dependency, external service or stored profile is introduced.

## Verification

379 automated tests passed, none failed or skipped. Twelve new tests cover shared implementation wiring; faculty/title/directory search; case/space/query bounds; combined filters; scope exclusions; stale remembered outcomes; non-mutation; static serving; catalogue/matching/browser membership; selected HKU route/mode/category parity with details; and candidate-export uncertainty.

Browser QA used only the built-in synthetic Civil Engineering example, with background remembering unchecked. Searching Wee Kim Wee at NTU retained the same one result after the background was applied. Part-time selection propagated to the search card and shortlist. A known-gap outcome filter returned zero; needs-confirmation returned the same project with its fee/date unknowns intact. No eligibility tier was assigned. Interface text remained English with no horizontal page overflow or observed browser warnings/errors.

Temporary shortlist entry and synthetic background were cleared through the interface; no choice was remembered and no external application was submitted. Screenshot outside Git: parent-workspace `work/gradpath-search-consistency-2026-10-21.png`. Preview used an in-memory loopback-only database.

Catalogue remains 873 records / 870 visible / 21 parent checks, with zero independent reviews and complete sets. Data files and source observations are unchanged; no new research check is claimed.

## Publication recommendation

No push now: consolidate this correctness fix with the other local work for the 25 October stage review. That review does not authorize automatic publication. This turn only creates a local commit, with no deployment, remote operation, desktop-document edit, assessment submission or publication-worktree change.
