# 02 · Data model

All shapes are defined once as zod schemas in `packages/schema` (M1) and
imported by the app and the functions. This file is the human-readable
contract; the schema package is the executable one. They change together.

## Collections

| Path | Holds | Client read | Client write |
|---|---|---|---|
| `users/{uid}` | Profile and role mirror (see [Users](#users)) | self, Kulapati | self: `displayName`, `nameLower`, `team` only; `nameLower` must equal `displayName` lower-cased; a changed `team` must be in `config/org.teams` or `null` |
| `courses/{courseId}` | **The published course object** | any signed-in user when `published` or `archived` (archived shows as Retired); every Acharya and Kulapati in any status, so Vyasa Studio lists every course (a never-published one is a shell: its content and answer keys are in `drafts/current`) | never (published by function) |
| `courses/{courseId}/drafts/current` | The draft being edited: `{ rev, updatedAt, updatedBy, course, answers }` (answer keys included, so the author can edit them) | Acharyas granted the course, Kulapati | same, **update only**, `rev` + 1 per save; created by `createCourse`, never deleted from a client |
| `courses/{courseId}/versions/{n}` | Snapshot of each published version | granted Acharyas, Kulapati | never |
| `courses/{courseId}/private/answers` | Pariksha answer keys | never | never |
| `assignments/{assignmentId}` | Who must take what, by when | the assignee (by uid), Kulapati | never (function) |
| `progress/{uid}_{courseId}` | One learner's state in one course | owner, Kulapati, granted Acharyas | owner: append item ids, set `lastItemId` |
| `progress/{uid}_{courseId}/attempts/{attemptId}` | Each graded Pariksha attempt | owner, Kulapati, granted Acharyas | never (function) |
| `certificates/{credentialId}` | Issued certificates | **public** (verification) | never (function) |
| `stats/{scope}` | Counters for Sanjaya (`org`, `course_{id}`) | Kulapati, granted Acharyas | never (function) |
| `audit/{id}` | Who did what (assign, role change, revoke, publish) | Kulapati | never (function) |
| `questionBank/{id}` (M5) | Reusable Pariksha questions, answers included | Acharyas, Kulapati | Acharyas, Kulapati |
| `config/org` | Allowed domain (fixed to `nonstopio.com`), teams list (at most 100), `reminders.enabled`; only these keys, never deleted; the seed creates the default if missing | signed-in | Kulapati (Org settings) |
| `counters/certificates` | The certificate id sequence | never | never (function) |
| `mail/{autoId}` | Outgoing email queue, in the shape the "Trigger Email from Firestore" extension reads; nothing sends until a sender is installed (`firebase/functions/src/mail.ts`) | never | never (function) |

## The course object

One document. About 30–80 KB for a course like Git — far below the 1 MiB
document limit. `schemaVersion` lets the shape evolve with tested migrations.

```ts
type Course = {
  schemaVersion: 2;
  id: string;                    // = slug, stable forever
  title: string;
  summary: string;               // one sentence, shown on cards
  description: string;           // markdown, course overview
  level: 'foundation' | 'intermediate' | 'advanced';
  cover: { theme: 'forest' | 'sand' | 'sky' | 'stone'; glyph: string };
  outcomes: string[];            // "What you will learn"
  acharyaIds: string[];          // uids who may edit
  acharyaNames: Record<string, string>; // uid → display name, for Studio (v2); `users` is private
  status: 'draft' | 'published' | 'archived';
  version: number;               // increments on publish
  publishedAt: Timestamp | null;
  rules: {
    sequential: boolean;         // parvas unlock in order
    passMark: number;            // 0..1, default 0.7
    certificate: boolean;
    requireVideoWatch: boolean;  // every lesson with a video: mark-complete enables at 90% watched
  };
  certificate: { title: string; signatoryName: string; signatoryRole: string };
  parvas: Parva[];
  estimatedMinutes: number;      // derived on publish
};

type Parva = { id: string; title: string; items: Item[] };

type Item = Lesson | Pariksha;

type Lesson = {
  type: 'lesson';
  id: string;                    // stable forever; progress points at it
  title: string;
  minutes: number;
  layout: 'stacked' | 'split' | 'article';
  completeWhen: 'manual' | 'video90' | 'scrolled';
  kindLabel?: string;            // overrides the auto label ("Video + code")
  blocks: Block[];
};

type Block =
  | { type: 'video'; id: string; provider: 'youtube' | 'drive' | 'loom'; url: string; captions: boolean; title?: string; caption?: string; durationSec?: number }
  | { type: 'markdown'; id: string; md: string }
  | { type: 'code'; id: string; lang: string; file?: string; code: string; copy: boolean; terminal: boolean; highlight?: string }
  | { type: 'callout'; id: string; tone: 'note' | 'tip' | 'warning'; title?: string; md: string }
  | { type: 'image'; id: string; url: string; alt: string; caption?: string }
  | { type: 'embed'; id: string; url: string; title: string }   // allow-listed hosts only
  | { type: 'file'; id: string; url: string; label: string }
  | { type: 'check'; id: string; prompt: string; options: string[]; explanation: string }; // ungraded, answer inline

type Pariksha = {
  type: 'pariksha';
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

**Answer key** (`courses/{id}/private/answers`): `{ [parikshaId]: { [questionId]: string[] } }` — option ids.

## Progress

```ts
type Progress = {
  uid: string; courseId: string;
  courseVersion: number;         // version when last active
  startedAt: Timestamp;
  lastItemId: string | null;     // the resume point
  lastActiveAt: Timestamp;
  completedItemIds: string[];    // lessons the learner marked complete
  pariksha: Record<string, { best: number; passed: boolean; attempts: number; lastAttemptAt: Timestamp }>;
  percent: number;               // written by the function, not the client
  completedAt: Timestamp | null;
  certificateId: string | null;
};
```

Percent = (completed lessons + passed Parikshas) ÷ (lessons + Parikshas) in the
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
  roles: Array<'shishya' | 'acharya' | 'kulapati'>;   // mirror of the claims
  grantedCourseIds: string[];
  createdAt: Timestamp;
};
```

People search (Learners, Assign, granting a role) runs two prefix range queries, on `email`
and on `nameLower`, 8 people each, merged with email matches first. A name matches from its
start (`ana` finds "Ananya Rao"; `rao` does not). `onUserCreated` writes `nameLower` with the
profile; profiles made before it existed get it from the app on their owner's next sign-in,
and the rules keep it in step with `displayName` on every later write. Single-field
indexes cover both queries; there is no composite index. `nameLower` is optional in the
schema until every profile has it.

## Assignments

```ts
type Assignment = {
  email: string;                 // lower-cased, always set
  uid: string | null;            // filled at first sign-in
  courseId: string;
  assignedBy: string;            // uid
  assignedAt: Timestamp;
  dueAt: Timestamp | null;
  mandatory: boolean;
  reminder: 'weekly' | 'beforeDue' | 'none';
  status: 'assigned' | 'started' | 'completed';   // maintained by functions
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
- `attempts` (per progress document): `uid ASC, parikshaId ASC, createdAt DESC` — the result page's latest attempt

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
