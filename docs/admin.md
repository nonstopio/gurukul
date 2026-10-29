# Admin guide

An Admin is an administrator. You see an extra **Admin** group in the sidebar.

## Overview

Shows active learners (last 30 days), assignments completed, overdue assignments, pending invites,
a weekly chart of lessons completed and a funnel per course. Select a course to see where learners
stop and which questions people get wrong first time. The figures come from counters the server keeps
up to date, so the page is quick however many people there are.

## Assigning courses

1. **Courses**: tick one or more published courses.
2. **People**: paste emails (commas, spaces or new lines), upload a CSV (emails in the first column),
   search for people, or add a whole team. Each address becomes a chip that says whether the person
   has **signed in**, is **new** (a pending invite), **already has** the course, or was **rejected**
   (not an `@nonstopio.com` address).
3. **Deadline**: an optional due date, a reminder schedule, and whether it is mandatory.

The summary on the right shows exactly what will happen before you press **Assign**. People who have
not signed in yet are invited: the course appears the first time they sign in. Assigning twice is
harmless; already-assigned people are skipped.

> Emails are queued but not sent yet. Sending needs a decision on the mail service (see
> `.plan/13-open-questions.md`, question 4).

## Learners

Everyone who has signed in, plus pending invites, in tabs: All, Signed in, Pending invite, Overdue.
Filter by name or email, team, course or role. Select people for bulk actions: assign a course, send a
reminder (at most one a day per person), change role. Select a row to open its drawer: courses and
progress, **Reset cooldown** for a Quiz a learner is waiting to retake, and **Revoke** or
**Restore** a certificate (a revoked certificate stays on its verify page, marked revoked).

## Roles & access

- **Learner**: everyone who signs in.
- **Educator**: builds the courses they are granted.
- **Admin** (administrator): everything above, plus assigning and roles.

Use **Grant a role** to find someone by email, choose a role, and for an Educator tick the courses they
may edit. You cannot remove your own Admin role; ask another Admin. A role change reaches the
person the next time their session refreshes.
