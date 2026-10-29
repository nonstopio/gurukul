---
paths:
  - 'firebase/functions/src/**'
  - 'apps/web/src/**'
  - 'packages/schema/src/logging.ts'
---

# Logging

Use the `writing-logs` skill whenever you add or change a log statement. Full standard:
`.plan/17-logging.md`.

- **Structured only:** `log.<level>('Constant event phrase', { fieldA, fieldB })`. Never put a value
  in the sentence (no template literals with `${}`, no `+` concatenation) — ESLint rejects it.
- **One logger:** functions log through `log` in `firebase/functions/src/logging/`, the browser
  through `apps/web/src/log.ts`. No `console.*`, no direct `firebase-functions/logger`.
- **Levels:** `debug` entry points, decisions and payloads (off in deployed environments); `info`
  completed operations; `warn` refused rules, retries, fallbacks; `error` a failure, always with the
  `Error` object, and **once** — the API wrapper logs thrown errors, lower layers throw instead.
- **Standard field names**, lowerCamelCase: `uid`, `courseId`, `itemId`, `quizId`, `questionId`,
  `attemptId`, `assignmentId`, `credentialId`, `emailPrefix`, `count`, `durationMs`, `status`,
  `source`, `reason`, `code`, `traceId`.
- **Never log** passwords, tokens, API keys or service-account material at any level; **Quiz
  answer keys or correct option ids** at any level; a learner's name, email, phone, date of birth or
  address at INFO and above — log `uid` and ids instead. Full request or response bodies and whole
  DTOs go on a `log.debug` beside the INFO/ERROR line, never on it.
- **Masking is automatic** by field name (`maskFields`), but it is a floor: a payload is not fit for
  INFO because the masker will trim parts of it.
- **Cheap:** no per-item logging in loops; log a summary with `count` and `durationMs`.

The `logging-nudge` hook flags console calls, interpolated messages and sensitive field names the
moment you write them.
