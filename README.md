# NonStop Gurukul

**The open-source learning platform behind NonStop Academy.**

Gurukul is where NonStopians take courses, clear short checkpoint quizzes
(_Quizzes_) and earn certificates. Admins (_Admins_) assign courses and
follow progress; educators (_Educators_) build courses in _Studio_, right in
the browser.

> Status: early. The repository, design system and CI are in place; features
> are being built milestone by milestone from the plan in [`.plan/`](.plan/README.md).

## What it does

- Sign in with a NonStop io Google account.
- Work through a course chapter by chapter: video, reading and code in each lesson,
  with your place saved.
- Clear a Quiz (5–6 questions) between chapters; earn a verifiable certificate at the end.
- Admins assign courses to people or to emails that have not signed in yet,
  in bulk, and see who has finished what.
- Educators create and update courses from the UI. A course is one document,
  rendered by one generic player.
- Press Ctrl K (⌘K) anywhere to jump to any page you can open.
- A [changelog](https://nonstop-gurukul.web.app/changelog) that says why each change was made.

## Stack

React + Vite + TypeScript, Firebase (Auth, Firestore, Cloud Functions, Hosting),
npm workspaces. 100% test coverage in every workspace, enforced in CI.

```
apps/web/            the app
packages/ui/         design system (tokens + components)
firebase/            rules, indexes, rules tests, Cloud Functions
.plan/               product and engineering plan
docs/                user guides: learner, Admin, Educator, operations
```

## Run it locally

```bash
nvm use            # Node 22
npm ci
npm run dev -w @gurukul/web
npm run check      # lint, format, typecheck, coverage, build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for emulators, rules tests and pull requests.

## Licence

[MIT](LICENSE)
