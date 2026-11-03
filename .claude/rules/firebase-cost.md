---
paths:
  - 'firebase/**'
  - 'apps/web/src/**'
  - 'firebase.json'
---

# Stay inside the free quota

Gurukul runs on the Blaze plan with a budget alert, sized for about 200 users,
and should cost nothing. Free quotas (Firestore: 50k reads, 20k writes per day;
Functions: 2M invocations per month) are generous at that size, but a single bad
query pattern can burn through them.

- No unbounded listeners. A list screen paginates (`limit()`), and a dashboard
  reads aggregate documents maintained by functions, not every progress doc.
- Use `getCountFromServer()` / aggregation queries for counts.
- Functions are 2nd gen, `region: asia-south1`, `minInstances: 0`, `maxInstances`
  set low. No scheduled function more often than daily without a reason in the PR.
- Cloud Storage only for what `.plan/19-course-media-uploads.md` describes: Studio uploads of
  small images and PDFs, size-capped in `storage.rules`, served by download URL (no Firestore read
  per view). Videos stay hosted links, certificates render client-side. Any other use of Storage
  needs a plan update first.
- Never deploy from a laptop to production; `deploy.yml` on `main` does it.

## Writes from the browser: once per action, never in a loop

On 2026-11-03 a loop cost about 5,000 writes an hour from 3–5 people, with 100% coverage and green
e2e: a lesson page rewrote the resume point whenever the progress document disagreed with it (two
tabs answered each other every second). The review that found it found a second: a refused course
start was retried every time the rolled-back snapshot came in. Unit tests fake Firestore, so
neither showed up.

- A Firestore write inside an effect or a snapshot callback runs once per user action or page
  opened, behind a ref (`startSent`, `placed` in `LessonPage.tsx`). Never write because the data you
  watch differs from what you would write: another tab or device answers, and the two loop.
- A write the rules refuse is logged, not retried by the effect that sent it. A refused local write
  rolls back and fires the listener again; an effect keyed on that data must not resend.
- A trigger returns before reading anything when the fields it derives from did not change
  (`handleProgressWrite`). Every client write wakes it.
- `e2e/tests/write-budget.spec.ts` counts writes while a page sits idle and across two tabs. A new
  page that writes progress or profile data adds a case there.
