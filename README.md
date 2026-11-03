# HK–SG Masters Platform — Week 7 checkpoint

An English website for exploring and comparing taught/coursework master's programmes at the target Hong Kong and Singapore universities.

## This publication

Prepared on **3 November 2026**, early in W7 (**2–8 November**), from the published W6 checkpoint `ebc08ff`. This is a selected progress checkpoint under ongoing T2 data collection and T5 core development, ahead of the 8 November review target. It does not mark the week or project complete.

The published pilot covers **20 direct-entry programmes across 14 target universities**, plus an excluded transfer-only research reference. It now supports:

- Search, programme details and temporary background comparisons with reasons and official sources.
- Comparison of 2–4 programme references with an explicit intake/study-mode choice for each. Unselected choices have no default comparison price; currencies and fee bases remain separate.
- A candidate list with duplicate prevention, removal and clear controls.
- Optional browser-local saving of programme/option IDs. Saving is opt-in; no background, score, document or fee snapshot is stored. Saved choices are checked against the current pilot on reload.
- JSON export of public programme references and the exact selected offerings, without personal background or match results.

The advanced local platform remains separate. Its expanded catalogue, route/applicant engines, database/admin tools and broader source batches are not included here. GitHub publication is not a public website deployment or course submission.

## Run locally

Use **Node.js 24 or later**. There are no runtime dependencies to install.

```text
npm start
npm test
npm run check:data
```

Open **http://127.0.0.1:3111**. The server binds only to loopback. W6 uses port 3110 and the advanced local version uses 3102, so the three remain separate. Keep the server terminal running while browsing.

The background form goes only to this local service, is not logged or written to disk, and clears on reload. Candidate references are temporary until the user selects **Save list in this browser**; use **Forget browser copy** or **Clear candidate list** to remove that copy. A restricted browser can refuse storage; the temporary list remains usable. Shared-device users should clear their saved references when finished.

## Data scope and limits

- Five existing observations selected from the advanced local source: Lingnan International Higher Education and Management; PolyU Business Management; HKU Urban Analytics; SIT Civil Engineering; SUSS Management.
- These observations retain their actual **23–24 October** dates. The other sixteen records remain identical to W6; six records including the transfer reference retain **6 October** observations.
- All twenty direct-entry records remain **partial**. Independent human reviews: **0**; complete requirements: **0**. Recommendation tiers remain disabled.
- Original pilot IDs, the 175-row workbook and directory register are unchanged. Current source URLs, notes, uncertainties, original currencies and cohort fee bases remain visible.
- Publication preparation is not a fresh source check or confirmation that applications are open. Unknown prices are not zero, and recurring intake months do not establish a dated application window.

The site does not submit applications, predict admission probabilities or guarantee admission. University recognition, equivalence, waivers, professional registration and discretionary selection remain university decisions.

## Verification and evidence

**83 automated checks passed**, including fifteen new collection/source checks. The checkpoint's seven synthetic backgrounds exercise all twenty programmes through the matching API (140 comparisons); these are software fixtures, not participant research. Desktop browser checks covered explicit offerings and original-currency fees, candidate transfer, opt-in saving/reload, actual JSON download and clearing. The exported file was inspected for public fields and the chosen option. No new mobile, clean-machine or real-user acceptance result is claimed.

- [Selected scope, validation and remaining work](docs/progress/week-07-checkpoint.md)
- [Five source observations and their original dates](docs/research/week-07-selected-sources.md)
- [Publication manifest and object fingerprints](data/publication-week-07.json)
- [Calendar and action plan](docs/calendar-and-backlog.md)
- [Scope and requirements](docs/scope-and-requirements.md)
- [Data fields and matching principles](docs/data-and-matching.md)
- [Data history and limits](data/README.md)
- [Team and planned workflow](docs/team-and-workflow.md)
- [User/service research protocol](docs/user-research-protocol.md)
- [Staged publication policy](docs/publication-policy.md)
- [Earlier W6 checkpoint](docs/progress/week-06-checkpoint.md)

Real user research, independent review, broader source completion and the later integration/user-testing milestones remain outstanding. Planned ownership does not prove a teammate's contribution. Preserve `main`, earlier checkpoints and the advanced local branch; never commit private student files, credentials, browser preferences or runtime databases.
