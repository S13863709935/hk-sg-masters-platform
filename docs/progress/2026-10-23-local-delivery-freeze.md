# Local delivery check and feature freeze — 23 October 2026

Actual AI-assisted engineering record, not assessment text, team-work attribution, independent admissions review or user research.

## Outcome and freeze boundary

Completed the second and final agreed software closing round, following the concentrated workflow/layout acceptance in commit `37a30a2`. The existing local demonstration features are now frozen. This is not a production release, a public deployment, or a claim that the project/data collection is complete.

Do not add features merely because another “continue” arrives. Subsequent work should address reproducible use failures, necessary compatibility/documentation corrections, or separately scoped source-based data maintenance. New features, hosting and shared-branch publication need a separate decision.

## Startup defect actually found

This machine's default PATH Node is 16.20.2, below the app's declared minimum of 24. The existing launcher correctly intends to fall back to an already installed per-user runtime, but its `process.versions.node.split(".")[0]` probe loses the nested double quotes under Windows PowerShell's native-argument handling. Running the actual `.cmd` launcher from outside the repository reproduced a JavaScript syntax error before the fallback started the app.

Replaced only that probe with `parseInt(process.versions.node)`, which has no nested quoted delimiter. Added a regression test that extracts the real launcher expression and executes it through Windows PowerShell on Windows, asserting a successful, clean numeric result. It uses the current test runtime; the separate launcher smoke check exercises this machine's older PATH Node and fallback. No global PATH, execution policy, runtime installation, default port, app version, database schema or web feature changed.

A direct Windows PowerShell `-File start-local.ps1` invocation was also blocked by the device's script-execution policy. This is documented rather than bypassed through a persistent setting: the existing `.cmd` wrapper remains the recommended entry point and supplies its own process-scoped invocation parameter. No system security settings were edited.

## Verification performed

- Ran the actual `start-local.cmd` from the parent directory, with explicit `PORT=3117`, `DB_PATH=:memory:` and admin import disabled. With the corrected probe, it skipped PATH Node 16 and started using the existing compatible runtime with no probe error.
- Read health, metadata, first catalogue page, HTML and catalogue export from that owned service: version 0.1.0, 873 records, 870 browsable, 12 records on the first page, 873 in the public export, English document language, HTTP 200, admin disabled. Database and server-source URLs returned 404.
- Invoked the launch script again while that service was healthy: it reported “already running,” returned successfully, and left the existing service available.
- Started a second direct process against the occupied test port: it exited with code 1 and the expected port-in-use message. `PORT=0` exited with code 1 and an invalid-port error. Both used disposable in-memory settings, not a daily-use database.
- Stopped the first service. Then put Node 24.19.0 first in PATH for a separate test process only and ran the actual `.cmd` from the parent directory on port 3118. Health and quality succeeded; the listener was `127.0.0.1`. This checks the normal compatible-PATH branch, not a global PATH change.
- All 632 automated tests passed, none failed, cancelled or skipped, with the existing research Python/lxml environment explicitly supplied. This includes the existing temporary file-backed persistence tests; manual launcher checks deliberately did not create or alter the user's daily database.
- Stopped both owned preview instances; neither test port remained listening. No browser work or screenshots were repeated because the UI was unchanged; the preceding round's browser/viewport acceptance remains the UI evidence.

These checks do not test every Node/Windows version, a clean teammate computer, production hosting, physical phones or assistive technology. The normal default-port persistent-database launch was not used in the manual smoke check; its configured location is documented from the code, and persistence is covered separately by automated tests.

## Delivery documentation corrected

- README now leads with the latest local status and clearly separates older historical updates. It recommends `.cmd` for this machine rather than an unqualified `node`/`npm` command.
- Local maintenance instructions now cover restart behavior, alternate ports, the non-auto-loaded environment example, disposable versus persistent databases, a synthetic-data demonstration, browser-origin boundaries, maintenance backups, failure prompts and the feature freeze.
- Data notes distinguish repository-source auditing from the running local database, correct the stale 551/548 totals, and state the separate route/applicant evidence coverage. Historical observation dates were not advanced.
- `.env.example` now explains optional `DB_PATH`; it does not create a real environment file, token or database.

Data audit remains 14 schools / 873 catalogue records / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Route evidence is 2 groups / 5 routes, applicant evidence 8 study options / 16 categories, not additional parent programmes. No university website was rechecked or source-data JSON changed in this round. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

## Next decision and publication

Software closing work is complete within the tested local scope. Remaining work is data enumeration/verification, actual independent human review, any separately arranged user testing, and a separate hosting/security decision. Current real records still do not qualify for review-gated recommendation tiers.

Local commit only, no push, deployment, new release tag, remote access or automatic publication. At the 25 October stage review, assess a consolidated tested checkpoint and the remaining research honestly; the date does not itself grant publication authority. Main, historical checkpoint branches/worktrees, desktop documents and course submissions remain untouched.
