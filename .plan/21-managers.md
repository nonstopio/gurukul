# 21 · Managers: teams, assignment and deadline email

Team leads assign courses to their own people without being made Admins. Decided with the
maintainer on 2026-11-05.

## The role

| Role | How you get it | Stored as |
|---|---|---|
| Manager | An Admin grants it in Roles & access | claim `manager: true`, mirrored in `users/{uid}.roles` |

- Set only by `setRoles`, like Educator and Admin; a person may hold any mix of the three.
  Gurukul name: **Adhyaksha** (`apps/web/src/labels/terms.ts`).
- A Manager can: create teams, edit the teams they manage, assign published courses to those
  teams, see those teams' progress, change the due date of or remove an assignment made through
  one of those teams, and remind those teams' people. Nothing else: no roles, no org settings, no
  certificates, no Studio, no other team.
- **Educators no longer create or edit teams.** They still read them (Studio's course access card
  picks teams). Owning a team is Managers' and Admins' work; one way to own a team, not two.

## Who manages a team

`teams/{id}.managerEmails`: lower-cased emails, at most 10, keyed by email like members so a
manager can be named before their first sign-in.

- A Manager who creates a team is its manager: the create must list their own email in
  `managerEmails`. `createdBy` stays as a record and decides nothing any more.
- Only an Admin changes `managerEmails` (Teams page, Managers field). A Manager cannot add or
  remove managers, themselves included.
- A team with no manager (empty or missing `managerEmails`: older teams, the seeded Educator
  candidates team) is Admin-only, and the Teams page marks it "No manager".
- **Handover:** when `setRoles` takes the Manager role away, the person's email is removed from
  every team's `managerEmails` in the same call. Their teams fall back to Admins until one is named.
- `educator-candidates` stays Admin-only whatever its managers say: adding people to it opens the
  Educator course.

## Access

- Rules: a Manager reads only the teams that list them (`managerEmails array-contains` their
  email; the Manager's Teams page queries exactly that), creates teams that list them, and updates
  a team that lists them without changing `managerEmails`. They may change `config/org.teams`
  (the names list kept in step with `teams/`), as Educators could. Delete stays Admin-only.
- Managers read `users/` (the roster) so they can pick people with the `PeoplePicker`, like
  Educators. Nothing else in the rules opens to them.
- **Progress through a function, not rules.** `teamReport({ teamId })` checks the caller manages
  the team (or is an Admin) and returns, per member: email, name (when signed in) and each
  assignment's course, status, due date and percent. No Quiz scores, no answers. Rules stay simple
  and a Manager never reads profiles or progress beyond their team. Cost: one team read, one
  assignments query per 30 emails, one progress read per started assignment, per visit.

## Assigning

`assignCourses` accepts `teamIds` as well as `emails` (one or the other):

- Admin: either, as today. With `teamIds` the function reads the teams and assigns their
  `memberEmails`.
- Manager: `teamIds` only, every one a team they manage; anything else is `AUTH_2001`. Courses must
  be published, not `staff`-only and not the Educator course.
- An assignment made through a team records `teamId` (the first requested team listing that
  email). Assigning the same course to the same email again stays "already assigned".

`updateAssignment({ assignmentId, dueAt })` and `removeAssignment({ assignmentId })`: an Admin
any assignment, a Manager only one whose `teamId` they manage. A new due date clears
`dueSoonSentAt` and `overdueSentAt`. Both write an audit entry (`assign.update`, `assign.remove`).

`remindLearners` takes an optional `teamId`: a Manager must pass one they manage and reaches only
its members; an Admin may pass one to narrow.

## Deadline email, manager in CC

The daily run (04:00 UTC, still behind `config/org.reminders.enabled`) adds two once-only notices
for every incomplete assignment with a due date whose reminder is not `none`, mandatory or not:

- **Due soon:** the due date is 5 days away or less, and not past. Stamped `dueSoonSentAt`.
- **Overdue:** the due date has passed. Stamped `overdueSentAt`.

Still one email per person per day. When any of a person's assignments owes a notice, that day's
email is the deadline email (due-soon and overdue courses first, other due reminders listed after)
and its **CC** is the current managers of the teams named by those assignments' `teamId`, deduped,
without the learner, at most 10. Managers are read at send time, so a handover applies at once.
An assignment an Admin made to people directly has no `teamId` and CCs nobody. A person already
reminded today gets their notice the next day (still inside the 5 days).

The Gmail message gains a `Cc:` header; the deadline email is in `EMAIL_TEMPLATES` so
`/admin/emails` can send a test.

## Screens

- **Team** area (`/team`, Managers and Admins), in the area switcher:
  - My teams (`/team`): the teams I manage, member counts, Create team (the existing team dialog,
    managers fixed to me).
  - Team report (`/team/:teamId`): members and their assignments with status and due date,
    overdue first; change a due date, remove an assignment, remind.
  - Assign (`/team/assign`): the Assign screen with the Teams audience only, my teams only.
- `/studio/teams`: Admins edit every team and set its Managers (`PeoplePicker`); Educators see the
  list read-only.
- Roles & access: Manager is a third checkbox in Grant a role and a row in the permission matrix.

## Out of scope, for later

- A weekly digest per Manager listing who is behind (would replace many CCs).
- Team-scoped analytics beyond the report.
