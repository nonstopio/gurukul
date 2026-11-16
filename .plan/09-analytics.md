# 09 · Analytics

## What Admins see

| Metric | Source |
|---|---|
| Active learners (signed in / total) | `stats/org.activeLearners30d`, `users` count |
| Assignments completed / total | `stats/org.assignmentsCompleted`, `.assignmentsTotal` |
| Average Quiz score, first-try pass rate | `stats/org.quizScoreSum`/`quizScoreCount`, `quizFirstTryPassed`/`quizFirstTryTotal` |
| Overdue assignments | query: `assignments where status != completed and dueAt < now` (count aggregation) |
| Lessons completed per week, last 12 weeks | `stats/org.weekly[]` |
| Course funnel (assigned, started, completed, avg score, overdue) | `stats/course_{id}` |
| Where learners stop (per chapter) | `stats/course_{id}.chapterCompletions[]` |
| Median time to finish (average beside it) | `stats/course_{id}.finishDaysHistogram{}` (learners per whole day, capped at 365; the median is read from it), `finishDaysSum`/`completed` for the average. The daily roll-up rebuilds it whenever it recounts the course |
| Hardest questions | `stats/course_{id}.questionFirstTry{}` |
| Per-Quiz first-try answers and share right | summed in the browser from `questionFirstTry{}` over the course's own questions; warning colour only below 70% |
| Needs attention (overdue, failed twice, pending invites) | five of each. Overdue and pending come from the open assignments the page already loads; failed twice (a Quiz with 2+ attempts, not passed) is read from the 100 most recently active progress documents, so it covers recent learners, not everyone. The date range and team filters narrow these lists only; the counters stay org-wide. Nudge and Resend email through `remindLearners`; Reset is `resetCooldown` |

## How it is counted (and why)

Reading every progress document for a dashboard would cost hundreds of reads
per view. Instead, Firestore triggers keep **counters** current:

- On progress write: increment chapter and course completion counters when an
  item or course becomes complete (idempotent: the trigger compares before/after).
- On attempt write: update question first-try counters and score sums, on the course and (as
  `quiz*`) on the org. A first try is the learner's first attempt at that Quiz; it counts
  as passed when that attempt did.
- Daily scheduled roll-up: users, active learners and assignments by count() aggregations, written
  as soon as they are counted, and a consistency check on the counters the progress trigger keeps
  (below). The weekly lessons series is kept by the trigger alone: no lesson stores when it was
  completed, so a past week cannot be rebuilt. The attempt counters (score sums, first tries, per
  question and `quiz*` on the org) are kept by the attempt trigger alone too: the roll-up no longer
  reads attempts, so a count the trigger missed or made twice stays until someone corrects it.

### The nightly consistency check

`counters/rollup` holds when the last finished run started (`ranAt`) and the courses it had to
skip (`retry`). A course is **due** when a learner was active in it since then (a progress document
with `lastActiveAt` after it, less five minutes of overlap), when it was published since then (its
chapters may have changed), or when it is in `retry`. The first run has no `ranAt`, so every course
is due: that one run is the full recount, and no manual step is needed.

For a due course the run reads `stats/course_{id}`, then every progress document of the course,
rebuilds `started`, `completed`, `certified`, `chapterCompletions`, `finishDaysSum` and
`finishDaysHistogram`, and writes them in a transaction that first checks the stats document is
unchanged since it was read. If a trigger counted something meanwhile, nothing is written and the
course goes into `retry` for the next night, so a recount never overwrites an increment. The same
transaction moves the org's `started` and `completed` by what the recount changed (an increment,
not a total). A course that is not due only has `assigned` recounted (one count() query).

The rosters follow the same rule: for each progress document active since the last run, the
roll-up reads that learner's profile and roster entry, adds a missing entry, and on a changed name
rewrites the learner's entry in every course they started.

Reads per night, assuming every person has started every course (P = people x courses progress
documents), three attempts per progress document, and a fifth of the people active that day in one
course each (d progress documents: 40 and 300):

| | 200 people, 5 courses | 1,500 people, 10 courses |
|---|---|---|
| Before: every course, progress, attempt, profile and roster document | ~5,200 | ~76,500 (over the 50,000 free reads by itself) |
| Now, every course due (the worst night): courses + P + 3d (active progress, profile, roster entry) | ~1,150 | ~16,000 |
| Now, half the courses due | ~650 | ~8,500 |
| Now, a night with no activity (courses and count() queries only) | ~15 | ~40 |
| The first run after this shipped, once: courses + 3P + people | ~3,200 | not reached at this size |

The ceiling that is left: a due course still costs one read per progress document, so the check
grows with people x courses on a night when every course is due. If that nears the quota, compare
count() aggregations of started and completed with the stored counters first, and read a course's
progress only when they disagree or it was published.

A dashboard view is then ~3–10 document reads.

## Exports

"Export CSV" (on the overview) builds the file client-side from the newest 500 assignments the
page already loaded (Admin only), so it adds no reads. It is the one heavy read and
is user-initiated.

## Privacy

Learners see only their own data. Educators see aggregates for their courses
and, for their own courses only, the names of the people who started them (decided). Names come from
`courses/{id}/learners/{uid}` (`{displayName, startedAt}`), written by the progress trigger when a
learner starts; the rules let that course's Educators and Admins read it, so an Educator never
reads a profile (`users/`), an email or another course. Studio's Analytics tab lists them with
their progress. The daily roll-up adds anyone missing from the roster (learners who started before it
was kept) and copies a profile rename to it for the learners active since its last run, so a new name
shows there the day after the learner next opens a course. No analytics or tracking scripts on the
site; no third-party cookies. The one exception is Firebase Performance Monitoring (page load and
request timings, no personal data), see `11-deployment-and-cost.md`.
