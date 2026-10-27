# Working on `firebase/`

| Path                     | Owns                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| `firestore.rules`        | The access gate for every collection                                              |
| `firestore.indexes.json` | Composite indexes, deployed with rules                                            |
| `rules/`                 | Rules tests (`@firebase/rules-unit-testing`) run inside `firebase emulators:exec` |
| `functions/`             | Cloud Functions, 2nd gen, Node 22, ESM, region `asia-south1`                      |

Read `.claude/rules/firestore-rules.md` and `.claude/rules/firebase-cost.md`.

- Tests use the `demo-gurukul` project id, so the emulator never touches the
  real project.
- Functions: `onUserCreated` (profile + claim invites) and the `setRoles` callable. Bootstrap the
  first Kulapati once with `npm run grant-kulapati -- you@nonstopio.com` (admin credential, never CI).
- Functions keep business logic in pure modules (`src/*.ts`) with unit tests;
  the trigger wrapper only wires inputs to them. 100% coverage applies.
- Functions are bundled with esbuild (`npm run build -w @gurukul/functions` → `lib/index.js`, `@gurukul/schema`
  and zod inlined, firebase-* external) and deployed by `deploy.yml` with Hosting and rules.
- `onProgressWritten` computes `percent`/`completedAt`, stats counters and assignment status, and
  issues the certificate (`certificates/{NSG-COURSE-YY-NNNN}`, sequence from `counters/certificates`)
  in one transaction at 100% when `rules.certificate` is on; it never issues twice.
- Pariksha callables: `checkAnswer` (one question, only when `revealAnswers` is `each`, records
  nothing) and `gradeAttempt` (scores against `courses/{id}/private/answers`, enforces the cooldown,
  writes `progress/{id}/attempts/{aid}` and `progress.pariksha[id]` in one transaction). Decisions
  live in `grading.ts`; the answer key never leaves the server. `revokeCertificate` is Kulapati-only
  and writes an `audit` entry. Certificates are publicly `get`-able (verification); `counters/**` is closed.

```bash
npm run test:rules                      # from the repo root, needs Java 21
npm run coverage -w @gurukul/functions
```
