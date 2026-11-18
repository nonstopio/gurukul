# 08 · Studio (course authoring)

Screens: Courses, Course editor (structure), Lesson editor (blocks), Quiz
builder. Handoff: `design-handoff/03-studio.md`.

Planned beside these: AI authoring sessions in a desktop app, which change a local copy and save
to the same draft in one reviewed step (`22-desktop-studio.md`). Nothing below changes for it.

## Screen width

Studio works from **640px (40rem) wide** up: a tablet in portrait (768px) and a laptop window
split in half both edit everything. This applies to every Studio page behind `DesktopOnly`
(`routes.tsx`): Courses, the course editor, lesson editor, Quiz builder, preview, question bank
and media library. Below 1024px their columns stack (rail, canvas, settings), and the lesson
outline in the lesson editor and preview scrolls inside its card, holding the current item in
view, so a long course does not push the editor a screen down. Reordering is a drag list with
touch and keyboard support, so nothing needs a mouse.

Below 640px each of those pages says it needs a wider window, with a link back to Home. Phone-width
editing is not planned: authoring a course needs the room, and Educators build on laptops. The
gate used to be 1024px, which blocked tablets and split-screen windows although every page already
worked there (checked in a browser at 768px, 680px and 640px).

## Who can do what

- Educators see every course; they can edit only those whose `educatorIds`
  include them (others show "View only — Educator: …").
- Any Educator can create a new course (they become its first Educator). The New course dialog
  asks for a title and a slug (suggested from the title); `createCourse` refuses a taken slug.
  The slug is the course id, so it is **fixed at creation**: it is not editable afterwards,
  because progress, assignments and certificates point at it.
- Admins can edit, publish and archive everything.

## Drafts and publishing

- Editing writes `courses/{id}/drafts/current` (debounced autosave, 3s after the last edit, with
  a "Draft v4 · saved just now" indicator and a conflict warning if another editor saved
  in between — last-write-wins with a `rev` check). The draft is one working copy: its version is
  the one it becomes when published (live v3 → "Draft v4", however many saves), never its `rev`,
  which counts saves for the conflict check and is not shown. A save whose content equals the stored
  draft (an edit typed and undone) writes nothing. A save asked for while another is on its way
  waits for it, then saves what changed since with the new `rev`; after a conflict it does not try. When the draft's content equals the live course
  (`diffCourses` finds nothing) and no answer key was edited, the course editor says "No changes
  since v3" and **Publish is disabled** (its tooltip says the same). A course never published is
  always publishable (subject to `validateForPublish`).
- **Answer key edits count as a change.** Published keys are never readable in the browser, so the
  draft carries `answersChanged: true` once an edit leaves its answer keys different from the stored
  draft's; `publishCourse` removes it. Each save decides the mark against the draft stored at that
  moment (in the save transaction), so a tab opened before a publish does not write it back; the
  rules let a save add the mark but never drop one that is stored. An edit undone before the autosave leaves no mark; one undone
  after it keeps the mark (and Publish) until the next publish, which is accepted. A draft whose keys
  were edited before the mark existed shows no change until another edit.
  The lesson and Quiz editors say "Draft · saved just now". A save that fails is also kept in
  the browser's localStorage (per person and course, with the `rev` it was made on) and offered
  back as "Restore edits" while the stored draft is still that `rev`; in-app navigation with
  unsaved edits saves first and asks only if the save fails.
- **Publish** calls `publishCourse({ courseId })`: validate with the schema,
  check every Quiz has answers for every question, strip answers into
  `private/answers`, bump `version`, snapshot the old version into `versions/`.
- Publishing also needs the **landing page**: a description that is not blank and at least two
  outcomes that are not blank (`MIN_OUTCOMES` in `validateForPublish`, codes `course.description`
  and `course.outcomes`). The Landing page tab says both are required and shows the issue inline;
  the publish dialog's "Fix these first" list links to that tab. A blank outcome also blocks
  publishing (`course.outcome.blank`, "Outcome N is empty…") and its input is marked invalid. The
  server runs the same check.
  Courses already published stay published; only their next publish asks for it.
- The **Learning rules** each say what they do now, and the name and line follow the switch (off:
  "go in any order", "No certificate", "Videos are optional"): go in order (a chapter opens once
  the one before is passed: its Quizzes, or every lesson if it has none), issue a certificate
  (finish every lesson and pass every Quiz), require watching videos (Mark complete waits for 90%
  of each video actually played).
- **Who can open the course** (Public, Teams picked from `config/org.teams`, or Educators and
  Admins) is its own card on the Structure tab, beside the course details. Saving it calls
  `setCourseAccess`, which applies it to the live course at once without a new version; on a course
  never published it is kept for the first publish. The publish dialog shows the current setting,
  says publishing keeps it, and links to the card. See `02-data-model.md` (Course visibility).
- The course list (`/studio`) is drawn from course summaries (`02-data-model.md`, "Course
  summaries"): it reads no course and no draft. So a card shows the **published** title, picture
  and counts; a course never published shows the title it was created with and "Not published yet".
  For each card on screen that the person may edit, two small reads add what a summary cannot know
  (`courseFacts`): the learners who started it (its stats document) and an **Unpublished edits**
  chip. The chip is a count of the course's drafts saved after `publishedAt`: one aggregation read,
  no document, since a draft holds the whole course and its answer keys (for an Educator the rules
  read the course once more to check they may edit it; an Admin needs no such read). A publish
  leaves the draft's time alone and a rollback stamps draft and course with one time, so only a save
  moves the draft past the publish. It says that the draft changed, not how much: the number of
  edits (items added, removed or changed, plus one for a course-level change) is worked out in the
  course editor, where both copies are loaded, and Publish there is still disabled when nothing
  would change.
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

- Title; ordered blocks with drag handle, duplicate, delete, and a "+" above each block that
  opens the block types and inserts the chosen one there (the palette below adds at the end).
- Block palette: Text (markdown with a small toolbar), Video, Code, Callout,
  Image (URL + required alt text), Embed (allow-listed), File (link), Check
  (ungraded inline question). Planned: Image and File gain an **Upload** tab beside Link (images
  and PDFs within the upload policy, with a preview, layouts and guidance when a file is too big):
  `19-course-media-uploads.md`.
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
- It lists entries in a table: question, type, topic, **Used in** (the Quizzes of **one course**,
  picked from a Course dropdown beside the search, that hold a question with the same text; a copy
  is not linked to its bank entry, so this is a text match), and row actions Edit and Delete (with
  confirm). Only the picked course is read: its draft when the person may edit it, else the
  published course. Import from a Quiz offers the Quizzes of that same course. Looking across every
  course at once would mean downloading every course and draft, which the page did before.
- The creator or an Admin may edit an entry (`question`, `answers`, `tags`
  only) or delete it. A Quiz that already holds a copy keeps it.
- Inserting a bank question into a Quiz is the Quiz builder's existing
  "Import from question bank".

## Media library

The "Media library" nav item lists the video, image and file links used in **one course**,
picked from a Course dropdown (`?course=`; the first course the person may edit by default), to
reuse them; each says how many lessons use it. Only that course is read: its draft when the person
may edit it, else the published course. Uploads of images and PDFs are planned in
`19-course-media-uploads.md` (Storage cost in `11-deployment-and-cost.md`); the library then
gains an Uploaded filter and a picker to reuse a course's uploads.
