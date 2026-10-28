# 07 · Kulapati console

Screens: Sanjaya overview, Learners, Assign courses, Roles & access, Course
analytics. Handoff: `design-handoff/02-kulapati-console.md`.

## Learners

- One table of everyone signed in **plus** pending invites (emails with
  assignments but no account), tabs: All, Signed in, Pending invite, Overdue.
- Filters: search (name/email), team, course, role. Paginated 25 per page.
  Every filter and the tab apply together. With no filter, "All" pages
  through everyone signed in, then the pending invites; any filter narrows to
  a bounded set (a team, a role, a course's assignments, search results) that
  the rest then filter in memory, and the tab counts follow the filters.
  Search waits for a 250 ms pause in typing and starts at two characters.
- Bulk actions on selected rows: assign course, send reminder, change role.
- Row → learner detail drawer (M4): their courses, progress, attempts,
  certificates, and actions (reset a Pariksha cooldown, revoke a certificate).

## Assigning courses

`assignCourses({ courseIds, emails, dueAt, mandatory, reminder, notify })`
callable, Kulapati only:

1. Normalise emails (trim, lower-case, dedupe).
2. Classify each: signed in (has uid), new (no account: pending invite),
   already assigned (skipped), rejected (not `@nonstopio.com` or malformed).
3. Write assignments in batches of 400 (idempotent ids).
4. If `notify`, send an email per new assignment (see below).
5. Return the classification so the UI shows the summary.

Inputs supported by the UI: search people, paste emails (comma, space, new
line), CSV upload (first column of emails, header optional), whole team (from
`users.team`). The summary panel previews the classification **before**
submitting by running the same pure classifier client-side.

## Email notifications

Firebase has no built-in email sending. Options, decided in open questions:

| Option | Cost | Notes |
|---|---|---|
| **Gmail API from a function, as a NonStop service mailbox** (recommended) | Free | Needs a Workspace service account with domain-wide delegation, or an app password; NonStop-branded sender |
| "Trigger Email" Firebase extension + SMTP | Free with an SMTP provider | Extension adds a function; still needs SMTP credentials |
| No email in v1 | Free | Learners see assignments on next sign-in; Slack message by hand |

Reminders: a daily scheduled function (04:00 UTC) sends weekly or before-due reminders
for incomplete mandatory assignments. Capped to one email per person per day: a person
with several courses due gets one email listing them all, and nobody reminded that day,
by the schedule or by a Kulapati, gets another. The time is fixed in the schedule, not
an org setting; `config/org.reminders` only switches the daily run on or off.

## Roles & access

- Role cards with counts; a permission matrix (what each role can do).
- Acharyas list with their granted courses; "Grant a role" dialog: person,
  role, and for Acharya the courses.
- All through `setRoles` (see `03-auth-and-roles.md`).

## Audit log

Every Kulapati action (assign, role change, revoke, publish) writes
`audit/{id}` from the function: who, what, when, target. Read-only in the
console (M5).
