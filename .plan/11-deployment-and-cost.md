# 11 · Deployment and cost

## Environments

| Env | Project | How |
|---|---|---|
| Local | `demo-gurukul` (emulators only, no real project) | `npm run emulators` |
| PR preview | `nonstop-gurukul`, Hosting preview channel (7-day expiry) | `preview.yml` on same-repo PRs (not forks, not Dependabot); uses **production** Firestore |
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
| Auth (Google) | free | free |

Note: Functions deploys also use Cloud Build and Artifact Registry; their free
tiers cover this volume, but stale container images should be cleaned up
(`firebase functions:artifacts:setpolicy` after first deploy).

**Guards:** a $1 monthly budget with alerts at 50%, 90% and 100% to the
maintainers; `maxInstances` on every function; no unbounded listeners (see
`.claude/rules/firebase-cost.md`).

## Region

Firestore location and Functions region: **asia-south1 (Mumbai)**, closest to
Pune. The Firestore location cannot be changed after the database is created —
confirm before creating it (open question).

## Secrets

| Secret | Where | Used by |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_NONSTOP_GURUKUL` | `production` environment secret; environment limited to `main` | `deploy.yml` |
| `FIREBASE_SERVICE_ACCOUNT_PREVIEW` | Repository secret; service account with Firebase Hosting Admin **only** | `preview.yml` |
| Email sender credentials (if chosen) | Cloud Secret Manager via `defineSecret` | functions |

The public web config goes in GitHub Actions **variables** (`VITE_FIREBASE_*`)
and `apps/web/.env.local`.

## First-time setup checklist (maintainer)

1. Upgrade `nonstop-gurukul` to Blaze; create the $1 budget and alerts.
2. Create Firestore in `asia-south1`, production mode.
3. Enable Auth → Google provider; add the Hosting domain to authorised domains.
4. Register a Web app; copy its config into GitHub variables.
5. Create the production deploy service account (Hosting Admin, Rules Admin,
   Datastore Index Admin; from M2 also Cloud Functions Admin, Service Account
   User, Artifact Registry Writer). Create a GitHub environment `production`
   limited to the `main` branch and store the key there as
   `FIREBASE_SERVICE_ACCOUNT_NONSTOP_GURUKUL`.
6. Create a second service account with Firebase Hosting Admin only, and store
   its key as the repository secret `FIREBASE_SERVICE_ACCOUNT_PREVIEW`.
7. Protect `main`: require the `ci` and `pr-title` checks (see `10-testing-and-ci.md`).
8. Run the Kulapati bootstrap script for the first admin.
