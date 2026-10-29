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
| Needs attention (overdue, failed twice) | small queries, `limit(5)` |

## How it is counted (and why)

Reading every progress document for a dashboard would cost hundreds of reads
per view. Instead, Firestore triggers keep **counters** current:

- On progress write: increment parva and course completion counters when an
  item or course becomes complete (idempotent: the trigger compares before/after).
- On attempt write: update question first-try counters and score sums, on the course and (as
  `pariksha*`) on the org. A first try is the learner's first attempt at that Pariksha; it counts
  as passed when that attempt did. Attempts graded before these org counters existed are not in them.
- Daily scheduled roll-up: weekly series, active learners, consistency check
  that recomputes counters from source (fixes any drift).

A dashboard view is then ~3–10 document reads.

## Exports

"Export CSV" (on the overview) builds the file client-side from the newest 500 assignments the
page already loaded (Kulapati only), so it adds no reads. It is the one heavy read and
is user-initiated.

## Privacy

Learners see only their own data. Acharyas see aggregates for their courses
and (decision pending) learner names. No analytics or tracking scripts on the
site; no third-party cookies.
