# 19 · Product analytics (Google Analytics 4)

Decided by the maintainer on 2026-11-01. This is a deliberate exception to "no remote telemetry"
in `17-logging.md`: that sentence is about **logs**, which stay in the person's own console. Usage
analytics is separate, goes to Google Analytics 4 through Firebase, and exists to learn how people
use the platform, learning modules above all. Admin counters (`09-analytics.md`) are unchanged.

## What is sent

Page views and a small catalog of typed events (`apps/web/src/analytics/events.ts`): sign-in and
sign-out, course start and completion, lesson completion, Quiz submission (pass or fail and the
score), certificate view and download, Studio course create and publish, Admin assignment, global
search (the length of the query and the count of results, never the words), primary links and
navigation, and caught errors (a code, never a message).

Every event carries `app_version`, `environment`, `platform` and `user_role`. The person is
identified by their opaque Firebase uid and one user property, `role`. Never an email, a name,
free text, Quiz answers or a Quiz question. A runtime guard drops any parameter that looks like an
email or a phone number.

## Consent

- Consent starts **denied** and Consent Mode v2 advertising signals stay denied always.
- Signing in requires accepting the privacy policy (`/privacy`, public) with a tick box (`Checkbox`)
  on the sign-in page. No acceptance, no sign-in. The acceptance is stored per browser with the policy
  version (`gurukul.privacy.accepted`).
- Analytics consent is granted only while an accepting person is signed in, and denied again on
  sign-out. A visitor who is not signed in sends nothing and loads nothing from Google.
- Someone already signed in before this shipped, or after the policy text changes, sees one
  "Before you continue" page until they accept. Changing what is collected means changing
  `POLICY_VERSION` with the text.

## Architecture

`apps/web/src/analytics/`: a vendor-neutral `AnalyticsProvider` interface; Firebase, Console and
Noop adapters; one `analytics` facade that validates, strips personal data, gates on consent,
buffers until init and fans out. Only `core/firebaseProvider.ts` may import `firebase/analytics`
(ESLint). The SDK loads lazily, after consent. Contributor guide: `docs/analytics.md`.

## Cost and risk

Free: GA4 and Firebase Analytics have no charge. Bundle: the SDK is its own chunk, fetched only
after sign-in. Risk: ad blockers hide events from the reports, so counts are a floor.

## Open

- The retention period and the custom dimensions are set in the GA4 console (tracker `OPS-` row).
