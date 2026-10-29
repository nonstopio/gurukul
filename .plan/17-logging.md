# 17 · Logging

Every log statement follows one form, so logs can be searched, aggregated and shared without leaking
a learner's data. This is a **hard rule**: lint, tests and a Claude hook back it. The day-to-day
form is the `writing-logs` skill and `.claude/rules/logging.md`.

## Principles

1. **Security first.** Never log credentials, answer keys, tokens or learner personal data. Masking
   is automatic (below) but it is a floor, not a licence.
2. **Structured.** A constant event phrase plus a fields object: `log.info('Certificate issued', {
   credentialId, courseId })`. Never a value inside the sentence. Cloud Logging stores the fields as
   queryable JSON.
3. **Log once.** The API wrapper logs a thrown error once, with the `traceId`. Lower layers add
   context by throwing `ApiException`; they do not log and rethrow the same failure.
4. **Production-safe.** INFO is the deployed default and must be safe to read. DEBUG is off in every
   deployed environment, which is why it is the one level that may carry payloads.
5. **Cheap.** Cloud Logging has a free allowance. No per-item logging in loops; log a summary.

## Levels

| Level | Use for | Example |
|---|---|---|
| `debug` | Entry points with key ids, decision branches, payloads you would need to diagnose | `log.debug('Grading started', { courseId, quizId, questionCount })` |
| `info` | Completed operations and business events | `log.info('Certificate issued', { credentialId, courseId })` |
| `warn` | Recoverable or degraded: a refused business rule, a retry, a fallback | `log.warn('Retake refused', { quizId, reason: 'cooldown' })` |
| `error` | An operation failed and someone should look. Always pass the `Error` | `log.error('Grading failed', err, { courseId })` |

## The helper

`firebase/functions/src/logging/` exports `log` — the only way functions log. It writes through
`firebase-functions/logger` (structured), masks fields by name with `maskFields` from
`@gurukul/schema`, adds `traceId` when one is in scope, and drops anything below `LOG_LEVEL`
(default `info`). `apps/web/src/log.ts` has the same shape for the browser: it writes to the
console only (there is no remote telemetry and none is to be added without changing this plan), at
`warn` and above in production builds.

`LOG_LEVEL` is read on every call; an unknown value means `info`. An `Error` is written as
`err: { name, message, stack }` with the message and the stack both swept by `maskLine`. No other
file may call `console.*` or import `firebase-functions/logger` (ESLint enforces it), and a log
call whose first argument is an interpolated template literal or a `+` is a lint error.

## Standard field names

lowerCamelCase, one name per concept: `uid`, `courseId`, `itemId`, `quizId`, `questionId`,
`attemptId`, `assignmentId`, `credentialId`, `emailPrefix`, `count`, `durationMs`, `status`,
`source`, `reason`, `code`, `traceId`. (`STANDARD_LOG_FIELDS` in `packages/schema/src/logging.ts`.)

## What never to log

Passwords, ID tokens, API keys, service-account material, cookies; **Quiz answer keys and
correct option ids**, at any level; a learner's name, email, phone, date of birth, address or photo
URL at INFO and above; full request or response bodies; certificate payloads. Log the learner's
`uid` and the record's id instead.

## Masking

Automatic and keyed on the **field name** (glob, case-insensitive), so a call site has nothing to
remember:

| Kind | Rule | Result |
|---|---|---|
| Credentials, tokens, answer keys (`*password*`, `*token*`, `*secret*`, `*answerkey*`, `*correctoptionids*` …) | **always**, at every level | `[REDACTED]` |
| Email (`*email*`) | INFO and above | `ajay.*****` |
| Phone | INFO and above | `****3210` |
| Names, date of birth, address, photo URL | INFO and above | `[REDACTED]` |

Exclusions beat rules (`emailVerified`, `courseName`, `teamName`, `functionName`, `fileName` carry
no personal data). At `debug` only the `always` rules apply, so a diagnostic payload stays useful
but a credential never prints. `LOG_MASK_DEBUG=true` masks DEBUG like the rest. Free text (an
exception message, a third-party line) is swept with `maskLine`.

**Payloads belong at DEBUG.** When a statement needs the payload, split it: an INFO or ERROR line
with ids only, and a `log.debug` beside it with the detail.

## Layers

| Layer | Logs |
|---|---|
| Callable wrapper | `debug` request received (ids only); `info` completed; on failure once: `warn` for a 4xx, `error` with the `Error` for a 5xx or unknown, always with the `traceId` |
| Handler / service | `debug` entry and decisions; `warn` for a refused business rule; throws `ApiException`, does not log it |
| Store / integration | `debug` the call; a failure propagates |
| Triggers / schedules | `info` summary with counts and `durationMs`; `error` on failure. Both come from `runLogged` in `firebase/functions/src/logging/trigger.ts`, which also gives the run a `traceId` |
| Browser | `warn` / `error` only, via `log`; never a payload |

## Review checklist

- [ ] `log.<level>('Constant event', { fields })` — no interpolation, no concatenation
- [ ] Standard field names, lowerCamelCase
- [ ] Nothing personal or secret at INFO+; payloads on a `debug` line
- [ ] `error` passes the `Error` and happens once, in the wrapper
- [ ] No loop-per-item logging; a summary instead
