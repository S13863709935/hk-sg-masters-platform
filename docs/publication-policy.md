# Staged GitHub publication

Local development may advance beyond the project timetable. A GitHub checkpoint publishes selected plan-appropriate progress, not the advanced development branch wholesale.

The user's latest clarification on 20 October 2026 supersedes the earlier interpretation of delegated timing: consecutive small pushes after each "continue" are too frequent. "Continue" means implement, verify and save locally, not publish another remote increment.

## Publication cadence

- Keep local commits organised by actual completed work, using real dates. Do not make a push merely because another conversation turn or small task has finished.
- At each completed development handoff, include a push/no-push recommendation and a short reason. Distinguish the recommendation from the actual action; recommending a push does not automatically perform it.
- At the planned weekly/stage review, consolidate a meaningful, tested batch and assess whether it is ready for one checkpoint publication. Readiness alone before that review is not a reason for an extra push.
- The current Study Week branch already contains commits `7e70566` and `2451419`. Make no further incremental pushes before the 25 October review unless the user explicitly asks to push. The review is not an automatic push or a claim that the research milestone is complete.
- If the review date passes while no development turn is active, nothing runs in the background. Evaluate readiness during the next active turn; do not backdate work or invent weekly activity.
- Preserve existing remote history; do not delete, squash or rewrite the earlier pushes without separate authorisation.

## Publication checks and boundaries

- Use the real project calendar: Study Week is 19–25 October, followed by Week 6 on 26 October. No Week 11.
- Start a publication branch at a verified published checkpoint. Keep dependencies and selected files within its stated scope.
- Check tests, source dates, missing evidence, privacy and the staged diff before pushing; verify the remote SHA afterward.
- Keep actual commit/read dates. Never invent independent review, user feedback, meetings or teammate contributions. Planned ownership is not completed work.
- Never publish private student data, CVs, signatures, secrets, browser preferences or local runtime databases.
- Keep `main` and historical checkpoint branches unchanged until a separately authorised review/merge step. A push is not a public deployment or a course submission.
- A mid-period progress checkpoint does not mean every task for that week is complete. Record remaining research/acceptance/verification honestly.
