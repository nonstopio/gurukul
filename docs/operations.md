# Setting up an environment

For the maintainer. The deployment itself is described in `.plan/11-deployment-and-cost.md`.

## First sign-in and the first Kulapati

1. Create the Firebase project (Blaze plan with a budget alert, region `asia-south1`) and enable
   Google sign-in. Put the public web config in `apps/web/.env.local` (see `.env.example`).
2. Deploy from `main` through `deploy.yml`. Never deploy to production from a laptop.
3. Sign in once with your `@nonstopio.com` account so your account exists.
4. Run, once, on your machine with an admin credential:
   `npm run grant-kulapati -- you@nonstopio.com`, then sign out and in again.
5. Load the first course into the emulator with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed`,
   or into production with `npm run seed -- --production` (needs `GCLOUD_PROJECT`).

## Email

Assignment and reminder emails are written to a `mail` collection and not sent. Choose a sender
(`.plan/13-open-questions.md`, question 4) and connect it to that collection.

## Backups

`weeklyBackup` runs every Sunday at 02:00 UTC and starts a Firestore export of the default database
to `gs://$BACKUP_BUCKET/backups/YYYY-MM-DD` (the UTC date). It returns once Firestore accepts the
export; the export itself finishes in the background. Without `BACKUP_BUCKET` it logs a warning
(`Backup skipped`, `reason: no bucket configured`) and does nothing.

Set it up once:

1. Create a bucket in the same location as the database, for example
   `gsutil mb -l asia-south1 gs://nonstop-gurukul-backups`. Keep it private.
2. Set the repository variable `BACKUP_BUCKET=nonstop-gurukul-backups` (the bucket name, no `gs://`)
   in GitHub, Settings, Secrets and variables, Actions, Variables. `deploy.yml` writes it to
   `firebase/functions/.env.nonstop-gurukul` (git-ignored) before deploying. It is not a secret.
3. Grant the functions' runtime service account (by default
   `<project-number>-compute@developer.gserviceaccount.com`) two roles: `roles/datastore.importExportAdmin`
   on the project, and `roles/storage.objectAdmin` on the bucket (write access to it).
4. Keep four weeks. The function never deletes; retention is a lifecycle rule on the bucket. Save
   `{"rule":[{"action":{"type":"Delete"},"condition":{"age":28}}]}` as `lifecycle.json` and run
   `gsutil lifecycle set lifecycle.json gs://nonstop-gurukul-backups`.

To restore, import an export into the database (this overwrites documents with the same path, so
try it against a scratch project first):

```bash
gcloud firestore import gs://nonstop-gurukul-backups/backups/2026-11-01 --project=nonstop-gurukul
```

Exports hold real learner records: never download one into this repository. Cost and the
decision: `.plan/11-deployment-and-cost.md`, `.plan/13-open-questions.md` question 12.

## Running the end-to-end tests

`e2e/` holds Playwright tests of the three journeys (a learner, a Kulapati, an Acharya in Vyasa
Studio) and an axe accessibility scan of Home, the course page, the Kulapati overview and the Studio
course list. They drive the real built app against the Firebase emulators (Auth, Firestore,
Functions; project `demo-gurukul`), never production. Needs Node 22 and Java 21.

```bash
npx playwright install --with-deps chromium   # once; the browser is not part of npm ci
npm run e2e
```

`npm run e2e` builds the functions and the app (with `VITE_USE_EMULATORS=true`, into `e2e/dist`),
starts the emulators and `vite preview` on port 4173, seeds the Git course, runs the tests one at a
time, and stops everything. The ports are the ones in `firebase.json`, so stop `npm run emulators`
first. Before each test the emulators are cleared and the seeded course is put back.

- Sign-in goes through the Auth emulator's fake Google popup ("Add new account", email, display
  name). The emulator marks those accounts as verified, so the app's verified-email check passes
  without extra setup. A Kulapati or Acharya is made by setting custom claims on the account and the
  `roles` mirror on `users/{uid}` through the emulators' REST API (`e2e/support/emulators.ts`), the
  same two writes the `setRoles` function makes.
- Set `PW_CHROMIUM_PATH` to use a Chromium you already have instead of the downloaded one. Set
  `E2E_SKIP_BUILD=1` or `E2E_SKIP_FUNCTIONS_BUILD=1` to reuse the last app or functions build while
  writing a test.
- A failed run leaves `e2e/playwright-report/` and `e2e/test-results/` (traces and screenshots);
  open one with `npx playwright show-report e2e/playwright-report`. CI uploads both as the
  `playwright-report` artifact when the `e2e` job fails.

## Turning on email

Assignment and reminder emails are written to the `mail` collection as `{ to, message: { subject, text } }`.
Install the Firebase extension "Trigger Email from Firestore" (collection `mail`, SMTP URI from your
mail provider, kept as an extension secret, never in this repository). The extension sends each
document and records the outcome in a `delivery` field. Until it is installed, nothing is sent and
learners see assignments on their next sign-in.
