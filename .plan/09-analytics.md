# 09 · Sanjaya (analytics)

## What Kulapatis see

| Metric | Source |
|---|---|
| Active learners (signed in / total) | `stats/org.activeLearners30d`, `users` count |
| Assignments completed / total | `stats/org.assignmentsCompleted`, `.assignmentsTotal` |
| Average Pariksha score, first-try pass rate | `stats/org.parikshaScoreSum`/`parikshaScoreCount`, `parikshaFirstTryPassed`/`parikshaFirstTryTotal` |
| Overdue assignments | query: `assignments where status != completed and dueAt < now` (count aggregation) |
| Lessons completed per week, last 12 weeks | `stats/org.weekly[]` |
| Course funnel (assigned, started, completed, avg score, overdue) | `stats/course_{id}` |
| Where learners stop (per parva) | `stats/course_{id}.parvaCompletions[]` |
| Hardest questions | `stats/course_{id}.questionFirstTry{}` |
| Per-Pariksha first-try answers and share right | summed in the browser from `questionFirstTry{}` over the course's own questions; warning colour only below 70% |
| Needs attention (overdue, failed twice, pending invites) | five of each. Overdue and pending come from the open assignments the page already loads; failed twice (a Pariksha with 2+ attempts, not passed) is read from the 100 most recently active progress documents, so it covers recent learners, not everyone. The date range and team filters narrow these lists only; the counters stay org-wide. Nudge and Resend email through `remindLearners`; Reset is `resetCooldown` |

## How it is counted (and why)

Reading every progress document for a dashboard would cost hundreds of reads
per view. Instead, Firestore triggers keep **counters** current:

- On progress write: increment parva and course completion counters when an
  item or course becomes complete (idempotent: the trigger compares before/after).
- On attempt write: update question first-try counters and score sums, on the course and (as
  `pariksha*`) on the org. A first try is the learner's first attempt at that Pariksha; it counts
  as passed when that attempt did.
- Daily scheduled roll-up: users, active learners and assignments by count() aggregations, and a
  consistency check that rebuilds every course counter and the org's started, completed and
  `pariksha*` counters from the progress and attempt documents, overwriting any drift (and
  backfilling attempts graded before a counter existed). It reads each course, progress and attempt
  document once: a few thousand reads a day at 200 people, well inside the 50k free reads.
  The weekly lessons series is kept by the trigger alone: no lesson stores when it was completed,
  so a past week cannot be rebuilt.

A dashboard view is then ~3–10 document reads.

## Exports

"Export CSV" (on the overview) builds the file client-side from the newest 500 assignments the
page already loaded (Kulapati only), so it adds no reads. It is the one heavy read and
is user-initiated.

## Privacy

Learners see only their own data. Acharyas see aggregates for their courses
and, for their own courses only, the names of the people who started them (decided). Names come from
`courses/{id}/learners/{uid}` (`{displayName, startedAt}`), written by the progress trigger when a
learner starts; the rules let that course's Acharyas and Kulapatis read it, so an Acharya never
reads a profile (`users/`), an email or another course. Vyasa Studio's Analytics tab lists them with
their progress. A name is copied once, at the start, so a later rename shows on the Kulapati
console but not there; learners who started before this was kept show as "Name not recorded". No analytics or tracking scripts on the
site; no third-party cookies.
