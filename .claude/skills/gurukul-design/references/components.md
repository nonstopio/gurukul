# Gurukul component recipes

Each recipe lists the tokens it uses, its states and its accessibility contract.
"Shipped" means it exists in `packages/ui`; the rest are specifications for later milestones.

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

## Table

Header row 12px/600 `--text-muted` on `--g-gray-25`-derived role; rows 14px,
1px `--border` separators; numbers right-aligned; whole table inside an
`overflow-x: auto` box. Row selection uses checkboxes with labels.

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

## CodeBlock

Header `--code-header` with filename in mono and a Copy button (`aria-label`
when icon-only); body `--code-bg`, `--code-text`, 13.5px/1.7. Highlighted
lines get a subtle mint wash. Horizontal scroll, never wrapped.

## QuizOption

A full-width `<button aria-pressed>` with a 32px letter badge. States:
idle (`--border-strong`), selected (`--text` border), correct (`--accent-decor`
border, `--accent-soft` ground), wrong (`--danger` border, `--danger-soft`).
Feedback is announced in a `role="status"` region and always says the right
answer in words.

## Certificate

Fixed 1123×794 (A4 landscape). Forest frame, `--paper` sheet, `--gold` hairline,
corner ornaments, learner name in Fraunces italic, seal in forest + gold with
the Gurukul monogram. Printed and exported as PDF client-side.
