# Vyasa Studio

## 14 · Courses — `/studio` [M5]

Sidebar shell with the Studio nav set; user card shows "Acharya · Educator".

| Region | Spec |
|---|---|
| Header | Micro label, `<h1>` "Courses", line "Compose courses the way Vyasa composed the epic — parva by parva.", primary "New course" |
| Tabs | All / Published / Drafts with counts |
| Grid | `repeat(auto-fit, minmax(min(300px,100%),1fr))`, gap 20. Course card: 120px cover (theme + glyph, status chip), body: title Fraunces 21px, meta (parvas, lessons, Parikshas), footer row (unpublished-edits chip or learner count · "Edited 2 h ago") |
| View-only card | Not a link; footer: lock icon + "View only — Acharya: {name}" |
| New card | Dashed `--border-strong` 2px, plus icon in accent-soft circle, "Start a new course", "Blank, or duplicate an existing one" |

**New course dialog:** title (slug derived, editable), level, cover theme;
"Duplicate from" select. Creates a draft and opens the course editor.

## 15 · Course editor — `/studio/courses/:courseId` [M5]

**Shell:** focused top bar: back "Vyasa Studio", course title, chip "Live: v3",
save state ("Draft v4 · saved just now" / "Saving…" / "Couldn't save — retry"),
ghost "Preview as learner", chrome "Publish v4".

**Sub-nav tabs:** Structure · Landing page · Certificate · Analytics · Versions.

| Region | Spec |
|---|---|
| Structure | `flex 2 1 560px`. Heading + help line ("Learners on v3 keep their progress — matched by lesson id."), "Add parva". One Card per parva: grip, number, title (inline input when expanded), meta, expand button. Expanded parva: item rows 52px (grip, 30px type tile — reading neutral, video accent-soft, code dark, Pariksha warning-soft — title, "Edited" chip, meta) + ghost "+ Lesson" "+ Pariksha" |
| Details panel | `flex 1 1 340px`: Course details (title, slug mono, summary, level, pass mark, cover swatches + upload disabled with tooltip "Uploads are not enabled"), Learning rules (Toggles), Acharyas with edit access |

**Reorder:** `DragList` — pointer drag with a 4px threshold, drop indicator
line `--accent` 2px; keyboard: focus the grip button, Space to lift,
arrows to move, Space to drop, Esc to cancel; live region announces "Moved
Merging to position 3 of 5". Items can move between parvas.

**Publish dialog:** summary of changes (added, edited, removed items; removed
items with learner completion counts), validation errors listed with links,
"Publish v4" primary. Success Toast + chip updates to "Live: v4".

## 16 · Lesson editor — `/studio/courses/:courseId/lessons/:lessonId` [M5]

Three columns in a wrapping row: lesson list rail (`flex 1 1 220px`, white,
current item accent-soft), block canvas (`flex 999 1 520px`, max-width 760),
settings panel (`flex 1 1 300px`, white, left border).

| Element | Spec |
|---|---|
| Title | Borderless input, Fraunces 32px, bottom hairline, label "LESSON TITLE" micro |
| Block frame | `--surface`, `--radius-lg`, header row: grip, TYPE micro label, type-specific controls, Duplicate and Delete icon buttons (`aria-label`). Selected block: 2px `--accent-decor` border |
| Video editor | 200px 16:9 preview + URL field + detected chips (provider, duration, captions) |
| Text editor | Toolbar (Bold, Italic, Inline code, Link, Numbered list) + markdown editor (CodeMirror 6, markdown mode) with live preview toggle |
| Code editor | Language select, file name input (mono), code area (CodeMirror), options row: Copy button, Terminal style, Highlight lines |
| Callout editor | Tone segmented (Note / Tip / Warning), title, text |
| Add a block | Dashed box, 8-tile palette grid (`minmax(84px,1fr)`): Text, Video, Code, Callout, Image, Embed, File, Check. Also "/" command in a text block opens the same palette |
| Settings | Rendering: 3 layout tiles with mini diagrams (Stacked, Split, Article), `aria-pressed`; estimated time; completion rule; type label; note "Every block is plain JSON…" |

**Autosave:** 1s after the last keystroke; failed save keeps edits locally
(IndexedDB) and shows retry. Leaving with unsaved edits prompts.

**Validation inline:** red-bordered block + message under its header; the
Publish dialog lists them all.

## 17 · Pariksha builder — `/studio/courses/:courseId/pariksha/:parikshaId` [M5]

| Region | Spec |
|---|---|
| Question list | Card `flex 1 1 250px`: "{n} questions", ghost "+ Add"; rows with 24px number tile, prompt truncated to 2 lines; current accent-soft; low first-try score chip (danger < 50%); "Import from question bank" secondary |
| Question editor | Card `flex 3 1 520px`, padding 28: type select; prompt textarea (markdown); answers as rows: radio "correct" (checkbox for multiple), text input (correct one 2px accent border + pale ground), remove icon button; ghost "+ Add answer"; explanation; "Revisit link" select of lessons; insight Callout from stats when available |
| Settings | Card `flex 1 1 280px`: pass mark, questions shown, cooldown, toggles shuffle / blocks next parva, reveal answers select; lock Callout explaining answers are graded server-side |

**Rules:** 2–6 answers per question; exactly one correct for single choice,
at least one for multiple; explanation required before publish. Reordering
questions uses the same `DragList`.

**Try it as a learner:** opens the draft Pariksha in the real Pariksha screen,
graded locally against the draft (no attempt recorded).
