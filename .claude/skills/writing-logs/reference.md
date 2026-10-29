# Logging reference

## Standard field names

`uid`, `courseId`, `itemId`, `quizId`, `questionId`, `attemptId`, `assignmentId`,
`credentialId`, `emailPrefix`, `count`, `durationMs`, `status`, `source`, `reason`, `code`,
`traceId` — exported as `STANDARD_LOG_FIELDS` from `@gurukul/schema`. One name per concept.

## What the masker does (by field name, case-insensitive glob)

| Matches                                                                                                                                    | At INFO and above | At DEBUG              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | --------------------- |
| `*password*` `*token*` `*secret*` `*apikey*` `*authorization*` `*credential*` `*cookie*` `*privatekey*` `*answerkey*` `*correctoptionids*` | `[REDACTED]`      | `[REDACTED]` (always) |
| `*email*`                                                                                                                                  | `ajay.*****`      | unchanged             |
| `*phone*` `*mobile*`                                                                                                                       | `****3210`        | unchanged             |
| `*firstname*` `*lastname*` `*fullname*` `*displayname*` `*learnername*` `*dob*` `*address*` `*photourl*`                                   | `[REDACTED]`      | unchanged             |

Excluded (never masked): `emailVerified`, `emailPrefix`, `courseName`, `teamName`, `functionName`,
`fileName`. Add a rule or an exclusion in `packages/schema/src/logging.ts` (and a test), never at a
call site. `LOG_MASK_DEBUG=true` masks DEBUG too. `LOG_LEVEL` (default `info`) drops lower levels.

## Where each layer logs

| Layer                    | Logs                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| API wrapper (`src/api/`) | `debug` received; `info` completed; `error` + `Error` + `traceId` on failure |
| Handler / service        | `debug` decisions; `warn` refused rules; throws `ApiException`               |
| Store / integration      | `debug` the call; failures propagate                                         |
| Triggers / schedules     | `info` summary (`count`, `durationMs`); `error` on failure                   |
| Browser (`src/log.ts`)   | `warn` / `error` only; never a payload                                       |

## Reviewing a log statement

1. Is the message a constant? 2. Are the fields standard and lowerCamelCase? 3. Could any field be
   personal or secret? Remove it or use the id. 4. Is it logged exactly once? 5. Is it inside a loop?
