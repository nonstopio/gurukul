# Analytics

Gurukul measures its own use with Google Analytics 4 (GA4) through Firebase. This page is for
contributors. The decision and the privacy position are in `.plan/20-product-analytics.md`; the
text people accept is `apps/web/src/privacy/PrivacyPage.tsx`.

## The rule

**Feature code never imports Firebase for analytics.** Import `useAnalytics()` (or the `analytics`
singleton outside React) from `apps/web/src/analytics/`. Only
`analytics/core/firebaseProvider.ts` imports `firebase/analytics`; ESLint fails any other file.

```
feature ─► analytics facade ─► validate · strip PII · consent gate · queue ─► providers
                                                                  ├─ FirebaseAnalyticsProvider (GA4)
                                                                  ├─ ConsoleAnalyticsProvider  (dev)
                                                                  └─ NoopAnalyticsProvider     (tests, off)
```

A second destination (Mixpanel, PostHog) is one new class implementing `AnalyticsProvider`
(`core/types.ts`), added to `providersFor` in `analytics/index.ts`. Calls fan out to every provider.

| Build                                                                        | Sends to                              |
| ---------------------------------------------------------------------------- | ------------------------------------- |
| `npm run build` (production)                                                 | GA4                                   |
| `npm run dev`                                                                | the console (through `log`)           |
| `npm run dev` with `VITE_ANALYTICS_DEBUG=true`                               | the console and GA4 with `debug_mode` |
| emulators (`VITE_USE_EMULATORS=true`), tests, `VITE_ANALYTICS_ENABLED=false` | nothing real                          |

Analytics never throws into the app: every provider call is wrapped, failures are swallowed and
shown only in development. The Firebase SDK is its own chunk, fetched only after consent.

## Sending an event

```tsx
const analytics = useAnalytics();
analytics.track('course_start', { course_id: course.id });
```

Also: `<TrackClick event params>` around a clickable child, `<TrackImpression event params>` for
the first time something is on screen (wraps the child in a `div`), `useTrackOnMount(event,
params)` for a screen. Page views are automatic: `RouteTracker` sends exactly one `page_view` per
navigation (first load included, safe under StrictMode); a changed query string is ignored unless
`<AnalyticsProvider includeQuery>`.

## Adding an event

1. Prefer a [GA4 recommended event](https://support.google.com/analytics/answer/9267735) when one
   fits. Otherwise a snake_case custom name.
2. Add it to `AnalyticsEvents` in `analytics/events.ts` with its parameters and a comment saying
   when it fires. A wrong name, a missing parameter or an extra one is now a compile error.
3. Call `analytics.track(...)` where it happens, after the action succeeded.
4. Test it: `createMockAnalytics()` (`apps/web/test/analytics-mock.tsx`) gives
   `{ analytics, wrapper }`; `expect(analytics.track).toHaveBeenCalledWith('x', {...})`. Or spy on
   the singleton: `vi.spyOn(analytics, 'track')`.
5. Add a row to the catalog below, and register any new custom parameter as a GA4 custom dimension
   (see "Console steps").

Example: an Admin exports a report.

```ts
// events.ts
/** An Admin downloaded the overview CSV. */
report_export: {
  report: 'overview' | 'course';
}
// where it happens
analytics.track('report_export', { report: 'overview' });
```

## Naming rules and limits

Enforced at runtime by `core/validate.ts`. In development a violation warns in the console; in
production it is adjusted silently and never throws.

| Thing         | Rule                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Event name    | snake_case, starts with a letter, at most 40 characters; not `firebase_`, `google_` or `ga_`; not a name GA4 reserves. Violating events are dropped                                        |
| Parameter     | name at most 40 characters, same shape; value a string, number or boolean; strings cut to 100 characters (`page_location` 1000, `page_title` 300); at most 25 per event, defaults included |
| User property | name at most 24 characters; value cut to 36                                                                                                                                                |
| User id       | opaque, 1 to 256 characters, never an email or phone number                                                                                                                                |

Every event also carries `app_version`, `environment`, `platform` and, once signed in, `user_role`
(`configureAnalytics` and `AnalyticsSession` set them; `analytics.setContext` adds more).
`setUserProperties` is for stable segments such as role. **Never personal data.**

## Consent and privacy

- Consent starts denied; the three advertising signals of Consent Mode v2 stay denied always.
- The sign-in page asks people to accept the privacy policy; without it they cannot sign in.
  Acceptance is stored per browser with `POLICY_VERSION` (`privacy/policy.ts`), so bumping the
  version asks everyone again, once, on the "Before you continue" page. Acceptance is kept on
  sign-out on purpose: the next person to sign in on the same browser is not asked again. Clear
  it on sign-out if shared machines ever matter.
- `AnalyticsSession` grants consent while an accepting person is signed in and denies it on
  sign-out, where it also calls `analytics.reset()` (user id and properties cleared). A visitor
  who is not signed in sends nothing and loads nothing from Google.
- PII guard: a parameter whose name suggests personal data (`email`, `phone`, `token`,
  `address`...) or whose string value looks like an email or phone number is dropped. Identify by
  Firebase uid only. Search sends the length of the query and the result count, never the words.
- Changing what is collected means updating `PrivacyPage` and `POLICY_VERSION` together.

## Verifying events locally with DebugView

1. In `apps/web/.env.local` set `VITE_FIREBASE_MEASUREMENT_ID=G-...`, `VITE_ANALYTICS_DEBUG=true`
   and `VITE_USE_EMULATORS=false` (emulator builds never send).
2. `npm run dev -w @gurukul/web`, sign in and accept the policy.
3. Open GA4 → Admin → DebugView. Events appear within seconds, tagged with the debug device. The
   console shows the same events (`Analytics event`).

## Event catalog

| Event                  | Parameters                                        | Fires                                                                    |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `page_view`            | `page_path`, `page_title`, `page_location`        | once per navigation (`RouteTracker`)                                     |
| `login`                | `method`                                          | a person finishes Google sign-in (`AnalyticsSession`)                    |
| `sign_up`              | `method`                                          | their first ever sign-in, with `login`                                   |
| `logout`               | none                                              | Sign out (`AuthProvider`)                                                |
| `search`               | `query_length`, `result_count`, `result_type`     | a result is picked in ⌘K (`GlobalSearch`)                                |
| `select_content`       | `content_type` (`cta`, `nav`), `content_id`       | sidebar links (`Shell`), Home and course Resume/Start buttons            |
| `course_start`         | `course_id`                                       | a lesson opens in a course never started (`LessonPage`)                  |
| `lesson_complete`      | `course_id`, `lesson_id`                          | Mark complete saved (`LessonPage`)                                       |
| `course_complete`      | `course_id`                                       | the completion page opens for a finished course (`certificates/pages`)   |
| `quiz_submit`          | `course_id`, `quiz_id`, `passed`, `score_percent` | an attempt is graded (`QuizPage`)                                        |
| `certificate_view`     | `certificate_id`                                  | a certificate page opens                                                 |
| `certificate_download` | `certificate_id`                                  | Download PDF is clicked                                                  |
| `course_create`        | `course_id`                                       | a Studio course is created (`NewCourseDialog`)                           |
| `course_publish`       | `course_id`                                       | a course is published (`PublishDialog`)                                  |
| `course_assign`        | `course_id`, `assignee_count`                     | an Admin assignment succeeds, once per course (`AssignPage`)             |
| `app_error`            | `source` (`api`, `route`), `code`                 | a failed API call (`api/call.ts`) or a crashed screen (`RouteErrorPage`) |

## Environment variables

| Variable                       | Meaning                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `VITE_FIREBASE_MEASUREMENT_ID` | the GA4 web stream id (`G-...`); without it nothing is sent |
| `VITE_ANALYTICS_ENABLED`       | `false` is the kill switch                                  |
| `VITE_ANALYTICS_DEBUG`         | `true` sends from a development build, with `debug_mode`    |
| `VITE_APP_VERSION`             | optional; sent as `app_version` (`unknown` otherwise)       |

## Console steps (Firebase and GA4)

1. Firebase console → Project settings → Integrations → Google Analytics: link or enable GA4, then
   Your apps → the web app: copy the `measurementId` into the production build's
   `VITE_FIREBASE_MEASUREMENT_ID` (a GitHub variable for the deploy workflow). Pull request
   previews build with `VITE_ANALYTICS_ENABLED=false`, so they never reach the real property.
2. GA4 → Admin → Data display → Custom definitions: register each custom **event** parameter as an
   event-scoped dimension: `course_id`, `lesson_id`, `quiz_id`, `passed`, `score_percent`,
   `certificate_id`, `assignee_count`, `content_type`, `content_id`, `query_length`,
   `result_count`, `result_type`, `source`, `code`, `user_role`, `app_version`. Register `role`
   as a user-scoped dimension. Parameters only appear in reports after this (up to 24 hours).
3. GA4 → Admin → Data collection and modification → Data retention: pick the retention period.
4. Optional: mark `course_complete` and `quiz_submit` as key events.
