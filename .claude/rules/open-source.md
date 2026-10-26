# Open-source hygiene

This repository is public. Before every commit:

- No secrets: no `.env`, service-account JSON, API keys beyond the public
  Firebase web config, or tokens in code, tests, fixtures or screenshots.
- No real people: test data uses invented names and `@example.com` or clearly
  fictional `@nonstopio.com` addresses. Never commit emulator exports or
  Firestore backups; they hold real learner records.
- The public Firebase web config (`apiKey`, `authDomain`, `projectId`, ...) is
  not a secret, but it is configuration: it comes from `VITE_FIREBASE_*`
  environment variables, documented in `apps/web/.env.example`.
- Internal NonStop process (salaries, reviews, client names) does not belong in
  course content, issues or the plan.
- Licence is MIT. New dependencies must be compatible (MIT, Apache-2.0, BSD,
  ISC). Check before adding one.
