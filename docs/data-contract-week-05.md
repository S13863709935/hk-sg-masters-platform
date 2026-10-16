# Week 5 data model and API contract

Prepared 16 October 2026. This contract turns the baseline field design into a limited executable pilot. Data files inherited from Week 4 remain unchanged, including their original source dates.

## Entity responsibilities

| Entity | Stable identity and key fields | Rule |
| --- | --- | --- |
| University | university ID, English name, HK/SG region, official directory URL | 14 target institutions; directory entry is not a complete programme count |
| Programme | programme ID, university ID, title, award, area, faculty, route, coverage/review state | Stable IDs; titles are not identifiers |
| Offering | offering ID, programme ID, academic year, intake, mode, duration, fee/currency/basis, deadline/note | Never combine a different intake, mode or fee category into a single apparently comparable value |
| Requirement | programme reference, kind, mandatory/preference flag, threshold or manual note, source | Numeric GPA requires its original scale; language version/date/component constraints remain explicit |
| Source / review | URL, purpose, actual check date, collector, reviewer, coverage and conflict notes | Discovery, page reading and independent review are distinct; no invented reviewer |
| Background | self-reported major, degree/classification, GPA/scale, experience and language | Transient request/page-memory object; not a database record |
| Check result | status, tier=null, per-rule explanations, source URLs, met/gap/unknown counts | No prediction, guarantee or university-confirmed eligibility |

The pilot represents sources and requirements as nested JSON. The later SQLite design separates universities, programmes, offerings, requirements and source/review metadata with foreign keys. SQLite migrations, persistence and admin updates are intentionally not shipped in Week 5.

Field states remain `known`, `not_published`, `not_applicable` and `unknown`. They do not replace the record's review state. “Not published” refers only to consulted sources; it is not proof that the school has no academic standard.

## Published runtime endpoints

| Endpoint | Contract |
| --- | --- |
| GET /api/health | Local runtime identity and week-05 checkpoint |
| GET /api/checkpoint | Preparation date, source snapshot date, pilot/review counts and explicit implementation/design/exclusion lists |
| GET /api/meta | University options and checkpoint metadata |
| GET /api/catalogue?q=&region=&school= | Combined case-insensitive pilot filters; returns items and total; empty array is valid |
| GET /api/programmes/{id} | One direct-entry pilot record including offering/evidence context; 404 otherwise |
| POST /api/matches | JSON `{ "profile": ... }`; returns 20 source-linked programme checks, never echoes the profile |

Profile validation returns 422 for invalid values, 400 for invalid JSON, 413 above 16 KB and 415 for an unsupported body type. An external Origin is rejected with 403. No credential is needed because this loopback-only version has no persistent write capability. The static file allowlist exposes only the HTML, script and stylesheet, not source JSON or server files. No CORS access is granted.

## Publication boundary

The service reads the 21-record frozen research file but serves only its 20 direct-entry records. The one transfer-only reference stays in the research file and cannot appear as a direct-entry option. It does not read the original workbook or the ahead-of-plan expanded data. The service is bound to 127.0.0.1 on port 3105, not publicly deployed.

No background request logging, localStorage, sessionStorage, cookies, profile table or profile export is implemented. Loading another page or restarting the process does not create an academic history. Reload clears page-memory input. Public hosting would require a separate security/privacy design and authorisation.
