---
paths:
  - 'firebase/firestore.rules'
  - 'firebase/rules/**'
  - 'firebase/functions/**'
---

# Firestore security rules

The browser talks to Firestore directly, so `firebase/firestore.rules` is the
real access gate. Hiding a button is never the only protection.

- Default deny. The final `match /{document=**}` stays `allow read, write: if false`.
  Open a collection in its own `match` block, never by widening the fallback.
- Every `allow` gets two tests in `firebase/rules/test/`: one where it allows
  and one where it denies (wrong user, missing claim, signed out, bad shape).
  Run `npm run test:rules` (needs Java 21 for the emulator). It also fails when any rule
  expression was never evaluated, e.g. the right side of an `||` no test reaches: add the test.
- Roles come from custom claims (`request.auth.token.admin`,
  `request.auth.token.educator`) set by the role-grant function. Never trust a
  role field the client wrote to its own document.
- Validate writes: `request.resource.data.keys().hasOnly([...])`, types and
  sizes. A learner may only append to their own progress, never set a score.
- Quiz answer keys (`courses/{id}/private/**`) are never readable by clients.
  Grading happens in Cloud Functions with the Admin SDK.
- Keep reads cheap on the free quota: rules that call `get()` cost a read each.
  Prefer claims over `get()` lookups.
