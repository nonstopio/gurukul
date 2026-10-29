# 16 · API contract and error handling

One response shape for every API. A client never has to guess what came back, and no API returns
anything else. This is a **hard rule**: it is enforced by lint, by tests and by a Claude hook, not
just written down. The day-to-day form is `.claude/rules/api-responses.md`.

## What counts as an API

Every **callable Cloud Function** (`gradeAttempt`, `assignCourses`, …) and any HTTP endpoint added
later. Firestore reads and writes under security rules are not APIs: rules answer allow or deny, and
the browser maps a denial to a friendly state itself. Firestore triggers and scheduled functions have
no caller to answer, so they log and throw; they never "return a response".

## The envelope

Every API returns, on success **and** on failure, exactly these six keys:

```json
{
  "timestamp": "2026-10-27T10:00:00.000Z",
  "status": 400,
  "success": false,
  "message": "Missing required field",
  "data": null,
  "errors": [
    {
      "code": "VAL_1001",
      "title": "Missing required field",
      "category": "VALIDATION",
      "retryable": false,
      "userMessage": "A required value is missing.",
      "developerMessage": "Field 'courseIds' is missing.",
      "details": { "field": "courseIds" },
      "traceId": "f3b12c90ae1d4d7c"
    }
  ]
}
```

- Success: `success: true`, `status` 200 (201 for a create), `data` holds the result, `errors: []`.
- Failure: `success: false`, a 4xx or 5xx `status` (never 200), `data: null`, one `ApiError` per
  problem. A validation failure lists one error per invalid field.
- The shape lives in **one place**: `packages/schema/src/api.ts` (`ApiResponse`, `ApiError`,
  `apiResponseSchema`, `apiOk`, `apiFail`). Functions and the web app import it; nobody hand-types it.

## Transport: callable functions

Firebase callables carry a failure as an `HttpsError`. The wrapper (`firebase/functions/src/api/`)
throws one whose `details` **is** the envelope, with the matching status code, so the HTTP status is
honest and the body is still the contract:

| `status` | `HttpsError` code | Meaning |
|---|---|---|
| 400 | `invalid-argument` | The caller sent something wrong |
| 401 | `unauthenticated` | Not signed in |
| 403 | `permission-denied` | Signed in, not allowed |
| 404 | `not-found` | Nothing there |
| 409 | `already-exists` | Conflict |
| 429 | `resource-exhausted` | Too many, or too soon (a Quiz cooldown) |
| 500 | `internal` | Our bug |
| 503 | `unavailable` | A dependency is down |

The browser side (`apps/web/src/api/`) calls every function through one helper that returns the
envelope's `data` or throws an `ApiClientError` carrying the `ApiError`s. Screens branch on
`errors[0].code`, never on message text.

## What each callable returns (`data`)

Handlers return the success `data` and nothing else; the wrapper wraps it in the envelope. Every
callable in `firebase/functions/src/index.ts` goes through `apiCallable` (a test counts them).

| Callable | Who | `data` |
|---|---|---|
| `setRoles` | Admin | `{ roles: string[] }` |
| `checkAnswer` | Learner | `{ correct: boolean, correctOptionIds: string[], explanation: string }` |
| `gradeAttempt` | Learner | `AttemptResult`: `{ attemptId, score, correctCount, total, passed, best, results[], nextAttemptAt }` |
| `revokeCertificate` | Admin | `{ id: string, revoked: boolean }` |
| `assignCourses` | Admin | `{ summary: AssignSummary, assigned: number, notified: number, failed: { email, courseId }[] }` |
| `resetCooldown` | Admin | `{ ok: true }` |
| `remindLearners` | Admin | `{ sent: number, skipped: number }` |
| `createCourse` | Educator, Admin | `{ courseId: string }` (`CRS_1002` when the slug is taken) |
| `publishCourse` | Course Educator, Admin | `{ version: number }` (`CRS_1003` with `details: { issues: PublishIssue[] }` when the draft has problems) |
| `rollbackCourse` | Course Educator, Admin | `{ version: number }`, the new version (`CRS_2002` for an unknown snapshot) |
| `archiveCourse` | Admin | `{ status: 'published' \| 'archived' }` |

A cooldown refusal (`PRK_4001`) carries `details: { nextAttemptAt: <epoch ms> }` and the ISO time as
its developer-message parameter.

## Error codes

`PREFIX_NNNN`, defined once in `ERROR_CODES` (`packages/schema/src/api.ts`). Prefixes: `AUTH`
(sign-in and permission), `VAL` (validation), `USR` (people and roles), `CRS` (courses), `PRK`
(Quizzes), `CRT` (certificates), `GEN` (system). `retryable` is true only for transient or system
problems (5xx, 429). Each entry has a title, category, status, a friendly `userMessage` and a
`developerMessage` template (`%s` placeholders). Tests assert every entry is complete and that no
user message carries a placeholder.

**Adding a code:** reuse one that fits; else pick the next free number in its prefix, fill every
field, add a test that raises it, and add the handler mapping if it is a new exception type.

## Flow

Service throws `ApiException(code, params, details)` → the wrapper catches → builds the envelope →
logs the failure once (`warn` for a 4xx, `error` with the original `Error` for a 5xx or unknown
error, both with the `traceId`) → throws the `HttpsError` whose `details` is the envelope. Success
returns `apiOk(data)`. An exception that is not an `ApiException` becomes `GEN_5000` with a generic
message: raw exception text, stack traces and secrets never reach the response. A zod error (from
parsing a request) becomes one `VAL_1001` (value absent) or `VAL_1002` per invalid field, with
`details.field`. Hand-written request checks throw the same codes through `src/validation.ts`
(`missing`, `invalid`, `badField`, `badCount`).

## Layers

| Layer | Responsibility |
|---|---|
| Callable wrapper (`api/`) | The only place that calls `onCall`, builds envelopes, throws `HttpsError`, logs thrown errors |
| Handler | Validate the request (zod), call the service, return the data |
| Domain / service | Business rules; throw `ApiException` with a catalog code |
| Store / integration | Propagate failures; add context; never swallow, never invent a response |

## Do / don't

| Do | Don't |
|---|---|
| Throw `ApiException` and let the wrapper shape the response | Return `{ ok: false }` or any ad-hoc object |
| Use a catalog code | Put raw exception text in a response |
| 4xx for the caller's fault, 5xx for ours | Return 200 on failure |
| Include the `traceId` (the wrapper does it) | Add a second place that builds an envelope |

## Enforcement

- ESLint: `onCall`, `onRequest` and `HttpsError` may be imported only inside
  `firebase/functions/src/api/`; `httpsCallable` only inside `apps/web/src/api/`.
- Tests: `packages/schema/test/api.test.ts` validates the catalog and the envelope; every callable
  has a test that the success and failure bodies parse with `apiResponseSchema`.
- Hook: `api-response-nudge` reminds an editor the moment a function or a service call strays.
