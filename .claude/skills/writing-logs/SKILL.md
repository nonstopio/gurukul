---
name: writing-logs
description: Use when adding, changing or reviewing any log statement in Gurukul (Cloud Functions or the web app), when a function catches an error, when the logging nudge hook fires, when a log line would include a value, an email, a name or a payload, or when choosing between debug, info, warn and error.
---

# Writing log statements

## Overview

Every log statement is **a constant event phrase plus a fields object**, written through the one
`log` helper. Fields become queryable JSON in Cloud Logging; masking by field name is automatic; the
rules are lint-enforced. Standard: `.plan/17-logging.md`.

```ts
log.info('Certificate issued', { credentialId, courseId });
log.error('Grading failed', err, { courseId, quizId });
```

## When to Use

Any time you would write `console.*`, `logger.*`, a message with `${}` in it, or a catch block that
"should log something". Functions import `log` from `src/logging`; the browser from `src/log`.

**When NOT to use:** the API wrapper already logs a thrown `ApiException`/error once with the
`traceId` — do not log it again in a service. Triggers and schedules log a summary.

## Quick Reference

| Level   | When                                                         | Carries                                              |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `debug` | Entry, decision branches, payload detail (off when deployed) | ids, counts; payloads allowed here only              |
| `info`  | A completed operation or business event                      | ids, `count`, `durationMs`                           |
| `warn`  | A refused rule, retry, fallback                              | ids, `reason`                                        |
| `error` | An operation failed                                          | the `Error` object, ids, `traceId` (wrapper adds it) |

| Rule          | Form                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| Event phrase  | A constant string. No `${}`, no `+`                                               |
| Fields        | `{ courseId, count }` — standard names, lowerCamelCase (`reference.md`)           |
| Personal data | `uid` and ids, never name, email, phone, date of birth, address at INFO+          |
| Secrets       | Never, at any level: passwords, tokens, API keys, answer keys, correct option ids |
| Payload       | On a `log.debug` beside the INFO/ERROR line, not on it                            |
| Loops         | One summary after the loop, not a line per item                                   |

## Common Mistakes

| Mistake                                              | Instead                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| ``log.info(`Issued ${id}`)``                         | `log.info('Certificate issued', { credentialId: id })`                          |
| `console.log(user)`                                  | `log.debug('User loaded', { uid })`                                             |
| `log.info('Signup', { email, displayName })` at INFO | `log.info('Signup', { uid })` — if a human must recognise it, `{ emailPrefix }` |
| `catch (e) { log.error(...); throw e }` in a service | Let it bubble; the wrapper logs once, with `traceId`                            |
| `log.error('Failed', { message: e.message })`        | `log.error('Failed', e, { courseId })` — pass the `Error`                       |
| `log.info('Request', { body })`                      | `log.debug('Request body', { courseId, body })` and an INFO line with ids       |
| Logging inside `items.forEach`                       | `log.info('Items processed', { count, durationMs })`                            |
| Inventing `order_id`, `OrderID`                      | The standard name: `assignmentId`                                               |

## Red Flags - STOP

- A value interpolated into the message string
- `console.*` or `firebase-functions/logger` outside the logging module
- An email, name, token or answer key in a field at INFO or above
- The same error logged in two layers
- A new field name when a standard one exists

All of these mean: rewrite the statement in the form above before moving on.
