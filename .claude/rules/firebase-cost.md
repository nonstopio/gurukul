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
- No Cloud Storage: videos are hosted links, certificates render client-side.
  Adding Storage needs a plan update first.
- Never deploy from a laptop to production; `deploy.yml` on `main` does it.
