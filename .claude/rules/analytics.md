---
paths:
  - 'apps/web/src/**'
  - 'apps/web/test/**'
  - 'docs/analytics.md'
---

# Analytics

Every new page, flow step and call to action is measured, the way every new line is covered by a
test (`coverage.md`). The maintainer wants to know how people use the platform. Guide:
`docs/analytics.md`; plan: `.plan/20-product-analytics.md`.

- **A new page** gets its `page_view` for free (`RouteTracker`); check it has a meaningful
  `document.title`. It is also classified for search (`navigation.md`).
- **A new button, link or card that starts something** (a call to action, a navigation entry, a
  dialog's confirm) is wrapped in `TrackClick` with `select_content`, or sends its own typed event.
- **A new step in a flow people complete** (start, finish, submit, publish, assign, download)
  sends one typed event, once. Use `useTrackOnMount` for "viewed" and `useAnalytics().track` for
  outcomes. A card people should notice uses `TrackImpression`.
- **A new event** is one more entry in `analytics/events.ts` (snake_case, at most 40 characters,
  at most 25 parameters), a row in the event catalog in `docs/analytics.md`, and its custom
  dimensions listed in the console steps there. Reuse an existing event before adding one.
- **Only the facade.** Import `analytics` or `useAnalytics`, never `firebase/analytics` (ESLint
  rejects it outside `core/firebaseProvider.ts`) and never a vendor script tag.
- **Never send personal data:** no email, name, search words, free text or answers. Ids, counts,
  booleans and short enums only. People are identified by uid.
- **Test it** with `createMockAnalytics()` (`apps/web/test/analytics-mock.tsx`): assert the event
  and its parameters at the moment a person acts, and that nothing is sent when they do not.
- **Changing what is collected** (a new kind of data, a new purpose) updates `PrivacyPage` and
  bumps `POLICY_VERSION` in the same change, so everyone accepts the new text once.
- **Genuinely nothing to measure?** A purely presentational component, a layout, a copy change:
  say so in the PR under "How it was checked". Do not leave it unsaid.
