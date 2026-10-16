# Week 5 interface contract

Prepared 16 October 2026. Engineering design and early implementation; not a record of team acceptance or user-study results.

The interface language is English. Existing GradPath cream/forest-green branding is retained. The published pilot uses the 6 October source snapshot, not the larger local catalogue.

| View / interaction | Information and behaviour | Week 5 boundary |
| --- | --- | --- |
| Explore | Search text, region and university; cards show title, academic year, mode, subject and fee context | Working on 20 direct-entry pilot records; explicit empty state and reset |
| Programme detail | Offerings kept separate; original currency, intake, fees, dates, conditions, field coverage and source links | Working; partial coverage and review status always visible |
| Background | Major, original GPA/scale, degree/classification, experience, language type/total/components/date | Working, optional and temporary; no upload, account or persistence |
| Check reasons | Each recorded rule shows met / gap / unresolved, preference vs mandatory, and source | Working proof of concept; incomplete requirements stay unresolved; no tiers |
| Comparison | Choose 2–4 records and compare the same fields with offering-specific values | Design preview only; no selection, comparison endpoint or implemented engine |
| Candidate list | Add/remove by stable ID, avoid duplicates, return to detail; later export references only | Design preview only; no saving or export in this branch |
| Data notes | Pilot size, scope, source date, independent review, completeness, limitations | Working explanatory view; no administrative editing |

## User journey

Start with browsing, open a detail, inspect its evidence, then optionally enter a background. After a successful check, return to browsing with per-record summaries and open details for individual reasons. A user can edit or clear the temporary background. Filters apply equally before and after checking. Reset filters does not silently clear a background; the separate clear action does.

## Interaction and failure requirements

- Search is explicitly submitted; stale asynchronous results must not overwrite newer results.
- A missing score stays missing, including a single missing IELTS component. No blank-to-zero conversion.
- Invalid inputs produce a readable error. A failed request must not discard an existing valid profile.
- The detail dialog has an accessible title, a close control and native Escape handling.
- A skip link, associated labels, keyboard-focus styling and narrow-screen reflow are included.
- Wide offering tables scroll inside the dialog rather than widening the entire page.
- Design-only features are labelled before any mock layout; no fake saved state or fabricated programme recommendations.

## Acceptance still needed

The planned B06 owner is Zhang Dawei, with Song Shaoheng and Wang Youran supporting. This document does not claim those members have reviewed or approved it. Actual team confirmation and representative user feedback remain pending. Automated and browser checks are engineering checks, not real usability-study evidence.
