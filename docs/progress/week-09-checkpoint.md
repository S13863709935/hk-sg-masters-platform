# Week 9 development handoff

Record date is 18 November 2026, UTC+08:00. The project calendar places Week 9 on 16–22 November.

## Code and publication history

The user authorised this checkpoint push on 18 November. `checkpoint/week-09` starts from the verified published commit `e33ba126077519c733566cbf1961ea71ad5df8f9` on `deploy/render-demo`.

The complete application was developed earlier and published for Render deployment on 11 November. This checkpoint archives that version and adds current verification and handoff documentation. It retains the original implementation and source-read dates. It adds no new application feature or admissions data.

The [Week 8 checkpoint](https://github.com/S13863709935/hk-sg-masters-platform/tree/checkpoint/week-08), `b7b5a4d10d0686f6775219017ff9d9569c773a0b`, records the earlier twenty-programme pilot. The full deployment branch and this handoff contain the expanded catalogue. Earlier weekly branches retain the work actually published at each stage.

## Delivered application

The English website supports programme search and filtering, programme details, background checks against recorded criteria, side-by-side comparison, browser shortlists and public programme-information export.

The repository build check and public catalogue metadata agree on the following counts.

| Item | Count |
| --- | ---: |
| Universities in scope | 14 |
| Catalogue records | 873 |
| Records visible by default | 865 |
| Records with partially checked programme information | 858 |
| Complete requirement records | 0 |
| Independent reviews | 0 |

Route evidence contains 77 groups and 176 records. Applicant evidence covers 345 study options and 694 recorded categories. Partial page checks and these evidence records retain their respective coverage limits.

## Checks performed on 18 November

The repository build command `node scripts/check-data.mjs` passed using Node.js `v24.22.3` on Windows. It loads an isolated in-memory catalogue and checks the source counts and evidence structures.

The following existing deployment, API and Windows startup tests passed with 35 passes, zero failures and zero skipped tests.

```text
node --test tests/hosted-demo.test.mjs tests/app.test.mjs tests/startup-launcher.test.mjs tests/startup-environment.test.mjs
```

The tests cover the configured public host and HTTPS origin, synthetic-background matching, catalogue loading, disabled public imports, hosted cold starts and Windows launcher behaviour. A first run under restricted local networking failed to reach local test services. Running the same suite with normal local network access passed all 35 checks without application changes. The original deployment configuration still specifies Node.js `24.22.1`; today's local test runtime is recorded separately.

Public HTTP checks completed at `2026-11-18T21:13:45+08:00` against [GradPath](https://gradpath-hk-sg-demo.onrender.com/).

| Endpoint | Observed result |
| --- | --- |
| `/` | HTTP 200 and an English HTML entry page |
| `/api/health` | HTTP 200, `ok: true`, application `gradpath`, version `0.1.0` |
| `/api/meta` | HTTP 200, `hosted_demo`, administrative imports disabled, counts matching the table above |
| `/api/catalogue?q=civil%20engineering` | HTTP 200 and six programme search results |

These requests confirm current public availability and catalogue responses. The earlier [10 November software acceptance](local-final-use-2026-11-10.md) records the detailed browser workflow and responsive-layout checks. Those browser checks retain their original date.

The existing deadline review covered 22 programmes and corrected two application-round labels. Its source observations remain dated 10 November. The [original observation file](../../data/research/final-local-use-observation-2026-11-10.json) and [acceptance record](local-final-use-2026-11-10.md) retain the evidence and correction details.

## Handoff and remaining work

This is the planned development-stage handoff. Subsequent application commits should address an observed defect, a verified source update or actual user feedback. Poster, presentation and final-report preparation continue separately.

Independent data review and genuine student usability testing remain planned work. The Week 9 calendar includes user testing through 22 November, so this midweek checkpoint does not mark that milestone complete. Additional physical devices and a new browser end-to-end session were not tested during today's endpoint verification.

Some fees, dates and requirements remain incomplete or need confirmation. Universities make admissions decisions. The live demo loads the source snapshot into memory and keeps administrative imports disabled. Student shortlists use browser storage, and the server processes backgrounds temporarily. See the [hosting guide](../deploy-render.md) and [local demo guide](../local-demo-guide.md) for operation.
