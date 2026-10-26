## What changed

<!-- One or two sentences, in plain English. -->

## Why

<!-- The plan item (.plan/…), issue, or problem this solves. Explain the fact; do not just link it. -->

## How it was checked

<!-- Commands you ran and what you saw. Screens: a screenshot at 1280px and at phone width. -->

## Checks

- [ ] `npm run check` passes locally (lint, format, typecheck, navigation, hook and script tests, 100% coverage, build)
- [ ] Changed `firebase/firestore.rules` → `npm run test:rules` passes, with an allowed **and** a denied test for each changed rule
- [ ] UI change → follows `.claude/skills/gurukul-design/SKILL.md` (role tokens, 44px targets, focus ring, 4.5:1 contrast)
- [ ] Changed the course object shape → `.plan/02-data-model.md` and the schema version updated together
- [ ] Someone would notice this change → one entry in `apps/web/src/changelog/entries/` (`npm run changelog:new`)
- [ ] Added, renamed or removed a page → its area in `apps/web/src/navigation/areas/` updated; `npm run validate:navigation` passes
- [ ] No secrets, service-account files, real learner data or emulator exports in the diff
- [ ] Conventional Commit title with an area scope — `feat(web): …`, `fix(rules): …`, `chore(deps): …`
