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
| **Learner** (every NonStopian) | Sign in with Google, see assigned courses, learn lesson by lesson, resume where they left off, clear Quizzes, earn and share certificates |
| **Educator** | Create and edit the courses an Admin grants them, entirely in the browser: chapters, lessons, content blocks, Quizzes; publish new versions; see their courses' analytics |
| **Admin** | Everything an Educator can, on every course; assign courses to people or to emails not yet signed in, in bulk; grant roles; see organisation analytics |

## Names: two label sets

The code, the data, the routes and the role claims use one plain vocabulary: Learner, Educator,
Admin, Chapter, Quiz, Studio, Analytics. What a person *reads* comes from a **label set** they
pick on their first sign-in and can switch from the sidebar at any time:

| Generic (code and the `generic` set) | `gurukul` set | Meaning |
|---|---|---|
| Learner | Shishya | Everyone signed in |
| Educator | Acharya | Builds the courses they are granted |
| Admin | Kulapati | Runs the platform: assigns, grants roles, sees every report |
| Chapter | Parva | A part of a course |
| Quiz | Pariksha | The checkpoint at the end of a chapter |
| Studio | Vyasa Studio | Where courses are built |
| Analytics | Sanjaya | The Admin's overview of the organisation |

The choice lives on the profile (`users/{uid}.labels`); until it is made, every page waits on
the choice screen. The Gurukul names live in one file, `apps/web/src/labels/terms.ts`, so the
project can be adopted without them. Text written by the server (emails, API messages) and the
changelog's history use the generic names. "Gurukul" stays the product's name in both sets.

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
  code, callout, image, embed, file blocks), progress and resume, Quizzes,
  results, completion, certificate (view, PDF download, verification page,
  LinkedIn add link).
- Admin console: overview analytics, learners table, bulk assignment
  (pick people, paste emails, CSV, whole team), due dates, reminders by email,
  roles and course grants, per-course analytics.
- Studio: course list, structure editor (drag reorder), lesson block
  editor with three layouts, Quiz builder, drafts and versioned publishing,
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
- Admins stop tracking training in spreadsheets.
- At least two courses besides Git authored by Educators without engineering help.
- Firebase bill: $0.
