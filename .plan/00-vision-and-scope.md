# 00 · Vision and scope

## The problem

NonStop io (about 130 people, growing toward 200) has no single place to run
internal learning. Courses live in slide decks and recordings, nobody can see
who finished what, and new joiners get onboarding material by forwarded link.

## The product

A small, focused learning platform that works the way Anthropic Academy on
Skilljar does — a course is a sequence of lessons with short checks and a
certificate at the end — built for NonStop and open-sourced.

| Who | Can |
|---|---|
| **Shishya** (every NonStopian) | Sign in with Google, see assigned courses, learn lesson by lesson, resume where they left off, clear Parikshas, earn and share certificates |
| **Acharya** (educator) | Create and edit the courses a Kulapati grants them, entirely in the browser: parvas, lessons, content blocks, Parikshas; publish new versions; see their courses' analytics |
| **Kulapati** (admin) | Everything an Acharya can, on every course; assign courses to people or to emails not yet signed in, in bulk; grant roles; see organisation analytics |

## Principles

1. **One course, one document.** A course is a single Firestore object; one
   generic player renders any course. No course-specific code.
2. **Assign before arrival.** Assignments are keyed by email so a new joiner's
   courses are waiting at first sign-in.
3. **Trustworthy certificates.** Grading happens on the server; certificates
   are issued by a function and verifiable by a public link.
4. **Free to run.** Sized for ~200 users inside Firebase's free quotas on the
   Blaze plan with a budget alert.
5. **Quality from day one.** 100% test coverage, tested security rules, a
   design system, CI on every PR.
6. **Open source.** MIT; no secrets or learner data in the repository.

## In scope for v1

- Google sign-in restricted to `@nonstopio.com`.
- Learner: home, catalogue, course overview, lesson player (video, markdown,
  code, callout, image, embed, file blocks), progress and resume, Parikshas,
  results, completion, certificate (view, PDF download, verification page,
  LinkedIn add link).
- Kulapati console: overview analytics, learners table, bulk assignment
  (pick people, paste emails, CSV, whole team), due dates, reminders by email,
  roles and course grants, per-course analytics.
- Vyasa Studio: course list, structure editor (drag reorder), lesson block
  editor with three layouts, Pariksha builder, drafts and versioned publishing,
  preview as learner.
- First course: **Git, the NonStop Way** (see `14-first-course-git.md`).

## Out of scope for v1 (candidates later)

| Idea | Why later |
|---|---|
| "AVB" (mentioned in the brief, meaning unclear) | Needs definition — see open questions |
| Arjuna leaderboard | Competition is a product decision, not a default |
| Sarathi AI mentor | Needs Claude API budget and a policy decision |
| Video upload / hosting | Needs Cloud Storage; YouTube unlisted / Drive links cover v1 |
| Learning paths (course sequences) | Assignments of several courses cover v1 |
| Discussion / comments on lessons | Moderation burden; Slack exists |
| Mobile apps | The web app is responsive |
| Non-NonStop learners (public courses) | Domain lock is a v1 security assumption |

## Success after the first quarter

- Every new joiner is assigned Git on day one and finishes it within 30 days.
- Kulapatis stop tracking training in spreadsheets.
- At least two courses besides Git authored by Acharyas without engineering help.
- Firebase bill: $0.
