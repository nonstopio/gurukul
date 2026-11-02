---
paths:
  - 'firebase/firestore.rules'
  - 'firebase/storage.rules'
  - 'firebase/rules/**'
  - 'firebase/functions/**'
---

# Firestore and Storage security rules

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

## Storage rules (`firebase/storage.rules`)

Cloud Storage holds Educator-uploaded lesson media (`.plan/19-course-media-uploads.md`) and has its own
gate, the same discipline as above.

- Default deny; only `courses/{courseId}/media/{fileName}` opens. Reads need `signedIn()` (a copy of the
  Firestore function: keep the two identical). A file is created once and never updated, overwritten or
  deleted by a client.
- A create reads the course and `config/org` once each (`firestore.get`), so it costs two Firestore reads per
  upload. Reads cost none. Limits, types and the 1 MB ceiling mirror `uploadPolicy` in `packages/schema/src/upload.ts`;
  change one, change the other.
- Tests are `firebase/rules/test/storage.test.ts`, driven by the case table in `test/storage/cases.ts`: add a case
  (allowed and denied) for every new condition. The Storage emulator reports no rule coverage, so
  `test/storage-coverage.test.ts` forces each condition in the file to the wrong answer in turn and
  `scripts/check-rules-coverage.mjs --mutants` fails `npm run test:rules` when no case notices. A condition that
  provably changes nothing is listed with its reason in `test/storage/mutants.ts`; do not add to that list to
  get past a failure, add a case.
