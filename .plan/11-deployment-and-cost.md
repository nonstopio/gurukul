# 11 · Deployment and cost

## Environments

| Env | Project | How |
|---|---|---|
| Local | `demo-gurukul` (emulators only, no real project) | `npm run emulators` |
| PR preview | `nonstop-gurukul`, Hosting preview channel (7-day expiry) | `preview.yml` on same-repo PRs (not forks, not Dependabot; not PRs that only touch `.plan/`, `docs/` or `*.md`); `preview-cleanup.yml` deletes the channel when the PR closes, because the site has a channel limit; uses **production** Firestore |
| Production | `nonstop-gurukul` | `deploy.yml`, after CI passes on `main`; pushes a `release-*` tag |

Previews share production data, so a preview can never change rules or
functions — it only deploys static Hosting files. If that becomes a problem, a
second project `nonstop-gurukul-staging` is the fix (also free).

## Plan: Blaze with a budget alert

Spark cannot run Cloud Functions, which grading, invites, certificates and
roles depend on. Blaze keeps the same free quotas and bills only above them.

| Service | Free quota | Expected at 200 users |
|---|---|---|
| Firestore reads | 50,000 / day | ~2,000–8,000 / day |
| Firestore writes | 20,000 / day | ~500–2,000 / day |
| Firestore storage | 1 GiB | < 50 MB |
| Functions invocations | 2,000,000 / month | < 50,000 / month |
| Hosting storage / transfer | 10 GB / 360 MB per day | < 20 MB / ~150 MB per day |
| Cloud Storage (planned course media, US bucket) | 5 GB stored, 100 GB egress / month | ~200 MB stored, < 10 GB / month |
| Auth (Google) | free | free |

Note: Functions deploys also use Cloud Build and Artifact Registry; their free
tiers cover this volume only if stale container images are deleted. The `gcf-artifacts`
repository keeps only the newest image of each function package (`firebase/artifact-cleanup-policy.json`):
Artifact Registry deletes the rest about once a day, and anything under an hour old is never
deleted mid-deploy. There is no rollback to an older image; a fix is redeployed instead. Deploys
leave the policy alone, because the Firebase CLI only sets one on a repository that has none.
It is step 9 of the first-time setup checklist below.

**Backups.** `weeklyBackup` exports Firestore every Sunday 02:00 UTC to the Cloud Storage bucket
named in `BACKUP_BUCKET`, under `backups/YYYY-MM-DD`; a bucket lifecycle rule deletes objects after
28 days, so at most four exports exist. At under 50 MB of data that is a few hundred MB of storage at
most, well under $0.10/month (the Firestore export itself reads each document once per week). IAM:
the functions' service account needs `roles/datastore.importExportAdmin` and write access to the
bucket (`roles/storage.objectAdmin`). Setup and restore: `docs/operations.md`.

**Media clean-up.** `weeklyMediaCleanup` (Sunday 05:00 UTC, one run a week) deletes lesson media that
no draft, live course or version names and that is over 30 days old (`.plan/19`). IAM: the functions'
service account needs `roles/storage.objectAdmin` on the default bucket, a one-time maintainer action
(`docs/operations.md`, "Clean-up of unused media").

**Guards:** a $1 monthly budget with alerts at 50%, 90% and 100% to the
maintainers; `maxInstances` on every function; no unbounded listeners (see
`.claude/rules/firebase-cost.md`).

## Performance Monitoring

The web app starts Firebase Performance Monitoring in the production build only (`deploy.yml` sets
`VITE_PERFORMANCE_MONITORING=true`; previews, Lighthouse, emulators and local runs stay off): page load, network request and Web Vitals timings, in the Firebase console. It collects
no personal data and is free. Its SDK is its own chunk, fetched after the app mounts, so the initial
bundle budget is untouched. Nothing else to configure: it uses the web app's existing Firebase config.

## Region

Firestore location and Functions region: **asia-south1 (Mumbai)**, closest to
Pune. The Firestore location cannot be changed after the database is created —
confirm before creating it (open question).

## Secrets

| Secret | Where | Used by |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_NONSTOP_GURUKUL` | `production` environment secret; environment limited to `main` | `deploy.yml` |
| `FIREBASE_SERVICE_ACCOUNT_PREVIEW` | Repository secret; service account with Firebase Hosting Admin **only** | `preview.yml`, `preview-cleanup.yml` |
| `GMAIL_CREDENTIALS` (Gmail sender key) | Cloud Secret Manager via `defineSecret`, declared on each function that sends email; set once with `firebase functions:secrets:set` (a placeholder sends nothing, but the secret must exist or the deploy fails) | functions |

The public web config goes in GitHub Actions **variables** (`VITE_FIREBASE_*`)
and `apps/web/.env.local`.

## Site address

The public address in links is configuration, not code: the repository variable `SITE_URL` (for
example `https://gurukul.nonstopio.com`) is passed to the web build as `VITE_SITE_URL` (certificate
verify links) and written to the functions' `.env` (emailed course links). Unset, web links use the
address the app is open on and emails use `https://nonstop-gurukul.web.app`. DNS and the Hosting
custom domain are `OPS-24`.

## Search engines and link previews

Gurukul is for NonStop io people, so it is not built to rank. Search engines only need to find the
front door, and links shared in Slack or mail should preview with a name, a line and the logo.

- `apps/web/public/robots.txt` lets crawlers fetch `/`, `/privacy`, `/verify/…` (those pages say
  `noindex`) and the files they need to render; every signed-in path is disallowed, since a crawler
  sees only the sign-in screen there. No sitemap: two public pages need none.
- `index.html` carries Open Graph and Twitter card tags. The preview image needs an absolute
  address, so the build adds it from `VITE_SITE_URL` (`apps/web/src/seo/shareImage.ts`); with no
  address set, previews show the title and description only, and an address that is not http(s)
  stops the build. There is no `og:url`: every path serves the same `index.html`, so it would
  point every shared link at the home page.
- `apps/web/test/robots.test.ts` reads `robots.txt` the way Google does and checks it against
  every route: crawlable exactly when the page opens signed out (`PUBLIC` in `routes.tsx`, and `/`).
  Lighthouse CI fails the sign-in page below 0.9 for SEO.
- Not done, because a single-page app on Hosting cannot without server rendering: per-page titles
  in previews, per-page canonical links, and a real 404 status for unknown paths.

## First-time setup checklist (maintainer)

1. Upgrade `nonstop-gurukul` to Blaze; create the $1 budget and alerts.
2. Create Firestore in `asia-south1`, production mode.
3. Enable Auth → Google provider; add the Hosting domain to authorised domains.
4. Register a Web app; copy its config into GitHub variables. Set
   `VITE_FIREBASE_AUTH_DOMAIN` to the Hosting domain (`nonstop-gurukul.web.app`),
   not `nonstop-gurukul.firebaseapp.com`, and add
   `https://nonstop-gurukul.web.app/__/auth/handler` to the Google OAuth client's
   authorised redirect URIs (Google Cloud console → Credentials). iPhones and
   iPads sign in by redirect, and Safari drops a redirect whose handler lives on
   another domain. Preview channels keep the production auth domain, so on iOS
   sign-in is tested on production, not on previews.
5. Create the production deploy service account (Hosting Admin, Rules Admin,
   Datastore Index Admin; from M2 also Cloud Functions Admin, Secret Manager Admin, Service Account
   User, Artifact Registry Writer; from course media uploads also Cloud Storage for Firebase
   Admin on the project and `roles/storage.legacyBucketReader` on the default bucket: the Storage
   rules deploy reads the bucket, and without bucket access the CLI reports "Firebase Storage has
   not been set up" even though it exists). Create a GitHub environment `production`
   limited to the `main` branch and store the key there as
   `FIREBASE_SERVICE_ACCOUNT_NONSTOP_GURUKUL`.
6. Create a second service account with Firebase Hosting Admin only, and store
   its key as the repository secret `FIREBASE_SERVICE_ACCOUNT_PREVIEW`.
7. Protect `main`: require the `ci` and `pr-title` checks (see `10-testing-and-ci.md`).
8. Run the Admin bootstrap script for the first admin.
9. After the first functions deploy, set the cleanup policy for stale function images
   (a one-off command, not a deploy; do not use `firebase functions:artifacts:setpolicy`, which
   replaces it with a keep-one-day rule):
   `gcloud artifacts repositories set-cleanup-policies gcf-artifacts --location asia-south1 --project nonstop-gurukul --policy firebase/artifact-cleanup-policy.json --no-dry-run`
10. Before course media uploads ship (`MED-01`): create the default Cloud Storage for Firebase
    bucket in `US-CENTRAL1` (open question 14, decided: the no-cost
    tier), and grant the Firebase Rules Firestore Service Agent role when the console asks, so
    `storage.rules` can read `courses/` and `config/org`. See `19-course-media-uploads.md` (Cost).
11. Before `weeklyMediaCleanup` (`MED-10`) first runs: grant the functions' runtime service account
    `roles/storage.objectAdmin` on the default bucket (`docs/operations.md`, "Clean-up of unused media").
