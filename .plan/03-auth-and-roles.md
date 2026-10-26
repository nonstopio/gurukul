# 03 · Authentication and roles

## Sign-in

- Firebase Auth, Google provider only, popup flow (redirect on mobile Safari).
- `hd: 'nonstopio.com'` is passed as a custom parameter so Google shows
  NonStop accounts first. It is a hint, not a guard.
- **The guard is in security rules:** every rule that opens data requires
  `request.auth.token.email_verified == true` and
  `request.auth.token.email.matches('.*@nonstopio[.]com$')`. A personal Gmail
  can create an Auth user, but can read and write nothing.
- The app signs a non-NonStop account straight back out with a clear message.
- Optional hardening (M5): a `beforeUserCreated` blocking function refuses the
  account at creation. Blocking functions require upgrading Auth to Identity
  Platform (free for this user count); decide in `13-open-questions.md`.

## Roles

| Role | How you get it | Stored as |
|---|---|---|
| Shishya | Signing in | implicit |
| Acharya | A Kulapati grants it, with a list of course ids | claim `acharya: true` + `users/{uid}.grantedCourseIds` |
| Kulapati | Another Kulapati grants it (bootstrap below) | claim `kulapati: true` |

- Claims are set only by the `setRoles` callable, which checks the caller is a
  Kulapati, writes the claims, mirrors `roles` on `users/{uid}` and revokes the
  user's refresh tokens so the new claims apply within an hour (the app forces
  a token refresh when it sees the mirror change).
- Per-course edit rights (which courses an Acharya may edit) are stored in
  `courses/{id}.acharyaIds`, checked by rules on the draft document. Claims
  stay small; course lists do not go in the token.
- A Kulapati cannot remove their own Kulapati role (no lock-out).

**Bootstrap:** the first Kulapati is set with a one-off script,
`npm run grant-kulapati -- you@nonstopio.com`, run once with an admin
credential on the maintainer's machine. Documented in CONTRIBUTING, never in CI.

## Route gating in the app

`useSession()` returns `{ user, roles, status }` from the ID token claims.
`<RequireRole role="kulapati">` wraps console routes; Studio routes need
`acharya` or `kulapati`. Gating in the UI is convenience only — rules are the
enforcement and are tested for each role.

## Rules outline

```
function signedIn()     { request.auth != null && token.email_verified && email ends @nonstopio.com }
function isKulapati()   { signedIn() && token.kulapati == true }
function isAcharyaOf(c) { signedIn() && token.acharya == true && request.auth.uid in get(/courses/$(c)).data.acharyaIds }

users/{uid}                 read: self || kulapati;  update: self, only displayName/team
courses/{c}                 read: signedIn && status == 'published' || isAcharyaOf(c) || isKulapati
courses/{c}/drafts/{d}      read, write: isAcharyaOf(c) || isKulapati   (shape validated)
courses/{c}/versions/{n}    read: isAcharyaOf(c) || isKulapati
courses/{c}/private/{d}     none
assignments/{a}             read: resource.data.uid == auth.uid || isKulapati
progress/{uid_c}            read: owner || kulapati || isAcharyaOf(c)
                            update: owner, only completedItemIds (arrayUnion of known ids), lastItemId, lastActiveAt
certificates/{id}           read: true
stats/{s}                   read: kulapati (or acharya of that course)
```

Every line gets an allow and a deny test (`10-testing-and-ci.md`).

## Open questions

- Use Identity Platform blocking functions, or rules-only domain lock? (Recommend rules-only for v1.)
- Should Acharyas see learner names in their course analytics, or only aggregates?
