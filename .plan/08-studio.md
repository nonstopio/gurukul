# 08 · Studio (course authoring)

Screens: Courses, Course editor (structure), Lesson editor (blocks), Quiz
builder. Handoff: `design-handoff/03-studio.md`.

## Who can do what

- Educators see every course; they can edit only those whose `educatorIds`
  include them (others show "View only — Educator: …").
- Any Educator can create a new course (they become its first Educator). The New course dialog
  asks for a title and a slug (suggested from the title); `createCourse` refuses a taken slug.
  The slug is the course id, so it is **fixed at creation**: it is not editable afterwards,
  because progress, assignments and certificates point at it.
- Admins can edit, publish and archive everything.

## Drafts and publishing

- Editing writes `courses/{id}/drafts/current` (debounced autosave, ~1s, with
  a "Draft v7 · saved just now" indicator (the draft's `rev`, and the age of its last save) and a conflict warning if another editor saved
  in between — last-write-wins with a `rev` check). A save that fails is also kept in
  the browser's localStorage (per person and course, with the `rev` it was made on) and offered
  back as "Restore edits" while the stored draft is still that `rev`; in-app navigation with
  unsaved edits saves first and asks only if the save fails.
- **Publish** calls `publishCourse({ courseId })`: validate with the schema,
  check every Quiz has answers for every question, strip answers into
  `private/answers`, bump `version`, snapshot the old version into `versions/`.
- The publish dialog also sets **who can open the course**: Public, Teams (pick teams from
  `config/org.teams`) or Educators and Admins. It starts from what the live course has; changing it
  alone is enough to publish. See `02-data-model.md` (Course visibility).
- "2 unpublished edits" = diff count between draft and published: items added, removed or
  changed, plus one for any course-level change. Only what publishing would change counts: the
  draft is compared in today's schema, and the Educator list (always taken from the live course)
  is ignored.
- Preview as learner renders the **draft** in the real player, read-only progress.
- Roll back: publish any snapshot from `versions/` as a new version.

## Structure editor

- Chapters and items in a keyboard-accessible drag list (move with buttons and
  `Alt+↑/↓` as well as drag).
- Add chapter, add lesson, add Quiz, rename inline, delete with confirmation
  (deleting a published lesson warns with how many learners completed it: one count query when the dialog opens).
  The publish dialog gives each removed lesson the same count, and course cards show how many
  learners started the course (`stats/course_{id}`, only on courses the person may edit).
- Right panel: title, summary, level, pass
  mark, cover theme, learning rules toggles, Educators with access.

## Lesson editor

- Title; ordered blocks with drag handle, duplicate, delete.
- Block palette: Text (markdown with a small toolbar), Video, Code, Callout,
  Image (URL + required alt text), Embed (allow-listed), File (link), Check
  (ungraded inline question).
- Lesson settings: estimated time, completion rule, type label. The course object keeps a
  `layout` field (`stacked | split | article`) that the player ignores and Studio no longer
  offers: Stacked and Split rendered identically, and Article only enlarged the text.
- Validation inline: a video URL that is not a supported host, an image
  without alt text, an empty block — each blocks publishing with a clear message.

## Quiz builder

- Question list with per-question health (first-try correct rate, from stats).
- Question editor: type, prompt (markdown + optional code), options with a
  "correct" control, explanation, revisit-lesson link.
- Settings: pass mark, questions shown, retake cooldown, shuffle, reveal
  answers, blocks next chapter.
- Answers are stored in the draft (Educators need them) and moved to
  `private/answers` only at publish.

## Question bank (M5)

Questions are written once in a shared bank and imported into any Quiz. The
bank is a collection `questionBank/{id}` readable by Educators and Admins only,
because entries carry their answer keys; learners never read it and grading
stays in the Cloud Function.

- The page always offers **New question** (a dialog: prompt, type, answers
  with the correct ones marked, topic tag, explanation) and **Import from a
  quiz** (pick a course and a Quiz from a draft the person can read, tick the
  questions, they are copied into the bank with their keys). Its empty state
  says why the bank exists and offers both.
- It lists entries in a table: question, type, topic, **Used in** (the Quizzes,
  among the courses the Studio already loaded, that hold a question with the
  same text; a copy is not linked to its bank entry, so this is a text match,
  and it costs no extra reads), and row actions Edit and Delete (with confirm).
- The creator or an Admin may edit an entry (`question`, `answers`, `tags`
  only) or delete it. A Quiz that already holds a copy keeps it.
- Inserting a bank question into a Quiz is the Quiz builder's existing
  "Import from question bank".

## Media library

v1 has no uploads. The "Media library" nav item lists the video and image
links used across courses, to reuse them. Uploads arrive only if Storage is
approved (see `11-deployment-and-cost.md`).
