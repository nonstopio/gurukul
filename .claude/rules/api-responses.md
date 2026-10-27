---
paths:
  - 'firebase/functions/src/**'
  - 'packages/schema/src/api.ts'
  - 'apps/web/src/api/**'
  - 'apps/web/src/**/service.ts'
---

# API responses: one shape, always

Every callable Cloud Function (and any HTTP endpoint) returns the `ApiResponse` envelope from
`@gurukul/schema` — success **and** failure. No other response body exists. Full contract:
`.plan/16-api-contract.md`.

- **Six keys, always:** `timestamp`, `status`, `success`, `message`, `data`, `errors`. Success has
  `data` and `errors: []`; failure has `data: null` and one `ApiError` per problem.
- **Only the wrapper speaks.** Functions export callables through the wrapper in
  `firebase/functions/src/api/`; it alone imports `onCall` / `HttpsError`, builds envelopes and
  throws failures (`details` = the envelope, status code honest). Never return `{ ok: false }`, a bare
  string or an ad-hoc map from a handler.
- **Throw, do not return, failures:** `throw new ApiException('CRS_2001', [courseId])` with a code
  from `ERROR_CODES`. A bare `Error` becomes `GEN_5000`; raw exception text, stacks and secrets
  never reach a response.
- **Stable codes:** `PREFIX_NNNN` (AUTH, VAL, USR, CRS, PRK, CRT, GEN). Reuse one that fits. A new
  code needs the next free number, every field (title, category, status, retryable, `userMessage`,
  `developerMessage`) and a test. `retryable` is true only for 5xx and 429.
- **Honest status:** 4xx for the caller's fault, 5xx for ours. Never 200 on failure.
- **Validation:** parse the request with zod in the handler; one `ApiError` per invalid field, code
  `VAL_100x`, `details.field` set.
- **The browser** calls functions only through `apps/web/src/api/` (returns `data` or throws
  `ApiClientError`). Screens branch on `errors[0].code`, never on message text.
- Firestore rules denials are not APIs; triggers and schedules log and throw, they do not respond.
- Every callable's test asserts the success body and a failure body both parse with
  `apiResponseSchema`.

The `api-response-nudge` hook reminds you when an edit strays; ESLint fails the build on a stray
`onCall`, `HttpsError` or `httpsCallable`.
