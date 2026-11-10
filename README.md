# HK–SG Masters Platform — Week 8 checkpoint

An English pilot for exploring taught/coursework master's programmes in Hong Kong and Singapore.

Prepared on **10 November 2026**, during W8 (**9–15 November**), from published W7 commit `dff8b54`. This selected integration checkpoint retains **20 direct-entry programmes across 14 target universities**, plus one excluded historical transfer-only reference. It does not mark the whole week or project complete.

## Included in this checkpoint

- Search, official-source details, temporary background comparison, 2–4 programme comparison and candidate references.
- Five existing source records consolidated from the advanced local version: CityU Computer Science, HKBU Communication, HKBU Business Management, EdUHK Public Policy and Management, and HKUST Digital and Sustainable Cities.
- Exact study-option resolution in the details API. A foreign, retired, empty or repeated option is rejected; no first-option price is substituted.
- Multiple-option cards ask for an explicit choice. Details and comparison retain recorded rounds and exact cutoff offsets; public-reference exports retain the same ordered rounds through a field whitelist.
- Matching distinguishes strict greater-than score rules from inclusive minima and preserves a known final-year degree status for an explicit completed-degree-only rule. Those two flags are tested with synthetic fixtures; no new university condition is invented.

The expanded catalogue, route/applicant engines, SQLite/admin tooling and broader local source batches remain in the separate local development branch. This GitHub checkpoint is not a deployed website or a course submission.

## Run locally

Use **Node.js 24 or later**. No runtime dependencies need installing.

```text
npm start
npm test
npm run check:data
```

Open **http://127.0.0.1:3112** and keep the terminal running. The server binds only to loopback. The advanced local website on 3102 and older checkpoint ports are separate.

Backgrounds remain temporary and are not logged, saved or exported. Candidate saving is optional and stores only programme/option IDs in the browser. Saved references are checked against current options, without substitution. W8 uses a separate browser-storage key. Older W7 references are not automatically rebound to revised intakes, and their saved copy is left untouched. Clear saved references when finished on a shared device.

## Data limits and verification

The five consolidated objects retain their actual **20–30 October** observations, including older individual source dates within a scoped recheck. Sixteen other objects, the original pilot IDs, directory register and 175-row workbook remain unchanged. The transfer-only record retains 6 October evidence and stays outside direct-entry browsing. **10 November is preparation day, not a fresh reading of every source.**

All direct-entry records remain partial. Independent reviews and complete requirements are **0**. Applicant-category fees, admission equivalence, English waivers, route applicability and live portal availability still need confirmation. Unknown fees are not zero; recorded dates are not a live-open claim. No admission tiers, probabilities or guarantees are provided.

**92 automated checks passed**, without failures or skips. Integration tests exercise all published study choices through details, saved-reference reconciliation and public export; seven synthetic backgrounds also exercise twenty records each. Browser checks confirmed CUHK's five rounds, its unresolved part-time fee and HKU's noon cutoff offset in details/comparison. These checks are software QA, not participant research or independent admissions review.

- [W8 scope and validation](docs/progress/week-08-checkpoint.md)
- [Five source records and retained limits](docs/research/week-08-selected-sources.md)
- [Publication manifest and fingerprints](data/publication-week-08.json)
- [Project calendar](docs/calendar-and-backlog.md)
- [Data and matching principles](docs/data-and-matching.md)
- [Data history](data/README.md)
- [Publication policy](docs/publication-policy.md)
- [Previous W7 checkpoint](docs/progress/week-07-checkpoint.md)

Real user research, independent source review and team acceptance remain outstanding. Planned ownership does not establish completed teammate work. Preserve earlier checkpoints and the separate advanced local version.
