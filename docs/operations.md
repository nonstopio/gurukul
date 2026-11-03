# Setting up an environment

For the maintainer. The deployment itself is described in `.plan/11-deployment-and-cost.md`.

## First sign-in and the first Admin

1. Create the Firebase project (Blaze plan with a budget alert, region `asia-south1`) and enable
   Google sign-in. Put the public web config in `apps/web/.env.local` (see `.env.example`).
2. Deploy from `main` through `deploy.yml`. Never deploy to production from a laptop.
3. Sign in once with your `@nonstopio.com` account so your account exists.
4. Run, once, on your machine with an admin credential:
   `npm run grant-admin -- you@nonstopio.com`, then sign out and in again.
5. Load the two seeded courses (Git, public, and "Becoming a Gurukul Educator", whose completion makes someone
   an Educator: it opens only for the `Educator candidates` team, which the seed adds to the Teams list;
   assign it from the console to let someone take it) into the emulator with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed`,
   or into production with `npm run seed -- --production` (needs `GCLOUD_PROJECT`). It also creates
   `config/org` with the defaults (reminders off) when it is missing; on an existing one it only adds
   the `Educator candidates` team name if missing, and keeps everything else. It creates that team's
   document with no creator, so only Admins edit it. Set teams and reminders in the console.
6. To ship a change to either seeded course (`firebase/seed/src/git-course.ts`,
   `educator-course.ts`) after it is merged, run the same seed again. It publishes the next version of
   each, as Studio's Publish does (a `versions/{n}`
   snapshot), and keeps the course's visibility, its Educators and an archived status. The Studio
   draft is updated only if nobody has edited it since the last seed; the seed prints `kept` when an
   Educator has, and their draft then lacks the change until they fold it in and publish.

## Email

Assignment, reminder and revocation emails go out through the Gmail API as `gurukul@nonstopio.com`
(a service account with domain-wide delegation, impersonating that mailbox; scope `gmail.send`).
Without credentials the functions log `Email skipped` at warn and send nothing, so deploys never
depend on the mailbox. The key is the Secret Manager secret `GMAIL_CREDENTIALS`, declared on each
function that sends email, so **the secret must exist before a deploy**, even as a placeholder:

```bash
firebase functions:secrets:set GMAIL_CREDENTIALS --project nonstop-gurukul   # paste: none
```

`none` (or any value that is not a key) sends nothing. The deploy service account needs the
Secret Manager Admin role so the deploy can grant the functions read access. To turn email on
(maintainer row OPS-25): create the mailbox, grant the service account delegation for the
`gmail.send` scope in the Workspace admin console, run the command above again and paste the key
JSON, then redeploy. Never commit the key. Optional: `MAIL_FROM`, `MAIL_REPLY_TO` (default: the
sender) and `SITE_URL` (default: the production site).

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

## Clean-up of unused media

`weeklyMediaCleanup` runs every Sunday at 05:00 UTC. For each course it reads the draft, the live
course and every version snapshot, and deletes the files in `courses/{courseId}/media/` of the default
bucket that none of them names and that were created more than 30 days ago. A course with a document
that does not parse is skipped and logged (`Media clean-up skipped a course`). If a run would delete
more than 200 files, or more than half of the files of a course with five or more, it deletes nothing
for that run (or course) and logs a warning with counts (`Media clean-up held back ...`): look at the
course before the next run. The summary line `Weekly media clean-up finished` carries `count` (files
deleted) and `durationMs`.

One maintainer action, once: the functions' runtime service account (by default
`<project-number>-compute@developer.gserviceaccount.com`) needs `roles/storage.objectAdmin` on the
default bucket, for example
`gsutil iam ch serviceAccount:<account>:objectAdmin gs://nonstop-gurukul.firebasestorage.app`.
Without it the run fails and logs `Weekly media clean-up failed`; nothing is deleted.

## Running the end-to-end tests

`e2e/` holds Playwright tests of the three journeys (a learner, an Admin, an Educator in Studio
Studio) and an axe accessibility scan of Home, the course page, the Admin overview and the Studio
course list. They drive the real built app against the Firebase emulators (Auth, Firestore,
Functions; project `demo-gurukul`), never production. Needs Node 22 and Java 21.

```bash
npm exec -w e2e -- playwright install --with-deps chromium   # once; the browser is not part of npm ci
npm run e2e
```

`npm run e2e` builds the functions and the app (with `VITE_USE_EMULATORS=true`, into `e2e/dist`),
starts the emulators and `vite preview` on port 4173, seeds the Git course, runs the tests one at a
time, and stops everything. The ports are the ones in `firebase.json`, so stop `npm run emulators`
first. Before each test the emulators are cleared and the seeded course is put back.

- Sign-in goes through the Auth emulator's fake Google popup ("Add new account", email, display
  name). The emulator marks those accounts as verified, so the app's verified-email check passes
  without extra setup. An Admin or Educator is made by setting custom claims on the account and the
  `roles` mirror on `users/{uid}` through the emulators' REST API (`e2e/support/emulators.ts`), the
  same two writes the `setRoles` function makes.
- Set `PW_CHROMIUM_PATH` to use a Chromium you already have instead of the downloaded one. Set
  `E2E_SKIP_BUILD=1` or `E2E_SKIP_FUNCTIONS_BUILD=1` to reuse the last app or functions build while
  writing a test.
- A failed run leaves `e2e/playwright-report/` and `e2e/test-results/` (traces and screenshots);
  open one with `npx playwright show-report e2e/playwright-report`. CI uploads both as the
  `playwright-report` artifact when the `e2e` job fails.
