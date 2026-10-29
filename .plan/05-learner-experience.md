# 05 · Learner experience

Screens: Sign in, Home, Course overview, Lesson player, Pariksha, Result,
Complete, Certificate. Handoff detail per screen: `design-handoff/01-learner.md`.

## Journey

1. **Sign in** with Google. First sign-in claims any assignments made to the
   email beforehand.
2. **Home** shows a "continue" hero for the most recent in-progress course,
   assigned courses (mandatory first, then by due date), and recent activity.
   A learner with no team (and a teams list in Org settings) is asked to pick
   one, so "whole team" assignments and the team filter reach them.
3. **Course overview** shows description, outcomes, the parva list with
   per-item state, progress ring, due date and the resume button.
4. **Lesson player** renders the lesson's blocks in its layout; the outline
   rail shows where you are. "Mark complete" saves and moves to the next item.
5. **Pariksha** after a parva: one question per screen, answer feedback as
   configured, each answer saved in the browser as it is checked or left
   (with the draw and any verdict shown), so a reload carries on. The server
   records the attempt only at Finish; another device starts afresh.
6. **Result**: score, pass/fail, review with explanations and "Revisit lesson:
   {title}" links; next parva unlocks on pass ("Continue to Parva n"), and a
   cooldown counts down live to Retake. Opened again (reload, bookmark, another
   device) it reads the latest recorded attempt; that review names the
   learner's answers but not the right options, which only `gradeAttempt`
   returns.
7. **Complete**: the last item done → certificate issued → completion screen
   with download, LinkedIn and copy-link actions.

## Progress and resume

- The resume point is `lastItemId`. "Resume" opens it; if that item was
  deleted in a newer version, resume opens the first incomplete item.
- Item states: done, current, available, locked (sequential courses: a parva
  is locked until the previous parva's Pariksha is passed, or all its lessons
  done if it has none).
- Opening a lesson sets `lastItemId`; it is **not** completed until the rule
  in `completeWhen` is met.
- Progress percent is computed by a function and also locally (same pure
  helper from `@gurukul/schema`) so the UI updates instantly.
- Offline: Firestore's local cache keeps the last opened course readable;
  completion writes queue and sync. Parikshas need a connection (they call a function).

## Catalogue

All published courses, with filters for level and "assigned to me". A learner
can start any published course, assigned or not (self-enrolment creates a
progress doc only, no assignment).

## Content rendering

One renderer per block type in `apps/web/src/player/blocks/`. Unknown block
types render a visible "This content needs a newer app version" note.
Markdown is rendered with a safe renderer (no raw HTML); links open in a new
tab with `rel="noopener"`. Embeds only from an allow-list (YouTube, Loom,
Google Drive, CodeSandbox, StackBlitz).

## Edge cases

| Case | Behaviour |
|---|---|
| No assignments yet | Home shows the catalogue with a friendly empty state |
| Course archived after assignment | Shown as "Retired" on Home, the course page and in the player; progress and certificate kept, lessons stay readable. Its Parikshas are closed: the Pariksha screen says so instead of drawing questions, and `checkAnswer`/`gradeAttempt` refuse it with `CRS_1004`, so it can no longer be finished |
| Course gets new lessons after completion | Certificate kept; course shows "New lessons added" on its Home row and page (`completedAt` set and the percent against the current course below 100) |
| Video blocked by network | Fallback link to open the video in a new tab |
| Video must be watched (`video90`, or `rules.requireVideoWatch` and the lesson has a video) | YouTube (IFrame API) and Loom (player.js) count the seconds actually played; "Mark complete" enables at 90%, seeking ahead does not count. Drive has no player API, and a player that has not answered 15 s after loading is treated the same: the learner confirms with "I have watched the video". Watch progress is not saved; reopening the lesson starts again |
| Two tabs open | Progress is a set union, so both tabs' completions survive |
