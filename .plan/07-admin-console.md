# 07 · Admin console

Screens: Analytics overview, Learners, Assign courses, Roles & access, Course
analytics, Org settings. Handoff: `design-handoff/02-admin-console.md`.

## Learners

- One table of everyone signed in **plus** pending invites (emails with
  assignments but no account), tabs: All, Signed in, Pending invite, Overdue.
- Filters: search (name/email), team, course, role. Paginated 25 per page.
  Every filter and the tab apply together. With no filter, "All" pages
  through everyone signed in, then the pending invites; any filter narrows to
  a bounded set (a team, a role, a course's assignments, search results) that
  the rest then filter in memory, and the tab counts follow the filters.
  Search waits for a 250 ms pause in typing and starts at two characters (the people field used to pick
  people in Assign, Teams and Roles starts at one letter).
- The Pending invite and Overdue tabs read every unclaimed (`uid == null`) and
  every overdue assignment, not only the newest 500, so their counts and the
  pending list are exact; reads grow with pending and overdue assignments only.
- Bulk actions on selected rows: assign course, send reminder, change role. Change role opens a
  dialog (Learner, Educator, Admin) and calls `setRoles` once per selected person; pending
  invites and your own account (when dropping Admin) are skipped and counted. Choosing Educator
  leaves existing course grants alone; Learner clears them.
- Ticking every row on a page offers "Select all N": everyone the filters and tab match. Filtered
  views already hold them; unfiltered "All" and "Signed in" read the rest of the people by cursor
  (100 per read, one document read per person, once per click). The bulk actions then use that
  list. Role change still calls `setRoles` per person; a batch callable is the follow-up if the
  list grows past a few hundred.
- Row → learner detail drawer (M4): their courses, progress, attempts,
  certificates, and actions (reset a Quiz cooldown, revoke a certificate).

## Assigning courses

`assignCourses({ courseIds, emails, dueAt, mandatory, reminder, notify })`
callable, Admin only:

1. Normalise emails (trim, lower-case, dedupe).
2. Classify each: signed in (has uid), new (no account: pending invite),
   already assigned (skipped), rejected (not `@nonstopio.com` or malformed).
3. Write assignments in batches of 400 (idempotent ids). A batch that fails does not stop the
   others: the failed (course, email) pairs come back in `failed`, only written pairs are counted,
   audited and emailed, and the screen lists the failures with a Retry for just those pairs.
4. If `notify`, send an email per new assignment (see below).
5. Return the classification so the UI shows the summary.

The audience is **teams or people, never both** (a Teams | People switch; changing it asks first when
something is picked). Teams: search, pick several, make a new one on the spot (a name and at least one
member); a picked team counts its listed members plus anyone whose profile lists it in `teamIds`. People: the shared
`PeoplePicker` (focus lists the first ten with photos and how many there are, typing from one letter narrows
by email or any word of the name), emails for people who have not signed in yet (typed, pasted, comma, space or
new line), and a CSV upload (first column of emails, header optional). The summary panel previews the classification **before**
submitting by running the same pure classifier client-side; with several courses it also counts new and
already-assigned people per course.
Courses show twelve to a page with their picture, lesson count and minutes, search covers all of them, and the
step buttons stay pinned to the bottom of the window. The CSV box takes a dropped
file. After assigning exactly one course the console opens Learners filtered to it
(`/admin/learners?course=<id>`).

## Email notifications

Firebase has no built-in email sending. Decided (open question 4): the first option, sender
`gurukul@nonstopio.com`, in `firebase/functions/src/gmail.ts` behind a `Mailer` port; without
credentials it logs a warning and sends nothing. Options considered:

| Option | Cost | Notes |
|---|---|---|
| **Gmail API from a function, as a NonStop service mailbox** (recommended) | Free | Needs a Workspace service account with domain-wide delegation, or an app password; NonStop-branded sender |
| "Trigger Email" Firebase extension + SMTP | Free with an SMTP provider | Extension adds a function; still needs SMTP credentials |
| No email in v1 | Free | Learners see assignments on next sign-in; Slack message by hand |

Reminders: a daily scheduled function (04:00 UTC) sends weekly or before-due reminders
for incomplete mandatory assignments. Capped to one email per person per day: a person
with several courses due gets one email listing them all, and nobody reminded that day,
by the schedule or by an Admin, gets another. The time is fixed in the schedule, not
an org setting; `config/org.reminders` only switches the daily run on or off.

## Teams

`/studio/teams` (Educators and Admins; it sits under Studio) lists the teams with their member counts. **Create team** is one dialog: a name and
members as email chips (paste many, separated by commas, spaces or new lines; each chip is checked and
an invalid one says why; an address that has not signed in yet is marked Invited). A team needs
at least one member (a team is never empty). A row opens the same dialog to edit the name
and members; Delete asks first. Writes go straight to `teams/{id}` and `config/org.teams` in one
transaction under the rules (no callable, no audit entry, as Org settings). A name in
`config/org.teams` with no document shows as a team with no members. Assign courses picks one or more teams
and assigns their members. Data: [02 · Data model](02-data-model.md#teams).

## Org settings

`/admin/settings` edits `config/org` directly (the rules check the shape; no callable, so
no audit entry): the daily reminders switch and the certificate signatory (name and role printed on certificates issued from then on; a certificate keeps the one it was issued with). Teams moved to the Teams page; Save keeps the team names it did not edit. Removing a team
leaves it on the profiles that have it.

## Roles & access

- Role cards with counts (the Learner card counts everyone who has signed in); a permission matrix
  (what each role can do).
- Educators list with their granted courses, and an Admins list; "Grant a role" dialog: person,
  then Educator and Admin as independent checkboxes (a person can hold both), and for Educator
  the courses to edit, drafts and archived ones included.
- All through `setRoles` (see `03-auth-and-roles.md`).

## Audit log

Every Admin action (assign, role change, revoke, publish) writes
`audit/{id}` from the function: who, what, when, target and a `detail` map. Read-only in the
console (M5). The view pages back through the whole history, 50 entries at a time (ordered by
`at`, then document id); people (the doer, and the target of a role change or retake) show as
name or email; a Detail column words `detail` (an `assign` entry records the assigned emails).
