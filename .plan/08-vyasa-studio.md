# 08 · Vyasa Studio (course authoring)

Screens: Courses, Course editor (structure), Lesson editor (blocks), Pariksha
builder. Handoff: `design-handoff/03-vyasa-studio.md`.

## Who can do what

- Acharyas see every course; they can edit only those whose `acharyaIds`
  include them (others show "View only — Acharya: …").
- Any Acharya can create a new course (they become its first Acharya).
- Kulapatis can edit, publish and archive everything.

## Drafts and publishing

- Editing writes `courses/{id}/drafts/current` (debounced autosave, ~1s, with
  a "Saved just now" indicator and a conflict warning if another editor saved
  in between — last-write-wins with a `rev` check).
- **Publish** calls `publishCourse({ courseId })`: validate with the schema,
  check every Pariksha has answers for every question, strip answers into
  `private/answers`, bump `version`, snapshot the old version into `versions/`.
- "2 unpublished edits" = diff count between draft and published (computed by
  comparing item ids and an update stamp per item).
- Preview as learner renders the **draft** in the real player, read-only progress.
- Roll back: publish any snapshot from `versions/` as a new version.

## Structure editor

- Parvas and items in a keyboard-accessible drag list (move with buttons and
  `Alt+↑/↓` as well as drag).
- Add parva, add lesson, add Pariksha, rename inline, delete with confirmation
  (deleting a lesson that learners completed warns with the count).
- Right panel: title, slug (locked after first publish), summary, level, pass
  mark, cover theme, learning rules toggles, Acharyas with access.

## Lesson editor

- Title; ordered blocks with drag handle, duplicate, delete.
- Block palette: Text (markdown with a small toolbar), Video, Code, Callout,
  Image (URL + required alt text), Embed (allow-listed), File (link), Check
  (ungraded inline question).
- Lesson settings: layout (Stacked, Split, Article — the "how content is
  rendered" choice), estimated time, completion rule, type label.
- Validation inline: a video URL that is not a supported host, an image
  without alt text, an empty block — each blocks publishing with a clear message.

## Pariksha builder

- Question list with per-question health (first-try correct rate, from stats).
- Question editor: type, prompt (markdown + optional code), options with a
  "correct" control, explanation, revisit-lesson link.
- Settings: pass mark, questions shown, retake cooldown, shuffle, reveal
  answers, blocks next parva.
- Answers are stored in the draft (Acharyas need them) and moved to
  `private/answers` only at publish.

## Question bank (M5)

Questions can be saved to a shared bank and imported into any Pariksha. The
bank is a collection `questionBank/{id}` readable by Acharyas.

## Media library

v1 has no uploads. The "Media library" nav item lists the video and image
links used across courses, to reuse them. Uploads arrive only if Storage is
approved (see `11-deployment-and-cost.md`).
