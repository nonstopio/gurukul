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

`<CommandPalette open onClose search={(q) => items} onSelect label placeholder emptyText pageSize>`.
Generic: the caller decides what is searched and what selecting does (global search passes pages).

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

## Chip — shipped

`<Chip tone="neutral|accent|warning|danger|info|solid">Completed</Chip>`. A `<span>`, always with a word.

24px tall, `--radius-pill`, 12px/600. Tones: neutral (`--surface-sunken` / `--text-body`), accent
(`--accent-soft` / `--accent-soft-text`), warning, danger, info (each `*-soft` ground with its strong
colour as text), solid (`--accent` / `--accent-on`) for "Completed".

## ProgressBar and ProgressRing — shipped

`<ProgressBar value label showValue?>`, `<ProgressRing value label size? stroke?>`. `value` is 0 to 100,
rounded and clamped. Track `--border`, fill `--accent-decor`, `--radius-pill`; bar 8px tall, fill
animates on `--dur-slow`. The element with `role="progressbar"` carries `aria-valuenow/min/max` and
`aria-label`; the bar prints the percentage beside it (`showValue={false}` to hide), the ring prints it
in the middle (hidden from assistive tech, the role already says it).

## Card — shipped

`<Card as="div|section|article|li" highlighted?>`. `--surface`, 1px `--border`, `--radius-xl`,
`--space-5` padding, no shadow. `highlighted` (the current parva) swaps to `--accent-soft` ground,
`--accent-line` border and `--accent-soft-text`. Give a `section` an `aria-label` so it is a landmark.

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

`<TopBar title back? status? actions? />`. Used by the lesson player, Pariksha and editors: a
`<header>` on `--chrome`, wrapping flex row. `title` is the page `h1`, Fraunces `--text-lg`
`--chrome-text-strong`. `back` is any node; give a link or button `className={topBarBackClass}` for the
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

## EmailChipInput — shipped

`<EmailChipInput label value onChange classify placeholder? describedBy? removeLabel? />`. A labelled text
input in a bordered box; emails become removable chips. Typing a comma, space, semicolon or newline,
pressing Enter, pasting, or leaving the field commits what is typed: split on those separators,
lower-cased, duplicates dropped. Backspace on an empty input removes the last chip. `value` and
`onChange` are controlled; `splitEmails(text)` is exported for CSV and "whole team" flows.

The caller supplies `classify(email) => { status, reason? }` and writes the legend (point
`describedBy` at it). Each chip says its status in words: `signedIn` `--accent-soft` "· signed in",
`new` dashed `--border-strong` "· new", `alreadyAssigned` `--surface-sunken` "· already assigned",
`rejected` `--danger-soft` with `--danger-line` and "· {reason}" (default "rejected"). The remove button
is named "Remove {email}" (`removeLabel` to change) and its hit area is 44px. The list is named
"{label}: added emails". Focus ring on the box.

## StepCard (Stepper.Step) — shipped

`<StepCard number title headingAs="h2|h3|h4">children</StepCard>`; `Stepper.Step` is the same component.
A `<section aria-labelledby>` card (`--surface`, hairline, `--radius-xl`) with a 32px `--accent` number
badge (decorative) and the title in Fraunces `--text-xl`. The heading carries a visually hidden "Step N:"
so the number is spoken. Stack several for a form; the sticky summary is the caller's layout.

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

Tones `info` (default), `success`, `danger`. The provider keeps two live regions mounted from the
start: `role="status"` (polite) for info and success, `role="alert"` (assertive) for danger. Toasts
stack bottom-right (full width on a phone), `--surface`-family soft ground with its line,
`--radius-lg`, `--shadow-xs`; each has a 44px dismiss button named by `dismissLabel` (default
"Dismiss"). Auto-dismiss after `duration` ms (`0` keeps it until dismissed); the timer is cleared on
manual dismiss. `useToast` outside a provider throws.

## CodeBlock — shipped

`<CodeBlock code fileName? variant="code|terminal" highlight="2,4-6" copyLabel? copiedLabel? failedLabel? />`.
Header `--code-header`: name in mono 12px `--code-comment` (`fileName`, else "terminal" or "code") and a 44px
Copy button (`--code-text`, hover `--chrome-hover`). Body `--code-bg`, `--code-text`, mono 13.5px/1.7, one
block per line, `--radius-lg`. Highlighted lines (`highlight`, 1-based, numbers and ranges, junk ignored) get
`--chrome-active` and a 2px `--chrome-accent` bar. `terminal` prefixes each line with a `$` prompt in
`--code-keyword` drawn by CSS, so it is never copied or selected.

Copy writes the whole `code` with `navigator.clipboard.writeText`, flips the button to "Copied" (check icon) for
2s (a second click restarts the timer), and a `role="status"` region next to it announces "Copied". If the
clipboard refuses, the label stays "Copy" and the region says "Could not copy". The body is
`role="region"` named by the header name with `tabIndex=0`, so a keyboard can scroll it; it scrolls
horizontally and never wraps.

## VideoBlock — shipped

`<VideoBlock src title href caption? linkLabel? />`. Presentational: the caller picks the provider and builds
the embed `src` (for example `youtube-nocookie`); the component only frames it. A `<figure>` with a 16:9
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
only when `correctAnswer` is given (omit it when the Pariksha does not reveal answers); `children` is the
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
