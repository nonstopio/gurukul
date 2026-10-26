# 01 · Architecture

## Shape

```
Browser (React SPA on Firebase Hosting)
  ├─ Firebase Auth (Google, nonstopio.com only)
  ├─ Firestore (direct reads/writes, guarded by firestore.rules)
  └─ Callable Cloud Functions (grading, publishing, assignment, roles)
                     │
Cloud Functions (2nd gen, asia-south1, Node 22)
  ├─ (optional) Auth blocking trigger: beforeUserCreated → domain check
  ├─ Auth trigger: onUserCreated (v1 API)       → profile + claim invites
  ├─ Callables: gradeAttempt, publishCourse, assignCourses, setRoles, sendReminder
  ├─ Firestore triggers: progress → stats counters, certificate issue
  └─ Scheduled (daily): due-date reminders, stats roll-up
```

The browser reads course documents and its own progress directly — fast and
cheap. Anything that must not be forged (scores, certificates, roles,
assignments, publishing) goes through a function using the Admin SDK.

## Monorepo

| Workspace | Package | Built with |
|---|---|---|
| `apps/web` | `@gurukul/web` | React 19, Vite, React Router, Firebase JS SDK |
| `packages/ui` | `@gurukul/ui` | React components + `tokens.css` |
| `packages/schema` (M1) | `@gurukul/schema` | zod schemas + types + pure helpers (progress %, migrations) |
| `firebase/functions` | `@gurukul/functions` | firebase-functions v7, firebase-admin |
| `firebase/rules` | `@gurukul/rules-tests` | @firebase/rules-unit-testing |

npm workspaces, one lockfile. `@gurukul/schema` is the contract shared by the
app and the functions, so a shape is defined exactly once.

## App structure (apps/web, from M1)

```
src/
  main.tsx, App.tsx          boot + router
  firebase.ts                init from VITE_FIREBASE_*; emulator switch
  auth/                      AuthProvider, useSession (user + roles from claims), RequireRole
  data/                      typed Firestore access, one module per collection
  routes/
    learn/                   Home, Catalog, CourseOverview, LessonPlayer, Pariksha, Result, Complete
    certificates/            CertificateView, VerifyPage (public)
    kulapati/                Overview, Learners, Assign, Roles, CourseAnalytics
    studio/                  Courses, CourseEditor, LessonEditor, ParikshaBuilder
  player/                    block renderers (one per block type) + layout shells
  editor/                    block editors (one per block type)
```

Routing: React Router (data router). Role-gated route groups render a "not
allowed" page rather than redirecting silently. The public `/verify/:id` page
needs no sign-in.

State: server state via small hooks over Firestore (`onSnapshot` only where
live updates matter: own progress, the editor's draft). No global store in v1.

## Key flows

**First sign-in.** Google popup (with the `hd=nonstopio.com` hint) → security
rules refuse any token whose email is not a verified `@nonstopio.com` address
(see `03-auth-and-roles.md`) → `onUserCreated` writes `users/{uid}`, finds `assignments` with
`email == user.email && uid == null`, stamps the uid. The client waits for the
profile document before rendering Home, so assignments appear immediately.

**Learning.** Player loads `courses/{id}` (published version) once, and
subscribes to `progress/{uid}_{courseId}`. "Mark complete" writes
`completedItemIds` (arrayUnion) and `lastItemId`; rules allow only those fields.

**Pariksha.** Client calls `gradeAttempt({courseId, parikshaId, answers})` →
function reads the answer key from `courses/{id}/private/answers`, checks the
cooldown, scores, writes the attempt and the best score into progress, returns
per-question results (with explanations if configured).

**Completion.** A Firestore trigger on progress notices 100% → issues
`certificates/{credentialId}`, stamps `completedAt`, updates stats.

**Publishing.** Studio edits `courses/{id}/drafts/current`. `publishCourse`
validates against the schema, splits answer keys out into `private/answers`,
writes the published course with `version + 1`, and keeps the previous
version in `courses/{id}/versions/{n}`.

## Decisions and alternatives

| Decision | Alternative rejected | Why |
|---|---|---|
| SPA on Hosting | Next.js SSR | No SSR need; SSR needs Cloud Run; heavier |
| Firestore direct reads | Everything through functions | Cost and latency; rules suffice for reads |
| zod schema package | Hand-written types per app | One contract for client and server |
| Answer keys in a private subdoc | Hashed answers in the course | Four options are trivially brute-forced |
| YouTube/Drive links for video | Firebase Storage | Storage needs more cost control; links are enough |
| Client-side certificate PDF | Server PDF rendering | No Storage, no heavy function |
