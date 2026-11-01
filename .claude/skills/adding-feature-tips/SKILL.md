---
name: adding-feature-tips
description: Use when a Gurukul page gains a feature a person could miss, when asked to add, reword, move or remove a feature tip, when a new page or control ships and nobody is told about it, when `apps/web/test/tips.test.tsx` fails, or when a tip's dot lands in the wrong place.
---

# Adding feature tips

## Overview

A tip is a dot on the corner of a feature, and a floating card that says what the feature does for
the person. The first tip on a page opens by itself once; the rest wait as dots. **A tip is one row**
in `apps/web/src/tips/registry.ts`; the engine (`useTips.ts`, Driver.js `hints`), the memory
(`store.ts`, localStorage per person) and the Profile switch already exist. Plan:
`.plan/05-learner-experience.md` → Feature tips.

```ts
{
  id: 'search',                       // kebab-case, never reused
  where: ['/'],                       // routes from route-paths.ts
  el: '.search-trigger',              // the feature itself
  side: 'bottom',                     // where the card opens: top | right | bottom | left
  title: 'Search',                    // the dot's accessible name, 32 characters at most
  text: 'Find a course, a lesson or a page from anywhere. Press ⌘K, or Ctrl K, to open it.',
}
```

## When to Use

- A page, control or shortcut ships that a person would not find by looking.
- Wording is unclear, or a tip points at something that moved.

**When NOT to use:** a state or warning about this page (that is a `Callout`), anything the person
must read (a tip is skippable), a feature only an Educator or Admin sees unless the selector exists
only for them (a missing element simply hides the tip).

## Quick Reference

| Field   | Rule                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`    | `/^[a-z0-9]+(-[a-z0-9]+)*$/`, unique. Renaming shows the tip again to everyone who dismissed it: reword `text` instead. A new message gets a new id                                                                                   |
| `where` | Routes from `route-paths.ts`; a typo or a moved route fails typecheck and `tips.test.tsx`                                                                                                                                             |
| `el`    | A CSS selector for **the control itself**, tight: the dot sits in its top-right corner. A stretched wrapper strands the dot far away. Prefer a stable class a component owns (`.g-segmented[aria-label="Theme"]`) over a layout class |
| `title` | The dot's name for screen readers, at most 32 characters                                                                                                                                                                              |
| `text`  | One sentence, at most 140 characters, what it **does for the person**. No emoji, no "Click here". Role and area names come from `useTerms()`, so write around them                                                                    |
| order   | Array order is priority: the first eligible tip on a page opens by itself                                                                                                                                                             |

Steps:

1. Add the row. Put it after tips on the same page you want shown first.
2. `npm run test -w @gurukul/web -- tips` (shape, routes, length).
3. **Look at it** in the app, light **and** dark: dot on the control's corner, card readable, card
   not covering what it describes. At 390px too. The e2e fixtures run the real engine:
   `PW_CHROMIUM_PATH=… npm run e2e` (`.claude/rules/end-to-end.md`).
4. A new tip is a change a person notices: one changelog entry (`writing-changelog-entries`), or add
   to the open one.

The look is `packages/ui/src/tips.css` (role tokens, floating card, `--shadow-menu`); a tip never
styles itself. Change the look there, for every tip.

## Common Mistakes

| Mistake                                      | Fix                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Selector hits a full-width wrapper           | Select the control inside it (`.profile__labels .g-segmented`)                             |
| Selector for something that loads later      | Fine: the engine looks again as the page fills in. A tip never shows for an absent element |
| Re-using an id for a new message             | New id; old one stays dismissed for people who saw it                                      |
| Typing "Admin", "Studio" or "Quiz" in `text` | Rephrase, or the label sets drift (`useTerms()` is the only place)                         |
| A tip that explains a warning or an error    | That is a `Callout` or a `StateCard`                                                       |
| Styling a bubble in `apps/web` CSS           | `packages/ui/src/tips.css` only; Driver.js's vendor CSS stays untouched                    |

## Red Flags - STOP

- Wanting a second bubble open at once, a tour, or a tip that blocks a click: the engine opens one
  bubble per page by design; propose a plan change first.
- Wanting tips that Educators write or that follow a person across browsers: not built, plan change.
- Lowering `tips.test.tsx` limits, or hiding a row from the test, to land a long sentence: shorten
  the sentence.
