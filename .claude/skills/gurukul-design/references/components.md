# Gurukul component recipes

Each recipe lists the tokens it uses, its states and its accessibility contract.
"Shipped" means it exists in `packages/ui`.

## Button — shipped

`<Button variant="primary|secondary|ghost|chrome" icon={…}>`; for links use
`<a className={buttonClass('secondary')} href>`.

| Variant   | Ground | Tokens                                             | Use                           |
| --------- | ------ | -------------------------------------------------- | ----------------------------- |
| primary   | work   | `--accent` / `--accent-on`, hover `--accent-hover` | The one main action in a view |
| secondary | work   | `--surface`, `--border-strong`, `--text`           | Everything else               |
| ghost     | work   | `--accent` text, hover `--accent-soft`             | Inline "+ Add lesson" actions |
| chrome    | chrome | `--chrome-accent` / `--chrome-accent-on`           | Primary action on dark chrome |

States: hover, `:focus-visible` (`--focus-ring`), disabled (0.5 opacity,
`not-allowed`). Height `--control-height`. Defaults to `type="button"`.

## CommandPalette — shipped

`<CommandPalette open onClose search={(q) => items} onQueryChange onSelect label placeholder emptyText pageSize>`.
Generic: the caller decides what is searched and what selecting does (global search passes pages).
`search` stays synchronous; results that need a network read start from `onQueryChange` and arrive
as a new `search`, which the palette re-runs.

| Part      | Tokens                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Layer     | fixed, centred 12vh from the top; backdrop is a real `<button>` (ink at 55%) that closes                    |
| Panel     | `--surface`, 1px `--border`, `--radius-xl`, `--shadow-float` (it floats), max 640px wide, 70vh tall         |
| Input row | 44px input, `--text-md`, `Esc` key cap                                                                      |
| Option    | 44px, `--radius-md`; selected `--accent-soft`; label 14/600, sub 12 `--text-muted`, kind 12 `--text-subtle` |
| Footer    | key hints, `aria-hidden`                                                                                    |

Keyboard: focus stays in the combobox (`aria-activedescendant`); ↑ ↓ move (clamped), Enter opens,
Escape closes, Tab is held; Enter ignored while an IME composes. Options are `tabIndex={-1}` and
swallow `mousedown` so a click never steals focus. Twenty rows, then "Show N more". A
`role="status"` region announces the count; focus returns to the opener on close.

## Icon — shipped

`<Icon size? label?>{paths}</Icon>` and one named component per glyph in use (`CheckIcon`, `XIcon`,
`AlertIcon`, `LockIcon`, `SearchIcon`, …; the full list is in `src/Icon.tsx` and Admin → Design system).
Lucide-style stroke on a 16-unit grid: `currentColor`, 1.5 stroke, round caps and joins, 16px by default.
Decorative (`aria-hidden="true"`) unless given `label`, which makes it `role="img"` with that name; an
icon-only button names the button instead. Any SVG attribute (`className`, `strokeWidth`) passes through.
Draw a new glyph in `src/Icon.tsx` only when a screen uses it; never inline a one-off stroke SVG. Brand
marks, illustrations, charts and the seal stay their own SVG.

## Chip — shipped

`<Chip tone="neutral|accent|warning|danger|info|solid">Completed</Chip>`. A `<span>`, always with a word.

24px tall, `--radius-pill`, 12px/600. Tones: neutral (`--surface-sunken` / `--text-body`), accent
(`--accent-soft` / `--accent-soft-text`), warning, danger, info (each `*-soft` ground with its strong
colour as text), solid (`--accent` / `--accent-on`) for "Completed".

## ProgressBar and ProgressRing — shipped

`<ProgressBar value label showValue? caption?>` (`caption` replaces the printed percentage, e.g. "44% · 10 / 22"), `<ProgressRing value label size? stroke?>`. `value` is 0 to 100,
rounded and clamped. Track `--border`, fill `--accent-decor`, `--radius-pill`; bar 8px tall, fill
animates on `--dur-slow`. The element with `role="progressbar"` carries `aria-valuenow/min/max` and
`aria-label`; the bar prints the percentage beside it (`showValue={false}` to hide), the ring prints it
in the middle (hidden from assistive tech, the role already says it).

## Card — shipped

`<Card as="div|section|article|li" highlighted?>`. `--surface`, 1px `--border`, `--radius-xl`,
`--space-5` padding, no shadow. `highlighted` (the current chapter) swaps to `--accent-soft` ground,
`--accent-line` border and `--accent-soft-text`. Give a `section` an `aria-label` so it is a landmark.

`title` (and `titleAs` h2/h3, `actions`) turns a card into a page section: a `section` named by
its heading (Inter 600 `--text-lg`), actions on the right. Every section of a page is a titled
Card; never an `h2` with a class above a `div`.

## Sidebar, SidebarGroup and NavItem — shipped

```tsx
<Sidebar brand={<>Logo Gurukul</>} label="Main" footer={<UserCard />}>
  <SidebarGroup label="Learn">
    <NavItem href="/" current icon={<svg />}>
      Dashboard
    </NavItem>
    <NavItem render={(p) => <Link to="/courses" {...p} />}>Courses</NavItem>
  </SidebarGroup>
</Sidebar>
```

Sidebar: `<aside>` on `--chrome`, 24px/16px padding, brand in Fraunces `--chrome-accent`, `<nav
aria-label={label}>` with the children, optional `footer` pinned with `margin-top: auto` above a
`--chrome-line` hairline. SidebarGroup: `role="group"` named by its micro label (`--chrome-label`,
12px/600 uppercase, `--tracking-label`). NavItem: 44px, `--radius-md`, `--chrome-text`; hover
`--chrome-hover`; `current` gives `--chrome-active`, `--chrome-text-strong` and `aria-current="page"`;
focus `--focus-ring`. Never a left-border indicator. `icon` is decorative (`aria-hidden`).

Router use: `render` receives the anchor props (`className`, `aria-current`, `children`, and any
`href`/`onClick` passed to NavItem) and returns the element. Spread them onto `Link`/`NavLink`. With no
`render` it draws a plain `<a>`.

## TopBar (focused mode) — shipped

`<TopBar title titleAs? back? status? actions? />`. Used by the lesson player, Quiz, result and
editors: a `<header>` on `--chrome`, wrapping flex row. `title` is the page `h1`, Fraunces `--text-lg`
`--chrome-text-strong`; `titleAs="p"` when the page below carries its own `h1` (one per page). A
`ProgressBar` in `status` draws 6px on `--chrome-active` with a mint fill and chrome-text caption. `back` is any node; give a link or button `className={topBarBackClass}` for the
44px chrome look. `status` (progress, "Saved") and `actions` (a `chrome` Button) sit on the right.

## Field, Input, Select, Textarea — shipped

`<Input label hint? error? …inputProps>`, `<Select label …>` with `<option>` children, `<Textarea label …>`.
`<Field label hint? error? id?>{(control) => <input {...control} />}</Field>` wraps any other control.

Label above (14/600 `--text-body`, bound with `htmlFor`), optional hint (12 `--text-subtle`),
control 44px, `--border-strong`, `--radius-md`, 16px text; focus `--focus-ring`. `error` turns the
border `--danger`, sets `aria-invalid`, and prints the message in `--danger` with an icon; hint and
error ids are joined into `aria-describedby`. Disabled is 0.5 opacity, `not-allowed`.

## Toggle — shipped

`<Toggle label checked? onChange? …>`. A real `<input type="checkbox" role="switch">` (Tab reaches it,
Space toggles) over a 40x24 track: off `--border-strong`, on `--accent`, thumb `--surface`. The input
covers a 44px target and the label is part of the same `<label>`. Focus ring on the track.

## Tabs — shipped

`<Tabs tabs={[{id, label, panel}]} label value? defaultValue? onValueChange? />`. `role="tablist"`
with `role="tab"` buttons and `role="tabpanel"` panels (all rendered, inactive ones `hidden`; panels are not tab stops), wired
with `aria-selected`, `aria-controls`, `aria-labelledby`. Roving tabindex, automatic activation:
Left/Right move and wrap, Home/End jump, focus follows. Tab 44px, 14/600 `--text-muted`; selected
`--accent` with a 2px `--accent` underline; focus `--focus-ring`. Controlled with `value`, otherwise
internal state seeded by `defaultValue`.

## DataTable and Pagination — shipped

```tsx
<DataTable
  caption="Learners"
  columns={[
    { id: 'name', header: 'Learner', cell: (p) => p.name },
    { id: 'n', header: 'Courses', cell: (p) => p.n, align: 'end' },
  ]}
  rows={page}
  rowKey={(p) => p.id}
  selectable
  selected={keys}
  onSelectionChange={setKeys}
  rowLabel={(p) => p.name}
  onRowClick={openDrawer}
  empty={<EmptyState title="No learners yet">…</EmptyState>}
  footer={<Pagination page={1} pageSize={25} total={148} onPageChange={setPage} />}
/>
```

Generic over the row type; no sorting. A `<table>` with a visually hidden `<caption>` (`caption` is required,
it is the table's name) in a `--radius-xl` hairline card. Header row 12px/600 `--text-muted` on
`--surface-sunken`, sticky inside the scroll box (give `maxHeight` for a vertical scroll); rows 14px,
1px `--border` separators; `align: 'end'` right-aligns numbers (tabular figures). The table is 640px wide
at least and scrolls horizontally inside its card on a phone.

Selection is controlled (`selected` is a list of row keys). The header checkbox is "Select all rows on
this page": it adds or removes only the rows passed in, keeps keys from other pages, shows
`indeterminate` when some are selected and is disabled with no rows. Each row checkbox is named
"Select {rowLabel(row)}" (falls back to the key). Selected rows sit on `--accent-soft`. With `onRowClick`
a row is a mouse target and an Enter shortcut (`tabIndex=0`, focus ring inside the row); keep a real link
or button in the row too, and the checkbox never triggers it. `empty` replaces the body when `rows` is
empty. `footer` goes under a hairline.

`<Pagination page pageSize total onPageChange label? />` is the footer: `<nav>` with a live "Showing 1–25
of 148" and secondary Previous / Next buttons (disabled at the ends). Pages start at 1.

## PeoplePicker — shipped

The one way to pick people, everywhere: a Jira-style typeahead. `<PeoplePicker label value onChange search
placeholder? removeLabel? allowEmails? classify? statusWords? total? describedBy? />`; `Person` is `{ email,
name?, photoUrl?, role?, tone? }`. A multi-select combobox: the input is `role="combobox"` with
`aria-expanded`, `aria-controls` and `aria-activedescendant` over a `role="listbox"` `aria-multiselectable`.
**Focus lists the first people** (`search('')`); typing narrows by name or email. Rows are `Avatar` with the
person's **photo** (initials when none), name, email and role, the match in `<mark>` (`--saffron-soft`), and
"Added" for people already chosen; with `total`, a footer says "Showing 10 of 42 people". The caller owns
`value` and `search(query) => Promise<Person[]>` (debounce and minimum length are its job); only the newest
answer is shown. Choosing a row **adds a chip, clears the text, closes the list and keeps focus**; ArrowDown
reopens, Backspace on an empty field removes the last chip, Escape closes the list (and stops there, so a
Dialog around it stays open), Enter picks the active row.

`allowEmails` is for someone who has not signed in yet: an email typed (then comma, `;` or a space) or pasted
becomes a chip, a typed email nobody has is offered as "Add “x@y.com”", and an email left in the field on blur
is kept; a name with spaces is never split. `classify(email) => { status, reason? } | null` makes each chip say
what it means in words (`signedIn` `--accent-soft`, `new` hairline, `alreadyAssigned` `--surface-sunken`,
`rejected` `--danger-soft`; `null` says nothing); `statusWords` changes the words ("new" → "Invited").
`splitEmails(text)` is exported for CSV flows. Chips are named "Remove {name}" and listed as "{label}: added
people". In `apps/web`, `PeopleField` wires it to the console's people (`usePeopleLookup`: first ten, then
prefix search) and keeps plain emails for the page. Use it wherever a person or several are chosen (assign,
team members); never a bare email box, never a checkbox list of everyone. The list sits 4px under the field
(`--shadow-menu`, `--radius-lg`, `--z-menu`, at most 22rem tall).

## StepCard (Stepper.Step) — shipped

`<StepCard number title headingAs="h2|h3|h4">children</StepCard>`; `Stepper.Step` is the same component.
A `<section aria-labelledby>` card (`--surface`, hairline, `--radius-xl`) with a 32px `--accent` number
badge (decorative) and the title in Fraunces `--text-xl`. The heading carries a visually hidden "Step N:"
so the number is spoken. Stack several for a form; the sticky summary is the caller's layout.

## FlowSteps, FlowPanel (Stepper.Flow) — shipped

`<FlowSteps steps={['Course', …]} current={1} label? />` is a `<nav>` with an ordered list of numbered
steps: done steps show a tick (and say "(done)" to a screen reader), the current one has
`aria-current="step"` and an `--accent` underline. Under 40rem the list collapses to the sentence
"Step 2 of 4: Audience". `<FlowPanel direction="forward|back" key={step}>` is the step body: it slides
24px in from the side of travel over `--dur-slow` `--ease`, and only fades under reduced motion. The
caller owns the step, the Back and Next buttons, validation (words under the step, focus moved to
them) and moving focus to the step heading. Nothing is saved before the last step.

## SuccessCheck — shipped

`<SuccessCheck size? />`: a decorative `--success` ring and tick that draw once (`--dur-base`,
`--ease-spring`). Put the result in words beside it (`role="status"`); never use it for a mere save.

## Dialog — shipped

`<Dialog open onClose title size="md|drawer" footer? closeLabel?>children</Dialog>`. Rendered in a portal
(`role="dialog" aria-modal="true" aria-labelledby` the Fraunces `h2` title). On open focus moves to the
first focusable thing in the body (the close button if there is none); Tab and Shift+Tab wrap inside;
Escape and the backdrop (a real button, ink at 55%) close; page scroll is locked and restored; focus
returns to the opener on close. A 44px close button sits in the header. `md` is a centred panel, max
560px, `--radius-xl`, `--shadow-float`; `drawer` is full height on the right, 480px, slides in on
`--dur-slow` (no motion under reduced motion). `footer` is pinned under a hairline, usually buttons.
The caller owns `open`. One dialog at a time.

## BarChart — shipped

`<BarChart data={[{label, value}]} title unit? labelHeader? />`. SVG (viewBox 640x260, scales to its
container), no chart library. Light `--border` gridlines at five steps up to a rounded-up maximum
(`niceMax`), y labels and x labels 11px `--text-muted`; bars `--accent-line` (the green-200 role), the last
bar `--accent` with its value printed above it. `role="img"` with an `aria-label` summarising the chart
(count, first, last, highest) and a visually hidden `<table>` (caption = `title`, columns `labelHeader`
and `unit`) with every value. Empty `data` renders nothing: show an EmptyState instead.

## FunnelBar — shipped

`<FunnelBar rows={[{label, value}]} label highlight? highlightLabel? />` and the pure
`largestDrop(values): number | null`. A `<ul>` named by `label`; each row is label (up to 190px) · 26px bar
(`--accent-line`, on `--surface-sunken`, relative to the largest value, decorative) · count at the right.
`highlight` is a row index: that row's bar turns `--warning-line`, its count `--warning`, and a
"Largest drop" pill (`--warning-soft`, `highlightLabel` to reword) says so in words. Pass
`highlight={largestDrop(rows.map(r => r.value))}`: it returns the index of the step with the biggest drop
from the step before (first one on a tie), or `null` for fewer than two steps or no drop at all. Write the
callout sentence from the same numbers, never by hand. On a phone the bar drops under the label.

## Callout — shipped

`<Callout tone="note|tip|warning" title>body</Callout>`. `role="note"`, `--radius-lg` box on a soft
state ground with a 1px matching line, a 20px icon (`aria-hidden`) and a bold lead-in. note: `--info`
on `--info-soft` / `--info-line`; tip: `--warning` on `--warning-soft` / `--warning-line`; warning:
`--danger` on `--danger-soft` / `--danger-line`. No left-border accent.

## EmptyState — shipped

`<EmptyState title headingAs="h2|h3|h4" icon? action?>one line why and what next</EmptyState>`. Centred
on `--surface` with a 1px dashed `--border-strong` and `--radius-xl`; title in Fraunces `--text-xl`
(heading level to fit the page, default `h3`), text `--text-muted` max 44ch, `action` is usually a
Button. Say what is missing; never invent numbers.

## Skeleton — shipped

`<Skeleton shape="text|block|circle" width? height? />`. A still `--surface-sunken` placeholder
(`--radius-sm` / `--radius-lg` / pill), `aria-hidden`. It does not animate, so there is no shimmer and
no reduced-motion case. Mark the loading region `aria-busy="true"` and say what is loading in text
where it matters.

## Toast — shipped

```tsx
<ToastProvider duration={5000}>…</ToastProvider>; // once, near the root
const toast = useToast();
const id = toast.show('Progress saved', { tone: 'success', duration: 5000 });
toast.dismiss(id);
```

Tones `info` (default), `success`, `warning`, `danger`. Options: `title` (bold first line; the
message becomes the one line of detail), `code` (mono, such as `NET-OFFLINE`), `action`
(`{ label, onSelect }`, closes the toast after it runs), `duration`. Default time by tone: success
4s, info 6s, warning 8s, danger until closed (a provider `duration` overrides all). Each tone has an
icon plus a screen-reader word, never colour alone. A thin timer bar runs down and the timeout
pauses on hover and focus, resuming with what was left. Three at a time: the oldest is dropped.
Enter on `--ease` / `--dur-base`, exit on `--ease-in` / `--dur-fast`; under reduced motion the
durations are 0. The provider keeps two live regions mounted from the start: `role="status"` for
info, success and warning, `role="alert"` for danger. Toasts stack bottom-right (full width on a
phone), `--radius-lg`, `--shadow-xs`; each has a 44px dismiss button named by `dismissLabel`
(default "Dismiss"). `useToast` outside a provider throws.

A failed action goes through `toastError(toast, error, fallback, retry?)` in
`apps/web/src/errors.ts`: `describeError` maps an `ApiClientError` to a type (network, permission,
validation, not-found, conflict, rate-limit, server), the catalog's sentence, a retry rule and a UI
code; a rate limit warns, everything else is a danger toast, and Retry shows only when the error is
retryable and the caller passes `retry`. A toast is never the only place an error that blocks work
appears: a form error stays on the form.

## StateCard — shipped

`<StateCard variant="error|offline|forbidden" title code? kind? actions? headingAs?>message</StateCard>`.
A bordered `--surface` block: tinted icon square (danger, warning, sunken), the title in the display
face, one or two sentences, `code · kind` in mono (`NET-TIMEOUT · Network`), then the actions (Retry
primary, a way back secondary). `error` has `role="alert"`, `offline` `role="status"`, `forbidden`
no live role (it is a page, not an event). Empty is not here: use `EmptyState`, and a filtered-empty
list offers "Clear filters" inside it. Loading is `Skeleton` / `GlobalLoader`. Never show raw
exception text; take the sentence and code from `describeError`.

## CodeBlock — shipped

`<CodeBlock code fileName? variant="code|terminal|output" highlight="2,4-6" copyLabel? copiedLabel? failedLabel? />`.
Header `--code-header`: name in mono 12px `--code-comment` (`fileName`, else "terminal" or "code") and a 44px
Copy button (`--code-text`, hover `--chrome-hover`). Body `--code-bg`, `--code-text`, mono 13.5px/1.7, one
block per line, `--radius-lg`. Highlighted lines (`highlight`, 1-based, numbers and ranges, junk ignored) get
`--chrome-active` and a 2px `--chrome-accent` bar. `terminal` prefixes each line with a `$` prompt in
`--code-keyword` drawn by CSS, so it is never copied or selected. `output` is what a command printed back:
labelled "output", no prompt, body on `--code-header` with a hairline, so a command and its reply never look alike.
The lesson player shows a terminal block with `copy: false` as `output`.

Copy writes the whole `code` with `navigator.clipboard.writeText`, flips the button to "Copied" (check icon) for
2s (a second click restarts the timer), and a `role="status"` region next to it announces "Copied". If the
clipboard refuses, the label stays "Copy" and the region says "Could not copy". The body is
`role="region"` named by the header name with `tabIndex=0`, so a keyboard can scroll it; it scrolls
horizontally and never wraps.

## VideoBlock — shipped

`<VideoBlock src title href caption? linkLabel? frameRef? />`. Presentational: the caller picks the provider and builds
the embed `src` (for example `youtube-nocookie`); the component only frames it. `frameRef` hands the `<iframe>`
to a caller that talks to the provider's player API (the lesson player's watch tracking). A `<figure>` with a 16:9
frame, `--radius-xl`, `<iframe title loading="lazy">`, an optional `<figcaption>` (13px `--text-muted`) and an
always-visible 44px link "Open the video in a new tab" (`href`, `target="_blank"`, `rel="noopener noreferrer"`)
for when the embed is blocked.

## QuizOption — shipped

`<QuizOption letter="A" checked onChange={(checked) => …} multiple? state="idle|correct|incorrect|locked" name value>Answer</QuizOption>`.
A real radio (default) or checkbox (`multiple`) inside its `<label>`, so Tab, arrows, Space and screen
readers behave natively; group them in a `<fieldset>` with a legend. The caller owns `checked`. 44px min,
`--radius-lg`, 32px letter badge. States: idle `--border-strong`; selected (idle and checked) `--text`
border and filled badge; correct `--accent-decor` border on `--accent-soft` with a check icon and the
word "Correct"; incorrect `--danger` border on `--danger-soft` with a cross and "Incorrect"; locked
`--surface-sunken`, `not-allowed`. correct, incorrect and locked disable the input. Feedback and the
right answer in words belong in the caller's `role="status"` region. Colour is never the only signal.
Focus ring is on the card (`:has(:focus-visible)`). Border and ground animate on `--dur-base`.

## ResultRow — shipped

```tsx
<ul>
  <ResultRow
    passed={false}
    question="What does pull do?"
    yourAnswer="Only fetches"
    correctAnswer="Fetches and merges"
    revisit={{ href: '/lesson/3', label: 'Revisit lesson: Pulling' }}
  >
    Pull is fetch followed by merge.
  </ResultRow>
</ul>
```

A review row, an `<li>` (put rows in a `<ul>` or a Card). 28px pass (`--success` on `--success-soft`) or fail
(`--danger` on `--danger-soft`) icon, hidden from assistive tech; the question is prefixed with a visually
hidden "Correct." or "Incorrect.". "Your answer" is struck through (`<s>`) when wrong; "Correct answer" shows
only when `correctAnswer` is given (omit it when the Quiz does not reveal answers); `children` is the
explanation slot; `revisit` is a 44px link, with the same `render` escape hatch as NavItem for a router.

## Breadcrumb — shipped

`<Breadcrumb items={[{label, href?, render?}]} label="Breadcrumb" />`. `<nav aria-label>` around an `<ol>`;
chevron separators are `aria-hidden` SVG. The last item is the current page: plain text with
`aria-current="page"`, never a link. Other items are links (`href`, or `render` like NavItem so a router
`Link` can be used), or muted text when they have neither. 44px targets, links `--accent`, current
`--text` 600, separators `--text-subtle`, focus `--focus-ring`.

## Seal, Certificate, StatCard — shipped

`<Seal label="Seal of NonStop Gurukul" ringText="NONSTOP GURUKUL · CERTIFIED · " centerText="G" size={132} />`.
SVG with `role="img"` and the required `label`. `--cover-forest` disc, two `--gold` rings, `ringText` on a
circle path (`textPath`, spread over the whole circle, so end it with a separator), `centerText` in Fraunces
italic. Path id comes from `useId`, so several seals can share a page.

`<Certificate learnerName courseTitle issuedOn credentialId verifyUrl signatoryName signatoryRole revoked? organisation? />`.
Designed at 1123x794 (A4 landscape) and scaled to its container's width in CSS only
(`container-type: inline-size`, `scale(calc(100cqw / 1123px))`); the container needs a width, the height
follows. Spec in `.plan/design-handoff/01-learner.md` section 08: 22px `--cover-forest` frame, `--paper` sheet,
18px inset, 1px `--gold` hairline, four corner ornaments, "Gurukul" badge as text (no PNG), title 13px/600
0.42em `--gold-text`, Fraunces italic lines, course Fraunces 500 38px, footer with signature, 132px Seal,
organisation, date, credential id and verify URL (plain text so it survives print). All real, selectable text.
`organisation` defaults to "NonStop Gurukul" and feeds the seal. `revoked` adds a band reading "Revoked:
this certificate is no longer valid" (danger colour plus words); the certificate stays readable.
`nameFontSize(name)` (exported, pure): 66px up to 28 characters, then `floor(66*28/length)`, minimum 44px.

**Print pattern.** `Certificate` always carries `printCertificateClass` (`g-cert-print`). In `@media print`
(`@page { size: A4 landscape; margin: 0 }`) everything under `body` is `visibility: hidden` except the
element with that class, which is fixed at top-left, 1123x794, unscaled. So the page needs no print code of
its own: render one Certificate and call `window.print()`. Put `print:`-style `display: none` on the app
chrome (sidebar, top bar) as well, since `visibility` keeps its space and could spill onto a second page.

`<StatCard label value sub? />`. A one-entry `<dl>`: `dt` label (12px caps, `--text-muted`), `dd` value
(Fraunces 500 36px, `--text`), optional `dd` sub line. Hairline card like Card. Put several in a grid.

## DragList, BlockFrame, ColourSwatch, TypeTile — shipped

`<DragList items itemKey renderItem onMove label itemLabel>`. An `<ol>` of `<li>`; `renderItem(item, { index, handle, dragging })`
gets a real grip `<button>` (`handle`) that the caller places. The grip is named "Move {itemLabel}" and is
`aria-pressed` while lifted. Keyboard: Space or Enter lifts, ArrowUp/ArrowDown move (clamped), Space or Enter
drops, Escape cancels, `Alt+Arrow` on the grip moves one place without lifting, losing focus drops.
**`onMove(from, to)` semantics:** from the keyboard it fires live on every arrow press (so the caller reorders
`items` at once; Escape fires it once more to restore the start position); from a pointer it fires once, on
drop. Pointer: press the grip and travel 4px to start a drag; a 2px `--accent` line shows the drop slot (none
when it would not change anything); `pointercancel` or Escape abandons it. Pointer capture is used when the
browser has it. Moves are announced in a visually hidden `role="status"` region ("Picked up…", "Moved Merging
to position 3 of 5", "Dropped…", "Cancelled"). Give every item a stable `itemKey` so the grip keeps focus when
its row moves. Transitions use `--dur-*`, which are 0 under `prefers-reduced-motion`. `moveItem(list, from, to)`
(exported, pure) returns a reordered copy, `to` clamped.

`<BlockFrame label handle? controls? onDuplicate? onDelete? selected? error?>`. A `role="group"` named
"{label} block". `--surface`, 1px `--border`, `--radius-lg`. Header: handle, `label` as a 12px caps micro label,
`controls`, then 44px icon buttons "Duplicate {label} block" and "Delete {label} block", each only when its
handler is given. `selected`: `--accent-decor` border, 2px. `error`: `--danger` border and, under the header, a
`role="alert"` line with an icon on `--danger-soft`.

`<ColourSwatch value="forest|sand|sky|stone" onChange label>`. A `role="radiogroup"` of four real radios inside
labels, each a 44px swatch (`--cover-forest|sand|sky|stone`) with its name beneath. Checked: `--accent` ring plus
a check icon, never colour alone. Focus draws the ring on the swatch. The cover roles live in `tokens.css` and `tokens.ts`.

`<TypeTile kind="reading|video|code|quiz">`. A 30px, `--radius-sm` tile with an icon and the kind as visually
hidden text. reading `--surface-sunken`, video `--accent-soft`, code `--code-bg`, Quiz `--warning-soft`.

## MediaGallery, MediaPreview — shipped

`<MediaGallery label items selectedId? onSelect>`. A `<ul>` grid (`minmax(10rem, 1fr)`) of tile `<button aria-pressed>`:
`MediaPreview` on top, the name (one line, ellipsis) and a `meta` line ("PDF · in 3 courses"). Pressed: `--accent`
border. Items are `{ id, name, meta, kind, url? }`, `kind` one of image, video, embed, pdf, audio, file.
`<MediaPreview kind url? size="tile|large">` is the preview alone, for the detail panel: an image shows its
thumbnail (and falls back to the typed tile when it does not load); every other kind is an icon on a tinted tile
with the kind's name, never colour alone. `mediaKindName(kind)` gives the name for filter chips. The page owns
search, type chips (`Chip`/pressed buttons), the detail (`Dialog size="drawer"`) and Copy link.

## Avatar — shipped

`<Avatar name tone? size? label?>`: initials in a circle. Initials are the first letters of the
first and last word ("Asha Rao" → AR), one word's first letter, an email's local part, or "?".
`tone` picks the ground by role: `learner` (default) `--avatar-learner`, `educator`
`--avatar-educator`, `admin` `--avatar-admin`; text `--avatar-on`, Inter 600. Sizes 24 / 34 / 36
(default) / 48. Decorative (`aria-hidden`) because the name is always printed beside it; with
`label` it becomes `role="img"`. Never a Google photo.

## IconButton — shipped

`<IconButton label tip? tone="neutral|danger">icon</IconButton>`: a 36px icon-only button for dense list rows
(rename, move, delete). Quiet (`--text-muted`) until hover (`--surface-hover`); `danger` is `--danger`
with `--danger-soft` on hover. `label` is the accessible name ("Rename What Git solves"); `tip` is the
short tooltip drawn from `data-tip` on hover and keyboard focus ("Rename"). `iconButtonClass(tone?)` and
`Menu`'s `tip` give a menu trigger the same look. A clickable row keeps its buttons above the stretched
link (`position: relative; z-index: 1`).

## Menu — shipped

`<Menu label items trigger? triggerClassName? align? placement?>` — actions on a thing (row,
card, account). `items` are `{ label, onSelect, icon?, danger?, disabled?, hint? }` or
`{ separator: true }`; destructive items last, after a separator, `danger`.

- Trigger: `<button aria-haspopup="menu" aria-expanded aria-controls aria-label={label}>`.
  `label` is required for the default icon trigger and left out when the trigger shows text
  (that text names it; an `aria-label` that differs fails WCAG 2.5.3 in the browser's axe);
  default a 44px ghost icon button with `MoreIcon`. `triggerClassName` replaces its look.
- Panel: `role="menu"` labelled by the trigger, absolutely placed (no portal), `--z-menu`,
  `--surface`, hairline, `--radius-lg`, `--shadow-menu`, min 12rem; `placement` bottom/top,
  `align` end/start. Items are 44px `role="menuitem"` buttons; disabled ones are `aria-disabled`.
- Keyboard: Enter/Space/click open at the first item, ArrowDown/ArrowUp open at first/last;
  inside, arrows move with wrap (skipping disabled), Home/End, a letter jumps; choosing runs
  `onSelect`, closes and returns focus; Escape closes, returns focus and does not reach an outer
  dialog; Tab closes; a press outside closes.

## AreaSwitcher — shipped

`<AreaSwitcher items label?>` with `Sidebar switcher={…}` — Learn, Studio and Admin as a compact
row of links under the brand: `<nav aria-label="Areas">` on `--chrome-raised`, each link 44px,
`--radius-sm`, hover `--chrome-hover`, the current area `--chrome-active` with `aria-current="page"`
(colour changes on `--dur-base`). Items are `{ id, label, href, current?, render? }`; `render` lets
the router draw the link (as `NavItem`). Render it only when the person may open more than one
area; the app derives the areas from the navigation catalog and the current one from the route. With
a switcher the sidebar lists only the current area's pages; the others are one click away.

## Motion — shipped

Only `opacity` and `transform` move, on tokens: a route change fades and rises 8px over
`--dur-page` (`.route-enter` on the keyed page wrapper in `Shell`; focus handling is `routeFocus`,
unchanged). Menu and command-palette lists rise 6px over `--dur-base`; the dialog panel rises and
scales from 0.97, its scrim fades, the drawer slides, all over `--dur-slow` on `--ease`. A list
enters staggered with `className="g-stagger"` on its parent and `style={{ '--i': index }}` on each
child: 30ms a step, the first eight only. Reduced motion sets every `--dur-*` to 0, so nothing
stays mid-movement; never add a transform animation with a literal duration.

## UserCard — shipped

`<UserCard name detail tone roleLabel? items menuLabel?>` — the signed-in person at the foot of the sidebar;
`roleLabel` (their role in their label set) fills the menu's header (name, email, role `Chip`) above
the items, via `Menu header`;
the whole card is the account `Menu` trigger (named "Account: Asha Rao"). Avatar 36, name 600
`--text-sm` `--chrome-text-strong`, detail `--text-xs` `--chrome-text`, both ellipsised; chevron
up; `--chrome-raised`, hover `--chrome-hover`. Menu opens upward, card-wide. Its items are
Profile, the label switch, What's new and Sign out — Sign out is always there.

## AppShell — shipped

`<AppShell sidebar bar? navKey? menuLabel? sidebarId?>` — the only sidebar layout. Children are the
content column; the app renders `<main id="content">` inside. ≥ 64rem: grid
`var(--sidebar-width) minmax(0,1fr)`, the sidebar container sticky at `top: 0`, `height: 100dvh`,
its nav scrolling inside so the `UserCard` never leaves the screen; the bar (search) sticky with a
hairline. < 64rem: the sidebar is a drawer (`--z-drawer`, `min(85vw, 18rem)`, slides on
`--dur-base`) over a `--scrim`, opened by the "Menu" button (`aria-expanded`, `aria-controls`).
Opening focuses the first link; Escape or the scrim close it and return focus; the content is
`inert` while open; a new `navKey` (the pathname) closes it; widening past 64rem closes it.
Never give the `Sidebar` an id or its own open state.

## Page and PageHeader — shipped

`<Page width? aside?>` — every screen's outer column: `reading` (780), `default` (1120), `wide`
(1280) from `--width-*`; padding `--space-8` / `clamp(--space-4, 4vw, --space-12)` / `--space-16`;
children stacked `--space-6` apart. `aside` makes a `minmax(0,1fr) 20rem` grid at ≥ 64rem and
stacks below. A `div`: the shell owns `<main>`.

`<PageHeader title eyebrow? lead? breadcrumb? meta? actions?>` — the first child of `Page` and the
only `h1`. Breadcrumb above; then eyebrow (micro label), title (Fraunces 500 `--text-3xl`,
`--text-2xl` below 40rem), meta (chips), lead (`--text-muted`, 60ch); actions right, wrapping
under on narrow screens. At most one primary button in `actions`.

## PageSkeleton — shipped

`<PageSkeleton width? label?>` — a page's first load: a header-shaped skeleton and three
card blocks inside a `Page` of the same width, `role="status"`, `aria-busy`, a hidden "Loading"
label. Use it instead of "Loading…" text.

## Select (styled native) — shipped

A native `<select class="g-control g-control--select">` inside `span.g-select` with a decorative
`ChevronDownIcon` on the right (`pointer-events: none`). `appearance: none`, 44px, 16px text (no
iOS zoom), ellipsis. Still role `combobox`, so phones show their own picker and e2e `selectOption`
works. Filter selects start with "Any …". Never a raw `<select>` or a hand-built dropdown.

Every `.g-control` (input, select, textarea): hover border `--text-subtle`; focus border
`--accent` + `--focus-ring`; `aria-invalid` border `--danger`; disabled `--surface-sunken` ground,
`--text-subtle` text, not-allowed cursor (no opacity); placeholder `--text-subtle`.
`hideLabel` visually hides the label (still the accessible name): only inside `FilterBar`.

## Button: loading, size and the danger / chrome-secondary variants — shipped

- `loading`: disabled, `aria-busy="true"`, label kept, a 16px `currentColor` spinner replaces the
  icon (still under reduced motion). Use it instead of swapping the label to "Saving…".
- `size="sm"`: 36px, `--space-3` padding, dense rows only. `buttonClass(variant, extra, size?)`.
- `quiet`: borderless, `--text-body`, hover `--surface-hover`. Neutral edits in a dense row (Rename, Collapse).
- `danger-quiet`: borderless, `--danger` text, hover `--danger-soft`. The Delete or Remove in a row or card
  that opens a confirmation; never the confirm itself. With a `TrashIcon`.
- Roles in a row of actions, each with an icon: `quiet` neutral edits, `ghost` adding (`PlusIcon`),
  `danger-quiet` removing. Grey, green and red, so no two actions read alike and a row stays light.
- `danger`: `--danger` ground, `--danger-on` text — only the confirm of a destructive `Dialog`.
- `chrome-secondary`: transparent, `--chrome-text`, `--chrome-line` border, hover
  `--chrome-hover` — secondary actions on the dark top bar (beside a `chrome` primary).

## FilterBar — shipped

`<FilterBar label count? onClear? canClear? clearLabel?>` — search, filters and Clear above a
filtered list. A `role="group"` named by `label`; children (`Input`/`Select` with `hideLabel`,
`Toggle`) wrap at `flex: 1 1 12rem; max-width: 18rem`, the first (search) grows. At the end: a
ghost "Clear filters" when `canClear`, and `count` ("3 of 4") in a `role="status"` paragraph.

## SegmentedControl — shipped

`<SegmentedControl label value options onChange>` — 2–4 mutually exclusive modes with no panels
(use `Tabs` when there are panels). A `role="group"` of buttons with `aria-pressed`; track
`--surface-sunken`, pressed button `--surface` + `--shadow-xs`; 44px overall. Left/Right move focus.

## DataTable: read-only tables — shipped

A column with `rowHeader: true` renders its cells as `<th scope="row">`. A read-only table (the
role matrix, the Quiz table, the funnel) is a `DataTable` with a `caption`, `align: 'end'` on
number columns, no selection and no paging. Never `<table class="plain-table">`.

## VideoBlock: not recorded yet — shipped

`placeholder="Video coming soon."` keeps the 16:9 dark frame and shows the message (with a play
glyph) in it instead of a player; no open-in-new-tab link. Never bare text where a video goes.

## CourseTile — shipped

`<CourseTile as="li" title heading={<Link to=…>{title}</Link>} image? theme chips? summary? extra? meta? />`.
A course in any list: a 16:9 cover (the course's picture, else its name in Fraunces on its own cover
colour, `forest` white ink, the others the fixed paper ink), then chips, the title, the summary, an
`extra` block (a progress bar) and a meta line. The picture comes from `courseImageUrl(course)` (the
first image in its lessons); a missing or broken picture falls back to the name, so there is never an
empty box. **The whole tile is the link**: the title's link stretches over it, so keyboard and screen
readers still meet one link, and hover lifts the tile and underlines the title. Lists use
`.learn-cards` with `g-stagger`. Never a text-only row for a course.

**Picking courses** (assign, grant): give the tile `selected` and `onSelectedChange` (apps/web wraps it as
`CourseChoice`). A real checkbox named after the course sits in a badge on the cover and its label covers the
whole tile, so a click anywhere toggles it. Selected: `--accent` 2px ring, the tick pops in (`--dur-slow`) and
the picture settles; `:focus-visible` shows the focus ring. Never a checkbox beside a title for a course.

## ChoiceCard — shipped

`<ChoiceCard icon title meta? selected onSelectedChange selectLabel? disabled? as="li|div">`: one option in a pick-many list
of teams or people (a course is a `CourseTile` with `onSelectedChange`). A `<label>` fills the card, so a click
anywhere toggles the real checkbox inside; the icon sits in a tile (an icon, never a logo or photo), the title
is `--text-md` 600, `meta` one muted line (a member count, an email). Picked: `--accent` ring on an
`--accent-soft` card, the icon tile fills `--accent`, and the tick pops in (`--dur-slow`). Lay a list out with
`.console-choice-grid`. `disabled` (a limit, e.g. 15 teams) dims it and blocks picking. Pair it with a search field and a count ("Showing 10 of 23 teams") and "Show more".

## SearchCard — shipped

`<SearchCard label search={{ value, onChange, label, placeholder? }} views? filters? active? count? onClear? />`.
For a list people search (courses, media): one card, `role="search"`. A 52px search field with a
leading icon, its own clear button and Esc to clear; under it the views (a `SegmentedControl` of 2 to 4) on the left and `Select`s (`hideLabel`) on the right; under that the filters that are on as
removable chips (`Remove filter: Level: Foundation`), a Clear all filters button while anything is on,
and the live result count. Filters belong in the URL. A table's header keeps `FilterBar`.
