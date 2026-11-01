import type { RoutePath } from '../route-paths';

/**
 * Every feature tip: one row each. A tip is a dot on a feature, and the first one on a page opens
 * by itself once. Add a row to teach a feature; `tips.test.tsx` checks the shape; skill: `adding-feature-tips`.
 *
 * - `id` is never reused: renaming it shows the tip again to everyone who dismissed it. Reword
 *   `text` instead; a genuinely new message gets a new id.
 * - `where` are routes from `route-paths.ts`, so a page that moves breaks the build.
 * - `el` is a CSS selector for the feature itself, as tight as the control (a wrapper that stretches
 *   across the page puts the dot far from what it describes). A tip whose element is not on screen (a page still
 *   loading, an area this person cannot open) is simply not shown.
 * - `text` says what the feature does for the person, in a sentence. Area and role names come from
 *   `useTerms()`, never typed here, so the rows avoid them.
 * - Order is priority: the first eligible tip on a page is the one that opens.
 */
export interface Tip {
  id: string;
  where: readonly RoutePath[];
  el: string;
  /** The dot's accessible name. */
  title: string;
  text: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export const TIPS: readonly Tip[] = [
  {
    id: 'search',
    where: ['/'],
    el: '.search-trigger',
    side: 'bottom',
    title: 'Search',
    text: 'Find a course, a lesson or a page from anywhere. Press ⌘K, or Ctrl K, to open it.',
  },
  {
    id: 'areas',
    where: ['/'],
    el: '.g-area-switcher',
    side: 'right',
    title: 'Switch area',
    text: 'You can open more than one area. Move between them here; search reaches all of them.',
  },
  {
    id: 'theme',
    where: ['/'],
    el: '.g-segmented[aria-label="Theme"]',
    side: 'bottom',
    title: 'Light or dark',
    text: 'Choose a light or dark look, or let it follow your device. It is remembered here.',
  },
  {
    id: 'names',
    where: ['/profile'],
    el: '.profile__labels .g-segmented',
    side: 'right',
    title: 'Names',
    text: 'Pick Gurukul names or plain English for roles and pages. It changes everywhere at once.',
  },
  {
    id: 'tips-switch',
    where: ['/profile'],
    el: '.profile__tips .g-togglecard',
    side: 'right',
    title: 'Feature tips',
    text: 'Turn tips off here. Turn them on again to see every one from the start.',
  },
];
