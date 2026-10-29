# Learner screens (Shishya)

## 01 · Sign in — `/signin` [M1]

**Purpose:** the only screen a signed-out visitor sees (besides `/verify/:id`).

**Layout:** two panes in a wrapping row. Hero `flex: 1 1 560px`, `--chrome`,
padding 48px `clamp(24px,6vw,80px)`, column space-between; decorative concentric
SVG (mint, 16% opacity, bottom-right, `aria-hidden`). Form pane `flex: 1 1 440px`,
`--bg`, centred column max 400px, gap `--space-8`.

| Element | Spec |
|---|---|
| Brand | Logo 34px · divider · "Gurukul" Fraunces 24px `--chrome-accent` |
| Kicker | "NonStop Academy", micro label, mint |
| Headline | Fraunces 500 `clamp(40px,5vw,64px)`, white, `text-wrap: balance` |
| Lead | 18px/1.6 `--g-ink-100`-ish (`--chrome-text`) |
| Benefits | 3 rows, 20px mint stroke icon + 15px text |
| Quote | Fraunces italic 16px `--chrome-label` |
| Form title | "Sign in to Gurukul", Fraunces 34px |
| Google button | Official Google button, full width, 52px |
| Invite note | Callout (accent tone): "Assigned a course before you joined? …" |
| Footnote | 13px `--text-subtle`, domain rule + contact link |

**States:** idle · signing in (button loading) · popup closed (no message) ·
wrong domain (Callout danger: "Use your @nonstopio.com account. You signed in
as name@gmail.com." + "Try another account") · network error (Toast + retry).

**Responsive:** below 1000px the hero stacks on top with reduced padding and
the benefits list hidden below 560px.

**A11y:** `<h1>` is the hero headline; form title is `<h2>`. Error Callout is
`role="alert"` and receives focus.

## 02 · Home (My learning) — `/` [M2]

**Purpose:** pick up where you left off; see what is assigned and due.

| Region | Spec |
|---|---|
| Header | Micro label "Shishya · My learning"; `<h1>` "Namaste, {firstName}" Fraunces 40px; status line 16px `--text-muted` (derived: "You are 44% through Git. One lesson left to finish the Branching parva."); search field 300px |
| Continue card | Card, row wraps: cover (forest + git-graph line art, chip "In progress") `flex 1 1 320px`, min-height 240; body `flex 2 1 420px` padding 28/32: chips (level, due date warning tone), assigned-by line, title Fraunces 30px, "Up next" line, ProgressBar 8px + caption, actions (primary "Resume lesson", secondary "Course outline") |
| Assigned list | Card `flex 2 1 480px`: rows = 48px cover tile, title + 6px bar, right column chip + due text. Each row is one `<a>` |
| Recent activity | Card `flex 1 1 280px`: `<ol>` of 28px state icons + text + time |

**Data:** user's assignments (by uid), their progress docs, last 5 activity
events (derived from progress/attempts/certificates, no separate log in v1).

**States:** no assignments (EmptyState: "Nothing assigned yet. Browse the
catalogue." + link); no in-progress course (continue card replaced by
"Start {first assigned}" card); overdue (chip danger "Overdue by 3 days").

**Ordering:** mandatory first, then due date ascending, then title; completed last.

**Edge cases:** long course titles wrap to 2 lines then ellipsis; >10
assignments paginate "Show all"; first name missing → "Namaste".

## 03 · Course overview — `/courses/:courseId` [M2]

| Region | Spec |
|---|---|
| Hero band | `--cover-forest` full width, padding 32/40; breadcrumb; chips; `<h1>` Fraunces `clamp(36px,4.4vw,54px)`; description 17px `--chrome-text`; meta row (parvas, lessons, Parikshas, time, certificate); actions: chrome Button "Resume — {item}" (the "Preview certificate" button is dropped: nothing that looks like a certificate exists before one is earned) |
| Outline | One Card per parva. Header row: 26px state icon (done ✓ solid accent / current numbered ring / locked lock), micro label "PARVA n", title 16px/600, right meta. Current parva expanded: item rows 52px (`<a>`), state icon, title, "Up next" chip, type · minutes right |
| Sidebar | Progress card (96px ring, `dl` of lessons/Parikshas/due, pass rule sentence), "What you will learn" list, Acharya card |

**Item states:** done (accent-soft icon ✓), current (solid accent play), available
(neutral number), locked (sunken lock, row not a link, `aria-disabled`, tooltip
"Pass Pariksha II to unlock").

**Expand/collapse:** parva headers are `<button aria-expanded>`; the current
parva is open by default; others collapsed. Remember per course in localStorage.

**Not started:** action reads "Start course"; ring 0%.

## 04 · Lesson player — `/courses/:courseId/learn/:itemId` [M2]

**Shell:** focused top bar with course progress.

| Region | Spec |
|---|---|
| Outline rail | `flex 1 1 280px`, `--bg`, right border; parvas collapsed except current; item rows 40px; current item white with `--shadow-xs` and `aria-current="page"` |
| Article | `flex 999 1 560px`, padding 40/72; max-width 780 centred; gap 28 |
| Title block | Micro label "PARVA 3 · LESSON 4 OF 4" accent; `<h1>` Fraunces 40px; chips (type, duration) |
| Blocks | Rendered in order by type (see block specs below) |
| Footer | Top border; secondary "◂ {previous}"; primary "Mark complete · {next}" |

**Layouts:** `stacked` (as drawn); `split` (≥1100px: first video block sticky
left 55%, remaining blocks scroll right; below 1100 falls back to stacked);
`article` (no video emphasis; max-width 680, larger prose).

**Block specs**

| Block | Spec |
|---|---|
| video | 16:9, `--radius-xl`, provider iframe (`youtube-nocookie`), title for a11y; caption line 13px; fallback link |
| markdown | 16.5px/1.75 `--text-body`; inline code mono 14px on `--surface-sunken`; lists 16px |
| code | `CodeBlock`: header (file name or "terminal", Copy → "Copied" for 2s, `aria-live`), body mono 13.5/1.7, horizontal scroll, highlighted lines |
| callout | tone ground + line, icon, bold title, 15px text |
| image | max-width 100%, `--radius-lg`, required alt, optional caption |
| embed | allow-listed iframe, 16:9 default, title required |
| file | 48px link row with icon and label |
| check | ungraded question card; answer revealed on submit, no network |

**Mark complete:** disabled with tooltip until `completeWhen` is met
(video90: from the player API's progress; scrolled: end sentinel visible).
On click: optimistic update of rail + top bar, write progress, navigate to the
next item. If the next item is a locked Pariksha it opens; if the course is
finished → Complete screen.

**Keyboard:** `J`/`K` previous/next item (only when focus is not in an
input), documented in a "Keyboard shortcuts" dialog (`?`).

**Edge cases:** last lesson of course ("Finish course"); lesson with no blocks
("This lesson is empty" for learners — Studio prevents publishing it); deleted
item URL → redirect to resume point with a Toast.

## 05 · Pariksha — `/courses/:courseId/pariksha/:parikshaId` [M3]

**Shell:** focused top bar with "Exit Pariksha" (confirm dialog if an answer
is unsaved, i.e. picked but not yet checked or moved past) and "Answers are saved on
this device as you go".

| Element | Spec |
|---|---|
| Header | Micro label in `--warning` "PARIKSHA II · BRANCHING & MERGING"; "Question 3 of 6" |
| Progress | `grid repeat(n,1fr)`, 6px segments: answered `--accent-decor`, current `--text`, rest `--border-strong` |
| Question card | `--surface`, `--radius-xl`, padding `clamp(24px,4vw,40px)`; prompt Fraunces 28px/1.3; inline code mono on sunken |
| Options | `QuizOption` stack, gap 12, inside `<fieldset>` + visually hidden legend |
| Feedback | `role="status"`: "Correct." / "Not quite — the answer is B." + explanation |
| Footer | rule line ("Pass mark 70% · Retakes allowed after 10 minutes"), Previous, Check answer → Next question |

**Keyboard:** `1`–`4` / `A`–`D` select; Enter checks, then advances.

**States:** checking (button loading; options locked) · cooldown active
("You can retake this in 6 minutes", Pariksha not startable) · function error
(Toast "Could not check your answer. Try again." — selection kept).

## 06 · Pariksha result — `/courses/:courseId/pariksha/:parikshaId/result` [M3]

| Element | Spec |
|---|---|
| Score card | 148px ring (score/total in Fraunces), chip pass/fail, `<h1>` "Pariksha II cleared." / "Not this time." , explanation sentence, actions: primary "Continue to Parva 4" (pass) or "Revisit lessons" (fail), secondary "Retake" (with cooldown countdown) |
| Review | Card with a row per question: ✓/✗ icon, question, your answer (struck through when wrong), correct answer and explanation (if `revealAnswers` allows), "Revisit lesson: {title}" link |

Fail state uses the warning palette for the chip, never red for the whole card.

## 07 · Course complete — `/courses/:courseId/complete` [M3]

`--chrome` full page with the faint concentric motif. Left: micro label
"SIDDHI · COURSE COMPLETE", Fraunces headline `clamp(40px,4.6vw,60px)`,
summary sentence, 3-stat `dl` (Pariksha average, time invested, completed on),
actions: chrome "View & download certificate", ghost "Add to LinkedIn",
ghost "Copy verify link" (Toast "Link copied"). Right: certificate thumbnail
(the real certificate scaled, `--shadow-float`, -1.5° rotate, link) and an
"Up next in your queue" card.

Reached once automatically after completion; later from the course page.

## 08 · Certificate — `/certificates/:id` (owner) and `/verify/:id` (public) [M3]

Fixed 1123×794 (A4 landscape) scaled to fit the viewport; print stylesheet
prints exactly one page with no app chrome.

| Element | Spec |
|---|---|
| Frame | 22px `--cover-forest` border; `--paper` sheet with 18px inset; 1px `--gold` hairline; 4 corner ornaments |
| Badge | Dark rounded plate with logo + "Gurukul" (the logo needs a dark ground) |
| Title | "CERTIFICATE OF COMPLETION", 13px/600, 0.42em tracking, `--gold-text` |
| Lines | Fraunces italic 19px `#3D4F49`-ish role `--text-body` on paper |
| Name | Fraunces italic 66px; shrink to fit for names > 28 characters (min 44px) |
| Course | Fraunces 500 38px `--cover-forest` |
| Footer grid | signature block · seal (132px, forest + gold, text on circle path) · "Certified by NonStop Gurukul", date, credential id, verify URL |

**Verify page:** small header, the certificate, and a status panel: "Valid —
issued 9 November 2026 to Priya Kulkarni for Git, the NonStop Way (version 3)"
or "Revoked on …". Not found → plain 404 message. `noindex`.

**A11y:** the certificate is real text (selectable, readable by screen
readers); the seal SVG has `role="img"` with a label.
