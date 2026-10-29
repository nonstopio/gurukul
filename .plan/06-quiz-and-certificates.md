# 06 · Quizzes and certificates

## Quiz rules

- 5–6 questions per Quiz by default (`questionsShown`), drawn at random
  from the pool when the pool is larger.
- Question kinds: single choice, multiple choice, true/false, code output.
- Pass mark: course default 70%, overridable per Quiz.
- Retakes allowed after a cooldown (default 10 minutes). The best score counts.
- `revealAnswers`: after each answer (default, matches the design), only after
  passing, or never.

## Grading (server side)

`gradeAttempt({ courseId, quizId, answers })`, a callable function:

1. Verify the caller is signed in with a NonStop email.
2. Load the published course and `private/answers`; reject unknown ids.
3. Enforce the cooldown from `progress.quiz[quizId].lastAttemptAt`.
4. Score; write `attempts/{id}` and update `progress.quiz[quizId]`
   (`best`, `passed`, `attempts`, `lastAttemptAt`) in one transaction.
5. Return per-question correctness and, if allowed, the correct option and
   explanation.

The "answer per question" feedback in the design is a call per question:
`checkAnswer` returns correct/incorrect for one question without recording an
attempt; `gradeAttempt` records the final attempt. Both read the private key
server-side, so the key never reaches the browser. Both also refuse a Quiz
that is still locked for the learner (`PRK_1003`), by the same item states the
outline shows (`05-learner-experience.md`), so the lock holds outside the app.

## Certificates

- Issued by the progress trigger when every lesson is done and every Quiz
  passed, if `rules.certificate` is on.
- Credential id: `NSG-{COURSECODE}-{YY}-{sequence}` (sequence from a counter doc in a transaction).
- `/certificates/{id}` is public; `/verify/{id}` shows name, course, date and
  status (valid or revoked), with no email.
- The certificate page renders the A4 design in HTML; "Download PDF" uses the
  browser print pipeline with a print stylesheet (`@page { size: A4 landscape }`).
  No server rendering, no Storage.
- "Add to LinkedIn" uses LinkedIn's add-certification URL with the
  organisation name, credential id and verification URL.
- Admins can revoke a certificate (it stays on the verify page as revoked). A new revocation
  emails the learner the course name and `gurukul@nonstopio.com` as the contact; a restore, or a
  repeat revoke, sends nothing, and a failed send never undoes the revocation.

## Open questions

- ~~Who signs certificates~~ Resolved: the name and role are a setting in the Admin console (`GIT-05`).
- ~~Should a revoked certificate's learner be notified?~~ Resolved: yes, by email through the `KUL-24` sender (`PRK-10`).
