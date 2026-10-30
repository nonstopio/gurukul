# 03 · Authentication and roles

## Sign-in

- Firebase Auth, Google provider only, popup flow. iPhones and iPads (every iOS
  browser is Safari underneath) use the redirect flow, and so does any browser
  that blocks the popup. Closing the popup is not an error and shows nothing.
  The redirect needs the auth domain to be the Hosting domain (`11-deployment-and-cost.md`).
- A refused account is named in the message ("You signed in as …"), which takes
  focus, and the button becomes "Try another account" (`prompt: select_account`),
  so someone signed in to a personal and a NonStop account can switch.
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
| Learner | Signing in | implicit |
| Educator | An Admin grants it, with a list of course ids | claim `educator: true` + `users/{uid}.grantedCourseIds` |
| Admin | Another Admin grants it (bootstrap below) | claim `admin: true` |

- Claims are set only by the `setRoles` callable, which checks the caller is a
  Admin, writes the claims, mirrors `roles` on `users/{uid}` and revokes the
  user's refresh tokens so the new claims apply within an hour (the app forces
  a token refresh when it sees the mirror change).
- Per-course edit rights (which courses an Educator may edit) are stored in
  `courses/{id}.educatorIds`, checked by rules on the draft document. Claims
  stay small; course lists do not go in the token.
- An Admin cannot remove their own Admin role (no lock-out).

**Bootstrap:** the first Admin is set with a one-off script,
`npm run grant-admin -- you@nonstopio.com`, run once with an admin
credential on the maintainer's machine. Documented in `docs/operations.md`,
linked from CONTRIBUTING, never in CI.

## Route gating in the app

`useSession()` returns `{ user, roles, status }` from the ID token claims.
`<RequireRole role="admin">` wraps console routes; Studio routes need
`educator` or `admin`. Gating in the UI is convenience only — rules are the
enforcement and are tested for each role.

## Rules outline

```
function signedIn()     { request.auth != null && token.email_verified && email ends @nonstopio.com }
function isAdmin()   { signedIn() && token.admin == true }
function isEducatorOf(c) { signedIn() && token.educator == true && request.auth.uid in get(/courses/$(c)).data.educatorIds }

users/{uid}                 read: self || admin;  update: self, only displayName/team
courses/{c}                 get/list: signedIn && status in [published, archived] && may open (public, or a listed team) || any educator || isAdmin
                            (a listing must ask for visibility == 'public', or 'teams' + the person's own team ids)
courses/{c}/drafts/{d}      read, write: isEducatorOf(c) || isAdmin   (shape validated)
courses/{c}/versions/{n}    read: isEducatorOf(c) || isAdmin
courses/{c}/private/{d}     none
assignments/{a}             read: resource.data.uid == auth.uid || isAdmin
progress/{uid_c}            read: owner || admin || isEducatorOf(c)
                            update: owner, only completedItemIds (arrayUnion of known ids), lastItemId, lastActiveAt
certificates/{id}           read: true
stats/{s}                   read: admin (or educator of that course)
```

Every line gets an allow and a deny test (`10-testing-and-ci.md`).

## Open questions

- ~~Use Identity Platform blocking functions, or rules-only domain lock?~~ Resolved: rules-only, as
  built (`13-open-questions.md` question 3).
- Should Educators see learner names in their course analytics, or only aggregates?
