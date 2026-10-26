# Gurukul plan

The reviewed plan for NonStop Gurukul (NonStop Academy). Code follows this
plan; a change in scope, data shape, roles or cost changes the plan first, in
the same PR.

**Status:** draft for review. The setup PR ships the foundations plus two platform features
(changelog and global search, `15-changelog-and-search.md`); product features wait for approval.

## How to review

Read in this order. Each file ends with its own open questions; the
cross-cutting ones are collected in `13-open-questions.md`.

| File | What it settles |
|---|---|
| [00-vision-and-scope.md](00-vision-and-scope.md) | What we build, for whom, what is out of scope |
| [01-architecture.md](01-architecture.md) | Monorepo, Firebase services, request flows |
| [02-data-model.md](02-data-model.md) | The course object and every Firestore collection |
| [03-auth-and-roles.md](03-auth-and-roles.md) | Google sign-in, domain lock, Shishya / Acharya / Kulapati |
| [04-design-system.md](04-design-system.md) | Tokens, components, accessibility bar |
| [05-learner-experience.md](05-learner-experience.md) | Home, course, lesson player, progress and resume |
| [06-pariksha-and-certificates.md](06-pariksha-and-certificates.md) | Quizzes, server grading, certificates and verification |
| [07-kulapati-console.md](07-kulapati-console.md) | Learners, bulk assignment by email, roles |
| [08-vyasa-studio.md](08-vyasa-studio.md) | Course authoring: structure, blocks, quiz builder, publishing |
| [09-analytics.md](09-analytics.md) | Sanjaya: what is counted, where, and at what cost |
| [10-testing-and-ci.md](10-testing-and-ci.md) | 100% coverage, rules tests, e2e, CI jobs |
| [11-deployment-and-cost.md](11-deployment-and-cost.md) | Environments, deploys, Blaze budget, quotas |
| [12-milestones.md](12-milestones.md) | M0–M6 with exit criteria |
| [13-open-questions.md](13-open-questions.md) | Decisions needed from the maintainer |
| [14-first-course-git.md](14-first-course-git.md) | The Git course outline and its Parikshas |
| [15-changelog-and-search.md](15-changelog-and-search.md) | The changelog, global search and the Claude hooks and skills behind them |
| [design-handoff/](design-handoff/README.md) | Screen-by-screen developer handoff for all 19 designs |

## Sources

- Design canvas: "NonStop Gurukul — L&D Platform" (19 artboards: learner,
  Kulapati console, Vyasa Studio, naming, data model).
- Brand: nonstopio.com (green `#08A66A`, mint `#24D39A`, Inter).
- Conventions: the `eklavya` repository (CLAUDE.md style, 100% coverage rule,
  CI shape).
- Firebase project: `nonstop-gurukul`.

## Vocabulary

| Term | Meaning |
|---|---|
| Gurukul | The platform (public name: NonStop Academy) |
| Shishya | Learner — every signed-in person |
| Acharya | Educator — builds and edits the courses they are granted |
| Kulapati | Admin — assigns, grants roles, sees everything |
| Parva | A chapter of a course |
| Pariksha | A checkpoint quiz of 5–6 questions after a parva |
| Siddhi | Course completion |
| Vyasa Studio | The course authoring area |
| Sanjaya | Analytics |
