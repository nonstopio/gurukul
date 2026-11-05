# 02 · Data model

All shapes are defined once as zod schemas in `packages/schema` (M1) and
imported by the app and the functions. This file is the human-readable
contract; the schema package is the executable one. They change together.

## Collections

| Path | Holds | Client read | Client write |
|---|---|---|---|
| `users/{uid}` | Profile and role mirror (see [Users](#users)) | self, Educator, Manager, Admin (they read the roster to pick team members) | self: `displayName`, `nameLower`, `labels` only; `labels` is `generic` or `gurukul`; `nameLower` must equal `displayName` lower-cased; `team` and `teamIds` are never writable from a client |
| `courses/{courseId}` | **The published course object**, plus `visibility` and `visibleTeamIds` beside it (see [Course visibility](#course-visibility)) | any signed-in user when `published` or `archived` (archived shows as Retired) **and they may open it**: public, or a team they are on; every Educator and Admin in any status, so Studio lists every course (a never-published one is a shell: its content and answer keys are in `drafts/current`) | never (published by function) |
| `courses/{courseId}/drafts/current` | The draft being edited: `{ rev, updatedAt, updatedBy, course, answers, answersChanged? }` (answer keys included, so the author can edit them; `answersChanged: true` marks an answer key edit since the last publish, which removes it) | Educators granted the course, Admin | same, **update only**, `rev` + 1 per save; created by `createCourse`, never deleted from a client |
| `courses/{courseId}/versions/{n}` | Snapshot of each published version | granted Educators, Admin | never |
| `courses/{courseId}/private/answers` | Quiz answer keys | never | never |
| `assignments/{assignmentId}` | Who must take what, by when | the assignee (by uid), Admin | never (function) |
| `progress/{uid}_{courseId}` | One learner's state in one course | owner, Admin, granted Educators | owner: append item ids, set `lastItemId` |
| `progress/{uid}_{courseId}/attempts/{attemptId}` | Each graded Quiz attempt | owner, Admin, granted Educators | never (function) |
| `certificates/{credentialId}` | Issued certificates | **public** (verification) | never (function) |
| `stats/{scope}` | Counters for Analytics (`org`, `course_{id}`) | Admin, granted Educators | never (function) |
| `audit/{id}` | Who did what (assign, role change, revoke, publish) | Admin | never (function) |
| `questionBank/{id}` (M5) | Reusable Quiz questions, answers included: `{ question, answers, tags, createdBy, createdAt }` | Educators, Admin | create: Educators, Admin (own uid, server time); update: its creator or an Admin, `question`, `answers`, `tags` only; delete: its creator or an Admin |
| `config/org` | Allowed domain (fixed to `nonstopio.com`), teams list of names (at most 100; the names learners pick from, kept in step with `teams/`), `reminders.enabled`, `signatory` (`name`, `role`: who signs certificates, copied onto each certificate when issued), optional `uploads` (`imageMaxKB`, `pdfMaxKB`: whole KB from 50 to the 1024 hard ceiling, Admin only; missing reads as 500 / 1024; see `19-course-media-uploads.md`); only these keys, never deleted; the seed creates the default if missing | signed-in | Admin (Org settings); an Educator may change only `teams` (Teams page) |
| `teams/{teamId}` | A team: `{ name, memberEmails, createdAt, createdBy?, managerEmails? }` (see [Teams](#teams)); only these keys | Educator, Admin; a Manager the teams whose `managerEmails` lists them | Admin, Manager (`21-managers.md`): `name` 1–80 characters, `memberEmails` a list of at most 500, `managerEmails` at most 10, `createdAt` a number (milliseconds); a create sets `createdBy` to the writer's uid and nobody changes it; a Manager creates teams that list them and edits teams that list them without changing `managerEmails`; an Admin edits any (a team with no manager is Admin-only); `educator-candidates` is Admin-only; deleted by an Admin only, since a course can be limited to a team |
| `counters/certificates` | The certificate id sequence | never | never (function) |
| `mail/{autoId}` | Retired: email now goes straight through the Gmail API (`firebase/functions/src/gmail.ts`); nothing writes here, and the rule that denies browsers stays | never | never (function) |

## Course visibility

A published course says who may open it, in two fields on `courses/{id}` that sit **beside** the
course object, not inside it (the course shape and `schemaVersion` do not change; `readCourse`
ignores them, `accessOf` reads them):

```ts
visibility: 'public' | 'teams' | 'staff';   // missing reads as public
visibleTeamIds: string[];                    // `teamId(name)` of each team, at most 30; used by `teams`
```

- `public`: everyone signed in. `teams`: people on at least one listed team. `staff`: every Educator
  and Admin (they can open every course regardless: that is what Studio needs). Per team, not per
  role, was the open question; `staff` is deliberately all staff rather than staff of a team, because
  it costs nothing (it is a claim) and a team-scoped staff list would need a second membership
  lookup in the rules for no known need. Revisit if a team wants its own Educator-only courses.
- An Educator of the course or an Admin sets it on the course editor's "Who can open this course"
  card; `setCourseAccess({ courseId, visibility, visibleTeamIds })` writes both fields onto
  `courses/{id}` at once, with no new version (an `audit` entry `course.access`). On a course never
  published it waits there: the rules show such a course to staff only, whatever it says, and the
  first publish keeps it. `publishCourse` and rollback keep what the live course has (a missing one
  counts as `public`) and write it with every release, so a version snapshot holds the setting of
  its day; a later change is not in the snapshot.
- **Who is on a team** is `users/{uid}.teamIds`: the `onTeamWritten` function copies each
  `teams/{id}` write onto the profiles of everyone the write listed before or after: each profile is
  reset, in a transaction, to the teams that list its email **now**, never to a diff, so retried or
  reordered trigger events cannot leave it wrong. `onUserCreated` creates the profile first and
  then reconciles it the same way, so a team written in between is not lost (a person with no
  profile yet is skipped by the trigger and picked up there). The `checkAnswer` and `gradeAttempt`
  callables apply the same `canOpen` rule on the server, so an id sent by hand opens nothing. A person cannot write it, so
  they cannot pick their way into a team's courses; `users.team` is a retired field nobody writes
  or reads (`npm run backfill-teams` moved its values into `teams/` once); a person is on any number of teams, and sees them (read only) on the profile. Team names reach Studio through `config/org.teams` (readable by every signed-in
  person), so `teams/` stays staff-only (Educators and Admins) and member emails are never exposed to learners.
- **Rules** (`canOpenCourse`): a single read passes for public, a missing field, a listed team
  (`visibleTeamIds.hasAny(myTeamIds())`, one `get` of the person's profile) or any Educator or
  Admin. Starting a course (`progress` create) applies the same check. A **listing** must say what
  it wants, so the rules can prove it: the catalogue runs `visibility == 'public'`, then
  `visibility == 'teams'` with `visibleTeamIds array-contains-any` the person's own team ids
  (at most 30). A listing that omits that is refused, and the emulator tests prove it.
- **Existing courses**: a missing `visibility` still opens by id but cannot be listed, because a
  query cannot match a missing field. `npm run backfill-visibility -- --apply` (once, on the
  maintainer's machine, before the rules deploy; safe to re-run) writes `public` to every course
  without one and fills `teamIds` for every team member. Every later publish writes it.
- Cost: one extra query for a person with teams, one profile `get` per `teams` course read.
  Limitation: assigning a team-only course to someone outside the team is not blocked; they see it
  on Home but the course page refuses it. The one exception is the Educator course: assigning it adds
  the person to its `Educator candidates` team (`03-auth-and-roles.md`).

## Teams

A team is `{ id, name, memberEmails[], createdAt }`: the document `teams/{id}` holds `name`,
`memberEmails` (lower-cased, unique, at most 500, so a document stays a few tens of KB) and
`createdAt` (milliseconds). `id` is a slug of the name. Members are keyed by **email**, like
assignments, so a person can be on a team before their first sign-in.

Why a collection, and why `config/org.teams` stays: every signed-in person reads the names to show
their teams on the profile and to pick teams for a course. Putting members into that document would make every learner
download every member list, and a few hundred emails per team would approach the 1 MiB document
limit. So the lists live in `teams/` (Educators and Admins only: it holds other people's emails) and
`config/org.teams` keeps only the names, rewritten in the same transaction as every team write.
A name in `config/org.teams` with no `teams/` document (a team made before this) is a team with no
members: the Teams page lists it, and saving it creates its document. Cost: one read of
`teams/` per Teams page or Assign visit (at most 100 documents), no listeners, nothing on learner pages.

## The course object

One document. About 30–80 KB for a course like Git — far below the 1 MiB
document limit. `schemaVersion` lets the shape evolve with tested migrations.

```ts
type Course = {
  schemaVersion: 4;
  id: string;                    // = slug, stable forever
  title: string;
  summary: string;               // one sentence, shown on cards
  description: string;           // markdown, course overview
  level: 'foundation' | 'intermediate' | 'advanced';
  cover: {
    theme: 'forest' | 'sand' | 'sky' | 'stone'; glyph: string;
    // v4, optional: the course's one picture, always an upload (19-course-media-uploads.md).
    // Tiles show it, else the first lesson image, else the title on the theme colour.
    image?: { url: string; width: number; height: number; upload: ImageUpload };
  };
  outcomes: string[];            // "What you will learn"
  educatorIds: string[];          // uids who may edit
  educatorNames: Record<string, string>; // uid → display name, for Studio (v2); `users` is private
  status: 'draft' | 'published' | 'archived';
  version: number;               // increments on publish
  publishedAt: Timestamp | null;
  rules: {
    sequential: boolean;         // chapters unlock in order
    passMark: number;            // 0..1, default 0.7
    certificate: boolean;
    requireVideoWatch: boolean;  // every lesson with a video: mark-complete enables at 90% watched
  };
  certificate: { title: string };  // the signatory is `config/org.signatory`, not per course
  chapters: Chapter[];
  estimatedMinutes: number;      // derived on publish
};

type Chapter = { id: string; title: string; items: Item[] };

type Item = Lesson | Quiz;

type Lesson = {
  type: 'lesson';
  id: string;                    // stable forever; progress points at it
  title: string;
  minutes: number;
  layout: 'stacked' | 'split' | 'article'; // kept for old courses; the player ignores it and Studio no longer sets it
  completeWhen: 'manual' | 'video90' | 'scrolled';
  kindLabel?: string;            // overrides the auto label ("Video + code")
  blocks: Block[];
};

type Block =
  | { type: 'video'; id: string; provider: 'youtube' | 'drive' | 'loom'; url: string; captions: boolean; title?: string; caption?: string; durationSec?: number }
  | { type: 'markdown'; id: string; md: string }
  | { type: 'code'; id: string; lang: string; file?: string; code: string; copy: boolean; terminal: boolean; highlight?: string }
  | { type: 'callout'; id: string; tone: 'note' | 'tip' | 'warning'; title?: string; md: string }
  | { type: 'image'; id: string; url: string; alt: string; caption?: string;
      layout?: 'column' | 'medium' | 'small'; zoom?: boolean; border?: boolean; width?: number; height?: number;
      upload?: { path: string; bytes: number; contentType: 'image/webp' | 'image/png' | 'image/jpeg'; name: string; blurHash?: string } } // all new fields optional, no schemaVersion bump: 19-course-media-uploads.md
  | { type: 'embed'; id: string; url: string; title: string }   // allow-listed hosts only
  | { type: 'file'; id: string; url: string; label: string; upload?: { path: string; bytes: number; contentType: 'application/pdf'; name: string; blurHash?: string } }   // upload = a PDF we host: 19-course-media-uploads.md
  | { type: 'check'; id: string; prompt: string; options: string[]; correct?: number; explanation: string }; // ungraded, answer inline; `correct` indexes `options` (v3, required to publish)

type Quiz = {
  type: 'quiz';
  id: string;
  title: string;
  passMark?: number;             // overrides course rules
  questionsShown: number;        // <= questions.length; random subset if fewer
  shuffleOptions: boolean;
  cooldownMinutes: number;
  revealAnswers: 'each' | 'onPass' | 'never';
  blocksNext: boolean;
  questions: Question[];         // no answers here
};

type Question = {
  id: string;
  kind: 'single' | 'multiple' | 'trueFalse' | 'codeOutput';
  prompt: string;                // markdown
  code?: string;
  options: { id: string; text: string }[];
  explanation: string;
  reviewItemId?: string;         // lesson to revisit when wrong
};
```

**Answer key** (`courses/{id}/private/answers`): `{ [quizId]: { [questionId]: string[] } }` — option ids.

## Progress

```ts
type Progress = {
  uid: string; courseId: string;
  courseVersion: number;         // version when last active
  startedAt: Timestamp;
  lastItemId: string | null;     // the resume point
  lastActiveAt: Timestamp;
  completedItemIds: string[];    // lessons the learner marked complete
  quiz: Record<string, { best: number; passed: boolean; attempts: number; lastAttemptAt: Timestamp }>;
  percent: number;               // written by the function, not the client
  completedAt: Timestamp | null;
  certificateId: string | null;
};
```

Percent = (completed lessons + passed Quizzes) ÷ (lessons + Quizzes) in the
**current** published version. Ids that no longer exist are ignored; new items
added in a later version simply count as not done. A learner who already holds
a certificate keeps it when a course gains lessons.

## Users

```ts
type User = {
  email: string;                 // lower-cased
  displayName: string;           // from Google; the email's local part when Google has none
  nameLower?: string;            // displayName lower-cased (`nameKey`), for search by name
  photoURL: string | null;
  team: string | null;
  teamIds?: string[];            // `teamId(name)` of each `teams/` document that lists this email; set by functions only
  roles: Array<'learner' | 'educator' | 'admin' | 'manager'>;   // mirror of the claims
  grantedCourseIds: string[];
  createdAt: Timestamp;
};
```

People search (Learners, Assign, team members, granting a role) reads the roster once: up to 500
profiles ordered by `email`, cached for five minutes, and matches in memory, 8 people at most, email matches
first. A person is found by the start of their email, of their whole name, or of any word of it (`ana` and `rao`
both find "Ananya Rao"). Past about 500 people the ones after it by email cannot be found by name (the app
logs a warning); the next step is word prefixes stored on each profile and queried with `array-contains`.
`nameLower` is no longer read by the app; it is still written (`onUserCreated`, the sign-in backfill, and the
rules keep it in step with `displayName`) and kept for that later step. It is optional in the schema until
every profile has it.

## Assignments

```ts
type Assignment = {
  email: string;                 // lower-cased, always set
  uid: string | null;            // filled at first sign-in
  courseId: string;
  assignedBy: string;            // uid
  assignedByName?: string | null; // assigner's display name; learners cannot read other users
  assignedAt: Timestamp;
  dueAt: Timestamp | null;
  mandatory: boolean;
  reminder: 'weekly' | 'beforeDue' | 'none';
  status: 'assigned' | 'started' | 'completed';   // maintained by functions
  teamId?: string | null;        // the team it was assigned through; its managers are CC'd on deadline email
  lastRemindedAt?: Timestamp | null;
  dueSoonSentAt?: Timestamp | null; // the 5-days-left notice (`21-managers.md`), once
  overdueSentAt?: Timestamp | null; // the overdue notice, once; both cleared by a new due date
};
```

Id: `{courseId}__{hmac-sha256(email)}` so assigning the same course to the same email
twice is idempotent (the bulk screen reports it as "already assigned").

## Certificates

```ts
type Certificate = {
  id: string;                    // e.g. NSG-GIT-26-0412 (course code, year, sequence)
  uid: string; learnerName: string;
  courseId: string; courseTitle: string; courseVersion: number;
  issuedAt: Timestamp;
  signatoryName: string; signatoryRole: string;
  revoked: boolean;
  revokedAt?: Timestamp | null; // set by revokeCertificate, null on restore; absent on older revocations
};
```

Publicly readable so `/verify/{id}` works signed out. It holds only the name on
the certificate, the course and the date — no email.

## Indexes (initial)

- `assignments`: `uid ASC, dueAt ASC`; `courseId ASC, status ASC`; `email ASC, uid ASC`
- `progress`: `courseId ASC, percent DESC`; `courseId ASC, lastActiveAt DESC`
- `certificates`: `uid ASC, issuedAt DESC`
- `attempts` (per progress document): `uid ASC, quizId ASC, createdAt DESC` — the result page's latest attempt

## Migrations

`packages/schema/src/migrations/` holds pure functions `v1→v2`, each with
tests, registered in `steps.ts` under the version they upgrade from.
`upgradeCourse` runs them; two readers sit on top:

- `migrateCourse` is strict: upgrade, then validate the full shape, throwing on
  anything that does not fit. Functions use it (grading, progress), and
  `publishCourse` and `rollbackCourse` upgrade a draft or snapshot before
  validating and writing it, so the live document is always current.
- `readCourse` is the player's fallback, so one document never breaks the app:
  it upgrades an older course, reads a newer one as far as this app understands
  it, turns any block it cannot parse into `{ type: 'unsupported', id }` (the
  player shows "This content needs a newer version of the app."), and returns
  `null` for a course it cannot read at all. The catalogue and Studio's course
  list skip a `null` course with a warning instead of failing the list.
- `validateForPublish` upgrades the draft first too, so a draft saved at an older
  `schemaVersion` (an older tab, an older app) is judged in the shape publishing
  gives it. Studio leaves a stored draft at its version until publish. Whatever the
  schema still refuses is worded for the Educator (`publishWords.ts`: "The title of
  lesson 2 in chapter 1 is empty."); a field they cannot edit (the version, an id)
  shows only "saved by an older version of Gurukul, reload".

Steps so far: v1→v2 adds `educatorNames`; v2→v3 (optional `correct` on checks) and
v3→v4 (optional `cover.image`) change nothing in the stored course.
