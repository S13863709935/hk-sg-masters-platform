# Staged GitHub publication

Local development may advance beyond the project timetable. A GitHub checkpoint publishes selected plan-appropriate progress, not the advanced development branch wholesale.

The user's latest clarification on 20 October 2026 supersedes the earlier interpretation of delegated timing: consecutive small pushes after each "continue" are too frequent. "Continue" means implement, verify and save locally, not publish another remote increment.

## Publication cadence

- Keep local commits organised by actual completed work, using real dates. Do not make a push merely because another conversation turn or small task has finished.
- At each completed development handoff, include a push/no-push recommendation and a short reason. Distinguish the recommendation from the actual action; recommending a push does not automatically perform it.
- At the planned weekly/stage review, consolidate a meaningful, tested batch and assess whether it is ready for one checkpoint publication. Readiness alone before that review is not a reason for an extra push.
- Study Week history remains at its existing checkpoint. Week 6 was explicitly published on 27 October 2026 at `ebc08ff`; later development stays local until a meaningful weekly/stage publication review or an explicit push request. Passing checks or completing this school batch does not itself trigger a push. The 29 October school-batch workflow confirmation preserves this cadence.
- Week 7 stage review was completed on 3 November 2026 after the user confirmed the current week. `checkpoint/week-07` was pushed once at `dff8b54` from published W6: pilot comparison/candidate references/export and five compatible source updates. It is early-week progress, not the completed W7 milestone or the advanced local catalogue. Remote SHA and all earlier protected branches were verified. Subsequent work remains local until another meaningful stage review or explicit publication request; do not repeatedly push merely because it is still W7.
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
